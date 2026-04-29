/**
 * Custom Apps types — Sprint 20
 *
 * Apps are named personas that bundle a skill, model, icon, and conversation
 * defaults. Like ChatGPT's Custom GPTs but local-first.
 */

export interface MedhaApp {
  id: string;
  name: string;
  description: string;
  icon: string;                    // lucide icon name
  color: string | null;            // accent color for app card (CSS hsl)
  skill_name: string | null;       // linked skill name (kebab-case, from Sprint 19)
  model: string | null;            // pinned model ID (e.g. "claude-sonnet-4-20250514")
  provider: string | null;         // pinned provider ID
  rules: string | null;            // app-specific rules (override global)
  greeting: string | null;         // first message shown when app opens
  example_prompts: string | null;  // JSON array of suggestion chips
  builtin: number;                 // SQLite boolean (0/1)
  created_at: number;
}

/** Parsed example_prompts from JSON string */
export function parseExamplePrompts(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
