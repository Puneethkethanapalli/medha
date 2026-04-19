import React from 'react';
import { Pressable, Text as RNText } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getModelDisplayName } from '@/lib/models';

const PROVIDER_SHORT: Record<string, string> = {
  openrouter: 'OR',
  'google-ai': 'G',
  anthropic: 'A',
  minimax: 'MM',
};

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
      style={{ maxWidth: '100%' }}
    >
      {providerBadge && (
        <RNText
          style={{ color: 'hsl(0, 0%, 55%)', fontSize: 10, fontWeight: '700', flexShrink: 0 }}
        >
          {providerBadge}
        </RNText>
      )}
      <RNText
        style={{
          color: 'hsl(0, 0%, 63%)',
          fontSize: 12,
          fontWeight: '500',
          flexShrink: 1,
          minWidth: 0,
        }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {displayName}
      </RNText>
      <ChevronDown size={14} color="hsl(0, 0%, 63%)" />
    </Pressable>
  );
}
