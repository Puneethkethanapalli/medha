import type { Message } from '@/types';

export interface StreamConfig {
  model: string;
  apiKey: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamResponse {
  abort: () => void;
}

export interface ReasoningStreamResponse extends StreamResponse {
  reasoningContent: string;
}

export interface AIProvider {
  id: string;
  name: string;
  stream(
    messages: Message[],
    config: StreamConfig,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ): ReasoningStreamResponse;
  listModels(apiKey: string): Promise<import('@/types').Model[]>;
  validateKey(apiKey: string): Promise<boolean>;
}