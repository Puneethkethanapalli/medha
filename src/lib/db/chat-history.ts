/**
 * Cross-conversation lookups used by memory features: full-text search over
 * past chats, recent chats, and recent user messages for the profile summary.
 */

import { getDatabase, isMessageSearchIndexAvailable } from './schema';
import { tokenize } from '@/lib/memory/retrieval';

export interface PastChatSnippet {
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}

export interface PastChatMatch {
  conversationId: string;
  title: string;
  updatedAt: number;
  snippets: PastChatSnippet[];
}

export interface RecentChat {
  conversationId: string;
  title: string;
  updatedAt: number;
  lastUserMessage: string | null;
}

interface MatchRow {
  conversation_id: string;
  title: string;
  updated_at: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

const MAX_QUERY_TERMS = 8;
const SNIPPETS_PER_CHAT = 2;
const SNIPPET_RADIUS = 140;

/** FTS5 query: any term, prefix-matched, each quoted so user text can't inject syntax. */
export function buildFtsQuery(query: string): string | null {
  const terms = Array.from(new Set(tokenize(query))).slice(0, MAX_QUERY_TERMS);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replace(/"/g, '""')}"*`).join(' OR ');
}

/** A window of text around the first query term, collapsed to one line. */
export function buildSnippet(content: string, query: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const positions = tokenize(query)
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0);
  const hit = positions.length > 0 ? Math.min(...positions) : 0;

  const start = Math.max(0, hit - SNIPPET_RADIUS);
  const end = Math.min(text.length, hit + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Search past conversations, best matches first, grouped per conversation.
 * Excludes the current conversation so results add new context.
 */
export function searchPastChats(
  query: string,
  options: { excludeConversationId?: string | null; limit?: number } = {}
): PastChatMatch[] {
  const limit = options.limit ?? 5;
  const exclude = options.excludeConversationId ?? '';
  const db = getDatabase();

  let rows: MatchRow[];
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  if (isMessageSearchIndexAvailable()) {
    rows = db.getAllSync<MatchRow>(
      `SELECT m.conversation_id, c.title, c.updated_at, m.role, m.content, m.created_at
       FROM messages_fts f
       JOIN messages m ON m.id = f.message_id
       JOIN conversations c ON c.id = m.conversation_id
       WHERE messages_fts MATCH ? AND m.conversation_id != ? AND COALESCE(c.temporary, 0) = 0
       ORDER BY bm25(messages_fts)
       LIMIT ?`,
      [ftsQuery, exclude, limit * 12]
    );
  } else {
    // No FTS5: match the most specific (longest) term with LIKE.
    const term = tokenize(query).sort((a, b) => b.length - a.length)[0];
    rows = db.getAllSync<MatchRow>(
      `SELECT m.conversation_id, c.title, c.updated_at, m.role, m.content, m.created_at
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.role IN ('user', 'assistant') AND m.conversation_id != ?
         AND COALESCE(c.temporary, 0) = 0
         AND LOWER(m.content) LIKE '%' || ? || '%' ESCAPE '\\'
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [exclude, term.replace(/[\\%_]/g, '\\$&'), limit * 12]
    );
  }

  const byConversation = new Map<string, PastChatMatch>();
  for (const row of rows) {
    let match = byConversation.get(row.conversation_id);
    if (!match) {
      if (byConversation.size >= limit) continue;
      match = { conversationId: row.conversation_id, title: row.title, updatedAt: row.updated_at, snippets: [] };
      byConversation.set(row.conversation_id, match);
    }
    if (match.snippets.length < SNIPPETS_PER_CHAT) {
      match.snippets.push({ role: row.role, text: buildSnippet(row.content, query), createdAt: row.created_at });
    }
  }

  // Show each conversation's snippets in the order they were said.
  for (const match of byConversation.values()) {
    match.snippets.sort((a, b) => a.createdAt - b.createdAt);
  }
  return Array.from(byConversation.values());
}

export function getRecentChats(
  options: { excludeConversationId?: string | null; limit?: number } = {}
): RecentChat[] {
  const db = getDatabase();
  return db
    .getAllSync<{ id: string; title: string; updated_at: number; last_user_message: string | null }>(
      `SELECT c.id, c.title, c.updated_at,
         (SELECT m.content FROM messages m
          WHERE m.conversation_id = c.id AND m.role = 'user'
          ORDER BY m.created_at DESC LIMIT 1) AS last_user_message
       FROM conversations c
       WHERE c.id != ? AND COALESCE(c.temporary, 0) = 0
       ORDER BY c.updated_at DESC
       LIMIT ?`,
      [options.excludeConversationId ?? '', options.limit ?? 5]
    )
    .map((row) => ({
      conversationId: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      lastUserMessage: row.last_user_message,
    }));
}

/** Latest user messages across all chats, newest first. */
export function getRecentUserMessages(limit: number): { content: string; createdAt: number }[] {
  const db = getDatabase();
  return db
    .getAllSync<{ content: string; created_at: number }>(
      `SELECT m.content, m.created_at FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.role = 'user' AND LENGTH(TRIM(m.content)) > 0 AND COALESCE(c.temporary, 0) = 0
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [limit]
    )
    .map((row) => ({ content: row.content, createdAt: row.created_at }));
}

/** Most recent time any conversation changed, or 0 if there are none. */
export function getLatestConversationUpdate(): number {
  const db = getDatabase();
  return (
    db.getFirstSync<{ latest: number | null }>(
      'SELECT MAX(updated_at) AS latest FROM conversations WHERE COALESCE(temporary, 0) = 0'
    )?.latest ?? 0
  );
}
