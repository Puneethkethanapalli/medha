import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
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

// Anthropic doesn't have a public model list endpoint
const ANTHROPIC_MODELS: Model[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', provider: 'anthropic' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },
];

export class AnthropicProvider implements AIProvider {
  id = 'anthropic';
  name = 'Anthropic';

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

    // Native web search — uses Anthropic's built-in server-side search
    // Claude decides when to search, results come as text with citations
    if (config.anthropicTools && config.anthropicTools.length > 0) {
      body.tools = [{ name: 'web_search', type: 'web_search_20260209' }];
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

  async listModels(_apiKey: string): Promise<Model[]> {
    return ANTHROPIC_MODELS;
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
