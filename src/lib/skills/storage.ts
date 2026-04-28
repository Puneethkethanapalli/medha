/**
 * Skills file storage — Sprint 19
 *
 * Manages skill files on disk using expo-file-system (new API: File/Directory/Paths).
 * Skills live at {documentDirectory}/skills/{name}/SKILL.md
 * The filesystem is the canonical source; SQLite stores only metadata.
 */

import { File, Directory, Paths } from 'expo-file-system';
import { parseSkillMd } from './parser';
import type { ParsedSkill } from './types';

const SKILLS_DIR = 'skills';

/** Get or create the base skills directory */
function getSkillsDir(): Directory {
  const dir = new Directory(Paths.document, SKILLS_DIR);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/** Get the directory for a specific skill */
function getSkillDir(name: string): Directory {
  return new Directory(getSkillsDir(), name);
}

/** Get the SKILL.md file for a specific skill */
function getSkillMdFile(name: string): File {
  return new File(getSkillDir(name), 'SKILL.md');
}

/**
 * Validate a skill name for path safety.
 * Rejects names containing path traversal characters.
 */
function validateSkillName(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  if (name.includes('\0')) return false;
  return true;
}

/** Ensure the base skills directory exists */
export function initSkillsDirectory(): void {
  getSkillsDir(); // creates if needed
}

/**
 * Save a SKILL.md file to disk.
 * Creates the skill directory if it doesn't exist.
 * Returns the relative storage path (e.g., "skills/code-review/").
 */
export function saveSkill(name: string, skillMdContent: string): string {
  if (!validateSkillName(name)) {
    throw new Error(`Invalid skill name: "${name}"`);
  }

  const dir = getSkillDir(name);
  if (!dir.exists) {
    dir.create();
  }

  const file = getSkillMdFile(name);
  file.create({ overwrite: true, intermediates: true });
  file.write(skillMdContent);

  return `${SKILLS_DIR}/${name}/`;
}

/**
 * Read the body content of a SKILL.md from disk (progressive disclosure tier 2).
 * Returns the markdown body only (no frontmatter).
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function readSkillBody(name: string): string | null {
  if (!validateSkillName(name)) return null;

  const file = getSkillMdFile(name);
  if (!file.exists) return null;

  try {
    const content = file.textSync();
    const parsed = parseSkillMd(content);
    return parsed?.body ?? null;
  } catch (e) {
    console.error(`[SkillStorage] Failed to read skill body for "${name}":`, e);
    return null;
  }
}

/**
 * Read and parse a full SKILL.md from disk.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function readSkillFull(name: string): ParsedSkill | null {
  if (!validateSkillName(name)) return null;

  const file = getSkillMdFile(name);
  if (!file.exists) return null;

  try {
    const content = file.textSync();
    return parseSkillMd(content);
  } catch (e) {
    console.error(`[SkillStorage] Failed to read skill for "${name}":`, e);
    return null;
  }
}

/**
 * Delete an entire skill directory from disk.
 */
export function deleteSkillDirectory(name: string): void {
  if (!validateSkillName(name)) return;

  const dir = getSkillDir(name);
  if (dir.exists) {
    dir.delete();
  }
}

/**
 * Check if a skill directory exists on disk.
 */
export function skillDirectoryExists(name: string): boolean {
  if (!validateSkillName(name)) return false;
  return getSkillDir(name).exists;
}

/**
 * List resource files in a skill's subdirectories (scripts/, references/, assets/).
 */
export function listSkillResources(name: string): {
  scripts: string[];
  references: string[];
  assets: string[];
} {
  if (!validateSkillName(name)) {
    return { scripts: [], references: [], assets: [] };
  }

  const skillDir = getSkillDir(name);
  const result = { scripts: [] as string[], references: [] as string[], assets: [] as string[] };

  for (const subdir of ['scripts', 'references', 'assets'] as const) {
    const dir = new Directory(skillDir, subdir);
    if (dir.exists) {
      result[subdir] = dir.list().map((item) => item.name);
    }
  }

  return result;
}

/**
 * Check if a skill has specific subdirectories.
 */
export function checkSkillSubdirectories(name: string): {
  hasScripts: boolean;
  hasReferences: boolean;
} {
  if (!validateSkillName(name)) {
    return { hasScripts: false, hasReferences: false };
  }

  const skillDir = getSkillDir(name);

  return {
    hasScripts: new Directory(skillDir, 'scripts').exists,
    hasReferences: new Directory(skillDir, 'references').exists,
  };
}
