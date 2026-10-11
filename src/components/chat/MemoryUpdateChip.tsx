import React, { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Brain } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
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
  const palette = usePalette();

  const handleUndo = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    undoMessage(messageId);
  }, [messageId, undoMessage]);

  const handleOpen = useCallback(() => {
    router.push('/settings/memories');
  }, [router]);

  if (!events || events.length === 0) return null;

  const active = events.filter((event) => !event.undone_at);
  const label = active.length > 0 ? describe(active) : 'Memory change undone';

  return (
    <Animated.View
      entering={FadeIn.duration(Motion.duration.enter)}
      style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' }}
    >
      <PressableScale
        onPress={handleOpen}
        scaleTo={0.96}
        className="flex-row items-center gap-1.5 flex-shrink rounded-full px-2.5 py-1"
        style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Manage memories`}
      >
        <Brain size={12} color={palette.icon} />
        <Text className="text-muted-foreground text-[11px] flex-shrink" numberOfLines={1}>
          {label}
        </Text>
      </PressableScale>
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
    </Animated.View>
  );
}
