/**
 * SSE Parser — WinterCG / WHATWG EventSource spec-compliant.
 *
 * An SSE event is a group of field lines ("event:", "data:", "id:", "retry:")
 * terminated by one or more blank lines. A single network chunk may contain
 * zero, one, or many events, and events may be split across chunks.
 *
 * This parser correctly buffers across chunk boundaries and dispatches
 * complete events only when a blank-line delimiter is seen.
 */

// ─── Public types ───────────────────────────────────────────────────────

export interface SSEEvent {
  /** The `event:` field value (defaults to 'message' per spec). */
  event: string;
  /** The concatenated `data:` field values, joined by '\n'. */
  data: string;
  /** The last `id:` field value, if any. */
  id?: string;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  arguments?: string;
}

export interface UsageData {
  promptTokens: number;
  completionTokens: number;
}

export interface TokenContent {
  content?: string;
  reasoning?: string;
  toolCalls?: ToolCallDelta[];
  usage?: UsageData;
}

// ─── SSEParser ──────────────────────────────────────────────────────────

export class SSEParser {
  private lineBuf = '';
  private eventType = '';
  private dataLines: string[] = [];
  private lastId: string | undefined;

  /**
   * Feed a raw text chunk. Returns fully-parsed SSE events.
   * Buffers incomplete lines internally.
   */
  feed(chunk: string): SSEEvent[] {
    const events: SSEEvent[] = [];
    this.lineBuf += chunk;

    // Split on any newline variant, keeping partial last line
    const lines = this.lineBuf.split(/\r\n|\r|\n/);
    this.lineBuf = lines.pop() ?? '';

    for (const line of lines) {
      if (line === '') {
        // Blank line → dispatch event if we have accumulated data
        this.dispatch(events);
      } else {
        this.processLine(line);
      }
    }

    return events;
  }

  /**
   * Flush any remaining buffered data (call on stream end).
   */
  flush(): SSEEvent[] {
    const events: SSEEvent[] = [];
    // Process any remaining partial line
    if (this.lineBuf.trim()) {
      this.processLine(this.lineBuf);
      this.lineBuf = '';
    }
    this.dispatch(events);
    return events;
  }

  private processLine(line: string): void {
    // Comment lines start with ':'
    if (line.startsWith(':')) return;

    const colonIdx = line.indexOf(':');
    let field: string;
    let value: string;

    if (colonIdx === -1) {
      // Line with no colon — field name with empty value
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIdx);
      // Spec: if the character after the colon is a space, skip it
      value = line[colonIdx + 1] === ' '
        ? line.slice(colonIdx + 2)
        : line.slice(colonIdx + 1);
    }

    switch (field) {
      case 'event':
        this.eventType = value;
        break;
      case 'data':
        this.dataLines.push(value);
        break;
      case 'id':
        // Spec: ignore ids containing null
        if (!value.includes('\0')) {
          this.lastId = value;
        }
        break;
      case 'retry':
        // We don't implement reconnection, skip
        break;
      // Unknown fields are ignored per spec
    }
  }

  private dispatch(out: SSEEvent[]): void {
    if (this.dataLines.length === 0) {
      // No data fields accumulated → reset and skip
      this.eventType = '';
      return;
    }

    const data = this.dataLines.join('\n');
    out.push({
      event: this.eventType || 'message',
      data,
      id: this.lastId,
    });

    // Reset per-event state (id persists across events per spec)
    this.eventType = '';
    this.dataLines = [];
  }
}

// ─── ThinkTag separator ─────────────────────────────────────────────────
//
// Google AI (Gemini 2.5) wraps reasoning in <think>/<thought> tags inside
// delta.content. These tags can be split across SSE chunks.
// State is per-instance so concurrent streams don't corrupt each other.

const THINK_OPEN_TAGS = ['<thought>', '<think>', '<Thought>', '<Think>'] as const;
const THINK_CLOSE_MAP: Record<string, string> = {
  '<thought>': '</thought>',
  '<think>': '</think>',
  '<Thought>': '</Thought>',
  '<Think>': '</Think>',
};

export class ThinkTagSeparator {
  private inside = false;
  private buffer = '';
  private closeTag = '';

  reset(): void {
    this.inside = false;
    this.buffer = '';
    this.closeTag = '';
  }

  /**
   * Splits raw content into reasoning (inside think tags) and content (outside).
   * Handles tags split across multiple chunks.
   */
  separate(text: string): { content?: string; reasoning?: string } {
    let reasoning = '';
    let content = '';
    let remaining = text;

    while (remaining.length > 0) {
      if (this.inside) {
        const closeIdx = remaining.indexOf(this.closeTag);
        if (closeIdx !== -1) {
          reasoning += this.buffer + remaining.slice(0, closeIdx);
          this.buffer = '';
          this.inside = false;
          remaining = remaining.slice(closeIdx + this.closeTag.length);
          this.closeTag = '';
        } else {
          // Still inside, buffer everything
          this.buffer += remaining;
          remaining = '';
        }
      } else {
        // Flush any non-tag buffer from a previous partial-tag false alarm
        if (this.buffer) {
          content += this.buffer;
          this.buffer = '';
        }

        // Find earliest opening tag
        let bestIdx = -1;
        let bestTag = '';
        for (const tag of THINK_OPEN_TAGS) {
          const idx = remaining.indexOf(tag);
          if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
            bestIdx = idx;
            bestTag = tag;
          }
        }

        if (bestIdx !== -1) {
          content += remaining.slice(0, bestIdx);
          this.inside = true;
          this.buffer = '';
          this.closeTag = THINK_CLOSE_MAP[bestTag];
          remaining = remaining.slice(bestIdx + bestTag.length);
        } else {
          // Check for partial tag at chunk boundary
          const partialLen = this.findPartialTagAtEnd(remaining);
          if (partialLen > 0) {
            content += remaining.slice(0, -partialLen);
            this.buffer = remaining.slice(-partialLen);
          } else {
            content += remaining;
          }
          remaining = '';
        }
      }
    }

    return {
      reasoning: reasoning || undefined,
      content: content || undefined,
    };
  }

  private findPartialTagAtEnd(text: string): number {
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
}

// ─── Content extraction ─────────────────────────────────────────────────

/**
 * Extract content/reasoning tokens from a parsed SSE data payload.
 * Handles: OpenAI, OpenRouter, Google AI, MiniMax, Anthropic (native format).
 *
 * @param data - The raw JSON string from a `data:` SSE field.
 * @param thinkSep - ThinkTagSeparator instance for this stream.
 */
export function extractTokens(
  data: string,
  thinkSep: ThinkTagSeparator,
): TokenContent | null {
  // Check for [DONE] sentinel before attempting JSON parse
  if (data === '[DONE]') return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null; // Malformed JSON — expected for partial frames
  }

  const result: TokenContent = {};

  // --- Reasoning extraction (multiple formats) ---

  // OpenRouter / Google: reasoning_details array
  const delta = (parsed.choices as any)?.[0]?.delta;
  if (delta?.reasoning_details && Array.isArray(delta.reasoning_details)) {
    for (const detail of delta.reasoning_details) {
      if (detail.type === 'reasoning.text' && detail.text) {
        result.reasoning = (result.reasoning || '') + detail.text;
      } else if (detail.type === 'reasoning.summary' && detail.summary) {
        result.reasoning = (result.reasoning || '') + detail.summary;
      }
    }
  }

  // MiniMax: delta.reasoning_content
  if (delta?.reasoning_content) {
    result.reasoning = (result.reasoning || '') + delta.reasoning_content;
  }

  // OpenAI older: delta.reasoning
  if (delta?.reasoning) {
    result.reasoning = (result.reasoning || '') + delta.reasoning;
  }

  // --- Content extraction ---

  // OpenAI-compatible: delta.content (used by OpenRouter, Google AI, MiniMax)
  const rawContent = delta?.content;
  if (rawContent && typeof rawContent === 'string') {
    const separated = thinkSep.separate(rawContent);
    if (separated.reasoning) {
      result.reasoning = (result.reasoning || '') + separated.reasoning;
    }
    if (separated.content) {
      result.content = (result.content || '') + separated.content;
    }
  }

  // --- Tool call extraction (OpenAI/OpenRouter/Google AI) ---
  if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
    const toolCalls: ToolCallDelta[] = [];
    for (const tc of delta.tool_calls) {
      toolCalls.push({
        index: tc.index ?? 0,
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments,
      });
    }
    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }
  }

  // Anthropic native: content_block_delta
  if (parsed.type === 'content_block_delta') {
    const adelta = parsed.delta as Record<string, unknown> | undefined;
    if (adelta?.type === 'text_delta' && adelta?.text) {
      result.content = (result.content || '') + (adelta.text as string);
    }
    if (adelta?.type === 'thinking_delta' && adelta?.thinking) {
      result.reasoning = (result.reasoning || '') + (adelta.thinking as string);
    }
    // Anthropic tool call arguments delta
    if (adelta?.type === 'input_json_delta' && adelta?.partial_json) {
      result.toolCalls = [{
        index: (parsed.index as number) ?? 0,
        arguments: adelta.partial_json as string,
      }];
    }
  }

  // Anthropic native: content_block_start with tool_use type
  if (parsed.type === 'content_block_start') {
    const block = parsed.content_block as Record<string, unknown> | undefined;
    if (block?.type === 'tool_use') {
      result.toolCalls = [{
        index: (parsed.index as number) ?? 0,
        id: block.id as string,
        name: block.name as string,
      }];
    }
  }

  // --- Usage extraction (OpenAI/OpenRouter: final chunk has usage object) ---
  const usage = parsed.usage as Record<string, unknown> | undefined;
  if (usage) {
    const prompt = Number(usage.prompt_tokens ?? 0);
    const completion = Number(usage.completion_tokens ?? 0);
    if (prompt > 0 || completion > 0) {
      result.usage = { promptTokens: prompt, completionTokens: completion };
    }
  }

  // Anthropic: message_start has input token usage
  if (parsed.type === 'message_start') {
    const msg = parsed.message as Record<string, unknown> | undefined;
    const msgUsage = msg?.usage as Record<string, unknown> | undefined;
    if (msgUsage) {
      const prompt = Number(msgUsage.input_tokens ?? 0);
      if (prompt > 0) {
        result.usage = { promptTokens: prompt, completionTokens: 0 };
      }
    }
  }

  // Anthropic: message_delta has output token usage
  if (parsed.type === 'message_delta') {
    const deltaUsage = (parsed as any).usage as Record<string, unknown> | undefined;
    if (deltaUsage) {
      const completion = Number(deltaUsage.output_tokens ?? 0);
      if (completion > 0) {
        result.usage = { promptTokens: 0, completionTokens: completion };
      }
    }
  }

  return (result.content || result.reasoning || result.toolCalls || result.usage) ? result : null;
}

/**
 * Extract tokens from native Gemini streamGenerateContent SSE chunks.
 * Format: { candidates: [{ content: { parts: [{ text }], role: 'model' } }] }
 *
 * Used when Google AI provider switches to native endpoint (e.g. for google_search grounding).
 */
export function extractGeminiNativeTokens(data: string): TokenContent | null {
  if (data === '[DONE]') return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  const result: TokenContent = {};

  const candidates = parsed.candidates as any[];
  if (!candidates || !candidates[0]) {
    // Even without candidates, the final chunk may have usageMetadata
    const usageMeta = parsed.usageMetadata as Record<string, unknown> | undefined;
    if (usageMeta) {
      const prompt = Number(usageMeta.promptTokenCount ?? 0);
      const completion = Number(usageMeta.candidatesTokenCount ?? 0);
      if (prompt > 0 || completion > 0) {
        result.usage = { promptTokens: prompt, completionTokens: completion };
        return result;
      }
    }
    return null;
  }

  const candidate = candidates[0];
  const parts = candidate.content?.parts as any[];
  if (parts) {
    for (const part of parts) {
      if (part.text && typeof part.text === 'string') {
        result.content = (result.content || '') + part.text;
      }
      // Thinking/reasoning in native format
      if (part.thought && typeof part.thought === 'string') {
        result.reasoning = (result.reasoning || '') + part.thought;
      }
    }
  }

  // Gemini native: usageMetadata in the final chunk
  const usageMeta = parsed.usageMetadata as Record<string, unknown> | undefined;
  if (usageMeta) {
    const prompt = Number(usageMeta.promptTokenCount ?? 0);
    const completion = Number(usageMeta.candidatesTokenCount ?? 0);
    if (prompt > 0 || completion > 0) {
      result.usage = { promptTokens: prompt, completionTokens: completion };
    }
  }

  return (result.content || result.reasoning || result.usage) ? result : null;
}