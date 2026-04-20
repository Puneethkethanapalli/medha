import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  FlatList,
  View,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { History } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { MessageBubble } from './MessageBubble';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { useChatStore } from '@/stores/chat-store';
import { useUIStore } from '@/stores/ui-store';
import type { Message } from '@/types';

interface MessageListProps {
  messages: Message[];
  targetMessageId?: string | null;
  targetRequestKey?: string | null;
  highlightedMessageId?: string | null;
  onEditSubmit?: (messageId: string, newContent: string) => void;
  onEditCancel?: () => void;
  onRetry?: (messageId: string) => void;
}

// ─── Scroll thresholds ──────────────────────────────────────────────────
// These values control how the auto-scroll "follow" mode engages/disengages.

/** Distance from bottom (px) within which we consider the user "at bottom". */
const FOLLOW_BOTTOM_THRESHOLD = 24;
/** Minimum upward drag (px) before we disengage follow mode. */
const SCROLL_AWAY_THRESHOLD = 8;
/** Content must exceed viewport by this much before we show the jump button. */
const JUMP_BUTTON_THRESHOLD = 64;

export function MessageList({
  messages,
  targetMessageId = null,
  targetRequestKey = null,
  highlightedMessageId = null,
  onEditSubmit,
  onEditCancel,
  onRetry,
}: MessageListProps) {
  const flatListRef = useRef<FlatList<Message>>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollTargetRef = useRef<string | null>(null);
  const lastAppliedTargetKeyRef = useRef<string | null>(null);
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

  // ─── Helpers ────────────────────────────────────────────────────────

  const setJumpButtonVisible = useCallback((visible: boolean) => {
    setShowJumpToBottom((current) => (current === visible ? current : visible));
  }, []);

  const getDistanceFromBottom = useCallback(() => {
    const { contentHeight, offsetY, viewportHeight } = metricsRef.current;
    return Math.max(0, contentHeight - viewportHeight - offsetY);
  }, []);

  const isAtBottom = useCallback(() => {
    const { contentHeight, viewportHeight } = metricsRef.current;
    if (viewportHeight <= 0 || contentHeight <= viewportHeight) return true;
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

  const scrollToMessage = useCallback(
    (messageId: string, animated: boolean) => {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index === -1) {
        return false;
      }

      pendingScrollTargetRef.current = messageId;
      isUserScrollingRef.current = false;
      shouldFollowBottomRef.current = false;
      setJumpButtonVisible(hasScrollableContent());

      flatListRef.current?.scrollToIndex({
        index,
        animated,
        viewPosition: 0.28,
      });

      return true;
    },
    [hasScrollableContent, messages, setJumpButtonVisible]
  );

  // Clean up pending RAF on unmount
  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  // ─── Conversation switch → reset to bottom ─────────────────────────

  useEffect(() => {
    const conversationId = messages[0]?.conversation_id ?? null;
    if (conversationIdRef.current !== conversationId) {
      conversationIdRef.current = conversationId;
      isUserScrollingRef.current = false;
      setFollowBottom(true);
      scrollToBottom(false);
    }
  }, [messages, scrollToBottom, setFollowBottom]);

  useEffect(() => {
    const targetKey = targetMessageId
      ? `${targetMessageId}:${targetRequestKey ?? ''}`
      : null;

    if (!targetMessageId || !targetKey) {
      lastAppliedTargetKeyRef.current = null;
      return;
    }

    if (lastAppliedTargetKeyRef.current === targetKey) {
      return;
    }

    const timeout = setTimeout(() => {
      const didScroll = scrollToMessage(targetMessageId, true);
      if (didScroll) {
        lastAppliedTargetKeyRef.current = targetKey;
      }
    }, 90);

    return () => clearTimeout(timeout);
  }, [messages, scrollToMessage, targetMessageId, targetRequestKey]);

  // ─── New message appended → follow if at bottom ────────────────────

  useEffect(() => {
    if (messages.length > 0 && shouldFollowBottomRef.current && !isUserScrollingRef.current) {
      scrollToBottom(true);
    }
  }, [messages.length, scrollToBottom]);

  // ─── Streaming content growth → pin to bottom ─────────────────────

  useEffect(() => {
    if (isStreaming && shouldFollowBottomRef.current && !isUserScrollingRef.current) {
      scrollToBottom(false);
    }
  }, [isStreaming, scrollToBottom, streamingContentLength, streamingReasoningLength]);

  // ─── Scroll event handlers ─────────────────────────────────────────

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
        if (atBottom) setFollowBottom(true);
        return;
      }

      if (atBottom) setFollowBottom(true);
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
    if (atBottom) isUserScrollingRef.current = false;
  }, [isAtBottom, setFollowBottom]);

  const handleMomentumScrollEnd = useCallback(() => {
    const atBottom = isAtBottom();
    setFollowBottom(atBottom);
    isUserScrollingRef.current = false;
  }, [isAtBottom, setFollowBottom]);

  // ─── Jump-to-bottom action ─────────────────────────────────────────

  const jumpToBottom = useCallback(() => {
    isUserScrollingRef.current = false;
    setFollowBottom(true);
    scrollToBottom(true);
  }, [scrollToBottom, setFollowBottom]);

  // ─── Renderers ─────────────────────────────────────────────────────

  const editingMessageId = useUIStore((s) => s.editingMessageId);

  // Find the index of the editing message to dim everything after it
  const editingIndex = editingMessageId
    ? messages.findIndex((m) => m.id === editingMessageId)
    : -1;

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isEditTarget = item.id === editingMessageId;
      const isDimmed = editingIndex >= 0 && index > editingIndex;

      return (
        <>
          {/* "Will be replaced" divider — shown right after the editing message */}
          {editingIndex >= 0 && index === editingIndex + 1 && (
            <View className="flex-row items-center py-2 my-2">
              <View className="flex-1 h-px bg-outline-variant/20" />
              <View className="px-3 flex-row items-center gap-1.5">
                <History size={12} color="hsl(0, 0%, 44%)" />
                <Text className="text-[10px] text-muted-foreground tracking-wide uppercase">Will be replaced</Text>
              </View>
              <View className="flex-1 h-px bg-outline-variant/20" />
            </View>
          )}
          <MessageBubble
            message={item}
            highlighted={item.id === highlightedMessageId}
            dimmed={isDimmed}
            isEditing={isEditTarget}
            onEditSubmit={onEditSubmit}
            onEditCancel={onEditCancel}
            onRetry={onRetry}
          />
        </>
      );
    },
    [highlightedMessageId, editingMessageId, editingIndex, onEditSubmit, onEditCancel, onRetry]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index,
              animated: true,
              viewPosition: 0.28,
            });
          }, 120);
        }}
        scrollEventThrottle={16}
      />

      <ScrollToBottomButton
        visible={showJumpToBottom}
        isStreaming={isStreaming}
        onPress={jumpToBottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 8,
  },
});
