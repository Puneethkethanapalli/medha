import type { AIProvider } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { Message } from '@/types';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements AIProvider {
  id = 'openrouter';
  name = 'OpenRouter';

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

    // Build messages array
    const requestMessages: { role: string; content: string }[] = [];
    if (config.systemPrompt) {
      requestMessages.push({ role: 'system', content: config.systemPrompt });
    }
    for (const msg of messages) {
      requestMessages.push({ role: msg.role, content: msg.content });
    }

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

    streamCompletion(
      {
        url: `${OPENROUTER_BASE_URL}/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://medha.app',
          'X-Title': 'Medha',
        },
        body,
        signal: abortController.signal,
      },
      onContent,
      onReasoning,
      onDone,
      onError
    );

    let reasoningContent = '';

    return {
      abort: () => abortController.abort(),
      reasoningContent,
    };
  }

  async listModels(apiKey: string): Promise<import('@/types').Model[]> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://medha.app',
        'X-Title': 'Medha',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }

    const data = await response.json();
    return (data.data || []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      name: (m.name as string) || (m.id as string),
      provider: 'openrouter',
      pricing: m.pricing ? { prompt: m.pricing[0], completion: m.pricing[1] } : undefined,
    }));
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://medha.app',
          'X-Title': 'Medha',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}