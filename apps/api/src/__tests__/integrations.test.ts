import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../server';
import { signToken } from '../lib/auth';
import { prisma } from '../lib/db';
import { redis } from '../lib/redis';
import { assertQuota } from '../lib/entitlements';
import { enqueueRun } from '../services/queue';
import {
  encryptJson,
  decryptJson,
  signIntegrationState,
  verifyIntegrationState,
  webhookSignature,
  randomWebhookSecret,
  randomWidgetKey,
  INTEGRATION_PROVIDERS,
  WEBHOOK_EVENTS,
  getProvider,
  providerConfigured,
  authorizeUrlFor,
  exchangeAuthorizationCode,
  loadTokens,
  saveTokens,
  isTokenExpiring,
  connectionSummary,
  tokenFieldsFromInput,
  assertProviderUsable,
  buildWebhookBody,
  webhookHeaders,
  emitWebhookEvent,
  deliverDelivery,
  sweepPendingDeliveries,
  runDueSyncs,
  syncKnowledgeSource,
  buildIntegrationTools,
} from '@ryuksaidso/agent-tools';

vi.mock('../lib/db', () => ({
  prisma: {
    integrationSetting: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    integrationConnection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    integrationLog: { create: vi.fn(), findMany: vi.fn() },
    knowledgeSource: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    webhookEndpoint: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    webhookDelivery: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    widgetSetting: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    widgetSession: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    widgetMessage: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    agent: { findFirst: vi.fn(), findMany: vi.fn() },
    agentRun: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    agentStep: { findMany: vi.fn() },
    organization: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    billingSetting: { findUnique: vi.fn() },
    billingPlan: { findFirst: vi.fn(), findUnique: vi.fn() },
    billingSubscription: { findFirst: vi.fn(), findMany: vi.fn() },
    document: { findFirst: vi.fn(), create: vi.fn() },
    apiKey: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    membership: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    publish: vi.fn(),
    quit: vi.fn(),
    eval: vi.fn(),
    exists: vi.fn(),
  },
}));

vi.mock('../services/queue', () => ({
  agentQueue: { add: vi.fn() },
  enqueueRun: vi.fn(async () => ({ id: 'job1' })),
}));

vi.mock('../lib/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/entitlements')>();
  return { ...actual, assertQuota: vi.fn(async () => undefined) };
});

const NOW = new Date('2026-10-01T00:00:00.000Z');
const app = createApp();
const OWNER_TOKEN = signToken({ id: 'u1', email: 'owner@test.local', name: 'Owner', organizationId: 'org1', role: 'OWNER' });
const VIEWER_TOKEN = signToken({ id: 'u2', email: 'viewer@test.local', name: 'Viewer', organizationId: 'org1', role: 'VIEWER' });

function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'x-csrf-token': 'test-csrf-token',
    Cookie: 'ryuksaidso_csrf=test-csrf-token',
  };
}

function widgetSettingFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wset1',
    organizationId: 'org1',
    publicKey: 'wgt_testkey123',
    enabled: true,
    agentId: 'agent1',
    title: 'Chat with us',
    greeting: 'Hi there!',
    accent: '#8b5cf6',
    allowedOrigins: [] as string[],
    collectEmail: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function connectionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'con1',
    organizationId: 'org1',
    provider: 'teams',
    name: 'Teams',
    status: 'CONNECTED',
    authType: 'token',
    encryptedTokens: encryptJson({ accessToken: 'https://outlook.office.com/webhook/abc' }),
    profile: {},
    scopes: [] as string[],
    lastSyncAt: null,
    lastCheckedAt: NOW,
    lastError: '',
    connectedBy: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function endpointFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep1',
    organizationId: 'org1',
    name: 'Zapier',
    url: 'https://hooks.example.com/ryuksaidso',
    secret: 'whsec_testsecret',
    events: ['ticket.created'],
    active: true,
    lastDeliveryAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function deliveryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'del1',
    endpointId: 'ep1',
    organizationId: 'org1',
    event: 'ticket.created',
    eventId: 'ev1',
    status: 'PENDING',
    payload: { hello: 'world' },
    attempts: 0,
    lastError: '',
    deliveredAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(prisma.integrationSetting.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.integrationLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.integrationLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.knowledgeSource.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.webhookEndpoint.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.webhookEndpoint.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.widgetSession.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.widgetMessage.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.agent.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.agentRun.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.agentStep.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.$transaction).mockImplementation((async (arg: any) => arg) as any);
  vi.mocked(redis.get).mockResolvedValue(null);
  vi.mocked(redis.set).mockResolvedValue('OK');
  vi.mocked(redis.del).mockResolvedValue(1);
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GITHUB_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('integration credential crypto', () => {
  it('round-trips encrypted JSON credentials', () => {
    const payload = encryptJson({ accessToken: 'tok_abc', refreshToken: 'ref_xyz' });
    expect(payload).not.toContain('tok_abc');
    expect(decryptJson<{ accessToken: string }>(payload).accessToken).toBe('tok_abc');
  });

  it('rejects tampered ciphertext', () => {
    const payload = encryptJson({ accessToken: 'tok_abc' });
    const [iv, tag, data] = payload.split('.');
    const broken = `${iv}.${tag}.${Buffer.from('{"accessToken":"evil"}').toString('base64')}`;
    expect(() => decryptJson(broken)).toThrow();
    expect(data).toBeTruthy();
  });

  it('signs and verifies OAuth state payloads', () => {
    const token = signIntegrationState({ organizationId: 'org1', provider: 'gmail' });
    const parsed = verifyIntegrationState(token);
    expect(parsed).toMatchObject({ organizationId: 'org1', provider: 'gmail' });
  });

  it('returns null for tampered OAuth state', () => {
    const token = signIntegrationState({ organizationId: 'org1' });
    const [body] = token.split('.');
    expect(verifyIntegrationState(`${body}.forged-signature-value`)).toBeNull();
  });

  it('creates webhook secrets and widget keys with expected prefixes', () => {
    expect(randomWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9_-]+$/);
    expect(randomWidgetKey()).toMatch(/^wgt_[A-Za-z0-9_-]+$/);
  });

  it('produces webhook signatures a receiver can verify', () => {
    const secret = 'whsec_abc';
    const body = buildWebhookBody('ticket.created', 'ev1', { ticketId: 't1' });
    const headers = webhookHeaders(secret, 'ev1', 'ticket.created', body);
    const timestamp = String(headers['x-ryuksaidso-timestamp']);
    expect(headers['x-ryuksaidso-event']).toBe('ticket.created');
    expect(headers['x-ryuksaidso-signature']).toBe(`sha256=${webhookSignature(secret, timestamp, body)}`);
    expect(JSON.parse(body)).toMatchObject({ id: 'ev1', event: 'ticket.created', data: { ticketId: 't1' } });
  });
});

describe('provider catalog', () => {
  it('exposes exactly 16 providers with unique keys', () => {
    expect(INTEGRATION_PROVIDERS).toHaveLength(16);
    const keys = INTEGRATION_PROVIDERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    const comingSoon = INTEGRATION_PROVIDERS.filter((p) => p.comingSoon).map((p) => p.key).sort();
    expect(comingSoon).toEqual([
      'gmail',
      'google_drive',
      'hubspot',
      'jira',
      'linear',
      'notion',
      'outlook',
      'shopify',
      'slack',
      'telegram',
    ]);
    expect(INTEGRATION_PROVIDERS.find((p) => p.key === 'telegram')).toMatchObject({
      authType: 'token',
      category: 'messaging',
      icon: 'Send',
    });
  });

  it('configures every OAuth provider with endpoints, scopes, and two env keys', () => {
    for (const provider of INTEGRATION_PROVIDERS.filter((p) => p.authType === 'oauth2')) {
      expect(provider.oauth?.authorizeUrl).toMatch(/^https:\/\//);
      expect(provider.oauth?.tokenUrl).toMatch(/^https:\/\//);
      expect(provider.envKeys).toHaveLength(2);
      expect(provider.tools.length).toBeGreaterThan(0);
    }
  });

  it('flags knowledge providers and covers all three automation presets', () => {
    expect(getProvider('google_drive')?.knowledge).toBe(true);
    expect(getProvider('notion')?.knowledge).toBe(true);
    expect(getProvider('github')?.knowledge).toBe(true);
    for (const key of ['zapier', 'make', 'n8n']) {
      expect(getProvider(key)?.authType).toBe('webhook');
    }
  });

  it('normalizes provider lookup and reports env configuration state', () => {
    expect(getProvider('  GMAIL ')?.key).toBe('gmail');
    expect(getProvider('nope')).toBeNull();
    expect(providerConfigured(getProvider('gmail')!)).toBe(false);
    process.env.GOOGLE_CLIENT_ID = 'gid';
    process.env.GOOGLE_CLIENT_SECRET = 'gsec';
    expect(providerConfigured(getProvider('gmail')!)).toBe(true);
    expect(providerConfigured(getProvider('teams')!)).toBe(true);
  });

  it('publishes the outbound webhook event catalog', () => {
    for (const event of ['ticket.created', 'run.completed', 'run.failed', 'approval.approved', 'document.created', 'integration.connected', 'member.invited', 'widget.conversation_started', 'webhook.test']) {
      expect(WEBHOOK_EVENTS).toContain(event);
    }
  });
});

describe('oauth engine', () => {
  it('builds the Google authorize URL with scopes, state, and offline access', () => {
    process.env.GOOGLE_CLIENT_ID = 'gid';
    process.env.GOOGLE_CLIENT_SECRET = 'gsec';
    const url = new URL(
      authorizeUrlFor(getProvider('gmail')!, {
        redirectUri: 'https://api.example.com/api/integrations/gmail/callback',
        state: 'state123',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('gid');
    expect(url.searchParams.get('state')).toBe('state123');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toContain('gmail.send');
  });

  it('templates Shopify endpoints with the store domain', () => {
    process.env.SHOPIFY_CLIENT_ID = 'sid';
    process.env.SHOPIFY_CLIENT_SECRET = 'ssec';
    const url = new URL(
      authorizeUrlFor(getProvider('shopify')!, {
        redirectUri: 'https://api.example.com/api/integrations/shopify/callback',
        state: 'state123',
        shop: 'acme.myshopify.com',
      }),
    );
    expect(url.host).toBe('acme.myshopify.com');
    expect(url.pathname).toBe('/admin/oauth/authorize');
    expect(url.searchParams.get('scope')).toContain('read_products');
  });

  it('exchanges an authorization code with client credentials in the body', async () => {
    process.env.GOOGLE_CLIENT_ID = 'gid';
    process.env.GOOGLE_CLIENT_SECRET = 'gsec';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: 'atok', refresh_token: 'rtok', expires_in: 3600, token_type: 'Bearer' }),
      json: async () => ({}),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const bundle = await exchangeAuthorizationCode(getProvider('gmail')!, {
      code: 'code1',
      redirectUri: 'https://api.example.com/callback',
    });
    expect(bundle.accessToken).toBe('atok');
    expect(bundle.refreshToken).toBe('rtok');
    expect(Date.parse(String(bundle.expiresAt))).toBeGreaterThan(Date.now());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('client_secret=gsec');
  });

  it('uses HTTP Basic auth for Notion token exchange', async () => {
    process.env.NOTION_CLIENT_ID = 'nid';
    process.env.NOTION_CLIENT_SECRET = 'nsec';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: 'ntok', token_type: 'Bearer' }),
      json: async () => ({}),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const bundle = await exchangeAuthorizationCode(getProvider('notion')!, {
      code: 'code1',
      redirectUri: 'https://api.example.com/callback',
    });
    expect(bundle.accessToken).toBe('ntok');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from('nid:nsec').toString('base64')}`);
    expect(String(init.body)).not.toContain('client_secret');
  });

  it('requires a shop domain for Shopify exchanges', async () => {
    process.env.SHOPIFY_CLIENT_ID = 'sid';
    process.env.SHOPIFY_CLIENT_SECRET = 'ssec';
    await expect(
      exchangeAuthorizationCode(getProvider('shopify')!, { code: 'code1', redirectUri: 'https://api.example.com/callback' }),
    ).rejects.toThrow(/Shop domain/);
  });
});

describe('connection helpers', () => {
  it('round-trips token bundles through encrypted storage', () => {
    const encrypted = saveTokens({ accessToken: 'tok', refreshToken: 'ref', expiresAt: null });
    expect(encrypted).not.toContain('tok');
    expect(loadTokens({ encryptedTokens: encrypted })).toMatchObject({ accessToken: 'tok', refreshToken: 'ref' });
    expect(loadTokens({ encryptedTokens: '' })).toBeNull();
    expect(loadTokens({ encryptedTokens: 'garbage' })).toBeNull();
  });

  it('detects expiring tokens with a refresh skew', () => {
    expect(isTokenExpiring({ accessToken: 'a', expiresAt: null })).toBe(false);
    expect(isTokenExpiring({ accessToken: 'a', expiresAt: new Date(Date.now() + 60_000_000).toISOString() })).toBe(false);
    expect(isTokenExpiring({ accessToken: 'a', expiresAt: new Date(Date.now() + 1_000).toISOString() })).toBe(true);
  });

  it('never leaks encrypted tokens through connection summaries', () => {
    const summary = connectionSummary(connectionFixture());
    expect(summary).not.toHaveProperty('encryptedTokens');
    expect(summary.provider).toBe('teams');
    expect(summary.status).toBe('CONNECTED');
    expect(typeof summary.createdAt).toBe('string');
  });

  it('validates token-type credential input', () => {
    const teams = getProvider('teams')!;
    expect(tokenFieldsFromInput(teams, { webhookUrl: 'https://outlook.office.com/wh/x' }).accessToken).toBe('https://outlook.office.com/wh/x');
    expect(() => tokenFieldsFromInput(teams, { webhookUrl: '' })).toThrow(/required/);
    const whatsapp = getProvider('whatsapp')!;
    expect(() => tokenFieldsFromInput(whatsapp, { accessToken: 'tok' })).toThrow(/Phone number/);
    const bundle = tokenFieldsFromInput(whatsapp, { accessToken: 'tok', phoneNumberId: '12345' });
    expect((bundle.extra as any).phoneNumberId).toBe('12345');
  });

  it('blocks providers when the platform or provider is disabled', async () => {
    await expect(assertProviderUsable(prisma, 'gmail')).resolves.toBeUndefined();
    vi.mocked(prisma.integrationSetting.findUnique).mockResolvedValue({ enabled: false, disabledProviders: [] } as never);
    await expect(assertProviderUsable(prisma, 'gmail')).rejects.toThrow(/disabled by an administrator/);
    vi.mocked(prisma.integrationSetting.findUnique).mockResolvedValue({ enabled: true, disabledProviders: ['gmail'] } as never);
    await expect(assertProviderUsable(prisma, 'gmail')).rejects.toThrow(/gmail integration is disabled/);
  });
});

describe('webhook delivery', () => {
  it('queues deliveries only for subscribed endpoints', async () => {
    vi.mocked(prisma.webhookEndpoint.findMany).mockResolvedValue([{ id: 'ep1' }] as never);
    vi.mocked(prisma.webhookDelivery.create).mockImplementation((async (args: any) => ({ id: 'del-new', ...args.data })) as any);
    vi.mocked(prisma.webhookDelivery.findUnique).mockResolvedValue(deliveryFixture({ id: 'del-new' }) as never);
    vi.mocked(prisma.webhookEndpoint.findUnique).mockResolvedValue(endpointFixture() as never);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    const queued = await emitWebhookEvent(prisma, 'org1', 'ticket.created', { ticketId: 't1' });
    expect(queued).toBe(1);
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'ticket.created', endpointId: 'ep1', status: 'PENDING' }) }),
    );
    await vi.waitFor(() => expect(prisma.webhookDelivery.update).toHaveBeenCalledTimes(1));
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS', attempts: 1 }) }),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-ryuksaidso-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(headers['x-ryuksaidso-event']).toBe('ticket.created');
  });

  it('ignores events outside the catalog', async () => {
    const queued = await emitWebhookEvent(prisma, 'org1', 'evil.event', {});
    expect(queued).toBe(0);
    expect(prisma.webhookEndpoint.findMany).not.toHaveBeenCalled();
  });

  it('retries failed deliveries and marks them FAILED after exhausting attempts', async () => {
    vi.useFakeTimers();
    vi.mocked(prisma.webhookDelivery.findUnique).mockResolvedValue(deliveryFixture() as never);
    vi.mocked(prisma.webhookEndpoint.findUnique).mockResolvedValue(endpointFixture() as never);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const promise = deliverDelivery(prisma, 'del1');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(prisma.webhookDelivery.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', attempts: 3 }) }),
    );
  });

  it('skips deliveries for inactive endpoints', async () => {
    vi.mocked(prisma.webhookDelivery.findUnique).mockResolvedValue(deliveryFixture() as never);
    vi.mocked(prisma.webhookEndpoint.findUnique).mockResolvedValue(endpointFixture({ active: false }) as never);
    const result = await deliverDelivery(prisma, 'del1');
    expect(result.ok).toBe(false);
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', lastError: 'Endpoint is inactive' }) }),
    );
    expect(prisma.webhookEndpoint.findUnique).toHaveBeenCalled();
  });

  it('sweeps only stale pending deliveries', async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValue([] as never);
    await expect(sweepPendingDeliveries(prisma)).resolves.toEqual({ delivered: 0, failed: 0 });
    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
    );
  });
});

describe('knowledge sync', () => {
  it('skips the sweep when integrations are disabled', async () => {
    vi.mocked(prisma.integrationSetting.findUnique).mockResolvedValue({ enabled: false, disabledProviders: [] } as never);
    await expect(runDueSyncs(prisma)).resolves.toEqual({ checked: 0, synced: 0, failed: 0 });
    expect(prisma.knowledgeSource.findMany).not.toHaveBeenCalled();
  });

  it('skips sources that synced recently', async () => {
    vi.mocked(prisma.integrationSetting.findUnique).mockResolvedValue({ enabled: true, disabledProviders: [] } as never);
    vi.mocked(prisma.knowledgeSource.findMany).mockResolvedValue([
      { id: 'src1', provider: 'notion', autoSync: true, status: 'ACTIVE', lastSyncAt: new Date() },
    ] as never);
    await expect(runDueSyncs(prisma)).resolves.toEqual({ checked: 0, synced: 0, failed: 0 });
  });

  it('records an error result when GitHub is neither connected nor configured', async () => {
    const source = { id: 'src1', organizationId: 'org1', connectionId: '', provider: 'github', name: 'Docs', remotePath: 'acme/repo' };
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.knowledgeSource.update).mockResolvedValue({} as never);
    const result = await syncKnowledgeSource(prisma, source);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/GITHUB_TOKEN/);
    expect(prisma.knowledgeSource.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERROR' }) }),
    );
    expect(prisma.integrationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'knowledge_sync_failed', level: 'error' }) }),
    );
  });
});

describe('integration agent tools', () => {
  const ctx = { user: { id: 'u1', email: 'o@test.local', name: 'Owner', organizationId: 'org1', role: 'OWNER' }, runId: 'run1' };

  it('registers 20+ tools with correct approval flags', () => {
    const tools = buildIntegrationTools({ prisma } as any);
    expect(Object.keys(tools).length).toBeGreaterThanOrEqual(20);
    expect(tools.gmail_send.requiresApproval).toBe(true);
    expect(tools.slack_send_message.requiresApproval).toBe(true);
    expect(tools.whatsapp_send_message.requiresApproval).toBe(true);
    expect(tools.gmail_search.requiresApproval).toBe(false);
    expect(tools.drive_search.requiresApproval).toBe(false);
    expect(tools.hubspot_create_contact.requiresApproval).toBe(true);
  });

  it('soft-fails reads when the provider is not connected', async () => {
    const tools = buildIntegrationTools({ prisma } as any);
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue(null as never);
    const result = (await tools.gmail_search.execute({ query: 'invoice' }, ctx as any)) as any;
    expect(result.error).toMatch(/not connected/);
  });

  it('soft-fails when the platform disables integrations', async () => {
    const tools = buildIntegrationTools({ prisma } as any);
    vi.mocked(prisma.integrationSetting.findUnique).mockResolvedValue({ enabled: false, disabledProviders: [] } as never);
    const result = (await tools.drive_read.execute({ fileId: 'f1' }, ctx as any)) as any;
    expect(result.error).toMatch(/disabled by an administrator/);
  });
});

describe('widget routes', () => {
  it('serves the embeddable loader script cross-origin', async () => {
    const response = await request(app).get('/api/widget.js');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/javascript');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.text).toContain('attachShadow');
    expect(response.text).toContain('data-key');
  });

  it('answers CORS preflight for widget endpoints with the requesting origin', async () => {
    const response = await request(app)
      .options('/api/widget/wgt_testkey123/messages')
      .set('Origin', 'https://customer-site.example');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://customer-site.example');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });

  it('returns 404 for unknown widget keys', async () => {
    vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(null as never);
    const response = await request(app).get('/api/widget/wgt_missing/config');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NotFound');
  });

  it('returns 403 for disabled widgets', async () => {
    vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(widgetSettingFixture({ enabled: false }) as never);
    const response = await request(app).get('/api/widget/wgt_testkey123/config');
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Chat is disabled');
  });

  it('returns public widget configuration without secrets', async () => {
    vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(widgetSettingFixture() as never);
    vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'agent1', name: 'Support' } as never);
    const response = await request(app).get('/api/widget/wgt_testkey123/config');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ title: 'Chat with us', greeting: 'Hi there!', accent: '#8b5cf6', agentName: 'Support' });
    expect(response.body).not.toHaveProperty('publicKey');
    expect(response.body).not.toHaveProperty('organizationId');
  });

  it('rejects messages from origins outside the allowlist', async () => {
    vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(
      widgetSettingFixture({ allowedOrigins: ['https://ok.example'] }) as never,
    );
    const response = await request(app)
      .post('/api/widget/wgt_testkey123/messages')
      .set('Origin', 'https://evil.example')
      .send({ content: 'hello' });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Origin not allowed');
  });

  it('validates message payloads without requiring CSRF (public widget API)', async () => {
    vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(widgetSettingFixture() as never);
    const response = await request(app).post('/api/widget/wgt_testkey123/messages').send({ content: '' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
  });

  it('creates a session and run on the first visitor message', async () => {
    vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(widgetSettingFixture() as never);
    vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'agent1', projectId: 'proj1', versions: [{ id: 'v1' }] } as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ llmProvider: 'OMNIROUTE' } as never);
    vi.mocked(prisma.agentRun.create).mockResolvedValue({ id: 'run9' } as never);
    vi.mocked(prisma.widgetSession.create).mockResolvedValue({ id: 'sess9', email: '', organizationId: 'org1', settingId: 'wset1' } as never);
    vi.mocked(prisma.widgetSession.update).mockResolvedValue({} as never);
    vi.mocked(prisma.widgetMessage.create).mockResolvedValue({} as never);

    const response = await request(app)
      .post('/api/widget/wgt_testkey123/messages')
      .send({ content: 'How do I reset my password?', email: 'visitor@example.com' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ sessionId: 'sess9', pending: true });
    expect(enqueueRun).toHaveBeenCalledWith('run9', 'org1', expect.objectContaining({ organizationId: 'org1' }));
    expect(prisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trigger: 'widget',
          input: expect.objectContaining({ prompt: 'How do I reset my password?', widgetSessionId: 'sess9' }),
        }),
      }),
    );
  });

  it('returns 402 when the run quota is exhausted, before creating a session', async () => {
    vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(widgetSettingFixture() as never);
    vi.mocked(assertQuota).mockRejectedValueOnce(Object.assign(new Error('Monthly run quota reached'), { statusCode: 402 }));
    const response = await request(app).post('/api/widget/wgt_testkey123/messages').send({ content: 'hello' });
    expect(response.status).toBe(402);
    expect(response.body.error).toBe('PaymentRequired');
    expect(prisma.widgetSession.create).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it('materializes finished assistant replies when polling a session', async () => {
    vi.mocked(prisma.widgetSetting.findUnique).mockResolvedValue(widgetSettingFixture() as never);
    vi.mocked(prisma.widgetSession.findFirst).mockResolvedValue({
      id: 'sess1',
      settingId: 'wset1',
      organizationId: 'org1',
      email: '',
      createdAt: NOW,
      lastActiveAt: NOW,
    } as never);
    vi.mocked(prisma.agentRun.findMany).mockResolvedValue([
      { id: 'run1', status: 'COMPLETED', output: { answer: 'You can reset it in Settings.' }, error: null },
    ] as never);
    vi.mocked(prisma.widgetMessage.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.widgetMessage.create).mockResolvedValue({} as never);
    vi.mocked(prisma.widgetMessage.findMany).mockResolvedValue([
      { id: 'm1', role: 'visitor', content: 'how do I reset?', createdAt: NOW },
      { id: 'm2', role: 'assistant', content: 'You can reset it in Settings.', createdAt: NOW },
    ] as never);
    vi.mocked(prisma.widgetSession.update).mockResolvedValue({} as never);

    const response = await request(app).get('/api/widget/wgt_testkey123/sessions/sess1');
    expect(response.status).toBe(200);
    expect(response.body.pending).toBe(false);
    expect(response.body.messages).toHaveLength(2);
    expect(prisma.widgetMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'assistant', runId: 'run1' }) }),
    );
  });
});

describe('integrations routes', () => {
  it('requires authentication for the catalog', async () => {
    const response = await request(app).get('/api/integrations/catalog');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });

  it('returns the marketplace catalog with connection state', async () => {
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([
      { provider: 'slack', status: 'CONNECTED' },
    ] as never);
    const response = await request(app).get('/api/integrations/catalog').set(auth(OWNER_TOKEN));
    expect(response.status).toBe(200);
    expect(response.body.enabled).toBe(true);
    expect(response.body.providers).toHaveLength(16);
    const slack = response.body.providers.find((p: any) => p.key === 'slack');
    expect(slack.connected).toBe(true);
    expect(slack.status).toBe('CONNECTED');
    expect(slack.comingSoon).toBe(true);
    const gmail = response.body.providers.find((p: any) => p.key === 'gmail');
    expect(gmail.connected).toBe(false);
    expect(gmail.configured).toBe(false);
    expect(gmail.comingSoon).toBe(true);
    expect(gmail.redirectUri).toContain('/api/integrations/gmail/callback');
    expect(response.body.providers.find((p: any) => p.key === 'teams').redirectUri).toBeNull();
    expect(response.body.providers.find((p: any) => p.key === 'zapier').redirectUri).toBeNull();
    const telegram = response.body.providers.find((p: any) => p.key === 'telegram');
    expect(telegram.comingSoon).toBe(true);
    expect(telegram.connected).toBe(false);
    expect(telegram.tokenFields).toEqual([expect.objectContaining({ key: 'botToken', secret: true })]);
  });

  it('forbids non-owners from starting OAuth connect', async () => {
    const response = await request(app)
      .post('/api/integrations/connections/gmail/connect')
      .set(auth(VIEWER_TOKEN))
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Insufficient permissions');
  });

  it('returns 503 when OAuth env vars are missing', async () => {
    const response = await request(app)
      .post('/api/integrations/connections/gmail/connect')
      .set(auth(OWNER_TOKEN))
      .send({});
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Unavailable');
    expect(response.body.message).toContain('GOOGLE_CLIENT_ID');
  });

  it('rejects OAuth connect for token-type providers', async () => {
    const response = await request(app)
      .post('/api/integrations/connections/teams/connect')
      .set(auth(OWNER_TOKEN))
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('does not use OAuth');
  });

  it('404s unknown providers on connect', async () => {
    const response = await request(app)
      .post('/api/integrations/connections/pagerduty/connect')
      .set(auth(OWNER_TOKEN))
      .send({});
    expect(response.status).toBe(404);
  });

  it('blocks connect when integrations are disabled platform-wide', async () => {
    vi.mocked(prisma.integrationSetting.findUnique).mockResolvedValue({ enabled: false, disabledProviders: [] } as never);
    const response = await request(app)
      .post('/api/integrations/connections/gmail/connect')
      .set(auth(OWNER_TOKEN))
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/disabled by an administrator/);
  });

  it('returns a provider authorize URL and stores signed state', async () => {
    process.env.GOOGLE_CLIENT_ID = 'gid';
    process.env.GOOGLE_CLIENT_SECRET = 'gsec';
    const response = await request(app)
      .post('/api/integrations/connections/gmail/connect')
      .set(auth(OWNER_TOKEN))
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.url).toContain('accounts.google.com');
    expect(response.body.redirectUri).toContain('/api/integrations/gmail/callback');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^int:state:/),
      expect.stringContaining('"provider":"gmail"'),
      'EX',
      600,
    );
  });

  it('redirects the callback with state_expired when state is missing', async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    const response = await request(app).get('/api/integrations/gmail/callback?code=abc&state=xyz');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('connect_error=state_expired');
  });

  it('completes the OAuth callback, encrypts tokens, and redirects as connected', async () => {
    process.env.GOOGLE_CLIENT_ID = 'gid';
    process.env.GOOGLE_CLIENT_SECRET = 'gsec';
    vi.mocked(redis.get).mockResolvedValue(
      JSON.stringify({ organizationId: 'org1', userId: 'u1', provider: 'gmail', verifier: 'v1', shop: '' }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'atok', refresh_token: 'rtok', expires_in: 3600, token_type: 'Bearer', name: 'Owner', email: 'o@test.local' }),
        json: async () => ({ name: 'Owner', email: 'o@test.local', sub: 'g1' }),
      })),
    );
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.integrationConnection.create).mockImplementation((async (args: any) => connectionFixture(args.data)) as any);

    const response = await request(app).get('/api/integrations/gmail/callback?code=abc&state=xyz');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('http://localhost:3000/dashboard?connected=gmail');
    expect(prisma.integrationConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: 'gmail', status: 'CONNECTED', connectedBy: 'u1' }),
      }),
    );
    const created = vi.mocked(prisma.integrationConnection.create).mock.calls[0][0] as any;
    expect(created.data.encryptedTokens).not.toContain('atok');
    expect(prisma.integrationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'connected' }) }),
    );
  });

  it('stores token-type connections with encrypted credentials', async () => {
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.integrationConnection.create).mockImplementation((async (args: any) => connectionFixture(args.data)) as any);
    const response = await request(app)
      .post('/api/integrations/connections/token')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'teams', fields: { webhookUrl: 'https://outlook.office.com/webhook/abc' } });
    expect(response.status).toBe(201);
    expect(response.body.provider).toBe('teams');
    expect(response.body).not.toHaveProperty('encryptedTokens');
    const created = vi.mocked(prisma.integrationConnection.create).mock.calls[0][0] as any;
    expect(created.data.encryptedTokens).not.toContain('https://outlook.office.com/webhook/abc');
  });

  it('rejects non-https Teams webhooks', async () => {
    const response = await request(app)
      .post('/api/integrations/connections/token')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'teams', fields: { webhookUrl: 'http://insecure.example/hook' } });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/https/);
  });

  it('requires knowledge-capable providers when adding sources', async () => {
    const response = await request(app)
      .post('/api/integrations/sources')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'slack', name: 'Wrong' });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('knowledge sources');
  });

  it('requires a connection (or GITHUB_TOKEN) before creating a source', async () => {
    const noConnection = await request(app)
      .post('/api/integrations/sources')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'notion', name: 'Handbook' });
    expect(noConnection.status).toBe(400);
    expect(noConnection.body.message).toContain('Connect Notion first');

    const githubNoToken = await request(app)
      .post('/api/integrations/sources')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'github', name: 'Docs' });
    expect(githubNoToken.status).toBe(400);
    expect(githubNoToken.body.message).toContain('GITHUB_TOKEN');
  });

  it('creates a GitHub source when GITHUB_TOKEN is configured', async () => {
    process.env.GITHUB_TOKEN = 'ghtok';
    vi.mocked(prisma.knowledgeSource.create).mockResolvedValue({ id: 'src1', provider: 'github', name: 'Docs' } as never);
    const response = await request(app)
      .post('/api/integrations/sources')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'github', name: 'Docs', remotePath: 'acme/handbook' });
    expect(response.status).toBe(201);
    expect(prisma.knowledgeSource.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'github', remotePath: 'acme/handbook' }) }),
    );
  });

  it('creates a GitHub source from the workspace connection when no token env is set', async () => {
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue({ id: 'conn-gh', provider: 'github', status: 'CONNECTED', createdAt: new Date('2026-10-02T00:00:00.000Z') } as never);
    vi.mocked(prisma.knowledgeSource.create).mockImplementation((async (args: any) => ({ id: 'src2', ...args.data })) as any);
    const response = await request(app)
      .post('/api/integrations/sources')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'github', name: 'Scientist Graph', remotePath: 'https://github.com/faizcasm/scientistgraph.git' });
    expect(response.status).toBe(201);
    expect(prisma.integrationConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ provider: 'github', status: { not: 'DISCONNECTED' } }) }),
    );
    expect(prisma.knowledgeSource.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'github', connectionId: 'conn-gh', remotePath: 'https://github.com/faizcasm/scientistgraph.git' }) }),
    );
  });

  it('auto-picks an active connection for other knowledge providers', async () => {
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue({ id: 'conn-drv', provider: 'google_drive', status: 'CONNECTED', createdAt: new Date('2026-10-02T00:00:00.000Z') } as never);
    vi.mocked(prisma.knowledgeSource.create).mockImplementation((async (args: any) => ({ id: 'src3', ...args.data })) as any);
    const response = await request(app)
      .post('/api/integrations/sources')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'google_drive', name: 'Specs', remotePath: 'folder-1' });
    expect(response.status).toBe(201);
    expect(prisma.knowledgeSource.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'google_drive', connectionId: 'conn-drv' }) }),
    );
  });

  it('creates webhook endpoints with generated secrets', async () => {
    vi.mocked(prisma.webhookEndpoint.create).mockImplementation((async (args: any) => ({ id: 'ep9', ...args.data })) as any);
    const response = await request(app)
      .post('/api/integrations/webhooks')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'Zapier', url: 'https://hooks.example.com/ryuksaidso', events: ['ticket.created'] });
    expect(response.status).toBe(201);
    expect(response.body.secret).toMatch(/^whsec_/);
  });

  it('rejects private webhook URLs and unknown events', async () => {
    const privateUrl = await request(app)
      .post('/api/integrations/webhooks')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'Local', url: 'http://localhost:9999/hook', events: ['ticket.created'] });
    expect(privateUrl.status).toBe(400);
    expect(privateUrl.body.message).toMatch(/private\/internal/);

    const unknownEvent = await request(app)
      .post('/api/integrations/webhooks')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'Bad', url: 'https://hooks.example.com/x', events: ['totally.made.up'] });
    expect(unknownEvent.status).toBe(400);
    expect(unknownEvent.body.message).toContain('totally.made.up');
  });

  it('lists activity logs and tool-call history', async () => {
    vi.mocked(prisma.integrationLog.findMany).mockResolvedValue([
      { id: 'log1', provider: 'gmail', event: 'connected', message: 'Gmail connected', createdAt: NOW },
    ] as never);
    vi.mocked(prisma.agentStep.findMany).mockResolvedValue([
      {
        id: 'step1',
        runId: 'run1',
        action: 'Execute gmail_search',
        status: 'succeeded',
        durationMs: 120,
        error: null,
        createdAt: NOW,
        run: { id: 'run1', status: 'COMPLETED', agentId: 'agent1', trigger: 'widget', createdAt: NOW },
      },
    ] as never);

    const activity = await request(app).get('/api/integrations/activity').set(auth(OWNER_TOKEN));
    expect(activity.status).toBe(200);
    expect(activity.body.logs[0].event).toBe('connected');

    const toolActivity = await request(app).get('/api/integrations/tool-activity').set(auth(OWNER_TOKEN));
    expect(toolActivity.status).toBe(200);
    expect(toolActivity.body.items[0]).toMatchObject({ tool: 'gmail_search', runStatus: 'COMPLETED', durationMs: 120 });
  });

  it('requires ownership to disconnect connections', async () => {
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue(null as never);
    const response = await request(app).delete('/api/integrations/connections/con404').set(auth(OWNER_TOKEN));
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Connection not found');
  });
});

describe('admin integrations routes', () => {
  it('requires authentication', async () => {
    const response = await request(app).get('/api/admin/integrations/settings');
    expect(response.status).toBe(401);
  });

  it('forbids non-system admins', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
    const response = await request(app).get('/api/admin/integrations/settings').set(auth(OWNER_TOKEN));
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Admin access required');
  });

  it('reads and updates the global platform switch', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    const read = await request(app).get('/api/admin/integrations/settings').set(auth(OWNER_TOKEN));
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ enabled: true, disabledProviders: [] });

    vi.mocked(prisma.integrationSetting.create).mockImplementation((async (args: any) => ({
      id: 'global',
      enabled: true,
      disabledProviders: [],
      updatedBy: '',
      updatedAt: NOW,
      ...args.data,
    })) as any);
    const update = await request(app)
      .put('/api/admin/integrations/settings')
      .set(auth(OWNER_TOKEN))
      .send({ enabled: false, disabledProviders: ['slack'] });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ enabled: false, disabledProviders: ['slack'], updatedBy: 'u1' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'admin.integration_settings_updated' }) }),
    );
  });

  it('rejects unknown providers in platform settings', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    const response = await request(app)
      .put('/api/admin/integrations/settings')
      .set(auth(OWNER_TOKEN))
      .send({ enabled: true, disabledProviders: ['pagerduty'] });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('pagerduty');
  });

  it('summarizes platform health in the overview', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([
      { provider: 'slack', status: 'CONNECTED', organizationId: 'org1' },
      { provider: 'gmail', status: 'ERROR', organizationId: 'org2' },
    ] as never);
    vi.mocked(prisma.knowledgeSource.findMany).mockResolvedValue([
      { provider: 'notion', status: 'ACTIVE', organizationId: 'org1' },
    ] as never);
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValue([
      { status: 'SUCCESS' },
      { status: 'FAILED' },
    ] as never);
    vi.mocked(prisma.integrationLog.findMany).mockResolvedValue([
      { id: 'log1', organizationId: 'org1', provider: 'gmail', event: 'token_refresh_failed', message: 'invalid_grant', createdAt: NOW },
    ] as never);
    vi.mocked(prisma.organization.findMany).mockResolvedValue([
      { id: 'org1', name: 'Org One' },
      { id: 'org2', name: 'Org Two' },
    ] as never);

    const response = await request(app).get('/api/admin/integrations/overview').set(auth(OWNER_TOKEN));
    expect(response.status).toBe(200);
    expect(response.body.connections).toMatchObject({ total: 2, byStatus: { CONNECTED: 1, ERROR: 1 } });
    expect(response.body.sources.total).toBe(1);
    expect(response.body.webhooks.delivery24h.SUCCESS).toBe(1);
    expect(response.body.webhooks.delivery24h.FAILED).toBe(1);
    expect(response.body.recentErrors[0].message).toBe('invalid_grant');
  });
});
