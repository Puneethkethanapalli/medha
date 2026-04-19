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
 * Tracks whether we're inside a thinking block across streaming chunks.
 * Google AI (Gemini 2.5) sends reasoning wrapped in tags like:
 *   <think>...</think>  or  <thought>...</thought>
 * inside delta.content, potentially split across multiple chunks.
 */
let _insideThinkTag = false;
let _thinkBuffer = '';
let _activeCloseTag = '';  // The closing tag we're looking for

// All tag variants Gemini models may use for thinking
const THINK_OPEN_TAGS = ['<thought>', '<think>', '<Thought>', '<Think>'];
const THINK_CLOSE_MAP: Record<string, string> = {
  '<thought>': '</thought>',
  '<think>': '</think>',
  '<Thought>': '</Thought>',
  '<Think>': '</Think>',
};

export function resetThinkTagState(): void {
  _insideThinkTag = false;
  _thinkBuffer = '';
  _activeCloseTag = '';
}

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
          result.reasoning = (result.reasoning || '') + detail.summary;
        }
      }
    }

    // MiniMax format: choices[0].delta.reasoning_content
    if (parsed.choices?.[0]?.delta?.reasoning_content) {
      result.reasoning = (result.reasoning || '') + parsed.choices[0].delta.reasoning_content;
    }

    // OpenAI format: choices[0].delta.reasoning (for older models)
    if (parsed.choices?.[0]?.delta?.reasoning) {
      result.reasoning = (result.reasoning || '') + parsed.choices[0].delta.reasoning;
    }

    // OpenAI format: choices[0].delta.content
    const rawContent = parsed.choices?.[0]?.delta?.content;
    if (rawContent) {
      // Google AI (Gemini 2.5) wraps thinking in <thought>/</thought> or <think>/<think> tags
      // We need to separate these into reasoning vs content
      const separated = separateThinkTags(rawContent);
      if (separated.reasoning) {
        result.reasoning = (result.reasoning || '') + separated.reasoning;
      }
      if (separated.content) {
        result.content = (result.content || '') + separated.content;
      }
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

/**
 * Separates thinking tags from content in a streaming-safe way.
 * Handles <thought>...</thought> and <think>...</think> (any casing variant).
 * Tags may be split across multiple streaming chunks.
 */
function separateThinkTags(text: string): { content?: string; reasoning?: string } {
  let reasoning = '';
  let content = '';
  let remaining = text;

  while (remaining.length > 0) {
    if (_insideThinkTag) {
      // Look for the matching closing tag
      const closeIdx = remaining.indexOf(_activeCloseTag);
      if (closeIdx !== -1) {
        reasoning += _thinkBuffer + remaining.slice(0, closeIdx);
        _thinkBuffer = '';
        _insideThinkTag = false;
        remaining = remaining.slice(closeIdx + _activeCloseTag.length);
        _activeCloseTag = '';
      } else {
        // Still inside think block, buffer it all
        _thinkBuffer += remaining;
        remaining = '';
      }
    } else {
      // Find the earliest opening tag
      let bestIdx = -1;
      let bestTag = '';
      for (const openTag of THINK_OPEN_TAGS) {
        const idx = remaining.indexOf(openTag);
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
          bestIdx = idx;
          bestTag = openTag;
        }
      }

      if (bestIdx !== -1) {
        // Everything before the tag is content
        content += remaining.slice(0, bestIdx);
        _insideThinkTag = true;
        _thinkBuffer = '';
        _activeCloseTag = THINK_CLOSE_MAP[bestTag];
        remaining = remaining.slice(bestIdx + bestTag.length);
      } else {
        // Check for partial tag at end of chunk (e.g., "<thou" at boundary)
        const partialLen = findPartialOpenTagAtEnd(remaining);
        if (partialLen > 0) {
          content += remaining.slice(0, remaining.length - partialLen);
          // Don't commit partial yet — just hold it in buffer for next chunk
          _thinkBuffer = remaining.slice(remaining.length - partialLen);
          remaining = '';
        } else {
          content += remaining;
          remaining = '';
        }
      }
    }
  }

  return {
    reasoning: reasoning || undefined,
    content: content || undefined,
  };
}

/**
 * Check if the end of text matches a partial prefix of any opening think tag.
 * Returns the length of the longest partial match, or 0 if none.
 */
function findPartialOpenTagAtEnd(text: string): number {
  let longest = 0;
  for (const tag of THINK_OPEN_TAGS) {
    for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
      if (text.endsWith(tag.slice(0, len)) && len > longest) {
        longest = len;
      }
    }
  }
  return longest;
}