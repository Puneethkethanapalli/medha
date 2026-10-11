export const DEFAULT_THINKING_ACTIVITY = 'Understanding request';
export const WRITING_RESPONSE_ACTIVITY = 'Writing response';

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
