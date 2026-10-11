export interface ResponseTokenMetrics {
  prompt: number;
  completion: number;
  tokensPerSecond?: number;
  /** How long the model thought before answering. */
  reasoningMs?: number;
}

export function parseResponseTokenMetrics(value: string | null): ResponseTokenMetrics | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const prompt = coerceNonNegativeInteger(parsed.prompt);
    const completion = coerceNonNegativeInteger(parsed.completion);
    const tokensPerSecond = coercePositiveNumber(parsed.tokensPerSecond);
    const reasoningMs = coercePositiveNumber(parsed.reasoningMs);

    if (prompt === 0 && completion === 0 && tokensPerSecond === undefined && reasoningMs === undefined) {
      return null;
    }

    return {
      prompt,
      completion,
      ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
      ...(reasoningMs !== undefined ? { reasoningMs: Math.round(reasoningMs) } : {}),
    };
  } catch {
    return null;
  }
}

export function serializeResponseTokenMetrics(metrics: ResponseTokenMetrics): string | null {
  const prompt = coerceNonNegativeInteger(metrics.prompt);
  const completion = coerceNonNegativeInteger(metrics.completion);
  const tokensPerSecond = coercePositiveNumber(metrics.tokensPerSecond);
  const reasoningMs = coercePositiveNumber(metrics.reasoningMs);

  if (prompt === 0 && completion === 0 && tokensPerSecond === undefined && reasoningMs === undefined) {
    return null;
  }

  return JSON.stringify({
    prompt,
    completion,
    ...(tokensPerSecond !== undefined
      ? { tokensPerSecond: Number(tokensPerSecond.toFixed(1)) }
      : {}),
    ...(reasoningMs !== undefined ? { reasoningMs: Math.round(reasoningMs) } : {}),
  });
}

export function formatTokensPerSecond(value: number | null | undefined): string | null {
  const safe = coercePositiveNumber(value);
  if (safe === undefined) return null;

  if (safe >= 100) return Math.round(safe).toLocaleString();
  if (safe >= 10) return trimTrailingZero(safe.toFixed(1));
  return safe.toFixed(1);
}

export function formatCompactTokenCount(value: number): string {
  const safe = coerceNonNegativeInteger(value);
  if (safe >= 1_000_000) return `${trimTrailingZero((safe / 1_000_000).toFixed(1))}M`;
  if (safe >= 1_000) return `${trimTrailingZero((safe / 1_000).toFixed(1))}K`;
  return safe.toLocaleString();
}

function coerceNonNegativeInteger(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number);
}

function coercePositiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return number;
}

function trimTrailingZero(value: string): string {
  return value.replace(/\.0$/, '');
}
