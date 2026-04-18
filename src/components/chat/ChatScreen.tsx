import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, PenSquare } from 'lucide-react-native';
import { ModelPill } from '@/components/chat/ModelPill';
import { MessageList } from '@/components/chat/MessageList';
import { InputBar } from '@/components/chat/InputBar';
import { EmptyState } from '@/components/chat/EmptyState';
import { useChatStore } from '@/stores/chat-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getMessages } from '@/lib/db/messages';
import { addMessage, updateMessage } from '@/lib/db/messages';
import {
  createConversation,
  updateConversation,
  touchConversation,
} from '@/lib/db/conversations';
import { getApiKey } from '@/lib/storage/secure';
import { OpenRouterProvider } from '@/lib/providers/openrouter';
import { useRouter } from 'expo-router';
import type { Message } from '@/types';

interface ChatScreenProps {
  conversationId: string | null;
}

export function ChatScreen({ conversationId }: ChatScreenProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(conversationId);
  const abortRef = useRef<{ abort: () => void } | null>(null);

  const openDrawer = useUIStore((s) => s.openDrawer);
  const setActiveConversation = useUIStore((s) => s.setActiveConversation);
  const lastModel = useSettingsStore((s) => s.lastModel);

  const {
    isStreaming,
    startStreaming,
    appendToken,
    appendReasoningToken,
    stopStreaming,
    setError,
  } = useChatStore();

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

  const handleSend = useCallback(
    async (text: string) => {
      const apiKey = await getApiKey('openrouter');
      if (!apiKey) return;

      const model = lastModel || 'google/gemini-2.0-flash-exp:free';
      let convId = currentConvId;

      // Create new conversation if needed — NO navigation, just update state
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

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      startStreaming(assistantMsgId);

      // Auto-title: update conversation title from first user message
      const currentMessages = getMessages(convId);
      const userMessages = currentMessages.filter((m) => m.role === 'user');
      if (userMessages.length <= 1) {
        const title = text.replace(/\n/g, ' ').slice(0, 50);
        updateConversation(convId, { title });
      }

      // Build full message history for API
      const fullMessages = getMessages(convId).filter(
        (m) => m.role !== 'system' && m.id !== assistantMsgId
      );

      // Start streaming
      const provider = new OpenRouterProvider();
      let accumulated = '';
      let accumulatedReasoning = '';

      const response = provider.stream(
        fullMessages,
        { model, apiKey },
        // onContent
        (token) => {
          accumulated += token;
          appendToken(token);
        },
        // onReasoning
        (reasoningToken) => {
          accumulatedReasoning += reasoningToken;
          appendReasoningToken(reasoningToken);
        },
        // onDone
        () => {
          updateMessage(assistantMsgId, {
            content: accumulated,
            reasoning: accumulatedReasoning || null,
            status: 'complete',
          });
          touchConversation(convId!);
          stopStreaming();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: accumulated, reasoning: accumulatedReasoning || null, status: 'complete' }
                : m
            )
          );
        },
        // onError
        (error) => {
          updateMessage(assistantMsgId, {
            content: accumulated || 'Error: ' + error.message,
            reasoning: accumulatedReasoning || null,
            status: 'error',
          });
          touchConversation(convId!);
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
    [currentConvId, lastModel, startStreaming, appendToken, appendReasoningToken, stopStreaming, setError, setActiveConversation]
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
    setMessages([]);
    setCurrentConvId(null);
    setActiveConversation(null);
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/');
  }, [router, setActiveConversation]);

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
        className="flex-row items-center justify-between px-4 h-14"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={openDrawer} className="w-10 h-10 items-center justify-center">
          <Menu size={24} color="hsl(0, 0%, 63%)" />
        </Pressable>
        <ModelPill />
        <Pressable onPress={handleNewChat} className="w-10 h-10 items-center justify-center">
          <PenSquare size={20} color="hsl(0, 0%, 63%)" />
        </Pressable>
      </View>

      {/* Content */}
      <View className="flex-1">
        {hasMessages ? (
          <MessageList messages={messages} />
        ) : (
          <EmptyState onSuggestionPress={handleSuggestion} />
        )}
      </View>

      {/* Input */}
      <InputBar onSend={handleSend} onStop={handleStop} />
    </KeyboardAvoidingView>
  );
}
