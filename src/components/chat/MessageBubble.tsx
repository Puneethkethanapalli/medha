import React from 'react';
import { View } from 'react-native';
import LottieView from 'lottie-react-native';
import { Text } from '@/components/ui/text';
import { useStreamingContent, useStreamingReasoning } from '@/stores/chat-store';
import { ThinkingBlock } from './ThinkingBlock';
import type { Message } from '@/types';

const waitingAnimation = require('../../../lottie/glow waiting.json');
const STATIC_PROGRESS = 0.58;

interface MessageBubbleProps {
  message: Message;
}

function getAssistantStatusLabel(status: Message['status']) {
  switch (status) {
    case 'streaming':
      return 'Response pending';
    case 'cancelled':
      return 'Response stopped';
    case 'error':
      return 'Response failed';
    default:
      return 'Response complete';
  }
}

function AssistantStatusMark({ status }: { status: Message['status'] }) {
  const isStreaming = status === 'streaming';

  return (
    <View
      className="mr-2 mt-0.5 h-7 w-9 items-center justify-center overflow-hidden"
      accessible
      accessibilityRole="image"
      accessibilityLabel={getAssistantStatusLabel(status)}
    >
      <LottieView
        source={waitingAnimation}
        autoPlay={isStreaming}
        loop={isStreaming}
        progress={isStreaming ? undefined : STATIC_PROGRESS}
        resizeMode="contain"
        style={{ width: 36, height: 24 }}
      />
    </View>
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
    <View className="flex-row items-start w-full mb-6">
      <AssistantStatusMark status={message.status} />

      <View className="flex-1 items-start">
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
            <Text className="text-foreground text-[15px] leading-relaxed">
              {displayContent}
            </Text>
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
    </View>
  );
});
