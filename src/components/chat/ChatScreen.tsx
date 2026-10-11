import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, AppState, type AppStateStatus, type LayoutChangeEvent } from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Menu, PenSquare, Zap, Ghost } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
import { ModelPill } from '@/components/chat/ModelPill';
import { ChatSettingsButton } from '@/components/chat/ChatSettingsButton';
import { ImageGenToggle } from '@/components/chat/ImageGenToggle';
import { ContextWindowCircle } from '@/components/chat/ContextWindowCircle';
import { MessageList } from '@/components/chat/MessageList';
import { MessageActionsMenu } from '@/components/chat/MessageActionsMenu';
import { OfflineBanner } from '@/components/chat/OfflineBanner';
import { InputBar } from '@/components/chat/InputBar';
import { EmptyState } from '@/components/chat/EmptyState';
import { MemoryIntroCard } from '@/components/chat/MemoryIntroCard';
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
import { registerBuiltInProviders, listProviders } from '@/lib/providers/registry';
import { registerTool, getTool } from '@/lib/tools/registry';
import { deepResearchTool, webSearchTool } from '@/lib/tools/web-search';
import { generateImageTool } from '@/lib/tools/image-gen';
import { saveMemoryTool, updateMemoryTool, forgetMemoryTool } from '@/lib/tools/memory-tools';
import { searchPastChatsTool, recentChatsTool } from '@/lib/tools/chat-history-tools';
import { useMemoryEventsStore } from '@/stores/memory-events-store';
import {
  ASK_USER_CHOICE_TOOL_NAME,
  askUserChoiceTool,
  formatAskUserChoiceUserMessage,
  parseAskUserChoiceToolCall,
  serializeAskUserChoiceToolResult,
  type AskUserChoiceSubmission,
} from '@/lib/tools/ask-user-choice';
import { composeSystemPrompt } from '@/lib/rules/injector';
import { createTurnRunner } from '@/lib/chat/run-turn';
import { resolveTurnModel } from '@/lib/chat/turn-config';
import { createTurnServices } from '@/lib/chat/run-turn.deps';
import { estimateMessageTokens } from '@/lib/tokens/estimator';
import { formatTokensPerSecond } from '@/lib/tokens/metrics';
import { getApp } from '@/lib/db/apps';
import { getIconByName } from '@/lib/apps/icons';
import { parseExamplePrompts } from '@/lib/apps/types';
import { getModelContextWindow } from '@/lib/models/capabilities';
import { loadModelMetadata, useModelListStore } from '@/lib/models/model-list-sync';
import { useIsFocused, useRouter } from 'expo-router';
import type { Message, Attachment } from '@/types';

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
  // One reply pipeline per screen; it owns the abort handle and per-turn usage.
  const [turnRunner] = useState(() =>
    createTurnRunner({
      ...createTurnServices(),
      view: {
        appendMessage: (message) => setMessages((prev) => [...prev, message]),
        patchMessage: (messageId, fields) =>
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...fields } : m))),
        replaceMessages: setMessages,
        onFirstOutput: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    })
  );

  const openDrawer = useUIStore((s) => s.openDrawer);
  const palette = usePalette();
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
  const imageGenEnabled = useSettingsStore((s) => s.imageGenEnabled);
  const skillPickerOpen = useUIStore((s) => s.skillPickerOpen);
  const closeSkillPicker = useUIStore((s) => s.closeSkillPicker);
  const openSkillPicker = useUIStore((s) => s.openSkillPicker);
  const openModelPicker = useUIStore((s) => s.openModelPicker);
  // Home and /chat/[id] can both be mounted, and overlays open from global UI
  // state, so only the focused screen renders them (one modal, wired to the
  // visible conversation).
  const isFocused = useIsFocused();

  // Only the (stable) action: the per-frame streaming state is read by the
  // small live components below, so a streamed token doesn't re-render this.
  const stopStreaming = useChatStore((s) => s.stopStreaming);

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
        if (turnRunner.interrupt()) {
          stopStreaming();
        }
      }
      lastState = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [stopStreaming, turnRunner]);

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

  // ─── Core streaming logic (see lib/chat/run-turn) ───────────────────
  const streamNewResponse = useCallback(
    (convId: string) =>
      turnRunner.run({
        conversationId: convId,
        app: activeApp
          ? { provider: activeApp.provider, model: activeApp.model, name: activeApp.name }
          : null,
        activeSkillName,
        settings: {
          lastProvider,
          lastModel,
          thinkingMode,
          webSearchEnabled,
          memoryEnabled,
          memoryAutoEnabled,
          memoryChatHistoryEnabled,
          imageGenEnabled,
        },
      }),
    [turnRunner, activeApp, lastModel, lastProvider, thinkingMode, webSearchEnabled, memoryEnabled, memoryAutoEnabled, memoryChatHistoryEnabled, imageGenEnabled, activeSkillName]
  );

  const handleSend = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      // Use app-pinned model/provider if available, otherwise user defaults
      const { model } = resolveTurnModel(activeApp, lastProvider, lastModel);
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
    turnRunner.interrupt();
    stopStreaming();
  }, [stopStreaming, turnRunner]);

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
      const model = choiceMessage.model || resolveTurnModel(activeApp, lastProvider, lastModel).model;
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
    [activeApp, lastModel, lastProvider, messages, streamNewResponse]
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
  const { providerId: effectiveProviderId, model: effectiveModelId } = resolveTurnModel(
    activeApp,
    lastProvider,
    lastModel
  );
  const contextCircleBottomOffset = (inputBarHeight || Math.max(insets.bottom, 12) + 72) + 12;
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
        <PressableScale
          onPress={openDrawer}
          scaleTo={0.88}
          hitSlop={4}
          className="w-10 h-10 items-center justify-center rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Open conversations"
        >
          <Menu size={22} color={palette.icon} />
        </PressableScale>
        <View
          className="flex-1 flex-row items-center justify-center gap-1.5 px-1"
          style={{ minWidth: 0 }}
        >
          {/* Active app indicator */}
          {activeApp ? (
            <PressableScale
              onPress={openModelPicker}
              scaleTo={0.95}
              className="flex-row items-center gap-1.5 bg-surface-container-low rounded-full px-3 py-1.5"
              style={{ maxWidth: 148, minWidth: 0, flexShrink: 1, borderWidth: 1, borderColor: palette.border }}
            >
              {React.createElement(getIconByName(activeApp.icon), {
                size: 14,
                color: activeApp.color ?? palette.icon,
              })}
              <Text
                className="text-foreground text-[12px] font-medium"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ minWidth: 0, flexShrink: 1 }}
              >
                {activeApp.name.length > 14 ? activeApp.name.slice(0, 14) + '…' : activeApp.name}
              </Text>
            </PressableScale>
          ) : (
            <ModelPill />
          )}
          {hasImageGenKey && <ImageGenToggle />}
          <ChatSettingsButton />
          {/* Skill activation pill */}
          <PressableScale
            onPress={openSkillPicker}
            haptic
            scaleTo={0.9}
            className={`flex-row items-center justify-center gap-1 rounded-full ${
              activeSkillName ? 'bg-foreground px-2.5' : 'bg-surface-container-low'
            }`}
            style={{
              height: 32,
              maxWidth: activeSkillName ? 108 : 32,
              minWidth: 32,
              flexShrink: 0,
              borderWidth: activeSkillName ? 0 : 1,
              borderColor: palette.border,
            }}
            accessibilityRole="button"
            accessibilityLabel="Select skill"
          >
            <Zap
              size={14}
              color={activeSkillName ? palette.onAccent : palette.icon}
              fill={activeSkillName ? palette.onAccent : 'transparent'}
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
          </PressableScale>
        </View>
        <PressableScale
          onPress={handleNewChat}
          scaleTo={0.88}
          hitSlop={4}
          className="w-10 h-10 items-center justify-center rounded-full"
          accessibilityRole="button"
          accessibilityLabel="New chat"
        >
          <PenSquare size={20} color={palette.icon} />
        </PressableScale>
      </View>

      {/* Offline Banner */}
      <OfflineBanner />

      {(currentConvId ? conversationTemporary : pendingTemporaryChat) && (
        <Animated.View
          entering={FadeIn.duration(Motion.duration.base)}
          exiting={FadeOut.duration(Motion.duration.fast)}
          style={{ alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 }}
          accessibilityRole="text"
        >
          <View className="flex-row items-center gap-1.5 rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-1">
            <Ghost size={12} color={palette.icon} />
            <Text className="text-muted-foreground text-[11px]">
              Temporary chat · not saved to history or memory
            </Text>
          </View>
        </Animated.View>
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
          <Animated.View key="empty" exiting={FadeOut.duration(Motion.duration.fast)} style={{ flex: 1 }}>
            <EmptyState
              onSuggestionPress={handleSuggestion}
              appName={activeApp?.name}
              appGreeting={activeApp?.greeting}
              appPrompts={activeApp?.example_prompts ? parseExamplePrompts(activeApp.example_prompts) : undefined}
              footer={pendingTemporaryChat ? null : <MemoryIntroCard />}
            />
          </Animated.View>
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
        <LiveContextWindowCircle
          messages={messages}
          systemPrompt={contextSystemPrompt}
          contextWindow={contextWindow}
        />
      </View>

      {/* Input — sticks above keyboard */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }} onLayout={handleInputBarLayout}>
        <LiveTokensPerSecond />
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
        active={isFocused}
        onEditAndResend={handleEditAndResend}
        onRegenerate={handleRegenerate}
        onDelete={handleDeleteMessage}
      />

      {/* Skill Picker */}
      <SkillPicker
        open={skillPickerOpen && isFocused}
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

// ─── Live streaming readouts ────────────────────────────────────────────
// These subscribe to the chat store themselves so the per-frame streaming
// updates re-render only them, not the whole ChatScreen.

interface LiveContextWindowCircleProps {
  messages: Message[];
  systemPrompt: string | undefined;
  contextWindow: number | undefined;
}

/** Context ring that counts the reply as it streams in. */
function LiveContextWindowCircle({
  messages,
  systemPrompt,
  contextWindow,
}: LiveContextWindowCircleProps) {
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  // Home and /chat/[id] can both be mounted; only the screen holding the
  // streaming message follows its text (the other's count is unaffected).
  const isLive =
    streamingMessageId !== null && messages.some((m) => m.id === streamingMessageId);
  const streamingContent = useChatStore((s) => (isLive ? s.streamingContent : ''));
  const streamingReasoning = useChatStore((s) => (isLive ? s.streamingReasoning : ''));

  const contextMessages = useMemo(() => {
    if (!isLive) return messages;

    return messages.map((message) => {
      if (message.id !== streamingMessageId) return message;
      return {
        ...message,
        content: streamingContent,
        reasoning: streamingReasoning || message.reasoning,
      };
    });
  }, [isLive, messages, streamingContent, streamingMessageId, streamingReasoning]);
  const usedTokens = useMemo(() => {
    if (!contextWindow || contextMessages.length === 0) return 0;
    return estimateMessageTokens(contextMessages, systemPrompt);
  }, [contextMessages, systemPrompt, contextWindow]);

  return <ContextWindowCircle usedTokens={usedTokens} contextWindow={contextWindow} />;
}

/** "N tokens/s" pill above the input while a reply streams. */
function LiveTokensPerSecond() {
  const palette = usePalette();
  // The formatted label, so updates that round to the same text don't render.
  const label = useChatStore((s) =>
    s.isStreaming ? formatTokensPerSecond(s.streamingTokensPerSecond) : null
  );
  if (!label) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(Motion.duration.base)}
      exiting={FadeOut.duration(Motion.duration.fast)}
      pointerEvents="none"
      style={{ alignItems: 'center', backgroundColor: palette.background, paddingHorizontal: 16, paddingBottom: 4 }}
    >
      <View className="rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-1">
        <Text
          className="text-muted-foreground text-[11px]"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {label} tokens/s
        </Text>
      </View>
    </Animated.View>
  );
}
