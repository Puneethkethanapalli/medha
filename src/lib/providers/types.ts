import type { Message } from '@/types';
import type { OpenAIToolSchema } from '@/lib/tools/types';
import type { AccumulatedToolCall } from '@/lib/streaming/stream';

export type ThinkingMode = 'auto' | 'on' | 'off';

export interface StreamConfig {
  model: string;
  apiKey: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingMode?: ThinkingMode;
  /** Tool schemas to send with the request (OpenAI format) */
  tools?: OpenAIToolSchema[];
  /** Anthropic-format tool schemas (set by Anthropic provider internally) */
  anthropicTools?: { name: string; description: string; input_schema: Record<string, unknown> }[];
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
    onError: (error: Error) => void,
    onToolCalls?: (toolCalls: AccumulatedToolCall[]) => void
  ): ReasoningStreamResponse;
  listModels(apiKey: string): Promise<import('@/types').Model[]>;
  validateKey(apiKey: string): Promise<boolean>;
}