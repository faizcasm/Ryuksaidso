import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/db';
import { ACCESS_COOKIE, CSRF_COOKIE, signToken } from '../lib/auth';
import { adminOnly, csrfProtection, requestId, requireAdmin, requireAdminRole, requireAuth } from '../middleware';

vi.mock('../lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    apiKey: { findFirst: vi.fn(), update: vi.fn() },
    membership: { findFirst: vi.fn() }
  }
}));

const user = { id: 'u1', email: 'test@example.com', name: 'Test', organizationId: 'org1', role: 'OWNER' };

describe('requestId', () => {
  const app = express();
  app.use(requestId);
  app.get('/probe', (req, res) => res.json({ id: (req as express.Request & { requestId?: string }).requestId }));

  it('reuses a client supplied id', async () => {
    const response = await request(app).get('/probe').set('x-request-id', 'client-id-123');
    expect(response.headers['x-request-id']).toBe('client-id-123');
    expect(response.body.id).toBe('client-id-123');
  });

  it('generates an id when the client sends none', async () => {
    const response = await request(app).get('/probe');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('requireAuth', () => {
  const app = express();
  app.use(requireAuth);
  app.get('/whoami', (req, res) => res.json({ id: (req as express.Request & { user?: { id: string } }).user?.id }));

  it('rejects requests without credentials', async () => {
    const response = await request(app).get('/whoami');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });

  it('rejects a garbage bearer token', async () => {
    const response = await request(app).get('/whoami').set('Authorization', 'Bearer not-a-jwt');
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid or expired token');
  });

  it('accepts a valid bearer token', async () => {
    const response = await request(app).get('/whoami').set('Authorization', `Bearer ${signToken(user)}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('u1');
  });

  it('accepts the access cookie when no bearer is sent', async () => {
    const response = await request(app).get('/whoami').set('Cookie', `${ACCESS_COOKIE}=${signToken(user)}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('u1');
  });

  it('answers 401 instead of crashing on a malformed cookie value', async () => {
    const response = await request(app).get('/whoami').set('Cookie', `${ACCESS_COOKIE}=%zz`);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });
});

describe('csrfProtection', () => {
  const build = () => {
    const app = express();
    app.use('/api', csrfProtection);
    app.post('/api/tickets', (_req, res) => res.status(201).json({ ok: true }));
    app.post('/api/auth/login', (_req, res) => res.status(200).json({ ok: true }));
    return app;
  };

  it('lets safe methods through', async () => {
    const response = await request(build()).get('/api/tickets');
    expect(response.status).toBe(404);
  });

  it('rejects a state changing request with no csrf token', async () => {
    const response = await request(build()).post('/api/tickets').send({ title: 'x' });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('CSRF validation failed');
  });

  it('rejects a mismatched csrf token pair', async () => {
    const response = await request(build())
      .post('/api/tickets')
      .set('Cookie', `${CSRF_COOKIE}=cookie-value`)
      .set('x-csrf-token', 'header-value')
      .send({ title: 'x' });
    expect(response.status).toBe(403);
  });

  it('accepts a matching csrf token pair', async () => {
    const response = await request(build())
      .post('/api/tickets')
      .set('Cookie', `${CSRF_COOKIE}=same-value`)
      .set('x-csrf-token', 'same-value')
      .send({ title: 'x' });
    expect(response.status).toBe(201);
  });

  it('does not require csrf on credential endpoints', async () => {
    const response = await request(build()).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
    expect(response.status).toBe(200);
  });

  it('skips csrf for api key principals', async () => {
    const response = await request(build())
      .post('/api/tickets')
      .set('Authorization', 'Bearer rsk_test_key')
      .send({ title: 'x' });
    expect(response.status).toBe(201);
  });

  it('treats a malformed csrf cookie as a failure rather than a crash', async () => {
    const response = await request(build())
      .post('/api/tickets')
      .set('Cookie', `${CSRF_COOKIE}=%zz`)
      .set('x-csrf-token', 'header-value')
      .send({ title: 'x' });
    expect(response.status).toBe(403);
  });
});

describe('adminOnly', () => {
  const build = () => {
    const app = express();
    app.use((_req, res, next) => {
      next();
    });
    app.post('/admin/action', (req, res, next) => adminOnly(req, res, next));
    app.post('/admin/allowed', (req, res) => {
      (req as express.Request & { isAdmin?: boolean }).isAdmin = true;
      adminOnly(req, res, () => res.status(200).json({ ok: true }));
    });
    return app;
  };

  it('rejects non admin requests', async () => {
    const response = await request(build()).post('/admin/action');
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('This action requires admin privileges');
  });

  it('lets admin requests through', async () => {
    const response = await request(build()).post('/admin/allowed');
    expect(response.status).toBe(200);
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.apiKey.findFirst).mockReset();
  });

  const build = () => {
    const app = express();
    app.use(requireAuth);
    app.use('/admin', requireAdmin);
    app.get('/admin/users', (_req, res) => res.status(200).json({ ok: true }));
    return app;
  };

  it('rejects anonymous callers', async () => {
    const response = await request(build()).get('/admin/users');
    expect(response.status).toBe(401);
  });

  it('rejects api key principals even when the owner is an admin', async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: 'k1',
      organizationId: 'org1',
      secretHash: 'hash'
    } as never);
    vi.mocked(prisma.membership.findFirst).mockResolvedValue({
      role: 'OWNER',
      organizationId: 'org1',
      user: { id: 'u1', email: user.email, name: user.name }
    } as never);
    const response = await request(build()).get('/admin/users').set('Authorization', 'Bearer rsk_test_key');
    expect(response.status).toBe(403);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a signed in non admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
    const response = await request(build()).get('/admin/users').set('Authorization', `Bearer ${signToken(user)}`);
    expect(response.status).toBe(403);
  });

  it('accepts a signed in admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    const response = await request(build()).get('/admin/users').set('Authorization', `Bearer ${signToken(user)}`);
    expect(response.status).toBe(200);
  });

  it('answers 403 when the account no longer exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    const response = await request(build()).get('/admin/users').set('Authorization', `Bearer ${signToken(user)}`);
    expect(response.status).toBe(403);
  });
});

describe('requireAdminRole', () => {
  const build = () => {
    const app = express();
    app.use(requireAuth);
    app.get('/flag', (req, res, next) => {
      void requireAdminRole(req, res, () => {
        res.json({ isAdmin: (req as express.Request & { isAdmin?: boolean }).isAdmin === true });
      }).catch(next);
    });
    app.get('/strict', (req, res, next) => {
      void requireAdmin(req, res, () => {
        res.json({ isAdmin: (req as express.Request & { isAdmin?: boolean }).isAdmin === true });
      }).catch(next);
    });
    return app;
  };

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it('marks system admins as isAdmin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'ADMIN' } as never);
    const response = await request(build()).get('/flag').set('Authorization', `Bearer ${signToken(user)}`);
    expect(response.status).toBe(200);
    expect(response.body.isAdmin).toBe(true);
  });

  it('does not mark regular users as isAdmin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
    const response = await request(build()).get('/flag').set('Authorization', `Bearer ${signToken(user)}`);
    expect(response.status).toBe(200);
    expect(response.body.isAdmin).toBe(false);
  });

  it('rejects regular users on the strict admin gate', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
    const response = await request(build()).get('/strict').set('Authorization', `Bearer ${signToken(user)}`);
    expect(response.status).toBe(403);
  });
});
