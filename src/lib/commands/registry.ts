/**
 * Slash command registry — defines quick-action commands triggered by typing "/" in InputBar.
 * Commands transform input text or send standalone prompts via the existing streaming pipeline.
 * Merges built-in commands with user-created custom commands from MMKV storage.
 */

import { getCustomCommandsSync, type StoredCustomCommand } from '@/lib/storage/mmkv';

export interface SlashCommand {
  id: string;
  name: string;           // e.g. "summarize"
  label: string;          // e.g. "Summarize"
  description: string;    // e.g. "Summarize the conversation so far"
  icon: string;           // lucide icon name
  action: 'prepend' | 'wrap' | 'standalone';
  template: string;       // e.g. "Summarize the above conversation concisely:"
}

const builtInCommands: SlashCommand[] = [
  {
    id: 'summarize',
    name: 'summarize',
    label: 'Summarize',
    description: 'Summarize the conversation so far',
    icon: 'FileText',
    action: 'standalone',
    template: 'Summarize the above conversation concisely.',
  },
  {
    id: 'translate',
    name: 'translate',
    label: 'Translate',
    description: 'Translate the last response to a language',
    icon: 'Languages',
    action: 'standalone',
    template: 'Translate your last response to {lang}.',
  },
  {
    id: 'code',
    name: 'code',
    label: 'Code',
    description: 'Write code for your prompt',
    icon: 'Code',
    action: 'prepend',
    template: 'Write code for: ',
  },
  {
    id: 'explain',
    name: 'explain',
    label: 'Explain',
    description: 'Explain something simply',
    icon: 'Lightbulb',
    action: 'prepend',
    template: 'Explain this simply: ',
  },
  {
    id: 'fix',
    name: 'fix',
    label: 'Fix',
    description: 'Fix errors in code',
    icon: 'Wrench',
    action: 'prepend',
    template: 'Fix the errors in this code: ',
  },
  {
    id: 'longer',
    name: 'longer',
    label: 'Longer',
    description: 'Expand on the last response',
    icon: 'ChevronsUp',
    action: 'standalone',
    template: 'Expand on your last response with more detail.',
  },
  {
    id: 'shorter',
    name: 'shorter',
    label: 'Shorter',
    description: 'Make the last response more concise',
    icon: 'ChevronsDown',
    action: 'standalone',
    template: 'Make your last response more concise.',
  },
];

/** Get all active commands: built-in + enabled custom commands */
export function listCommands(): SlashCommand[] {
  const custom = getCustomCommandsSync()
    .filter((c) => c.enabled)
    .map(customToSlash);
  return [...builtInCommands, ...custom];
}

/** Filter commands by a query string (case-insensitive prefix match on name) */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return listCommands().filter((cmd) => cmd.name.toLowerCase().startsWith(q));
}

/**
 * Parse slash input to extract command name and any trailing argument.
 * e.g. "/translate Hindi" → { commandQuery: "translate", arg: "Hindi" }
 * e.g. "/sum" → { commandQuery: "sum", arg: "" }
 */
export function parseSlashInput(text: string): { commandQuery: string; arg: string } | null {
  if (!text.startsWith('/')) return null;
  const withoutSlash = text.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');
  if (spaceIndex === -1) {
    return { commandQuery: withoutSlash, arg: '' };
  }
  return {
    commandQuery: withoutSlash.slice(0, spaceIndex),
    arg: withoutSlash.slice(spaceIndex + 1),
  };
}

/**
 * Resolve a command to its final send text.
 * - standalone: returns the template (with arg substitution for /translate)
 * - prepend: returns template + arg
 * - wrap: returns template with {input} replaced by arg
 */
export function resolveCommandText(command: SlashCommand, arg: string): string {
  switch (command.action) {
    case 'standalone':
      // /translate replaces {lang} with the arg
      if (command.id === 'translate' && arg.trim()) {
        return command.template.replace('{lang}', arg.trim());
      }
      return command.template;
    case 'prepend':
      return command.template + arg;
    case 'wrap':
      return command.template.replace('{input}', arg);
    default:
      return arg;
  }
}

/** Convert a StoredCustomCommand to a SlashCommand */
function customToSlash(cmd: StoredCustomCommand): SlashCommand {
  return {
    id: cmd.id,
    name: cmd.name,
    label: cmd.label,
    description: cmd.description,
    icon: 'Zap', // all custom commands use the Zap icon
    action: cmd.action,
    template: cmd.template,
  };
}
