/**
 * Helpers for presenting model reasoning: section titles for the live
 * header, lightweight block parsing, duration labels, and the live tail.
 */

export interface ReasoningBlock {
  heading?: string;
  body?: string;
}

const MAX_TITLE_CHARS = 64;
const TITLE_SEARCH_WINDOW = 4000;

/** "**Title**", "**Title:**" or "## Title" on a line of its own. */
const HEADING_LINE = /^\s*(?:#{1,6}\s+(.+?)|\*\*([^*\n]+?)\*\*)\s*:?\s*$/;

function headingFromLine(line: string): string | null {
  const match = HEADING_LINE.exec(line);
  const heading = (match?.[1] ?? match?.[2])?.replace(/[*_#`]/g, '').replace(/:$/, '').trim();
  return heading ? heading : null;
}

/** Remove inline emphasis/code markers but keep their text. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1');
}

/**
 * The latest section title in the reasoning, used as the live header label
 * (models like o-series, Gemini and Claude summarize with bold headings).
 */
export function extractReasoningTitle(reasoning: string): string | null {
  const lines = reasoning.slice(-TITLE_SEARCH_WINDOW).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const heading = headingFromLine(lines[i]);
    if (heading && heading.length <= MAX_TITLE_CHARS) return heading;
  }
  return null;
}

/** Split reasoning into paragraphs, lifting a leading heading line out of each. */
export function parseReasoningBlocks(text: string): ReasoningBlock[] {
  const blocks: ReasoningBlock[] = [];

  for (const raw of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const chunk = raw.trim();
    if (!chunk) continue;

    const newline = chunk.indexOf('\n');
    const firstLine = newline === -1 ? chunk : chunk.slice(0, newline);
    const heading = headingFromLine(firstLine);
    const rest = heading ? (newline === -1 ? '' : chunk.slice(newline + 1)) : chunk;
    const body = stripInlineMarkdown(rest).trim();

    blocks.push({
      ...(heading ? { heading } : {}),
      ...(body ? { body } : {}),
    });
  }

  return blocks;
}

/** "Thought for 12s" style label, or a neutral fallback when timing is unknown. */
export function formatThoughtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return 'Thoughts';
  if (ms < 1500) return 'Thought for a moment';

  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `Thought for ${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `Thought for ${minutes}m ${seconds}s` : `Thought for ${minutes}m`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

/**
 * The end of the reasoning for the live viewport. Only the bottom is visible
 * there, so older text is dropped to keep layout cheap; the cut lands on a
 * line or word boundary so the visible text never shifts mid-word.
 */
export function liveReasoningTail(reasoning: string, maxChars: number): string {
  if (reasoning.length <= maxChars) return reasoning;

  const tail = reasoning.slice(-maxChars);
  const lineBreak = tail.indexOf('\n');
  if (lineBreak !== -1 && lineBreak < maxChars / 3) return tail.slice(lineBreak + 1);

  const space = tail.indexOf(' ');
  return space !== -1 && space < 40 ? tail.slice(space + 1) : tail;
}
