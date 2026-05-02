import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import {
  MARKDOWN_QUALITY_FIXTURE,
  MARKDOWN_STREAMING_FIXTURE,
} from '@/lib/markdown/quality-fixtures';
import { useSettingsStore } from '@/stores/settings-store';

export default function MarkdownQualityScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const isLight = theme === 'light';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={[styles.container, { backgroundColor: isLight ? '#FFFFFF' : '#09090B' }]}
    >
      <Text selectable style={[styles.title, { color: isLight ? '#18181B' : '#FAFAFA' }]}>
        Markdown Quality
      </Text>
      <MarkdownMessage content={MARKDOWN_QUALITY_FIXTURE} />
      <View style={[styles.separator, { backgroundColor: isLight ? '#E4E4E7' : '#27272A' }]} />
      <Text selectable style={[styles.title, { color: isLight ? '#18181B' : '#FAFAFA' }]}>
        Streaming Parity
      </Text>
      <MarkdownMessage content={MARKDOWN_STREAMING_FIXTURE} isStreaming />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },
});
