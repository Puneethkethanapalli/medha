import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildOpenAIMessages } from '@/lib/attachments/multimodal';
import { capabilitiesFromMetadata } from '@/lib/models/capability-metadata';
import type { Message } from '@/types';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements AIProvider {
  id = 'openrouter';
  name = 'OpenRouter';

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

    // Thinking mode: explicitly request reasoning from thinking-capable models
    if (config.thinkingMode === 'on') {
      body.reasoning = { effort: 'high' };
    }

    // Tool schemas (OpenAI format) — tool calls go through the standard
    // tool-call loop with Tavily for consistent cross-provider behavior.
    if (config.tools && config.tools.length > 0) {
      body.tools = config.tools;
    }

    // When thinking is off, swallow reasoning tokens silently
    const reasoningHandler = config.thinkingMode === 'off'
      ? () => {} // no-op
      : onReasoning;

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
      reasoningHandler,
      onDone,
      onError,
      'openai',
      onToolCalls,
      onUsage
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
    return (data.data || []).map((m: Record<string, unknown>) => {
      const contextWindow = typeof m.context_length === 'number' ? m.context_length : undefined;
      const architecture = isRecord(m.architecture) ? m.architecture : undefined;

      return {
        id: m.id as string,
        name: (m.name as string) || (m.id as string),
        provider: 'openrouter',
        pricing: parsePricing(m.pricing),
        contextWindow,
        capabilities: capabilitiesFromMetadata({
          contextWindow,
          inputModalities: toStringArray(architecture?.input_modalities),
          outputModalities: toStringArray(architecture?.output_modalities),
          supportedParameters: toStringArray(m.supported_parameters),
        }),
      };
    });
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

function parsePricing(pricing: unknown) {
  if (!pricing) {
    return undefined;
  }

  if (Array.isArray(pricing)) {
    return {
      prompt: Number(pricing[0] ?? 0),
      completion: Number(pricing[1] ?? 0),
    };
  }

  if (typeof pricing === 'object') {
    const value = pricing as { prompt?: unknown; completion?: unknown };
    return {
      prompt: Number(value.prompt ?? 0),
      completion: Number(value.completion ?? 0),
    };
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}
