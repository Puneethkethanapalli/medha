import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface ScrollToBottomButtonProps {
  visible: boolean;
  isStreaming: boolean;
  onPress: () => void;
}

/**
 * Floating scroll-to-bottom button with animated entrance/exit.
 * Shows a chevron-down icon with an optional streaming indicator dot.
 * Matches the universal pattern used by ChatGPT, Claude, and Gemini.
 */
export function ScrollToBottomButton({ visible, isStreaming, onPress }: ScrollToBottomButtonProps) {
  if (!visible) return null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(200).springify().damping(18)}
      exiting={FadeOutDown.duration(150)}
      style={styles.container}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        accessibilityLabel="Scroll to bottom"
        accessibilityRole="button"
        hitSlop={4}
      >
        <ChevronDown size={18} color="hsl(0, 0%, 72%)" strokeWidth={2.5} />
        {isStreaming && <View style={styles.streamingDot} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    // Depth shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.92 }],
  },
  streamingDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34C759',
    borderWidth: 1.5,
    borderColor: '#1C1C1E',
  },
});
