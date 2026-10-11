import React from 'react';
import { Settings2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useUIStore } from '@/stores/ui-store';
import { usePalette } from '@/lib/palette';

export function ChatSettingsButton() {
  const openChatSettings = useUIStore((s) => s.openChatSettings);
  const palette = usePalette();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openChatSettings();
  };

  return (
    <PressableScale
      onPress={handlePress}
      scaleTo={0.9}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
      }}
      accessibilityRole="button"
      accessibilityLabel="Chat settings"
    >
      <Settings2 size={15} color={palette.icon} />
    </PressableScale>
  );
}
