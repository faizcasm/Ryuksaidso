import { config } from '../../lib/config';
import { cashfreeProvider } from './cashfree';
import type { BillingProvider } from './types';

export type { BillingProvider, ProviderPayment, ProviderPeriod, ProviderSubscription } from './types';
export { BillingProviderError, mapPaymentStatus, mapSubscriptionStatus, parseCashfreeDate } from './types';
export { cashfreePlanId, verifyCashfreeSignature } from './cashfree';
export { DEFAULT_PLANS, ensureBillingPlans, listPlans, totalCountForPeriod } from './plans';
export { settlePreviousSubscriptions } from './settle';

export function getBillingProvider(): BillingProvider {
  const provider = config.BILLING_PROVIDER.toLowerCase().trim();
  if (provider === 'cashfree') return cashfreeProvider;
  throw Object.assign(new Error(`Billing provider '${config.BILLING_PROVIDER}' is not supported`), {
    statusCode: 503,
  });
}

export function billingConfigured(): boolean {
  return config.BILLING_PROVIDER.toLowerCase().trim() === 'cashfree' && cashfreeProvider.isConfigured();
}
