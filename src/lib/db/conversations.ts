import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';
import type { Conversation } from '../../types';

export function createConversation(
  title: string = 'New Chat',
  model?: string,
  systemPrompt?: string,
  provider: string = 'openrouter',
  options: { temporary?: boolean } = {}
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO conversations (id, title, model, provider, system_prompt, created_at, updated_at, pinned, temporary)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, title, model ?? null, provider, systemPrompt ?? null, now, now, options.temporary ? 1 : 0]
  );

  return id;
}

/** Conversations shown in history. Temporary chats are never listed. */
export function getConversations(): Conversation[] {
  const db = getDatabase();
  const rows = db.getAllSync<Conversation>(
    'SELECT * FROM conversations WHERE COALESCE(temporary, 0) = 0 ORDER BY pinned DESC, updated_at DESC'
  );
  return rows;
}

export function isTemporaryConversation(id: string | null | undefined): boolean {
  if (!id) return false;
  const db = getDatabase();
  const row = db.getFirstSync<{ temporary: number | null }>(
    'SELECT temporary FROM conversations WHERE id = ?',
    [id]
  );
  return row?.temporary === 1;
}

/** Delete every temporary chat (run at launch, when none can be open). */
export function purgeTemporaryConversations(): number {
  const db = getDatabase();
  const result = db.runSync('DELETE FROM conversations WHERE temporary = 1');
  return result.changes;
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
  fields: Partial<Pick<Conversation, 'title' | 'model' | 'system_prompt' | 'pinned' | 'thinking_mode' | 'rules' | 'active_skill_name' | 'app_id'>>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.title !== undefined) {
    sets.push('title = ?');
    values.push(fields.title);
  }
  if (fields.model !== undefined) {
    sets.push('model = ?');
    values.push(fields.model ?? null);
  }
  if (fields.system_prompt !== undefined) {
    sets.push('system_prompt = ?');
    values.push(fields.system_prompt ?? null);
  }
  if (fields.pinned !== undefined) {
    sets.push('pinned = ?');
    values.push(fields.pinned);
  }
  if (fields.thinking_mode !== undefined) {
    sets.push('thinking_mode = ?');
    values.push(fields.thinking_mode ?? null);
  }
  if (fields.rules !== undefined) {
    sets.push('rules = ?');
    values.push(fields.rules ?? null);
  }
  if (fields.active_skill_name !== undefined) {
    sets.push('active_skill_name = ?');
    values.push(fields.active_skill_name ?? null);
  }
  if (fields.app_id !== undefined) {
    sets.push('app_id = ?');
    values.push(fields.app_id ?? null);
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
