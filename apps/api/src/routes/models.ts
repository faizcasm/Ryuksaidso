import { Router, type Request } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { audit, type AuthUser } from '../lib/auth';
import { assertModelBaseUrl, InvalidModelUrlError } from '../services/llm';
import {
  encryptModelKey,
  loadCustomProvider,
  probeProvider,
  providerSummary,
  recordProbe,
} from '../services/modelProviders';
import { modelProviderCreateSchema, modelProviderDiscoverSchema, modelProviderUpdateSchema } from '../validation';

export const modelsRouter = Router();

function user(req: AuthenticatedRequest): AuthUser {
  if (!req.user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return req.user;
}

function requireRole(u: AuthUser, roles: string[]) {
  if (!roles.includes(u.role)) throw Object.assign(new Error('Insufficient permissions'), { statusCode: 403 });
}

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

modelsRouter.use((_req, _res, next) => requireAuth(_req as Request, _res, next));

async function assertNameAvailable(organizationId: string, name: string, excludeId?: string) {
  const existing = await prisma.modelProvider.findFirst({ where: { organizationId, name } });
  if (existing && existing.id !== excludeId) badRequest('A provider with this name already exists in this workspace.');
}

function safeBaseUrl(raw: string): string {
  try {
    return assertModelBaseUrl(raw);
  } catch (error) {
    if (error instanceof InvalidModelUrlError) badRequest(error.message);
    throw error;
  }
}

modelsRouter.get('/providers', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const [rows, organization] = await Promise.all([
      prisma.modelProvider.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: 'asc' } }),
      prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider: true } }),
    ]);
    res.json({
      current: organization?.llmProvider || 'OMNIROUTE',
      providers: rows.map(row => providerSummary(row, organization?.llmProvider)),
    });
  } catch (error) {
    next(error);
  }
});

modelsRouter.post('/providers', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const body = modelProviderCreateSchema.parse(req.body);
    await assertNameAvailable(u.organizationId, body.name);
    const baseUrl = safeBaseUrl(body.baseUrl);
    const row = await prisma.modelProvider.create({
      data: {
        organizationId: u.organizationId,
        name: body.name,
        kind: body.kind,
        baseUrl,
        apiKey: encryptModelKey(body.apiKey ?? ''),
        defaultModel: body.defaultModel,
        models: JSON.stringify(body.models),
        enabled: body.enabled,
        connectedBy: u.id,
      },
    });
    await audit(u, 'model_provider.created', 'model_provider', row.id, { name: row.name, kind: row.kind, baseUrl: row.baseUrl });
    res.status(201).json(providerSummary(row));
  } catch (error) {
    next(error);
  }
});

modelsRouter.put('/providers/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const row = await loadCustomProvider(u.organizationId, req.params.id ?? '', true);
    if (!row) return res.status(404).json({ error: 'NotFound', message: 'Model provider not found' });
    const body = modelProviderUpdateSchema.parse(req.body);
    if (body.name !== undefined) await assertNameAvailable(u.organizationId, body.name, row.id);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.kind !== undefined) data.kind = body.kind;
    if (body.baseUrl !== undefined) data.baseUrl = safeBaseUrl(body.baseUrl);
    if (body.apiKey !== undefined) data.apiKey = encryptModelKey(body.apiKey);
    if (body.defaultModel !== undefined) data.defaultModel = body.defaultModel;
    if (body.models !== undefined) data.models = JSON.stringify(body.models);
    if (body.enabled !== undefined) data.enabled = body.enabled;
    const updated = await prisma.modelProvider.update({ where: { id: row.id }, data });
    await audit(u, 'model_provider.updated', 'model_provider', row.id, { fields: Object.keys(data) });
    const organization = await prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider: true } });
    res.json(providerSummary(updated, organization?.llmProvider));
  } catch (error) {
    next(error);
  }
});

modelsRouter.delete('/providers/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const row = await loadCustomProvider(u.organizationId, req.params.id ?? '', true);
    if (!row) return res.status(404).json({ error: 'NotFound', message: 'Model provider not found' });
    await prisma.modelProvider.delete({ where: { id: row.id } });
    const organization = await prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider: true } });
    let reverted = false;
    if (organization?.llmProvider === row.id) {
      await prisma.organization.update({ where: { id: u.organizationId }, data: { llmProvider: 'OMNIROUTE' } });
      reverted = true;
    }
    await audit(u, 'model_provider.deleted', 'model_provider', row.id, { name: row.name, reverted });
    res.json({ deleted: true, reverted });
  } catch (error) {
    next(error);
  }
});

modelsRouter.post('/providers/:id/test', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const row = await loadCustomProvider(u.organizationId, req.params.id ?? '', true);
    if (!row) return res.status(404).json({ error: 'NotFound', message: 'Model provider not found' });
    const chat = Boolean(req.body?.chat);
    const result = await probeProvider(row, { chat });
    await recordProbe(row, result);
    const organization = await prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider: true } });
    const updated = await prisma.modelProvider.findUnique({ where: { id: row.id } });
    res.json({
      ok: result.ok,
      latencyMs: result.latencyMs,
      models: result.models,
      error: result.error ?? null,
      chat: result.chat ?? null,
      provider: updated ? providerSummary(updated, organization?.llmProvider) : null,
    });
  } catch (error) {
    next(error);
  }
});

modelsRouter.post('/discover', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const body = modelProviderDiscoverSchema.parse(req.body);
    const baseUrl = safeBaseUrl(body.baseUrl);
    const probe = await probeProvider({
      id: 'discover',
      name: 'discover',
      kind: body.kind,
      baseUrl,
      apiKey: encryptModelKey(body.apiKey ?? ''),
      defaultModel: '',
    });
    if (!probe.ok) return res.status(503).json({ error: 'Unavailable', message: probe.error ?? 'Model endpoint is unreachable', latencyMs: probe.latencyMs });
    res.json({ models: probe.models, latencyMs: probe.latencyMs });
  } catch (error) {
    next(error);
  }
});
