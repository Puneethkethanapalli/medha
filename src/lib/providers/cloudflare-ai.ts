import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildOpenAIMessages } from '@/lib/attachments/multimodal';
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

// Fallback model list — used when the API call fails (network error, missing account ID, etc.)
const FALLBACK_MODELS: Model[] = [
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B', provider: 'cloudflare-ai' },
  { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', provider: 'cloudflare-ai' },
  { id: '@cf/meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'cloudflare-ai' },
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B', provider: 'cloudflare-ai' },
  { id: '@cf/meta/llama-3.2-1b-instruct', name: 'Llama 3.2 1B', provider: 'cloudflare-ai' },
  { id: '@cf/mistral/mistral-7b-instruct-v0.2', name: 'Mistral 7B v0.2', provider: 'cloudflare-ai' },
  { id: '@cf/google/gemma-7b-it', name: 'Gemma 7B', provider: 'cloudflare-ai' },
  { id: '@cf/qwen/qwen1.5-14b-chat-awq', name: 'Qwen 1.5 14B', provider: 'cloudflare-ai' },
  { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill 32B', provider: 'cloudflare-ai' },
  { id: '@cf/openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'cloudflare-ai' },
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

    // No thinking mode — Cloudflare models don't support extended thinking.
    // Swallow any stray reasoning tokens just in case.
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
    if (!accountId) return FALLBACK_MODELS;

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=Text%20Generation`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      if (!response.ok) return FALLBACK_MODELS;

      const data = await response.json();
      const models: any[] = data.result || [];

      if (models.length === 0) return FALLBACK_MODELS;

      return models
        .filter((m: any) => m.name && !m.properties?.deprecated)
        .map((m: any) => {
          const ctxLen = m.properties?.max_total_tokens ?? m.properties?.context_length;
          return {
            id: m.name as string,
            name: (m.description || m.name) as string,
            provider: 'cloudflare-ai',
            contextWindow: typeof ctxLen === 'number' ? ctxLen : undefined,
          };
        });
    } catch {
      return FALLBACK_MODELS;
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
