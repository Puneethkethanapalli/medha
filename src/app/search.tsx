import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Search, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { searchConversationMessages } from '@/lib/db/messages';
import { useUIStore } from '@/stores/ui-store';
import type { MessageSearchResult } from '@/types';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const setActiveConversation = useUIStore((state) => state.setActiveConversation);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const nextQuery = query.trim();

      if (!nextQuery) {
        setResults([]);
        return;
      }

      startTransition(() => {
        setResults(searchConversationMessages(nextQuery));
      });
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  const resultCountLabel = useMemo(() => {
    if (results.length === 1) {
      return '1 conversation';
    }
    return `${results.length} conversations`;
  }, [results.length]);

  return (
    <View className="flex-1 bg-background">
      <View
        className="px-2 flex-row items-center gap-1"
        style={{ marginTop: insets.top, minHeight: 56 }}
      >
        <PressableScale
          onPress={() => router.back()}
          scaleTo={0.88}
          hitSlop={4}
          className="w-10 h-10 items-center justify-center rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={palette.text} />
        </PressableScale>

        <View
          className="flex-1 flex-row items-center rounded-xl px-3 mr-2"
          style={{ height: 42, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
        >
          <Search size={17} color={palette.iconMuted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search messages..."
            placeholderTextColor={palette.iconMuted}
            cursorColor={palette.text}
            className="flex-1 text-foreground text-[15px] ml-2.5 p-0"
          />
          {query.length > 0 && (
            <PressableScale
              onPress={() => setQuery('')}
              scaleTo={0.85}
              hitSlop={8}
              className="w-6 h-6 items-center justify-center rounded-full"
              style={{ backgroundColor: palette.surfaceHigh }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={13} color={palette.icon} strokeWidth={2.5} />
            </PressableScale>
          )}
        </View>
      </View>

      {!query.trim() ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-foreground text-[18px] font-semibold">
            Search across all chats
          </Text>
          <Text className="text-on-surface-variant text-[14px] text-center mt-2 leading-6">
            Find message content from any conversation and jump straight to the matching reply.
          </Text>
        </View>
      ) : results.length === 0 && !isPending ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-foreground text-[18px] font-semibold">
            No matches yet
          </Text>
          <Text className="text-on-surface-variant text-[14px] text-center mt-2 leading-6">
            Try a different keyword or phrase. Search looks through your saved message content.
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <View className="px-5 pt-4 pb-2">
            <Text className="text-muted-foreground text-[11px] uppercase tracking-wider font-semibold">
              {isPending ? 'Searching...' : resultCountLabel}
            </Text>
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.message_id}
            renderItem={({ item }) => (
              <PressableScale
                scaleTo={0.98}
                onPress={() => {
                  setActiveConversation(item.conversation_id);
                  router.replace(
                    {
                      pathname: '/chat/[id]',
                      params: {
                        id: item.conversation_id,
                        messageId: item.message_id,
                        focusKey: String(Date.now()),
                      },
                    } as any
                  );
                }}
                className="mx-3 mb-1.5 px-4 py-3 rounded-2xl"
                style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
              >
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text
                    className="text-foreground text-[14px] font-medium flex-1"
                    numberOfLines={1}
                  >
                    {item.conversation_title}
                  </Text>
                  <Text className="text-muted-foreground text-[12px]">
                    {formatSearchDate(item.conversation_updated_at)}
                  </Text>
                </View>

                <Text className="text-on-surface-variant text-[13px] mt-1 leading-5">
                  {item.preview.slice(0, item.match_start)}
                  <Text className="text-foreground font-semibold">
                    {item.preview.slice(item.match_start, item.match_end)}
                  </Text>
                  {item.preview.slice(item.match_end)}
                </Text>
              </PressableScale>
            )}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 24 }}
          />
        </View>
      )}
    </View>
  );
}

function formatSearchDate(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const valueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (valueDay.getTime() === today.getTime()) {
    return 'Today';
  }

  if (valueDay.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
