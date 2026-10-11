import AsyncStorage from '@react-native-async-storage/async-storage';

export type Theme = 'dark' | 'light' | 'oled';

export type ThinkingMode = 'auto' | 'on' | 'off';

const KEYS = {
  theme: 'medha:theme',
  lastModel: 'medha:lastModel',
  lastModelName: 'medha:lastModelName',
  lastProvider: 'medha:lastProvider',
  cachedModels: 'medha:cachedModels',
  onboardingComplete: 'medha:onboardingComplete',
  biometricLockEnabled: 'medha:biometricLockEnabled',
  thinkingMode: 'medha:thinkingMode',
  customCommands: 'medha:customCommands',
  webSearchEnabled: 'medha:webSearchEnabled',
  globalRules: 'medha:globalRules',
  memoryEnabled: 'medha:memoryEnabled',
  memoryIntroSeen: 'medha:memoryIntroSeen',
  memoryAutoEnabled: 'medha:memoryAutoEnabled',
  memoryChatHistoryEnabled: 'medha:memoryChatHistoryEnabled',
  memoryProfile: 'medha:memoryProfile',
  imageGenService: 'medha:imageGenService',
  imageGenEnabled: 'medha:imageGenEnabled',
  cloudflareAccountId: 'medha:cloudflareAccountId',
};

export type ImageGenService = 'openai' | 'stability';

// Image generation service
export async function getImageGenService(): Promise<ImageGenService> {
  const value = await AsyncStorage.getItem(KEYS.imageGenService);
  if (value === 'stability') return 'stability';
  return 'openai';
}

export async function setImageGenService(service: ImageGenService): Promise<void> {
  await AsyncStorage.setItem(KEYS.imageGenService, service);
  _imageGenService = service;
}

// Image generation enabled
export async function isImageGenEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.imageGenEnabled);
  return value === 'true';
}

export async function setImageGenEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.imageGenEnabled, String(enabled));
  _imageGenEnabled = enabled;
}

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

// Last selected model display name
export async function getLastModelName(): Promise<string | null> {
  return await AsyncStorage.getItem(KEYS.lastModelName);
}

export async function setLastModelName(modelName: string | null): Promise<void> {
  if (modelName) {
    await AsyncStorage.setItem(KEYS.lastModelName, modelName);
  } else {
    await AsyncStorage.removeItem(KEYS.lastModelName);
  }
  _lastModelName = modelName;
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

// Cached model lists, keyed by provider
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

// Memory enabled — on by default; only an explicit "off" disables it
export async function isMemoryEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.memoryEnabled);
  return value !== 'false';
}

export async function setMemoryEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.memoryEnabled, String(enabled));
  _memoryEnabled = enabled;
}

// One-time "Memory is on" notice
export async function isMemoryIntroSeen(): Promise<boolean> {
  const [seen, enabled] = await Promise.all([
    AsyncStorage.getItem(KEYS.memoryIntroSeen),
    AsyncStorage.getItem(KEYS.memoryEnabled),
  ]);
  // Someone who switched memory on themselves already knows about it.
  return seen === 'true' || enabled === 'true';
}

export async function setMemoryIntroSeen(seen: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.memoryIntroSeen, String(seen));
  _memoryIntroSeen = seen;
}

// Learn memories from chats automatically (on by default once memory is enabled)
export async function isMemoryAutoEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.memoryAutoEnabled);
  return value !== 'false';
}

export async function setMemoryAutoEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.memoryAutoEnabled, String(enabled));
  _memoryAutoEnabled = enabled;
}

// Let the AI search past chats (on by default once memory is enabled)
export async function isMemoryChatHistoryEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.memoryChatHistoryEnabled);
  return value !== 'false';
}

export async function setMemoryChatHistoryEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.memoryChatHistoryEnabled, String(enabled));
  _memoryChatHistoryEnabled = enabled;
}

/** Short summary of the user, regenerated from memories and recent chats. */
export interface MemoryProfile {
  content: string;
  generatedAt: number;
  /** True once the user edits it; automatic refresh pauses until they regenerate. */
  userEdited: boolean;
  /** Memory state when generated, used to tell whether anything changed since. */
  fingerprint: string;
  model?: string;
}

export async function getMemoryProfile(): Promise<MemoryProfile | null> {
  const value = await AsyncStorage.getItem(KEYS.memoryProfile);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as MemoryProfile;
    return typeof parsed?.content === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function setMemoryProfile(profile: MemoryProfile | null): Promise<void> {
  if (profile) {
    await AsyncStorage.setItem(KEYS.memoryProfile, JSON.stringify(profile));
  } else {
    await AsyncStorage.removeItem(KEYS.memoryProfile);
  }
  _memoryProfile = profile;
}

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
let _lastModelName: string | null = null;
let _lastProvider: string | null = null;
let _onboardingComplete = false;
let _biometricLockEnabled = false;
let _thinkingMode: ThinkingMode = 'auto';
let _customCommands: StoredCustomCommand[] = [];
let _webSearchEnabled = false;
let _globalRules: RuleItem[] = DEFAULT_RULES.map((r) => ({ ...r }));
let _memoryEnabled = true;
let _memoryIntroSeen = false;
let _memoryAutoEnabled = true;
let _memoryChatHistoryEnabled = true;
let _memoryProfile: MemoryProfile | null = null;
let _imageGenService: ImageGenService = 'openai';
let _imageGenEnabled = false;
let _cloudflareAccountId: string | null = null;
let _initialized = false;

export function getThemeSync(): Theme {
  return _theme;
}

export function getLastModelSync(): string | null {
  return _lastModel;
}

export function getLastModelNameSync(): string | null {
  return _lastModelName;
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

export function isMemoryEnabledSync(): boolean {
  return _memoryEnabled;
}

export function isMemoryIntroSeenSync(): boolean {
  return _memoryIntroSeen;
}

export function isMemoryAutoEnabledSync(): boolean {
  return _memoryAutoEnabled;
}

export function isMemoryChatHistoryEnabledSync(): boolean {
  return _memoryChatHistoryEnabled;
}

export function getMemoryProfileSync(): MemoryProfile | null {
  return _memoryProfile;
}

export function getImageGenServiceSync(): ImageGenService {
  return _imageGenService;
}

export function isImageGenEnabledSync(): boolean {
  return _imageGenEnabled;
}

// Cloudflare Account ID
export async function getCloudflareAccountId(): Promise<string | null> {
  return await AsyncStorage.getItem(KEYS.cloudflareAccountId);
}

export async function setCloudflareAccountId(accountId: string | null): Promise<void> {
  if (accountId) {
    await AsyncStorage.setItem(KEYS.cloudflareAccountId, accountId);
  } else {
    await AsyncStorage.removeItem(KEYS.cloudflareAccountId);
  }
  _cloudflareAccountId = accountId;
}

export function getCloudflareAccountIdSync(): string | null {
  return _cloudflareAccountId;
}

export async function initStorage(): Promise<void> {
  if (_initialized) return;
  const theme = await getTheme();
  const lastModel = await getLastModel();
  const lastModelName = await getLastModelName();
  const lastProvider = await getLastProvider();
  const onboarding = await isOnboardingComplete();
  const biometric = await isBiometricLockEnabled();
  const thinking = await getThinkingMode();
  const customCmds = await getCustomCommands();
  const webSearch = await isWebSearchEnabled();
  const globalRules = await getGlobalRules();
  const memoryEnabled = await isMemoryEnabled();
  const memoryAutoEnabled = await isMemoryAutoEnabled();
  const memoryIntroSeen = await isMemoryIntroSeen();
  const memoryChatHistoryEnabled = await isMemoryChatHistoryEnabled();
  const memoryProfile = await getMemoryProfile();
  const imageGenService = await getImageGenService();
  const imageGenEnabled = await isImageGenEnabled();
  const cfAccountId = await getCloudflareAccountId();
  _theme = theme;
  _lastModel = lastModel;
  _lastModelName = lastModelName;
  _lastProvider = lastProvider;
  _onboardingComplete = onboarding;
  _biometricLockEnabled = biometric;
  _thinkingMode = thinking;
  _customCommands = customCmds;
  _webSearchEnabled = webSearch;
  _globalRules = globalRules;
  _memoryEnabled = memoryEnabled;
  _memoryAutoEnabled = memoryAutoEnabled;
  _memoryIntroSeen = memoryIntroSeen;
  _memoryChatHistoryEnabled = memoryChatHistoryEnabled;
  _memoryProfile = memoryProfile;
  _imageGenService = imageGenService;
  _imageGenEnabled = imageGenEnabled;
  _cloudflareAccountId = cfAccountId;
  _initialized = true;
}
