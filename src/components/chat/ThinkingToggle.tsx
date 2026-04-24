import React, { useCallback } from 'react';
import { Pressable, Text as RNText } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Brain } from 'lucide-react-native';
import { useSettingsStore } from '@/stores/settings-store';
import type { ThinkingMode } from '@/lib/storage/mmkv';

const MODE_CYCLE: ThinkingMode[] = ['auto', 'on', 'off'];

const MODE_LABELS: Record<ThinkingMode, string> = {
  auto: 'Auto',
  on: 'Think',
  off: 'Off',
};

const MODE_STYLES: Record<ThinkingMode, {
  bg: string;
  text: string;
  iconColor: string;
}> = {
  auto: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    iconColor: 'hsl(0, 0%, 63%)',
  },
  on: {
    bg: 'bg-foreground',
    text: 'text-background',
    iconColor: 'hsl(0, 0%, 4%)',
  },
  off: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    iconColor: 'hsl(0, 0%, 45%)',
  },
};

export function ThinkingToggle() {
  const thinkingMode = useSettingsStore((s) => s.thinkingMode);
  const setThinkingMode = useSettingsStore((s) => s.setThinkingMode);

  const handlePress = useCallback(() => {
    const currentIndex = MODE_CYCLE.indexOf(thinkingMode);
    const nextIndex = (currentIndex + 1) % MODE_CYCLE.length;
    const nextMode = MODE_CYCLE[nextIndex];
    setThinkingMode(nextMode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [thinkingMode, setThinkingMode]);

  const style = MODE_STYLES[thinkingMode];

  return (
    <Pressable
      onPress={handlePress}
      className={`flex-row items-center ${style.bg} rounded-full px-2.5 py-1 gap-1 active:opacity-70`}
    >
      <Brain
        size={12}
        color={style.iconColor}
        style={thinkingMode === 'off' ? { opacity: 0.5 } : undefined}
      />
      <RNText
        style={{
          color: thinkingMode === 'on' ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 63%)',
          fontSize: 11,
          fontWeight: '600',
          opacity: thinkingMode === 'off' ? 0.5 : 1,
        }}
      >
        {MODE_LABELS[thinkingMode]}
      </RNText>
    </Pressable>
  );
}
