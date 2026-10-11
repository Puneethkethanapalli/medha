/**
 * Chat history tools — let the model look things up in the user's past
 * conversations ("like we discussed last week").
 */

import type { ToolDefinition, ToolExecutionContext, ToolResult } from './types';
import { getRecentChats, searchPastChats, type PastChatMatch } from '@/lib/db/chat-history';

const MAX_RESULT_CHARS = 3500;

export const CHAT_HISTORY_TOOL_INSTRUCTION =
  "You can look at the user's past conversations. Call search_past_chats when the user refers to something discussed before (\"like we talked about\", \"my project\", \"last time\") or when earlier context would clearly help; call recent_chats when they ask what you talked about recently. Use what you find naturally and don't claim to remember things the results don't show.";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatMatches(matches: PastChatMatch[]): string {
  const lines: string[] = [];
  matches.forEach((match, index) => {
    lines.push(`${index + 1}. "${match.title}" (${formatDate(match.updatedAt)})`);
    for (const snippet of match.snippets) {
      lines.push(`   ${snippet.role === 'user' ? 'User' : 'Assistant'}: ${snippet.text}`);
    }
  });
  const text = lines.join('\n');
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…` : text;
}

async function executeSearchPastChats(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const query = String(args.query ?? '').trim();
  const limit = typeof args.limit === 'number' ? args.limit : 5;
  const matches = searchPastChats(query, { excludeConversationId: context.conversationId, limit });

  if (matches.length === 0) {
    return {
      content: `No past conversations match "${query}".`,
      display: { kind: 'memory', title: 'Searched past chats', query, status: 'success', summary: 'No matching conversations.' },
    };
  }

  return {
    content: `Found ${matches.length} past conversation${matches.length === 1 ? '' : 's'} (most relevant first):\n${formatMatches(matches)}`,
    display: {
      kind: 'memory',
      title: 'Searched past chats',
      query,
      status: 'success',
      sections: matches.map((match) => ({
        title: match.title,
        content: match.snippets[0]?.text ?? '',
      })),
    },
  };
}

async function executeRecentChats(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const limit = typeof args.limit === 'number' ? args.limit : 5;
  const chats = getRecentChats({ excludeConversationId: context.conversationId, limit });

  if (chats.length === 0) {
    return {
      content: 'There are no other conversations yet.',
      display: { kind: 'memory', title: 'Recent chats', status: 'success', summary: 'No other conversations yet.' },
    };
  }

  const lines = chats.map((chat, index) => {
    const last = chat.lastUserMessage?.replace(/\s+/g, ' ').trim();
    const preview = last ? `\n   Last user message: ${last.length > 200 ? `${last.slice(0, 200)}…` : last}` : '';
    return `${index + 1}. "${chat.title}" (${formatDate(chat.updatedAt)})${preview}`;
  });

  return {
    content: `Most recent conversations, newest first:\n${lines.join('\n')}`,
    display: {
      kind: 'memory',
      title: 'Recent chats',
      status: 'success',
      summary: chats.map((chat) => chat.title).join('\n'),
    },
  };
}

export const searchPastChatsTool: ToolDefinition = {
  name: 'search_past_chats',
  description:
    "Search the user's past conversations by keywords. Returns the best-matching conversations with short excerpts. The current conversation is excluded.",
  parameters: {
    query: {
      type: 'string',
      description: 'Keywords to search for, e.g. "kubernetes migration plan" or "Goa trip budget".',
      required: true,
    },
    limit: {
      type: 'number',
      description: 'Maximum conversations to return (1-8).',
      required: false,
      minimum: 1,
      maximum: 8,
      default: 5,
    },
  },
  execute: executeSearchPastChats,
};

export const recentChatsTool: ToolDefinition = {
  name: 'recent_chats',
  description:
    "List the user's most recent other conversations with their titles, dates, and last user message.",
  parameters: {
    limit: {
      type: 'number',
      description: 'How many conversations to list (1-10).',
      required: false,
      minimum: 1,
      maximum: 10,
      default: 5,
    },
  },
  execute: executeRecentChats,
};
