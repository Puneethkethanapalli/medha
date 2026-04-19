import React from 'react';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronDown } from 'lucide-react-native';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';

const PROVIDER_SHORT: Record<string, string> = {
  openrouter: 'OR',
  'google-ai': 'G',
  anthropic: 'A',
  minimax: 'MM',
};

function getModelDisplayName(modelId: string | null): string {
  if (!modelId) return 'Select Model';
  // Strip provider prefix (openrouter format: "provider/model-name:free")
  const parts = modelId.split('/');
  let name = parts.length > 1 ? parts[1] : parts[0];
  name = name.replace(/:free$/, '');
  // Prettify: capitalize each word
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function ModelPill() {
  const openModelPicker = useUIStore((s) => s.openModelPicker);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastProvider = useSettingsStore((s) => s.lastProvider);
  const displayName = getModelDisplayName(lastModel);
  const providerBadge = lastProvider ? PROVIDER_SHORT[lastProvider] : null;

  return (
    <Pressable
      onPress={openModelPicker}
      className="flex-row items-center bg-surface-container-low border border-outline-variant/20 rounded-full px-3 py-1.5 gap-1.5 active:opacity-70"
    >
      {providerBadge && (
        <Text className="text-on-surface-variant/60 text-[10px] font-bold">{providerBadge}</Text>
      )}
      <Text className="text-on-surface-variant text-[12px] font-medium" numberOfLines={1}>
        {displayName}
      </Text>
      <ChevronDown size={14} color="hsl(0, 0%, 63%)" />
    </Pressable>
  );
}
