import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Search, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { searchConversationMessages } from '@/lib/db/messages';
import { useUIStore } from '@/stores/ui-store';
import type { MessageSearchResult } from '@/types';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
        className="border-b border-outline-variant/20 px-4 h-14 flex-row items-center"
        style={{ marginTop: insets.top }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center -ml-2"
        >
          <ArrowLeft size={22} color="hsl(0, 0%, 63%)" />
        </Pressable>

        <View className="flex-1 flex-row items-center px-2">
          <Search size={17} color="hsl(0, 0%, 44%)" />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search messages..."
            placeholderTextColor="hsl(0, 0%, 44%)"
            className="flex-1 text-foreground text-[16px] ml-3 p-0"
          />
        </View>

        <Pressable
          onPress={() => setQuery('')}
          className="w-10 h-10 items-center justify-center -mr-2"
          disabled={!query.length}
        >
          <X
            size={18}
            color={query.length ? 'hsl(0, 0%, 63%)' : 'hsl(0, 0%, 24%)'}
          />
        </Pressable>
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
          <View className="px-4 py-4">
            <Text className="text-on-surface-variant text-[12px] uppercase tracking-[2px] font-medium">
              {isPending ? 'Searching...' : resultCountLabel}
            </Text>
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.message_id}
            renderItem={({ item }) => (
              <Pressable
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
                className="px-4 py-3 border-b border-outline-variant/10 active:bg-surface-container-low"
              >
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text
                    className="text-foreground text-[14px] font-medium flex-1"
                    numberOfLines={1}
                  >
                    {item.conversation_title}
                  </Text>
                  <Text className="text-on-surface-variant text-[12px]">
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
              </Pressable>
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
