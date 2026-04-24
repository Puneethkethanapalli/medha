import React from 'react';
import { Pressable, Text } from 'react-native';
import { Globe } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Small toggle pill for enabling/disabling web search in the chat top bar.
 * When enabled, tool schemas are sent with every request.
 */
export function WebSearchToggle() {
  const webSearchEnabled = useSettingsStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useSettingsStore((s) => s.setWebSearchEnabled);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWebSearchEnabled(!webSearchEnabled);
  };

  return (
    <Pressable
      onPress={handleToggle}
      className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
        webSearchEnabled
          ? 'bg-foreground'
          : 'bg-muted'
      }`}
    >
      <Globe
        size={12}
        color={webSearchEnabled ? 'hsl(0, 0%, 9%)' : 'hsl(0, 0%, 63%)'}
      />
      <Text
        className={`text-[11px] font-medium ${
          webSearchEnabled
            ? 'text-background'
            : 'text-muted-foreground'
        }`}
      >
        {webSearchEnabled ? 'Search' : 'Search'}
      </Text>
    </Pressable>
  );
}
