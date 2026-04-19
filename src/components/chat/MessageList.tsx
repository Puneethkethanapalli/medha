import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  FlatList,
  View,
  TouchableOpacity,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/stores/chat-store';
import type { Message } from '@/types';

interface MessageListProps {
  messages: Message[];
}

const FOLLOW_BOTTOM_THRESHOLD = 24;
const SCROLL_AWAY_THRESHOLD = 8;
const JUMP_BUTTON_THRESHOLD = 64;

export function MessageList({ messages }: MessageListProps) {
  const flatListRef = useRef<FlatList<Message>>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const shouldFollowBottomRef = useRef(true);
  const isUserScrollingRef = useRef(false);
  const dragStartOffsetYRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);
  const metricsRef = useRef({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
  });

  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContentLength = useChatStore((s) => s.streamingContent.length);
  const streamingReasoningLength = useChatStore((s) => s.streamingReasoning.length);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const setJumpButtonVisible = useCallback((visible: boolean) => {
    setShowJumpToBottom((current) => (current === visible ? current : visible));
  }, []);

  const getDistanceFromBottom = useCallback(() => {
    const { contentHeight, offsetY, viewportHeight } = metricsRef.current;
    return Math.max(0, contentHeight - viewportHeight - offsetY);
  }, []);

  const isAtBottom = useCallback(() => {
    const { contentHeight, viewportHeight } = metricsRef.current;
    if (viewportHeight <= 0 || contentHeight <= viewportHeight) {
      return true;
    }
    return getDistanceFromBottom() <= FOLLOW_BOTTOM_THRESHOLD;
  }, [getDistanceFromBottom]);

  const hasScrollableContent = useCallback(() => {
    const { contentHeight, viewportHeight } = metricsRef.current;
    return viewportHeight > 0 && contentHeight > viewportHeight + JUMP_BUTTON_THRESHOLD;
  }, []);

  const setFollowBottom = useCallback(
    (follow: boolean) => {
      shouldFollowBottomRef.current = follow;
      setJumpButtonVisible(!follow && hasScrollableContent());
    },
    [hasScrollableContent, setJumpButtonVisible]
  );

  const scrollToBottom = useCallback((animated: boolean) => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  // A newly opened conversation should start at the latest message.
  useEffect(() => {
    const conversationId = messages[0]?.conversation_id ?? null;
    if (conversationIdRef.current !== conversationId) {
      conversationIdRef.current = conversationId;
      isUserScrollingRef.current = false;
      setFollowBottom(true);
      scrollToBottom(false);
    }
  }, [messages, scrollToBottom, setFollowBottom]);

  // Only follow appended messages if the user was already reading the bottom.
  useEffect(() => {
    if (messages.length > 0 && shouldFollowBottomRef.current && !isUserScrollingRef.current) {
      scrollToBottom(true);
    }
  }, [messages.length, scrollToBottom]);

  // Streaming changes row height without changing `messages`, so keep the
  // viewport pinned only while the user has not scrolled away.
  useEffect(() => {
    if (isStreaming && shouldFollowBottomRef.current && !isUserScrollingRef.current) {
      scrollToBottom(false);
    }
  }, [isStreaming, scrollToBottom, streamingContentLength, streamingReasoningLength]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      metricsRef.current.viewportHeight = event.nativeEvent.layout.height;
      setJumpButtonVisible(!shouldFollowBottomRef.current && hasScrollableContent());

      if (shouldFollowBottomRef.current && !isUserScrollingRef.current) {
        scrollToBottom(false);
      }
    },
    [hasScrollableContent, scrollToBottom, setJumpButtonVisible]
  );

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      metricsRef.current.contentHeight = height;
      setJumpButtonVisible(!shouldFollowBottomRef.current && hasScrollableContent());

      if (shouldFollowBottomRef.current && !isUserScrollingRef.current) {
        scrollToBottom(false);
      }
    },
    [hasScrollableContent, scrollToBottom, setJumpButtonVisible]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      metricsRef.current = {
        contentHeight: contentSize.height || metricsRef.current.contentHeight,
        offsetY: contentOffset.y,
        viewportHeight: layoutMeasurement.height || metricsRef.current.viewportHeight,
      };

      const atBottom = isAtBottom();

      if (isUserScrollingRef.current) {
        const hasDraggedUp =
          contentOffset.y < dragStartOffsetYRef.current - SCROLL_AWAY_THRESHOLD;

        if (hasDraggedUp) {
          setFollowBottom(false);
          return;
        }

        if (atBottom) {
          setFollowBottom(true);
        }
        return;
      }

      if (atBottom) {
        setFollowBottom(true);
      }
    },
    [isAtBottom, setFollowBottom]
  );

  const handleScrollBeginDrag = useCallback(() => {
    isUserScrollingRef.current = true;
    dragStartOffsetYRef.current = metricsRef.current.offsetY;
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    const atBottom = isAtBottom();
    setFollowBottom(atBottom);

    if (atBottom) {
      isUserScrollingRef.current = false;
    }
  }, [isAtBottom, setFollowBottom]);

  const handleMomentumScrollEnd = useCallback(() => {
    const atBottom = isAtBottom();
    setFollowBottom(atBottom);
    isUserScrollingRef.current = false;
  }, [isAtBottom, setFollowBottom]);

  const jumpToBottom = useCallback(() => {
    isUserScrollingRef.current = false;
    setFollowBottom(true);
    scrollToBottom(true);
  }, [scrollToBottom, setFollowBottom]);

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
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
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
