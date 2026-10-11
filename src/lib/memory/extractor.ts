/**
 * Background memory extraction.
 *
 * After a reply finishes, a fast model reviews the latest exchange against the
 * saved memories and proposes add / update / delete operations. This captures
 * durable facts without relying on the chat model to call a tool mid-reply,
 * so it works with every model and never slows the reply down.
 */

import { getMemories, type Memory } from '@/lib/db/memories';
import { addMemoryEvent, type MemoryEvent } from '@/lib/db/memory-events';
import { recordUsage } from '@/lib/db/token-usage';
import { completeText } from '@/lib/llm/complete';
import { getCachedModelList } from '@/lib/models/model-list-cache';
import {
  normalizeMemoryCategory,
  normalizeMemoryContent,
  rankMemoriesByRelevance,
  removeMemory,
  replaceMemory,
  saveMemory,
} from '@/lib/memory/operations';
import { tokenize } from '@/lib/memory/retrieval';
import { isMemoryAutoEnabledSync, isMemoryEnabledSync } from '@/lib/storage/mmkv';
import { calculateCost } from '@/lib/tokens/pricing';
import { useMemoryEventsStore } from '@/stores/memory-events-store';

const MAX_USER_CHARS = 3000;
const MAX_ASSISTANT_CHARS = 1500;
const MAX_OPERATIONS = 3;
const SHOW_ALL_MEMORIES_UP_TO = 40;
const RELEVANT_MEMORIES = 25;
const RECENT_MEMORIES = 5;
const EXTRACTION_TIMEOUT_MS = 30 * 1000;

/** Replies to these alone never contain anything worth remembering. */
const TRIVIAL_TOKENS = new Set([
  'ok', 'okay', 'thanks', 'thank', 'thx', 'ty', 'yes', 'yeah', 'yep', 'nope', 'sure',
  'cool', 'great', 'nice', 'good', 'perfect', 'awesome', 'hi', 'hello', 'hey', 'bye',
  'continue', 'go', 'more', 'again',
]);

/**
 * Background deletes need the user to have said something like this, so a
 * model can't silently drop memories on its own judgement.
 */
const FORGET_CUES =
  /\b(forget|remove|delete|erase|no longer|not anymore|isn'?t true|is not true|not true anymore|wrong|incorrect|stop remembering)\b/i;

/**
 * Fast, cheap models tried first for each provider. A candidate is only used
 * when it appears in the provider's cached model list; otherwise the chat
 * model is used, which is guaranteed to work with the user's key.
 */
const FAST_MODEL_CANDIDATES: Record<string, string[]> = {
  openrouter: [
    'google/gemini-2.5-flash-lite',
    'openai/gpt-4.1-mini',
    'google/gemini-2.5-flash',
    'openai/gpt-4o-mini',
    'anthropic/claude-haiku-4.5',
  ],
  openai: ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
  'openai-codex': ['gpt-5.4-mini', 'gpt-5.1-codex-mini'],
  anthropic: ['claude-haiku-5-5', 'claude-haiku-4-5', 'claude-3-5-haiku-latest'],
  'google-ai': ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

const EXTRACTION_SYSTEM_PROMPT = `You maintain long-term memory about the user for an AI assistant. You see the user's saved memories and their latest exchange with the assistant, and decide whether the memories should change.

Save only durable information about the user that will help in future, unrelated conversations:
- identity and background: name, occupation, location, languages, family, pets
- ongoing projects and goals, and the tools or tech stack they use
- stable preferences and standing instructions for how the assistant should respond

Do NOT save:
- facts about the conversation topic rather than about the user (e.g. something the assistant explained)
- one-off requests, temporary states, or details that only matter for the current task
- things the assistant said that the user did not state or confirm
- passwords, keys, account numbers, or other secrets
- health, religion, politics, sexuality, or finances unless the user explicitly asked you to remember them
- anything an existing memory already covers

Operations:
- add: a new memory, written as one short third-person sentence starting with "User" (e.g. "User is vegetarian."). Turn relative dates into absolute ones using today's date.
- update: the exchange changes or corrects an existing memory. Give its id and the full corrected sentence.
- delete: only when the user explicitly asks to forget something or says a memory is no longer true. Give its id.

Most exchanges need no changes. Respond with JSON only, no other text:
{"operations": [{"op": "add", "content": "...", "category": "fact|preference|instruction|general"}, {"op": "update", "id": "...", "content": "..."}, {"op": "delete", "id": "..."}]}
Respond {"operations": []} when nothing should change.`;

export interface MemoryExtractionRequest {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  userText: string;
  assistantText: string;
  providerId: string;
  apiKey: string;
  chatModel: string;
}

interface RawOperation {
  op?: unknown;
  id?: unknown;
  content?: unknown;
  category?: unknown;
}

let queue: Promise<void> = Promise.resolve();
const processedUserMessages = new Set<string>();

/**
 * Queue extraction for a finished reply. Fire-and-forget: runs one at a time
 * in the background and never throws.
 */
export function scheduleMemoryExtraction(request: MemoryExtractionRequest): void {
  if (!isMemoryEnabledSync() || !isMemoryAutoEnabledSync()) return;
  // Regenerating a reply re-sends the same user message; it was already reviewed.
  if (processedUserMessages.has(request.userMessageId)) return;
  if (!isWorthExtracting(request.userText)) return;

  processedUserMessages.add(request.userMessageId);
  queue = queue
    .then(() => runExtraction(request))
    .catch((error) => {
      if (__DEV__) console.warn('[memory] extraction failed:', error);
    });
}

export function isWorthExtracting(userText: string): boolean {
  return tokenize(userText).some((token) => !TRIVIAL_TOKENS.has(token));
}

async function runExtraction(request: MemoryExtractionRequest): Promise<void> {
  const memories = getMemories();
  const shown = pickMemoriesForPrompt(memories, `${request.userText}\n${request.assistantText}`);
  const model = await pickExtractionModel(request.providerId, request.chatModel);

  const { text, usage } = await completeText({
    providerId: request.providerId,
    model,
    apiKey: request.apiKey,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    prompt: buildPrompt(shown, request),
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  });

  if (usage.promptTokens > 0 || usage.completionTokens > 0) {
    try {
      recordUsage(
        request.conversationId,
        request.assistantMessageId,
        model,
        usage.promptTokens,
        usage.completionTokens,
        calculateCost(usage.promptTokens, usage.completionTokens, model)
      );
    } catch {
      // The message or conversation may have been deleted meanwhile.
    }
  }

  // Settings may have changed while the request was in flight.
  if (!isMemoryEnabledSync() || !isMemoryAutoEnabledSync()) return;

  const operations = parseOperations(text);
  if (!operations || operations.length === 0) return;

  const events = applyOperations(operations, shown, request);
  useMemoryEventsStore.getState().addEvents(events);
}

/** Small memory sets are shown whole; large ones are narrowed to what's relevant. */
export function pickMemoriesForPrompt(memories: Memory[], exchange: string): Memory[] {
  if (memories.length <= SHOW_ALL_MEMORIES_UP_TO) return memories;

  const picked = new Map<string, Memory>();
  for (const { memory } of rankMemoriesByRelevance(memories, exchange).slice(0, RELEVANT_MEMORIES)) {
    picked.set(memory.id, memory);
  }
  for (const memory of [...memories]
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, RECENT_MEMORIES)) {
    picked.set(memory.id, memory);
  }
  return Array.from(picked.values());
}

async function pickExtractionModel(providerId: string, chatModel: string): Promise<string> {
  const candidates = FAST_MODEL_CANDIDATES[providerId];
  if (!candidates) return chatModel;

  try {
    const cached = await getCachedModelList(providerId);
    const available = new Set((cached?.models ?? []).map((model) => model.id));
    return candidates.find((candidate) => available.has(candidate)) ?? chatModel;
  } catch {
    return chatModel;
  }
}

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}…`;
}

export function buildPrompt(shown: Memory[], request: Pick<MemoryExtractionRequest, 'userText' | 'assistantText'>): string {
  const memoryLines = shown.length
    ? shown.map((memory) => `- [${memory.id.slice(0, 8)}${memory.pinned ? ', pinned' : ''}] ${memory.content}`)
    : ['(none)'];

  return [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'Saved memories:',
    ...memoryLines,
    '',
    'Latest exchange:',
    `User: ${truncate(request.userText, MAX_USER_CHARS)}`,
    `Assistant: ${truncate(request.assistantText, MAX_ASSISTANT_CHARS)}`,
  ].join('\n');
}

/** Pull the operations array out of a model reply, tolerating code fences and stray prose. */
export function parseOperations(text: string): RawOperation[] | null {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { operations?: unknown };
    return Array.isArray(parsed.operations)
      ? parsed.operations.filter(
          (op): op is RawOperation => typeof op === 'object' && op !== null && !Array.isArray(op)
        )
      : null;
  } catch {
    return null;
  }
}

/**
 * Apply proposed operations with guardrails: only memories shown to the model
 * can be changed, pinned memories are never touched, deletes need an explicit
 * cue from the user, and adds go through the same validation and dedupe as the tools.
 */
export function applyOperations(
  operations: RawOperation[],
  shown: Memory[],
  request: Pick<MemoryExtractionRequest, 'conversationId' | 'assistantMessageId' | 'userText'>
): MemoryEvent[] {
  const events: MemoryEvent[] = [];
  const record = (event: Omit<MemoryEvent, 'id' | 'undone_at' | 'created_at' | 'conversation_id' | 'message_id'>) => {
    try {
      events.push(
        addMemoryEvent({
          ...event,
          conversation_id: request.conversationId,
          message_id: request.assistantMessageId,
        })
      );
    } catch {
      // The message was deleted meanwhile; the memory change itself still stands.
    }
  };

  const resolveShown = (id: unknown): Memory | null => {
    const cleaned = String(id ?? '').toLowerCase().replace(/[^0-9a-f-]/g, '');
    if (cleaned.length < 4) return null;
    const matches = shown.filter((memory) => memory.id.startsWith(cleaned));
    return matches.length === 1 ? matches[0] : null;
  };

  for (const operation of operations.slice(0, MAX_OPERATIONS)) {
    const op = String(operation.op ?? '').toLowerCase();

    if (op === 'add') {
      const outcome = saveMemory(operation.content, normalizeMemoryCategory(operation.category) ?? 'general', {
        source: 'auto',
        conversationId: request.conversationId,
        relatedLimit: 0,
      });
      if (outcome.kind === 'added') {
        record({ op: 'add', memory_id: outcome.memory.id, before: null, after_content: outcome.memory.content });
      } else if (outcome.kind === 'refined') {
        record({
          op: 'update',
          memory_id: outcome.memory.id,
          before: outcome.previous,
          after_content: outcome.memory.content,
        });
      }
    } else if (op === 'update') {
      const target = resolveShown(operation.id);
      if (!target || target.pinned) continue;
      if (normalizeMemoryContent(operation.content) === target.content) continue;

      const outcome = replaceMemory(target, operation.content, normalizeMemoryCategory(operation.category));
      if (outcome.kind === 'updated') {
        record({
          op: 'update',
          memory_id: target.id,
          before: outcome.previous,
          after_content: outcome.memory.content,
        });
      }
    } else if (op === 'delete') {
      if (!FORGET_CUES.test(request.userText)) continue;
      const target = resolveShown(operation.id);
      if (!target || target.pinned) continue;

      removeMemory(target);
      record({ op: 'delete', memory_id: target.id, before: target, after_content: null });
    }
  }

  return events;
}
