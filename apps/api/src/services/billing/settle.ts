import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';
import { billingEvents } from '../../lib/metrics';
import type { BillingProvider } from './types';

const RUNNING_STATUSES = ['ACTIVE', 'PENDING'] as const;
const ENDED_STATUSES = ['CANCELLED', 'COMPLETED', 'EXPIRED'] as const;

export async function settlePreviousSubscriptions(
  provider: BillingProvider,
  organizationId: string,
  activeSubscriptionId: string,
): Promise<void> {
  const previous = await prisma.billingSubscription.findMany({
    where: {
      organizationId,
      id: { not: activeSubscriptionId },
      status: { in: [...RUNNING_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
  });
  for (const previousSubscription of previous) {
    try {
      const remote = await provider.cancelSubscription(previousSubscription.providerSubscriptionId, true);
      if (remote.status === 'PAUSED') {
        await prisma.billingSubscription.update({
          where: { id: previousSubscription.id },
          data: { status: 'PAUSED', cancelAtPeriodEnd: true },
        });
        billingEvents.inc({ event: 'previous_subscription_set_to_end' });
      } else if ((ENDED_STATUSES as readonly string[]).includes(remote.status)) {
        await prisma.billingSubscription.update({
          where: { id: previousSubscription.id },
          data: {
            status: remote.status,
            cancelAtPeriodEnd: false,
            canceledAt: new Date(),
            endedAt: new Date(),
          },
        });
        billingEvents.inc({ event: 'previous_subscription_ended' });
      } else {
        logger.warn('Unexpected status while settling the previous subscription', {
          subscriptionId: previousSubscription.providerSubscriptionId,
          status: remote.status,
        });
      }
    } catch (error) {
      logger.error('Failed to settle the previous subscription after a plan change', {
        subscriptionId: previousSubscription.providerSubscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
