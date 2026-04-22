# Phase 4 — Wire Attachments to AI Providers (Multimodal)

> **Goal:** Send image attachments as base64 to vision-capable AI models (GPT-4o, Gemini, Claude 3+) so they can "see" user-uploaded images.
> **Duration:** ~2 hours
> **Risk:** High — API format differs per provider
> **Depends on:** Phase 3 complete (attachments stored in messages)

---

## How Multimodal Messages Work

Most vision-capable models follow the OpenAI format for images in messages:

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What's in this image?" },
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/jpeg;base64,/9j/4AAQ..."
      }
    }
  ]
}
```

Instead of `content` being a plain string, it becomes an array of content parts.

### Provider Format Differences

| Provider | Image Format | Docs |
|----------|-------------|------|
| **OpenRouter** | OpenAI format — `content: [{ type: "text" }, { type: "image_url" }]` | Same as OpenAI |
| **Google AI (Gemini)** | `parts: [{ text: "..." }, { inlineData: { mimeType: "image/jpeg", data: "base64..." } }]` | Different format |
| **Anthropic (Claude)** | `content: [{ type: "text" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "base64..." } }]` | Different format |

---

## Task 9.4.1 — Create Base64 Encoding Utility

**File:** `src/lib/attachments/encode.ts`

```typescript
import * as FileSystem from 'expo-file-system';
import type { Attachment } from '@/types';

/**
 * Read a local file as base64 string.
 */
export async function fileToBase64(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

/**
 * Build a data URI from base64 + mimeType.
 * Used by OpenRouter/OpenAI format.
 */
export function toDataUri(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Convert image attachments to OpenAI-format content parts.
 * Text attachments are read and appended as text.
 */
export async function attachmentsToContentParts(
  text: string,
  attachments: Attachment[]
): Promise<Array<{ type: string; [key: string]: any }>> {
  const parts: Array<{ type: string; [key: string]: any }> = [];

  // Text part first
  if (text) {
    parts.push({ type: 'text', text });
  }

  for (const att of attachments) {
    if (att.type === 'image') {
      const base64 = await fileToBase64(att.uri);
      parts.push({
        type: 'image_url',
        image_url: {
          url: toDataUri(base64, att.mimeType),
        },
      });
    } else if (att.type === 'document') {
      // For text-based documents, read content and include as text
      try {
        const content = await FileSystem.readAsStringAsync(att.uri);
        parts.push({
          type: 'text',
          text: `\n\n--- File: ${att.name} ---\n${content}\n--- End of file ---`,
        });
      } catch {
        parts.push({
          type: 'text',
          text: `\n\n[Attached file: ${att.name} (could not read content)]`,
        });
      }
    }
  }

  return parts;
}
```

---

## Task 9.4.2 — Update Provider Types

**File:** `src/lib/providers/types.ts`

Update `StreamConfig` to accept attachments:

```typescript
import type { Message, Attachment } from '@/types';

export interface StreamConfig {
  model: string;
  apiKey: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // No change needed here — attachments are on the Message itself
}

// The AIProvider.stream() already receives Message[] which now includes
// the attachments field. Each provider is responsible for formatting
// attachments into its API format.
```

---

## Task 9.4.3 — Update OpenRouter Provider

**File:** `src/lib/providers/openrouter.ts`

Update the message formatting in the `stream()` method to handle multimodal content.

### Key Change: Message Building
Find where messages are formatted for the API request body. Currently it's something like:

```typescript
const apiMessages = messages.map((m) => ({
  role: m.role,
  content: m.content,
}));
```

Replace with:

```typescript
import { fileToBase64, toDataUri } from '@/lib/attachments/encode';

// This needs to be async now
async function formatMessagesForAPI(messages: Message[]): Promise<any[]> {
  const apiMessages = [];

  for (const m of messages) {
    if (m.attachments && m.attachments.length > 0 && m.role === 'user') {
      // Multimodal message — build content parts array
      const contentParts: any[] = [];

      if (m.content) {
        contentParts.push({ type: 'text', text: m.content });
      }

      for (const att of m.attachments) {
        if (att.type === 'image') {
          const base64 = await fileToBase64(att.uri);
          contentParts.push({
            type: 'image_url',
            image_url: { url: toDataUri(base64, att.mimeType) },
          });
        } else if (att.type === 'document') {
          // Read text content of documents
          try {
            const { default: FileSystem } = await import('expo-file-system');
            const content = await FileSystem.readAsStringAsync(att.uri);
            contentParts.push({
              type: 'text',
              text: `\n--- ${att.name} ---\n${content}\n--- End ---`,
            });
          } catch {
            contentParts.push({
              type: 'text',
              text: `[Attached: ${att.name}]`,
            });
          }
        }
      }

      apiMessages.push({ role: m.role, content: contentParts });
    } else {
      // Plain text message
      apiMessages.push({ role: m.role, content: m.content });
    }
  }

  return apiMessages;
}
```

### Important: The `stream()` method signature doesn't change
The `stream()` method already receives `Message[]`. Since `Message` now has `attachments`, each provider just needs to check for them when building the API payload.

However, the formatting is now **async** (because of `fileToBase64`). If the current `stream()` is synchronous in its setup phase, you'll need to make the API call preparation async. The pattern:

```typescript
stream(messages, config, onContent, onReasoning, onDone, onError) {
  const abortController = new AbortController();

  // Start async work
  (async () => {
    try {
      const apiMessages = await formatMessagesForAPI(messages);
      // ... rest of fetch + streaming logic using apiMessages ...
    } catch (error) {
      onError(error as Error);
    }
  })();

  return { abort: () => abortController.abort(), reasoningContent: '' };
}
```

---

## Task 9.4.4 — Update Google AI Provider

**File:** `src/lib/providers/google-ai.ts`

Google/Gemini uses a different format. The key difference:

```typescript
// Google AI format for images:
const parts = [];

if (message.content) {
  parts.push({ text: message.content });
}

for (const att of message.attachments || []) {
  if (att.type === 'image') {
    const base64 = await fileToBase64(att.uri);
    parts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: base64,
      },
    });
  }
}

// In the API request:
const contents = [
  { role: 'user', parts },
];
```

---

## Task 9.4.5 — Update Anthropic Provider

**File:** `src/lib/providers/anthropic.ts`

Anthropic/Claude format:

```typescript
// Anthropic format for images:
const content = [];

if (message.content) {
  content.push({ type: 'text', text: message.content });
}

for (const att of message.attachments || []) {
  if (att.type === 'image') {
    const base64 = await fileToBase64(att.uri);
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: att.mimeType,
        data: base64,
      },
    });
  }
}

// In the API request:
const messages = [
  { role: 'user', content },
];
```

---

## Task 9.4.6 — Update ChatScreen streamNewResponse

**File:** `src/components/chat/ChatScreen.tsx`

The `streamNewResponse` function builds the message history for the API. It currently filters messages and passes them to the provider. Since `Message` now includes `attachments`, and the provider handles formatting, **no change is needed here** — the provider receives the full `Message[]` and formats accordingly.

However, verify that `getMessages()` correctly returns parsed attachments (Task 9.3.3).

---

## Which Models Support Vision?

Not all models can process images. For a great UX, you could show a warning when the user attaches an image but the selected model doesn't support vision.

### Common Vision Models
| Provider | Models |
|----------|--------|
| OpenRouter | `openai/gpt-4o`, `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, `google/gemini-2.0-flash-exp:free`, `google/gemini-pro-vision` |
| Google AI | `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash` |
| Anthropic | All Claude 3+ models (`claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`, `claude-3.5-sonnet`) |

### Optional: Model Capability Check
```typescript
// src/lib/models.ts — add a simple check
const VISION_MODELS = new Set([
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-2.0-flash',
  // ... add more as needed
]);

export function supportsVision(modelId: string): boolean {
  // Most modern models support vision, so default to true
  // and blacklist known text-only models instead
  return true; // or check against a list
}
```

---

## Document Handling Strategy

Documents (PDF, DOCX) can't be sent as images. Strategy:

1. **Text files** (`.txt`, `.md`, `.csv`, `.json`): Read content, inject into message as text
2. **PDF**: Requires a PDF text extraction library (future sprint — not in scope)
3. **DOCX**: Same — needs extraction library

For now, text-readable files get their content injected. Binary files (PDF, DOCX) show a placeholder message noting the file was attached but can't be read.

---

## How to Test Phase 4

```
✅ Send image + text to GPT-4o (via OpenRouter) → model describes the image correctly
✅ Send image + text to Gemini → model describes the image correctly
✅ Send image + text to Claude 3.5 → model describes the image correctly
✅ Send multiple images → model can reference all of them
✅ Send text file (.txt) → file content included in message, model can reference it
✅ Send message with no text, only image → model responds about the image
✅ Previously sent messages with attachments are correctly included in conversation history
✅ Base64 encoding doesn't block the UI (runs async)
✅ Large images (compressed to 0.8 quality) don't cause request timeouts
```

---

## 📘 Things to Remember

- Base64 encoding of images can be large — a 2MB JPEG = ~2.7MB base64 string. Keep `quality: 0.8` in image picker.
- Most APIs have a max request size (~20MB for OpenRouter, ~100MB for Google). With 5 images at 0.8 quality, you should be well under.
- `fileToBase64` is async — don't call it synchronously in the stream setup
- OpenRouter uses OpenAI format — `image_url.url` with data URI
- Google AI uses `inlineData.data` with raw base64 (no data URI prefix)
- Anthropic uses `source.data` with raw base64 (no data URI prefix)
- Document content injection adds to token count — warn users about large files
- The `stream()` return value doesn't change — it still returns `{ abort }`. The async formatting happens inside.
- Always handle the case where attachment file no longer exists (deleted externally) — catch and provide fallback text
- Test with the smallest possible image first to verify the format works before trying larger files

---

## Summary of All Files Changed Across All Phases

| File | Phase | Change |
|------|-------|--------|
| `app.json` | 2, 3 | Add plugins |
| `src/app/_layout.tsx` | 1 | Add `KeyboardProvider` |
| `src/components/chat/ChatScreen.tsx` | 1, 3 | `KeyboardStickyView`, attachments in `handleSend` |
| `src/components/chat/InputBar.tsx` | 1, 2, 3 | Full rebuild — keyboard, mic, attachments |
| `src/app/onboarding.tsx` | 1 | `KeyboardAwareScrollView` |
| `src/app/settings/api-keys.tsx` | 1 | `KeyboardAwareScrollView` |
| `src/types/index.ts` | 3 | Add `Attachment`, update `Message` |
| `src/lib/db/schema.ts` | 3 | Migration for `attachments` column |
| `src/lib/db/messages.ts` | 3 | CRUD updates for attachments JSON |
| `src/components/chat/MessageBubble.tsx` | 3 | Render attachment thumbnails |
| `src/lib/providers/openrouter.ts` | 4 | Multimodal message formatting |
| `src/lib/providers/google-ai.ts` | 4 | Gemini multimodal format |
| `src/lib/providers/anthropic.ts` | 4 | Claude multimodal format |
| **New:** `src/components/chat/VoiceInput.tsx` | 2 | Recording overlay with waveform |
| **New:** `src/components/chat/AttachmentTray.tsx` | 3 | Preview chips |
| **New:** `src/components/chat/AttachmentButton.tsx` | 3 | "+" picker trigger |
| **New:** `src/lib/attachments/picker.ts` | 3 | Image/document picker logic |
| **New:** `src/lib/attachments/storage.ts` | 3 | File persistence helpers |
| **New:** `src/lib/attachments/encode.ts` | 4 | Base64 encoding utilities |
