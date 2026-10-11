import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Conversation, Message } from '@/types';
import type { OpenAIToolSchema, ToolExecutionContext } from '@/lib/tools/types';
import type { StreamConfig } from '@/lib/providers/types';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import type { ToolExecutionOutcome } from '@/lib/tools/orchestrator';
import { normalizeAskUserChoiceToolCall } from '@/lib/tools/ask-user-choice';
import { estimateTokens } from '@/lib/tokens/estimator';
import { serializeResponseTokenMetrics } from '@/lib/tokens/metrics';
import {
  captureInterruptedResponse,
  createTurnRunner,
  type TurnDeps,
  type TurnInput,
  type TurnSettings,
} from './run-turn';
import {
  ASK_USER_CHOICE_INSTRUCTION,
  CHOICE_PROMPT_FALLBACK,
  IMAGE_GEN_INSTRUCTION,
  MAX_TOOL_ROUNDS,
  TOOL_LIMIT_FALLBACK,
  TOOL_USE_INSTRUCTION,
} from './turn-config';

// ─── Fakes ──────────────────────────────────────────────────────────────

const CONV_ID = 'conv-1';
const API_KEY = 'sk-test';
const MODEL = 'test-model';
const COST = 0.25;

type Effect = [name: string, ...args: unknown[]];
type AddMessageArgs = Parameters<TurnDeps['db']['addMessage']>;

interface StreamCall {
  messages: Message[];
  config: StreamConfig;
  onContent: (token: string) => void;
  onReasoning: (token: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  onToolCalls?: (toolCalls: AccumulatedToolCall[]) => void;
  onUsage?: (usage: UsageData) => void;
  abortCount: number;
}

function makeMessage(fields: Pick<Message, 'id' | 'role' | 'content'> & Partial<Message>): Message {
  return {
    conversation_id: CONV_ID,
    reasoning: null,
    attachments: null,
    status: 'complete',
    model: MODEL,
    tokens_used: null,
    tool_call_id: null,
    tool_calls: null,
    created_at: 0,
    ...fields,
  };
}

function makeConversation(fields: Partial<Conversation> = {}): Conversation {
  return {
    id: CONV_ID,
    title: 'Chat',
    model: null,
    provider: 'openrouter',
    system_prompt: null,
    thinking_mode: null,
    rules: null,
    active_skill_name: null,
    app_id: null,
    created_at: 0,
    updated_at: 0,
    pinned: 0,
    temporary: 0,
    ...fields,
  };
}

const USER_MESSAGE = makeMessage({ id: 'user-1', role: 'user', content: 'What is 2+2?' });
const SYSTEM_MESSAGE = makeMessage({ id: 'system-1', role: 'system', content: 'ignored' });

function schema(name: string): OpenAIToolSchema {
  return {
    type: 'function',
    function: { name, description: name, parameters: { type: 'object', properties: {}, required: [] } },
  };
}

function successOutcome(call: AccumulatedToolCall): ToolExecutionOutcome {
  return {
    call,
    status: 'success',
    durationMs: 1,
    content: `result:${call.id}`,
    display: { kind: 'generic', title: call.name },
  };
}

interface HarnessOptions {
  conversation?: Conversation | null;
  history?: Message[];
  apiKey?: string | null;
  hasProvider?: boolean;
  registeredToolCount?: number;
  basePrompt?: string | undefined;
  skillAllowedTools?: Record<string, string[] | null>;
  thinkingDurationMs?: number | null;
  appNames?: Record<string, string>;
  executeToolCall?: (call: AccumulatedToolCall, context: ToolExecutionContext) => Promise<ToolExecutionOutcome>;
}

function createHarness(options: HarnessOptions = {}) {
  const effects: Effect[] = [];
  const record = (name: string, ...args: unknown[]) => {
    effects.push([name, ...args]);
  };
  const rows: Message[] = [...(options.history ?? [SYSTEM_MESSAGE, USER_MESSAGE])];
  const streamCalls: StreamCall[] = [];
  const store = { messageId: null as string | null, content: '', reasoning: '' };
  const conversation = options.conversation === undefined ? makeConversation() : options.conversation;
  const apiKey = options.apiKey === undefined ? API_KEY : options.apiKey;
  let clock = 0;
  let nextId = 0;

  const deps: TurnDeps = {
    clock: { now: () => clock },
    providers: {
      getApiKey: async (providerId) => {
        record('getApiKey', providerId);
        return apiKey;
      },
      getProvider: (providerId) => {
        if (options.hasProvider === false) return undefined;
        return {
          stream: (messages, config, onContent, onReasoning, onDone, onError, onToolCalls, onUsage) => {
            record('provider.stream', providerId);
            const call: StreamCall = {
              messages, config, onContent, onReasoning, onDone, onError, onToolCalls, onUsage, abortCount: 0,
            };
            streamCalls.push(call);
            return { abort: () => { call.abortCount += 1; }, reasoningContent: '' };
          },
        };
      },
    },
    db: {
      getConversation: () => conversation,
      touchConversation: (id) => record('touchConversation', id),
      getAppName: (appId) => {
        record('getAppName', appId);
        return options.appNames?.[appId];
      },
      addMessage: (...args: AddMessageArgs) => {
        record('addMessage', ...args);
        const [conversationId, role, content, model, , toolCallId, toolCalls] = args;
        const id = `msg-${++nextId}`;
        rows.push(makeMessage({
          id,
          conversation_id: conversationId,
          role,
          content,
          model: model ?? null,
          tool_call_id: toolCallId ?? null,
          tool_calls: toolCalls ?? null,
          created_at: clock,
        }));
        return id;
      },
      updateMessage: (id, fields) => {
        record('updateMessage', id, fields);
        const index = rows.findIndex((row) => row.id === id);
        if (index !== -1) rows[index] = { ...rows[index], ...fields };
      },
      getMessages: () => rows.map((row) => ({ ...row })),
    },
    prompts: {
      composeSystemPrompt: (...args) => {
        record('composeSystemPrompt', ...args);
        return 'basePrompt' in options ? options.basePrompt : 'BASE';
      },
      getMemoryToolInstruction: (autoExtraction) => `MEMORY(${autoExtraction})`,
      chatHistoryToolInstruction: 'HISTORY',
      getSkillAllowedTools: (skillName) => {
        record('getSkillAllowedTools', skillName);
        return options.skillAllowedTools?.[skillName] ?? null;
      },
    },
    tools: {
      countRegistered: () => options.registeredToolCount ?? 10,
      getOpenAIToolSchemas: (names) => names.map(schema),
      getAnthropicToolSchemas: (names) => names.map((name) => ({ name, description: name, input_schema: {} })),
      executeToolCall: async (call, context) => {
        record('executeToolCall', call, context);
        return options.executeToolCall ? options.executeToolCall(call, context) : successOutcome(call);
      },
    },
    usage: {
      calculateCost: (...args) => {
        record('calculateCost', ...args);
        return COST;
      },
      recordUsage: (...args) => record('recordUsage', ...args),
    },
    memory: {
      scheduleMemoryExtraction: (request) => record('scheduleMemoryExtraction', request),
      scheduleProfileRefresh: (context) => record('scheduleProfileRefresh', context),
    },
    streaming: {
      startStreaming: (messageId) => {
        record('startStreaming', messageId);
        store.messageId = messageId;
        store.content = '';
        store.reasoning = '';
      },
      // Per-token store writes are tracked in `store`, not the effect log.
      appendToken: (token) => { store.content += token; },
      appendReasoningToken: (token) => { store.reasoning += token; },
      setStreamingActivity: (activity) => record('setStreamingActivity', activity),
      setStreamingTokensPerSecond: (tokensPerSecond) => record('setStreamingTokensPerSecond', tokensPerSecond),
      startToolActivity: (messageId, activity) => record('startToolActivity', messageId, activity),
      stopToolActivity: (messageId) => record('stopToolActivity', messageId),
      stopStreaming: () => {
        record('stopStreaming');
        store.messageId = null;
      },
      setError: (error) => record('setError', error),
      getThinkingDurationMs: () => options.thinkingDurationMs ?? null,
      flushStreaming: () => ({ content: store.content, reasoning: store.reasoning }),
      getStreamingMessageId: () => store.messageId,
    },
    view: {
      appendMessage: (message) => record('view.append', message),
      patchMessage: (messageId, fields) => record('view.patch', messageId, fields),
      replaceMessages: (messages) => record('view.replace', messages.map((m) => m.id)),
      onFirstOutput: () => record('haptic'),
    },
  };

  const runner = createTurnRunner(deps);

  return {
    deps,
    runner,
    rows,
    store,
    streamCalls,
    effects,
    setClock: (value: number) => { clock = value; },
    /** Names of recorded effects, in order. */
    names: () => effects.map(([name]) => name),
    /** Arguments of every effect with this name. */
    calls: (name: string) => effects.filter(([effect]) => effect === name).map(([, ...args]) => args),
    clearEffects: () => { effects.length = 0; },
    row: (id: string) => rows.find((row) => row.id === id),
    stream: (index = streamCalls.length - 1) => {
      const call = streamCalls[index];
      assert.ok(call, `expected provider.stream call #${index}`);
      return call;
    },
  };
}

const DEFAULT_SETTINGS: TurnSettings = {
  lastProvider: 'openrouter',
  lastModel: MODEL,
  thinkingMode: 'auto',
  webSearchEnabled: false,
  memoryEnabled: true,
  memoryAutoEnabled: true,
  memoryChatHistoryEnabled: false,
  imageGenEnabled: false,
};

function turnInput(overrides: Partial<Omit<TurnInput, 'settings'>> & { settings?: Partial<TurnSettings> } = {}): TurnInput {
  return {
    conversationId: CONV_ID,
    app: null,
    activeSkillName: null,
    ...overrides,
    settings: { ...DEFAULT_SETTINGS, ...overrides.settings },
  };
}

const webSearchCall = (id = 'call-1'): AccumulatedToolCall => ({
  id,
  name: 'web_search',
  arguments: { query: 'weather' },
});

const choiceCall: AccumulatedToolCall = {
  id: 'choice-1',
  name: 'ask_user_choice',
  arguments: {
    questions: [{ header: 'Size', question: 'Which size?', options: [{ label: 'Small' }, { label: 'Large' }] }],
  },
};

/** The tools a default turn (memory on, nothing else toggled) offers. */
const DEFAULT_TOOL_NAMES = ['ask_user_choice', 'save_memory', 'update_memory', 'forget_memory'];

function toolNamesOf(config: StreamConfig): string[] | undefined {
  return config.tools?.map((tool) => tool.function.name);
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('runTurn: plain reply', () => {
  it('creates a streaming placeholder, then streams with the composed config', async () => {
    const h = createHarness();
    h.setClock(500);
    await h.runner.run(turnInput());

    assert.deepEqual(h.effects, [
      ['getApiKey', 'openrouter'],
      ['composeSystemPrompt', CONV_ID, null, null, { recordMemoryUse: true }],
      ['addMessage', CONV_ID, 'assistant', '', MODEL],
      ['updateMessage', 'msg-1', { status: 'streaming' }],
      ['view.append', makeMessage({ id: 'msg-1', role: 'assistant', content: '', status: 'streaming', created_at: 500 })],
      ['startStreaming', 'msg-1'],
      ['provider.stream', 'openrouter'],
    ]);

    const call = h.stream();
    // System messages and the placeholder itself stay out of the request.
    assert.deepEqual(call.messages.map((m) => m.id), ['user-1']);
    assert.deepEqual(call.config, {
      model: MODEL,
      apiKey: API_KEY,
      systemPrompt: `BASE\n\nMEMORY(true)\n\n${ASK_USER_CHOICE_INSTRUCTION}\n\n${TOOL_USE_INSTRUCTION}`,
      thinkingMode: 'auto',
      tools: DEFAULT_TOOL_NAMES.map(schema),
      anthropicTools: undefined,
    });
    assert.equal(typeof call.onToolCalls, 'function');
    assert.equal(typeof call.onUsage, 'function');
  });

  it('saves the answer, records usage, and schedules memory work in order', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    const call = h.stream();
    h.clearEffects();

    h.setClock(1000);
    call.onContent('Hel');
    h.setClock(1200);
    call.onContent('lo');
    call.onUsage!({ promptTokens: 10, completionTokens: 5 });
    h.setClock(3000);
    call.onDone();

    const tokensUsed = serializeResponseTokenMetrics({ prompt: 10, completion: 5, tokensPerSecond: 5 / 2 });
    const saved = { content: 'Hello', reasoning: null, status: 'complete', tokens_used: tokensUsed };
    assert.deepEqual(h.effects, [
      ['haptic'],
      ['setStreamingActivity', 'Writing response'],
      ['calculateCost', 10, 5, MODEL],
      ['updateMessage', 'msg-1', saved],
      ['recordUsage', CONV_ID, 'msg-1', MODEL, 10, 5, COST],
      ['touchConversation', CONV_ID],
      ['view.patch', 'msg-1', saved],
      ['stopStreaming'],
      ['scheduleMemoryExtraction', {
        conversationId: CONV_ID,
        userMessageId: 'user-1',
        assistantMessageId: 'msg-1',
        userText: 'What is 2+2?',
        assistantText: 'Hello',
        providerId: 'openrouter',
        apiKey: API_KEY,
        chatModel: MODEL,
        project: null,
      }],
      ['scheduleProfileRefresh', {
        providerId: 'openrouter',
        apiKey: API_KEY,
        chatModel: MODEL,
        usageTarget: { conversationId: CONV_ID, messageId: 'msg-1' },
      }],
    ]);
    assert.equal(h.store.content, 'Hello');
  });

  it('skips recordUsage when the provider reported no usage', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    h.stream().onContent('Hi');
    h.stream().onDone();

    assert.deepEqual(h.calls('calculateCost'), [[0, 0, MODEL]]);
    assert.deepEqual(h.calls('recordUsage'), []);
  });

  it('throttles the tokens/s readout and estimates until usage arrives', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    const call = h.stream();

    h.setClock(1000);
    call.onContent('aaaa');
    h.setClock(1749); // under 750ms since the first token
    call.onContent('bbbb');
    h.setClock(1750);
    call.onContent('cccc');
    h.setClock(2249); // under 500ms since the last update
    call.onContent('dddd');
    call.onUsage!({ promptTokens: 1, completionTokens: 30 });
    h.setClock(2250);
    call.onContent('eeee');

    assert.deepEqual(h.calls('setStreamingTokensPerSecond'), [
      [estimateTokens('aaaabbbbcccc\n') / 0.75],
      [30 / 1.25],
    ]);
  });

  it('does nothing without an API key', async () => {
    const h = createHarness({ apiKey: null });
    await h.runner.run(turnInput());
    assert.deepEqual(h.effects, [['getApiKey', 'openrouter']]);
  });

  it('does nothing when the provider is not registered', async () => {
    const h = createHarness({ hasProvider: false });
    await h.runner.run(turnInput());
    assert.deepEqual(h.effects, [['getApiKey', 'openrouter']]);
  });
});

describe('runTurn: request config', () => {
  it('prefers the app provider and model over settings', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ app: { provider: 'anthropic', model: 'claude-x', name: 'Recipes' } }));

    assert.deepEqual(h.calls('getApiKey'), [['anthropic']]);
    assert.equal(h.stream().config.model, 'claude-x');
    // Anthropic also gets its own schema format.
    assert.deepEqual(
      h.stream().config.anthropicTools,
      DEFAULT_TOOL_NAMES.map((name) => ({ name, description: name, input_schema: {} }))
    );
  });

  it('falls back to the default provider and its default model', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ settings: { lastProvider: null, lastModel: null } }));

    assert.deepEqual(h.calls('getApiKey'), [['openrouter']]);
    assert.equal(h.stream().config.model, 'google/gemini-2.0-flash-exp:free');
  });

  it('uses the conversation thinking mode over the setting', async () => {
    const h = createHarness({ conversation: makeConversation({ thinking_mode: 'off' }) });
    await h.runner.run(turnInput({ settings: { thinkingMode: 'on' } }));
    assert.equal(h.stream().config.thinkingMode, 'off');
  });

  it('passes the conversation system prompt to composeSystemPrompt', async () => {
    const h = createHarness({ conversation: makeConversation({ system_prompt: 'Be brief.' }) });
    await h.runner.run(turnInput());
    assert.deepEqual(h.calls('composeSystemPrompt'), [[CONV_ID, 'Be brief.', null, { recordMemoryUse: true }]]);
  });

  it('adds image and chat-history guidance and tools when enabled', async () => {
    const h = createHarness({ basePrompt: undefined });
    await h.runner.run(turnInput({
      settings: { webSearchEnabled: true, memoryChatHistoryEnabled: true, imageGenEnabled: true, memoryAutoEnabled: false },
    }));

    const { config } = h.stream();
    assert.equal(
      config.systemPrompt,
      `MEMORY(false)\nHISTORY\n\n${IMAGE_GEN_INSTRUCTION}\n\n${ASK_USER_CHOICE_INSTRUCTION}\n\n${TOOL_USE_INSTRUCTION}`
    );
    assert.deepEqual(toolNamesOf(config), [
      'ask_user_choice',
      'web_search',
      'deep_research',
      'save_memory',
      'update_memory',
      'forget_memory',
      'search_past_chats',
      'recent_chats',
      'generate_image',
    ]);
  });

  it('sends no tools and no tool-call handler when none are registered', async () => {
    const h = createHarness({ registeredToolCount: 0 });
    await h.runner.run(turnInput({ settings: { memoryEnabled: false } }));

    const call = h.stream();
    assert.deepEqual(call.config, {
      model: MODEL,
      apiKey: API_KEY,
      systemPrompt: `BASE\n\n${ASK_USER_CHOICE_INSTRUCTION}`,
      thinkingMode: 'auto',
    });
    assert.equal(call.onToolCalls, undefined);
  });
});

describe('runTurn: reasoning', () => {
  it('saves reasoning with its duration and writes activity only for answer tokens', async () => {
    const h = createHarness({ thinkingDurationMs: 1234 });
    await h.runner.run(turnInput());
    const call = h.stream();
    h.clearEffects();

    h.setClock(1000);
    call.onReasoning('Let me ');
    call.onReasoning('think.');
    h.setClock(1500);
    call.onContent('Four.');
    h.setClock(2000);
    call.onDone();

    const tokensPerSecond = estimateTokens('Four.\nLet me think.') / 1;
    const saved = {
      content: 'Four.',
      reasoning: 'Let me think.',
      status: 'complete',
      tokens_used: serializeResponseTokenMetrics({ prompt: 0, completion: 0, tokensPerSecond, reasoningMs: 1234 }),
    };
    assert.deepEqual(h.names().slice(0, 2), ['haptic', 'setStreamingActivity']);
    assert.deepEqual(h.calls('haptic').length, 1);
    assert.deepEqual(h.calls('setStreamingActivity'), [['Writing response']]);
    assert.deepEqual(h.calls('updateMessage'), [['msg-1', saved]]);
    assert.equal(h.store.reasoning, 'Let me think.');
  });

  it('leaves reasoningMs out when the model did not reason', async () => {
    const h = createHarness({ thinkingDurationMs: 999 });
    await h.runner.run(turnInput());
    h.stream().onContent('   ');
    h.stream().onReasoning('  ');
    h.stream().onDone();

    const [[, fields]] = h.calls('updateMessage').slice(-1);
    assert.deepEqual(fields, { content: '   ', reasoning: '  ', status: 'complete', tokens_used: null });
  });
});

describe('runTurn: tool rounds', () => {
  it('runs the tools, saves results, then streams the final answer', async () => {
    const h = createHarness();
    const input = turnInput({ settings: { webSearchEnabled: true } });
    await h.runner.run(input);
    const first = h.stream();
    h.setClock(100);
    first.onContent('Let me check.');
    h.clearEffects();

    h.setClock(200);
    await first.onToolCalls!([webSearchCall()]);

    const toolRoundFields = {
      content: 'Let me check.',
      reasoning: null,
      status: 'complete',
      tool_calls: JSON.stringify([webSearchCall()]),
    };
    assert.deepEqual(h.effects, [
      ['setStreamingActivity', 'Checking sources'],
      ['updateMessage', 'msg-1', toolRoundFields],
      ['view.patch', 'msg-1', toolRoundFields],
      ['stopStreaming'],
      ['startToolActivity', 'msg-1', 'Checking sources'],
      ['executeToolCall', webSearchCall(), { conversationId: CONV_ID }],
      ['addMessage', CONV_ID, 'tool', 'result:call-1', MODEL, null, 'call-1', JSON.stringify({ kind: 'generic', title: 'web_search' })],
      ['view.replace', ['system-1', 'user-1', 'msg-1', 'msg-2']],
      ['stopToolActivity', 'msg-1'],
      // Round 2 re-sends the turn without counting memory use again.
      ['getApiKey', 'openrouter'],
      ['composeSystemPrompt', CONV_ID, null, null, { recordMemoryUse: false }],
      ['addMessage', CONV_ID, 'assistant', '', MODEL],
      ['updateMessage', 'msg-3', { status: 'streaming' }],
      ['view.append', makeMessage({ id: 'msg-3', role: 'assistant', content: '', status: 'streaming', created_at: 200 })],
      ['startStreaming', 'msg-3'],
      ['provider.stream', 'openrouter'],
    ]);

    const second = h.stream(1);
    assert.deepEqual(second.messages.map((m) => m.id), ['user-1', 'msg-1', 'msg-2']);
    assert.deepEqual(second.config, h.stream(0).config);

    second.onContent('Sunny.');
    second.onDone();
    assert.equal(h.row('msg-3')?.content, 'Sunny.');
    assert.equal(h.row('msg-3')?.status, 'complete');
    assert.equal(h.calls('scheduleMemoryExtraction').length, 1);
  });

  it('labels a silent tool round and keeps its reasoning time', async () => {
    const h = createHarness({ thinkingDurationMs: 800 });
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));
    h.stream().onReasoning('Need data.');
    h.clearEffects();
    await h.stream().onToolCalls!([webSearchCall('a'), { id: 'b', name: 'deep_research', arguments: {} }]);

    assert.deepEqual(h.calls('updateMessage')[0], ['msg-1', {
      content: 'Checking web search and deep research...',
      reasoning: 'Need data.',
      status: 'complete',
      tool_calls: JSON.stringify([webSearchCall('a'), { id: 'b', name: 'deep_research', arguments: {} }]),
      tokens_used: serializeResponseTokenMetrics({ prompt: 0, completion: 0, reasoningMs: 800 }),
    }]);
  });

  it('saves parallel tool results in the order the model emitted them', async () => {
    const h = createHarness({
      executeToolCall: async (call) => {
        // The first call finishes last.
        if (call.id === 'slow') await new Promise((resolve) => setTimeout(resolve, 5));
        return successOutcome(call);
      },
    });
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));
    await h.stream().onToolCalls!([webSearchCall('slow'), webSearchCall('fast')]);

    const toolRows = h.calls('addMessage').filter(([, role]) => role === 'tool');
    assert.deepEqual(toolRows.map((args) => args[5]), ['slow', 'fast']);
  });

  it(`stops after ${MAX_TOOL_ROUNDS} tool rounds and answers with a fallback`, async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      await h.stream(round).onToolCalls!([webSearchCall(`call-${round}`)]);
    }
    assert.equal(h.streamCalls.length, MAX_TOOL_ROUNDS + 1);
    h.clearEffects();

    await h.stream().onToolCalls!([webSearchCall('one-too-many')]);

    assert.equal(h.streamCalls.length, MAX_TOOL_ROUNDS + 1);
    assert.equal(h.calls('executeToolCall').length, 0);
    const last = h.rows[h.rows.length - 1];
    assert.equal(last.role, 'assistant');
    assert.equal(last.content, TOOL_LIMIT_FALLBACK);
    assert.equal(last.status, 'complete');
    assert.equal(last.tool_calls, null);
    assert.deepEqual(h.names().slice(0, 2), ['calculateCost', 'updateMessage']);
  });

  it('keeps streamed text instead of the fallback at the limit', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      await h.stream(round).onToolCalls!([webSearchCall(`call-${round}`)]);
    }
    h.stream().onContent('Here is what I found.');
    await h.stream().onToolCalls!([webSearchCall('extra')]);

    assert.equal(h.rows[h.rows.length - 1].content, 'Here is what I found.');
  });

  it('counts memory use only on the first round of each turn', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));
    await h.stream().onToolCalls!([webSearchCall()]);
    h.stream().onDone();
    await h.runner.run(turnInput());

    assert.deepEqual(
      h.calls('composeSystemPrompt').map((args) => args[3]),
      [{ recordMemoryUse: true }, { recordMemoryUse: false }, { recordMemoryUse: true }]
    );
  });
});

describe('runTurn: ask_user_choice', () => {
  it('parks the reply as waiting without running tools', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));
    h.stream().onContent('Quick question.');
    h.clearEffects();

    await h.stream().onToolCalls!([webSearchCall(), choiceCall]);

    const fields = {
      content: 'Quick question.',
      reasoning: null,
      status: 'waiting',
      tool_calls: JSON.stringify([normalizeAskUserChoiceToolCall(choiceCall)!.call]),
    };
    assert.deepEqual(h.effects, [
      ['updateMessage', 'msg-1', fields],
      ['touchConversation', CONV_ID],
      ['view.patch', 'msg-1', fields],
      ['stopStreaming'],
    ]);
    assert.equal(h.streamCalls.length, 1);
  });

  it('uses a fallback prompt when the model wrote nothing', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    await h.stream().onToolCalls!([choiceCall]);
    assert.equal(h.row('msg-1')?.content, CHOICE_PROMPT_FALLBACK);
    assert.equal(h.row('msg-1')?.status, 'waiting');
  });

  it('treats a malformed choice call as an ordinary tool call', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    const malformed: AccumulatedToolCall = { id: 'bad', name: 'ask_user_choice', arguments: {} };
    await h.stream().onToolCalls!([malformed]);

    assert.deepEqual(h.calls('executeToolCall'), [[malformed, { conversationId: CONV_ID }]]);
    assert.equal(h.streamCalls.length, 2);
  });
});

describe('runTurn: errors', () => {
  it('saves the prefixed error but shows the bare message', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    h.clearEffects();
    h.stream().onError(new Error('Rate limited'));

    assert.deepEqual(h.effects, [
      ['updateMessage', 'msg-1', { content: 'Error: Rate limited', reasoning: null, status: 'error' }],
      ['touchConversation', CONV_ID],
      ['setError', 'Rate limited'],
      ['view.patch', 'msg-1', { content: 'Rate limited', reasoning: null, status: 'error' }],
    ]);
  });

  it('keeps partial output and reasoning time on error', async () => {
    const h = createHarness({ thinkingDurationMs: 300 });
    await h.runner.run(turnInput());
    h.stream().onReasoning('Hmm');
    h.stream().onContent('Partial');
    h.clearEffects();
    h.stream().onError(new Error('Connection reset'));

    assert.deepEqual(h.calls('updateMessage'), [['msg-1', {
      content: 'Partial',
      reasoning: 'Hmm',
      status: 'error',
      tokens_used: serializeResponseTokenMetrics({ prompt: 0, completion: 0, reasoningMs: 300 }),
    }]]);
    assert.deepEqual(h.calls('view.patch'), [['msg-1', { content: 'Partial', reasoning: 'Hmm', status: 'error' }]]);
    assert.deepEqual(h.calls('recordUsage'), []);
    assert.deepEqual(h.calls('scheduleMemoryExtraction'), []);
  });
});

describe('runTurn: stop and interrupt', () => {
  it('aborts the request and saves what streamed as cancelled', async () => {
    const h = createHarness({ thinkingDurationMs: 450 });
    await h.runner.run(turnInput());
    h.stream().onReasoning('Thinking');
    h.stream().onContent('Half an ans');
    h.clearEffects();

    assert.equal(h.runner.interrupt(), true);

    const fields = {
      content: 'Half an ans',
      reasoning: 'Thinking',
      status: 'cancelled',
      tokens_used: serializeResponseTokenMetrics({ prompt: 0, completion: 0, reasoningMs: 450 }),
    };
    assert.equal(h.stream().abortCount, 1);
    // Stopping the stream in the store is left to the caller.
    assert.deepEqual(h.effects, [
      ['updateMessage', 'msg-1', fields],
      ['view.patch', 'msg-1', fields],
    ]);
  });

  it('aborts once and saves nothing when no response is streaming', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    h.stream().onContent('Done');
    h.stream().onDone();
    h.clearEffects();

    assert.equal(h.runner.interrupt(), false);
    assert.equal(h.runner.interrupt(), false);
    assert.equal(h.stream().abortCount, 1);
    assert.deepEqual(h.effects, []);
  });

  it('interrupt() aborts the latest round', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));
    await h.stream().onToolCalls!([webSearchCall()]);
    h.runner.interrupt();

    assert.equal(h.stream(0).abortCount, 0);
    assert.equal(h.stream(1).abortCount, 1);
  });

  // Pre-refactor behavior, kept for parity: while tools run the stream is
  // already stopped, so an interrupt finds nothing to abort and the follow-up
  // round still starts once the tools finish. The only way to interrupt then
  // is backgrounding the app (Stop is hidden while isStreaming is false), and
  // whether that should drop the answer is a product call, so this pins the
  // current behavior. Change the expected count if that decision changes.
  it('an interrupt during tool execution still runs the follow-up round', async () => {
    let releaseTool = () => {};
    const h = createHarness({
      executeToolCall: async (call) => {
        await new Promise<void>((resolve) => { releaseTool = resolve; });
        return successOutcome(call);
      },
    });
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));
    const toolRound = h.stream().onToolCalls!([webSearchCall()]);
    await Promise.resolve();

    assert.equal(h.runner.interrupt(), false);
    releaseTool();
    await toolRound;

    assert.equal(h.streamCalls.length, 2);
  });
});

describe('captureInterruptedResponse', () => {
  it('returns null when nothing is streaming', () => {
    assert.equal(captureInterruptedResponse({
      getStreamingMessageId: () => null,
      flushStreaming: () => assert.fail('must not flush'),
      getThinkingDurationMs: () => 1,
    }), null);
  });

  it('omits reasoning and its timing when there was none', () => {
    assert.deepEqual(captureInterruptedResponse({
      getStreamingMessageId: () => 'm1',
      flushStreaming: () => ({ content: 'Hi', reasoning: '' }),
      getThinkingDurationMs: () => assert.fail('no reasoning, no duration'),
    }), { messageId: 'm1', fields: { content: 'Hi', reasoning: null, status: 'cancelled' } });
  });
});

describe('runTurn: usage', () => {
  it('accumulates usage across tool rounds and records it on the final message', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ settings: { webSearchEnabled: true } }));
    h.stream().onUsage!({ promptTokens: 100, completionTokens: 20 });
    await h.stream().onToolCalls!([webSearchCall()]);

    const final = h.stream();
    h.setClock(1000);
    final.onContent('Answer');
    final.onUsage!({ promptTokens: 150, completionTokens: 30 });
    h.setClock(3000);
    final.onDone();

    assert.deepEqual(h.calls('calculateCost'), [[250, 50, MODEL]]);
    assert.deepEqual(h.calls('recordUsage'), [[CONV_ID, 'msg-3', MODEL, 250, 50, COST]]);
    // Speed uses only the final round's completion tokens.
    assert.equal(
      h.row('msg-3')?.tokens_used,
      serializeResponseTokenMetrics({ prompt: 250, completion: 50, tokensPerSecond: 30 / 2 })
    );
    // The tool round's message carries no usage of its own.
    assert.equal(h.row('msg-1')?.tokens_used, null);
  });

  it('starts each turn from zero', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    h.stream().onUsage!({ promptTokens: 100, completionTokens: 20 });
    h.stream().onDone();
    await h.runner.run(turnInput());
    h.stream().onUsage!({ promptTokens: 7, completionTokens: 3 });
    h.stream().onDone();

    assert.deepEqual(h.calls('recordUsage').map((args) => args.slice(3, 5)), [[100, 20], [7, 3]]);
  });
});

describe('runTurn: memory', () => {
  it('skips extraction but still refreshes the profile after a memory tool ran', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    await h.stream().onToolCalls!([{ id: 'mem', name: 'save_memory', arguments: { content: 'Likes tea' } }]);
    h.stream().onContent('Noted.');
    h.stream().onDone();

    assert.deepEqual(h.calls('scheduleMemoryExtraction'), []);
    assert.equal(h.calls('scheduleProfileRefresh').length, 1);
  });

  it('extracts again on the next turn after a memory tool turn', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    await h.stream().onToolCalls!([{ id: 'mem', name: 'forget_memory', arguments: { id: 'x' } }]);
    h.stream().onContent('Forgotten.');
    h.stream().onDone();
    await h.runner.run(turnInput());
    h.stream().onContent('Hi again.');
    h.stream().onDone();

    assert.equal(h.calls('scheduleMemoryExtraction').length, 1);
  });

  it('keeps temporary chats out of memory entirely', async () => {
    const h = createHarness({ conversation: makeConversation({ temporary: 1 }) });
    await h.runner.run(turnInput({ settings: { memoryChatHistoryEnabled: true } }));
    const call = h.stream();

    assert.deepEqual(toolNamesOf(call.config), ['ask_user_choice']);
    assert.equal(call.config.systemPrompt, `BASE\n\n${ASK_USER_CHOICE_INSTRUCTION}`);
    call.onContent('Sure.');
    call.onDone();
    assert.deepEqual(h.calls('scheduleMemoryExtraction'), []);
    assert.deepEqual(h.calls('scheduleProfileRefresh'), []);
  });

  it('skips memory work when memory is off', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ settings: { memoryEnabled: false } }));
    h.stream().onContent('Sure.');
    h.stream().onDone();

    assert.deepEqual(h.calls('scheduleMemoryExtraction'), []);
    assert.deepEqual(h.calls('scheduleProfileRefresh'), []);
  });

  it('skips memory work for a blank answer', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    h.stream().onContent('  \n');
    h.stream().onDone();

    assert.deepEqual(h.calls('scheduleMemoryExtraction'), []);
    assert.deepEqual(h.calls('scheduleProfileRefresh'), []);
  });

  it('refreshes the profile but cannot extract without a user message', async () => {
    const h = createHarness({ history: [] });
    await h.runner.run(turnInput());
    h.stream().onContent('Welcome!');
    h.stream().onDone();

    assert.deepEqual(h.calls('scheduleMemoryExtraction'), []);
    assert.equal(h.calls('scheduleProfileRefresh').length, 1);
  });

  it('names the project from the open app, then the database, then a placeholder', async () => {
    const projectFor = async (app: TurnInput['app'], appNames?: Record<string, string>) => {
      const h = createHarness({ conversation: makeConversation({ app_id: 'app-1' }), appNames });
      await h.runner.run(turnInput({ app }));
      h.stream().onContent('Ok.');
      h.stream().onDone();
      const [[request]] = h.calls('scheduleMemoryExtraction') as [[{ project: unknown }]];
      return { project: request.project, lookups: h.calls('getAppName') };
    };

    assert.deepEqual(
      await projectFor({ provider: null, model: null, name: 'Open app' }),
      { project: { id: 'app-1', name: 'Open app' }, lookups: [] }
    );
    assert.deepEqual(
      await projectFor(null, { 'app-1': 'Saved app' }),
      { project: { id: 'app-1', name: 'Saved app' }, lookups: [['app-1']] }
    );
    assert.deepEqual(
      await projectFor(null),
      { project: { id: 'app-1', name: 'Project' }, lookups: [['app-1']] }
    );
  });
});

describe('runTurn: skill allowed-tools', () => {
  const allOn = { webSearchEnabled: true, imageGenEnabled: true, memoryChatHistoryEnabled: true };

  it('restricts tools to the active skill', async () => {
    const h = createHarness({ skillAllowedTools: { researcher: ['web_search'] } });
    await h.runner.run(turnInput({ activeSkillName: 'researcher', settings: allOn }));

    assert.deepEqual(h.calls('getSkillAllowedTools'), [['researcher']]);
    assert.deepEqual(h.calls('composeSystemPrompt'), [[CONV_ID, null, 'researcher', { recordMemoryUse: true }]]);
    assert.deepEqual(toolNamesOf(h.stream().config), ['ask_user_choice', 'web_search', 'deep_research']);
  });

  it('falls back to the skill saved on the conversation', async () => {
    const h = createHarness({
      conversation: makeConversation({ active_skill_name: 'artist' }),
      skillAllowedTools: { artist: ['generate_image'] },
    });
    await h.runner.run(turnInput({ settings: allOn }));

    assert.deepEqual(h.calls('getSkillAllowedTools'), [['artist']]);
    assert.deepEqual(toolNamesOf(h.stream().config), ['ask_user_choice', 'generate_image']);
  });

  it('drops tool guidance when the skill leaves only choice cards', async () => {
    const h = createHarness({ skillAllowedTools: { writer: ['generate_image'] } });
    await h.runner.run(turnInput({ activeSkillName: 'writer' }));

    const { config } = h.stream();
    assert.deepEqual(toolNamesOf(config), ['ask_user_choice']);
    assert.equal(config.systemPrompt, `BASE\n\nMEMORY(true)\n\n${ASK_USER_CHOICE_INSTRUCTION}`);
  });

  it('keeps every tool for a skill without allowed-tools', async () => {
    const h = createHarness();
    await h.runner.run(turnInput({ activeSkillName: 'open-skill', settings: allOn }));
    assert.equal(toolNamesOf(h.stream().config)?.length, 9);
  });

  it('applies the restriction again on tool follow-up rounds', async () => {
    const h = createHarness({ skillAllowedTools: { researcher: ['web_search'] } });
    await h.runner.run(turnInput({ activeSkillName: 'researcher', settings: allOn }));
    await h.stream().onToolCalls!([webSearchCall()]);

    assert.deepEqual(h.calls('getSkillAllowedTools'), [['researcher'], ['researcher']]);
    assert.deepEqual(toolNamesOf(h.stream().config), ['ask_user_choice', 'web_search', 'deep_research']);
  });

  it('does not look up allowed-tools without a skill', async () => {
    const h = createHarness();
    await h.runner.run(turnInput());
    assert.deepEqual(h.calls('getSkillAllowedTools'), []);
  });
});
