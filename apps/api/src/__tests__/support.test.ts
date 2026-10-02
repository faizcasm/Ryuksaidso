import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../server';
import { signToken } from '../lib/auth';
import { prisma } from '../lib/db';
import { redis } from '../lib/redis';

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
    webhookDelivery: { create: vi.fn(), findMany: vi.fn() },
    widgetSetting: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    widgetSession: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    widgetMessage: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    agent: { findFirst: vi.fn(), findMany: vi.fn() },
    agentRun: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    agentStep: { findMany: vi.fn() },
    organization: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    modelProvider: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    supportMessage: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
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

const NOW = new Date('2026-10-02T00:00:00.000Z');
const app = createApp();
const OWNER_TOKEN = signToken({ id: 'u1', email: 'owner@test.local', name: 'Owner', organizationId: 'org1', role: 'OWNER' });
const ADMIN_TOKEN = signToken({ id: 'admin1', email: 'admin@test.local', name: 'Admin', organizationId: 'org1', role: 'OWNER' });

function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'x-csrf-token': 'test-csrf-token',
    Cookie: 'ryuksaidso_csrf=test-csrf-token',
  };
}

function messageFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sm1',
    organizationId: 'org1',
    userId: 'u1',
    userName: 'Owner',
    userEmail: 'owner@test.local',
    message: 'The traces view is slow when I open a run.',
    status: 'OPEN',
    readAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(redis.set).mockResolvedValue('OK' as never);
  vi.mocked(prisma.supportMessage.create).mockResolvedValue(messageFixture() as never);
  vi.mocked(prisma.supportMessage.findMany).mockResolvedValue([messageFixture()] as never);
  vi.mocked(prisma.supportMessage.findUnique).mockResolvedValue(messageFixture() as never);
  vi.mocked(prisma.supportMessage.update).mockResolvedValue(messageFixture({ status: 'READ', readAt: NOW }) as never);
  vi.mocked(prisma.supportMessage.count).mockResolvedValue(3 as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null as never);
});

describe('POST /api/support', () => {
  it('requires authentication', async () => {
    const response = await request(app)
      .post('/api/support')
      .set({ 'x-csrf-token': 'test-csrf-token', Cookie: 'ryuksaidso_csrf=test-csrf-token' })
      .send({ message: 'Hello Faizan, this message needs an account.' });

    expect(response.status).toBe(401);
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
  });

  it('rejects an empty message', async () => {
    const response = await request(app)
      .post('/api/support')
      .set(auth(OWNER_TOKEN))
      .send({ message: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
  });

  it('rejects a message shorter than ten characters', async () => {
    const response = await request(app)
      .post('/api/support')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'hi ceo' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
  });

  it('rejects a message longer than four thousand characters', async () => {
    const response = await request(app)
      .post('/api/support')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'a'.repeat(4001) });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
  });

  it('delivers the message with the sender context and audit entry', async () => {
    const response = await request(app)
      .post('/api/support')
      .set(auth(OWNER_TOKEN))
      .send({ message: '   The export button fails on Firefox.   ' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: 'sm1', status: 'OPEN' });
    expect(response.body.createdAt).toBe(NOW.toISOString());
    expect(prisma.supportMessage.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org1',
        userId: 'u1',
        userName: 'Owner',
        userEmail: 'owner@test.local',
        message: 'The export button fails on Firefox.',
      },
    });
    const auditRow = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(auditRow.action).toBe('support.message_sent');
    expect(auditRow.resourceId).toBe('sm1');
  });

  it('answers 429 while the sender is inside the cooldown window', async () => {
    vi.mocked(redis.set).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/api/support')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'Sending twice within a few seconds.' });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe('RateLimitExceeded');
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
  });

  it('still delivers when the cooldown store is unavailable', async () => {
    vi.mocked(redis.set).mockRejectedValue(new Error('connection refused'));

    const response = await request(app)
      .post('/api/support')
      .set(auth(OWNER_TOKEN))
      .send({ message: 'Redis being down should not block support.' });

    expect(response.status).toBe(201);
    expect(prisma.supportMessage.create).toHaveBeenCalled();
  });
});

describe('GET /api/admin/support', () => {
  it('returns messages and the unread count for system admins', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);

    const response = await request(app)
      .get('/api/admin/support')
      .set(auth(ADMIN_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.unread).toBe(3);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0]).toMatchObject({ id: 'sm1', status: 'OPEN' });
    expect(prisma.supportMessage.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 100 });
    expect(prisma.supportMessage.count).toHaveBeenCalledWith({ where: { status: 'OPEN' } });
  });

  it('rejects regular users', async () => {
    const response = await request(app)
      .get('/api/admin/support')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });
});

describe('PATCH /api/admin/support/:id/read', () => {
  it('marks a message as read', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);

    const response = await request(app)
      .patch('/api/admin/support/sm1/read')
      .set(auth(ADMIN_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('READ');
    expect(prisma.supportMessage.update).toHaveBeenCalledWith({
      where: { id: 'sm1' },
      data: { status: 'READ', readAt: expect.any(Date) },
    });
  });

  it('answers 404 for unknown messages', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    vi.mocked(prisma.supportMessage.findUnique).mockResolvedValue(null as never);

    const response = await request(app)
      .patch('/api/admin/support/missing/read')
      .set(auth(ADMIN_TOKEN));

    expect(response.status).toBe(404);
    expect(prisma.supportMessage.update).not.toHaveBeenCalled();
  });

  it('rejects regular users', async () => {
    const response = await request(app)
      .patch('/api/admin/support/sm1/read')
      .set(auth(OWNER_TOKEN));

    expect(response.status).toBe(403);
  });
});
