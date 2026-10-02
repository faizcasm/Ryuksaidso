import { decryptSecret, encryptSecret } from '@ryuksaidso/agent-tools';
import { prisma } from '../lib/db';
import { getCustomLLMProvider, type ModelProviderRow } from './llm';

export type ModelProviderRowFull = ModelProviderRow & {
  models: string;
  status: string;
  latencyMs: number | null;
  lastCheckedAt: Date | null;
  lastError: string;
  connectedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function encryptModelKey(plain: string): string {
  return plain ? encryptSecret(plain) : '';
}

export function decryptModelKey(stored: string): string {
  if (!stored) return '';
  try {
    return decryptSecret(stored);
  } catch {
    return '';
  }
}

export function parseModelList(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function providerSummary(row: ModelProviderRowFull, currentProvider?: string | null) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.baseUrl,
    hasKey: Boolean(row.apiKey),
    defaultModel: row.defaultModel,
    models: parseModelList(row.models),
    enabled: row.enabled,
    status: row.status,
    latencyMs: row.latencyMs,
    lastCheckedAt: row.lastCheckedAt,
    lastError: row.lastError,
    isDefault: currentProvider === row.id,
    createdAt: row.createdAt,
  };
}

export async function loadCustomProvider(organizationId: string, providerId: string, includeDisabled = false) {
  return prisma.modelProvider.findFirst({
    where: { id: providerId, organizationId, ...(includeDisabled ? {} : { enabled: true }) },
  });
}

export type ResolvedRunProvider = {
  provider: string;
  model: string;
  custom: ModelProviderRow | null;
  ok: boolean;
  reason: 'unknown_provider' | 'no_model' | null;
};

export async function resolveRunProvider(
  organizationId: string,
  organization: { llmProvider: string; ollamaModel: string; omnirouteModel: string } | null,
  override?: string,
  envModel?: Record<string, string | undefined>,
): Promise<ResolvedRunProvider> {
  const provider = String(override || organization?.llmProvider || 'OLLAMA');
  if (provider === 'OMNIROUTE' || provider === 'OLLAMA') {
    const model =
      (provider === 'OMNIROUTE' ? organization?.omnirouteModel : organization?.ollamaModel) ||
      (provider === 'OMNIROUTE' ? envModel?.OMNIROUTE_MODEL : envModel?.OLLAMA_MODEL) ||
      '';
    return { provider, model, custom: null, ok: Boolean(model), reason: model ? null : 'no_model' };
  }
  const custom = await loadCustomProvider(organizationId, provider);
  if (!custom) return { provider, model: '', custom: null, ok: false, reason: 'unknown_provider' };
  return { provider, model: custom.defaultModel, custom, ok: Boolean(custom.defaultModel), reason: custom.defaultModel ? null : 'no_model' };
}

export type ProbeResult = {
  ok: boolean;
  latencyMs: number;
  models: string[];
  error?: string;
  chat?: { ok: boolean; error?: string };
};

export async function probeProvider(
  row: Pick<ModelProviderRowFull, 'id' | 'name' | 'kind' | 'baseUrl' | 'apiKey' | 'defaultModel'>,
  options: { chat?: boolean } = {},
): Promise<ProbeResult> {
  const started = Date.now();
  const provider = getCustomLLMProvider(row, undefined, decryptModelKey(row.apiKey));
  try {
    const models = await provider.models();
    const result: ProbeResult = { ok: true, latencyMs: Date.now() - started, models };
    if (options.chat) {
      try {
        await provider.chat([{ role: 'user', content: 'Reply with the word ok.' }]);
        result.chat = { ok: true };
      } catch (error) {
        result.chat = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    return result;
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, models: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function recordProbe(row: { id: string }, result: ProbeResult) {
  const status = !result.ok ? 'ERROR' : result.chat?.error ? 'DEGRADED' : 'HEALTHY';
  const lastError = result.ok ? result.chat?.error || '' : result.error || '';
  await prisma.modelProvider.update({
    where: { id: row.id },
    data: {
      status,
      latencyMs: result.latencyMs,
      lastCheckedAt: new Date(),
      lastError,
      ...(result.ok && result.models.length ? { models: JSON.stringify(result.models) } : {}),
    },
  });
}
