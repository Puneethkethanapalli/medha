import React from 'react';
import { Image } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useSettingsStore } from '@/stores/settings-store';
import { usePalette } from '@/lib/palette';

/**
 * Small toggle pill for enabling/disabling image generation in the chat top bar.
 * When enabled, the generate_image tool schema is sent with every request.
 */
export function ImageGenToggle() {
  const imageGenEnabled = useSettingsStore((s) => s.imageGenEnabled);
  const setImageGenEnabled = useSettingsStore((s) => s.setImageGenEnabled);
  const palette = usePalette();

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageGenEnabled(!imageGenEnabled);
  };

  return (
    <PressableScale
      onPress={handleToggle}
      scaleTo={0.9}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: imageGenEnabled ? palette.accent : palette.surface,
        borderWidth: imageGenEnabled ? 0 : 1,
        borderColor: palette.border,
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: imageGenEnabled }}
      accessibilityLabel="Image generation"
    >
      <Image size={15} color={imageGenEnabled ? palette.onAccent : palette.icon} />
    </PressableScale>
  );
}
