import { fetch } from 'expo/fetch';
import type { AIProvider, ListModelsOptions, StreamConfig } from './types';
import { PROVIDER_CATALOG } from './catalog';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildAnthropicMessages } from '@/lib/attachments/multimodal';
import type { Message, Model } from '@/types';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

// Models that support extended thinking
const THINKING_CAPABLE_MODELS = [
  'claude-3-7-sonnet',
  'claude-sonnet-4',
];

function isThinkingCapable(model: string): boolean {
  return THINKING_CAPABLE_MODELS.some(prefix => model.startsWith(prefix));
}

export class AnthropicProvider implements AIProvider {
  id = 'anthropic';
  name = PROVIDER_CATALOG.anthropic.displayName;

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

    // Build messages array (handles multimodal attachments, excludes system)
    const requestMessages = buildAnthropicMessages(messages);

    const body: Record<string, unknown> = {
      model: config.model,
      messages: requestMessages,
      stream: true,
      max_tokens: config.maxTokens || 4096,
    };

    if (config.systemPrompt) {
      body.system = config.systemPrompt;
    }
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }

    // Thinking mode for thinking-capable models (Claude 3.7 Sonnet, Claude Sonnet 4)
    if (config.thinkingMode === 'on' && isThinkingCapable(config.model)) {
      body.thinking = { type: 'enabled', budget_tokens: 8192 };
      // Anthropic requires temperature = 1.0 when thinking is enabled
      body.temperature = 1.0;
      // Ensure max_tokens is high enough to accommodate thinking + response
      if ((body.max_tokens as number) < 16384) {
        body.max_tokens = 16384;
      }
    }

    // Tool schemas (Anthropic format) — tool calls go through the standard
    // tool-call loop with Tavily for consistent cross-provider behavior.
    if (config.anthropicTools && config.anthropicTools.length > 0) {
      body.tools = config.anthropicTools;
    }

    // When thinking is off, swallow reasoning tokens silently
    const reasoningHandler = config.thinkingMode === 'off'
      ? () => {} // no-op
      : onReasoning;

    streamCompletion(
      {
        url: `${ANTHROPIC_BASE_URL}/messages`,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body,
        signal: abortController.signal,
      },
      onContent,
      reasoningHandler,
      onDone,
      onError,
      'anthropic',
      onToolCalls,
      onUsage
    );

    return {
      abort: () => abortController.abort(),
      reasoningContent: '',
    };
  }

  async listModels(apiKey: string, options?: ListModelsOptions): Promise<Model[]> {
    try {
      const response = await fetch(`${ANTHROPIC_BASE_URL}/models?limit=100`, {
        signal: options?.signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
      });

      if (!response.ok) throw new Error(`Failed to list models: ${response.status}`);

      const data = await response.json();
      const models: any[] = data.data || [];
      if (models.length === 0) throw new Error('Anthropic returned no models.');

      return models.map((m: any) => ({
        id: m.id as string,
        name: (m.display_name || m.id) as string,
        provider: 'anthropic',
        contextWindow: typeof m.max_input_tokens === 'number' ? m.max_input_tokens : undefined,
      }));
    } catch (error) {
      if (options?.signal?.aborted) throw error;
      throw error;
    }
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      // Send a minimal request to validate the key
      const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }
}
