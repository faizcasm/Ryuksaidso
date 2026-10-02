import { randomUUID } from 'node:crypto';
import { webhookSignature, randomWebhookSecret } from './crypto';
import { WEBHOOK_EVENT_CATALOG } from './catalog';
import { errorMessage, sleep, USER_AGENT } from '../util';

const ATTEMPT_LIMIT = 3;
const ATTEMPT_TIMEOUT_MS = 10_000;
const RETRY_BACKOFF_MS = [0, 1_000, 4_000];
const SWEEP_MIN_AGE_MS = 30_000;

export const WEBHOOK_EVENTS: string[] = WEBHOOK_EVENT_CATALOG.map((entry) => entry.event);

export function webhookEventCatalog() {
  return WEBHOOK_EVENT_CATALOG.map((entry) => ({ ...entry }));
}

export function createEndpointSecret(): string {
  return randomWebhookSecret();
}

export function buildWebhookBody(event: string, eventId: string, payload: unknown): string {
  return JSON.stringify({ id: eventId, event, createdAt: new Date().toISOString(), data: payload ?? {} });
}

export function webhookHeaders(secret: string, eventId: string, event: string, body: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'user-agent': USER_AGENT,
    'x-ryuksaidso-event': event,
    'x-ryuksaidso-delivery': eventId,
    'x-ryuksaidso-timestamp': timestamp,
    'x-ryuksaidso-signature': `sha256=${webhookSignature(secret, timestamp, body)}`,
  };
}

async function attemptDelivery(delivery: any, endpoint: any): Promise<{ ok: boolean; error: string }> {
  const body = buildWebhookBody(String(delivery.event), String(delivery.eventId), delivery.payload);
  try {
    const response = await fetch(String(endpoint.url), {
      method: 'POST',
      headers: webhookHeaders(String(endpoint.secret), String(delivery.eventId), String(delivery.event), body),
      body,
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      redirect: 'manual',
    });
    if (response.ok) return { ok: true, error: '' };
    const text = await response.text().catch(() => '');
    return { ok: false, error: `HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}` };
  } catch (error) {
    return { ok: false, error: errorMessage(error).slice(0, 300) };
  }
}

export async function deliverDelivery(prisma: any, deliveryId: string): Promise<{ ok: boolean; attempts: number }> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return { ok: false, attempts: 0 };
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } });
  if (!endpoint || !endpoint.active) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', lastError: 'Endpoint is inactive', attempts: (delivery.attempts ?? 0) + 1 },
    });
    return { ok: false, attempts: (delivery.attempts ?? 0) + 1 };
  }
  let attempts = 0;
  let lastError = '';
  for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt += 1) {
    attempts += 1;
    if (RETRY_BACKOFF_MS[attempt]) await sleep(RETRY_BACKOFF_MS[attempt]);
    const result = await attemptDelivery(delivery, endpoint);
    if (result.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SUCCESS', attempts, deliveredAt: new Date(), lastError: '' },
      });
      await prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { lastDeliveryAt: new Date() },
      });
      return { ok: true, attempts };
    }
    lastError = result.error;
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { attempts, lastError: lastError.slice(0, 500) } });
  }
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: 'FAILED', attempts, lastError: lastError.slice(0, 500) },
  });
  return { ok: false, attempts };
}

export async function emitWebhookEvent(prisma: any, organizationId: string, event: string, payload: unknown): Promise<number> {
  if (!organizationId || !WEBHOOK_EVENTS.includes(event)) return 0;
  let endpoints: any[] = [];
  try {
    endpoints = await prisma.webhookEndpoint.findMany({
      where: { organizationId, active: true, events: { has: event } },
      select: { id: true },
    });
  } catch {
    return 0;
  }
  let queued = 0;
  for (const endpoint of endpoints) {
    try {
      const eventId = randomUUID();
      const delivery = await prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          organizationId,
          event,
          eventId,
          payload: (payload ?? {}) as any,
          status: 'PENDING',
        },
      });
      queued += 1;
      void deliverDelivery(prisma, delivery.id).catch(() => undefined);
    } catch {
      continue;
    }
  }
  return queued;
}

export async function sweepPendingDeliveries(prisma: any, limit = 25): Promise<{ delivered: number; failed: number }> {
  let rows: any[] = [];
  try {
    rows = await prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - SWEEP_MIN_AGE_MS) } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  } catch {
    return { delivered: 0, failed: 0 };
  }
  let delivered = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await deliverDelivery(prisma, row.id);
    if (result.ok) delivered += 1;
    else failed += 1;
  }
  return { delivered, failed };
}

export async function retryDelivery(prisma: any, deliveryId: string): Promise<{ ok: boolean }> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) throw new Error('Delivery not found');
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: 'PENDING', lastError: '', deliveredAt: null },
  });
  const result = await deliverDelivery(prisma, delivery.id);
  return { ok: result.ok };
}
