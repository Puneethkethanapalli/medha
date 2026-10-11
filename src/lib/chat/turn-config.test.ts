import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ASK_USER_CHOICE_INSTRUCTION,
  IMAGE_GEN_INSTRUCTION,
  TOOL_USE_INSTRUCTION,
  appendPromptSection,
  buildTurnSystemPrompt,
  resolveTurnModel,
  scopeToolsToSkill,
  selectActiveToolNames,
  type ToolToggles,
} from './turn-config';
import { DEFAULT_PROVIDER_ID, getDefaultModel } from '@/lib/providers/catalog';

const ALL_OFF: ToolToggles = {
  webSearchEnabled: false,
  useMemory: false,
  memoryChatHistoryEnabled: false,
  imageGenEnabled: false,
};

describe('appendPromptSection', () => {
  it('separates sections with a blank line', () => {
    assert.equal(appendPromptSection('A', 'B'), 'A\n\nB');
  });

  it('starts the prompt when there is none', () => {
    assert.equal(appendPromptSection(undefined, 'B'), 'B');
    assert.equal(appendPromptSection('', 'B'), 'B');
  });
});

describe('selectActiveToolNames', () => {
  it('always offers choice cards', () => {
    assert.deepEqual(selectActiveToolNames(ALL_OFF), ['ask_user_choice']);
  });

  it('adds toggled tools in a fixed order', () => {
    assert.deepEqual(
      selectActiveToolNames({
        webSearchEnabled: true,
        useMemory: true,
        memoryChatHistoryEnabled: true,
        imageGenEnabled: true,
      }),
      [
        'ask_user_choice',
        'web_search',
        'deep_research',
        'save_memory',
        'update_memory',
        'forget_memory',
        'search_past_chats',
        'recent_chats',
        'generate_image',
      ]
    );
  });

  it('offers chat history tools only with memory', () => {
    assert.deepEqual(
      selectActiveToolNames({ ...ALL_OFF, memoryChatHistoryEnabled: true }),
      ['ask_user_choice']
    );
  });
});

describe('scopeToolsToSkill', () => {
  const tools = ['ask_user_choice', 'web_search', 'deep_research', 'save_memory', 'generate_image'];

  it('leaves tools alone when the skill sets no restriction', () => {
    assert.equal(scopeToolsToSkill(tools, null), tools);
  });

  it('keeps choice cards and the allowed tools', () => {
    assert.deepEqual(scopeToolsToSkill(tools, ['generate_image']), ['ask_user_choice', 'generate_image']);
  });

  it('treats web_search as allowing deep_research', () => {
    assert.deepEqual(scopeToolsToSkill(tools, ['web_search']), ['ask_user_choice', 'web_search', 'deep_research']);
  });

  it('does not let deep_research imply web_search', () => {
    assert.deepEqual(scopeToolsToSkill(tools, ['deep_research']), ['ask_user_choice', 'deep_research']);
  });

  it('never adds tools that are switched off', () => {
    assert.deepEqual(scopeToolsToSkill(['ask_user_choice'], ['web_search']), ['ask_user_choice']);
  });
});

describe('buildTurnSystemPrompt', () => {
  it('appends memory, image and choice guidance in order', () => {
    assert.equal(
      buildTurnSystemPrompt({
        base: 'BASE',
        memoryInstruction: 'MEMORY',
        imageGenEnabled: true,
        activeToolNames: ['ask_user_choice'],
      }),
      `BASE\n\nMEMORY\n\n${IMAGE_GEN_INSTRUCTION}\n\n${ASK_USER_CHOICE_INSTRUCTION}`
    );
  });

  it('adds tool guidance only when a tool besides choice cards is active', () => {
    assert.equal(
      buildTurnSystemPrompt({
        base: undefined,
        memoryInstruction: null,
        imageGenEnabled: false,
        activeToolNames: ['ask_user_choice', 'web_search'],
      }),
      `${ASK_USER_CHOICE_INSTRUCTION}\n\n${TOOL_USE_INSTRUCTION}`
    );
  });

  it('starts with choice guidance when nothing else applies', () => {
    assert.equal(
      buildTurnSystemPrompt({
        base: undefined,
        memoryInstruction: null,
        imageGenEnabled: false,
        activeToolNames: ['ask_user_choice'],
      }),
      ASK_USER_CHOICE_INSTRUCTION
    );
  });
});

describe('resolveTurnModel', () => {
  it("prefers the project's pinned provider and model", () => {
    assert.deepEqual(
      resolveTurnModel({ provider: 'anthropic', model: 'claude-x' }, 'openai', 'gpt-5.5'),
      { providerId: 'anthropic', model: 'claude-x' }
    );
  });

  it("falls back to the user's last pick, field by field", () => {
    assert.deepEqual(resolveTurnModel(null, 'openai', 'gpt-5.5'), { providerId: 'openai', model: 'gpt-5.5' });
    assert.deepEqual(
      resolveTurnModel({ provider: null, model: null }, 'openai', 'gpt-5.5'),
      { providerId: 'openai', model: 'gpt-5.5' }
    );
    assert.deepEqual(
      resolveTurnModel({ provider: 'anthropic', model: '' }, 'openai', 'gpt-5.5'),
      { providerId: 'anthropic', model: 'gpt-5.5' }
    );
  });

  it("uses the catalog default provider and that provider's default model last", () => {
    assert.deepEqual(resolveTurnModel(undefined, null, null), {
      providerId: DEFAULT_PROVIDER_ID,
      model: getDefaultModel(DEFAULT_PROVIDER_ID),
    });
    assert.deepEqual(resolveTurnModel(null, 'minimax', ''), {
      providerId: 'minimax',
      model: getDefaultModel('minimax'),
    });
  });
});
