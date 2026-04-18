import AsyncStorage from '@react-native-async-storage/async-storage';

export type Theme = 'dark' | 'light' | 'oled';

const KEYS = {
  theme: 'medha:theme',
  lastModel: 'medha:lastModel',
  cachedModels: 'medha:cachedModels',
  onboardingComplete: 'medha:onboardingComplete',
  biometricLockEnabled: 'medha:biometricLockEnabled',
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

// Synchronous wrappers for compatibility (read from in-memory cache)
let _theme: Theme = 'dark';
let _lastModel: string | null = null;
let _onboardingComplete = false;
let _biometricLockEnabled = false;
let _initialized = false;

export function getThemeSync(): Theme {
  return _theme;
}

export function getLastModelSync(): string | null {
  return _lastModel;
}

export function isOnboardingCompleteSync(): boolean {
  return _onboardingComplete;
}

export function isBiometricLockEnabledSync(): boolean {
  return _biometricLockEnabled;
}

export async function initStorage(): Promise<void> {
  if (_initialized) return;
  const theme = await getTheme();
  const lastModel = await getLastModel();
  const onboarding = await isOnboardingComplete();
  const biometric = await isBiometricLockEnabled();
  _theme = theme;
  _lastModel = lastModel;
  _onboardingComplete = onboarding;
  _biometricLockEnabled = biometric;
  _initialized = true;
}