import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server';
import { signToken } from '../lib/auth';
import { errorHandler } from '../middleware-error';
import { evaluationSchema } from '../validation';

describe('error handling regressions', () => {
  it('maps Prisma unique constraint violations to 409', async () => {
    const app = express();
    app.get('/boom', (_req, _res, next) => next(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })));
    app.use(errorHandler);
    const response = await request(app).get('/boom');
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Conflict');
  });

  it('delegates to the next error handler when headers were already sent', async () => {
    const app = express();
    const failure = new Error('late failure');
    let delegated: unknown;
    app.get('/partial', (_req, res, next) => {
      res.status(200).send('already sent');
      next(failure);
    });
    app.use(errorHandler);
    const capture: express.ErrorRequestHandler = (err, _req, _res, _next) => {
      delegated = err;
    };
    app.use(capture);
    const response = await request(app).get('/partial');
    expect(response.status).toBe(200);
    expect(delegated).toBe(failure);
  });

  it('caps evaluation dataset size', () => {
    const dataset = Array.from({ length: 501 }, (_, i) => ({ id: String(i), input: `input ${i}`, expectedIntent: 'billing' }));
    expect(evaluationSchema.safeParse({ dataset }).success).toBe(false);
    expect(evaluationSchema.safeParse({ dataset: dataset.slice(0, 500) }).success).toBe(true);
  });
});

describe('control run filters', () => {
  it('rejects an unknown run status before touching the database', async () => {
    const token = signToken({ id: 'u1', email: 'test@example.com', name: 'Test user', organizationId: 'org1', role: 'OWNER' });
    const response = await request(createApp())
      .get('/api/control/runs?status=NOT_A_STATUS')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
    expect(response.body.message).toContain('Invalid status');
  });

  it('requires authentication on control routes', async () => {
    const response = await request(createApp()).get('/api/control/runs');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });
});

describe('cookie decoding regressions', () => {
  it('returns 403 for a malformed percent-encoded CSRF cookie instead of 500', async () => {
    const token = signToken({ id: 'u1', email: 'test@example.com', name: 'Test User', organizationId: 'org1', role: 'OWNER' });
    const response = await request(createApp())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .set('x-csrf-token', 'zz')
      .set('Cookie', 'ryuksaidso_csrf=%zz')
      .send({ title: 'valid title' });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });
});
