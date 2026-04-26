import { fetch } from 'expo/fetch';
import { SSEParser, ThinkTagSeparator, extractTokens, extractGeminiNativeTokens, type ToolCallDelta, type UsageData } from './sse-parser';

// ─── Public types ───────────────────────────────────────────────────────

export interface StreamOptions {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}

export type ContentTokenHandler = (token: string) => void;
export type ReasoningTokenHandler = (token: string) => void;
export type DoneHandler = () => void;
export type ErrorHandler = (error: Error) => void;
export type ToolCallHandler = (toolCalls: AccumulatedToolCall[]) => void;
export type UsageHandler = (usage: UsageData) => void;

export type { UsageData } from './sse-parser';

/** A fully-accumulated tool call, ready for execution. */
export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Accumulates tool call data across streaming chunks.
 * Tool call arguments arrive as partial JSON fragments.
 */
class ToolCallAccumulator {
  private calls = new Map<number, { id: string; name: string; args: string }>();

  push(deltas: ToolCallDelta[]): void {
    for (const d of deltas) {
      const existing = this.calls.get(d.index);
      if (existing) {
        if (d.arguments) existing.args += d.arguments;
        if (d.id) existing.id = d.id;
        if (d.name) existing.name = d.name;
      } else {
        this.calls.set(d.index, {
          id: d.id || '',
          name: d.name || '',
          args: d.arguments || '',
        });
      }
    }
  }

  hasToolCalls(): boolean {
    return this.calls.size > 0;
  }

  finalize(): AccumulatedToolCall[] {
    const result: AccumulatedToolCall[] = [];
    for (const [, call] of this.calls) {
      if (!call.name) continue;
      let args: Record<string, unknown> = {};
      try {
        args = call.args ? JSON.parse(call.args) : {};
      } catch {
        // Partial JSON — best-effort parse failed
      }
      result.push({ id: call.id, name: call.name, arguments: args });
    }
    return result;
  }

  reset(): void {
    this.calls.clear();
  }
}

// ─── Streaming entry point ──────────────────────────────────────────────

/**
 * Performs a streaming fetch, parses SSE events, and dispatches tokens.
 *
 * Design decisions:
 * - Uses expo/fetch for WinterCG-compliant ReadableStream on native.
 * - SSEParser and ThinkTagSeparator are per-call instances — no shared state.
 * - AbortError is silently swallowed (stop-generating is expected behavior).
 * - Reader lock is always released in a finally block.
 * - TextDecoder is flushed on stream end for multi-byte boundary safety.
 *
 * @param format - 'openai' for standard SSE (OpenRouter, Google AI, MiniMax),
 *                 'anthropic' for Anthropic's event-typed SSE format.
 */
export async function streamCompletion(
  options: StreamOptions,
  onContent: ContentTokenHandler,
  onReasoning: ReasoningTokenHandler,
  onDone: DoneHandler,
  onError: ErrorHandler,
  format: 'openai' | 'anthropic' | 'gemini-native' = 'openai',
  onToolCalls?: ToolCallHandler,
  onUsage?: UsageHandler,
): Promise<void> {
  const { url, headers, body, signal } = options;
  const sseParser = new SSEParser();
  const thinkSep = new ThinkTagSeparator();
  const toolAccum = new ToolCallAccumulator();
  const usageAccum: UsageData = { promptTokens: 0, completionTokens: 0 };

  // ── 1. Fetch ──────────────────────────────────────────────────────────

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) return; // User cancelled — expected, not an error
    onError(toError(err, 'Network error'));
    return;
  }

  // ── 2. HTTP error handling ────────────────────────────────────────────

  if (!response.ok) {
    onError(await buildHttpError(response));
    return;
  }

  // ── 3. Stream reading ─────────────────────────────────────────────────

  const responseBody = response.body;
  if (!responseBody) {
    // Fallback: response.body is null (shouldn't happen with expo/fetch
    // on SDK 52+, but handle gracefully). Read full text and parse.
    try {
      const text = await response.text();
      if (!text.trim()) {
        onError(new Error('Empty response body'));
        return;
      }
      processEvents(sseParser.feed(text), thinkSep, onContent, onReasoning, format, toolAccum, usageAccum);
      processEvents(sseParser.flush(), thinkSep, onContent, onReasoning, format, toolAccum, usageAccum);
      if (toolAccum.hasToolCalls() && onToolCalls) {
        if (onUsage && (usageAccum.promptTokens > 0 || usageAccum.completionTokens > 0)) {
          onUsage({ ...usageAccum });
        }
        onToolCalls(toolAccum.finalize());
      } else {
        if (onUsage && (usageAccum.promptTokens > 0 || usageAccum.completionTokens > 0)) {
          onUsage({ ...usageAccum });
        }
        onDone();
      }
    } catch (err) {
      if (!isAbort(err)) {
        onError(toError(err, 'Failed to read response'));
      }
    }
    return;
  }

  const reader = responseBody.getReader();
  const decoder = new TextDecoder('utf-8');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // { stream: true } keeps multi-byte sequences intact across chunk boundaries
      const chunk = decoder.decode(value, { stream: true });
      const events = sseParser.feed(chunk);

      if (processEvents(events, thinkSep, onContent, onReasoning, format, toolAccum, usageAccum)) {
        // [DONE] sentinel received
        if (toolAccum.hasToolCalls() && onToolCalls) {
          if (onUsage && (usageAccum.promptTokens > 0 || usageAccum.completionTokens > 0)) {
            onUsage({ ...usageAccum });
          }
          onToolCalls(toolAccum.finalize());
        } else {
          if (onUsage && (usageAccum.promptTokens > 0 || usageAccum.completionTokens > 0)) {
            onUsage({ ...usageAccum });
          }
          onDone();
        }
        return;
      }
    }

    // Flush decoder for any trailing multi-byte bytes
    const trailing = decoder.decode();
    if (trailing) {
      const events = sseParser.feed(trailing);
      processEvents(events, thinkSep, onContent, onReasoning, format, toolAccum, usageAccum);
    }

    // Flush parser for any buffered partial event
    const remaining = sseParser.flush();
    processEvents(remaining, thinkSep, onContent, onReasoning, format, toolAccum, usageAccum);

    if (toolAccum.hasToolCalls() && onToolCalls) {
      if (onUsage && (usageAccum.promptTokens > 0 || usageAccum.completionTokens > 0)) {
        onUsage({ ...usageAccum });
      }
      onToolCalls(toolAccum.finalize());
    } else {
      if (onUsage && (usageAccum.promptTokens > 0 || usageAccum.completionTokens > 0)) {
        onUsage({ ...usageAccum });
      }
      onDone();
    }
  } catch (err) {
    if (!isAbort(err)) {
      onError(toError(err, 'Stream error'));
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Event processing ───────────────────────────────────────────────────

/**
 * Routes parsed SSE events through the appropriate content extractor.
 * Returns true if a [DONE] sentinel was encountered.
 */
function processEvents(
  events: import('./sse-parser').SSEEvent[],
  thinkSep: ThinkTagSeparator,
  onContent: ContentTokenHandler,
  onReasoning: ReasoningTokenHandler,
  format: 'openai' | 'anthropic' | 'gemini-native',
  toolAccum: ToolCallAccumulator,
  usageAccum: UsageData,
): boolean {
  for (const event of events) {
    const data = event.data.trim();
    if (!data) continue;

    // OpenAI [DONE] sentinel
    if (data === '[DONE]') return true;
    // Anthropic message_stop event
    if (format === 'anthropic' && event.event === 'message_stop') return true;

    if (format === 'gemini-native') {
      const tokens = extractGeminiNativeTokens(data);
      if (tokens) {
        if (tokens.content) onContent(tokens.content);
        if (tokens.reasoning) onReasoning(tokens.reasoning);
        if (tokens.usage) {
          usageAccum.promptTokens += tokens.usage.promptTokens;
          usageAccum.completionTokens += tokens.usage.completionTokens;
        }
      }
    } else {
      const tokens = extractTokens(data, thinkSep);
      if (tokens) {
        if (tokens.content) onContent(tokens.content);
        if (tokens.reasoning) onReasoning(tokens.reasoning);
        if (tokens.toolCalls) toolAccum.push(tokens.toolCalls);
        if (tokens.usage) {
          usageAccum.promptTokens += tokens.usage.promptTokens;
          usageAccum.completionTokens += tokens.usage.completionTokens;
        }
      }
    }
  }
  return false;
}

// ─── Error helpers ──────────────────────────────────────────────────────

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function toError(err: unknown, prefix: string): Error {
  const msg = err instanceof Error ? err.message : 'Unknown';
  return new Error(`${prefix}: ${msg}`);
}

async function buildHttpError(response: Response): Promise<Error> {
  // Rate limiting
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const suffix = retryAfter ? ` Retry after ${retryAfter}s.` : '';
    return new Error(`Rate limited.${suffix}`);
  }

  let message = `HTTP ${response.status}`;
  try {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body);
      message = parsed.error?.message || parsed.error || message;
    } catch {
      if (response.statusText) message = response.statusText;
    }
  } catch {
    if (response.statusText) message = response.statusText;
  }

  return new Error(message);
}