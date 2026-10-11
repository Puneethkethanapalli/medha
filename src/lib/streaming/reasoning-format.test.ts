import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractReasoningTitle,
  formatElapsed,
  formatThoughtDuration,
  liveReasoningTail,
  parseReasoningBlocks,
  stripInlineMarkdown,
} from './reasoning-format';

describe('stripInlineMarkdown', () => {
  it('removes emphasis and code markers but keeps their text', () => {
    assert.equal(
      stripInlineMarkdown('Use **bold**, __strong__, *em* and `code` here'),
      'Use bold, strong, em and code here',
    );
  });

  it('keeps single-star emphasis that spans a line break', () => {
    assert.equal(stripInlineMarkdown('*first\nsecond*'), '*first\nsecond*');
  });

  it('keeps inline code that spans a line break', () => {
    assert.equal(stripInlineMarkdown('`a\nb`'), '`a\nb`');
  });

  it('leaves plain text untouched', () => {
    const text = 'No markup here, just text.';
    assert.equal(stripInlineMarkdown(text), text);
  });
});

describe('extractReasoningTitle', () => {
  it('returns null when there is no heading', () => {
    assert.equal(extractReasoningTitle(''), null);
    assert.equal(extractReasoningTitle('Thinking about the problem.\nStill thinking.'), null);
  });

  it('reads bold and ATX headings, dropping a trailing colon', () => {
    assert.equal(extractReasoningTitle('**Planning the approach**\n\nSome text'), 'Planning the approach');
    assert.equal(extractReasoningTitle('## Checking edge cases'), 'Checking edge cases');
    assert.equal(extractReasoningTitle('**Summary:**'), 'Summary');
    assert.equal(extractReasoningTitle('**Summary**:'), 'Summary');
  });

  it('returns the latest heading', () => {
    const reasoning = '**First step**\n\nDoing things.\n\n**Second step**\n\nMore things.';
    assert.equal(extractReasoningTitle(reasoning), 'Second step');
  });

  it('ignores bold text inside a sentence', () => {
    assert.equal(extractReasoningTitle('This is **important** to note.'), null);
  });

  it('ignores lines that only look like headings', () => {
    assert.equal(extractReasoningTitle('#hashtag'), null);
    assert.equal(extractReasoningTitle('####### seven hashes'), null);
    assert.equal(extractReasoningTitle('****'), null);
    assert.equal(extractReasoningTitle('**   **'), null);
  });

  it('strips markdown inside the heading', () => {
    assert.equal(extractReasoningTitle('### Reading `config` _files_'), 'Reading config files');
  });

  it('tolerates CRLF line endings', () => {
    assert.equal(extractReasoningTitle('**Windows title**\r\nbody\r\n'), 'Windows title');
  });

  it('skips headings longer than 64 characters in favor of an earlier one', () => {
    const exact = 'x'.repeat(64);
    assert.equal(extractReasoningTitle(`**${exact}**`), exact);
    assert.equal(extractReasoningTitle(`**Short**\n\n**${'y'.repeat(65)}**`), 'Short');
  });

  it('only searches the last 4000 characters', () => {
    assert.equal(extractReasoningTitle(`**Old title**\n${'a'.repeat(4000)}`), null);
    assert.equal(extractReasoningTitle(`**Recent title**\n${'a'.repeat(3900)}`), 'Recent title');
  });
});

describe('parseReasoningBlocks', () => {
  it('returns no blocks for empty or blank text', () => {
    assert.deepEqual(parseReasoningBlocks(''), []);
    assert.deepEqual(parseReasoningBlocks('  \n\n \n\n\t'), []);
  });

  it('keeps a paragraph without a heading as body only', () => {
    assert.deepEqual(parseReasoningBlocks('Just some text.'), [{ body: 'Just some text.' }]);
  });

  it('lifts a leading heading line out of each paragraph', () => {
    assert.deepEqual(parseReasoningBlocks('**Plan**\nStep one.\nStep two.'), [
      { heading: 'Plan', body: 'Step one.\nStep two.' },
    ]);
  });

  it('omits the body key for a heading on its own', () => {
    const blocks = parseReasoningBlocks('## Heading only');
    assert.deepEqual(blocks, [{ heading: 'Heading only' }]);
    assert.ok(!('body' in blocks[0]));
  });

  it('splits on blank lines and normalizes CR and CRLF', () => {
    assert.deepEqual(parseReasoningBlocks('**A**\r\nalpha\r\n\r\n**B**\rbeta\r\rgamma\n\n\n\ndelta'), [
      { heading: 'A', body: 'alpha' },
      { heading: 'B', body: 'beta' },
      { body: 'gamma' },
      { body: 'delta' },
    ]);
  });

  it('strips inline markdown from the body', () => {
    assert.deepEqual(parseReasoningBlocks('**Plan**\nUse **bold** and `code`.'), [
      { heading: 'Plan', body: 'Use bold and code.' },
    ]);
  });

  it('does not lift a heading line that is not first in its paragraph', () => {
    assert.deepEqual(parseReasoningBlocks('Intro line\n**Not a heading**'), [
      { body: 'Intro line\nNot a heading' },
    ]);
  });
});

describe('formatThoughtDuration', () => {
  it('falls back to a neutral label when timing is unknown', () => {
    for (const ms of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -500]) {
      assert.equal(formatThoughtDuration(ms), 'Thoughts', `ms: ${ms}`);
    }
  });

  it('says "a moment" below 1.5s', () => {
    assert.equal(formatThoughtDuration(1), 'Thought for a moment');
    assert.equal(formatThoughtDuration(1499), 'Thought for a moment');
  });

  it('rounds to whole seconds under a minute', () => {
    assert.equal(formatThoughtDuration(1500), 'Thought for 2s');
    assert.equal(formatThoughtDuration(12_345), 'Thought for 12s');
    assert.equal(formatThoughtDuration(59_499), 'Thought for 59s');
  });

  it('switches to minutes once rounding reaches 60s', () => {
    assert.equal(formatThoughtDuration(59_500), 'Thought for 1m');
    assert.equal(formatThoughtDuration(61_000), 'Thought for 1m 1s');
    assert.equal(formatThoughtDuration(125_000), 'Thought for 2m 5s');
    assert.equal(formatThoughtDuration(3_600_000), 'Thought for 60m');
  });
});

describe('formatElapsed', () => {
  it('floors to whole seconds and clamps negatives to zero', () => {
    assert.equal(formatElapsed(0), '0s');
    assert.equal(formatElapsed(999), '0s');
    assert.equal(formatElapsed(-5000), '0s');
    assert.equal(formatElapsed(59_999), '59s');
  });

  it('always shows seconds alongside minutes', () => {
    assert.equal(formatElapsed(60_000), '1m 0s');
    assert.equal(formatElapsed(125_500), '2m 5s');
  });
});

describe('liveReasoningTail', () => {
  it('returns short text unchanged', () => {
    assert.equal(liveReasoningTail('', 10), '');
    assert.equal(liveReasoningTail('exactly10!', 10), 'exactly10!');
  });

  it('cuts at a line break in the first third of the tail', () => {
    // Tail is the last 12 chars: "AA\nTail line"; the break is at index 2 < 4.
    assert.equal(liveReasoningTail(`${'A'.repeat(100)}\nTail line`, 12), 'Tail line');
  });

  it('falls back to a word boundary when the line break is too late', () => {
    const tail = 'xxxxx yyyyyyyyy\nzzzzzzzzzzzzzz'; // break at 15, past 30 / 3
    assert.equal(tail.length, 30);
    assert.equal(liveReasoningTail(`prefix-${tail}`, 30), 'yyyyyyyyy\nzzzzzzzzzzzzzz');
  });

  it('only cuts at a space within the first 40 characters', () => {
    const early = `${'c'.repeat(39)} ${'d'.repeat(60)}`;
    assert.equal(liveReasoningTail(`lead ${early}`, 100), 'd'.repeat(60));

    const late = `${'c'.repeat(40)} ${'d'.repeat(59)}`;
    assert.equal(liveReasoningTail(`lead ${late}`, 100), late);
  });

  it('keeps the raw tail when there is no boundary to cut at', () => {
    assert.equal(liveReasoningTail('q'.repeat(500), 50), 'q'.repeat(50));
  });

  it('always returns a suffix no longer than maxChars', () => {
    const reasoning = Array.from({ length: 200 }, (_, i) => (i % 7 === 0 ? `line ${i}\n` : `word${i} `)).join('');
    for (const maxChars of [1, 5, 17, 64, 300, 1200]) {
      const tail = liveReasoningTail(reasoning, maxChars);
      assert.ok(tail.length <= maxChars, `maxChars ${maxChars}: got ${tail.length}`);
      assert.ok(reasoning.endsWith(tail), `maxChars ${maxChars}: not a suffix`);
    }
  });
});
