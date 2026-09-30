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
    // the message names the offending field so clients can show something useful
    expect(response.body.message).toContain('title');
    expect(Array.isArray(response.body.issues)).toBe(true);
  });

  it('returns a structured 404', async () => {
    const response = await request(app).get('/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NotFound');
  });
});

// Metrics are intentionally public so Prometheus can scrape them without a user token.
// The endpoint must still return a valid Prometheus exposition payload.
describe('observability', () => {
  it('exposes Prometheus metrics', async () => {
    const response = await request(createApp()).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.text).toContain('ryuksaidso_http_requests_total');
  });
});
