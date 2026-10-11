import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Brain } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useMemoryEventsStore } from '@/stores/memory-events-store';
import type { MemoryEvent } from '@/lib/db/memory-events';

function describe(events: MemoryEvent[]): string {
  if (events.length > 1) return `Memory updated · ${events.length} changes`;
  const [event] = events;
  switch (event.op) {
    case 'add':
      return `Remembered: ${event.after_content ?? ''}`;
    case 'update':
      return `Updated memory: ${event.after_content ?? ''}`;
    case 'delete':
      return `Forgot: ${event.before?.content ?? 'a memory'}`;
  }
}

/** Shows automatic memory changes made after this reply, with undo. */
export function MemoryUpdateChip({ messageId }: { messageId: string }) {
  const router = useRouter();
  const events = useMemoryEventsStore((s) => s.byMessageId[messageId]);
  const undoMessage = useMemoryEventsStore((s) => s.undoMessage);

  const handleUndo = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    undoMessage(messageId);
  }, [messageId, undoMessage]);

  const handleOpen = useCallback(() => {
    router.push('/settings/memories' as any);
  }, [router]);

  if (!events || events.length === 0) return null;

  const active = events.filter((event) => !event.undone_at);
  const label = active.length > 0 ? describe(active) : 'Memory change undone';

  return (
    <View className="mt-1.5 flex-row items-center gap-2 self-stretch">
      <Pressable
        onPress={handleOpen}
        className="flex-row items-center gap-1.5 flex-shrink rounded-full border border-outline-variant/20 bg-surface-container-low px-2.5 py-1 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={`${label}. Manage memories`}
      >
        <Brain size={12} color="hsl(0, 0%, 55%)" />
        <Text className="text-muted-foreground text-[11px] flex-shrink" numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {active.length > 0 && (
        <Pressable
          onPress={handleUndo}
          hitSlop={8}
          className="active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Undo memory change"
        >
          <Text className="text-muted-foreground text-[11px] font-medium underline">Undo</Text>
        </Pressable>
      )}
    </View>
  );
}
