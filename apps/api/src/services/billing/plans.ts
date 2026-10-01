import { prisma } from '../../lib/db';

export interface DefaultPlanDefinition {
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  maxAgents: number;
  maxMembers: number;
  maxTicketsPerMonth: number;
  maxRunsPerMonth: number;
  maxApiKeys: number;
  apiAccess: boolean;
  analyticsAccess: boolean;
  features: string[];
  isDefault: boolean;
  sortOrder: number;
}

export const DEFAULT_PLANS: DefaultPlanDefinition[] = [
  {
    code: 'free',
    name: 'Free',
    description: 'Core control plane for a single small team getting started.',
    priceMonthly: 0,
    priceYearly: 0,
    maxAgents: 2,
    maxMembers: 3,
    maxTicketsPerMonth: 50,
    maxRunsPerMonth: 100,
    maxApiKeys: 1,
    apiAccess: false,
    analyticsAccess: false,
    features: ['2 AI agents', '3 workspace members', '50 tickets / month', '100 agent runs / month', 'Community support'],
    isDefault: true,
    sortOrder: 1,
  },
  {
    code: 'starter',
    name: 'Starter',
    description: 'For growing support teams that need API and analytics access.',
    priceMonthly: 49900,
    priceYearly: 499000,
    maxAgents: 10,
    maxMembers: 10,
    maxTicketsPerMonth: 500,
    maxRunsPerMonth: 1000,
    maxApiKeys: 5,
    apiAccess: true,
    analyticsAccess: true,
    features: ['10 AI agents', '10 workspace members', '500 tickets / month', '1,000 agent runs / month', 'API access', 'Analytics', 'Email support'],
    isDefault: false,
    sortOrder: 2,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Higher limits and priority routing for scaling operations.',
    priceMonthly: 199900,
    priceYearly: 1999000,
    maxAgents: 50,
    maxMembers: 25,
    maxTicketsPerMonth: 5000,
    maxRunsPerMonth: 10000,
    maxApiKeys: 20,
    apiAccess: true,
    analyticsAccess: true,
    features: ['50 AI agents', '25 workspace members', '5,000 tickets / month', '10,000 agent runs / month', 'API access', 'Analytics', 'Priority support'],
    isDefault: false,
    sortOrder: 3,
  },
  {
    code: 'business',
    name: 'Business',
    description: 'Unlimited scale with dedicated onboarding for larger teams.',
    priceMonthly: 499900,
    priceYearly: 4999000,
    maxAgents: 0,
    maxMembers: 0,
    maxTicketsPerMonth: 0,
    maxRunsPerMonth: 0,
    maxApiKeys: 0,
    apiAccess: true,
    analyticsAccess: true,
    features: ['Unlimited AI agents', 'Unlimited workspace members', 'Unlimited tickets', 'Unlimited agent runs', 'API access', 'Analytics', 'Dedicated onboarding'],
    isDefault: false,
    sortOrder: 4,
  },
];

export async function ensureBillingPlans(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    try {
      await prisma.billingPlan.upsert({
        where: { code: plan.code },
        create: { ...plan, currency: 'INR' },
        update: {},
      });
    } catch {
      const existing = await prisma.billingPlan.findUnique({ where: { code: plan.code } }).catch(() => null);
      if (!existing) throw new Error(`Failed to seed billing plan ${plan.code}`);
    }
  }
}

export async function listPlans(includeInactive = false) {
  await ensureBillingPlans();
  return prisma.billingPlan.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { sortOrder: 'asc' },
  });
}

export function totalCountForPeriod(period: 'MONTHLY' | 'YEARLY'): number {
  return period === 'YEARLY' ? 10 : 120;
}
