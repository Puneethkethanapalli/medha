import { create } from 'zustand';
import type { Theme } from '@/lib/storage/mmkv';

interface SettingsState {
  theme: Theme;
  lastModel: string | null;
  onboardingComplete: boolean;
  biometricLockEnabled: boolean;
  isInitialized: boolean;
}

interface SettingsActions {
  setTheme: (theme: Theme) => Promise<void>;
  setLastModel: (model: string | null) => Promise<void>;
  setOnboardingComplete: (complete: boolean) => Promise<void>;
  setBiometricLockEnabled: (enabled: boolean) => Promise<void>;
  validateApiKey: (provider: string, key: string) => Promise<boolean>;
  initialize: () => Promise<void>;
}

// Lazy-loaded module references
let mmkv: typeof import('@/lib/storage/mmkv') | null = null;
let secure: typeof import('@/lib/storage/secure') | null = null;
let openrouterProvider: typeof import('@/lib/providers/openrouter') | null = null;

const loadModules = async () => {
  if (!mmkv) mmkv = await import('@/lib/storage/mmkv');
  if (!secure) secure = await import('@/lib/storage/secure');
  if (!openrouterProvider) openrouterProvider = await import('@/lib/providers/openrouter');
};

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  // State
  theme: 'dark' as Theme,
  lastModel: null,
  onboardingComplete: false,
  biometricLockEnabled: false,
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

  validateApiKey: async (provider, key) => {
    await loadModules();
    if (provider === 'openrouter') {
      const provider = new openrouterProvider!.OpenRouterProvider();
      return await provider.validateKey(key);
    }
    return false;
  },

  initialize: async () => {
    await loadModules();
    await mmkv!.initStorage();
    set({
      theme: mmkv!.getThemeSync(),
      lastModel: mmkv!.getLastModelSync(),
      onboardingComplete: mmkv!.isOnboardingCompleteSync(),
      biometricLockEnabled: mmkv!.isBiometricLockEnabledSync(),
      isInitialized: true,
    });
  },
}));

// Helper functions that use dynamic imports
export async function hasProviderKey(provider: string): Promise<boolean> {
  const secureModule = await import('@/lib/storage/secure');
  return await secureModule.hasApiKey(provider);
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