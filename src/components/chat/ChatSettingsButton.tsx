import React from 'react';
import { Pressable } from 'react-native';
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
      className="w-8 h-8 items-center justify-center bg-muted rounded-full active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel="Chat settings"
    >
      <Settings2 size={15} color="hsl(0, 0%, 63%)" />
    </Pressable>
  );
}
