/**
 * Provider catalog — the single source of truth for per-provider metadata:
 * display names, key-entry copy, extra setup fields, default, fallback, and
 * fast models, LiteLLM key prefixes, and the order providers appear in
 * onboarding and Settings.
 *
 * Plain data only. This module must not import react-native, expo, or any
 * provider implementation (directly or transitively) so it stays loadable in
 * Node unit tests and scripts/check-litellm-model.js — keep every import here
 * `import type`.
 *
 * Streaming / model listing lives in the provider classes next to this file,
 * which are registered in registry.ts. Every registered provider must have an
 * entry here (catalog.test.ts enforces it).
 */
import type { Model } from '@/types';

/**
 * Display order for onboarding, Settings › API Keys, and the default provider;
 * also the providers whose keys `getConfiguredProviders()` checks.
 */
export const PROVIDER_IDS = [
  'openrouter',
  'openai',
  'openai-codex',
  'google-ai',
  'anthropic',
  'minimax',
  'cloudflare-ai',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Used when no provider has been chosen yet, and for unknown provider ids. */
export const DEFAULT_PROVIDER_ID: ProviderId = 'openrouter';

/**
 * How the user connects the provider:
 * - `api-key`: paste a key; it is validated with `AIProvider.validateKey()`.
 * - `codex-oauth`: ChatGPT device-code sign-in (see `@/lib/auth/openai-codex`).
 */
export type ProviderAuthMode = 'api-key' | 'codex-oauth';

/**
 * Non-secret values a provider needs besides its key. Each id maps to a
 * storage setter in `setup-fields.ts`.
 */
export type ProviderSetupFieldId = 'cloudflare-account-id';

export interface ProviderSetupField {
  id: ProviderSetupFieldId;
  /** Label above the input in Settings › API Keys. */
  label: string;
  placeholder: string;
  /** Helper text under the input during onboarding. */
  hint: string;
  /** Error shown when the field is left empty. */
  requiredMessage: string;
}

/** Values typed into setup fields, keyed by field id. */
export type ProviderSetupValues = Partial<Record<ProviderSetupFieldId, string>>;

export interface ProviderInfo {
  /** Matches `AIProvider.id`, `Model.provider`, and the secure-store key name. */
  id: ProviderId;
  /** Full name used in the model picker, onboarding, and Settings › API Keys. */
  displayName: string;
  /** Compact badge on the model pill. */
  shortName: string;
  /** One-line summary under the name in Settings › API Keys. */
  description: string;
  authMode: ProviderAuthMode;
  /** Key input placeholder during onboarding ('' for OAuth providers). */
  keyPlaceholder: string;
  /**
   * Where to get a key — rendered as "Get your key at {keyHint}". OAuth
   * providers show it verbatim instead.
   */
  keyHint: string;
  /** Label above the key input in Settings when `setupFields` precede it. */
  keyLabel?: string;
  /** Extra values collected (and validated) before the key is checked. */
  setupFields?: readonly ProviderSetupField[];
  /** Model used when the user hasn't picked one yet. */
  defaultModel: string;
  /**
   * Picker list shown when the provider has no cached list and the live fetch
   * failed. Only `id`, `name`, and `provider` — never context windows or
   * capabilities (those come from provider metadata or LiteLLM).
   */
  fallbackModels: Model[];
  /**
   * Cheap models for background work (memory extraction and profile updates),
   * in order of preference. `pickFastModel()` uses the first one in the
   * provider's cached model list, else the chat model. Omit to always use the
   * chat model.
   */
  fastModels?: readonly string[];
  /**
   * Prefix of this provider's keys in LiteLLM's model registry, e.g.
   * `'gemini'` for `gemini/gemini-2.0-flash`; `''` when LiteLLM keys are the
   * bare model id. Read by `litellm-registry.ts` and `npm run check:litellm`.
   */
  litellmPrefix: string;
}

// MiniMax doesn't have a public model list endpoint, so this is only a model-list fallback.
// Context windows and capability badges come from LiteLLM, not this list.
export const MINIMAX_MODELS: Model[] = [
  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', provider: 'minimax' },
  { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed', provider: 'minimax' },
  { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', provider: 'minimax' },
  { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 Highspeed', provider: 'minimax' },
  { id: 'MiniMax-M2.1', name: 'MiniMax M2.1', provider: 'minimax' },
  { id: 'MiniMax-M2.1-highspeed', name: 'MiniMax M2.1 Highspeed', provider: 'minimax' },
  { id: 'MiniMax-M2', name: 'MiniMax M2', provider: 'minimax' },
];

// Static model list used by the picker when Cloudflare cannot be refreshed.
// Context windows and capability badges come from Cloudflare's API response or LiteLLM.
export const CLOUDFLARE_FALLBACK_MODELS: Model[] = [
  { id: '@cf/openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'cloudflare-ai' },
  { id: '@cf/openai/gpt-oss-20b', name: 'GPT-OSS 20B', provider: 'cloudflare-ai' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B', provider: 'cloudflare-ai' },
  { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill 32B', provider: 'cloudflare-ai' },
  { id: '@cf/qwen/qwq-32b', name: 'QwQ 32B', provider: 'cloudflare-ai' },
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B', provider: 'cloudflare-ai' },
  { id: '@cf/meta/llama-3.2-1b-instruct', name: 'Llama 3.2 1B', provider: 'cloudflare-ai' },
  { id: '@hf/mistral/mistral-7b-instruct-v0.2', name: 'Mistral 7B v0.2', provider: 'cloudflare-ai' },
  { id: '@hf/google/gemma-7b-it', name: 'Gemma 7B', provider: 'cloudflare-ai' },
];

export const PROVIDER_CATALOG: Readonly<Record<ProviderId, ProviderInfo>> = {
  openrouter: {
    id: 'openrouter',
    displayName: 'OpenRouter',
    shortName: 'OR',
    description: 'Access to 200+ AI models',
    authMode: 'api-key',
    keyPlaceholder: 'sk-or-...',
    keyHint: 'openrouter.ai/keys',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    fallbackModels: [
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', provider: 'openrouter' },
      { id: 'deepseek/deepseek-chat-v3:free', name: 'DeepSeek Chat V3', provider: 'openrouter' },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Thinking)', provider: 'openrouter' },
      { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', provider: 'openrouter' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openrouter' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter' },
    ],
    fastModels: [
      'google/gemini-2.5-flash-lite',
      'openai/gpt-4.1-mini',
      'google/gemini-2.5-flash',
      'openai/gpt-4o-mini',
      'anthropic/claude-haiku-4.5',
    ],
    // OpenRouter lists its own metadata; LiteLLM is only a fallback.
    litellmPrefix: 'openrouter',
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI',
    shortName: 'OA',
    description: 'GPT models via the OpenAI platform API',
    authMode: 'api-key',
    keyPlaceholder: 'sk-proj-...',
    keyHint: 'platform.openai.com/api-keys',
    defaultModel: 'gpt-5.4-mini',
    fallbackModels: [
      { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai' },
      { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai' },
      { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', provider: 'openai' },
      { id: 'gpt-5.3-chat-latest', name: 'GPT-5.3 Chat', provider: 'openai' },
      { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    ],
    fastModels: ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
    litellmPrefix: '',
  },
  'openai-codex': {
    id: 'openai-codex',
    displayName: 'ChatGPT Codex',
    shortName: 'CX',
    description: 'Use Codex models with your ChatGPT plan',
    authMode: 'codex-oauth',
    keyPlaceholder: '',
    keyHint: 'ChatGPT Plus/Pro/Business Codex access',
    defaultModel: 'gpt-5.1-codex',
    fallbackModels: [
      { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai-codex' },
      { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai-codex' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai-codex' },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai-codex' },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'openai-codex' },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', provider: 'openai-codex' },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'openai-codex' },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', provider: 'openai-codex' },
    ],
    fastModels: ['gpt-5.4-mini', 'gpt-5.1-codex-mini'],
    litellmPrefix: '',
  },
  'google-ai': {
    id: 'google-ai',
    displayName: 'Google AI',
    shortName: 'G',
    description: 'Gemini models via Google AI Studio',
    authMode: 'api-key',
    keyPlaceholder: 'AIza...',
    keyHint: 'aistudio.google.com/apikey',
    defaultModel: 'gemini-2.0-flash',
    fallbackModels: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google-ai' },
      { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash Preview', provider: 'google-ai' },
      { id: 'gemini-2.5-pro-preview-03-25', name: 'Gemini 2.5 Pro Preview', provider: 'google-ai' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google-ai' },
    ],
    fastModels: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    litellmPrefix: 'gemini',
  },
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic',
    shortName: 'A',
    description: 'Claude models via Anthropic API',
    authMode: 'api-key',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-5-haiku-20241022',
    fallbackModels: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', provider: 'anthropic' },
    ],
    fastModels: ['claude-haiku-5-5', 'claude-haiku-4-5', 'claude-3-5-haiku-latest'],
    litellmPrefix: '',
  },
  minimax: {
    id: 'minimax',
    displayName: 'MiniMax',
    shortName: 'MM',
    description: 'MiniMax M2.7 and M1 models',
    authMode: 'api-key',
    keyPlaceholder: 'eyJ...',
    keyHint: 'platform.minimax.io',
    defaultModel: 'MiniMax-M2.7',
    fallbackModels: MINIMAX_MODELS,
    litellmPrefix: 'minimax',
  },
  'cloudflare-ai': {
    id: 'cloudflare-ai',
    displayName: 'Cloudflare AI',
    shortName: 'CF',
    description: 'Free tier: 10K neurons/day — Llama, Mistral, Gemma',
    authMode: 'api-key',
    keyPlaceholder: 'Bearer token...',
    keyHint: 'dash.cloudflare.com/profile/api-tokens',
    keyLabel: 'API Token',
    setupFields: [
      {
        id: 'cloudflare-account-id',
        label: 'Account ID',
        placeholder: 'Cloudflare Account ID',
        hint: 'Found in your Cloudflare dashboard URL',
        requiredMessage: 'Please enter your Cloudflare Account ID',
      },
    ],
    defaultModel: '@cf/openai/gpt-oss-120b',
    fallbackModels: CLOUDFLARE_FALLBACK_MODELS,
    litellmPrefix: 'cloudflare',
  },
};

export function isProviderId(id: string): id is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(id);
}

/** Catalog entry for a provider id; `undefined` for ids the app doesn't ship. */
export function getProviderInfo(id: string): ProviderInfo | undefined {
  // Guarded lookup so ids like 'constructor' never hit Object.prototype.
  return isProviderId(id) ? PROVIDER_CATALOG[id] : undefined;
}

/** Every provider, in display order. */
export function listProviderInfo(): ProviderInfo[] {
  return PROVIDER_IDS.map((id) => PROVIDER_CATALOG[id]);
}

/** Full provider name, falling back to the raw id for unknown providers. */
export function getProviderDisplayName(id: string): string {
  return getProviderInfo(id)?.displayName || id;
}

/** Model used when the user hasn't picked one; unknown ids get the default provider's. */
export function getDefaultModel(id: string): string {
  return (getProviderInfo(id) ?? PROVIDER_CATALOG[DEFAULT_PROVIDER_ID]).defaultModel;
}

/** Picker fallback list for a provider; empty for unknown ids. */
export function getFallbackModels(id: string): Model[] {
  return getProviderInfo(id)?.fallbackModels ?? [];
}

/** First setup field left blank (whitespace counts as blank), if any. */
export function findMissingSetupField(
  provider: Pick<ProviderInfo, 'setupFields'>,
  values: ProviderSetupValues
): ProviderSetupField | undefined {
  return provider.setupFields?.find((field) => !values[field.id]?.trim());
}
