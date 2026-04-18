export interface TokenContent {
  content?: string;
  reasoning?: string;
}

export type SSELine =
  | { type: 'event'; id?: string; event?: string; data: string }
  | { type: 'done' }
  | { type: 'comment'; value: string };

export class SSEParser {
  private buffer: string = '';

  /**
   * Parse a raw text chunk into SSE events.
   * Handles partial lines by buffering until newline is found.
   */
  parse(chunk: string): SSELine[] {
    const events: SSELine[] = [];
    this.buffer += chunk;

    // Split by any newline style
    const lines = this.buffer.split(/\r\n|\r|\n/g);
    // Keep the last (potentially incomplete) line as buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const parsed = this.parseLine(line);
      if (parsed) {
        events.push(parsed);
        if (parsed.type === 'done') return events;
      }
    }

    return events;
  }

  private parseLine(line: string): SSELine | null {
    // Empty line — end of event
    if (line === '') {
      return null;
    }

    // Comment line (starts with :)
    if (line.startsWith(':')) {
      return { type: 'comment', value: line.slice(1).trim() };
    }

    // Must have a colon to be a field
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return null;

    const field = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1).trim();

    if (field === 'event') {
      return { type: 'event', event: value, data: '' };
    }

    if (field === 'id') {
      return { type: 'event', id: value, data: '' };
    }

    if (field === 'data') {
      return { type: 'event', data: value };
    }

    // Unknown field — ignore
    return null;
  }

  flush(): SSELine[] {
    const events: SSELine[] = [];
    if (this.buffer.trim()) {
      const parsed = this.parseLine(this.buffer);
      if (parsed) events.push(parsed);
    }
    this.buffer = '';
    return events;
  }
}

/**
 * Extract content and reasoning from an SSE data event.
 * Handles OpenAI, OpenRouter reasoning models, and Anthropic formats.
 */
export function extractContentFromEvent(data: string): TokenContent | null {
  try {
    const parsed = JSON.parse(data);
    const result: TokenContent = {};

    // OpenRouter/Google reasoning models: reasoning_details array
    const reasoningDetails = parsed.choices?.[0]?.delta?.reasoning_details;
    if (reasoningDetails && Array.isArray(reasoningDetails)) {
      for (const detail of reasoningDetails) {
        if (detail.type === 'reasoning.text' && detail.text) {
          result.reasoning = (result.reasoning || '') + detail.text;
        } else if (detail.type === 'reasoning.summary' && detail.summary) {
          // Summary - could append or replace
          result.reasoning = (result.reasoning || '') + detail.summary;
        }
        // Encrypted reasoning - skip for now
      }
    }

    // OpenAI format: choices[0].delta.content
    if (parsed.choices?.[0]?.delta?.content) {
      result.content = parsed.choices[0].delta.content;
    }

    // OpenAI format: choices[0].delta.reasoning (for older models)
    if (parsed.choices?.[0]?.delta?.reasoning) {
      result.reasoning = parsed.choices[0].delta.reasoning;
    }

    // Anthropic format: content_block_delta
    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
      result.content = parsed.delta.text;
    }

    // Anthropic streaming format
    if (parsed.choices?.[0]?.delta?.type === 'content_block_delta') {
      result.content = parsed.choices[0].delta.text ?? undefined;
    }

    // Return null if nothing found
    if (!result.content && !result.reasoning) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}