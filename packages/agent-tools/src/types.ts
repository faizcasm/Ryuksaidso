export type ToolContext = {
  user: { id: string; email: string; name: string; organizationId: string; role: string };
  runId: string;
  agentId?: string | null;
};

export type ToolDef = {
  name: string;
  description: string;
  /** UI grouping for the agent tool picker (Knowledge, Utilities, ...). */
  category: string;
  scope: string;
  requiresApproval: boolean;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

export type BuildToolsDeps = {
  /** Injected Prisma client (API and worker each pass their own). */
  prisma: any;
  /** Extra tools merged in (e.g. tools discovered from configured MCP servers). */
  extra?: Record<string, ToolDef>;
};
