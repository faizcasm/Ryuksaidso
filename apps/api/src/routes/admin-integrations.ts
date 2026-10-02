import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { audit, type AuthUser } from '../lib/auth';
import { getIntegrationSetting, getProvider, INTEGRATION_PROVIDERS } from '@ryuksaidso/agent-tools';
import { integrationSettingsSchema } from '../validation';

export const adminIntegrationsRouter = Router();
adminIntegrationsRouter.use(requireAuth);

async function systemAdmin(req: AuthenticatedRequest): Promise<AuthUser> {
  const u = req.user;
  if (!u) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const system = await prisma.user.findUnique({ where: { id: u.id }, select: { userRole: true } });
  if (system?.userRole !== 'ADMIN') throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
  return { ...u, userRole: 'ADMIN' };
}

async function organizationNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const orgs = await prisma.organization.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(orgs.map((org: any) => [org.id, org.name]));
}

adminIntegrationsRouter.get('/overview', async (req, res, next) => {
  try {
    await systemAdmin(req as AuthenticatedRequest);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [setting, connections, sources, endpoints, deliveries, recentErrors] = await Promise.all([
      getIntegrationSetting(prisma),
      prisma.integrationConnection.findMany({ select: { provider: true, status: true, organizationId: true } }),
      prisma.knowledgeSource.findMany({ select: { provider: true, status: true, organizationId: true } }),
      prisma.webhookEndpoint.count(),
      prisma.webhookDelivery.findMany({
        where: { createdAt: { gte: since } },
        select: { status: true },
      }),
      prisma.integrationLog.findMany({
        where: { level: 'error' },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);
    const orgNames = await organizationNames(recentErrors.map((row: any) => row.organizationId));
    const byStatus: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    for (const row of connections) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      byProvider[row.provider] = (byProvider[row.provider] ?? 0) + 1;
    }
    const sourcesByStatus: Record<string, number> = {};
    for (const row of sources) sourcesByStatus[row.status] = (sourcesByStatus[row.status] ?? 0) + 1;
    const delivery24h: Record<string, number> = { SUCCESS: 0, FAILED: 0, PENDING: 0 };
    for (const row of deliveries) delivery24h[row.status] = (delivery24h[row.status] ?? 0) + 1;
    res.json({
      settings: { enabled: setting.enabled, disabledProviders: setting.disabledProviders },
      connections: { total: connections.length, byStatus, byProvider },
      sources: { total: sources.length, byStatus: sourcesByStatus },
      webhooks: { endpoints, delivery24h },
      recentErrors: recentErrors.map((row: any) => ({
        id: row.id,
        organizationId: row.organizationId,
        organizationName: orgNames.get(row.organizationId) ?? row.organizationId,
        provider: row.provider,
        event: row.event,
        message: row.message,
        createdAt: row.createdAt,
      })),
      catalog: { providers: INTEGRATION_PROVIDERS.length },
    });
  } catch (error) {
    next(error);
  }
});

adminIntegrationsRouter.get('/settings', async (req, res, next) => {
  try {
    await systemAdmin(req as AuthenticatedRequest);
    const setting = await getIntegrationSetting(prisma);
    const row = await prisma.integrationSetting.findUnique({ where: { id: 'global' } });
    res.json({ ...setting, updatedBy: row?.updatedBy ?? '', updatedAt: row?.updatedAt ?? null });
  } catch (error) {
    next(error);
  }
});

adminIntegrationsRouter.put('/settings', async (req, res, next) => {
  try {
    const u = await systemAdmin(req as AuthenticatedRequest);
    const body = integrationSettingsSchema.parse(req.body);
    const unknown = (body.disabledProviders ?? []).filter((key) => !getProvider(key));
    if (unknown.length) return res.status(400).json({ error: 'BadRequest', message: `Unknown providers: ${unknown.join(', ')}` });
    const existing = await prisma.integrationSetting.findUnique({ where: { id: 'global' } });
    const data = {
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.disabledProviders !== undefined ? { disabledProviders: body.disabledProviders } : {}),
      updatedBy: u.id,
    };
    const updated = existing
      ? await prisma.integrationSetting.update({ where: { id: 'global' }, data })
      : await prisma.integrationSetting.create({ data: { id: 'global', enabled: true, disabledProviders: [], ...data } });
    await audit(u, 'admin.integration_settings_updated', 'integration_setting', 'global', {
      enabled: updated.enabled,
      disabledProviders: updated.disabledProviders,
    });
    res.json({ enabled: updated.enabled, disabledProviders: updated.disabledProviders, updatedBy: updated.updatedBy, updatedAt: updated.updatedAt });
  } catch (error) {
    next(error);
  }
});

adminIntegrationsRouter.get('/logs', async (req, res, next) => {
  try {
    await systemAdmin(req as AuthenticatedRequest);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
    const level = String(req.query.level ?? '').trim();
    const logs = await prisma.integrationLog.findMany({
      where: level ? { level } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const orgNames = await organizationNames(logs.map((row: any) => row.organizationId));
    res.json({
      logs: logs.map((row: any) => ({
        id: row.id,
        organizationId: row.organizationId,
        organizationName: orgNames.get(row.organizationId) ?? row.organizationId,
        provider: row.provider,
        level: row.level,
        event: row.event,
        message: row.message,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});
