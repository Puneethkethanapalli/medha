import React, { useState, useRef, useCallback } from 'react';
import { View, TextInput, Pressable, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowUp, Square, Mic } from 'lucide-react-native';
import { useChatStore } from '@/stores/chat-store';
import { VoiceInput } from '@/components/chat/VoiceInput';

interface InputBarProps {
  onSend: (text: string) => void;
  onStop: () => void;
}

export function InputBar({ onSend, onStop }: InputBarProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    // Button press animation
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(trimmed);
    setText('');
  }, [text, isStreaming, onSend, scaleAnim]);

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

  const hasText = text.trim().length > 0;
  const insets = useSafeAreaInsets();

  return (
    <View className="px-4 pt-2 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      {isRecording ? (
        <VoiceInput
          onTranscript={handleVoiceTranscript}
          onCancel={handleVoiceCancel}
        />
      ) : (
        <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-2 flex-row items-end gap-2">
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

          {/* Mic button — only show when no text and not streaming */}
          {!hasText && !isStreaming && (
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
          ) : hasText ? (
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
      )}
    </View>
  );
}

// Allow parent to set text programmatically (for suggestion chips)
InputBar.displayName = 'InputBar';
