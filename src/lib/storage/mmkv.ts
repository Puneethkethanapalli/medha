import AsyncStorage from '@react-native-async-storage/async-storage';

export type Theme = 'dark' | 'light' | 'oled';

export type ThinkingMode = 'auto' | 'on' | 'off';

const KEYS = {
  theme: 'medha:theme',
  lastModel: 'medha:lastModel',
  lastProvider: 'medha:lastProvider',
  cachedModels: 'medha:cachedModels',
  onboardingComplete: 'medha:onboardingComplete',
  biometricLockEnabled: 'medha:biometricLockEnabled',
  thinkingMode: 'medha:thinkingMode',
};

// Theme
export async function getTheme(): Promise<Theme> {
  const value = await AsyncStorage.getItem(KEYS.theme);
  if (value === 'light' || value === 'oled') return value;
  return 'dark';
}

export async function setTheme(theme: Theme): Promise<void> {
  await AsyncStorage.setItem(KEYS.theme, theme);
}

// Last selected model
export async function getLastModel(): Promise<string | null> {
  return await AsyncStorage.getItem(KEYS.lastModel);
}

export async function setLastModel(model: string | null): Promise<void> {
  if (model) {
    await AsyncStorage.setItem(KEYS.lastModel, model);
  } else {
    await AsyncStorage.removeItem(KEYS.lastModel);
  }
  _lastModel = model;
}

// Last selected provider
export async function getLastProvider(): Promise<string | null> {
  return await AsyncStorage.getItem(KEYS.lastProvider);
}

export async function setLastProvider(provider: string | null): Promise<void> {
  if (provider) {
    await AsyncStorage.setItem(KEYS.lastProvider, provider);
  } else {
    await AsyncStorage.removeItem(KEYS.lastProvider);
  }
  _lastProvider = provider;
}

// Cached model list (from OpenRouter)
export async function getCachedModels(): Promise<string | null> {
  return await AsyncStorage.getItem(KEYS.cachedModels);
}

export async function setCachedModels(modelsJson: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.cachedModels, modelsJson);
}

// Onboarding completed
export async function isOnboardingComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.onboardingComplete);
  return value === 'true';
}

export async function setOnboardingComplete(complete: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.onboardingComplete, String(complete));
}

// Biometric lock enabled
export async function isBiometricLockEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.biometricLockEnabled);
  return value === 'true';
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.biometricLockEnabled, String(enabled));
}

// Thinking mode
export async function getThinkingMode(): Promise<ThinkingMode> {
  const value = await AsyncStorage.getItem(KEYS.thinkingMode);
  if (value === 'on' || value === 'off') return value;
  return 'auto';
}

export async function setThinkingMode(mode: ThinkingMode): Promise<void> {
  await AsyncStorage.setItem(KEYS.thinkingMode, mode);
  _thinkingMode = mode;
}

// Synchronous wrappers for compatibility (read from in-memory cache)
let _theme: Theme = 'dark';
let _lastModel: string | null = null;
let _lastProvider: string | null = null;
let _onboardingComplete = false;
let _biometricLockEnabled = false;
let _thinkingMode: ThinkingMode = 'auto';
let _initialized = false;

export function getThemeSync(): Theme {
  return _theme;
}

export function getLastModelSync(): string | null {
  return _lastModel;
}

export function getLastProviderSync(): string | null {
  return _lastProvider;
}

export function isOnboardingCompleteSync(): boolean {
  return _onboardingComplete;
}

export function isBiometricLockEnabledSync(): boolean {
  return _biometricLockEnabled;
}

export function getThinkingModeSync(): ThinkingMode {
  return _thinkingMode;
}

export async function initStorage(): Promise<void> {
  if (_initialized) return;
  const theme = await getTheme();
  const lastModel = await getLastModel();
  const lastProvider = await getLastProvider();
  const onboarding = await isOnboardingComplete();
  const biometric = await isBiometricLockEnabled();
  const thinking = await getThinkingMode();
  _theme = theme;
  _lastModel = lastModel;
  _lastProvider = lastProvider;
  _onboardingComplete = onboarding;
  _biometricLockEnabled = biometric;
  _thinkingMode = thinking;
  _initialized = true;
}