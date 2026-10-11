import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { usePalette } from '@/lib/palette';

interface ScrollToBottomButtonProps {
  visible: boolean;
  isStreaming: boolean;
  onPress: () => void;
}

/**
 * Floating scroll-to-bottom button.
 *
 * Always mounted — visibility is driven by animated opacity + pointerEvents
 * instead of conditional rendering. This avoids the mount/unmount timing
 * conflicts that reanimated layout animations cause during rapid streaming
 * re-renders.
 */
export const ScrollToBottomButton = React.memo(function ScrollToBottomButton({
  visible,
  isStreaming,
  onPress,
}: ScrollToBottomButtonProps) {
  const progress = useSharedValue(0);
  const palette = usePalette();

  useEffect(() => {
    progress.value = withSpring(visible ? 1 : 0, {
      damping: 20,
      stiffness: 300,
      mass: 0.8,
    });
  }, [visible, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [8, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.85, 1]) },
    ],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
          pressed && styles.buttonPressed,
        ]}
        accessibilityLabel="Scroll to bottom"
        accessibilityRole="button"
        hitSlop={4}
      >
        <ChevronDown size={18} color={palette.text} strokeWidth={2.25} />
        {isStreaming && (
          <View style={[styles.streamingDot, { borderColor: palette.surfaceRaised }]} />
        )}
      </Pressable>
    </Animated.View>
  );
});

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
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
  },
});
