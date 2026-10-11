/**
 * Memory write operations shared by the memory tools and background extraction,
 * so both paths get the same validation, credential filtering, and dedupe.
 */

import {
  addMemory,
  deleteMemory,
  getMemories,
  getMemoryById,
  updateMemory,
  type Memory,
  type MemoryCategory,
  type MemorySource,
} from '@/lib/db/memories';
import { classifyDuplicate, scoreDocuments } from '@/lib/memory/retrieval';

export const MEMORY_CATEGORIES: MemoryCategory[] = ['preference', 'fact', 'instruction', 'general'];
const MAX_MEMORY_CHARS = 500;

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

export function looksLikeCredential(text: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text));
}

export function normalizeMemoryContent(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeMemoryCategory(value: unknown): MemoryCategory | undefined {
  const category = String(value ?? '');
  return MEMORY_CATEGORIES.includes(category as MemoryCategory)
    ? (category as MemoryCategory)
    : undefined;
}

/** Returns why the content can't be stored, or null if it's fine. */
export function validateMemoryContent(content: string): string | null {
  if (!content) return 'No memory content provided.';
  if (content.length > MAX_MEMORY_CHARS) {
    return `Memory is too long (${content.length} characters). Keep it to one short sentence.`;
  }
  if (looksLikeCredential(content)) {
    return 'Not saved: this looks like a password, API key, or card number. Credentials are never stored in memory.';
  }
  return null;
}

export function rankMemoriesByRelevance(
  memories: Memory[],
  query: string
): { memory: Memory; score: number }[] {
  const scores = scoreDocuments(memories.map((memory) => memory.content), query);
  return memories
    .map((memory, index) => ({ memory, score: scores[index] }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type SaveMemoryOutcome =
  | { kind: 'rejected'; reason: string }
  | { kind: 'duplicate'; memory: Memory }
  | { kind: 'refined'; memory: Memory; previous: Memory }
  | { kind: 'added'; memory: Memory; related: Memory[] };

/**
 * Save a memory unless it's invalid or already known. A restatement with more
 * detail replaces the existing memory instead of adding another.
 */
export function saveMemory(
  rawContent: unknown,
  category: MemoryCategory,
  options: { source: MemorySource; conversationId?: string | null; relatedLimit?: number }
): SaveMemoryOutcome {
  const content = normalizeMemoryContent(rawContent);
  const invalid = validateMemoryContent(content);
  if (invalid) return { kind: 'rejected', reason: invalid };

  const existing = getMemories();

  const duplicate = existing.find((memory) => classifyDuplicate(content, memory.content) === 'duplicate');
  if (duplicate) return { kind: 'duplicate', memory: duplicate };

  const refined = existing.find((memory) => classifyDuplicate(content, memory.content) === 'refinement');
  if (refined) {
    const nextCategory = category !== 'general' ? category : refined.category;
    updateMemory(refined.id, { content, category: nextCategory });
    return {
      kind: 'refined',
      memory: getMemoryById(refined.id) ?? { ...refined, content, category: nextCategory },
      previous: refined,
    };
  }

  const id = addMemory(content, category, {
    source: options.source,
    conversationId: options.conversationId,
  });
  const memory = getMemoryById(id)!;
  const related = rankMemoriesByRelevance(existing, content)
    .slice(0, options.relatedLimit ?? 3)
    .map((entry) => entry.memory);
  return { kind: 'added', memory, related };
}

export type ReplaceMemoryOutcome =
  | { kind: 'rejected'; reason: string }
  | { kind: 'updated'; memory: Memory; previous: Memory };

export function replaceMemory(
  memory: Memory,
  rawContent: unknown,
  category?: MemoryCategory
): ReplaceMemoryOutcome {
  const content = normalizeMemoryContent(rawContent);
  const invalid = validateMemoryContent(content);
  if (invalid) return { kind: 'rejected', reason: invalid };

  const nextCategory = category ?? memory.category;
  updateMemory(memory.id, { content, category: nextCategory });
  return {
    kind: 'updated',
    memory: getMemoryById(memory.id) ?? { ...memory, content, category: nextCategory },
    previous: memory,
  };
}

export function removeMemory(memory: Memory): void {
  deleteMemory(memory.id);
}
