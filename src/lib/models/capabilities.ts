import type { ModelCapability } from '@/types';
import { getLiteLLMCapabilities, getLiteLLMContextWindow } from '@/lib/models/litellm-registry';
import { getLocalModelCapabilities, getLocalModelContextWindow } from '@/lib/models/local-metadata';
import { sortCapabilities } from '@/lib/models/capability-metadata';

// ── Dynamic model metadata cache (populated from provider API responses) ─────
const dynamicMetadataCache = new Map<string, { contextWindow?: number; capabilities?: ModelCapability[] }>();

/**
 * Register metadata for models fetched from a provider API.
 * Called from ModelPicker after listModels() returns.
 */
export function registerModelsMetadata(models: import('@/types').Model[]): void {
  for (const model of models) {
    if (model.contextWindow || model.capabilities) {
      const cacheKey = getMetadataKey(model.id, model.provider);
      dynamicMetadataCache.set(cacheKey, {
        contextWindow: model.contextWindow,
        capabilities: model.capabilities,
      });
      capabilityCache.delete(cacheKey);
    }
  }
}

const capabilityCache = new Map<string, ModelCapability[]>();

export function getModelCapabilities(modelId: string, provider: string): ModelCapability[] {
  const cacheKey = getMetadataKey(modelId, provider);
  if (capabilityCache.has(cacheKey)) {
    return capabilityCache.get(cacheKey)!;
  }

  // 1. Check dynamic metadata cache (API-provided)
  const dynamic = dynamicMetadataCache.get(cacheKey);
  const dynamicCapabilities = dynamic?.capabilities ?? [];

  // 2. Local metadata for providers whose current catalogs outpace LiteLLM.
  const localCapabilities = getLocalModelCapabilities(modelId, provider) ?? [];

  // 3. LiteLLM community registry fallback (fetched from GitHub, cached locally)
  const litellmCapabilities = getLiteLLMCapabilities(modelId, provider);
  const capabilities = sortCapabilities([
    ...dynamicCapabilities,
    ...localCapabilities,
    ...(litellmCapabilities ?? []),
  ]);

  // Do not cache a registry miss before LiteLLM has loaded; the same call can
  // become more informative once the async registry fetch completes.
  if (litellmCapabilities !== undefined) {
    capabilityCache.set(cacheKey, capabilities);
  }

  return capabilities;
}

export function getModelContextWindow(modelId: string, provider?: string): number | undefined {
  // 1. Dynamic cache (populated from provider API responses — most accurate)
  const dynamic = provider ? dynamicMetadataCache.get(getMetadataKey(modelId, provider)) : undefined;
  if (dynamic?.contextWindow) return dynamic.contextWindow;

  // 2. Local metadata for providers whose current catalogs outpace LiteLLM.
  const localContextWindow = getLocalModelContextWindow(modelId, provider);
  if (localContextWindow) return localContextWindow;

  // 3. LiteLLM community registry (fetched from GitHub, cached locally)
  return getLiteLLMContextWindow(modelId, provider);
}

function getMetadataKey(modelId: string, provider: string): string {
  return `${provider}:${modelId}`;
}

export function hasCapability(
  modelId: string,
  provider: string,
  capability: ModelCapability
): boolean {
  return getModelCapabilities(modelId, provider).includes(capability);
}

export function getCapabilityLabel(cap: ModelCapability): string {
  const labels: Record<ModelCapability, string> = {
    vision: 'Vision',
    'image-gen': 'Image Generation',
    pdf: 'PDF',
    tools: 'Tools',
    thinking: 'Thinking',
    'long-context': 'Long Context',
  };
  return labels[cap];
}

export function getPremiumCapabilities(caps: ModelCapability[]): ModelCapability[] {
  // Only show "premium" capabilities in top bar — skip common ones like tools
  const premiumSet = new Set<ModelCapability>(['vision', 'thinking', 'image-gen']);
  return caps.filter((c) => premiumSet.has(c));
}
