import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Globe, ExternalLink } from 'lucide-react-native';
import type { Citation } from '@/lib/tools/types';

interface SearchResultsProps {
  citations: Citation[];
}

/**
 * Renders inline search result citations in the assistant bubble.
 * Compact layout with title + snippet + link.
 */
export function SearchResults({ citations }: SearchResultsProps) {
  if (!citations.length) return null;

  return (
    <View className="mt-3 rounded-lg border border-outline-variant/15 bg-surface-container-low overflow-hidden">
      {/* Header */}
      <View className="flex-row items-center gap-1.5 px-3 py-2 border-b border-outline-variant/10">
        <Globe size={13} color="hsl(0, 0%, 63%)" />
        <Text className="text-xs font-medium text-on-surface-variant">
          Sources ({citations.length})
        </Text>
      </View>

      {/* Citation list */}
      {citations.map((cite, i) => (
        <Pressable
          key={`${cite.url}-${i}`}
          className="px-3 py-2.5 active:bg-surface-container border-b border-outline-variant/5 last:border-b-0"
          onPress={() => Linking.openURL(cite.url)}
        >
          <View className="flex-row items-start gap-2">
            <View className="flex-1">
              <Text
                className="text-[13px] text-primary font-medium leading-tight"
                numberOfLines={1}
              >
                {cite.title}
              </Text>
              {cite.snippet ? (
                <Text
                  className="text-xs text-on-surface-variant mt-0.5 leading-relaxed"
                  numberOfLines={2}
                >
                  {cite.snippet}
                </Text>
              ) : null}
              <Text
                className="text-[10px] text-on-surface-variant/60 mt-1"
                numberOfLines={1}
              >
                {extractDomain(cite.url)}
              </Text>
            </View>
            <ExternalLink size={12} color="hsl(0, 0%, 50%)" style={{ marginTop: 2 }} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}
