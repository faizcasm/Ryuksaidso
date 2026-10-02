import { config, providerConfig, type LLMProviderName } from '../lib/config';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export interface LLMProvider { chat(messages: ChatMessage[], json?: boolean): Promise<{ content: string; tokens: number }> }

type ModelPayload = { data?: Array<{ id?: string }> };

export class ProviderUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'ProviderUnavailableError'; }
}

export function isModelAvailable(models: string[], model: string): boolean {
  if (!model) return false;
  if (!models.length) return true;
  if (models.includes(model)) return true;
  return models.some(id => id.startsWith(`${model}/`) || id.startsWith(`${model}:`) || id.startsWith(`${model}.`));
}

export function isBuiltInProvider(provider: string): provider is LLMProviderName {
  return provider === 'OLLAMA' || provider === 'OMNIROUTE';
}

export type CustomProviderSettings = { baseUrl: string; apiKey: string; kind: string };

export class InvalidModelUrlError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidModelUrlError'; }
}

export function assertModelBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidModelUrlError('Enter a valid endpoint URL including http:// or https:// (for example http://localhost:11434 or https://api.openai.com/v1).');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidModelUrlError('Only http:// and https:// model endpoints are supported.');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'metadata.google.internal' || host === '169.254.169.254' || host.startsWith('169.254.')) {
    throw new InvalidModelUrlError('This endpoint address is not allowed.');
  }
  return url.toString().replace(/\/+$/, '');
}

function normalizeCustomBaseUrl(baseUrl: string, kind: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (kind === 'ollama' && !/\/v1$/.test(trimmed)) return `${trimmed}/v1`;
  return trimmed;
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly provider: LLMProviderName | string, private readonly modelOverride?: string, private readonly custom?: CustomProviderSettings) {}

  private settings() {
    if (this.custom) {
      return { baseUrl: normalizeCustomBaseUrl(this.custom.baseUrl, this.custom.kind), apiKey: this.custom.apiKey, model: this.modelOverride ?? '' };
    }
    const base = providerConfig(this.provider as LLMProviderName);
    return { ...base, model: this.modelOverride !== undefined ? this.modelOverride : base.model };
  }

  private isOllamaKind() {
    return this.provider === 'OLLAMA' || this.custom?.kind === 'ollama';
  }

  private unreachableHint(baseUrl: string, reason: string) {
    if (this.custom) {
      return `${this.provider} is unreachable at ${baseUrl} (${reason}). Verify the endpoint URL is correct and reachable from the server.`;
    }
    return `${this.provider} is unreachable at ${baseUrl} (${reason}). ` +
      `Verify the provider is running and ${this.provider}_URL is correct` +
      (config.DOCKER_RUNTIME ? ' (inside Docker localhost is remapped to host.docker.internal).' : '.');
  }

  async chat(messages: ChatMessage[], json = false) {
    const { baseUrl, apiKey, model } = this.settings();
    if (!model) throw new ProviderUnavailableError(`${this.provider} model is not configured`);

    const doFetch = (includeJson: boolean) => fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, messages, temperature: 0.1, ...(includeJson ? { response_format: { type: 'json_object' } } : {}) }),
      signal: AbortSignal.timeout(120_000)
    });

    let response: Response | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await doFetch(json);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }
    if (!response) {
      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      throw new ProviderUnavailableError(this.unreachableHint(baseUrl, reason));
    }
    if (!response.ok && json && (response.status === 400 || response.status === 422)) {
      response = await doFetch(false).catch(() => response as Response);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${this.provider} request failed: ${response.status}${detail ? ` ${detail.slice(0, 500)}` : ''}`);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.provider} returned an empty response`);
    return { content, tokens: data.usage?.total_tokens ?? 0 };
  }

  async models() {
    const { baseUrl, apiKey } = this.settings();
    let lastReason = '';
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json() as ModelPayload;
        const models = (data.data ?? []).map(x => x.id).filter((x): x is string => Boolean(x));
        if (models.length) return models;
        lastReason = 'the endpoint returned no models';
      } else {
        lastReason = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
    if (this.isOllamaKind()) {
      const rootUrl = baseUrl.replace(/\/v1$/, '');
      try {
        const response = await fetch(`${rootUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const payload = await response.json() as { models?: Array<{ name?: string }> };
        return (payload.models ?? []).map(x => x.name).filter((x): x is string => Boolean(x));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const hint = this.custom ? 'Check that the endpoint is running and reachable.' : `Check that it is running and ${this.provider}_URL is correct.`;
        throw new Error(`${this.provider} is unreachable at ${rootUrl} (${reason}). ${hint}`);
      }
    }
    throw new Error(`${this.provider} model discovery failed at ${baseUrl}${lastReason ? ` (${lastReason})` : ''}`);
  }
}

export function getLLMProvider(provider: LLMProviderName, modelOverride?: string): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(provider, modelOverride);
}

export type ModelProviderRow = {
  id: string;
  organizationId: string;
  name: string;
  kind: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  enabled: boolean;
};

export function getCustomLLMProvider(
  row: Pick<ModelProviderRow, 'name' | 'kind' | 'baseUrl' | 'apiKey' | 'defaultModel'>,
  modelOverride?: string,
  decryptedKey = '',
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(row.name, modelOverride ?? row.defaultModel, { baseUrl: row.baseUrl, apiKey: decryptedKey, kind: row.kind });
}

export class FallbackLLMProvider implements LLMProvider {
  lastProvider?: LLMProviderName;
  private readonly resolveModel: (provider: LLMProviderName) => string | undefined;

  constructor(
    readonly order: LLMProviderName[],
    resolveModel: (provider: LLMProviderName) => string | undefined = () => undefined,
  ) {
    this.resolveModel = resolveModel;
  }

  async chat(messages: ChatMessage[], json = false) {
    const failures: string[] = [];
    for (const provider of this.order) {
      const delegate = new OpenAICompatibleProvider(provider, this.resolveModel(provider));
      try {
        const result = await delegate.chat(messages, json);
        this.lastProvider = provider;
        return result;
      } catch (error) {
        if (!(error instanceof ProviderUnavailableError)) throw error;
        failures.push(`${provider}: ${error.message}`);
      }
    }
    throw new Error(`All configured LLM providers failed — ${failures.join(' | ')}`);
  }
}

export function getResilientProvider(order: LLMProviderName[] = ['OMNIROUTE', 'OLLAMA'], resolveModel?: (provider: LLMProviderName) => string | undefined) {
  return new FallbackLLMProvider(order, resolveModel);
}

export const llm: LLMProvider = getLLMProvider('OLLAMA', config.OLLAMA_MODEL);
