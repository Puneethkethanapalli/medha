import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, AppState, type AppStateStatus } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Menu, PenSquare, Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ModelPill } from '@/components/chat/ModelPill';
import { ChatSettingsButton } from '@/components/chat/ChatSettingsButton';
import { ImageGenToggle } from '@/components/chat/ImageGenToggle';
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
import { webSearchTool } from '@/lib/tools/web-search';
import { generateImageTool } from '@/lib/tools/image-gen';
import { saveMemoryTool, forgetMemoryTool } from '@/lib/tools/memory-tools';
import { composeSystemPrompt } from '@/lib/rules/injector';
import { parseAllowedTools } from '@/lib/skills/injector';
import { readSkillFull } from '@/lib/skills/storage';
import { recordUsage } from '@/lib/db/token-usage';
import { calculateCost } from '@/lib/tokens/pricing';
import { getApp } from '@/lib/db/apps';
import { getIconByName } from '@/lib/apps/icons';
import { parseExamplePrompts } from '@/lib/apps/types';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { useRouter } from 'expo-router';
import type { Message, Attachment } from '@/types';

const MAX_TOOL_ROUNDS = 3;

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
  const imageGenEnabled = useSettingsStore((s) => s.imageGenEnabled);
  const skillPickerOpen = useUIStore((s) => s.skillPickerOpen);
  const closeSkillPicker = useUIStore((s) => s.closeSkillPicker);
  const openSkillPicker = useUIStore((s) => s.openSkillPicker);
  const openModelPicker = useUIStore((s) => s.openModelPicker);

  const {
    startStreaming,
    appendToken,
    appendReasoningToken,
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
    if (listTools().length === 0) {
      registerTool(webSearchTool);
    }
    // Register image generation tool
    if (!getTool('generate_image')) {
      registerTool(generateImageTool);
    }
    // Memory tools are always registered — they're core functionality
    if (!getTool('save_memory')) {
      registerTool(saveMemoryTool);
    }
    if (!getTool('forget_memory')) {
      registerTool(forgetMemoryTool);
    }
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
      setActiveConversation(currentConvId);
      // Load active skill from conversation
      const conv = getConversation(currentConvId);
      setActiveSkillName(conv?.active_skill_name ?? null);
      // Load linked app
      if (conv?.app_id) {
        setActiveApp(getApp(conv.app_id));
      }
    } else {
      setMessages([]);
      setActiveConversation(null);
      setActiveSkillName(null);
    }
  }, [currentConvId, setActiveConversation]);

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
      const providerId = lastProvider || 'openrouter';
      const apiKey = await getApiKey(providerId);
      if (!apiKey) return;

      const provider = getProvider(providerId);
      if (!provider) return;

      const model = lastModel || getDefaultModel(providerId);
      const conversation = getConversation(convId);
      const convActiveSkill = activeSkillName ?? conversation?.active_skill_name ?? null;
      let systemPrompt = composeSystemPrompt(
        convId,
        conversation?.system_prompt,
        convActiveSkill
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
      if (memoryEnabled) {
        const memoryInstruction =
          'You have access to memory tools. When the user shares a personal preference, fact about themselves, or instruction for future conversations, use the save_memory tool to remember it. When they ask you to forget something, use the forget_memory tool.';
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

      // Build tool config — web search when enabled, memory tools always, image gen when enabled
      const useTools = (webSearchEnabled || memoryEnabled || imageGenEnabled) && listTools().length > 0;
      let activeToolNames: string[] = [];
      if (webSearchEnabled) activeToolNames.push('web_search');
      if (memoryEnabled) {
        activeToolNames.push('save_memory');
        activeToolNames.push('forget_memory');
      }
      if (imageGenEnabled) activeToolNames.push('generate_image');

      // If active skill declares allowed-tools, restrict to only those tools
      if (skillAllowedTools) {
        activeToolNames = activeToolNames.filter((t) => skillAllowedTools!.includes(t));
      }
      const toolConfig = useTools
        ? {
            tools: getOpenAIToolSchemas(activeToolNames),
            anthropicTools: providerId === 'anthropic' ? getAnthropicToolSchemas(activeToolNames) : undefined,
          }
        : {};

      // Start streaming
      let accumulated = '';
      let accumulatedReasoning = '';
      let firstTokenFired = false;
      // Reset usage accumulator for this response (accumulates across tool call rounds)
      if (toolRound === 0) {
        usageAccumRef.current = { promptTokens: 0, completionTokens: 0 };
      }

      const fireFirstTokenHaptic = () => {
        if (!firstTokenFired) {
          firstTokenFired = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      };

      const handleUsage = (usage: UsageData) => {
        usageAccumRef.current.promptTokens += usage.promptTokens;
        usageAccumRef.current.completionTokens += usage.completionTokens;
      };

      const handleDone = () => {
        // Save usage data
        const { promptTokens, completionTokens } = usageAccumRef.current;
        const tokensUsedJson = JSON.stringify({ prompt: promptTokens, completion: completionTokens });
        const costUsd = calculateCost(promptTokens, completionTokens, model);

        updateMessage(assistantMsgId, {
          content: accumulated,
          reasoning: accumulatedReasoning || null,
          status: 'complete',
          tokens_used: (promptTokens > 0 || completionTokens > 0) ? tokensUsedJson : null,
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
                  tokens_used: (promptTokens > 0 || completionTokens > 0) ? tokensUsedJson : null,
                }
              : m
          )
        );
        stopStreaming();
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
        if (toolRound >= MAX_TOOL_ROUNDS) {
          // Max rounds reached — finalize with whatever content we have
          handleDone();
          return;
        }

        // Update the assistant message to show tool usage status + save tool_calls metadata
        const toolNames = toolCalls.map((tc) => tc.name).join(', ');
        const statusText = accumulated || `Using ${toolNames}...`;
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

        // Execute each tool and save results as tool messages
        for (const tc of toolCalls) {
          const toolDef = getTool(tc.name);
          if (!toolDef) continue;

          try {
            const result = await toolDef.execute(tc.arguments);
            // Save tool result — use raw data for AI context, content for display
            // We repurpose the tool_calls column on the tool message to store citations
            const citationsJson = result.citations ? JSON.stringify(result.citations) : null;
            addMessage(convId, 'tool', result.raw ? String(result.raw) : result.content, model, null, tc.id, citationsJson);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Tool execution failed';
            addMessage(convId, 'tool', `Error: ${errMsg}`, model, null, tc.id);
          }
        }

        // Reload messages to include tool results, then re-stream for final response
        const updatedMessages = getMessages(convId);
        setMessages(updatedMessages);
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
          accumulated += token;
          appendToken(token);
        },
        (reasoningToken) => {
          fireFirstTokenHaptic();
          accumulatedReasoning += reasoningToken;
          appendReasoningToken(reasoningToken);
        },
        handleDone,
        handleError,
        useTools ? handleToolCalls : undefined,
        handleUsage
      );

      abortRef.current = response;
    },
    [lastModel, lastProvider, thinkingMode, webSearchEnabled, memoryEnabled, imageGenEnabled, activeSkillName, startStreaming, appendToken, appendReasoningToken, stopStreaming, setError]
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
        convId = createConversation(title, model, systemPrompt);
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
    [currentConvId, lastModel, lastProvider, activeApp, setActiveConversation, streamNewResponse, pendingConversationRule, setPendingConversationRule, activeSkillName]
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

  const insets = useSafeAreaInsets();
  const hasMessages = messages.length > 0;

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
        <View className="flex-1 flex-row items-center justify-center gap-2 px-2">
          {/* Active app indicator */}
          {activeApp ? (
            <Pressable
              onPress={openModelPicker}
              className="flex-row items-center gap-1.5 bg-surface-container-low rounded-full px-3 py-1.5 active:opacity-70"
            >
              {React.createElement(getIconByName(activeApp.icon), {
                size: 14,
                color: activeApp.color ?? 'hsl(0, 0%, 63%)',
              })}
              <Text className="text-foreground text-[12px] font-medium" numberOfLines={1}>
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
          >
            <Zap
              size={13}
              color={activeSkillName ? 'hsl(240, 3.7%, 7.5%)' : 'hsl(0, 0%, 50%)'}
              fill={activeSkillName ? 'hsl(240, 3.7%, 7.5%)' : 'transparent'}
            />
            {activeSkillName && (
              <Text className="text-background text-[11px] font-medium" numberOfLines={1}>
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

      {/* Input — sticks above keyboard */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <InputBar onSend={handleSend} onStop={handleStop} />
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
    case 'google-ai':
      return 'gemini-2.0-flash';
    case 'anthropic':
      return 'claude-3-5-haiku-20241022';
    case 'minimax':
      return 'MiniMax-M1-40k';
    default:
      return 'google/gemini-2.0-flash-exp:free';
  }
}
