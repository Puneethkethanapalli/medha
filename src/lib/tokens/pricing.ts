/**
 * Model pricing data — static map for known models + runtime fallback
 * from OpenRouter's Model.pricing field.
 *
 * Prices are in USD per 1 million tokens.
 * Source: Official pricing pages as of April 2026.
 */

export interface ModelPricing {
  promptPer1M: number;      // USD per 1M input tokens
  completionPer1M: number;  // USD per 1M output tokens
}

/**
 * Static pricing for popular models.
 * Keys are model ID prefixes — matched via startsWith.
 */
const PRICING_MAP: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-5.5': { promptPer1M: 5, completionPer1M: 30 },
  'gpt-5.4': { promptPer1M: 2.5, completionPer1M: 15 },
  'gpt-5.4-mini': { promptPer1M: 0.75, completionPer1M: 4.5 },
  'gpt-5.4-nano': { promptPer1M: 0.2, completionPer1M: 1.25 },
  'gpt-5.3-chat-latest': { promptPer1M: 1.75, completionPer1M: 14 },
  'gpt-5.3-codex': { promptPer1M: 1.75, completionPer1M: 14 },
  'gpt-5.2-codex': { promptPer1M: 1.75, completionPer1M: 14 },
  'gpt-5.1': { promptPer1M: 1.25, completionPer1M: 10 },
  'gpt-5.1-codex-max': { promptPer1M: 1.25, completionPer1M: 10 },
  'gpt-5.1-codex-mini': { promptPer1M: 0.25, completionPer1M: 2 },
  'gpt-5.1-codex': { promptPer1M: 1.25, completionPer1M: 10 },
  'gpt-5': { promptPer1M: 1.25, completionPer1M: 10 },
  'gpt-5-nano': { promptPer1M: 0.05, completionPer1M: 0.4 },
  'gpt-4o': { promptPer1M: 2.5, completionPer1M: 10 },
  'gpt-4o-mini': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'gpt-4-turbo': { promptPer1M: 10, completionPer1M: 30 },
  'o1': { promptPer1M: 15, completionPer1M: 60 },
  'o1-mini': { promptPer1M: 3, completionPer1M: 12 },
  'o3': { promptPer1M: 10, completionPer1M: 40 },
  'o3-mini': { promptPer1M: 1.1, completionPer1M: 4.4 },
  'o4-mini': { promptPer1M: 1.1, completionPer1M: 4.4 },

  // OpenRouter (OpenAI via OpenRouter)
  'openai/gpt-5.5': { promptPer1M: 5, completionPer1M: 30 },
  'openai/gpt-5.4': { promptPer1M: 2.5, completionPer1M: 15 },
  'openai/gpt-5.4-mini': { promptPer1M: 0.75, completionPer1M: 4.5 },
  'openai/gpt-5.4-nano': { promptPer1M: 0.2, completionPer1M: 1.25 },
  'openai/gpt-5.3-chat-latest': { promptPer1M: 1.75, completionPer1M: 14 },
  'openai/gpt-5.1': { promptPer1M: 1.25, completionPer1M: 10 },
  'openai/gpt-5': { promptPer1M: 1.25, completionPer1M: 10 },
  'openai/gpt-4o': { promptPer1M: 2.5, completionPer1M: 10 },
  'openai/gpt-4o-mini': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'openai/o1': { promptPer1M: 15, completionPer1M: 60 },
  'openai/o3': { promptPer1M: 10, completionPer1M: 40 },
  'openai/o3-mini': { promptPer1M: 1.1, completionPer1M: 4.4 },
  'openai/o4-mini': { promptPer1M: 1.1, completionPer1M: 4.4 },

  // Anthropic
  'claude-sonnet-4': { promptPer1M: 3, completionPer1M: 15 },
  'claude-3-7-sonnet': { promptPer1M: 3, completionPer1M: 15 },
  'claude-3-5-sonnet': { promptPer1M: 3, completionPer1M: 15 },
  'claude-3-5-haiku': { promptPer1M: 0.8, completionPer1M: 4 },
  'claude-3-haiku': { promptPer1M: 0.25, completionPer1M: 1.25 },
  'claude-3-opus': { promptPer1M: 15, completionPer1M: 75 },

  // Anthropic via OpenRouter
  'anthropic/claude-sonnet-4': { promptPer1M: 3, completionPer1M: 15 },
  'anthropic/claude-3.7-sonnet': { promptPer1M: 3, completionPer1M: 15 },
  'anthropic/claude-3.5-sonnet': { promptPer1M: 3, completionPer1M: 15 },
  'anthropic/claude-3.5-haiku': { promptPer1M: 0.8, completionPer1M: 4 },
  'anthropic/claude-3-opus': { promptPer1M: 15, completionPer1M: 75 },

  // Google
  'gemini-2.0-flash': { promptPer1M: 0.1, completionPer1M: 0.4 },
  'gemini-2.5-flash': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'gemini-2.5-pro': { promptPer1M: 1.25, completionPer1M: 10 },
  'gemini-1.5-flash': { promptPer1M: 0.075, completionPer1M: 0.3 },
  'gemini-1.5-pro': { promptPer1M: 1.25, completionPer1M: 5 },

  // Google via OpenRouter
  'google/gemini-2.0-flash': { promptPer1M: 0.1, completionPer1M: 0.4 },
  'google/gemini-2.5-flash': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'google/gemini-2.5-pro': { promptPer1M: 1.25, completionPer1M: 10 },

  // DeepSeek
  'deepseek/deepseek-r1': { promptPer1M: 0.55, completionPer1M: 2.19 },
  'deepseek/deepseek-chat': { promptPer1M: 0.27, completionPer1M: 1.1 },

  // MiniMax
  'MiniMax-M1': { promptPer1M: 0.2, completionPer1M: 1.1 },

  // Meta (via OpenRouter)
  'meta-llama/llama-4-maverick': { promptPer1M: 0.2, completionPer1M: 0.6 },
  'meta-llama/llama-4-scout': { promptPer1M: 0.15, completionPer1M: 0.4 },
};

// Sorted longest-first for greedy prefix matching
const PRICING_KEYS = Object.keys(PRICING_MAP).sort((a, b) => b.length - a.length);

/**
 * Get pricing for a model ID.
 * Tries exact match first, then prefix match (handles version suffixes like -20250514).
 * Returns null for unknown/free models.
 */
export function getModelPricing(modelId: string): ModelPricing | null {
  // Exact match
  if (PRICING_MAP[modelId]) return PRICING_MAP[modelId];

  // Prefix match — handles versioned IDs like "claude-sonnet-4-20250514"
  for (const key of PRICING_KEYS) {
    if (modelId.startsWith(key)) return PRICING_MAP[key];
  }

  // Free models (OpenRouter :free suffix)
  if (modelId.endsWith(':free')) {
    return { promptPer1M: 0, completionPer1M: 0 };
  }

  return null;
}

/**
 * Calculate cost in USD for a given token usage.
 * Returns null if pricing is unknown.
 */
export function calculateCost(
  promptTokens: number,
  completionTokens: number,
  modelId: string,
): number | null {
  const pricing = getModelPricing(modelId);
  if (!pricing) return null;

  const promptCost = (promptTokens / 1_000_000) * pricing.promptPer1M;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionPer1M;
  return promptCost + completionCost;
}

/**
 * Format a USD cost for display.
 * - $0.00 for zero/free
 * - <$0.01 for sub-cent amounts
 * - $X.XXX for normal amounts
 */
export function formatCost(costUsd: number | null): string {
  if (costUsd === null) return '';
  if (costUsd === 0) return '$0.00';
  if (costUsd < 0.01) return '<$0.01';
  if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}
