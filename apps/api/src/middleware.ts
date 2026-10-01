import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { verifyToken, ACCESS_COOKIE, CSRF_COOKIE, type AuthUser } from './lib/auth';
import { prisma } from './lib/db';
import { assertApiAccessAllowed, recordApiRequest } from './lib/entitlements';

export type AuthenticatedRequest = Request & { user?: AuthUser & { userRole?: string }; requestId?: string; isAdmin?: boolean; apiKey?: boolean; rawBody?: Buffer };

function cookie(req: Request, name: string) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      const value = rest.join('=');
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return undefined;
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.header('x-request-id') || randomUUID();
  (req as AuthenticatedRequest).requestId = id;
  res.setHeader('x-request-id', id);
  next();
}


async function prismaApiKeyLookup(tokenHash: string) {
  const key = await prisma.apiKey.findFirst({ where: { secretHash: tokenHash }, include: { organization: { select: { id: true } } } });
  if (!key) return null;
  const membership = await prisma.membership.findFirst({ where: { organizationId: key.organizationId, role: 'OWNER' }, include: { user: true } })
    ?? await prisma.membership.findFirst({ where: { organizationId: key.organizationId }, include: { user: true } });
  if (!membership) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { user: { id: membership.user.id, email: membership.user.email, name: membership.user.name, organizationId: key.organizationId, role: membership.role, userRole: membership.user.userRole } as AuthUser };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const token = bearer || cookie(req, ACCESS_COOKIE);
  if (!token) return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });

  if (bearer?.startsWith('rsk_')) {
    const tokenHash = createHash('sha256').update(bearer).digest('hex');
    const key = await prismaApiKeyLookup(tokenHash);
    if (!key) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
    (req as AuthenticatedRequest).user = key.user;
    (req as AuthenticatedRequest).apiKey = true;
    await assertApiAccessAllowed(key.user.organizationId);
    void recordApiRequest(key.user.organizationId);
    return next();
  }

  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  (req as AuthenticatedRequest).user = user;
  next();
}

const CSRF_EXEMPT = new Set(['/auth/login','/auth/register','/auth/refresh','/auth/forgot-password','/auth/reset-password','/auth/verify-email','/billing/webhook']);
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const bearer = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (['GET','HEAD','OPTIONS'].includes(req.method) || CSRF_EXEMPT.has(req.path) || req.path.startsWith('/auth/oauth/') || bearer?.startsWith('rsk_')) return next();
  const cookieToken = cookie(req, CSRF_COOKIE);
  const headerToken = req.header('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) return res.status(403).json({ error: 'Forbidden', message: 'CSRF validation failed' });
  next();
}

export async function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: { userRole: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    authReq.isAdmin = !authReq.apiKey && user.userRole === 'ADMIN';
    if (authReq.user) {
      authReq.user.userRole = user.userRole;
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'InternalError', message: 'Failed to verify admin role' });
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.isAdmin) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This action requires admin privileges'
    });
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }

    if (authReq.apiKey) {
      return res.status(403).json({ error: 'Forbidden', message: 'This action requires admin privileges' });
    }

    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: { userRole: true },
    });

    if (!user || user.userRole !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This action requires admin privileges'
      });
    }

    authReq.isAdmin = true;
    if (authReq.user) {
      authReq.user.userRole = user.userRole;
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'InternalError', message: 'Failed to verify admin role' });
  }
}
