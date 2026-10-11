import { create } from 'zustand';
import { getApiKey } from '@/lib/storage/secure';
import { getProvider, listProviders, registerBuiltInProviders } from '@/lib/providers/registry';
import { registerModelsMetadata } from '@/lib/models/capabilities';
import { isLiteLLMRegistryLoaded, loadLiteLLMRegistry } from '@/lib/models/litellm-registry';
import {
  MODEL_LIST_FAILURE_COOLDOWN_MS,
  MODEL_LIST_TTL_MS,
  cacheModelList,
  cacheModelListFailure,
  clearCachedModelList,
  getCachedModelList,
  sanitizeModelList,
  type CachedModelList,
} from '@/lib/models/model-list-cache';
import type { Model } from '@/types';

const MODEL_LIST_TIMEOUT_MS = 20 * 1000;

export type ModelListStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ProviderModelList {
  models: Model[] | null;
  fetchedAt: number | null;
  failedAt: number | null;
  /** Status of the most recent network refresh in this session. */
  status: ModelListStatus;
  error: string | null;
  /** True once the persisted cache has been read for this provider. */
  hydrated: boolean;
}

export const EMPTY_MODEL_LIST: ProviderModelList = {
  models: null,
  fetchedAt: null,
  failedAt: null,
  status: 'idle',
  error: null,
  hydrated: false,
};

interface ModelListState {
  lists: Record<string, ProviderModelList>;
  /** Bumped whenever capability / context-window metadata may have changed. */
  metadataVersion: number;
}

/**
 * Single source of truth for provider model lists. Startup warm-up, key saves
 * and the model picker all write here, so an open picker updates live when a
 * background fetch lands instead of showing whatever it read on open.
 */
export const useModelListStore = create<ModelListState>(() => ({
  lists: {},
  metadataVersion: 0,
}));

export function useProviderModelList(providerId: string | null): ProviderModelList {
  return useModelListStore((state) => (providerId && state.lists[providerId]) || EMPTY_MODEL_LIST);
}

const cacheReads = new Map<string, Promise<CachedModelList | null>>();
const inflight = new Map<string, Promise<Model[]>>();
// Bumped on every new request and on clear; stale responses are dropped.
const requestIds = new Map<string, number>();
// Bumped on clear so an in-progress cache read can't resurrect a removed list.
const epochs = new Map<string, number>();
let metadataLoad: Promise<void> | null = null;

function getEntry(providerId: string): ProviderModelList {
  return useModelListStore.getState().lists[providerId] ?? EMPTY_MODEL_LIST;
}

function patchEntry(providerId: string, patch: Partial<ProviderModelList>, bumpMetadata = false) {
  useModelListStore.setState((state) => ({
    lists: {
      ...state.lists,
      [providerId]: { ...(state.lists[providerId] ?? EMPTY_MODEL_LIST), ...patch },
    },
    metadataVersion: bumpMetadata ? state.metadataVersion + 1 : state.metadataVersion,
  }));
}

/** Load the LiteLLM fallback registry once and notify metadata subscribers. */
export function loadModelMetadata(): Promise<void> {
  if (isLiteLLMRegistryLoaded()) return Promise.resolve();

  metadataLoad ??= loadLiteLLMRegistry()
    .catch(() => {})
    .then(() => {
      metadataLoad = null;
      if (isLiteLLMRegistryLoaded()) {
        useModelListStore.setState((state) => ({ metadataVersion: state.metadataVersion + 1 }));
      }
    });
  return metadataLoad;
}

/**
 * Make sure a provider's list is available: hydrate from cache (registering its
 * metadata), then fetch in the background when the list is missing — or stale,
 * if `refreshIfStale`.
 */
export async function ensureProviderModelList(
  providerId: string,
  { refreshIfStale = true }: { refreshIfStale?: boolean } = {}
): Promise<void> {
  const epoch = epochs.get(providerId) ?? 0;
  let cacheRead = cacheReads.get(providerId);
  if (!cacheRead) {
    cacheRead = getCachedModelList(providerId).catch(() => null);
    cacheReads.set(providerId, cacheRead);
  }
  const cached = await cacheRead;
  if ((epochs.get(providerId) ?? 0) !== epoch) return;

  // Hydrate and start the fetch in the same tick so the UI never renders the
  // in-between "hydrated, empty, idle" state.
  applyCachedModelList(providerId, cached);
  if (shouldRefresh(getEntry(providerId), refreshIfStale)) {
    void refreshProviderModelList(providerId).catch(() => {});
  }
}

/**
 * Fetch a provider's model list. Concurrent calls share one request unless an
 * explicit API key is passed (a key was just saved), which supersedes it.
 */
export function refreshProviderModelList(
  providerId: string,
  options: { apiKey?: string | null } = {}
): Promise<Model[]> {
  const pending = inflight.get(providerId);
  if (pending && !options.apiKey) return pending;

  const requestId = (requestIds.get(providerId) ?? 0) + 1;
  requestIds.set(providerId, requestId);
  patchEntry(providerId, { status: 'loading', error: null });

  const request = fetchModelList(providerId, requestId, options.apiKey);
  inflight.set(providerId, request);
  request
    .finally(() => {
      if (inflight.get(providerId) === request) inflight.delete(providerId);
    })
    .catch(() => {});

  return request;
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

/** Startup warm-up: hydrate every provider's metadata and fetch lists that were never cached. */
export async function warmMissingModelListCaches(providerIds: string[]): Promise<void> {
  await Promise.all(
    providerIds.map((providerId) => ensureProviderModelList(providerId, { refreshIfStale: false }))
  );
}

/** Forget a provider's list everywhere (used when its key changes or is removed). */
export async function clearProviderModelList(providerId: string): Promise<void> {
  requestIds.set(providerId, (requestIds.get(providerId) ?? 0) + 1);
  epochs.set(providerId, (epochs.get(providerId) ?? 0) + 1);
  inflight.delete(providerId);
  cacheReads.delete(providerId);
  useModelListStore.setState((state) => {
    if (!(providerId in state.lists)) return state;
    const lists = { ...state.lists };
    delete lists[providerId];
    return { lists };
  });
  await clearCachedModelList(providerId);
}

async function fetchModelList(
  providerId: string,
  requestId: number,
  explicitApiKey?: string | null
): Promise<Model[]> {
  const isCurrent = () => requestIds.get(providerId) === requestId;

  try {
    const provider = getProviderInstance(providerId);
    if (!provider) {
      throw new Error('Provider is not available.');
    }

    const apiKey = explicitApiKey ?? (await getApiKey(providerId));
    if (!apiKey) {
      throw new Error('API key is not configured.');
    }

    const fetched = await withTimeout(
      (signal) => provider.listModels(apiKey, { signal }),
      MODEL_LIST_TIMEOUT_MS
    );
    const models = sanitizeModelList(fetched, providerId);
    if (models.length === 0) {
      throw new Error('Provider returned no models.');
    }
    if (!isCurrent()) return models;

    registerModelsMetadata(models);
    patchEntry(
      providerId,
      {
        models,
        fetchedAt: Date.now(),
        failedAt: null,
        status: 'ready',
        error: null,
        hydrated: true,
      },
      true
    );
    await cacheModelList(providerId, models);
    return models;
  } catch (error) {
    if (isCurrent()) {
      patchEntry(providerId, {
        status: 'error',
        error: getErrorMessage(error),
        failedAt: Date.now(),
      });
      await cacheModelListFailure(providerId, error);
    }
    throw error;
  }
}

function applyCachedModelList(providerId: string, cached: CachedModelList | null) {
  const current = getEntry(providerId);
  // Already hydrated, or a network refresh finished first with newer data.
  if (current.hydrated) return;

  if (cached?.models) registerModelsMetadata(cached.models);
  patchEntry(
    providerId,
    {
      hydrated: true,
      models: cached?.models ?? null,
      fetchedAt: cached?.fetchedAt ?? null,
      failedAt: current.failedAt ?? cached?.failedAt ?? null,
    },
    Boolean(cached?.models)
  );
}

function shouldRefresh(entry: ProviderModelList, refreshIfStale: boolean): boolean {
  if (entry.status === 'loading') return false;

  const now = Date.now();
  if (entry.failedAt && now - entry.failedAt < MODEL_LIST_FAILURE_COOLDOWN_MS) {
    return false;
  }

  if (!entry.models?.length) return true;
  return refreshIfStale && (!entry.fetchedAt || now - entry.fetchedAt > MODEL_LIST_TTL_MS);
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Timed out while loading models.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Could not refresh models.';
}

function getProviderInstance(providerId: string) {
  if (listProviders().length === 0) {
    registerBuiltInProviders();
  }
  return getProvider(providerId);
}
