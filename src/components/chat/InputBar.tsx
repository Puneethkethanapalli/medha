import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, TextInput, Pressable, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowUp, Square, Mic } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chat-store';
import { VoiceInput } from '@/components/chat/VoiceInput';
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
}

export function InputBar({ onSend, onStop }: InputBarProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isExtracting;

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
  const showPicker = slashState !== null && matchedCommands.length > 0 && !slashState.arg;

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
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
        animateSendButton();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSend(resolved, enrichedAttachments.length > 0 ? enrichedAttachments : undefined);
        setText('');
        setAttachments([]);
        return;
      }
    }

    animateSendButton();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(trimmed, enrichedAttachments.length > 0 ? enrichedAttachments : undefined);
    setText('');
    setAttachments([]);
  }, [text, attachments, isStreaming, isExtracting, slashState, matchedCommands, onSend, scaleAnim]);

  const animateSendButton = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 80,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 80,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim]);

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

          <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-2">
            {/* Attachment preview tray */}
            <AttachmentTray
              attachments={attachments}
              onRemove={handleRemoveAttachment}
            />

            {/* Input row */}
            <View className="flex-row items-end gap-2">
              {/* Attachment button */}
              <AttachmentButton
                onAttach={handleAttach}
                disabled={isStreaming}
              />

              {/* Text input */}
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={setText}
                placeholder="Message Medha..."
                placeholderTextColor="hsl(0, 0%, 44%)"
                multiline
                maxLength={10000}
                className="flex-1 text-foreground text-[14px] px-2 py-2 max-h-32"
                style={{ minHeight: 36 }}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                editable={!isStreaming}
              />

              {/* Mic button — only when no text, no attachments, not streaming */}
              {!canSend && !isStreaming && (
                <Pressable
                  onPress={handleMicPress}
                  className="w-8 h-8 rounded-full bg-muted items-center justify-center mb-1 active:scale-95"
                >
                  <Mic size={16} color="hsl(0, 0%, 63%)" />
                </Pressable>
              )}

              {/* Send / Stop button */}
              {isStreaming ? (
                <Pressable
                  onPress={onStop}
                  className="w-8 h-8 rounded-full bg-foreground items-center justify-center mb-1 active:scale-95"
                >
                  <Square size={14} color="hsl(240, 3.7%, 7.5%)" fill="hsl(240, 3.7%, 7.5%)" />
                </Pressable>
              ) : canSend ? (
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <Pressable
                    onPress={handleSend}
                    className="w-8 h-8 rounded-full bg-foreground items-center justify-center mb-1"
                  >
                    <ArrowUp
                      size={18}
                      color="hsl(240, 3.7%, 7.5%)"
                      strokeWidth={2.5}
                    />
                  </Pressable>
                </Animated.View>
              ) : null}
            </View>

            {/* Token counter */}
            {debouncedTokens > 0 && (
              <View className="flex-row justify-end px-1 pt-1">
                <Text className="text-muted-foreground text-[11px] opacity-60">
                  ~{debouncedTokens.toLocaleString()} tokens
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

// Allow parent to set text programmatically (for suggestion chips)
InputBar.displayName = 'InputBar';
