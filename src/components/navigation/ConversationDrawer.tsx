import React, { useMemo, useCallback } from 'react';
import { View, Pressable, FlatList, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { PenSquare, Search, Pin, MessageCircle, Settings } from 'lucide-react-native';
import { MedhaLogo } from '@/components/branding/MedhaLogo';
import { deleteConversation } from '@/lib/db/conversations';
import { getConversationUsage } from '@/lib/db/token-usage';
import { formatCost } from '@/lib/tokens/pricing';
import type { Conversation } from '@/types';

interface ConversationDrawerProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenRules: (conversationId: string) => void;
  onRefresh: () => void;
}

interface GroupedConversations {
  label: string;
  data: Conversation[];
}

function groupByDate(conversations: Conversation[]): GroupedConversations[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 7 * 86400000;

  const pinned: Conversation[] = [];
  const todayGroup: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const lastWeek: Conversation[] = [];
  const older: Conversation[] = [];

  for (const conv of conversations) {
    if (conv.pinned) {
      pinned.push(conv);
    } else if (conv.updated_at >= todayStart) {
      todayGroup.push(conv);
    } else if (conv.updated_at >= yesterdayStart) {
      yesterday.push(conv);
    } else if (conv.updated_at >= weekStart) {
      lastWeek.push(conv);
    } else {
      older.push(conv);
    }
  }

  const groups: GroupedConversations[] = [];
  if (pinned.length > 0) groups.push({ label: 'Pinned', data: pinned });
  if (todayGroup.length > 0) groups.push({ label: 'Today', data: todayGroup });
  if (yesterday.length > 0) groups.push({ label: 'Yesterday', data: yesterday });
  if (lastWeek.length > 0) groups.push({ label: 'Previous 7 Days', data: lastWeek });
  if (older.length > 0) groups.push({ label: 'Older', data: older });

  return groups;
}

function ConversationItem({
  conversation,
  isActive,
  onPress,
  onDelete,
  onEditRules,
}: {
  conversation: Conversation;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
  onEditRules: () => void;
}) {
  const handleLongPress = () => {
    Alert.alert(
      conversation.title,
      'Conversation actions',
      [
        { text: 'Edit Rules', onPress: onEditRules },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

    return (
    <Pressable
      onPress={onPress}
      onLongPress={handleLongPress}
      className={`flex-row items-center gap-3 px-2 py-2.5 rounded-lg ${
        isActive ? 'bg-surface-container-low' : ''
      }`}
    >
      {isActive && (
        <View
          className="absolute left-0 w-[2px] h-[60%] bg-foreground rounded-r-full"
          style={{ top: '20%' }}
        />
      )}
      {conversation.pinned ? (
        <Pin size={18} color="hsl(0, 0%, 44%)" />
      ) : (
        <MessageCircle size={18} color={isActive ? 'hsl(0, 0%, 98%)' : 'hsl(0, 0%, 44%)'} />
      )}
      <Text
        className={`text-[14px] font-medium flex-1 ${
          isActive ? 'text-foreground' : 'text-on-surface-variant'
        }`}
        numberOfLines={1}
      >
        {conversation.title}
      </Text>
      <ConversationCostBadge conversationId={conversation.id} />
    </Pressable>
  );
}

const ConversationCostBadge = React.memo(function ConversationCostBadge({
  conversationId,
}: {
  conversationId: string;
}) {
  const usage = useMemo(() => getConversationUsage(conversationId), [conversationId]);
  const costLabel = formatCost(usage.totalCost);
  if (!costLabel || usage.totalCost === 0) return null;

  return (
    <Text className="text-muted-foreground text-[10px] opacity-50">
      {costLabel}
    </Text>
  );
});

export function ConversationDrawer({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onOpenSearch,
  onOpenSettings,
  onOpenRules,
  onRefresh,
}: ConversationDrawerProps) {
  const grouped = useMemo(() => groupByDate(conversations), [conversations]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteConversation(id);
      onRefresh();
    },
    [onRefresh]
  );

  // Flatten for FlatList
  const flatData = useMemo(() => {
    const items: (
      | { type: 'header'; label: string }
      | { type: 'item'; conversation: Conversation }
    )[] = [];
    for (const group of grouped) {
      items.push({ type: 'header', label: group.label });
      for (const conv of group.data) {
        items.push({ type: 'item', conversation: conv });
      }
    }
    return items;
  }, [grouped]);

  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background p-4" style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom }}>
      {/* Header */}
      <View className="flex-row items-center justify-between pb-4 border-b border-outline-variant/20">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl border border-outline-variant/20 bg-[#09090B]">
            <MedhaLogo size={20} />
          </View>
          <Text className="text-foreground text-[18px] font-semibold">Medha</Text>
        </View>
        <Pressable
          onPress={onNewChat}
          className="flex-row items-center bg-surface-container-low border border-outline-variant/20 rounded-full px-3 py-1.5 gap-1.5 active:opacity-70"
        >
          <PenSquare size={16} color="hsl(0, 0%, 98%)" />
          <Text className="text-foreground text-[14px] font-medium">New</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View className="py-4 border-b border-outline-variant/20">
        <Pressable
          onPress={onOpenSearch}
          className="flex-row items-center bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2 active:opacity-80"
        >
          <Search size={18} color="hsl(0, 0%, 44%)" />
          <Text className="flex-1 text-on-surface-variant text-[13px] ml-2">
            Search messages...
          </Text>
        </Pressable>
      </View>

      {/* Conversation List */}
      <FlatList
        data={flatData}
        keyExtractor={(item, index) =>
          item.type === 'header' ? `header-${item.label}` : `item-${item.conversation.id}`
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <Text className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-widest px-2 mt-4 mb-2">
                {item.label}
              </Text>
            );
          }
          return (
            <ConversationItem
              conversation={item.conversation}
              isActive={item.conversation.id === activeConversationId}
              onPress={() => onSelectConversation(item.conversation.id)}
              onDelete={() => handleDelete(item.conversation.id)}
              onEditRules={() => onOpenRules(item.conversation.id)}
            />
          );
        }}
        className="flex-1 -mx-2 px-2 py-2"
        showsVerticalScrollIndicator={false}
      />

      {/* Footer — Settings */}
      <View className="pt-4 border-t border-outline-variant/20">
        <Pressable
          onPress={onOpenSettings}
          className="flex-row items-center gap-3 px-2 py-2.5 rounded-lg active:bg-surface-container-low"
        >
          <Settings size={20} color="hsl(0, 0%, 63%)" />
          <Text className="text-on-surface-variant text-[14px] font-medium">Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}
