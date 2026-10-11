import React, { useMemo, useCallback } from 'react';
import { View, FlatList, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { PenSquare, Search, Pin, MessageCircle, Settings, Grid3X3 } from 'lucide-react-native';
import { BrandTile } from '@/components/branding/BrandTile';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { deleteConversation } from '@/lib/db/conversations';
import { getConversationUsage } from '@/lib/db/token-usage';
import { getApp } from '@/lib/db/apps';
import { getIconByName } from '@/lib/apps/icons';
import { formatCost } from '@/lib/tokens/pricing';
import type { Conversation } from '@/types';

interface ConversationDrawerProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenApps: () => void;
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
  const palette = usePalette();
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
    <PressableScale
      onPress={onPress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      scaleTo={0.98}
      className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl"
      style={isActive ? { backgroundColor: palette.surfaceRaised } : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      {(() => {
        const color = isActive ? palette.text : palette.iconMuted;
        if (conversation.pinned) {
          return <Pin size={16} color={color} />;
        }
        if (conversation.app_id) {
          const app = getApp(conversation.app_id);
          if (app) {
            const AppIcon = getIconByName(app.icon);
            return <AppIcon size={16} color={app.color ?? color} />;
          }
        }
        return <MessageCircle size={16} color={color} />;
      })()}
      <Text
        className={`text-[14px] font-medium flex-1 ${
          isActive ? 'text-foreground' : 'text-on-surface-variant'
        }`}
        numberOfLines={1}
      >
        {conversation.title}
      </Text>
      <ConversationCostBadge conversationId={conversation.id} />
    </PressableScale>
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
  onOpenApps,
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
  const palette = usePalette();

  return (
    <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 8 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between pb-4">
        <View className="flex-row items-center gap-3">
          <BrandTile size={36} />
          <Text className="text-foreground text-[19px] font-semibold tracking-tight">Medha</Text>
        </View>
        <PressableScale
          onPress={onNewChat}
          haptic
          scaleTo={0.93}
          className="flex-row items-center rounded-full px-3.5 gap-1.5"
          style={{ height: 34, backgroundColor: palette.accent }}
          accessibilityRole="button"
          accessibilityLabel="New chat"
        >
          <PenSquare size={15} color={palette.onAccent} strokeWidth={2.25} />
          <Text className="text-[13px] font-semibold" style={{ color: palette.onAccent }}>New</Text>
        </PressableScale>
      </View>

      {/* Search */}
      <PressableScale
        onPress={onOpenSearch}
        scaleTo={0.98}
        className="flex-row items-center rounded-xl px-3"
        style={{ height: 42, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
        accessibilityRole="search"
        accessibilityLabel="Search messages"
      >
        <Search size={17} color={palette.iconMuted} />
        <Text className="flex-1 text-muted-foreground text-[14px] ml-2.5">
          Search messages
        </Text>
      </PressableScale>

      {/* Conversation List */}
      <FlatList
        data={flatData}
        keyExtractor={(item, index) =>
          item.type === 'header' ? `header-${item.label}` : `item-${item.conversation.id}`
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider px-3 mt-5 mb-1.5 opacity-80">
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

      {/* Footer — Apps & Settings */}
      <View className="pt-3 gap-0.5" style={{ borderTopWidth: 1, borderTopColor: palette.border }}>
        {[
          { icon: Grid3X3, label: 'Apps', onPress: onOpenApps },
          { icon: Settings, label: 'Settings', onPress: onOpenSettings },
        ].map(({ icon: Icon, label, onPress }) => (
          <PressableScale
            key={label}
            onPress={onPress}
            scaleTo={0.98}
            className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl"
            accessibilityRole="button"
          >
            <Icon size={19} color={palette.icon} />
            <Text className="text-on-surface-variant text-[14px] font-medium">{label}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
