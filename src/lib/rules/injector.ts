/**
 * Rules injection module — Sprint 13, updated Sprint 19
 *
 * Builds a rules context string that is prepended to the system prompt.
 * Priority: per-conversation rules (if set) > global rules
 *
 * Sprint 19 additions: skill catalog + active skill content injection.
 * Order: Rules → Skill Catalog → Active Skill Content → Project Context → Memory → Custom Instructions
 */

import { getConversation, isTemporaryConversation } from '@/lib/db/conversations';
import { getGlobalRulesSync, type RuleItem, DEFAULT_RULES, isMemoryEnabledSync } from '@/lib/storage/mmkv';
import { buildMemoryContext, buildProfileContext } from '@/lib/memory/injector';
import { buildProjectContext } from '@/lib/projects/context';
import { buildSkillCatalog, buildSkillCatalogInstruction, getActiveSkillContent } from '@/lib/skills/injector';

/** Parse a rules JSON string into RuleItem array. Falls back to defaults. */
function parseRules(json: string | null): RuleItem[] {
  if (!json) return DEFAULT_RULES.map((r) => ({ ...r }));
  try {
    const parsed = JSON.parse(json) as RuleItem[];
    if (Array.isArray(parsed)) return parsed;
    return DEFAULT_RULES.map((r) => ({ ...r }));
  } catch {
    return DEFAULT_RULES.map((r) => ({ ...r }));
  }
}

/** Build a plain-text rules block from enabled RuleItems */
function rulesToText(rules: RuleItem[]): string {
  const enabled = rules.filter((r) => r.enabled);
  if (enabled.length === 0) return '';
  const lines = enabled.map((r) => `- ${r.description}`);
  return `[User Rules]\n${lines.join('\n')}\n[/User Rules]`;
}

/**
 * Build the rules context for a given conversation.
 * Returns empty string if no enabled rules.
 *
 * Priority: per-conversation rules (if non-null) > global rules
 */
export function buildRulesContext(conversationId?: string | null): string {
  let rules: RuleItem[] | null = null;

  if (conversationId) {
    const conversation = getConversation(conversationId);
    if (conversation?.rules) {
      rules = parseRules(conversation.rules);
    }
  }

  // If no per-conversation rules, fall back to global
  if (!rules) {
    rules = getGlobalRulesSync();
  }

  return rulesToText(rules);
}

/**
 * Compose the full system prompt from multiple sources.
 * Order: Rules → Skill Catalog → Active Skill Content → Project Context → Memory → Custom Instructions
 */
export function composeSystemPrompt(
  conversationId: string | null,
  customSystemPrompt?: string | null,
  activeSkillName?: string | null,
  options: { recordMemoryUse?: boolean } = {}
): string | undefined {
  const parts: string[] = [];

  const rules = buildRulesContext(conversationId);
  if (rules) parts.push(rules);

  // Skill catalog (Sprint 19 — tier 1: always injected)
  const catalog = buildSkillCatalog();
  if (catalog) parts.push(catalog);

  const catalogInstruction = buildSkillCatalogInstruction();
  if (catalogInstruction) parts.push(catalogInstruction);

  // Active skill content (Sprint 19 — tier 2: only when activated)
  if (activeSkillName) {
    const skillContent = getActiveSkillContent(activeSkillName);
    if (skillContent) parts.push(skillContent);
  }

  // Project workspace memory (Sprint 20+): app-scoped context from related chats
  const projectContext = buildProjectContext(conversationId);
  if (projectContext) parts.push(projectContext);

  // Memory injection (Sprint 14)
  // Temporary chats neither read nor write memory.
  if (isMemoryEnabledSync() && !isTemporaryConversation(conversationId)) {
    const profile = buildProfileContext();
    if (profile) parts.push(profile);

    const memory = buildMemoryContext({
      conversationId,
      recordUse: options.recordMemoryUse,
    });
    if (memory) parts.push(memory);
  }

  const custom = customSystemPrompt?.trim();
  if (custom) parts.push(custom);

  if (parts.length === 0) return undefined;

  return parts.join('\n\n');
}

/** Export default rules for UI initialization */
export { DEFAULT_RULES };
export type { RuleItem };
