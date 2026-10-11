import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatCompactTokenCount,
  formatTokensPerSecond,
  parseResponseTokenMetrics,
  serializeResponseTokenMetrics,
} from './metrics';

// toLocaleString() follows the runner's locale, so expected values for those
// branches are built the same way instead of hard-coding en-US output.
const localized = (value: number) => value.toLocaleString();

describe('parseResponseTokenMetrics', () => {
  it('returns null for missing, empty and malformed values', () => {
    assert.equal(parseResponseTokenMetrics(null), null);
    assert.equal(parseResponseTokenMetrics(''), null);
    assert.equal(parseResponseTokenMetrics('{"prompt":'), null);
    assert.equal(parseResponseTokenMetrics('not json'), null);
  });

  it('returns null for JSON that is not a metrics object', () => {
    // `null` throws on property access and must not escape the try/catch.
    assert.equal(parseResponseTokenMetrics('null'), null);
    assert.equal(parseResponseTokenMetrics('42'), null);
    assert.equal(parseResponseTokenMetrics('"text"'), null);
    assert.equal(parseResponseTokenMetrics('[]'), null);
  });

  it('returns null when every field is empty or zero', () => {
    assert.equal(parseResponseTokenMetrics('{}'), null);
    assert.equal(parseResponseTokenMetrics('{"prompt":0,"completion":0}'), null);
    assert.equal(
      parseResponseTokenMetrics('{"prompt":-5,"completion":0,"tokensPerSecond":0,"reasoningMs":-1}'),
      null,
    );
  });

  it('omits optional fields that are absent rather than setting them undefined', () => {
    const metrics = parseResponseTokenMetrics('{"prompt":12,"completion":34}');
    assert.deepEqual(metrics, { prompt: 12, completion: 34 });
    assert.ok(metrics && !('tokensPerSecond' in metrics));
    assert.ok(metrics && !('reasoningMs' in metrics));
  });

  it('keeps tokensPerSecond as stored and rounds reasoningMs', () => {
    assert.deepEqual(
      parseResponseTokenMetrics('{"prompt":1,"completion":2,"tokensPerSecond":42.125,"reasoningMs":1234.6}'),
      { prompt: 1, completion: 2, tokensPerSecond: 42.125, reasoningMs: 1235 },
    );
  });

  it('coerces counts to non-negative integers', () => {
    assert.deepEqual(
      parseResponseTokenMetrics('{"prompt":"12","completion":7.6}'),
      { prompt: 12, completion: 8 },
    );
    assert.deepEqual(
      parseResponseTokenMetrics('{"prompt":-3,"completion":"abc","tokensPerSecond":5}'),
      { prompt: 0, completion: 0, tokensPerSecond: 5 },
    );
  });

  it('keeps a row with only timing data', () => {
    assert.deepEqual(parseResponseTokenMetrics('{"reasoningMs":900}'), {
      prompt: 0,
      completion: 0,
      reasoningMs: 900,
    });
  });

  it('drops non-positive or non-numeric optional fields', () => {
    assert.deepEqual(
      parseResponseTokenMetrics('{"prompt":3,"completion":4,"tokensPerSecond":"fast","reasoningMs":0}'),
      { prompt: 3, completion: 4 },
    );
  });
});

describe('serializeResponseTokenMetrics', () => {
  it('returns null when there is nothing worth storing', () => {
    assert.equal(serializeResponseTokenMetrics({ prompt: 0, completion: 0 }), null);
    assert.equal(
      serializeResponseTokenMetrics({ prompt: -1, completion: Number.NaN, tokensPerSecond: -2, reasoningMs: 0 }),
      null,
    );
  });

  it('writes a stable key order with rounded values', () => {
    // This string is persisted to SQLite, so its exact shape matters.
    assert.equal(
      serializeResponseTokenMetrics({ prompt: 10.4, completion: 20.5, tokensPerSecond: 42.16, reasoningMs: 1499.5 }),
      '{"prompt":10,"completion":21,"tokensPerSecond":42.2,"reasoningMs":1500}',
    );
  });

  it('leaves out optional fields that are missing or invalid', () => {
    assert.equal(serializeResponseTokenMetrics({ prompt: 5, completion: 6 }), '{"prompt":5,"completion":6}');
    assert.equal(
      serializeResponseTokenMetrics({ prompt: 5, completion: 6, tokensPerSecond: Number.POSITIVE_INFINITY }),
      '{"prompt":5,"completion":6}',
    );
  });

  it('round-trips through parseResponseTokenMetrics', () => {
    const serialized = serializeResponseTokenMetrics({
      prompt: 1200,
      completion: 345,
      tokensPerSecond: 61.04,
      reasoningMs: 8250,
    });
    assert.deepEqual(parseResponseTokenMetrics(serialized), {
      prompt: 1200,
      completion: 345,
      tokensPerSecond: 61,
      reasoningMs: 8250,
    });
  });
});

describe('formatTokensPerSecond', () => {
  it('returns null for missing or non-positive rates', () => {
    for (const value of [null, undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(formatTokensPerSecond(value), null, `value: ${value}`);
    }
  });

  it('always shows one decimal below 10', () => {
    assert.equal(formatTokensPerSecond(0.04), '0.0');
    assert.equal(formatTokensPerSecond(5), '5.0');
    assert.equal(formatTokensPerSecond(9.94), '9.9');
  });

  it('shows one decimal from 10 up, dropping a trailing .0', () => {
    assert.equal(formatTokensPerSecond(10), '10');
    assert.equal(formatTokensPerSecond(12.34), '12.3');
    assert.equal(formatTokensPerSecond(42.04), '42');
    assert.equal(formatTokensPerSecond(99.96), '100');
  });

  it('rounds to whole numbers from 100 up, grouped for the locale', () => {
    assert.equal(formatTokensPerSecond(100.4), localized(100));
    assert.equal(formatTokensPerSecond(1234.5), localized(1235));
  });
});

describe('formatCompactTokenCount', () => {
  it('prints small counts as whole numbers', () => {
    assert.equal(formatCompactTokenCount(0), localized(0));
    assert.equal(formatCompactTokenCount(999), localized(999));
    assert.equal(formatCompactTokenCount(12.4), localized(12));
  });

  it('treats invalid counts as zero', () => {
    assert.equal(formatCompactTokenCount(-50), localized(0));
    assert.equal(formatCompactTokenCount(Number.NaN), localized(0));
    assert.equal(formatCompactTokenCount(Number.POSITIVE_INFINITY), localized(0));
  });

  it('abbreviates thousands with at most one decimal', () => {
    assert.equal(formatCompactTokenCount(1000), '1K');
    assert.equal(formatCompactTokenCount(1049), '1K');
    assert.equal(formatCompactTokenCount(1500), '1.5K');
    assert.equal(formatCompactTokenCount(128_000), '128K');
    assert.equal(formatCompactTokenCount(999.6), '1K');
  });

  it('abbreviates millions with at most one decimal', () => {
    assert.equal(formatCompactTokenCount(1_000_000), '1M');
    assert.equal(formatCompactTokenCount(1_048_576), '1M');
    assert.equal(formatCompactTokenCount(2_340_000), '2.3M');
  });
});
