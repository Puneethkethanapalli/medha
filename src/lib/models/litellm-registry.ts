/**
 * LiteLLM Model Registry — community-maintained model metadata.
 *
 * Fetches model_prices_and_context_window.json from GitHub on first use,
 * caches it in AsyncStorage, and serves as a fallback for providers whose
 * APIs don't return model metadata (OpenAI, MiniMax, OpenAI Codex).
 *
 * Source: https://github.com/BerriAI/litellm
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ModelCapability } from '@/types';
import { capabilitiesFromMetadata } from '@/lib/models/capability-metadata';

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const CACHE_KEY = 'litellm_model_registry';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Provider ID mapping: Medha provider IDs → LiteLLM provider prefixes
const PROVIDER_PREFIX_MAP: Record<string, string> = {
  openai: '',              // LiteLLM keys: "gpt-4o" (no prefix for OpenAI)
  'openai-codex': '',      // Same models, no prefix
  'google-ai': 'gemini',   // LiteLLM keys: "gemini/gemini-2.0-flash"
  anthropic: '',           // LiteLLM keys: "claude-sonnet-4-20250514" (no prefix)
  minimax: 'minimax',      // LiteLLM keys: "minimax/MiniMax-M2.5"
  'cloudflare-ai': 'cloudflare', // LiteLLM keys: "cloudflare/@cf/..."
  openrouter: 'openrouter', // LiteLLM keys: "openrouter/..." (but OpenRouter has its own API)
};

type LiteLLMEntry = {
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  litellm_provider?: string;
  mode?: string;
  supported_modalities?: string[];
  supported_output_modalities?: string[];
  supports_function_calling?: boolean;
  supports_parallel_function_calling?: boolean;
  supports_tool_choice?: boolean;
  supports_vision?: boolean;
  supports_reasoning?: boolean;
  supports_pdf_input?: boolean;
  max_pdf_size_mb?: number;
  input_cost_per_image?: number;
  output_cost_per_image?: number;
  output_cost_per_image_token?: number;
};

let registry: Record<string, LiteLLMEntry> | null = null;
let fetchPromise: Promise<void> | null = null;

/**
 * Load the LiteLLM registry. Tries cached data first, then fetches from GitHub.
 * Safe to call multiple times — deduplicates concurrent fetches.
 */
export async function loadLiteLLMRegistry(): Promise<void> {
  if (registry) return;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      // Try cached data first
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL_MS && data) {
          registry = data;
          return;
        }
      }
    } catch {
      // Cache read failed, proceed to fetch
    }

    try {
      const response = await fetch(LITELLM_URL);
      if (!response.ok) return;

      const data = await response.json();
      if (!data || typeof data !== 'object') return;

      // Remove the sample_spec entry
      delete data.sample_spec;

      registry = data as Record<string, LiteLLMEntry>;

      // Cache for offline use
      try {
        await AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ data: registry, timestamp: Date.now() })
        );
      } catch {
        // Cache write failed — non-fatal
      }
    } catch {
      // Network fetch failed — fall back to stale cache if any
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data } = JSON.parse(cached);
          if (data) registry = data;
        }
      } catch {
        // Nothing we can do
      }
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Look up the context window (max input tokens) for a model from the LiteLLM registry.
 *
 * Tries multiple key patterns to match LiteLLM's naming convention:
 *   1. Exact model ID (e.g. "gpt-4o")
 *   2. provider/modelId (e.g. "minimax/MiniMax-M2.5")
 *   3. litellm_prefix/modelId (e.g. "gemini/gemini-2.0-flash")
 */
export function getLiteLLMContextWindow(
  modelId: string,
  provider?: string
): number | undefined {
  const entry = findLiteLLMEntry(modelId, provider);
  return getEntryContextWindow(entry);
}

/**
 * Look up model capabilities from the LiteLLM registry.
 *
 * Returns undefined only when the registry has not loaded yet; once loaded,
 * a missing model resolves to an empty capability list.
 */
export function getLiteLLMCapabilities(
  modelId: string,
  provider?: string
): ModelCapability[] | undefined {
  if (!registry) return undefined;

  const entry = findLiteLLMEntry(modelId, provider);
  if (!entry) return [];

  return capabilitiesFromMetadata({
    contextWindow: getEntryContextWindow(entry),
    inputModalities: entry.supported_modalities,
    outputModalities: entry.supported_output_modalities,
    mode: entry.mode,
    supportsFunctionCalling: entry.supports_function_calling || entry.supports_parallel_function_calling,
    supportsToolChoice: entry.supports_tool_choice,
    supportsVision: entry.supports_vision,
    supportsReasoning: entry.supports_reasoning,
    supportsPdfInput: entry.supports_pdf_input,
    maxPdfSizeMb: entry.max_pdf_size_mb,
    inputCostPerImage: entry.input_cost_per_image,
    outputCostPerImage: entry.output_cost_per_image,
    outputCostPerImageToken: entry.output_cost_per_image_token,
  });
}

function findLiteLLMEntry(modelId: string, provider?: string): LiteLLMEntry | undefined {
  if (!registry) return undefined;

  for (const key of getLookupKeys(modelId, provider)) {
    const entry = registry[key];
    if (entry) return entry;
  }

  return undefined;
}

function getEntryContextWindow(entry?: LiteLLMEntry): number | undefined {
  if (!entry) return undefined;
  return entry.max_input_tokens ?? entry.max_tokens;
}

function getLookupKeys(modelId: string, provider?: string): string[] {
  const keys: string[] = [];
  const normalized = modelId.replace(/:free$/, '');
  const add = (key?: string) => {
    if (key && !keys.includes(key)) keys.push(key);
  };

  add(modelId);
  add(normalized);

  if (provider) {
    const prefix = PROVIDER_PREFIX_MAP[provider];
    if (prefix) add(`${prefix}/${normalized}`);

    if (provider === 'minimax' && normalized.endsWith('-highspeed')) {
      add(`minimax/${normalized.replace(/-highspeed$/, '-lightning')}`);
    }
  }

  const slashIdx = normalized.indexOf('/');
  if (slashIdx !== -1) {
    const upstreamProvider = normalized.slice(0, slashIdx);
    const upstreamModelId = normalized.slice(slashIdx + 1);

    if (provider === 'openrouter') {
      add(`openrouter/${normalized}`);
    }

    if (upstreamProvider === 'openai' || upstreamProvider === 'anthropic') {
      add(upstreamModelId);
    } else if (upstreamProvider === 'google') {
      add(`gemini/${upstreamModelId}`);
    } else {
      add(normalized);
    }
  }

  return keys;
}
