/**
 * Apps database layer — Sprint 20
 *
 * CRUD operations for custom apps (GPT-like personas).
 * Apps bundle a skill, model, icon, and conversation defaults.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';
import type { MedhaApp } from '../apps/types';

/**
 * Add an app to the database. Returns the generated UUID.
 */
export function addApp(
  name: string,
  description: string,
  icon: string,
  options?: {
    color?: string;
    skillName?: string;
    model?: string;
    provider?: string;
    rules?: string;
    greeting?: string;
    examplePrompts?: string[];
    builtin?: boolean;
  }
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO apps (id, name, description, icon, color, skill_name, model, provider, rules, greeting, example_prompts, builtin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      description,
      icon,
      options?.color ?? null,
      options?.skillName ?? null,
      options?.model ?? null,
      options?.provider ?? null,
      options?.rules ?? null,
      options?.greeting ?? null,
      options?.examplePrompts ? JSON.stringify(options.examplePrompts) : null,
      options?.builtin ? 1 : 0,
      now,
    ]
  );

  return id;
}

/** Get all apps, built-in first then by name */
export function getApps(): MedhaApp[] {
  const db = getDatabase();
  return db.getAllSync<MedhaApp>(
    `SELECT * FROM apps
     ORDER BY builtin DESC, name ASC`
  );
}

/** Get a single app by ID */
export function getApp(id: string): MedhaApp | null {
  const db = getDatabase();
  const row = db.getFirstSync<MedhaApp>(
    'SELECT * FROM apps WHERE id = ?',
    [id]
  );
  return row ?? null;
}

/** Get a single app by name */
export function getAppByName(name: string): MedhaApp | null {
  const db = getDatabase();
  const row = db.getFirstSync<MedhaApp>(
    'SELECT * FROM apps WHERE name = ?',
    [name]
  );
  return row ?? null;
}

/** Update an app's fields */
export function updateApp(
  id: string,
  fields: Partial<Pick<MedhaApp, 'name' | 'description' | 'icon' | 'color' | 'skill_name' | 'model' | 'provider' | 'rules' | 'greeting' | 'example_prompts'>>
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    icon: 'icon',
    color: 'color',
    skill_name: 'skill_name',
    model: 'model',
    provider: 'provider',
    rules: 'rules',
    greeting: 'greeting',
    example_prompts: 'example_prompts',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = fields[key as keyof typeof fields];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      values.push(value ?? null);
    }
  }

  if (sets.length === 0) return;

  values.push(id);
  db.runSync(`UPDATE apps SET ${sets.join(', ')} WHERE id = ?`, values);
}

/** Delete an app by ID */
export function deleteApp(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM apps WHERE id = ?', [id]);
}

/** Get total app count */
export function getAppCount(): number {
  const db = getDatabase();
  const row = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM apps');
  return row?.count ?? 0;
}

/** Get conversation count for a specific app */
export function getAppConversationCount(appId: string): number {
  const db = getDatabase();
  const row = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM conversations WHERE app_id = ?',
    [appId]
  );
  return row?.count ?? 0;
}
