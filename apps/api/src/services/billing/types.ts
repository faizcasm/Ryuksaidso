export type ProviderPeriod = 'MONTHLY' | 'YEARLY';

export type SubscriptionStatusName = 'CREATED' | 'ACTIVE' | 'PENDING' | 'HALTED' | 'CANCELLED' | 'PAUSED' | 'COMPLETED' | 'EXPIRED';
export type PaymentStatusName = 'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';

export interface ProviderSubscription {
  id: string;
  status: SubscriptionStatusName;
  planId: string;
  totalCount: number;
  amount: number;
  currency: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  sessionId: string;
}

export interface ProviderPayment {
  id: string;
  status: PaymentStatusName;
  amount: number;
  currency: string;
  method: string;
  orderId: string;
  subscriptionId: string;
  failureReason: string;
  capturedAt: Date | null;
  invoiceNumber: string;
}

export interface BillingProvider {
  readonly name: string;
  isConfigured(): boolean;
  checkoutEnvironment(): 'sandbox' | 'production';
  ensurePlan(input: {
    planCode: string;
    period: ProviderPeriod;
    amount: number;
    currency: string;
    name: string;
    description: string;
    totalCount: number;
  }): Promise<string>;
  createSubscription(input: {
    subscriptionId: string;
    planId: string;
    organizationId: string;
    planCode: string;
    period: ProviderPeriod;
    totalCount: number;
    customer: { name: string; email: string; phone: string };
    returnUrl: string;
  }): Promise<ProviderSubscription>;
  getSubscription(id: string): Promise<ProviderSubscription>;
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<ProviderSubscription>;
  listSubscriptionPayments(id: string): Promise<ProviderPayment[]>;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string, timestamp: string): boolean;
}

export class BillingProviderError extends Error {
  statusCode: number;
  providerStatus: number;
  constructor(message: string, statusCode = 502, providerStatus = 0) {
    super(message);
    this.name = 'BillingProviderError';
    this.statusCode = statusCode;
    this.providerStatus = providerStatus;
  }
}

const SUBSCRIPTION_STATUS_MAP: Record<string, SubscriptionStatusName> = {
  initialized: 'CREATED',
  created: 'CREATED',
  authenticated: 'CREATED',
  bank_approval_pending: 'PENDING',
  pending: 'PENDING',
  active: 'ACTIVE',
  on_hold: 'HALTED',
  halted: 'HALTED',
  paused: 'PAUSED',
  customer_paused: 'PAUSED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  customer_cancelled: 'CANCELLED',
  expired: 'EXPIRED',
  link_expired: 'EXPIRED',
  card_expired: 'EXPIRED',
};

const PAYMENT_STATUS_MAP: Record<string, PaymentStatusName> = {
  initialized: 'CREATED',
  processing: 'CREATED',
  created: 'CREATED',
  authorized: 'AUTHORIZED',
  success: 'CAPTURED',
  captured: 'CAPTURED',
  failed: 'FAILED',
  flagged: 'FAILED',
  cancelled: 'FAILED',
  canceled: 'FAILED',
  refunded: 'REFUNDED',
  partially_refunded: 'REFUNDED',
};

export function mapSubscriptionStatus(raw: unknown): SubscriptionStatusName | null {
  const value = String(raw ?? '').toLowerCase().trim();
  return SUBSCRIPTION_STATUS_MAP[value] ?? null;
}

export function mapPaymentStatus(raw: unknown): PaymentStatusName | null {
  const value = String(raw ?? '').toLowerCase().trim();
  return PAYMENT_STATUS_MAP[value] ?? null;
}

export function parseCashfreeDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const date = new Date(hasZone ? raw : `${raw}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}
