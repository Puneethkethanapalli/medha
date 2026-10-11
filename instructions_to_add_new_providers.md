# How to Add a New AI Provider to Medha

This guide documents the provider architecture and gives step-by-step instructions for adding a new AI provider. It covers the seven built-in providers — **OpenRouter**, **OpenAI**, **ChatGPT Codex**, **Google AI**, **Anthropic**, **MiniMax**, and **Cloudflare AI**.

> **TL;DR** — Provider metadata (names, key copy, default/fallback models, display order) lives in **one file**: `src/lib/providers/catalog.ts`. A typical new provider touches the catalog, its provider class, `registry.ts`, the settings-store id list, and the catalog test. Onboarding, Settings › API Keys, the model picker, the model pill, and the chat default model all read from the catalog — don't edit them.

---

## Architecture Overview

```
src/lib/providers/
├── catalog.ts        # ProviderInfo per provider — the single source of truth for metadata
├── catalog.test.ts   # Locks catalog values; fails if registry.ts and the catalog disagree
├── setup-fields.ts   # Storage setters for extra setup fields (Cloudflare Account ID)
├── types.ts          # AIProvider interface + StreamConfig
├── registry.ts       # Map<id, AIProvider> + registerBuiltInProviders()
├── openrouter.ts     # OpenAI-compatible, streaming via SSE
├── openai.ts         # OpenAI platform API (/chat/completions)
├── openai-codex.ts   # ChatGPT Codex via the Responses API, ChatGPT sign-in (device code)
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

src/lib/chat/
├── run-turn.ts       # createTurnRunner() — one assistant turn: provider, tools, streaming, tool rounds
└── run-turn.deps.ts  # createTurnServices() — wires the runner to the real modules

src/lib/models/
├── capabilities.ts        # Dynamic metadata cache + metadata lookup helpers
├── capability-metadata.ts # Provider/LiteLLM metadata → app capability flags
└── litellm-registry.ts    # LiteLLM community model metadata fallback

src/lib/storage/
└── secure.ts         # expo-secure-store wrappers for API key CRUD

src/stores/
└── settings-store.ts # Zustand store — provider list, key validation, hasAnyProviderKey()

src/app/settings/
└── api-keys.tsx      # UI for adding/deleting provider API keys (renders from the catalog)

src/app/
└── onboarding.tsx    # First-run screen — provider selection + key input (renders from the catalog)

src/components/chat/
├── ModelPicker.tsx   # Provider tabs + fallback model lists (from the catalog)
└── ModelPill.tsx     # Provider short badge (from the catalog)
```

### Data Flow (simplified)

```
User sends message
  → ChatScreen starts a turn: createTurnRunner().run() in src/lib/chat/run-turn.ts
  → run-turn resolves provider via registry.getProvider(providerId)
  → Calls provider.stream(messages, config, ...callbacks)
    → Provider builds request body (OpenAI format or proprietary)
    → Calls streamCompletion(options, ...) from lib/streaming/stream.ts
      → fetch() + ReadableStream → SSEParser → extractTokens() or extractGeminiNativeTokens()
      → Dispatches onContent / onReasoning / onToolCalls / onUsage callbacks
```

---

## The Provider Catalog

`src/lib/providers/catalog.ts` is plain data: it imports nothing at runtime (only `import type`), so it loads in Node unit tests. **Keep it that way** — never import `react-native`, `expo`, storage, or a provider class into it.

Each provider has one `ProviderInfo` entry in `PROVIDER_CATALOG`, and `PROVIDER_IDS` sets the display order:

| Field | Required | Where it shows up |
|---|---|---|
| `id` | yes | Must equal `AIProvider.id`, `Model.provider`, and the secure-store key name |
| `displayName` | yes | Model picker tabs, onboarding pills, Settings › API Keys, success alerts, `AIProvider.name` |
| `shortName` | yes | Badge on the model pill (e.g. `OR`, `CF`) |
| `description` | yes | One-liner under the name in Settings › API Keys |
| `authMode` | yes | `'api-key'` (paste + `validateKey()`) or `'codex-oauth'` (ChatGPT device-code sign-in) |
| `keyPlaceholder` | yes | Onboarding key input placeholder (`''` for OAuth providers) |
| `keyHint` | yes | Onboarding hint, rendered as "Get your key at {keyHint}" (shown verbatim for OAuth) |
| `setupFields` | no | Extra non-secret inputs collected before key validation (Cloudflare Account ID) |
| `keyLabel` | no | Label above the key input in Settings when `setupFields` precede it (e.g. `'API Token'`) |
| `defaultModel` | yes | Chat model used before the user picks one (`getDefaultModel()`) |
| `fallbackModels` | yes | Picker list when there's no cached list and the live fetch failed (`id`, `name`, `provider` only) |

Helpers (all safe for unknown ids):

| Helper | Returns |
|---|---|
| `getProviderInfo(id)` | The entry, or `undefined` for ids the app doesn't ship (`'tavily'`, `'constructor'`, …) |
| `listProviderInfo()` | Every entry in `PROVIDER_IDS` order |
| `getProviderDisplayName(id)` | `displayName`, or the raw id |
| `getDefaultModel(id)` | `defaultModel`, or the default provider's (OpenRouter) for unknown ids |
| `getFallbackModels(id)` | `fallbackModels`, or `[]` |
| `findMissingSetupField(provider, values)` | The first blank setup field, if any |
| `isProviderId(id)` | Type guard for `ProviderId` |

`MINIMAX_MODELS` and `CLOUDFLARE_FALLBACK_MODELS` are defined in the catalog; import them from `@/lib/providers/catalog`.

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

### Step 1: Add the Catalog Entry

Edit `src/lib/providers/catalog.ts` — this one entry feeds onboarding, Settings › API Keys, the model picker, the model pill, and the chat default model.

```diff
 export const PROVIDER_IDS = [
   'openrouter',
   // ...existing...
   'cloudflare-ai',
+  'example',
 ] as const;

 export const PROVIDER_CATALOG: Readonly<Record<ProviderId, ProviderInfo>> = {
   // ...existing...
+  example: {
+    id: 'example',
+    displayName: 'Example AI',
+    shortName: 'EX',
+    description: 'Example models via the Example API',
+    authMode: 'api-key',
+    keyPlaceholder: 'sk-ex-...',
+    keyHint: 'example.com/keys',
+    defaultModel: 'example-large',
+    fallbackModels: [
+      { id: 'example-large', name: 'Example Large', provider: 'example' },
+      { id: 'example-small', name: 'Example Small', provider: 'example' },
+    ],
+  },
 };
```

- **Order:** the position in `PROVIDER_IDS` is the order in onboarding and Settings.
- **Record type:** `PROVIDER_CATALOG` is a `Record<ProviderId, ProviderInfo>`, so TypeScript reports a missing entry as soon as you add the id.
- **`defaultModel`:** it should also be in `fallbackModels`, so the picker can show it offline. The catalog test enforces this.
- **`fallbackModels`:** only `id`, `name`, and `provider`. See the hard rule in Step 6.

### Step 2: Create the Provider File

Create `src/lib/providers/<provider-id>.ts`.

If the API is OpenAI-compatible, copy `minimax.ts` as your starting template. If proprietary, study `anthropic.ts`.

```typescript
// src/lib/providers/example.ts
import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
import { PROVIDER_CATALOG } from './catalog';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildOpenAIMessages } from '@/lib/attachments/multimodal';
import type { Message, Model } from '@/types';

const BASE_URL = 'https://api.example.com/v1';

export class ExampleProvider implements AIProvider {
  id = 'example';      // Must match the catalog id (unique, lowercase, kebab-case)
  name = PROVIDER_CATALOG.example.displayName;  // Display name comes from the catalog

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
      if (!res.ok) return PROVIDER_CATALOG.example.fallbackModels;
      const data = await res.json();
      const models: any[] = data.data || [];
      if (models.length === 0) return PROVIDER_CATALOG.example.fallbackModels;
      return models.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        provider: 'example',  // Must match this.id
      }));
    } catch {
      return PROVIDER_CATALOG.example.fallbackModels;
    }

    // FALLBACK-ONLY: Use when the provider has no public model-listing API
    // return PROVIDER_CATALOG.example.fallbackModels;
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

### Step 3: Register the Provider

Edit `src/lib/providers/registry.ts`:

```diff
 export function registerBuiltInProviders(): void {
   const { OpenRouterProvider } = require('./openrouter');
   // ...existing...
   const { CloudflareAIProvider } = require('./cloudflare-ai');
+  const { ExampleProvider } = require('./example');
   registerProvider(new OpenRouterProvider());
   // ...existing...
   registerProvider(new CloudflareAIProvider());
+  registerProvider(new ExampleProvider());
 }
```

> **Why `require()` instead of `import`?** To avoid circular dependencies. The registry is loaded lazily by the settings store.

`catalog.test.ts` reads `registry.ts` and fails if a registered provider has no catalog entry, or if a catalog entry has no registered provider.

### Step 4: Add to the Settings Store Provider List

`getConfiguredProviders()` in `src/stores/settings-store.ts` has its own hardcoded id array, and `hasAnyProviderKey()` uses it. Add the new id there in catalog order:

```diff
 export async function getConfiguredProviders(): Promise<string[]> {
-  const allProviders = ['openrouter', 'openai', 'openai-codex', 'google-ai', 'anthropic', 'minimax', 'cloudflare-ai'];
+  const allProviders = ['openrouter', 'openai', 'openai-codex', 'google-ai', 'anthropic', 'minimax', 'cloudflare-ai', 'example'];
   // ...
 }
```

> Once this list reads `PROVIDER_IDS` from the catalog, this step goes away.

### Step 5: Extra Setup Fields (only if needed)

Onboarding and Settings › API Keys need **no edits** for a standard API-key provider; both screens render from `listProviderInfo()`.

If the provider needs more than a key (as Cloudflare needs an Account ID):

1. Add a field id to `ProviderSetupFieldId` in `catalog.ts`, then declare it on the entry:

```typescript
setupFields: [
  {
    id: 'example-region',
    label: 'Region',                          // label in Settings › API Keys
    placeholder: 'Example region',
    hint: 'Shown on your Example dashboard',  // helper text in onboarding
    requiredMessage: 'Please enter your Example region',
  },
],
keyLabel: 'API Key', // label above the key input in Settings, after the setup fields
```

2. Add a getter and setter to `src/lib/storage/mmkv.ts`. These are non-secret values, so they don't go in secure storage. Map the field id to the setter in `SETUP_FIELD_SETTERS` in `src/lib/providers/setup-fields.ts`.

Both screens then render the field and refuse to continue while it's blank. They save it before key validation and clear it when the key is deleted. Your provider class reads the value from storage, as `cloudflare-ai.ts` does in `getAccountId()`.

> **New auth flows** (another OAuth provider, say) are the exception: add an `authMode` value and handle it in `onboarding.tsx` and `api-keys.tsx`, following the `'codex-oauth'` branches.

### Step 6: Add Model Metadata

Model capabilities and context windows should come from model metadata, not local model-name lists.

**Hard rule:** A provider fallback list may hardcode `id`, `name`, and `provider` so the picker can show something when the provider has no model-list API or the API request fails. Do **not** hardcode `contextWindow`, `capabilities`, pricing, or model-name heuristics in those fallback lists. If provider metadata and LiteLLM both miss, the app should show an unknown context/capability state instead of inventing one locally.

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

   This is a real fallback, not a guarantee. If LiteLLM does not have the model key, Medha should not show capability badges for that model unless the provider API supplied them.

3. **Context windows** — You do NOT need to hardcode context windows. They are resolved automatically via:
   - **Provider API** (preferred): If your `listModels()` returns `contextWindow` on `Model` objects, these are registered into the dynamic cache automatically.
   - **LiteLLM fallback**: For providers whose APIs don't return context info, the community-maintained `model_prices_and_context_window.json` from LiteLLM serves as a fallback when it has the model. See the **Context Window Architecture** section below.
   - **Unknown state**: If both sources miss, `ContextWindowCircle` should show unknown rather than using a local guess.

4. **Verify LiteLLM coverage** — Before assuming fallback metadata exists, run:

```bash
npm run check:litellm -- <provider-id> <model-id>
```

Examples:

```bash
npm run check:litellm -- minimax MiniMax-M2.5
npm run check:litellm -- minimax MiniMax-M2.7
npm run check:litellm -- cloudflare-ai @cf/openai/gpt-oss-120b
```

The command prints every lookup key Medha will try and exits with:

| Exit code | Meaning |
|---|---|
| `0` | LiteLLM metadata found |
| `2` | LiteLLM registry loaded, but this model was not found |
| `1` | Fetch/script error |

Use this to distinguish "LiteLLM fallback is working but the model is absent from LiteLLM" from "the app lookup is wrong".

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

3. The turn runner (`createTurnRunner` in `src/lib/chat/run-turn.ts`) builds `toolConfig` and passes tools in OpenAI format via `config.tools`; only Anthropic also gets `config.anthropicTools`. Either convert `config.tools` in your provider's `stream()` method, or fill the new field there (next to the `providerId === 'anthropic'` branch) and add its converter to `TurnServices.tools`, wired in `src/lib/chat/run-turn.deps.ts`.

### Step 9: Update and Run the Catalog Test

`src/lib/providers/catalog.test.ts` locks every catalog value, so silent copy changes show up in review. Add the new provider's expected values to `EXPECTED`, in catalog order, then run:

```bash
npm test
```

The test also checks:
- ids are unique
- every fallback model is tagged with its provider and carries only `id` / `name` / `provider`
- each `defaultModel` appears in its fallback list
- the catalog and `registry.ts` list the same providers

---

## Checklist

Use this checklist when adding a new provider:

- [ ] **Catalog entry** — `PROVIDER_IDS` + `PROVIDER_CATALOG` in `src/lib/providers/catalog.ts` (name, short name, description, auth mode, key placeholder/hint, default model, fallback models)
- [ ] **Provider file** — `src/lib/providers/<id>.ts` implementing `AIProvider`, `name` taken from the catalog
- [ ] **Registry** — Added to `registerBuiltInProviders()` in `registry.ts`
- [ ] **Settings store** — Added to the `getConfiguredProviders()` array in `settings-store.ts`
- [ ] **Setup fields** (only if needed) — `setupFields` / `keyLabel` in the catalog, storage in `mmkv.ts`, setter in `setup-fields.ts`
- [ ] **Catalog test** — Expected values added to `catalog.test.ts`; `npm test` passes
- [ ] **No UI edits** — Onboarding, API Keys, model picker, and model pill render from the catalog; touch them only for a new `authMode`
- [ ] **Model capabilities** — If the provider API returns capability metadata, populate `capabilities` on returned `Model` objects via `capabilitiesFromMetadata()`. If not, verify LiteLLM coverage with `npm run check:litellm -- <provider> <model>` and leave unknown models unbadged.
- [ ] **Context windows** — If your provider's API returns context info in `listModels()`, populate `contextWindow` on `Model` objects. If not, verify LiteLLM coverage and leave unknown models in the unknown context state.
- [ ] **Model listing** — Prefer dynamic fetch with a hardcoded model-list fallback; fallback objects should only include `id`, `name`, and `provider`
- [ ] **LiteLLM mapping** — If LiteLLM uses a provider prefix, add it to `PROVIDER_PREFIX_MAP` and test at least one known hit and one known miss with `npm run check:litellm`
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

5. **Dynamic model fetching is preferred** — Always try to fetch models from the provider's API, with a hardcoded fallback list for availability. This ensures users automatically see new models as the provider adds them. See `cloudflare-ai.ts` for the pattern. If the provider's API returns context window info (e.g. `context_length`, `inputTokenLimit`, `max_input_tokens`), populate `contextWindow` on the returned `Model` objects — see `openrouter.ts`, `google-ai.ts`, and `anthropic.ts` for examples. Do not put context windows or capabilities into fallback-only model arrays.

6. **Tool call loop is handled externally** — Your provider just needs to emit `onToolCalls` with the accumulated calls. The turn runner (`src/lib/chat/run-turn.ts`) handles execution and re-submission.

7. **Usage data is optional but recommended** — If the API returns token counts in the streaming response, extract them and call `onUsage`. This feeds the Usage & Costs dashboard.

8. **Abort handling is free** — Just wire `abortController.signal` into the fetch options. The `streamCompletion()` engine handles `AbortError` silently.

9. **Thinking mode has three states** — `'auto'` means the provider decides. `'on'` means explicitly enable. `'off'` means swallow reasoning tokens client-side (via no-op handler). Always implement the no-op pattern for `'off'`.

10. **Providers needing extra config** — If a provider needs more than just an API key (e.g. Cloudflare needs an Account ID), declare `setupFields` on its catalog entry, store the value in MMKV (`src/lib/storage/mmkv.ts`), and map the field to its setter in `src/lib/providers/setup-fields.ts`. Both `api-keys.tsx` and `onboarding.tsx` render and validate the fields from the catalog (see Step 5).

11. **Keep the catalog Node-safe** — `catalog.ts` is unit-tested under plain Node. Use `import type` only; anything native (storage, `expo/fetch`, provider classes) belongs elsewhere.

---

## File Reference

| File | Purpose | When to modify |
|------|---------|----------------|
| `src/lib/providers/catalog.ts` | Provider metadata: names, key copy, setup fields, default + fallback models, display order | Always — add your provider's entry here |
| `src/lib/providers/catalog.test.ts` | Locks catalog values; checks catalog ↔ registry coverage | Always — add expected values |
| `src/lib/providers/setup-fields.ts` | Storage setters for catalog `setupFields` | Only if the provider needs extra config |
| `src/lib/providers/types.ts` | `AIProvider` interface, `StreamConfig` | Only if adding a new config field (e.g. new tool format) |
| `src/lib/providers/registry.ts` | Provider registration | Always — add your provider here |
| `src/lib/streaming/stream.ts` | Shared SSE streaming engine | Only if adding a new SSE format |
| `src/lib/streaming/sse-parser.ts` | SSE line parsing + token extraction | Only if adding a new SSE format |
| `src/lib/attachments/multimodal.ts` | Message format builders | Only if provider needs non-OpenAI message format |
| `src/lib/tools/registry.ts` | Tool schema converters | Only if provider needs non-OpenAI tool format |
| `src/lib/chat/run-turn.ts` | One assistant turn: provider lookup, tool config, streaming, tool rounds | Only if adding a new tool format |
| `src/lib/chat/run-turn.deps.ts` | Wires `TurnServices` (incl. tool schema converters) to the real modules | Only if adding a new tool format |
| `src/lib/models/capabilities.ts` | Dynamic model metadata cache + metadata lookup | Rarely — only for metadata resolution behavior |
| `src/lib/models/capability-metadata.ts` | Converts provider/LiteLLM metadata fields into app capability flags | Rarely — only for new capability field shapes |
| `src/lib/models/litellm-registry.ts` | LiteLLM community model metadata fallback (context windows + capabilities) | Only to add provider prefix mappings |
| `scripts/check-litellm-model.js` | CLI check for LiteLLM lookup keys and derived metadata | Only if LiteLLM lookup behavior changes |
| `src/lib/storage/secure.ts` | API key CRUD | Never — generic, works for any provider ID |
| `src/lib/storage/mmkv.ts` | Non-secret config (e.g. Account IDs) | Only if provider needs extra config beyond an API key |
| `src/stores/settings-store.ts` | Configured-provider list + key validation | Always — add the id to the `getConfiguredProviders()` array |
| `src/app/settings/api-keys.tsx` | API key management UI (renders from the catalog) | Only for a new `authMode` |
| `src/app/onboarding.tsx` | First-run provider selection (renders from the catalog) | Only for a new `authMode` |
| `src/components/chat/ModelPicker.tsx` / `ModelPill.tsx` | Provider tabs, fallback lists, short badge (from the catalog) | Never for a new provider |
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

For providers whose APIs don't return context info (OpenAI, MiniMax, Codex), Medha falls back to the [LiteLLM model_prices_and_context_window.json](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) — a community-maintained JSON file covering many models across major providers. Coverage is not complete, especially for newly released provider models.

**How it works:**
- Fetched from GitHub on first `ModelPicker` open
- Cached in AsyncStorage with a 24-hour TTL
- Falls back to stale cache if network is unavailable
- Lookup tries `modelId` directly, then `litellm_prefix/modelId`
- Missing LiteLLM entries intentionally resolve to unknown; do not patch them with local hardcoded context windows

**Provider prefix mapping** (in `litellm-registry.ts`):

| Medha Provider ID | LiteLLM Key Format | Example |
|---|---|---|
| `openai` | `modelId` | `gpt-4o` |
| `anthropic` | `modelId` | `claude-sonnet-4-20250514` |
| `minimax` | `minimax/modelId` | `minimax/MiniMax-M2.5` |
| `google-ai` | `gemini/modelId` | `gemini/gemini-2.0-flash` |
| `cloudflare-ai` | `cloudflare/modelId` | `cloudflare/@cf/mistral/mistral-7b-instruct-v0.1` |
| `openrouter` | `openrouter/modelId` | `openrouter/google/gemini-2.0-flash` |

If you add a new provider and its models are in the LiteLLM registry, add the provider prefix mapping to `PROVIDER_PREFIX_MAP` in `src/lib/models/litellm-registry.ts`.

### Testing LiteLLM Lookup

Use the CLI check before debugging the UI:

```bash
npm run check:litellm -- <provider-id> <model-id>
```

The output shows:

- the source registry URL
- the provider and model being checked
- every lookup key Medha will try
- the matched LiteLLM key, when present
- derived context window and capabilities

If this command says `Result: no LiteLLM metadata found`, the app should also show no LiteLLM-derived context window or capability badges for that model. That is expected behavior, not a fallback failure.

### Key Files

| File | Role |
|---|---|
| `src/lib/models/capabilities.ts` | `getModelContextWindow()` — checks dynamic cache first, then LiteLLM fallback |
| `src/lib/models/litellm-registry.ts` | Fetches, caches, and queries the LiteLLM JSON |
| `scripts/check-litellm-model.js` | Replays LiteLLM lookup from the terminal for one provider/model |
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

When `listModels()` returns `Model` objects with a `capabilities` field, `ModelPicker` calls `registerModelsMetadata()` and stores those capabilities in the dynamic metadata cache. `getModelCapabilities()` reads that cache first, then supplements missing metadata from LiteLLM. If neither source knows about a capability, the model should not get that badge.

Capabilities are derived from metadata fields, not model IDs:

| App Capability | Provider/LiteLLM metadata examples |
|---|---|
| `vision` | `supports_vision`, `supported_modalities: ['image']`, `input_modalities: ['image']` |
| `image-gen` | `mode: 'image_generation'`, `supported_output_modalities: ['image']`, image cost fields |
| `pdf` | `supports_pdf_input`, `max_pdf_size_mb`, `input_modalities: ['file'/'pdf'/'document']` |
| `tools` | `supports_function_calling`, `supports_tool_choice`, `supported_parameters: ['tools']` |
| `thinking` | `supports_reasoning`, `supported_parameters: ['reasoning'/'include_reasoning']` |
| `long-context` | Resolved context window greater than 100K tokens |

**To add capability support for a new provider:** In `listModels()`, extract capability-related fields from the API response and pass them to `capabilitiesFromMetadata()`. If the provider does not expose these fields, leave `capabilities` unset, make sure the provider has a LiteLLM prefix mapping if needed, and test representative models with `npm run check:litellm -- <provider> <model>`.
