/**
 * Self-test for the `npm test` resolve hook (register-aliases.mjs): app
 * conventions resolve, and everything else reaches Node untouched.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('register-aliases', () => {
  it("resolves '@/' aliases to .ts modules under src/", async () => {
    const metrics = await import('@/lib/tokens/metrics');
    assert.equal(typeof metrics.serializeResponseTokenMetrics, 'function');
  });

  it('resolves extensionless relative imports between src/ modules', async () => {
    // run-turn.ts imports './turn-config' with no extension.
    const runTurn = await import('@/lib/chat/run-turn');
    assert.equal(typeof runTurn.createTurnRunner, 'function');
  });

  it('explains why a .tsx module cannot load', async () => {
    await assert.rejects(import('@/components/ui/switch'), /is a \.tsx module/);
  });

  // CommonJS packages require() their own files by relative path; the hook
  // must not turn those into file: URLs, which the CJS resolver rejects.
  it('leaves relative requires inside node_modules alone', async () => {
    const { create } = await import('zustand');
    const useStore = create(() => ({ count: 1 }));
    assert.equal(useStore.getState().count, 1);
  });
});
