import { fetch } from 'expo/fetch';
import type { AIProvider } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import { buildAnthropicMessages } from '@/lib/attachments/multimodal';
import type { Message, Model } from '@/types';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

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
    config: {
      model: string;
      apiKey: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    },
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
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
      onReasoning,
      onDone,
      onError,
      'anthropic',
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
