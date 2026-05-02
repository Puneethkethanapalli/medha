import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildOpenAIMessages } from '@/lib/attachments/multimodal';
import { capabilitiesFromMetadata } from '@/lib/models/capability-metadata';
import type { Message, Model } from '@/types';

const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';
const MINIMAX_CONTEXT_WINDOW = 204_800;
const MINIMAX_CAPABILITIES = capabilitiesFromMetadata({
  contextWindow: MINIMAX_CONTEXT_WINDOW,
  supportsFunctionCalling: true,
  supportsToolChoice: true,
  supportsReasoning: true,
});

function minimaxModel(id: string, name: string): Model {
  return {
    id,
    name,
    provider: 'minimax',
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    capabilities: MINIMAX_CAPABILITIES,
  };
}

// MiniMax doesn't have a public model list endpoint, so we hardcode available models
export const MINIMAX_MODELS: Model[] = [
  minimaxModel('MiniMax-M2.7', 'MiniMax M2.7'),
  minimaxModel('MiniMax-M2.7-highspeed', 'MiniMax M2.7 Highspeed'),
  minimaxModel('MiniMax-M2.5', 'MiniMax M2.5'),
  minimaxModel('MiniMax-M2.5-highspeed', 'MiniMax M2.5 Highspeed'),
  minimaxModel('MiniMax-M2.1', 'MiniMax M2.1'),
  minimaxModel('MiniMax-M2.1-highspeed', 'MiniMax M2.1 Highspeed'),
  minimaxModel('MiniMax-M2', 'MiniMax M2'),
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
    onToolCalls?: (toolCalls: AccumulatedToolCall[]) => void,
    onUsage?: (usage: UsageData) => void
  ) {
    const abortController = new AbortController();

    // Build messages array (handles multimodal attachments)
    const requestMessages = buildOpenAIMessages(messages, config.systemPrompt);

    const body: Record<string, unknown> = {
      model: config.model,
      messages: requestMessages,
      stream: true,
      stream_options: { include_usage: true },
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

    // MiniMax reasoning cannot be disabled server-side on reasoning models.
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
      onToolCalls,
      onUsage
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
          model: 'MiniMax-M2.7',
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
