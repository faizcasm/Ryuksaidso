import { decryptJson, encryptJson } from './crypto';
import { getProvider, type ProviderDef } from './catalog';
import { USER_AGENT, errorMessage } from '../util';

export type TokenBundle = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string | null;
  tokenType?: string;
  scope?: string;
  shop?: string;
  extra?: Record<string, unknown>;
};

export type ConnectionSummary = {
  id: string;
  provider: string;
  name: string;
  status: string;
  authType: string;
  profile: Record<string, unknown> | null;
  scopes: string[];
  lastSyncAt: string | null;
  lastCheckedAt: string | null;
  lastError: string;
  createdAt: string;
  updatedAt: string;
};

const REFRESH_SKEW_MS = 120_000;
const REQUEST_TIMEOUT_MS = 15_000;

export function connectionSummary(connection: any): ConnectionSummary {
  return {
    id: String(connection.id),
    provider: String(connection.provider),
    name: String(connection.name ?? ''),
    status: String(connection.status ?? 'CONNECTED'),
    authType: String(connection.authType ?? 'oauth2'),
    profile: (connection.profile as Record<string, unknown> | null) ?? null,
    scopes: Array.isArray(connection.scopes) ? connection.scopes.map(String) : [],
    lastSyncAt: connection.lastSyncAt ? new Date(connection.lastSyncAt).toISOString() : null,
    lastCheckedAt: connection.lastCheckedAt ? new Date(connection.lastCheckedAt).toISOString() : null,
    lastError: String(connection.lastError ?? ''),
    createdAt: new Date(connection.createdAt).toISOString(),
    updatedAt: new Date(connection.updatedAt ?? connection.createdAt).toISOString(),
  };
}

export function loadTokens(connection: { encryptedTokens?: string | null }): TokenBundle | null {
  const payload = String(connection.encryptedTokens ?? '');
  if (!payload) return null;
  try {
    const bundle = decryptJson<TokenBundle>(payload);
    if (!bundle || typeof bundle.accessToken !== 'string' || !bundle.accessToken) return null;
    return bundle;
  } catch {
    return null;
  }
}

export function saveTokens(bundle: TokenBundle): string {
  return encryptJson(bundle);
}

export function isTokenExpiring(bundle: TokenBundle, skewMs = REFRESH_SKEW_MS): boolean {
  if (!bundle.expiresAt) return false;
  const expiry = Date.parse(bundle.expiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry - Date.now() <= skewMs;
}

export async function getIntegrationSetting(prisma: any): Promise<{ enabled: boolean; disabledProviders: string[] }> {
  try {
    const row = await prisma.integrationSetting.findUnique({ where: { id: 'global' } });
    if (!row) return { enabled: true, disabledProviders: [] };
    return {
      enabled: row.enabled !== false,
      disabledProviders: Array.isArray(row.disabledProviders) ? row.disabledProviders.map(String) : [],
    };
  } catch {
    return { enabled: true, disabledProviders: [] };
  }
}

export async function assertProviderUsable(prisma: any, providerKey: string): Promise<void> {
  const setting = await getIntegrationSetting(prisma);
  if (!setting.enabled) throw new Error('Integrations are disabled by an administrator');
  if (setting.disabledProviders.includes(String(providerKey))) {
    throw new Error(`The ${providerKey} integration is disabled by an administrator`);
  }
}

export async function findConnection(prisma: any, organizationId: string, provider: string): Promise<any | null> {
  return prisma.integrationConnection.findFirst({
    where: { organizationId, provider: String(provider).toLowerCase() },
  });
}

export async function requireUsableConnection(prisma: any, organizationId: string, provider: string): Promise<any> {
  const providerDef = getProvider(provider);
  if (!providerDef) throw new Error(`Unknown integration provider "${provider}"`);
  await assertProviderUsable(prisma, providerDef.key);
  const connection = await findConnection(prisma, organizationId, providerDef.key);
  if (!connection) throw new Error(`The ${providerDef.name} integration is not connected`);
  if (connection.status === 'DISCONNECTED') throw new Error(`The ${providerDef.name} integration was disconnected`);
  return connection;
}

function templateUrl(url: string, shop?: string): string {
  if (!shop) return url;
  return url.replace('{shop}', shop.toLowerCase());
}

function clientCredentials(provider: ProviderDef): { clientId: string; clientSecret: string } {
  const clientId = process.env[provider.envKeys[0]]?.trim() ?? '';
  const clientSecret = process.env[provider.envKeys[1]]?.trim() ?? '';
  if (!clientId || !clientSecret) throw new Error(`${provider.name} OAuth is not configured`);
  return { clientId, clientSecret };
}

function parseTokenResponse(provider: ProviderDef, data: any): TokenBundle {
  if (data?.error) throw new Error(String(data.error_description ?? data.error));
  if (provider.key === 'slack' && data?.ok === false) throw new Error(String(data.error ?? 'Slack token exchange failed'));
  const accessToken = String(data?.access_token ?? '');
  if (!accessToken) throw new Error(`${provider.name} did not return an access token`);
  const expiresIn = Number(data?.expires_in ?? 0);
  const bundle: TokenBundle = {
    accessToken,
    tokenType: String(data?.token_type ?? 'Bearer'),
    scope: String(data?.scope ?? provider.oauth?.scopes.join(' ') ?? ''),
  };
  if (data?.refresh_token) bundle.refreshToken = String(data.refresh_token);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    bundle.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  } else {
    bundle.expiresAt = null;
  }
  return bundle;
}

export function authorizeUrlFor(
  provider: ProviderDef,
  opts: { redirectUri: string; state: string; shop?: string; codeChallenge?: string },
): string {
  if (!provider.oauth) throw new Error(`${provider.name} does not use OAuth`);
  const url = new URL(templateUrl(provider.oauth.authorizeUrl, opts.shop));
  url.searchParams.set('client_id', clientCredentials(provider).clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('response_type', 'code');
  if (provider.oauth.scopes.length) url.searchParams.set('scope', provider.oauth.scopes.join(' '));
  url.searchParams.set('state', opts.state);
  for (const [key, value] of Object.entries(provider.oauth.extraAuthorizeParams ?? {})) {
    url.searchParams.set(key, value);
  }
  if (opts.codeChallenge) {
    url.searchParams.set('code_challenge', opts.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

async function postForm(url: string, body: Record<string, string>, headers: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': USER_AGENT,
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const detail =
      data && typeof data === 'object'
        ? String(data.error_description ?? data.error ?? data.message ?? '')
        : String(data ?? '').slice(0, 200);
    throw new Error(`${providerLabel(url)} request failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  return data;
}

function providerLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'token';
  }
}

export async function exchangeAuthorizationCode(
  provider: ProviderDef,
  opts: { code: string; redirectUri: string; verifier?: string; shop?: string },
): Promise<TokenBundle> {
  const oauth = provider.oauth;
  if (!oauth) throw new Error(`${provider.name} does not use OAuth`);
  const { clientId, clientSecret } = clientCredentials(provider);
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: clientId,
  };
  const headers: Record<string, string> = { ...(oauth.tokenHeaders ?? {}) };
  if (oauth.clientAuth === 'basic') {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.client_secret = clientSecret;
  }
  if (opts.verifier) body.code_verifier = opts.verifier;
  if (oauth.templated) {
    if (!opts.shop) throw new Error('Shop domain is required for this integration');
    body.shop = opts.shop;
  }
  const data = await postForm(templateUrl(oauth.tokenUrl, opts.shop), body, headers);
  const bundle = parseTokenResponse(provider, data);
  if (oauth.templated && opts.shop) bundle.shop = opts.shop.toLowerCase();
  return bundle;
}

export async function refreshAccessToken(
  provider: ProviderDef,
  refreshToken: string,
  shop?: string,
): Promise<TokenBundle> {
  const oauth = provider.oauth;
  if (!oauth) throw new Error(`${provider.name} does not use OAuth`);
  if (!oauth.supportsRefresh) throw new Error(`${provider.name} tokens cannot be refreshed`);
  const { clientId, clientSecret } = clientCredentials(provider);
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  };
  const headers: Record<string, string> = { ...(oauth.tokenHeaders ?? {}) };
  if (oauth.clientAuth === 'basic') {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.client_secret = clientSecret;
  }
  const data = await postForm(templateUrl(oauth.tokenUrl, shop), body, headers);
  const bundle = parseTokenResponse(provider, data);
  if (!bundle.refreshToken) bundle.refreshToken = refreshToken;
  return bundle;
}

export async function fetchProfile(provider: ProviderDef, bundle: TokenBundle): Promise<Record<string, unknown> | null> {
  const oauth = provider.oauth;
  if (!oauth?.profileUrl || !oauth.profileMap) return null;
  try {
    const response = await fetch(oauth.profileUrl, {
      headers: { accept: 'application/json', authorization: `${bundle.tokenType || 'Bearer'} ${bundle.accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const mapped = oauth.profileMap(data) ?? {};
    return {
      name: mapped.name ?? '',
      email: mapped.email ?? '',
      organization: mapped.organization ?? '',
      remoteId: String(data?.sub ?? data?.id ?? data?.team?.id ?? ''),
    };
  } catch {
    return null;
  }
}

export async function recordIntegrationLog(
  prisma: any,
  entry: {
    organizationId: string;
    connectionId?: string | null;
    provider: string;
    level?: 'info' | 'warn' | 'error';
    event: string;
    message?: string;
    metadata?: unknown;
  },
): Promise<void> {
  try {
    await prisma.integrationLog.create({
      data: {
        organizationId: entry.organizationId,
        connectionId: entry.connectionId ?? null,
        provider: entry.provider,
        level: entry.level ?? 'info',
        event: entry.event,
        message: String(entry.message ?? '').slice(0, 2000),
        ...(entry.metadata !== undefined ? { metadata: entry.metadata as any } : {}),
      },
    });
  } catch {
    return;
  }
}

export type ResolvedTokens = { tokens: TokenBundle; connection: any };

export async function resolveConnectionTokens(prisma: any, organizationId: string, providerKey: string): Promise<ResolvedTokens> {
  const connection = await requireUsableConnection(prisma, organizationId, providerKey);
  const provider = getProvider(providerKey);
  if (!provider) throw new Error(`Unknown integration provider "${providerKey}"`);
  const tokens = loadTokens(connection);
  if (!tokens) throw new Error(`The ${provider.name} integration has no stored credentials — reconnect it`);
  const needsRefresh =
    provider.oauth?.supportsRefresh === true &&
    Boolean(tokens.refreshToken) &&
    isTokenExpiring(tokens);
  if (!needsRefresh) return { tokens, connection };
  try {
    const refreshed = await refreshAccessToken(provider, tokens.refreshToken!, tokens.shop);
    const encrypted = saveTokens(refreshed);
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { encryptedTokens: encrypted, lastError: '', status: 'CONNECTED', lastCheckedAt: new Date() },
    });
    await recordIntegrationLog(prisma, {
      organizationId,
      connectionId: connection.id,
      provider: provider.key,
      event: 'token_refreshed',
      message: `${provider.name} access token refreshed`,
    });
    return { tokens: refreshed, connection: { ...connection, encryptedTokens: encrypted } };
  } catch (error) {
    const message = errorMessage(error);
    const expired = /invalid_grant|expired|revoked/i.test(message);
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: expired ? 'EXPIRED' : 'ERROR', lastError: message.slice(0, 500), lastCheckedAt: new Date() },
    });
    await recordIntegrationLog(prisma, {
      organizationId,
      connectionId: connection.id,
      provider: provider.key,
      level: 'error',
      event: 'token_refresh_failed',
      message,
    });
    throw new Error(expired ? `${provider.name} authorization expired — reconnect the integration` : message);
  }
}

async function probe(url: string, init: RequestInit = {}): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, detail: `${response.status} ${text.slice(0, 160)}` };
    return { ok: true, detail: 'ok' };
  } catch (error) {
    return { ok: false, detail: errorMessage(error).slice(0, 200) };
  }
}

export async function testConnection(prisma: any, connection: any): Promise<{ ok: boolean; detail: string }> {
  const provider = getProvider(connection.provider);
  if (!provider) return { ok: false, detail: 'unknown provider' };
  let result: { ok: boolean; detail: string };
  if (provider.key === 'teams') {
    const tokens = loadTokens(connection);
    const url = tokens?.accessToken ?? '';
    if (!url) return { ok: false, detail: 'no webhook URL stored' };
    result = await probe(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [{ type: 'TextBlock', text: 'Ryuksaidso connection check', weight: 'bolder', size: 'Medium' }],
            },
          },
        ],
      }),
    });
  } else if (provider.key === 'whatsapp') {
    const tokens = loadTokens(connection);
    const phoneId = String((tokens?.extra as any)?.phoneNumberId ?? '');
    if (!tokens?.accessToken || !phoneId) return { ok: false, detail: 'missing token or phone number ID' };
    result = await probe(`https://graph.facebook.com/v20.0/${phoneId}?fields=id,name`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
  } else if (provider.key === 'slack') {
    const { tokens } = await resolveConnectionTokens(prisma, connection.organizationId, provider.key);
    try {
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.accessToken}` },
        body: '{}',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data: any = await res.json().catch(() => ({}));
      result = res.ok && data?.ok !== false ? { ok: true, detail: 'ok' } : { ok: false, detail: String(data?.error ?? `slack ${res.status}`) };
    } catch (error) {
      result = { ok: false, detail: errorMessage(error).slice(0, 200) };
    }
  } else if (provider.key === 'shopify') {
    const { tokens } = await resolveConnectionTokens(prisma, connection.organizationId, provider.key);
    if (!tokens.shop) return { ok: false, detail: 'missing shop domain' };
    result = await probe(`https://${tokens.shop}/admin/api/2024-10/shop.json?fields=id,name,domain`, {
      headers: { 'x-shopify-access-token': tokens.accessToken },
    });
  } else {
    const { tokens } = await resolveConnectionTokens(prisma, connection.organizationId, provider.key);
    if (provider.oauth?.profileUrl) {
      result = await probe(provider.oauth.profileUrl, {
        headers: { authorization: `${tokens.tokenType || 'Bearer'} ${tokens.accessToken}` },
      });
    } else {
      result = { ok: Boolean(tokens.accessToken), detail: 'stored credentials present' };
    }
  }
  await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: {
      status: result.ok ? 'CONNECTED' : 'ERROR',
      lastCheckedAt: new Date(),
      lastError: result.ok ? '' : result.detail.slice(0, 500),
    },
  });
  await recordIntegrationLog(prisma, {
    organizationId: connection.organizationId,
    connectionId: connection.id,
    provider: provider.key,
    level: result.ok ? 'info' : 'error',
    event: 'connection_tested',
    message: result.ok ? `${provider.name} connection healthy` : `${provider.name} check failed: ${result.detail}`,
  });
  return result;
}

export function tokenFieldsFromInput(provider: ProviderDef, fields: Record<string, unknown>): TokenBundle {
  const bundle: TokenBundle = { accessToken: '', expiresAt: null, extra: {} };
  for (const field of provider.tokenFields ?? []) {
    const value = String(fields[field.key] ?? '').trim();
    if (field.key === 'accessToken' || field.key === 'webhookUrl') {
      bundle.accessToken = value;
    } else {
      bundle.extra![field.key] = value;
    }
  }
  if (!bundle.accessToken) throw new Error('A credential value is required');
  if (provider.key === 'whatsapp') {
    const phone = String(bundle.extra?.phoneNumberId ?? '');
    if (!phone) throw new Error('Phone number ID is required');
  }
  return bundle;
}
