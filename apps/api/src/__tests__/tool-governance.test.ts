import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OBS_LOGS_KEY,
  OBS_REQUESTS_KEY,
  buildDatabaseTools,
  buildObservabilityTools,
  buildTools,
  getObservabilitySummary,
  getRecentErrors,
  isAdminRole,
  isSystemAdmin,
  redactSecrets,
  searchRequestLogs,
  toolAllowedForRole,
} from '@ryuksaidso/agent-tools';
import { createApp } from '../server';
import { signToken } from '../lib/auth';
import { prisma } from '../lib/db';

vi.mock('../lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() }
  }
}));

process.env.PROMETHEUS_URL = 'http://127.0.0.1:9';
process.env.LOKI_URL = 'http://127.0.0.1:9';

const ctxFor = (role: string, userRole?: string) => ({
  user: { id: 'u1', email: 'user@test.local', name: 'User', organizationId: 'org1', role, userRole },
  runId: 'run1',
});

const ADMIN_TOOLS = [
  'database_schema', 'database_query', 'database_explain', 'database_insert', 'database_update',
  'get_observability_summary', 'get_service_health', 'get_system_metrics', 'get_recent_errors',
  'search_request_logs', 'prometheus_query', 'loki_query',
];

const WRITE_TOOLS = [
  'database_insert', 'database_update',
  'send_email', 'reply_email',
  'fs_write',
  'github_create_issue', 'github_update_issue', 'github_comment_issue', 'github_create_branch', 'github_create_pull_request',
  'calendar_create_event', 'calendar_update_event', 'calendar_delete_event',
  'add_ticket_message',
];

const AUTO_READ_TOOLS = [
  'database_schema', 'database_query', 'database_explain',
  'search_email', 'read_email',
  'fs_list', 'fs_read', 'fs_search',
  'github_search_repositories', 'github_read_file', 'github_get_pull_request',
  'calendar_list_events', 'fetch_page', 'web_search',
  'search_knowledge', 'get_ticket', 'current_time',
];

describe('role helpers', () => {
  it('treats OWNER and ADMIN as admin roles', () => {
    expect(isAdminRole('OWNER')).toBe(true);
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('AGENT')).toBe(false);
    expect(isAdminRole('VIEWER')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole('')).toBe(false);
  });

  it('allows non-admin roles only when the tool is not adminOnly', () => {
    expect(toolAllowedForRole({ adminOnly: true }, 'VIEWER')).toBe(false);
    expect(toolAllowedForRole({ adminOnly: true }, 'AGENT')).toBe(false);
    expect(toolAllowedForRole({ adminOnly: true }, 'ADMIN')).toBe(true);
    expect(toolAllowedForRole({ adminOnly: true }, 'OWNER')).toBe(true);
    expect(toolAllowedForRole({}, 'VIEWER')).toBe(true);
    expect(toolAllowedForRole({}, undefined)).toBe(true);
  });

  it('grants admin tool access only to the system ADMIN role', () => {
    expect(isSystemAdmin({ userRole: 'ADMIN' })).toBe(true);
    expect(isSystemAdmin({ userRole: 'USER' })).toBe(false);
    expect(isSystemAdmin({ userRole: undefined })).toBe(false);
    expect(isSystemAdmin({})).toBe(false);
    expect(isSystemAdmin(null)).toBe(false);
    expect(isSystemAdmin(undefined)).toBe(false);
  });
});

describe('tool registry governance flags', () => {
  const tools = buildTools({ prisma: {} });

  it('marks every database and observability tool as adminOnly', () => {
    for (const name of ADMIN_TOOLS) {
      expect(tools[name], `${name} must exist`).toBeDefined();
      expect(tools[name].adminOnly, `${name} must be adminOnly`).toBe(true);
    }
  });

  it('does not restrict workspace tools (files, email, calendar, github, search) to admins', () => {
    for (const name of ['fs_list', 'fs_read', 'fs_write', 'search_email', 'read_email', 'send_email', 'reply_email', 'calendar_list_events', 'calendar_create_event', 'github_search_repositories', 'github_read_file', 'github_create_issue', 'web_search', 'fetch_page', 'github']) {
      expect(tools[name]?.adminOnly, `${name} must not be adminOnly`).toBeFalsy();
    }
  });

  it('requires approval for every side-effecting tool', () => {
    for (const name of WRITE_TOOLS) {
      expect(tools[name], `${name} must exist`).toBeDefined();
      expect(tools[name].requiresApproval, `${name} must require approval`).toBe(true);
    }
  });

  it('keeps read-only tools automatic (no approval)', () => {
    for (const name of AUTO_READ_TOOLS) {
      expect(tools[name], `${name} must exist`).toBeDefined();
      expect(tools[name].requiresApproval, `${name} must be automatic`).toBe(false);
    }
  });

  it('registers all eight discrete github tools plus fetch_page', () => {
    for (const name of ['github_search_repositories', 'github_read_file', 'github_create_issue', 'github_update_issue', 'github_comment_issue', 'github_create_branch', 'github_get_pull_request', 'github_create_pull_request', 'fetch_page']) {
      expect(Object.keys(tools)).toContain(name);
    }
  });
});

describe('database tool guards', () => {
  const prisma = {
    $queryRaw: async () => [
      { column_name: 'id' }, { column_name: 'name' }, { column_name: 'organizationId' },
    ],
    $queryRawUnsafe: vi.fn(async () => [{ id: 1, name: 'row', passwordHash: 'x', api_key: 'y' }]),
    auditLog: { create: async () => ({}) },
  };
  const tools = buildDatabaseTools(prisma);

  it('rejects non-admins with a thrown 403 before touching SQL', async () => {
    for (const name of ['database_schema', 'database_query', 'database_explain', 'database_insert', 'database_update']) {
      await expect(tools[name].execute({ sql: 'SELECT 1', table: 'x', values: { a: 1 }, where: { id: 1 } }, ctxFor('VIEWER') as any))
        .rejects.toThrow(/403 Forbidden/);
    }
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects workspace OWNER/ADMIN members who are not system admins', async () => {
    for (const role of ['OWNER', 'ADMIN']) {
      await expect(tools.database_query.execute({ sql: 'SELECT 1' }, ctxFor(role) as any))
        .rejects.toThrow(/403 Forbidden/);
    }
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('only allows a single SELECT or WITH statement', async () => {
    const out = await tools.database_query.execute({ sql: 'DELETE FROM "Ticket"' }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(out.error).toMatch(/Only SELECT/);
    const multi = await tools.database_query.execute({ sql: 'SELECT 1; DROP TABLE "User"' }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(multi.error).toMatch(/single SQL statement/);
    const ddl = await tools.database_query.execute({ sql: 'CREATE TABLE evil (id int)' }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(ddl.error).toMatch(/Only SELECT/);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('blocks dangerous PostgreSQL functions', async () => {
    const out = await tools.database_query.execute({ sql: "SELECT pg_read_file('/etc/passwd')" }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(out.error).toMatch(/blocked/);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('executes read queries and redacts secret columns from rows', async () => {
    const out = await tools.database_query.execute({ sql: 'SELECT id, name, "passwordHash" FROM "User"', limit: 10 }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(out.error).toBeUndefined();
    expect(out.rowCount).toBe(1);
    expect(out.rows[0].passwordHash).toBe('[REDACTED]');
    expect(out.rows[0].api_key).toBe('[REDACTED]');
    expect(out.rows[0].name).toBe('row');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('SELECT id'));
  });

  it('validates identifiers and columns for inserts and forces the caller organization', async () => {
    const badTable = await tools.database_insert.execute({ table: 'Ticket; DROP TABLE x', values: { name: 'a' } }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(badTable.error).toMatch(/Invalid table name/);
    const badColumn = await tools.database_insert.execute({ table: 'Ticket', values: { 'bad col': 1 } }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(badColumn.error).toMatch(/Invalid column name/);
    const unknownColumn = await tools.database_insert.execute({ table: 'Ticket', values: { nope: 1 } }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(unknownColumn.error).toMatch(/Unknown column/);
    (prisma.$queryRawUnsafe as any).mockClear();
    await tools.database_insert.execute({ table: 'Ticket', values: { name: 'keep', organizationId: 'evil-org' } }, ctxFor('OWNER', 'ADMIN') as any);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, ...params] = (prisma.$queryRawUnsafe as any).mock.calls[0];
    expect(sql).toMatch(/INSERT INTO "Ticket"/);
    expect(params).toContain('org1');
    expect(params).not.toContain('evil-org');
  });

  it('requires a where filter for updates', async () => {
    const out = await tools.database_update.execute({ table: 'Ticket', values: { name: 'x' }, where: {} }, ctxFor('OWNER', 'ADMIN') as any) as any;
    expect(out.error).toMatch(/where must be a non-empty object/);
  });
});

describe('observability tools (admin-only + presentation payloads)', () => {
  const obs = buildObservabilityTools({ prisma: { auditLog: { create: async () => ({}) } }, redis: null });

  it('throws 403 for every observability tool when the caller is not an admin', async () => {
    for (const name of ADMIN_TOOLS.slice(5)) {
      await expect(obs[name].execute({ query: 'up', sinceMinutes: 5, limit: 5 }, ctxFor('AGENT') as any))
        .rejects.toThrow(/403 Forbidden/);
    }
  });

  it('throws 403 for workspace owners who are not system admins', async () => {
    for (const name of ADMIN_TOOLS.slice(5)) {
      await expect(obs[name].execute({ query: 'up', sinceMinutes: 5, limit: 5 }, ctxFor('OWNER') as any))
        .rejects.toThrow(/403 Forbidden/);
    }
    await expect(obs.get_observability_summary.execute({}, ctxFor('ADMIN') as any))
      .rejects.toThrow(/403 Forbidden/);
  });

  it('produces a visual presentation payload with a root cause when errors exist', async () => {
    const requests = [
      JSON.stringify({ t: Date.now() - 60_000, method: 'POST', path: '/api/runs', status: 500, ms: 120, requestId: 'req-500-1' }),
      JSON.stringify({ t: Date.now() - 30_000, method: 'GET', path: '/api/me', status: 200, ms: 12 }),
    ];
    const logs = [
      JSON.stringify({ t: Date.now() - 20_000, level: 'error', message: 'boom password: hunter2secret', meta: { apiKey: 'sk-abcdefghijklmnopqrstuv' } }),
    ];
    const redis = {
      ping: async () => 'PONG',
      lrange: async (key: string) => (key === OBS_REQUESTS_KEY ? requests : logs),
      lpush: async () => 1,
      ltrim: async () => 'OK',
      expire: async () => 1,
    };
    const result = await getRecentErrors({ prisma: {}, redis } as any, { sinceMinutes: 60, limit: 10 });
    expect(result.count).toBeGreaterThanOrEqual(2);
    const requestError = (result.errors as any[]).find((entry) => entry.source === 'request');
    expect(requestError).toMatchObject({ status: 500, method: 'POST', path: '/api/runs', requestId: 'req-500-1' });
    const logError = (result.errors as any[]).find((entry) => entry.source === 'application');
    expect(logError.message).not.toContain('hunter2secret');
    expect(JSON.stringify(logError.meta ?? {})).not.toContain('abcdefghijklmnopqrstuv');
    expect(result.stats.errors5xx).toBe(1);
    expect(result.presentation.kind).toBe('observability');
    expect(result.presentation.rootCause).toBeTruthy();
    expect(result.presentation.metrics.some((metric) => metric.label === 'Errors (5xx)')).toBe(true);
  });

  it('filters the request ring by status and query text', async () => {
    const requests = [
      JSON.stringify({ t: Date.now() - 60_000, method: 'POST', path: '/api/runs', status: 500, ms: 120, requestId: 'r1' }),
      JSON.stringify({ t: Date.now() - 50_000, method: 'GET', path: '/api/me', status: 200, ms: 12, requestId: 'r2' }),
    ];
    const redis = {
      ping: async () => 'PONG',
      lrange: async (key: string) => (key === OBS_REQUESTS_KEY ? requests : []),
      lpush: async () => 1,
      ltrim: async () => 'OK',
      expire: async () => 1,
    };
    const byStatus = await searchRequestLogs({ prisma: {}, redis } as any, { status: '5xx' });
    expect(byStatus.totalMatched).toBe(1);
    expect(byStatus.entries[0]).toMatchObject({ status: 500, requestId: 'r1' });
    const byQuery = await searchRequestLogs({ prisma: {}, redis } as any, { q: '/api/me' });
    expect(byQuery.totalMatched).toBe(1);
    expect(byQuery.entries[0].path).toBe('/api/me');
    const byMethod = await searchRequestLogs({ prisma: {}, redis } as any, { method: 'POST' });
    expect(byMethod.totalMatched).toBe(1);
    expect(byMethod.entries[0].method).toBe('POST');
  });

  it('summarizes system + services + stats with a presentational status', async () => {
    const deps = {
      prisma: { $queryRaw: async () => [{ ok: 1 }], auditLog: { create: async () => ({}) } },
      redis: { ping: async () => 'PONG', lrange: async () => [], lpush: async () => 1, ltrim: async () => 'OK', expire: async () => 1 },
    };
    const summary = await getObservabilitySummary(deps as any);
    expect(['healthy', 'degraded', 'critical']).toContain(summary.status);
    expect(summary.presentation.kind).toBe('observability');
    expect(summary.presentation.metrics.length).toBeGreaterThanOrEqual(6);
    expect(summary.presentation.metrics.some((metric) => metric.label === 'Error rate (1h)')).toBe(true);
    expect(summary.services.map((service) => service.name)).toEqual(expect.arrayContaining(['PostgreSQL', 'Redis', 'API']));
    expect(summary.backends.sources).toContain('api-native');
    expect(summary.stats).toHaveProperty('p95Ms');
  });
});

describe('redactSecrets', () => {
  it('redacts API keys, tokens, JWTs and password values', () => {
    expect(redactSecrets('key rsk_BfrI5JxCGwiOz5xA2Zb9AjlWwZnC-Rxa9jOXx662Fkk leaked')).not.toContain('BfrI5');
    expect(redactSecrets('Bearer sk-91837d29e828c152-68c82f-e3207343')).not.toContain('91837d');
    expect(redactSecrets('{"password":"SuperSecret123"}')).not.toContain('SuperSecret123');
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnop')).not.toContain('abcdefghijklmnop');
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.5cQzYx2vVn8pQ3wErTyUiOpAsDfGhJkLz';
    expect(redactSecrets(jwt)).not.toContain('5cQzYx2v');
    expect(redactSecrets({ apiKey: 'ghp_abcdefghij1234567890ABCD' })).not.toContain('ghp_');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactSecrets('The deploy finished in 42 seconds')).toBe('The deploy finished in 42 seconds');
  });
});

describe('file system tool guards', () => {
  const tools = buildTools({ prisma: {} });

  it('refuses to read paths outside the workspace file root', async () => {
    const out = await tools.fs_read.execute({ path: '../../../etc/passwd' }, ctxFor('AGENT') as any) as any;
    expect(out.error).toMatch(/Path escapes the workspace file root/);
  });

  it('treats absolute paths as workspace-relative instead of following them', async () => {
    const out = await tools.fs_read.execute({ path: '/etc/passwd' }, ctxFor('AGENT') as any) as any;
    expect(out.error).toBeTruthy();
    expect(out.error).not.toMatch(/Path escapes/);
  });
});

describe('fetch_page (SSRF guard + readable extraction)', () => {
  const tools = buildTools({ prisma: {} });

  it('refuses private and internal hosts', async () => {
    const out = await tools.fetch_page.execute({ url: 'http://localhost:4001/api/admin' }, ctxFor('AGENT') as any) as any;
    expect(out.error).toMatch(/private\/internal host/);
    const internal = await tools.fetch_page.execute({ url: 'https://metadata.google.internal/compute' }, ctxFor('AGENT') as any) as any;
    expect(internal.error).toMatch(/private\/internal host/);
  });

  it('returns title, readable text and relevant passages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><head><title>Widget Handbook</title></head><body><h1>Widgets</h1><p>Widgets are small mechanical parts. A widget needs oiling every week.</p></body></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )));
    try {
      const out = await tools.fetch_page.execute({ url: 'https://docs.example.com/widgets', query: 'oiling' }, ctxFor('AGENT') as any) as any;
      expect(out.error).toBeUndefined();
      expect(out.title).toBe('Widget Handbook');
      expect(out.text).toContain('Widgets are small mechanical parts');
      expect(out.wordCount).toBeGreaterThan(5);
      expect(Array.isArray(out.passages)).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('web_search filters (news, domain and recency filtering)', () => {
  const tools = buildTools({ prisma: {} });
  const html = (body: string, status = 200) => Promise.resolve(new Response(body, { status }));
  const anomaly = '<html><head><title>DuckDuckGo</title></head><body>Our systems have detected an anomaly challenge.</body></html>';
  const rfcDate = (date: Date) => date.toUTCString();
  const rssItem = (title: string, link: string, description: string, published: string, source?: string) =>
    `<item><title>${title}</title><link>${link}</link><description>${description}</description><pubDate>${published}</pubDate>${source ? `<source url="https://example.com">${source}</source>` : ''}</item>`;
  const rss = (items: string) => `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>feed</title>${items}</channel></rss>`;

  it('searches news outlets with publication dates and sources', async () => {
    const published = new Date(Date.now() - 26 * 3600_000);
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('news.google.com')) {
        return html(rss(rssItem('AI safety rules published', 'https://www.bbc.co.uk/news/ai-rules', 'Regulators published new guidance.', rfcDate(published), 'BBC')));
      }
      if (u.includes('duckduckgo')) return html(anomaly, 202);
      if (u.includes('format=rss')) return html(rss(''));
      return html('');
    }));
    try {
      const out = await tools.web_search.execute({ query: 'AI safety rules', type: 'news' }, ctxFor('AGENT') as any) as any;
      expect(out.error).toBeUndefined();
      expect(out.engine).toBe('google-news');
      expect(out.type).toBe('news');
      expect(out.results[0]).toMatchObject({ title: 'AI safety rules published', source: 'BBC' });
      expect(out.results[0].publishedAt).toBeTruthy();
      expect(Date.parse(out.results[0].publishedAt)).toBeGreaterThan(Date.now() - 3 * 86400_000);
    } finally { vi.unstubAllGlobals(); }
  });

  it('keeps only results from the requested domains', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('duckduckgo')) return html(anomaly, 202);
      if (u.includes('format=rss')) {
        return html(rss(
          rssItem('Node.js on Example', 'https://example.com/nodejs', 'Node.js runtime docs on example.com', rfcDate(new Date()))
          + rssItem('Node.js elsewhere', 'https://blog.other-site.dev/nodejs', 'Node.js tips', rfcDate(new Date())),
        ));
      }
      return html('');
    }));
    try {
      const out = await tools.web_search.execute({ query: 'node.js', domains: ['example.com'] }, ctxFor('AGENT') as any) as any;
      expect(out.error).toBeUndefined();
      expect(out.engine).toBe('bing');
      expect(out.results).toHaveLength(1);
      expect(out.results[0].url).toContain('example.com');
      expect(out.filters.domains).toEqual(['example.com']);
    } finally { vi.unstubAllGlobals(); }
  });

  it('drops results older than the recency window and reports the filter', async () => {
    const stale = new Date(Date.now() - 60 * 86400_000);
    const fresh = new Date(Date.now() - 2 * 86400_000);
    const run = (itemDate: Date) => {
      vi.stubGlobal('fetch', vi.fn((url: string) => {
        const u = String(url);
        if (u.includes('duckduckgo')) return html(anomaly, 202);
        if (u.includes('format=rss')) return html(rss(rssItem('Node.js LTS release', 'https://nodejs.org/en/release', 'Node.js LTS details.', rfcDate(itemDate))));
        if (u.includes('wikipedia.org')) return Promise.resolve(new Response(JSON.stringify({ query: { search: [] } })));
        return html('');
      }));
    };
    try {
      run(stale);
      const old = await tools.web_search.execute({ query: 'node.js lts', freshness: 'week' }, ctxFor('AGENT') as any) as any;
      expect(old.results ?? []).toHaveLength(0);
      expect(JSON.stringify(old)).toMatch(/no results with dates inside the last 7 day/);
      vi.unstubAllGlobals();

      run(fresh);
      const recent = await tools.web_search.execute({ query: 'node.js lts', freshness: 'week' }, ctxFor('AGENT') as any) as any;
      expect(recent.error).toBeUndefined();
      expect(recent.engine).toBe('bing');
      expect(recent.results).toHaveLength(1);
      expect(recent.filters.freshness).toBe('week');
      expect(recent.filters.publishedSince).toBeTruthy();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('GET /api/tools role filtering', () => {
  const app = createApp();
  const owner = signToken({ id: 'o1', email: 'owner@test.local', name: 'Owner', organizationId: 'org1', role: 'OWNER', userRole: 'ADMIN' });
  const ownerUser = signToken({ id: 'o3', email: 'workspace-owner@test.local', name: 'Workspace Owner', organizationId: 'org1', role: 'OWNER', userRole: 'USER' });
  const viewer = signToken({ id: 'v1', email: 'viewer@test.local', name: 'Viewer', organizationId: 'org1', role: 'VIEWER' });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/tools');
    expect(response.status).toBe(401);
  });

  it('serves the full catalog including admin tools to system admins', async () => {
    const response = await request(app).get('/api/tools').set('Authorization', `Bearer ${owner}`);
    expect(response.status).toBe(200);
    const names = (response.body as Array<{ name: string }>).map((tool) => tool.name);
    for (const name of ADMIN_TOOLS) expect(names).toContain(name);
    expect(names).toContain('web_search');
    expect(names).toContain('fs_read');
  });

  it('hides database and observability tools from non-admin members', async () => {
    const response = await request(app).get('/api/tools').set('Authorization', `Bearer ${viewer}`);
    expect(response.status).toBe(200);
    const names = (response.body as Array<{ name: string }>).map((tool) => tool.name);
    for (const name of ADMIN_TOOLS) expect(names).not.toContain(name);
    expect(names).toContain('web_search');
    expect(names).toContain('fetch_page');
    expect(names).toContain('send_email');
    expect(names.length).toBeGreaterThan(20);
  });

  it('hides database and observability tools from workspace owners who are not system admins', async () => {
    const response = await request(app).get('/api/tools').set('Authorization', `Bearer ${ownerUser}`);
    expect(response.status).toBe(200);
    const names = (response.body as Array<{ name: string }>).map((tool) => tool.name);
    for (const name of ADMIN_TOOLS) expect(names).not.toContain(name);
    expect(names).toContain('web_search');
    expect(names).toContain('fs_read');
  });
});

describe('admin endpoints require the system ADMIN role', () => {
  const app = createApp();
  const ownerUser = signToken({ id: 'o5', email: 'ws-owner@test.local', name: 'WS Owner', organizationId: 'org1', role: 'OWNER', userRole: 'USER' });
  const viewer = signToken({ id: 'v3', email: 'viewer3@test.local', name: 'Viewer', organizationId: 'org1', role: 'VIEWER' });

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it('rejects requests without credentials', async () => {
    const response = await request(app).get('/api/admin/observability/summary');
    expect(response.status).toBe(401);
  });

  it('rejects workspace owners who are not system admins', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
    const response = await request(app).get('/api/admin/observability/summary').set('Authorization', `Bearer ${ownerUser}`);
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/Admin access required/);
  });

  it('rejects viewers on every observability endpoint', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
    for (const path of ['/api/admin/observability/errors', '/api/admin/observability/requests', '/api/admin/observability/backends']) {
      const response = await request(app).get(path).set('Authorization', `Bearer ${viewer}`);
      expect(response.status).toBe(403);
    }
  });

  it('rejects non system admins from the system users overview', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ userRole: 'USER' } as never);
    const response = await request(app).get('/api/admin/users/overview').set('Authorization', `Bearer ${ownerUser}`);
    expect(response.status).toBe(403);
  });
});
