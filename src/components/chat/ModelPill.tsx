import React from 'react';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronDown } from 'lucide-react-native';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';

function getModelDisplayName(modelId: string | null): string {
  if (!modelId) return 'Select Model';
  // Strip provider prefix and :free suffix for display
  const parts = modelId.split('/');
  let name = parts.length > 1 ? parts[1] : parts[0];
  name = name.replace(/:free$/, '');
  // Prettify common names
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function ModelPill() {
  const openModelPicker = useUIStore((s) => s.openModelPicker);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const displayName = getModelDisplayName(lastModel);

  return (
    <Pressable
      onPress={openModelPicker}
      className="flex-row items-center bg-surface-container-low border border-outline-variant/20 rounded-full px-3 py-1.5 gap-1 active:opacity-70"
    >
      <Text className="text-on-surface-variant text-[12px] font-medium" numberOfLines={1}>
        {displayName}
      </Text>
      <ChevronDown size={14} color="hsl(0, 0%, 63%)" />
    </Pressable>
  );
}
