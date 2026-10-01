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
  adminOnly?: boolean;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

export type ObsRedis = {
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  lpush(key: string, ...values: string[]): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  ping?(): Promise<string>;
};

export type BuildToolsDeps = {
  prisma: any;
  redis?: ObsRedis | null;
  extra?: Record<string, ToolDef>;
};

export const ADMIN_ROLES = ['OWNER', 'ADMIN'];

export function isAdminRole(role: string | undefined | null): boolean {
  return ADMIN_ROLES.includes(String(role ?? ''));
}

export function toolAllowedForRole(tool: Pick<ToolDef, 'adminOnly'>, role: string | undefined | null): boolean {
  return !tool.adminOnly || isAdminRole(role);
}
