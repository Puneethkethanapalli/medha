/**
 * Persistence for the provider setup fields declared in catalog.ts
 * (`ProviderInfo.setupFields`). Kept out of the catalog because storage pulls
 * in native modules, and the catalog has to stay loadable in Node.
 */
import { setCloudflareAccountId } from '@/lib/storage/mmkv';
import type { ProviderInfo, ProviderSetupFieldId, ProviderSetupValues } from './catalog';

/** Each setup field's storage setter; `null` clears the stored value. */
const SETUP_FIELD_SETTERS: Record<ProviderSetupFieldId, (value: string | null) => Promise<void>> = {
  'cloudflare-account-id': setCloudflareAccountId,
};

/**
 * Save every setup field's trimmed value, in declaration order. Call only
 * after `findMissingSetupField()` reports nothing missing.
 */
export async function saveProviderSetupFields(
  provider: Pick<ProviderInfo, 'setupFields'>,
  values: ProviderSetupValues
): Promise<void> {
  for (const field of provider.setupFields ?? []) {
    await SETUP_FIELD_SETTERS[field.id]((values[field.id] ?? '').trim());
  }
}

/** Clear a provider's stored setup fields, e.g. when its key is deleted. */
export async function clearProviderSetupFields(
  provider: Pick<ProviderInfo, 'setupFields'>
): Promise<void> {
  for (const field of provider.setupFields ?? []) {
    await SETUP_FIELD_SETTERS[field.id](null);
  }
}
