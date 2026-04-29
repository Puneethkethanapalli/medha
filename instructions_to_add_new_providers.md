# How to Add a New AI Provider to Medha

This guide documents the provider architecture and gives step-by-step instructions for adding a new AI provider. It was written by analyzing the four existing providers — **OpenRouter**, **Google AI**, **Anthropic**, and **MiniMax**.

---

## Architecture Overview

```
src/lib/providers/
├── types.ts          # AIProvider interface + StreamConfig
├── registry.ts       # Map<id, AIProvider> + registerBuiltInProviders()
├── openrouter.ts     # OpenAI-compatible, streaming via SSE
├── google-ai.ts      # Dual-path: OpenAI-compat + native Gemini endpoint
├── anthropic.ts      # Custom SSE format, proprietary message structure
└── minimax.ts        # OpenAI-compatible

src/lib/streaming/
├── stream.ts         # streamCompletion() — the shared SSE fetch+parse engine
└── sse-parser.ts     # SSE line parser, ThinkTagSeparator, extractTokens()

src/lib/attachments/
└── multimodal.ts     # buildOpenAIMessages() / buildAnthropicMessages()

src/lib/tools/
├── types.ts          # ToolDefinition, OpenAIToolSchema
└── registry.ts       # getOpenAIToolSchemas() / getAnthropicToolSchemas()

src/lib/models/
└── capabilities.ts   # KNOWN_CAPABILITIES map + heuristic capability inference

src/lib/storage/
└── secure.ts         # expo-secure-store wrappers for API key CRUD

src/stores/
└── settings-store.ts # Zustand store — provider list, key validation, hasAnyProviderKey()

src/app/settings/
└── api-keys.tsx      # UI for adding/deleting provider API keys
```

### Data Flow (simplified)

```
User sends message
  → ChatScreen resolves provider via registry.getProvider(providerId)
  → Calls provider.stream(messages, config, ...callbacks)
    → Provider builds request body (OpenAI format or proprietary)
    → Calls streamCompletion(options, ...) from lib/streaming/stream.ts
      → fetch() + ReadableStream → SSEParser → extractTokens() or extractGeminiNativeTokens()
      → Dispatches onContent / onReasoning / onToolCalls / onUsage callbacks
```

---

## The `AIProvider` Interface

Every provider must implement this interface (defined in `src/lib/providers/types.ts`):

```typescript
export interface AIProvider {
  id: string;          // Unique slug, e.g. 'mistral', 'cohere'
  name: string;        // Display name, e.g. 'Mistral AI'

  stream(
    messages: Message[],
    config: StreamConfig,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    onToolCalls?: (toolCalls: AccumulatedToolCall[]) => void,
    onUsage?: (usage: UsageData) => void
  ): ReasoningStreamResponse;

  listModels(apiKey: string): Promise<Model[]>;
  validateKey(apiKey: string): Promise<boolean>;
}
```

### `StreamConfig` Fields

| Field           | Type                   | Notes                                                                 |
| --------------- | ---------------------- | --------------------------------------------------------------------- |
| `model`         | `string`               | Full model ID (e.g. `'gpt-4o'`, `'claude-sonnet-4-20250514'`)        |
| `apiKey`        | `string`               | Raw API key from secure storage                                       |
| `systemPrompt`  | `string?`              | System-level instructions                                             |
| `temperature`   | `number?`              | 0–2 range (provider may clamp)                                        |
| `maxTokens`     | `number?`              | Max completion tokens                                                 |
| `thinkingMode`  | `'auto'\|'on'\|'off'`  | Whether to enable/disable extended thinking                           |
| `tools`         | `OpenAIToolSchema[]?`  | Tool schemas in OpenAI format (used by OpenAI-compat providers)       |
| `anthropicTools`| `AnthropicToolSchema[]?` | Tool schemas in Anthropic format (set internally by Anthropic only) |

---

## Existing Provider Patterns

### Pattern A: OpenAI-Compatible (OpenRouter, MiniMax)

These providers use the standard `/chat/completions` endpoint with `stream: true` and the `openai` SSE format. This is the simplest path.

**Key characteristics:**
- Message format: `buildOpenAIMessages()` from `multimodal.ts`
- Tool format: OpenAI function-calling schema (`config.tools`)
- SSE format: `'openai'` — standard `data: {...}\n\n` with `[DONE]` sentinel
- Auth: `Authorization: Bearer <key>`
- Thinking: Provider-specific body params (e.g. `reasoning: { effort: 'high' }`)

**If your new provider has an OpenAI-compatible API, this is the template to follow.** MiniMax is the cleanest minimal example (~114 lines).

### Pattern B: Proprietary API (Anthropic)

Anthropic uses its own message format and SSE event types (`content_block_delta`, `message_stop`).

**Key characteristics:**
- Message format: `buildAnthropicMessages()` — different roles, content block types
- Tool format: Anthropic schema (`input_schema` instead of `parameters`)
- SSE format: `'anthropic'` — event-typed SSE with `message_stop` instead of `[DONE]`
- Auth: `x-api-key` header + `anthropic-version` header
- Thinking: `body.thinking = { type: 'enabled', budget_tokens: N }`

**If your provider has a completely proprietary API, you'll need to add a new SSE format in the parser.**

### Pattern C: Dual-Path (Google AI)

Google AI supports both an OpenAI-compat endpoint and a native Gemini endpoint. Currently only the OpenAI-compat path is active; the native path exists for features like `google_search` grounding.

**Key characteristics:**
- Two private methods: `_streamOpenAICompat()` and `_streamNative()`
- Native endpoint uses `streamGenerateContent?alt=sse` and format `'gemini-native'`
- Model listing uses the native API regardless

---

## Step-by-Step: Adding a New Provider

### Step 1: Create the Provider File

Create `src/lib/providers/<provider-id>.ts`.

If the API is OpenAI-compatible, copy `minimax.ts` as your starting template. If proprietary, study `anthropic.ts`.

```typescript
// src/lib/providers/example.ts
import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildOpenAIMessages } from '@/lib/attachments/multimodal';
import type { Message, Model } from '@/types';

const BASE_URL = 'https://api.example.com/v1';

export class ExampleProvider implements AIProvider {
  id = 'example';      // Must be unique, lowercase, kebab-case
  name = 'Example AI';  // Human-readable display name

  stream(
    messages: Message[],
    config: StreamConfig,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    onToolCalls?: (toolCalls: AccumulatedToolCall[]) => void,
    onUsage?: (usage: UsageData) => void
  ) {
    const abortController = new AbortController();

    // 1. Build messages
    const requestMessages = buildOpenAIMessages(messages, config.systemPrompt);

    // 2. Build request body
    const body: Record<string, unknown> = {
      model: config.model,
      messages: requestMessages,
      stream: true,
      stream_options: { include_usage: true }, // if supported
    };

    if (config.temperature !== undefined) body.temperature = config.temperature;
    if (config.maxTokens !== undefined) body.max_tokens = config.maxTokens;

    // 3. Tools (OpenAI format)
    if (config.tools && config.tools.length > 0) body.tools = config.tools;

    // 4. Thinking mode — provider-specific
    // if (config.thinkingMode === 'on') { ... }

    // 5. Reasoning handler — swallow when thinking is off
    const reasoningHandler = config.thinkingMode === 'off'
      ? () => {}
      : onReasoning;

    // 6. Stream
    streamCompletion(
      {
        url: `${BASE_URL}/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: abortController.signal,
      },
      onContent,
      reasoningHandler,
      onDone,
      onError,
      'openai',       // SSE format — 'openai' | 'anthropic' | 'gemini-native'
      onToolCalls,
      onUsage
    );

    return {
      abort: () => abortController.abort(),
      reasoningContent: '',
    };
  }

  async listModels(apiKey: string): Promise<Model[]> {
    // Option A: Fetch from API
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const data = await res.json();
    return data.data.map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      provider: 'example',  // Must match this.id
    }));

    // Option B: Hardcode (if no public endpoint)
    // return EXAMPLE_MODELS;
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      // Hit a lightweight endpoint
      const res = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.status !== 401 && res.status !== 403;
    } catch {
      return false;
    }
  }
}
```

### Step 2: Register the Provider

Edit `src/lib/providers/registry.ts`:

```diff
 export function registerBuiltInProviders(): void {
   const { OpenRouterProvider } = require('./openrouter');
   const { GoogleAIProvider } = require('./google-ai');
   const { AnthropicProvider } = require('./anthropic');
   const { MiniMaxProvider } = require('./minimax');
+  const { ExampleProvider } = require('./example');
   registerProvider(new OpenRouterProvider());
   registerProvider(new GoogleAIProvider());
   registerProvider(new AnthropicProvider());
   registerProvider(new MiniMaxProvider());
+  registerProvider(new ExampleProvider());
 }
```

> **Why `require()` instead of `import`?** To avoid circular dependencies. The registry is loaded lazily by the settings store.

### Step 3: Add to the API Keys UI

Edit `src/app/settings/api-keys.tsx`:

```diff
 type ProviderId = 'openrouter' | 'google-ai' | 'anthropic' | 'minimax'
-  | 'tavily' | 'image-gen';
+  | 'example' | 'tavily' | 'image-gen';

 const PROVIDERS: ProviderConfig[] = [
   { id: 'openrouter', name: 'OpenRouter', description: 'Access to 200+ AI models' },
   // ...existing...
+  { id: 'example', name: 'Example AI', description: 'Example models via Example API' },
   { id: 'tavily', name: 'Web Search (Tavily)', description: '...' },
   { id: 'image-gen', name: 'Image Generation', description: '...' },
 ];
```

Also update the initial `keys` state to include the new provider:

```diff
 const [keys, setKeys] = useState<Record<ProviderId, string>>({
   openrouter: '',
   'google-ai': '',
   anthropic: '',
   minimax: '',
+  example: '',
   tavily: '',
   'image-gen': '',
 });
```

### Step 4: Add to the Settings Store Provider Lists

Edit `src/stores/settings-store.ts` — update the hardcoded provider ID arrays:

```diff
 export async function hasAnyProviderKey(): Promise<boolean> {
-  const providers = ['openrouter', 'google-ai', 'anthropic', 'minimax'];
+  const providers = ['openrouter', 'google-ai', 'anthropic', 'minimax', 'example'];
   // ...
 }

 export async function getConfiguredProviders(): Promise<string[]> {
-  const allProviders = ['openrouter', 'google-ai', 'anthropic', 'minimax'];
+  const allProviders = ['openrouter', 'google-ai', 'anthropic', 'minimax', 'example'];
   // ...
 }
```

### Step 5: Add Model Capabilities

Edit `src/lib/models/capabilities.ts`:

1. **Add known capabilities** to `KNOWN_CAPABILITIES`:

```typescript
// Example AI
'example/model-large': ['vision', 'tools', 'thinking', 'long-context'],
'example/model-small': ['tools', 'long-context'],
```

2. **Add context windows** to `CONTEXT_WINDOW_MAP` if known:

```typescript
'example-model-large': 128000,
'example-model-small': 32000,
```

3. **Update heuristics** — add patterns to `heuristicCapabilities()` and `LONG_CONTEXT_MODELS` if the model family has consistent naming.

### Step 6: Handle Non-OpenAI SSE Formats (if needed)

If the provider uses a proprietary streaming format, you have two options:

#### Option A: Add a new format to the streaming engine

1. Add a new format literal to `streamCompletion()` in `src/lib/streaming/stream.ts`:

```diff
 export async function streamCompletion(
   // ...
-  format: 'openai' | 'anthropic' | 'gemini-native' = 'openai',
+  format: 'openai' | 'anthropic' | 'gemini-native' | 'example' = 'openai',
```

2. Add a new extractor function in `src/lib/streaming/sse-parser.ts`:

```typescript
export function extractExampleTokens(data: string): TokenContent | null {
  // Parse the provider's JSON format
  // Return { content?, reasoning?, toolCalls?, usage? }
}
```

3. Add a branch in `processEvents()`:

```typescript
if (format === 'example') {
  const tokens = extractExampleTokens(data);
  // ... dispatch to handlers
}
```

#### Option B: Add a custom message builder

If the provider needs a different message format (like Anthropic), add a new function in `src/lib/attachments/multimodal.ts`:

```typescript
export function buildExampleMessages(messages: Message[]): ExampleMessage[] {
  // Convert Message[] to the provider's expected format
}
```

### Step 7: Handle Tool Call Format Differences (if needed)

Most providers use OpenAI-format tools (`config.tools`). If your provider needs a different schema:

1. Add a converter in `src/lib/tools/registry.ts`:

```typescript
export function getExampleToolSchemas(toolNames?: string[]) {
  // Convert ToolDefinition[] to provider-specific format
}
```

2. Add a new field to `StreamConfig` in `src/lib/providers/types.ts`:

```typescript
export interface StreamConfig {
  // ...existing fields...
  exampleTools?: { /* provider-specific schema */ }[];
}
```

3. The ChatScreen's tool-call loop will pass tools in OpenAI format via `config.tools`. Your provider should convert them in its `stream()` method or read from the new field.

---

## Checklist

Use this checklist when adding a new provider:

- [ ] **Provider file** — `src/lib/providers/<id>.ts` implementing `AIProvider`
- [ ] **Registry** — Added to `registerBuiltInProviders()` in `registry.ts`
- [ ] **API Keys UI** — Added to `ProviderId` type, `PROVIDERS` array, and `keys` state in `api-keys.tsx`
- [ ] **Settings store** — Added to `hasAnyProviderKey()` and `getConfiguredProviders()` arrays in `settings-store.ts`
- [ ] **Model capabilities** — Added entries to `KNOWN_CAPABILITIES`, `CONTEXT_WINDOW_MAP`, and heuristics in `capabilities.ts`
- [ ] **SSE format** — If non-OpenAI: new format in `stream.ts` + extractor in `sse-parser.ts`
- [ ] **Message format** — If non-OpenAI: new builder in `multimodal.ts`
- [ ] **Tool format** — If non-OpenAI: new converter in `tools/registry.ts` + `StreamConfig` field
- [ ] **Thinking mode** — Implement provider-specific thinking params in `stream()` body
- [ ] **Reasoning handler** — Always swallow reasoning tokens when `thinkingMode === 'off'`
- [ ] **Test** — Validate key → add key → select model → send message → verify streaming, tools, thinking

---

## Common Gotchas

1. **Always use `import { fetch } from 'expo/fetch'`** — Not the global `fetch`. The Expo polyfill provides `ReadableStream` support on native (required for SSE streaming).

2. **`provider` field in `Model` must match `AIProvider.id`** — The model picker uses this to route to the correct provider.

3. **`listModels()` must return models with `provider: '<your-id>'`** — Not the upstream model ID prefix.

4. **Key validation pattern** — Don't make expensive API calls. Hit the lightest endpoint possible. Return `true` for any non-401/403 status (even 400 = key is valid, just bad request).

5. **Hardcoded model lists are fine** — Anthropic and MiniMax both hardcode their model lists. Not every provider has a public `/models` endpoint.

6. **Tool call loop is handled externally** — Your provider just needs to emit `onToolCalls` with the accumulated calls. The ChatScreen handles execution and re-submission.

7. **Usage data is optional but recommended** — If the API returns token counts in the streaming response, extract them and call `onUsage`. This feeds the Usage & Costs dashboard.

8. **Abort handling is free** — Just wire `abortController.signal` into the fetch options. The `streamCompletion()` engine handles `AbortError` silently.

9. **Thinking mode has three states** — `'auto'` means the provider decides. `'on'` means explicitly enable. `'off'` means swallow reasoning tokens client-side (via no-op handler). Always implement the no-op pattern for `'off'`.

---

## File Reference

| File | Purpose | When to modify |
|------|---------|----------------|
| `src/lib/providers/types.ts` | `AIProvider` interface, `StreamConfig` | Only if adding a new config field (e.g. new tool format) |
| `src/lib/providers/registry.ts` | Provider registration | Always — add your provider here |
| `src/lib/streaming/stream.ts` | Shared SSE streaming engine | Only if adding a new SSE format |
| `src/lib/streaming/sse-parser.ts` | SSE line parsing + token extraction | Only if adding a new SSE format |
| `src/lib/attachments/multimodal.ts` | Message format builders | Only if provider needs non-OpenAI message format |
| `src/lib/tools/registry.ts` | Tool schema converters | Only if provider needs non-OpenAI tool format |
| `src/lib/models/capabilities.ts` | Model capability inference | Always — add known capabilities |
| `src/lib/storage/secure.ts` | API key CRUD | Never — generic, works for any provider ID |
| `src/stores/settings-store.ts` | Provider lists + key validation | Always — update provider ID arrays |
| `src/app/settings/api-keys.tsx` | API key management UI | Always — add provider to UI list |
| `src/types/index.ts` | `Model`, `Message`, `Provider` types | Rarely — only if types need extension |
