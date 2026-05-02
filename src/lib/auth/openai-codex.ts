import { fetch } from 'expo/fetch';
import { saveApiKey } from '@/lib/storage/secure';

export const OPENAI_CODEX_PROVIDER_ID = 'openai-codex';
export const OPENAI_CODEX_DEVICE_URL = 'https://auth.openai.com/codex/device';
export const OPENAI_CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';

const ISSUER = 'https://auth.openai.com';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const DEVICE_CALLBACK_URL = 'https://auth.openai.com/deviceauth/callback';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export interface CodexDeviceAuthorization {
  deviceAuthId: string;
  userCode: string;
  intervalMs: number;
  expiresAt: number;
}

export interface CodexOAuthTokens {
  type: 'oauth';
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
}

interface DeviceCodeResponse {
  device_auth_id: string;
  user_code: string;
  interval?: string;
  expires_in?: number;
}

interface DeviceTokenResponse {
  authorization_code: string;
  code_verifier: string;
}

interface TokenResponse {
  id_token?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

interface JwtClaims {
  chatgpt_account_id?: string;
  organizations?: { id?: string }[];
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string;
  };
}

export async function requestCodexDeviceAuthorization(): Promise<CodexDeviceAuthorization> {
  const response = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'medha/1.0',
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start ChatGPT sign-in (${response.status})`);
  }

  const data = await response.json() as DeviceCodeResponse;
  const interval = Math.max(Number(data.interval ?? 5), 1) * 1000;
  const expiresIn = Number(data.expires_in ?? 15 * 60);

  return {
    deviceAuthId: data.device_auth_id,
    userCode: data.user_code,
    intervalMs: interval,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function pollCodexDeviceAuthorization(
  device: CodexDeviceAuthorization,
  signal?: AbortSignal
): Promise<CodexOAuthTokens> {
  while (!signal?.aborted) {
    if (Date.now() > device.expiresAt) {
      throw new Error('ChatGPT sign-in code expired. Start sign-in again.');
    }

    const response = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'medha/1.0',
      },
      body: JSON.stringify({
        device_auth_id: device.deviceAuthId,
        user_code: device.userCode,
      }),
      signal,
    });

    if (response.ok) {
      const data = await response.json() as DeviceTokenResponse;
      return await exchangeCodeForTokens(data.authorization_code, data.code_verifier);
    }

    if (response.status !== 403 && response.status !== 404) {
      throw new Error(`ChatGPT sign-in failed (${response.status})`);
    }

    await sleep(device.intervalMs + 3000, signal);
  }

  throw new Error('ChatGPT sign-in cancelled.');
}

export function parseCodexCredential(value: string): CodexOAuthTokens | null {
  try {
    const parsed = JSON.parse(value) as Partial<CodexOAuthTokens>;
    if (
      parsed.type === 'oauth'
      && typeof parsed.access === 'string'
      && typeof parsed.refresh === 'string'
      && typeof parsed.expires === 'number'
    ) {
      return parsed as CodexOAuthTokens;
    }
  } catch {
    // Not a Codex OAuth credential.
  }
  return null;
}

export function serializeCodexCredential(tokens: CodexOAuthTokens): string {
  return JSON.stringify(tokens);
}

export async function ensureCodexAccessToken(serialized: string): Promise<CodexOAuthTokens> {
  const tokens = parseCodexCredential(serialized);
  if (!tokens) {
    throw new Error('ChatGPT sign-in is not configured.');
  }

  if (Date.now() + TOKEN_REFRESH_MARGIN_MS < tokens.expires) {
    return tokens;
  }

  const refreshed = await refreshCodexTokens(tokens.refresh, tokens.accountId);
  await saveApiKey(OPENAI_CODEX_PROVIDER_ID, serializeCodexCredential(refreshed));
  return refreshed;
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<CodexOAuthTokens> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: DEVICE_CALLBACK_URL,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`ChatGPT token exchange failed (${response.status})`);
  }

  return tokenResponseToCredential(await response.json() as TokenResponse);
}

async function refreshCodexTokens(
  refreshToken: string,
  fallbackAccountId?: string
): Promise<CodexOAuthTokens> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`ChatGPT token refresh failed (${response.status})`);
  }

  return tokenResponseToCredential(await response.json() as TokenResponse, fallbackAccountId);
}

function tokenResponseToCredential(
  response: TokenResponse,
  fallbackAccountId?: string
): CodexOAuthTokens {
  const accountId = extractAccountId(response) || fallbackAccountId;
  return {
    type: 'oauth',
    access: response.access_token,
    refresh: response.refresh_token,
    expires: Date.now() + Number(response.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000,
    ...(accountId ? { accountId } : {}),
  };
}

function extractAccountId(tokens: TokenResponse): string | undefined {
  const idClaims = tokens.id_token ? parseJwtClaims(tokens.id_token) : undefined;
  const accessClaims = tokens.access_token ? parseJwtClaims(tokens.access_token) : undefined;
  return extractAccountIdFromClaims(idClaims) || extractAccountIdFromClaims(accessClaims);
}

function extractAccountIdFromClaims(claims?: JwtClaims): string | undefined {
  return claims?.chatgpt_account_id
    || claims?.['https://api.openai.com/auth']?.chatgpt_account_id
    || claims?.organizations?.find((org) => org.id)?.id;
}

function parseJwtClaims(token: string): JwtClaims | undefined {
  const [, payload] = token.split('.');
  if (!payload) return undefined;
  try {
    return JSON.parse(base64UrlDecode(payload)) as JwtClaims;
  } catch {
    return undefined;
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = base64DecodeToBinary(padded);
  return decodeURIComponent(
    Array.from(binary)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
  );
}

function base64DecodeToBinary(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const char of value) {
    if (char === '=') break;
    const index = alphabet.indexOf(char);
    if (index === -1) continue;

    buffer = (buffer << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('ChatGPT sign-in cancelled.'));
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new Error('ChatGPT sign-in cancelled.'));
    }, { once: true });
  });
}
