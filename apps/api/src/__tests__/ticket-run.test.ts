import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/db';
import { enqueueRun } from '../services/queue';
import { signToken } from '../lib/auth';
import { appRouter } from '../routes/app';

vi.mock('../lib/db', () => ({
  prisma: {
    ticket: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    agentRun: { create: vi.fn(), count: vi.fn(async () => 0) },
    auditLog: { create: vi.fn() },
    user: { findUnique: vi.fn() }
  }
}));

vi.mock('../services/queue', () => ({
  enqueueRun: vi.fn()
}));

const actor = { id: 'u1', email: 'test@example.com', name: 'Test', organizationId: 'org1', role: 'OWNER' };
const token = signToken(actor);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', appRouter);
  return app;
}

function seed({ organization, agent }: { organization: unknown; agent?: unknown }) {
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ id: 't1', title: 'Login broken', description: 'Users cannot sign in' } as never);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(organization as never);
  vi.mocked(prisma.agent.findFirst).mockResolvedValue((agent ?? {
    id: 'a1',
    projectId: 'p1',
    slug: 'resolution',
    versions: [{ id: 'v1' }]
  }) as never);
  vi.mocked(prisma.agentRun.create).mockResolvedValue({ id: 'run-1' } as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(enqueueRun).mockResolvedValue({ id: 'job-1' } as never);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/tickets/:id/run', () => {
  it('uses the workspace OLLAMA provider and its model', async () => {
    seed({ organization: { llmProvider: 'OLLAMA', ollamaModel: 'qwen-local', omnirouteModel: 'or-model' } });

    const response = await request(buildApp())
      .post('/api/tickets/t1/run')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ jobId: 'job-1', runId: 'run-1' });
    expect(vi.mocked(prisma.agentRun.create).mock.calls[0][0].data.provider).toBe('OLLAMA');
    expect(enqueueRun).toHaveBeenCalledWith('run-1', 'org1', expect.objectContaining({ id: 'u1' }));
  });

  it('uses the workspace OMNIROUTE provider when it is selected', async () => {
    seed({ organization: { llmProvider: 'OMNIROUTE', ollamaModel: 'qwen-local', omnirouteModel: 'or-model' } });

    const response = await request(buildApp())
      .post('/api/tickets/t1/run')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(202);
    expect(vi.mocked(prisma.agentRun.create).mock.calls[0][0].data.provider).toBe('OMNIROUTE');
  });

  it('falls back to the default provider when the workspace has none', async () => {
    seed({ organization: null });

    const response = await request(buildApp())
      .post('/api/tickets/t1/run')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(202);
    expect(vi.mocked(prisma.agentRun.create).mock.calls[0][0].data.provider).toBe('OLLAMA');
  });

  it('rejects with 409 when the selected provider has no model configured', async () => {
    vi.stubEnv('OMNIROUTE_MODEL', '');
    seed({ organization: { llmProvider: 'OMNIROUTE', ollamaModel: 'qwen-local', omnirouteModel: null } });

    const response = await request(buildApp())
      .post('/api/tickets/t1/run')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('ProviderNotConfigured');
    expect(response.body.message).toContain('OMNIROUTE');
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(enqueueRun).not.toHaveBeenCalled();
  });

  it('answers 404 for a ticket outside the workspace', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null as never);

    const response = await request(buildApp())
      .post('/api/tickets/t1/run')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it('answers 409 when the resolution agent is not configured', async () => {
    seed({ organization: { llmProvider: 'OLLAMA', ollamaModel: 'qwen-local' }, agent: null });
    vi.mocked(prisma.agent.findFirst).mockResolvedValue(null as never);

    const response = await request(buildApp())
      .post('/api/tickets/t1/run')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Conflict');
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const response = await request(buildApp()).post('/api/tickets/t1/run');
    expect(response.status).toBe(401);
  });
});
