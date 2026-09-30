export type ToolContext = {
  user: { id: string; email: string; name: string; organizationId: string; role: string };
  runId: string;
  agentId?: string | null;
};

export type ToolDef = {
  name: string;
  description: string;
  category: string;
  scope: string;
  requiresApproval: boolean;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

export type BuildToolsDeps = {
  prisma: any;
  extra?: Record<string, ToolDef>;
};
