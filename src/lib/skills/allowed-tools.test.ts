import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeAllowedTools, parseAllowedTools } from './allowed-tools';

describe('parseAllowedTools', () => {
  it('splits the spec form on whitespace', () => {
    assert.deepEqual(parseAllowedTools('web_search'), ['web_search']);
    assert.deepEqual(parseAllowedTools('  web_search   save_memory\n'), ['web_search', 'save_memory']);
  });

  it('sets no restriction when missing or blank', () => {
    assert.equal(parseAllowedTools(undefined), null);
    assert.equal(parseAllowedTools(null), null);
    assert.equal(parseAllowedTools(''), null);
    assert.equal(parseAllowedTools('   '), null);
    assert.equal(parseAllowedTools([]), null);
  });

  it('accepts comma-separated names', () => {
    assert.deepEqual(parseAllowedTools('web_search, save_memory'), ['web_search', 'save_memory']);
  });

  it('accepts a YAML flow list', () => {
    assert.deepEqual(parseAllowedTools('[web_search, save_memory]'), ['web_search', 'save_memory']);
    assert.deepEqual(parseAllowedTools(`["web_search", 'save_memory']`), ['web_search', 'save_memory']);
  });

  it('accepts an array of names', () => {
    assert.deepEqual(parseAllowedTools(['web_search', 'save_memory']), ['web_search', 'save_memory']);
  });

  it('does not throw on shapes it cannot read', () => {
    // A nested mapping (`allowed-tools:\n  web_search: true`) used to throw "trim is not a function".
    assert.equal(parseAllowedTools({ web_search: 'true' }), null);
    assert.equal(parseAllowedTools(42), null);
    assert.deepEqual(parseAllowedTools(['web_search', 7, null]), ['web_search']);
  });
});

describe('normalizeAllowedTools', () => {
  it('produces the space-separated string or undefined', () => {
    assert.equal(normalizeAllowedTools('web_search'), 'web_search');
    assert.equal(normalizeAllowedTools(['web_search', 'save_memory']), 'web_search save_memory');
    assert.equal(normalizeAllowedTools({ web_search: 'true' }), undefined);
    assert.equal(normalizeAllowedTools(undefined), undefined);
  });
});
