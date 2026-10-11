import * as React from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Motion } from '@/lib/motion';
import { usePalette } from '@/lib/palette';

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

/** Pill-shaped segmented control with a selection indicator that slides between options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const palette = usePalette();
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const segmentWidth = useSharedValue(0);
  const position = useSharedValue(index);

  React.useEffect(() => {
    position.set(withSpring(index, Motion.spring.pop));
  }, [index, position]);

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      segmentWidth.set((event.nativeEvent.layout.width - INSET * 2) / options.length);
    },
    [options.length, segmentWidth]
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth.get(),
    opacity: segmentWidth.get() > 0 ? 1 : 0,
    transform: [{ translateX: position.get() * segmentWidth.get() }],
  }));

  return (
    <View
      onLayout={handleLayout}
      style={[styles.track, { backgroundColor: palette.surfaceRaised }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[styles.indicator, { backgroundColor: palette.accent }, indicatorStyle]} />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync().catch(() => undefined);
              onChange(option.value);
            }}
            style={styles.segment}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
          >
            <Text
              className="text-[13px] font-semibold"
              style={{ color: selected ? palette.onAccent : palette.textMuted }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const INSET = 3;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: INSET,
  },
  indicator: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: 999,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
  },
});
