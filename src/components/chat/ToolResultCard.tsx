import React from 'react';
import { Image as RNImage, Linking, Pressable, View } from 'react-native';
import { Brain, ExternalLink, Globe, Image as ImageIcon, Search, TriangleAlert, Wrench } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import type { Citation, ToolDisplay } from '@/lib/tools/types';

interface ToolResultCardProps {
  display: ToolDisplay;
}

export function ToolResultCard({ display }: ToolResultCardProps) {
  const Icon = getIcon(display.kind);
  const iconColor = display.status === 'error'
    ? 'hsl(10, 100%, 75%)'
    : 'hsl(0, 0%, 63%)';

  return (
    <View className="mt-1 rounded-lg border border-outline-variant/15 bg-surface-container-low overflow-hidden">
      <View className="flex-row items-start gap-2 px-3 py-2 border-b border-outline-variant/10">
        <View className="h-7 w-7 rounded-full bg-muted items-center justify-center">
          <Icon size={14} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-[13px] text-foreground font-semibold" numberOfLines={1}>
            {display.title}
          </Text>
          {display.subtitle || display.query ? (
            <Text className="text-[11px] text-muted-foreground mt-0.5" numberOfLines={1}>
              {display.subtitle || display.query}
            </Text>
          ) : null}
        </View>
      </View>

      {display.summary ? (
        <Text className="px-3 pt-2 text-[12px] leading-relaxed text-on-surface-variant">
          {display.summary}
        </Text>
      ) : null}

      {display.imageUri ? (
        <RNImage
          source={{ uri: display.imageUri }}
          className="mx-3 mt-2 h-52 rounded-lg bg-muted"
          resizeMode="cover"
        />
      ) : null}

      {display.sections?.length ? (
        <View className="px-3 pt-2 gap-2">
          {display.sections.slice(0, 3).map((section) => (
            <View key={section.title} className="border-l border-outline-variant/20 pl-2">
              <Text className="text-[11px] text-foreground font-medium" numberOfLines={1}>
                {section.title}
              </Text>
              <Text className="text-[11px] text-muted-foreground leading-relaxed mt-0.5" numberOfLines={3}>
                {section.content}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {display.citations?.length ? (
        <View className="mt-2 border-t border-outline-variant/10">
          <View className="px-3 py-1.5">
            <Text className="text-[11px] text-muted-foreground font-medium">
              Sources ({display.citations.length})
            </Text>
          </View>
          {display.citations.slice(0, 6).map((citation, index) => (
            <CitationRow citation={citation} key={`${citation.url}-${index}`} />
          ))}
        </View>
      ) : null}

      {display.metadata?.length ? (
        <View className="flex-row flex-wrap gap-1.5 px-3 py-2 border-t border-outline-variant/10">
          {display.metadata.map((item) => (
            <View key={`${item.label}-${item.value}`} className="rounded-full bg-muted px-2 py-1">
              <Text className="text-[10px] text-muted-foreground">
                {item.label}: {item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CitationRow({ citation }: { citation: Citation }) {
  return (
    <Pressable
      className="px-3 py-2 active:bg-surface-container border-t border-outline-variant/5"
      onPress={() => Linking.openURL(citation.url)}
    >
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          <Text className="text-[12px] text-primary font-medium" numberOfLines={1}>
            {citation.title}
          </Text>
          {citation.snippet ? (
            <Text className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed" numberOfLines={2}>
              {citation.snippet}
            </Text>
          ) : null}
          <Text className="text-[10px] text-on-surface-variant/60 mt-1" numberOfLines={1}>
            {extractDomain(citation.url)}
          </Text>
        </View>
        <ExternalLink size={12} color="hsl(0, 0%, 50%)" style={{ marginTop: 2 }} />
      </View>
    </Pressable>
  );
}

function getIcon(kind: ToolDisplay['kind']) {
  switch (kind) {
    case 'search':
      return Globe;
    case 'research':
      return Search;
    case 'memory':
      return Brain;
    case 'image':
      return ImageIcon;
    case 'error':
      return TriangleAlert;
    default:
      return Wrench;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}
