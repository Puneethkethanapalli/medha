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
  customCommands: 'medha:customCommands',
  webSearchEnabled: 'medha:webSearchEnabled',
  globalRules: 'medha:globalRules',
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

// Web search enabled
export async function isWebSearchEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.webSearchEnabled);
  return value === 'true';
}

export async function setWebSearchEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.webSearchEnabled, String(enabled));
  _webSearchEnabled = enabled;
}

// Custom slash commands
export interface StoredCustomCommand {
  id: string;
  name: string;
  label: string;
  description: string;
  template: string;
  action: 'prepend' | 'wrap' | 'standalone';
  enabled: boolean;
}

export async function getCustomCommands(): Promise<StoredCustomCommand[]> {
  const value = await AsyncStorage.getItem(KEYS.customCommands);
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export async function setCustomCommands(commands: StoredCustomCommand[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.customCommands, JSON.stringify(commands));
  _customCommands = commands;
}

export interface RuleItem {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  isCustom: boolean;
}

/** Default built-in rule presets */
export const DEFAULT_RULES: RuleItem[] = [
  { id: 'preset-concise', label: 'Be concise', description: 'Always be concise and avoid filler words. Get straight to the point.', enabled: false, isCustom: false },
  { id: 'preset-code', label: 'Always use code examples', description: 'Whenever explaining technical concepts, include a practical code example.', enabled: false, isCustom: false },
  { id: 'preset-hindi', label: 'Respond in Hindi', description: 'Always respond in Hindi unless explicitly asked otherwise.', enabled: false, isCustom: false },
  { id: 'preset-el15', label: 'Explain like I\'m 5', description: 'Explain everything as if I am 5 years old. Use simple analogies and avoid jargon.', enabled: false, isCustom: false },
  { id: 'preset-formal', label: 'Use formal tone', description: 'Always use a formal, professional tone. Avoid slang and contractions.', enabled: false, isCustom: false },
];

// Global rules (stored as JSON array of RuleItem)
export async function getGlobalRules(): Promise<RuleItem[]> {
  const value = await AsyncStorage.getItem(KEYS.globalRules);
  if (!value) return DEFAULT_RULES.map((r) => ({ ...r }));
  try {
    const parsed = JSON.parse(value) as RuleItem[];
    if (Array.isArray(parsed)) return parsed;
    return DEFAULT_RULES.map((r) => ({ ...r }));
  } catch {
    return DEFAULT_RULES.map((r) => ({ ...r }));
  }
}

export async function setGlobalRules(rules: RuleItem[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.globalRules, JSON.stringify(rules));
  _globalRules = rules;
}

// Synchronous wrappers for compatibility (read from in-memory cache)
let _theme: Theme = 'dark';
let _lastModel: string | null = null;
let _lastProvider: string | null = null;
let _onboardingComplete = false;
let _biometricLockEnabled = false;
let _thinkingMode: ThinkingMode = 'auto';
let _customCommands: StoredCustomCommand[] = [];
let _webSearchEnabled = false;
let _globalRules: RuleItem[] = DEFAULT_RULES.map((r) => ({ ...r }));
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

export function getCustomCommandsSync(): StoredCustomCommand[] {
  return _customCommands;
}

export function isWebSearchEnabledSync(): boolean {
  return _webSearchEnabled;
}

export function getGlobalRulesSync(): RuleItem[] {
  return _globalRules;
}

export async function initStorage(): Promise<void> {
  if (_initialized) return;
  const theme = await getTheme();
  const lastModel = await getLastModel();
  const lastProvider = await getLastProvider();
  const onboarding = await isOnboardingComplete();
  const biometric = await isBiometricLockEnabled();
  const thinking = await getThinkingMode();
  const customCmds = await getCustomCommands();
  const webSearch = await isWebSearchEnabled();
  const globalRules = await getGlobalRules();
  _theme = theme;
  _lastModel = lastModel;
  _lastProvider = lastProvider;
  _onboardingComplete = onboarding;
  _biometricLockEnabled = biometric;
  _thinkingMode = thinking;
  _customCommands = customCmds;
  _webSearchEnabled = webSearch;
  _globalRules = globalRules;
  _initialized = true;
}