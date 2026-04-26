import React, { useState, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { Eye, ImagePlus, FileText, Wrench, Brain, ScrollText } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import type { ModelCapability } from '@/types';
import { getCapabilityLabel } from '@/lib/models/capabilities';

const ICON_MAP: Record<ModelCapability, React.ComponentType<{ size: number; color: string }>> = {
  vision: Eye,
  'image-gen': ImagePlus,
  pdf: FileText,
  tools: Wrench,
  thinking: Brain,
  'long-context': ScrollText,
};

interface CapabilityBadgesProps {
  capabilities: ModelCapability[];
  size?: number;
  color?: string;
  gap?: number;
  showTooltip?: boolean;
  maxVisible?: number;
}

export function CapabilityBadges({
  capabilities,
  size = 12,
  color = 'hsl(0, 0%, 55%)',
  gap = 4,
  showTooltip = true,
  maxVisible,
}: CapabilityBadgesProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const visibleCaps = maxVisible ? capabilities.slice(0, maxVisible) : capabilities;
  const hasMore = maxVisible !== undefined && capabilities.length > maxVisible;

  const handlePress = useCallback(() => {
    if (showTooltip && capabilities.length > 0) {
      setTooltipVisible((v) => !v);
    }
  }, [showTooltip, capabilities.length]);

  if (capabilities.length === 0) return null;

  return (
    <View>
      <Pressable onPress={handlePress}>
        <View className="flex-row items-center" style={{ gap }}>
          {visibleCaps.map((cap) => {
            const Icon = ICON_MAP[cap];
            return <Icon key={cap} size={size} color={color} />;
          })}
          {hasMore && (
            <Text className="text-muted-foreground text-[10px] font-medium">
              +{capabilities.length - maxVisible!}
            </Text>
          )}
        </View>
      </Pressable>

      {tooltipVisible && showTooltip && capabilities.length > 0 && (
        <View className="absolute top-full mt-1 left-0 bg-surface-container-high border border-outline-variant/20 rounded-lg px-2.5 py-1 z-50">
          <Text className="text-on-surface-variant text-[11px]">
            {capabilities.map(getCapabilityLabel).join(' \u2022 ')}
          </Text>
        </View>
      )}
    </View>
  );
}
