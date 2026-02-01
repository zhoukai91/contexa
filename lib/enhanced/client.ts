import 'server-only';

import { env } from '@/lib/env';
import { getCoreInstanceId, getEnhancedSessionTokens, setEnhancedSessionTokens, setLastSuccessfulHeartbeat } from '@/lib/enhanced/state';

export type EnhancedConnectionState =
  | { connected: false; reason: 'not_configured' | 'unreachable' }
  | { connected: true };

export type EnhancedSystemStatus =
  | (EnhancedConnectionState & {
      licenseStatus: 'unknown';
    })
  | (EnhancedConnectionState & {
      licenseStatus: 'unactivated' | 'active' | 'expired';
      expiresAt?: string | null;
    });

async function getHeaders(options?: { includeSessionToken?: boolean }) {
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };

  const instanceId = await getCoreInstanceId();

  if (env.ENHANCED_CORE_SECRET) {
    headers['x-core-secret'] = env.ENHANCED_CORE_SECRET;
  }
  headers['x-core-instance-id'] = instanceId;

  if (options?.includeSessionToken) {
    const { currentToken } = await getEnhancedSessionTokens();
    if (currentToken) {
      headers['x-tms-session-token'] = currentToken;
    }
  }
  return headers;
}

export async function getEnhancedSystemStatus(): Promise<EnhancedSystemStatus> {
  if (!env.ENHANCED_SERVICE_URL) {
    return { connected: false, reason: 'not_configured', licenseStatus: 'unknown' };
  }

  try {
    const res = await fetch(`${env.ENHANCED_SERVICE_URL}/api/internal/system/status`, {
      method: 'GET',
      headers: await getHeaders(),
      cache: 'no-store'
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      return { connected: false, reason: 'unreachable', licenseStatus: 'unknown' };
    }
    return {
      connected: true,
      licenseStatus: json.data?.licenseStatus ?? 'unknown',
      expiresAt: json.data?.expiresAt ?? null
    };
  } catch {
    return { connected: false, reason: 'unreachable', licenseStatus: 'unknown' };
  }
}

export async function activateEnhancedLicense(input: {
  licenseKey: string;
}): Promise<EnhancedConnectionState> {
  if (!env.ENHANCED_SERVICE_URL) {
    return { connected: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(`${env.ENHANCED_SERVICE_URL}/api/internal/license/activate`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(input),
      cache: 'no-store'
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      return { connected: false, reason: 'unreachable' };
    }
    return { connected: true };
  } catch {
    return { connected: false, reason: 'unreachable' };
  }
}

export type PlatformApiConfigInput = {
  llmProvider?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  mtProvider?: string;
  mtBaseUrl?: string;
  mtApiKey?: string;
};

export async function savePlatformApiConfig(
  input: PlatformApiConfigInput
): Promise<EnhancedConnectionState> {
  if (!env.ENHANCED_SERVICE_URL) {
    return { connected: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(`${env.ENHANCED_SERVICE_URL}/api/internal/platform-api-config`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(input),
      cache: 'no-store'
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      return { connected: false, reason: 'unreachable' };
    }
    return { connected: true };
  } catch {
    return { connected: false, reason: 'unreachable' };
  }
}

export async function heartbeatEnhanced(): Promise<EnhancedConnectionState> {
  if (!env.ENHANCED_SERVICE_URL) {
    return { connected: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(`${env.ENHANCED_SERVICE_URL}/api/internal/heartbeat`, {
      method: 'POST',
      headers: await getHeaders({ includeSessionToken: true }),
      body: JSON.stringify({}),
      cache: 'no-store'
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok || !json?.data?.sessionToken) {
      return { connected: false, reason: 'unreachable' };
    }

    const { currentToken } = await getEnhancedSessionTokens();
    await setEnhancedSessionTokens({
      currentToken: json.data.sessionToken,
      previousToken: currentToken
    });
    await setLastSuccessfulHeartbeat(new Date());

    return { connected: true };
  } catch {
    return { connected: false, reason: 'unreachable' };
  }
}
