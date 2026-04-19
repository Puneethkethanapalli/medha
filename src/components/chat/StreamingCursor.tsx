import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * Claude-style animated shimmer cursor.
 * A small horizontal bar that pulses opacity and subtly breathes in width,
 * with a glow shadow on dark backgrounds creating a gradient-like effect.
 */
export function StreamingCursor() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.65,
    transform: [{ scaleX: 0.7 + pulse.value * 0.3 }],
  }));

  return <Animated.View style={[styles.bar, animatedStyle]} />;
}

const styles = StyleSheet.create({
  bar: {
    width: 18,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'hsl(0, 0%, 63%)',
    marginTop: 6,
    marginBottom: 2,
    // Glow effect — visible on dark backgrounds
    shadowColor: 'hsl(0, 0%, 78%)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
});
