import { Router, type Request } from 'express';
import { prisma } from '../lib/db';
import { redis } from '../lib/redis';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware';
import { audit, type AuthUser } from '../lib/auth';
import { supportMessageSchema } from '../validation';

export const supportRouter = Router();
export const supportAdminRouter = Router();

const COOLDOWN_SECONDS = 15;

function user(req: AuthenticatedRequest): AuthUser {
  if (!req.user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return req.user;
}

supportRouter.use((_req, _res, next) => requireAuth(_req as Request, _res, next));

supportRouter.post('/', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const body = supportMessageSchema.parse(req.body);

    let cooledDown = false;
    try {
      const reserved = await redis.set(`support:cooldown:${u.id}`, '1', 'EX', COOLDOWN_SECONDS, 'NX');
      cooledDown = reserved === null;
    } catch {
      cooledDown = false;
    }
    if (cooledDown) {
      return res.status(429).json({
        error: 'RateLimitExceeded',
        message: 'You just sent a message. Give Faizan a moment — try again in a few seconds.'
      });
    }

    const row = await prisma.supportMessage.create({
      data: {
        organizationId: u.organizationId,
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        message: body.message
      }
    });
    await audit(u, 'support.message_sent', 'support', row.id);
    res.status(201).json({ id: row.id, status: row.status, createdAt: row.createdAt });
  } catch (error) {
    next(error);
  }
});

supportAdminRouter.use(requireAuth, requireAdmin);

supportAdminRouter.get('/', async (_req, res, next) => {
  try {
    const [messages, unread] = await Promise.all([
      prisma.supportMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.supportMessage.count({ where: { status: 'OPEN' } })
    ]);
    res.json({ messages, unread });
  } catch (error) {
    next(error);
  }
});

supportAdminRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await prisma.supportMessage.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw Object.assign(new Error('Support message not found'), { statusCode: 404 });
    const updated = await prisma.supportMessage.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});
