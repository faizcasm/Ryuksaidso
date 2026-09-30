import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import type { AuthUser } from '../lib/auth';

export const agentQueue = new Queue('agent-runs', { connection: redis });

const ENQUEUE_TIMEOUT_MS = 10_000;

export async function enqueueRun(runId: string, organizationId: string, user: AuthUser) {
  const pending = agentQueue.add('agent-execution', { runId, organizationId, user }, {
    jobId: `${organizationId}:${runId}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1500 },
    removeOnComplete: 100,
    removeOnFail: 500
  });

  return await new Promise<Awaited<typeof pending>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out queueing run')), ENQUEUE_TIMEOUT_MS);
    pending.then(
      job => { clearTimeout(timer); resolve(job); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}
