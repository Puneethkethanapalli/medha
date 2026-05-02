import React, { useState, useCallback } from 'react';
import { View, Pressable, Text } from 'react-native';
import Animated, {
  useSharedValue,
  withSequence,
  withTiming,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo';
import { X, Send } from 'lucide-react-native';
import type {
  ExpoSpeechRecognitionNativeEventMap,
  ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onCancel: () => void;
}

const BASE_HEIGHT = 4;
const DECAY_SPRING = { damping: 10, stiffness: 120 };

type SpeechRecognitionModule = {
  addListener: <EventName extends keyof ExpoSpeechRecognitionNativeEventMap>(
    eventName: EventName,
    listener: (event: ExpoSpeechRecognitionNativeEventMap[EventName]) => void,
  ) => { remove: () => void };
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: ExpoSpeechRecognitionOptions) => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionModule() {
  return requireOptionalNativeModule<SpeechRecognitionModule>('ExpoSpeechRecognition');
}

export function isVoiceInputAvailable() {
  return getSpeechRecognitionModule() !== null;
}

export function VoiceInput({ onTranscript, onCancel }: VoiceInputProps) {
  const [transcript, setTranscript] = useState('');
  const speechModuleRef = React.useRef<SpeechRecognitionModule | null>(null);

  // Waveform bars driven by volume
  const bar0 = useSharedValue(BASE_HEIGHT);
  const bar1 = useSharedValue(BASE_HEIGHT);
  const bar2 = useSharedValue(BASE_HEIGHT);
  const bar3 = useSharedValue(BASE_HEIGHT);
  const bar4 = useSharedValue(BASE_HEIGHT);
  const bars = React.useMemo(() => [bar0, bar1, bar2, bar3, bar4], [bar0, bar1, bar2, bar3, bar4]);

  const startListening = useCallback(async () => {
    const speechModule = speechModuleRef.current;
    if (!speechModule) {
      onCancel();
      return;
    }

    try {
      const perms = await speechModule.requestPermissionsAsync();
      if (!perms.granted) {
        onCancel();
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTranscript('');

      speechModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        volumeChangeEventOptions: {
          enabled: true,
          intervalMillis: 100,
        },
      });
    } catch (error) {
      console.warn('Voice input unavailable:', error);
      onCancel();
    }
  }, [onCancel]);

  const handleCancel = useCallback(() => {
    speechModuleRef.current?.abort();
    onCancel();
  }, [onCancel]);

  const handleSend = useCallback(() => {
    speechModuleRef.current?.stop();
    if (transcript.trim()) {
      onTranscript(transcript.trim());
    }
  }, [transcript, onTranscript]);

  // Start listening on mount
  React.useEffect(() => {
    const speechModule = getSpeechRecognitionModule();
    speechModuleRef.current = speechModule;

    if (!speechModule) {
      console.warn('Voice input requires a native build that includes ExpoSpeechRecognition.');
      onCancel();
      return;
    }

    const subscriptions = [
      speechModule.addListener('result', (event) => {
        const text = event.results[0]?.transcript || '';
        setTranscript(text);
        if (event.isFinal) {
          onTranscript(text);
        }
      }),
      speechModule.addListener('volumechange', (event) => {
        const normalized = Math.max(0, (event.value + 2) / 12); // 0-1
        bars.forEach((bar) => {
          // Per-bar jitter so they don't all look identical
          const jitter = 0.7 + Math.random() * 0.6;
          const peakHeight = BASE_HEIGHT + normalized * 22 * jitter;
          // Pulse: jump up fast, then spring back to baseline
          bar.value = withSequence(
            withTiming(peakHeight, { duration: 60 }),
            withSpring(BASE_HEIGHT, DECAY_SPRING),
          );
        });
      }),
      speechModule.addListener('error', (event) => {
        console.error('STT error:', event.error, event.message);
        onCancel();
      }),
    ];

    startListening();
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      speechModule.abort();
      speechModuleRef.current = null;
    };
  }, [bars, onCancel, onTranscript, startListening]);

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

  const hasTranscript = transcript.length > 0;

  return (
    <View className="flex-row items-center gap-3 px-4 py-3 bg-surface-container-low rounded-2xl">
      {/* Cancel button */}
      <Pressable
        onPress={handleCancel}
        className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-95"
      >
        <X size={16} color="hsl(0, 0%, 63%)" />
      </Pressable>

      {/* Waveform + transcript area — waveform always visible while listening */}
      <View className="flex-1 flex-row items-center justify-center min-h-[36px] gap-2">
        {/* Waveform bars — always shown while recording */}
        <View className="flex-row items-center gap-[3px]">
          {barStyles.map((style, i) => (
            <Animated.View key={i} style={style} />
          ))}
        </View>

        {/* Transcript or "Listening..." label */}
        {hasTranscript ? (
          <Text className="text-foreground text-[14px] flex-1 flex-shrink" numberOfLines={2}>
            {transcript}
          </Text>
        ) : (
          <Text className="text-muted-foreground text-[13px]">
            Listening...
          </Text>
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
