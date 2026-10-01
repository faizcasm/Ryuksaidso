import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';
import { billingEvents, billingWebhookDuration } from '../../lib/metrics';
import { billingConfigured, getBillingProvider } from './index';
import { settlePreviousSubscriptions } from './settle';
import { mapPaymentStatus, mapSubscriptionStatus, parseCashfreeDate } from './types';
import type { Prisma } from '@prisma/client';

export type WebhookOutcome = 'processed' | 'ignored' | 'duplicate' | 'failed';

export interface WebhookEventInput {
  eventId: string;
  eventType: string;
  payload: unknown;
}

type SubscriptionDetails = {
  cf_subscription_id?: string | number | null;
  subscription_id?: string | null;
  subscription_status?: string | null;
  subscription_first_charge_time?: string | null;
  next_schedule_date?: string | null;
};

type AuthorizationDetails = {
  payment_group?: string | null;
  payment_method?: Record<string, unknown> | string | null;
  authorization_time?: string | null;
};

type WebhookData = {
  subscription_id?: string | null;
  cf_payment_id?: string | number | null;
  payment_id?: string | null;
  payment_status?: string | null;
  payment_amount?: number | string | null;
  payment_currency?: string | null;
  payment_initiated_date?: string | null;
  subscription_details?: SubscriptionDetails | null;
  authorization_details?: AuthorizationDetails | null;
  failure_details?: { failure_reason?: string | null } | null;
  refund_status?: string | null;
  cf_refund_id?: string | number | null;
};

const ENDED_STATUSES = new Set(['CANCELLED', 'COMPLETED', 'EXPIRED']);

function toPaise(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function methodOf(authorization: AuthorizationDetails | undefined | null): string {
  const method = authorization?.payment_method;
  if (typeof method === 'string' && method) return method.toLowerCase();
  if (method && typeof method === 'object') {
    const key = Object.keys(method)[0];
    if (key) return key.toLowerCase();
  }
  return authorization?.payment_group ? String(authorization.payment_group).toLowerCase() : '';
}

async function applySubscriptionDetails(details: SubscriptionDetails | null | undefined): Promise<'processed' | 'ignored'> {
  const subscriptionId = String(details?.subscription_id ?? '');
  if (!subscriptionId) return 'ignored';
  const local = await prisma.billingSubscription.findUnique({ where: { providerSubscriptionId: subscriptionId } });
  if (!local) return 'ignored';
  const status = mapSubscriptionStatus(details?.subscription_status);
  const data: Prisma.BillingSubscriptionUpdateInput = {};
  if (status && status !== local.status) {
    data.status = status;
    if (ENDED_STATUSES.has(status)) {
      data.endedAt = new Date();
      data.canceledAt = new Date();
      data.cancelAtPeriodEnd = false;
    }
    if (status === 'ACTIVE') data.cancelAtPeriodEnd = false;
  }
  const start = parseCashfreeDate(details?.subscription_first_charge_time);
  const end = parseCashfreeDate(details?.next_schedule_date);
  if (start) data.currentPeriodStart = start;
  if (end) data.currentPeriodEnd = end;
  if (Object.keys(data).length === 0) return 'processed';
  await prisma.billingSubscription.update({ where: { id: local.id }, data });
  if (data.status === 'ACTIVE' && local.status !== 'ACTIVE') {
    billingEvents.inc({ event: 'subscription_activated' });
    if (billingConfigured()) {
      await settlePreviousSubscriptions(getBillingProvider(), local.organizationId, local.id);
    }
  }
  return 'processed';
}

async function recordPayment(data: WebhookData): Promise<void> {
  const paymentId = String(data.cf_payment_id ?? data.payment_id ?? '');
  if (!paymentId) return;
  const subscriptionId = String(data.subscription_id ?? data.subscription_details?.subscription_id ?? '');
  const localSubscription = subscriptionId
    ? await prisma.billingSubscription.findUnique({ where: { providerSubscriptionId: subscriptionId } })
    : null;
  const rawStatus = String(data.payment_status ?? '');
  const status = mapPaymentStatus(rawStatus) ?? 'CREATED';
  const capturedAt =
    status === 'CAPTURED' ? (parseCashfreeDate(data.payment_initiated_date) ?? new Date()) : null;
  const payload = {
    organizationId: localSubscription?.organizationId ?? '',
    providerOrderId: '',
    providerSubscriptionId: subscriptionId,
    planId: localSubscription?.planId ?? '',
    amount: toPaise(data.payment_amount),
    currency: String(data.payment_currency ?? 'INR'),
    status,
    method: methodOf(data.authorization_details),
    failureReason:
      status === 'FAILED'
        ? String(data.failure_details?.failure_reason ?? (rawStatus || 'Payment failed'))
        : '',
    ...(capturedAt ? { capturedAt } : {}),
  };
  await prisma.billingPayment.upsert({
    where: { providerPaymentId: paymentId },
    create: { providerPaymentId: paymentId, ...payload },
    update: payload,
  });
}

async function handleRefund(data: WebhookData): Promise<'processed' | 'ignored'> {
  const refundStatus = String(data.refund_status ?? '').toUpperCase();
  if (refundStatus !== 'SUCCESS') return 'ignored';
  const paymentId = String(data.cf_payment_id ?? data.payment_id ?? '');
  if (!paymentId) return 'ignored';
  const existing = await prisma.billingPayment.findUnique({ where: { providerPaymentId: paymentId } });
  if (!existing) return 'ignored';
  await prisma.billingPayment.update({
    where: { providerPaymentId: paymentId },
    data: { status: 'REFUNDED', invoiceNumber: String(data.cf_refund_id ?? existing.invoiceNumber ?? '') },
  });
  return 'processed';
}

async function dispatch(eventType: string, rawPayload: unknown): Promise<'processed' | 'ignored'> {
  const body =
    rawPayload && typeof rawPayload === 'object' ? (rawPayload as { data?: WebhookData }) : null;
  const data = body?.data;
  if (!data || typeof data !== 'object') return 'ignored';

  switch (eventType) {
    case 'SUBSCRIPTION_STATUS_CHANGED':
      return applySubscriptionDetails(data.subscription_details);
    case 'SUBSCRIPTION_AUTH_STATUS':
    case 'SUBSCRIPTION_PAYMENT_NOTIFICATION_INITIATED':
    case 'SUBSCRIPTION_PAYMENT_SUCCESS':
    case 'SUBSCRIPTION_PAYMENT_FAILED':
    case 'SUBSCRIPTION_PAYMENT_CANCELLED': {
      await recordPayment(data);
      if (data.subscription_details && String(data.subscription_details.subscription_id ?? '')) {
        await applySubscriptionDetails(data.subscription_details);
      }
      return 'processed';
    }
    case 'SUBSCRIPTION_REFUND_STATUS':
      return handleRefund(data);
    default:
      return 'ignored';
  }
}

async function markEvent(eventId: string, status: 'PROCESSED' | 'IGNORED' | 'FAILED' | 'RECEIVED', error = '') {
  await prisma.billingWebhookEvent
    .update({
      where: { eventId },
      data: {
        status,
        error: error.slice(0, 1000),
        processedAt: status === 'RECEIVED' ? null : new Date(),
      },
    })
    .catch(() => undefined);
}

export async function processWebhookEvent(input: WebhookEventInput): Promise<WebhookOutcome> {
  const started = process.hrtime.bigint();
  const { eventId, eventType, payload } = input;
  let outcome: WebhookOutcome = 'ignored';
  try {
    const existing = await prisma.billingWebhookEvent.findUnique({ where: { eventId } });
    if (existing) {
      if (existing.status !== 'FAILED') {
        outcome = 'duplicate';
        return outcome;
      }
      await markEvent(eventId, 'RECEIVED');
    } else {
      try {
        await prisma.billingWebhookEvent.create({
          data: {
            eventId,
            eventType: eventType.slice(0, 120),
            status: 'RECEIVED',
            payload: payload as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        const raced = await prisma.billingWebhookEvent.findUnique({ where: { eventId } }).catch(() => null);
        if (!raced) throw error;
        if (raced.status !== 'FAILED') {
          outcome = 'duplicate';
          return outcome;
        }
        await markEvent(eventId, 'RECEIVED');
      }
    }

    const result = await dispatch(eventType, payload);
    outcome = result;
    await markEvent(eventId, result === 'processed' ? 'PROCESSED' : 'IGNORED');
    billingEvents.inc({ event: `webhook_${result}` });
  } catch (error) {
    outcome = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    await markEvent(eventId, 'FAILED', message);
    billingEvents.inc({ event: 'webhook_failed' });
    logger.error('Billing webhook processing failed', { eventType, eventId, error: message });
  } finally {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    billingWebhookDuration.observe({ event: eventType.slice(0, 60), outcome }, seconds);
  }
  return outcome;
}
