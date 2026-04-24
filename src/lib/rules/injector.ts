/**
 * Rules injection module — Sprint 13
 *
 * Builds a rules context string that is prepended to the system prompt.
 * Priority: per-conversation rules (if set) > global rules
 */

import { getConversation } from '@/lib/db/conversations';
import { getGlobalRulesSync } from '@/lib/storage/mmkv';

const RULE_PRESETS: Record<string, string> = {
  'Be concise': 'Always be concise and avoid filler words. Get straight to the point.',
  'Always use code examples': 'Whenever explaining technical concepts, include a practical code example.',
  'Respond in Hindi': 'Always respond in Hindi unless explicitly asked otherwise.',
  'Explain like I\'m 5': 'Explain everything as if I am 5 years old. Use simple analogies and avoid jargon.',
  'Use formal tone': 'Always use a formal, professional tone. Avoid slang and contractions.',
};

/**
 * Build the rules context for a given conversation.
 * Returns empty string if no rules are set.
 *
 * Priority: per-conversation rules (if non-null) > global rules
 */
export function buildRulesContext(conversationId?: string | null): string {
  let rules = '';

  if (conversationId) {
    const conversation = getConversation(conversationId);
    if (conversation?.rules) {
      rules = conversation.rules.trim();
    }
  }

  // If no per-conversation rules, fall back to global
  if (!rules) {
    rules = getGlobalRulesSync().trim();
  }

  if (!rules) return '';

  return `[User Rules]\n${rules}\n[/User Rules]`;
}

/**
 * Compose the full system prompt from multiple sources.
 * Order: Rules → Memory (future Sprint 14) → User's custom system prompt
 */
export function composeSystemPrompt(
  conversationId: string | null,
  customSystemPrompt?: string | null
): string | undefined {
  const parts: string[] = [];

  const rules = buildRulesContext(conversationId);
  if (rules) parts.push(rules);

  // Future: memory injection (Sprint 14) goes here
  // const memory = buildMemoryContext(messages);
  // if (memory) parts.push(memory);

  const custom = customSystemPrompt?.trim();
  if (custom) parts.push(custom);

  if (parts.length === 0) return undefined;

  return parts.join('\n\n');
}

/** Get the raw text for a named rule preset */
export function getRulePreset(name: string): string | undefined {
  return RULE_PRESETS[name];
}

/** List available rule preset names */
export function listRulePresets(): string[] {
  return Object.keys(RULE_PRESETS);
}
