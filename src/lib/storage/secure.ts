import * as SecureStore from 'expo-secure-store';

const KEYS_PREFIX = 'medha_api_key_';

export async function saveApiKey(provider: string, key: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS_PREFIX + provider, key);
}

export async function getApiKey(provider: string): Promise<string | null> {
  const value = await SecureStore.getItemAsync(KEYS_PREFIX + provider);
  return value;
}

export async function deleteApiKey(provider: string): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS_PREFIX + provider);
}

export async function hasApiKey(provider: string): Promise<boolean> {
  const key = await SecureStore.getItemAsync(KEYS_PREFIX + provider);
  return key !== null;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}