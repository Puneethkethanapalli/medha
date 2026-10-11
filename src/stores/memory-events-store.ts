import { create } from 'zustand';
import { deleteMemory, restoreMemory } from '@/lib/db/memories';
import {
  getMemoryEventsForConversation,
  markMemoryEventsUndone,
  type MemoryEvent,
} from '@/lib/db/memory-events';

interface MemoryEventsState {
  /** Automatic memory changes, grouped by the assistant message that triggered them. */
  byMessageId: Record<string, MemoryEvent[]>;
}

interface MemoryEventsActions {
  loadConversation: (conversationId: string | null) => void;
  addEvents: (events: MemoryEvent[]) => void;
  undoMessage: (messageId: string) => void;
}

function groupByMessage(events: MemoryEvent[]): Record<string, MemoryEvent[]> {
  const grouped: Record<string, MemoryEvent[]> = {};
  for (const event of events) {
    (grouped[event.message_id] ??= []).push(event);
  }
  return grouped;
}

export const useMemoryEventsStore = create<MemoryEventsState & MemoryEventsActions>((set, get) => ({
  byMessageId: {},

  loadConversation: (conversationId) => {
    if (!conversationId) {
      set({ byMessageId: {} });
      return;
    }
    try {
      set({ byMessageId: groupByMessage(getMemoryEventsForConversation(conversationId)) });
    } catch {
      set({ byMessageId: {} });
    }
  },

  addEvents: (events) => {
    if (events.length === 0) return;
    set((state) => {
      const byMessageId = { ...state.byMessageId };
      for (const event of events) {
        byMessageId[event.message_id] = [...(byMessageId[event.message_id] ?? []), event];
      }
      return { byMessageId };
    });
  },

  undoMessage: (messageId) => {
    const active = (get().byMessageId[messageId] ?? []).filter((event) => !event.undone_at);
    if (active.length === 0) return;

    // Revert newest first so chained changes to one memory unwind correctly.
    for (const event of [...active].reverse()) {
      if (event.op === 'add') {
        deleteMemory(event.memory_id);
      } else if (event.before) {
        restoreMemory(event.before);
      }
    }

    const undoneAt = markMemoryEventsUndone(active.map((event) => event.id));
    const undoneIds = new Set(active.map((event) => event.id));
    set((state) => ({
      byMessageId: {
        ...state.byMessageId,
        [messageId]: (state.byMessageId[messageId] ?? []).map((event) =>
          undoneIds.has(event.id) ? { ...event, undone_at: undoneAt } : event
        ),
      },
    }));
  },
}));
