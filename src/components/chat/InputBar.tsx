import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, TextInput } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  ZoomIn,
  ZoomOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowUp, Square, Mic } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
import { useChatStore } from '@/stores/chat-store';
import { VoiceInput, isVoiceInputAvailable } from '@/components/chat/VoiceInput';
import { AttachmentTray } from '@/components/chat/AttachmentTray';
import { AttachmentButton } from '@/components/chat/AttachmentButton';
import { SlashCommandPicker } from '@/components/chat/SlashCommandPicker';
import { deleteAttachmentFile } from '@/lib/attachments/storage';
import { readDocumentTextAsync, renderPdfPagesToImages } from '@/lib/attachments/document-extract';
import { filterCommands, parseSlashInput, resolveCommandText } from '@/lib/commands/registry';
import type { SlashCommand } from '@/lib/commands/registry';
import { estimateTokens } from '@/lib/tokens/estimator';
import type { Attachment } from '@/types';

interface InputBarProps {
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  disabled?: boolean;
  disabledPlaceholder?: string;
}

export function InputBar({
  onSend,
  onStop,
  disabled = false,
  disabledPlaceholder,
}: InputBarProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceInputAvailable] = useState(isVoiceInputAvailable);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const palette = usePalette();
  const focus = useSharedValue(0);

  const canSend = !disabled && (text.trim().length > 0 || attachments.length > 0) && !isExtracting;

  // Debounced token estimate
  const [debouncedTokens, setDebouncedTokens] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTokens(text.trim().length > 0 ? estimateTokens(text) : 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  // Slash command detection
  const slashState = useMemo(() => parseSlashInput(text), [text]);
  const matchedCommands = useMemo(
    () => (slashState ? filterCommands(slashState.commandQuery) : []),
    [slashState]
  );
  const showPicker = !disabled && slashState !== null && matchedCommands.length > 0 && !slashState.arg;

  // The composer border brightens while focused.
  const borderIdle = palette.border;
  const borderFocused = palette.isDark ? 'hsla(0, 0%, 100%, 0.2)' : 'hsla(240, 6%, 10%, 0.22)';
  const composerStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.get(), [0, 1], [borderIdle, borderFocused]),
  }));
  const handleFocus = useCallback(() => {
    focus.set(withTiming(1, { duration: Motion.duration.base }));
  }, [focus]);
  const handleBlur = useCallback(() => {
    focus.set(withTiming(0, { duration: Motion.duration.base }));
  }, [focus]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (disabled) return;
    if (!trimmed && attachments.length === 0) return;
    if (isStreaming || isExtracting) return;

    // Extract text from document attachments before sending
    const docAttachments = attachments.filter((a) => a.type === 'document');
    let enrichedAttachments = attachments;

    if (docAttachments.length > 0) {
      setIsExtracting(true);
      try {
        enrichedAttachments = await Promise.all(
          attachments.map(async (att) => {
            if (att.type !== 'document') return att;
            const result = await readDocumentTextAsync(att);
            const enriched: Attachment = {
              ...att,
              extractedText: result.text ?? undefined,
              pageCount: result.pageCount ?? undefined,
            };

            // Render PDF pages as images for non-native providers (OpenRouter, MiniMax)
            if (att.mimeType === 'application/pdf' && result.pageCount) {
              try {
                const pageImages = await renderPdfPagesToImages(att.uri, result.pageCount);
                if (pageImages.length > 0) {
                  enriched.pageImageUris = pageImages;
                }
              } catch {
                // Non-fatal — text extraction still works
              }
            }

            return enriched;
          })
        );
      } catch {
        // Fall through with un-enriched attachments
      } finally {
        setIsExtracting(false);
      }
    }

    // Check if we're sending a command with an arg (e.g. "/translate Hindi")
    if (slashState && slashState.arg) {
      const exactMatch = matchedCommands.find((c) => c.name === slashState.commandQuery);
      if (exactMatch) {
        const resolved = resolveCommandText(exactMatch, slashState.arg);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSend(resolved, enrichedAttachments.length > 0 ? enrichedAttachments : undefined);
        setText('');
        setAttachments([]);
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(trimmed, enrichedAttachments.length > 0 ? enrichedAttachments : undefined);
    setText('');
    setAttachments([]);
  }, [text, attachments, isStreaming, isExtracting, disabled, slashState, matchedCommands, onSend]);

  const handleSlashCommandSelect = useCallback(
    (command: SlashCommand) => {
      if (command.action === 'standalone' && command.id !== 'translate') {
        // Send immediately
        const resolved = resolveCommandText(command, '');
        onSend(resolved);
        setText('');
      } else {
        // Prepend, wrap, or translate: set text to "/command " so user types the argument
        // The template expansion happens on send via resolveCommandText()
        setText(`/${command.name} `);
        inputRef.current?.focus();
      }
    },
    [onSend]
  );

  const handleAttach = useCallback((newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments].slice(0, 10)); // max 10
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed) deleteAttachmentFile(removed.uri);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setIsRecording(false);
    if (transcript.trim()) {
      onSend(transcript.trim());
    }
  }, [onSend]);

  const handleVoiceCancel = useCallback(() => {
    setIsRecording(false);
  }, []);

  const handleMicPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRecording(true);
  }, []);

  const insets = useSafeAreaInsets();

  return (
    <View className="px-4 pt-2 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      {isRecording ? (
        <VoiceInput
          onTranscript={handleVoiceTranscript}
          onCancel={handleVoiceCancel}
        />
      ) : (
        <>
          {/* Slash command picker — floats above input */}
          {showPicker && (
            <SlashCommandPicker
              commands={matchedCommands}
              onSelect={handleSlashCommandSelect}
            />
          )}

          <Animated.View
            style={[
              {
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderRadius: 26,
                padding: 6,
              },
              composerStyle,
            ]}
          >
            {/* Attachment preview tray */}
            <AttachmentTray
              attachments={attachments}
              onRemove={handleRemoveAttachment}
            />

            {/* Input row */}
            <View className="flex-row items-end gap-1.5">
              {/* Attachment button */}
              <AttachmentButton
                onAttach={handleAttach}
                disabled={isStreaming || disabled}
              />

              {/* Text input */}
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={setText}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={disabled ? disabledPlaceholder ?? 'Choose an option above...' : 'Message Medha...'}
                placeholderTextColor={palette.iconMuted}
                cursorColor={palette.text}
                selectionColor={palette.isDark ? 'hsla(0, 0%, 100%, 0.3)' : 'hsla(240, 6%, 10%, 0.2)'}
                multiline
                maxLength={10000}
                className="flex-1 text-foreground text-[15px] px-1.5 max-h-32"
                style={{ minHeight: 36, paddingTop: 8, paddingBottom: 8 }}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                editable={!isStreaming && !disabled}
              />

              {/* Trailing action: mic when empty, send with content, stop while streaming */}
              {/* skipEntering: no pop on first render, only when the action changes */}
              <View style={{ width: 36, height: 36 }}>
                <LayoutAnimationConfig skipEntering>
                  {isStreaming ? (
                    <ActionButton key="stop" onPress={onStop} label="Stop response" filled>
                      <Square size={13} color={palette.onAccent} fill={palette.onAccent} />
                    </ActionButton>
                  ) : canSend ? (
                    <ActionButton key="send" onPress={handleSend} label="Send message" filled>
                      <ArrowUp size={19} color={palette.onAccent} strokeWidth={2.5} />
                    </ActionButton>
                  ) : !disabled && voiceInputAvailable ? (
                    <ActionButton key="mic" onPress={handleMicPress} label="Voice input">
                      <Mic size={17} color={palette.icon} />
                    </ActionButton>
                  ) : null}
                </LayoutAnimationConfig>
              </View>
            </View>

            {/* Token counter */}
            {debouncedTokens > 0 && (
              <Animated.View
                entering={FadeIn.duration(Motion.duration.base)}
                exiting={FadeOut.duration(Motion.duration.fast)}
                style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 2 }}
              >
                <Text
                  className="text-muted-foreground text-[11px] opacity-60"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  ~{debouncedTokens.toLocaleString()} tokens
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}

// Allow parent to set text programmatically (for suggestion chips)
InputBar.displayName = 'InputBar';

/** Round trailing button that pops in when it replaces another (mic → send → stop). */
function ActionButton({
  onPress,
  label,
  filled = false,
  children,
}: {
  onPress: () => void;
  label: string;
  filled?: boolean;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(Motion.spring.pop.damping).stiffness(Motion.spring.pop.stiffness)}
      exiting={ZoomOut.duration(Motion.duration.fast)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <PressableScale
        onPress={onPress}
        scaleTo={0.88}
        hitSlop={6}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? palette.accent : palette.surfaceRaised,
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {children}
      </PressableScale>
    </Animated.View>
  );
}
