import { describe, expect, it } from 'vitest';
import {
  acceptInvitationSchema,
  approvalDecisionSchema,
  createAgentSchema,
  createDocumentSchema,
  createPolicySchema,
  createProjectSchema,
  createRunSchema,
  createTicketSchema,
  createVersionSchema,
  evaluationSchema,
  forgotPasswordSchema,
  inviteMemberSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateAgentSchema,
  updatePolicySchema,
  updateProjectSchema
} from '../validation';

describe('registerSchema', () => {
  it('accepts a valid registration', () => {
    const parsed = registerSchema.parse({ email: ' user@example.com ', password: 'password123', name: ' User ', organizationName: ' Acme ' });
    expect(parsed.email).toBe('user@example.com');
    expect(parsed.name).toBe('User');
    expect(parsed.organizationName).toBe('Acme');
  });

  it('rejects a malformed email', () => {
    expect(registerSchema.safeParse({ email: 'nope', password: 'password123', name: 'User' }).success).toBe(false);
  });

  it('rejects a short password', () => {
    expect(registerSchema.safeParse({ email: 'user@example.com', password: 'short', name: 'User' }).success).toBe(false);
  });

  it('rejects an email longer than 320 characters', () => {
    const email = `${'a'.repeat(310)}@example.com`;
    expect(registerSchema.safeParse({ email, password: 'password123', name: 'User' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('requires both credentials', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com' }).success).toBe(false);
    expect(loginSchema.safeParse({ password: 'password123' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'user@example.com', password: 'x' }).success).toBe(true);
  });
});

describe('password reset schemas', () => {
  it('validates forgot-password by email only', () => {
    expect(forgotPasswordSchema.parse({ email: ' a@b.co ' }).email).toBe('a@b.co');
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('requires a long token and a 12+ character password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'short', password: 'longenough123' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 't'.repeat(20), password: 'short' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 't'.repeat(20), password: 'longenough123' }).success).toBe(true);
  });
});

describe('createTicketSchema', () => {
  it('accepts a minimal ticket and trims the title', () => {
    const parsed = createTicketSchema.parse({ title: '  Broken login  ', description: '  Users cannot sign in  ' });
    expect(parsed.title).toBe('Broken login');
    expect(parsed.description).toBe('Users cannot sign in');
    expect(parsed.requesterEmail).toBeUndefined();
  });

  it('rejects an empty title or description', () => {
    expect(createTicketSchema.safeParse({ title: ' ', description: 'body' }).success).toBe(false);
    expect(createTicketSchema.safeParse({ title: 'ok', description: ' ' }).success).toBe(false);
  });

  it('rejects an invalid requester email', () => {
    expect(createTicketSchema.safeParse({ title: 'ok', description: 'body', requesterEmail: 'not-an-email' }).success).toBe(false);
  });
});

describe('createDocumentSchema', () => {
  it('defaults the source to manual', () => {
    expect(createDocumentSchema.parse({ title: 'Doc', content: 'body' }).source).toBe('manual');
  });

  it('accepts a null agentId and rejects a non-cuid one', () => {
    expect(createDocumentSchema.safeParse({ title: 'Doc', content: 'body', agentId: null }).success).toBe(true);
    expect(createDocumentSchema.safeParse({ title: 'Doc', content: 'body', agentId: 'not-a-cuid' }).success).toBe(false);
  });
});

describe('approvalDecisionSchema', () => {
  it('only accepts a boolean decision', () => {
    expect(approvalDecisionSchema.safeParse({ approved: true }).success).toBe(true);
    expect(approvalDecisionSchema.safeParse({ approved: 'yes' }).success).toBe(false);
    expect(approvalDecisionSchema.safeParse({}).success).toBe(false);
  });
});

describe('evaluationSchema', () => {
  it('defaults to an empty dataset', () => {
    expect(evaluationSchema.parse({}).dataset).toEqual([]);
  });

  it('rejects a blank case input', () => {
    expect(evaluationSchema.safeParse({ dataset: [{ input: ' ', expectedIntent: 'billing' }] }).success).toBe(false);
  });
});

describe('project and agent schemas', () => {
  it('enforces slug format', () => {
    expect(createProjectSchema.safeParse({ name: 'Acme', slug: 'Acme Org', description: 'A project description' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: 'Acme', slug: 'acme-org', description: 'A project description' }).success).toBe(true);
    expect(createProjectSchema.safeParse({ name: 'Acme', slug: 'acme_org', description: 'A project description' }).success).toBe(false);
  });

  it('requires a meaningful project description', () => {
    expect(createProjectSchema.safeParse({ name: 'Acme', slug: 'acme', description: 'short' }).success).toBe(false);
  });

  it('rejects an empty agent update', () => {
    expect(updateAgentSchema.safeParse({}).success).toBe(false);
    expect(updateAgentSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('rejects an empty project update', () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
    expect(updateProjectSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(true);
  });

  it('defaults agent tools to search_knowledge', () => {
    expect(createAgentSchema.parse({ name: 'Support', slug: 'support', instructions: 'Answer customer questions' }).tools).toEqual(['search_knowledge']);
  });

  it('rejects a project id that is not a cuid', () => {
    expect(createAgentSchema.safeParse({ projectId: 'nope', name: 'Support', slug: 'support', instructions: 'Answer customer questions' }).success).toBe(false);
  });
});

describe('run and version schemas', () => {
  it('converts an empty projectId to undefined', () => {
    expect(createRunSchema.parse({ agentId: 'cmf0000000000000000000000', prompt: 'go', projectId: '' }).projectId).toBeUndefined();
  });

  it('rejects an unknown provider', () => {
    expect(createRunSchema.safeParse({ agentId: 'cmf0000000000000000000000', prompt: 'go', provider: 'OPENAI' }).success).toBe(false);
  });

  it('defaults environment and trigger', () => {
    const parsed = createRunSchema.parse({ agentId: 'cmf0000000000000000000000', prompt: 'go' });
    expect(parsed.environment).toBe('development');
    expect(parsed.trigger).toBe('playground');
  });

  it('defaults publish to false', () => {
    expect(createVersionSchema.parse({}).publish).toBe(false);
  });
});

describe('policy schemas', () => {
  it('applies safe defaults', () => {
    const parsed = createPolicySchema.parse({ name: 'Block refunds', description: 'Blocks refund actions for review', action: 'refund.create' });
    expect(parsed.enabled).toBe(true);
    expect(parsed.requiresApproval).toBe(false);
    expect(parsed.severity).toBe('medium');
  });

  it('rejects an invalid severity', () => {
    expect(createPolicySchema.safeParse({ name: 'Block refunds', description: 'Blocks refund actions for review', action: 'refund.create', severity: 'fatal' }).success).toBe(false);
  });

  it('rejects an empty policy update', () => {
    expect(updatePolicySchema.safeParse({}).success).toBe(false);
  });

  it('does not leak create defaults into a partial policy update', () => {
    const parsed = updatePolicySchema.parse({ name: 'Block refunds' });
    expect(parsed).toEqual({ name: 'Block refunds' });
  });
});

describe('invitation schemas', () => {
  it('defaults the invited role to VIEWER', () => {
    expect(inviteMemberSchema.parse({ email: 'teammate@example.com' }).role).toBe('VIEWER');
  });

  it('rejects a role outside the workspace role set', () => {
    expect(inviteMemberSchema.safeParse({ email: 'teammate@example.com', role: 'OWNER' }).success).toBe(false);
  });

  it('requires an acceptance token', () => {
    expect(acceptInvitationSchema.safeParse({ token: 'x' }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: 't'.repeat(20) }).success).toBe(true);
  });
});
