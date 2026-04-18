import type { AIProvider } from './types';

const providers = new Map<string, AIProvider>();

export function registerProvider(provider: AIProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): AIProvider | undefined {
  return providers.get(id);
}

export function listProviders(): AIProvider[] {
  return Array.from(providers.values());
}

export function registerBuiltInProviders(): void {
  // Lazy import to avoid circular dependencies
  const { OpenRouterProvider } = require('./openrouter');
  registerProvider(new OpenRouterProvider());
}