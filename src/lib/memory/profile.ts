/**
 * User profile summary — a short, always-injected description of the user,
 * regenerated in the background from saved memories (and recent chats when
 * "Reference chat history" is on). Users can read and edit it in Settings.
 */

import { countMemoriesUpdatedSince, getMemories, getMemoryStats, type Memory } from '@/lib/db/memories';
import {
  getLatestConversationUpdate,
  getRecentChats,
  getRecentUserMessages,
  type RecentChat,
} from '@/lib/db/chat-history';
import { recordUsage } from '@/lib/db/token-usage';
import { completeText } from '@/lib/llm/complete';
import { pickFastModel } from '@/lib/llm/fast-model';
import { looksLikeCredential } from '@/lib/memory/operations';
import { enqueueMemoryTask } from '@/lib/memory/queue';
import {
  getMemoryProfileSync,
  isMemoryAutoEnabledSync,
  isMemoryChatHistoryEnabledSync,
  isMemoryEnabledSync,
  type MemoryProfile,
} from '@/lib/storage/mmkv';
import { calculateCost } from '@/lib/tokens/pricing';
import { useSettingsStore } from '@/stores/settings-store';

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** This many memory changes refresh the profile early, without waiting a day. */
const EARLY_REFRESH_CHANGES = 5;
const MIN_MEMORIES_FOR_FIRST_PROFILE = 3;
export const MAX_PROFILE_CHARS = 1500;
const PROFILE_MEMORY_LIMIT = 150;
const RECENT_CHAT_TOPICS = 20;
const RECENT_USER_MESSAGES = 40;
const USER_MESSAGE_CHARS = 200;
const PROFILE_TIMEOUT_MS = 45 * 1000;

const PROFILE_SYSTEM_PROMPT = `You write a short profile of the user for an AI assistant's long-term memory. The assistant reads it at the start of every conversation to personalize its answers.

Use only what the saved memories and the user's own messages support. Don't guess, and don't infer sensitive traits (health, religion, politics, sexuality, finances) unless a saved memory states them. Never include passwords, keys, or account numbers.

Write at most 180 words in third person, as short markdown sections with "-" bullets. Use these headings, in this order, and leave out any that would be empty:
**About**
**Work & projects**
**Interests**
**How they like answers**

When sources conflict, saved memories beat chat messages and newer beats older. Output only the profile.`;

export interface ProfileGenerationContext {
  providerId: string;
  apiKey: string;
  chatModel: string;
  /** Attribute token usage to this reply when generated after one. */
  usageTarget?: { conversationId: string; messageId: string };
  /** Manual regeneration: overwrite even if the user edited the profile. */
  force?: boolean;
}

function fingerprint(stats: { count: number; latestUpdate: number }): string {
  return `${stats.count}:${stats.latestUpdate}`;
}

/**
 * Whether a background refresh is due: there's no profile yet (and enough
 * memories to write one), or something changed and either a day has passed or
 * several memories changed. Edited profiles are left alone.
 */
export function isProfileStale(now: number = Date.now()): boolean {
  const profile = getMemoryProfileSync();
  const stats = getMemoryStats();
  if (!profile) return stats.count >= MIN_MEMORIES_FOR_FIRST_PROFILE;
  if (profile.userEdited) return false;

  const memoriesChanged = fingerprint(stats) !== profile.fingerprint;
  const chatsChanged =
    isMemoryChatHistoryEnabledSync() && getLatestConversationUpdate() > profile.generatedAt;
  if (!memoriesChanged && !chatsChanged) return false;

  if (countMemoriesUpdatedSince(profile.generatedAt) >= EARLY_REFRESH_CHANGES) return true;
  return now - profile.generatedAt >= REFRESH_INTERVAL_MS;
}

/** Queue a refresh check after a reply. Cheap when nothing is due. */
export function scheduleProfileRefresh(context: ProfileGenerationContext): void {
  if (!isMemoryEnabledSync() || !isMemoryAutoEnabledSync()) return;
  enqueueMemoryTask('profile refresh', async () => {
    // Checked inside the queue so it sees memories this reply's extraction just saved.
    if (!isProfileStale()) return;
    await generateMemoryProfile(context);
  });
}

export async function generateMemoryProfile(
  context: ProfileGenerationContext
): Promise<MemoryProfile | null> {
  const stats = getMemoryStats();
  const memories = getMemories().slice(0, PROFILE_MEMORY_LIMIT);
  const includeChats = isMemoryChatHistoryEnabledSync();
  const chats = includeChats ? getRecentChats({ limit: RECENT_CHAT_TOPICS }) : [];
  const userMessages = includeChats ? getRecentUserMessages(RECENT_USER_MESSAGES) : [];
  if (memories.length === 0 && userMessages.length === 0) return null;

  const previous = getMemoryProfileSync();
  const model = await pickFastModel(context.providerId, context.chatModel);
  const { text, usage } = await completeText({
    providerId: context.providerId,
    model,
    apiKey: context.apiKey,
    systemPrompt: PROFILE_SYSTEM_PROMPT,
    prompt: buildProfilePrompt(memories, chats, userMessages, previous?.content ?? null),
    timeoutMs: PROFILE_TIMEOUT_MS,
  });

  if (context.usageTarget && (usage.promptTokens > 0 || usage.completionTokens > 0)) {
    try {
      recordUsage(
        context.usageTarget.conversationId,
        context.usageTarget.messageId,
        model,
        usage.promptTokens,
        usage.completionTokens,
        calculateCost(usage.promptTokens, usage.completionTokens, model)
      );
    } catch {
      // The reply may have been deleted meanwhile.
    }
  }

  const content = cleanProfile(text);
  if (!content) throw new Error('The model returned an empty profile.');

  // The user may have edited the profile while this was generating.
  if (!context.force && getMemoryProfileSync()?.userEdited) return null;

  const profile: MemoryProfile = {
    content,
    generatedAt: Date.now(),
    userEdited: false,
    fingerprint: fingerprint(stats),
    model,
  };
  await useSettingsStore.getState().setMemoryProfile(profile);
  return profile;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function oneLine(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= maxChars ? collapsed : `${collapsed.slice(0, maxChars)}…`;
}

export function buildProfilePrompt(
  memories: Memory[],
  chats: RecentChat[],
  userMessages: { content: string; createdAt: number }[],
  previousProfile: string | null
): string {
  const sections = [`Today is ${formatDate(Date.now())}.`];

  sections.push(
    [
      'Saved memories:',
      ...(memories.length
        ? memories.map((memory) => `- [${formatDate(memory.updated_at)}] ${memory.content}`)
        : ['(none)']),
    ].join('\n')
  );

  if (chats.length > 0) {
    sections.push(
      ['Recent conversation titles:', ...chats.map((chat) => `- ${oneLine(chat.title, 80)} (${formatDate(chat.updatedAt)})`)].join('\n')
    );
  }

  if (userMessages.length > 0) {
    sections.push(
      [
        'Recent messages from the user, newest first:',
        ...userMessages.map((message) => `- ${oneLine(message.content, USER_MESSAGE_CHARS)}`),
      ].join('\n')
    );
  }

  if (previousProfile?.trim()) {
    sections.push(`Current profile (revise it; keep what is still true):\n${previousProfile.trim()}`);
  }

  return sections.join('\n\n');
}

/** Strip fences, drop anything credential-shaped, and cap the length at a line break. */
export function cleanProfile(text: string): string {
  const lines = text
    .replace(/```(?:markdown|md)?/gi, '')
    .split('\n')
    .filter((line) => !looksLikeCredential(line));
  let content = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (content.length > MAX_PROFILE_CHARS) {
    const cut = content.lastIndexOf('\n', MAX_PROFILE_CHARS);
    content = content.slice(0, cut > 0 ? cut : MAX_PROFILE_CHARS).trim();
  }
  return content;
}
