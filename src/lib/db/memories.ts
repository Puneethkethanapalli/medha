/**
 * Memory CRUD — Sprint 14
 *
 * Persistent memory storage using SQLite.
 * Memories are facts, preferences, and instructions the AI remembers across conversations.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';

export type MemoryCategory = 'preference' | 'fact' | 'instruction' | 'general';

/** Who created the memory: the user in Settings, or the assistant via a tool. */
export type MemorySource = 'user' | 'assistant';

export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  source: string | null;
  /** Conversation the memory was saved from, if any. */
  conversation_id: string | null;
  /** Number of requests the memory was actually sent with. */
  hit_count: number;
  last_used_at: number | null;
  pinned: number;
  created_at: number;
  updated_at: number;
}

/** Length of the short ID shown to the model and accepted by memory tools. */
export const MEMORY_SHORT_ID_LENGTH = 8;

export function shortMemoryId(id: string): string {
  return id.slice(0, MEMORY_SHORT_ID_LENGTH);
}

export function addMemory(
  content: string,
  category: MemoryCategory = 'general',
  options: { source?: MemorySource; conversationId?: string | null } = {}
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO memories (id, content, category, source, conversation_id, hit_count, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    [id, content, category, options.source ?? null, options.conversationId ?? null, now, now]
  );

  return id;
}

/** Re-insert a deleted memory exactly as it was (used for undo). */
export function restoreMemory(memory: Memory): void {
  const db = getDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO memories
       (id, content, category, source, conversation_id, hit_count, last_used_at, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      memory.id,
      memory.content,
      memory.category,
      memory.source,
      memory.conversation_id,
      memory.hit_count,
      memory.last_used_at,
      memory.pinned,
      memory.created_at,
      memory.updated_at,
    ]
  );
}

export function getMemories(limit?: number): Memory[] {
  const db = getDatabase();
  const sql = limit
    ? 'SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC LIMIT ?'
    : 'SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC';
  const rows = limit
    ? db.getAllSync<Memory>(sql, [limit])
    : db.getAllSync<Memory>(sql);
  return rows;
}

export function getMemoriesByCategory(category: MemoryCategory): Memory[] {
  const db = getDatabase();
  return db.getAllSync<Memory>(
    'SELECT * FROM memories WHERE category = ? ORDER BY pinned DESC, updated_at DESC',
    [category]
  );
}

export function getPinnedMemories(): Memory[] {
  const db = getDatabase();
  return db.getAllSync<Memory>(
    'SELECT * FROM memories WHERE pinned = 1 ORDER BY updated_at DESC'
  );
}

export function getMemoryById(id: string): Memory | null {
  const db = getDatabase();
  return db.getFirstSync<Memory>('SELECT * FROM memories WHERE id = ?', [id]) ?? null;
}

/**
 * Resolve a full or short memory ID as written by a model (tolerating
 * brackets or prefixes like "[a1b2c3d4]"). Returns null unless exactly one matches.
 */
export function resolveMemoryId(idOrPrefix: string): Memory | null {
  const cleaned = idOrPrefix.toLowerCase().replace(/[^0-9a-f-]/g, '');
  if (cleaned.length < 4) return null;

  const db = getDatabase();
  const matches = db.getAllSync<Memory>(
    "SELECT * FROM memories WHERE id LIKE ? || '%' LIMIT 2",
    [cleaned]
  );
  return matches.length === 1 ? matches[0] : null;
}

export function updateMemory(
  id: string,
  fields: Partial<Pick<Memory, 'content' | 'category' | 'pinned'>>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.content !== undefined) {
    sets.push('content = ?');
    values.push(fields.content);
  }
  if (fields.category !== undefined) {
    sets.push('category = ?');
    values.push(fields.category);
  }
  if (fields.pinned !== undefined) {
    sets.push('pinned = ?');
    values.push(fields.pinned);
  }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  db.runSync(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`, values);
}

export function deleteMemory(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM memories WHERE id = ?', [id]);
}

/**
 * Record that memories were sent with a request. Leaves updated_at alone so
 * usage never makes a memory look newer than its content.
 */
export function markMemoriesUsed(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(', ');
  db.runSync(
    `UPDATE memories SET hit_count = hit_count + 1, last_used_at = ? WHERE id IN (${placeholders})`,
    [Date.now(), ...ids]
  );
}

export function searchMemories(query: string): Memory[] {
  const db = getDatabase();
  const escaped = query.replace(/[\\%_]/g, '\\$&');
  return db.getAllSync<Memory>(
    `SELECT * FROM memories WHERE content LIKE '%' || ? || '%' ESCAPE '\\'
     ORDER BY pinned DESC, updated_at DESC`,
    [escaped]
  );
}

export function getMemoryCount(): number {
  const db = getDatabase();
  const result = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM memories');
  return result?.count ?? 0;
}
