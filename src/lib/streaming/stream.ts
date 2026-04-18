import { SSEParser, extractContentFromEvent, type TokenContent } from './sse-parser';

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

/**
 * Wraps a fetch call with SSE streaming, yielding tokens via callbacks.
 * Handles reasoning tokens separately from content tokens for thinking models.
 */
export async function streamCompletion(
  options: StreamOptions,
  onContent: ContentTokenHandler,
  onReasoning: ReasoningTokenHandler,
  onDone: DoneHandler,
  onError: ErrorHandler
): Promise<void> {
  const { url, headers, body, signal } = options;

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
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
      // Try to parse error from response body
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.error?.message || parsed.error || errorMessage;
      } catch {
        // Not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const retryMsg = retryAfter ? ` Retry after ${retryAfter}s.` : '';
      onError(new Error(`Rate limited.${retryMsg}`));
      return;
    }

    onError(new Error(errorMessage));
    return;
  }

  const responseBody = response.body;
  if (!responseBody) {
    // Fallback: read entire body as text and parse as SSE
    // This happens when response.body is null but stream is still valid
    try {
      const text = await response.text();
      if (!text.trim()) {
        onError(new Error('Empty response body'));
        return;
      }

      // Parse the SSE text manually
      const lines = text.split(/\r\n|\r|\n/);
      let buffer = '';

      for (const line of lines) {
        if (line.startsWith(':')) {
          // Comment/keepalive - skip
          continue;
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
          if (line === '') {
            // Empty line - flush buffer if any
            if (buffer.trim()) {
              const extracted = extractContentFromEvent(buffer);
              if (extracted) {
                if (extracted.content) onContent(extracted.content);
                if (extracted.reasoning) onReasoning(extracted.reasoning);
              }
              buffer = '';
            }
          }
          continue;
        }

        const field = line.slice(0, colonIndex);
        const value = line.slice(colonIndex + 1).trim();

        if (field === 'data') {
          if (value === '[DONE]') {
            onDone();
            return;
          }
          const extracted = extractContentFromEvent(value);
          if (extracted) {
            if (extracted.content) onContent(extracted.content);
            if (extracted.reasoning) onReasoning(extracted.reasoning);
          }
        } else if (field === 'event' || field === 'id') {
          // Event metadata - just track, don't emit
        } else {
          // Unknown field - accumulate in buffer for multiline
          buffer += (buffer ? '\n' : '') + line;
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const extracted = extractContentFromEvent(buffer);
        if (extracted) {
          if (extracted.content) onContent(extracted.content);
          if (extracted.reasoning) onReasoning(extracted.reasoning);
        }
      }

      onDone();
      return;
    } catch (err) {
      onError(new Error(`Failed to read response: ${err instanceof Error ? err.message : 'Unknown'}`));
      return;
    }
  }

  const reader = responseBody.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffered data
        const remaining = parser.flush();
        for (const event of remaining) {
          if (event.type === 'event' && event.data) {
            const extracted = extractContentFromEvent(event.data);
            if (extracted) {
              if (extracted.content) onContent(extracted.content);
              if (extracted.reasoning) onReasoning(extracted.reasoning);
            }
          }
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const events = parser.parse(chunk);

      for (const event of events) {
        if (event.type === 'done') {
          onDone();
          return;
        }

        if (event.type === 'event' && event.data) {
          // Skip OpenRouter keepalive comments
          if (event.data.startsWith(' ') || event.data === '') {
            continue;
          }

          const extracted = extractContentFromEvent(event.data);
          if (extracted) {
            if (extracted.content) onContent(extracted.content);
            if (extracted.reasoning) onReasoning(extracted.reasoning);
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