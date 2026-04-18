import React, { useRef, useEffect, useCallback } from 'react';
import { FlatList, View } from 'react-native';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/stores/chat-store';
import type { Message } from '@/types';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const flatListRef = useRef<FlatList>(null);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);

  // Auto-scroll to bottom when new messages arrive or content streams
  useEffect(() => {
    if (messages.length > 0) {
      // Small delay to let layout settle
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isStreaming]);

  // Scroll on streaming content changes (throttled by react re-render batching)
  useEffect(() => {
    if (isStreaming && streamingContent.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: false });
    }
  }, [isStreaming, streamingContent]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <MessageBubble message={item} />,
    []
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
      }}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
      }}
    />
  );
}
