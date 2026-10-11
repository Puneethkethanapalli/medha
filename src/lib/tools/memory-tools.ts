/**
 * Memory tools — Sprint 14
 *
 * Registered as tools so the AI can proactively save, update, and forget memories.
 * Uses the same tool architecture as web search (Sprint 12).
 */

import type { ToolDefinition, ToolExecutionContext, ToolResult } from './types';
import {
  getMemories,
  resolveMemoryId,
  restoreMemory,
  shortMemoryId,
  updateMemory,
  deleteMemory,
  type Memory,
} from '@/lib/db/memories';
import {
  normalizeMemoryCategory,
  rankMemoriesByRelevance,
  removeMemory,
  replaceMemory,
  saveMemory,
} from '@/lib/memory/operations';
import { useUIStore } from '@/stores/ui-store';

const FORGET_CANDIDATE_LIMIT = 5;

function formatRef(memory: Pick<Memory, 'id' | 'content'>): string {
  return `[${shortMemoryId(memory.id)}] ${memory.content}`;
}

function rejected(title: string, reason: string): ToolResult {
  return {
    content: reason,
    display: { kind: 'memory', title, status: 'error', summary: reason },
  };
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
  const outcome = saveMemory(args.content, normalizeMemoryCategory(args.category) ?? 'general', {
    source: 'assistant',
    conversationId: context.conversationId,
  });

  switch (outcome.kind) {
    case 'rejected':
      return rejected('Memory not saved', outcome.reason);

    case 'duplicate':
      return memoryResult(
        'Already remembered',
        outcome.memory,
        `Already saved as ${formatRef(outcome.memory)}. Nothing new was stored.`
      );

    case 'refined': {
      const { memory, previous } = outcome;
      useUIStore.getState().showToast('Memory updated', {
        label: 'Undo',
        onPress: () => updateMemory(previous.id, { content: previous.content, category: previous.category }),
      });
      return memoryResult(
        'Memory updated',
        memory,
        `Updated existing memory [${shortMemoryId(memory.id)}] from "${previous.content}" to "${memory.content}".`
      );
    }

    case 'added': {
      const { memory, related } = outcome;
      useUIStore.getState().showToast('Memory saved', {
        label: 'Undo',
        onPress: () => deleteMemory(memory.id),
      });
      const lines = [`Saved memory [${shortMemoryId(memory.id)}]: "${memory.content}"`];
      if (related.length > 0) {
        lines.push(
          'Related existing memories — if the new one replaces or contradicts any of these, call update_memory or forget_memory with that id:',
          ...related.map((item) => `- ${formatRef(item)}`)
        );
      }
      return memoryResult('Memory saved', memory, lines.join('\n'));
    }
  }
}

async function executeUpdateMemory(args: Record<string, unknown>): Promise<ToolResult> {
  const memory = resolveMemoryId(String(args.id ?? ''));
  if (!memory) {
    return rejected(
      'Memory not updated',
      `No memory found with id "${String(args.id ?? '')}". Use an id exactly as shown in [User Memory].`
    );
  }

  const outcome = replaceMemory(memory, args.content, normalizeMemoryCategory(args.category));
  if (outcome.kind === 'rejected') return rejected('Memory not updated', outcome.reason);

  const { memory: updated, previous } = outcome;
  useUIStore.getState().showToast('Memory updated', {
    label: 'Undo',
    onPress: () => updateMemory(previous.id, { content: previous.content, category: previous.category }),
  });

  return memoryResult(
    'Memory updated',
    updated,
    `Updated memory [${shortMemoryId(updated.id)}] from "${previous.content}" to "${updated.content}".`
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
    const matches = rankMemoriesByRelevance(getMemories(), query).slice(0, FORGET_CANDIDATE_LIMIT);
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
  removeMemory(removed);
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
