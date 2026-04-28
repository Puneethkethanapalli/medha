/**
 * Skill system types — Sprint 19
 *
 * Types for the Agent Skills system, compatible with the open SKILL.md standard
 * (used by Claude Code, Cursor, Gemini CLI, GitHub Copilot).
 */

/** Parsed frontmatter from SKILL.md */
export interface SkillFrontmatter {
  name: string;                        // kebab-case, 1-64 chars, matches directory name
  description: string;                 // 1-1024 chars, used for discovery
  license?: string;
  compatibility?: string;
  'allowed-tools'?: string;            // space-separated tool names
  metadata?: Record<string, string>;   // arbitrary key-value pairs
  [key: string]: unknown;              // preserve unknown fields (Claude extensions etc.)
}

/** Parsed SKILL.md file */
export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;                        // markdown content after closing ---
}

/** Skill record stored in SQLite (metadata only — body lives on disk) */
export interface SkillRecord {
  id: string;
  name: string;                        // from frontmatter, kebab-case
  description: string;                 // from frontmatter
  source: 'bundled' | 'imported' | 'created';
  storage_path: string;                // relative path to skill directory under documentDirectory/skills/
  enabled: number;                     // SQLite boolean (0/1)
  trusted: number;                     // SQLite boolean — user has approved skills with scripts/
  has_scripts: number;                 // SQLite boolean — whether scripts/ directory exists
  has_references: number;              // SQLite boolean — whether references/ directory exists
  created_at: number;
  updated_at: number;
}

/** Compact skill entry for system prompt catalog (progressive disclosure tier 1) */
export interface SkillCatalogEntry {
  name: string;
  description: string;
}
