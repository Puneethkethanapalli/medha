import { getDatabase } from '@/lib/db/schema';
import { getConversation } from '@/lib/db/conversations';
import { getApp } from '@/lib/db/apps';

const MAX_CONTEXT_CHARS = 2800;
const MAX_RELATED_CHATS = 5;
const MAX_MESSAGES_PER_CHAT = 3;

interface RelatedConversationRow {
  id: string;
  title: string;
  updated_at: number;
}

interface ProjectMessageRow {
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

export function buildProjectContext(conversationId: string | null): string {
  if (!conversationId) return '';

  const conversation = getConversation(conversationId);
  if (!conversation?.app_id) return '';

  const app = getApp(conversation.app_id);
  if (!app) return '';

  const db = getDatabase();
  const relatedConversations = db.getAllSync<RelatedConversationRow>(
    `SELECT id, title, updated_at
     FROM conversations
     WHERE app_id = ? AND id != ? AND COALESCE(temporary, 0) = 0
     ORDER BY updated_at DESC
     LIMIT ?`,
    [conversation.app_id, conversationId, MAX_RELATED_CHATS]
  );

  const lines: string[] = [
    '[Project Workspace]',
    `Name: ${app.name}`,
    app.description ? `Description: ${app.description}` : '',
    app.rules ? `Project instructions: ${truncate(app.rules, 500)}` : '',
  ].filter(Boolean);

  if (relatedConversations.length > 0) {
    lines.push('Recent related chats:');
    for (const related of relatedConversations) {
      const messages = db.getAllSync<ProjectMessageRow>(
        `SELECT role, content, created_at
         FROM messages
         WHERE conversation_id = ?
           AND role IN ('user', 'assistant')
           AND LENGTH(TRIM(content)) > 0
         ORDER BY created_at DESC
         LIMIT ?`,
        [related.id, MAX_MESSAGES_PER_CHAT]
      ).reverse();

      if (messages.length === 0) continue;

      lines.push(`- ${related.title}`);
      for (const message of messages) {
        lines.push(`  ${message.role}: ${truncate(message.content, 240)}`);
      }
    }
  }

  lines.push('[/Project Workspace]');
  return truncate(lines.join('\n'), MAX_CONTEXT_CHARS);
}

function truncate(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars - 1).trim()}...`;
}
