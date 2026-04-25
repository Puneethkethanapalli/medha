import React from 'react';
import { Pressable, Text } from 'react-native';
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
      className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
        imageGenEnabled
          ? 'bg-foreground'
          : 'bg-muted'
      }`}
    >
      <Image
        size={12}
        color={imageGenEnabled ? 'hsl(0, 0%, 9%)' : 'hsl(0, 0%, 63%)'}
      />
      <Text
        className={`text-[11px] font-medium ${
          imageGenEnabled
            ? 'text-background'
            : 'text-muted-foreground'
        }`}
      >
        {imageGenEnabled ? 'Image' : 'Image'}
      </Text>
    </Pressable>
  );
}
