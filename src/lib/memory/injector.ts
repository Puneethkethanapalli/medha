/**
 * Memory injection module — Sprint 14
 *
 * Builds a memory context string from stored memories that is injected into the system prompt.
 * Pinned memories always go in; the rest are ranked by relevance to the current
 * message, then standing instructions/preferences, then recency.
 */

import { getMemories, markMemoriesUsed, shortMemoryId, type Memory } from '@/lib/db/memories';
import { getRecentUserMessageContents } from '@/lib/db/messages';
import { selectMemories } from '@/lib/memory/retrieval';
import { getMemoryProfileSync } from '@/lib/storage/mmkv';

/** Rough token estimate: ~4 chars per English token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Max tokens to inject (enough for ~40 typical memories, still small vs. context windows) */
const MAX_MEMORY_TOKENS = 800;

/** Recent user turns used as the relevance query — the latest alone is often a short follow-up. */
const QUERY_USER_MESSAGES = 2;
const MAX_QUERY_CHARS = 2000;

/**
 * Guidance appended to the system prompt when the memory tools are available.
 * With automatic extraction on, durable facts are captured after each reply,
 * so the chat model only needs the tools for explicit requests.
 */
export function getMemoryToolInstruction(autoExtraction: boolean): string {
  const saveGuidance = autoExtraction
    ? '- Memories are captured automatically after each reply, so only call save_memory when the user explicitly asks you to remember something. Write one short third-person sentence, e.g. "User is vegetarian."'
    : '- Call save_memory when the user shares a durable fact, preference, or standing instruction (name, job, location, tools they use, how they want answers), or explicitly asks you to remember something. Write one short third-person sentence, e.g. "User is vegetarian."';

  return [
    'You can remember things about the user across conversations.',
    saveGuidance,
    "- Don't save one-off task details, anything already in [User Memory], or sensitive data (passwords, keys, financial or health details) unless the user explicitly asks.",
    '- If new information changes an existing memory, call update_memory with that memory\'s id instead of saving a duplicate. When the user asks you to forget something, call forget_memory with the memory\'s id.',
    '- Use memories naturally when relevant. Don\'t list or mention them unless the user asks what you remember.',
  ].join('\n');
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatMemoryLine(memory: Memory): string {
  const pin = memory.pinned ? ' · pinned' : '';
  return `- [${shortMemoryId(memory.id)} · ${formatDate(memory.updated_at)}${pin}] ${memory.content}`;
}

/** The user profile summary block, or empty string if there's no profile yet. */
export function buildProfileContext(): string {
  const content = getMemoryProfileSync()?.content.trim();
  if (!content) return '';
  return [
    '[User Profile]',
    "A summary of who the user is. Use it to personalize answers; don't recite it.",
    content,
    '[/User Profile]',
  ].join('\n');
}

export interface BuildMemoryContextOptions {
  /** Conversation whose latest user messages decide which memories are relevant. */
  conversationId?: string | null;
  /** Count this as a real use. Only true when the prompt is actually sent. */
  recordUse?: boolean;
}

/**
 * Build a memory context block from the most relevant stored memories.
 * Returns empty string if there are no memories.
 */
export function buildMemoryContext(options: BuildMemoryContextOptions = {}): string {
  const all = getMemories();
  if (all.length === 0) return '';

  const query = options.conversationId
    ? getRecentUserMessageContents(options.conversationId, QUERY_USER_MESSAGES)
        .join('\n')
        .slice(0, MAX_QUERY_CHARS)
    : '';

  const { selected, omittedCount } = selectMemories(all, query, MAX_MEMORY_TOKENS, (memory) =>
    estimateTokens(formatMemoryLine(memory))
  );
  if (selected.length === 0) return '';

  if (options.recordUse) {
    markMemoriesUsed(selected.map((memory) => memory.id));
  }

  const lines = [
    '[User Memory]',
    'What you know about the user from past conversations, as [id · last updated] content. Newer information wins over older.',
    ...selected.map(formatMemoryLine),
  ];
  if (omittedCount > 0) {
    lines.push(`(${omittedCount} other saved memories were not relevant to this message.)`);
  }
  lines.push('[/User Memory]');
  return lines.join('\n');
}

/**
 * Quick check: does the user have any memories stored?
 */
export function hasMemories(): boolean {
  const all = getMemories(1);
  return all.length > 0;
}
