import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../server';
import { signToken } from '../lib/auth';
import { prisma } from '../lib/db';
import { enqueueRun } from '../services/queue';
import { encryptSecret, decryptSecret } from '@ryuksaidso/agent-tools';

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
    widgetMessage: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    agent: { findFirst: vi.fn(), findMany: vi.fn() },
    agentRun: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    agentStep: { findMany: vi.fn() },
    organization: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    modelProvider: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    billingSetting: { findUnique: vi.fn() },
    billingPlan: { findFirst: vi.fn(), findUnique: vi.fn() },
    billingSubscription: { findFirst: vi.fn(), findMany: vi.fn() },
    document: { findFirst: vi.fn(), create: vi.fn() },
    apiKey: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    membership: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    ticket: { findFirst: vi.fn() },
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

function providerFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mp1',
    organizationId: 'org1',
    name: 'My OpenAI',
    kind: 'openai_compat',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: encryptSecret('sk-test-key'),
    defaultModel: 'gpt-4o-mini',
    models: JSON.stringify(['gpt-4o-mini']),
    enabled: true,
    status: 'UNKNOWN',
    latencyMs: null,
    lastCheckedAt: null,
    lastError: '',
    connectedBy: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function okJson(payload: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function ticketSeed() {
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ id: 't1', title: 'Login broken', description: 'Users cannot sign in' } as never);
  vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'a1', projectId: 'p1', slug: 'resolution', versions: [{ id: 'v1' }] } as never);
  vi.mocked(prisma.agentRun.create).mockResolvedValue({ id: 'run-1' } as never);
  vi.mocked(prisma.agentRun.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
}

beforeEach(() => {
  vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.modelProvider.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.modelProvider.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.modelProvider.create).mockResolvedValue(providerFixture() as never);
  vi.mocked(prisma.modelProvider.update).mockResolvedValue(providerFixture() as never);
  vi.mocked(prisma.modelProvider.delete).mockResolvedValue(providerFixture() as never);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.organization.update).mockResolvedValue({ llmProvider: 'OMNIROUTE', ollamaModel: 'qwen', omnirouteModel: 'or' } as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/models/providers', () => {
  it('requires authentication', async () => {
    const response = await request(app).get('/api/models/providers');
    expect(response.status).toBe(401);
  });

  it('lists workspace providers without exposing stored keys and marks the default', async () => {
    vi.mocked(prisma.modelProvider.findMany).mockResolvedValue([providerFixture()] as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ llmProvider: 'mp1' } as never);

    const response = await request(app).get('/api/models/providers').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.current).toBe('mp1');
    expect(response.body.providers).toHaveLength(1);
    expect(response.body.providers[0]).toMatchObject({
      id: 'mp1',
      name: 'My OpenAI',
      kind: 'openai_compat',
      hasKey: true,
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini'],
      isDefault: true,
      status: 'UNKNOWN',
    });
    expect(response.body.providers[0].apiKey).toBeUndefined();
    expect(prisma.modelProvider.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org1' } }));
  });
});

describe('POST /api/models/providers', () => {
  it('rejects viewers', async () => {
    const response = await request(app)
      .post('/api/models/providers')
      .set(auth(VIEWER_TOKEN))
      .send({ name: 'Local', kind: 'ollama', baseUrl: 'http://localhost:11434' });
    expect(response.status).toBe(403);
    expect(prisma.modelProvider.create).not.toHaveBeenCalled();
  });

  it('creates a provider with an encrypted api key and a normalized base URL', async () => {
    vi.mocked(prisma.modelProvider.create).mockResolvedValue(
      providerFixture({
        name: 'Local Ollama',
        kind: 'ollama',
        baseUrl: 'http://localhost:11434',
        defaultModel: 'qwen3:8b',
        apiKey: encryptSecret('ollama-local'),
      }) as never,
    );

    const response = await request(app)
      .post('/api/models/providers')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'Local Ollama', kind: 'ollama', baseUrl: 'http://localhost:11434/', apiKey: 'ollama-local', defaultModel: 'qwen3:8b' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Local Ollama', kind: 'ollama', baseUrl: 'http://localhost:11434', hasKey: true });
    expect(response.body.apiKey).toBeUndefined();
    const data = vi.mocked(prisma.modelProvider.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(String(data.apiKey)).not.toBe('ollama-local');
    expect(decryptSecret(String(data.apiKey))).toBe('ollama-local');
    expect(data.organizationId).toBe('org1');
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('rejects a malformed endpoint URL', async () => {
    const response = await request(app)
      .post('/api/models/providers')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'Bad', baseUrl: 'not-a-url' });
    expect(response.status).toBe(400);
    expect(prisma.modelProvider.create).not.toHaveBeenCalled();
  });

  it('rejects non-http protocols', async () => {
    const response = await request(app)
      .post('/api/models/providers')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'FTP', baseUrl: 'ftp://models.example.com/v1' });
    expect(response.status).toBe(400);
    expect(prisma.modelProvider.create).not.toHaveBeenCalled();
  });

  it('rejects cloud metadata addresses', async () => {
    const response = await request(app)
      .post('/api/models/providers')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'Meta', baseUrl: 'http://169.254.169.254/latest/meta-data' });
    expect(response.status).toBe(400);
    expect(prisma.modelProvider.create).not.toHaveBeenCalled();
  });

  it('allows loopback and private network endpoints for local models', async () => {
    const loopback = await request(app)
      .post('/api/models/providers')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' });
    expect(loopback.status).toBe(201);

    const privateIp = await request(app)
      .post('/api/models/providers')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'LAN vLLM', baseUrl: 'http://10.0.0.5:8000/v1' });
    expect(privateIp.status).toBe(201);
  });

  it('rejects a duplicate provider name in the workspace', async () => {
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    const response = await request(app)
      .post('/api/models/providers')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'My OpenAI', baseUrl: 'https://api.openai.com/v1' });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('already exists');
    expect(prisma.modelProvider.create).not.toHaveBeenCalled();
  });
});

describe('PUT /api/models/providers/:id', () => {
  it('keeps the stored api key when it is not sent', async () => {
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    const response = await request(app)
      .put('/api/models/providers/mp1')
      .set(auth(OWNER_TOKEN))
      .send({ defaultModel: 'gpt-4o' });

    expect(response.status).toBe(200);
    const data = vi.mocked(prisma.modelProvider.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.defaultModel).toBe('gpt-4o');
    expect('apiKey' in data).toBe(false);
  });

  it('replaces the api key when a new one is sent', async () => {
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    const response = await request(app)
      .put('/api/models/providers/mp1')
      .set(auth(OWNER_TOKEN))
      .send({ apiKey: 'sk-rotated' });

    expect(response.status).toBe(200);
    const data = vi.mocked(prisma.modelProvider.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(String(data.apiKey)).not.toBe('sk-rotated');
    expect(decryptSecret(String(data.apiKey))).toBe('sk-rotated');
    expect('defaultModel' in data).toBe(false);
    expect('kind' in data).toBe(false);
    expect('models' in data).toBe(false);
    expect('enabled' in data).toBe(false);
    expect('name' in data).toBe(false);
    expect('baseUrl' in data).toBe(false);
  });

  it('scopes lookups to the workspace and answers 404 for unknown providers', async () => {
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(null as never);
    const response = await request(app)
      .put('/api/models/providers/other')
      .set(auth(OWNER_TOKEN))
      .send({ name: 'Nope' });

    expect(response.status).toBe(404);
    expect(prisma.modelProvider.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org1' }) }));
    expect(prisma.modelProvider.update).not.toHaveBeenCalled();
  });

  it('rejects viewers', async () => {
    const response = await request(app)
      .put('/api/models/providers/mp1')
      .set(auth(VIEWER_TOKEN))
      .send({ name: 'Renamed' });
    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/models/providers/:id', () => {
  it('deletes the provider and reverts the workspace default when it was selected', async () => {
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ llmProvider: 'mp1' } as never);

    const response = await request(app).delete('/api/models/providers/mp1').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: true, reverted: true });
    expect(prisma.modelProvider.delete).toHaveBeenCalledWith({ where: { id: 'mp1' } });
    expect(prisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: { llmProvider: 'OMNIROUTE' } }));
  });

  it('leaves the workspace default untouched when a different provider is active', async () => {
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ llmProvider: 'OMNIROUTE' } as never);

    const response = await request(app).delete('/api/models/providers/mp1').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: true, reverted: false });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('rejects viewers', async () => {
    const response = await request(app).delete('/api/models/providers/mp1').set(auth(VIEWER_TOKEN));
    expect(response.status).toBe(403);
  });
});

describe('POST /api/models/providers/:id/test', () => {
  it('discovers models and records a healthy status with latency', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ data: [{ id: 'gpt-4o-mini' }] })));
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    vi.mocked(prisma.modelProvider.findUnique).mockResolvedValue(providerFixture() as never);

    const response = await request(app).post('/api/models/providers/mp1/test').set(auth(OWNER_TOKEN)).send({});

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.models).toEqual(['gpt-4o-mini']);
    const data = vi.mocked(prisma.modelProvider.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe('HEALTHY');
    expect(data.latencyMs).toEqual(expect.any(Number));
    expect(data.lastCheckedAt).toBeInstanceOf(Date);
    expect(String(data.models)).toContain('gpt-4o-mini');
  });

  it('records an error status when the endpoint is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    vi.mocked(prisma.modelProvider.findUnique).mockResolvedValue(providerFixture() as never);

    const response = await request(app).post('/api/models/providers/mp1/test').set(auth(OWNER_TOKEN)).send({});

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('network down');
    const data = vi.mocked(prisma.modelProvider.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe('ERROR');
    expect(data.lastError).toContain('network down');
  });

  it('marks the provider degraded when discovery works but chat fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson({ data: [{ id: 'gpt-4o-mini' }] }))
      .mockResolvedValueOnce(okJson({ error: 'boom' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    vi.mocked(prisma.modelProvider.findUnique).mockResolvedValue(providerFixture() as never);

    const response = await request(app).post('/api/models/providers/mp1/test').set(auth(OWNER_TOKEN)).send({ chat: true });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    const data = vi.mocked(prisma.modelProvider.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe('DEGRADED');
    expect(String(data.lastError)).toContain('500');
  });

  it('answers 404 for a provider outside the workspace', async () => {
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(null as never);
    const response = await request(app).post('/api/models/providers/other/test').set(auth(OWNER_TOKEN)).send({});
    expect(response.status).toBe(404);
  });
});

describe('POST /api/models/discover', () => {
  it('returns the model list from an unsaved endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ data: [{ id: 'llama-3.1-8b' }, { id: 'qwen3-8b' }] })));

    const response = await request(app)
      .post('/api/models/discover')
      .set(auth(OWNER_TOKEN))
      .send({ kind: 'openai_compat', baseUrl: 'https://openrouter.ai/api/v1' });

    expect(response.status).toBe(200);
    expect(response.body.models).toEqual(['llama-3.1-8b', 'qwen3-8b']);
    expect(vi.mocked(prisma.modelProvider.create)).not.toHaveBeenCalled();
  });

  it('rejects a malformed URL before probing', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const response = await request(app)
      .post('/api/models/discover')
      .set(auth(OWNER_TOKEN))
      .send({ baseUrl: 'definitely not a url' });
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 503 when the endpoint cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection refused'); }));
    const response = await request(app)
      .post('/api/models/discover')
      .set(auth(OWNER_TOKEN))
      .send({ baseUrl: 'http://localhost:9999/v1' });
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Unavailable');
  });

  it('rejects viewers', async () => {
    const response = await request(app)
      .post('/api/models/discover')
      .set(auth(VIEWER_TOKEN))
      .send({ baseUrl: 'http://localhost:11434' });
    expect(response.status).toBe(403);
  });
});

describe('workspace routing with custom providers', () => {
  it('switches the workspace default to a custom provider after verifying its model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ data: [{ id: 'gpt-4o-mini' }] })));
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);
    vi.mocked(prisma.organization.update).mockResolvedValue({ llmProvider: 'mp1', ollamaModel: 'qwen-local', omnirouteModel: 'or-model' } as never);

    const response = await request(app)
      .patch('/api/llm')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'mp1', model: 'gpt-4o-mini' });

    expect(response.status).toBe(200);
    expect(response.body.llmProvider).toBe('mp1');
    expect(prisma.modelProvider.update).not.toHaveBeenCalled();
    expect(prisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: { llmProvider: 'mp1' } }));
  });

  it('rejects a model the endpoint does not serve', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ data: [{ id: 'gpt-4o' }] })));
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);

    const response = await request(app)
      .patch('/api/llm')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'mp1', model: 'gpt-4o-mini' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ModelUnavailable');
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('answers 503 when the custom endpoint is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);

    const response = await request(app)
      .patch('/api/llm')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'mp1', model: 'gpt-4o-mini' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('ProviderUnavailable');
  });

  it('rejects a provider id that does not belong to the workspace', async () => {
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .patch('/api/llm')
      .set(auth(OWNER_TOKEN))
      .send({ provider: 'clxyz00000000000000000000', model: 'gpt-4o-mini' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('custom provider');
  });

  it('exposes custom providers alongside the built-ins in the routing catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ data: [{ id: 'gpt-4o-mini' }] })));
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ llmProvider: 'mp1', ollamaModel: 'qwen-local', omnirouteModel: 'or-model' } as never);
    vi.mocked(prisma.modelProvider.findMany).mockResolvedValue([providerFixture()] as never);

    const response = await request(app).get('/api/llm/providers').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.current).toBe('mp1');
    expect(response.body.providers).toHaveLength(3);
    const builtIns = response.body.providers.filter((p: { custom: boolean }) => !p.custom);
    const custom = response.body.providers.find((p: { custom: boolean }) => p.custom);
    expect(builtIns.map((p: { provider: string }) => p.provider).sort()).toEqual(['OLLAMA', 'OMNIROUTE']);
    expect(custom).toMatchObject({ provider: 'mp1', name: 'My OpenAI', configured: true, selectedModel: 'gpt-4o-mini' });
  });
});

describe('ticket runs with a custom provider', () => {
  it('queues the run against the selected custom provider', async () => {
    ticketSeed();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ llmProvider: 'mp1', ollamaModel: 'qwen-local', omnirouteModel: 'or-model' } as never);
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(providerFixture() as never);

    const response = await request(app).post('/api/tickets/t1/run').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(202);
    expect(prisma.agentRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ provider: 'mp1' }) }));
    expect(enqueueRun).toHaveBeenCalledWith('run-1', 'org1', expect.objectContaining({ id: 'u1' }));
  });

  it('answers 409 when the selected custom provider is disabled or removed', async () => {
    ticketSeed();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ llmProvider: 'mp1', ollamaModel: 'qwen-local', omnirouteModel: 'or-model' } as never);
    vi.mocked(prisma.modelProvider.findFirst).mockResolvedValue(null as never);

    const response = await request(app).post('/api/tickets/t1/run').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('ProviderNotConfigured');
    expect(response.body.message).toContain('no longer available');
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
  });
});
