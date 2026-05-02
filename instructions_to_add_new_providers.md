# How to Add a New AI Provider to Medha

This guide documents the provider architecture and gives step-by-step instructions for adding a new AI provider. It was written by analyzing the five existing providers — **OpenRouter**, **Google AI**, **Anthropic**, **MiniMax**, and **Cloudflare AI**.

---

## Architecture Overview

```
src/lib/providers/
├── types.ts          # AIProvider interface + StreamConfig
├── registry.ts       # Map<id, AIProvider> + registerBuiltInProviders()
├── openrouter.ts     # OpenAI-compatible, streaming via SSE
├── google-ai.ts      # Dual-path: OpenAI-compat + native Gemini endpoint
├── anthropic.ts      # Custom SSE format, proprietary message structure
├── minimax.ts        # OpenAI-compatible
└── cloudflare-ai.ts  # OpenAI-compatible, dynamic model fetch, needs Account ID

src/lib/streaming/
├── stream.ts         # streamCompletion() — the shared SSE fetch+parse engine
└── sse-parser.ts     # SSE line parser, ThinkTagSeparator, extractTokens()

src/lib/attachments/
└── multimodal.ts     # buildOpenAIMessages() / buildAnthropicMessages()

src/lib/tools/
├── types.ts          # ToolDefinition, OpenAIToolSchema
└── registry.ts       # getOpenAIToolSchemas() / getAnthropicToolSchemas()

src/lib/models/
├── capabilities.ts        # Dynamic metadata cache + metadata lookup helpers
├── capability-metadata.ts # Provider/LiteLLM metadata → app capability flags
└── litellm-registry.ts    # LiteLLM community model metadata fallback

src/lib/storage/
└── secure.ts         # expo-secure-store wrappers for API key CRUD

src/stores/
└── settings-store.ts # Zustand store — provider list, key validation, hasAnyProviderKey()

src/app/settings/
└── api-keys.tsx      # UI for adding/deleting provider API keys

src/app/
└── onboarding.tsx    # First-run screen — provider selection + key input
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

**If your new provider has an OpenAI-compatible API, this is the template to follow.** MiniMax is the cleanest minimal example (~114 lines). Cloudflare AI demonstrates dynamic model fetching with a fallback list.

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
    // PREFERRED: Fetch dynamically from the provider's API, with a hardcoded fallback
    try {
      const res = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return FALLBACK_MODELS;
      const data = await res.json();
      const models: any[] = data.data || [];
      if (models.length === 0) return FALLBACK_MODELS;
      return models.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        provider: 'example',  // Must match this.id
      }));
    } catch {
      return FALLBACK_MODELS;
    }

    // FALLBACK-ONLY: Use when the provider has no public model-listing API
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

### Step 5: Add to the Onboarding Screen

Edit `src/app/onboarding.tsx` — this is the first-run screen that new users see:

```diff
 type ProviderId = 'openrouter' | 'google-ai' | 'anthropic' | 'minimax'
-  | 'cloudflare-ai';
+  | 'cloudflare-ai' | 'example';

 const PROVIDERS: ProviderOption[] = [
   // ...existing...
+  { id: 'example', name: 'Example AI', placeholder: 'sk-ex-...', hint: 'example.com/keys' },
 ];
```

> **If your provider needs extra config** (like Cloudflare's Account ID), add a conditional input field that appears when the provider is selected. See `cloudflare-ai` in `onboarding.tsx` for the pattern.

### Step 6: Add Model Metadata

Model capabilities and context windows should come from model metadata, not local model-name lists.

1. **Provider API metadata (preferred)** — If your provider's model-listing API returns capability fields, map them into `Model.capabilities` from `listModels()` using `capabilitiesFromMetadata()`:

```typescript
import { capabilitiesFromMetadata } from '@/lib/models/capability-metadata';

return models.map((m: any) => {
  const contextWindow = typeof m.context_length === 'number' ? m.context_length : undefined;
  return {
    id: m.id,
    name: m.name,
    provider: 'example',
    contextWindow,
    capabilities: capabilitiesFromMetadata({
      contextWindow,
      inputModalities: m.input_modalities,
      outputModalities: m.output_modalities,
      supportedParameters: m.supported_parameters,
      supportsFunctionCalling: m.supports_function_calling,
      supportsReasoning: m.supports_reasoning,
      supportsVision: m.supports_vision,
      supportsPdfInput: m.supports_pdf_input,
    }),
  };
});
```

2. **LiteLLM fallback** — If the provider API does not return capability fields, leave `capabilities` unset. Medha will fall back to LiteLLM's community-maintained `model_prices_and_context_window.json` and derive app capabilities from fields like `supports_vision`, `supports_function_calling`, `supports_reasoning`, `supports_pdf_input`, `supported_modalities`, `supported_output_modalities`, and `mode`.

3. **Context windows** — You do NOT need to hardcode context windows. They are resolved automatically via:
   - **Provider API** (preferred): If your `listModels()` returns `contextWindow` on `Model` objects, these are registered into the dynamic cache automatically.
   - **LiteLLM fallback**: For providers whose APIs don't return context info, the community-maintained `model_prices_and_context_window.json` from LiteLLM serves as a fallback. See the **Context Window Architecture** section below.

### Step 7: Handle Non-OpenAI SSE Formats (if needed)

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

### Step 8: Handle Tool Call Format Differences (if needed)

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
- [ ] **Onboarding screen** — Added to `ProviderId` type and `PROVIDERS` array in `onboarding.tsx`
- [ ] **Model capabilities** — If the provider API returns capability metadata, populate `capabilities` on returned `Model` objects via `capabilitiesFromMetadata()`. If not, the LiteLLM fallback handles it automatically — no hardcoding needed.
- [ ] **Context windows** — If your provider's API returns context info in `listModels()`, populate `contextWindow` on `Model` objects. If not, the LiteLLM fallback handles it automatically — no hardcoding needed.
- [ ] **Model listing** — Prefer dynamic fetch with hardcoded fallback; pure hardcoding only when no API exists
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

5. **Dynamic model fetching is preferred** — Always try to fetch models from the provider's API, with a hardcoded fallback list. This ensures users automatically see new models as the provider adds them. See `cloudflare-ai.ts` for the pattern. If the provider's API returns context window info (e.g. `context_length`, `inputTokenLimit`, `max_input_tokens`), populate `contextWindow` on the returned `Model` objects — see `openrouter.ts`, `google-ai.ts`, and `anthropic.ts` for examples.

6. **Tool call loop is handled externally** — Your provider just needs to emit `onToolCalls` with the accumulated calls. The ChatScreen handles execution and re-submission.

7. **Usage data is optional but recommended** — If the API returns token counts in the streaming response, extract them and call `onUsage`. This feeds the Usage & Costs dashboard.

8. **Abort handling is free** — Just wire `abortController.signal` into the fetch options. The `streamCompletion()` engine handles `AbortError` silently.

9. **Thinking mode has three states** — `'auto'` means the provider decides. `'on'` means explicitly enable. `'off'` means swallow reasoning tokens client-side (via no-op handler). Always implement the no-op pattern for `'off'`.

10. **Providers needing extra config** — If a provider needs more than just an API key (e.g. Cloudflare needs an Account ID), store the extra config in MMKV (`src/lib/storage/mmkv.ts`) and add conditional input fields in both `api-keys.tsx` and `onboarding.tsx`.

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
| `src/lib/models/capabilities.ts` | Dynamic model metadata cache + metadata lookup | Rarely — only for metadata resolution behavior |
| `src/lib/models/capability-metadata.ts` | Converts provider/LiteLLM metadata fields into app capability flags | Rarely — only for new capability field shapes |
| `src/lib/models/litellm-registry.ts` | LiteLLM community model metadata fallback (context windows + capabilities) | Only to add provider prefix mappings |
| `src/lib/storage/secure.ts` | API key CRUD | Never — generic, works for any provider ID |
| `src/lib/storage/mmkv.ts` | Non-secret config (e.g. Account IDs) | Only if provider needs extra config beyond an API key |
| `src/stores/settings-store.ts` | Provider lists + key validation | Always — update provider ID arrays |
| `src/app/settings/api-keys.tsx` | API key management UI | Always — add provider to UI list |
| `src/app/onboarding.tsx` | First-run provider selection | Always — add provider to onboarding UI |
| `src/types/index.ts` | `Model`, `Message`, `Provider` types | Rarely — only if types need extension |

---

## Context Window Architecture

Medha resolves context window limits dynamically — **no hardcoded context window maps to maintain**.

### Resolution Priority

```
1. Provider API response (dynamic cache)
   ↓ miss
2. LiteLLM community registry (fetched from GitHub, cached locally)
   ↓ miss
3. "Unknown" — ContextWindowCircle shows unknown state
```

### How It Works

#### Layer 1: Provider API (Dynamic Cache)

When `listModels()` returns `Model` objects with a `contextWindow` field, the `ModelPicker` calls `registerModelsMetadata()` which stores them in an in-memory cache. `getModelContextWindow()` checks this cache first.

**Providers that return context info via API:**

| Provider | API Field | Example |
|---|---|---|
| OpenRouter | `context_length` | `{ context_length: 128000 }` |
| Google AI | `inputTokenLimit` | `{ inputTokenLimit: 1000000 }` |
| Anthropic | `max_input_tokens` | `{ max_input_tokens: 200000 }` |
| Cloudflare | `properties.max_total_tokens` | `{ properties: { max_total_tokens: 24000 } }` |

**To add context window support for a new provider:** In your `listModels()`, extract the relevant field from the API response and set `contextWindow` on the returned `Model` objects:

```typescript
async listModels(apiKey: string): Promise<Model[]> {
  const data = await fetch(...);
  return data.models.map((m: any) => ({
    id: m.id,
    name: m.name,
    provider: 'your-provider',
    contextWindow: typeof m.context_length === 'number' ? m.context_length : undefined,
  }));
}
```

#### Layer 2: LiteLLM Community Registry (Fallback)

For providers whose APIs don't return context info (OpenAI, MiniMax, Codex), Medha falls back to the [LiteLLM model_prices_and_context_window.json](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) — a community-maintained JSON file covering 1000+ models across all major providers.

**How it works:**
- Fetched from GitHub on first `ModelPicker` open
- Cached in AsyncStorage with a 24-hour TTL
- Falls back to stale cache if network is unavailable
- Lookup tries `modelId` directly, then `litellm_prefix/modelId`

**Provider prefix mapping** (in `litellm-registry.ts`):

| Medha Provider ID | LiteLLM Key Format | Example |
|---|---|---|
| `openai` | `modelId` | `gpt-4o` |
| `anthropic` | `modelId` | `claude-sonnet-4-20250514` |
| `minimax` | `minimax/modelId` | `minimax/MiniMax-M2.5` |
| `google-ai` | `gemini/modelId` | `gemini/gemini-2.0-flash` |

If you add a new provider and its models are in the LiteLLM registry, add the provider prefix mapping to `PROVIDER_PREFIX_MAP` in `src/lib/models/litellm-registry.ts`.

### Key Files

| File | Role |
|---|---|
| `src/lib/models/capabilities.ts` | `getModelContextWindow()` — checks dynamic cache first, then LiteLLM fallback |
| `src/lib/models/litellm-registry.ts` | Fetches, caches, and queries the LiteLLM JSON |
| `src/components/chat/ModelPicker.tsx` | Calls `registerModelsMetadata()` + `loadLiteLLMRegistry()` on open |
| `src/components/chat/ContextWindowCircle.tsx` | Renders the visual context usage indicator |

---

## Model Capability Architecture

Medha resolves model capabilities dynamically — **no hardcoded capability maps or model-name heuristics to maintain**.

### Resolution Priority

```
1. Provider API response (dynamic cache)
   ↓ missing fields
2. LiteLLM community registry (fetched from GitHub, cached locally)
   ↓ miss
3. Unknown — no badge/filter match for that capability
```

### How It Works

When `listModels()` returns `Model` objects with a `capabilities` field, `ModelPicker` calls `registerModelsMetadata()` and stores those capabilities in the dynamic metadata cache. `getModelCapabilities()` reads that cache first, then supplements missing/unknown metadata from LiteLLM.

Capabilities are derived from metadata fields, not model IDs:

| App Capability | Provider/LiteLLM metadata examples |
|---|---|
| `vision` | `supports_vision`, `supported_modalities: ['image']`, `input_modalities: ['image']` |
| `image-gen` | `mode: 'image_generation'`, `supported_output_modalities: ['image']`, image cost fields |
| `pdf` | `supports_pdf_input`, `max_pdf_size_mb`, `input_modalities: ['file'/'pdf'/'document']` |
| `tools` | `supports_function_calling`, `supports_tool_choice`, `supported_parameters: ['tools']` |
| `thinking` | `supports_reasoning`, `supported_parameters: ['reasoning'/'include_reasoning']` |
| `long-context` | Resolved context window greater than 100K tokens |

**To add capability support for a new provider:** In `listModels()`, extract capability-related fields from the API response and pass them to `capabilitiesFromMetadata()`. If the provider does not expose these fields, leave `capabilities` unset and make sure the provider has a LiteLLM prefix mapping if needed.
