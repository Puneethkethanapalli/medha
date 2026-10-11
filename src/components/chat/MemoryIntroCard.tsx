import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Brain } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
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
    <View className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
      <View className="flex-row items-center gap-2">
        <Brain size={16} color="hsl(0, 0%, 63%)" />
        <Text className="text-foreground text-[14px] font-medium">Memory is on</Text>
      </View>
      <Text className="text-on-surface-variant text-[12px] leading-[18px] mt-1.5">
        Medha remembers useful things you share, like your name, projects and preferences, and can
        look back at past chats to personalize answers. A fast model on your current provider does
        this after replies. Temporary chats are never remembered.
      </Text>
      <View className="flex-row items-center justify-end gap-4 mt-3">
        <Pressable onPress={turnOff} hitSlop={8} className="active:opacity-60" accessibilityRole="button">
          <Text className="text-muted-foreground text-[13px] font-medium">Turn off</Text>
        </Pressable>
        <Pressable onPress={manage} hitSlop={8} className="active:opacity-60" accessibilityRole="button">
          <Text className="text-muted-foreground text-[13px] font-medium">Manage</Text>
        </Pressable>
        <Pressable
          onPress={dismiss}
          className="rounded-full bg-foreground px-3.5 py-1.5 active:opacity-80"
          accessibilityRole="button"
        >
          <Text className="text-background text-[13px] font-medium">Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}
