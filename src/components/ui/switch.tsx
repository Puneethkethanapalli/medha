import * as React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Motion } from '@/lib/motion';
import { usePalette } from '@/lib/palette';

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 20;
const INSET = 3;
const TRAVEL = TRACK_WIDTH - THUMB_SIZE - INSET * 2;

interface SwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Toggle whose thumb springs across and whose track color cross-fades. */
function Switch({ checked, onCheckedChange, disabled = false, accessibilityLabel }: SwitchProps) {
  const palette = usePalette();
  const progress = useSharedValue(checked ? 1 : 0);

  React.useEffect(() => {
    progress.set(withSpring(checked ? 1 : 0, Motion.spring.pop));
  }, [checked, progress]);

  const trackOff = palette.surfaceHigh;
  const trackOn = palette.accent;
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [trackOff, trackOn]),
  }));

  const thumbOff = palette.isDark ? palette.textMuted : palette.background;
  const thumbOn = palette.onAccent;
  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [thumbOff, thumbOn]),
    transform: [{ translateX: progress.get() * TRAVEL }],
  }));

  const handlePress = React.useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    onCheckedChange?.(!checked);
  }, [checked, onCheckedChange]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={disabled ? styles.disabled : undefined}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: INSET,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
  disabled: {
    opacity: 0.5,
  },
});

export { Switch };
