import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../server';
import { signToken } from '../lib/auth';
import { prisma } from '../lib/db';
import { redis } from '../lib/redis';

vi.mock('../lib/db', () => ({
  prisma: {
    marketplaceAgent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    marketplaceCreator: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    marketplaceAgentVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    marketplaceReview: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
      deleteMany: vi.fn(),
    },
    marketplaceInstall: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    agent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    agentVersion: { findFirst: vi.fn(), create: vi.fn() },
    agentRun: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
    organization: { findUnique: vi.fn() },
    integrationConnection: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    apiKey: { findFirst: vi.fn() },
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
  return {
    ...actual,
    assertQuota: vi.fn(async () => undefined),
    resolveBilling: vi.fn(async () => ({
      billingEnabled: true,
      enforced: false,
      planId: 'plan-free',
      planCode: 'free',
      planName: 'Free',
      limits: actual.FALLBACK_FREE_LIMITS,
      subscription: null,
    })),
  };
});

vi.mock('../services/modelProviders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/modelProviders')>();
  return {
    ...actual,
    resolveRunProvider: vi.fn(async () => ({ provider: 'OLLAMA', model: 'llama3', custom: null, ok: true, reason: null })),
  };
});

const NOW = new Date('2026-10-02T00:00:00.000Z');
const app = createApp();
const OWNER_TOKEN = signToken({ id: 'u1', email: 'owner@test.local', name: 'Owner', organizationId: 'org1', role: 'OWNER' });
const MEMBER_TOKEN = signToken({ id: 'u2', email: 'member@test.local', name: 'Member', organizationId: 'org1', role: 'AGENT' });
const ADMIN_TOKEN = signToken({ id: 'admin1', email: 'admin@test.local', name: 'Admin', organizationId: 'org1', role: 'OWNER' });

function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'x-csrf-token': 'test-csrf-token',
    Cookie: 'ryuksaidso_csrf=test-csrf-token',
  };
}

function marketFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mk1',
    slug: 'inbox-triage',
    name: 'Inbox Triage',
    summary: 'Reads new email and drafts replies for review.',
    description: 'A long description of the marketplace agent and what it does.',
    category: 'support',
    logoIcon: 'mail',
    logoColor: '#f59e0b',
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    suspended: false,
    reviewReason: '',
    pricing: 'FREE',
    priceAmount: 0,
    pricePeriod: 'MONTHLY',
    pricePerRun: 0,
    avgCostMicros: 42000,
    creatorId: 'cr1',
    organizationId: 'org2',
    currentVersion: 2,
    latestVersion: 2,
    verified: true,
    featured: false,
    installs: 12,
    tries: 5,
    ratingAvg: 4.5,
    ratingCount: 2,
    config: {
      instructions: 'You are an inbox triage assistant.',
      systemPrompt: 'Be concise.',
      tools: ['search_email', 'unknown_tool'],
    },
    changelog: 'Second release.',
    requiredIntegrations: ['gmail'],
    requiredModels: ['chat'],
    permissions: ['email:send'],
    forkedFromId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function creatorFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cr1',
    userId: 'c-user',
    handle: 'faizan',
    displayName: 'Faizan',
    bio: 'Builds agents.',
    website: '',
    verified: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function installedFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ag1',
    organizationId: 'org1',
    projectId: null,
    name: 'Inbox Triage',
    slug: 'inbox-triage',
    instructions: 'You are an inbox triage assistant.',
    systemPrompt: 'Be concise.',
    enabled: true,
    tools: ['search_email'],
    ...overrides,
  };
}

function installFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'in1',
    agentId: 'mk1',
    organizationId: 'org1',
    userId: 'u1',
    installedAgentId: 'ag1',
    version: 2,
    source: 'INSTALL',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function reviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rv1',
    agentId: 'mk1',
    userId: 'u9',
    userName: 'Reviewer',
    rating: 5,
    title: 'Great agent',
    body: 'Saved me an hour every morning.',
    version: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function runFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run1',
    organizationId: 'org1',
    projectId: null,
    agentId: 'ag-try',
    agentVersionId: 'av1',
    status: 'QUEUED',
    provider: 'OLLAMA',
    trigger: 'marketplace',
    environment: 'development',
    input: { prompt: 'Summarise my inbox.' },
    createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redis.set).mockResolvedValue('OK' as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
  vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.marketplaceAgent.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.marketplaceAgent.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.marketplaceAgent.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.marketplaceAgent.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.marketplaceAgent.create).mockResolvedValue(marketFixture() as never);
  vi.mocked(prisma.marketplaceAgent.update).mockResolvedValue(marketFixture() as never);
  vi.mocked(prisma.marketplaceAgent.delete).mockResolvedValue(marketFixture() as never);
  vi.mocked(prisma.marketplaceCreator.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.marketplaceCreator.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.marketplaceCreator.findMany).mockResolvedValue([creatorFixture()] as never);
  vi.mocked(prisma.marketplaceCreator.create).mockResolvedValue(creatorFixture() as never);
  vi.mocked(prisma.marketplaceCreator.update).mockResolvedValue(creatorFixture() as never);
  vi.mocked(prisma.marketplaceCreator.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.marketplaceAgentVersion.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.marketplaceAgentVersion.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.marketplaceAgentVersion.create).mockResolvedValue({ id: 'mkv1' } as never);
  vi.mocked(prisma.marketplaceAgentVersion.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.marketplaceReview.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.marketplaceReview.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.marketplaceReview.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.marketplaceReview.create).mockResolvedValue(reviewFixture() as never);
  vi.mocked(prisma.marketplaceReview.update).mockResolvedValue(reviewFixture() as never);
  vi.mocked(prisma.marketplaceReview.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.marketplaceReview.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.marketplaceInstall.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.marketplaceInstall.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.marketplaceInstall.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.marketplaceInstall.create).mockResolvedValue(installFixture() as never);
  vi.mocked(prisma.marketplaceInstall.update).mockResolvedValue(installFixture({ status: 'UNINSTALLED' }) as never);
  vi.mocked(prisma.marketplaceInstall.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.agent.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.agent.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.agent.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.agent.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.agent.create).mockResolvedValue(installedFixture() as never);
  vi.mocked(prisma.agent.update).mockResolvedValue(installedFixture() as never);
  vi.mocked(prisma.agentVersion.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.agentVersion.create).mockResolvedValue({ id: 'av1' } as never);
  vi.mocked(prisma.agentRun.create).mockResolvedValue(runFixture() as never);
  vi.mocked(prisma.agentRun.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.agentRun.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.agentRun.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue({ llmProvider: 'OLLAMA', ollamaModel: 'llama3', omnirouteModel: '' } as never);
  vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
});

describe('GET /api/marketplace/agents', () => {
  it('requires authentication', async () => {
    const response = await request(app)
      .get('/api/marketplace/agents')
      .set({ 'x-csrf-token': 'test-csrf-token', Cookie: 'ryuksaidso_csrf=test-csrf-token' });

    expect(response.status).toBe(401);
    expect(prisma.marketplaceAgent.findMany).not.toHaveBeenCalled();
  });

  it('returns published agents with creator, stats and categories', async () => {
    vi.mocked(prisma.marketplaceAgent.findMany).mockResolvedValue([marketFixture()] as never);
    vi.mocked(prisma.marketplaceAgent.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.marketplaceAgent.groupBy).mockResolvedValue([
      { category: 'support', _count: { _all: 1 } },
      { category: 'research', _count: { _all: 4 } },
    ] as never);
    vi.mocked(prisma.agentRun.groupBy).mockResolvedValue([
      { agentId: 'mk1', status: 'COMPLETED', _count: { _all: 8 }, _sum: { tokenUsage: 1000 } },
      { agentId: 'mk1', status: 'FAILED', _count: { _all: 2 }, _sum: { tokenUsage: 100 } },
    ] as never);

    const response = await request(app).get('/api/marketplace/agents').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.categories).toEqual([
      { category: 'research', count: 4 },
      { category: 'support', count: 1 },
    ]);
    expect(response.body.agents[0]).toMatchObject({
      slug: 'inbox-triage',
      executions: 10,
      successRate: 80,
      canEdit: false,
      creator: { handle: 'faizan', verified: true },
    });
    expect(response.body.agents[0].config).toBeUndefined();
  });

  it('only exposes published public agents plus the callers own workspace', async () => {
    await request(app).get('/api/marketplace/agents').set(auth(OWNER_TOKEN));

    const where = vi.mocked(prisma.marketplaceAgent.findMany).mock.calls[0][0]?.where as Record<string, unknown>;
    expect(JSON.stringify(where)).toContain('"status":"PUBLISHED"');
    expect(JSON.stringify(where)).toContain('"visibility":"PUBLIC"');
    expect(JSON.stringify(where)).toContain('"suspended":false');
    expect(JSON.stringify(where)).toContain('"organizationId":"org1"');
  });

  it('applies search, category and pricing filters', async () => {
    const response = await request(app)
      .get('/api/marketplace/agents?q=inbox&category=support&pricing=FREE')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    const where = vi.mocked(prisma.marketplaceAgent.findMany).mock.calls[0][0]?.where as { AND: Array<Record<string, unknown>> };
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { category: 'support' },
        { pricing: 'FREE' },
        { OR: [{ name: { contains: 'inbox', mode: 'insensitive' } }, { summary: { contains: 'inbox', mode: 'insensitive' } }, { description: { contains: 'inbox', mode: 'insensitive' } }] },
      ]),
    );
  });

  it('paginates and sorts by popularity on request', async () => {
    await request(app).get('/api/marketplace/agents?sort=popular&page=2&limit=5').set(auth(OWNER_TOKEN));

    const args = vi.mocked(prisma.marketplaceAgent.findMany).mock.calls[0][0];
    expect(args?.skip).toBe(5);
    expect(args?.take).toBe(5);
    expect(args?.orderBy).toEqual({ installs: 'desc' });
  });
});

describe('GET /api/marketplace/agents/mine', () => {
  it('returns every agent in the callers workspace regardless of status', async () => {
    vi.mocked(prisma.marketplaceAgent.findMany).mockResolvedValue([marketFixture({ organizationId: 'org1', status: 'DRAFT', visibility: 'PRIVATE' })] as never);

    const response = await request(app).get('/api/marketplace/agents/mine').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ status: 'DRAFT', canEdit: true });
    expect(vi.mocked(prisma.marketplaceAgent.findMany).mock.calls[0][0]?.where).toEqual({ organizationId: 'org1' });
  });
});

describe('GET /api/marketplace/agents/:slug', () => {
  it('answers 404 for unknown agents', async () => {
    const response = await request(app).get('/api/marketplace/agents/nope').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('not found');
  });

  it('returns the full detail with reviews, histogram and stats', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.marketplaceReview.groupBy).mockResolvedValue([
      { rating: 5, _count: { _all: 1 } },
      { rating: 4, _count: { _all: 1 } },
    ] as never);
    vi.mocked(prisma.marketplaceReview.findMany).mockResolvedValue([reviewFixture()] as never);
    vi.mocked(prisma.agentRun.groupBy).mockResolvedValue([
      { agentId: 'mk1', status: 'COMPLETED', _count: { _all: 3 }, _sum: { tokenUsage: 300 } },
    ] as never);

    const response = await request(app).get('/api/marketplace/agents/inbox-triage').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      slug: 'inbox-triage',
      description: 'A long description of the marketplace agent and what it does.',
      canEdit: false,
      canModerate: false,
      executions: 3,
      successRate: 100,
      requiredTools: ['search_email', 'unknown_tool'],
      config: { instructions: 'You are an inbox triage assistant.' },
      histogram: [{ rating: 5, count: 1 }, { rating: 4, count: 1 }],
      reviews: [expect.objectContaining({ rating: 5 })],
      myInstall: null,
      myReview: null,
    });
  });

  it('lets the owning workspace see its own draft', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(
      marketFixture({ organizationId: 'org1', status: 'DRAFT', visibility: 'PRIVATE' }) as never,
    );

    const response = await request(app).get('/api/marketplace/agents/inbox-triage').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.canEdit).toBe(true);
  });
});

describe('GET /api/marketplace/agents/:slug/versions', () => {
  it('lists version history with the active marker', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.marketplaceAgentVersion.findMany).mockResolvedValue([
      { id: 'v2', agentId: 'mk1', version: 2, changelog: 'Second release.', createdBy: 'Owner', createdAt: NOW },
      { id: 'v1', agentId: 'mk1', version: 1, changelog: 'Initial draft.', createdBy: 'Owner', createdAt: NOW },
    ] as never);

    const response = await request(app).get('/api/marketplace/agents/inbox-triage/versions').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.current).toBe(2);
    expect(response.body.versions).toHaveLength(2);
    expect(response.body.versions[0]).toMatchObject({ version: 2, isCurrent: true });
    expect(response.body.versions[1]).toMatchObject({ version: 1, isCurrent: false });
  });

  it('answers 404 for unknown agents', async () => {
    const response = await request(app).get('/api/marketplace/agents/nope/versions').set(auth(OWNER_TOKEN));
    expect(response.status).toBe(404);
  });
});

describe('GET /api/marketplace/agents/:slug/reviews', () => {
  it('returns the review list with its histogram', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.marketplaceReview.findMany).mockResolvedValue([reviewFixture()] as never);
    vi.mocked(prisma.marketplaceReview.groupBy).mockResolvedValue([{ rating: 5, _count: { _all: 1 } }] as never);

    const response = await request(app).get('/api/marketplace/agents/inbox-triage/reviews').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.reviews).toHaveLength(1);
    expect(response.body.histogram).toEqual([{ rating: 5, count: 1 }]);
  });
});

describe('GET /api/marketplace/agents/:slug/analytics', () => {
  it('answers 404 for agents outside the workspace', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(null as never);

    const response = await request(app).get('/api/marketplace/agents/inbox-triage/analytics').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(404);
    expect(vi.mocked(prisma.marketplaceAgent.findFirst).mock.calls[0][0]?.where).toMatchObject({ organizationId: 'org1' });
  });

  it('reports installs, executions, tokens and rating buckets', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture({ organizationId: 'org1' }) as never);
    vi.mocked(prisma.marketplaceInstall.count).mockResolvedValue(4 as never);
    vi.mocked(prisma.agentRun.groupBy).mockResolvedValue([
      { agentId: 'mk1', status: 'COMPLETED', _count: { _all: 9 }, _sum: { tokenUsage: 9000 } },
      { agentId: 'mk1', status: 'FAILED', _count: { _all: 1 }, _sum: { tokenUsage: 500 } },
    ] as never);
    vi.mocked(prisma.marketplaceReview.groupBy).mockResolvedValue([{ rating: 5, _count: { _all: 2 } }] as never);

    const response = await request(app).get('/api/marketplace/agents/inbox-triage/analytics').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      installs: 12,
      installs30d: 4,
      tries: 5,
      executions: 10,
      completed: 9,
      failed: 1,
      successRate: 90,
      totalTokens: 9500,
      ratingCount: 2,
      histogram: [{ rating: 5, count: 2 }],
    });
  });
});

describe('GET /api/marketplace/installs', () => {
  it('lists workspace installs with marketplace and agent context', async () => {
    vi.mocked(prisma.marketplaceInstall.findMany).mockResolvedValue([installFixture()] as never);
    vi.mocked(prisma.marketplaceAgent.findMany).mockResolvedValue([marketFixture()] as never);
    vi.mocked(prisma.agent.findMany).mockResolvedValue([installedFixture()] as never);

    const response = await request(app).get('/api/marketplace/installs').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      status: 'ACTIVE',
      agent: { slug: 'inbox-triage', name: 'Inbox Triage' },
      installedAgent: { id: 'ag1', name: 'Inbox Triage', enabled: true },
    });
  });
});

describe('GET /api/marketplace/creators/:handle', () => {
  it('answers 404 for unknown handles', async () => {
    const response = await request(app).get('/api/marketplace/creators/ghost').set(auth(OWNER_TOKEN));
    expect(response.status).toBe(404);
  });

  it('returns the profile with stats and published agents', async () => {
    vi.mocked(prisma.marketplaceCreator.findUnique).mockResolvedValue(creatorFixture() as never);
    vi.mocked(prisma.marketplaceAgent.findMany).mockResolvedValue([marketFixture()] as never);

    const response = await request(app).get('/api/marketplace/creators/faizan').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      handle: 'faizan',
      verified: true,
      stats: { agentCount: 1, totalInstalls: 12 },
    });
    expect(response.body.agents).toHaveLength(1);
  });
});

describe('POST /api/marketplace/agents', () => {
  const validBody = {
    name: 'Inbox Triage',
    summary: 'Reads new email and drafts replies for review.',
    description: 'A long description of the marketplace agent and what it does.',
    category: 'support',
    requiredIntegrations: ['gmail'],
    requiredModels: ['chat'],
    permissions: ['email:send'],
    config: { instructions: 'You are an inbox triage assistant.', tools: ['search_email'] },
  };

  it('rejects members without manage rights', async () => {
    const response = await request(app)
      .post('/api/marketplace/agents')
      .set(auth(MEMBER_TOKEN))
      .send(validBody);

    expect(response.status).toBe(403);
    expect(prisma.marketplaceAgent.create).not.toHaveBeenCalled();
  });

  it('rejects a summary that is too short', async () => {
    const response = await request(app)
      .post('/api/marketplace/agents')
      .set(auth(OWNER_TOKEN))
      .send({ ...validBody, summary: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
  });

  it('rejects integrations outside the provider catalog', async () => {
    const response = await request(app)
      .post('/api/marketplace/agents')
      .set(auth(OWNER_TOKEN))
      .send({ ...validBody, requiredIntegrations: ['teleport'] });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('teleport');
    expect(prisma.marketplaceAgent.create).not.toHaveBeenCalled();
  });

  it('requires a price for paid agents', async () => {
    const response = await request(app)
      .post('/api/marketplace/agents')
      .set(auth(OWNER_TOKEN))
      .send({ ...validBody, pricing: 'PAID', priceAmount: 0 });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('price greater than zero');
  });

  it('creates a private draft with an initial version and creator profile', async () => {
    vi.mocked(prisma.marketplaceAgent.create).mockResolvedValue(
      marketFixture({ organizationId: 'org1', status: 'DRAFT', visibility: 'PRIVATE', currentVersion: 1, latestVersion: 1 }) as never,
    );

    const response = await request(app)
      .post('/api/marketplace/agents')
      .set(auth(OWNER_TOKEN))
      .send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ slug: 'inbox-triage', status: 'DRAFT', visibility: 'PRIVATE', canEdit: true });
    expect(prisma.marketplaceCreator.create).toHaveBeenCalledWith({
      data: { userId: 'u1', handle: 'owner', displayName: 'Owner' },
    });
    expect(vi.mocked(prisma.marketplaceAgent.create).mock.calls[0][0]?.data).toMatchObject({
      slug: 'inbox-triage',
      organizationId: 'org1',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      requiredIntegrations: ['gmail'],
    });
    expect(vi.mocked(prisma.marketplaceAgentVersion.create).mock.calls[0][0]?.data).toMatchObject({ version: 1 });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_created');
  });

  it('deduplicates the generated slug', async () => {
    vi.mocked(prisma.marketplaceAgent.findUnique)
      .mockResolvedValueOnce({ id: 'other' } as never)
      .mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/marketplace/agents')
      .set(auth(OWNER_TOKEN))
      .send(validBody);

    expect(response.status).toBe(201);
    expect(vi.mocked(prisma.marketplaceAgent.create).mock.calls[0][0]?.data.slug).toBe('inbox-triage-2');
  });
});

describe('PATCH /api/marketplace/agents/:slug', () => {
  it('rejects members without manage rights', async () => {
    const response = await request(app)
      .patch('/api/marketplace/agents/inbox-triage')
      .set(auth(MEMBER_TOKEN))
      .send({ summary: 'A brand new summary for the marketplace listing.' });

    expect(response.status).toBe(403);
  });

  it('answers 404 for agents in other workspaces', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .patch('/api/marketplace/agents/inbox-triage')
      .set(auth(OWNER_TOKEN))
      .send({ summary: 'A brand new summary for the marketplace listing.' });

    expect(response.status).toBe(404);
  });

  it('returns a submitted agent to draft while it is edited', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(
      marketFixture({ organizationId: 'org1', status: 'IN_REVIEW' }) as never,
    );

    const response = await request(app)
      .patch('/api/marketplace/agents/inbox-triage')
      .set(auth(OWNER_TOKEN))
      .send({ summary: 'A brand new summary for the marketplace listing.' });

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({ status: 'DRAFT' });
  });

  it('blocks config edits on published agents', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);

    const response = await request(app)
      .patch('/api/marketplace/agents/inbox-triage')
      .set(auth(OWNER_TOKEN))
      .send({ config: { instructions: 'You are an inbox triage assistant.', tools: [] } });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('new version');
    expect(prisma.marketplaceAgent.update).not.toHaveBeenCalled();
  });

  it('updates draft metadata and keeps version one in sync', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(
      marketFixture({ organizationId: 'org1', status: 'DRAFT', latestVersion: 1, currentVersion: 1 }) as never,
    );

    const response = await request(app)
      .patch('/api/marketplace/agents/inbox-triage')
      .set(auth(OWNER_TOKEN))
      .send({ summary: 'A brand new summary for the marketplace listing.', config: { instructions: 'You are an inbox triage assistant.', tools: ['search_email'] } });

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({
      summary: 'A brand new summary for the marketplace listing.',
    });
    expect(prisma.marketplaceAgentVersion.updateMany).toHaveBeenCalled();
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_updated');
  });
});

describe('POST /api/marketplace/agents/:slug/versions', () => {
  it('only allows published agents to publish versions', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(
      marketFixture({ organizationId: 'org1', status: 'DRAFT' }) as never,
    );

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/versions')
      .set(auth(OWNER_TOKEN))
      .send({ config: { instructions: 'You are an inbox triage assistant.', tools: [] }, changelog: 'Better drafts.' });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('published');
  });

  it('creates the next version and points the agent at it', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture({ organizationId: 'org1' }) as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/versions')
      .set(auth(OWNER_TOKEN))
      .send({ config: { instructions: 'You are an inbox triage assistant.', tools: ['search_email'] }, changelog: 'Better drafts.' });

    expect(response.status).toBe(201);
    expect(vi.mocked(prisma.marketplaceAgentVersion.create).mock.calls[0][0]?.data).toMatchObject({ version: 3 });
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({
      currentVersion: 3,
      latestVersion: 3,
      changelog: 'Better drafts.',
    });
  });
});

describe('POST /api/marketplace/agents/:slug/rollback', () => {
  it('answers 409 when the version is already active', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture({ organizationId: 'org1' }) as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/rollback')
      .set(auth(OWNER_TOKEN))
      .send({ version: 2 });

    expect(response.status).toBe(409);
    expect(prisma.marketplaceAgentVersion.findFirst).not.toHaveBeenCalled();
  });

  it('answers 404 for versions that never existed', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture({ organizationId: 'org1' }) as never);
    vi.mocked(prisma.marketplaceAgentVersion.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/rollback')
      .set(auth(OWNER_TOKEN))
      .send({ version: 9 });

    expect(response.status).toBe(404);
  });

  it('rolls the active config back to the requested version', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture({ organizationId: 'org1' }) as never);
    vi.mocked(prisma.marketplaceAgentVersion.findFirst).mockResolvedValue({
      id: 'v1',
      agentId: 'mk1',
      version: 1,
      config: { instructions: 'Old instructions.', tools: [] },
      changelog: 'Initial draft.',
      createdBy: 'Owner',
      createdAt: NOW,
    } as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/rollback')
      .set(auth(OWNER_TOKEN))
      .send({ version: 1 });

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({
      currentVersion: 1,
      config: { instructions: 'Old instructions.', tools: [] },
    });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_rolled_back');
  });
});

describe('POST /api/marketplace/agents/:slug/submit', () => {
  it('only submits drafts or rejected agents', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture({ organizationId: 'org1' }) as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/submit')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(409);
    expect(prisma.marketplaceAgent.update).not.toHaveBeenCalled();
  });

  it('moves a draft into the review queue', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(
      marketFixture({ organizationId: 'org1', status: 'DRAFT' }) as never,
    );
    vi.mocked(prisma.marketplaceAgent.update).mockResolvedValue(marketFixture({ status: 'IN_REVIEW' }) as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/submit')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({ status: 'IN_REVIEW' });
  });
});

describe('POST /api/marketplace/agents/:slug/unpublish', () => {
  it('pulls a published agent back to a private draft', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture({ organizationId: 'org1' }) as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/unpublish')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({
      status: 'DRAFT',
      visibility: 'PRIVATE',
      suspended: false,
    });
  });

  it('answers 409 for drafts', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(
      marketFixture({ organizationId: 'org1', status: 'DRAFT' }) as never,
    );

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/unpublish')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(409);
  });
});

describe('DELETE /api/marketplace/agents/:slug', () => {
  it('answers 404 for other workspaces', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .delete('/api/marketplace/agents/inbox-triage')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(404);
    expect(prisma.marketplaceAgent.delete).not.toHaveBeenCalled();
  });

  it('removes the agent with its versions, reviews and installs', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(
      marketFixture({ organizationId: 'org1', status: 'DRAFT' }) as never,
    );

    const response = await request(app)
      .delete('/api/marketplace/agents/inbox-triage')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(204);
    expect(prisma.marketplaceAgentVersion.deleteMany).toHaveBeenCalledWith({ where: { agentId: 'mk1' } });
    expect(prisma.marketplaceReview.deleteMany).toHaveBeenCalledWith({ where: { agentId: 'mk1' } });
    expect(prisma.marketplaceInstall.deleteMany).toHaveBeenCalledWith({ where: { agentId: 'mk1' } });
    expect(prisma.marketplaceAgent.delete).toHaveBeenCalledWith({ where: { id: 'mk1' } });
  });
});

describe('POST /api/marketplace/agents/:slug/install', () => {
  it('rejects members without manage rights', async () => {
    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/install')
      .set(auth(MEMBER_TOKEN));

    expect(response.status).toBe(403);
    expect(prisma.agent.create).not.toHaveBeenCalled();
  });

  it('answers 404 when the agent is not published', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/install')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(404);
  });

  it('answers 409 when the workspace already installed it', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.marketplaceInstall.findFirst).mockResolvedValue(installFixture() as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/install')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('already installed');
  });

  it('answers 402 for paid agents while billing is enforced on the free plan', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture({ pricing: 'PAID', priceAmount: 49900 }) as never);
    const { resolveBilling } = await import('../lib/entitlements');
    vi.mocked(resolveBilling).mockResolvedValueOnce({
      billingEnabled: true,
      enforced: true,
      planId: 'plan-free',
      planCode: 'free',
      planName: 'Free',
      limits: { maxAgents: 2, maxMembers: 3, maxTicketsPerMonth: 50, maxRunsPerMonth: 100, maxApiKeys: 1, apiAccess: false, analyticsAccess: false },
      subscription: null,
    } as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/install')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(402);
    expect(response.body.error).toBe('PaymentRequired');
    expect(prisma.agent.create).not.toHaveBeenCalled();
  });

  it('installs the agent and reports missing dependencies', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/install')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      marketplace: { slug: 'inbox-triage', name: 'Inbox Triage', version: 2 },
      agent: { slug: 'inbox-triage', enabled: true },
      missing: { integrations: ['gmail'], tools: ['unknown_tool'], modelReady: true },
    });
    expect(vi.mocked(prisma.agent.create).mock.calls[0][0]?.data).toMatchObject({
      organizationId: 'org1',
      name: 'Inbox Triage',
      instructions: 'You are an inbox triage assistant.',
      systemPrompt: 'Be concise.',
      tools: ['search_email', 'unknown_tool'],
    });
    expect(vi.mocked(prisma.marketplaceInstall.create).mock.calls[0][0]?.data).toMatchObject({
      agentId: 'mk1',
      organizationId: 'org1',
      source: 'INSTALL',
      version: 2,
    });
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({ installs: { increment: 1 } });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_installed');
  });

  it('suffixes the installed slug when the workspace already has that agent', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.agent.findUnique)
      .mockResolvedValueOnce({ id: 'taken' } as never)
      .mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/install')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(201);
    expect(vi.mocked(prisma.agent.create).mock.calls[0][0]?.data.slug).toBe('inbox-triage-2');
  });

  it('propagates a quota denial as 402', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    const { assertQuota } = await import('../lib/entitlements');
    vi.mocked(assertQuota).mockRejectedValueOnce(
      Object.assign(new Error('The Free plan is limited to 2 AI agents.'), { statusCode: 402, error: 'PaymentRequired' }),
    );

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/install')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(402);
    expect(prisma.agent.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/marketplace/agents/:slug/fork', () => {
  it('answers 404 for agents outside the catalog', async () => {
    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/fork')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(404);
  });

  it('creates a private draft copy with a fork marker', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.marketplaceAgent.create).mockResolvedValue(
      marketFixture({ slug: 'inbox-triage-fork', organizationId: 'org1', status: 'DRAFT', visibility: 'PRIVATE', pricing: 'FREE', forkedFromId: 'mk1' }) as never,
    );

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/fork')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(201);
    expect(vi.mocked(prisma.marketplaceAgent.create).mock.calls[0][0]?.data).toMatchObject({
      slug: 'inbox-triage-fork',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      pricing: 'FREE',
      priceAmount: 0,
      forkedFromId: 'mk1',
      organizationId: 'org1',
    });
    expect(response.body).toMatchObject({ slug: 'inbox-triage-fork', forkedFrom: { slug: 'inbox-triage' } });
    expect(vi.mocked(prisma.marketplaceAgentVersion.create).mock.calls[0][0]?.data).toMatchObject({ version: 1 });
  });
});

describe('POST /api/marketplace/agents/:slug/try', () => {
  it('answers 429 inside the cooldown window', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(redis.set).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/try')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'Summarise my inbox.' });

    expect(response.status).toBe(429);
    expect(response.body.message).toContain('warming up');
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it('still previews when the cooldown store is unavailable', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(redis.set).mockRejectedValue(new Error('connection refused'));
    vi.mocked(prisma.agent.findFirst).mockResolvedValue(installedFixture({ slug: 'try-inbox-triage' }) as never);
    vi.mocked(prisma.agentVersion.findFirst).mockResolvedValue({ id: 'av9' } as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/try')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'Summarise my inbox.' });

    expect(response.status).toBe(202);
  });

  it('answers 409 when no model provider is configured', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    const { resolveRunProvider } = await import('../services/modelProviders');
    vi.mocked(resolveRunProvider).mockResolvedValueOnce({ provider: 'OLLAMA', model: '', custom: null, ok: false, reason: 'no_model' });

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/try')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'Summarise my inbox.' });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('no model configured');
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it('creates a preview agent, queues the run and counts the try', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.agent.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/try')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'Summarise my inbox.' });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ runId: 'run1', jobId: 'job1' });
    expect(vi.mocked(prisma.agent.create).mock.calls[0][0]?.data).toMatchObject({
      name: 'Inbox Triage (preview)',
      slug: 'try-inbox-triage',
      enabled: true,
    });
    expect(vi.mocked(prisma.agentRun.create).mock.calls[0][0]?.data).toMatchObject({
      status: 'QUEUED',
      trigger: 'marketplace',
      input: { prompt: 'Summarise my inbox.' },
    });
    expect(prisma.agentVersion.create).toHaveBeenCalled();
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({ tries: { increment: 1 } });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_tried');
  });

  it('reuses the existing preview agent on later tries', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.agent.findFirst).mockResolvedValue(installedFixture({ slug: 'try-inbox-triage' }) as never);
    vi.mocked(prisma.agentVersion.findFirst).mockResolvedValue({ id: 'av9' } as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/try')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'Summarise my inbox.' });

    expect(response.status).toBe(202);
    expect(prisma.agent.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.agentRun.create).mock.calls[0][0]?.data.agentVersionId).toBe('av9');
  });
});

describe('POST /api/marketplace/agents/:slug/reviews', () => {
  it('rejects ratings outside one to five', async () => {
    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/reviews')
      .set(auth(MEMBER_TOKEN))
      .send({ rating: 7 });

    expect(response.status).toBe(400);
    expect(prisma.marketplaceReview.create).not.toHaveBeenCalled();
  });

  it('creates a review and recomputes the rating summary', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.marketplaceReview.groupBy).mockResolvedValue([
      { rating: 5, _count: { _all: 2 } },
      { rating: 4, _count: { _all: 2 } },
    ] as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/reviews')
      .set(auth(MEMBER_TOKEN))
      .send({ rating: 5, title: 'Great agent', body: 'Saved me an hour every morning.' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ratingAvg: 4.5, ratingCount: 4 });
    expect(vi.mocked(prisma.marketplaceReview.create).mock.calls[0][0]?.data).toMatchObject({
      agentId: 'mk1',
      userId: 'u2',
      rating: 5,
    });
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({ ratingAvg: 4.5, ratingCount: 4 });
  });

  it('updates the callers existing review instead of duplicating it', async () => {
    vi.mocked(prisma.marketplaceAgent.findFirst).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.marketplaceReview.findUnique).mockResolvedValue(reviewFixture() as never);

    const response = await request(app)
      .post('/api/marketplace/agents/inbox-triage/reviews')
      .set(auth(MEMBER_TOKEN))
      .send({ rating: 3, title: 'Fine', body: 'Works, with a few rough edges.' });

    expect(response.status).toBe(200);
    expect(prisma.marketplaceReview.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.marketplaceReview.update).mock.calls[0][0]?.data).toMatchObject({ rating: 3 });
  });

  it('answers 404 for unknown agents', async () => {
    const response = await request(app)
      .post('/api/marketplace/agents/nope/reviews')
      .set(auth(MEMBER_TOKEN))
      .send({ rating: 5 });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/marketplace/installs/:id/uninstall', () => {
  it('answers 404 for installs in other workspaces', async () => {
    vi.mocked(prisma.marketplaceInstall.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/marketplace/installs/in1/uninstall')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(404);
  });

  it('answers 409 for installs that are already inactive', async () => {
    vi.mocked(prisma.marketplaceInstall.findFirst).mockResolvedValue(installFixture({ status: 'UNINSTALLED' }) as never);

    const response = await request(app)
      .post('/api/marketplace/installs/in1/uninstall')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(409);
  });

  it('deactivates the install and disables the linked agent', async () => {
    vi.mocked(prisma.marketplaceInstall.findFirst).mockResolvedValue(installFixture() as never);
    vi.mocked(prisma.agent.findFirst).mockResolvedValue(installedFixture() as never);

    const response = await request(app)
      .post('/api/marketplace/installs/in1/uninstall')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceInstall.update).mock.calls[0][0]?.data).toMatchObject({ status: 'UNINSTALLED' });
    expect(vi.mocked(prisma.agent.update).mock.calls[0][0]?.data).toMatchObject({ enabled: false });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_uninstalled');
  });
});

describe('GET /api/admin/marketplace/queue', () => {
  it('rejects regular users', async () => {
    const response = await request(app).get('/api/admin/marketplace/queue').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(403);
    expect(prisma.marketplaceAgent.findMany).not.toHaveBeenCalled();
  });

  it('returns submitted agents with their config for system admins', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceAgent.findMany).mockResolvedValue([
      marketFixture({ status: 'IN_REVIEW', organizationId: 'org9' }),
    ] as never);

    const response = await request(app).get('/api/admin/marketplace/queue').set(auth(ADMIN_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      slug: 'inbox-triage',
      status: 'IN_REVIEW',
      config: { instructions: 'You are an inbox triage assistant.' },
      creator: { handle: 'faizan' },
    });
  });
});

describe('GET /api/admin/marketplace/agents', () => {
  it('rejects regular users', async () => {
    const response = await request(app).get('/api/admin/marketplace/agents').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(403);
    expect(prisma.marketplaceAgent.findMany).not.toHaveBeenCalled();
  });

  it('lists every marketplace agent with moderation flags for system admins', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceAgent.findMany).mockResolvedValue([
      marketFixture({ status: 'PUBLISHED', suspended: true }),
      marketFixture({ id: 'mk2', slug: 'meeting-brief', status: 'DRAFT' }),
    ] as never);

    const response = await request(app).get('/api/admin/marketplace/agents').set(auth(ADMIN_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({
      slug: 'inbox-triage',
      status: 'PUBLISHED',
      suspended: true,
      installs: 12,
      creator: { handle: 'faizan' },
    });
    expect(vi.mocked(prisma.marketplaceAgent.findMany).mock.calls[0][0]?.where).not.toHaveProperty('status');
  });

  it('filters by status when one is provided', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceAgent.findMany).mockResolvedValue([marketFixture({ status: 'REJECTED' })] as never);

    const response = await request(app)
      .get('/api/admin/marketplace/agents?status=rejected')
      .set(auth(ADMIN_TOKEN));

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.findMany).mock.calls[0][0]?.where).toMatchObject({ status: 'REJECTED' });
  });
});

describe('POST /api/admin/marketplace/agents/:id/review', () => {
  it('publishes an approved agent', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceAgent.findUnique).mockResolvedValue(marketFixture({ status: 'IN_REVIEW' }) as never);
    vi.mocked(prisma.marketplaceAgent.update).mockResolvedValue(marketFixture({ status: 'PUBLISHED' }) as never);

    const response = await request(app)
      .post('/api/admin/marketplace/agents/mk1/review')
      .set(auth(ADMIN_TOKEN))
      .send({ action: 'approve' });

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      suspended: false,
    });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_approved');
  });

  it('rejects an agent with a reason', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceAgent.findUnique).mockResolvedValue(marketFixture({ status: 'IN_REVIEW' }) as never);
    vi.mocked(prisma.marketplaceAgent.update).mockResolvedValue(marketFixture({ status: 'REJECTED' }) as never);

    const response = await request(app)
      .post('/api/admin/marketplace/agents/mk1/review')
      .set(auth(ADMIN_TOKEN))
      .send({ action: 'reject', reason: 'Instructions are too thin.' });

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({
      status: 'REJECTED',
      visibility: 'PRIVATE',
      reviewReason: 'Instructions are too thin.',
    });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_rejected');
  });

  it('answers 404 for unknown agents', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceAgent.findUnique).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/admin/marketplace/agents/ghost/review')
      .set(auth(ADMIN_TOKEN))
      .send({ action: 'approve' });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/admin/marketplace/agents/:id/moderate', () => {
  it('toggles verified, featured and suspension flags', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceAgent.findUnique).mockResolvedValue(marketFixture() as never);
    vi.mocked(prisma.marketplaceAgent.update).mockResolvedValue(marketFixture({ verified: true, featured: true, suspended: true }) as never);

    const response = await request(app)
      .post('/api/admin/marketplace/agents/mk1/moderate')
      .set(auth(ADMIN_TOKEN))
      .send({ verified: true, featured: true, suspend: true });

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceAgent.update).mock.calls[0][0]?.data).toMatchObject({
      verified: true,
      featured: true,
      suspended: true,
    });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('marketplace.agent_moderated');
  });
});

describe('GET /api/admin/marketplace/creators', () => {
  it('lists creators with their published agent counts', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceCreator.findMany).mockResolvedValue([creatorFixture()] as never);
    vi.mocked(prisma.marketplaceAgent.groupBy).mockResolvedValue([{ creatorId: 'cr1', _count: { _all: 3 } }] as never);

    const response = await request(app).get('/api/admin/marketplace/creators').set(auth(ADMIN_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ handle: 'faizan', publishedAgents: 3 });
  });
});

describe('POST /api/admin/marketplace/creators/:userId/moderate', () => {
  it('answers 404 when the creator has no profile yet', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceCreator.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/admin/marketplace/creators/ghost/moderate')
      .set(auth(ADMIN_TOKEN))
      .send({ verified: true });

    expect(response.status).toBe(404);
  });

  it('updates the verified badge', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceCreator.findFirst).mockResolvedValue(creatorFixture({ verified: false }) as never);
    vi.mocked(prisma.marketplaceCreator.update).mockResolvedValue(creatorFixture({ verified: true }) as never);

    const response = await request(app)
      .post('/api/admin/marketplace/creators/c-user/moderate')
      .set(auth(ADMIN_TOKEN))
      .send({ verified: true });

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceCreator.update).mock.calls[0][0]?.data).toMatchObject({ verified: true });
  });

  it('finds the creator by id even without a linked user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.marketplaceCreator.findFirst).mockResolvedValue(creatorFixture({ userId: null, verified: false }) as never);
    vi.mocked(prisma.marketplaceCreator.update).mockResolvedValue(creatorFixture({ userId: null, verified: true }) as never);

    const response = await request(app)
      .post('/api/admin/marketplace/creators/mk_sys_ryuksaidso/moderate')
      .set(auth(ADMIN_TOKEN))
      .send({ verified: true });

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.marketplaceCreator.findFirst).mock.calls[0][0]?.where).toMatchObject({
      OR: [{ id: 'mk_sys_ryuksaidso' }, { userId: 'mk_sys_ryuksaidso' }],
    });
  });
});
