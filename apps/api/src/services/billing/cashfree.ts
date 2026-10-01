import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../lib/config';
import {
  BillingProviderError,
  mapPaymentStatus,
  mapSubscriptionStatus,
  parseCashfreeDate,
  type BillingProvider,
  type ProviderPayment,
  type ProviderPeriod,
  type ProviderSubscription,
} from './types';

const API_VERSION = '2025-01-01';
const REQUEST_TIMEOUT_MS = 10_000;

type CashfreePlanEntity = {
  plan_id?: string;
  plan_recurring_amount?: number | null;
  plan_max_cycles?: number | null;
  plan_currency?: string | null;
};

type CashfreeSubscriptionEntity = {
  subscription_id?: string;
  subscription_status?: string;
  subscription_session_id?: string | null;
  subscription_first_charge_time?: string | null;
  next_schedule_date?: string | null;
  plan_details?: CashfreePlanEntity | null;
  authorization_details?: {
    authorization_time?: string | null;
    payment_group?: string | null;
    payment_method?: Record<string, unknown> | string | null;
  } | null;
};

type CashfreePaymentEntity = {
  payment_id?: string | null;
  cf_payment_id?: string | number | null;
  cf_order_id?: string | number | null;
  payment_status?: string | null;
  payment_amount?: number | string | null;
  payment_currency?: string | null;
  payment_group?: string | null;
  payment_method?: Record<string, unknown> | string | null;
  subscription_id?: string | null;
  payment_initiated_date?: string | null;
  failure_details?: { failure_reason?: string | null } | null;
  authorization_details?: {
    payment_group?: string | null;
    payment_method?: Record<string, unknown> | string | null;
  } | null;
};

function baseUrl(): string {
  return config.CASHFREE_ENVIRONMENT === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

function toPaise(rupees: unknown): number {
  const value = Number(rupees ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

async function cashfreeRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        'x-api-version': API_VERSION,
        'x-client-id': config.CASHFREE_CLIENT_ID,
        'x-client-secret': config.CASHFREE_CLIENT_SECRET,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BillingProviderError(
      `Cashfree request failed: ${error instanceof Error ? error.message : String(error)}`,
      503,
    );
  }
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message =
      (parsed as { message?: string } | null)?.message ?? `Cashfree responded with status ${response.status}`;
    throw new BillingProviderError(message, response.status >= 500 ? 503 : 502, response.status);
  }
  return parsed as T;
}

function methodOf(
  paymentMethod: CashfreePaymentEntity['payment_method'] | NonNullable<CashfreeSubscriptionEntity['authorization_details']> | null | undefined,
  fallbackGroup: string | null | undefined,
): string {
  const method =
    paymentMethod && typeof paymentMethod === 'object' && 'payment_method' in paymentMethod
      ? paymentMethod.payment_method
      : paymentMethod;
  if (typeof method === 'string' && method) return method.toLowerCase();
  if (method && typeof method === 'object') {
    const key = Object.keys(method)[0];
    if (key) return key.toLowerCase();
  }
  return fallbackGroup ? String(fallbackGroup).toLowerCase() : '';
}

function toProviderSubscription(entity: CashfreeSubscriptionEntity): ProviderSubscription {
  return {
    id: String(entity.subscription_id ?? ''),
    status: mapSubscriptionStatus(entity.subscription_status) ?? 'CREATED',
    planId: String(entity.plan_details?.plan_id ?? ''),
    totalCount: Number(entity.plan_details?.plan_max_cycles ?? 0),
    amount: toPaise(entity.plan_details?.plan_recurring_amount),
    currency: String(entity.plan_details?.plan_currency ?? config.BILLING_CURRENCY),
    currentPeriodStart:
      parseCashfreeDate(entity.subscription_first_charge_time) ?? parseCashfreeDate(entity.authorization_details?.authorization_time),
    currentPeriodEnd: parseCashfreeDate(entity.next_schedule_date),
    sessionId: String(entity.subscription_session_id ?? ''),
  };
}

function toProviderPayment(entity: CashfreePaymentEntity): ProviderPayment {
  const status = String(entity.payment_status ?? '').toUpperCase();
  return {
    id: String(entity.cf_payment_id ?? entity.payment_id ?? ''),
    status: mapPaymentStatus(entity.payment_status) ?? 'CREATED',
    amount: toPaise(entity.payment_amount),
    currency: String(entity.payment_currency ?? config.BILLING_CURRENCY),
    method: methodOf(
      entity.payment_method ?? entity.authorization_details,
      entity.payment_group ?? entity.authorization_details?.payment_group,
    ),
    orderId: String(entity.cf_order_id ?? ''),
    subscriptionId: String(entity.subscription_id ?? ''),
    failureReason: status === 'FAILED' ? String(entity.failure_details?.failure_reason ?? '') : '',
    capturedAt: status === 'SUCCESS' ? (parseCashfreeDate(entity.payment_initiated_date) ?? new Date()) : null,
    invoiceNumber: '',
  };
}

export function verifyCashfreeSignature(
  rawBody: Buffer | string,
  signature: string,
  timestamp: string,
  secret: string,
): boolean {
  if (!secret || !signature || !timestamp) return false;
  const raw = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = createHmac('sha256', secret).update(`${timestamp}${raw}`).digest('base64');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function cashfreePlanId(planCode: string, period: ProviderPeriod, amountPaise: number): string {
  const cadence = period === 'YEARLY' ? 'y' : 'm';
  return `ryu_${planCode}_${cadence}${amountPaise}`.slice(0, 40);
}

async function fetchRemotePlan(planId: string): Promise<CashfreePlanEntity> {
  return cashfreeRequest<CashfreePlanEntity>('GET', `/plans/${encodeURIComponent(planId)}`);
}

export const cashfreeProvider: BillingProvider = {
  name: 'cashfree',

  isConfigured() {
    return Boolean(config.CASHFREE_CLIENT_ID && config.CASHFREE_CLIENT_SECRET);
  },

  checkoutEnvironment() {
    return config.CASHFREE_ENVIRONMENT;
  },

  async ensurePlan(input) {
    const planId = cashfreePlanId(input.planCode, input.period, input.amount);
    if (input.amount <= 0) {
      throw new BillingProviderError('Cannot create a paid plan with a non-positive amount', 400);
    }
    try {
      const existing = await fetchRemotePlan(planId);
      if (existing.plan_id) return planId;
    } catch (error) {
      const providerStatus = error instanceof BillingProviderError ? error.providerStatus : 0;
      if (providerStatus !== 404) throw error;
    }
    try {
      await cashfreeRequest<CashfreePlanEntity>('POST', '/plans', {
        plan_id: planId,
        plan_name: input.name.slice(0, 40),
        plan_type: 'PERIODIC',
        plan_currency: input.currency,
        plan_recurring_amount: toRupees(input.amount),
        plan_max_amount: toRupees(input.amount),
        plan_max_cycles: input.totalCount,
        plan_intervals: 1,
        plan_interval_type: input.period === 'YEARLY' ? 'YEAR' : 'MONTH',
        plan_note: input.description.slice(0, 200),
      });
      return planId;
    } catch (error) {
      const existing = await fetchRemotePlan(planId).catch(() => null);
      if (existing?.plan_id) return planId;
      throw error;
    }
  },

  async createSubscription(input) {
    const entity = await cashfreeRequest<CashfreeSubscriptionEntity>('POST', '/subscriptions', {
      subscription_id: input.subscriptionId,
      customer_details: {
        customer_name: input.customer.name.slice(0, 120),
        customer_email: input.customer.email.slice(0, 320),
        customer_phone: input.customer.phone,
      },
      plan_details: { plan_id: input.planId },
      authorization_details: { payment_methods: ['upi', 'card', 'enach'] },
      subscription_meta: {
        return_url: input.returnUrl,
        notification_channel: ['EMAIL'],
      },
      subscription_tags: { psp_note: `${input.planCode} subscription` },
    });
    if (!entity.subscription_id) throw new BillingProviderError('Cashfree did not return a subscription id');
    return toProviderSubscription(entity);
  },

  async getSubscription(id) {
    const entity = await cashfreeRequest<CashfreeSubscriptionEntity>('GET', `/subscriptions/${encodeURIComponent(id)}`);
    if (!entity.subscription_id) throw new BillingProviderError('Cashfree subscription not found', 404);
    return toProviderSubscription(entity);
  },

  async cancelSubscription(id, atCycleEnd) {
    const action = atCycleEnd ? 'PAUSE' : 'CANCEL';
    try {
      await cashfreeRequest<CashfreeSubscriptionEntity>('POST', `/subscriptions/${encodeURIComponent(id)}/manage`, {
        action,
      });
    } catch (error) {
      const providerStatus = error instanceof BillingProviderError ? error.providerStatus : 0;
      if (!(atCycleEnd && providerStatus === 400)) throw error;
      await cashfreeRequest<CashfreeSubscriptionEntity>('POST', `/subscriptions/${encodeURIComponent(id)}/manage`, {
        action: 'CANCEL',
      });
    }
    return this.getSubscription(id);
  },

  async listSubscriptionPayments(id) {
    const response = await cashfreeRequest<CashfreePaymentEntity[] | { payments?: CashfreePaymentEntity[] }>(
      'GET',
      `/subscriptions/${encodeURIComponent(id)}/payments`,
    );
    const payments = Array.isArray(response) ? response : (response?.payments ?? []);
    return payments.map(toProviderPayment).filter((payment) => payment.id);
  },

  verifyWebhookSignature(rawBody, signature, timestamp) {
    const secret = config.CASHFREE_WEBHOOK_SECRET || config.CASHFREE_CLIENT_SECRET;
    return verifyCashfreeSignature(rawBody, signature, timestamp, secret);
  },
};
