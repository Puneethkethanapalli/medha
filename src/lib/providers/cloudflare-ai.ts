import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildOpenAIMessages } from '@/lib/attachments/multimodal';
import { capabilitiesFromMetadata } from '@/lib/models/capability-metadata';
import type { Message, Model } from '@/types';

/**
 * Cloudflare Workers AI — OpenAI-compatible provider.
 *
 * Uses the REST API at:
 *   https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions
 *
 * Auth: Bearer token (Cloudflare API Token with "Workers AI: Read" permission).
 * The Account ID is stored separately via MMKV (not a secret).
 *
 * Free tier: 10,000 neurons/day. Resets at 00:00 UTC.
 */

function getBaseUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
}

type CloudflareModelMetadata = {
  contextWindow?: number;
  inputModalities?: string[];
  outputModalities?: string[];
  supportsFunctionCalling?: boolean;
  supportsToolChoice?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsPdfInput?: boolean;
};

function cloudflareModel(id: string, name: string, metadata: CloudflareModelMetadata = {}): Model {
  return {
    id,
    name,
    provider: 'cloudflare-ai',
    contextWindow: metadata.contextWindow,
    capabilities: capabilitiesFromMetadata(metadata),
  };
}

// Fallback model list — used when the API call fails (network error, missing account ID, etc.)
export const CLOUDFLARE_FALLBACK_MODELS: Model[] = [
  cloudflareModel('@cf/openai/gpt-oss-120b', 'GPT-OSS 120B', {
    contextWindow: 128_000,
    supportsFunctionCalling: true,
    supportsToolChoice: true,
    supportsReasoning: true,
  }),
  cloudflareModel('@cf/openai/gpt-oss-20b', 'GPT-OSS 20B', {
    contextWindow: 128_000,
    supportsFunctionCalling: true,
    supportsToolChoice: true,
    supportsReasoning: true,
  }),
  cloudflareModel('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'Llama 3.3 70B', {
    contextWindow: 24_000,
    supportsFunctionCalling: true,
    supportsToolChoice: true,
  }),
  cloudflareModel('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', 'DeepSeek R1 Distill 32B', {
    contextWindow: 80_000,
    supportsReasoning: true,
  }),
  cloudflareModel('@cf/qwen/qwq-32b', 'QwQ 32B', {
    contextWindow: 24_000,
    supportsReasoning: true,
  }),
  cloudflareModel('@cf/meta/llama-3.2-3b-instruct', 'Llama 3.2 3B', {
    contextWindow: 80_000,
  }),
  cloudflareModel('@cf/meta/llama-3.2-1b-instruct', 'Llama 3.2 1B', {
    contextWindow: 60_000,
  }),
  cloudflareModel('@hf/mistral/mistral-7b-instruct-v0.2', 'Mistral 7B v0.2', {
    contextWindow: 3_072,
  }),
  cloudflareModel('@hf/google/gemma-7b-it', 'Gemma 7B', {
    contextWindow: 8_192,
  }),
];

/** Read the Cloudflare Account ID from MMKV storage. */
function getAccountId(): string | null {
  try {
    const { getCloudflareAccountIdSync } = require('@/lib/storage/mmkv');
    return getCloudflareAccountIdSync();
  } catch {
    return null;
  }
}

export class CloudflareAIProvider implements AIProvider {
  id = 'cloudflare-ai';
  name = 'Cloudflare AI';

  stream(
    messages: Message[],
    config: StreamConfig,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    onToolCalls?: (toolCalls: AccumulatedToolCall[]) => void,
    onUsage?: (usage: UsageData) => void
  ) {
    const abortController = new AbortController();

    const accountId = getAccountId();
    if (!accountId) {
      setTimeout(() => onError(new Error('Cloudflare Account ID is not configured. Go to Settings → API Keys to set it.')), 0);
      return { abort: () => {}, reasoningContent: '' };
    }

    // Build messages array (handles multimodal attachments)
    const requestMessages = buildOpenAIMessages(messages, config.systemPrompt);

    const body: Record<string, unknown> = {
      model: config.model,
      messages: requestMessages,
      stream: true,
    };

    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }
    if (config.maxTokens !== undefined) {
      body.max_tokens = config.maxTokens;
    }

    // Tool schemas (OpenAI format)
    if (config.tools && config.tools.length > 0) {
      body.tools = config.tools;
    }

    // Cloudflare exposes mixed model capabilities and no global thinking switch.
    // When thinking is off, swallow reasoning tokens client-side.
    const reasoningHandler = config.thinkingMode === 'off'
      ? () => {}
      : onReasoning;

    streamCompletion(
      {
        url: `${getBaseUrl(accountId)}/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: abortController.signal,
      },
      onContent,
      reasoningHandler,
      onDone,
      onError,
      'openai',
      onToolCalls,
      onUsage
    );

    return {
      abort: () => abortController.abort(),
      reasoningContent: '',
    };
  }

  async listModels(apiKey: string): Promise<Model[]> {
    const accountId = getAccountId();
    if (!accountId) return CLOUDFLARE_FALLBACK_MODELS;

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=Text%20Generation`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      if (!response.ok) return CLOUDFLARE_FALLBACK_MODELS;

      const data = await response.json();
      const models: any[] = Array.isArray(data.result) ? data.result : [];

      if (models.length === 0) return CLOUDFLARE_FALLBACK_MODELS;

      return models
        .filter((m: any) => {
          const properties = isRecord(m.properties) ? m.properties : {};
          return getModelId(m) && properties.deprecated !== true;
        })
        .map((m: any) => {
          const properties = isRecord(m.properties) ? m.properties : {};
          const ctxLen =
            properties.max_total_tokens ??
            properties.context_length ??
            properties.context_window ??
            m.max_total_tokens ??
            m.context_length ??
            m.context_window;
          const contextWindow = toNumber(ctxLen);
          const textToSearch = [
            m.name,
            m.id,
            m.description,
            properties.description,
            properties.capabilities,
            properties.tags,
          ]
            .flat()
            .filter((value) => typeof value === 'string')
            .join(' ')
            .toLowerCase();
          return {
            id: getModelId(m)!,
            name: (m.description || m.name || m.id) as string,
            provider: 'cloudflare-ai',
            contextWindow,
            capabilities: capabilitiesFromMetadata({
              contextWindow,
              inputModalities: toStringArray(properties.input_modalities ?? properties.supported_modalities),
              outputModalities: toStringArray(properties.output_modalities ?? properties.supported_output_modalities),
              supportsFunctionCalling:
                properties.supports_function_calling === true || textToSearch.includes('function calling'),
              supportsToolChoice: properties.supports_tool_choice === true,
              supportsVision: properties.supports_vision === true || textToSearch.includes('vision'),
              supportsReasoning: properties.supports_reasoning === true || textToSearch.includes('reasoning'),
              supportsPdfInput: properties.supports_pdf_input === true,
            }),
          };
        });
    } catch {
      return CLOUDFLARE_FALLBACK_MODELS;
    }
  }

  async validateKey(apiKey: string): Promise<boolean> {
    const accountId = getAccountId();
    if (!accountId) return false;

    try {
      // Send a minimal non-streaming request to validate the key + account ID
      const response = await fetch(`${getBaseUrl(accountId)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: '@cf/meta/llama-3.2-1b-instruct',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      // 401/403 = bad key or account, anything else = valid
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getModelId(model: any): string | undefined {
  return typeof model?.name === 'string'
    ? model.name
    : typeof model?.id === 'string'
      ? model.id
      : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.replace(/,/g, '').trim();
  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) return parsed;

  const parsedFromText = Number(normalized.match(/\d+/)?.[0]);
  return Number.isFinite(parsedFromText) ? parsedFromText : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}
