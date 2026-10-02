import { Router, type Request } from 'express';
import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/db';
import { redis } from '../lib/redis';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { audit, type AuthUser } from '../lib/auth';
import { config } from '../lib/config';
import {
  INTEGRATION_PROVIDERS,
  WEBHOOK_EVENTS,
  getProvider,
  providerConfigured,
  providerConfigHint,
  authorizeUrlFor,
  exchangeAuthorizationCode,
  fetchProfile,
  saveTokens,
  findConnection,
  assertProviderUsable,
  getIntegrationSetting,
  connectionSummary,
  testConnection,
  tokenFieldsFromInput,
  recordIntegrationLog,
  syncKnowledgeSource,
  emitWebhookEvent,
  webhookEventCatalog,
  retryDelivery,
  assertPublicHttpUrl,
  randomWidgetKey,
} from '@ryuksaidso/agent-tools';
import {
  connectTokenSchema,
  knowledgeSourceCreateSchema,
  knowledgeSourceUpdateSchema,
  webhookEndpointCreateSchema,
  webhookEndpointUpdateSchema,
  widgetSettingsSchema,
} from '../validation';

export const integrationsRouter = Router();

function user(req: AuthenticatedRequest): AuthUser {
  if (!req.user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return req.user;
}

function requireRole(u: AuthUser, roles: string[]) {
  if (!roles.includes(u.role)) throw Object.assign(new Error('Insufficient permissions'), { statusCode: 403 });
}

function apiBase(req: Request): string {
  if (config.API_PUBLIC_URL) return config.API_PUBLIC_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}

const CALLBACK_PATTERN = /^\/[a-z][a-z0-9_]*\/callback$/;

integrationsRouter.use((req, res, next) => {
  if (CALLBACK_PATTERN.test(req.path)) return next();
  return requireAuth(req as Request, res, next);
});

const SHOP_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

integrationsRouter.get('/catalog', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const setting = await getIntegrationSetting(prisma);
    const connections = await prisma.integrationConnection.findMany({
      where: { organizationId: u.organizationId },
      select: { provider: true, status: true },
    });
    const byProvider = new Map(connections.map((row: any) => [row.provider, row]));
    res.json({
      enabled: setting.enabled,
      disabledProviders: setting.disabledProviders,
      providers: INTEGRATION_PROVIDERS.map((provider) => {
        const connection = byProvider.get(provider.key) ?? null;
        return {
          key: provider.key,
          name: provider.name,
          category: provider.category,
          authType: provider.authType,
          blurb: provider.blurb,
          website: provider.website,
          color: provider.color,
          icon: provider.icon,
          knowledge: Boolean(provider.knowledge),
          tools: provider.tools,
          webhookEvents: provider.webhookEvents ?? [],
          envKeys: provider.envKeys,
          configured: providerConfigured(provider),
          setupHint: providerConfigHint(provider),
          redirectUri: provider.authType === 'oauth2' ? `${apiBase(req)}/api/integrations/${provider.key}/callback` : null,
          tokenFields: (provider.tokenFields ?? []).map((field) => ({ key: field.key, label: field.label, placeholder: field.placeholder ?? '', secret: Boolean(field.secret) })),
          disabled: !setting.enabled || setting.disabledProviders.includes(provider.key),
          connected: Boolean(connection),
          status: connection ? String(connection.status) : null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get('/connections', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const rows = await prisma.integrationConnection.findMany({
      where: { organizationId: u.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ connections: rows.map(connectionSummary) });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/connections/:provider/connect', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const provider = getProvider(req.params.provider ?? '');
    if (!provider) return res.status(404).json({ error: 'NotFound', message: 'Integration provider not found' });
    try {
      await assertProviderUsable(prisma, provider.key);
    } catch (error) {
      return res.status(403).json({ error: 'Forbidden', message: error instanceof Error ? error.message : 'Integration unavailable' });
    }
    if (provider.authType !== 'oauth2') {
      return res.status(400).json({ error: 'BadRequest', message: 'This provider does not use OAuth connect' });
    }
    if (!providerConfigured(provider)) {
      return res.status(503).json({ error: 'Unavailable', message: providerConfigHint(provider) || 'OAuth is not configured for this provider' });
    }
    let shop: string | undefined;
    if (provider.oauth?.templated) {
      shop = String(req.body?.shop ?? '').trim().toLowerCase();
      if (!SHOP_PATTERN.test(shop)) {
        return res.status(400).json({ error: 'BadRequest', message: 'Enter your store domain, for example acme.myshopify.com' });
      }
    }
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    await redis.set(
      `int:state:${state}`,
      JSON.stringify({ organizationId: u.organizationId, userId: u.id, provider: provider.key, verifier, shop: shop ?? '' }),
      'EX',
      600,
    );
    const redirectUri = `${apiBase(req)}/api/integrations/${provider.key}/callback`;
    const url = authorizeUrlFor(provider, { redirectUri, state, shop });
    res.json({ url, redirectUri, expiresIn: 600 });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get('/:provider/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${config.FRONTEND_URL}/dashboard?connect_error=${encodeURIComponent(reason)}`);
  try {
    const provider = getProvider(req.params.provider ?? '');
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!provider || !code || !state) return fail('invalid_callback');
    const stored = await redis.get(`int:state:${state}`);
    await redis.del(`int:state:${state}`);
    if (!stored) return fail('state_expired');
    const payload = JSON.parse(stored) as { organizationId: string; userId: string; provider: string; verifier: string; shop?: string };
    if (payload.provider !== provider.key) return fail('provider_mismatch');
    const redirectUri = `${apiBase(req)}/api/integrations/${provider.key}/callback`;
    const tokens = await exchangeAuthorizationCode(provider, { code, redirectUri, verifier: payload.verifier, shop: payload.shop || undefined });
    const profile = await fetchProfile(provider, tokens);
    const encryptedTokens = saveTokens(tokens);
    const name =
      provider.key === 'shopify' && payload.shop ? payload.shop : provider.key === 'slack' ? String((profile as any)?.name || provider.name) : provider.name;
    const existing = await findConnection(prisma, payload.organizationId, provider.key);
    const data = {
      name: name || provider.name,
      status: 'CONNECTED' as const,
      authType: 'oauth2',
      encryptedTokens,
      profile: (profile ?? {}) as any,
      scopes: String(tokens.scope ?? '').split(/[\s,]+/).filter(Boolean),
      lastCheckedAt: new Date(),
      lastError: '',
      connectedBy: payload.userId,
    };
    const connection = existing
      ? await prisma.integrationConnection.update({ where: { id: existing.id }, data })
      : await prisma.integrationConnection.create({
          data: { organizationId: payload.organizationId, provider: provider.key, ...data },
        });
    await recordIntegrationLog(prisma, {
      organizationId: payload.organizationId,
      connectionId: connection.id,
      provider: provider.key,
      event: 'connected',
      message: `${provider.name} connected`,
      metadata: { name: connection.name },
    });
    void emitWebhookEvent(prisma, payload.organizationId, 'integration.connected', { provider: provider.key, name: connection.name }).catch(() => undefined);
    try {
      await audit(
        { id: payload.userId, email: '', name: '', organizationId: payload.organizationId, role: '' } as AuthUser,
        'integration.connected',
        'integration',
        connection.id,
        { provider: provider.key, name: connection.name },
      );
    } catch {
      return res.redirect(`${config.FRONTEND_URL}/dashboard?connected=${provider.key}`);
    }
    res.redirect(`${config.FRONTEND_URL}/dashboard?connected=${provider.key}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.redirect(`${config.FRONTEND_URL}/dashboard?connect_error=${encodeURIComponent(message.slice(0, 160))}`);
  }
});

integrationsRouter.post('/connections/token', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const body = connectTokenSchema.parse(req.body);
    const provider = getProvider(body.provider);
    if (!provider) return res.status(404).json({ error: 'NotFound', message: 'Integration provider not found' });
    if (provider.authType !== 'token') return res.status(400).json({ error: 'BadRequest', message: 'This provider uses OAuth connect' });
    try {
      await assertProviderUsable(prisma, provider.key);
    } catch (error) {
      return res.status(403).json({ error: 'Forbidden', message: error instanceof Error ? error.message : 'Integration unavailable' });
    }
    if (provider.key === 'teams') {
      const url = String(body.fields.webhookUrl ?? '');
      try {
        const parsed = assertPublicHttpUrl(url);
        if (parsed.protocol !== 'https:') throw new Error('Teams webhook URL must use https');
      } catch (error) {
        return res.status(400).json({ error: 'BadRequest', message: error instanceof Error ? error.message : 'Invalid webhook URL' });
      }
    }
    if (provider.key === 'whatsapp') {
      const token = String(body.fields.accessToken ?? '');
      const phoneId = String(body.fields.phoneNumberId ?? '');
      if (token.length < 20 || !/^\d{5,32}$/.test(phoneId)) {
        return res.status(400).json({ error: 'BadRequest', message: 'Enter a valid permanent access token and phone number ID' });
      }
    }
    const tokens = tokenFieldsFromInput(provider, body.fields);
    const existing = await findConnection(prisma, u.organizationId, provider.key);
    const summary = {
      name: provider.name,
      status: 'CONNECTED' as const,
      authType: 'token',
      encryptedTokens: saveTokens(tokens),
      profile: {} as any,
      scopes: [],
      lastCheckedAt: new Date(),
      lastError: '',
      connectedBy: u.id,
    };
    const connection = existing
      ? await prisma.integrationConnection.update({ where: { id: existing.id }, data: summary })
      : await prisma.integrationConnection.create({ data: { organizationId: u.organizationId, provider: provider.key, ...summary } });
    await recordIntegrationLog(prisma, {
      organizationId: u.organizationId,
      connectionId: connection.id,
      provider: provider.key,
      event: 'connected',
      message: `${provider.name} credentials saved`,
    });
    void emitWebhookEvent(prisma, u.organizationId, 'integration.connected', { provider: provider.key, name: provider.name }).catch(() => undefined);
    await audit(u, 'integration.connected', 'integration', connection.id, { provider: provider.key, mode: 'token' });
    res.status(201).json(connectionSummary(connection));
  } catch (error) {
    next(error);
  }
});

integrationsRouter.delete('/connections/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const connection = await prisma.integrationConnection.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!connection) return res.status(404).json({ error: 'NotFound', message: 'Connection not found' });
    await prisma.$transaction([
      prisma.knowledgeSource.deleteMany({ where: { connectionId: connection.id } }),
      prisma.integrationConnection.delete({ where: { id: connection.id } }),
    ]);
    await recordIntegrationLog(prisma, {
      organizationId: u.organizationId,
      provider: connection.provider,
      event: 'disconnected',
      message: `${connection.provider} disconnected`,
    });
    void emitWebhookEvent(prisma, u.organizationId, 'integration.disconnected', { provider: connection.provider, name: connection.name }).catch(() => undefined);
    await audit(u, 'integration.disconnected', 'integration', connection.id, { provider: connection.provider });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/connections/:id/test', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const connection = await prisma.integrationConnection.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!connection) return res.status(404).json({ error: 'NotFound', message: 'Connection not found' });
    const result = await testConnection(prisma, connection);
    const refreshed = await prisma.integrationConnection.findUnique({ where: { id: connection.id } });
    res.json({ ok: result.ok, detail: result.detail, status: String(refreshed?.status ?? 'ERROR') });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get('/sources', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const sources = await prisma.knowledgeSource.findMany({
      where: { organizationId: u.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ sources });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/sources', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const body = knowledgeSourceCreateSchema.parse(req.body);
    const provider = getProvider(body.provider);
    if (!provider) return res.status(404).json({ error: 'NotFound', message: 'Integration provider not found' });
    if (!provider.knowledge) return res.status(400).json({ error: 'BadRequest', message: `${provider.name} does not support knowledge sources` });
    let connection: any = null;
    if (body.connectionId) {
      connection = await prisma.integrationConnection.findFirst({
        where: { id: body.connectionId, organizationId: u.organizationId, provider: provider.key },
      });
      if (!connection) return res.status(404).json({ error: 'NotFound', message: 'Connection not found' });
      if (connection.status === 'DISCONNECTED') return res.status(409).json({ error: 'Conflict', message: 'Reconnect this integration before adding sources' });
    } else if (provider.key !== 'github') {
      return res.status(400).json({ error: 'BadRequest', message: `Connect ${provider.name} first, then add a knowledge source` });
    } else if (!process.env.GITHUB_TOKEN?.trim()) {
      return res.status(400).json({ error: 'BadRequest', message: 'Connect GitHub or set GITHUB_TOKEN to sync repositories' });
    }
    const source = await prisma.knowledgeSource.create({
      data: {
        organizationId: u.organizationId,
        connectionId: connection?.id ?? '',
        provider: provider.key,
        name: body.name,
        remotePath: body.remotePath,
        status: 'ACTIVE',
        autoSync: body.autoSync,
      },
    });
    await audit(u, 'knowledge_source.created', 'knowledge_source', source.id, { provider: provider.key });
    res.status(201).json(source);
  } catch (error) {
    next(error);
  }
});

integrationsRouter.patch('/sources/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const body = knowledgeSourceUpdateSchema.parse(req.body);
    const source = await prisma.knowledgeSource.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!source) return res.status(404).json({ error: 'NotFound', message: 'Source not found' });
    const updated = await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: { ...(body.name !== undefined ? { name: body.name } : {}), ...(body.remotePath !== undefined ? { remotePath: body.remotePath } : {}), ...(body.autoSync !== undefined ? { autoSync: body.autoSync } : {}), ...(body.status !== undefined ? { status: body.status } : {}) },
    });
    await audit(u, 'knowledge_source.updated', 'knowledge_source', source.id, body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

integrationsRouter.delete('/sources/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const source = await prisma.knowledgeSource.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!source) return res.status(404).json({ error: 'NotFound', message: 'Source not found' });
    await prisma.knowledgeSource.delete({ where: { id: source.id } });
    await audit(u, 'knowledge_source.deleted', 'knowledge_source', source.id, { provider: source.provider });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/sources/:id/sync', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const source = await prisma.knowledgeSource.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!source) return res.status(404).json({ error: 'NotFound', message: 'Source not found' });
    const result = await syncKnowledgeSource(prisma, source);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get('/webhooks', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const [endpoints, deliveries] = await Promise.all([
      prisma.webhookEndpoint.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: 'desc' } }),
      prisma.webhookDelivery.findMany({
        where: { organizationId: u.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { endpoint: { select: { name: true, url: true } } },
      }),
    ]);
    res.json({ endpoints, deliveries, events: webhookEventCatalog() });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/webhooks', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const body = webhookEndpointCreateSchema.parse(req.body);
    try {
      assertPublicHttpUrl(body.url);
    } catch (error) {
      return res.status(400).json({ error: 'BadRequest', message: error instanceof Error ? error.message : 'Invalid webhook URL' });
    }
    const unknown = body.events.filter((event) => !WEBHOOK_EVENTS.includes(event));
    if (unknown.length) return res.status(400).json({ error: 'BadRequest', message: `Unknown events: ${unknown.join(', ')}` });
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        organizationId: u.organizationId,
        name: body.name,
        url: body.url,
        secret: `whsec_${randomBytes(24).toString('base64url')}`,
        events: body.events,
        active: body.active,
      },
    });
    await audit(u, 'integration.webhook_created', 'webhook_endpoint', endpoint.id, { events: body.events });
    res.status(201).json(endpoint);
  } catch (error) {
    next(error);
  }
});

integrationsRouter.patch('/webhooks/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const body = webhookEndpointUpdateSchema.parse(req.body);
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!endpoint) return res.status(404).json({ error: 'NotFound', message: 'Webhook endpoint not found' });
    if (body.url) {
      try {
        assertPublicHttpUrl(body.url);
      } catch (error) {
        return res.status(400).json({ error: 'BadRequest', message: error instanceof Error ? error.message : 'Invalid webhook URL' });
      }
    }
    if (body.events) {
      const unknown = body.events.filter((event) => !WEBHOOK_EVENTS.includes(event));
      if (unknown.length) return res.status(400).json({ error: 'BadRequest', message: `Unknown events: ${unknown.join(', ')}` });
    }
    const updated = await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: body as any });
    await audit(u, 'integration.webhook_updated', 'webhook_endpoint', endpoint.id, Object.keys(body));
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

integrationsRouter.delete('/webhooks/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!endpoint) return res.status(404).json({ error: 'NotFound', message: 'Webhook endpoint not found' });
    await prisma.webhookEndpoint.delete({ where: { id: endpoint.id } });
    await audit(u, 'integration.webhook_deleted', 'webhook_endpoint', endpoint.id, { name: endpoint.name });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/webhooks/:id/test', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!endpoint) return res.status(404).json({ error: 'NotFound', message: 'Webhook endpoint not found' });
    const queued = await emitWebhookEvent(prisma, u.organizationId, 'webhook.test', { message: 'Ryuksaidso webhook test event', endpoint: endpoint.name });
    res.status(202).json({ queued });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/webhooks/deliveries/:id/retry', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const delivery = await prisma.webhookDelivery.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!delivery) return res.status(404).json({ error: 'NotFound', message: 'Delivery not found' });
    const result = await retryDelivery(prisma, delivery.id);
    const refreshed = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
    res.json({ ok: result.ok, status: String(refreshed?.status ?? ''), attempts: refreshed?.attempts ?? 0 });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get('/activity', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const provider = String(req.query.provider ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100);
    const logs = await prisma.integrationLog.findMany({
      where: { organizationId: u.organizationId, ...(provider ? { provider } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.get('/tool-activity', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 40) || 40, 1), 100);
    const steps = await prisma.agentStep.findMany({
      where: { action: { startsWith: 'Execute' }, run: { organizationId: u.organizationId } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { run: { select: { id: true, status: true, agentId: true, trigger: true, createdAt: true } } },
    });
    res.json({
      items: steps.map((step: any) => ({
        id: step.id,
        runId: step.runId,
        tool: String(step.action).replace(/^Execute\s+/, ''),
        action: step.action,
        status: step.status,
        durationMs: step.durationMs ?? null,
        error: step.error ?? null,
        createdAt: step.createdAt,
        runStatus: step.run.status,
        trigger: step.run.trigger,
        agentId: step.run.agentId,
      })),
    });
  } catch (error) {
    next(error);
  }
});

async function getOrCreateWidgetSetting(organizationId: string) {
  const existing = await prisma.widgetSetting.findUnique({ where: { organizationId } });
  if (existing) return existing;
  try {
    return await prisma.widgetSetting.create({ data: { organizationId, publicKey: randomWidgetKey() } });
  } catch {
    const recovered = await prisma.widgetSetting.findUnique({ where: { organizationId } });
    if (!recovered) throw Object.assign(new Error('Widget setting unavailable'), { statusCode: 500 });
    return recovered;
  }
}

integrationsRouter.get('/widget', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const setting = await getOrCreateWidgetSetting(u.organizationId);
    const agent = setting.agentId
      ? await prisma.agent.findFirst({ where: { id: setting.agentId, organizationId: u.organizationId }, select: { id: true, name: true } })
      : null;
    res.json({ setting, agent, embedPath: `/api/widget.js` });
  } catch (error) {
    next(error);
  }
});

integrationsRouter.put('/widget', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const body = widgetSettingsSchema.parse(req.body);
    if (body.agentId) {
      const agent = await prisma.agent.findFirst({ where: { id: body.agentId, organizationId: u.organizationId }, select: { id: true } });
      if (!agent) return res.status(404).json({ error: 'NotFound', message: 'Agent not found' });
    }
    const setting = await getOrCreateWidgetSetting(u.organizationId);
    const updated = await prisma.widgetSetting.update({ where: { id: setting.id }, data: body as any });
    await audit(u, 'widget.updated', 'widget_setting', updated.id, Object.keys(body));
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

integrationsRouter.post('/widget/regenerate-key', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    requireRole(u, ['OWNER', 'ADMIN']);
    const setting = await getOrCreateWidgetSetting(u.organizationId);
    const updated = await prisma.widgetSetting.update({ where: { id: setting.id }, data: { publicKey: randomWidgetKey() } });
    await audit(u, 'widget.key_regenerated', 'widget_setting', updated.id, {});
    res.json({ publicKey: updated.publicKey });
  } catch (error) {
    next(error);
  }
});
