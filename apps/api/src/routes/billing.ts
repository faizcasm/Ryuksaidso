import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { audit, type AuthUser } from '../lib/auth';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { billingEvents } from '../lib/metrics';
import { currentUsage, getBillingSetting, resolveBilling } from '../lib/entitlements';
import {
  billingConfigured,
  ensureBillingPlans,
  getBillingProvider,
  listPlans,
  mapPaymentStatus,
  settlePreviousSubscriptions,
  totalCountForPeriod,
} from '../services/billing';
import { processWebhookEvent } from '../services/billing/webhooks';
import { cancelSubscriptionSchema, checkoutSchema, verifyCheckoutSchema } from '../validation';

export const billingRouter = Router();

billingRouter.use((req, res, next) => {
  if (req.path === '/webhook' || req.path === '/plans') return next();
  return requireAuth(req, res, next);
});

type PlanRow = Awaited<ReturnType<typeof listPlans>>[number];

function auth(req: AuthenticatedRequest): AuthUser {
  const user = req.user;
  if (!user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return user;
}

function requireBillingAdmin(user: AuthUser) {
  if (!['OWNER', 'ADMIN'].includes(user.role)) {
    throw Object.assign(new Error('Billing changes require an owner or admin in this workspace'), { statusCode: 403 });
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

function checkoutReturnUrl(): string {
  if (config.BILLING_RETURN_URL) return config.BILLING_RETURN_URL;
  return `${config.FRONTEND_URL.replace(/\/$/, '')}/settings?billing=checkout`;
}

function publicPlan(plan: PlanRow) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    currency: plan.currency,
    apiAccess: plan.apiAccess,
    analyticsAccess: plan.analyticsAccess,
    limits: {
      maxAgents: plan.maxAgents,
      maxMembers: plan.maxMembers,
      maxTicketsPerMonth: plan.maxTicketsPerMonth,
      maxRunsPerMonth: plan.maxRunsPerMonth,
      maxApiKeys: plan.maxApiKeys,
    },
    features: plan.features,
    isDefault: plan.isDefault,
    sortOrder: plan.sortOrder,
  };
}

type SubscriptionRow = NonNullable<Awaited<ReturnType<typeof findLatestSubscription>>>;

async function findLatestSubscription(organizationId: string) {
  return prisma.billingSubscription.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
}

function publicSubscription(sub: SubscriptionRow) {
  return {
    id: sub.id,
    planId: sub.planId,
    status: sub.status,
    period: sub.period,
    amount: sub.amount,
    currency: sub.currency,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    canceledAt: sub.canceledAt,
    endedAt: sub.endedAt,
    providerSubscriptionId: sub.providerSubscriptionId,
    createdAt: sub.createdAt,
  };
}

type PaymentRow = Awaited<ReturnType<typeof prisma.billingPayment.findFirst>>;

function publicPayment(payment: PaymentRow) {
  if (!payment) return null;
  return {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    failureReason: payment.failureReason,
    invoiceNumber: payment.invoiceNumber,
    capturedAt: payment.capturedAt,
    createdAt: payment.createdAt,
    subscriptionId: payment.providerSubscriptionId,
  };
}

function checkoutPayload(
  environment: 'sandbox' | 'production',
  sub: { providerSubscriptionId: string; sessionId?: string; period: string; amount: number; currency: string },
  plan: PlanRow,
) {
  return {
    mode: 'checkout' as const,
    provider: 'cashfree',
    environment,
    subscriptionId: sub.providerSubscriptionId,
    subsSessionId: sub.sessionId ?? '',
    planCode: plan.code,
    planName: plan.name,
    period: sub.period,
    amount: sub.amount,
    currency: sub.currency,
    returnUrl: checkoutReturnUrl(),
  };
}

async function ensureCustomerRecord(user: AuthUser, phone: string) {
  const organization = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
  const data = {
    name: organization?.name ?? 'Workspace',
    email: user.email,
    contact: phone,
  };
  const existing = await prisma.billingCustomer.findFirst({ where: { organizationId: user.organizationId } });
  if (existing) {
    return { record: await prisma.billingCustomer.update({ where: { id: existing.id }, data }), organizationName: data.name };
  }
  return {
    record: await prisma.billingCustomer.create({
      data: {
        organizationId: user.organizationId,
        providerCustomerId: `ws_${user.organizationId}`,
        ...data,
      },
    }),
    organizationName: data.name,
  };
}

async function startCheckout(user: AuthUser, planCode: string, period: 'MONTHLY' | 'YEARLY', phone?: string) {
  const setting = await getBillingSetting();
  if (!setting.billingEnabled) {
    throw Object.assign(new Error('Billing is disabled on this deployment — every plan is unlocked without payment'), {
      statusCode: 409,
    });
  }
  const provider = getBillingProvider();
  if (!billingConfigured()) {
    throw Object.assign(new Error('Billing provider is not configured. Add Cashfree credentials to accept payments.'), {
      statusCode: 503,
    });
  }

  await ensureBillingPlans();
  const plan = await prisma.billingPlan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.active) {
    throw Object.assign(new Error('Plan not found'), { statusCode: 404 });
  }

  const latest = await findLatestSubscription(user.organizationId);

  if (plan.code === 'free') {
    if (latest && ['CREATED', 'ACTIVE', 'PENDING', 'PAUSED'].includes(latest.status)) {
      await provider.cancelSubscription(latest.providerSubscriptionId, false).catch((error) => {
        logger.error('Failed to cancel subscription while downgrading to free', {
          subscriptionId: latest.providerSubscriptionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      await prisma.billingSubscription.update({
        where: { id: latest.id },
        data: { status: 'CANCELLED', canceledAt: new Date(), endedAt: new Date(), cancelAtPeriodEnd: false },
      });
      await audit(user, 'billing.downgraded', 'subscription', latest.id, { planCode: plan.code });
      billingEvents.inc({ event: 'downgraded_to_free' });
    }
    return { mode: 'downgraded' as const, planCode: plan.code };
  }

  const amount = period === 'MONTHLY' ? plan.priceMonthly : plan.priceYearly;
  if (amount <= 0) {
    throw Object.assign(new Error('This plan has no price configured for the selected billing period'), { statusCode: 400 });
  }

  if (latest && ['ACTIVE', 'PENDING'].includes(latest.status) && latest.planId === plan.id && latest.period === period) {
    throw Object.assign(new Error('This workspace is already subscribed to that plan'), { statusCode: 409 });
  }

  const environment = provider.checkoutEnvironment();

  if (
    latest &&
    latest.status === 'CREATED' &&
    latest.planId === plan.id &&
    latest.period === period &&
    Date.now() - latest.createdAt.getTime() < 15 * 60_000
  ) {
    try {
      const remote = await provider.getSubscription(latest.providerSubscriptionId);
      if (remote.sessionId) {
        return checkoutPayload(environment, { ...latest, sessionId: remote.sessionId }, plan);
      }
    } catch (error) {
      logger.warn('Could not reuse the recent checkout session, creating a new one', {
        subscriptionId: latest.providerSubscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!phone) {
    throw Object.assign(new Error('A mobile number is required to set up the payment mandate'), {
      statusCode: 400,
      error: 'PhoneRequired',
    });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number'), { statusCode: 400 });
  }
  const customerRecord = await ensureCustomerRecord(user, normalizedPhone);

  const remotePlanField = period === 'MONTHLY' ? 'providerPlanMonthly' : 'providerPlanYearly';
  let remotePlanId = plan[remotePlanField];
  if (!remotePlanId) {
    remotePlanId = await provider.ensurePlan({
      planCode: plan.code,
      period,
      amount,
      currency: plan.currency,
      name: `${plan.name} (${period === 'MONTHLY' ? 'Monthly' : 'Yearly'})`,
      description: plan.description,
      totalCount: totalCountForPeriod(period),
    });
    await prisma.billingPlan.update({ where: { id: plan.id }, data: { [remotePlanField]: remotePlanId } });
  }

  const remote = await provider.createSubscription({
    subscriptionId: `sub_${randomUUID()}`,
    planId: remotePlanId,
    organizationId: user.organizationId,
    planCode: plan.code,
    period,
    totalCount: totalCountForPeriod(period),
    customer: {
      name: customerRecord.organizationName,
      email: user.email,
      phone: normalizedPhone,
    },
    returnUrl: checkoutReturnUrl(),
  });

  const local = await prisma.billingSubscription.create({
    data: {
      organizationId: user.organizationId,
      planId: plan.id,
      providerSubscriptionId: remote.id,
      status: remote.status,
      period,
      amount,
      currency: plan.currency,
      totalCount: totalCountForPeriod(period),
      ...(remote.currentPeriodStart ? { currentPeriodStart: remote.currentPeriodStart } : {}),
      ...(remote.currentPeriodEnd ? { currentPeriodEnd: remote.currentPeriodEnd } : {}),
    },
  });

  await audit(user, 'billing.checkout_created', 'subscription', local.id, { planCode: plan.code, period, amount });
  billingEvents.inc({ event: 'checkout_created' });
  return checkoutPayload(environment, { ...local, sessionId: remote.sessionId }, plan);
}

async function applyRemoteSubscription(
  user: AuthUser,
  local: SubscriptionRow,
  remote: Awaited<ReturnType<ReturnType<typeof getBillingProvider>['getSubscription']>>,
) {
  const transitioned = remote.status === 'ACTIVE' && local.status !== 'ACTIVE';
  const ended = ['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(remote.status);
  const updated = await prisma.billingSubscription.update({
    where: { id: local.id },
    data: {
      status: remote.status,
      currentPeriodStart: remote.currentPeriodStart ?? local.currentPeriodStart,
      currentPeriodEnd: remote.currentPeriodEnd ?? local.currentPeriodEnd,
      totalCount: remote.totalCount || local.totalCount,
      ...(ended
        ? { endedAt: new Date(), canceledAt: local.canceledAt ?? new Date(), cancelAtPeriodEnd: false }
        : {}),
    },
  });
  if (transitioned) {
    await audit(user, 'billing.subscription_activated', 'subscription', local.id, { planId: local.planId });
    billingEvents.inc({ event: 'subscription_activated' });
    if (billingConfigured()) {
      await settlePreviousSubscriptions(getBillingProvider(), local.organizationId, local.id);
    }
  }
  return updated;
}

billingRouter.get('/plans', async (_req, res) => {
  const [setting, plans] = await Promise.all([getBillingSetting(), listPlans()]);
  res.json({
    billingEnabled: setting.billingEnabled,
    provider: config.BILLING_PROVIDER,
    configured: billingConfigured(),
    environment: billingConfigured() ? getBillingProvider().checkoutEnvironment() : '',
    currency: config.BILLING_CURRENCY,
    plans: plans.map(publicPlan),
  });
});

billingRouter.get('/subscription', async (req, res) => {
  const user = auth(req as AuthenticatedRequest);
  const [setting, resolved, usage, latest, customer] = await Promise.all([
    getBillingSetting(),
    resolveBilling(user.organizationId),
    currentUsage(user.organizationId),
    findLatestSubscription(user.organizationId),
    prisma.billingCustomer.findFirst({ where: { organizationId: user.organizationId } }),
  ]);
  const plan = resolved.planId ? await prisma.billingPlan.findUnique({ where: { id: resolved.planId } }) : null;
  res.json({
    billingEnabled: setting.billingEnabled,
    enforced: resolved.enforced,
    provider: config.BILLING_PROVIDER,
    configured: billingConfigured(),
    environment: billingConfigured() ? getBillingProvider().checkoutEnvironment() : '',
    plan: plan ? publicPlan(plan) : null,
    planCode: resolved.planCode,
    subscription: latest ? publicSubscription(latest) : null,
    contact: customer ? { name: customer.name, email: customer.email, phone: customer.contact } : null,
    entitlements: resolved.limits,
    usage,
  });
});

billingRouter.get('/payments', async (req, res) => {
  const user = auth(req as AuthenticatedRequest);
  const payments = await prisma.billingPayment.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  res.json(payments.map(publicPayment).filter(Boolean));
});

billingRouter.post('/checkout', async (req, res) => {
  const user = auth(req as AuthenticatedRequest);
  requireBillingAdmin(user);
  const body = checkoutSchema.parse(req.body);
  res.status(201).json(await startCheckout(user, body.planCode, body.period, body.phone));
});

billingRouter.post('/subscription/change', async (req, res) => {
  const user = auth(req as AuthenticatedRequest);
  requireBillingAdmin(user);
  const body = checkoutSchema.parse(req.body);
  res.status(201).json(await startCheckout(user, body.planCode, body.period, body.phone));
});

billingRouter.post('/checkout/verify', async (req, res) => {
  const user = auth(req as AuthenticatedRequest);
  const body = verifyCheckoutSchema.parse(req.body);
  const local = await prisma.billingSubscription.findUnique({ where: { providerSubscriptionId: body.subscriptionId } });
  if (!local || local.organizationId !== user.organizationId) {
    throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
  }
  const provider = getBillingProvider();
  const remote = await provider.getSubscription(body.subscriptionId);
  const updated = await applyRemoteSubscription(user, local, remote);

  let payments: unknown[] = [];
  try {
    const remotePayments = await provider.listSubscriptionPayments(body.subscriptionId);
    for (const payment of remotePayments) {
      const status = mapPaymentStatus(payment.status) ?? 'CREATED';
      const payload = {
        organizationId: local.organizationId,
        providerOrderId: payment.orderId,
        providerSubscriptionId: local.providerSubscriptionId,
        planId: local.planId,
        amount: payment.amount,
        currency: payment.currency,
        status,
        method: payment.method,
        failureReason: payment.failureReason,
        ...(payment.capturedAt ? { capturedAt: payment.capturedAt } : {}),
      };
      const row = await prisma.billingPayment.upsert({
        where: { providerPaymentId: payment.id },
        create: { providerPaymentId: payment.id, ...payload },
        update: payload,
      });
      payments.push(publicPayment(row));
    }
  } catch (error) {
    logger.warn('Could not list subscription payments during checkout verification', {
      subscriptionId: body.subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  res.json({
    verified: true,
    subscription: publicSubscription(updated),
    payments: payments.filter(Boolean),
  });
});

billingRouter.post('/subscription/cancel', async (req, res) => {
  const user = auth(req as AuthenticatedRequest);
  requireBillingAdmin(user);
  const body = cancelSubscriptionSchema.parse(req.body ?? {});
  const latest = await findLatestSubscription(user.organizationId);
  if (!latest) throw Object.assign(new Error('No active subscription to cancel'), { statusCode: 404 });
  if (['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(latest.status)) {
    throw Object.assign(new Error('That subscription is already cancelled'), { statusCode: 409 });
  }

  const provider = getBillingProvider();
  const atCycleEnd = body.mode === 'at_period_end' && latest.status === 'ACTIVE';
  const remote = await provider.cancelSubscription(latest.providerSubscriptionId, atCycleEnd);
  const paused = remote.status === 'PAUSED';
  const ended = ['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(remote.status);
  if (!paused && !ended) {
    throw Object.assign(new Error('The payment provider did not confirm the cancellation'), { statusCode: 502 });
  }

  const updated = await prisma.billingSubscription.update({
    where: { id: latest.id },
    data: {
      status: remote.status,
      cancelAtPeriodEnd: paused,
      ...(ended ? { canceledAt: new Date(), endedAt: new Date() } : {}),
      ...(remote.currentPeriodEnd ? { currentPeriodEnd: remote.currentPeriodEnd } : {}),
    },
  });
  await audit(user, 'billing.subscription_cancelled', 'subscription', latest.id, { mode: body.mode });
  billingEvents.inc({ event: paused ? 'subscription_pause_at_period_end' : 'subscription_cancelled' });
  res.json(publicSubscription(updated));
});

billingRouter.post('/webhook', async (req, res) => {
  const rawBody = (req as AuthenticatedRequest).rawBody;
  const signature = req.header('x-webhook-signature') ?? '';
  const timestamp = req.header('x-webhook-timestamp') ?? '';
  if (!rawBody) {
    res.status(400).json({ error: 'BadRequest', message: 'Raw request body is required for webhook verification' });
    return;
  }
  const provider = getBillingProvider();
  if (!provider.verifyWebhookSignature(rawBody, signature, timestamp)) {
    billingEvents.inc({ event: 'webhook_invalid_signature' });
    logger.warn('Billing webhook rejected: signature verification failed', { path: req.path });
    res.status(401).json({ error: 'Unauthorized', message: 'Signature verification failed' });
    return;
  }
  const body = req.body as { type?: unknown };
  const eventType = typeof body.type === 'string' ? body.type.slice(0, 120) : '';
  if (!eventType) {
    res.status(400).json({ error: 'BadRequest', message: 'Missing event type' });
    return;
  }
  const idempotencyHeader = req.header('x-idempotency-header') ?? '';
  const eventId = idempotencyHeader
    ? createHash('sha256').update(idempotencyHeader).digest('hex').slice(0, 120)
    : createHash('sha256').update(rawBody).digest('hex');

  const outcome = await processWebhookEvent({ eventId, eventType, payload: body });
  if (outcome === 'failed') {
    res.status(500).json({ error: 'WebhookProcessingFailed', message: 'Event processing failed and will be retried' });
    return;
  }
  res.json({ received: true, outcome });
});
