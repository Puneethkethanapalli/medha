/**
 * Skill injection module — Sprint 19
 *
 * Progressive disclosure for skills:
 * - Tier 1 (always): Compact catalog of enabled skills (~100 tokens each)
 * - Tier 2 (on activation): Full SKILL.md body injected for active skill
 *
 * Integrates into the system prompt composition pipeline (rules/injector.ts).
 */

import { getSkillCatalog, getSkillByName } from '../db/skills';
import { readSkillBody, listSkillResources } from './storage';
import type { SkillCatalogEntry } from './types';

/** In-memory cache of active skill body content, keyed by skill name */
const skillBodyCache = new Map<string, string>();

/**
 * Build the skill catalog XML block for system prompt injection (tier 1).
 * Returns empty <available_skills/> tag when no skills are enabled.
 */
export function buildSkillCatalog(): string {
  const catalog: SkillCatalogEntry[] = getSkillCatalog();

  if (catalog.length === 0) {
    return '<available_skills/>';
  }

  const entries = catalog
    .map((s) => `  <skill name="${escapeXml(s.name)}">${escapeXml(s.description)}</skill>`)
    .join('\n');

  return `<available_skills>\n${entries}\n</available_skills>`;
}

/**
 * Build the skill catalog instruction that tells the AI how to use skills.
 */
export function buildSkillCatalogInstruction(): string {
  const catalog = getSkillCatalog();
  if (catalog.length === 0) return '';

  return 'The above skills provide specialized instructions. When a task matches a skill\'s description, mention the skill name so the user can activate it. Do not activate skills yourself.';
}

/**
 * Get the full skill content block for an active skill (tier 2).
 * Reads from cache first, then from disk.
 * Returns null if the skill doesn't exist or can't be read.
 */
export function getActiveSkillContent(skillName: string): string | null {
  // Check cache first
  const cached = skillBodyCache.get(skillName);
  if (cached) return cached;

  // Called while rendering the chat screen, so a file system error must not throw.
  try {
    return loadActiveSkillContent(skillName);
  } catch (e) {
    console.error(`[SkillInjector] Failed to load skill "${skillName}":`, e);
    return null;
  }
}

function loadActiveSkillContent(skillName: string): string | null {
  // Verify skill still exists in DB
  const record = getSkillByName(skillName);
  if (!record) return null;

  // Read body from disk
  const body = readSkillBody(skillName);
  if (!body) return null;

  // Build the content block with resources listing
  let resourcesBlock = '';
  const resources = listSkillResources(skillName);
  const hasResources = resources.scripts.length > 0 || resources.references.length > 0 || resources.assets.length > 0;

  if (hasResources) {
    const files: string[] = [];
    for (const f of resources.references) files.push(`    <file>references/${f}</file>`);
    for (const f of resources.scripts) files.push(`    <file>scripts/${f}</file>`);
    for (const f of resources.assets) files.push(`    <file>assets/${f}</file>`);
    resourcesBlock = `\n\n  <skill_resources>\n${files.join('\n')}\n  </skill_resources>`;
  }

  const content = `<skill_content name="${escapeXml(skillName)}">\n${body}${resourcesBlock}\n</skill_content>`;

  // Cache for this session
  skillBodyCache.set(skillName, content);

  return content;
}

/**
 * Get the allowed tools for an active skill.
 * Returns null if no tool restriction (all tools available).
 * Returns an array of tool names if the skill declares allowed-tools.
 */
export function getSkillAllowedTools(skillName: string): string[] | null {
  const record = getSkillByName(skillName);
  if (!record) return null;

  // We need to read the frontmatter for allowed-tools
  // For now, we'll handle this via a synchronous DB lookup
  // The allowed-tools info should ideally be cached, but for MVP
  // we accept the async read
  return null; // Will be populated when skill is activated
}

export { parseAllowedTools } from './allowed-tools';

/**
 * Clear the cached skill body (e.g., when a skill is updated or deactivated).
 */
export function clearSkillCache(skillName?: string): void {
  if (skillName) {
    skillBodyCache.delete(skillName);
  } else {
    skillBodyCache.clear();
  }
}

/** Escape special XML characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
