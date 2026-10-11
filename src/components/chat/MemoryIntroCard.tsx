import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Brain } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';

/**
 * One-time notice that memory is on by default, with a way to manage it or
 * opt out. Hidden after any choice.
 */
export function MemoryIntroCard() {
  const router = useRouter();
  const isInitialized = useSettingsStore((s) => s.isInitialized);
  const memoryEnabled = useSettingsStore((s) => s.memoryEnabled);
  const memoryIntroSeen = useSettingsStore((s) => s.memoryIntroSeen);
  const setMemoryIntroSeen = useSettingsStore((s) => s.setMemoryIntroSeen);
  const setMemoryEnabled = useSettingsStore((s) => s.setMemoryEnabled);
  const showToast = useUIStore((s) => s.showToast);
  const palette = usePalette();

  const dismiss = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    void setMemoryIntroSeen(true);
  }, [setMemoryIntroSeen]);

  const manage = useCallback(() => {
    void setMemoryIntroSeen(true);
    router.push('/settings/memories' as any);
  }, [router, setMemoryIntroSeen]);

  const turnOff = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    void setMemoryEnabled(false);
    void setMemoryIntroSeen(true);
    showToast('Memory turned off');
  }, [setMemoryEnabled, setMemoryIntroSeen, showToast]);

  if (!isInitialized || !memoryEnabled || memoryIntroSeen) return null;

  return (
    <View
      className="w-full rounded-2xl p-4"
      style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
    >
      <View className="flex-row items-center gap-2">
        <Brain size={16} color={palette.icon} />
        <Text className="text-foreground text-[14px] font-medium">Memory is on</Text>
      </View>
      <Text className="text-on-surface-variant text-[12px] leading-[18px] mt-1.5">
        Medha remembers useful things you share, like your name, projects and preferences, and can
        look back at past chats to personalize answers. A fast model on your current provider does
        this after replies. Temporary chats are never remembered.
      </Text>
      <View className="flex-row items-center justify-end gap-4 mt-3">
        <PressableScale onPress={turnOff} hitSlop={8} scaleTo={0.94} accessibilityRole="button">
          <Text className="text-muted-foreground text-[13px] font-medium">Turn off</Text>
        </PressableScale>
        <PressableScale onPress={manage} hitSlop={8} scaleTo={0.94} accessibilityRole="button">
          <Text className="text-muted-foreground text-[13px] font-medium">Manage</Text>
        </PressableScale>
        <PressableScale
          onPress={dismiss}
          scaleTo={0.94}
          className="rounded-full bg-foreground px-3.5 py-1.5"
          accessibilityRole="button"
        >
          <Text className="text-background text-[13px] font-semibold">Got it</Text>
        </PressableScale>
      </View>
    </View>
  );
}
