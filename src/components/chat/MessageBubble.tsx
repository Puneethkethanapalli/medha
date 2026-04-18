import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { Text } from '@/components/ui/text';
import { useStreamingContent, useStreamingReasoning } from '@/stores/chat-store';
import { ThinkingBlock } from './ThinkingBlock';
import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

function StreamingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={{ opacity, width: 2, height: 18, backgroundColor: '#FAFAFA', marginLeft: 2 }} />
  );
}

export const MessageBubble = React.memo(function MessageBubble({ message }: MessageBubbleProps) {
  const streamingContent = useStreamingContent(message.id);
  const streamingReasoning = useStreamingReasoning(message.id);
  const isStreaming = message.status === 'streaming';
  const displayContent = isStreaming ? streamingContent : message.content;
  const displayReasoning = isStreaming ? streamingReasoning : message.reasoning;
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View className="flex-col items-end w-full mb-6">
        <View
          className="bg-surface-container-low border border-outline-variant/20 px-4 py-3 max-w-[85%]"
          style={{ borderRadius: 16, borderBottomRightRadius: 4 }}
        >
          <Text className="text-foreground text-[14px] leading-relaxed">
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  // Assistant message
  const hasReasoning = !!displayReasoning;
  const isReasoningOnly = isStreaming && hasReasoning && !displayContent;

  return (
    <View className="flex-col items-start w-full mb-6">
      {/* Label */}
      <View className="flex-row items-center gap-2 mb-2">
        <Text className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-widest">
          Medha
        </Text>
      </View>

      {/* Thinking block */}
      {hasReasoning && (
        <ThinkingBlock
          reasoning={displayReasoning!}
          isStreaming={isStreaming && !displayContent}
        />
      )}

      {/* Content */}
      {(displayContent || !isReasoningOnly) && (
        <View className="w-full">
          <View className="flex-row flex-wrap items-end">
            <Text className="text-foreground text-[15px] leading-relaxed">
              {displayContent}
            </Text>
            {isStreaming && <StreamingCursor />}
          </View>
        </View>
      )}

      {/* Error state */}
      {message.status === 'error' && (
        <View className="mt-2 px-3 py-2 bg-surface-container-low border border-destructive/30 rounded-lg">
          <Text className="text-destructive text-[13px]">
            Failed to generate response
          </Text>
        </View>
      )}
    </View>
  );
});
