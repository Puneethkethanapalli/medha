/**
 * Skills initialization — Sprint 19
 *
 * Seeds bundled skills on first launch and handles version upgrades.
 * Called from app startup after database initialization.
 */

import { BUNDLED_SKILLS } from './bundled';
import { parseSkillMd } from './parser';
import { initSkillsDirectory, saveSkill, checkSkillSubdirectories, readSkillFull } from './storage';
import { addSkillRecord, getSkillByName } from '../db/skills';
import { getDatabase } from '../db/schema';

/**
 * Initialize the skills system:
 * 1. Ensure the skills directory exists
 * 2. Seed bundled skills (first launch or version upgrade)
 */
export function initializeSkills(): void {
  initSkillsDirectory();
  seedBundledSkills();
}

/**
 * Seed bundled skills to disk and database.
 * On first launch: copies all bundled skills.
 * On update: re-copies if the bundled version is newer than what's on disk.
 */
function seedBundledSkills(): void {
  for (const bundled of BUNDLED_SKILLS) {
    const existing = getSkillByName(bundled.name);

    if (existing) {
      // Check if bundled version is newer
      if (existing.source === 'bundled') {
        const onDisk = readSkillFull(bundled.name);
        const diskVersion = onDisk?.frontmatter?.metadata?.version ?? '0';
        if (bundled.version > diskVersion) {
          // Update on disk (re-copy newer version)
          saveSkill(bundled.name, bundled.content);
          // Update description in DB in case it changed
          const parsed = parseSkillMd(bundled.content);
          if (parsed) {
            const db = getDatabase();
            db.runSync(
              'UPDATE skills SET description = ?, updated_at = ? WHERE name = ?',
              [parsed.frontmatter.description, Date.now(), bundled.name]
            );
          }
        }
      }
      // Skip non-bundled skills with the same name — user's take priority
      continue;
    }

    // First-time seeding
    const parsed = parseSkillMd(bundled.content);
    if (!parsed) {
      console.error(`[Skills] Failed to parse bundled skill: ${bundled.name}`);
      continue;
    }

    // Write to disk
    const storagePath = saveSkill(bundled.name, bundled.content);

    // Check for subdirectories (bundled skills don't have them, but be consistent)
    const subdirs = checkSkillSubdirectories(bundled.name);

    // Insert DB record
    addSkillRecord(
      bundled.name,
      parsed.frontmatter.description,
      'bundled',
      storagePath,
      {
        hasScripts: subdirs.hasScripts,
        hasReferences: subdirs.hasReferences,
        trusted: true, // bundled skills are always trusted
      }
    );
  }
}
