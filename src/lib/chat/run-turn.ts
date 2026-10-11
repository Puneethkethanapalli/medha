/**
 * One assistant turn: compose the prompt, stream the reply, run tool rounds,
 * and save the result.
 *
 * Every side effect goes through `TurnDeps`, so this module is plain
 * TypeScript that loads in Node. The real wiring lives in run-turn.deps.ts;
 * the screen supplies only `TurnView` (its React state) and the per-turn
 * settings snapshot.
 *
 * Streaming is the hot path: per-token handlers only append to local strings,
 * forward to the chat store, and throttle the tokens/s readout.
 */
import type { Conversation, Message } from '@/types';
import type { AIProvider, StreamConfig, StreamResponse, ThinkingMode } from '@/lib/providers/types';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import type { ToolExecutionContext } from '@/lib/tools/types';
import type { ToolExecutionOutcome } from '@/lib/tools/orchestrator';
import type { MemoryExtractionRequest } from '@/lib/memory/extractor';
import type { ProfileGenerationContext } from '@/lib/memory/profile';
import { normalizeAskUserChoiceToolCall } from '@/lib/tools/ask-user-choice';
import { describeToolCalls } from '@/lib/tools/orchestrator';
import { describeToolActivity, WRITING_RESPONSE_ACTIVITY } from '@/lib/streaming/thinking-activity';
import { estimateTokens } from '@/lib/tokens/estimator';
import { serializeResponseTokenMetrics } from '@/lib/tokens/metrics';
import {
  CHOICE_PROMPT_FALLBACK,
  MAX_TOOL_ROUNDS,
  MEMORY_TOOL_NAMES,
  TOOL_LIMIT_FALLBACK,
  buildTurnSystemPrompt,
  resolveTurnModel,
  scopeToolsToSkill,
  selectActiveToolNames,
} from './turn-config';

// ─── Inputs ─────────────────────────────────────────────────────────────

/** Settings read when the turn starts; every tool round reuses them. */
export interface TurnSettings {
  lastProvider: string | null;
  lastModel: string | null;
  thinkingMode: ThinkingMode;
  webSearchEnabled: boolean;
  memoryEnabled: boolean;
  memoryAutoEnabled: boolean;
  memoryChatHistoryEnabled: boolean;
  imageGenEnabled: boolean;
}

/** The project (app) open in the chat; its pinned provider and model win. */
export interface TurnApp {
  provider: string | null;
  model: string | null;
  name: string;
}

export interface TurnInput {
  conversationId: string;
  app: TurnApp | null;
  /** Skill picked in the UI; falls back to the one saved on the conversation. */
  activeSkillName: string | null;
  settings: TurnSettings;
}

// ─── Dependencies ───────────────────────────────────────────────────────

export type MessageFields = Partial<Pick<Message, 'content' | 'status' | 'tokens_used' | 'reasoning' | 'tool_calls'>>;

/** Fields saved on a stopped or interrupted response. */
export type InterruptedFields = Pick<Message, 'content' | 'reasoning' | 'status'> & { tokens_used?: string | null };

export type TurnProvider = Pick<AIProvider, 'stream'>;

/** The chat store's streaming actions (see stores/chat-store.ts). */
export interface TurnStreamingStore {
  startStreaming: (messageId: string) => void;
  appendToken: (token: string) => void;
  appendReasoningToken: (token: string) => void;
  setStreamingActivity: (activity: string) => void;
  setStreamingTokensPerSecond: (tokensPerSecond: number) => void;
  startToolActivity: (messageId: string, activity: string) => void;
  stopToolActivity: (messageId?: string) => void;
  stopStreaming: () => void;
  setError: (error: string | null) => void;
  getThinkingDurationMs: () => number | null;
  flushStreaming: () => { content: string; reasoning: string };
  getStreamingMessageId: () => string | null;
}

/** Updates to the screen's message list, mirroring what was saved. */
export interface TurnView {
  appendMessage: (message: Message) => void;
  patchMessage: (messageId: string, fields: Partial<Message>) => void;
  replaceMessages: (messages: Message[]) => void;
  /** Fires once per round, on the first answer or reasoning token. */
  onFirstOutput: () => void;
}

export interface TurnServices {
  clock: { now: () => number };
  providers: {
    getApiKey: (providerId: string) => Promise<string | null>;
    getProvider: (providerId: string) => TurnProvider | undefined;
  };
  db: {
    getConversation: (id: string) => Conversation | null;
    touchConversation: (id: string) => void;
    getAppName: (appId: string) => string | undefined;
    addMessage: (
      conversationId: string,
      role: Message['role'],
      content: string,
      model?: string,
      attachments?: null,
      toolCallId?: string | null,
      toolCalls?: string | null
    ) => string;
    updateMessage: (id: string, fields: MessageFields) => void;
    getMessages: (conversationId: string) => Message[];
  };
  prompts: {
    composeSystemPrompt: (
      conversationId: string,
      customSystemPrompt: string | null | undefined,
      activeSkillName: string | null,
      options: { recordMemoryUse: boolean }
    ) => string | undefined;
    getMemoryToolInstruction: (autoExtraction: boolean) => string;
    chatHistoryToolInstruction: string;
    /** The skill's `allowed-tools`, or null when it sets no restriction. */
    getSkillAllowedTools: (skillName: string) => string[] | null;
  };
  tools: {
    countRegistered: () => number;
    getOpenAIToolSchemas: (toolNames: string[]) => NonNullable<StreamConfig['tools']>;
    getAnthropicToolSchemas: (toolNames: string[]) => NonNullable<StreamConfig['anthropicTools']>;
    executeToolCall: (call: AccumulatedToolCall, context: ToolExecutionContext) => Promise<ToolExecutionOutcome>;
  };
  usage: {
    calculateCost: (promptTokens: number, completionTokens: number, model: string) => number | null;
    recordUsage: (
      conversationId: string,
      messageId: string,
      model: string,
      promptTokens: number,
      completionTokens: number,
      costUsd: number | null
    ) => void;
  };
  memory: {
    scheduleMemoryExtraction: (request: MemoryExtractionRequest) => void;
    scheduleProfileRefresh: (context: ProfileGenerationContext) => void;
  };
  streaming: TurnStreamingStore;
}

export interface TurnDeps extends TurnServices {
  view: TurnView;
}

export interface TurnRunner {
  /**
   * Start a reply in the conversation. Resolves once the request is under
   * way (or when there is no API key or provider); tokens, tool rounds and
   * the final save happen through provider callbacks after that.
   */
  run: (input: TurnInput) => Promise<void>;
  /**
   * Abort the in-flight provider request, if any, then save what the
   * streaming response produced so far as cancelled. Returns whether a
   * response was streaming. The caller stops the stream in the store.
   */
  interrupt: () => boolean;
}

// ─── Interrupted responses ──────────────────────────────────────────────

/**
 * Everything a stopped or interrupted response produced so far — reasoning
 * included — as fields to save on its message. Null when nothing is streaming.
 */
export function captureInterruptedResponse(
  streaming: Pick<TurnStreamingStore, 'getStreamingMessageId' | 'flushStreaming' | 'getThinkingDurationMs'>
): { messageId: string; fields: InterruptedFields } | null {
  const messageId = streaming.getStreamingMessageId();
  if (!messageId) return null;

  const { content, reasoning } = streaming.flushStreaming();
  const reasoningMs = reasoning.trim() ? streaming.getThinkingDurationMs() : null;
  return {
    messageId,
    fields: {
      content,
      reasoning: reasoning || null,
      status: 'cancelled',
      ...(reasoningMs
        ? { tokens_used: serializeResponseTokenMetrics({ prompt: 0, completion: 0, reasoningMs }) }
        : {}),
    },
  };
}

// ─── Runner ─────────────────────────────────────────────────────────────

/**
 * Create the runner for one chat screen. Like the screen's refs it replaces,
 * the runner keeps the usage total, the memory-tool flag and the abort handle
 * across calls; a new turn (round 0) resets the first two.
 */
export function createTurnRunner(deps: TurnDeps): TurnRunner {
  const { clock, providers, db, prompts, tools, usage, memory, streaming, view } = deps;

  // Usage accumulates across the tool rounds of one reply.
  let turnUsage: UsageData = { promptTokens: 0, completionTokens: 0 };
  // Set when the chat model called a memory tool this turn; background extraction then skips it.
  let memoryToolUsedInTurn = false;
  let activeStream: StreamResponse | null = null;

  const abort = () => {
    if (activeStream) {
      activeStream.abort();
      activeStream = null;
    }
  };

  const runRound = async (input: TurnInput, toolRound: number): Promise<void> => {
    const { conversationId: convId, app, settings } = input;
    const { providerId, model } = resolveTurnModel(app, settings.lastProvider, settings.lastModel);
    const apiKey = await providers.getApiKey(providerId);
    if (!apiKey) return;

    const provider = providers.getProvider(providerId);
    if (!provider) return;

    const conversation = db.getConversation(convId);
    // Temporary chats never use memory, search history, or teach the profile.
    const temporaryChat = conversation?.temporary === 1;
    const useMemory = settings.memoryEnabled && !temporaryChat;
    const project = conversation?.app_id
      ? { id: conversation.app_id, name: app?.name ?? db.getAppName(conversation.app_id) ?? 'Project' }
      : null;
    const convActiveSkill = input.activeSkillName ?? conversation?.active_skill_name ?? null;
    const basePrompt = prompts.composeSystemPrompt(
      convId,
      conversation?.system_prompt,
      convActiveSkill,
      // Tool follow-up rounds re-send the same turn; count memory use once.
      { recordMemoryUse: toolRound === 0 }
    );

    // If the active skill declares allowed-tools, scope tool access to them.
    const skillAllowedTools = convActiveSkill ? prompts.getSkillAllowedTools(convActiveSkill) : null;

    let memoryInstruction: string | null = null;
    if (useMemory) {
      memoryInstruction = prompts.getMemoryToolInstruction(settings.memoryAutoEnabled);
      if (settings.memoryChatHistoryEnabled) {
        memoryInstruction = `${memoryInstruction}\n${prompts.chatHistoryToolInstruction}`;
      }
    }

    // Create placeholder assistant message
    const assistantMsgId = db.addMessage(convId, 'assistant', '', model);
    db.updateMessage(assistantMsgId, { status: 'streaming' });
    view.appendMessage({
      id: assistantMsgId,
      conversation_id: convId,
      role: 'assistant',
      content: '',
      reasoning: null,
      attachments: null,
      status: 'streaming',
      model,
      tokens_used: null,
      tool_call_id: null,
      tool_calls: null,
      created_at: clock.now(),
    });
    streaming.startStreaming(assistantMsgId);

    // Build full message history for API
    const fullMessages = db.getMessages(convId).filter(
      (m) => m.role !== 'system' && m.id !== assistantMsgId
    );

    const activeToolNames = scopeToolsToSkill(
      selectActiveToolNames({
        webSearchEnabled: settings.webSearchEnabled,
        useMemory,
        memoryChatHistoryEnabled: settings.memoryChatHistoryEnabled,
        imageGenEnabled: settings.imageGenEnabled,
      }),
      skillAllowedTools
    );
    const systemPrompt = buildTurnSystemPrompt({
      base: basePrompt,
      memoryInstruction,
      imageGenEnabled: settings.imageGenEnabled,
      activeToolNames,
    });
    const useTools = activeToolNames.length > 0 && tools.countRegistered() > 0;
    const enableToolCalls = useTools && activeToolNames.length > 0;
    const toolConfig = enableToolCalls
      ? {
          tools: tools.getOpenAIToolSchemas(activeToolNames),
          anthropicTools: providerId === 'anthropic' ? tools.getAnthropicToolSchemas(activeToolNames) : undefined,
        }
      : {};

    // Hot-path store actions, hoisted out of the per-token handlers.
    const { appendToken, appendReasoningToken, setStreamingActivity, setStreamingTokensPerSecond } = streaming;

    let accumulated = '';
    let accumulatedReasoning = '';
    let firstTokenFired = false;
    let currentActivity = '';
    let firstOutputAt = 0;
    let lastSpeedUpdateAt = 0;
    let roundCompletionTokens = 0;
    // A new turn resets the usage total; tool rounds keep adding to it.
    if (toolRound === 0) {
      turnUsage = { promptTokens: 0, completionTokens: 0 };
      memoryToolUsedInTurn = false;
    }

    const markFirstOutput = () => {
      if (!firstOutputAt) {
        firstOutputAt = clock.now();
      }
      if (!firstTokenFired) {
        firstTokenFired = true;
        view.onFirstOutput();
      }
    };

    const handleUsage = (roundUsage: UsageData) => {
      turnUsage.promptTokens += roundUsage.promptTokens;
      turnUsage.completionTokens += roundUsage.completionTokens;
      roundCompletionTokens += roundUsage.completionTokens;
    };

    const updateActivity = (activity: string) => {
      if (activity === currentActivity) return;
      currentActivity = activity;
      setStreamingActivity(activity);
    };

    const calculateTokensPerSecond = (now: number) => {
      if (!firstOutputAt) return null;
      const elapsedSeconds = Math.max((now - firstOutputAt) / 1000, 0.1);
      const outputTokens = roundCompletionTokens > 0
        ? roundCompletionTokens
        : estimateTokens(`${accumulated}\n${accumulatedReasoning}`);

      if (outputTokens <= 0) return null;
      return outputTokens / elapsedSeconds;
    };

    const updateTokensPerSecond = () => {
      const now = clock.now();
      if (!firstOutputAt || now - firstOutputAt < 750) return;
      if (now - lastSpeedUpdateAt < 500) return;

      const tokensPerSecond = calculateTokensPerSecond(now);
      if (!tokensPerSecond) return;

      lastSpeedUpdateAt = now;
      setStreamingTokensPerSecond(tokensPerSecond);
    };

    /** How long the model thought before answering, if it reasoned at all. */
    const getReasoningMs = () =>
      accumulatedReasoning.trim() ? streaming.getThinkingDurationMs() : null;

    /** Same fields to the database and the screen, in that order. */
    const saveAssistant = (fields: MessageFields) => {
      db.updateMessage(assistantMsgId, fields);
      view.patchMessage(assistantMsgId, fields);
    };

    const handleDone = () => {
      const { promptTokens, completionTokens } = turnUsage;
      const tokensPerSecond = calculateTokensPerSecond(clock.now());
      const reasoningMs = getReasoningMs();
      const tokensUsedJson = serializeResponseTokenMetrics({
        prompt: promptTokens,
        completion: completionTokens,
        ...(tokensPerSecond ? { tokensPerSecond } : {}),
        ...(reasoningMs ? { reasoningMs } : {}),
      });
      const costUsd = usage.calculateCost(promptTokens, completionTokens, model);
      const fields: MessageFields = {
        content: accumulated,
        reasoning: accumulatedReasoning || null,
        status: 'complete',
        tokens_used: tokensUsedJson,
      };

      db.updateMessage(assistantMsgId, fields);
      // Record to token_usage table
      if (promptTokens > 0 || completionTokens > 0) {
        usage.recordUsage(convId, assistantMsgId, model, promptTokens, completionTokens, costUsd);
      }
      db.touchConversation(convId);
      view.patchMessage(assistantMsgId, fields);
      streaming.stopStreaming();

      // Learn from this exchange in the background, unless the model already
      // handled memory itself via a tool this turn.
      const lastUserMessage = [...fullMessages].reverse().find((m) => m.role === 'user');
      if (useMemory && accumulated.trim() && lastUserMessage && !memoryToolUsedInTurn) {
        memory.scheduleMemoryExtraction({
          conversationId: convId,
          userMessageId: lastUserMessage.id,
          assistantMessageId: assistantMsgId,
          userText: lastUserMessage.content,
          assistantText: accumulated,
          providerId,
          apiKey,
          chatModel: model,
          project,
        });
      }
      if (useMemory && accumulated.trim()) {
        memory.scheduleProfileRefresh({
          providerId,
          apiKey,
          chatModel: model,
          usageTarget: { conversationId: convId, messageId: assistantMsgId },
        });
      }
    };

    const handleError = (error: Error) => {
      const reasoningMs = getReasoningMs();
      db.updateMessage(assistantMsgId, {
        content: accumulated || 'Error: ' + error.message,
        reasoning: accumulatedReasoning || null,
        status: 'error',
        ...(reasoningMs
          ? { tokens_used: serializeResponseTokenMetrics({ prompt: 0, completion: 0, reasoningMs }) }
          : {}),
      });
      db.touchConversation(convId);
      streaming.setError(error.message);
      // The screen shows the bare message; the saved copy keeps the "Error: " prefix.
      view.patchMessage(assistantMsgId, {
        content: accumulated || error.message,
        reasoning: accumulatedReasoning || null,
        status: 'error',
      });
    };

    const handleToolCalls = async (toolCalls: AccumulatedToolCall[]) => {
      const pendingChoice = toolCalls
        .map((call) => normalizeAskUserChoiceToolCall(call))
        .find((choice) => choice !== null);

      if (pendingChoice) {
        const fields: MessageFields = {
          content: accumulated || CHOICE_PROMPT_FALLBACK,
          reasoning: accumulatedReasoning || null,
          status: 'waiting',
          tool_calls: JSON.stringify([pendingChoice.call]),
        };
        db.updateMessage(assistantMsgId, fields);
        db.touchConversation(convId);
        view.patchMessage(assistantMsgId, fields);
        streaming.stopStreaming();
        return;
      }

      if (toolRound >= MAX_TOOL_ROUNDS) {
        accumulated = accumulated || TOOL_LIMIT_FALLBACK;
        handleDone();
        return;
      }

      const toolActivity = describeToolActivity(toolCalls.map((call) => call.name));
      updateActivity(toolActivity);

      // Show tool usage on the assistant message and save the tool_calls metadata.
      const reasoningMs = getReasoningMs();
      const toolRoundMetrics = reasoningMs
        ? serializeResponseTokenMetrics({ prompt: 0, completion: 0, reasoningMs })
        : null;
      saveAssistant({
        content: accumulated || describeToolCalls(toolCalls),
        reasoning: accumulatedReasoning || null,
        status: 'complete',
        tool_calls: JSON.stringify(toolCalls),
        ...(toolRoundMetrics ? { tokens_used: toolRoundMetrics } : {}),
      });
      streaming.stopStreaming();
      streaming.startToolActivity(assistantMsgId, toolActivity);

      // Execute tool calls in parallel, then save results in model-emitted order.
      if (toolCalls.some((call) => MEMORY_TOOL_NAMES.has(call.name))) {
        memoryToolUsedInTurn = true;
      }
      const outcomes = await Promise.all(
        toolCalls.map((tc) => tools.executeToolCall(tc, { conversationId: convId }))
      );
      for (const outcome of outcomes) {
        db.addMessage(
          convId,
          'tool',
          outcome.content,
          model,
          null,
          outcome.call.id,
          JSON.stringify(outcome.display)
        );
      }

      // Reload messages to include tool results, then re-stream for final response
      view.replaceMessages(db.getMessages(convId));
      streaming.stopToolActivity(assistantMsgId);
      await runRound(input, toolRound + 1);
    };

    const response = provider.stream(
      fullMessages,
      {
        model,
        apiKey,
        systemPrompt,
        thinkingMode: (conversation?.thinking_mode as ThinkingMode) || settings.thinkingMode,
        ...toolConfig,
      },
      (token) => {
        markFirstOutput();
        updateActivity(WRITING_RESPONSE_ACTIVITY);
        accumulated += token;
        appendToken(token);
        updateTokensPerSecond();
      },
      (reasoningToken) => {
        markFirstOutput();
        accumulatedReasoning += reasoningToken;
        appendReasoningToken(reasoningToken);
        updateTokensPerSecond();
      },
      handleDone,
      handleError,
      enableToolCalls ? handleToolCalls : undefined,
      handleUsage
    );

    activeStream = response;
  };

  return {
    run: (input) => runRound(input, 0),
    interrupt: () => {
      abort();
      const interrupted = captureInterruptedResponse(streaming);
      if (!interrupted) return false;
      const { messageId, fields } = interrupted;
      db.updateMessage(messageId, fields);
      view.patchMessage(messageId, fields);
      return true;
    },
  };
}
