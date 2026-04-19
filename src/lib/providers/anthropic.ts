import { fetch } from 'expo/fetch';
import type { AIProvider } from './types';
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

    // Anthropic uses its own message format: system is a top-level field, not in messages
    const requestMessages: { role: string; content: string }[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') continue; // handled separately
      requestMessages.push({ role: msg.role, content: msg.content });
    }

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

    // Anthropic uses a custom SSE format, so we parse it manually
    this._streamAnthropic(
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
      onError
    );

    return {
      abort: () => abortController.abort(),
      reasoningContent: '',
    };
  }

  private async _streamAnthropic(
    options: {
      url: string;
      headers: Record<string, string>;
      body: Record<string, unknown>;
      signal?: AbortSignal;
    },
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ) {
    let response: Response;
    try {
      response = await fetch(options.url, {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        onError(new Error('Request cancelled'));
      } else {
        onError(new Error(`Network error: ${err instanceof Error ? err.message : 'Unknown'}`));
      }
      return;
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = await response.text();
        try {
          const parsed = JSON.parse(errorBody);
          errorMessage = parsed.error?.message || parsed.error || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      onError(new Error(errorMessage));
      return;
    }

    const body = response.body;
    if (!body) {
      // Fallback: parse text
      try {
        const text = await response.text();
        this._parseAnthropicSSE(text, onContent, onReasoning);
        onDone();
      } catch (err) {
        onError(new Error(`Failed to read response: ${err instanceof Error ? err.message : 'Unknown'}`));
      }
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            this._handleAnthropicEvent(currentEvent, data, onContent, onReasoning);
            if (currentEvent === 'message_stop') {
              onDone();
              return;
            }
          }
        }
      }
      onDone();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        onError(new Error('Request cancelled'));
      } else {
        onError(new Error(`Stream error: ${err instanceof Error ? err.message : 'Unknown'}`));
      }
    }
  }

  private _parseAnthropicSSE(
    text: string,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void
  ) {
    const lines = text.split('\n');
    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        this._handleAnthropicEvent(currentEvent, data, onContent, onReasoning);
      }
    }
  }

  private _handleAnthropicEvent(
    event: string,
    data: string,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void
  ) {
    if (event !== 'content_block_delta') return;
    try {
      const parsed = JSON.parse(data);
      if (parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
        onContent(parsed.delta.text);
      }
      if (parsed.delta?.type === 'thinking_delta' && parsed.delta?.thinking) {
        onReasoning(parsed.delta.thinking);
      }
    } catch {
      // Ignore parse errors
    }
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
