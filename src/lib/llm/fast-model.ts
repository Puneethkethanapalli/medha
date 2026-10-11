/**
 * Pick a fast, cheap model for background work on the user's current provider.
 */

import { getCachedModelList } from '@/lib/models/model-list-cache';

/**
 * Candidates tried in order. One is used only when it appears in the
 * provider's cached model list; otherwise the chat model is used, which is
 * guaranteed to work with the user's key.
 */
const FAST_MODEL_CANDIDATES: Record<string, string[]> = {
  openrouter: [
    'google/gemini-2.5-flash-lite',
    'openai/gpt-4.1-mini',
    'google/gemini-2.5-flash',
    'openai/gpt-4o-mini',
    'anthropic/claude-haiku-4.5',
  ],
  openai: ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
  'openai-codex': ['gpt-5.4-mini', 'gpt-5.1-codex-mini'],
  anthropic: ['claude-haiku-5-5', 'claude-haiku-4-5', 'claude-3-5-haiku-latest'],
  'google-ai': ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

export async function pickFastModel(providerId: string, chatModel: string): Promise<string> {
  const candidates = FAST_MODEL_CANDIDATES[providerId];
  if (!candidates) return chatModel;

  try {
    const cached = await getCachedModelList(providerId);
    const available = new Set((cached?.models ?? []).map((model) => model.id));
    return candidates.find((candidate) => available.has(candidate)) ?? chatModel;
  } catch {
    return chatModel;
  }
}
