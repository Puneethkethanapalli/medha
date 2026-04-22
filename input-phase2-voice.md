# Phase 2 — Voice Input (Speech-to-Text)

> **Goal:** Add a mic button to InputBar that does live on-device STT via `expo-speech-recognition`, with a waveform animation during recording.
> **Duration:** ~2 hours
> **Risk:** Medium — needs native module install + prebuild
> **Depends on:** Phase 1 complete (InputBar restructured with KeyboardStickyView)

---

## Install & Configure

### 1. Install
```bash
npx expo install expo-speech-recognition
npx expo prebuild --clean
```

### 2. Update `app.json` plugins
```json
{
  "expo": {
    "plugins": [
      "expo-router",
      ["expo-splash-screen", { "backgroundColor": "#09090B", "image": "./assets/images/medha-mark.png", "imageWidth": 104, "resizeMode": "contain" }],
      "expo-secure-store",
      "expo-sqlite",
      "expo-sharing",
      "expo-speech-recognition"
    ]
  }
}
```

Or with custom permissions:
```json
["expo-speech-recognition", {
  "microphonePermission": "Allow Medha to use your microphone for voice input.",
  "speechRecognitionPermission": "Allow Medha to use speech recognition.",
  "androidSpeechServicePackages": ["com.google.android.googlequicksearchbox"]
}]
```

---

## API Reference (expo-speech-recognition)

### Key Imports
```typescript
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
```

### Starting Recognition
```typescript
ExpoSpeechRecognitionModule.start({
  lang: 'en-US',
  interimResults: true,          // get partial results as user speaks
  continuous: false,             // stop after user pauses
  requiresOnDeviceRecognition: false, // true = offline-only
  volumeChangeEventOptions: {
    enabled: true,
    intervalMillis: 100,         // 100ms for smooth waveform
  },
});
```

### Events
```typescript
// Transcription results (partial + final)
useSpeechRecognitionEvent('result', (event) => {
  const transcript = event.results[0]?.transcript || '';
  const isFinal = event.isFinal;
});

// Volume levels for waveform (-2 to 10, ≤0 is inaudible)
useSpeechRecognitionEvent('volumechange', (event) => {
  const volume = event.value; // -2 to 10
  const normalized = Math.max(0, (event.value + 2) / 12); // 0 to 1
});

// Recognition ended
useSpeechRecognitionEvent('end', () => {
  // cleanup
});

// Error
useSpeechRecognitionEvent('error', (event) => {
  console.error('STT error:', event.error, event.message);
});
```

### Stopping
```typescript
ExpoSpeechRecognitionModule.stop();  // finalize and get last result
ExpoSpeechRecognitionModule.abort(); // cancel without result
```

### Permissions
```typescript
const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
if (!result.granted) {
  // show alert
}
```

---

## Task 9.2.1 — Create VoiceInput Component

**File:** `src/components/chat/VoiceInput.tsx`

This component manages the recording state and waveform animation. It renders as a full-width overlay that replaces the TextInput area when recording.

```tsx
import React, { useState, useCallback } from 'react';
import { View, Pressable, Text } from 'react-native';
import Animated, { useSharedValue, withSpring, useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Mic, X, Send } from 'lucide-react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

interface VoiceInputProps {
  onTranscript: (text: string) => void;  // called with final transcript
  onCancel: () => void;
}

export function VoiceInput({ onTranscript, onCancel }: VoiceInputProps) {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Waveform animation — array of bar heights driven by volume
  const volumeScale = useSharedValue(1);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript || '';
    setTranscript(text);
    if (event.isFinal) {
      // Auto-send on final result
      onTranscript(text);
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    const normalized = Math.max(0, (event.value + 2) / 12); // 0-1
    volumeScale.value = withSpring(1 + normalized * 0.6, {
      damping: 15,
      stiffness: 150,
    });
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.error('STT error:', event.error);
    setIsListening(false);
    onCancel();
  });

  const startListening = useCallback(async () => {
    const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perms.granted) {
      // TODO: show permission denied toast
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
  }, [startListening]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: volumeScale.value }],
  }));

  return (
    <View className="flex-row items-center gap-3 px-4 py-3 bg-surface-container-low rounded-2xl">
      {/* Cancel button */}
      <Pressable
        onPress={handleCancel}
        className="w-8 h-8 rounded-full bg-muted items-center justify-center"
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
          <View className="flex-row items-center gap-1">
            <Animated.View style={pulseStyle}>
              <View className="w-3 h-3 rounded-full bg-foreground" />
            </Animated.View>
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
        className={`w-8 h-8 rounded-full items-center justify-center ${
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
```

### Design Notes
- The waveform is a single pulsing circle that scales with volume. For a more elaborate waveform (multiple bars), create an array of `useSharedValue`s and stagger the volume updates.
- The transcript updates live as the user speaks (interim results).
- When the user stops speaking, `continuous: false` means recognition auto-stops and fires a final result.
- Cancel aborts without sending. Send stops recognition and passes the transcript up.

---

## Task 9.2.2 — Update InputBar with Mic Button

**File:** `src/components/chat/InputBar.tsx`

### New InputBar Structure
```tsx
import React, { useState, useRef, useCallback } from 'react';
import { View, TextInput, Pressable, Animated, Easing, Platform } from 'react-native';
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

    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9, duration: 80,
        easing: Easing.inOut(Easing.ease), useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1, duration: 80,
        easing: Easing.inOut(Easing.ease), useNativeDriver: true,
      }),
    ]).start();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(trimmed);
    setText('');
  }, [text, isStreaming, onSend, scaleAnim]);

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setIsRecording(false);
    if (transcript.trim()) {
      // Option A: Send immediately
      onSend(transcript.trim());
      // Option B: Insert into text field for editing
      // setText(transcript.trim());
      // inputRef.current?.focus();
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
                <ArrowUp size={18} color="hsl(240, 3.7%, 7.5%)" strokeWidth={2.5} />
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      )}
    </View>
  );
}

InputBar.displayName = 'InputBar';
```

### Button State Logic
```
No text + not streaming  → Show [Mic]
Has text + not streaming  → Show [Send ↑]
Streaming                 → Show [Stop ■]
Recording                 → Show VoiceInput overlay (Cancel + waveform + Send)
```

---

## Task 9.2.3 — Enhanced Waveform (Optional Polish)

For a more visually impressive waveform with multiple bars instead of a single pulsing circle:

```tsx
// Inside VoiceInput.tsx — replace the single circle with bars
const NUM_BARS = 5;
const barHeights = Array.from({ length: NUM_BARS }, () => useSharedValue(4));

useSpeechRecognitionEvent('volumechange', (event) => {
  const normalized = Math.max(0, (event.value + 2) / 12);
  barHeights.forEach((bar, i) => {
    // Stagger the bars for a wave effect
    const delay = i * 20;
    setTimeout(() => {
      bar.value = withSpring(4 + normalized * 20, {
        damping: 12,
        stiffness: 180,
      });
    }, delay);
  });
});

// Render bars
<View className="flex-row items-center gap-[3px]">
  {barHeights.map((height, i) => {
    const barStyle = useAnimatedStyle(() => ({
      height: height.value,
      width: 3,
      borderRadius: 1.5,
      backgroundColor: '#FAFAFA',
    }));
    return <Animated.View key={i} style={barStyle} />;
  })}
</View>
```

---

## How to Test Phase 2

```
✅ Mic button visible when text field is empty
✅ Mic button hidden when user types text
✅ Tap mic → permission prompt (first time)
✅ Grant permission → recording starts, VoiceInput overlay appears
✅ Speak → live transcript appears in overlay
✅ Waveform pulses/animates with voice volume
✅ Stop speaking → auto-finalizes → message sent
✅ Tap cancel (X) → recording aborted, returns to normal input
✅ Tap send while speaking → sends current transcript
✅ Medium haptic on mic tap
✅ Works offline if device supports on-device recognition
✅ Error handling: if STT fails, returns to normal input with no crash
```

---

## 📘 Things to Remember

- `expo-speech-recognition` requires `npx expo prebuild --clean` after install — it has native code
- Volume values range from -2 to 10. Normalize to 0-1: `Math.max(0, (value + 2) / 12)`
- `continuous: false` means recognition stops after a natural pause — ideal for single messages
- `interimResults: true` gives live transcript updates (partial results that get refined)
- On Android, the default speech service is Google's — requires Google app installed (most devices have it)
- `requiresOnDeviceRecognition: false` allows cloud-based recognition (better accuracy, needs internet)
- Set to `true` for offline support, but check `supportsOnDeviceRecognition()` first
- The `end` event fires after both `stop()` and `abort()` — use it for cleanup
- Don't call `start()` while already listening — call `stop()` or `abort()` first
- iOS needs both microphone AND speech recognition permissions. Android needs only microphone.
