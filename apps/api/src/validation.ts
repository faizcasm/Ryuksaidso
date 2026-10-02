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
  dataset: z.array(z.object({ id:z.string().max(200).optional(), input:z.string().trim().min(1).max(50_000), expectedIntent:z.string().trim().min(1).max(200) })).max(500).default([])
});

export const updateAgentSchema = z.object({ name:z.string().trim().min(1).max(120).optional(), instructions:z.string().trim().min(1).max(20_000).optional(), systemPrompt:z.string().trim().max(30_000).nullable().optional(), enabled:z.boolean().optional(), projectId:z.string().cuid().nullable().optional(), tools:z.array(z.string().trim().min(1).max(120)).max(50).optional() }).refine(v=>Object.keys(v).length>0);
export const createProjectSchema = z.object({ name:z.string().trim().min(2).max(120), slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), description:z.string().trim().min(10).max(1000) });
export const updateProjectSchema = z.object({ name:z.string().trim().min(2).max(120).optional(), description:z.string().trim().min(10).max(1000).optional(), status:z.enum(['ACTIVE','PAUSED','ARCHIVED']).optional(), productionVersion:z.string().max(80).nullable().optional() }).refine(v=>Object.keys(v).length>0);
export const createAgentSchema = z.object({ projectId:z.string().cuid().optional(), name:z.string().trim().min(2).max(120), slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), instructions:z.string().trim().min(10).max(20_000), systemPrompt:z.string().trim().max(30_000).optional(), tools:z.array(z.string().trim().min(1).max(120)).max(50).default(['search_knowledge']) });
export const createVersionSchema = z.object({ changelog:z.string().trim().max(1000).optional(), config:z.record(z.string(),z.unknown()).optional(), publish:z.boolean().default(false) });
export const createRunSchema = z.object({ provider:z.string().trim().regex(/^(OLLAMA|OMNIROUTE)$|^c[a-z0-9]{20,40}$/, 'Invalid provider').optional(), projectId:z.preprocess(v=>v===''?undefined:v, z.string().cuid().optional()), agentId:z.string().cuid(), prompt:z.string().trim().min(1).max(100_000), environment:z.string().trim().min(1).max(50).default('development'), trigger:z.string().trim().min(1).max(80).default('playground'), metadata:z.record(z.string(),z.unknown()).optional() });
export const createPolicySchema = z.object({ name:z.string().trim().min(2).max(120), description:z.string().trim().min(5).max(500), action:z.string().trim().min(2).max(120), enabled:z.boolean().default(true), requiresApproval:z.boolean().default(false), severity:z.enum(['low','medium','high','critical']).default('medium'), conditions:z.record(z.string(),z.unknown()).optional() });
export const updatePolicySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(5).max(500).optional(),
  action: z.string().trim().min(2).max(120).optional(),
  enabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  severity: z.enum(['low','medium','high','critical']).optional(),
  conditions: z.record(z.string(), z.unknown()).optional()
}).refine(v=>Object.keys(v).length>0);


export const inviteMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(['ADMIN','AGENT','VIEWER']).default('VIEWER')
});
export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(300) });

export const checkoutSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
  period: z.enum(['MONTHLY','YEARLY']).default('MONTHLY'),
  phone: z.string().trim().max(20).optional()
}).refine(v => {
  if (!v.phone) return true;
  const digits = v.phone.replace(/[^0-9]/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local);
}, {
  message: 'Enter a valid 10-digit Indian mobile number',
  path: ['phone']
});

export const cancelSubscriptionSchema = z.object({
  mode: z.enum(['immediate','at_period_end']).default('at_period_end')
});

export const verifyCheckoutSchema = z.object({
  subscriptionId: z.string().trim().min(3).max(250)
});

const billingLimitsShape = {
  maxAgents: z.number().int().min(0).max(1_000_000).optional(),
  maxMembers: z.number().int().min(0).max(1_000_000).optional(),
  maxTicketsPerMonth: z.number().int().min(0).max(1_000_000).optional(),
  maxRunsPerMonth: z.number().int().min(0).max(1_000_000).optional(),
  maxApiKeys: z.number().int().min(0).max(10_000).optional(),
  apiAccess: z.boolean().optional(),
  analyticsAccess: z.boolean().optional()
};

export const adminPlanUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(400).optional(),
  priceMonthly: z.number().int().min(0).max(100_000_000).optional(),
  priceYearly: z.number().int().min(0).max(1_000_000_000).optional(),
  active: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  features: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  ...billingLimitsShape
}).refine(v=>Object.keys(v).length>0);

export const adminPlanCreateSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Code must be lowercase alphanumeric with dashes'),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(400).default(''),
  priceMonthly: z.number().int().min(0).max(100_000_000).default(0),
  priceYearly: z.number().int().min(0).max(1_000_000_000).default(0),
  sortOrder: z.number().int().min(0).max(1000).default(10),
  features: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  maxAgents: z.number().int().min(0).max(1_000_000).default(0),
  maxMembers: z.number().int().min(0).max(1_000_000).default(0),
  maxTicketsPerMonth: z.number().int().min(0).max(1_000_000).default(0),
  maxRunsPerMonth: z.number().int().min(0).max(1_000_000).default(0),
  maxApiKeys: z.number().int().min(0).max(10_000).default(0),
  apiAccess: z.boolean().default(true),
  analyticsAccess: z.boolean().default(true)
});

export const adminSubscriptionActionSchema = z.object({
  action: z.enum(['cancel','sync'])
});

export const adminSubscriptionStatusSchema = z.object({
  status: z.enum(['ACTIVE','PENDING','HALTED','CANCELLED','PAUSED','COMPLETED','EXPIRED'])
});

export const billingSettingsSchema = z.object({
  billingEnabled: z.boolean()
});

export const connectTokenSchema = z.object({
  provider: z.string().trim().regex(/^[a-z][a-z0-9_]{1,31}$/),
  fields: z.record(z.string().trim().max(60), z.string().trim().max(2000)).default({}),
  shop: z.string().trim().max(120).optional()
});

export const knowledgeSourceCreateSchema = z.object({
  provider: z.string().trim().regex(/^[a-z][a-z0-9_]{1,31}$/),
  connectionId: z.string().trim().max(60).optional(),
  name: z.string().trim().min(1).max(120),
  remotePath: z.string().trim().max(300).default(''),
  autoSync: z.boolean().default(true)
});

export const knowledgeSourceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  remotePath: z.string().trim().max(300).optional(),
  autoSync: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional()
}).refine(v => Object.keys(v).length > 0);

export const webhookEndpointCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().url().max(500),
  events: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  active: z.boolean().default(true)
});

export const webhookEndpointUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  url: z.string().trim().url().max(500).optional(),
  events: z.array(z.string().trim().min(1).max(80)).min(1).max(30).optional(),
  active: z.boolean().optional()
}).refine(v => Object.keys(v).length > 0);

export const widgetSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  agentId: z.string().cuid().nullable().optional(),
  title: z.string().trim().min(1).max(80).optional(),
  greeting: z.string().trim().min(1).max(300).optional(),
  accent: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  allowedOrigins: z.array(z.string().trim().url().max(200)).max(20).optional(),
  collectEmail: z.boolean().optional()
}).refine(v => Object.keys(v).length > 0);

export const integrationSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  disabledProviders: z.array(z.string().trim().regex(/^[a-z][a-z0-9_]{1,31}$/)).max(50).optional()
}).refine(v => Object.keys(v).length > 0);

export const widgetMessageSchema = z.object({
  sessionId: z.string().trim().max(60).optional(),
  content: z.string().trim().min(1).max(4000),
  email: z.string().trim().email().max(320).optional(),
  visitorId: z.string().trim().max(80).optional()
});

export const modelProviderCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['openai_compat', 'ollama']).default('openai_compat'),
  baseUrl: z.string().trim().min(1).max(300),
  apiKey: z.string().trim().max(400).optional(),
  defaultModel: z.string().trim().max(200).default(''),
  models: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  enabled: z.boolean().default(true)
});

export const modelProviderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  kind: z.enum(['openai_compat', 'ollama']).optional(),
  baseUrl: z.string().trim().min(1).max(300).optional(),
  apiKey: z.string().trim().max(400).optional(),
  defaultModel: z.string().trim().max(200).optional(),
  models: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  enabled: z.boolean().optional()
});

export const modelProviderDiscoverSchema = z.object({
  kind: z.enum(['openai_compat', 'ollama']).default('openai_compat'),
  baseUrl: z.string().trim().min(1).max(300),
  apiKey: z.string().trim().max(400).optional()
});
