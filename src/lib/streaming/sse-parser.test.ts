import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractGeminiNativeTokens,
  extractOpenAIResponsesTokens,
  extractTokens,
  isOpenAIResponsesDone,
  SSEParser,
  type SSEEvent,
  ThinkTagSeparator,
} from './sse-parser';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Feed chunks to one parser in order, then flush, collecting every event. */
function parseAll(chunks: string[]): SSEEvent[] {
  const parser = new SSEParser();
  return [...chunks.flatMap((chunk) => parser.feed(chunk)), ...parser.flush()];
}

/** Run chunks through one separator, then flush, joining everything it emits. */
function separateAll(chunks: string[]): { reasoning: string; content: string } {
  const separator = new ThinkTagSeparator();
  let reasoning = '';
  let content = '';
  for (const part of [...chunks.map((chunk) => separator.separate(chunk)), separator.flush()]) {
    reasoning += part.reasoning ?? '';
    content += part.content ?? '';
  }
  return { reasoning, content };
}

/** Every way to cut `text` into two network chunks. */
function twoWaySplits(text: string): string[][] {
  return Array.from({ length: text.length + 1 }, (_, i) => [text.slice(0, i), text.slice(i)]);
}

const message = (data: string, id?: string): SSEEvent => ({ event: 'message', data, id });

// ─── SSEParser ──────────────────────────────────────────────────────────

describe('SSEParser', () => {
  it('dispatches an event on a blank line', () => {
    assert.deepEqual(parseAll(['data: hello\n\n']), [message('hello')]);
  });

  it('buffers until the blank line arrives', () => {
    const parser = new SSEParser();
    assert.deepEqual(parser.feed('data: hel'), []);
    assert.deepEqual(parser.feed('lo\n'), []);
    assert.deepEqual(parser.feed('\n'), [message('hello')]);
  });

  it('parses a stream the same way however it is chunked', () => {
    const stream =
      'event: content_block_delta\ndata: {"a":1}\n\n'
      + ': keep-alive\n\n'
      + 'id: 7\ndata: line one\ndata: line two\n\n'
      + 'data: [DONE]\n\n';
    const expected = [
      { event: 'content_block_delta', data: '{"a":1}', id: undefined },
      message('line one\nline two', '7'),
      message('[DONE]', '7'),
    ];

    assert.deepEqual(parseAll([stream]), expected);
    assert.deepEqual(parseAll([...stream]), expected, 'one character per chunk');
    for (const chunks of twoWaySplits(stream)) {
      assert.deepEqual(parseAll(chunks), expected, `split at ${chunks[0].length}`);
    }
  });

  it('accepts CRLF and bare CR line endings', () => {
    assert.deepEqual(parseAll(['data: a\r\n\r\ndata: b\r\rdata: c\n\n']), [
      message('a'),
      message('b'),
      message('c'),
    ]);
  });

  // Regression: the "\n" of a CRLF split across chunks used to read as a blank
  // line, dispatching the event early without its `event:` type.
  it('keeps the event when a CRLF pair is split across chunks', () => {
    const stream = 'event: message_stop\r\ndata: {}\r\n\r\n';
    const expected = [{ event: 'message_stop', data: '{}', id: undefined }];
    assert.deepEqual(parseAll([stream]), expected);
    assert.deepEqual(parseAll(['event: message_stop\r', '\ndata: {}\r\n\r\n']), expected);
    for (const chunks of twoWaySplits(stream)) {
      assert.deepEqual(parseAll(chunks), expected, `split at ${chunks[0].length}`);
    }
    assert.deepEqual(parseAll([...stream]), expected);
  });

  it('only pairs a split CR with the LF that immediately follows it', () => {
    // An empty chunk between the halves doesn't break the pair.
    assert.deepEqual(parseAll(['data: a\r', '', '\n\r\n']), [message('a')]);
    // CR then LF LF is a CRLF followed by a blank line, so the event dispatches.
    assert.deepEqual(parseAll(['event: x\ndata: a\r', '\n\n', 'data: b\n\n']), [
      { event: 'x', data: 'a', id: undefined },
      message('b'),
    ]);
    // A lone CR is a line ending of its own; the next chunk's text is a new line.
    assert.deepEqual(parseAll(['data: a\r', 'data: b\r\r']), [message('a\nb')]);
  });

  it('strips exactly one space after the colon', () => {
    assert.deepEqual(parseAll(['data:no-space\n\n']), [message('no-space')]);
    assert.deepEqual(parseAll(['data:  two spaces\n\n']), [message(' two spaces')]);
  });

  it('treats a field with no colon as an empty value', () => {
    assert.deepEqual(parseAll(['data\n\n']), [message('')]);
  });

  it('ignores comments, retry and unknown fields', () => {
    assert.deepEqual(parseAll([': only a comment\n\n']), []);
    assert.deepEqual(parseAll([': comment\nretry: 1000\nfoo: bar\ndata: x\n\n']), [message('x')]);
  });

  it('resets the event type after every blank line, even without data', () => {
    assert.deepEqual(parseAll(['event: ping\n\ndata: x\n\n']), [message('x')]);
    assert.deepEqual(parseAll(['event: a\ndata: 1\n\ndata: 2\n\n']), [
      { event: 'a', data: '1', id: undefined },
      message('2'),
    ]);
  });

  it('keeps the last id across events and ignores ids containing NUL', () => {
    assert.deepEqual(parseAll(['id: 1\ndata: a\n\nid: 2\u0000x\ndata: b\n\n']), [
      message('a', '1'),
      message('b', '1'),
    ]);
  });

  it('flush() dispatches whatever is buffered when the stream ends', () => {
    const unterminated = new SSEParser();
    assert.deepEqual(unterminated.feed('data: partial'), []);
    assert.deepEqual(unterminated.flush(), [message('partial')]);

    const noBlankLine = new SSEParser();
    assert.deepEqual(noBlankLine.feed('data: a\n'), []);
    assert.deepEqual(noBlankLine.flush(), [message('a')]);

    assert.deepEqual(new SSEParser().flush(), []);
  });
});

// ─── ThinkTagSeparator ──────────────────────────────────────────────────

describe('ThinkTagSeparator', () => {
  it('passes plain content through', () => {
    assert.deepEqual(new ThinkTagSeparator().separate('Hello'), { reasoning: undefined, content: 'Hello' });
  });

  it('splits a leading think block from the answer', () => {
    assert.deepEqual(separateAll(['<think>Let me see.</think>The answer.']), {
      reasoning: 'Let me see.',
      content: 'The answer.',
    });
  });

  it('trims whitespace before the tag, after it and after the close tag', () => {
    assert.deepEqual(separateAll(['\n\n<think>\n  step\n</think>\n\nAnswer']), {
      reasoning: 'step\n',
      content: 'Answer',
    });
  });

  it('recognizes each supported tag and only its matching close tag', () => {
    for (const tag of ['think', 'thought', 'thinking', 'Think', 'Thought', 'Thinking']) {
      assert.deepEqual(separateAll([`<${tag}>r</${tag}>c`]), { reasoning: 'r', content: 'c' }, tag);
    }
    assert.deepEqual(separateAll(['<think>r</thought>c']), { reasoning: 'r</thought>c', content: '' });
  });

  it('splits the same way however the stream is chunked', () => {
    const stream = '  <thinking>step one\nstep two</thinking>\n\nFinal answer with <b>tags</b>';
    const expected = { reasoning: 'step one\nstep two', content: 'Final answer with <b>tags</b>' };

    assert.deepEqual(separateAll([...stream]), expected, 'one character per chunk');
    for (const chunks of twoWaySplits(stream)) {
      assert.deepEqual(separateAll(chunks), expected, `split at ${chunks[0].length}`);
    }
  });

  it('holds back a possible open tag until it is disambiguated', () => {
    const separator = new ThinkTagSeparator();
    assert.deepEqual(separator.separate('<t'), { reasoning: undefined, content: undefined });
    assert.deepEqual(separator.separate('able>'), { reasoning: undefined, content: '<table>' });
  });

  it('streams reasoning right away, holding back only a possible close tag', () => {
    const separator = new ThinkTagSeparator();
    assert.deepEqual(separator.separate('<think>abc</th'), { reasoning: 'abc', content: undefined });
    assert.deepEqual(separator.separate('ink>done'), { reasoning: undefined, content: 'done' });
  });

  it('only honors tags at the very start of the stream', () => {
    assert.deepEqual(separateAll(['Answer: <think>x</think>']), {
      reasoning: '',
      content: 'Answer: <think>x</think>',
    });

    const separator = new ThinkTagSeparator();
    separator.separate('Hi ');
    assert.deepEqual(separator.separate('<think>x</think>'), { reasoning: undefined, content: '<think>x</think>' });
  });

  it('treats an unterminated think block as reasoning, including a held close-tag prefix', () => {
    assert.deepEqual(separateAll(['<think>never closed</th']), { reasoning: 'never closed</th', content: '' });
  });

  it('flush() releases an incomplete open tag as content', () => {
    const partialTag = new ThinkTagSeparator();
    partialTag.separate('  <th');
    assert.deepEqual(partialTag.flush(), { content: '<th' });

    const whitespace = new ThinkTagSeparator();
    whitespace.separate('\n  ');
    assert.deepEqual(whitespace.flush(), {});

    assert.deepEqual(new ThinkTagSeparator().flush(), {});
  });

  it('reset() starts a fresh stream', () => {
    const separator = new ThinkTagSeparator();
    separator.separate('<think>first');
    separator.reset();
    assert.deepEqual(separator.separate('<think>b</think>c'), { reasoning: 'b', content: 'c' });

    separator.reset();
    separator.separate('<thi');
    separator.reset();
    assert.deepEqual(separator.flush(), {});
  });

  it('keeps state per instance', () => {
    const a = new ThinkTagSeparator();
    const b = new ThinkTagSeparator();
    a.separate('<think>x');
    assert.deepEqual(b.separate('plain'), { reasoning: undefined, content: 'plain' });
    assert.deepEqual(a.separate('y</think>z'), { reasoning: 'y', content: 'z' });
  });
});

// ─── extractTokens (OpenAI-compatible + Anthropic native) ───────────────

describe('extractTokens', () => {
  const chunk = (delta: object) => JSON.stringify({ choices: [{ index: 0, delta }] });
  const extract = (data: string) => extractTokens(data, new ThinkTagSeparator());

  it('returns null for the [DONE] sentinel, malformed JSON and empty chunks', () => {
    assert.equal(extract('[DONE]'), null);
    assert.equal(extract('{"choices":[{"delta":{"content":"Hi"'), null);
    assert.equal(extract('{}'), null);
    assert.equal(extract(JSON.stringify({ choices: [] })), null);
    assert.equal(extract(chunk({})), null);
    assert.equal(extract(chunk({ role: 'assistant', content: '' })), null);
  });

  // Regression: `data: null` parsed fine, then reading `.choices` threw a
  // TypeError out of the stream.
  it('returns null for JSON that is not an object', () => {
    for (const data of ['null', '42', '"text"', 'true']) {
      assert.equal(extract(data), null, data);
      assert.equal(extractGeminiNativeTokens(data), null, data);
      assert.equal(extractOpenAIResponsesTokens(data), null, data);
      assert.equal(isOpenAIResponsesDone(data), false, data);
    }
  });

  it('reads delta.content', () => {
    assert.deepEqual(extract(chunk({ content: 'Hello' })), { content: 'Hello' });
  });

  it('uses exactly one reasoning field per chunk, in priority order', () => {
    const details = [
      { type: 'reasoning.text', text: 'C' },
      { type: 'reasoning.summary', summary: 'D' },
      { type: 'reasoning.encrypted', data: 'opaque' },
      null,
    ];
    assert.deepEqual(
      extract(chunk({ reasoning: 'A', reasoning_content: 'B', reasoning_details: details })),
      { reasoning: 'A' },
    );
    assert.deepEqual(
      extract(chunk({ reasoning: '', reasoning_content: 'B', reasoning_details: details })),
      { reasoning: 'B' },
    );
    assert.deepEqual(extract(chunk({ reasoning: null, reasoning_details: details })), { reasoning: 'CD' });
  });

  it('appends think-tag reasoning from content after the reasoning field', () => {
    assert.deepEqual(extract(chunk({ reasoning: 'R1 ', content: '<think>R2</think>Answer' })), {
      reasoning: 'R1 R2',
      content: 'Answer',
    });
  });

  it('carries think-tag state across chunks through the given separator', () => {
    const separator = new ThinkTagSeparator();
    assert.deepEqual(extractTokens(chunk({ content: '<think>par' }), separator), { reasoning: 'par' });
    assert.deepEqual(extractTokens(chunk({ content: 'tial</think>Done' }), separator), {
      reasoning: 'tial',
      content: 'Done',
    });
  });

  it('maps tool call deltas, defaulting the index to 0', () => {
    const toolCalls = [
      { index: 1, id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":' } },
      { function: { arguments: '"x"}' } },
    ];
    assert.deepEqual(extract(chunk({ tool_calls: toolCalls })), {
      toolCalls: [
        { index: 1, id: 'call_1', name: 'search', arguments: '{"q":' },
        { index: 0, id: undefined, name: undefined, arguments: '"x"}' },
      ],
    });
    assert.equal(extract(chunk({ tool_calls: [] })), null);
  });

  it('reads Anthropic text, thinking and tool input deltas', () => {
    const blockDelta = (delta: object) => JSON.stringify({ type: 'content_block_delta', index: 2, delta });
    assert.deepEqual(extract(blockDelta({ type: 'text_delta', text: 'Hi' })), { content: 'Hi' });
    assert.deepEqual(extract(blockDelta({ type: 'thinking_delta', thinking: 'hmm' })), { reasoning: 'hmm' });
    assert.deepEqual(extract(blockDelta({ type: 'input_json_delta', partial_json: '{"a":' })), {
      toolCalls: [{ index: 2, arguments: '{"a":' }],
    });
    assert.equal(extract(blockDelta({ type: 'signature_delta', signature: 'sig' })), null);
  });

  it('does not run Anthropic text through the think-tag separator', () => {
    const data = JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '<think>x</think>' } });
    assert.deepEqual(extract(data), { content: '<think>x</think>' });
  });

  it('reads an Anthropic tool_use block start', () => {
    const start = (block: object) => JSON.stringify({ type: 'content_block_start', index: 1, content_block: block });
    assert.deepEqual(extract(start({ type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {} })), {
      toolCalls: [{ index: 1, id: 'toolu_1', name: 'lookup' }],
    });
    assert.equal(extract(start({ type: 'text', text: '' })), null);
  });

  it('reads OpenAI usage from the final chunk and ignores zero usage', () => {
    assert.deepEqual(
      extract(JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 } })),
      { usage: { promptTokens: 12, completionTokens: 34 } },
    );
    assert.equal(extract(JSON.stringify({ usage: { prompt_tokens: 0, completion_tokens: 0 } })), null);
  });

  it('reads Anthropic input usage from message_start and output usage from message_delta', () => {
    assert.deepEqual(
      extract(JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 25, output_tokens: 1 } } })),
      { usage: { promptTokens: 25, completionTokens: 0 } },
    );
    assert.deepEqual(
      extract(JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 15 } })),
      { usage: { promptTokens: 0, completionTokens: 15 } },
    );
  });
});

// ─── extractGeminiNativeTokens ──────────────────────────────────────────

describe('extractGeminiNativeTokens', () => {
  const gemini = (body: object) => extractGeminiNativeTokens(JSON.stringify(body));
  const parts = (...items: object[]) => ({ candidates: [{ content: { role: 'model', parts: items } }] });

  it('returns null for the [DONE] sentinel and malformed JSON', () => {
    assert.equal(extractGeminiNativeTokens('[DONE]'), null);
    assert.equal(extractGeminiNativeTokens('{"candidates":['), null);
  });

  it('joins text parts, routing thought parts to reasoning', () => {
    assert.deepEqual(gemini(parts({ text: 'Hel' }, { text: 'lo' })), { content: 'Hello' });
    assert.deepEqual(gemini(parts({ text: 'pondering', thought: true }, { text: 'answer' })), {
      reasoning: 'pondering',
      content: 'answer',
    });
    assert.deepEqual(gemini(parts({ text: 'not a thought', thought: 'true' })), { content: 'not a thought' });
  });

  it('skips parts without usable text', () => {
    assert.equal(gemini(parts({ functionCall: { name: 'f', args: {} } }, { text: '' }, { text: 42 })), null);
    assert.equal(gemini({ candidates: [{ finishReason: 'STOP' }] }), null);
  });

  it('reads usageMetadata with or without candidates', () => {
    const usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 3 };
    assert.deepEqual(gemini({ ...parts({ text: 'x' }), usageMetadata }), {
      content: 'x',
      usage: { promptTokens: 10, completionTokens: 3 },
    });
    assert.deepEqual(gemini({ usageMetadata }), { usage: { promptTokens: 10, completionTokens: 3 } });
    assert.deepEqual(gemini({ candidates: [], usageMetadata }), { usage: { promptTokens: 10, completionTokens: 3 } });
    assert.equal(gemini({ usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 } }), null);
  });
});

// ─── OpenAI Responses API ───────────────────────────────────────────────

describe('extractOpenAIResponsesTokens', () => {
  const responses = (body: object) => extractOpenAIResponsesTokens(JSON.stringify(body));

  it('returns null for the [DONE] sentinel, malformed JSON and unrelated events', () => {
    assert.equal(extractOpenAIResponsesTokens('[DONE]'), null);
    assert.equal(extractOpenAIResponsesTokens('{"type":'), null);
    assert.equal(responses({ type: 'response.created', response: {} }), null);
    assert.equal(responses({ type: 'response.output_text.delta', delta: 42 }), null);
  });

  it('reads text and reasoning deltas', () => {
    assert.deepEqual(responses({ type: 'response.output_text.delta', delta: 'Hi' }), { content: 'Hi' });
    assert.deepEqual(responses({ type: 'response.reasoning_text.delta', delta: 'raw' }), { reasoning: 'raw' });
    assert.deepEqual(responses({ type: 'response.reasoning_summary_text.delta', delta: 'sum' }), { reasoning: 'sum' });
  });

  it('separates reasoning summary parts after the first', () => {
    const partAdded = (summary_index?: number) => responses({ type: 'response.reasoning_summary_part.added', summary_index });
    assert.equal(partAdded(), null);
    assert.equal(partAdded(0), null);
    assert.deepEqual(partAdded(1), { reasoning: '\n\n' });
  });

  it('reads finished function calls, preferring call_id over the item id', () => {
    const done = (item: object, output_index?: number) =>
      responses({ type: 'response.output_item.done', output_index, item });
    const call = { type: 'function_call', id: 'fc_1', name: 'search', arguments: '{"q":"x"}' };

    assert.deepEqual(done({ ...call, call_id: 'call_1' }, 2), {
      toolCalls: [{ index: 2, id: 'call_1', name: 'search', arguments: '{"q":"x"}' }],
    });
    assert.deepEqual(done({ ...call, call_id: '' }), {
      toolCalls: [{ index: 0, id: 'fc_1', name: 'search', arguments: '{"q":"x"}' }],
    });
    assert.equal(done({ type: 'message', id: 'msg_1', content: [] }), null);
  });

  it('reads usage from response.completed', () => {
    assert.deepEqual(
      responses({ type: 'response.completed', response: { usage: { input_tokens: 100, output_tokens: 20 } } }),
      { usage: { promptTokens: 100, completionTokens: 20 } },
    );
    assert.equal(responses({ type: 'response.completed', response: {} }), null);
  });
});

describe('isOpenAIResponsesDone', () => {
  it('is true for [DONE] and terminal response events', () => {
    assert.equal(isOpenAIResponsesDone('[DONE]'), true);
    for (const type of ['response.completed', 'response.failed', 'response.incomplete']) {
      assert.equal(isOpenAIResponsesDone(JSON.stringify({ type })), true, type);
    }
  });

  it('is false for other events and unparseable data', () => {
    assert.equal(isOpenAIResponsesDone(JSON.stringify({ type: 'response.output_text.delta', delta: 'x' })), false);
    assert.equal(isOpenAIResponsesDone('{"type":'), false);
    assert.equal(isOpenAIResponsesDone('null'), false);
  });
});
