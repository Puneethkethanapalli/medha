import React, { useState, useCallback } from 'react';
import { View, TextInput, Image } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import LottieView from 'lottie-react-native';
import { Copy, RefreshCw, TriangleAlert, FileText } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
import {
  useStreamingContent,
  useStreamingContentStartedAt,
  useStreamingReasoning,
  useStreamingStartedAt,
  useToolActivity,
} from '@/stores/chat-store';
import { useUIStore } from '@/stores/ui-store';
import { ThinkingBlock } from './ThinkingBlock';
import { MarkdownMessage } from './MarkdownMessage';
import { StreamingCursor } from './StreamingCursor';
import { SearchResults } from './SearchResults';
import { ToolResultCard } from './ToolResultCard';
import { ChoiceCard } from './ChoiceCard';
import { MemoryUpdateChip } from './MemoryUpdateChip';
import { formatTokensPerSecond, parseResponseTokenMetrics, type ResponseTokenMetrics } from '@/lib/tokens/metrics';
import type { AskUserChoiceSubmission } from '@/lib/tools/ask-user-choice';
import type { Message } from '@/types';
import type { Citation, ToolDisplay } from '@/lib/tools/types';

const waitingAnimation = require('../../../lottie/glow waiting.json');
const STATIC_PROGRESS = 0.58;
/** Messages younger than this when they mount are new in this session and animate in. */
const FRESH_MESSAGE_MS = 2500;

const USER_ENTER = FadeInDown.duration(Motion.duration.enter).easing(Motion.easing.enter);
const ASSISTANT_ENTER = FadeIn.duration(Motion.duration.enter);
const ACTIONS_ENTER = FadeIn.duration(Motion.duration.base).delay(80);

interface MessageBubbleProps {
  message: Message;
  highlighted?: boolean;
  dimmed?: boolean;
  isEditing?: boolean;
  onEditSubmit?: (messageId: string, newContent: string) => void;
  onEditCancel?: () => void;
  onRetry?: (messageId: string) => void;
  onChoiceSubmit?: (messageId: string, submission: AskUserChoiceSubmission) => void;
  onChoiceDismiss?: (messageId: string) => void;
}

function getAssistantStatusLabel(status: Message['status']) {
  switch (status) {
    case 'streaming':
      return 'Response pending';
    case 'waiting':
      return 'Waiting for your choice';
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
  onChoiceSubmit,
  onChoiceDismiss,
}: MessageBubbleProps) {
  const streamingContent = useStreamingContent(message.id);
  const streamingReasoning = useStreamingReasoning(message.id);
  const streamingStartedAt = useStreamingStartedAt(message.id);
  const streamingContentStartedAt = useStreamingContentStartedAt(message.id);
  const toolActivity = useToolActivity(message.id);
  const showActionsMenu = useUIStore((s) => s.showActionsMenu);
  const isStreaming = message.status === 'streaming';
  const displayContent = isStreaming ? streamingContent : message.content;
  const displayReasoning = isStreaming ? streamingReasoning : message.reasoning;
  const isToolActivityVisible = !!toolActivity;
  const isUser = message.role === 'user';
  const showToast = useUIStore((s) => s.showToast);
  const responseMetrics = parseResponseTokenMetrics(message.tokens_used);
  const responseMetricsLabel = formatResponseMetricsLabel(responseMetrics);
  const palette = usePalette();
  // Decided once at mount: history loads in place, new messages animate in.
  const [isFresh] = useState(() => Date.now() - message.created_at < FRESH_MESSAGE_MS);
  const [mountedWhileStreaming] = useState(isStreaming);

  // Edit mode state
  const [editText, setEditText] = useState(message.content);

  const handleLongPress = useCallback(() => {
    if (isStreaming) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showActionsMenu(message);
  }, [isStreaming, message, showActionsMenu]);

  const handleCopyMessage = useCallback(async () => {
    if (!displayContent) return;
    await Clipboard.setStringAsync(displayContent);
    Haptics.selectionAsync().catch(() => undefined);
    showToast('Copied to clipboard');
  }, [displayContent, showToast]);

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

  // Tool messages render as rich tool cards when metadata is available.
  if (message.role === 'tool') {
    if (!message.tool_calls) return null;
    try {
      const metadata = JSON.parse(message.tool_calls);
      if (isToolDisplay(metadata)) {
        return (
          <Animated.View
            entering={isFresh ? ASSISTANT_ENTER : undefined}
            style={{ width: '85%', marginBottom: 16, opacity: dimmed ? 0.4 : 1 }}
          >
            <ToolResultCard display={metadata} />
          </Animated.View>
        );
      }
      if (isCitationArray(metadata)) {
        return (
          <Animated.View
            entering={isFresh ? ASSISTANT_ENTER : undefined}
            style={{ width: '85%', marginBottom: 16, opacity: dimmed ? 0.4 : 1 }}
          >
            <SearchResults citations={metadata} />
          </Animated.View>
        );
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  // User message — edit mode
  if (isUser && isEditing) {
    return (
      <View className="flex-col items-end w-full mb-4">
        <View className="w-[90%]">
          {/* Editable text area */}
          <View
            className="bg-surface-container border p-4"
            style={{ borderRadius: 20, borderColor: palette.textMuted }}
          >
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              className="text-foreground text-[15px] leading-[22px]"
              style={{ minHeight: 40, maxHeight: 200, padding: 0 }}
              placeholderTextColor={palette.iconMuted}
            />
          </View>
          {/* Action buttons */}
          <View className="flex-row items-center justify-end gap-2 mt-2">
            <PressableScale
              onPress={handleEditCancel}
              className="h-9 px-4 rounded-full bg-surface-container items-center justify-center"
            >
              <Text className="text-muted-foreground text-[13px] font-medium">Cancel</Text>
            </PressableScale>
            <PressableScale
              onPress={handleEditSubmit}
              haptic
              className="h-9 px-5 rounded-full bg-foreground items-center justify-center"
            >
              <Text className="text-background text-[13px] font-semibold">Send</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    );
  }

  // User message — normal
  if (isUser) {
    return (
      <Animated.View
        entering={isFresh ? USER_ENTER : undefined}
        style={{ width: '100%', alignItems: 'flex-end', marginBottom: 16, opacity: dimmed ? 0.4 : 1 }}
      >
        <PressableScale
          onLongPress={handleLongPress}
          delayLongPress={350}
          scaleTo={0.98}
          className={`px-4 py-2.5 max-w-[85%] ${
            highlighted ? 'bg-surface-container-high' : 'bg-surface-container'
          }`}
          style={{
            borderRadius: 20,
            borderBottomRightRadius: 6,
            borderWidth: highlighted ? 1 : 0,
            borderColor: palette.textMuted,
          }}
        >
          <Text className="text-foreground text-[15px] leading-[22px]">
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
                    className="flex-row items-center bg-surface-container-high rounded-lg px-2 py-1.5 gap-1.5"
                  >
                    <FileText size={12} color={palette.icon} />
                    <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                      {att.name}
                    </Text>
                  </View>
                )
              )}
            </View>
          )}
        </PressableScale>
      </Animated.View>
    );
  }

  // Assistant message
  const hasReasoning = !!displayReasoning?.trim();
  // Thinking phase: streaming, but no answer text visible yet.
  const isThinking = isStreaming && !displayContent;
  const showThinkingBlock = hasReasoning || isThinking || isToolActivityVisible;
  const isThinkingOnly = showThinkingBlock && !displayContent;

  return (
    <Animated.View
      entering={isFresh ? ASSISTANT_ENTER : undefined}
      style={{ flexDirection: 'row', alignItems: 'flex-start', width: '100%', marginBottom: 20, opacity: dimmed ? 0.4 : 1 }}
    >
      <AssistantStatusMark status={message.status} />

      <View className="flex-1 items-start">
        {/* Thinking block */}
        {showThinkingBlock && (
          <ThinkingBlock
            reasoning={displayReasoning ?? ''}
            toolActivity={toolActivity || null}
            isThinking={isThinking}
            startedAt={streamingStartedAt}
            contentStartedAt={streamingContentStartedAt}
            reasoningMs={responseMetrics?.reasoningMs ?? null}
          />
        )}

        {/* Content */}
        {(displayContent || !isThinkingOnly) && (
          <View
            className={`w-full rounded-2xl ${
              highlighted ? 'bg-surface-container-low border border-outline-variant/30 px-3 py-2' : ''
            }`}
          >
            <MarkdownMessage content={displayContent} isStreaming={isStreaming} />
            {isStreaming && !isThinkingOnly && <StreamingCursor />}
          </View>
        )}

        {message.status === 'waiting' && (
          <ChoiceCard
            message={message}
            onSubmit={onChoiceSubmit}
            onDismiss={onChoiceDismiss}
          />
        )}

        {/* Error state with retry */}
        {message.status === 'error' && (
          <View
            className="mt-2 px-4 py-3 border rounded-2xl"
            style={{ backgroundColor: palette.surface, borderColor: 'hsla(0, 84%, 60%, 0.3)' }}
          >
            <View className="flex-row items-start gap-3">
              <TriangleAlert size={18} color={palette.destructive} style={{ marginTop: 2 }} />
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
              <PressableScale
                onPress={() => onRetry(message.id)}
                haptic
                className="self-start mt-3 flex-row items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-foreground"
              >
                <RefreshCw size={13} color={palette.onAccent} strokeWidth={2.25} />
                <Text className="text-background text-[12px] font-semibold">Retry</Text>
              </PressableScale>
            )}
          </View>
        )}

        {/* Copy button + token usage for completed messages */}
        {!!displayContent && !isStreaming && message.status !== 'waiting' && message.status !== 'error' && (
          <Animated.View
            entering={mountedWhileStreaming ? ACTIONS_ENTER : undefined}
            style={{ marginTop: 4, paddingTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <PressableScale
              accessibilityLabel="Copy message"
              accessibilityRole="button"
              hitSlop={8}
              scaleTo={0.85}
              onPress={handleCopyMessage}
              className="h-7 w-7 items-center justify-center rounded-full"
            >
              <Copy size={15} color={palette.iconMuted} strokeWidth={2} />
            </PressableScale>
            {/* Token usage indicator */}
            {responseMetricsLabel && (
              <Text
                className="text-muted-foreground text-[10px] opacity-60"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {responseMetricsLabel}
              </Text>
            )}
          </Animated.View>
        )}

        {!isStreaming && <MemoryUpdateChip messageId={message.id} />}
      </View>
    </Animated.View>
  );
});

function isToolDisplay(value: unknown): value is ToolDisplay {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const maybeDisplay = value as Partial<ToolDisplay>;
  return typeof maybeDisplay.kind === 'string' && typeof maybeDisplay.title === 'string';
}

function isCitationArray(value: unknown): value is Citation[] {
  return Array.isArray(value)
    && value.every((item) =>
      item
      && typeof item === 'object'
      && typeof (item as Citation).title === 'string'
      && typeof (item as Citation).url === 'string'
    );
}

function formatResponseMetricsLabel(metrics: ResponseTokenMetrics | null): string | null {
  if (!metrics) return null;

  const parts: string[] = [];
  const tokenParts: string[] = [];

  if (metrics.prompt > 0) tokenParts.push(`~${metrics.prompt.toLocaleString()}↑`);
  if (metrics.completion > 0) tokenParts.push(`~${metrics.completion.toLocaleString()}↓`);
  if (tokenParts.length > 0) parts.push(tokenParts.join(' '));

  const tokensPerSecond = formatTokensPerSecond(metrics.tokensPerSecond);
  if (tokensPerSecond) parts.push(`${tokensPerSecond} tokens/s`);

  return parts.length > 0 ? parts.join(' · ') : null;
}
