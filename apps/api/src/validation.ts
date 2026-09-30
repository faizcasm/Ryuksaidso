import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(2).max(100),
  organizationName: z.string().trim().min(2).max(120).optional()
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128)
});

export const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(320) });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(300), password: z.string().min(12).max(128) });

export const createTicketSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(50_000),
  requesterEmail: z.string().trim().email().max(320).optional()
});

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  source: z.string().trim().max(500).default('manual'),
  content: z.string().min(1).max(2_000_000),
  agentId: z.string().cuid().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const approvalDecisionSchema = z.object({ approved: z.boolean() });
export const evaluationSchema = z.object({
  agentId:z.string().cuid().optional(),
  projectId:z.string().cuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  dataset: z.array(z.object({ id:z.string().max(200).optional(), input:z.string().trim().min(1).max(50_000), expectedIntent:z.string().trim().min(1).max(200) })).default([])
});

export const updateAgentSchema = z.object({ name:z.string().trim().min(1).max(120).optional(), instructions:z.string().trim().min(1).max(20_000).optional(), systemPrompt:z.string().trim().max(30_000).nullable().optional(), enabled:z.boolean().optional(), projectId:z.string().cuid().nullable().optional(), tools:z.array(z.string().trim().min(1).max(120)).max(50).optional() }).refine(v=>Object.keys(v).length>0);
export const createProjectSchema = z.object({ name:z.string().trim().min(2).max(120), slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), description:z.string().trim().min(10).max(1000) });
export const updateProjectSchema = z.object({ name:z.string().trim().min(2).max(120).optional(), description:z.string().trim().min(10).max(1000).optional(), status:z.enum(['ACTIVE','PAUSED','ARCHIVED']).optional(), productionVersion:z.string().max(80).nullable().optional() }).refine(v=>Object.keys(v).length>0);
export const createAgentSchema = z.object({ projectId:z.string().cuid().optional(), name:z.string().trim().min(2).max(120), slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), instructions:z.string().trim().min(10).max(20_000), systemPrompt:z.string().trim().max(30_000).optional(), tools:z.array(z.string().trim().min(1).max(120)).max(50).default(['search_knowledge']) });
export const createVersionSchema = z.object({ changelog:z.string().trim().max(1000).optional(), config:z.record(z.string(),z.unknown()).optional(), publish:z.boolean().default(false) });
export const createRunSchema = z.object({ provider:z.enum(['OLLAMA','OMNIROUTE']).optional(), projectId:z.preprocess(v=>v===''?undefined:v, z.string().cuid().optional()), agentId:z.string().cuid(), prompt:z.string().trim().min(1).max(100_000), environment:z.string().trim().min(1).max(50).default('development'), trigger:z.string().trim().min(1).max(80).default('playground'), metadata:z.record(z.string(),z.unknown()).optional() });
export const createPolicySchema = z.object({ name:z.string().trim().min(2).max(120), description:z.string().trim().min(5).max(500), action:z.string().trim().min(2).max(120), enabled:z.boolean().default(true), requiresApproval:z.boolean().default(false), severity:z.enum(['low','medium','high','critical']).default('medium'), conditions:z.record(z.string(),z.unknown()).optional() });
export const updatePolicySchema = createPolicySchema.partial().refine(v=>Object.keys(v).length>0);


export const inviteMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(['ADMIN','AGENT','VIEWER']).default('VIEWER')
});
export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(300) });
