/**
 * `npm run check:litellm` requires src/lib/providers/catalog.ts under plain
 * Node, without the `npm test` resolve hook. A runtime '@/' import (or
 * anything else Node can't load) in the catalog would break the script while
 * catalog.test.ts still passes, so run the script in a fresh process.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../check-litellm-model.js', import.meta.url));

describe('check-litellm-model', () => {
  it('loads the provider catalog without the test resolve hook', () => {
    // With no arguments the script prints usage and exits before any fetch.
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^Usage: npm run check:litellm -- <provider> <model-id>$/m, result.stderr);
  });
});
