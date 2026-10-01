import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import { redactSecrets, softFail } from './util';
import { isAdminRole, type ObsRedis, type ToolDef } from './types';

export const OBS_REQUESTS_KEY = 'obs:requests';
export const OBS_LOGS_KEY = 'obs:logs';
export const OBS_MAX_REQUESTS = 2000;
export const OBS_MAX_LOGS = 1000;
export const OBS_TTL_SECONDS = 2 * 24 * 3600;

export type ObsRequestEntry = {
  t: number;
  method: string;
  path: string;
  status: number;
  ms: number;
  requestId?: string;
  userId?: string;
  ip?: string;
};

export type ObsLogEntry = {
  t: number;
  level: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type ObsService = { name: string; ok: boolean | undefined; detail: string; latencyMs?: number | null };
export type ObsMetric = { label: string; value: string; tone?: 'good' | 'warn' | 'bad' };
export type ObsPresentation = {
  kind: 'observability';
  title: string;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  generatedAt: string;
  metrics: ObsMetric[];
  services?: ObsService[];
  errors?: Array<Record<string, unknown>>;
  rootCause?: string;
  actions?: Array<{ label: string; url: string; disabled?: boolean }>;
  sources: string[];
};

type Deps = { prisma?: any; redis?: ObsRedis | null };

const docker = () => process.env.DOCKER_RUNTIME === 'true';
const envUrl = (key: string, fallback: string): string => (process.env[key]?.trim() || fallback);
const prometheusUrl = () => envUrl('PROMETHEUS_URL', docker() ? 'http://prometheus:9090' : 'http://localhost:9090');
const lokiUrl = () => envUrl('LOKI_URL', docker() ? 'http://loki:3100' : 'http://localhost:3100');
const grafanaUrl = () => (process.env.GRAFANA_URL?.trim() || (docker() ? '' : 'http://localhost:3001'));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchOk(url: string, timeoutMs = 2000, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' as RequestRedirect });
}

async function probe(url: string, timeoutMs = 2500): Promise<{ ok: boolean; status?: number; ms: number; error?: string }> {
  const started = Date.now();
  try {
    const response = await fetchOk(url, timeoutMs);
    return { ok: response.status < 500, status: response.status, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function prometheusAvailable(timeoutMs = 1500): Promise<{ configured: boolean; reachable: boolean; url: string; error?: string }> {
  const url = prometheusUrl();
  const result = await probe(`${url}/-/ready`, timeoutMs);
  return { configured: true, reachable: result.ok, url, ...(result.error ? { error: result.error } : { status: result.status }) };
}

export async function lokiAvailable(timeoutMs = 1500): Promise<{ configured: boolean; reachable: boolean; url: string; error?: string }> {
  const url = lokiUrl();
  const result = await probe(`${url}/ready`, timeoutMs);
  return { configured: true, reachable: result.ok, url, ...(result.error ? { error: result.error } : { status: result.status }) };
}

export async function getBackends() {
  const [prometheus, loki] = await Promise.all([prometheusAvailable(), lokiAvailable()]);
  const grafana = grafanaUrl();
  return {
    prometheus,
    loki,
    grafana: { configured: Boolean(grafana), url: grafana },
    sources: ['api-native', ...(prometheus.reachable ? ['prometheus'] : []), ...(loki.reachable ? ['loki'] : [])],
  };
}

async function readRing(redis: ObsRedis | null | undefined, key: string, limit: number): Promise<Array<Record<string, unknown>>> {
  if (!redis?.lrange) return [];
  try {
    const raw = await redis.lrange(key, 0, limit - 1);
    const entries: Array<Record<string, unknown>> = [];
    for (const line of raw) {
      try {
        entries.push(JSON.parse(line));
      } catch {}
    }
    return entries;
  } catch {
    return [];
  }
}

export async function appendObsRequest(redis: ObsRedis | null | undefined, entry: ObsRequestEntry) {
  if (!redis?.lpush) return;
  try {
    await redis.lpush(OBS_REQUESTS_KEY, JSON.stringify(redactSecrets(entry)));
    await redis.ltrim(OBS_REQUESTS_KEY, 0, OBS_MAX_REQUESTS - 1);
    await redis.expire(OBS_REQUESTS_KEY, OBS_TTL_SECONDS);
  } catch {}
}

export async function appendObsLog(redis: ObsRedis | null | undefined, entry: ObsLogEntry) {
  if (!redis?.lpush) return;
  try {
    const safe: ObsLogEntry = {
      ...entry,
      message: String(redactSecrets(String(entry.message).slice(0, 4000))),
      ...(entry.meta ? { meta: redactSecrets(entry.meta) as Record<string, unknown> } : {}),
    };
    await redis.lpush(OBS_LOGS_KEY, JSON.stringify(safe));
    await redis.ltrim(OBS_LOGS_KEY, 0, OBS_MAX_LOGS - 1);
    await redis.expire(OBS_LOGS_KEY, OBS_TTL_SECONDS);
  } catch {}
}

type RequestStats = {
  windowMinutes: number;
  total: number;
  errors5xx: number;
  clientErrors4xx: number;
  errorRatePct: number;
  avgMs: number;
  p95Ms: number;
  requestsPerMinute: number;
  byStatus: Array<{ status: number; count: number }>;
  topErrorPaths: Array<{ path: string; status: number; count: number }>;
};

function requestStats(entries: ObsRequestEntry[], windowMinutes: number): RequestStats {
  const cutoff = Date.now() - windowMinutes * 60_000;
  const recent = entries.filter((entry) => Number(entry?.t ?? 0) >= cutoff);
  const errors5xx = recent.filter((entry) => Number(entry?.status) >= 500).length;
  const clientErrors4xx = recent.filter((entry) => Number(entry?.status) >= 400 && Number(entry?.status) < 500).length;
  const durations = recent.map((entry) => Number(entry?.ms ?? 0)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const avgMs = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
  const p95Ms = durations.length ? Math.round(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]) : 0;
  const statusCounts = new Map<number, number>();
  const errorPaths = new Map<string, { path: string; status: number; count: number }>();
  for (const entry of recent) {
    const status = Number(entry?.status ?? 0);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (status >= 500) {
      const key = `${status} ${entry?.path ?? ''}`;
      const current = errorPaths.get(key) ?? { path: String(entry?.path ?? ''), status, count: 0 };
      current.count += 1;
      errorPaths.set(key, current);
    }
  }
  return {
    windowMinutes,
    total: recent.length,
    errors5xx,
    clientErrors4xx,
    errorRatePct: recent.length ? Math.round((errors5xx / recent.length) * 1000) / 10 : 0,
    avgMs,
    p95Ms,
    requestsPerMinute: Math.round((recent.length / windowMinutes) * 10) / 10,
    byStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    topErrorPaths: [...errorPaths.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

type SystemMetrics = {
  cpuPercent: number | null;
  loadAvg: number[];
  memory: { totalMb: number; usedMb: number; usedPct: number };
  disk: { totalGb: number; usedGb: number; usedPct: number } | null;
  uptimeSeconds: number;
  processRssMb: number;
  platform: string;
};

async function readProcStat(): Promise<{ total: number; idle: number } | null> {
  try {
    const text = await fsp.readFile('/proc/stat', 'utf8');
    const line = text.split('\n').find((row) => row.startsWith('cpu '));
    if (!line) return null;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const total = parts.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
    return { total, idle };
  } catch {
    return null;
  }
}

async function readMemory(): Promise<SystemMetrics['memory']> {
  try {
    const text = await fsp.readFile('/proc/meminfo', 'utf8');
    const pick = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, 'm').exec(text)?.[1] ?? 0);
    const totalKb = pick('MemTotal');
    const availableKb = pick('MemAvailable');
    if (!totalKb) throw new Error('no meminfo');
    const usedKb = Math.max(0, totalKb - availableKb);
    return { totalMb: Math.round(totalKb / 1024), usedMb: Math.round(usedKb / 1024), usedPct: Math.round((usedKb / totalKb) * 1000) / 10 };
  } catch {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return { totalMb: Math.round(total / 1048576), usedMb: Math.round(used / 1048576), usedPct: Math.round((used / total) * 1000) / 10 };
  }
}

async function readDisk(): Promise<SystemMetrics['disk']> {
  try {
    const stats = await fsp.statfs('/');
    const total = Number(stats.bsize) * Number(stats.blocks);
    const free = Number(stats.bsize) * Number(stats.bavail);
    const used = total - free;
    if (!total) return null;
    return { totalGb: Math.round((total / 1073741824) * 10) / 10, usedGb: Math.round((used / 1073741824) * 10) / 10, usedPct: Math.round((used / total) * 1000) / 10 };
  } catch {
    return null;
  }
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const before = await readProcStat();
  let cpuPercent: number | null = null;
  if (before) {
    await sleep(350);
    const after = await readProcStat();
    if (after) {
      const totalDelta = after.total - before.total;
      const idleDelta = after.idle - before.idle;
      if (totalDelta > 0) cpuPercent = Math.round((1 - idleDelta / totalDelta) * 1000) / 10;
    }
  }
  let loadAvg: number[] = [];
  let uptimeSeconds = 0;
  try {
    loadAvg = (await fsp.readFile('/proc/loadavg', 'utf8')).trim().split(/\s+/).slice(0, 3).map(Number);
  } catch {
    loadAvg = os.loadavg().slice(0, 3);
  }
  try {
    uptimeSeconds = Math.round(Number((await fsp.readFile('/proc/uptime', 'utf8')).split(/\s+/)[0]) || 0);
  } catch {
    uptimeSeconds = Math.round(os.uptime());
  }
  return {
    cpuPercent,
    loadAvg,
    memory: await readMemory(),
    disk: await readDisk(),
    uptimeSeconds,
    processRssMb: Math.round(process.memoryUsage().rss / 1048576),
    platform: `${os.type()} ${os.release()}`,
  };
}

export async function getServicesHealth(deps: Deps): Promise<ObsService[]> {
  const checks: Array<Promise<ObsService>> = [];
  const timed = async (name: string, url: string): Promise<ObsService> => {
    const result = await probe(url);
    return {
      name,
      ok: result.ok,
      detail: result.error ? result.error.slice(0, 140) : `HTTP ${result.status} in ${result.ms} ms`,
      latencyMs: result.ms,
    };
  };
  checks.push((async (): Promise<ObsService> => {
    const started = Date.now();
    try {
      if (deps.prisma?.$queryRaw) await deps.prisma.$queryRaw`SELECT 1`;
      else throw new Error('database client unavailable');
      return { name: 'PostgreSQL', ok: true, detail: `round-trip ${Date.now() - started} ms`, latencyMs: Date.now() - started };
    } catch (error) {
      return { name: 'PostgreSQL', ok: false, detail: (error instanceof Error ? error.message : String(error)).slice(0, 140), latencyMs: Date.now() - started };
    }
  })());
  checks.push((async (): Promise<ObsService> => {
    const started = Date.now();
    try {
      if (deps.redis?.ping) await deps.redis.ping();
      else throw new Error('redis client unavailable');
      return { name: 'Redis', ok: true, detail: `round-trip ${Date.now() - started} ms`, latencyMs: Date.now() - started };
    } catch (error) {
      return { name: 'Redis', ok: false, detail: (error instanceof Error ? error.message : String(error)).slice(0, 140), latencyMs: Date.now() - started };
    }
  })());
  const apiBase = envUrl('SERVICE_API_URL', docker() ? 'http://api:4001' : 'http://localhost:4001');
  const webBase = envUrl('SERVICE_WEB_URL', docker() ? 'http://web:3000' : 'http://localhost:3000');
  const proxyBase = envUrl('LLM_PROXY_URL', docker() ? 'http://host.docker.internal:20129' : 'http://localhost:20128');
  const omnirouteBase = envUrl('OMNIROUTE_URL', docker() ? 'http://host.docker.internal:20129/v1' : 'http://localhost:20128/v1').replace(/\/v1\/?$/, '');
  checks.push(timed('API', `${apiBase}/health`));
  checks.push(timed('Web', `${webBase}/`));
  checks.push((async (): Promise<ObsService> => {
    const result = await probe(`${proxyBase}/`, 2000);
    return { name: 'LLM proxy', ok: result.ok, detail: result.error ? result.error.slice(0, 140) : `HTTP ${result.status} in ${result.ms} ms`, latencyMs: result.ms };
  })());
  checks.push((async (): Promise<ObsService> => {
    const started = Date.now();
    try {
      const response = await fetchOk(`${omnirouteBase}/v1/models`, 3000, {
        headers: process.env.OMNIROUTE_API ? { authorization: `Bearer ${process.env.OMNIROUTE_API}` } : {},
      });
      const ok = response.ok;
      return { name: 'OmniRoute', ok, detail: ok ? `HTTP ${response.status} in ${Date.now() - started} ms` : `HTTP ${response.status}`, latencyMs: Date.now() - started };
    } catch (error) {
      return { name: 'OmniRoute', ok: false, detail: (error instanceof Error ? error.message : String(error)).slice(0, 140), latencyMs: Date.now() - started };
    }
  })());
  return Promise.all(checks);
}

async function recentRequestEntries(deps: Deps, sinceMinutes: number): Promise<ObsRequestEntry[]> {
  const entries = await readRing(deps.redis, OBS_REQUESTS_KEY, OBS_MAX_REQUESTS);
  const cutoff = Date.now() - sinceMinutes * 60_000;
  return (entries as ObsRequestEntry[]).filter((entry) => Number(entry?.t ?? 0) >= cutoff);
}

async function recentLogEntries(deps: Deps, sinceMinutes: number): Promise<ObsLogEntry[]> {
  const entries = await readRing(deps.redis, OBS_LOGS_KEY, OBS_MAX_LOGS);
  const cutoff = Date.now() - sinceMinutes * 60_000;
  return (entries as ObsLogEntry[]).filter((entry) => Number(entry?.t ?? 0) >= cutoff);
}

export async function getRecentErrors(deps: Deps, options: { sinceMinutes?: number; limit?: number } = {}) {
  const sinceMinutes = Math.min(Math.max(Number(options.sinceMinutes ?? 60) || 60, 1), 24 * 60);
  const limit = Math.min(Math.max(Number(options.limit ?? 20) || 20, 1), 100);
  const [requests, logs, backends] = await Promise.all([
    recentRequestEntries(deps, sinceMinutes),
    recentLogEntries(deps, sinceMinutes),
    getBackends(),
  ]);
  const requestErrors = requests
    .filter((entry) => Number(entry.status) >= 500)
    .map((entry) => ({
      t: new Date(entry.t).toISOString(),
      source: 'request',
      level: 'error',
      status: entry.status,
      method: entry.method,
      path: entry.path,
      requestId: entry.requestId ?? null,
      message: `${entry.status} ${entry.method} ${entry.path} took ${entry.ms} ms`,
    }));
  const logErrors = logs
    .filter((entry) => ['error', 'fatal'].includes(String(entry.level).toLowerCase()))
    .map((entry) => ({
      t: new Date(entry.t).toISOString(),
      source: 'application',
      level: entry.level,
      message: String(redactSecrets(String(entry.message).slice(0, 500))),
      meta: entry.meta ? (redactSecrets(entry.meta) as Record<string, unknown>) : undefined,
    }));
  let lokiErrors: any[] = [];
  let lokiNote: string | undefined;
  if (backends.loki.reachable) {
    try {
      const result = await queryLoki(`{job=~".+"} |~ "(?i)(error|failed|exception)"`, { limit: Math.min(limit, 50), sinceMinutes });
      lokiErrors = result.entries.map((entry: any) => ({ ...entry, source: 'loki' }));
    } catch (error) {
      lokiNote = `Loki query failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const merged = [...requestErrors, ...logErrors, ...lokiErrors]
    .sort((a: any, b: any) => String(b.t).localeCompare(String(a.t)))
    .slice(0, limit);
  const stats = requestStats(requests, sinceMinutes);
  const status: 'healthy' | 'degraded' | 'critical' = merged.length === 0 ? 'healthy' : stats.errors5xx >= 5 || stats.errorRatePct >= 5 ? 'critical' : 'degraded';
  const top = stats.topErrorPaths[0];
  const presentation: ObsPresentation = {
    kind: 'observability',
    title: 'Recent errors',
    status,
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'Errors (5xx)', value: String(stats.errors5xx), tone: stats.errors5xx ? 'bad' : 'good' },
      { label: 'Error rate', value: `${stats.errorRatePct}%`, tone: stats.errorRatePct >= 5 ? 'bad' : stats.errorRatePct >= 1 ? 'warn' : 'good' },
      { label: 'Requests', value: String(stats.total) },
      { label: 'Log errors', value: String(logErrors.length) },
    ],
    errors: merged.slice(0, 12) as any,
    ...(merged.length ? { rootCause: `${merged.length} error event(s) in the last ${sinceMinutes} minutes — ${top ? `most frequent: ${top.count}× ${top.status} on ${top.path}` : 'see log entries'}.` } : {}),
    sources: backends.sources,
  };
  return {
    sinceMinutes,
    count: merged.length,
    stats,
    errors: merged,
    ...(lokiNote ? { lokiNote } : {}),
    ...(backends.loki.reachable ? {} : { lokiNote: 'Loki not reachable — showing API-native error capture only.' }),
    presentation,
  };
}

export async function searchRequestLogs(deps: Deps, options: { q?: string; status?: string; method?: string; sinceMinutes?: number; limit?: number } = {}) {
  const sinceMinutes = Math.min(Math.max(Number(options.sinceMinutes ?? 60) || 60, 1), 24 * 60);
  const limit = Math.min(Math.max(Number(options.limit ?? 50) || 50, 1), 200);
  const q = String(options.q ?? '').trim().toLowerCase();
  const status = String(options.status ?? '').trim().toLowerCase();
  const method = String(options.method ?? '').trim().toUpperCase();
  const entries = await recentRequestEntries(deps, sinceMinutes);
  const filtered = entries.filter((entry) => {
    if (method && entry.method !== method) return false;
    if (status) {
      const code = Number(entry.status);
      if (/^[1-5]xx$/.test(status)) {
        if (Math.floor(code / 100) !== Number(status[0])) return false;
      } else if (String(entry.status) !== status) return false;
    }
    if (q && !`${entry.method} ${entry.path}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const stats = requestStats(entries, sinceMinutes);
  return {
    sinceMinutes,
    count: Math.min(filtered.length, limit),
    totalMatched: filtered.length,
    entries: filtered.slice(0, limit).map((entry) => ({
      t: new Date(entry.t).toISOString(),
      method: entry.method,
      path: entry.path,
      status: entry.status,
      ms: entry.ms,
      requestId: entry.requestId ?? null,
    })),
    stats,
  };
}

async function prometheusFetch(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${prometheusUrl().replace(/\/$/, '')}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchOk(url.toString(), 8000);
  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Prometheus returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok || data?.status === 'error') throw new Error(`Prometheus query failed: ${String(data?.error ?? `HTTP ${response.status}`).slice(0, 300)}`);
  return data?.data ?? {};
}

function prometheusResultRows(data: any): { rows: any[]; series: any[]; resultType: string } {
  const resultType = String(data?.resultType ?? '');
  const result = Array.isArray(data?.result) ? data.result : [];
  if (resultType === 'vector') {
    const rows = result.map((entry: any) => ({ metric: entry.metric ?? {}, value: entry.value?.[1] ?? null, at: entry.value?.[0] ? new Date(Number(entry.value[0]) * 1000).toISOString() : null }));
    return { rows, series: rows, resultType };
  }
  if (resultType === 'matrix') {
    const series = result.map((entry: any) => ({
      metric: entry.metric ?? {},
      points: (entry.values ?? []).map((point: any) => ({ t: new Date(Number(point[0]) * 1000).toISOString(), v: point[1] })),
    }));
    return { rows: series.flatMap((entry: any) => entry.points.map((point: any) => ({ metric: entry.metric, ...point }))), series, resultType };
  }
  if (resultType === 'scalar') return { rows: [{ metric: {}, value: result?.[1] ?? null }], series: [], resultType };
  return { rows: [], series: [], resultType };
}

async function queryLoki(query: string, options: { limit?: number; sinceMinutes?: number; start?: string; end?: string } = {}) {
  const limit = Math.min(Math.max(Number(options.limit ?? 100) || 100, 1), 1000);
  const end = options.end ? new Date(options.end) : new Date();
  const start = options.start ? new Date(options.start) : new Date(end.getTime() - (options.sinceMinutes ?? 30) * 60_000);
  const url = new URL(`${lokiUrl().replace(/\/$/, '')}/loki/api/v1/query_range`);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('start', String(BigInt(start.getTime()) * 1_000_000n));
  url.searchParams.set('end', String(BigInt(end.getTime()) * 1_000_000n));
  const response = await fetchOk(url.toString(), 8000);
  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Loki returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok || data?.status === 'error') throw new Error(`Loki query failed: ${String(data?.error ?? `HTTP ${response.status}`).slice(0, 300)}`);
  const streams = Array.isArray(data?.data?.result) ? data.data.result : [];
  const entries: any[] = [];
  for (const stream of streams) {
    for (const [ns, line] of stream.values ?? []) {
      let parsed: unknown = line;
      try {
        parsed = JSON.parse(line);
      } catch {}
      entries.push({ t: new Date(Number(BigInt(ns) / 1_000_000n)).toISOString(), labels: stream.stream ?? {}, line: redactSecrets(parsed) });
    }
  }
  entries.sort((a, b) => b.t.localeCompare(a.t));
  return { entries: entries.slice(0, limit), streams: streams.length };
}

export async function getObservabilitySummary(deps: Deps) {
  const [system, services, requests, logs, backends] = await Promise.all([
    getSystemMetrics(),
    getServicesHealth(deps),
    recentRequestEntries(deps, 60),
    recentLogEntries(deps, 60),
    getBackends(),
  ]);
  const stats = requestStats(requests, 60);
  const core = services.filter((service) => ['PostgreSQL', 'Redis', 'API'].includes(service.name));
  const coreDown = core.filter((service) => service.ok === false);
  const anyDown = services.filter((service) => service.ok === false);
  const logErrorCount = logs.filter((entry) => ['error', 'fatal'].includes(String(entry.level).toLowerCase())).length;
  const diskPct = system.disk?.usedPct ?? 0;

  let status: 'healthy' | 'degraded' | 'critical' | 'unknown' = 'healthy';
  const reasons: string[] = [];
  if (coreDown.length) {
    status = 'critical';
    reasons.push(`core service down: ${coreDown.map((service) => service.name).join(', ')}`);
  }
  if (stats.errorRatePct >= 5) {
    status = 'critical';
    reasons.push(`error rate ${stats.errorRatePct}% over the last hour`);
  }
  if (status !== 'critical') {
    if (anyDown.length) {
      status = 'degraded';
      reasons.push(`unhealthy: ${anyDown.map((service) => service.name).join(', ')}`);
    }
    if (stats.errorRatePct >= 1) {
      status = 'degraded';
      reasons.push(`error rate ${stats.errorRatePct}% over the last hour`);
    }
    if (diskPct >= 90) {
      status = 'degraded';
      reasons.push(`disk ${diskPct}% full`);
    }
    if (system.cpuPercent !== null && system.cpuPercent >= 90) {
      status = 'degraded';
      reasons.push(`CPU ${system.cpuPercent}%`);
    }
  }
  const topError = stats.topErrorPaths[0];
  const rootCause = reasons.length
    ? `Detected: ${reasons.join('; ')}.${topError ? ` Most frequent failure: ${topError.count}× ${topError.status} on ${topError.path}.` : ''}`
    : topError
      ? `No systemic failure, but ${topError.count}× ${topError.status} responses occurred on ${topError.path} in the last hour.`
      : undefined;

  const grafana = backends.grafana.configured ? [{ label: 'Open Grafana', url: backends.grafana.url }] : [];
  const presentation: ObsPresentation = {
    kind: 'observability',
    title: 'System observability',
    status,
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'API health', value: status === 'healthy' ? 'Healthy' : status === 'critical' ? 'Degraded' : 'Warning', tone: status === 'healthy' ? 'good' : status === 'critical' ? 'bad' : 'warn' },
      { label: 'Error rate (1h)', value: `${stats.errorRatePct}%`, tone: stats.errorRatePct >= 5 ? 'bad' : stats.errorRatePct >= 1 ? 'warn' : 'good' },
      { label: 'Requests (1h)', value: String(stats.total) },
      { label: 'p95 latency', value: `${stats.p95Ms} ms`, tone: stats.p95Ms >= 1000 ? 'warn' : 'good' },
      { label: 'CPU', value: system.cpuPercent === null ? 'n/a' : `${system.cpuPercent}%`, tone: (system.cpuPercent ?? 0) >= 90 ? 'bad' : (system.cpuPercent ?? 0) >= 70 ? 'warn' : 'good' },
      { label: 'Memory', value: `${system.memory.usedPct}%`, tone: system.memory.usedPct >= 90 ? 'bad' : system.memory.usedPct >= 75 ? 'warn' : 'good' },
      { label: 'Disk', value: `${diskPct}%`, tone: diskPct >= 90 ? 'bad' : diskPct >= 75 ? 'warn' : 'good' },
      { label: 'Log errors (1h)', value: String(logErrorCount), tone: logErrorCount ? 'warn' : 'good' },
    ],
    services,
    ...(rootCause ? { rootCause } : {}),
    ...(grafana.length ? { actions: grafana } : {}),
    sources: backends.sources,
  };
  return {
    generatedAt: presentation.generatedAt,
    status,
    system,
    services,
    stats,
    logErrorCount,
    backends,
    presentation,
  };
}

function assertAdmin(ctx: any) {
  if (!isAdminRole(ctx?.user?.role)) {
    const error: any = new Error('403 Forbidden: observability tools are restricted to administrators');
    error.statusCode = 403;
    throw error;
  }
}

export function buildObservabilityTools(deps: Deps): Record<string, ToolDef> {
  const audit = async (ctx: any, action: string, metadata: Record<string, unknown>) => {
    if (!deps.prisma?.auditLog) return;
    try {
      await deps.prisma.auditLog.create({
        data: {
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
          action,
          resource: 'tool',
          resourceId: 'observability',
          metadata: { runId: ctx.runId, ...metadata } as any,
        },
      });
    } catch {}
  };

  return {
    get_observability_summary: {
      name: 'get_observability_summary',
      description:
        'Overall system status in one snapshot: API health, error rate, request volume, latency, CPU/memory/disk, service health (Postgres, Redis, API, Web, LLM proxy, OmniRoute) and available observability backends. Returns a presentation payload for the dashboard. Admin only — returns 403 for non-admins.',
      category: 'Observability',
      scope: 'observability:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        const summary = await getObservabilitySummary(deps);
        await audit(ctx, 'tool.observability.summary', { status: summary.status });
        void input;
        return summary;
      },
    },

    get_service_health: {
      name: 'get_service_health',
      description:
        'Live health checks of every backing service: PostgreSQL, Redis, API, Web, LLM proxy and OmniRoute with latency and error details. Admin only — returns 403 for non-admins.',
      category: 'Observability',
      scope: 'observability:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        const [services, backends] = await Promise.all([getServicesHealth(deps), getBackends()]);
        const down = services.filter((service) => service.ok === false);
        const presentation: ObsPresentation = {
          kind: 'observability',
          title: 'Service health',
          status: down.some((service) => ['PostgreSQL', 'Redis', 'API'].includes(service.name)) ? 'critical' : down.length ? 'degraded' : 'healthy',
          generatedAt: new Date().toISOString(),
          metrics: [
            { label: 'Services up', value: `${services.length - down.length}/${services.length}`, tone: down.length ? 'warn' : 'good' },
            { label: 'Down', value: String(down.length), tone: down.length ? 'bad' : 'good' },
          ],
          services,
          ...(down.length ? { rootCause: `Unreachable: ${down.map((service) => `${service.name} (${service.detail})`).join('; ')}` } : {}),
          sources: backends.sources,
        };
        await audit(ctx, 'tool.observability.services', { down: down.length });
        void input;
        return { services, down: down.map((service) => service.name), generatedAt: presentation.generatedAt, presentation };
      },
    },

    get_system_metrics: {
      name: 'get_system_metrics',
      description:
        'Host/container resource metrics: CPU percent (sampled), load average, memory usage, disk usage, uptime and process RSS. Admin only — returns 403 for non-admins.',
      category: 'Observability',
      scope: 'observability:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        const system = await getSystemMetrics();
        const diskPct = system.disk?.usedPct ?? 0;
        const presentation: ObsPresentation = {
          kind: 'observability',
          title: 'System metrics',
          status: diskPct >= 95 || (system.cpuPercent ?? 0) >= 95 ? 'critical' : diskPct >= 85 || (system.cpuPercent ?? 0) >= 85 ? 'degraded' : 'healthy',
          generatedAt: new Date().toISOString(),
          metrics: [
            { label: 'CPU', value: system.cpuPercent === null ? 'n/a' : `${system.cpuPercent}%` },
            { label: 'Memory', value: `${system.memory.usedMb}/${system.memory.totalMb} MB`, tone: system.memory.usedPct >= 90 ? 'bad' : undefined },
            { label: 'Disk', value: system.disk ? `${system.disk.usedGb}/${system.disk.totalGb} GB` : 'n/a', tone: diskPct >= 90 ? 'bad' : undefined },
            { label: 'Load avg', value: system.loadAvg.map((value) => value.toFixed(2)).join(' ') || 'n/a' },
          ],
          sources: ['api-native'],
        };
        await audit(ctx, 'tool.observability.system', { cpu: system.cpuPercent, diskPct });
        void input;
        return { ...system, presentation };
      },
    },

    get_recent_errors: {
      name: 'get_recent_errors',
      description:
        'Recent API/server errors from the request ring buffer, application logs and (when available) Loki — with status codes, paths, request IDs, timestamps and a root-cause hint. Input: { sinceMinutes?: number (1-1440, default 60), limit?: number (1-100, default 20) }. Admin only — returns 403 for non-admins.',
      category: 'Observability',
      scope: 'observability:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        const result = await getRecentErrors(deps, { sinceMinutes: Number(input.sinceMinutes) || undefined, limit: Number(input.limit) || undefined });
        await audit(ctx, 'tool.observability.errors', { count: result.count, sinceMinutes: result.sinceMinutes });
        return result;
      },
    },

    search_request_logs: {
      name: 'search_request_logs',
      description:
        'Search recent HTTP request logs (method, path, status, duration, request ID). Input: { q?: string (substring of method/path), status?: string ("500" or "5xx"), method?: string ("GET"/"POST"), sinceMinutes?: number (default 60), limit?: number (1-200, default 50) }. Admin only — returns 403 for non-admins.',
      category: 'Observability',
      scope: 'observability:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        const result = await searchRequestLogs(deps, {
          q: String(input.q ?? input.query ?? ''),
          status: String(input.status ?? ''),
          method: String(input.method ?? ''),
          sinceMinutes: Number(input.sinceMinutes) || undefined,
          limit: Number(input.limit) || undefined,
        });
        await audit(ctx, 'tool.observability.request_logs', { count: result.count, q: String(input.q ?? input.query ?? '') || null });
        return result;
      },
    },

    prometheus_query: {
      name: 'prometheus_query',
      description:
        'Run a PromQL query against Prometheus. Input: { query: string (PromQL), type?: "instant" | "range" (default instant), start?: ISO time, end?: ISO time, step?: seconds (default 60) }. Fails with a clear message when Prometheus is not enabled. Admin only — returns 403 for non-admins.',
      category: 'Observability',
      scope: 'observability:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        return softFail(async () => {
          const query = String(input.query ?? '').trim();
          if (!query) throw new Error('query (PromQL) is required');
          const availability = await prometheusAvailable();
          if (!availability.reachable) {
            throw new Error(`Prometheus is not reachable at ${availability.url}. Enable the observability stack (COMPOSE_PROFILES includes "observability") or set PROMETHEUS_URL.`);
          }
          const type = String(input.type ?? 'instant').toLowerCase() === 'range' ? 'range' : 'instant';
          let data: any;
          if (type === 'range') {
            const end = input.end ? new Date(String(input.end)) : new Date();
            const start = input.start ? new Date(String(input.start)) : new Date(end.getTime() - 3600_000);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('start/end must be valid dates');
            const step = Math.min(Math.max(Number(input.step ?? 60) || 60, 5), 3600);
            data = await prometheusFetch('/api/v1/query_range', { query, start: String(start.getTime() / 1000), end: String(end.getTime() / 1000), step: String(step) });
          } else {
            data = await prometheusFetch('/api/v1/query', { query });
          }
          const { rows, series, resultType } = prometheusResultRows(data);
          await audit(ctx, 'tool.observability.prometheus', { query: query.slice(0, 200), type });
          return redactSecrets({ query, type, resultType, rowCount: rows.length, rows: rows.slice(0, 100), series: series.slice(0, 20) }) as any;
        });
      },
    },

    loki_query: {
      name: 'loki_query',
      description:
        'Run a LogQL query against Loki. Input: { query: string (LogQL, e.g. {job="api"} |= "error"), limit?: number (1-1000, default 100), sinceMinutes?: number (default 30), start?: ISO time, end?: ISO time }. Fails with a clear message when Loki is not enabled. Admin only — returns 403 for non-admins.',
      category: 'Observability',
      scope: 'observability:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        return softFail(async () => {
          const query = String(input.query ?? '').trim();
          if (!query) throw new Error('query (LogQL) is required');
          const availability = await lokiAvailable();
          if (!availability.reachable) {
            throw new Error(`Loki is not reachable at ${availability.url}. Enable the observability stack (COMPOSE_PROFILES includes "observability") or set LOKI_URL.`);
          }
          const result = await queryLoki(query, {
            limit: Number(input.limit) || undefined,
            sinceMinutes: Number(input.sinceMinutes) || undefined,
            start: input.start ? String(input.start) : undefined,
            end: input.end ? String(input.end) : undefined,
          });
          await audit(ctx, 'tool.observability.loki', { query: query.slice(0, 200), entries: result.entries.length });
          return { query, streams: result.streams, count: result.entries.length, entries: result.entries };
        });
      },
    },
  };
}
