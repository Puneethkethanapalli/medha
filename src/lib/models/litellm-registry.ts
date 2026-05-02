/**
 * LiteLLM Model Registry — community-maintained model metadata.
 *
 * Fetches model_prices_and_context_window.json from GitHub on first use,
 * caches it in AsyncStorage, and serves as a fallback for providers whose
 * APIs don't return context window info (OpenAI, MiniMax, OpenAI Codex).
 *
 * Source: https://github.com/BerriAI/litellm
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  'cloudflare-ai': '',     // Not in LiteLLM typically
  openrouter: 'openrouter', // LiteLLM keys: "openrouter/..." (but OpenRouter has its own API)
};

type LiteLLMEntry = {
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  litellm_provider?: string;
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
  if (!registry) return undefined;

  // 1. Try exact model ID (works for OpenAI, Anthropic)
  const direct = registry[modelId];
  if (direct?.max_input_tokens) return direct.max_input_tokens;

  // 2. Try with provider prefix
  if (provider) {
    const prefix = PROVIDER_PREFIX_MAP[provider];
    if (prefix) {
      const prefixed = `${prefix}/${modelId}`;
      const entry = registry[prefixed];
      if (entry?.max_input_tokens) return entry.max_input_tokens;
    }
  }

  // 3. Fallback: try max_tokens if max_input_tokens isn't set
  if (direct?.max_tokens) return direct.max_tokens;

  return undefined;
}
