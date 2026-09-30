import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import type { AuthUser } from '../lib/auth';

export const agentQueue = new Queue('agent-runs', { connection: redis });

export async function enqueueRun(runId: string, organizationId: string, user: AuthUser) {
  return agentQueue.add('agent-execution', { runId, organizationId, user }, {
    jobId: `${organizationId}:${runId}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1500 },
    removeOnComplete: 100,
    removeOnFail: 500
  });
}
