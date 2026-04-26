import type { Message } from '@/types';

/**
 * Heuristic token estimator.
 *
 * Full tokenizers (tiktoken WASM) are 4MB+ and break React Native.
 * This uses a character-to-token ratio averaged across GPT/Claude/Gemini:
 *   ~4 chars/token (GPT) and ~3.5 chars/token (Claude/Gemini) → ~3.75 average.
 *
 * Accurate to within ~15% — good enough for cost estimation and context
 * window warnings.
 */
const CHARS_PER_TOKEN = 3.75;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate total tokens for a full request:
 * system prompt + all messages (content + reasoning + tool calls metadata).
 */
export function estimateMessageTokens(
  messages: Message[],
  systemPrompt?: string,
): number {
  let total = 0;

  if (systemPrompt) {
    total += estimateTokens(systemPrompt);
  }

  for (const msg of messages) {
    // Role overhead — each message has ~4 tokens of framing
    total += 4;
    total += estimateTokens(msg.content);

    if (msg.reasoning) {
      total += estimateTokens(msg.reasoning);
    }

    if (msg.tool_calls) {
      total += estimateTokens(msg.tool_calls);
    }

    // Attachments with extracted text
    if (msg.attachments) {
      for (const att of msg.attachments) {
        if (att.extractedText) {
          total += estimateTokens(att.extractedText);
        }
      }
    }
  }

  return total;
}
