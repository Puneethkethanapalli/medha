import type { ModelCapability } from '@/types';
import { capabilitiesFromMetadata, type CapabilityMetadata } from '@/lib/models/capability-metadata';

type LocalMetadata = CapabilityMetadata & {
  aliases?: string[];
};

const MINIMAX_M2_METADATA: LocalMetadata = {
  contextWindow: 204_800,
  supportsFunctionCalling: true,
  supportsToolChoice: true,
  supportsReasoning: true,
};

const LOCAL_METADATA: Record<string, Record<string, LocalMetadata>> = {
  minimax: {
    'MiniMax-M2.7': MINIMAX_M2_METADATA,
    'MiniMax-M2.7-highspeed': MINIMAX_M2_METADATA,
    'MiniMax-M2.5': MINIMAX_M2_METADATA,
    'MiniMax-M2.5-highspeed': {
      ...MINIMAX_M2_METADATA,
      aliases: ['MiniMax-M2.5-lightning'],
    },
    'MiniMax-M2.1': MINIMAX_M2_METADATA,
    'MiniMax-M2.1-highspeed': {
      ...MINIMAX_M2_METADATA,
      aliases: ['MiniMax-M2.1-lightning'],
    },
    'MiniMax-M2': MINIMAX_M2_METADATA,
  },
  'cloudflare-ai': {
    '@cf/openai/gpt-oss-120b': {
      contextWindow: 128_000,
      supportsFunctionCalling: true,
      supportsToolChoice: true,
      supportsReasoning: true,
    },
    '@cf/openai/gpt-oss-20b': {
      contextWindow: 128_000,
      supportsFunctionCalling: true,
      supportsToolChoice: true,
      supportsReasoning: true,
    },
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
      contextWindow: 24_000,
      supportsFunctionCalling: true,
      supportsToolChoice: true,
    },
    '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': {
      contextWindow: 80_000,
      supportsReasoning: true,
    },
    '@cf/qwen/qwq-32b': {
      contextWindow: 24_000,
      supportsReasoning: true,
    },
    '@cf/meta/llama-3.2-3b-instruct': {
      contextWindow: 80_000,
    },
    '@cf/meta/llama-3.2-1b-instruct': {
      contextWindow: 60_000,
    },
    '@hf/mistral/mistral-7b-instruct-v0.2': {
      contextWindow: 3_072,
      aliases: ['@cf/mistral/mistral-7b-instruct-v0.2'],
    },
    '@hf/google/gemma-7b-it': {
      contextWindow: 8_192,
      aliases: ['@cf/google/gemma-7b-it'],
    },
  },
};

export function getLocalModelCapabilities(
  modelId: string,
  provider?: string
): ModelCapability[] | undefined {
  const metadata = findLocalMetadata(modelId, provider);
  return metadata ? capabilitiesFromMetadata(metadata) : undefined;
}

export function getLocalModelContextWindow(
  modelId: string,
  provider?: string
): number | undefined {
  return findLocalMetadata(modelId, provider)?.contextWindow;
}

function findLocalMetadata(modelId: string, provider?: string): LocalMetadata | undefined {
  const providers = provider ? [provider] : Object.keys(LOCAL_METADATA);
  const normalized = modelId.replace(/:free$/, '');

  for (const providerId of providers) {
    const providerMetadata = LOCAL_METADATA[providerId];
    if (!providerMetadata) continue;

    const direct = providerMetadata[modelId] ?? providerMetadata[normalized];
    if (direct) return direct;

    for (const metadata of Object.values(providerMetadata)) {
      if (metadata.aliases?.includes(normalized)) return metadata;
    }
  }

  return undefined;
}
