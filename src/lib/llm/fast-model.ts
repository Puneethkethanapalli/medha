/**
 * Pick a fast, cheap model for background work on the user's current provider.
 */

import { getCachedModelList } from '@/lib/models/model-list-cache';
import { getProviderInfo } from '@/lib/providers/catalog';

/**
 * Candidates (the catalog's `fastModels`) are tried in order. One is used only
 * when it appears in the provider's cached model list; otherwise the chat
 * model is used, which is guaranteed to work with the user's key.
 */
export async function pickFastModel(providerId: string, chatModel: string): Promise<string> {
  const candidates = getProviderInfo(providerId)?.fastModels;
  if (!candidates) return chatModel;

  try {
    const cached = await getCachedModelList(providerId);
    const available = new Set((cached?.models ?? []).map((model) => model.id));
    return candidates.find((candidate) => available.has(candidate)) ?? chatModel;
  } catch {
    return chatModel;
  }
}
