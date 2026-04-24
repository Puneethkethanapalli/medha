/**
 * Memory tools — Sprint 14
 *
 * Registered as tools so the AI can proactively save and forget memories.
 * Uses the same tool architecture as web search (Sprint 12).
 */

import type { ToolDefinition, ToolResult } from './types';
import { addMemory, deleteMemory, searchMemories } from '@/lib/db/memories';
import { useUIStore } from '@/stores/ui-store';

async function executeSaveMemory(args: Record<string, unknown>): Promise<ToolResult> {
  const content = String(args.content || '').trim();
  if (!content) {
    return { content: 'No memory content provided.' };
  }

  const category = String(args.category || 'general');
  const validCategories = ['preference', 'fact', 'instruction', 'general'];
  const normalizedCategory = validCategories.includes(category) ? category : 'general';

  const id = addMemory(content, normalizedCategory as any);
  useUIStore.getState().showToast('Memory saved');

  return {
    content: `Memory saved (ID: ${id.slice(0, 8)}): "${content}"`,
    raw: { id, content, category: normalizedCategory },
  };
}

async function executeForgetMemory(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query || '').trim();
  if (!query) {
    return { content: 'No query provided for which memory to forget.' };
  }

  const matches = searchMemories(query);
  if (matches.length === 0) {
    return { content: `No memories found matching "${query}".` };
  }

  // Delete the best match (first result: pinned + hit_count sorted)
  const best = matches[0];
  deleteMemory(best.id);
  useUIStore.getState().showToast('Memory removed');

  return {
    content: `Forgot memory: "${best.content}"`,
    raw: { deletedId: best.id, content: best.content },
  };
}

/**
 * save_memory tool — AI saves a user preference, fact, or instruction.
 */
export const saveMemoryTool: ToolDefinition = {
  name: 'save_memory',
  description:
    'Save a user fact, preference, or instruction for future conversations. Use this when the user shares something personal (e.g., "I like dark mode", "My name is Alex", "Always use TypeScript") that should be remembered across chats.',
  parameters: {
    content: {
      type: 'string',
      description: 'The exact fact, preference, or instruction to remember. Keep it concise and factual.',
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
 * forget_memory tool — AI removes a previously saved memory.
 */
export const forgetMemoryTool: ToolDefinition = {
  name: 'forget_memory',
  description:
    "Remove a previously saved memory. Use this when the user asks you to forget something (e.g., 'forget my name', 'remove that preference'). Finds the best matching memory and deletes it.",
  parameters: {
    query: {
      type: 'string',
      description: 'A search query describing the memory to delete. Should be a keyword or phrase from the memory.',
      required: true,
    },
  },
  execute: executeForgetMemory,
};
