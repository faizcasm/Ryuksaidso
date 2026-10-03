import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server';
import { signToken } from '../lib/auth';
import { prisma } from '../lib/db';
import { isEmailConfigured, sendPromoCodeEmail } from '../services/email';
import { PROMO_CODE, PROMO_DISCOUNT_PERCENT } from '../services/promo';

const { billingProvider } = vi.hoisted(() => ({
  billingProvider: {
    name: 'cashfree',
    isConfigured: () => true,
    checkoutEnvironment: () => 'sandbox',
    ensurePlan: vi.fn(async () => 'ryu_pro_m159920'),
    createSubscription: vi.fn(async () => ({
      id: 'sub_remote_1',
      status: 'CREATED',
      sessionId: 'sess_1',
      currentPeriodStart: null,
      currentPeriodEnd: null,
    })),
    getSubscription: vi.fn(async () => ({
      id: 'sub_remote_1',
      status: 'CREATED',
      sessionId: 'sess_1',
      currentPeriodStart: null,
      currentPeriodEnd: null,
    })),
    cancelSubscription: vi.fn(async () => ({
      id: 'sub_remote_1',
      status: 'CANCELLED',
      sessionId: 'sess_1',
      currentPeriodStart: null,
      currentPeriodEnd: null,
    })),
    listSubscriptionPayments: vi.fn(async () => []),
    verifyWebhookSignature: vi.fn(() => true),
  },
}));

vi.mock('../lib/db', () => ({
  prisma: {
    integrationSetting: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    integrationConnection: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    integrationLog: { create: vi.fn(), findMany: vi.fn() },
    knowledgeSource: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    webhookEndpoint: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    webhookDelivery: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    widgetSetting: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    widgetSession: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    widgetMessage: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    agent: { findFirst: vi.fn(), findMany: vi.fn() },
    agentRun: { create: vi.fn(), count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    agentStep: { findMany: vi.fn() },
    organization: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    modelProvider: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    billingSetting: { findUnique: vi.fn(), create: vi.fn() },
    billingPlan: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    billingSubscription: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    billingCustomer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    billingPayment: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    billingWebhookEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    document: { findFirst: vi.fn(), create: vi.fn() },
    apiKey: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    membership: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    ticket: { findFirst: vi.fn(), count: vi.fn() },
    approval: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    evaluation: { findFirst: vi.fn(), findMany: vi.fn() },
    session: { findUnique: vi.fn() },
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

vi.mock('../services/email', () => ({
  isEmailConfigured: vi.fn(() => true),
  verifyEmailTransport: vi.fn(async () => true),
  sendVerificationEmail: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
  sendWorkspaceInvitationEmail: vi.fn(async () => undefined),
  sendPromoCodeEmail: vi.fn(async () => undefined),
}));

vi.mock('../services/billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/billing')>();
  return {
    ...actual,
    billingConfigured: () => true,
    ensureBillingPlans: async () => undefined,
    getBillingProvider: () => billingProvider,
  };
});

const NOW = new Date('2026-10-01T12:00:00.000Z');
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
    apiKey: 'encrypted-key',
    defaultModel: 'gpt-4o-mini',
    models: JSON.stringify(['gpt-4o-mini']),
    enabled: true,
    status: 'HEALTHY',
    latencyMs: 120,
    lastCheckedAt: NOW,
    lastError: '',
    connectedBy: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function qualifiedOrg() {
  vi.mocked(prisma.modelProvider.findMany).mockResolvedValue([providerFixture()] as never);
  vi.mocked(prisma.agentRun.count).mockResolvedValue(2 as never);
}

function organizationRow(overrides: Record<string, unknown> = {}) {
  return { llmProvider: 'OMNIROUTE', ollamaModel: 'qwen2.5-coder', omnirouteModel: 'gpt-4o-mini', promoCodeSentAt: null, name: 'Acme', ...overrides };
}

function seedCheckout() {
  vi.mocked(prisma.billingSetting.findUnique).mockResolvedValue({ id: 'global', billingEnabled: true, updatedBy: '', updatedAt: NOW } as never);
  vi.mocked(prisma.billingPlan.findUnique).mockResolvedValue({
    id: 'plan-pro',
    code: 'pro',
    name: 'Pro',
    description: 'Pro plan',
    priceMonthly: 199900,
    priceYearly: 1999000,
    currency: 'INR',
    active: true,
    sortOrder: 3,
    providerPlanMonthly: 'ryu_pro_m199900',
    providerPlanYearly: 'ryu_pro_y1999000',
    features: [],
  } as never);
  vi.mocked(prisma.billingSubscription.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.billingSubscription.create).mockResolvedValue(subscriptionRow(199900));
  vi.mocked(prisma.billingCustomer.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.billingCustomer.create).mockResolvedValue({ id: 'bc1', organizationId: 'org1' } as never);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(organizationRow() as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
}

function subscriptionRow(amount: number) {
  return {
    id: 'sub_local_1',
    organizationId: 'org1',
    planId: 'plan-pro',
    providerSubscriptionId: 'sub_remote_1',
    status: 'CREATED',
    period: 'MONTHLY',
    amount,
    currency: 'INR',
    totalCount: 12,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    endedAt: null,
    createdAt: NOW,
  } as never;
}beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isEmailConfigured).mockReturnValue(true);
  vi.mocked(sendPromoCodeEmail).mockResolvedValue(undefined as never);
  vi.mocked(prisma.modelProvider.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.agentRun.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.agentRun.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.agentRun.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.organization.update).mockResolvedValue({} as never);
  vi.mocked(prisma.membership.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
});

describe('GET /api/models/usage', () => {
  it('returns custom and platform providers with run and token stats', async () => {
    vi.mocked(prisma.modelProvider.findMany).mockResolvedValue([providerFixture()] as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(organizationRow({ promoCodeSentAt: NOW }) as never);
    vi.mocked(prisma.agentRun.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.agentRun.groupBy)
      .mockResolvedValueOnce([
        { provider: 'mp1', status: 'COMPLETED', _count: { _all: 5 }, _sum: { tokenUsage: 500 }, _max: { createdAt: NOW } },
        { provider: 'mp1', status: 'FAILED', _count: { _all: 1 }, _sum: { tokenUsage: 50 }, _max: { createdAt: NOW } },
        { provider: 'OMNIROUTE', status: 'COMPLETED', _count: { _all: 2 }, _sum: { tokenUsage: 200 }, _max: { createdAt: NOW } },
      ] as never)
      .mockResolvedValueOnce([
        { provider: 'mp1', model: 'gpt-4o-mini', _count: { _all: 6 }, _sum: { tokenUsage: 550 }, _max: { createdAt: NOW } },
        { provider: 'OMNIROUTE', model: '', _count: { _all: 2 }, _sum: { tokenUsage: 200 }, _max: { createdAt: NOW } },
      ] as never);

    const response = await request(app).get('/api/models/usage').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    const custom = response.body.providers.find((p: { id: string }) => p.id === 'mp1');
    expect(custom).toMatchObject({ kind: 'custom', name: 'My OpenAI', runs: 6, completed: 5, failed: 1, tokens: 550 });
    const platform = response.body.providers.find((p: { id: string }) => p.id === 'OMNIROUTE');
    expect(platform).toMatchObject({ kind: 'platform', status: 'CURRENT', runs: 2, tokens: 200 });
    expect(response.body.providers.find((p: { id: string }) => p.id === 'OLLAMA')).toBeUndefined();
    expect(response.body.models[0]).toMatchObject({ model: 'gpt-4o-mini', providerName: 'My OpenAI', runs: 6, tokens: 550 });
    expect(response.body.models[1]).toMatchObject({ model: 'default', providerName: 'OMNIROUTE', runs: 2 });
    expect(response.body.series).toHaveLength(14);
    expect(response.body.totals).toMatchObject({ runs30d: 8, tokens30d: 750, models30d: 2, customProviders: 1 });
    expect(response.body.promo).toMatchObject({ eligible: true, code: PROMO_CODE, discountPercent: PROMO_DISCOUNT_PERCENT, emailSent: false });
    expect(sendPromoCodeEmail).not.toHaveBeenCalled();
  });

  it('zero-fills the 14-day series and buckets today runs', async () => {
    vi.mocked(prisma.agentRun.findMany).mockResolvedValue([{ createdAt: new Date(), tokenUsage: 42 }] as never);

    const response = await request(app).get('/api/models/usage').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.series).toHaveLength(14);
    expect(response.body.series[13]).toMatchObject({ runs: 1, tokens: 42 });
    expect(response.body.series.slice(0, 13).every((s: { runs: number }) => s.runs === 0)).toBe(true);
    expect(response.body.providers).toEqual([]);
    expect(response.body.models).toEqual([]);
    expect(response.body.promo).toMatchObject({ eligible: false, code: null });
  });

  it('emails the promo code once when the workspace qualifies', async () => {
    qualifiedOrg();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(organizationRow() as never);
    vi.mocked(prisma.membership.findMany).mockResolvedValue([{ user: { email: 'owner@test.local' } }] as never);

    const response = await request(app).get('/api/models/usage').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.promo).toMatchObject({ eligible: true, code: PROMO_CODE, emailSent: true });
    expect(sendPromoCodeEmail).toHaveBeenCalledTimes(1);
    expect(sendPromoCodeEmail).toHaveBeenCalledWith('owner@test.local', PROMO_CODE, expect.stringContaining('/settings'));
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org1' },
      data: { promoCodeSentAt: expect.any(Date) },
    });
  });

  it('never resends the code once it was delivered', async () => {
    qualifiedOrg();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(organizationRow({ promoCodeSentAt: NOW }) as never);

    const response = await request(app).get('/api/models/usage').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.promo).toMatchObject({ eligible: true, code: PROMO_CODE, emailSent: false });
    expect(sendPromoCodeEmail).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('still exposes the code in the dashboard when email delivery is off', async () => {
    qualifiedOrg();
    vi.mocked(isEmailConfigured).mockReturnValue(false);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(organizationRow() as never);

    const response = await request(app).get('/api/models/usage').set(auth(OWNER_TOKEN));

    expect(response.status).toBe(200);
    expect(response.body.promo).toMatchObject({ eligible: true, code: PROMO_CODE, emailSent: false });
    expect(sendPromoCodeEmail).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/models/usage');
    expect(response.status).toBe(401);
  });
});

describe('POST /api/billing/promo/validate', () => {
  it('rejects an unknown code', async () => {
    const response = await request(app)
      .post('/api/billing/promo/validate')
      .set(auth(OWNER_TOKEN))
      .send({ code: 'SOMETHING20' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/not valid/);
    expect(sendPromoCodeEmail).not.toHaveBeenCalled();
  });

  it('rejects the real code when the workspace has not qualified', async () => {
    const response = await request(app)
      .post('/api/billing/promo/validate')
      .set(auth(OWNER_TOKEN))
      .send({ code: PROMO_CODE });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Add your own model provider/);
  });

  it('accepts the code once a custom provider completed a run', async () => {
    qualifiedOrg();

    const response = await request(app)
      .post('/api/billing/promo/validate')
      .set(auth(OWNER_TOKEN))
      .send({ code: `  ${PROMO_CODE}  ` });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ valid: true, discountPercent: 20, code: PROMO_CODE });
  });

  it('is closed to viewers', async () => {
    qualifiedOrg();
    const response = await request(app)
      .post('/api/billing/promo/validate')
      .set(auth(VIEWER_TOKEN))
      .send({ code: PROMO_CODE });

    expect(response.status).toBe(403);
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .post('/api/billing/promo/validate')
      .set({ 'x-csrf-token': 'test-csrf-token', Cookie: 'ryuksaidso_csrf=test-csrf-token' })
      .send({ code: PROMO_CODE });

    expect(response.status).toBe(401);
  });
});

describe('POST /api/billing/checkout with promo', () => {
  it('charges 20% less and creates a discounted provider plan', async () => {
    seedCheckout();
    qualifiedOrg();
    vi.mocked(prisma.billingSubscription.create).mockResolvedValue(subscriptionRow(159920));

    const response = await request(app)
      .post('/api/billing/checkout')
      .set(auth(OWNER_TOKEN))
      .send({ planCode: 'pro', period: 'MONTHLY', phone: '9876543210', promoCode: PROMO_CODE });

    expect(response.status).toBe(201);
    expect(response.body.amount).toBe(159920);
    expect(billingProvider.ensurePlan).toHaveBeenCalledWith(expect.objectContaining({ amount: 159920 }));
    expect(billingProvider.createSubscription).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.billingSubscription.create).mock.calls[0][0]?.data).toMatchObject({ amount: 159920 });
    expect(prisma.billingPlan.update).not.toHaveBeenCalled();
  });

  it('charges the full price without a promo code and caches the plan', async () => {
    seedCheckout();

    const response = await request(app)
      .post('/api/billing/checkout')
      .set(auth(OWNER_TOKEN))
      .send({ planCode: 'pro', period: 'MONTHLY', phone: '9876543210' });

    expect(response.status).toBe(201);
    expect(response.body.amount).toBe(199900);
    expect(billingProvider.ensurePlan).not.toHaveBeenCalled();
    expect(prisma.billingPlan.update).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.billingSubscription.create).mock.calls[0][0]?.data).toMatchObject({ amount: 199900 });
  });

  it('refuses an invalid code before touching the payment provider', async () => {
    seedCheckout();

    const response = await request(app)
      .post('/api/billing/checkout')
      .set(auth(OWNER_TOKEN))
      .send({ planCode: 'pro', period: 'MONTHLY', phone: '9876543210', promoCode: 'FAKE20' });

    expect(response.status).toBe(400);
    expect(billingProvider.createSubscription).not.toHaveBeenCalled();
    expect(prisma.billingSubscription.create).not.toHaveBeenCalled();
  });

  it('is closed to viewers', async () => {
    seedCheckout();
    const response = await request(app)
      .post('/api/billing/checkout')
      .set(auth(VIEWER_TOKEN))
      .send({ planCode: 'pro', period: 'MONTHLY', phone: '9876543210' });

    expect(response.status).toBe(403);
  });
});
