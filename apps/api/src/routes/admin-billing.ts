import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { audit, type AuthUser } from '../lib/auth';
import { config } from '../lib/config';
import { getBillingSetting } from '../lib/entitlements';
import { billingEvents, billingMetricSnapshot } from '../lib/metrics';
import { billingConfigured, ensureBillingPlans, getBillingProvider } from '../services/billing';
import {
  adminPlanCreateSchema,
  adminPlanUpdateSchema,
  adminSubscriptionActionSchema,
  adminSubscriptionStatusSchema,
  billingSettingsSchema,
} from '../validation';

export const adminBillingRouter = Router();
adminBillingRouter.use(requireAuth);

async function systemAdmin(req: AuthenticatedRequest): Promise<AuthUser> {
  const user = req.user;
  if (!user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const system = await prisma.user.findUnique({ where: { id: user.id }, select: { userRole: true } });
  if (system?.userRole !== 'ADMIN') {
    throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
  }
  return { ...user, userRole: 'ADMIN' };
}

const ENDED_STATUSES = ['CANCELLED', 'COMPLETED', 'EXPIRED'];

async function organizationNames(organizationIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(organizationIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const orgs = await prisma.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(orgs.map((org) => [org.id, org.name]));
}

function countBy<T extends string>(rows: Array<{ status: T; _count: number | { status?: number } }>) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = typeof row._count === 'number' ? row._count : Number(row._count ?? 0);
    counts[row.status] = value;
  }
  return counts;
}

adminBillingRouter.get('/overview', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const [setting, subscriptionCounts, paymentCounts, webhookCounts, planCount, activeSubscriptions, metrics] =
    await Promise.all([
      getBillingSetting(),
      prisma.billingSubscription.groupBy({ by: ['status'], _count: true }),
      prisma.billingPayment.groupBy({ by: ['status'], _count: true, _sum: { amount: true } }),
      prisma.billingWebhookEvent.groupBy({ by: ['status'], _count: true }),
      prisma.billingPlan.count(),
      prisma.billingSubscription.findMany({ where: { status: 'ACTIVE' }, select: { period: true, amount: true } }),
      billingMetricSnapshot(),
    ]);

  const mrr = activeSubscriptions.reduce(
    (sum, subscription) => sum + (subscription.period === 'MONTHLY' ? subscription.amount : Math.round(subscription.amount / 12)),
    0,
  );
  const payments = paymentCounts.map((row) => ({
    status: row.status,
    count: row._count,
    totalAmount: row._sum.amount ?? 0,
  }));

  await audit(u, 'admin.billing_overview_viewed', 'billing', 'overview');
  res.json({
    billingEnabled: setting.billingEnabled,
    settingsUpdatedBy: setting.updatedBy,
    settingsUpdatedAt: setting.updatedAt,
    provider: config.BILLING_PROVIDER,
    configured: billingConfigured(),
    environment: billingConfigured() ? getBillingProvider().checkoutEnvironment() : '',
    currency: config.BILLING_CURRENCY,
    planCount,
    mrr,
    subscriptionCounts: countBy(subscriptionCounts),
    payments,
    webhookCounts: countBy(webhookCounts),
    metrics,
  });
});

adminBillingRouter.get('/plans', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  await ensureBillingPlans();
  const plans = await prisma.billingPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  await audit(u, 'admin.billing_plans_viewed', 'billing', 'plans');
  res.json(plans);
});

adminBillingRouter.post('/plans', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const body = adminPlanCreateSchema.parse(req.body);
  const plan = await prisma.billingPlan.create({
    data: { ...body, currency: config.BILLING_CURRENCY },
  });
  await audit(u, 'admin.billing_plan_created', 'billing_plan', plan.id, { code: plan.code });
  billingEvents.inc({ event: 'plan_created' });
  res.status(201).json(plan);
});

adminBillingRouter.patch('/plans/:planId', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const planId = String(req.params.planId);
  const body = adminPlanUpdateSchema.parse(req.body);
  const plan = await prisma.billingPlan.findUnique({ where: { id: planId } });
  if (!plan) throw Object.assign(new Error('Plan not found'), { statusCode: 404 });

  const data: Record<string, unknown> = { ...body };
  if (body.priceMonthly !== undefined && body.priceMonthly !== plan.priceMonthly) {
    data.providerPlanMonthly = '';
  }
  if (body.priceYearly !== undefined && body.priceYearly !== plan.priceYearly) {
    data.providerPlanYearly = '';
  }
  if (body.isDefault === true) {
    await prisma.billingPlan.updateMany({
      where: { id: { not: plan.id }, isDefault: true },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.billingPlan.update({ where: { id: plan.id }, data });
  await audit(u, 'admin.billing_plan_updated', 'billing_plan', plan.id, { code: plan.code, changes: Object.keys(body) });
  billingEvents.inc({ event: 'plan_updated' });
  res.json(updated);
});

adminBillingRouter.delete('/plans/:planId', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const planId = String(req.params.planId);
  const plan = await prisma.billingPlan.findUnique({ where: { id: planId } });
  if (!plan) throw Object.assign(new Error('Plan not found'), { statusCode: 404 });
  if (plan.isDefault) {
    throw Object.assign(new Error('The default plan cannot be deleted — make another plan the default first'), {
      statusCode: 409,
    });
  }
  const subscriptions = await prisma.billingSubscription.count({ where: { planId: plan.id } });
  if (subscriptions > 0) {
    throw Object.assign(new Error('This plan still has subscriptions — deactivate it instead'), { statusCode: 409 });
  }
  await prisma.billingPlan.delete({ where: { id: plan.id } });
  await audit(u, 'admin.billing_plan_deleted', 'billing_plan', plan.id, { code: plan.code });
  billingEvents.inc({ event: 'plan_deleted' });
  res.json({ deleted: true, id: plan.id });
});

adminBillingRouter.get('/subscriptions', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const subscriptions = await prisma.billingSubscription.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const [orgNames, plans] = await Promise.all([
    organizationNames(subscriptions.map((subscription) => subscription.organizationId)),
    prisma.billingPlan.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  const rows = subscriptions.map((subscription) => {
    const plan = planMap.get(subscription.planId);
    return {
      ...subscription,
      organizationName: orgNames.get(subscription.organizationId) ?? subscription.organizationId,
      planCode: plan?.code ?? '',
      planName: plan?.name ?? '',
    };
  });
  await audit(u, 'admin.billing_subscriptions_viewed', 'billing', 'subscriptions', { status: status ?? 'all' });
  res.json(rows);
});

adminBillingRouter.post('/subscriptions/:subscriptionId/action', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const subscriptionId = String(req.params.subscriptionId);
  const body = adminSubscriptionActionSchema.parse(req.body);
  const subscription = await prisma.billingSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
  if (!billingConfigured()) {
    throw Object.assign(new Error('Billing provider is not configured'), { statusCode: 409 });
  }

  const provider = getBillingProvider();
  if (body.action === 'cancel') {
    const remote = await provider.cancelSubscription(subscription.providerSubscriptionId, false);
    const ended = ENDED_STATUSES.includes(remote.status);
    const updated = await prisma.billingSubscription.update({
      where: { id: subscription.id },
      data: {
        status: remote.status,
        cancelAtPeriodEnd: false,
        ...(ended ? { canceledAt: new Date(), endedAt: new Date() } : {}),
      },
    });
    await audit(u, 'admin.billing_subscription_cancelled', 'subscription', subscription.id, {
      providerSubscriptionId: subscription.providerSubscriptionId,
    });
    billingEvents.inc({ event: 'admin_subscription_cancelled' });
    res.json(updated);
    return;
  }

  const remote = await provider.getSubscription(subscription.providerSubscriptionId);
  const ended = ENDED_STATUSES.includes(remote.status);
  const updated = await prisma.billingSubscription.update({
    where: { id: subscription.id },
    data: {
      status: remote.status,
      currentPeriodStart: remote.currentPeriodStart ?? subscription.currentPeriodStart,
      currentPeriodEnd: remote.currentPeriodEnd ?? subscription.currentPeriodEnd,
      ...(ended
        ? { endedAt: new Date(), canceledAt: subscription.canceledAt ?? new Date(), cancelAtPeriodEnd: false }
        : {}),
    },
  });
  await audit(u, 'admin.billing_subscription_synced', 'subscription', subscription.id, { status: remote.status });
  billingEvents.inc({ event: 'admin_subscription_synced' });
  res.json(updated);
});

adminBillingRouter.patch('/subscriptions/:subscriptionId', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const subscriptionId = String(req.params.subscriptionId);
  const body = adminSubscriptionStatusSchema.parse(req.body);
  const subscription = await prisma.billingSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });

  const ended = ENDED_STATUSES.includes(body.status);
  const updated = await prisma.billingSubscription.update({
    where: { id: subscription.id },
    data: {
      status: body.status,
      ...(ended
        ? { endedAt: new Date(), canceledAt: subscription.canceledAt ?? new Date(), cancelAtPeriodEnd: false }
        : body.status === 'ACTIVE'
          ? { cancelAtPeriodEnd: false, endedAt: null, canceledAt: null }
          : {}),
    },
  });
  await audit(u, 'admin.billing_subscription_status_changed', 'subscription', subscription.id, {
    from: subscription.status,
    to: body.status,
  });
  billingEvents.inc({ event: 'admin_subscription_status_changed' });
  res.json(updated);
});

adminBillingRouter.get('/payments', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const payments = await prisma.billingPayment.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const orgNames = await organizationNames(payments.map((payment) => payment.organizationId));
  const rows = payments.map((payment) => ({
    ...payment,
    organizationName: orgNames.get(payment.organizationId) ?? payment.organizationId,
  }));
  await audit(u, 'admin.billing_payments_viewed', 'billing', 'payments', { status: status ?? 'all' });
  res.json(rows);
});

adminBillingRouter.get('/webhooks', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const events = await prisma.billingWebhookEvent.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 100,
    select: {
      eventId: true,
      eventType: true,
      status: true,
      error: true,
      receivedAt: true,
      processedAt: true,
    },
  });
  await audit(u, 'admin.billing_webhooks_viewed', 'billing', 'webhooks');
  res.json(events);
});

adminBillingRouter.get('/settings', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const setting = await getBillingSetting();
  await audit(u, 'admin.billing_settings_viewed', 'billing', 'settings');
  res.json({
    billingEnabled: setting.billingEnabled,
    updatedBy: setting.updatedBy,
    updatedAt: setting.updatedAt,
    provider: config.BILLING_PROVIDER,
    configured: billingConfigured(),
    environment: billingConfigured() ? getBillingProvider().checkoutEnvironment() : '',
  });
});

adminBillingRouter.put('/settings', async (req, res) => {
  const u = await systemAdmin(req as AuthenticatedRequest);
  const body = billingSettingsSchema.parse(req.body);
  const previous = await getBillingSetting();
  const setting = await prisma.billingSetting.upsert({
    where: { id: 'global' },
    update: { billingEnabled: body.billingEnabled, updatedBy: u.id },
    create: { id: 'global', billingEnabled: body.billingEnabled, updatedBy: u.id },
  });
  await audit(u, 'admin.billing_settings_updated', 'billing', 'settings', {
    billingEnabled: body.billingEnabled,
    previous: previous.billingEnabled,
  });
  billingEvents.inc({ event: body.billingEnabled ? 'settings_enforced' : 'settings_bypassed' });
  res.json({
    billingEnabled: setting.billingEnabled,
    updatedBy: setting.updatedBy,
    updatedAt: setting.updatedAt,
    provider: config.BILLING_PROVIDER,
    configured: billingConfigured(),
    environment: billingConfigured() ? getBillingProvider().checkoutEnvironment() : '',
  });
});
