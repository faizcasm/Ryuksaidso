import { Router } from 'express';
import { prisma } from '../lib/db';
import { getResilientProvider } from '../services/llm';
import { config } from '../lib/config';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { evaluationSchema } from '../validation';

export const evaluationRouter = Router();
evaluationRouter.use(requireAuth);

evaluationRouter.get('/evaluations', async (req, res) => {
  const u = (req as AuthenticatedRequest).user!;
  res.json(await prisma.evaluation.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: 'desc' } }));
});

evaluationRouter.post('/evaluations', async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    if (!['OWNER','ADMIN','AGENT'].includes(u.role)) return res.status(403).json({error:'Forbidden',message:'Insufficient permissions'});
    const body = evaluationSchema.parse(req.body);
    const agent = body.agentId ? await prisma.agent.findFirst({ where: { id: body.agentId, organizationId: u.organizationId }, include: { project: true } }) : null;
    if (body.agentId && !agent) return res.status(404).json({ error:'NotFound', message:'Evaluation agent not found' });
    if (body.projectId && !(await prisma.project.findFirst({ where: { id: body.projectId, organizationId: u.organizationId } }))) return res.status(404).json({ error:'NotFound', message:'Evaluation project not found' });
    const organization = await prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider: true, ollamaModel: true, omnirouteModel: true } });
    const llm = getResilientProvider(['OMNIROUTE', 'OLLAMA'], p =>
      p === 'OMNIROUTE'
        ? (organization?.omnirouteModel || config.OMNIROUTE_MODEL || 'auto')
        : (organization?.ollamaModel || undefined));
    const labelSet = [...new Set(body.dataset.map(x => x.expectedIntent))];
    const persona = (typeof agent?.systemPrompt === 'string' && agent.systemPrompt.trim()) ? agent.systemPrompt : (agent?.instructions ?? 'Classify the request accurately.');
    const results = [] as Array<{id:string|null;expected:string;predicted:string|null;passed:boolean;error?:string}>;
    for (const item of body.dataset) {
      try {
        const response = await llm.chat([
          { role:'system', content:`You are an evaluation harness for this agent: ${persona}\nClassify the user input into exactly ONE of these labels: ${labelSet.join(', ')}.\nReturn JSON only: {"intent":"<one of the labels>"}.` },
          { role:'user', content:item.input }
        ], true);
        const cleaned = response.content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
        const parsed = JSON.parse(cleaned) as {intent?:string};
        const predicted = parsed.intent?.trim() || null;
        const passed = !!predicted && predicted.toLowerCase() === item.expectedIntent.trim().toLowerCase();
        results.push({ id:item.id ?? null, expected:item.expectedIntent, predicted, passed });
      } catch (error) {
        results.push({ id:item.id ?? null, expected:item.expectedIntent, predicted:null, passed:false, error:error instanceof Error?error.message:String(error) });
      }
    }
    const score = results.length ? results.filter(x=>x.passed).length/results.length : 0;
    const evaluation = await prisma.evaluation.create({ data:{ organizationId:u.organizationId, projectId:body.projectId ?? agent?.projectId, agentId:body.agentId, name:body.name ?? 'Agent Regression', dataset:body.dataset, results:{score,results,provider:llm.lastProvider ?? null} } });
    res.status(201).json(evaluation);
  } catch (error) { next(error); }
});
