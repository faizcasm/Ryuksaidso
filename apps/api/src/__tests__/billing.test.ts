import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { prisma } from '../lib/db';
import {
  assertApiAccessAllowed,
  assertEntitled,
  assertQuota,
  isEntitledSubscription,
  resolveBilling,
  withinLimit,
  FULL_ACCESS_LIMITS,
} from '../lib/entitlements';
import {
  mapPaymentStatus,
  mapSubscriptionStatus,
  parseCashfreeDate,
  type BillingProvider,
  type ProviderSubscription,
} from '../services/billing/types';
import { cashfreePlanId, verifyCashfreeSignature } from '../services/billing/cashfree';
import { processWebhookEvent } from '../services/billing/webhooks';
import { settlePreviousSubscriptions } from '../services/billing/settle';

vi.mock('../lib/db', () => ({
  prisma: {
    billingSetting: { findUnique: vi.fn(), create: vi.fn() },
    billingPlan: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    billingSubscription: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    billingPayment: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    billingWebhookEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    billingUsage: { upsert: vi.fn() },
    agent: { count: vi.fn() },
    ticket: { count: vi.fn() },
    agentRun: { count: vi.fn() },
    membership: { count: vi.fn() },
    apiKey: { count: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

const FREE_LIMITS = {
  maxAgents: 2,
  maxMembers: 3,
  maxTicketsPerMonth: 50,
  maxRunsPerMonth: 100,
  maxApiKeys: 1,
  apiAccess: false,
  analyticsAccess: false,
};

const PRO_LIMITS = {
  maxAgents: 50,
  maxMembers: 25,
  maxTicketsPerMonth: 5000,
  maxRunsPerMonth: 20000,
  maxApiKeys: 25,
  apiAccess: true,
  analyticsAccess: true,
};

function freePlan() {
  return { id: 'plan-free', code: 'free', name: 'Free', ...FREE_LIMITS };
}

function proPlan() {
  return { id: 'plan-pro', code: 'pro', name: 'Pro', ...PRO_LIMITS };
}

type SubscriptionFixture = ProviderSubscription & {
  organizationId: string;
  providerSubscriptionId: string;
  period: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
};

function activeSubscription(overrides: Partial<SubscriptionFixture> = {}): SubscriptionFixture {
  return {
    id: 'sub-local-1',
    organizationId: 'org1',
    planId: 'plan-pro',
    providerSubscriptionId: 'sub_abc123',
    status: 'ACTIVE',
    period: 'MONTHLY',
    amount: 199900,
    currency: 'INR',
    cancelAtPeriodEnd: false,
    currentPeriodStart: new Date('2026-10-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
    canceledAt: null,
    endedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    totalCount: 120,
    sessionId: 'sub_session_abc',
    ...overrides,
  };
}

function fakeProvider(overrides: Partial<BillingProvider> = {}): BillingProvider {
  return {
    name: 'cashfree',
    isConfigured: () => true,
    checkoutEnvironment: () => 'sandbox',
    ensurePlan: vi.fn(async () => 'ryu_pro_m199900'),
    createSubscription: vi.fn(async () => activeSubscription()),
    getSubscription: vi.fn(async () => activeSubscription()),
    cancelSubscription: vi.fn(async () => activeSubscription({ status: 'PAUSED' })),
    listSubscriptionPayments: vi.fn(async () => []),
    verifyWebhookSignature: vi.fn(() => true),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(prisma.billingSetting.findUnique).mockReset();
  vi.mocked(prisma.billingSetting.create).mockReset();
  vi.mocked(prisma.billingPlan.findFirst).mockReset();
  vi.mocked(prisma.billingPlan.findUnique).mockReset();
  vi.mocked(prisma.billingSubscription.findFirst).mockReset();
  vi.mocked(prisma.billingSubscription.findMany).mockReset();
  vi.mocked(prisma.billingSubscription.findUnique).mockReset();
  vi.mocked(prisma.billingSubscription.update).mockReset();
  vi.mocked(prisma.billingPayment.findUnique).mockReset();
  vi.mocked(prisma.billingPayment.update).mockReset();
  vi.mocked(prisma.billingPayment.upsert).mockReset();
  vi.mocked(prisma.billingWebhookEvent.findUnique).mockReset();
  vi.mocked(prisma.billingWebhookEvent.create).mockReset();
  vi.mocked(prisma.billingWebhookEvent.update).mockReset();
  vi.mocked(prisma.billingUsage.upsert).mockReset();
});

describe('cashfree webhook signature', () => {
  const secret = 'test-webhook-secret';

  function sign(raw: string, timestamp: string, key = secret) {
    return createHmac('sha256', key).update(`${timestamp}${raw}`).digest('base64');
  }

  it('accepts a payload signed with the shared secret', () => {
    const raw = JSON.stringify({ type: 'SUBSCRIPTION_STATUS_CHANGED', data: {} });
    const timestamp = '1759400000';
    expect(verifyCashfreeSignature(raw, sign(raw, timestamp), timestamp, secret)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const raw = JSON.stringify({ type: 'SUBSCRIPTION_STATUS_CHANGED', data: { subscription_status: 'ACTIVE' } });
    const timestamp = '1759400000';
    const signature = sign(raw, timestamp);
    const tampered = JSON.stringify({ type: 'SUBSCRIPTION_STATUS_CHANGED', data: { subscription_status: 'CANCELLED' } });
    expect(verifyCashfreeSignature(tampered, signature, timestamp, secret)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const raw = '{"type":"x"}';
    const timestamp = '1759400000';
    expect(verifyCashfreeSignature(raw, sign(raw, timestamp, 'other'), timestamp, secret)).toBe(false);
  });

  it('rejects when secret, signature or timestamp is missing', () => {
    expect(verifyCashfreeSignature('{}', '', '', secret)).toBe(false);
    expect(verifyCashfreeSignature('{}', 'sig', '', secret)).toBe(false);
    expect(verifyCashfreeSignature('{}', 'sig', '123', '')).toBe(false);
  });

  it('accepts a Buffer body the same as a string body', () => {
    const raw = '{"type":"SUBSCRIPTION_PAYMENT_SUCCESS"}';
    const timestamp = '1759400000';
    expect(verifyCashfreeSignature(Buffer.from(raw), sign(raw, timestamp), timestamp, secret)).toBe(true);
  });
});

describe('cashfreePlanId', () => {
  it('is deterministic per plan, cadence and amount', () => {
    expect(cashfreePlanId('pro', 'MONTHLY', 199900)).toBe('ryu_pro_m199900');
    expect(cashfreePlanId('pro', 'YEARLY', 1999000)).toBe('ryu_pro_y1999000');
  });

  it('changes when the price changes so stale provider plans are never reused', () => {
    expect(cashfreePlanId('starter', 'MONTHLY', 49900)).not.toBe(cashfreePlanId('starter', 'MONTHLY', 59900));
  });

  it('stays within the 40 character provider limit', () => {
    expect(cashfreePlanId('enterprise-unlimited-annual', 'YEARLY', 1000000000).length).toBeLessThanOrEqual(40);
  });
});

describe('status mapping', () => {
  it('maps cashfree subscription statuses onto the billing enum', () => {
    expect(mapSubscriptionStatus('initialized')).toBe('CREATED');
    expect(mapSubscriptionStatus('BANK_APPROVAL_PENDING')).toBe('PENDING');
    expect(mapSubscriptionStatus('active')).toBe('ACTIVE');
    expect(mapSubscriptionStatus('on_hold')).toBe('HALTED');
    expect(mapSubscriptionStatus('paused')).toBe('PAUSED');
    expect(mapSubscriptionStatus('customer_paused')).toBe('PAUSED');
    expect(mapSubscriptionStatus('completed')).toBe('COMPLETED');
    expect(mapSubscriptionStatus('cancelled')).toBe('CANCELLED');
    expect(mapSubscriptionStatus('link_expired')).toBe('EXPIRED');
    expect(mapSubscriptionStatus('something_new')).toBeNull();
    expect(mapSubscriptionStatus(undefined)).toBeNull();
  });

  it('maps cashfree payment statuses onto the billing enum', () => {
    expect(mapPaymentStatus('initialized')).toBe('CREATED');
    expect(mapPaymentStatus('processing')).toBe('CREATED');
    expect(mapPaymentStatus('authorized')).toBe('AUTHORIZED');
    expect(mapPaymentStatus('success')).toBe('CAPTURED');
    expect(mapPaymentStatus('failed')).toBe('FAILED');
    expect(mapPaymentStatus('refunded')).toBe('REFUNDED');
    expect(mapPaymentStatus('partially_refunded')).toBe('REFUNDED');
    expect(mapPaymentStatus('mystery')).toBeNull();
  });

  it('interprets naive timestamps as IST and keeps zoned timestamps intact', () => {
    const naive = parseCashfreeDate('2026-10-02 09:30:00');
    expect(naive?.toISOString()).toBe('2026-10-02T04:00:00.000Z');
    const zoned = parseCashfreeDate('2026-10-02T09:30:00+05:30');
    expect(zoned?.toISOString()).toBe('2026-10-02T04:00:00.000Z');
    expect(parseCashfreeDate('not-a-date')).toBeNull();
    expect(parseCashfreeDate('')).toBeNull();
    expect(parseCashfreeDate(42)).toBeNull();
  });
});

describe('entitlement rules', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it('treats ACTIVE and PENDING subscriptions as entitled', () => {
    expect(isEntitledSubscription({ status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: future })).toBe(true);
    expect(isEntitledSubscription({ status: 'PENDING', cancelAtPeriodEnd: false, currentPeriodEnd: null })).toBe(true);
  });

  it('grants grace until period end when a subscription is paused to end', () => {
    expect(isEntitledSubscription({ status: 'PAUSED', cancelAtPeriodEnd: true, currentPeriodEnd: future })).toBe(true);
    expect(isEntitledSubscription({ status: 'PAUSED', cancelAtPeriodEnd: true, currentPeriodEnd: past })).toBe(false);
    expect(isEntitledSubscription({ status: 'PAUSED', cancelAtPeriodEnd: false, currentPeriodEnd: future })).toBe(false);
  });

  it('denies terminal statuses and missing subscriptions', () => {
    expect(isEntitledSubscription({ status: 'CANCELLED', cancelAtPeriodEnd: false, currentPeriodEnd: future })).toBe(false);
    expect(isEntitledSubscription({ status: 'EXPIRED', cancelAtPeriodEnd: false, currentPeriodEnd: null })).toBe(false);
    expect(isEntitledSubscription(null)).toBe(false);
  });

  it('treats a zero limit as unlimited', () => {
    expect(withinLimit(9999, 0)).toBe(true);
    expect(withinLimit(4, 10)).toBe(true);
    expect(withinLimit(10, 10)).toBe(false);
    expect(withinLimit(0, 10)).toBe(true);
  });
});

describe('resolveBilling', () => {
  it('bypasses limits when the global toggle is off', async () => {
    vi.mocked(prisma.billingSetting.findUnique).mockResolvedValue({
      id: 'global',
      billingEnabled: false,
      updatedBy: '',
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.billingSubscription.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.billingPlan.findFirst).mockResolvedValue(freePlan() as never);

    const resolved = await resolveBilling('org1');
    expect(resolved.enforced).toBe(false);
    expect(resolved.billingEnabled).toBe(false);
    expect(resolved.limits).toEqual(FULL_ACCESS_LIMITS);
  });

  it('applies the subscribed plan limits when enforcement is on', async () => {
    vi.mocked(prisma.billingSetting.findUnique).mockResolvedValue({
      id: 'global',
      billingEnabled: true,
      updatedBy: 'admin1',
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.billingSubscription.findFirst).mockResolvedValue(activeSubscription() as never);
    vi.mocked(prisma.billingPlan.findUnique).mockResolvedValue(proPlan() as never);

    const resolved = await resolveBilling('org1');
    expect(resolved.enforced).toBe(true);
    expect(resolved.planCode).toBe('pro');
    expect(resolved.limits.maxAgents).toBe(50);
    expect(resolved.subscription?.status).toBe('ACTIVE');
  });

  it('falls back to the free plan when no subscription is entitled', async () => {
    vi.mocked(prisma.billingSetting.findUnique).mockResolvedValue({
      id: 'global',
      billingEnabled: true,
      updatedBy: 'admin1',
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.billingSubscription.findFirst).mockResolvedValue(activeSubscription({ status: 'CANCELLED' }) as never);
    vi.mocked(prisma.billingPlan.findFirst).mockResolvedValue(freePlan() as never);

    const resolved = await resolveBilling('org1');
    expect(resolved.enforced).toBe(true);
    expect(resolved.planCode).toBe('free');
    expect(resolved.limits.maxAgents).toBe(2);
  });

  it('fails open to bypass when the billing tables cannot be read', async () => {
    vi.mocked(prisma.billingSetting.findUnique).mockResolvedValue({
      id: 'global',
      billingEnabled: true,
      updatedBy: 'admin1',
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.billingSubscription.findFirst).mockRejectedValue(new Error('connection reset') as never);

    const resolved = await resolveBilling('org1');
    expect(resolved.enforced).toBe(false);
    expect(resolved.limits).toEqual(FULL_ACCESS_LIMITS);
  });
});

describe('enforcement assertions', () => {
  function enforcedResolvers(plan: ReturnType<typeof proPlan>) {
    vi.mocked(prisma.billingSetting.findUnique).mockResolvedValue({
      id: 'global',
      billingEnabled: true,
      updatedBy: 'admin1',
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.billingSubscription.findFirst).mockResolvedValue(activeSubscription({ planId: plan.id }) as never);
    vi.mocked(prisma.billingPlan.findUnique).mockResolvedValue(plan as never);
    vi.mocked(prisma.billingPlan.findFirst).mockResolvedValue(plan as never);
  }

  it('throws 402 when a quota is exhausted', async () => {
    enforcedResolvers(freePlan());
    await expect(assertQuota('org1', 'agents', 2)).rejects.toMatchObject({
      statusCode: 402,
      error: 'PaymentRequired',
    });
  });

  it('allows creations inside the plan quota', async () => {
    enforcedResolvers(freePlan());
    const resolved = await assertQuota('org1', 'agents', 1);
    expect(resolved.planCode).toBe('free');
  });

  it('allows anything while enforcement is bypassed', async () => {
    vi.mocked(prisma.billingSetting.findUnique).mockResolvedValue({
      id: 'global',
      billingEnabled: false,
      updatedBy: '',
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.billingSubscription.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.billingPlan.findFirst).mockResolvedValue(freePlan() as never);

    const resolved = await assertQuota('org1', 'agents', 5000);
    expect(resolved.enforced).toBe(false);
    await expect(assertApiAccessAllowed('org1')).resolves.toBeUndefined();
  });

  it('gates API access behind the plan feature flag', async () => {
    enforcedResolvers(freePlan());
    await expect(assertApiAccessAllowed('org1')).rejects.toMatchObject({ statusCode: 402 });
    enforcedResolvers(proPlan());
    await expect(assertApiAccessAllowed('org1')).resolves.toBeUndefined();
  });

  it('gates analytics behind the plan feature flag', () => {
    const locked = {
      billingEnabled: true,
      enforced: true,
      planId: 'plan-free',
      planCode: 'free',
      planName: 'Free',
      limits: { ...FULL_ACCESS_LIMITS, analyticsAccess: false },
      subscription: null,
    };
    expect(() => assertEntitled(locked, 'analytics')).toThrowError();
    try {
      assertEntitled(locked, 'analytics');
    } catch (error) {
      expect((error as { statusCode: number }).statusCode).toBe(402);
    }
    const open = { ...locked, enforced: false };
    expect(() => assertEntitled(open, 'analytics')).not.toThrow();
  });
});

describe('processWebhookEvent', () => {
  const eventType = 'SUBSCRIPTION_STATUS_CHANGED';

  it('ignores duplicate deliveries of already processed events', async () => {
    vi.mocked(prisma.billingWebhookEvent.findUnique).mockResolvedValue({
      eventId: 'evt-1',
      status: 'PROCESSED',
    } as never);

    const outcome = await processWebhookEvent({ eventId: 'evt-1', eventType, payload: { data: {} } });
    expect(outcome).toBe('duplicate');
    expect(prisma.billingWebhookEvent.create).not.toHaveBeenCalled();
    expect(prisma.billingSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('reprocesses events that previously failed', async () => {
    vi.mocked(prisma.billingWebhookEvent.findUnique)
      .mockResolvedValueOnce({ eventId: 'evt-2', status: 'FAILED' } as never)
      .mockResolvedValue({ eventId: 'evt-2', status: 'RECEIVED' } as never);
    vi.mocked(prisma.billingWebhookEvent.update).mockResolvedValue({} as never);
    vi.mocked(prisma.billingSubscription.findUnique).mockResolvedValue(null as never);

    const outcome = await processWebhookEvent({ eventId: 'evt-2', eventType, payload: { data: { subscription_details: { subscription_id: 'unknown' } } } });
    expect(outcome).toBe('ignored');
    expect(prisma.billingSubscription.findUnique).toHaveBeenCalled();
    expect(prisma.billingWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'evt-2' }, data: expect.objectContaining({ status: 'IGNORED' }) }),
    );
  });

  it('activates the local subscription on a status change webhook', async () => {
    const local = activeSubscription({ status: 'PENDING' });
    vi.mocked(prisma.billingWebhookEvent.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.billingWebhookEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.billingWebhookEvent.update).mockResolvedValue({} as never);
    vi.mocked(prisma.billingSubscription.findUnique)
      .mockResolvedValueOnce(local as never)
      .mockResolvedValueOnce(local as never);
    vi.mocked(prisma.billingSubscription.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.billingSubscription.update).mockResolvedValue(local as never);

    const outcome = await processWebhookEvent({
      eventId: 'evt-3',
      eventType,
      payload: {
        data: {
          subscription_details: {
            subscription_id: 'sub_abc123',
            subscription_status: 'ACTIVE',
            next_schedule_date: '2026-11-02 00:00:00',
            subscription_first_charge_time: '2026-10-02 00:00:00',
          },
        },
      },
    });

    expect(outcome).toBe('processed');
    expect(prisma.billingSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-local-1' },
        data: expect.objectContaining({ status: 'ACTIVE', cancelAtPeriodEnd: false }),
      }),
    );
  });

  it('records payment webhooks in paise with the captured status', async () => {
    vi.mocked(prisma.billingWebhookEvent.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.billingWebhookEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.billingWebhookEvent.update).mockResolvedValue({} as never);
    vi.mocked(prisma.billingSubscription.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.billingPayment.upsert).mockResolvedValue({} as never);

    const outcome = await processWebhookEvent({
      eventId: 'evt-4',
      eventType: 'SUBSCRIPTION_PAYMENT_SUCCESS',
      payload: {
        data: {
          cf_payment_id: 'pay-901',
          subscription_id: 'sub_abc123',
          payment_status: 'success',
          payment_amount: 1999,
          payment_currency: 'INR',
          payment_initiated_date: '2026-10-02 10:15:00',
          authorization_details: { payment_method: { upi: {} } },
        },
      },
    });

    expect(outcome).toBe('processed');
    expect(prisma.billingPayment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerPaymentId: 'pay-901' },
        create: expect.objectContaining({ amount: 199900, status: 'CAPTURED', method: 'upi' }),
      }),
    );
  });

  it('marks failed payments with their reason', async () => {
    vi.mocked(prisma.billingWebhookEvent.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.billingWebhookEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.billingWebhookEvent.update).mockResolvedValue({} as never);
    vi.mocked(prisma.billingPayment.upsert).mockResolvedValue({} as never);

    await processWebhookEvent({
      eventId: 'evt-5',
      eventType: 'SUBSCRIPTION_PAYMENT_FAILED',
      payload: {
        data: {
          cf_payment_id: 'pay-902',
          payment_status: 'failed',
          payment_amount: 1999,
          failure_details: { failure_reason: 'Insufficient funds' },
        },
      },
    });

    expect(prisma.billingPayment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'FAILED', failureReason: 'Insufficient funds' }),
      }),
    );
  });

  it('marks refunds on recorded payments', async () => {
    vi.mocked(prisma.billingWebhookEvent.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.billingWebhookEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.billingWebhookEvent.update).mockResolvedValue({} as never);
    vi.mocked(prisma.billingPayment.findUnique).mockResolvedValue({ id: 'p1', invoiceNumber: '' } as never);
    vi.mocked(prisma.billingPayment.update).mockResolvedValue({} as never);

    const outcome = await processWebhookEvent({
      eventId: 'evt-6',
      eventType: 'SUBSCRIPTION_REFUND_STATUS',
      payload: {
        data: { cf_payment_id: 'pay-901', refund_status: 'SUCCESS', cf_refund_id: 'refund-1' },
      },
    });

    expect(outcome).toBe('processed');
    expect(prisma.billingPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerPaymentId: 'pay-901' },
        data: expect.objectContaining({ status: 'REFUNDED', invoiceNumber: 'refund-1' }),
      }),
    );
  });

  it('ignores event types it does not handle', async () => {
    vi.mocked(prisma.billingWebhookEvent.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.billingWebhookEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.billingWebhookEvent.update).mockResolvedValue({} as never);

    const outcome = await processWebhookEvent({
      eventId: 'evt-7',
      eventType: 'PG_TRANSACTIONS_FETCH',
      payload: { data: { anything: true } },
    });
    expect(outcome).toBe('ignored');
  });
});

describe('settlePreviousSubscriptions', () => {
  beforeEach(() => {
    vi.mocked(prisma.billingSubscription.update).mockResolvedValue({} as never);
    vi.mocked(prisma.billingSubscription.findMany).mockReset();
  });

  it('pauses the previous subscription at the cycle end after an upgrade', async () => {
    const previous = activeSubscription({ id: 'sub-old', providerSubscriptionId: 'sub_prev1' });
    vi.mocked(prisma.billingSubscription.findMany).mockResolvedValue([previous] as never);
    const cancelSubscription = vi.fn(async () => activeSubscription({ status: 'PAUSED' }));
    const provider = fakeProvider({ cancelSubscription });

    await settlePreviousSubscriptions(provider, 'org1', 'sub-new');

    expect(cancelSubscription).toHaveBeenCalledWith('sub_prev1', true);
    expect(prisma.billingSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-old' },
        data: { status: 'PAUSED', cancelAtPeriodEnd: true },
      }),
    );
  });

  it('records a terminal status when the provider ends the subscription instead', async () => {
    const previous = activeSubscription({ id: 'sub-old', providerSubscriptionId: 'sub_prev1' });
    vi.mocked(prisma.billingSubscription.findMany).mockResolvedValue([previous] as never);
    const provider = fakeProvider({ cancelSubscription: vi.fn(async () => activeSubscription({ status: 'CANCELLED' })) });

    await settlePreviousSubscriptions(provider, 'org1', 'sub-new');

    expect(prisma.billingSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-old' },
        data: expect.objectContaining({ status: 'CANCELLED', cancelAtPeriodEnd: false }),
      }),
    );
    const data = vi.mocked(prisma.billingSubscription.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.endedAt).toBeInstanceOf(Date);
    expect(data.canceledAt).toBeInstanceOf(Date);
  });

  it('keeps settling the remaining subscriptions when one provider call fails', async () => {
    const first = activeSubscription({ id: 'sub-1', providerSubscriptionId: 'sub_first' });
    const second = activeSubscription({ id: 'sub-2', providerSubscriptionId: 'sub_second' });
    vi.mocked(prisma.billingSubscription.findMany).mockResolvedValue([first, second] as never);
    const provider = fakeProvider({
      cancelSubscription: vi
        .fn()
        .mockRejectedValueOnce(new Error('gateway timeout'))
        .mockResolvedValueOnce(activeSubscription({ status: 'PAUSED' })),
    });

    await expect(settlePreviousSubscriptions(provider, 'org1', 'sub-new')).resolves.toBeUndefined();

    expect(prisma.billingSubscription.update).toHaveBeenCalledTimes(1);
    expect(prisma.billingSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub-2' } }),
    );
  });
});
