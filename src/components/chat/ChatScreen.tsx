import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, AppState, type AppStateStatus } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Menu, PenSquare } from 'lucide-react-native';
import { ModelPill } from '@/components/chat/ModelPill';
import { ChatSettingsButton } from '@/components/chat/ChatSettingsButton';
import { MessageList } from '@/components/chat/MessageList';
import { MessageActionsMenu } from '@/components/chat/MessageActionsMenu';
import { OfflineBanner } from '@/components/chat/OfflineBanner';
import { InputBar } from '@/components/chat/InputBar';
import { EmptyState } from '@/components/chat/EmptyState';
import { Toast } from '@/components/common/Toast';
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
import { composeSystemPrompt } from '@/lib/rules/injector';
import type { AccumulatedToolCall } from '@/lib/streaming/stream';
import { useRouter } from 'expo-router';
import type { Message, Attachment } from '@/types';

const MAX_TOOL_ROUNDS = 3;

interface ChatScreenProps {
  conversationId: string | null;
  focusMessageId?: string | null;
  focusRequestKey?: string | null;
}

export const ChatScreen = React.memo(function ChatScreen({
  conversationId,
  focusMessageId = null,
  focusRequestKey = null,
}: ChatScreenProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(conversationId);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);

  const openDrawer = useUIStore((s) => s.openDrawer);
  const setActiveConversation = useUIStore((s) => s.setActiveConversation);
  const setEditingMessage = useUIStore((s) => s.setEditingMessage);
  const pendingConversationRule = useUIStore((s) => s.pendingConversationRule);
  const setPendingConversationRule = useUIStore((s) => s.setPendingConversationRule);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastProvider = useSettingsStore((s) => s.lastProvider);
  const thinkingMode = useSettingsStore((s) => s.thinkingMode);
  const webSearchEnabled = useSettingsStore((s) => s.webSearchEnabled);

  const {
    startStreaming,
    appendToken,
    appendReasoningToken,
    stopStreaming,
    setError,
  } = useChatStore();

  // Ensure providers and tools are registered
  useEffect(() => {
    if (listProviders().length === 0) {
      registerBuiltInProviders();
    }
    // Register built-in tools
    if (listTools().length === 0) {
      registerTool(webSearchTool);
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
    } else {
      setMessages([]);
      setActiveConversation(null);
    }
  }, [currentConvId, setActiveConversation]);

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
      const systemPrompt = composeSystemPrompt(
        convId,
        conversation?.system_prompt
      );

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

      // Build tool config — only when web search is enabled
      const useTools = webSearchEnabled && listTools().length > 0;
      const toolConfig = useTools
        ? {
            tools: getOpenAIToolSchemas(),
            anthropicTools: providerId === 'anthropic' ? getAnthropicToolSchemas() : undefined,
          }
        : {};

      // Start streaming
      let accumulated = '';
      let accumulatedReasoning = '';
      let firstTokenFired = false;

      const fireFirstTokenHaptic = () => {
        if (!firstTokenFired) {
          firstTokenFired = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      };

      const handleDone = () => {
        updateMessage(assistantMsgId, {
          content: accumulated,
          reasoning: accumulatedReasoning || null,
          status: 'complete',
        });
        touchConversation(convId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: accumulated, reasoning: accumulatedReasoning || null, status: 'complete' }
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
        useTools ? handleToolCalls : undefined
      );

      abortRef.current = response;
    },
    [lastModel, lastProvider, thinkingMode, webSearchEnabled, startStreaming, appendToken, appendReasoningToken, stopStreaming, setError]
  );

  const handleSend = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      const providerId = lastProvider || 'openrouter';
      const model = lastModel || getDefaultModel(providerId);
      let convId = currentConvId;

      // Create new conversation if needed
      if (!convId) {
        const title = text.replace(/\n/g, ' ').slice(0, 50);
        convId = createConversation(title, model, pendingConversationRule ?? undefined);
        setCurrentConvId(convId);
        setActiveConversation(convId);
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
    [currentConvId, lastModel, lastProvider, setActiveConversation, streamNewResponse, pendingConversationRule, setPendingConversationRule]
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
          <ModelPill />
          <ChatSettingsButton />
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
          <EmptyState onSuggestionPress={handleSuggestion} />
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
