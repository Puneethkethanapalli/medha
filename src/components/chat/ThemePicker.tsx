import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Sheet } from '@/components/ui/sheet';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getPalette, usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
import type { Theme } from '@/lib/storage/mmkv';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'oled', label: 'OLED' },
];

export function ThemePicker() {
  const isOpen = useUIStore((s) => s.themePickerOpen);
  const close = useUIStore((s) => s.closeThemePicker);
  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const handleSelectTheme = useCallback(
    (theme: Theme) => {
      if (theme !== currentTheme) void setTheme(theme);
    },
    [currentTheme, setTheme]
  );

  return (
    <Sheet open={isOpen} onClose={close} title="Theme" subtitle="Choose how Medha looks">
      <View className="flex-row gap-3 px-5 pt-1 pb-3">
        {THEMES.map((theme) => (
          <ThemeOption
            key={theme.id}
            theme={theme.id}
            label={theme.label}
            selected={currentTheme === theme.id}
            onSelect={handleSelectTheme}
          />
        ))}
      </View>
    </Sheet>
  );
}

function ThemeOption({
  theme,
  label,
  selected,
  onSelect,
}: {
  theme: Theme;
  label: string;
  selected: boolean;
  onSelect: (theme: Theme) => void;
}) {
  const palette = usePalette();
  // Preview the option in its own colors, not the active theme's.
  const preview = getPalette(theme);
  const check = useSharedValue(selected ? 1 : 0);

  React.useEffect(() => {
    check.set(selected ? withSpring(1, Motion.spring.pop) : withTiming(0, { duration: Motion.duration.fast }));
  }, [check, selected]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.get(),
    transform: [{ scale: 0.5 + check.get() * 0.5 }],
  }));

  return (
    <PressableScale
      onPress={() => onSelect(theme)}
      haptic
      scaleTo={0.95}
      style={styles.option}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} theme`}
    >
      <View
        style={[
          styles.preview,
          {
            backgroundColor: preview.background,
            borderColor: selected ? palette.text : palette.border,
            borderWidth: selected ? 2 : 1,
          },
        ]}
      >
        <View style={[styles.previewLine, { backgroundColor: preview.surfaceHigh, width: '70%' }]} />
        <View style={[styles.previewLine, { backgroundColor: preview.surfaceHigh, width: '45%' }]} />
        <View
          style={[
            styles.previewBubble,
            { backgroundColor: preview.surfaceRaised, borderColor: preview.border },
          ]}
        />
        <Animated.View style={[styles.checkBadge, { backgroundColor: palette.accent }, checkStyle]}>
          <Check size={11} color={palette.onAccent} strokeWidth={3} />
        </Animated.View>
      </View>
      <Text
        className="text-[13px] mt-2"
        style={{ color: selected ? palette.text : palette.textMuted, fontWeight: selected ? '600' : '400' }}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  option: {
    flex: 1,
    alignItems: 'center',
  },
  preview: {
    width: '100%',
    height: 92,
    borderRadius: 16,
    padding: 10,
    gap: 6,
  },
  previewLine: {
    height: 7,
    borderRadius: 4,
  },
  previewBubble: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: '50%',
    height: 18,
    borderRadius: 9,
    borderBottomRightRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
