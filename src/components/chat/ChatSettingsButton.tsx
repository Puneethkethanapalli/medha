import React from 'react';
import { Pressable, Text } from 'react-native';
import { Settings2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useUIStore } from '@/stores/ui-store';

export function ChatSettingsButton() {
  const openChatSettings = useUIStore((s) => s.openChatSettings);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openChatSettings();
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-1 bg-muted rounded-full px-2.5 py-1 active:opacity-70"
    >
      <Settings2 size={12} color="hsl(0, 0%, 63%)" />
      <Text className="text-[11px] font-semibold text-muted-foreground">
        Settings
      </Text>
    </Pressable>
  );
}
