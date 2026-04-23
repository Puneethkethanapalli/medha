import React, { useState, useCallback } from 'react';
import { View, Pressable, Text } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { X, Send } from 'lucide-react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onCancel: () => void;
}

const NUM_BARS = 5;
const SPRING_CONFIG = { damping: 12, stiffness: 180 };

export function VoiceInput({ onTranscript, onCancel }: VoiceInputProps) {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Waveform bars driven by volume
  const bar0 = useSharedValue(4);
  const bar1 = useSharedValue(4);
  const bar2 = useSharedValue(4);
  const bar3 = useSharedValue(4);
  const bar4 = useSharedValue(4);
  const bars = [bar0, bar1, bar2, bar3, bar4];

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript || '';
    setTranscript(text);
    if (event.isFinal) {
      onTranscript(text);
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    const normalized = Math.max(0, (event.value + 2) / 12); // 0-1
    bars.forEach((bar, i) => {
      // Stagger bars for wave effect — each bar gets a slightly different multiplier
      const variance = 0.6 + Math.sin(i * 1.2) * 0.4;
      bar.value = withSpring(4 + normalized * 20 * variance, SPRING_CONFIG);
    });
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.error('STT error:', event.error, event.message);
    setIsListening(false);
    onCancel();
  });

  const startListening = useCallback(async () => {
    const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perms.granted) {
      onCancel();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsListening(true);
    setTranscript('');

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      addsPunctuation: true,
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 100,
      },
    });
  }, [onCancel]);

  const handleCancel = useCallback(() => {
    ExpoSpeechRecognitionModule.abort();
    setIsListening(false);
    onCancel();
  }, [onCancel]);

  const handleSend = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
    if (transcript.trim()) {
      onTranscript(transcript.trim());
    }
    setIsListening(false);
  }, [transcript, onTranscript]);

  // Start listening on mount
  React.useEffect(() => {
    startListening();
    return () => {
      ExpoSpeechRecognitionModule.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated bar styles
  const barStyle0 = useAnimatedStyle(() => ({
    height: bar0.value,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: '#FAFAFA',
  }));
  const barStyle1 = useAnimatedStyle(() => ({
    height: bar1.value,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: '#FAFAFA',
  }));
  const barStyle2 = useAnimatedStyle(() => ({
    height: bar2.value,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: '#FAFAFA',
  }));
  const barStyle3 = useAnimatedStyle(() => ({
    height: bar3.value,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: '#FAFAFA',
  }));
  const barStyle4 = useAnimatedStyle(() => ({
    height: bar4.value,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: '#FAFAFA',
  }));
  const barStyles = [barStyle0, barStyle1, barStyle2, barStyle3, barStyle4];

  return (
    <View className="flex-row items-center gap-3 px-4 py-3 bg-surface-container-low rounded-2xl">
      {/* Cancel button */}
      <Pressable
        onPress={handleCancel}
        className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-95"
      >
        <X size={16} color="hsl(0, 0%, 63%)" />
      </Pressable>

      {/* Waveform / transcript area */}
      <View className="flex-1 items-center justify-center min-h-[36px]">
        {transcript ? (
          <Text className="text-foreground text-[14px]" numberOfLines={2}>
            {transcript}
          </Text>
        ) : (
          <View className="flex-row items-center gap-[3px]">
            {barStyles.map((style, i) => (
              <Animated.View key={i} style={style} />
            ))}
            <Text className="text-muted-foreground text-[13px] ml-2">
              Listening...
            </Text>
          </View>
        )}
      </View>

      {/* Send button */}
      <Pressable
        onPress={handleSend}
        disabled={!transcript.trim()}
        className={`w-8 h-8 rounded-full items-center justify-center active:scale-95 ${
          transcript.trim() ? 'bg-foreground' : 'bg-outline-variant'
        }`}
      >
        <Send
          size={16}
          color={transcript.trim() ? 'hsl(240, 3.7%, 7.5%)' : 'hsl(0, 0%, 44%)'}
        />
      </Pressable>
    </View>
  );
}
