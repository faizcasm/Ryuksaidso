import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server';
import { signToken } from '../lib/auth';

describe('API', () => {
  const app = createApp();

  it('returns health status without requiring auth', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('rejects protected routes without authentication', async () => {
    const response = await request(app).get('/api/me');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });

  it('serves the documented public routes without authentication', async () => {
    for (const path of ['/api/', '/api/docs', '/api/docs/agents', '/api/docs/api/auth', '/api/architecture', '/api/architecture/visualize']) {
      const response = await request(app).get(path);
      expect(response.status, `${path} must stay public`).toBe(200);
    }
  });

  it('keeps application routes behind authentication when docs are mounted first', async () => {
    const runs = await request(app).get('/api/runs');
    expect(runs.status).toBe(401);
    const tickets = await request(app).get('/api/tickets');
    expect(tickets.status).toBe(401);
  });

  it('validates ticket payload before touching the database', async () => {
    const token = signToken({ id: 'u1', email: 'test@example.com', name: 'Test User', organizationId: 'org1', role: 'OWNER' });
    const response = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .set('x-csrf-token', 'test-csrf-token')
      .set('Cookie', 'ryuksaidso_csrf=test-csrf-token')
      .send({ title: '' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
    expect(response.body.message).toContain('title');
    expect(Array.isArray(response.body.issues)).toBe(true);
  });

  it('returns a structured 404', async () => {
    const response = await request(app).get('/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NotFound');
  });

  it('rejects unauthenticated API key renames', async () => {
    const response = await request(app)
      .patch('/api/api-keys/key1')
      .set('x-csrf-token', 'test-csrf-token')
      .set('Cookie', 'ryuksaidso_csrf=test-csrf-token');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });

  it('validates API key rename payloads before touching the database', async () => {
    const token = signToken({ id: 'u1', email: 'test@example.com', name: 'Test User', organizationId: 'org1', role: 'OWNER' });
    const response = await request(app)
      .patch('/api/api-keys/key1')
      .set('Authorization', `Bearer ${token}`)
      .set('x-csrf-token', 'test-csrf-token')
      .set('Cookie', 'ryuksaidso_csrf=test-csrf-token')
      .send({ name: 'x' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
    expect(response.body.message).toContain('API key name');
  });
});

describe('observability', () => {
  it('exposes Prometheus metrics', async () => {
    const response = await request(createApp()).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.text).toContain('ryuksaidso_http_requests_total');
  });
});
