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
// Some models (DeepSeek R1, MiniMax M2, Qwen, Gemini via the OpenAI-compatible
// endpoint) put their reasoning inside <think>/<thought> tags in delta.content.
// Tags can be split across SSE chunks. State is per-instance so concurrent
// streams don't corrupt each other.

const THINK_OPEN_TAGS = [
  '<think>', '<thought>', '<thinking>',
  '<Think>', '<Thought>', '<Thinking>',
] as const;

function closeTagFor(openTag: string): string {
  return `</${openTag.slice(1)}`;
}

/** Length of the longest suffix of `text` that is a proper prefix of `tag`. */
function partialSuffixLength(text: string, tag: string): number {
  for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}

export class ThinkTagSeparator {
  /**
   * 'start': nothing but whitespace seen yet — a think tag may still open.
   * 'reasoning': inside a think block.
   * 'content': the answer. Tags are only honored at the very start, so a
   * literal "<think>" later in an answer is left alone.
   */
  private mode: 'start' | 'reasoning' | 'content' = 'start';
  /** Text held back because it might be the start of a tag. */
  private pending = '';
  private closeTag = '';
  private trimLeading = false;

  reset(): void {
    this.mode = 'start';
    this.pending = '';
    this.closeTag = '';
    this.trimLeading = false;
  }

  /**
   * Splits raw content into reasoning (inside think tags) and content.
   * Reasoning streams as it arrives; only a possible partial tag is held back.
   */
  separate(text: string): { content?: string; reasoning?: string } {
    let content = '';
    let reasoning = '';
    let input = this.pending + text;
    this.pending = '';

    while (input) {
      if (this.mode === 'start') {
        const trimmed = input.replace(/^\s+/, '');
        if (!trimmed) {
          this.pending = input;
          break;
        }

        const openTag = THINK_OPEN_TAGS.find((tag) => trimmed.startsWith(tag));
        if (openTag) {
          this.mode = 'reasoning';
          this.closeTag = closeTagFor(openTag);
          this.trimLeading = true;
          input = trimmed.slice(openTag.length);
          continue;
        }

        if (THINK_OPEN_TAGS.some((tag) => tag.startsWith(trimmed))) {
          // Could still become an opening tag — wait for more text.
          this.pending = input;
          break;
        }

        this.mode = 'content';
        input = trimmed;
        continue;
      }

      if (this.trimLeading) {
        input = input.replace(/^\s+/, '');
        if (!input) break;
        this.trimLeading = false;
      }

      if (this.mode === 'reasoning') {
        const closeIdx = input.indexOf(this.closeTag);
        if (closeIdx !== -1) {
          reasoning += input.slice(0, closeIdx);
          input = input.slice(closeIdx + this.closeTag.length);
          this.mode = 'content';
          this.trimLeading = true;
          continue;
        }

        const hold = partialSuffixLength(input, this.closeTag);
        reasoning += input.slice(0, input.length - hold);
        this.pending = input.slice(input.length - hold);
        break;
      }

      content += input;
      break;
    }

    return {
      reasoning: reasoning || undefined,
      content: content || undefined,
    };
  }

  /** Release anything held back once the stream ends. */
  flush(): { content?: string; reasoning?: string } {
    const pending = this.pending;
    this.pending = '';
    if (!pending) return {};
    if (this.mode === 'reasoning') return { reasoning: pending };
    // A partial tag that never completed was ordinary text after all.
    return pending.trim() ? { content: pending.replace(/^\s+/, '') } : {};
  }
}

// ─── Content extraction ─────────────────────────────────────────────────

/** Plain text from an OpenRouter-style reasoning_details array. */
function reasoningDetailsText(details: unknown): string {
  if (!Array.isArray(details)) return '';
  let text = '';
  for (const detail of details) {
    if (detail?.type === 'reasoning.text' && typeof detail.text === 'string') {
      text += detail.text;
    } else if (detail?.type === 'reasoning.summary' && typeof detail.summary === 'string') {
      text += detail.summary;
    }
  }
  return text;
}

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
  //
  // Providers often send the same text in more than one field (OpenRouter
  // sends both `reasoning` and `reasoning_details`; some servers mirror
  // `reasoning_content` into `reasoning`). Use exactly one source per chunk.
  const delta = (parsed.choices as any)?.[0]?.delta;
  const reasoningText =
    (typeof delta?.reasoning === 'string' && delta.reasoning)
    || (typeof delta?.reasoning_content === 'string' && delta.reasoning_content)
    || reasoningDetailsText(delta?.reasoning_details);
  if (reasoningText) {
    result.reasoning = reasoningText;
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
      if (!part.text || typeof part.text !== 'string') continue;
      // Thought summaries arrive as { text, thought: true }.
      if (part.thought === true) {
        result.reasoning = (result.reasoning || '') + part.text;
      } else {
        result.content = (result.content || '') + part.text;
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

/**
 * Extract tokens from OpenAI Responses API / Codex backend SSE chunks.
 * Format uses event objects such as response.output_text.delta and
 * response.output_item.done rather than Chat Completions choices deltas.
 */
export function extractOpenAIResponsesTokens(data: string): TokenContent | null {
  if (data === '[DONE]') return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  const result: TokenContent = {};
  const type = parsed.type;

  if (type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
    result.content = parsed.delta;
  }

  if (
    (type === 'response.reasoning_text.delta' || type === 'response.reasoning_summary_text.delta')
    && typeof parsed.delta === 'string'
  ) {
    result.reasoning = parsed.delta;
  }

  // Each new summary part is its own section; separate it from the previous one.
  if (type === 'response.reasoning_summary_part.added' && Number(parsed.summary_index ?? 0) > 0) {
    result.reasoning = '\n\n';
  }

  if (type === 'response.output_item.done') {
    const item = parsed.item as Record<string, unknown> | undefined;
    if (item?.type === 'function_call') {
      result.toolCalls = [{
        index: Number(parsed.output_index ?? 0),
        id: (item.call_id as string | undefined) || (item.id as string | undefined),
        name: item.name as string | undefined,
        arguments: item.arguments as string | undefined,
      }];
    }
  }

  if (type === 'response.completed') {
    const response = parsed.response as Record<string, unknown> | undefined;
    const usage = response?.usage as Record<string, unknown> | undefined;
    if (usage) {
      const prompt = Number(usage.input_tokens ?? 0);
      const completion = Number(usage.output_tokens ?? 0);
      if (prompt > 0 || completion > 0) {
        result.usage = { promptTokens: prompt, completionTokens: completion };
      }
    }
  }

  return (result.content || result.reasoning || result.toolCalls || result.usage) ? result : null;
}

export function isOpenAIResponsesDone(data: string): boolean {
  if (data === '[DONE]') return true;
  try {
    const parsed = JSON.parse(data) as { type?: string };
    return parsed.type === 'response.completed'
      || parsed.type === 'response.failed'
      || parsed.type === 'response.incomplete';
  } catch {
    return false;
  }
}
