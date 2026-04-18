import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';
import type { Message } from '../../types';

export function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  model?: string
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO messages (id, conversation_id, role, content, status, model, created_at)
     VALUES (?, ?, ?, ?, 'complete', ?, ?)`,
    [id, conversationId, role, content, model ?? null, now]
  );

  return id;
}

export function getMessages(conversationId: string): Message[] {
  const db = getDatabase();
  const rows = db.getAllSync<Message>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );
  return rows;
}

export function updateMessage(
  id: string,
  fields: Partial<Pick<Message, 'content' | 'status' | 'tokens_used'>>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.content !== undefined) {
    sets.push('content = ?');
    values.push(fields.content);
  }
  if (fields.status !== undefined) {
    sets.push('status = ?');
    values.push(fields.status);
  }
  if (fields.tokens_used !== undefined) {
    sets.push('tokens_used = ?');
    values.push(fields.tokens_used ?? null);
  }

  if (sets.length === 0) return;

  values.push(id);

  db.runSync(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`, values);
}

export function deleteMessage(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM messages WHERE id = ?', [id]);
}

export function deleteMessagesAfter(conversationId: string, createdAt: number): void {
  const db = getDatabase();
  db.runSync(
    'DELETE FROM messages WHERE conversation_id = ? AND created_at > ?',
    [conversationId, createdAt]
  );
}