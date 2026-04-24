/**
 * Memory injection module — Sprint 14
 *
 * Builds a memory context string from stored memories that is injected into the system prompt.
 * Memories are ranked by usage (hit_count) and user preference (pinned).
 */

import { getMemories, getPinnedMemories, incrementHitCount, type Memory } from '@/lib/db/memories';

/** Rough token estimate: ~4 chars per English token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Max tokens to inject (kept conservative to preserve context window) */
const MAX_MEMORY_TOKENS = 500;

/**
 * Build a memory context block from the most relevant stored memories.
 * Pinned memories are always included. Then ranked by hit_count.
 * Returns empty string if no memories or memory is disabled.
 */
export function buildMemoryContext(): string {
  const pinned = getPinnedMemories();
  const all = getMemories();

  // Build ordered list: pinned first, then by hit count
  const ordered: Memory[] = [];
  const seen = new Set<string>();

  for (const m of pinned) {
    if (!seen.has(m.id)) {
      ordered.push(m);
      seen.add(m.id);
    }
  }

  for (const m of all) {
    if (!seen.has(m.id)) {
      ordered.push(m);
      seen.add(m.id);
    }
  }

  if (ordered.length === 0) return '';

  // Accumulate until we hit token budget
  const selected: Memory[] = [];
  let tokenBudget = MAX_MEMORY_TOKENS;

  for (const memory of ordered) {
    const memTokens = estimateTokens(memory.content);
    if (memTokens > tokenBudget && selected.length > 0) {
      break; // Don't skip if we haven't included any
    }
    selected.push(memory);
    tokenBudget -= memTokens;
    // Increment hit count for each used memory
    incrementHitCount(memory.id);
  }

  if (selected.length === 0) return '';

  const lines = selected.map((m) => `- ${m.content}`);
  return `[User Memory]\n${lines.join('\n')}\n[/User Memory]`;
}

/**
 * Quick check: does the user have any memories stored?
 */
export function hasMemories(): boolean {
  const all = getMemories(1);
  return all.length > 0;
}
