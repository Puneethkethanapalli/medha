import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall } from '@/lib/streaming/stream';
import { buildOpenAIMessages } from '@/lib/attachments/multimodal';
import type { Message, Model } from '@/types';

const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';

// MiniMax doesn't have a public model list endpoint, so we hardcode available models
const MINIMAX_MODELS: Model[] = [
  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', provider: 'minimax' },
  { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed', provider: 'minimax' },
  { id: 'MiniMax-M1-80k', name: 'MiniMax M1 80K', provider: 'minimax' },
  { id: 'MiniMax-M1-40k', name: 'MiniMax M1 40K', provider: 'minimax' },
];

export class MiniMaxProvider implements AIProvider {
  id = 'minimax';
  name = 'MiniMax';

  stream(
    messages: Message[],
    config: StreamConfig,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    onToolCalls?: (toolCalls: AccumulatedToolCall[]) => void
  ) {
    const abortController = new AbortController();

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

    // MiniMax M1 always returns reasoning — can't disable server-side.
    // When thinking is off, swallow reasoning tokens client-side.
    const reasoningHandler = config.thinkingMode === 'off'
      ? () => {} // no-op
      : onReasoning;

    streamCompletion(
      {
        url: `${MINIMAX_BASE_URL}/chat/completions`,
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
      onToolCalls
    );

    return {
      abort: () => abortController.abort(),
      reasoningContent: '',
    };
  }

  async listModels(_apiKey: string): Promise<Model[]> {
    // MiniMax has no public model list endpoint; return hardcoded list
    return MINIMAX_MODELS;
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      // Send a minimal non-streaming request to validate the key
      const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'MiniMax-M1-40k',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      // 401/403 = bad key, anything else (200, 400 model error) = key is valid
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }
}
