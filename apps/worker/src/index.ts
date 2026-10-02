import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { executeAgentRun } from '@ryuksaidso/agent-runtime';
import { buildTools, loadMcpTools, mcpConfigured, appendObsLog, emitWebhookEvent, runDueSyncs, sweepPendingDeliveries, decryptSecret, type ToolDef } from '@ryuksaidso/agent-tools';
import { Writable } from 'node:stream';

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', { maxRetriesPerRequest: null });
const prisma = new PrismaClient();

const obsStream = new Writable({
  write(chunk, _encoding, callback) {
    const line = String(chunk);
    process.stdout.write(line);
    try {
      const parsed = JSON.parse(line);
      const numericLevel = Number(parsed?.level ?? 30);
      if (numericLevel >= 40) {
        void appendObsLog(redis as any, {
          t: Date.now(),
          level: numericLevel >= 50 ? 'error' : 'warn',
          message: String(parsed?.msg ?? '').slice(0, 2000),
          meta: { ...(parsed && typeof parsed === 'object' ? parsed : {}), service: 'worker' },
        });
      }
    } catch {}
    callback();
  },
});
const pinoLevel = (() => {
  const requested = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const map: Record<string, string> = {
    error: 'error', warn: 'warn', info: 'info', http: 'info',
    verbose: 'debug', debug: 'debug', silly: 'trace',
    fatal: 'fatal', silent: 'silent', trace: 'trace',
  };
  return map[requested] ?? 'info';
})();
const logger = pino({ level: pinoLevel }, obsStream);

type ChatMessage = { role: 'system'|'user'|'assistant'; content: string };

class LLMConnectionError extends Error {
  readonly isConnection = true;
  constructor(message: string) { super(message); this.name = 'LLMConnectionError'; }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const loggedSettings = new Set<string>();

function isCustomProvider(provider: string) {
  return provider !== 'OLLAMA' && provider !== 'OMNIROUTE';
}

function remapLocalhost(baseUrl: string): string {
  if (process.env.DOCKER_RUNTIME !== 'true') return baseUrl;
  try {
    const url = new URL(baseUrl);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
      url.hostname = 'host.docker.internal';
      return url.toString();
    }
  } catch {
    return baseUrl.replace('://localhost:', '://host.docker.internal:').replace('://127.0.0.1:', '://host.docker.internal:');
  }
  return baseUrl;
}

function customBaseUrl(baseUrl: string, kind: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (kind === 'ollama' && !/\/v1$/.test(trimmed)) return `${trimmed}/v1`;
  return trimmed;
}

function providerSettings(provider: string, model?: string) {
  const isDocker = process.env.DOCKER_RUNTIME === 'true';

  let ollamaBase = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/v1\/?$/, '');
  let omnirouteBase = (process.env.OMNIROUTE_URL || 'http://localhost:20128').replace(/\/v1\/?$/, '');

  let baseUrl: string;
  let apiKey: string;
  let defaultModel: string;

  if (provider === 'OMNIROUTE') {
    baseUrl = omnirouteBase;
    apiKey = process.env.OMNIROUTE_API || '';
    defaultModel = process.env.OMNIROUTE_MODEL || 'auto';
  } else {
    baseUrl = ollamaBase;
    apiKey = process.env.OLLAMA_API || 'ollama';
    defaultModel = process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b-instruct-q4_K_M';
  }

  if (isDocker) {
    try {
      const url = new URL(baseUrl);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
        url.hostname = 'host.docker.internal';
        baseUrl = url.toString();
      }
    } catch {
      baseUrl = baseUrl.replace('://localhost:', '://host.docker.internal:').replace('://127.0.0.1:', '://host.docker.internal:');
    }
  }

  const finalModel = model || defaultModel;
  const settings = { baseUrl: baseUrl.replace(/\/$/, '') + '/v1', apiKey, model: finalModel };

  if (!loggedSettings.has(provider)) {
    loggedSettings.add(provider);
    logger.info({ provider, baseUrl: settings.baseUrl, model: finalModel, isDocker }, 'LLM provider settings');
  }
  if (!finalModel) logger.warn({ provider }, 'No model configured for provider');

  return settings;
}

function isProviderConfigured(provider: string) {
  if (provider === 'OMNIROUTE') return Boolean(process.env.OMNIROUTE_URL || process.env.OMNIROUTE_MODEL);
  return Boolean(process.env.OLLAMA_URL || process.env.OLLAMA_MODEL);
}

async function customProviderSettings(providerId: string, organizationId: string, model?: string) {
  const row = await prisma.modelProvider.findUnique({ where: { id: providerId } });
  if (!row || row.organizationId !== organizationId) throw new Error(`Model provider ${providerId} is not available in this workspace`);
  if (!row.enabled) throw new Error(`Model provider ${row.name} is disabled`);
  let apiKey = '';
  if (row.apiKey) {
    try {
      apiKey = decryptSecret(row.apiKey);
    } catch {
      apiKey = '';
    }
  }
  return { baseUrl: remapLocalhost(customBaseUrl(row.baseUrl, row.kind)), apiKey, model: model || row.defaultModel, label: row.name };
}

async function postChat(args: { baseUrl: string; apiKey: string; label: string; model: string; messages: ChatMessage[]; json: boolean; hint: string }) {
  const { baseUrl, apiKey, label, model, messages, json, hint } = args;
  const doFetch = (includeJson: boolean) => fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, messages, temperature: 0.1, ...(includeJson ? { response_format: { type: 'json_object' } } : {}) }),
    signal: AbortSignal.timeout(120_000)
  });

  let response: Response;
  try {
    response = await doFetch(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new LLMConnectionError(`${label} is unreachable at ${baseUrl} (${reason}). ${hint}`);
  }

  if (!response.ok && json && (response.status === 400 || response.status === 422)) {
    try {
      response = await doFetch(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new LLMConnectionError(`${label} is unreachable at ${baseUrl} (${reason}). ${hint}`);
    }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${label} request failed: ${response.status}${detail ? ` ${detail.slice(0, 500)}` : ''}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${label} returned an empty response`);
  return { content, tokens: data.usage?.total_tokens || 0 };
}

async function callProvider(provider: string, model: string | undefined, messages: ChatMessage[], json: boolean, organizationId: string) {
  if (isCustomProvider(provider)) {
    const settings = await customProviderSettings(provider, organizationId, model);
    if (!settings.model) throw new Error(`${settings.label} has no model configured. Choose a model in Settings.`);
    return postChat({ ...settings, messages, json, hint: 'Verify the endpoint URL is correct and reachable from the worker.' });
  }

  const { baseUrl, apiKey, model: resolvedModel } = providerSettings(provider, model);
  if (!resolvedModel) throw new Error(`${provider} model is not configured. Set ${provider}_MODEL.`);
  const hint =
    `Check that the provider is running on the host and that ${provider}_URL is correct` +
    (process.env.DOCKER_RUNTIME === 'true' ? ' (inside Docker localhost is remapped to host.docker.internal).' : '.');
  return postChat({ baseUrl, apiKey, label: provider, model: resolvedModel, messages, json, hint });
}

async function chatWithFallback(primary: string, model: string | undefined, messages: ChatMessage[], json: boolean, organizationId: string) {
  const attemptOrder: string[] = isCustomProvider(primary)
    ? [primary, 'OMNIROUTE', 'OLLAMA']
    : [primary, primary === 'OLLAMA' ? 'OMNIROUTE' : 'OLLAMA'];
  const errors: string[] = [];

  for (const provider of attemptOrder) {
    const isFallback = provider !== primary;
    if (isFallback && !isProviderConfigured(provider)) continue;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await callProvider(provider, isFallback ? undefined : model, messages, json, organizationId);
        if (errors.length) logger.warn({ provider }, 'LLM call succeeded after falling back to another provider');
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const connection = error instanceof LLMConnectionError;
        errors.push(message);
        if (!connection) break;
        if (attempt < 3) {
          const delay = 500 * 2 ** (attempt - 1);
          logger.warn({ provider, attempt, delay, error: message }, 'LLM connection failed, retrying');
          await sleep(delay);
          continue;
        }
        logger.error({ provider, error: message }, 'LLM provider unreachable after retries');
        break;
      }
    }
  }

  throw new Error(errors[errors.length - 1] || 'All LLM providers failed');
}

const staticTools = buildTools({ prisma, redis: redis as any });
const mcpToolsPromise: Promise<Record<string, ToolDef>> = mcpConfigured()
  ? loadMcpTools().then((tools) => {
      logger.info({ tools: Object.keys(tools) }, 'MCP tools loaded');
      return tools;
    }).catch((error) => {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'MCP tool discovery failed');
      return {} as Record<string, ToolDef>;
    })
  : Promise.resolve({});

const runtimeTools = async (): Promise<Record<string, ToolDef>> => ({ ...staticTools, ...(await mcpToolsPromise) });

const worker = new Worker('agent-runs', async (job) => {
  const user = job.data.user as { id:string; email:string; name:string; organizationId:string; role:string; userRole?:string };
  if (user.organizationId !== job.data.organizationId) throw new Error('Job tenant mismatch');

  return executeAgentRun({
    prisma,
    getLLM: (provider, modelOverride) => ({
      async chat(messages, json = false) {
        return chatWithFallback(provider, modelOverride, messages, json, user.organizationId);
      }
    }),
    logger,
    tools: await runtimeTools(),
    requiresApproval: async (organizationId, action, toolApproval, runId) => {
      const previouslyApproved = await prisma.approval.findFirst({ where: { organizationId, runId, action, status: 'APPROVED' } });
      if (previouslyApproved) return false;
      if (toolApproval) return true;
      const policy = await prisma.policy.findFirst({ where: { organizationId, action, enabled: true, requiresApproval: true } });
      return Boolean(policy);
    },
    createApproval: async ({ organizationId, runId, action, payload }) => {
      await prisma.approval.create({ data: { organizationId, runId, action, payload: JSON.parse(JSON.stringify(payload)) } });
    }
  }, job.data.runId, user);
}, {
  connection: redis,
  concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
  limiter: { max: Number(process.env.WORKER_RATE_LIMIT_MAX || 20), duration: Number(process.env.WORKER_RATE_LIMIT_DURATION_MS || 1000) }
});

const emittedRunEvents = new Set<string>();

async function emitRunEvent(job: any, outcome: 'completed' | 'failed') {
  try {
    const runId = String(job?.data?.runId ?? '');
    if (!runId || emittedRunEvents.has(runId)) return;
    if (outcome === 'failed') {
      const attempts = Number(job.opts?.attempts ?? 1);
      if (Number(job.attemptsMade ?? 0) < attempts) return;
    }
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true, organizationId: true, agentId: true, trigger: true, finishedAt: true, latencyMs: true },
    });
    if (!run) return;
    if (outcome === 'completed' && run.status !== 'COMPLETED') return;
    if (outcome === 'failed' && run.status === 'COMPLETED') return;
    emittedRunEvents.add(runId);
    if (emittedRunEvents.size > 2000) emittedRunEvents.clear();
    await emitWebhookEvent(prisma, run.organizationId, `run.${outcome}`, {
      runId: run.id,
      status: run.status,
      agentId: run.agentId,
      trigger: run.trigger,
      finishedAt: run.finishedAt,
      latencyMs: run.latencyMs,
    });
  } catch {
    return;
  }
}

worker.on('completed', job => {
  logger.info({ jobId: job.id }, 'job completed');
  void emitRunEvent(job, 'completed');
});
worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error: error.message }, 'job failed');
  void emitRunEvent(job, 'failed');
});
worker.on('error', error => logger.error({ error: error.message }, 'worker error'));

const MAINTENANCE_INTERVAL_MS = Number(process.env.INTEGRATION_MAINTENANCE_INTERVAL_MS || 15 * 60 * 1000);
let maintenanceRunning = false;

async function probeModelProviders() {
  const rows = await prisma.modelProvider.findMany({ where: { enabled: true } });
  if (!rows.length) return;
  const results = await Promise.all(rows.map(async (row: any) => {
    const started = Date.now();
    let status = 'HEALTHY';
    let lastError = '';
    let discovered: string[] = [];
    try {
      const baseUrl = remapLocalhost(customBaseUrl(row.baseUrl, row.kind));
      let apiKey = '';
      if (row.apiKey) {
        try {
          apiKey = decryptSecret(row.apiKey);
        } catch {
          apiKey = '';
        }
      }
      const response = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { data?: Array<{ id?: string }> };
      discovered = (data.data ?? []).map(x => x.id).filter((x): x is string => Boolean(x));
    } catch (error) {
      status = 'ERROR';
      lastError = error instanceof Error ? error.message : String(error);
    }
    return { id: row.id, status, lastError, latencyMs: Date.now() - started, discovered };
  }));
  for (const result of results) {
    await prisma.modelProvider.update({
      where: { id: result.id },
      data: {
        status: result.status,
        latencyMs: result.latencyMs,
        lastCheckedAt: new Date(),
        lastError: result.lastError,
        ...(result.status === 'HEALTHY' && result.discovered.length ? { models: JSON.stringify(result.discovered) } : {}),
      },
    });
  }
  logger.info({ checked: results.length, unhealthy: results.filter(r => r.status !== 'HEALTHY').length }, 'model provider health sweep finished');
}

async function runMaintenance() {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  try {
    const syncs = await runDueSyncs(prisma);
    if (syncs.checked) logger.info(syncs, 'knowledge sync sweep finished');
    const deliveries = await sweepPendingDeliveries(prisma);
    if (deliveries.delivered || deliveries.failed) logger.info(deliveries, 'webhook delivery sweep finished');
    const pruned = await prisma.widgetSession.deleteMany({
      where: { lastActiveAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });
    if (pruned.count) logger.info({ pruned: pruned.count }, 'stale widget sessions pruned');
    await probeModelProviders();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'integration maintenance failed');
  } finally {
    maintenanceRunning = false;
  }
}

const maintenanceTimer = setInterval(() => void runMaintenance(), MAINTENANCE_INTERVAL_MS);
setTimeout(() => void runMaintenance(), 45_000).unref?.();

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down worker');
  clearInterval(maintenanceTimer);
  try {
    await worker.close();
  } catch (error) {
    logger.error({ signal, error: error instanceof Error ? error.message : String(error) }, 'worker close failed');
  }
  await Promise.allSettled([redis.quit(), prisma.$disconnect()]);
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
logger.info('Ryuksaidso worker online');
