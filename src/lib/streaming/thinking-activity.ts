export const DEFAULT_THINKING_ACTIVITY = 'Understanding request';
export const WRITING_RESPONSE_ACTIVITY = 'Writing response';

const RECENT_REASONING_WINDOW = 900;

export function deriveThinkingActivity(reasoning: string): string {
  const text = reasoning
    .slice(-RECENT_REASONING_WINDOW)
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (!text.trim()) return DEFAULT_THINKING_ACTIVITY;

  if (hasAny(text, ['search', 'source', 'citation', 'reference', 'web'])) {
    return 'Checking sources';
  }

  if (hasAny(text, ['tool', 'function call', 'execute'])) {
    return 'Preparing a tool call';
  }

  if (hasAny(text, ['image', 'draw', 'generate', 'visual'])) {
    return 'Preparing visual output';
  }

  if (hasAny(text, ['memory', 'remember', 'preference', 'forget'])) {
    return 'Updating memory';
  }

  if (hasAny(text, ['code', 'file', 'component', 'implementation', 'bug'])) {
    return 'Inspecting context';
  }

  if (hasAny(text, ['compare', 'option', 'tradeoff', 'approach'])) {
    return 'Comparing approaches';
  }

  if (hasAny(text, ['calculate', 'math', 'number', 'estimate'])) {
    return 'Checking the math';
  }

  if (hasAny(text, ['draft', 'answer', 'respond', 'final'])) {
    return WRITING_RESPONSE_ACTIVITY;
  }

  return 'Working through request';
}

export function describeToolActivity(toolNames: string[]): string {
  const names = toolNames.map((name) => name.toLowerCase());

  if (names.some((name) => name.includes('search') || name.includes('research'))) {
    return 'Checking sources';
  }

  if (names.some((name) => name.includes('image'))) {
    return 'Preparing image generation';
  }

  if (names.some((name) => name.includes('memory') || name.includes('forget'))) {
    return 'Updating memory';
  }

  return names.length > 1 ? 'Preparing tool calls' : 'Preparing a tool call';
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
