export type SystemUserMembership = {
  role: string;
  organization: { id: string; name: string };
};

export type SystemUserRow = {
  id: string;
  email: string;
  name: string;
  userRole: string;
  emailVerifiedAt: Date | string | null;
  createdAt: Date | string;
  memberships: SystemUserMembership[];
};

export type OrgCount = { organizationId: string; count: number; tokens?: number | null };

export type SystemUsersInput = {
  users: SystemUserRow[];
  totalUsers: number;
  totalOrgs: number;
  windowStart: Date;
  newInWindow: number;
  orgProjectCounts: OrgCount[];
  orgAgentCounts: OrgCount[];
  orgRunCounts: OrgCount[];
  lastSeen: { userId: string; lastSeenAt: Date | string | null }[];
  activeSessions: { userId: string; count: number }[];
};

export type SystemUserOverview = {
  id: string;
  name: string;
  email: string;
  userRole: string;
  verified: boolean;
  status: 'active' | 'idle' | 'new';
  createdAt: string;
  lastActiveAt: string | null;
  activeSessions: number;
  projects: number;
  agents: number;
  runs: number;
  tokens: number;
  orgs: { id: string; name: string; role: string; projects: number; agents: number; runs: number; tokens: number }[];
};

export type SystemUsersOverview = {
  totals: {
    users: number;
    admins: number;
    verified: number;
    workspaces: number;
    activeSessions: number;
    projects: number;
    agents: number;
    runs: number;
    tokens: number;
  };
  registrations: { daily: { date: string; new: number }[]; beforeWindow: number };
  roleSplit: { role: string; users: number }[];
  topUsers: { id: string; name: string; runs: number; tokens: number }[];
  users: SystemUserOverview[];
  truncated: boolean;
  generatedAt: string;
};

function toTime(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function iso(value: Date | string | null | undefined): string | null {
  const time = toTime(value);
  return time ? new Date(time).toISOString() : null;
}

function countMap(rows: OrgCount[]): Map<string, number> {
  return new Map(rows.map((row) => [row.organizationId, Number(row.count) || 0]));
}

function tokenMap(rows: OrgCount[]): Map<string, number> {
  return new Map(rows.map((row) => [row.organizationId, Number(row.tokens) || 0]));
}

export function buildSystemUsersOverview(input: SystemUsersInput): SystemUsersOverview {
  const projectCounts = countMap(input.orgProjectCounts);
  const agentCounts = countMap(input.orgAgentCounts);
  const runCounts = countMap(input.orgRunCounts);
  const runTokens = tokenMap(input.orgRunCounts);
  const lastSeen = new Map(input.lastSeen.map((row) => [row.userId, toTime(row.lastSeenAt)]));
  const activeSessions = new Map(input.activeSessions.map((row) => [row.userId, Number(row.count) || 0]));

  const windowMs = input.windowStart.getTime();
  const now = Date.now();
  const dayMs = 86_400_000;
  const days = Math.max(1, Math.ceil((now - windowMs) / dayMs));
  const daily: { date: string; new: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(windowMs + i * dayMs);
    daily.push({ date: day.toISOString().slice(0, 10), new: 0 });
  }
  const dailyIndex = new Map(daily.map((entry, index) => [entry.date, index]));

  const roleSplitMap = new Map<string, number>();
  const users: SystemUserOverview[] = input.users.map((row) => {
    const createdMs = toTime(row.createdAt);
    roleSplitMap.set(String(row.userRole), (roleSplitMap.get(String(row.userRole)) ?? 0) + 1);

    const createdKey = new Date(createdMs).toISOString().slice(0, 10);
    const dayIndex = dailyIndex.get(createdKey);
    if (dayIndex !== undefined) daily[dayIndex].new += 1;

    let projects = 0;
    let agents = 0;
    let runs = 0;
    let tokens = 0;
    const orgs = row.memberships.map((membership) => {
      const orgId = membership.organization.id;
      const orgProjects = projectCounts.get(orgId) ?? 0;
      const orgAgents = agentCounts.get(orgId) ?? 0;
      const orgRuns = runCounts.get(orgId) ?? 0;
      const orgTokens = runTokens.get(orgId) ?? 0;
      projects += orgProjects;
      agents += orgAgents;
      runs += orgRuns;
      tokens += orgTokens;
      return {
        id: orgId,
        name: membership.organization.name,
        role: membership.role,
        projects: orgProjects,
        agents: orgAgents,
        runs: orgRuns,
        tokens: orgTokens,
      };
    });

    const lastActiveMs = lastSeen.get(row.id) ?? 0;
    const status: SystemUserOverview['status'] = !lastActiveMs
      ? createdMs > windowMs
        ? 'new'
        : 'idle'
      : now - lastActiveMs < 30 * dayMs
        ? 'active'
        : 'idle';

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      userRole: String(row.userRole),
      verified: Boolean(row.emailVerifiedAt),
      status,
      createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
      lastActiveAt: lastActiveMs ? new Date(lastActiveMs).toISOString() : null,
      activeSessions: activeSessions.get(row.id) ?? 0,
      projects,
      agents,
      runs,
      tokens,
      orgs,
    };
  });

  users.sort((a, b) => {
    const byLastSeen = toTime(b.lastActiveAt) - toTime(a.lastActiveAt);
    if (byLastSeen) return byLastSeen;
    return toTime(b.createdAt) - toTime(a.createdAt);
  });

  const topUsers = [...users]
    .sort((a, b) => b.tokens - a.tokens || b.runs - a.runs || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map(({ id, name, runs, tokens }) => ({ id, name, runs, tokens }));

  const totals = users.reduce(
    (acc, row) => ({
      users: acc.users,
      admins: acc.admins + (row.userRole === 'ADMIN' ? 1 : 0),
      verified: acc.verified + (row.verified ? 1 : 0),
      workspaces: acc.workspaces,
      activeSessions: acc.activeSessions + row.activeSessions,
      projects: acc.projects,
      agents: acc.agents,
      runs: acc.runs,
      tokens: acc.tokens,
    }),
    {
      users: input.totalUsers,
      admins: 0,
      verified: 0,
      workspaces: input.totalOrgs,
      activeSessions: 0,
      projects: [...projectCounts.values()].reduce((n, value) => n + value, 0),
      agents: [...agentCounts.values()].reduce((n, value) => n + value, 0),
      runs: [...runCounts.values()].reduce((n, value) => n + value, 0),
      tokens: [...runTokens.values()].reduce((n, value) => n + value, 0),
    },
  );

  return {
    totals,
    registrations: {
      daily,
      beforeWindow: Math.max(0, input.totalUsers - input.newInWindow),
    },
    roleSplit: [...roleSplitMap.entries()]
      .map(([role, count]) => ({ role, users: count }))
      .sort((a, b) => b.users - a.users),
    topUsers,
    users,
    truncated: input.users.length < input.totalUsers,
    generatedAt: new Date().toISOString(),
  };
}
