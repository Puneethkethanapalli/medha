import { getCachedModels, setCachedModels } from '@/lib/storage/mmkv';
import type { Model } from '@/types';

const CACHE_VERSION = 1;
/** Cached lists older than this are refreshed in the background when the picker opens. */
export const MODEL_LIST_TTL_MS = 6 * 60 * 60 * 1000;
export const MODEL_LIST_FAILURE_COOLDOWN_MS = 90 * 1000;

interface ProviderModelCacheEntry {
  models?: Model[];
  fetchedAt?: number;
  failedAt?: number;
  error?: string;
}

interface ModelListCachePayload {
  version: number;
  providers: Record<string, ProviderModelCacheEntry>;
}

export interface CachedModelList {
  models: Model[] | null;
  fetchedAt: number | null;
  failedAt: number | null;
  error: string | null;
}

let memoryCache: Record<string, ProviderModelCacheEntry> | null = null;
let readPromise: Promise<Record<string, ProviderModelCacheEntry>> | null = null;
let writePromise: Promise<void> = Promise.resolve();

export async function getCachedModelList(providerId: string): Promise<CachedModelList | null> {
  const cache = await readModelListCache();
  const entry = cache[providerId];
  if (!entry) return null;

  const models = Array.isArray(entry.models) ? sanitizeModelList(entry.models, providerId) : [];
  return {
    models: models.length > 0 && entry.fetchedAt ? models : null,
    fetchedAt: entry.fetchedAt ?? null,
    failedAt: entry.failedAt ?? null,
    error: entry.error ?? null,
  };
}

export async function cacheModelList(providerId: string, models: Model[]): Promise<void> {
  await updateModelListCache((cache) => {
    cache[providerId] = {
      models,
      fetchedAt: Date.now(),
    };
  });
}

export async function cacheModelListFailure(providerId: string, error: unknown): Promise<void> {
  await updateModelListCache((cache) => {
    cache[providerId] = {
      ...cache[providerId],
      failedAt: Date.now(),
      error: getErrorMessage(error),
    };
  });
}

export async function clearCachedModelList(providerId: string): Promise<void> {
  await updateModelListCache((cache) => {
    delete cache[providerId];
  });
}

/**
 * Drop malformed entries and duplicate IDs. Duplicate keys make virtualized
 * lists recycle the wrong rows, so every list is deduped before it is shown.
 */
export function sanitizeModelList(models: readonly Model[], providerId: string): Model[] {
  const seen = new Set<string>();
  const result: Model[] = [];

  for (const model of models) {
    if (!model || typeof model.id !== 'string' || !model.id || seen.has(model.id)) continue;
    seen.add(model.id);

    const name = typeof model.name === 'string' ? model.name.trim() : '';
    result.push({
      ...model,
      name: name || model.id,
      provider: model.provider || providerId,
    });
  }

  return result;
}

async function readModelListCache(): Promise<Record<string, ProviderModelCacheEntry>> {
  if (memoryCache) return memoryCache;
  if (readPromise) return readPromise;

  readPromise = (async () => {
    try {
      const cached = await getCachedModels();
      if (!cached) {
        memoryCache = {};
        return memoryCache;
      }

      const parsed = JSON.parse(cached) as Partial<ModelListCachePayload> | Record<string, ProviderModelCacheEntry>;
      const providers =
        isPayload(parsed) ? parsed.providers : normalizeLegacyCache(parsed);

      memoryCache = providers;
      return providers;
    } catch {
      memoryCache = {};
      return memoryCache;
    } finally {
      readPromise = null;
    }
  })();

  return readPromise;
}

async function updateModelListCache(
  updater: (cache: Record<string, ProviderModelCacheEntry>) => void
): Promise<void> {
  const cache = { ...(await readModelListCache()) };
  updater(cache);
  memoryCache = cache;

  writePromise = writePromise
    .catch(() => {})
    .then(() => setCachedModels(JSON.stringify({ version: CACHE_VERSION, providers: cache })))
    .catch(() => {});
  await writePromise;
}

function isPayload(value: unknown): value is ModelListCachePayload {
  const providers = (value as { providers?: unknown } | null)?.providers;
  return (
    typeof value === 'object' &&
    value !== null &&
    'providers' in value &&
    typeof providers === 'object' &&
    providers !== null &&
    !Array.isArray(providers)
  );
}

function normalizeLegacyCache(value: unknown): Record<string, ProviderModelCacheEntry> {
  if (!value || typeof value !== 'object') return {};

  const normalized: Record<string, ProviderModelCacheEntry> = {};
  for (const [providerId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object') continue;
    const maybeEntry = entry as ProviderModelCacheEntry;
    if (Array.isArray(maybeEntry.models)) {
      normalized[providerId] = maybeEntry;
    }
  }
  return normalized;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Could not refresh models';
}
