import { Router, type Request } from 'express';
import type { Prisma, MarketplaceAgent } from '@prisma/client';
import { prisma } from '../lib/db';
import { redis } from '../lib/redis';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware';
import { audit, resolveSystemRole, type AuthUser } from '../lib/auth';
import { resolveBilling, assertQuota, monthStart } from '../lib/entitlements';
import { enqueueRun } from '../services/queue';
import { resolveRunProvider } from '../services/modelProviders';
import { tools } from '../services/tools';
import {
  marketplaceAdminReviewSchema,
  marketplaceCreateSchema,
  marketplaceCreatorModerateSchema,
  marketplaceListQuerySchema,
  marketplaceModerateSchema,
  marketplaceReviewSchema,
  marketplaceRollbackSchema,
  marketplaceTrySchema,
  marketplaceUpdateSchema,
  marketplaceVersionSchema
} from '../validation';
import { INTEGRATION_PROVIDERS } from '@ryuksaidso/agent-tools';

export const marketplaceRouter = Router();
export const marketplaceAdminRouter = Router();

const TRY_COOLDOWN_SECONDS = 30;
const CATALOG_KEYS = new Set(INTEGRATION_PROVIDERS.map((provider) => provider.key));

function user(req: Request): AuthUser {
  const auth = (req as AuthenticatedRequest).user;
  if (!auth) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return auth;
}

function httpError(statusCode: number, error: string, message: string) {
  return Object.assign(new Error(message), { statusCode, error });
}

type AgentConfig = { instructions: string; systemPrompt?: string; tools: string[] };

function configOf(config: unknown): AgentConfig {
  const raw = (config ?? {}) as Record<string, unknown>;
  return {
    instructions: typeof raw.instructions === 'string' ? raw.instructions : '',
    systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : undefined,
    tools: Array.isArray(raw.tools) ? raw.tools.filter((tool): tool is string => typeof tool === 'string') : []
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return base || 'agent';
}

async function uniqueMarketplaceSlug(base: string): Promise<string> {
  let candidate = base;
  let attempt = 2;
  while (await prisma.marketplaceAgent.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${attempt}`;
    attempt += 1;
    if (attempt > 500) {
      candidate = `${base}-${Date.now()}`;
      break;
    }
  }
  return candidate;
}

async function uniqueInstalledSlug(organizationId: string, base: string): Promise<string> {
  let candidate = base;
  let attempt = 2;
  while (await prisma.agent.findUnique({ where: { organizationId_slug: { organizationId, slug: candidate } }, select: { id: true } })) {
    candidate = `${base}-${attempt}`;
    attempt += 1;
    if (attempt > 500) {
      candidate = `${base}-${Date.now()}`;
      break;
    }
  }
  return candidate;
}

function handleify(source: string): string {
  const base = slugify(source).slice(0, 40) || 'creator';
  return base;
}

async function ensureCreator(u: AuthUser) {
  const existing = await prisma.marketplaceCreator.findFirst({ where: { userId: u.id } });
  if (existing) return existing;
  const base = handleify(u.name || u.email.split('@')[0] || 'creator');
  let handle = base;
  let attempt = 2;
  while (await prisma.marketplaceCreator.findUnique({ where: { handle } })) {
    handle = `${base}-${attempt}`;
    attempt += 1;
    if (attempt > 500) {
      handle = `${base}-${Date.now()}`;
      break;
    }
  }
  try {
    return await prisma.marketplaceCreator.create({
      data: { userId: u.id, handle, displayName: u.name || u.email }
    });
  } catch {
    const fallback = await prisma.marketplaceCreator.findFirst({ where: { userId: u.id } });
    if (fallback) return fallback;
    throw httpError(409, 'Conflict', 'Could not create your creator profile. Try again.');
  }
}

function visibilityWhere(u: AuthUser, systemRole: string): Prisma.MarketplaceAgentWhereInput {
  const published: Prisma.MarketplaceAgentWhereInput = { status: 'PUBLISHED', visibility: 'PUBLIC' };
  const publicArm: Prisma.MarketplaceAgentWhereInput =
    systemRole === 'ADMIN' ? published : { AND: [published, { suspended: false }] };
  return { OR: [publicArm, { organizationId: u.organizationId }] };
}

type RunAgg = { executions: number; completed: number; failed: number; tokens: number };

async function runAggFor(agentIds: string[]): Promise<Map<string, RunAgg>> {
  const agg = new Map<string, RunAgg>();
  if (!agentIds.length) return agg;
  const rows = await prisma.agentRun.groupBy({
    by: ['agentId', 'status'],
    where: { agentId: { in: agentIds } },
    _count: { _all: true },
    _sum: { tokenUsage: true }
  });
  for (const row of rows) {
    const key = String(row.agentId ?? '');
    const entry = agg.get(key) ?? { executions: 0, completed: 0, failed: 0, tokens: 0 };
    const count = (row._count as { _all?: number })._all ?? 0;
    entry.executions += count;
    if (row.status === 'COMPLETED') entry.completed += count;
    if (row.status === 'FAILED') entry.failed += count;
    entry.tokens += (row._sum as { tokenUsage?: number | null })?.tokenUsage ?? 0;
    agg.set(key, entry);
  }
  return agg;
}

function successRateOf(entry?: RunAgg): number | null {
  if (!entry) return null;
  const settled = entry.completed + entry.failed;
  if (!settled) return null;
  return Math.round((entry.completed / settled) * 1000) / 10;
}

async function ratingHistogram(agentId: string): Promise<Array<{ rating: number; count: number }>> {
  const rows = await prisma.marketplaceReview.groupBy({
    by: ['rating'],
    where: { agentId },
    _count: { _all: true }
  });
  return rows
    .map((row) => ({ rating: row.rating, count: (row._count as { _all?: number })._all ?? 0 }))
    .sort((a, b) => b.rating - a.rating);
}

function pricingProblems(pricing: { pricing: string; priceAmount: number; pricePerRun: number }): string | null {
  if (pricing.pricing === 'PAID' && pricing.priceAmount <= 0) {
    return 'Paid agents need a price greater than zero.';
  }
  if (pricing.pricing === 'USAGE' && pricing.pricePerRun <= 0) {
    return 'Usage based agents need a price per run greater than zero.';
  }
  return null;
}

function checkIntegrations(keys: string[]) {
  const unknown = keys.find((key) => !CATALOG_KEYS.has(key));
  if (unknown) throw httpError(400, 'ValidationError', `Unknown integration: ${unknown}.`);
}

function serializeCard(
  row: MarketplaceAgent,
  u: AuthUser,
  creator: { id: string; handle: string; displayName: string; verified: boolean } | null | undefined,
  agg: RunAgg | undefined
) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    category: row.category,
    logoIcon: row.logoIcon,
    logoColor: row.logoColor,
    pricing: row.pricing,
    priceAmount: row.priceAmount,
    pricePeriod: row.pricePeriod,
    pricePerRun: row.pricePerRun,
    avgCostMicros: row.avgCostMicros,
    status: row.status,
    visibility: row.visibility,
    suspended: row.suspended,
    verified: row.verified,
    featured: row.featured,
    installs: row.installs,
    tries: row.tries,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    currentVersion: row.currentVersion,
    latestVersion: row.latestVersion,
    executions: agg?.executions ?? 0,
    successRate: successRateOf(agg),
    organizationId: row.organizationId,
    canEdit: row.organizationId === u.organizationId,
    creator: creator
      ? { id: creator.id, handle: creator.handle, displayName: creator.displayName, verified: creator.verified }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function findVisibleAgent(u: AuthUser, slug: string) {
  const systemRole = await resolveSystemRole(u);
  return prisma.marketplaceAgent.findFirst({ where: { slug, ...visibilityWhere(u, systemRole) } });
}

function findOwnAgent(u: AuthUser, slug: string) {
  return prisma.marketplaceAgent.findFirst({ where: { slug, organizationId: u.organizationId } });
}

marketplaceRouter.use((_req, _res, next) => requireAuth(_req as Request, _res, next));

marketplaceRouter.get('/agents', async (req, res, next) => {
  try {
    const u = user(req);
    const query = marketplaceListQuerySchema.parse(req.query);
    const systemRole = await resolveSystemRole(u);
    const baseAnd: Prisma.MarketplaceAgentWhereInput[] = [visibilityWhere(u, systemRole)];
    if (query.q) {
      baseAnd.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' as const } },
          { summary: { contains: query.q, mode: 'insensitive' as const } },
          { description: { contains: query.q, mode: 'insensitive' as const } }
        ]
      });
    }
    const and: Prisma.MarketplaceAgentWhereInput[] = [...baseAnd];
    if (query.category) and.push({ category: query.category });
    if (query.pricing) and.push({ pricing: query.pricing });
    const where: Prisma.MarketplaceAgentWhereInput = { AND: and };
    const orderBy: Prisma.MarketplaceAgentOrderByWithRelationInput | Prisma.MarketplaceAgentOrderByWithRelationInput[] =
      query.sort === 'popular'
        ? { installs: 'desc' }
        : query.sort === 'rating'
          ? [{ ratingAvg: 'desc' }, { installs: 'desc' }]
          : query.sort === 'name'
            ? { name: 'asc' }
            : { createdAt: 'desc' };
    const [total, rows, categoryRows] = await Promise.all([
      prisma.marketplaceAgent.count({ where }),
      prisma.marketplaceAgent.findMany({ where, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
      prisma.marketplaceAgent.groupBy({ by: ['category'], where: { AND: baseAnd }, _count: { _all: true } })
    ]);
    const creatorIds = [...new Set(rows.map((row) => row.creatorId))];
    const creators = creatorIds.length
      ? await prisma.marketplaceCreator.findMany({ where: { id: { in: creatorIds } } })
      : [];
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
    const agg = await runAggFor(rows.map((row) => row.id));
    res.json({
      total,
      page: query.page,
      limit: query.limit,
      categories: categoryRows
        .map((row) => ({ category: row.category, count: (row._count as { _all?: number })._all ?? 0 }))
        .sort((a, b) => b.count - a.count),
      agents: rows.map((row) => serializeCard(row, u, creatorById.get(row.creatorId), agg.get(row.id)))
    });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.get('/agents/mine', async (req, res, next) => {
  try {
    const u = user(req);
    const rows = await prisma.marketplaceAgent.findMany({
      where: { organizationId: u.organizationId },
      orderBy: { updatedAt: 'desc' }
    });
    const creatorIds = [...new Set(rows.map((row) => row.creatorId))];
    const creators = creatorIds.length
      ? await prisma.marketplaceCreator.findMany({ where: { id: { in: creatorIds } } })
      : [];
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
    const agg = await runAggFor(rows.map((row) => row.id));
    res.json(rows.map((row) => serializeCard(row, u, creatorById.get(row.creatorId), agg.get(row.id))));
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.get('/agents/:slug', async (req, res, next) => {
  try {
    const u = user(req);
    const systemRole = await resolveSystemRole(u);
    const row = await prisma.marketplaceAgent.findFirst({
      where: { slug: req.params.slug, ...visibilityWhere(u, systemRole) }
    });
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const [creator, histogram, reviews, myInstall, myReview, agg, forkedFrom] = await Promise.all([
      prisma.marketplaceCreator.findUnique({ where: { id: row.creatorId } }),
      ratingHistogram(row.id),
      prisma.marketplaceReview.findMany({ where: { agentId: row.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.marketplaceInstall.findFirst({ where: { agentId: row.id, organizationId: u.organizationId, status: 'ACTIVE' } }),
      prisma.marketplaceReview.findFirst({ where: { agentId: row.id, userId: u.id } }),
      runAggFor([row.id]),
      row.forkedFromId
        ? prisma.marketplaceAgent.findUnique({ where: { id: row.forkedFromId }, select: { slug: true, name: true } })
        : Promise.resolve(null)
    ]);
    const cfg = configOf(row.config);
    res.json({
      ...serializeCard(row, u, creator, agg.get(row.id)),
      description: row.description,
      reviewReason: row.reviewReason,
      forkedFrom,
      config: cfg,
      changelog: row.changelog,
      requiredIntegrations: row.requiredIntegrations,
      requiredTools: cfg.tools,
      requiredModels: row.requiredModels,
      permissions: row.permissions,
      histogram,
      reviews,
      myInstall,
      myReview,
      canModerate: systemRole === 'ADMIN'
    });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.get('/agents/:slug/versions', async (req, res, next) => {
  try {
    const u = user(req);
    const row = await findVisibleAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const versions = await prisma.marketplaceAgentVersion.findMany({
      where: { agentId: row.id },
      orderBy: { version: 'desc' }
    });
    res.json({
      current: row.currentVersion,
      versions: versions.map((version) => ({
        version: version.version,
        changelog: version.changelog,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
        isCurrent: version.version === row.currentVersion
      }))
    });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.get('/agents/:slug/reviews', async (req, res, next) => {
  try {
    const u = user(req);
    const row = await findVisibleAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const reviews = await prisma.marketplaceReview.findMany({
      where: { agentId: row.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ histogram: await ratingHistogram(row.id), reviews });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.get('/agents/:slug/analytics', async (req, res, next) => {
  try {
    const u = user(req);
    const row = await findOwnAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const recentSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [installs30d, agg, histogram] = await Promise.all([
      prisma.marketplaceInstall.count({ where: { agentId: row.id, createdAt: { gte: recentSince } } }),
      runAggFor([row.id]),
      ratingHistogram(row.id)
    ]);
    const entry = agg.get(row.id);
    res.json({
      installs: row.installs,
      installs30d,
      tries: row.tries,
      executions: entry?.executions ?? 0,
      completed: entry?.completed ?? 0,
      failed: entry?.failed ?? 0,
      successRate: successRateOf(entry),
      totalTokens: entry?.tokens ?? 0,
      ratingAvg: row.ratingAvg,
      ratingCount: row.ratingCount,
      histogram,
      avgCostMicros: row.avgCostMicros
    });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.get('/installs', async (req, res, next) => {
  try {
    const u = user(req);
    const installs = await prisma.marketplaceInstall.findMany({
      where: { organizationId: u.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    const marketplaceIds = [...new Set(installs.map((install) => install.agentId))];
    const installedIds = installs.map((install) => install.installedAgentId).filter((id): id is string => Boolean(id));
    const [marketplaceRows, installedRows] = await Promise.all([
      marketplaceIds.length
        ? prisma.marketplaceAgent.findMany({ where: { id: { in: marketplaceIds } } })
        : Promise.resolve([]),
      installedIds.length
        ? prisma.agent.findMany({ where: { id: { in: installedIds } }, select: { id: true, name: true, slug: true, enabled: true } })
        : Promise.resolve([])
    ]);
    const marketplaceById = new Map(marketplaceRows.map((row) => [row.id, row]));
    const installedById = new Map(installedRows.map((row) => [row.id, row]));
    res.json(
      installs.map((install) => {
        const market = marketplaceById.get(install.agentId);
        return {
          id: install.id,
          status: install.status,
          source: install.source,
          version: install.version,
          createdAt: install.createdAt,
          agent: market
            ? { slug: market.slug, name: market.name, summary: market.summary, logoIcon: market.logoIcon, logoColor: market.logoColor, category: market.category, verified: market.verified }
            : null,
          installedAgent: install.installedAgentId ? installedById.get(install.installedAgentId) ?? null : null
        };
      })
    );
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.get('/creators/:handle', async (req, res, next) => {
  try {
    const u = user(req);
    const systemRole = await resolveSystemRole(u);
    const creator = await prisma.marketplaceCreator.findUnique({ where: { handle: req.params.handle } });
    if (!creator) throw httpError(404, 'NotFound', 'Creator not found');
    const rows = await prisma.marketplaceAgent.findMany({
      where: { creatorId: creator.id, ...visibilityWhere(u, systemRole) },
      orderBy: { installs: 'desc' }
    });
    const agg = await runAggFor(rows.map((row) => row.id));
    const rated = rows.filter((row) => row.ratingCount > 0);
    res.json({
      id: creator.id,
      userId: creator.userId,
      handle: creator.handle,
      displayName: creator.displayName,
      bio: creator.bio,
      website: creator.website,
      verified: creator.verified,
      isMe: Boolean(creator.userId) && creator.userId === u.id,
      stats: {
        agentCount: rows.length,
        totalInstalls: rows.reduce((sum, row) => sum + row.installs, 0),
        totalExecutions: rows.reduce((sum, row) => sum + (agg.get(row.id)?.executions ?? 0), 0),
        ratingAvg: rated.length
          ? Math.round((rated.reduce((sum, row) => sum + row.ratingAvg, 0) / rated.length) * 10) / 10
          : 0
      },
      agents: rows.map((row) => serializeCard(row, u, creator, agg.get(row.id)))
    });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can publish agents.');
    const body = marketplaceCreateSchema.parse(req.body);
    checkIntegrations(body.requiredIntegrations);
    const problem = pricingProblems(body);
    if (problem) throw httpError(400, 'ValidationError', problem);
    const creator = await ensureCreator(u);
    const slug = await uniqueMarketplaceSlug(body.slug || slugify(body.name));
    const row = await prisma.marketplaceAgent.create({
      data: {
        slug,
        name: body.name,
        summary: body.summary,
        description: body.description,
        category: body.category,
        logoIcon: body.logoIcon,
        logoColor: body.logoColor,
        visibility: 'PRIVATE',
        status: 'DRAFT',
        pricing: body.pricing,
        priceAmount: body.priceAmount,
        pricePeriod: body.pricePeriod,
        pricePerRun: body.pricePerRun,
        avgCostMicros: body.avgCostMicros,
        creatorId: creator.id,
        organizationId: u.organizationId,
        config: body.config as Prisma.InputJsonValue,
        changelog: 'Initial draft',
        requiredIntegrations: body.requiredIntegrations,
        requiredModels: body.requiredModels,
        permissions: body.permissions
      }
    });
    await prisma.marketplaceAgentVersion.create({
      data: {
        agentId: row.id,
        version: 1,
        config: body.config,
        changelog: 'Initial draft',
        createdBy: u.name || u.email
      }
    });
    await audit(u, 'marketplace.agent_created', 'marketplace_agent', row.id, { slug: row.slug });
    res.status(201).json({ ...serializeCard(row, u, creator, undefined), description: row.description, config: configOf(row.config), requiredIntegrations: row.requiredIntegrations, requiredModels: row.requiredModels, permissions: row.permissions });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.patch('/agents/:slug', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can edit agents.');
    const body = marketplaceUpdateSchema.parse(req.body);
    const row = await findOwnAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    if (body.requiredIntegrations) checkIntegrations(body.requiredIntegrations);
    const effective = {
      pricing: body.pricing ?? row.pricing,
      priceAmount: body.priceAmount ?? row.priceAmount,
      pricePerRun: body.pricePerRun ?? row.pricePerRun
    };
    const problem = pricingProblems(effective);
    if (problem) throw httpError(400, 'ValidationError', problem);
    if (body.slug && body.slug !== row.slug) {
      const taken = await prisma.marketplaceAgent.findUnique({ where: { slug: body.slug }, select: { id: true } });
      if (taken && taken.id !== row.id) throw httpError(409, 'Conflict', 'That slug is already taken.');
    }
    if (body.config && row.status === 'PUBLISHED') {
      throw httpError(409, 'Conflict', 'Published agents change through a new version. Use the versions endpoint.');
    }
    const data: Prisma.MarketplaceAgentUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.slug !== undefined) data.slug = body.slug;
    if (body.summary !== undefined) data.summary = body.summary;
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category;
    if (body.logoIcon !== undefined) data.logoIcon = body.logoIcon;
    if (body.logoColor !== undefined) data.logoColor = body.logoColor;
    if (body.pricing !== undefined) data.pricing = body.pricing;
    if (body.priceAmount !== undefined) data.priceAmount = body.priceAmount;
    if (body.pricePeriod !== undefined) data.pricePeriod = body.pricePeriod;
    if (body.pricePerRun !== undefined) data.pricePerRun = body.pricePerRun;
    if (body.avgCostMicros !== undefined) data.avgCostMicros = body.avgCostMicros;
    if (body.requiredIntegrations !== undefined) data.requiredIntegrations = body.requiredIntegrations;
    if (body.requiredModels !== undefined) data.requiredModels = body.requiredModels;
    if (body.permissions !== undefined) data.permissions = body.permissions;
    if (body.config !== undefined) data.config = body.config as Prisma.InputJsonValue;
    if (row.status === 'IN_REVIEW') data.status = 'DRAFT';
    const updated = await prisma.marketplaceAgent.update({ where: { id: row.id }, data });
    if (body.config && row.status === 'DRAFT' && row.latestVersion === 1) {
      await prisma.marketplaceAgentVersion.updateMany({
        where: { agentId: row.id, version: 1 },
        data: { config: body.config as Prisma.InputJsonValue }
      });
    }
    await audit(u, 'marketplace.agent_updated', 'marketplace_agent', row.id, { slug: row.slug });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents/:slug/versions', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can publish versions.');
    const body = marketplaceVersionSchema.parse(req.body);
    const row = await findOwnAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    if (row.status !== 'PUBLISHED') {
      throw httpError(409, 'Conflict', 'Only published agents accept new versions. Submit the draft for review first.');
    }
    const nextVersion = row.latestVersion + 1;
    await prisma.marketplaceAgentVersion.create({
      data: {
        agentId: row.id,
        version: nextVersion,
        config: body.config as Prisma.InputJsonValue,
        changelog: body.changelog,
        createdBy: u.name || u.email
      }
    });
    const updated = await prisma.marketplaceAgent.update({
      where: { id: row.id },
      data: {
        config: body.config as Prisma.InputJsonValue,
        currentVersion: nextVersion,
        latestVersion: nextVersion,
        changelog: body.changelog
      }
    });
    await audit(u, 'marketplace.agent_versioned', 'marketplace_agent', row.id, { version: nextVersion });
    res.status(201).json(updated);
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents/:slug/rollback', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can roll back versions.');
    const body = marketplaceRollbackSchema.parse(req.body);
    const row = await findOwnAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    if (body.version === row.currentVersion) {
      throw httpError(409, 'Conflict', 'That version is already active.');
    }
    const version = await prisma.marketplaceAgentVersion.findFirst({
      where: { agentId: row.id, version: body.version }
    });
    if (!version) throw httpError(404, 'NotFound', 'Version not found');
    const updated = await prisma.marketplaceAgent.update({
      where: { id: row.id },
      data: { currentVersion: version.version, config: version.config as Prisma.InputJsonValue }
    });
    await audit(u, 'marketplace.agent_rolled_back', 'marketplace_agent', row.id, { version: version.version });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents/:slug/submit', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can submit agents.');
    const row = await findOwnAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    if (row.status !== 'DRAFT' && row.status !== 'REJECTED') {
      throw httpError(409, 'Conflict', 'Only drafts or rejected agents can be submitted for review.');
    }
    const updated = await prisma.marketplaceAgent.update({
      where: { id: row.id },
      data: { status: 'IN_REVIEW', reviewReason: '' }
    });
    await audit(u, 'marketplace.agent_submitted', 'marketplace_agent', row.id, { slug: row.slug });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents/:slug/unpublish', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can unpublish agents.');
    const row = await findOwnAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    if (row.status !== 'PUBLISHED') throw httpError(409, 'Conflict', 'Only published agents can be unpublished.');
    const updated = await prisma.marketplaceAgent.update({
      where: { id: row.id },
      data: { status: 'DRAFT', visibility: 'PRIVATE', suspended: false }
    });
    await audit(u, 'marketplace.agent_unpublished', 'marketplace_agent', row.id, { slug: row.slug });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.delete('/agents/:slug', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can delete agents.');
    const row = await findOwnAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    await Promise.all([
      prisma.marketplaceAgentVersion.deleteMany({ where: { agentId: row.id } }),
      prisma.marketplaceReview.deleteMany({ where: { agentId: row.id } }),
      prisma.marketplaceInstall.deleteMany({ where: { agentId: row.id } }),
      prisma.marketplaceAgent.delete({ where: { id: row.id } })
    ]);
    await audit(u, 'marketplace.agent_deleted', 'marketplace_agent', row.id, { slug: row.slug });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents/:slug/install', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can install agents.');
    const row = await prisma.marketplaceAgent.findFirst({
      where: { slug: req.params.slug, status: 'PUBLISHED', visibility: 'PUBLIC', suspended: false }
    });
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const existing = await prisma.marketplaceInstall.findFirst({
      where: { agentId: row.id, organizationId: u.organizationId, status: 'ACTIVE' }
    });
    if (existing) throw httpError(409, 'Conflict', 'This agent is already installed in your workspace.');
    const resolved = await resolveBilling(u.organizationId);
    if ((row.pricing === 'PAID' || row.pricing === 'USAGE') && resolved.enforced && resolved.planCode === 'free') {
      throw httpError(402, 'PaymentRequired', `${row.name} is a paid marketplace agent. Upgrade the plan in Settings → Billing to install it.`);
    }
    const currentAgents = await prisma.agent.count({ where: { organizationId: u.organizationId } });
    await assertQuota(u.organizationId, 'agents', currentAgents);
    const cfg = configOf(row.config);
    const slug = await uniqueInstalledSlug(u.organizationId, slugify(row.name));
    const installed = await prisma.agent.create({
      data: {
        organizationId: u.organizationId,
        name: row.name,
        slug,
        instructions: cfg.instructions,
        systemPrompt: cfg.systemPrompt ?? null,
        enabled: true,
        tools: cfg.tools
      }
    });
    const install = await prisma.marketplaceInstall.create({
      data: {
        agentId: row.id,
        organizationId: u.organizationId,
        userId: u.id,
        installedAgentId: installed.id,
        version: row.currentVersion,
        source: 'INSTALL'
      }
    });
    await prisma.marketplaceAgent.update({ where: { id: row.id }, data: { installs: { increment: 1 } } });
    const required = row.requiredIntegrations;
    const connections = required.length
      ? await prisma.integrationConnection.findMany({
          where: { organizationId: u.organizationId, provider: { in: required } },
          select: { provider: true, status: true }
        })
      : [];
    const connected = new Set(connections.filter((connection) => connection.status === 'CONNECTED').map((connection) => connection.provider));
    const organization = await prisma.organization.findUnique({
      where: { id: u.organizationId },
      select: { llmProvider: true, ollamaModel: true, omnirouteModel: true }
    });
    const model = await resolveRunProvider(u.organizationId, organization, undefined, process.env);
    const missing = {
      integrations: required.filter((provider) => !connected.has(provider)),
      tools: cfg.tools.filter((tool) => !tools[tool]),
      modelReady: model.ok
    };
    await audit(u, 'marketplace.agent_installed', 'marketplace_agent', row.id, { installedAgentId: installed.id });
    res.status(201).json({
      install,
      agent: installed,
      missing,
      marketplace: { slug: row.slug, name: row.name, version: row.currentVersion }
    });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents/:slug/fork', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can fork agents.');
    const row = await findVisibleAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const creator = await ensureCreator(u);
    const slug = await uniqueMarketplaceSlug(`${slugify(row.name)}-fork`);
    const fork = await prisma.marketplaceAgent.create({
      data: {
        slug,
        name: row.name,
        summary: row.summary,
        description: row.description,
        category: row.category,
        logoIcon: row.logoIcon,
        logoColor: row.logoColor,
        visibility: 'PRIVATE',
        status: 'DRAFT',
        pricing: 'FREE',
        priceAmount: 0,
        pricePerRun: 0,
        avgCostMicros: row.avgCostMicros,
        creatorId: creator.id,
        organizationId: u.organizationId,
        config: row.config as Prisma.InputJsonValue,
        changelog: `Forked from ${row.name} v${row.currentVersion}`,
        requiredIntegrations: row.requiredIntegrations,
        requiredModels: row.requiredModels,
        permissions: row.permissions,
        forkedFromId: row.id
      }
    });
    await prisma.marketplaceAgentVersion.create({
      data: {
        agentId: fork.id,
        version: 1,
        config: row.config as Prisma.InputJsonValue,
        changelog: `Forked from ${row.name} v${row.currentVersion}`,
        createdBy: u.name || u.email
      }
    });
    await audit(u, 'marketplace.agent_forked', 'marketplace_agent', row.id, { forkId: fork.id });
    res.status(201).json({ ...serializeCard(fork, u, creator, undefined), forkedFrom: { slug: row.slug, name: row.name } });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents/:slug/try', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN', 'AGENT'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace members can try agents.');
    const body = marketplaceTrySchema.parse(req.body);
    const row = await findVisibleAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    let cooledDown = false;
    try {
      const reserved = await redis.set(`marketplace:try:${u.id}:${row.id}`, '1', 'EX', TRY_COOLDOWN_SECONDS, 'NX');
      cooledDown = reserved === null;
    } catch {
      cooledDown = false;
    }
    if (cooledDown) {
      throw httpError(429, 'RateLimitExceeded', 'The preview is warming up. Give it a few seconds and try again.');
    }
    const cfg = configOf(row.config);
    const previewSlug = `try-${row.slug}`;
    let preview = await prisma.agent.findFirst({ where: { organizationId: u.organizationId, slug: previewSlug } });
    let previewVersionId: string | null = null;
    if (!preview) {
      const currentAgents = await prisma.agent.count({ where: { organizationId: u.organizationId } });
      await assertQuota(u.organizationId, 'agents', currentAgents);
      try {
        preview = await prisma.agent.create({
          data: {
            organizationId: u.organizationId,
            name: `${row.name} (preview)`,
            slug: previewSlug,
            instructions: cfg.instructions,
            systemPrompt: cfg.systemPrompt ?? null,
            enabled: true,
            tools: cfg.tools
          }
        });
        const version = await prisma.agentVersion.create({
          data: {
            agentId: preview.id,
            version: 1,
            config: { instructions: cfg.instructions, systemPrompt: cfg.systemPrompt, tools: cfg.tools } as Prisma.InputJsonValue,
            changelog: 'Marketplace preview',
            createdBy: `marketplace:${row.slug}`
          }
        });
        previewVersionId = version.id;
      } catch {
        preview = await prisma.agent.findFirst({ where: { organizationId: u.organizationId, slug: previewSlug } });
        if (!preview) throw httpError(409, 'Conflict', 'Could not start the preview. Try again in a moment.');
      }
    }
    if (!previewVersionId) {
      const version = await prisma.agentVersion.findFirst({
        where: { agentId: preview.id },
        orderBy: { version: 'desc' }
      });
      previewVersionId = version?.id ?? null;
    }
    const organization = await prisma.organization.findUnique({
      where: { id: u.organizationId },
      select: { llmProvider: true, ollamaModel: true, omnirouteModel: true }
    });
    const resolvedProvider = await resolveRunProvider(u.organizationId, organization, undefined, process.env);
    if (!resolvedProvider.ok) {
      const message =
        resolvedProvider.reason === 'unknown_provider'
          ? 'The selected model provider is no longer available. Configure a provider in Settings before trying this agent.'
          : `${resolvedProvider.provider} has no model configured for this workspace. Configure it in Settings before trying this agent.`;
      throw httpError(409, 'ProviderNotConfigured', message);
    }
    const currentRuns = await prisma.agentRun.count({ where: { organizationId: u.organizationId, createdAt: { gte: monthStart() } } });
    await assertQuota(u.organizationId, 'runs', currentRuns);
    const run = await prisma.agentRun.create({
      data: {
        organizationId: u.organizationId,
        projectId: preview.projectId,
        agentId: preview.id,
        agentVersionId: previewVersionId,
        provider: resolvedProvider.provider,
        model: resolvedProvider.model,
        status: 'QUEUED',
        trigger: 'marketplace',
        environment: 'development',
        input: { prompt: body.message }
      }
    });
    const job = await enqueueRun(run.id, u.organizationId, u);
    await prisma.marketplaceAgent.update({ where: { id: row.id }, data: { tries: { increment: 1 } } });
    await audit(u, 'marketplace.agent_tried', 'marketplace_agent', row.id, { runId: run.id });
    res.status(202).json({ runId: run.id, jobId: job.id, previewAgentId: preview.id });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/agents/:slug/reviews', async (req, res, next) => {
  try {
    const u = user(req);
    const body = marketplaceReviewSchema.parse(req.body);
    const row = await findVisibleAgent(u, req.params.slug);
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const existing = await prisma.marketplaceReview.findUnique({
      where: { agentId_userId: { agentId: row.id, userId: u.id } }
    });
    const review = existing
      ? await prisma.marketplaceReview.update({
          where: { id: existing.id },
          data: { rating: body.rating, title: body.title, body: body.body, version: row.currentVersion }
        })
      : await prisma.marketplaceReview.create({
          data: {
            agentId: row.id,
            userId: u.id,
            userName: u.name || u.email,
            rating: body.rating,
            title: body.title,
            body: body.body,
            version: row.currentVersion
          }
        });
    const histogram = await ratingHistogram(row.id);
    const ratingCount = histogram.reduce((sum, bucket) => sum + bucket.count, 0);
    const ratingAvg = ratingCount
      ? Math.round((histogram.reduce((sum, bucket) => sum + bucket.rating * bucket.count, 0) / ratingCount) * 10) / 10
      : 0;
    await prisma.marketplaceAgent.update({ where: { id: row.id }, data: { ratingAvg, ratingCount } });
    await audit(u, 'marketplace.review_left', 'marketplace_agent', row.id, { rating: body.rating });
    res.json({ review, ratingAvg, ratingCount, histogram });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/installs/:id/uninstall', async (req, res, next) => {
  try {
    const u = user(req);
    if (!['OWNER', 'ADMIN'].includes(u.role)) throw httpError(403, 'Forbidden', 'Only workspace owners and admins can uninstall agents.');
    const install = await prisma.marketplaceInstall.findFirst({
      where: { id: req.params.id, organizationId: u.organizationId }
    });
    if (!install) throw httpError(404, 'NotFound', 'Install not found');
    if (install.status !== 'ACTIVE') throw httpError(409, 'Conflict', 'This install is already inactive.');
    const updated = await prisma.marketplaceInstall.update({
      where: { id: install.id },
      data: { status: 'UNINSTALLED' }
    });
    if (install.installedAgentId) {
      const linked = await prisma.agent.findFirst({
        where: { id: install.installedAgentId, organizationId: u.organizationId }
      });
      if (linked) {
        await prisma.agent.update({ where: { id: linked.id }, data: { enabled: false } });
      }
    }
    await audit(u, 'marketplace.agent_uninstalled', 'marketplace_agent', install.agentId, { installId: install.id });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

marketplaceAdminRouter.use(requireAuth, requireAdmin);

marketplaceAdminRouter.get('/queue', async (req, res, next) => {
  try {
    const rows = await prisma.marketplaceAgent.findMany({
      where: { status: 'IN_REVIEW' },
      orderBy: { updatedAt: 'asc' },
      take: 50
    });
    const creatorIds = [...new Set(rows.map((row) => row.creatorId))];
    const creators = creatorIds.length
      ? await prisma.marketplaceCreator.findMany({ where: { id: { in: creatorIds } } })
      : [];
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
    res.json(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        summary: row.summary,
        description: row.description,
        category: row.category,
        pricing: row.pricing,
        priceAmount: row.priceAmount,
        pricePerRun: row.pricePerRun,
        config: configOf(row.config),
        requiredIntegrations: row.requiredIntegrations,
        requiredModels: row.requiredModels,
        permissions: row.permissions,
        creator: creatorById.get(row.creatorId)
          ? { id: creatorById.get(row.creatorId)!.id, handle: creatorById.get(row.creatorId)!.handle, displayName: creatorById.get(row.creatorId)!.displayName, verified: creatorById.get(row.creatorId)!.verified }
          : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    );
  } catch (error) {
    next(error);
  }
});

marketplaceAdminRouter.get('/agents', async (req, res, next) => {
  try {
    const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where: Prisma.MarketplaceAgentWhereInput = {};
    if (['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'REJECTED'].includes(statusParam)) {
      where.status = statusParam as MarketplaceAgent['status'];
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' as const } },
        { slug: { contains: q, mode: 'insensitive' as const } }
      ];
    }
    const rows = await prisma.marketplaceAgent.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100
    });
    const creatorIds = [...new Set(rows.map((row) => row.creatorId))];
    const creators = creatorIds.length
      ? await prisma.marketplaceCreator.findMany({ where: { id: { in: creatorIds } } })
      : [];
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
    res.json(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        suspended: row.suspended,
        verified: row.verified,
        featured: row.featured,
        category: row.category,
        pricing: row.pricing,
        logoIcon: row.logoIcon,
        logoColor: row.logoColor,
        installs: row.installs,
        tries: row.tries,
        ratingAvg: row.ratingAvg,
        ratingCount: row.ratingCount,
        organizationId: row.organizationId,
        creator: creatorById.get(row.creatorId)
          ? { id: creatorById.get(row.creatorId)!.id, handle: creatorById.get(row.creatorId)!.handle, displayName: creatorById.get(row.creatorId)!.displayName, verified: creatorById.get(row.creatorId)!.verified }
          : null,
        updatedAt: row.updatedAt
      }))
    );
  } catch (error) {
    next(error);
  }
});

marketplaceAdminRouter.post('/agents/:id/review', async (req, res, next) => {
  try {
    const u = user(req);
    const body = marketplaceAdminReviewSchema.parse(req.body);
    const row = await prisma.marketplaceAgent.findUnique({ where: { id: req.params.id } });
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const updated =
      body.action === 'approve'
        ? await prisma.marketplaceAgent.update({
            where: { id: row.id },
            data: { status: 'PUBLISHED', visibility: 'PUBLIC', suspended: false, reviewReason: '' }
          })
        : await prisma.marketplaceAgent.update({
            where: { id: row.id },
            data: { status: 'REJECTED', visibility: 'PRIVATE', reviewReason: body.reason || 'Rejected by reviewer' }
          });
    await audit(u, body.action === 'approve' ? 'marketplace.agent_approved' : 'marketplace.agent_rejected', 'marketplace_agent', row.id, { slug: row.slug, reason: body.reason });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

marketplaceAdminRouter.post('/agents/:id/moderate', async (req, res, next) => {
  try {
    const u = user(req);
    const body = marketplaceModerateSchema.parse(req.body);
    const row = await prisma.marketplaceAgent.findUnique({ where: { id: req.params.id } });
    if (!row) throw httpError(404, 'NotFound', 'Marketplace agent not found');
    const data: Prisma.MarketplaceAgentUpdateInput = {};
    if (body.verified !== undefined) data.verified = body.verified;
    if (body.featured !== undefined) data.featured = body.featured;
    if (body.suspend !== undefined) data.suspended = body.suspend;
    const updated = await prisma.marketplaceAgent.update({ where: { id: row.id }, data });
    await audit(u, 'marketplace.agent_moderated', 'marketplace_agent', row.id, { verified: body.verified, featured: body.featured, suspend: body.suspend });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

marketplaceAdminRouter.get('/creators', async (req, res, next) => {
  try {
    const creators = await prisma.marketplaceCreator.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const counts = await prisma.marketplaceAgent.groupBy({ by: ['creatorId'], where: { status: 'PUBLISHED' }, _count: { _all: true } });
    const countById = new Map(counts.map((row) => [row.creatorId, (row._count as { _all?: number })._all ?? 0]));
    res.json(creators.map((creator) => ({ ...creator, publishedAgents: countById.get(creator.id) ?? 0 })));
  } catch (error) {
    next(error);
  }
});

marketplaceAdminRouter.post('/creators/:id/moderate', async (req, res, next) => {
  try {
    const u = user(req);
    const body = marketplaceCreatorModerateSchema.parse(req.body);
    const creator = await prisma.marketplaceCreator.findFirst({
      where: { OR: [{ id: req.params.id }, { userId: req.params.id }] }
    });
    if (!creator) throw httpError(404, 'NotFound', 'Creator profile not found');
    const updated = await prisma.marketplaceCreator.update({
      where: { id: creator.id },
      data: { verified: body.verified }
    });
    await audit(u, 'marketplace.creator_moderated', 'marketplace_creator', creator.id, { verified: body.verified });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});
