/**
 * SKILL.md parser — Sprint 19
 *
 * Parses the Agent Skills SKILL.md format: YAML frontmatter + markdown body.
 * Uses a lightweight regex-based YAML parser for frontmatter-only use case
 * (avoids adding a full YAML library dependency).
 */

import type { SkillFrontmatter, ParsedSkill } from './types';
import { normalizeAllowedTools } from './allowed-tools';

/**
 * Parse a SKILL.md file into frontmatter + body.
 * Returns null if the file is fundamentally invalid (no description or unparseable YAML).
 * Lenient on non-critical issues per spec.
 */
export function parseSkillMd(content: string): ParsedSkill | null {
  const trimmed = content.trim();

  // Must start with ---
  if (!trimmed.startsWith('---')) {
    console.error('[SkillParser] SKILL.md does not start with ---');
    return null;
  }

  // Find closing ---
  const closingIndex = trimmed.indexOf('\n---', 3);
  if (closingIndex === -1) {
    console.error('[SkillParser] No closing --- found in frontmatter');
    return null;
  }

  const yamlBlock = trimmed.substring(3, closingIndex).trim();
  const body = trimmed.substring(closingIndex + 4).trim(); // skip past \n---

  // Parse YAML frontmatter
  const frontmatter = parseSimpleYaml(yamlBlock);
  if (!frontmatter) {
    console.error('[SkillParser] Failed to parse YAML frontmatter');
    return null;
  }

  // Description is required per spec
  if (!frontmatter.description || frontmatter.description.trim().length === 0) {
    console.error('[SkillParser] Missing required field: description');
    return null;
  }

  // Name is required per spec
  if (!frontmatter.name || frontmatter.name.trim().length === 0) {
    console.error('[SkillParser] Missing required field: name');
    return null;
  }

  // Warn on name length (lenient — load anyway)
  if (frontmatter.name.length > 64) {
    console.warn(`[SkillParser] Skill name exceeds 64 chars: "${frontmatter.name.substring(0, 20)}..."`);
  }

  return { frontmatter, body };
}

/**
 * Generate a valid SKILL.md string from frontmatter + body.
 */
export function generateSkillMd(frontmatter: SkillFrontmatter, body: string): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${frontmatter.name}`);
  lines.push(`description: ${yamlEscapeString(frontmatter.description)}`);

  if (frontmatter.license) {
    lines.push(`license: ${frontmatter.license}`);
  }
  if (frontmatter.compatibility) {
    lines.push(`compatibility: ${frontmatter.compatibility}`);
  }
  if (frontmatter['allowed-tools']) {
    lines.push(`allowed-tools: ${frontmatter['allowed-tools']}`);
  }

  // Emit metadata block
  if (frontmatter.metadata && Object.keys(frontmatter.metadata).length > 0) {
    lines.push('metadata:');
    for (const [key, value] of Object.entries(frontmatter.metadata)) {
      lines.push(`  ${key}: ${yamlEscapeString(String(value))}`);
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(body);

  return lines.join('\n');
}

/**
 * Lightweight YAML frontmatter parser.
 * Handles flat key-value pairs, one level of nesting (for metadata block) and
 * block lists (`- item`, e.g. allowed-tools written as a list).
 * NOT a full YAML parser — only covers the Agent Skills frontmatter subset.
 */
function parseSimpleYaml(yaml: string): SkillFrontmatter | null {
  try {
    const result: Record<string, unknown> = {};
    const lines = yaml.split('\n');
    let currentNestedKey: string | null = null;
    let nestedObj: Record<string, string> = {};
    let nestedList: string[] = [];
    let listIndent: number | null = null;

    for (const line of lines) {
      // Skip empty lines and comments
      if (line.trim() === '' || line.trim().startsWith('#')) continue;

      // Block list item directly under the current key. Once the key holds
      // mapping entries (e.g. metadata), deeper `- item` lines belong to one of
      // those entries and are skipped like other unsupported nesting.
      const listItem =
        currentNestedKey && Object.keys(nestedObj).length === 0 ? line.match(/^(\s*)-\s+(.*)$/) : null;
      if (listItem && (listIndent === null || listItem[1].length === listIndent)) {
        listIndent = listItem[1].length;
        nestedList.push(unquoteYaml(listItem[2].trim()));
        continue;
      }

      // Check if this is a nested value (indented with spaces)
      if (currentNestedKey && /^\s{2,}/.test(line)) {
        const nestedMatch = line.match(/^\s+(\S+?):\s*(.*)$/);
        if (nestedMatch) {
          nestedObj[nestedMatch[1]] = unquoteYaml(nestedMatch[2].trim());
        }
        continue;
      }

      // If we were building a nested object, flush it
      if (currentNestedKey) {
        result[currentNestedKey] = nestedList.length > 0 ? [...nestedList] : { ...nestedObj };
        currentNestedKey = null;
        nestedObj = {};
        nestedList = [];
        listIndent = null;
      }

      // Top-level key: value
      const match = line.match(/^(\S+?):\s*(.*)$/);
      if (!match) continue;

      const key = match[1];
      const value = match[2].trim();

      if (value === '' || value === '{}') {
        // Could be start of a nested block or empty value
        // Check if next lines are indented (we'll handle it on next iteration)
        currentNestedKey = key;
        nestedObj = {};
        nestedList = [];
        listIndent = null;
      } else {
        result[key] = unquoteYaml(value);
      }
    }

    // Flush any remaining nested object
    if (currentNestedKey) {
      result[currentNestedKey] =
        nestedList.length > 0 ? [...nestedList]
        : Object.keys(nestedObj).length > 0 ? { ...nestedObj }
        : undefined;
    }

    // Callers treat allowed-tools as the spec's space-separated string.
    if ('allowed-tools' in result) {
      const allowedTools = normalizeAllowedTools(result['allowed-tools']);
      if (allowedTools) result['allowed-tools'] = allowedTools;
      else delete result['allowed-tools'];
    }

    // Validate required fields
    if (typeof result.name !== 'string' || typeof result.description !== 'string') {
      return null;
    }

    return result as unknown as SkillFrontmatter;
  } catch (e) {
    console.error('[SkillParser] YAML parse error:', e);
    return null;
  }
}

/** Remove surrounding quotes from a YAML value */
function unquoteYaml(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** Escape a string for YAML output — quote if it contains special chars */
function yamlEscapeString(value: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(value) || value.includes('\n')) {
    // Use double quotes and escape internal quotes
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}
