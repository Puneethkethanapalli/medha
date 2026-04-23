import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';
import type { Message, Attachment, MessageSearchResult } from '../../types';

export function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  model?: string,
  attachments?: Attachment[] | null
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO messages (id, conversation_id, role, content, status, model, attachments, created_at)
     VALUES (?, ?, ?, ?, 'complete', ?, ?, ?)`,
    [id, conversationId, role, content, model ?? null,
     attachments ? JSON.stringify(attachments) : null, now]
  );

  return id;
}

export function getMessages(conversationId: string): Message[] {
  const db = getDatabase();
  const rows = db.getAllSync<any>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );
  return rows.map((row) => ({
    ...row,
    attachments: row.attachments ? JSON.parse(row.attachments) : null,
  }));
}

export function updateMessage(
  id: string,
  fields: Partial<Pick<Message, 'content' | 'status' | 'tokens_used' | 'reasoning' | 'attachments'>>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.content !== undefined) {
    sets.push('content = ?');
    values.push(fields.content);
  }
  if (fields.reasoning !== undefined) {
    sets.push('reasoning = ?');
    values.push(fields.reasoning);
  }
  if (fields.status !== undefined) {
    sets.push('status = ?');
    values.push(fields.status);
  }
  if (fields.tokens_used !== undefined) {
    sets.push('tokens_used = ?');
    values.push(fields.tokens_used ?? null);
  }
  if (fields.attachments !== undefined) {
    sets.push('attachments = ?');
    values.push(fields.attachments ? JSON.stringify(fields.attachments) : null);
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

interface SearchMessageRow {
  conversation_id: string;
  conversation_title: string;
  conversation_updated_at: number;
  message_id: string;
  message_content: string;
  message_created_at: number;
}

export function searchConversationMessages(query: string, limit: number = 50): MessageSearchResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const db = getDatabase();
  const escapedQuery = escapeLikePattern(trimmedQuery);
  const rows = db.getAllSync<SearchMessageRow>(
    `SELECT
       m.conversation_id AS conversation_id,
       c.title AS conversation_title,
       c.updated_at AS conversation_updated_at,
       m.id AS message_id,
       m.content AS message_content,
       m.created_at AS message_created_at
     FROM messages m
     INNER JOIN conversations c ON c.id = m.conversation_id
     WHERE m.role != 'system'
       AND LENGTH(TRIM(m.content)) > 0
       AND LOWER(m.content) LIKE '%' || LOWER(?) || '%' ESCAPE '\\'
     ORDER BY c.updated_at DESC, m.created_at DESC
     LIMIT ?`,
    [escapedQuery, limit * 4]
  );

  const results: MessageSearchResult[] = [];
  const seenConversationIds = new Set<string>();

  for (const row of rows) {
    if (seenConversationIds.has(row.conversation_id)) {
      continue;
    }

    const preview = buildSearchPreview(row.message_content, trimmedQuery);
    if (!preview) {
      continue;
    }

    seenConversationIds.add(row.conversation_id);
    results.push({
      conversation_id: row.conversation_id,
      conversation_title: row.conversation_title,
      conversation_updated_at: row.conversation_updated_at,
      message_id: row.message_id,
      message_content: row.message_content,
      message_created_at: row.message_created_at,
      preview: preview.text,
      match_start: preview.matchStart,
      match_end: preview.matchEnd,
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function buildSearchPreview(content: string, query: string) {
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();

  if (!normalizedContent || !normalizedQuery) {
    return null;
  }

  const lowerContent = normalizedContent.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return null;
  }

  const contextBefore = 36;
  const contextAfter = 56;
  const start = Math.max(0, matchIndex - contextBefore);
  const end = Math.min(
    normalizedContent.length,
    matchIndex + normalizedQuery.length + contextAfter
  );

  let preview = normalizedContent.slice(start, end).trim();
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedContent.length ? '...' : '';

  preview = `${prefix}${preview}${suffix}`;

  return {
    text: preview,
    matchStart: prefix.length + (matchIndex - start),
    matchEnd: prefix.length + (matchIndex - start) + normalizedQuery.length,
  };
}
