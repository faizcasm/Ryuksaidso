import { Router } from 'express';
import { prisma } from '../lib/db';
import { redis } from '../lib/redis';
import { providerConfig, type LLMProviderName } from '../lib/config';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware';
import { audit, type AuthUser } from '../lib/auth';

export const adminRouter = Router();
adminRouter.use(requireAuth);

async function admin(req: AuthenticatedRequest): Promise<AuthUser> {
  const user = req.user;
  if (!user) throw new Error('Authenticated user missing');
  const membership = await prisma.membership.findFirst({ where: { userId:user.id, organizationId:user.organizationId }, select:{ role:true } });
  const membershipOk = !!membership && ['OWNER','ADMIN'].includes(membership.role);
  const system = await prisma.user.findUnique({ where: { id: user.id }, select: { userRole: true } });
  if (!membershipOk && system?.userRole !== 'ADMIN') throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
  return { ...user, role: membership?.role ?? 'VIEWER', userRole: system?.userRole ?? 'USER' };
}

adminRouter.get('/users', requireAdmin, async (req, res) => {
  try {
    const u = await admin(req as AuthenticatedRequest);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        userRole: true,
        emailVerifiedAt: true,
        createdAt: true,
        memberships: {
          where: { organizationId: u.organizationId },
          select: { role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(users);
  } catch (e) {
    if ((e as any).statusCode === 403) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch users' });
  }
});

adminRouter.patch('/users/:userId/role', requireAdmin, async (req, res) => {
  try {
    const u = await admin(req as AuthenticatedRequest);
    const userRole = (req.body as { userRole?: string } | undefined)?.userRole;
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

    if (!['USER', 'ADMIN'].includes(userRole as string)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid role. Must be USER or ADMIN' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, userRole: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    if (user.id === u.id && userRole === 'USER') {
      return res.status(400).json({ error: 'ValidationError', message: 'You cannot demote your own account' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { userRole: userRole as any },
      select: { id: true, email: true, name: true, userRole: true, createdAt: true }
    });

    await audit(u, 'admin.user_role_changed', 'user', user.id, { userRole: userRole as string });

    res.json({
      message: `User role updated to ${userRole}`,
      user: updated
    });
  } catch (e) {
    if ((e as any).statusCode === 403) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }
    res.status(500).json({ error: 'InternalError', message: 'Failed to update user role' });
  }
});

adminRouter.get('/me/role', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: { id: true, email: true, name: true, userRole: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    res.json({
      user,
      isAdmin: user.userRole === 'ADMIN'
    });
  } catch {
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch user role' });
  }
});

adminRouter.get('/overview', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  const u = await admin(req as AuthenticatedRequest);
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - 14); start.setHours(0,0,0,0);
  const [org, members, projects, agents, docs, approvals, runs, auditLogs, activeSessions, apiKeys, tickets, verifiedMembers] = await Promise.all([
    prisma.organization.findUnique({ where: { id: u.organizationId }, select: { id: true, name: true, llmProvider: true, ollamaModel: true, omnirouteModel: true, createdAt: true } }),
    prisma.membership.findMany({ where: { organizationId: u.organizationId }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } }, orderBy: { user: { createdAt: 'desc' } } }),
    prisma.project.count({ where: { organizationId: u.organizationId } }),
    prisma.agent.count({ where: { organizationId: u.organizationId } }),
    prisma.document.count({ where: { organizationId: u.organizationId } }),
    prisma.approval.count({ where: { organizationId: u.organizationId, status: 'PENDING' } }),
    prisma.agentRun.findMany({ where: { organizationId: u.organizationId, createdAt: { gte: start } }, select: { id: true, status: true, tokenUsage: true, latencyMs: true, provider: true, createdAt: true, agent: { select: { name: true } }, project: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: 'desc' }, take: 25 }),
    prisma.session.count({ where:{ organizationId:u.organizationId, revokedAt:null, expiresAt:{gt:new Date()} } }),
    prisma.apiKey.count({ where:{organizationId:u.organizationId} }),
    prisma.ticket.count({ where:{organizationId:u.organizationId, status:{in:['OPEN','IN_PROGRESS','WAITING']}} }),
    prisma.user.count({ where:{ emailVerifiedAt:{not:null}, memberships:{some:{organizationId:u.organizationId}} } })
  ]);

  const toolGroups: { action: string; _count: { _all: number }; _avg: { durationMs: number | null } }[] = await prisma.agentStep
    .groupBy({
      by: ['action'],
      where: { action: { startsWith: 'Execute ' }, createdAt: { gte: start }, run: { organizationId: u.organizationId } },
      _count: { _all: true },
      _avg: { durationMs: true },
      orderBy: { _count: { action: 'desc' } },
      take: 10,
    })
    .catch(() => []);

  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0,10);
    const dayRuns = runs.filter(r => r.createdAt.toISOString().slice(0,10) === key);
    return { date: key, runs: dayRuns.length, completed: dayRuns.filter(r => r.status === 'COMPLETED').length, failed: dayRuns.filter(r => r.status === 'FAILED').length, tokens: dayRuns.reduce((n,r)=>n+(r.tokenUsage||0),0) };
  });

  const topAgentMap = new Map<string, { name:string; runs:number; failures:number; tokens:number }>();
  for (const run of runs) {
    const name = run.agent?.name || 'Unassigned';
    const current = topAgentMap.get(name) || { name, runs: 0, failures: 0, tokens: 0 };
    current.runs += 1; current.failures += run.status === 'FAILED' ? 1 : 0; current.tokens += run.tokenUsage || 0;
    topAgentMap.set(name, current);
  }

  const providerCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const run of runs) {
    providerCounts.set(run.provider || 'OLLAMA', (providerCounts.get(run.provider || 'OLLAMA') || 0) + 1);
    statusCounts.set(run.status, (statusCounts.get(run.status) || 0) + 1);
  }
  const providerSplit = [...providerCounts.entries()].map(([provider, runs]) => ({ provider, runs })).sort((a,b)=>b.runs-a.runs);
  const statusSplit = [...statusCounts.entries()].map(([status, runs]) => ({ status, runs })).sort((a,b)=>b.runs-a.runs);

  const registrations = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0,10);
    const created = members.filter(m => m.user.createdAt.toISOString().slice(0,10) === key);
    return { date: key, new: created.length };
  });
  const beforeWindow = members.filter(m => m.user.createdAt < start).length;

  const topTools = toolGroups
    .filter(g => g._count?._all)
    .map(g => ({
      tool: g.action.replace(/^Execute\s+/, ''),
      runs: g._count._all,
      avgMs: Math.round(g._avg?.durationMs ?? 0),
    }));

  const timed = async <T>(fn: () => Promise<T>, ms: number): Promise<{ ok: boolean; latencyMs: number; value?: T; error?: string }> => {
    const started = Date.now();
    try {
      const value = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
      ]);
      return { ok: true, latencyMs: Date.now() - started, value };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const dbProbe = await timed(() => prisma.$queryRaw`SELECT 1`, 2000);
  const redisProbe = await timed(() => redis.ping(), 2000);
  const llmProvider: LLMProviderName = org?.llmProvider === 'OMNIROUTE' ? 'OMNIROUTE' : 'OLLAMA';
  const llmTarget = providerConfig(llmProvider);
  const llmProbe = await timed(async () => {
    const response = await fetch(`${llmTarget.baseUrl}/models`, {
      headers: llmTarget.apiKey ? { authorization: `Bearer ${llmTarget.apiKey}` } : {},
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  }, 3500);

  const health = {
    db: { ok: dbProbe.ok, latencyMs: dbProbe.latencyMs, ...(dbProbe.ok ? {} : { error: dbProbe.error }) },
    redis: { ok: redisProbe.ok, latencyMs: redisProbe.latencyMs, ...(redisProbe.ok ? {} : { error: redisProbe.error }) },
    llm: {
      ok: llmProbe.ok,
      latencyMs: llmProbe.latencyMs,
      provider: llmProvider,
      model: llmTarget.model || null,
      url: llmTarget.baseUrl,
      ...(llmProbe.ok ? {} : { error: llmProbe.error }),
    },
    checkedAt: new Date().toISOString(),
  };

  res.json({
    organization: org,
    metrics: {
      members: members.length,
      projects,
      agents,
      documents: docs,
      pendingApprovals: approvals,
      runs14d: runs.length,
      completed14d: runs.filter(r=>r.status==='COMPLETED').length,
      failed14d: runs.filter(r=>r.status==='FAILED').length,
      tokens14d: runs.reduce((n,r)=>n+(r.tokenUsage||0),0),
      avgLatencyMs: Math.round(runs.filter(r=>r.latencyMs).reduce((n,r)=>n+(r.latencyMs||0),0) / Math.max(1,runs.filter(r=>r.latencyMs).length)),
      activeSessions, apiKeys, openTickets: tickets, verifiedMembers,
    },
    series,
    topAgents: [...topAgentMap.values()].sort((a,b)=>b.runs-a.runs).slice(0,8),
    providerSplit,
    statusSplit,
    registrations: { daily: registrations, beforeWindow },
    topTools,
    health,
    generatedAt: new Date().toISOString(),
    recentRuns: runs.slice(0,12),
    members,
    auditLogs,
  });
});

adminRouter.get('/runs', async (req, res) => {
  const u = await admin(req as AuthenticatedRequest);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100,1),250);
  const runs = await prisma.agentRun.findMany({ where: { organizationId: u.organizationId }, include: { agent: { select: { name: true } }, project: { select: { name: true } }, approvals: true, steps: { orderBy: { stepIndex: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: limit });
  res.json(runs);
});

adminRouter.get('/audit', async (req, res) => {
  const u = await admin(req as AuthenticatedRequest);
  const limit = Math.min(Math.max(Number(req.query.limit) || 200,1),500);
  res.json(await prisma.auditLog.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: 'desc' }, take: limit }));
});

adminRouter.patch('/members/:id/role', async (req, res) => {
  const u = await admin(req as AuthenticatedRequest);
  const membership = await prisma.membership.findFirst({ where: { id: req.params.id, organizationId: u.organizationId }, include: { user: true } });
  if (!membership) return res.status(404).json({ error:'NotFound', message:'Member not found' });
  const role = String(req.body?.role || '');
  if (!['OWNER','ADMIN','AGENT','VIEWER'].includes(role)) return res.status(400).json({ error:'ValidationError', message:'Invalid role' });
  if (membership.userId === u.id && role !== 'OWNER') return res.status(400).json({ error:'ValidationError', message:'You cannot demote your own account' });
  if (u.role !== 'OWNER' && role === 'OWNER') return res.status(403).json({ error:'Forbidden', message:'Only an owner can grant owner role' });
  if (membership.role === 'OWNER' && role !== 'OWNER') {
    const owners = await prisma.membership.count({ where: { organizationId: u.organizationId, role: 'OWNER' } });
    if (owners <= 1) return res.status(400).json({ error:'ValidationError', message:'Workspace must retain an owner' });
  }
  const updated = await prisma.membership.update({ where: { id: membership.id }, data: { role: role as any }, include: { user: { select: { id:true,name:true,email:true } } } });
  await prisma.session.updateMany({ where: { userId: membership.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(u,'admin.member_role_changed','membership',membership.id,{targetUserId:membership.userId,role});
  res.json(updated);
});


adminRouter.post('/members/:id/revoke-sessions', async (req,res,next)=>{
  try {
    const u=await admin(req as AuthenticatedRequest);
    const membership=await prisma.membership.findFirst({where:{id:req.params.id,organizationId:u.organizationId}});
    if(!membership)return res.status(404).json({error:'NotFound',message:'Member not found'});
    await prisma.session.updateMany({where:{userId:membership.userId,revokedAt:null},data:{revokedAt:new Date()}});
    await audit(u,'admin.sessions_revoked','user',membership.userId);
    res.status(204).send();
  } catch(e){next(e);} });
