/**
 * Skills database layer — Sprint 19
 *
 * SQLite metadata index for skills. Body content lives on disk (SKILL.md files).
 * This layer stores only lightweight metadata + file location for fast querying.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';
import type { SkillRecord, SkillCatalogEntry } from '../skills/types';

/**
 * Add a skill record to the database.
 * Returns the generated UUID.
 */
export function addSkillRecord(
  name: string,
  description: string,
  source: 'bundled' | 'imported' | 'created',
  storagePath: string,
  options?: {
    hasScripts?: boolean;
    hasReferences?: boolean;
    trusted?: boolean;
  }
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO skills (id, name, description, source, storage_path, enabled, trusted, has_scripts, has_references, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      description,
      source,
      storagePath,
      options?.trusted ? 1 : 0,
      options?.hasScripts ? 1 : 0,
      options?.hasReferences ? 1 : 0,
      now,
      now,
    ]
  );

  return id;
}

/** Get all skill records, ordered by source (bundled first) then name */
export function getSkillRecords(): SkillRecord[] {
  const db = getDatabase();
  return db.getAllSync<SkillRecord>(
    `SELECT * FROM skills
     ORDER BY
       CASE source WHEN 'bundled' THEN 0 WHEN 'imported' THEN 1 ELSE 2 END,
       name ASC`
  );
}

/** Get only enabled skill records */
export function getEnabledSkills(): SkillRecord[] {
  const db = getDatabase();
  return db.getAllSync<SkillRecord>(
    `SELECT * FROM skills WHERE enabled = 1
     ORDER BY name ASC`
  );
}

/** Get a skill record by name (names are unique) */
export function getSkillByName(name: string): SkillRecord | null {
  const db = getDatabase();
  const row = db.getFirstSync<SkillRecord>(
    'SELECT * FROM skills WHERE name = ?',
    [name]
  );
  return row ?? null;
}

/** Get a skill record by ID */
export function getSkillById(id: string): SkillRecord | null {
  const db = getDatabase();
  const row = db.getFirstSync<SkillRecord>(
    'SELECT * FROM skills WHERE id = ?',
    [id]
  );
  return row ?? null;
}

/** Update a skill record */
export function updateSkillRecord(
  id: string,
  fields: Partial<Pick<SkillRecord, 'description' | 'enabled' | 'trusted' | 'has_scripts' | 'has_references'>>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.description !== undefined) {
    sets.push('description = ?');
    values.push(fields.description);
  }
  if (fields.enabled !== undefined) {
    sets.push('enabled = ?');
    values.push(fields.enabled);
  }
  if (fields.trusted !== undefined) {
    sets.push('trusted = ?');
    values.push(fields.trusted);
  }
  if (fields.has_scripts !== undefined) {
    sets.push('has_scripts = ?');
    values.push(fields.has_scripts);
  }
  if (fields.has_references !== undefined) {
    sets.push('has_references = ?');
    values.push(fields.has_references);
  }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  db.runSync(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, values);
}

/** Delete a skill record from the database */
export function deleteSkillRecord(name: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM skills WHERE name = ?', [name]);
}

/** Toggle a skill's enabled state */
export function toggleSkill(name: string, enabled: boolean): void {
  const db = getDatabase();
  db.runSync('UPDATE skills SET enabled = ?, updated_at = ? WHERE name = ?', [
    enabled ? 1 : 0,
    Date.now(),
    name,
  ]);
}

/** Mark a skill as trusted (user has approved scripts execution) */
export function setTrusted(name: string, trusted: boolean): void {
  const db = getDatabase();
  db.runSync('UPDATE skills SET trusted = ?, updated_at = ? WHERE name = ?', [
    trusted ? 1 : 0,
    Date.now(),
    name,
  ]);
}

/**
 * Get the skill catalog for system prompt injection (progressive disclosure tier 1).
 * Returns only { name, description } for all enabled skills.
 */
export function getSkillCatalog(): SkillCatalogEntry[] {
  const db = getDatabase();
  return db.getAllSync<SkillCatalogEntry>(
    'SELECT name, description FROM skills WHERE enabled = 1 ORDER BY name ASC'
  );
}

/** Get total skill count */
export function getSkillCount(): number {
  const db = getDatabase();
  const row = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM skills');
  return row?.count ?? 0;
}
