import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  CLOUDFLARE_FALLBACK_MODELS,
  DEFAULT_PROVIDER_ID,
  findMissingSetupField,
  getDefaultModel,
  getFallbackModels,
  getProviderDisplayName,
  getProviderInfo,
  isProviderId,
  listProviderInfo,
  MINIMAX_MODELS,
  PROVIDER_CATALOG,
  PROVIDER_IDS,
} from '@/lib/providers/catalog';
import type { ProviderInfo } from '@/lib/providers/catalog';
import type { Model } from '@/types';

const models = (provider: string, entries: [id: string, name: string][]): Model[] =>
  entries.map(([id, name]) => ({ id, name, provider }));

/**
 * Values from before the catalog existed, when they were spread across
 * ModelPill (short names), ModelPicker (display names, fallback lists),
 * onboarding.tsx (placeholders, hints, auth mode), settings/api-keys.tsx
 * (descriptions, Cloudflare fields), and ChatScreen (default models). The
 * catalog must reproduce them exactly, in this order.
 */
const EXPECTED: ProviderInfo[] = [
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    shortName: 'OR',
    description: 'Access to 200+ AI models',
    authMode: 'api-key',
    keyPlaceholder: 'sk-or-...',
    keyHint: 'openrouter.ai/keys',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    fallbackModels: models('openrouter', [
      ['google/gemini-2.0-flash-exp:free', 'Gemini 2.0 Flash'],
      ['deepseek/deepseek-chat-v3:free', 'DeepSeek Chat V3'],
      ['deepseek/deepseek-r1:free', 'DeepSeek R1 (Thinking)'],
      ['qwen/qwen-2.5-72b-instruct:free', 'Qwen 2.5 72B'],
      ['openai/gpt-4o-mini', 'GPT-4o Mini'],
      ['anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
    ]),
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    shortName: 'OA',
    description: 'GPT models via the OpenAI platform API',
    authMode: 'api-key',
    keyPlaceholder: 'sk-proj-...',
    keyHint: 'platform.openai.com/api-keys',
    defaultModel: 'gpt-5.4-mini',
    fallbackModels: models('openai', [
      ['gpt-5.5', 'GPT-5.5'],
      ['gpt-5.4', 'GPT-5.4'],
      ['gpt-5.4-mini', 'GPT-5.4 Mini'],
      ['gpt-5.4-nano', 'GPT-5.4 Nano'],
      ['gpt-5.3-chat-latest', 'GPT-5.3 Chat'],
      ['gpt-4.1', 'GPT-4.1'],
      ['gpt-4o-mini', 'GPT-4o Mini'],
    ]),
  },
  {
    id: 'openai-codex',
    displayName: 'ChatGPT Codex',
    shortName: 'CX',
    description: 'Use Codex models with your ChatGPT plan',
    authMode: 'codex-oauth',
    keyPlaceholder: '',
    keyHint: 'ChatGPT Plus/Pro/Business Codex access',
    defaultModel: 'gpt-5.1-codex',
    fallbackModels: models('openai-codex', [
      ['gpt-5.5', 'GPT-5.5'],
      ['gpt-5.4', 'GPT-5.4'],
      ['gpt-5.4-mini', 'GPT-5.4 Mini'],
      ['gpt-5.3-codex', 'GPT-5.3 Codex'],
      ['gpt-5.2-codex', 'GPT-5.2 Codex'],
      ['gpt-5.1-codex-max', 'GPT-5.1 Codex Max'],
      ['gpt-5.1-codex', 'GPT-5.1 Codex'],
      ['gpt-5.1-codex-mini', 'GPT-5.1 Codex Mini'],
    ]),
  },
  {
    id: 'google-ai',
    displayName: 'Google AI',
    shortName: 'G',
    description: 'Gemini models via Google AI Studio',
    authMode: 'api-key',
    keyPlaceholder: 'AIza...',
    keyHint: 'aistudio.google.com/apikey',
    defaultModel: 'gemini-2.0-flash',
    fallbackModels: models('google-ai', [
      ['gemini-2.0-flash', 'Gemini 2.0 Flash'],
      ['gemini-2.5-flash-preview-04-17', 'Gemini 2.5 Flash Preview'],
      ['gemini-2.5-pro-preview-03-25', 'Gemini 2.5 Pro Preview'],
      ['gemini-1.5-pro', 'Gemini 1.5 Pro'],
    ]),
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    shortName: 'A',
    description: 'Claude models via Anthropic API',
    authMode: 'api-key',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-5-haiku-20241022',
    fallbackModels: models('anthropic', [
      ['claude-sonnet-4-20250514', 'Claude Sonnet 4'],
      ['claude-3-7-sonnet-20250219', 'Claude 3.7 Sonnet'],
      ['claude-3-5-haiku-20241022', 'Claude 3.5 Haiku'],
      ['claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet v2'],
    ]),
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    shortName: 'MM',
    description: 'MiniMax M2.7 and M1 models',
    authMode: 'api-key',
    keyPlaceholder: 'eyJ...',
    keyHint: 'platform.minimax.io',
    defaultModel: 'MiniMax-M2.7',
    fallbackModels: models('minimax', [
      ['MiniMax-M2.7', 'MiniMax M2.7'],
      ['MiniMax-M2.7-highspeed', 'MiniMax M2.7 Highspeed'],
      ['MiniMax-M2.5', 'MiniMax M2.5'],
      ['MiniMax-M2.5-highspeed', 'MiniMax M2.5 Highspeed'],
      ['MiniMax-M2.1', 'MiniMax M2.1'],
      ['MiniMax-M2.1-highspeed', 'MiniMax M2.1 Highspeed'],
      ['MiniMax-M2', 'MiniMax M2'],
    ]),
  },
  {
    id: 'cloudflare-ai',
    displayName: 'Cloudflare AI',
    shortName: 'CF',
    description: 'Free tier: 10K neurons/day — Llama, Mistral, Gemma',
    authMode: 'api-key',
    keyPlaceholder: 'Bearer token...',
    keyHint: 'dash.cloudflare.com/profile/api-tokens',
    keyLabel: 'API Token',
    setupFields: [
      {
        id: 'cloudflare-account-id',
        label: 'Account ID',
        placeholder: 'Cloudflare Account ID',
        hint: 'Found in your Cloudflare dashboard URL',
        requiredMessage: 'Please enter your Cloudflare Account ID',
      },
    ],
    defaultModel: '@cf/openai/gpt-oss-120b',
    fallbackModels: models('cloudflare-ai', [
      ['@cf/openai/gpt-oss-120b', 'GPT-OSS 120B'],
      ['@cf/openai/gpt-oss-20b', 'GPT-OSS 20B'],
      ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'Llama 3.3 70B'],
      ['@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', 'DeepSeek R1 Distill 32B'],
      ['@cf/qwen/qwq-32b', 'QwQ 32B'],
      ['@cf/meta/llama-3.2-3b-instruct', 'Llama 3.2 3B'],
      ['@cf/meta/llama-3.2-1b-instruct', 'Llama 3.2 1B'],
      ['@hf/mistral/mistral-7b-instruct-v0.2', 'Mistral 7B v0.2'],
      ['@hf/google/gemma-7b-it', 'Gemma 7B'],
    ]),
  },
];

/** ChatScreen's old getDefaultModel() `default:` branch. */
const UNKNOWN_PROVIDER_DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

/** Ids that are not AI providers, or that would hit Object.prototype on a plain lookup. */
const UNKNOWN_IDS = ['', 'tavily', 'image-gen', 'OpenRouter', 'constructor', 'toString', '__proto__'];

describe('provider catalog', () => {
  it('lists providers in the shipped display order', () => {
    const order = EXPECTED.map((info) => info.id);
    assert.deepEqual([...PROVIDER_IDS], order);
    assert.deepEqual(
      listProviderInfo().map((info) => info.id),
      order
    );
  });

  it('has unique ids, each matching its catalog key', () => {
    assert.equal(new Set(PROVIDER_IDS).size, PROVIDER_IDS.length);
    assert.deepEqual(Object.keys(PROVIDER_CATALOG).sort(), [...PROVIDER_IDS].sort());
    for (const [key, info] of Object.entries(PROVIDER_CATALOG)) {
      assert.equal(info.id, key);
    }
  });

  it('has unique display and short names', () => {
    const infos = listProviderInfo();
    assert.equal(new Set(infos.map((info) => info.displayName)).size, infos.length);
    assert.equal(new Set(infos.map((info) => info.shortName)).size, infos.length);
  });

  for (const expected of EXPECTED) {
    it(`${expected.id} keeps its pre-catalog values`, () => {
      assert.deepEqual(getProviderInfo(expected.id), expected);
    });
  }

  it('defaults to OpenRouter', () => {
    assert.equal(DEFAULT_PROVIDER_ID, 'openrouter');
  });
});

describe('fallback models', () => {
  for (const info of EXPECTED) {
    it(`${info.id}: tagged with the provider, unique, and offer the default model`, () => {
      const list = getFallbackModels(info.id);
      assert.ok(list.length > 0);
      for (const model of list) {
        assert.equal(model.provider, info.id);
        // Hard rule: fallback lists never hardcode context windows or capabilities.
        assert.deepEqual(Object.keys(model).sort(), ['id', 'name', 'provider']);
      }
      assert.equal(new Set(list.map((model) => model.id)).size, list.length);
      assert.ok(
        list.some((model) => model.id === info.defaultModel),
        `${info.defaultModel} missing from the ${info.id} fallback list`
      );
    });
  }

  it('keeps MINIMAX_MODELS and CLOUDFLARE_FALLBACK_MODELS as the catalog lists', () => {
    assert.equal(PROVIDER_CATALOG.minimax.fallbackModels, MINIMAX_MODELS);
    assert.equal(PROVIDER_CATALOG['cloudflare-ai'].fallbackModels, CLOUDFLARE_FALLBACK_MODELS);
  });

  it('is empty for unknown providers', () => {
    for (const id of UNKNOWN_IDS) {
      assert.deepEqual(getFallbackModels(id), [], id);
    }
  });
});

describe('lookups', () => {
  it('recognizes only catalog ids', () => {
    for (const id of PROVIDER_IDS) {
      assert.equal(isProviderId(id), true, id);
    }
    for (const id of UNKNOWN_IDS) {
      assert.equal(isProviderId(id), false, id);
      assert.equal(getProviderInfo(id), undefined, id);
    }
  });

  it('getDefaultModel matches the old switch, including its default branch', () => {
    for (const info of EXPECTED) {
      assert.equal(getDefaultModel(info.id), info.defaultModel);
    }
    for (const id of UNKNOWN_IDS) {
      assert.equal(getDefaultModel(id), UNKNOWN_PROVIDER_DEFAULT_MODEL, id);
    }
  });

  it('getProviderDisplayName falls back to the raw id', () => {
    for (const info of EXPECTED) {
      assert.equal(getProviderDisplayName(info.id), info.displayName);
    }
    for (const id of UNKNOWN_IDS) {
      assert.equal(getProviderDisplayName(id), id);
    }
  });
});

describe('findMissingSetupField', () => {
  const cloudflare = PROVIDER_CATALOG['cloudflare-ai'];
  const accountId = cloudflare.setupFields?.[0];

  it('passes providers without setup fields', () => {
    assert.equal(findMissingSetupField(PROVIDER_CATALOG.openrouter, {}), undefined);
  });

  it('reports a blank or whitespace-only field', () => {
    assert.ok(accountId);
    assert.equal(findMissingSetupField(cloudflare, {}), accountId);
    assert.equal(findMissingSetupField(cloudflare, { 'cloudflare-account-id': '' }), accountId);
    assert.equal(findMissingSetupField(cloudflare, { 'cloudflare-account-id': '  \n' }), accountId);
  });

  it('passes once every field has a value', () => {
    assert.equal(findMissingSetupField(cloudflare, { 'cloudflare-account-id': ' abc123 ' }), undefined);
  });
});

describe('registry coverage', () => {
  // registry.ts loads provider classes that import expo, so read the sources
  // instead of importing them: every require('./x') in registerBuiltInProviders()
  // must be a class whose `id` has a catalog entry, and vice versa.
  it('has a catalog entry for every provider registered in registry.ts', () => {
    const registry = readFileSync(join(import.meta.dirname, 'registry.ts'), 'utf8');
    const modules = [...registry.matchAll(/require\('\.\/([\w-]+)'\)/g)].map((match) => match[1]);
    assert.ok(modules.length > 0, 'no providers found in registry.ts');

    const registeredIds = modules.map((name) => {
      const source = readFileSync(join(import.meta.dirname, `${name}.ts`), 'utf8');
      const match = /^\s+id = '([^']+)';$/m.exec(source);
      assert.ok(match, `${name}.ts: no \`id = '...'\` field on the provider class`);
      return match[1];
    });

    assert.deepEqual([...registeredIds].sort(), [...PROVIDER_IDS].sort());
  });
});
