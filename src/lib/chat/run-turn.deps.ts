/**
 * Real implementations of the turn pipeline's services. Kept apart from
 * run-turn.ts because these pull in SQLite, secure storage, the file system
 * and the stores, none of which load outside the app.
 */
import { addMessage, getMessages, updateMessage } from '@/lib/db/messages';
import { getConversation, touchConversation } from '@/lib/db/conversations';
import { getApp } from '@/lib/db/apps';
import { recordUsage } from '@/lib/db/token-usage';
import { getApiKey } from '@/lib/storage/secure';
import { getProvider } from '@/lib/providers/registry';
import { listTools, getOpenAIToolSchemas, getAnthropicToolSchemas } from '@/lib/tools/registry';
import { executeToolCall } from '@/lib/tools/orchestrator';
import { CHAT_HISTORY_TOOL_INSTRUCTION } from '@/lib/tools/chat-history-tools';
import { getMemoryToolInstruction } from '@/lib/memory/injector';
import { scheduleMemoryExtraction } from '@/lib/memory/extractor';
import { scheduleProfileRefresh } from '@/lib/memory/profile';
import { composeSystemPrompt } from '@/lib/rules/injector';
import { parseAllowedTools } from '@/lib/skills/injector';
import { readSkillFull } from '@/lib/skills/storage';
import { calculateCost } from '@/lib/tokens/pricing';
import { useChatStore } from '@/stores/chat-store';
import type { TurnServices } from './run-turn';

/** The `allowed-tools` declared in a skill's SKILL.md, or null for no restriction. */
function readSkillAllowedTools(skillName: string): string[] | null {
  const allowedTools = readSkillFull(skillName)?.frontmatter['allowed-tools'];
  return allowedTools ? parseAllowedTools(allowedTools as string) : null;
}

/**
 * Wire the app's services. Chat store actions are stable for the store's
 * lifetime, so they are bound once here rather than looked up per token.
 */
export function createTurnServices(): TurnServices {
  const chat = useChatStore.getState();
  return {
    clock: { now: () => Date.now() },
    providers: { getApiKey, getProvider },
    db: {
      getConversation,
      touchConversation,
      getAppName: (appId) => getApp(appId)?.name,
      addMessage,
      updateMessage,
      getMessages,
    },
    prompts: {
      composeSystemPrompt,
      getMemoryToolInstruction,
      chatHistoryToolInstruction: CHAT_HISTORY_TOOL_INSTRUCTION,
      getSkillAllowedTools: readSkillAllowedTools,
    },
    tools: {
      countRegistered: () => listTools().length,
      getOpenAIToolSchemas,
      getAnthropicToolSchemas,
      executeToolCall,
    },
    usage: { calculateCost, recordUsage },
    memory: { scheduleMemoryExtraction, scheduleProfileRefresh },
    streaming: {
      startStreaming: chat.startStreaming,
      appendToken: chat.appendToken,
      appendReasoningToken: chat.appendReasoningToken,
      setStreamingActivity: chat.setStreamingActivity,
      setStreamingTokensPerSecond: chat.setStreamingTokensPerSecond,
      startToolActivity: chat.startToolActivity,
      stopToolActivity: chat.stopToolActivity,
      stopStreaming: chat.stopStreaming,
      setError: chat.setError,
      getThinkingDurationMs: chat.getThinkingDurationMs,
      flushStreaming: chat.flushStreaming,
      getStreamingMessageId: () => useChatStore.getState().streamingMessageId,
    },
  };
}
