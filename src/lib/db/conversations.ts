import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';
import type { Conversation } from '../../types';

export function createConversation(
  title: string = 'New Chat',
  model?: string,
  systemPrompt?: string
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO conversations (id, title, model, provider, system_prompt, created_at, updated_at, pinned)
     VALUES (?, ?, ?, 'openrouter', ?, ?, ?, 0)`,
    [id, title, model ?? null, systemPrompt ?? null, now, now]
  );

  return id;
}

export function getConversations(): Conversation[] {
  const db = getDatabase();
  const rows = db.getAllSync<Conversation>(
    'SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC'
  );
  return rows;
}

export function getConversation(id: string): Conversation | null {
  const db = getDatabase();
  const row = db.getFirstSync<Conversation>(
    'SELECT * FROM conversations WHERE id = ?',
    [id]
  );
  return row ?? null;
}

export function updateConversation(
  id: string,
  fields: Partial<Pick<Conversation, 'title' | 'model' | 'system_prompt' | 'pinned'>>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (fields.title !== undefined) {
    sets.push('title = ?');
    values.push(fields.title);
  }
  if (fields.model !== undefined) {
    sets.push('model = ?');
    values.push(fields.model ?? '');
  }
  if (fields.system_prompt !== undefined) {
    sets.push('system_prompt = ?');
    values.push(fields.system_prompt ?? '');
  }
  if (fields.pinned !== undefined) {
    sets.push('pinned = ?');
    values.push(fields.pinned);
  }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  db.runSync(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`, values);
}

export function deleteConversation(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM conversations WHERE id = ?', [id]);
}

export function touchConversation(id: string): void {
  const db = getDatabase();
  db.runSync('UPDATE conversations SET updated_at = ? WHERE id = ?', [Date.now(), id]);
}