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

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly provider: LLMProviderName, private readonly modelOverride?: string) {}

  private settings() {
    const base = providerConfig(this.provider);
    return { ...base, model: this.modelOverride !== undefined ? this.modelOverride : base.model };
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
      throw new ProviderUnavailableError(
        `${this.provider} is unreachable at ${baseUrl} (${reason}). ` +
        `Verify the provider is running and ${this.provider}_URL is correct` +
        (config.DOCKER_RUNTIME ? ' (inside Docker localhost is remapped to host.docker.internal).' : '.')
      );
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
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json() as ModelPayload;
        const models = (data.data ?? []).map(x => x.id).filter((x): x is string => Boolean(x));
        if (models.length) return models;
      }
    } catch {}
    if (this.provider === 'OLLAMA') {
      const rootUrl = baseUrl.replace(/\/v1$/, '');
      try {
        const response = await fetch(`${rootUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const payload = await response.json() as { models?: Array<{ name?: string }> };
        return (payload.models ?? []).map(x => x.name).filter((x): x is string => Boolean(x));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${this.provider} is unreachable at ${rootUrl} (${reason}). Check that it is running and ${this.provider}_URL is correct.`);
      }
    }
    throw new Error(`${this.provider} model discovery failed at ${baseUrl}`);
  }
}

export function getLLMProvider(provider: LLMProviderName, modelOverride?: string): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(provider, modelOverride);
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
