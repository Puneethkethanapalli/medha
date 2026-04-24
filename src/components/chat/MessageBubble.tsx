import React, { useState, useCallback } from 'react';
import { Pressable, View, TextInput, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';
import { Copy, RefreshCw, TriangleAlert, FileText } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useStreamingContent, useStreamingReasoning } from '@/stores/chat-store';
import { useUIStore } from '@/stores/ui-store';
import { ThinkingBlock } from './ThinkingBlock';
import { MarkdownMessage } from './MarkdownMessage';
import { StreamingCursor } from './StreamingCursor';
import { SearchResults } from './SearchResults';
import type { Message } from '@/types';

const waitingAnimation = require('../../../lottie/glow waiting.json');
const STATIC_PROGRESS = 0.58;

interface MessageBubbleProps {
  message: Message;
  highlighted?: boolean;
  dimmed?: boolean;
  isEditing?: boolean;
  onEditSubmit?: (messageId: string, newContent: string) => void;
  onEditCancel?: () => void;
  onRetry?: (messageId: string) => void;
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

export const MessageBubble = React.memo(function MessageBubble({
  message,
  highlighted = false,
  dimmed = false,
  isEditing = false,
  onEditSubmit,
  onEditCancel,
  onRetry,
}: MessageBubbleProps) {
  const streamingContent = useStreamingContent(message.id);
  const streamingReasoning = useStreamingReasoning(message.id);
  const showActionsMenu = useUIStore((s) => s.showActionsMenu);
  const isStreaming = message.status === 'streaming';
  const displayContent = isStreaming ? streamingContent : message.content;
  const displayReasoning = isStreaming ? streamingReasoning : message.reasoning;
  const isUser = message.role === 'user';

  // Tool messages render as SearchResults if they contain citations
  if (message.role === 'tool') {
    if (!message.tool_calls) return null;
    try {
      const citations = JSON.parse(message.tool_calls);
      if (Array.isArray(citations) && citations.length > 0) {
        return (
          <View className={`w-[85%] mb-4 ${dimmed ? 'opacity-40' : ''}`}>
            <SearchResults citations={citations} />
          </View>
        );
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  // Edit mode state
  const [editText, setEditText] = useState(message.content);

  const handleLongPress = useCallback(() => {
    if (isStreaming) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showActionsMenu(message);
  }, [isStreaming, message, showActionsMenu]);

  const handleEditSubmit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || !onEditSubmit) return;
    onEditSubmit(message.id, trimmed);
  }, [editText, message.id, onEditSubmit]);

  const handleEditCancel = useCallback(() => {
    setEditText(message.content);
    onEditCancel?.();
  }, [message.content, onEditCancel]);

  // Reset edit text when entering edit mode
  React.useEffect(() => {
    if (isEditing) {
      setEditText(message.content);
    }
  }, [isEditing, message.content]);

  // User message — edit mode
  if (isUser && isEditing) {
    return (
      <View className="flex-col items-end w-full mb-4">
        <View className="w-[90%]">
          {/* Editable text area */}
          <View
            className="bg-surface-container-low border border-foreground/50 p-4"
            style={{ borderRadius: 12 }}
          >
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              className="text-foreground text-[14px] leading-relaxed"
              style={{ minHeight: 40, maxHeight: 200, padding: 0 }}
              placeholderTextColor="hsl(0, 0%, 44%)"
            />
          </View>
          {/* Action buttons */}
          <View className="flex-row items-center justify-end gap-2 mt-2">
            <Pressable
              onPress={handleEditCancel}
              className="h-9 px-4 rounded-lg bg-surface-container-low border border-outline-variant/20 items-center justify-center"
            >
              <Text className="text-muted-foreground text-[13px] font-medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleEditSubmit}
              className="h-9 px-5 rounded-lg bg-foreground items-center justify-center"
            >
              <Text className="text-background text-[13px] font-medium">Send</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // User message — normal
  if (isUser) {
    return (
      <View className={`flex-col items-end w-full mb-4 ${dimmed ? 'opacity-40' : ''}`}>
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={350}
          className={`border px-4 py-3 max-w-[85%] ${
            highlighted
              ? 'bg-[#202024] border-foreground/30'
              : 'bg-surface-container-low border-outline-variant/20'
          }`}
          style={{ borderRadius: 16, borderBottomRightRadius: 4 }}
        >
          <Text className="text-foreground text-[14px] leading-relaxed">
            {message.content}
          </Text>
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mt-2">
              {message.attachments.map((att) =>
                att.type === 'image' ? (
                  <Image
                    key={att.id}
                    source={{ uri: att.uri }}
                    className="w-24 h-24 rounded-lg"
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    key={att.id}
                    className="flex-row items-center bg-muted/50 rounded-lg px-2 py-1.5 gap-1.5"
                  >
                    <FileText size={12} color="hsl(0, 0%, 63%)" />
                    <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                      {att.name}
                    </Text>
                  </View>
                )
              )}
            </View>
          )}
        </Pressable>
      </View>
    );
  }

  // Assistant message
  const hasReasoning = !!displayReasoning;
  const isReasoningOnly = isStreaming && hasReasoning && !displayContent;

  return (
    <View className={`flex-row items-start w-full mb-4 ${dimmed ? 'opacity-40' : ''}`}>
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
          <View
            className={`w-full rounded-2xl ${
              highlighted ? 'bg-surface-container-low border border-outline-variant/30 px-3 py-2' : ''
            }`}
          >
            <MarkdownMessage content={displayContent} isStreaming={isStreaming} />
            {isStreaming && !isReasoningOnly && <StreamingCursor />}
          </View>
        )}

        {/* Error state with retry */}
        {message.status === 'error' && (
          <View className="mt-2 px-4 py-3 bg-[#18181B] border rounded-lg" style={{ borderColor: 'hsla(0, 84%, 60%, 0.3)' }}>
            <View className="flex-row items-start gap-3">
              <TriangleAlert size={18} color="hsl(10, 100%, 85%)" style={{ marginTop: 2 }} />
              <View className="flex-1 gap-1">
                <Text className="text-foreground text-[14px] font-medium">Failed to get a response</Text>
                <Text className="text-muted-foreground text-[12px] leading-relaxed">
                  {message.content.startsWith('Error: ')
                    ? message.content.slice(7)
                    : 'Something went wrong. Try again.'}
                </Text>
              </View>
            </View>
            {onRetry && (
              <Pressable
                onPress={() => onRetry(message.id)}
                className="self-start mt-2 flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181B] border border-[#27272A] active:scale-95"
              >
                <RefreshCw size={14} color="hsl(0, 0%, 63%)" />
                <Text className="text-muted-foreground text-[12px] font-medium">Retry</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Copy button for completed messages */}
        {!!displayContent && !isStreaming && message.status !== 'error' && (
          <View className="mt-1 flex-row items-center gap-2 pt-1">
            <Pressable
              accessibilityLabel="Copy message"
              accessibilityRole="button"
              hitSlop={8}
              onPress={handleLongPress}
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
