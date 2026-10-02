import { Router } from 'express';
import { audit, type AuthUser } from '../lib/auth';
import { prisma } from '../lib/db';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { approvalDecisionSchema } from '../validation';
import { enqueueRun } from '../services/queue';
import { emitWebhookEvent } from '@ryuksaidso/agent-tools';

export const approvalRouter = Router();
approvalRouter.use(requireAuth);

function user(req: AuthenticatedRequest): AuthUser {
  if (!req.user) throw new Error('Authenticated user missing');
  return req.user;
}

approvalRouter.get('/approvals', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  res.json(await prisma.approval.findMany({ where: { organizationId: u.organizationId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }));
});

approvalRouter.post('/approvals/:id/decision', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  if (!['OWNER','ADMIN','AGENT'].includes(u.role)) return res.status(403).json({error:'Forbidden',message:'Insufficient permissions'});
  const body = approvalDecisionSchema.parse(req.body);
  const approval = await prisma.approval.findFirst({ where: { id: req.params.id, organizationId: u.organizationId, status: 'PENDING' } });
  if (!approval) {
    res.status(404).json({ error: 'NotFound', message: 'Pending approval not found' });
    return;
  }
  const status = body.approved ? 'APPROVED' : 'REJECTED';
  const claimed = await prisma.approval.updateMany({ where: { id: approval.id, status: 'PENDING' }, data: { status, decidedBy: u.id, decidedAt: new Date() } });
  if (claimed.count !== 1) {
    res.status(404).json({ error: 'NotFound', message: 'Pending approval not found' });
    return;
  }
  const result = await prisma.approval.findUnique({ where: { id: approval.id } });
  void emitWebhookEvent(
    prisma,
    u.organizationId,
    body.approved ? 'approval.approved' : 'approval.rejected',
    { approvalId: approval.id, action: approval.action },
  ).catch(() => undefined);
  if (body.approved) {
    const sourceRun = await prisma.agentRun.findFirst({ where: { id: approval.runId, organizationId: u.organizationId } });
    if (sourceRun) {
      const sourceInput = (sourceRun.input ?? {}) as { prompt?: string; metadata?: Record<string, unknown>; ticketId?: string };
      const previousScopes = Array.isArray(sourceInput.metadata?.approvedScopes) ? sourceInput.metadata?.approvedScopes.map(String) : [];
      const continuation = await prisma.agentRun.create({
        data: {
          organizationId: u.organizationId,
          projectId: sourceRun.projectId,
          ticketId: sourceRun.ticketId,
          agentId: sourceRun.agentId,
          agentVersionId: sourceRun.agentVersionId,
          provider: sourceRun.provider,
          status: 'QUEUED',
          trigger: 'approval-resume',
          environment: sourceRun.environment,
          input: { prompt: sourceInput.prompt ?? '', ticketId: sourceInput.ticketId, metadata: { ...(sourceInput.metadata ?? {}), approvedScopes: [...new Set([...previousScopes, approval.action])] } }
        }
      });
      await prisma.agentRun.update({ where: { id: sourceRun.id }, data: { status: 'COMPLETED', output: { state: 'APPROVED', continuationRunId: continuation.id }, finishedAt: new Date() } });
      await enqueueRun(continuation.id, u.organizationId, u);
      await audit(u, 'approval.resumed', 'agent_run', continuation.id, { sourceRunId: sourceRun.id, approvalId: approval.id, action: approval.action });
      return res.json({ ...result, continuationRunId: continuation.id });
    }
  } else {
    await prisma.agentRun.updateMany({ where: { id: approval.runId, organizationId: u.organizationId, status: 'WAITING_APPROVAL' }, data: { status: 'FAILED', error: `Approval rejected by ${u.name}`, finishedAt: new Date() } });
  }
  await audit(u, `approval.${status.toLowerCase()}`, 'approval', approval.id);
  res.json(result);
});
