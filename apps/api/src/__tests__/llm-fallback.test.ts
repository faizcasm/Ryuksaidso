import { afterEach, describe, expect, it, vi } from 'vitest';
import { FallbackLLMProvider, ProviderUnavailableError, getResilientProvider } from '../services/llm';
import { providerConfig } from '../lib/config';

const messages = [{ role: 'user' as const, content: 'hi' } as const];

const omniUrl = providerConfig('OMNIROUTE').baseUrl;
const ollamaUrl = providerConfig('OLLAMA').baseUrl;

function completion(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 7 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FallbackLLMProvider (OmniRoute first, Ollama fallback)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('falls back to Ollama when OmniRoute is unreachable', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(omniUrl)) throw new TypeError('fetch failed');
      return completion('from-ollama');
    });

    const provider = getResilientProvider(['OMNIROUTE', 'OLLAMA'], p => (p === 'OMNIROUTE' ? 'auto' : undefined));
    const result = await provider.chat([...messages]);

    expect(result.content).toBe('from-ollama');
    expect(provider.lastProvider).toBe('OLLAMA');
    expect(fetchMock.mock.calls.filter(call => String(call[0]).startsWith(omniUrl)).length).toBe(3);
    expect(fetchMock.mock.calls.some(call => String(call[0]).startsWith(ollamaUrl))).toBe(true);
  }, 20_000);

  it('skips a provider with no model configured without calling it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(completion('from-ollama'));

    const provider = new FallbackLLMProvider(['OMNIROUTE', 'OLLAMA'], p => (p === 'OMNIROUTE' ? '' : 'test-model'));
    const result = await provider.chat([...messages]);

    expect(result.content).toBe('from-ollama');
    expect(provider.lastProvider).toBe('OLLAMA');
    for (const call of fetchMock.mock.calls) expect(String(call[0]).startsWith(omniUrl)).toBe(false);
  });

  it('does NOT fall back on HTTP-level inference errors (no silent re-billing)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('boom', { status: 500 }),
    );

    const provider = getResilientProvider(['OMNIROUTE', 'OLLAMA'], () => 'some-model');
    await expect(provider.chat([...messages])).rejects.toThrow(/request failed: 500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(provider.lastProvider).toBeUndefined();
  });

  it('reports every provider when all of them fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new TypeError('fetch failed'); });

    const provider = getResilientProvider(['OMNIROUTE', 'OLLAMA'], () => 'some-model');
    await expect(provider.chat([...messages])).rejects.toThrow(/All configured LLM providers failed/);
  }, 20_000);

  it('exposes ProviderUnavailableError for unreachable providers', () => {
    const error = new ProviderUnavailableError('nope');
    expect(error.name).toBe('ProviderUnavailableError');
    expect(error).toBeInstanceOf(Error);
  });
});
