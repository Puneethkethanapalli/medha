/**
 * Memory tools — Sprint 14
 *
 * Registered as tools so the AI can proactively save, update, and forget memories.
 * Uses the same tool architecture as web search (Sprint 12).
 */

import type { ToolDefinition, ToolExecutionContext, ToolResult } from './types';
import {
  addMemory,
  deleteMemory,
  getMemories,
  resolveMemoryId,
  restoreMemory,
  shortMemoryId,
  updateMemory,
  type Memory,
  type MemoryCategory,
} from '@/lib/db/memories';
import { classifyDuplicate, scoreDocuments } from '@/lib/memory/retrieval';
import { useUIStore } from '@/stores/ui-store';

const VALID_CATEGORIES: MemoryCategory[] = ['preference', 'fact', 'instruction', 'general'];
const MAX_MEMORY_CHARS = 500;
const RELATED_LIMIT = 3;
const FORGET_CANDIDATE_LIMIT = 5;

// Never persist secrets, even if a model tries to.
const CREDENTIAL_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:password|passcode|passphrase|pin|otp|cvv)\b\s*(?:is|:|=)\s*\S+/i,
  /\b(?:\d[ -]?){13,19}\b/,
];

function looksLikeCredential(text: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeContent(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeCategory(value: unknown): MemoryCategory | undefined {
  const category = String(value ?? '');
  return VALID_CATEGORIES.includes(category as MemoryCategory)
    ? (category as MemoryCategory)
    : undefined;
}

function formatRef(memory: Pick<Memory, 'id' | 'content'>): string {
  return `[${shortMemoryId(memory.id)}] ${memory.content}`;
}

function rankByRelevance(memories: Memory[], query: string): { memory: Memory; score: number }[] {
  const scores = scoreDocuments(memories.map((memory) => memory.content), query);
  return memories
    .map((memory, index) => ({ memory, score: scores[index] }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

function rejected(title: string, reason: string): ToolResult {
  return {
    content: reason,
    display: { kind: 'memory', title, status: 'error', summary: reason },
  };
}

function validateContent(content: string): ToolResult | null {
  if (!content) return rejected('Memory not saved', 'No memory content provided.');
  if (content.length > MAX_MEMORY_CHARS) {
    return rejected(
      'Memory not saved',
      `Memory is too long (${content.length} characters). Keep it to one short sentence.`
    );
  }
  if (looksLikeCredential(content)) {
    return rejected(
      'Memory not saved',
      'Not saved: this looks like a password, API key, or card number. Credentials are never stored in memory.'
    );
  }
  return null;
}

function memoryResult(
  title: string,
  memory: Pick<Memory, 'id' | 'content' | 'category'>,
  modelMessage: string
): ToolResult {
  return {
    content: modelMessage,
    display: {
      kind: 'memory',
      title,
      subtitle: memory.category,
      status: 'success',
      summary: memory.content,
      metadata: [{ label: 'ID', value: shortMemoryId(memory.id) }],
    },
  };
}

async function executeSaveMemory(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const content = normalizeContent(args.content);
  const invalid = validateContent(content);
  if (invalid) return invalid;

  const category = normalizeCategory(args.category) ?? 'general';
  const existing = getMemories();

  // Same fact already saved — don't create a duplicate.
  const duplicate = existing.find((memory) => classifyDuplicate(content, memory.content) === 'duplicate');
  if (duplicate) {
    return memoryResult(
      'Already remembered',
      duplicate,
      `Already saved as ${formatRef(duplicate)}. Nothing new was stored.`
    );
  }

  // Same fact with more detail — replace the old wording instead of adding another.
  const refined = existing.find((memory) => classifyDuplicate(content, memory.content) === 'refinement');
  if (refined) {
    const nextCategory = category !== 'general' ? category : refined.category;
    updateMemory(refined.id, { content, category: nextCategory });
    useUIStore.getState().showToast('Memory updated', {
      label: 'Undo',
      onPress: () => updateMemory(refined.id, { content: refined.content, category: refined.category }),
    });
    return memoryResult(
      'Memory updated',
      { id: refined.id, content, category: nextCategory },
      `Updated existing memory [${shortMemoryId(refined.id)}] from "${refined.content}" to "${content}".`
    );
  }

  const id = addMemory(content, category, {
    source: 'assistant',
    conversationId: context.conversationId,
  });
  useUIStore.getState().showToast('Memory saved', {
    label: 'Undo',
    onPress: () => deleteMemory(id),
  });

  const related = rankByRelevance(existing, content).slice(0, RELATED_LIMIT);
  const lines = [`Saved memory [${shortMemoryId(id)}]: "${content}"`];
  if (related.length > 0) {
    lines.push(
      'Related existing memories — if the new one replaces or contradicts any of these, call update_memory or forget_memory with that id:',
      ...related.map(({ memory }) => `- ${formatRef(memory)}`)
    );
  }

  return memoryResult('Memory saved', { id, content, category }, lines.join('\n'));
}

async function executeUpdateMemory(args: Record<string, unknown>): Promise<ToolResult> {
  const memory = resolveMemoryId(String(args.id ?? ''));
  if (!memory) {
    return rejected(
      'Memory not updated',
      `No memory found with id "${String(args.id ?? '')}". Use an id exactly as shown in [User Memory].`
    );
  }

  const content = normalizeContent(args.content);
  const invalid = validateContent(content);
  if (invalid) return { ...invalid, display: { ...invalid.display!, title: 'Memory not updated' } };

  const category = normalizeCategory(args.category) ?? memory.category;
  updateMemory(memory.id, { content, category });
  useUIStore.getState().showToast('Memory updated', {
    label: 'Undo',
    onPress: () => updateMemory(memory.id, { content: memory.content, category: memory.category }),
  });

  return memoryResult(
    'Memory updated',
    { id: memory.id, content, category },
    `Updated memory [${shortMemoryId(memory.id)}] from "${memory.content}" to "${content}".`
  );
}

async function executeForgetMemory(args: Record<string, unknown>): Promise<ToolResult> {
  const id = String(args.id ?? '').trim();
  const query = String(args.query ?? '').trim();

  let target: Memory | null = null;
  if (id) {
    target = resolveMemoryId(id);
    if (!target) {
      return rejected(
        'Memory not removed',
        `No memory found with id "${id}". Use an id exactly as shown in [User Memory].`
      );
    }
  } else if (query) {
    const matches = rankByRelevance(getMemories(), query).slice(0, FORGET_CANDIDATE_LIMIT);
    if (matches.length === 0) {
      return rejected('Memory not removed', `No saved memory matches "${query}".`);
    }

    // Only delete by description when one memory is clearly the best match.
    const [best, runnerUp] = matches;
    if (runnerUp && best.score < runnerUp.score * 2) {
      return {
        content: [
          `Several memories match "${query}". Nothing was removed. Call forget_memory again with the id of the one the user means:`,
          ...matches.map(({ memory }) => `- ${formatRef(memory)}`),
        ].join('\n'),
        display: {
          kind: 'memory',
          title: 'Which memory?',
          status: 'success',
          summary: matches.map(({ memory }) => memory.content).join('\n'),
        },
      };
    }
    target = best.memory;
  } else {
    return rejected('Memory not removed', 'Provide the id of the memory to forget.');
  }

  const removed = target;
  deleteMemory(removed.id);
  useUIStore.getState().showToast('Memory removed', {
    label: 'Undo',
    onPress: () => restoreMemory(removed),
  });

  return memoryResult('Memory removed', removed, `Forgot memory ${formatRef(removed)}.`);
}

/**
 * save_memory tool — AI saves a user preference, fact, or instruction.
 */
export const saveMemoryTool: ToolDefinition = {
  name: 'save_memory',
  description:
    'Save a durable user fact, preference, or standing instruction for future conversations (e.g. "User\'s name is Alex", "User prefers TypeScript"). Duplicates are merged automatically. The result lists related existing memories so you can update or forget any the new one replaces.',
  parameters: {
    content: {
      type: 'string',
      description: 'One short third-person sentence stating the fact, preference, or instruction.',
      required: true,
    },
    category: {
      type: 'string',
      description: "Category of the memory: 'preference' (user likes/dislikes), 'fact' (objective info about user), 'instruction' (how user wants responses), or 'general' (default).",
      required: false,
      enum: ['preference', 'fact', 'instruction', 'general'],
    },
  },
  execute: executeSaveMemory,
};

/**
 * update_memory tool — AI corrects or replaces an existing memory.
 */
export const updateMemoryTool: ToolDefinition = {
  name: 'update_memory',
  description:
    'Replace the content of an existing memory when information changes (e.g. the user moved cities or changed jobs). Use the id shown in [User Memory] or returned by save_memory.',
  parameters: {
    id: {
      type: 'string',
      description: 'The memory id, e.g. "a1b2c3d4".',
      required: true,
    },
    content: {
      type: 'string',
      description: 'The corrected memory as one short third-person sentence.',
      required: true,
    },
    category: {
      type: 'string',
      description: 'Optional new category.',
      required: false,
      enum: ['preference', 'fact', 'instruction', 'general'],
    },
  },
  execute: executeUpdateMemory,
};

/**
 * forget_memory tool — AI removes a previously saved memory.
 */
export const forgetMemoryTool: ToolDefinition = {
  name: 'forget_memory',
  description:
    "Remove a saved memory when the user asks you to forget something. Prefer passing the memory's id from [User Memory]. If you only have a description, pass query instead; if several memories match, nothing is removed and the candidates are returned with their ids.",
  parameters: {
    id: {
      type: 'string',
      description: 'The id of the memory to remove, e.g. "a1b2c3d4".',
      required: false,
    },
    query: {
      type: 'string',
      description: 'Keywords describing the memory, used only when the id is unknown.',
      required: false,
    },
  },
  execute: executeForgetMemory,
};
