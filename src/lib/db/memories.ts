/**
 * Memory CRUD — Sprint 14
 *
 * Persistent memory storage using SQLite.
 * Memories are facts, preferences, and instructions the AI remembers across conversations.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';

export type MemoryCategory = 'preference' | 'fact' | 'instruction' | 'general';

export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  source: string | null;
  hit_count: number;
  pinned: number;
  created_at: number;
  updated_at: number;
}

export function addMemory(
  content: string,
  category: MemoryCategory = 'general',
  source?: string | null
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO memories (id, content, category, source, hit_count, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    [id, content, category, source ?? null, now, now]
  );

  return id;
}

export function getMemories(limit?: number): Memory[] {
  const db = getDatabase();
  const sql = limit
    ? 'SELECT * FROM memories ORDER BY pinned DESC, hit_count DESC, updated_at DESC LIMIT ?'
    : 'SELECT * FROM memories ORDER BY pinned DESC, hit_count DESC, updated_at DESC';
  const rows = limit
    ? db.getAllSync<Memory>(sql, [limit])
    : db.getAllSync<Memory>(sql);
  return rows;
}

export function getMemoriesByCategory(category: MemoryCategory): Memory[] {
  const db = getDatabase();
  return db.getAllSync<Memory>(
    'SELECT * FROM memories WHERE category = ? ORDER BY pinned DESC, hit_count DESC, updated_at DESC',
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

export function incrementHitCount(id: string): void {
  const db = getDatabase();
  db.runSync(
    'UPDATE memories SET hit_count = hit_count + 1, updated_at = ? WHERE id = ?',
    [Date.now(), id]
  );
}

export function searchMemories(query: string): Memory[] {
  const db = getDatabase();
  const escaped = query.replace(/[%_]/g, '\\$&');
  return db.getAllSync<Memory>(
    `SELECT * FROM memories WHERE content LIKE '%' || ? || '%' ESCAPE '\\'
     ORDER BY pinned DESC, hit_count DESC, updated_at DESC`,
    [escaped]
  );
}

export function getMemoryCount(): number {
  const db = getDatabase();
  const result = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM memories');
  return result?.count ?? 0;
}
