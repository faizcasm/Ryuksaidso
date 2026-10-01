import { describe, expect, it } from 'vitest';
import { buildSystemUsersOverview, type SystemUsersInput } from '../lib/admin-users';

const windowStart = new Date();
windowStart.setDate(windowStart.getDate() - 14);
windowStart.setHours(0, 0, 0, 0);

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600_000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

function fixture(overrides: Partial<SystemUsersInput> = {}): SystemUsersInput {
  return {
    users: [
      {
        id: 'admin1',
        email: 'admin@test.local',
        name: 'Ada Admin',
        userRole: 'ADMIN',
        emailVerifiedAt: daysAgo(40),
        createdAt: daysAgo(3),
        memberships: [{ role: 'OWNER', organization: { id: 'org1', name: 'Alpha Workspace' } }],
      },
      {
        id: 'user1',
        email: 'member@test.local',
        name: 'Ben Member',
        userRole: 'USER',
        emailVerifiedAt: null,
        createdAt: daysAgo(100),
        memberships: [
          { role: 'VIEWER', organization: { id: 'org1', name: 'Alpha Workspace' } },
          { role: 'AGENT', organization: { id: 'org2', name: 'Beta Workspace' } },
        ],
      },
    ],
    totalUsers: 2,
    totalOrgs: 2,
    windowStart,
    newInWindow: 1,
    orgProjectCounts: [
      { organizationId: 'org1', count: 3 },
      { organizationId: 'org2', count: 1 },
    ],
    orgAgentCounts: [
      { organizationId: 'org1', count: 4 },
      { organizationId: 'org2', count: 2 },
    ],
    orgRunCounts: [
      { organizationId: 'org1', count: 10, tokens: 5000 },
      { organizationId: 'org2', count: 5, tokens: 1500 },
    ],
    lastSeen: [{ userId: 'admin1', lastSeenAt: hoursAgo(2) }],
    activeSessions: [{ userId: 'admin1', count: 2 }],
    ...overrides,
  };
}

describe('buildSystemUsersOverview', () => {
  it('aggregates platform totals, role split and registrations', () => {
    const overview = buildSystemUsersOverview(fixture());

    expect(overview.totals).toEqual({
      users: 2,
      admins: 1,
      verified: 1,
      workspaces: 2,
      activeSessions: 2,
      projects: 4,
      agents: 6,
      runs: 15,
      tokens: 6500,
    });
    expect(overview.roleSplit).toEqual(expect.arrayContaining([
      { role: 'ADMIN', users: 1 },
      { role: 'USER', users: 1 },
    ]));
    expect(overview.registrations.daily.length).toBeGreaterThanOrEqual(14);
    expect(overview.registrations.daily.reduce((n, day) => n + day.new, 0)).toBe(1);
    expect(overview.registrations.beforeWindow).toBe(1);
    expect(overview.truncated).toBe(false);
    expect(overview.generatedAt).toBeTruthy();
  });

  it('attributes projects, agents, runs and tokens across every workspace membership', () => {
    const overview = buildSystemUsersOverview(fixture());
    const admin = overview.users.find((user) => user.id === 'admin1');
    const member = overview.users.find((user) => user.id === 'user1');

    expect(admin).toMatchObject({
      name: 'Ada Admin',
      userRole: 'ADMIN',
      verified: true,
      status: 'active',
      activeSessions: 2,
      projects: 3,
      agents: 4,
      runs: 10,
      tokens: 5000,
      orgs: [{ id: 'org1', name: 'Alpha Workspace', role: 'OWNER', projects: 3, agents: 4, runs: 10, tokens: 5000 }],
    });
    expect(admin?.lastActiveAt).toBeTruthy();

    expect(member).toMatchObject({
      userRole: 'USER',
      verified: false,
      status: 'idle',
      activeSessions: 0,
      projects: 4,
      agents: 6,
      runs: 15,
      tokens: 6500,
      lastActiveAt: null,
    });
    expect(member?.orgs).toHaveLength(2);
    expect(member?.orgs.find((org) => org.id === 'org2')).toMatchObject({ role: 'AGENT', projects: 1, agents: 2, runs: 5, tokens: 1500 });
  });

  it('sorts users by recent activity, ranks top consumers and flags truncation', () => {
    const overview = buildSystemUsersOverview(fixture({ totalUsers: 400 }));

    expect(overview.users[0].id).toBe('admin1');
    expect(overview.users[1].id).toBe('user1');
    expect(overview.topUsers[0]).toMatchObject({ id: 'user1', tokens: 6500, runs: 15 });
    expect(overview.topUsers).toHaveLength(2);
    expect(overview.truncated).toBe(true);
    expect(overview.totals.users).toBe(400);
  });

  it('marks brand new accounts without sessions as new', () => {
    const overview = buildSystemUsersOverview(fixture({
      users: [{
        id: 'fresh1',
        email: 'fresh@test.local',
        name: 'Fresh User',
        userRole: 'USER',
        emailVerifiedAt: null,
        createdAt: hoursAgo(5),
        memberships: [],
      }],
      totalUsers: 1,
      totalOrgs: 0,
      lastSeen: [],
      activeSessions: [],
      orgProjectCounts: [],
      orgAgentCounts: [],
      orgRunCounts: [],
      newInWindow: 1,
    }));

    expect(overview.users[0]).toMatchObject({ status: 'new', projects: 0, agents: 0, runs: 0, tokens: 0 });
    expect(overview.users[0].orgs).toEqual([]);
    expect(overview.totals).toMatchObject({ users: 1, admins: 0, verified: 0, workspaces: 0 });
  });
});
