import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Pressable, AppState, type AppStateStatus, type LayoutChangeEvent } from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Menu, PenSquare, Zap, Ghost } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ModelPill } from '@/components/chat/ModelPill';
import { ChatSettingsButton } from '@/components/chat/ChatSettingsButton';
import { ImageGenToggle } from '@/components/chat/ImageGenToggle';
import { ContextWindowCircle } from '@/components/chat/ContextWindowCircle';
import { MessageList } from '@/components/chat/MessageList';
import { MessageActionsMenu } from '@/components/chat/MessageActionsMenu';
import { OfflineBanner } from '@/components/chat/OfflineBanner';
import { InputBar } from '@/components/chat/InputBar';
import { EmptyState } from '@/components/chat/EmptyState';
import { Toast } from '@/components/common/Toast';
import { SkillPicker } from '@/components/skills/SkillPicker';
import { useChatStore } from '@/stores/chat-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { addMessage, getMessages, updateMessage, deleteMessage, deleteMessagesAfter } from '@/lib/db/messages';
import {
  createConversation,
  getConversation,
  updateConversation,
  touchConversation,
} from '@/lib/db/conversations';
import { getApiKey } from '@/lib/storage/secure';
import { getProvider, registerBuiltInProviders, listProviders } from '@/lib/providers/registry';
import { registerTool, listTools, getOpenAIToolSchemas, getAnthropicToolSchemas, getTool } from '@/lib/tools/registry';
import { deepResearchTool, webSearchTool } from '@/lib/tools/web-search';
import { generateImageTool } from '@/lib/tools/image-gen';
import { saveMemoryTool, updateMemoryTool, forgetMemoryTool } from '@/lib/tools/memory-tools';
import { getMemoryToolInstruction } from '@/lib/memory/injector';
import { scheduleMemoryExtraction } from '@/lib/memory/extractor';
import { scheduleProfileRefresh } from '@/lib/memory/profile';
import { searchPastChatsTool, recentChatsTool, CHAT_HISTORY_TOOL_INSTRUCTION } from '@/lib/tools/chat-history-tools';
import { useMemoryEventsStore } from '@/stores/memory-events-store';
import {
  ASK_USER_CHOICE_TOOL_NAME,
  askUserChoiceTool,
  formatAskUserChoiceUserMessage,
  normalizeAskUserChoiceToolCall,
  parseAskUserChoiceToolCall,
  serializeAskUserChoiceToolResult,
  type AskUserChoiceSubmission,
} from '@/lib/tools/ask-user-choice';
import { describeToolCalls, executeToolCall } from '@/lib/tools/orchestrator';
import {
  deriveThinkingActivity,
  describeToolActivity,
  WRITING_RESPONSE_ACTIVITY,
} from '@/lib/streaming/thinking-activity';
import { composeSystemPrompt } from '@/lib/rules/injector';
import { parseAllowedTools } from '@/lib/skills/injector';
import { readSkillFull } from '@/lib/skills/storage';
import { recordUsage } from '@/lib/db/token-usage';
import { calculateCost } from '@/lib/tokens/pricing';
import { estimateMessageTokens, estimateTokens } from '@/lib/tokens/estimator';
import { formatTokensPerSecond, serializeResponseTokenMetrics } from '@/lib/tokens/metrics';
import { getApp } from '@/lib/db/apps';
import { getIconByName } from '@/lib/apps/icons';
import { parseExamplePrompts } from '@/lib/apps/types';
import { getModelContextWindow } from '@/lib/models/capabilities';
import { loadModelMetadata, useModelListStore } from '@/lib/models/model-list-sync';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { useRouter } from 'expo-router';
import type { Message, Attachment } from '@/types';

const MAX_TOOL_ROUNDS = 5;
const MEMORY_TOOL_NAMES = new Set(['save_memory', 'update_memory', 'forget_memory']);

interface ChatScreenProps {
  conversationId: string | null;
  focusMessageId?: string | null;
  focusRequestKey?: string | null;
  appId?: string | null;
}

export const ChatScreen = React.memo(function ChatScreen({
  conversationId,
  focusMessageId = null,
  focusRequestKey = null,
  appId = null,
}: ChatScreenProps) {
  const router = useRouter();
  const [activeApp, setActiveApp] = useState<ReturnType<typeof getApp>>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(conversationId);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [hasImageGenKey, setHasImageGenKey] = useState(false);
  const [activeSkillName, setActiveSkillName] = useState<string | null>(null);
  const [inputBarHeight, setInputBarHeight] = useState(0);
  // Bumps when LiteLLM or provider model metadata loads, so context windows re-resolve.
  const metadataVersion = useModelListStore((s) => s.metadataVersion);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const usageAccumRef = useRef<UsageData>({ promptTokens: 0, completionTokens: 0 });

  const openDrawer = useUIStore((s) => s.openDrawer);
  const setActiveConversation = useUIStore((s) => s.setActiveConversation);
  const setEditingMessage = useUIStore((s) => s.setEditingMessage);
  const pendingConversationRule = useUIStore((s) => s.pendingConversationRule);
  const setPendingConversationRule = useUIStore((s) => s.setPendingConversationRule);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastProvider = useSettingsStore((s) => s.lastProvider);
  const thinkingMode = useSettingsStore((s) => s.thinkingMode);
  const webSearchEnabled = useSettingsStore((s) => s.webSearchEnabled);
  const memoryEnabled = useSettingsStore((s) => s.memoryEnabled);
  const memoryAutoEnabled = useSettingsStore((s) => s.memoryAutoEnabled);
  const memoryChatHistoryEnabled = useSettingsStore((s) => s.memoryChatHistoryEnabled);
  const pendingTemporaryChat = useUIStore((s) => s.pendingTemporaryChat);
  const setPendingTemporaryChat = useUIStore((s) => s.setPendingTemporaryChat);
  const [conversationTemporary, setConversationTemporary] = useState(false);
  const loadMemoryEvents = useMemoryEventsStore((s) => s.loadConversation);
  // Set when the chat model called a memory tool this turn; background extraction then skips it.
  const memoryToolUsedInTurnRef = useRef(false);
  const imageGenEnabled = useSettingsStore((s) => s.imageGenEnabled);
  const skillPickerOpen = useUIStore((s) => s.skillPickerOpen);
  const closeSkillPicker = useUIStore((s) => s.closeSkillPicker);
  const openSkillPicker = useUIStore((s) => s.openSkillPicker);
  const openModelPicker = useUIStore((s) => s.openModelPicker);

  const {
    streamingMessageId,
    streamingContent,
    streamingReasoning,
    isStreaming,
    streamingTokensPerSecond,
    startStreaming,
    appendToken,
    appendReasoningToken,
    setStreamingActivity,
    setStreamingTokensPerSecond,
    startToolActivity,
    stopToolActivity,
    stopStreaming,
    setError,
  } = useChatStore();

  // Ensure providers and tools are registered
  useEffect(() => {
    const checkImageGenKey = async () => {
      const { hasApiKey } = await import('@/lib/storage/secure');
      setHasImageGenKey(await hasApiKey('image-gen'));
    };
    checkImageGenKey();
  }, []);

  useEffect(() => {
    if (listProviders().length === 0) {
      registerBuiltInProviders();
    }
    // Register built-in tools
    if (!getTool('web_search')) {
      registerTool(webSearchTool);
    }
    if (!getTool('deep_research')) {
      registerTool(deepResearchTool);
    }
    if (!getTool(ASK_USER_CHOICE_TOOL_NAME)) {
      registerTool(askUserChoiceTool);
    }
    // Register image generation tool
    if (!getTool('generate_image')) {
      registerTool(generateImageTool);
    }
    // Memory tools are always registered — they're core functionality
    if (!getTool('save_memory')) {
      registerTool(saveMemoryTool);
    }
    if (!getTool('update_memory')) {
      registerTool(updateMemoryTool);
    }
    if (!getTool('search_past_chats')) {
      registerTool(searchPastChatsTool);
    }
    if (!getTool('recent_chats')) {
      registerTool(recentChatsTool);
    }
    if (!getTool('forget_memory')) {
      registerTool(forgetMemoryTool);
    }
  }, []);

  useEffect(() => {
    void loadModelMetadata();
  }, []);

  // Handle app backgrounding during active stream — abort to prevent stuck state
  useEffect(() => {
    let lastState: AppStateStatus = 'active';
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (lastState === 'active' && nextState === 'background') {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        const { streamingMessageId, streamingContent } = useChatStore.getState();
        if (streamingMessageId) {
          updateMessage(streamingMessageId, {
            content: streamingContent,
            status: 'cancelled',
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMessageId
                ? { ...m, content: streamingContent, status: 'cancelled' as const }
                : m
            )
          );
          stopStreaming();
        }
      }
      lastState = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [stopStreaming]);

  // Sync internal state when prop changes
  useEffect(() => {
    setCurrentConvId(conversationId);
  }, [conversationId]);

  // Load messages when the effective conversation ID changes
  useEffect(() => {
    if (currentConvId) {
      const msgs = getMessages(currentConvId);
      setMessages(msgs);
      loadMemoryEvents(currentConvId);
      setActiveConversation(currentConvId);
      // Load active skill from conversation
      const conv = getConversation(currentConvId);
      setConversationTemporary(conv?.temporary === 1);
      // A pending temporary toggle only applies to the next brand-new chat.
      setPendingTemporaryChat(false);
      setActiveSkillName(conv?.active_skill_name ?? null);
      // Load linked app
      if (conv?.app_id) {
        setActiveApp(getApp(conv.app_id));
      }
    } else {
      setMessages([]);
      loadMemoryEvents(null);
      setConversationTemporary(false);
      setActiveConversation(null);
      setActiveSkillName(null);
    }
  }, [currentConvId, loadMemoryEvents, setActiveConversation, setPendingTemporaryChat]);

  // Handle app-based conversation creation
  useEffect(() => {
    if (!appId || currentConvId) return;

    const app = getApp(appId);
    if (!app) return;

    setActiveApp(app);

    // Set skill from app config
    if (app.skill_name) {
      setActiveSkillName(app.skill_name);
    }
  }, [appId, currentConvId]);

  useEffect(() => {
    if (!focusMessageId) {
      setHighlightedMessageId(null);
      return;
    }

    setHighlightedMessageId(focusMessageId);
    const timeout = setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === focusMessageId ? null : current
      );
    }, 2600);

    return () => clearTimeout(timeout);
  }, [focusMessageId, focusRequestKey]);

  // ─── Core streaming logic (with tool call loop) ─────────────────────
  const streamNewResponse = useCallback(
    async (convId: string, toolRound = 0) => {
      const providerId = activeApp?.provider || lastProvider || 'openrouter';
      const apiKey = await getApiKey(providerId);
      if (!apiKey) return;

      const provider = getProvider(providerId);
      if (!provider) return;

      const model = activeApp?.model || lastModel || getDefaultModel(providerId);
      const conversation = getConversation(convId);
      // Temporary chats never use memory, search history, or teach the profile.
      const temporaryChat = conversation?.temporary === 1;
      const useMemory = memoryEnabled && !temporaryChat;
      const project = conversation?.app_id
        ? { id: conversation.app_id, name: activeApp?.name ?? getApp(conversation.app_id)?.name ?? 'Project' }
        : null;
      const convActiveSkill = activeSkillName ?? conversation?.active_skill_name ?? null;
      let systemPrompt = composeSystemPrompt(
        convId,
        conversation?.system_prompt,
        convActiveSkill,
        // Tool follow-up rounds re-send the same turn; count memory use once.
        { recordMemoryUse: toolRound === 0 }
      );

      // If active skill declares allowed-tools, scope tool access
      let skillAllowedTools: string[] | null = null;
      if (convActiveSkill) {
        const skillData = readSkillFull(convActiveSkill);
        if (skillData?.frontmatter['allowed-tools']) {
          skillAllowedTools = parseAllowedTools(skillData.frontmatter['allowed-tools'] as string);
        }
      }

      // Append memory tool instruction when memory is enabled
      if (useMemory) {
        let memoryInstruction = getMemoryToolInstruction(memoryAutoEnabled);
        if (memoryChatHistoryEnabled) {
          memoryInstruction = `${memoryInstruction}\n${CHAT_HISTORY_TOOL_INSTRUCTION}`;
        }
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n${memoryInstruction}`
          : memoryInstruction;
      }

      if (imageGenEnabled) {
        const imageGenInstruction =
          'You can generate images. When the user asks to create, draw, or visualize something, use the generate_image tool.';
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n${imageGenInstruction}`
          : imageGenInstruction;
      }

      const choiceInstruction =
        'You can ask the user to choose between options with the ask_user_choice tool. Use it sparingly, only when the answer would depend on a meaningful user preference or missing decision. Ask 1-4 concise questions at once, provide 2-4 clear options per question, mark a recommended option when appropriate, and do not call any other tool in the same response as ask_user_choice.';
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${choiceInstruction}`
        : choiceInstruction;

      // Create placeholder assistant message
      const assistantMsgId = addMessage(convId, 'assistant', '', model);
      updateMessage(assistantMsgId, { status: 'streaming' });
      const assistantMsg: Message = {
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
        created_at: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      startStreaming(assistantMsgId);

      // Build full message history for API
      const fullMessages = getMessages(convId).filter(
        (m) => m.role !== 'system' && m.id !== assistantMsgId
      );

      // Build tool config — choice cards are core; other tools are toggled.
      let activeToolNames: string[] = [ASK_USER_CHOICE_TOOL_NAME];
      if (webSearchEnabled) {
        activeToolNames.push('web_search');
        activeToolNames.push('deep_research');
      }
      if (useMemory) {
        activeToolNames.push('save_memory');
        activeToolNames.push('update_memory');
        activeToolNames.push('forget_memory');
        if (memoryChatHistoryEnabled) {
          activeToolNames.push('search_past_chats');
          activeToolNames.push('recent_chats');
        }
      }
      if (imageGenEnabled) activeToolNames.push('generate_image');

      // If active skill declares allowed-tools, restrict to only those tools
      if (skillAllowedTools) {
        activeToolNames = activeToolNames.filter((t) =>
          t === ASK_USER_CHOICE_TOOL_NAME
          || skillAllowedTools!.includes(t)
          || (t === 'deep_research' && skillAllowedTools!.includes('web_search'))
        );
      }
      const hasNonChoiceTools = activeToolNames.some((toolName) => toolName !== ASK_USER_CHOICE_TOOL_NAME);
      if (hasNonChoiceTools) {
        const toolInstruction =
          'When using tools, give a short preamble before the call when possible, use the narrowest useful tool, and cite sources from tool results in the final answer. Prefer deep_research over web_search for broad comparisons, investigations, or multi-source analysis.';
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n${toolInstruction}`
          : toolInstruction;
      }
      const useTools = activeToolNames.length > 0 && listTools().length > 0;
      const enableToolCalls = useTools && activeToolNames.length > 0;
      const toolConfig = enableToolCalls
        ? {
            tools: getOpenAIToolSchemas(activeToolNames),
            anthropicTools: providerId === 'anthropic' ? getAnthropicToolSchemas(activeToolNames) : undefined,
          }
        : {};

      // Start streaming
      let accumulated = '';
      let accumulatedReasoning = '';
      let firstTokenFired = false;
      let currentActivity = '';
      let firstOutputAt = 0;
      let lastSpeedUpdateAt = 0;
      let roundCompletionTokens = 0;
      // Reset usage accumulator for this response (accumulates across tool call rounds)
      if (toolRound === 0) {
        usageAccumRef.current = { promptTokens: 0, completionTokens: 0 };
        memoryToolUsedInTurnRef.current = false;
      }

      const fireFirstTokenHaptic = () => {
        if (!firstOutputAt) {
          firstOutputAt = Date.now();
        }
        if (!firstTokenFired) {
          firstTokenFired = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      };

      const handleUsage = (usage: UsageData) => {
        usageAccumRef.current.promptTokens += usage.promptTokens;
        usageAccumRef.current.completionTokens += usage.completionTokens;
        roundCompletionTokens += usage.completionTokens;
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
        const now = Date.now();
        if (!firstOutputAt || now - firstOutputAt < 750) return;
        if (now - lastSpeedUpdateAt < 500) return;

        const tokensPerSecond = calculateTokensPerSecond(now);
        if (!tokensPerSecond) return;

        lastSpeedUpdateAt = now;
        setStreamingTokensPerSecond(tokensPerSecond);
      };

      const handleDone = () => {
        // Save usage data
        const { promptTokens, completionTokens } = usageAccumRef.current;
        const tokensPerSecond = calculateTokensPerSecond(Date.now());
        const tokensUsedJson = serializeResponseTokenMetrics({
          prompt: promptTokens,
          completion: completionTokens,
          ...(tokensPerSecond ? { tokensPerSecond } : {}),
        });
        const costUsd = calculateCost(promptTokens, completionTokens, model);

        updateMessage(assistantMsgId, {
          content: accumulated,
          reasoning: accumulatedReasoning || null,
          status: 'complete',
          tokens_used: tokensUsedJson,
        });

        // Record to token_usage table
        if (promptTokens > 0 || completionTokens > 0) {
          recordUsage(convId, assistantMsgId, model, promptTokens, completionTokens, costUsd);
        }

        touchConversation(convId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: accumulated,
                  reasoning: accumulatedReasoning || null,
                  status: 'complete',
                  tokens_used: tokensUsedJson,
                }
              : m
          )
        );
        stopStreaming();

        // Learn from this exchange in the background, unless the model already
        // handled memory itself via a tool this turn.
        const lastUserMessage = [...fullMessages].reverse().find((m) => m.role === 'user');
        if (useMemory && accumulated.trim() && lastUserMessage && !memoryToolUsedInTurnRef.current) {
          scheduleMemoryExtraction({
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
          scheduleProfileRefresh({
            providerId,
            apiKey,
            chatModel: model,
            usageTarget: { conversationId: convId, messageId: assistantMsgId },
          });
        }
      };

      const handleError = (error: Error) => {
        updateMessage(assistantMsgId, {
          content: accumulated || 'Error: ' + error.message,
          reasoning: accumulatedReasoning || null,
          status: 'error',
        });
        touchConversation(convId);
        setError(error.message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: accumulated || error.message, reasoning: accumulatedReasoning || null, status: 'error' }
              : m
          )
        );
      };

      const handleToolCalls = async (toolCalls: AccumulatedToolCall[]) => {
        const pendingChoice = toolCalls
          .map((call) => normalizeAskUserChoiceToolCall(call))
          .find((choice) => choice !== null);

        if (pendingChoice) {
          const promptText = accumulated
            || 'I need your choice to continue.';
          const toolCallsJson = JSON.stringify([pendingChoice.call]);

          updateMessage(assistantMsgId, {
            content: promptText,
            reasoning: accumulatedReasoning || null,
            status: 'waiting',
            tool_calls: toolCallsJson,
          });
          touchConversation(convId);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: promptText,
                    reasoning: accumulatedReasoning || null,
                    status: 'waiting',
                    tool_calls: toolCallsJson,
                  }
                : m
            )
          );
          stopStreaming();
          return;
        }

        if (toolRound >= MAX_TOOL_ROUNDS) {
          const fallback = accumulated || 'I reached the tool-use limit for this response. Please ask me to continue if you want me to keep working from the available results.';
          accumulated = fallback;
          handleDone();
          return;
        }

        const toolActivity = describeToolActivity(toolCalls.map((call) => call.name));
        updateActivity(toolActivity);

        // Update the assistant message to show tool usage status + save tool_calls metadata
        const statusText = accumulated || describeToolCalls(toolCalls);
        const toolCallsJson = JSON.stringify(toolCalls);
        updateMessage(assistantMsgId, {
          content: statusText,
          reasoning: accumulatedReasoning || null,
          status: 'complete',
          tool_calls: toolCallsJson,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: statusText, reasoning: accumulatedReasoning || null, status: 'complete', tool_calls: toolCallsJson }
              : m
          )
        );
        stopStreaming();
        startToolActivity(assistantMsgId, toolActivity);

        // Execute tool calls in parallel, then save results in model-emitted order.
        if (toolCalls.some((call) => MEMORY_TOOL_NAMES.has(call.name))) {
          memoryToolUsedInTurnRef.current = true;
        }
        const outcomes = await Promise.all(
          toolCalls.map((tc) => executeToolCall(tc, { conversationId: convId }))
        );
        for (const outcome of outcomes) {
          addMessage(
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
        const updatedMessages = getMessages(convId);
        setMessages(updatedMessages);
        stopToolActivity(assistantMsgId);
        await streamNewResponse(convId, toolRound + 1);
      };

      const response = provider.stream(
        fullMessages,
        {
          model,
          apiKey,
          systemPrompt,
          thinkingMode: (conversation?.thinking_mode as 'auto' | 'on' | 'off') || thinkingMode,
          ...toolConfig,
        },
        (token) => {
          fireFirstTokenHaptic();
          updateActivity(WRITING_RESPONSE_ACTIVITY);
          accumulated += token;
          appendToken(token);
          updateTokensPerSecond();
        },
        (reasoningToken) => {
          fireFirstTokenHaptic();
          accumulatedReasoning += reasoningToken;
          updateActivity(deriveThinkingActivity(accumulatedReasoning));
          appendReasoningToken(reasoningToken);
          updateTokensPerSecond();
        },
        handleDone,
        handleError,
        enableToolCalls ? handleToolCalls : undefined,
        handleUsage
      );

      abortRef.current = response;
    },
    [activeApp?.model, activeApp?.provider, activeApp?.name, lastModel, lastProvider, thinkingMode, webSearchEnabled, memoryEnabled, memoryAutoEnabled, memoryChatHistoryEnabled, imageGenEnabled, activeSkillName, startStreaming, appendToken, appendReasoningToken, setStreamingActivity, setStreamingTokensPerSecond, startToolActivity, stopToolActivity, stopStreaming, setError]
  );

  const handleSend = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      // Use app-pinned model/provider if available, otherwise user defaults
      const providerId = activeApp?.provider || lastProvider || 'openrouter';
      const model = activeApp?.model || lastModel || getDefaultModel(providerId);
      let convId = currentConvId;

      // Create new conversation if needed
      if (!convId) {
        // Use app rules as system prompt, or pending conversation rule
        const systemPrompt = activeApp?.rules || pendingConversationRule || undefined;
        const title = text.replace(/\n/g, ' ').slice(0, 50);
        convId = createConversation(title, model, systemPrompt, undefined, {
          temporary: pendingTemporaryChat,
        });
        if (pendingTemporaryChat) {
          setConversationTemporary(true);
          setPendingTemporaryChat(false);
        }
        setCurrentConvId(convId);
        setActiveConversation(convId);

        // Link app to conversation
        if (activeApp) {
          updateConversation(convId, { app_id: activeApp.id });
        }
        // Persist active skill to new conversation
        if (activeSkillName) {
          updateConversation(convId, { active_skill_name: activeSkillName });
        }

        // Insert greeting as first assistant message (if app has one and this is the first message)
        if (activeApp?.greeting) {
          const greetingId = addMessage(convId, 'assistant', activeApp.greeting, model);
          const greetingMsg: Message = {
            id: greetingId,
            conversation_id: convId,
            role: 'assistant',
            content: activeApp.greeting,
            reasoning: null,
            attachments: null,
            status: 'complete',
            model,
            tokens_used: null,
            tool_call_id: null,
            tool_calls: null,
            created_at: Date.now() - 1, // Ensure it appears before user message
          };
          setMessages((prev) => [...prev, greetingMsg]);
        }

        // Clear pending rule now that it's been applied
        if (pendingConversationRule) setPendingConversationRule(null);
      }

      // Save user message to SQLite
      const userMsgId = addMessage(convId, 'user', text, model, attachments || null);
      const userMsg: Message = {
        id: userMsgId,
        conversation_id: convId,
        role: 'user',
        content: text,
        reasoning: null,
        attachments: attachments || null,
        status: 'complete',
        model,
        tokens_used: null,
        tool_call_id: null,
        tool_calls: null,
        created_at: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);

      // Auto-title: update conversation title from first user message
      const currentMessages = getMessages(convId);
      const userMessages = currentMessages.filter((m) => m.role === 'user');
      if (userMessages.length <= 1) {
        const title = text.replace(/\n/g, ' ').slice(0, 50);
        updateConversation(convId, { title });
      }

      // Stream assistant response
      await streamNewResponse(convId);
    },
    [currentConvId, lastModel, lastProvider, activeApp, setActiveConversation, streamNewResponse, pendingConversationRule, setPendingConversationRule, pendingTemporaryChat, setPendingTemporaryChat, activeSkillName]
  );

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const { streamingMessageId, streamingContent } = useChatStore.getState();
    if (streamingMessageId) {
      updateMessage(streamingMessageId, {
        content: streamingContent,
        status: 'cancelled',
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingMessageId
            ? { ...m, content: streamingContent, status: 'cancelled' }
            : m
        )
      );
    }
    stopStreaming();
  }, [stopStreaming]);

  const handleSuggestion = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend]
  );

  const handleNewChat = useCallback(() => {
    setEditingMessage(null);
    setMessages([]);
    setCurrentConvId(null);
    setActiveConversation(null);
    setActiveSkillName(null);
    setActiveApp(null);
    setPendingConversationRule(null);
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/');
  }, [router, setActiveConversation, setEditingMessage, setPendingConversationRule]);

  // ─── Edit & Resend ──────────────────────────────────────────────────

  const handleEditAndResend = useCallback(
    (messageId: string) => {
      setEditingMessage(messageId);
    },
    [setEditingMessage]
  );

  const handleEditSubmit = useCallback(
    async (messageId: string, newContent: string) => {
      if (!currentConvId) return;

      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return;

      // Delete all messages after the edited one
      deleteMessagesAfter(currentConvId, msg.created_at);

      // Update the edited message content
      updateMessage(messageId, { content: newContent });

      // Clear edit mode
      setEditingMessage(null);

      // Reload messages from DB (now just includes up to the edited msg)
      const updatedMessages = getMessages(currentConvId);
      setMessages(updatedMessages);

      // Stream a new assistant response (no new user msg created)
      await streamNewResponse(currentConvId);
    },
    [currentConvId, messages, setEditingMessage, streamNewResponse]
  );

  const handleEditCancel = useCallback(() => {
    setEditingMessage(null);
  }, [setEditingMessage]);

  const handleInputBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setInputBarHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    );
  }, []);

  // ─── Regenerate ─────────────────────────────────────────────────────

  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (!currentConvId) return;

      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      const assistantMsg = messages[msgIndex];
      if (assistantMsg.role !== 'assistant') return;

      // Delete the assistant message from DB
      deleteMessage(messageId);

      // Remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      // Stream a new response (reuses the existing user message in history)
      await streamNewResponse(currentConvId);
    },
    [currentConvId, messages, streamNewResponse]
  );

  // ─── Delete single message ──────────────────────────────────────────

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    []
  );

  // ─── Retry (re-send after error) ────────────────────────────────────

  const handleRetry = useCallback(
    async (messageId: string) => {
      if (!currentConvId) return;

      // Delete the errored assistant message
      deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      // Stream a new response
      await streamNewResponse(currentConvId);
    },
    [currentConvId, streamNewResponse]
  );

  const handleChoiceSubmit = useCallback(
    async (messageId: string, submission: AskUserChoiceSubmission) => {
      const choiceMessage = messages.find((m) => m.id === messageId);
      if (!choiceMessage || choiceMessage.status !== 'waiting') return;

      const pendingChoice = parseAskUserChoiceToolCall(choiceMessage.tool_calls);
      if (!pendingChoice) return;

      const convId = choiceMessage.conversation_id;
      const providerId = activeApp?.provider || lastProvider || 'openrouter';
      const model = choiceMessage.model || activeApp?.model || lastModel || getDefaultModel(providerId);
      const createdAt = Date.now();
      const toolResult = serializeAskUserChoiceToolResult(pendingChoice.request, submission);
      const userSummary = formatAskUserChoiceUserMessage(submission);

      updateMessage(messageId, { status: 'complete' });
      addMessage(
        convId,
        'tool',
        toolResult,
        model,
        null,
        pendingChoice.call.id,
        null,
        createdAt
      );
      addMessage(convId, 'user', userSummary, model, null, null, null, createdAt + 1);
      touchConversation(convId);

      const updatedMessages = getMessages(convId);
      setMessages(updatedMessages);
      await streamNewResponse(convId);
    },
    [activeApp?.model, activeApp?.provider, lastModel, lastProvider, messages, streamNewResponse]
  );

  const handleChoiceDismiss = useCallback(
    async (messageId: string) => {
      const choiceMessage = messages.find((m) => m.id === messageId);
      const pendingChoice = parseAskUserChoiceToolCall(choiceMessage?.tool_calls);
      if (!pendingChoice) return;

      const answers = Object.fromEntries(
        pendingChoice.request.questions.map((question) => [question.question, 'You decide'])
      );

      await handleChoiceSubmit(messageId, { answers, skipped: true });
    },
    [handleChoiceSubmit, messages]
  );

  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
  const hasMessages = messages.length > 0;
  const effectiveProviderId = activeApp?.provider || lastProvider || 'openrouter';
  const effectiveModelId = activeApp?.model || lastModel || getDefaultModel(effectiveProviderId);
  const contextCircleBottomOffset = (inputBarHeight || Math.max(insets.bottom, 12) + 72) + 12;
  const liveTokensPerSecondLabel = isStreaming
    ? formatTokensPerSecond(streamingTokensPerSecond)
    : null;
  const contextWindow = useMemo(
    () => {
      // Re-read LiteLLM fallback data after the async registry fetch completes.
      void metadataVersion;
      return getModelContextWindow(effectiveModelId, effectiveProviderId);
    },
    [effectiveModelId, effectiveProviderId, metadataVersion]
  );
  const contextSystemPrompt = useMemo(() => {
    if (!currentConvId) return activeApp?.rules || pendingConversationRule || undefined;

    const conversation = getConversation(currentConvId);
    return composeSystemPrompt(
      currentConvId,
      conversation?.system_prompt,
      activeSkillName ?? conversation?.active_skill_name ?? null
    );
  }, [activeApp?.rules, activeSkillName, currentConvId, pendingConversationRule]);
  const contextMessages = useMemo(() => {
    if (!streamingMessageId) return messages;

    return messages.map((message) => {
      if (message.id !== streamingMessageId) return message;
      return {
        ...message,
        content: streamingContent,
        reasoning: streamingReasoning || message.reasoning,
      };
    });
  }, [messages, streamingContent, streamingMessageId, streamingReasoning]);
  const contextUsedTokens = useMemo(() => {
    if (!contextWindow || contextMessages.length === 0) return 0;
    return estimateMessageTokens(contextMessages, contextSystemPrompt);
  }, [contextMessages, contextSystemPrompt, contextWindow]);
  const pendingChoiceMessage = useMemo(
    () => messages.find((message) =>
      message.status === 'waiting' && parseAskUserChoiceToolCall(message.tool_calls)
    ),
    [messages]
  );
  const isWaitingForChoice = !!pendingChoiceMessage;

  return (
    <View className="flex-1 bg-background">
      {/* Top Bar */}
      <View
        className="flex-row items-center px-4 h-14"
        style={{ marginTop: insets.top }}
      >
        <Pressable onPress={openDrawer} className="w-10 h-10 items-center justify-center">
          <Menu size={24} color="hsl(0, 0%, 63%)" />
        </Pressable>
        <View
          className="flex-1 flex-row items-center justify-center gap-1.5 px-1"
          style={{ minWidth: 0 }}
        >
          {/* Active app indicator */}
          {activeApp ? (
            <Pressable
              onPress={openModelPicker}
              className="flex-row items-center gap-1.5 bg-surface-container-low rounded-full px-3 py-1.5 active:opacity-70"
              style={{ maxWidth: 148, minWidth: 0, flexShrink: 1 }}
            >
              {React.createElement(getIconByName(activeApp.icon), {
                size: 14,
                color: activeApp.color ?? 'hsl(0, 0%, 63%)',
              })}
              <Text
                className="text-foreground text-[12px] font-medium"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ minWidth: 0, flexShrink: 1 }}
              >
                {activeApp.name.length > 14 ? activeApp.name.slice(0, 14) + '…' : activeApp.name}
              </Text>
            </Pressable>
          ) : (
            <ModelPill />
          )}
          {hasImageGenKey && <ImageGenToggle />}
          <ChatSettingsButton />
          {/* Skill activation pill */}
          <Pressable
            onPress={openSkillPicker}
            className={`flex-row items-center gap-1 rounded-full px-2.5 py-1.5 ${
              activeSkillName ? 'bg-foreground' : 'bg-surface-container-low'
            }`}
            style={{ maxWidth: activeSkillName ? 108 : 32, minWidth: 32, flexShrink: 0 }}
            accessibilityRole="button"
            accessibilityLabel="Select skill"
          >
            <Zap
              size={13}
              color={activeSkillName ? 'hsl(240, 3.7%, 7.5%)' : 'hsl(0, 0%, 50%)'}
              fill={activeSkillName ? 'hsl(240, 3.7%, 7.5%)' : 'transparent'}
            />
            {activeSkillName && (
              <Text
                className="text-background text-[11px] font-medium"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ minWidth: 0, flexShrink: 1 }}
              >
                {activeSkillName.length > 12 ? activeSkillName.slice(0, 12) + '…' : activeSkillName}
              </Text>
            )}
          </Pressable>
        </View>
        <Pressable onPress={handleNewChat} className="w-10 h-10 items-center justify-center">
          <PenSquare size={20} color="hsl(0, 0%, 63%)" />
        </Pressable>
      </View>

      {/* Offline Banner */}
      <OfflineBanner />

      {(currentConvId ? conversationTemporary : pendingTemporaryChat) && (
        <View className="items-center px-4 pb-1" accessibilityRole="text">
          <View className="flex-row items-center gap-1.5 rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-1">
            <Ghost size={12} color="hsl(0, 0%, 55%)" />
            <Text className="text-muted-foreground text-[11px]">
              Temporary chat · not saved to history or memory
            </Text>
          </View>
        </View>
      )}

      {/* Content */}
      <View className="flex-1">
        {hasMessages ? (
          <MessageList
            messages={messages}
            targetMessageId={focusMessageId}
            targetRequestKey={focusRequestKey}
            highlightedMessageId={highlightedMessageId}
            onEditSubmit={handleEditSubmit}
            onEditCancel={handleEditCancel}
            onRetry={handleRetry}
            onChoiceSubmit={handleChoiceSubmit}
            onChoiceDismiss={handleChoiceDismiss}
          />
        ) : (
          <EmptyState
            onSuggestionPress={handleSuggestion}
            appName={activeApp?.name}
            appGreeting={activeApp?.greeting}
            appPrompts={activeApp?.example_prompts ? parseExamplePrompts(activeApp.example_prompts) : undefined}
          />
        )}
      </View>

      <View
        pointerEvents={isKeyboardVisible ? 'none' : 'box-none'}
        style={{
          position: 'absolute',
          right: 16,
          bottom: contextCircleBottomOffset,
          opacity: isKeyboardVisible ? 0 : 1,
          zIndex: 1000,
          elevation: 1000,
        }}
      >
        <ContextWindowCircle
          usedTokens={contextUsedTokens}
          contextWindow={contextWindow}
        />
      </View>

      {/* Input — sticks above keyboard */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }} onLayout={handleInputBarLayout}>
        {liveTokensPerSecondLabel && (
          <View pointerEvents="none" className="items-center bg-background px-4 pb-1">
            <View className="rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-1">
              <Text
                className="text-muted-foreground text-[11px]"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {liveTokensPerSecondLabel} tokens/s
              </Text>
            </View>
          </View>
        )}
        <InputBar
          onSend={handleSend}
          onStop={handleStop}
          disabled={isWaitingForChoice}
          disabledPlaceholder="Choose an option above..."
        />
      </KeyboardStickyView>

      <Toast bottomOffset={Math.max(insets.bottom, 12) + 84} />

      {/* Message Actions Menu */}
      <MessageActionsMenu
        onEditAndResend={handleEditAndResend}
        onRegenerate={handleRegenerate}
        onDelete={handleDeleteMessage}
      />

      {/* Skill Picker */}
      <SkillPicker
        open={skillPickerOpen}
        onClose={closeSkillPicker}
        activeSkillName={activeSkillName}
        onSelectSkill={(skillName) => {
          setActiveSkillName(skillName);
          // Persist to conversation if one exists
          if (currentConvId) {
            updateConversation(currentConvId, { active_skill_name: skillName });
          }
        }}
      />
    </View>
  );
});

function getDefaultModel(providerId: string): string {
  switch (providerId) {
    case 'openrouter':
      return 'google/gemini-2.0-flash-exp:free';
    case 'openai':
      return 'gpt-5.4-mini';
    case 'openai-codex':
      return 'gpt-5.1-codex';
    case 'google-ai':
      return 'gemini-2.0-flash';
    case 'anthropic':
      return 'claude-3-5-haiku-20241022';
    case 'minimax':
      return 'MiniMax-M2.7';
    case 'cloudflare-ai':
      return '@cf/openai/gpt-oss-120b';
    default:
      return 'google/gemini-2.0-flash-exp:free';
  }
}
