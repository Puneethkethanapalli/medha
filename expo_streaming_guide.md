# Expo AI Streaming — Complete Implementation Reference
> **Agent-ready fix guide.** Sources: Expo SDK 54 docs, Vercel AI SDK v6 docs, GitHub issues, combined research.  
> Last updated against: Expo SDK 54 · AI SDK v6 (`ai@6.x`, `@ai-sdk/react@2.x`)

---

## QUICK DIAGNOSIS — Most Common Bugs

Before reading the full guide, check if your bug is one of these:

| Symptom | Root Cause | Fix |
|---|---|---|
| Stream arrives all at once, not token-by-token | Using global `fetch` instead of `expo/fetch` | [Section 1](#1-the-one-import-rule) |
| `response.body is null` or `undefined` | Same as above, or SDK < 52 | [Section 1](#1-the-one-import-rule) |
| Works on web, broken on mobile | Missing `expoFetch` cast in `DefaultChatTransport` | [Section 4](#4-vercel-ai-sdk-v6-expo-pattern) |
| Stream buffers on Android in dev | Using Expo Go — use dev build instead | [Section 7](#7-platform-gotchas) |
| `body` prop not sent in request | Known AI SDK v6 bug — use `prepareSendMessagesRequest` | [Section 5](#5-known-ai-sdk-v6-bugs-and-workarounds) |
| Streaming breaks after "New Chat" | Known AI SDK v6 bug — do not replace `Chat` instance | [Section 5](#5-known-ai-sdk-v6-bugs-and-workarounds) |
| `Cannot resolve @vercel/oidc` on native | Don't import `@ai-sdk/gateway` in Expo Go | [Section 7](#7-platform-gotchas) |
| Multi-byte chars corrupted (emoji, CJK) | Missing `{ stream: true }` in `TextDecoder.decode()` | [Section 3](#3-raw-readablestream-loop-without-ai-sdk) |
| UI jank / dropped frames while streaming | Re-rendering on every token — use ref buffer + throttle | [Section 6](#6-performance-patterns) |

---

## 1. The One Import Rule

```ts
// ❌ WRONG — global fetch does NOT expose response.body as ReadableStream on native
const response = await fetch(url, options);

// ✅ CORRECT — always use expo/fetch for streaming
import { fetch } from 'expo/fetch';
const response = await fetch(url, options);
```

This is the single most common implementation bug. The native `fetch` buffers the entire response before resolving. `expo/fetch` ships a WinterCG-compliant implementation that exposes `response.body` as a real `ReadableStream`.

**Requirement:** Expo SDK 52 or higher. If you're on SDK 51 or below, upgrade or use `react-native-sse` as a stopgap.

---

## 2. Architecture — Choose Your Approach

### Option A: Vercel AI SDK v6 (recommended for most apps)
Handles SSE parsing, conversation history, tool calls, cancellation, and state management.

```
Client (expo/fetch + DefaultChatTransport)
    → POST /api/chat (your backend)
        → streamText() from 'ai'
        → .toUIMessageStreamResponse()
    ← UIMessageStream (binary octet-stream)
← useChat hook manages state
```

### Option B: Raw ReadableStream (custom backends, full control)
DIY SSE parsing. More code, but works with any LLM API format.

```
Client (expo/fetch)
    → POST /api/chat
    ← text/event-stream (SSE)
← Manual getReader() loop + SSE parser + React state
```

### Option C: Edge Proxy pattern (production at scale)
Your Expo client hits an edge function (Vercel/Cloudflare Worker) that talks to the LLM.  
Benefits: API key never leaves server, rate limiting, prompt injection, response sanitisation.

```
Expo client → Edge Function (Vercel/CF Worker) → LLM API
                    ↓ lightweight SSE stream
              Expo client renders
```

---

## 3. Raw ReadableStream Loop (without AI SDK)

Use this when you're not using the Vercel AI SDK, or you need to understand what's happening under the hood.

### The correct streaming loop

```ts
import { fetch } from 'expo/fetch'; // ← required

async function streamChat(
  prompt: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
) {
  const response = await fetch('https://your-backend.com/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',     // signal SSE to your server
    },
    body: JSON.stringify({ prompt }),
    signal,                               // AbortController support
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Pipe through TextDecoderStream for clean string chunks
  const reader = response.body!
    .pipeThrough(new TextDecoderStream())  // available in Expo SDK 52+
    .getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parseSSEChunk(value, onToken);
    }
  } finally {
    reader.releaseLock(); // always release on completion or error
  }
}
```

**Alternative: Manual TextDecoder** (if you need the `{ stream: true }` flag for multi-byte chars):

```ts
const reader = response.body!.getReader();
const decoder = new TextDecoder('utf-8');

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // { stream: true } keeps multi-byte sequences intact across chunk boundaries
  // Without this, emoji and CJK characters split at chunk boundaries get corrupted
  const text = decoder.decode(value, { stream: true });
  parseSSEChunk(text, onToken);
}
// flush remaining bytes
decoder.decode(); // final call with no args drains the buffer
```

> **Note from Expo SDK 54 docs:** `TextDecoder` on native only supports UTF-8 encoding. If you need other encodings, use the `text-encoding` npm package.

### SSE Parser — buffer at line level, not chunk level

Chunks from `reader.read()` are NOT guaranteed to be complete SSE frames. A single chunk can contain multiple frames, or a frame can be split across multiple chunks. Always buffer:

```ts
let buffer = '';

function parseSSEChunk(
  chunk: string,
  onToken: (token: string) => void,
): void {
  buffer += chunk;

  // Split on double newline (SSE event boundary) or single newline (line boundary)
  const lines = buffer.split('\n');

  // Keep the last (possibly incomplete) line in the buffer
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data: ')) continue;

    const payload = trimmed.slice(6); // remove 'data: '
    if (payload === '[DONE]') return;

    try {
      const json = JSON.parse(payload);

      // OpenAI / OpenAI-compatible format
      const token = json.choices?.[0]?.delta?.content;

      // Anthropic format (claude direct API)
      // const token = json.type === 'content_block_delta' ? json.delta?.text : null;

      if (token) onToken(token);
    } catch {
      // Silently skip malformed frames — partial JSON is expected
    }
  }
}
```

---

## 4. Vercel AI SDK v6 Expo Pattern

> **AI SDK v6 is a major change from v5.** The `useChat` API changed significantly. Do not use old tutorials.

### Install

```bash
npx expo install expo
pnpm add ai @ai-sdk/react zod
# Choose a provider:
pnpm add @ai-sdk/openai    # or @ai-sdk/anthropic, @ai-sdk/google, etc.
```

### The URL utility (required for physical devices)

```ts
// utils/generateAPIUrl.ts
import Constants from 'expo-constants';

export function generateAPIUrl(relativePath: string): string {
  // In production, use the environment variable
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return `${process.env.EXPO_PUBLIC_API_BASE_URL}${relativePath}`;
  }

  // In development, point to the dev server
  // Constants.expoConfig.hostUri resolves to the correct LAN IP on physical devices
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localhost = debuggerHost?.split(':')[0] ?? 'localhost';

  if (!debuggerHost) {
    throw new Error(
      'Could not determine host URI. Set EXPO_PUBLIC_API_BASE_URL for production.',
    );
  }

  return `http://${localhost}:8081${relativePath}`;
}
```

> **Why this matters:** On a physical device, `localhost` refers to the phone itself, not your dev machine. You must use the LAN IP.

### Client — useChat with DefaultChatTransport (AI SDK v6)

```tsx
// app/(tabs)/index.tsx
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { generateAPIUrl } from '@/utils/generateAPIUrl';
import { useRef, useCallback } from 'react';
import { View, TextInput, ScrollView, Text, Pressable } from 'react-native';

export default function ChatScreen() {
  const scrollRef = useRef<ScrollView>(null);

  const { messages, error, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      // ✅ REQUIRED: cast expoFetch to satisfy TypeScript — it is spec-compatible
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      api: generateAPIUrl('/api/chat'),
      // ⚠️ KNOWN BUG: static `body` here does NOT update after init
      // Use `prepareSendMessagesRequest` instead (see Section 5)
    }),
    onError: (error) => console.error('Chat error:', error),
    onFinish: () => {
      // scroll to bottom when streaming completes
      scrollRef.current?.scrollToEnd({ animated: true });
    },
  });

  const [inputText, setInputText] = useState('');
  const isStreaming = status === 'streaming';

  const handleSend = useCallback(() => {
    if (!inputText.trim() || isStreaming) return;
    sendMessage({ text: inputText });
    setInputText('');
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [inputText, isStreaming, sendMessage]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }}>
        {messages.map((message) => (
          <View key={message.id}>
            <Text>{message.role === 'user' ? 'You' : 'AI'}</Text>
            {message.parts.map((part, i) =>
              part.type === 'text' ? (
                <Text key={i}>{part.text}</Text>
              ) : null
            )}
          </View>
        ))}
        {isStreaming && <Text>...</Text>}
      </ScrollView>

      <View>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          editable={!isStreaming}
          placeholder="Message"
        />
        {isStreaming ? (
          <Pressable onPress={stop}><Text>Stop</Text></Pressable>
        ) : (
          <Pressable onPress={handleSend}><Text>Send</Text></Pressable>
        )}
      </View>
    </View>
  );
}
```

### Backend — Expo API Route (AI SDK v6)

```ts
// app/api/chat+api.ts
import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request): Promise<Response> {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    // convertToModelMessages translates UIMessage[] → CoreMessage[]
    messages: await convertToModelMessages(messages),
    system: 'You are a helpful assistant.',
  });

  return result.toUIMessageStreamResponse({
    headers: {
      // ✅ REQUIRED for Expo native — prevents response buffering
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'none',
    },
  });
}
```

> **Critical headers:** Without `Content-Type: application/octet-stream` and `Content-Encoding: none`, some mobile networking layers will buffer the response. These headers are confirmed required by Expo SDK 52+ with AI SDK v6.

### Key API changes from v5 → v6

| v5 (old) | v6 (current) |
|---|---|
| `useChat({ fetch, api })` | `useChat({ transport: new DefaultChatTransport({ fetch, api }) })` |
| `handleSubmit(e)` | `sendMessage({ text: '...' })` |
| `Message[]` | `UIMessage[]` (new type) |
| `messages` (CoreMessage format) | `convertToModelMessages(messages)` to convert |
| `result.toAIStreamResponse()` | `result.toUIMessageStreamResponse()` |
| `isLoading` | `status === 'streaming'` |

---

## 5. Known AI SDK v6 Bugs and Workarounds

### Bug 1: Static `body` in `DefaultChatTransport` not sent
**Issue #6939 / #7109** — When passing a `body` object to `DefaultChatTransport`, it is captured at init time and does not update if your state changes.

```ts
// ❌ BROKEN — body.userId will always be the initial value
const { sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    body: { userId },   // ← captured at mount, never updates
  }),
});

// ✅ FIX — use prepareSendMessagesRequest with a function
const { sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      body: {
        userId,        // ← reads current closure value at send time
        sessionId: id,
        messages,
        trigger,
        messageId,
      },
    }),
  }),
});
```

### Bug 2: Replacing a `Chat` instance breaks streaming permanently
**Issue #10926** — If you create a new `Chat` instance and replace it via `setState`, streaming permanently breaks (all messages arrive buffered) until a full page refresh.

```ts
// ❌ BROKEN — streaming breaks after setChat(newChat)
const [chat, setChat] = useState(() => new Chat({ ... }));
const { sendMessage } = useChat({ chat });

const handleNewChat = () => {
  setChat(new Chat({ ... })); // ← streaming permanently broken after this
};

// ✅ WORKAROUND — clear messages instead of replacing the Chat instance
const { messages, sendMessage, setMessages } = useChat({ transport: ... });

const handleNewChat = () => {
  setMessages([]); // clear history, keep same transport
};
```

### Bug 3: `DefaultChatTransport` does not react to transport changes
**Issue #7463 / #8956** — `useChat` captures the transport at mount time. Changing the `transport` prop (even with `useMemo`) does not update the hook's behaviour.

```ts
// ❌ BROKEN — changing modelName won't be picked up
const transport = useMemo(() => new DefaultChatTransport({
  api: '/api/chat',
  body: { modelName },
}), [modelName]);
const { sendMessage } = useChat({ transport }); // transport changes ignored

// ✅ FIX — use prepareSendMessagesRequest to read refs dynamically
const modelNameRef = useRef(modelName);
useEffect(() => { modelNameRef.current = modelName; }, [modelName]);

const { sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ messages }) => ({
      body: { messages, modelName: modelNameRef.current }, // reads latest ref
    }),
  }),
});
```

---

## 6. Performance Patterns

### The shadow state / ref-buffer pattern
Calling `setState` on every token causes a React re-render for every character. On mid-range Android, this causes visible jank.

```ts
import { useRef, useState, useCallback } from 'react';

function useThrottledStream() {
  const bufferRef = useRef('');           // accumulates incoming tokens (no re-render)
  const rafRef = useRef<number | null>(null);
  const [displayedText, setDisplayedText] = useState('');

  const pushToken = useCallback((token: string) => {
    bufferRef.current += token;

    // Only schedule one flush per animation frame (~16ms = 60fps)
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        setDisplayedText((prev) => prev + bufferRef.current);
        bufferRef.current = '';
        rafRef.current = null;
      });
    }
  }, []);

  const reset = useCallback(() => {
    bufferRef.current = '';
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setDisplayedText('');
  }, []);

  return { displayedText, pushToken, reset };
}
```

> **AI SDK v6 built-in throttle:** The `useChat` hook accepts `experimental_throttle: 100` (milliseconds). This is the quickest way to reduce re-renders without writing custom logic.

```ts
const { messages } = useChat({
  transport: ...,
  experimental_throttle: 50, // throttle state updates to every 50ms
});
```

### Decoupled animation speed (the ChatGPT trick)
Buffer tokens as they arrive from the network, then animate them at a fixed comfortable reading speed, regardless of how fast the network delivers them. This prevents both stutter (when the network is fast and bursty) and flickering (when it's slow).

```ts
export function useSmoothStream(speedMsPerChar = 5) {
  const [visibleText, setVisibleText] = useState('');
  const partsRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  const addChunk = useCallback((chunk: string) => {
    if (chunk) partsRef.current.push(chunk);
  }, []);

  useEffect(() => {
    const fullText = partsRef.current.join('');
    if (indexRef.current >= fullText.length) return;

    const animate = (time: number) => {
      const elapsed = time - lastTimeRef.current;
      if (elapsed > speedMsPerChar) {
        const fullText = partsRef.current.join('');
        if (indexRef.current < fullText.length) {
          indexRef.current++;
          setVisibleText(fullText.slice(0, indexRef.current));
          lastTimeRef.current = time;
        }
      }
      if (indexRef.current < partsRef.current.join('').length) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [speedMsPerChar]);

  return { visibleText, addChunk };
}
```

### Use FlashList, not FlatList

```tsx
// ❌ FlatList re-renders all items on state change
import { FlatList } from 'react-native';

// ✅ FlashList is significantly more efficient for streaming chat
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={messages}
  estimatedItemSize={80}
  renderItem={({ item }) => <MessageBubble message={item} />}
  onContentSizeChange={() => flashListRef.current?.scrollToEnd()}
/>
```

### Auto-scroll with user escape hatch

```tsx
const scrollRef = useRef<ScrollView>(null);
const userScrolledUpRef = useRef(false);

const handleScroll = useCallback(({ nativeEvent }: NativeScrollEvent) => {
  const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
  const distanceFromBottom =
    contentSize.height - layoutMeasurement.height - contentOffset.y;
  // If user is more than 50px from bottom, they scrolled up intentionally
  userScrolledUpRef.current = distanceFromBottom > 50;
}, []);

// Call this on every new token during streaming
const maybeScrollToBottom = useCallback(() => {
  if (!userScrolledUpRef.current) {
    scrollRef.current?.scrollToEnd({ animated: false });
  }
}, []);
```

---

## 7. Platform Gotchas

### Never use Expo Go for streaming tests

The Expo Go app does not support development builds with native streaming patches. Use a dev build:

```bash
npx expo run:ios    # or
npx expo run:android
```

### Android: CDP interceptor (historical, fixed in SDK 52)
Before SDK 52, the Chrome DevTools Protocol interceptor in Android dev builds treated `text/event-stream` responses as regular HTTP and attempted to buffer the body — blocking SSE. This is fixed in SDK 52+. If you're on an older SDK, upgrade.

### Physical device URL resolution
Never hardcode `localhost` in your API URL for physical device testing. Use the `generateAPIUrl` utility from Section 4.

### `@vercel/oidc` resolution error in Expo Go
```
Unable to resolve "@vercel/oidc" from "node_modules/@ai-sdk/gateway/dist/index.js"
```
This happens when using the `@ai-sdk/gateway` Vercel AI Gateway provider in Expo Go (not a dev build). Switch to a direct provider (`@ai-sdk/openai`, `@ai-sdk/anthropic`) or use a dev build.

### ReadableStream incompatibility trap
Do not mix stream instances from `expo/fetch` and from `web-streams-polyfill`. They are different classes and will throw:
```
First parameter has member 'readable' that is not a ReadableStream.
```
Pick one: either use `expo/fetch`'s built-in streams exclusively, or polyfill globally. Never both.

### TextDecoder: only UTF-8 on native
From Expo SDK 54 docs: the `TextDecoder` API on native is not fully spec-compliant and only supports UTF-8. If your LLM API sends other encodings (rare), use the `text-encoding` npm package as a polyfill.

---

## 8. AbortController — Always Implement This

Every streaming implementation must support cancellation. Without it, navigating away or tapping "Stop" leaves a dangling fetch that continues consuming battery and API credits.

```ts
// The correct pattern for React
const abortRef = useRef(new AbortController());

const startStream = useCallback(async (prompt: string) => {
  // Cancel any in-flight stream before starting a new one
  abortRef.current.abort();
  abortRef.current = new AbortController();

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: abortRef.current.signal,
      // ...
    });
    // stream loop...
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // User cancelled — this is expected, not an error
      return;
    }
    throw error;
  }
}, []);

// Cancel on unmount
useEffect(() => {
  return () => abortRef.current.abort();
}, []);

// Stop button
<Pressable onPress={() => abortRef.current.abort()}>
  <Text>Stop generating</Text>
</Pressable>
```

> **With AI SDK v6 `useChat`:** Call `stop()` from the hook — it wraps this pattern for you.

---

## 9. UX Patterns — Production Polish

### Optimistic UI (send → show immediately)
```ts
// Do not wait for the API. Insert the user message and a skeleton immediately.
const handleSend = () => {
  const userMsg = { id: Date.now().toString(), role: 'user', text: inputText };
  setMessages(prev => [...prev, userMsg, { id: 'pending', role: 'assistant', text: '' }]);
  setInputText('');
  sendMessage({ text: inputText }); // API call happens async
};
```

### Blinking cursor while streaming
```tsx
// Show | or █ cursor only during active streaming
const Cursor = ({ isStreaming }: { isStreaming: boolean }) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isStreaming) { opacity.setValue(0); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isStreaming]);

  return <Animated.Text style={{ opacity }}>█</Animated.Text>;
};
```

### Haptic feedback on first token
```ts
import * as Haptics from 'expo-haptics';

let firstTokenReceived = false;

const onToken = (token: string) => {
  if (!firstTokenReceived) {
    firstTokenReceived = true;
    // Short, subtle impact — makes the app feel faster than it is
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  pushToken(token);
};
```

### Smooth bubble expansion
Prevent the chat bubble from jittering as text grows:
```tsx
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

// Wrap your message bubble in this component
function GrowingBubble({ children }: { children: React.ReactNode }) {
  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(200)}
    >
      {children}
    </Animated.View>
  );
}
```

### AI state indicator (thinking / searching / generating)
```tsx
// Map backend state names to user-facing strings
const AI_STATES: Record<string, string> = {
  thinking: 'Thinking...',
  searching: 'Searching the web...',
  running_code: 'Running code...',
  generating: 'Generating response...',
};

function AIStateIndicator({ state }: { state: string }) {
  if (!state) return null;
  return (
    <View style={styles.indicatorRow}>
      <ActivityIndicator size="small" />
      <Text style={styles.indicatorText}>{AI_STATES[state] ?? 'Working...'}</Text>
    </View>
  );
}
```

---

## 10. Markdown Rendering During Stream

Streaming Markdown is tricky because code blocks, bold spans, and lists are open (unclosed) mid-stream. Most renderers crash on unclosed tags.

```bash
pnpm add react-native-marked
# or
pnpm add react-native-markdown-display
```

```tsx
import Marked from 'react-native-marked';

// react-native-marked handles unclosed tags gracefully during streaming
function StreamingMessage({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <Marked
      value={text}
      // During streaming, treat unclosed code blocks as inline code
      // to avoid layout crashes
    />
  );
}
```

**Best practice:** Only enable full Markdown rendering once `isStreaming` becomes `false`. During streaming, render plain text. This avoids the unclosed-tag crash entirely and is what Claude's mobile app does.

---

## 11. Summary Checklist

| # | Feature | Status | Tool / Pattern |
|---|---|---|---|
| 1 | Import `fetch` from `expo/fetch` | **Critical** | `import { fetch } from 'expo/fetch'` |
| 2 | Backend response headers | **Critical** | `Content-Type: application/octet-stream` + `Content-Encoding: none` |
| 3 | Use dev build, not Expo Go | **Critical** | `npx expo run:ios / run:android` |
| 4 | `DefaultChatTransport` with expoFetch cast | **Critical** (AI SDK v6) | `expoFetch as unknown as typeof globalThis.fetch` |
| 5 | Physical device URL utility | **High** | `generateAPIUrl()` using `Constants.expoConfig.hostUri` |
| 6 | SSE parser with line-level buffering | **High** | Custom `parseSSEChunk` or `eventsource-parser` |
| 7 | AbortController for cancellation | **High** | `abortRef.current.abort()` + `stop()` from useChat |
| 8 | Ref-buffer + throttled state updates | **High** | `useRef` accumulator + `requestAnimationFrame` |
| 9 | Use `prepareSendMessagesRequest` for dynamic body | **High** (v6 bug workaround) | See Section 5, Bug 1 |
| 10 | FlashList for message list | **Medium** | `@shopify/flash-list` |
| 11 | Auto-scroll with user escape | **Medium** | `onScroll` + `userScrolledUpRef` |
| 12 | Smooth Markdown rendering | **Medium** | `react-native-marked` (render plain text during stream) |
| 13 | `experimental_throttle` on useChat | **Medium** | `experimental_throttle: 50` |
| 14 | Haptic on first token | **Low** | `expo-haptics` |
| 15 | Blinking cursor animation | **Low** | `Animated.loop` on `opacity` |
| 16 | Bubble expansion animation | **Low** | `Reanimated` `LinearTransition` |

---

## 12. Dependency Reference

```json
{
  "expo": ">=52.0.0",
  "ai": "^6.0.0",
  "@ai-sdk/react": "^2.0.0",
  "@ai-sdk/openai": "latest",
  "@shopify/flash-list": "latest",
  "react-native-marked": "latest",
  "react-native-reanimated": "latest",
  "expo-haptics": "latest",
  "zod": "latest"
}
```

**You do NOT need** (these are pre-SDK 52 workarounds now obsolete):
- `react-native-sse` — only needed if not using expo/fetch
- `fast-text-encoding` / `text-encoding-polyfill` — `TextDecoder` is built into Hermes
- `react-native-fetch-api` — replaced by `expo/fetch`
- `web-streams-polyfill` — only needed if a library explicitly requires async-iterator on ReadableStream (Vercel AI SDK v6 does not)

---

*Sources: [Expo SDK 54 docs](https://docs.expo.dev/versions/latest/sdk/expo/), [Vercel AI SDK v6 docs](https://ai-sdk.dev/docs/getting-started/expo), [AI SDK Transport docs](https://ai-sdk.dev/docs/ai-sdk-ui/transport), GitHub issues #6939 #7109 #7463 #8956 #9206 #10926, Expo issue #27526*