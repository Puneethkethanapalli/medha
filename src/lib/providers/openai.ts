import { fetch } from 'expo/fetch';
import type { AIProvider, ListModelsOptions, StreamConfig } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildOpenAIMessages, type OpenAIMessage } from '@/lib/attachments/multimodal';
import type { Message, Model } from '@/types';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class OpenAIProvider implements AIProvider {
  id = 'openai';
  name = 'OpenAI';

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
    const requestMessages = normalizeMessagesForModel(
      buildOpenAIMessages(messages, config.systemPrompt),
      config.model
    );

    const body: Record<string, unknown> = {
      model: config.model,
      messages: requestMessages,
      stream: true,
      stream_options: { include_usage: true },
      store: false,
    };

    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }
    if (config.maxTokens !== undefined) {
      body.max_completion_tokens = config.maxTokens;
    }
    if (config.tools && config.tools.length > 0) {
      body.tools = config.tools;
    }

    if (supportsReasoningEffort(config.model)) {
      if (config.thinkingMode === 'on') {
        body.reasoning_effort = 'high';
      } else if (config.thinkingMode === 'off' && supportsNoReasoning(config.model)) {
        body.reasoning_effort = 'none';
      }
    }

    const reasoningHandler = config.thinkingMode === 'off'
      ? () => {}
      : onReasoning;

    streamCompletion(
      {
        url: `${OPENAI_BASE_URL}/chat/completions`,
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

  async listModels(apiKey: string, options?: ListModelsOptions): Promise<Model[]> {
    try {
      const response = await fetch(`${OPENAI_BASE_URL}/models`, {
        signal: options?.signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) throw new Error(`Failed to list models: ${response.status}`);

      const data = await response.json();
      const modelIds = ((data.data || []) as { id?: unknown }[])
        .map((m) => (typeof m.id === 'string' ? m.id : null))
        .filter((id): id is string => Boolean(id))
        .filter(isChatModel)
        .sort(compareModelIds);

      if (modelIds.length === 0) throw new Error('OpenAI returned no chat models.');

      return modelIds.map((id) => ({
        id,
        name: formatModelName(id),
        provider: 'openai',
      }));
    } catch (error) {
      if (options?.signal?.aborted) throw error;
      throw error;
    }
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${OPENAI_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

function normalizeMessagesForModel(messages: OpenAIMessage[], model: string): OpenAIMessage[] {
  if (!usesDeveloperMessages(model)) return messages;
  return messages.map((message) => (
    message.role === 'system'
      ? { ...message, role: 'developer' }
      : message
  ));
}

function usesDeveloperMessages(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.startsWith('o') || normalized.startsWith('gpt-5');
}

function supportsReasoningEffort(model: string): boolean {
  const normalized = model.toLowerCase();
  if (normalized.includes('chat-latest')) return false;
  return normalized.startsWith('o') || normalized.startsWith('gpt-5');
}

function supportsNoReasoning(model: string): boolean {
  const normalized = model.toLowerCase();
  if (normalized.includes('chat-latest')) return false;
  return normalized.startsWith('gpt-5.1')
    || normalized.startsWith('gpt-5.2')
    || normalized.startsWith('gpt-5.3')
    || normalized.startsWith('gpt-5.4')
    || normalized.startsWith('gpt-5.5');
}

function isChatModel(id: string): boolean {
  const normalized = id.toLowerCase();
  const excluded = [
    'audio',
    'dall-e',
    'embedding',
    'image',
    'moderation',
    'realtime',
    'search',
    'tts',
    'transcribe',
    'translation',
    'whisper',
  ];

  if (excluded.some((part) => normalized.includes(part))) return false;

  return normalized.startsWith('gpt-5')
    || normalized.startsWith('gpt-4')
    || normalized.startsWith('o1')
    || normalized.startsWith('o3')
    || normalized.startsWith('o4');
}

function compareModelIds(a: string, b: string): number {
  return modelRank(a) - modelRank(b) || a.localeCompare(b);
}

function modelRank(id: string): number {
  const normalized = id.toLowerCase();
  const order = [
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.3',
    'gpt-5.2',
    'gpt-5.1',
    'gpt-5',
    'gpt-4.1',
    'gpt-4o',
    'o4',
    'o3',
    'o1',
    'gpt-4',
  ];
  const index = order.findIndex((prefix) => normalized.startsWith(prefix));
  return index === -1 ? order.length : index;
}

function formatModelName(id: string): string {
  return id
    .replace(/-/g, ' ')
    .replace(/\bchat latest\b/i, 'Chat')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bGpt\b/g, 'GPT')
    .replace(/\bO([134])\b/g, 'o$1');
}
