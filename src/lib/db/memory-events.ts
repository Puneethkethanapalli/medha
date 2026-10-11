/**
 * Memory events — changes made to memory automatically after a reply.
 *
 * Each row ties one memory change to the assistant message that triggered it,
 * so the chat can show "Memory updated" under that message and undo it.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';
import type { Memory } from './memories';

export type MemoryEventOp = 'add' | 'update' | 'delete';

export interface MemoryEvent {
  id: string;
  conversation_id: string;
  message_id: string;
  memory_id: string;
  op: MemoryEventOp;
  /** Memory as it was before an update or delete. */
  before: Memory | null;
  /** Memory content after an add or update. */
  after_content: string | null;
  undone_at: number | null;
  created_at: number;
}

interface MemoryEventRow extends Omit<MemoryEvent, 'before'> {
  before_json: string | null;
}

function fromRow(row: MemoryEventRow): MemoryEvent {
  let before: Memory | null = null;
  if (row.before_json) {
    try {
      before = JSON.parse(row.before_json) as Memory;
    } catch {
      before = null;
    }
  }
  const { before_json: _beforeJson, ...rest } = row;
  return { ...rest, before };
}

export function addMemoryEvent(
  event: Omit<MemoryEvent, 'id' | 'undone_at' | 'created_at'>
): MemoryEvent {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO memory_events (id, conversation_id, message_id, memory_id, op, before_json, after_content, undone_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id,
      event.conversation_id,
      event.message_id,
      event.memory_id,
      event.op,
      event.before ? JSON.stringify(event.before) : null,
      event.after_content,
      now,
    ]
  );

  return { ...event, id, undone_at: null, created_at: now };
}

export function getMemoryEventsForConversation(conversationId: string): MemoryEvent[] {
  const db = getDatabase();
  return db
    .getAllSync<MemoryEventRow>(
      'SELECT * FROM memory_events WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversationId]
    )
    .map(fromRow);
}

export function markMemoryEventsUndone(ids: string[]): number {
  const now = Date.now();
  if (ids.length === 0) return now;
  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(', ');
  db.runSync(`UPDATE memory_events SET undone_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);
  return now;
}
