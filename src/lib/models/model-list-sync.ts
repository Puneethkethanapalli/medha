import { getApiKey } from '@/lib/storage/secure';
import { getProvider, listProviders, registerBuiltInProviders } from '@/lib/providers/registry';
import type { ListModelsOptions } from '@/lib/providers/types';
import { registerModelsMetadata } from '@/lib/models/capabilities';
import {
  cacheModelList,
  cacheModelListFailure,
  shouldRefreshModelList,
} from '@/lib/models/model-list-cache';
import type { Model } from '@/types';

interface RefreshProviderModelListOptions extends ListModelsOptions {
  apiKey?: string | null;
}

export async function refreshProviderModelList(
  providerId: string,
  options: RefreshProviderModelListOptions = {}
): Promise<Model[]> {
  const provider = getProviderInstance(providerId);
  if (!provider) {
    throw new Error('Provider is not available.');
  }

  const apiKey = options.apiKey ?? (await getApiKey(providerId));
  if (!apiKey) {
    throw new Error('API key is not configured.');
  }

  try {
    const models = await provider.listModels(apiKey, { signal: options.signal });
    if (models.length === 0) {
      throw new Error('Provider returned no models.');
    }

    registerModelsMetadata(models);
    await cacheModelList(providerId, models);
    return models;
  } catch (error) {
    if (!options.signal?.aborted) {
      await cacheModelListFailure(providerId, error);
    }
    throw error;
  }
}

export async function warmProviderModelListCache(
  providerId: string,
  apiKey?: string | null
): Promise<void> {
  try {
    await refreshProviderModelList(providerId, { apiKey });
  } catch {
    // Key saves should succeed even if provider model discovery is temporarily down.
  }
}

export async function warmMissingModelListCaches(providerIds: string[]): Promise<void> {
  const providerIdsToWarm = (
    await Promise.all(
      providerIds.map(async (providerId) => (
        await shouldRefreshModelList(providerId) ? providerId : null
      ))
    )
  ).filter((providerId): providerId is string => providerId !== null);

  await Promise.all(
    providerIdsToWarm.map((providerId) => warmProviderModelListCache(providerId))
  );
}

function getProviderInstance(providerId: string) {
  if (listProviders().length === 0) {
    registerBuiltInProviders();
  }
  return getProvider(providerId);
}
