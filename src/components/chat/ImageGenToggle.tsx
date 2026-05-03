import React from 'react';
import { Pressable } from 'react-native';
import { Image } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Small toggle pill for enabling/disabling image generation in the chat top bar.
 * When enabled, the generate_image tool schema is sent with every request.
 */
export function ImageGenToggle() {
  const imageGenEnabled = useSettingsStore((s) => s.imageGenEnabled);
  const setImageGenEnabled = useSettingsStore((s) => s.setImageGenEnabled);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageGenEnabled(!imageGenEnabled);
  };

  return (
    <Pressable
      onPress={handleToggle}
      className={`w-8 h-8 items-center justify-center rounded-full ${
        imageGenEnabled
          ? 'bg-foreground'
          : 'bg-muted'
      }`}
      accessibilityRole="switch"
      accessibilityState={{ checked: imageGenEnabled }}
      accessibilityLabel="Image generation"
    >
      <Image
        size={15}
        color={imageGenEnabled ? 'hsl(0, 0%, 9%)' : 'hsl(0, 0%, 63%)'}
      />
    </Pressable>
  );
}
