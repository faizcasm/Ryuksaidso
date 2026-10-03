import { Router, type Request } from 'express';
import { prisma } from '../lib/db';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
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
import { isEmailConfigured, sendPromoCodeEmail } from '../services/email';
import { PROMO_CODE, PROMO_DISCOUNT_PERCENT, promoQualification } from '../services/promo';
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

type UsageProvider = {
  id: string;
  name: string;
  kind: 'custom' | 'platform';
  model: string;
  enabled: boolean;
  status: string;
  lastError: string | null;
  lastCheckedAt: Date | null;
  runs: number;
  completed: number;
  failed: number;
  tokens: number;
  lastUsedAt: Date | null;
};

type ProviderStats = { runs: number; completed: number; failed: number; tokens: number; lastUsedAt: Date | null };

modelsRouter.get('/usage', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const since14 = new Date(Date.now() - 14 * 86_400_000);
    const [providerRows, organization, runGroups, modelGroups, recentRuns] = await Promise.all([
      prisma.modelProvider.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: 'asc' } }),
      prisma.organization.findUnique({
        where: { id: u.organizationId },
        select: { llmProvider: true, ollamaModel: true, omnirouteModel: true, promoCodeSentAt: true },
      }),
      prisma.agentRun.groupBy({
        by: ['provider', 'status'],
        where: { organizationId: u.organizationId, createdAt: { gte: since30 } },
        _count: { _all: true },
        _sum: { tokenUsage: true },
        _max: { createdAt: true },
      }),
      prisma.agentRun.groupBy({
        by: ['provider', 'model'],
        where: { organizationId: u.organizationId, createdAt: { gte: since30 } },
        _count: { _all: true },
        _sum: { tokenUsage: true },
        _max: { createdAt: true },
      }),
      prisma.agentRun.findMany({
        where: { organizationId: u.organizationId, createdAt: { gte: since14 } },
        select: { createdAt: true, tokenUsage: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const statsByProvider = new Map<string, ProviderStats>();
    for (const group of runGroups) {
      const entry = statsByProvider.get(group.provider) ?? { runs: 0, completed: 0, failed: 0, tokens: 0, lastUsedAt: null };
      const count = group._count._all;
      entry.runs += count;
      if (group.status === 'COMPLETED') entry.completed += count;
      if (group.status === 'FAILED') entry.failed += count;
      entry.tokens += Number(group._sum.tokenUsage ?? 0);
      const touched = group._max.createdAt;
      if (touched && (!entry.lastUsedAt || touched > entry.lastUsedAt)) entry.lastUsedAt = touched;
      statsByProvider.set(group.provider, entry);
    }

    const emptyStats = (): ProviderStats => ({ runs: 0, completed: 0, failed: 0, tokens: 0, lastUsedAt: null });
    const customNames = new Map(providerRows.map((row) => [row.id, row.name]));
    const nameFor = (id: string) => customNames.get(id) ?? id;

    const providers: UsageProvider[] = providerRows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: 'custom',
      model: row.defaultModel,
      enabled: row.enabled,
      status: row.status,
      lastError: row.lastError || null,
      lastCheckedAt: row.lastCheckedAt,
      ...(statsByProvider.get(row.id) ?? emptyStats()),
    }));
    const pushPlatform = (id: string, model: string) => {
      const isCurrent = organization?.llmProvider === id;
      const stats = statsByProvider.get(id);
      if (!stats && !isCurrent) return;
      providers.push({
        id,
        name: id,
        kind: 'platform',
        model,
        enabled: true,
        status: isCurrent ? 'CURRENT' : 'AVAILABLE',
        lastError: null,
        lastCheckedAt: null,
        ...(stats ?? emptyStats()),
      });
    };
    pushPlatform('OMNIROUTE', organization?.omnirouteModel || '');
    pushPlatform('OLLAMA', organization?.ollamaModel || '');

    const models = modelGroups
      .map((group) => ({
        provider: group.provider,
        providerName: nameFor(group.provider),
        model: group.model || 'default',
        runs: group._count._all,
        tokens: Number(group._sum.tokenUsage ?? 0),
        lastUsedAt: group._max.createdAt,
      }))
      .sort((a, b) => b.runs - a.runs || b.tokens - a.tokens);

    const series: Array<{ date: string; runs: number; tokens: number }> = [];
    const bucketIndex = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      bucketIndex.set(key, series.length);
      series.push({ date: key, runs: 0, tokens: 0 });
    }
    for (const run of recentRuns) {
      const index = bucketIndex.get(run.createdAt.toISOString().slice(0, 10));
      if (index === undefined) continue;
      series[index].runs += 1;
      series[index].tokens += Number(run.tokenUsage || 0);
    }

    const qualification = await promoQualification(u.organizationId);
    const promo = {
      ...qualification,
      discountPercent: PROMO_DISCOUNT_PERCENT,
      code: qualification.eligible ? PROMO_CODE : null,
      sentAt: (organization?.promoCodeSentAt ?? null) as Date | null,
      emailSent: false,
    };
    if (qualification.eligible && !organization?.promoCodeSentAt && isEmailConfigured()) {
      try {
        const owners = await prisma.membership.findMany({
          where: { organizationId: u.organizationId, role: 'OWNER' },
          select: { user: { select: { email: true } } },
          take: 5,
        });
        const recipients = [...new Set([u.email, ...owners.map((row) => row.user.email)])].slice(0, 5);
        const billingUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/settings?billing=checkout`;
        for (const recipient of recipients) await sendPromoCodeEmail(recipient, PROMO_CODE, billingUrl);
        const sentAt = new Date();
        await prisma.organization.update({ where: { id: u.organizationId }, data: { promoCodeSentAt: sentAt } });
        promo.sentAt = sentAt;
        promo.emailSent = true;
      } catch (error) {
        logger.warn('Could not deliver the promo code email', {
          organizationId: u.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.json({
      providers,
      models,
      series,
      totals: {
        runs30d: [...statsByProvider.values()].reduce((sum, stats) => sum + stats.runs, 0),
        tokens30d: [...statsByProvider.values()].reduce((sum, stats) => sum + stats.tokens, 0),
        models30d: models.length,
        customProviders: providerRows.length,
      },
      promo,
    });
  } catch (error) {
    next(error);
  }
});
