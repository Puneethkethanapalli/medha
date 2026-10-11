/**
 * Memory retrieval — lexical relevance ranking and near-duplicate detection.
 *
 * Saved memories number in the hundreds at most, so scoring them in JS with
 * BM25 is effectively free and needs no index to keep in sync.
 */

export interface RankableMemory {
  id: string;
  content: string;
  category: string;
  pinned: number;
  updated_at: number;
}

export interface MemorySelection<T extends RankableMemory> {
  selected: T[];
  omittedCount: number;
}

// Negations ("no", "not", "never") are deliberately kept: dropping them would
// make "User is not vegetarian" look like a duplicate of "User is vegetarian".
const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'him', 'his', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'just', 'like', 'me', 'my', 'of', 'on', 'or',
  'our', 'over', 'she', 'so', 'some', 'than', 'that', 'the', 'their', 'them',
  'then', 'there', 'they', 'this', 'to', 'too', 'up', 'us', 'user', 'users', 'very',
  'was', 'we', 'were', 'what', 'when', 'which', 'who', 'why', 'will', 'with',
  'would', 'you', 'your',
]);

// Split on whitespace and ASCII punctuation only, so non-Latin scripts stay intact.
const TOKEN_SPLIT = /[\s.,;:!?'"`()[\]{}<>/\\|@#$%^&*+=~_-]+/;
const PREFIX_MATCH_MIN = 4;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Exact match, or a crude stem match for longer words: the shared prefix must
 * cover all but the last letter of the shorter word. Matches "live" ~ "lives"
 * and "prefers" ~ "preference", but not "program" ~ "progress".
 */
function termsMatch(queryTerm: string, docTerm: string): boolean {
  if (queryTerm === docTerm) return true;
  const shorter = Math.min(queryTerm.length, docTerm.length);
  if (shorter < PREFIX_MATCH_MIN) return false;

  let shared = 0;
  while (shared < shorter && queryTerm[shared] === docTerm[shared]) shared++;
  return shared >= Math.max(PREFIX_MATCH_MIN, shorter - 1);
}

/** BM25 relevance of each document to the query, in document order. */
export function scoreDocuments(documents: string[], query: string): number[] {
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0 || documents.length === 0) return documents.map(() => 0);

  const docTokens = documents.map(tokenize);
  const avgLength =
    docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / docTokens.length || 1;

  const termFrequencies = docTokens.map((tokens) =>
    queryTerms.map((term) => tokens.filter((token) => termsMatch(term, token)).length)
  );

  const idf = queryTerms.map((_, termIndex) => {
    const docFrequency = termFrequencies.filter((tf) => tf[termIndex] > 0).length;
    return Math.log(1 + (documents.length - docFrequency + 0.5) / (docFrequency + 0.5));
  });

  return termFrequencies.map((frequencies, docIndex) => {
    const lengthNorm = 1 - BM25_B + BM25_B * (docTokens[docIndex].length / avgLength);
    return frequencies.reduce((score, tf, termIndex) => {
      if (tf === 0) return score;
      return score + idf[termIndex] * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * lengthNorm));
    }, 0);
  });
}

/**
 * Pick the memories to inject for a message, within a token budget.
 * Priority: pinned → relevant to the query → standing instructions and
 * preferences → most recently updated. Recency (not use count) breaks ties,
 * so new memories are never starved by old, frequently injected ones.
 */
export function selectMemories<T extends RankableMemory>(
  memories: T[],
  query: string,
  budgetTokens: number,
  costOf: (memory: T) => number
): MemorySelection<T> {
  const scores = scoreDocuments(memories.map((memory) => memory.content), query);
  const ranked = memories.map((memory, index) => ({ memory, score: scores[index] }));
  const byRecency = (a: { memory: T }, b: { memory: T }) => b.memory.updated_at - a.memory.updated_at;

  const tiers = [
    ranked.filter((entry) => entry.memory.pinned).sort(byRecency),
    ranked
      .filter((entry) => !entry.memory.pinned && entry.score > 0)
      .sort((a, b) => b.score - a.score || byRecency(a, b)),
    ranked
      .filter(
        (entry) =>
          !entry.memory.pinned &&
          entry.score === 0 &&
          (entry.memory.category === 'instruction' || entry.memory.category === 'preference')
      )
      .sort(byRecency),
    ranked
      .filter(
        (entry) =>
          !entry.memory.pinned &&
          entry.score === 0 &&
          entry.memory.category !== 'instruction' &&
          entry.memory.category !== 'preference'
      )
      .sort(byRecency),
  ];

  const selected: T[] = [];
  let remaining = budgetTokens;
  for (const tier of tiers) {
    for (const { memory } of tier) {
      const cost = costOf(memory);
      // Skip what doesn't fit but keep going — a shorter memory may still fit.
      if (cost > remaining && selected.length > 0) continue;
      selected.push(memory);
      remaining -= cost;
    }
  }

  return { selected, omittedCount: memories.length - selected.length };
}

export type DuplicateKind = 'duplicate' | 'refinement';

/**
 * Classify how a new memory relates to an existing one:
 * - 'duplicate': same fact (near-identical, or the new one adds nothing)
 * - 'refinement': the new one restates the old one with more detail
 */
export function classifyDuplicate(newContent: string, existingContent: string): DuplicateKind | null {
  const next = new Set(tokenize(newContent));
  const existing = new Set(tokenize(existingContent));
  if (next.size === 0 || existing.size === 0) return null;

  let shared = 0;
  for (const token of next) if (existing.has(token)) shared++;

  const union = next.size + existing.size - shared;
  if (shared / union >= 0.85) return 'duplicate';
  if (shared === next.size && existing.size >= 2) return 'duplicate';
  if (shared === existing.size && existing.size >= 2) return 'refinement';
  return null;
}
