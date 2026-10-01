import { prisma } from './db';
import { logger } from './logger';
import type { SubscriptionStatus } from '@prisma/client';
import { billingEntitlementDenials } from './metrics';
import { ensureBillingPlans } from '../services/billing/plans';

export const UNLIMITED = 0;

export type EntitlementFeature =
  | 'agents'
  | 'tickets'
  | 'runs'
  | 'members'
  | 'apiKeys'
  | 'api'
  | 'analytics';

export interface PlanLimits {
  maxAgents: number;
  maxMembers: number;
  maxTicketsPerMonth: number;
  maxRunsPerMonth: number;
  maxApiKeys: number;
  apiAccess: boolean;
  analyticsAccess: boolean;
}

export interface ResolvedBilling {
  billingEnabled: boolean;
  enforced: boolean;
  planId: string;
  planCode: string;
  planName: string;
  limits: PlanLimits;
  subscription: {
    id: string;
    status: string;
    period: string;
    amount: number;
    currency: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    providerSubscriptionId: string;
  } | null;
}

export const ENTITLED_SUBSCRIPTION_STATUSES = new Set(['ACTIVE', 'PENDING']);

export function isEntitledSubscription(
  subscription: { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: Date | null } | null,
): boolean {
  if (!subscription) return false;
  if (ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)) return true;
  if (subscription.status === 'PAUSED' && subscription.cancelAtPeriodEnd) {
    return !subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() > Date.now();
  }
  return false;
}

export const FALLBACK_FREE_LIMITS: PlanLimits = {
  maxAgents: 2,
  maxMembers: 3,
  maxTicketsPerMonth: 50,
  maxRunsPerMonth: 100,
  maxApiKeys: 1,
  apiAccess: false,
  analyticsAccess: false,
};

export function withinLimit(current: number, max: number): boolean {
  if (!Number.isFinite(max) || max <= UNLIMITED) return true;
  return current < max;
}

export function limitsOfPlan(plan: {
  maxAgents: number;
  maxMembers: number;
  maxTicketsPerMonth: number;
  maxRunsPerMonth: number;
  maxApiKeys: number;
  apiAccess: boolean;
  analyticsAccess: boolean;
}): PlanLimits {
  return {
    maxAgents: plan.maxAgents,
    maxMembers: plan.maxMembers,
    maxTicketsPerMonth: plan.maxTicketsPerMonth,
    maxRunsPerMonth: plan.maxRunsPerMonth,
    maxApiKeys: plan.maxApiKeys,
    apiAccess: plan.apiAccess,
    analyticsAccess: plan.analyticsAccess,
  };
}

export const FULL_ACCESS_LIMITS: PlanLimits = {
  maxAgents: UNLIMITED,
  maxMembers: UNLIMITED,
  maxTicketsPerMonth: UNLIMITED,
  maxRunsPerMonth: UNLIMITED,
  maxApiKeys: UNLIMITED,
  apiAccess: true,
  analyticsAccess: true,
};

export function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function getBillingSetting(): Promise<{ billingEnabled: boolean; updatedBy: string; updatedAt: Date }> {
  try {
    const found = await prisma.billingSetting.findUnique({ where: { id: 'global' } });
    if (found) return found;
    try {
      return await prisma.billingSetting.create({ data: { id: 'global' } });
    } catch {
      const again = await prisma.billingSetting.findUnique({ where: { id: 'global' } });
      if (again) return again;
      throw new Error('Billing setting unavailable');
    }
  } catch (error) {
    logger.warn('Billing setting lookup failed, assuming subscriptions are bypassed', { error: error instanceof Error ? error.message : String(error) });
    return { billingEnabled: false, updatedBy: '', updatedAt: new Date(0) };
  }
}

export async function isBillingEnforced(): Promise<boolean> {
  return (await getBillingSetting()).billingEnabled;
}

async function defaultPlan() {
  return (
    (await prisma.billingPlan.findFirst({ where: { isDefault: true, active: true }, orderBy: { sortOrder: 'asc' } })) ??
    (await prisma.billingPlan.findFirst({ where: { code: 'free' } })) ??
    null
  );
}

function subView(subscription: {
  id: string;
  status: string;
  period: string;
  amount: number;
  currency: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  providerSubscriptionId: string;
} | null) {
  return subscription
    ? {
        id: subscription.id,
        status: subscription.status,
        period: subscription.period,
        amount: subscription.amount,
        currency: subscription.currency,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd,
        providerSubscriptionId: subscription.providerSubscriptionId,
      }
    : null;
}

export async function resolveBilling(organizationId: string): Promise<ResolvedBilling> {
  try {
    return await resolveBillingStrict(organizationId);
  } catch (error) {
    logger.error('Billing resolution failed; bypassing plan limits for this request', {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      billingEnabled: false,
      enforced: false,
      planId: '',
      planCode: 'free',
      planName: 'Free',
      limits: FULL_ACCESS_LIMITS,
      subscription: null,
    };
  }
}

async function resolveBillingStrict(organizationId: string): Promise<ResolvedBilling> {
  const setting = await getBillingSetting();
  const [latestSubscription, entitledCandidate] = await Promise.all([
    prisma.billingSubscription.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
    prisma.billingSubscription.findFirst({
      where: {
        organizationId,
        OR: [
          { status: { in: [...ENTITLED_SUBSCRIPTION_STATUSES] as SubscriptionStatus[] } },
          { status: 'PAUSED', cancelAtPeriodEnd: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const entitledSubscription = isEntitledSubscription(entitledCandidate) ? entitledCandidate : null;

  if (!setting.billingEnabled) {
    const plan = await defaultPlan();
    return {
      billingEnabled: false,
      enforced: false,
      planId: plan?.id ?? '',
      planCode: plan?.code ?? 'free',
      planName: plan?.name ?? 'Free',
      limits: FULL_ACCESS_LIMITS,
      subscription: subView(latestSubscription),
    };
  }

  const plan = entitledSubscription
    ? await prisma.billingPlan.findUnique({ where: { id: entitledSubscription.planId } })
    : await defaultPlan();

  let resolvedPlan = plan;
  if (setting.billingEnabled && !resolvedPlan) {
    await ensureBillingPlans();
    resolvedPlan = await defaultPlan();
  }

  return {
    billingEnabled: true,
    enforced: true,
    planId: resolvedPlan?.id ?? '',
    planCode: resolvedPlan?.code ?? 'free',
    planName: resolvedPlan?.name ?? 'Free',
    limits: resolvedPlan ? limitsOfPlan(resolvedPlan) : FALLBACK_FREE_LIMITS,
    subscription: subView(latestSubscription),
  };
}

const FEATURE_LABELS: Record<EntitlementFeature, string> = {
  agents: 'AI agents',
  tickets: 'Tickets',
  runs: 'Agent runs',
  members: 'Workspace members',
  apiKeys: 'API keys',
  api: 'API access',
  analytics: 'Analytics',
};

const FEATURE_LIMIT_KEYS: Record<string, keyof PlanLimits> = {
  agents: 'maxAgents',
  tickets: 'maxTicketsPerMonth',
  runs: 'maxRunsPerMonth',
  members: 'maxMembers',
  apiKeys: 'maxApiKeys',
};

function deny(feature: EntitlementFeature, detail: string): never {
  billingEntitlementDenials.inc({ feature });
  logger.warn('Billing entitlement denied', { feature, detail });
  throw Object.assign(new Error(detail), { statusCode: 402, error: 'PaymentRequired' });
}

export function assertEntitled(resolved: ResolvedBilling, feature: EntitlementFeature) {
  if (!resolved.enforced) return;
  if (feature === 'api') {
    if (!resolved.limits.apiAccess) deny('api', `${FEATURE_LABELS.api} is not included in the ${resolved.planName} plan`);
    return;
  }
  if (feature === 'analytics') {
    if (!resolved.limits.analyticsAccess) deny('analytics', `${FEATURE_LABELS.analytics} is not included in the ${resolved.planName} plan`);
    return;
  }
}

export async function assertQuota(
  organizationId: string,
  feature: 'agents' | 'tickets' | 'runs' | 'members' | 'apiKeys',
  current: number,
): Promise<ResolvedBilling> {
  const resolved = await resolveBilling(organizationId);
  if (!resolved.enforced) return resolved;
  const limitKey = FEATURE_LIMIT_KEYS[feature];
  const max = resolved.limits[limitKey] as number;
  if (!withinLimit(current, max)) {
    deny(
      feature,
      `The ${resolved.planName} plan is limited to ${max} ${FEATURE_LABELS[feature].toLowerCase()}. Upgrade the plan in Settings → Billing to continue.`,
    );
  }
  return resolved;
}

export async function assertApiAccessAllowed(organizationId: string): Promise<void> {
  const resolved = await resolveBilling(organizationId);
  if (!resolved.enforced || resolved.limits.apiAccess) return;
  deny('api', `API access is not included in the ${resolved.planName} plan`);
}

export async function recordApiRequest(organizationId: string): Promise<void> {
  try {
    const enforced = await isBillingEnforced();
    if (!enforced) return;
    const periodKey = monthKey();
    await prisma.billingUsage.upsert({
      where: { organizationId_periodKey: { organizationId, periodKey } },
      create: { organizationId, periodKey, apiRequests: 1 },
      update: { apiRequests: { increment: 1 } },
    });
  } catch (error) {
    logger.warn('Failed to record API usage', { organizationId, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function currentUsage(organizationId: string) {
  const since = monthStart();
  const [agents, tickets, runs, members, apiKeys, usage] = await Promise.all([
    prisma.agent.count({ where: { organizationId } }),
    prisma.ticket.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.agentRun.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.membership.count({ where: { organizationId } }),
    prisma.apiKey.count({ where: { organizationId } }),
    prisma.billingUsage.findUnique({
      where: { organizationId_periodKey: { organizationId, periodKey: monthKey() } },
    }),
  ]);
  return { agents, tickets, runs, members, apiKeys, apiRequests: usage?.apiRequests ?? 0, periodKey: monthKey() };
}
