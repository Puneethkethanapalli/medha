import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Circle, Svg } from 'react-native-svg';
import { Text } from '@/components/ui/text';
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

export function ContextWindowCircle({
  usedTokens,
  contextWindow,
}: ContextWindowCircleProps) {
  const showToast = useUIStore((s) => s.showToast);
  const safeUsedTokens = Math.max(0, usedTokens);
  const hasContextWindow = typeof contextWindow === 'number' && contextWindow > 0;

  const ratio = hasContextWindow ? Math.max(0, safeUsedTokens / contextWindow) : 0;
  const clampedRatio = Math.min(ratio, 1);
  const dashOffset = CIRCUMFERENCE * (1 - clampedRatio);
  const percent = ratio * 100;
  const centerLabel = hasContextWindow ? formatCenterLabel(percent) : '--';
  const percentLabel = hasContextWindow ? formatPercentLabel(percent) : 'unknown';
  const progressColor = hasContextWindow ? getProgressColor(ratio) : '#71717A';

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
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Context window ${percentLabel} used`}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke="#3F3F46"
          strokeWidth={STROKE_WIDTH}
          fill="transparent"
        />
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke={progressColor}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={[CIRCUMFERENCE, CIRCUMFERENCE]}
          strokeDashoffset={dashOffset}
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
    </Pressable>
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

function getProgressColor(ratio: number): string {
  if (ratio >= 1) return '#EF4444';
  if (ratio >= 0.85) return '#F59E0B';
  return '#A1A1AA';
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#18181B',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  labelContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
