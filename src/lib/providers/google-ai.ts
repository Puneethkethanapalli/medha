import { fetch } from 'expo/fetch';
import type { AIProvider, StreamConfig } from './types';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall } from '@/lib/streaming/stream';
import { buildOpenAIMessages } from '@/lib/attachments/multimodal';
import type { Message, Model } from '@/types';

const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_COMPAT_BASE = `${GOOGLE_AI_BASE}/openai`;

export class GoogleAIProvider implements AIProvider {
  id = 'google-ai';
  name = 'Google AI';

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

    // When web search is enabled, use native Gemini endpoint with google_search grounding
    // The OpenAI-compat endpoint doesn't support google_search
    const useNativeSearch = config.tools && config.tools.length > 0;

    if (useNativeSearch) {
      this._streamNative(messages, config, onContent, onReasoning, onDone, onError, abortController);
    } else {
      this._streamOpenAICompat(messages, config, onContent, onReasoning, onDone, onError, onToolCalls, abortController);
    }

    return {
      abort: () => abortController.abort(),
      reasoningContent: '',
    };
  }

  /**
   * Native Gemini endpoint with google_search grounding.
   * Uses streamGenerateContent with alt=sse for SSE streaming.
   * No tool call loop needed — search is handled server-side.
   */
  private _streamNative(
    messages: Message[],
    config: StreamConfig,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    abortController: AbortController
  ) {
    // Convert messages to native Gemini format
    const contents = buildGeminiNativeMessages(messages);

    const body: Record<string, unknown> = {
      contents,
      tools: [{ google_search: {} }],
    };

    // System instruction (native format)
    if (config.systemPrompt) {
      body.system_instruction = {
        parts: [{ text: config.systemPrompt }],
      };
    }

    // Generation config
    const generationConfig: Record<string, unknown> = {};
    if (config.temperature !== undefined) {
      generationConfig.temperature = config.temperature;
    }
    if (config.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = config.maxTokens;
    }

    // Thinking mode
    const isThinkingModel = /gemini-(2\.5|3)/.test(config.model);
    if (isThinkingModel) {
      if (config.thinkingMode === 'on') {
        generationConfig.thinkingConfig = { thinkingBudget: 8192 };
      } else if (config.thinkingMode === 'off') {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    // When thinking is off, swallow reasoning tokens silently
    const reasoningHandler = config.thinkingMode === 'off'
      ? () => {} // no-op
      : onReasoning;

    const url = `${GOOGLE_AI_BASE}/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

    streamCompletion(
      {
        url,
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortController.signal,
      },
      onContent,
      reasoningHandler,
      onDone,
      onError,
      'gemini-native'
    );
  }

  /**
   * OpenAI-compatible endpoint (default path).
   * Used for standard chat completions without native grounding.
   */
  private _streamOpenAICompat(
    messages: Message[],
    config: StreamConfig,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    onToolCalls: ((toolCalls: AccumulatedToolCall[]) => void) | undefined,
    abortController: AbortController
  ) {
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

    // Thinking mode — only for thinking-capable models (Gemini 2.5+, 3.x)
    const isThinkingModel = /gemini-(2\.5|3)/.test(config.model);
    if (isThinkingModel) {
      if (config.thinkingMode === 'on') {
        body.reasoning_effort = 'high';
      } else if (config.thinkingMode === 'off') {
        body.reasoning_effort = 'none';
      }
    }

    // When thinking is off, swallow reasoning tokens silently
    const reasoningHandler = config.thinkingMode === 'off'
      ? () => {} // no-op
      : onReasoning;

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
      reasoningHandler,
      onDone,
      onError,
      'openai',
      onToolCalls
    );
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

// ── Native Gemini message format helpers ────────────────────────────────

interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/**
 * Convert Message[] to Gemini native contents format.
 * Gemini uses 'model' instead of 'assistant', and doesn't support 'system' as a content role.
 * Tool-role messages are folded into user turns.
 */
function buildGeminiNativeMessages(messages: Message[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    // Skip system messages — handled via system_instruction parameter
    if (msg.role === 'system') continue;

    // Map roles
    let role: 'user' | 'model';
    if (msg.role === 'assistant') {
      role = 'model';
    } else if (msg.role === 'tool') {
      // Tool results go as user messages in Gemini native format
      role = 'user';
    } else {
      role = 'user';
    }

    // Build text content with inline attachments
    let textContent = msg.content;
    const docAttachments = (msg.attachments || []).filter((a) => a.type === 'document');
    for (const doc of docAttachments) {
      textContent += `\n\n--- Attached file: ${doc.name} ---`;
    }

    contents.push({
      role,
      parts: [{ text: textContent }],
    });
  }

  return contents;
}
