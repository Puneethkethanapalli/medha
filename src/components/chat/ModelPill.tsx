import React, { useEffect, useMemo } from 'react';
import { Text as RNText, View, useWindowDimensions } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getModelDisplayName } from '@/lib/models';
import { getModelCapabilities, getPremiumCapabilities } from '@/lib/models/capabilities';
import { loadModelMetadata, useModelListStore } from '@/lib/models/model-list-sync';
import { CapabilityBadges } from '@/components/chat/CapabilityBadges';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';

const PROVIDER_SHORT: Record<string, string> = {
  openrouter: 'OR',
  openai: 'OA',
  'openai-codex': 'CX',
  'google-ai': 'G',
  anthropic: 'A',
  minimax: 'MM',
  'cloudflare-ai': 'CF',
};

export function ModelPill() {
  const { width } = useWindowDimensions();
  const openModelPicker = useUIStore((s) => s.openModelPicker);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastModelName = useSettingsStore((s) => s.lastModelName);
  const lastProvider = useSettingsStore((s) => s.lastProvider);
  const metadataVersion = useModelListStore((s) => s.metadataVersion);
  const displayName = lastModelName || getModelDisplayName(lastModel);
  const providerBadge = lastProvider ? PROVIDER_SHORT[lastProvider] : null;
  const maxPillWidth = Math.max(104, Math.min(176, width * 0.42));
  const palette = usePalette();

  useEffect(() => {
    void loadModelMetadata();
  }, []);

  const caps = useMemo(
    () => {
      // Re-read capabilities once LiteLLM or provider list metadata loads.
      void metadataVersion;
      return lastModel && lastProvider
        ? getModelCapabilities(lastModel, lastProvider)
        : [];
    },
    [lastModel, lastProvider, metadataVersion]
  );
  const premiumCaps = getPremiumCapabilities(caps);

  return (
    <PressableScale
      onPress={openModelPicker}
      haptic
      scaleTo={0.95}
      className="flex-row items-center rounded-full px-3 gap-1.5"
      style={{
        height: 32,
        maxWidth: maxPillWidth,
        minWidth: 0,
        flexShrink: 1,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
      }}
      accessibilityRole="button"
      accessibilityLabel="Select model"
    >
      {providerBadge && (
        <RNText
          style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700', flexShrink: 0 }}
        >
          {providerBadge}
        </RNText>
      )}
      <RNText
        style={{
          color: palette.text,
          fontSize: 13,
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
        <View className="flex-row items-center" style={{ flexShrink: 0 }}>
          <CapabilityBadges
            capabilities={premiumCaps}
            size={11}
            color={palette.textMuted}
            gap={4}
            showTooltip={false}
            maxVisible={2}
          />
        </View>
      )}
      <ChevronDown size={14} color={palette.icon} />
    </PressableScale>
  );
}
