import { fetch } from 'expo/fetch';
import type { AIProvider } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { Message, Model } from '@/types';

const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_COMPAT_BASE = `${GOOGLE_AI_BASE}/openai`;

export class GoogleAIProvider implements AIProvider {
  id = 'google-ai';
  name = 'Google AI';

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
        url: `${OPENAI_COMPAT_BASE}/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: abortController.signal,
      },
      onContent,
      onReasoning,
      onDone,
      onError
    );

    return {
      abort: () => abortController.abort(),
      reasoningContent: '',
    };
  }

  async listModels(apiKey: string): Promise<Model[]> {
    const response = await fetch(`${GOOGLE_AI_BASE}/models?key=${apiKey}&pageSize=100`);

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }

    const data = await response.json();
    return (data.models || [])
      .filter((m: any) => {
        // Only include models that support generateContent
        const methods: string[] = m.supportedGenerationMethods || [];
        return methods.includes('generateContent');
      })
      .map((m: any) => ({
        id: m.name?.replace('models/', '') || m.name,
        name: m.displayName || m.name?.replace('models/', '') || m.name,
        provider: 'google-ai',
      }));
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${GOOGLE_AI_BASE}/models?key=${apiKey}&pageSize=1`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
