import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Menu, PenSquare } from 'lucide-react-native';
import { ModelPill } from '@/components/chat/ModelPill';
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
import { useRouter } from 'expo-router';
import type { Message } from '@/types';

interface ChatScreenProps {
  conversationId: string | null;
  focusMessageId?: string | null;
  focusRequestKey?: string | null;
}

export function ChatScreen({
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
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastProvider = useSettingsStore((s) => s.lastProvider);

  const {
    startStreaming,
    appendToken,
    appendReasoningToken,
    stopStreaming,
    setError,
  } = useChatStore();

  // Ensure providers are registered
  useEffect(() => {
    if (listProviders().length === 0) {
      registerBuiltInProviders();
    }
  }, []);

  // Sync internal state when prop changes (e.g. navigating to a different conversation)
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

  // ─── Core streaming logic (no user message creation) ────────────────
  const streamNewResponse = useCallback(
    async (convId: string) => {
      const providerId = lastProvider || 'openrouter';
      const apiKey = await getApiKey(providerId);
      if (!apiKey) return;

      const provider = getProvider(providerId);
      if (!provider) return;

      const model = lastModel || getDefaultModel(providerId);
      const conversation = getConversation(convId);
      const systemPrompt = conversation?.system_prompt?.trim() || undefined;

      // Create placeholder assistant message
      const assistantMsgId = addMessage(convId, 'assistant', '', model);
      updateMessage(assistantMsgId, { status: 'streaming' });
      const assistantMsg: Message = {
        id: assistantMsgId,
        conversation_id: convId,
        role: 'assistant',
        content: '',
        reasoning: null,
        status: 'streaming',
        model,
        tokens_used: null,
        created_at: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      startStreaming(assistantMsgId);

      // Build full message history for API
      const fullMessages = getMessages(convId).filter(
        (m) => m.role !== 'system' && m.id !== assistantMsgId
      );

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

      const response = provider.stream(
        fullMessages,
        { model, apiKey, systemPrompt },
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
        () => {
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
        },
        (error) => {
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
        }
      );

      abortRef.current = response;
    },
    [lastModel, lastProvider, startStreaming, appendToken, appendReasoningToken, stopStreaming, setError]
  );

  const handleSend = useCallback(
    async (text: string) => {
      const providerId = lastProvider || 'openrouter';
      const model = lastModel || getDefaultModel(providerId);
      let convId = currentConvId;

      // Create new conversation if needed
      if (!convId) {
        const title = text.replace(/\n/g, ' ').slice(0, 50);
        convId = createConversation(title, model);
        setCurrentConvId(convId);
        setActiveConversation(convId);
      }

      // Save user message to SQLite
      const userMsgId = addMessage(convId, 'user', text, model);
      const userMsg: Message = {
        id: userMsgId,
        conversation_id: convId,
        role: 'user',
        content: text,
        reasoning: null,
        status: 'complete',
        model,
        tokens_used: null,
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
    [currentConvId, lastModel, lastProvider, setActiveConversation, streamNewResponse]
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
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/');
  }, [router, setActiveConversation, setEditingMessage]);

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
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Top Bar */}
      <View
        className="flex-row items-center px-4 h-14"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={openDrawer} className="w-10 h-10 items-center justify-center">
          <Menu size={24} color="hsl(0, 0%, 63%)" />
        </Pressable>
        <View className="flex-1 items-center px-2">
          <ModelPill />
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

      {/* Input */}
      <InputBar onSend={handleSend} onStop={handleStop} />
      <Toast bottomOffset={Math.max(insets.bottom, 12) + 84} />

      {/* Message Actions Menu */}
      <MessageActionsMenu
        onEditAndResend={handleEditAndResend}
        onRegenerate={handleRegenerate}
        onDelete={handleDeleteMessage}
      />
    </KeyboardAvoidingView>
  );
}

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
