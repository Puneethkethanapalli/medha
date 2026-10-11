import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Circle, Svg } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette, type Palette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
import { useUIStore } from '@/stores/ui-store';
import { formatCompactTokenCount } from '@/lib/tokens/metrics';

interface ContextWindowCircleProps {
  usedTokens: number;
  contextWindow?: number;
}

const SIZE = 32;
const STROKE_WIDTH = 2.5;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ContextWindowCircle({
  usedTokens,
  contextWindow,
}: ContextWindowCircleProps) {
  const showToast = useUIStore((s) => s.showToast);
  const palette = usePalette();
  const safeUsedTokens = Math.max(0, usedTokens);
  const hasContextWindow = typeof contextWindow === 'number' && contextWindow > 0;

  const ratio = hasContextWindow ? Math.max(0, safeUsedTokens / contextWindow) : 0;
  const clampedRatio = Math.min(ratio, 1);
  // The ring eases to its new fill instead of jumping after each message.
  const fill = useSharedValue(clampedRatio);
  useEffect(() => {
    fill.set(withTiming(clampedRatio, { duration: 600, easing: Motion.easing.standard }));
  }, [clampedRatio, fill]);
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - fill.get()),
  }));
  const percent = ratio * 100;
  const centerLabel = hasContextWindow ? formatCenterLabel(percent) : '--';
  const percentLabel = hasContextWindow ? formatPercentLabel(percent) : 'unknown';
  const progressColor = hasContextWindow ? getProgressColor(ratio, palette) : palette.iconMuted;

  const handlePress = () => {
    if (hasContextWindow) {
      showToast(
        `Context ${formatCompactTokenCount(safeUsedTokens)} / ${formatCompactTokenCount(contextWindow)} (${percentLabel})`
      );
      return;
    }

    showToast(
      safeUsedTokens > 0
        ? `Context ${formatCompactTokenCount(safeUsedTokens)} used (window unknown for this model)`
        : 'Context window unknown for this model'
    );
  };

  return (
    <PressableScale
      onPress={handlePress}
      hitSlop={8}
      scaleTo={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Context window ${percentLabel} used`}
      style={[styles.button, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke={palette.surfaceHigh}
          strokeWidth={STROKE_WIDTH}
          fill="transparent"
        />
        <AnimatedCircle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke={progressColor}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={[CIRCUMFERENCE, CIRCUMFERENCE]}
          animatedProps={ringProps}
          strokeLinecap="round"
          fill="transparent"
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      </Svg>
      <View
        pointerEvents="none"
        className="items-center justify-center"
        style={styles.labelContainer}
      >
        <Text
          className="text-muted-foreground text-[8px] font-semibold"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {centerLabel}
        </Text>
      </View>
    </PressableScale>
  );
}

function formatCenterLabel(percent: number): string {
  if (percent >= 100) return '99+';
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

function formatPercentLabel(percent: number): string {
  if (percent >= 100) return '100%+';
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

function getProgressColor(ratio: number, palette: Palette): string {
  if (ratio >= 1) return palette.destructive;
  if (ratio >= 0.85) return '#F59E0B';
  return palette.icon;
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
