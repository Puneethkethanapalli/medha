#!/usr/bin/env node

// Provider → LiteLLM prefixes come from the app's catalog (`litellmPrefix`), so
// this check can't drift from litellm-registry.ts. The catalog is plain data
// with type-only imports, which Node loads directly by stripping the types.
const { getProviderInfo } = require('../src/lib/providers/catalog.ts');

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

function getLookupKeys(modelId, provider) {
  const keys = [];
  const normalized = modelId.replace(/:free$/, '');
  const add = (key) => {
    if (key && !keys.includes(key)) keys.push(key);
  };

  add(modelId);
  add(normalized);

  const prefix = getProviderInfo(provider)?.litellmPrefix;
  if (prefix) add(`${prefix}/${normalized}`);

  const slashIdx = normalized.indexOf('/');
  if (slashIdx !== -1) {
    const upstreamProvider = normalized.slice(0, slashIdx);
    const upstreamModelId = normalized.slice(slashIdx + 1);

    if (provider === 'openrouter') {
      add(`openrouter/${normalized}`);
    }

    if (upstreamProvider === 'openai' || upstreamProvider === 'anthropic') {
      add(upstreamModelId);
    } else if (upstreamProvider === 'google') {
      add(`gemini/${upstreamModelId}`);
    } else {
      add(normalized);
    }
  }

  return keys;
}

function getCapabilities(entry) {
  const capabilities = [];
  const inputModalities = new Set((entry.supported_modalities || []).map((value) => value.toLowerCase()));
  const outputModalities = new Set((entry.supported_output_modalities || []).map((value) => value.toLowerCase()));
  const mode = (entry.mode || '').toLowerCase();
  const contextWindow = entry.max_input_tokens || entry.max_tokens;

  if (entry.supports_vision || inputModalities.has('image')) capabilities.push('vision');
  if (mode === 'image_generation' || mode === 'image-generation' || outputModalities.has('image')) {
    capabilities.push('image-gen');
  }
  if (entry.supports_pdf_input || inputModalities.has('pdf') || inputModalities.has('file')) {
    capabilities.push('pdf');
  }
  if (entry.supports_function_calling || entry.supports_parallel_function_calling || entry.supports_tool_choice) {
    capabilities.push('tools');
  }
  if (entry.supports_reasoning) capabilities.push('thinking');
  if (typeof contextWindow === 'number' && contextWindow > 100000) capabilities.push('long-context');

  return capabilities;
}

async function main() {
  const [provider, modelId] = process.argv.slice(2);

  if (!provider || !modelId) {
    console.error('Usage: npm run check:litellm -- <provider> <model-id>');
    console.error('Example: npm run check:litellm -- minimax MiniMax-M2.5');
    process.exit(1);
  }

  const response = await fetch(LITELLM_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch LiteLLM registry: HTTP ${response.status}`);
  }

  const registry = await response.json();
  delete registry.sample_spec;

  const keys = getLookupKeys(modelId, provider);
  const matchedKey = keys.find((key) => registry[key]);
  const entry = matchedKey ? registry[matchedKey] : null;

  console.log(`LiteLLM registry: ${LITELLM_URL}`);
  console.log(`Provider: ${provider}`);
  console.log(`Model: ${modelId}`);
  console.log('');
  console.log('Lookup keys tried:');
  for (const key of keys) {
    console.log(`- ${key}${key === matchedKey ? '  [MATCH]' : ''}`);
  }
  console.log('');

  if (!entry) {
    console.log('Result: no LiteLLM metadata found');
    process.exit(2);
  }

  console.log('Result: LiteLLM metadata found');
  console.log(`Matched key: ${matchedKey}`);
  console.log(`LiteLLM provider: ${entry.litellm_provider || '(missing)'}`);
  console.log(`Mode: ${entry.mode || '(missing)'}`);
  console.log(`Context window: ${entry.max_input_tokens || entry.max_tokens || '(missing)'}`);
  console.log(`Max output tokens: ${entry.max_output_tokens || '(missing)'}`);
  console.log(`Capabilities: ${getCapabilities(entry).join(', ') || '(none derived)'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
