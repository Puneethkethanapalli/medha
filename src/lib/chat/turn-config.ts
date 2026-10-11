/**
 * Pure building blocks for one assistant turn: which tools the model gets and
 * the instructions appended to the system prompt. No I/O, so they load in Node
 * and are covered by unit tests.
 */
import { ASK_USER_CHOICE_TOOL_NAME } from '@/lib/tools/ask-user-choice';
import { DEFAULT_PROVIDER_ID, getDefaultModel } from '@/lib/providers/catalog';

/** Tool follow-up rounds allowed per reply before the model must answer. */
export const MAX_TOOL_ROUNDS = 5;

/** Tools that change saved memories; using one skips background extraction. */
export const MEMORY_TOOL_NAMES: ReadonlySet<string> = new Set(['save_memory', 'update_memory', 'forget_memory']);

export const IMAGE_GEN_INSTRUCTION =
  'You can generate images. When the user asks to create, draw, or visualize something, use the generate_image tool.';

export const ASK_USER_CHOICE_INSTRUCTION =
  'You can ask the user to choose between options with the ask_user_choice tool. Use it sparingly, only when the answer would depend on a meaningful user preference or missing decision. Ask 1-4 concise questions at once, provide 2-4 clear options per question, mark a recommended option when appropriate, and do not call any other tool in the same response as ask_user_choice.';

export const TOOL_USE_INSTRUCTION =
  'When using tools, give a short preamble before the call when possible, use the narrowest useful tool, and cite sources from tool results in the final answer. Prefer deep_research over web_search for broad comparisons, investigations, or multi-source analysis.';

export const TOOL_LIMIT_FALLBACK =
  'I reached the tool-use limit for this response. Please ask me to continue if you want me to keep working from the available results.';

export const CHOICE_PROMPT_FALLBACK = 'I need your choice to continue.';

/**
 * The provider and model a reply uses: the project's pinned ones win, then the
 * user's last pick, then the catalog defaults.
 */
export function resolveTurnModel(
  app: { provider?: string | null; model?: string | null } | null | undefined,
  lastProvider: string | null,
  lastModel: string | null
): { providerId: string; model: string } {
  const providerId = app?.provider || lastProvider || DEFAULT_PROVIDER_ID;
  return { providerId, model: app?.model || lastModel || getDefaultModel(providerId) };
}

/** Append a section to the system prompt, separated by a blank line. */
export function appendPromptSection(prompt: string | undefined, section: string): string {
  return prompt ? `${prompt}\n\n${section}` : section;
}

export interface ToolToggles {
  webSearchEnabled: boolean;
  /** Memory is on and the chat is not temporary. */
  useMemory: boolean;
  memoryChatHistoryEnabled: boolean;
  imageGenEnabled: boolean;
}

/** Tools offered this turn — choice cards are core; other tools are toggled. */
export function selectActiveToolNames(toggles: ToolToggles): string[] {
  const names: string[] = [ASK_USER_CHOICE_TOOL_NAME];
  if (toggles.webSearchEnabled) {
    names.push('web_search');
    names.push('deep_research');
  }
  if (toggles.useMemory) {
    names.push('save_memory');
    names.push('update_memory');
    names.push('forget_memory');
    if (toggles.memoryChatHistoryEnabled) {
      names.push('search_past_chats');
      names.push('recent_chats');
    }
  }
  if (toggles.imageGenEnabled) names.push('generate_image');
  return names;
}

/**
 * Restrict tools to an active skill's `allowed-tools`. Null means the skill
 * sets no restriction. Choice cards always stay available, and allowing
 * web_search also allows deep_research.
 */
export function scopeToolsToSkill(
  toolNames: string[],
  skillAllowedTools: readonly string[] | null
): string[] {
  if (!skillAllowedTools) return toolNames;
  return toolNames.filter((name) =>
    name === ASK_USER_CHOICE_TOOL_NAME
    || skillAllowedTools.includes(name)
    || (name === 'deep_research' && skillAllowedTools.includes('web_search'))
  );
}

export interface TurnPromptParts {
  /** Rules, skills, project context, memory and custom instructions. */
  base: string | undefined;
  /** Memory tool guidance, or null when memory is off for this chat. */
  memoryInstruction: string | null;
  imageGenEnabled: boolean;
  /** Tools after skill scoping; any besides ask_user_choice adds tool guidance. */
  activeToolNames: readonly string[];
}

/** The system prompt sent to the provider for one round of a turn. */
export function buildTurnSystemPrompt(parts: TurnPromptParts): string {
  let prompt = parts.base;
  if (parts.memoryInstruction !== null) {
    prompt = appendPromptSection(prompt, parts.memoryInstruction);
  }
  if (parts.imageGenEnabled) {
    prompt = appendPromptSection(prompt, IMAGE_GEN_INSTRUCTION);
  }
  let result = appendPromptSection(prompt, ASK_USER_CHOICE_INSTRUCTION);
  if (parts.activeToolNames.some((name) => name !== ASK_USER_CHOICE_TOOL_NAME)) {
    result = appendPromptSection(result, TOOL_USE_INSTRUCTION);
  }
  return result;
}
