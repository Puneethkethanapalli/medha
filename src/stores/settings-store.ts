import { create } from 'zustand';
import type { Theme, ThinkingMode, RuleItem, ImageGenService } from '@/lib/storage/mmkv';

interface SettingsState {
  theme: Theme;
  lastModel: string | null;
  lastProvider: string | null;
  onboardingComplete: boolean;
  biometricLockEnabled: boolean;
  thinkingMode: ThinkingMode;
  webSearchEnabled: boolean;
  globalRules: RuleItem[];
  memoryEnabled: boolean;
  imageGenEnabled: boolean;
  imageGenService: ImageGenService;
  isInitialized: boolean;
}

interface SettingsActions {
  setTheme: (theme: Theme) => Promise<void>;
  setLastModel: (model: string | null) => Promise<void>;
  setLastProvider: (provider: string | null) => Promise<void>;
  setOnboardingComplete: (complete: boolean) => Promise<void>;
  setBiometricLockEnabled: (enabled: boolean) => Promise<void>;
  setThinkingMode: (mode: ThinkingMode) => Promise<void>;
  setWebSearchEnabled: (enabled: boolean) => Promise<void>;
  setGlobalRules: (rules: RuleItem[]) => Promise<void>;
  setMemoryEnabled: (enabled: boolean) => Promise<void>;
  setImageGenEnabled: (enabled: boolean) => Promise<void>;
  setImageGenService: (service: ImageGenService) => Promise<void>;
  validateApiKey: (provider: string, key: string) => Promise<boolean>;
  initialize: () => Promise<void>;
}

// Lazy-loaded module references
let mmkv: typeof import('@/lib/storage/mmkv') | null = null;
let secure: typeof import('@/lib/storage/secure') | null = null;

const loadModules = async () => {
  if (!mmkv) mmkv = await import('@/lib/storage/mmkv');
  if (!secure) secure = await import('@/lib/storage/secure');
};

function getProviderInstance(providerId: string) {
  const { getProvider, registerBuiltInProviders, listProviders } = require('@/lib/providers/registry');
  // Ensure providers are registered
  if (listProviders().length === 0) {
    registerBuiltInProviders();
  }
  return getProvider(providerId);
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  // State
  theme: 'dark' as Theme,
  lastModel: null,
  lastProvider: null,
  onboardingComplete: false,
  biometricLockEnabled: false,
  thinkingMode: 'auto' as ThinkingMode,
  webSearchEnabled: false,
  globalRules: [],
  memoryEnabled: false,
  imageGenEnabled: false,
  imageGenService: 'openai' as ImageGenService,
  isInitialized: false,

  // Actions
  setTheme: async (theme) => {
    await loadModules();
    await mmkv!.setTheme(theme);
    set({ theme });
  },

  setLastModel: async (model) => {
    await loadModules();
    await mmkv!.setLastModel(model);
    set({ lastModel: model });
  },

  setLastProvider: async (provider) => {
    await loadModules();
    await mmkv!.setLastProvider(provider);
    set({ lastProvider: provider });
  },

  setOnboardingComplete: async (complete) => {
    await loadModules();
    await mmkv!.setOnboardingComplete(complete);
    set({ onboardingComplete: complete });
  },

  setBiometricLockEnabled: async (enabled) => {
    await loadModules();
    await mmkv!.setBiometricLockEnabled(enabled);
    set({ biometricLockEnabled: enabled });
  },

  setThinkingMode: async (mode) => {
    await loadModules();
    await mmkv!.setThinkingMode(mode);
    set({ thinkingMode: mode });
  },

  setWebSearchEnabled: async (enabled) => {
    await loadModules();
    await mmkv!.setWebSearchEnabled(enabled);
    set({ webSearchEnabled: enabled });
  },

  setGlobalRules: async (rules) => {
    await loadModules();
    await mmkv!.setGlobalRules(rules);
    set({ globalRules: rules });
  },

  setMemoryEnabled: async (enabled) => {
    await loadModules();
    await mmkv!.setMemoryEnabled(enabled);
    set({ memoryEnabled: enabled });
  },

  setImageGenEnabled: async (enabled) => {
    await loadModules();
    await mmkv!.setImageGenEnabled(enabled);
    set({ imageGenEnabled: enabled });
  },

  setImageGenService: async (service) => {
    await loadModules();
    await mmkv!.setImageGenService(service);
    set({ imageGenService: service });
  },

  validateApiKey: async (providerId, key) => {
    const provider = getProviderInstance(providerId);
    if (!provider) return false;
    return await provider.validateKey(key);
  },

  initialize: async () => {
    await loadModules();
    await mmkv!.initStorage();
    set({
      theme: mmkv!.getThemeSync(),
      lastModel: mmkv!.getLastModelSync(),
      lastProvider: mmkv!.getLastProviderSync(),
      onboardingComplete: mmkv!.isOnboardingCompleteSync(),
      biometricLockEnabled: mmkv!.isBiometricLockEnabledSync(),
      thinkingMode: mmkv!.getThinkingModeSync(),
      webSearchEnabled: mmkv!.isWebSearchEnabledSync(),
      globalRules: mmkv!.getGlobalRulesSync(),
      memoryEnabled: mmkv!.isMemoryEnabledSync(),
      imageGenEnabled: mmkv!.isImageGenEnabledSync(),
      imageGenService: mmkv!.getImageGenServiceSync(),
      isInitialized: true,
    });
  },
}));

// Helper functions that use dynamic imports
export async function hasProviderKey(provider: string): Promise<boolean> {
  const secureModule = await import('@/lib/storage/secure');
  return await secureModule.hasApiKey(provider);
}

export async function hasAnyProviderKey(): Promise<boolean> {
  const providers = ['openrouter', 'google-ai', 'anthropic', 'minimax', 'cloudflare-ai'];
  for (const p of providers) {
    if (await hasProviderKey(p)) return true;
  }
  return false;
}

export async function getConfiguredProviders(): Promise<string[]> {
  const allProviders = ['openrouter', 'google-ai', 'anthropic', 'minimax', 'cloudflare-ai'];
  const configured: string[] = [];
  for (const p of allProviders) {
    if (await hasProviderKey(p)) configured.push(p);
  }
  return configured;
}

export async function saveProviderKey(provider: string, key: string): Promise<void> {
  const secureModule = await import('@/lib/storage/secure');
  await secureModule.saveApiKey(provider, key);
}

export async function deleteProviderKey(provider: string): Promise<void> {
  const secureModule = await import('@/lib/storage/secure');
  await secureModule.deleteApiKey(provider);
}

export function maskKey(key: string): string {
  // Import sychronously for simple masking
  const { maskApiKey } = require('@/lib/storage/secure');
  return maskApiKey(key);
}