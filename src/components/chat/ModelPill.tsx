import React from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getModelDisplayName } from '@/lib/models';
import { getModelCapabilities, getPremiumCapabilities } from '@/lib/models/capabilities';
import { CapabilityBadges } from '@/components/chat/CapabilityBadges';

const PROVIDER_SHORT: Record<string, string> = {
  openrouter: 'OR',
  openai: 'OA',
  'openai-codex': 'CX',
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

  const caps = lastModel && lastProvider
    ? getModelCapabilities(lastModel, lastProvider)
    : [];
  const premiumCaps = getPremiumCapabilities(caps);

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
      {premiumCaps.length > 0 && (
        <View className="flex-row items-center">
          <CapabilityBadges
            capabilities={premiumCaps}
            size={11}
            color="hsl(0, 0%, 55%)"
            gap={4}
            showTooltip={false}
            maxVisible={2}
          />
        </View>
      )}
      <ChevronDown size={14} color="hsl(0, 0%, 63%)" />
    </Pressable>
  );
}
