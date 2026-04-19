import React from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import LottieView from 'lottie-react-native';
import { Copy } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useStreamingContent, useStreamingReasoning } from '@/stores/chat-store';
import { useUIStore } from '@/stores/ui-store';
import { ThinkingBlock } from './ThinkingBlock';
import { MarkdownMessage } from './MarkdownMessage';
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
      className="mr-2 mt-0.5 h-6 w-6 items-center justify-center overflow-hidden"
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
        style={{ width: 24, height: 18 }}
      />
    </View>
  );
}

export const MessageBubble = React.memo(function MessageBubble({ message }: MessageBubbleProps) {
  const streamingContent = useStreamingContent(message.id);
  const streamingReasoning = useStreamingReasoning(message.id);
  const showToast = useUIStore((s) => s.showToast);
  const isStreaming = message.status === 'streaming';
  const displayContent = isStreaming ? streamingContent : message.content;
  const displayReasoning = isStreaming ? streamingReasoning : message.reasoning;
  const isUser = message.role === 'user';

  const copyContent = React.useCallback(async () => {
    const content = isUser ? message.content : displayContent;
    if (!content) {
      return;
    }

    await Clipboard.setStringAsync(content);
    showToast('Copied to clipboard');
  }, [displayContent, isUser, message.content, showToast]);

  if (isUser) {
    return (
      <View className="flex-col items-end w-full mb-4">
        <Pressable
          onLongPress={copyContent}
          className="bg-surface-container-low border border-outline-variant/20 px-4 py-3 max-w-[85%]"
          style={{ borderRadius: 16, borderBottomRightRadius: 4 }}
        >
          <Text className="text-foreground text-[14px] leading-relaxed">
            {message.content}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Assistant message
  const hasReasoning = !!displayReasoning;
  const isReasoningOnly = isStreaming && hasReasoning && !displayContent;

  return (
    <View className="flex-row items-start w-full mb-4">
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
            <MarkdownMessage content={displayContent} isStreaming={isStreaming} />
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

        {!!displayContent && (
          <View className="mt-1 flex-row items-center gap-2 pt-1">
            <Pressable
              accessibilityLabel="Copy message"
              accessibilityRole="button"
              hitSlop={8}
              onPress={copyContent}
              className="h-7 w-7 items-center justify-center rounded-md"
            >
              <Copy size={15} color="hsl(0, 0%, 44%)" strokeWidth={2} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
});
