import { Router } from 'express';
import { audit, resolveSystemRole, type AuthUser } from '../lib/auth';
import { prisma } from '../lib/db';
import type { Prisma } from '@prisma/client';
import { enqueueRun } from '../services/queue';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { createDocumentSchema, createTicketSchema, updateAgentSchema } from '../validation';
import { tools } from '../services/tools';
import { loadMcpTools, mcpConfigured } from '@ryuksaidso/agent-tools';

export const appRouter = Router();
appRouter.use(requireAuth);

function user(req: AuthenticatedRequest): AuthUser { if (!req.user) throw new Error('Authenticated user missing'); return req.user; }
function requireRole(u: AuthUser, roles: string[]) { if (!roles.includes(u.role)) { const error=Object.assign(new Error('Insufficient permissions'),{statusCode:403}); throw error; } }

appRouter.get('/me', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const userRole = await resolveSystemRole(u);
  res.json({ user: { ...u, userRole } });
});

appRouter.get('/tickets', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const tickets = await prisma.ticket.findMany({ where: { organizationId: u.organizationId }, include: { messages: { orderBy: { createdAt: 'asc' } } }, orderBy: { updatedAt: 'desc' } });
  res.json(tickets);
});

appRouter.post('/tickets', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  requireRole(u, ['OWNER','ADMIN','AGENT']);
  const body = createTicketSchema.parse(req.body);
  const ticket = await prisma.ticket.create({
    data: {
      organizationId: u.organizationId,
      title: body.title,
      description: body.description,
      requesterEmail: body.requesterEmail,
      messages: { create: { role: 'user', content: body.description, metadata: {} } }
    }
  });
  await audit(u, 'ticket.created', 'ticket', ticket.id);
  res.status(201).json(ticket);
});

appRouter.post('/tickets/:id/run', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  requireRole(u, ['OWNER','ADMIN','AGENT']);
  const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
  if (!ticket) {
    res.status(404).json({ error: 'NotFound', message: 'Ticket not found' });
    return;
  }
  const [agent, organization] = await Promise.all([
    prisma.agent.findFirst({ where: { organizationId: u.organizationId, slug: 'resolution', enabled: true }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } }),
    prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider: true, ollamaModel: true, omnirouteModel: true } })
  ]);
  if (!agent) return res.status(409).json({ error: 'Conflict', message: 'Resolution agent is not configured' });
  const provider = organization?.llmProvider === 'OMNIROUTE' ? 'OMNIROUTE' as const : 'OLLAMA' as const;
  const envModel = provider === 'OMNIROUTE' ? process.env.OMNIROUTE_MODEL : process.env.OLLAMA_MODEL;
  const model = (provider === 'OMNIROUTE' ? organization?.omnirouteModel : organization?.ollamaModel) || envModel || '';
  if (!model) {
    return res.status(409).json({ error: 'ProviderNotConfigured', message: `${provider} has no model configured for this workspace. Configure it in Settings before running an agent.` });
  }
  const run = await prisma.agentRun.create({ data: { organizationId: u.organizationId, projectId: agent.projectId, ticketId: ticket.id, agentId: agent.id, agentVersionId: agent.versions[0]?.id, provider, status: 'QUEUED', trigger: 'ticket', environment: 'production', input: { prompt: `${ticket.title}

${ticket.description}`, ticketId: ticket.id } } });
  const job = await enqueueRun(run.id, u.organizationId, u);
  await audit(u, 'agent.run.queued', 'ticket', ticket.id, { jobId: job.id, runId: run.id });
  res.status(202).json({ jobId: job.id, runId: run.id });
});

appRouter.get('/runs', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const runs = await prisma.agentRun.findMany({ where: { organizationId: u.organizationId }, include: { steps: true, ticket: true }, orderBy: { createdAt: 'desc' }, take: 30 });
  res.json(runs);
});

appRouter.get('/documents', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const documents = await prisma.document.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: 'desc' } });
  res.json(documents);
});

appRouter.post('/documents', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  requireRole(u, ['OWNER','ADMIN','AGENT']);
  const body = createDocumentSchema.parse(req.body);
  if (body.agentId && !(await prisma.agent.findFirst({ where: { id: body.agentId, organizationId: u.organizationId } }))) {
    return res.status(404).json({ error:'NotFound', message:'Agent not found' });
  }
  const document = await prisma.document.create({ data: { organizationId: u.organizationId, title: body.title, source: body.source, content: body.content, agentId: body.agentId ?? null, metadata: body.metadata as Prisma.InputJsonValue } });
  res.status(201).json(document);
});


appRouter.get('/agents', async (req,res)=>{ const u=user(req as AuthenticatedRequest); res.json(await prisma.agent.findMany({where:{organizationId:u.organizationId},orderBy:{name:'asc'}})); });
appRouter.patch('/agents/:id', async (req,res,next)=>{ try { const u=user(req as AuthenticatedRequest); requireRole(u,['OWNER','ADMIN']); const body=updateAgentSchema.parse(req.body); if(body.projectId){ const project=await prisma.project.findFirst({where:{id:body.projectId,organizationId:u.organizationId}}); if(!project) return res.status(404).json({error:'NotFound',message:'Project not found'}); } const agent=await prisma.agent.findFirst({where:{id:req.params.id,organizationId:u.organizationId}}); if(!agent) return res.status(404).json({error:'NotFound',message:'Agent not found'}); const updated=await prisma.agent.update({where:{id:agent.id},data:body}); await audit(u,'agent.updated','agent',agent.id,body); res.json(updated); } catch(e){ next(e); } });
appRouter.get('/tools', async (req,res)=>{
  const u = user(req as AuthenticatedRequest);
  const memberAdmin = ['OWNER','ADMIN'].includes(String(u.role ?? ''));
  const mcp = mcpConfigured() ? await loadMcpTools().catch(() => ({}) as Record<string, never>) : {};
  const all = { ...tools, ...mcp };
  res.json(Object.values(all).filter(tool => memberAdmin || !tool.adminOnly).map(({execute,...meta})=>meta));
});
