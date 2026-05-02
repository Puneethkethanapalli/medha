import type { ModelCapability } from '@/types';

// Known model capability overrides — these take precedence over heuristics
const KNOWN_CAPABILITIES: Record<string, ModelCapability[]> = {
  // OpenRouter / OpenAI
  'openai/gpt-4o': ['vision', 'tools', 'long-context'],
  'openai/gpt-4o-mini': ['vision', 'tools', 'long-context'],
  'openai/o1': ['tools', 'thinking', 'long-context'],
  'openai/o1-mini': ['tools', 'thinking', 'long-context'],
  'openai/o3': ['tools', 'thinking', 'long-context'],
  'openai/o3-mini': ['tools', 'thinking', 'long-context'],
  'openai/o4-mini': ['tools', 'thinking', 'long-context'],
  'openai/gpt-4-vision-preview': ['vision', 'tools'],
  'openai/gpt-4-turbo': ['vision', 'tools', 'long-context'],
  'openai/dall-e-3': ['image-gen'],
  'openai/gpt-4.1': ['vision', 'tools', 'long-context'],
  'openai/gpt-4.1-mini': ['vision', 'tools', 'long-context'],
  'openai/gpt-4.1-nano': ['vision', 'tools', 'long-context'],
  'openai/gpt-5.5': ['vision', 'tools', 'thinking', 'long-context'],
  'openai/gpt-5.4': ['vision', 'tools', 'thinking', 'long-context'],
  'openai/gpt-5.4-mini': ['vision', 'tools', 'thinking', 'long-context'],
  'openai/gpt-5.4-nano': ['vision', 'tools', 'thinking', 'long-context'],
  'openai/gpt-5.3-chat-latest': ['vision', 'tools', 'long-context'],
  'openai/gpt-5.1': ['vision', 'tools', 'thinking', 'long-context'],
  'openai/gpt-5': ['vision', 'tools', 'thinking', 'long-context'],

  // OpenAI direct
  'gpt-5.5': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5.4': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5.4-mini': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5.4-nano': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5.3-chat-latest': ['vision', 'tools', 'long-context'],
  'gpt-5.1': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5-chat-latest': ['vision', 'tools', 'long-context'],
  'gpt-5-mini': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5-nano': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-4o': ['vision', 'tools', 'long-context'],
  'gpt-4o-mini': ['vision', 'tools', 'long-context'],
  'gpt-4.1': ['vision', 'tools', 'long-context'],
  'gpt-4.1-mini': ['vision', 'tools', 'long-context'],
  'gpt-4.1-nano': ['vision', 'tools', 'long-context'],
  'o3': ['tools', 'thinking', 'long-context'],
  'o3-mini': ['tools', 'thinking', 'long-context'],
  'o4-mini': ['tools', 'thinking', 'long-context'],
  'gpt-5.3-codex': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5.2-codex': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5.1-codex-max': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5.1-codex': ['vision', 'tools', 'thinking', 'long-context'],
  'gpt-5.1-codex-mini': ['vision', 'tools', 'thinking', 'long-context'],

  // Anthropic
  'anthropic/claude-3-opus': ['vision', 'tools', 'pdf', 'long-context'],
  'anthropic/claude-3-5-sonnet': ['vision', 'tools', 'pdf', 'long-context'],
  'anthropic/claude-3-5-sonnet-20241022': ['vision', 'tools', 'pdf', 'long-context'],
  'anthropic/claude-3-7-sonnet': ['vision', 'tools', 'pdf', 'thinking', 'long-context'],
  'anthropic/claude-3-7-sonnet-20250219': ['vision', 'tools', 'pdf', 'thinking', 'long-context'],
  'anthropic/claude-sonnet-4': ['vision', 'tools', 'pdf', 'thinking', 'long-context'],
  'anthropic/claude-sonnet-4-20250514': ['vision', 'tools', 'pdf', 'thinking', 'long-context'],
  'anthropic/claude-3-5-haiku': ['tools', 'long-context'],
  'anthropic/claude-3-haiku': ['tools', 'long-context'],

  // Google AI
  'gemini-2.0-flash': ['vision', 'tools', 'pdf', 'image-gen', 'long-context'],
  'gemini-2.0-flash-exp': ['vision', 'tools', 'pdf', 'image-gen', 'long-context'],
  'gemini-2.0-pro': ['vision', 'tools', 'pdf', 'long-context'],
  'gemini-2.5-flash-preview-04-17': ['vision', 'tools', 'pdf', 'thinking', 'long-context'],
  'gemini-2.5-pro-preview-03-25': ['vision', 'tools', 'pdf', 'thinking', 'long-context'],
  'gemini-2.5-pro': ['vision', 'tools', 'pdf', 'thinking', 'long-context'],
  'gemini-2.5-flash': ['vision', 'tools', 'pdf', 'thinking', 'long-context'],
  'gemini-1.5-pro': ['vision', 'tools', 'pdf', 'long-context'],
  'gemini-1.5-flash': ['vision', 'tools', 'pdf', 'long-context'],
  'gemini-1.0-pro': ['tools', 'long-context'],

  // DeepSeek
  'deepseek/deepseek-chat': ['tools', 'long-context'],
  'deepseek/deepseek-chat-v3': ['tools', 'long-context'],
  'deepseek/deepseek-r1': ['thinking', 'long-context'],
  'deepseek/deepseek-r1-distill': ['thinking', 'long-context'],

  // Qwen
  'qwen/qwen-2.5-72b-instruct': ['vision', 'tools', 'long-context'],
  'qwen/qwen-2.5-vl': ['vision', 'tools', 'long-context'],
  'qwen/qwen-vl': ['vision', 'tools'],

  // MiniMax
  'MiniMax-M2.7': ['tools', 'thinking', 'long-context'],
  'MiniMax-M2.7-highspeed': ['tools', 'thinking', 'long-context'],
  'MiniMax-M1-80k': ['tools', 'thinking', 'long-context'],
  'MiniMax-M1-40k': ['tools', 'thinking', 'long-context'],

  // Cloudflare Workers AI
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': ['tools', 'long-context'],
  '@cf/meta/llama-3.1-8b-instruct': ['tools', 'long-context'],
  '@cf/meta/llama-3.1-70b-instruct': ['tools', 'long-context'],
  '@cf/meta/llama-3.2-3b-instruct': ['tools'],
  '@cf/meta/llama-3.2-1b-instruct': ['tools'],
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': ['thinking'],
  '@cf/openai/gpt-oss-120b': ['tools', 'long-context'],

  // Mistral
  'mistral/mistral-large': ['tools', 'long-context'],
  'mistral/mistral-medium': ['tools', 'long-context'],
  'mistral/mistral-small': ['tools', 'long-context'],
  'mistral/pixtral': ['vision', 'tools'],

  // Meta
  'meta/llama-3.1-70b': ['tools', 'long-context'],
  'meta/llama-3.1-405b': ['tools', 'long-context'],
  'meta/llama-3.2-90b-vision': ['vision', 'tools'],
  'meta/llama-3.2-11b-vision': ['vision', 'tools'],

  // Grok
  'x-ai/grok-2': ['vision', 'tools', 'long-context'],
  'x-ai/grok-2-mini': ['vision', 'tools', 'long-context'],
  'x-ai/grok-vision': ['vision', 'tools'],
};

// Long-context threshold (>100K tokens)
const LONG_CONTEXT_MODELS = [
  'claude-3',
  'claude-sonnet-4',
  'gemini-1.5',
  'gemini-2.0',
  'gemini-2.5',
  'gpt-4o',
  'gpt-5',
  'gpt-4-turbo',
  'gpt-4.1',
  'o1',
  'o3',
  'o4',
  'deepseek',
  'llama-3.1',
  'llama-3.2',
  'mistral-large',
  'grok-2',
  'MiniMax',
  '@cf/meta/llama-3.1',
  '@cf/meta/llama-3.3',
  '@cf/openai/gpt-oss',
];

const CONTEXT_WINDOW_MAP: Record<string, number> = {
  'claude-3-opus': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-7-sonnet': 200000,
  'claude-sonnet-4': 200000,
  'claude-3-5-haiku': 200000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
  'gemini-2.0-flash': 1000000,
  'gemini-2.0-pro': 2000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-pro': 1000000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4.1': 1000000,
  'gpt-4.1-mini': 1000000,
  'gpt-5.4-mini': 400000,
  'gpt-5.4-nano': 400000,
  'gpt-5.5': 1000000,
  'gpt-5.4': 1050000,
  'gpt-5.3-chat-latest': 128000,
  'gpt-5.1': 400000,
  'gpt-5-chat-latest': 128000,
  'gpt-5.3-codex': 400000,
  'gpt-5.2-codex': 400000,
  'gpt-5.1-codex-max': 400000,
  'gpt-5.1-codex': 400000,
  'gpt-5.1-codex-mini': 400000,
  'gpt-5-mini': 400000,
  'gpt-5-nano': 400000,
  'gpt-5': 400000,
  'o1': 200000,
  'o1-mini': 128000,
  'o3': 200000,
  'o3-mini': 200000,
  'o4-mini': 200000,
  'deepseek-chat': 64000,
  'deepseek-r1': 64000,
  'llama-3.1-70b': 128000,
  'llama-3.1-405b': 128000,
  'llama-3.2-90b': 128000,
  'llama-3.2-11b': 128000,
  'mistral-large': 128000,
  'grok-2': 128000,
  'MiniMax-M2.7': 1000000,
  'MiniMax-M1-80k': 80000,
  'MiniMax-M1-40k': 40000,
  'qwen-2.5-72b': 128000,
};

const capabilityCache = new Map<string, ModelCapability[]>();

function normalizeModelId(modelId: string): string {
  // Strip provider prefix and :free suffix for lookup
  let normalized = modelId;
  const slashIdx = normalized.indexOf('/');
  if (slashIdx !== -1) normalized = normalized.slice(slashIdx + 1);
  normalized = normalized.replace(/:free$/, '');
  return normalized;
}

function heuristicCapabilities(modelId: string, provider: string): ModelCapability[] {
  const caps: Set<ModelCapability> = new Set();
  const lowerId = modelId.toLowerCase();
  const normalized = normalizeModelId(modelId);
  const lowerNormalized = normalized.toLowerCase();

  // Vision: most modern models with 'vision', 'vl', 'gpt-4o', 'claude-3', 'gemini', 'pixtral', 'grok-vision', 'llama-3.2-vision' in name
  if (
    lowerNormalized.includes('vision') ||
    lowerNormalized.includes('vl') ||
    lowerNormalized.includes('gpt-5') ||
    lowerNormalized.includes('gpt-4o') ||
    lowerNormalized.includes('gpt-4.1') ||
    lowerNormalized.includes('pixtral') ||
    lowerNormalized.includes('grok-vision') ||
    lowerNormalized.includes('llama-3.2') ||
    (lowerNormalized.includes('claude-3') && !lowerNormalized.includes('haiku')) ||
    (lowerNormalized.includes('gemini') && !lowerNormalized.includes('1.0'))
  ) {
    caps.add('vision');
  }

  // Image gen: native image generation models (Gemini Imagen, DALL-E)
  if (
    lowerNormalized.includes('imagen') ||
    lowerNormalized.includes('dall-e') ||
    lowerId.includes('image-gen')
  ) {
    caps.add('image-gen');
  }

  // PDF: Anthropic and Gemini natively support PDFs
  if (
    provider === 'anthropic' ||
    provider === 'google-ai' ||
    lowerNormalized.includes('claude') ||
    lowerNormalized.includes('gemini')
  ) {
    caps.add('pdf');
  }

  // Tools: most modern instruction-tuned models
  if (
    lowerNormalized.includes('gpt-4') ||
    lowerNormalized.includes('gpt-5') ||
    lowerNormalized.includes('claude-3') ||
    lowerNormalized.includes('claude-sonnet') ||
    lowerNormalized.includes('gemini') ||
    lowerNormalized.includes('mistral') ||
    lowerNormalized.includes('llama-3') ||
    lowerNormalized.includes('deepseek') ||
    lowerNormalized.includes('qwen') ||
    lowerNormalized.includes('grok') ||
    lowerNormalized.includes('minimax')
  ) {
    caps.add('tools');
  }

  // Thinking: reasoning models
  if (
    lowerNormalized.includes('o1') ||
    lowerNormalized.includes('o3') ||
    lowerNormalized.includes('o4') ||
    (lowerNormalized.includes('gpt-5') && !lowerNormalized.includes('chat-latest')) ||
    lowerNormalized.includes('r1') ||
    lowerNormalized.includes('thinking') ||
    lowerNormalized.includes('codex') ||
    lowerNormalized.includes('deepseek-reasoner') ||
    lowerNormalized.includes('deepseek-r1') ||
    (lowerNormalized.includes('claude-3-7') || lowerNormalized.includes('claude-sonnet-4')) ||
    lowerNormalized.includes('gemini-2.5')
  ) {
    caps.add('thinking');
  }

  // Long context
  const isLongContext = LONG_CONTEXT_MODELS.some((pattern) =>
    lowerNormalized.includes(pattern.toLowerCase())
  );
  if (isLongContext) {
    caps.add('long-context');
  }

  return Array.from(caps);
}

export function getModelCapabilities(modelId: string, provider: string): ModelCapability[] {
  const cacheKey = `${provider}:${modelId}`;
  if (capabilityCache.has(cacheKey)) {
    return capabilityCache.get(cacheKey)!;
  }

  // 1. Check exact known overrides
  const known = KNOWN_CAPABILITIES[modelId];
  if (known) {
    capabilityCache.set(cacheKey, known);
    return known;
  }

  // 2. Check normalized known overrides (without provider prefix / :free)
  const normalized = normalizeModelId(modelId);
  const normalizedKnown = KNOWN_CAPABILITIES[normalized];
  if (normalizedKnown) {
    capabilityCache.set(cacheKey, normalizedKnown);
    return normalizedKnown;
  }

  // 3. Fallback to heuristics
  const caps = heuristicCapabilities(modelId, provider);
  capabilityCache.set(cacheKey, caps);
  return caps;
}

export function getModelContextWindow(modelId: string): number | undefined {
  const normalized = normalizeModelId(modelId);
  // Try exact match first
  if (CONTEXT_WINDOW_MAP[normalized] !== undefined) {
    return CONTEXT_WINDOW_MAP[normalized];
  }
  // Try prefix match
  for (const [key, value] of Object.entries(CONTEXT_WINDOW_MAP)) {
    if (normalized.toLowerCase().startsWith(key.toLowerCase())) {
      return value;
    }
  }
  return undefined;
}

export function hasCapability(
  modelId: string,
  provider: string,
  capability: ModelCapability
): boolean {
  return getModelCapabilities(modelId, provider).includes(capability);
}

export function getCapabilityLabel(cap: ModelCapability): string {
  const labels: Record<ModelCapability, string> = {
    vision: 'Vision',
    'image-gen': 'Image Generation',
    pdf: 'PDF',
    tools: 'Tools',
    thinking: 'Thinking',
    'long-context': 'Long Context',
  };
  return labels[cap];
}

export function getPremiumCapabilities(caps: ModelCapability[]): ModelCapability[] {
  // Only show "premium" capabilities in top bar — skip common ones like tools
  const premiumSet = new Set<ModelCapability>(['vision', 'thinking', 'image-gen']);
  return caps.filter((c) => premiumSet.has(c));
}
