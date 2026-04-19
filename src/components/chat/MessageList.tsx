import React, { useRef, useEffect, useCallback, useState } from 'react';
import { FlatList, View, TouchableOpacity, StyleSheet } from 'react-native';
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
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [userScrolledAway, setUserScrolledAway] = useState(false);

  // Auto-scroll to bottom when a NEW message is added
  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // Track if user is near bottom - if they scrolled away, stop auto-scrolling on stream
  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const isAtBottom = distanceFromBottom < 100; // within 100px of bottom
    setUserScrolledAway(!isAtBottom);
  }, []);

  const jumpToBottom = useCallback(() => {
    setUserScrolledAway(false);
    setShowJumpToBottom(false);
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Show jump button when new streaming content arrives while scrolled up
  useEffect(() => {
    if (isStreaming && streamingContent.length > 0 && userScrolledAway) {
      setShowJumpToBottom(true);
    }
  }, [isStreaming, streamingContent.length, userScrolledAway]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <MessageBubble message={item} />,
    []
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  return (
    <View style={styles.container}>
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
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      {showJumpToBottom && (
        <TouchableOpacity style={styles.jumpButton} onPress={jumpToBottom}>
          <View style={styles.jumpButtonInner}>
            <View style={[styles.indicatorDot, isStreaming && styles.indicatorDotActive]} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  jumpButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  jumpButtonInner: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8E8E93',
  },
  indicatorDotActive: {
    backgroundColor: '#34C759',
  },
});
