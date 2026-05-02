import type { AccumulatedToolCall } from '@/lib/streaming/stream';
import { getTool } from './registry';
import type { ToolDisplay, ToolResult } from './types';
import { ToolValidationError, validateToolArguments } from './validation';

const DEFAULT_TOOL_TIMEOUT_MS = 45_000;

export interface ToolExecutionOutcome {
  call: AccumulatedToolCall;
  status: 'success' | 'error';
  durationMs: number;
  content: string;
  display: ToolDisplay;
}

export async function executeToolCall(
  toolCall: AccumulatedToolCall,
  timeoutMs: number = DEFAULT_TOOL_TIMEOUT_MS
): Promise<ToolExecutionOutcome> {
  const startedAt = Date.now();
  const tool = getTool(toolCall.name);

  if (!tool) {
    return buildErrorOutcome(
      toolCall,
      startedAt,
      `Tool "${toolCall.name}" is not registered.`
    );
  }

  try {
    const validatedArgs = validateToolArguments(tool, toolCall.arguments);
    const result = await withTimeout(tool.execute(validatedArgs), timeoutMs, tool.name);
    const durationMs = Date.now() - startedAt;
    const display = normalizeDisplay(tool.name, result, durationMs);

    return {
      call: { ...toolCall, arguments: validatedArgs },
      status: 'success',
      durationMs,
      content: result.raw ? serializeRaw(result.raw) : result.content,
      display,
    };
  } catch (error) {
    const message = error instanceof ToolValidationError || error instanceof Error
      ? error.message
      : 'Tool execution failed.';
    return buildErrorOutcome(toolCall, startedAt, message);
  }
}

export function describeToolCalls(toolCalls: AccumulatedToolCall[]): string {
  const readableNames = toolCalls
    .map((call) => call.name.replace(/_/g, ' '))
    .filter(Boolean);

  if (readableNames.length === 0) return 'Using tools...';
  if (readableNames.length === 1) return `Checking ${readableNames[0]}...`;

  const last = readableNames[readableNames.length - 1];
  return `Checking ${readableNames.slice(0, -1).join(', ')} and ${last}...`;
}

function normalizeDisplay(toolName: string, result: ToolResult, durationMs: number): ToolDisplay {
  if (result.display) {
    return {
      ...result.display,
      status: result.display.status ?? 'success',
      metadata: [
        ...(result.display.metadata ?? []),
        { label: 'Runtime', value: formatDuration(durationMs) },
      ],
    };
  }

  if (result.citations && result.citations.length > 0) {
    return {
      kind: 'search',
      title: 'Sources',
      subtitle: toolName.replace(/_/g, ' '),
      status: 'success',
      citations: result.citations,
      metadata: [{ label: 'Runtime', value: formatDuration(durationMs) }],
    };
  }

  return {
    kind: 'generic',
    title: toolName.replace(/_/g, ' '),
    status: 'success',
    summary: result.content,
    metadata: [{ label: 'Runtime', value: formatDuration(durationMs) }],
  };
}

function buildErrorOutcome(
  toolCall: AccumulatedToolCall,
  startedAt: number,
  message: string
): ToolExecutionOutcome {
  const durationMs = Date.now() - startedAt;
  return {
    call: toolCall,
    status: 'error',
    durationMs,
    content: `Error: ${message}`,
    display: {
      kind: 'error',
      title: toolCall.name.replace(/_/g, ' ') || 'Tool call',
      status: 'error',
      summary: message,
      metadata: [{ label: 'Runtime', value: formatDuration(durationMs) }],
    },
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Tool "${toolName}" timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function serializeRaw(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
