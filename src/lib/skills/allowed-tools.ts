/**
 * `allowed-tools` handling for SKILL.md frontmatter.
 *
 * The spec makes it a space-separated string, but imported skills also use
 * commas (`web_search, save_memory`), flow lists (`[web_search]`) and block
 * lists (`- web_search`, which the frontmatter parser reads as an array).
 * Kept free of app imports so it can be unit tested.
 */

/** Tool names from an `allowed-tools` value, or null when it sets no restriction. */
export function parseAllowedTools(allowedToolsField: unknown): string[] | null {
  const items = Array.isArray(allowedToolsField)
    ? allowedToolsField.filter((item): item is string => typeof item === 'string')
    : typeof allowedToolsField === 'string'
      ? [allowedToolsField.trim().replace(/^\[([\s\S]*)\]$/, '$1')]
      : [];

  const names = items
    .flatMap((item) => item.split(/[\s,]+/))
    .map((name) => name.replace(/^["']|["']$/g, ''))
    .filter((name) => name.length > 0);

  return names.length > 0 ? names : null;
}

/**
 * Normalize a parsed `allowed-tools` value to the spec's space-separated
 * string, or undefined when it names no tools (e.g. a nested mapping).
 */
export function normalizeAllowedTools(value: unknown): string | undefined {
  return parseAllowedTools(value)?.join(' ');
}
