import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

async function loadConfig(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('../lib/config');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('providerConfig', () => {
  it('normalises a bare origin to the OpenAI compatible /v1 base path', async () => {
    const { providerConfig } = await loadConfig({ OLLAMA_URL: 'http://127.0.0.1:11434' });
    expect(providerConfig('OLLAMA').baseUrl).toBe('http://127.0.0.1:11434/v1');
  });

  it('keeps an existing /v1 suffix and strips a trailing slash', async () => {
    const { providerConfig } = await loadConfig({ OMNIROUTE_URL: 'http://127.0.0.1:20128/v1/' });
    expect(providerConfig('OMNIROUTE').baseUrl).toBe('http://127.0.0.1:20128/v1');
  });

  it('does not double up when the path already ends with /v1', async () => {
    const { providerConfig } = await loadConfig({ OLLAMA_URL: 'http://127.0.0.1:11434/v1' });
    expect(providerConfig('OLLAMA').baseUrl).toBe('http://127.0.0.1:11434/v1');
  });

  it('rewrites a loopback host to the docker gateway at runtime', async () => {
    const { providerConfig } = await loadConfig({ DOCKER_RUNTIME: 'true', OLLAMA_URL: 'http://localhost:11434/v1' });
    expect(providerConfig('OLLAMA').baseUrl).toBe('http://host.docker.internal:11434/v1');
  });

  it('leaves a non loopback host untouched in docker runtime', async () => {
    const { providerConfig } = await loadConfig({ DOCKER_RUNTIME: 'true', OLLAMA_URL: 'http://ollama.internal:11434/v1' });
    expect(providerConfig('OLLAMA').baseUrl).toBe('http://ollama.internal:11434/v1');
  });

  it('exposes the configured api key and model', async () => {
    const { providerConfig } = await loadConfig({ OLLAMA_API: 'ollama', OLLAMA_MODEL: 'qwen3:1.7b' });
    const conf = providerConfig('OLLAMA');
    expect(conf.apiKey).toBe('ollama');
    expect(conf.model).toBe('qwen3:1.7b');
  });
});

describe('environment parsing', () => {
  it('normalises the system admin allowlist', async () => {
    const { config } = await loadConfig({ SYSTEM_ADMIN_EMAILS: ' Admin@Example.COM , bob@x.co ,,' });
    expect(config.SYSTEM_ADMIN_EMAILS).toEqual(['admin@example.com', 'bob@x.co']);
  });

  it('defaults the allowlist to empty', async () => {
    const { config } = await loadConfig();
    expect(config.SYSTEM_ADMIN_EMAILS).toEqual([]);
  });

  it('derives the refresh token lifetime in milliseconds', async () => {
    const { config } = await loadConfig({ REFRESH_TOKEN_TTL_DAYS: '7' });
    expect(config.REFRESH_TOKEN_TTL_MS).toBe(7 * 86_400_000);
  });

  it('coerces rate limit settings to numbers', async () => {
    const { config } = await loadConfig({ RATE_LIMIT_MAX: '25', RATE_LIMIT_WINDOW_MS: '30000' });
    expect(config.RATE_LIMIT_MAX).toBe(25);
    expect(config.RATE_LIMIT_WINDOW_MS).toBe(30000);
  });
});

describe('production safety checks', () => {
  it('refuses to boot in production with a short JWT secret', async () => {
    await expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'too-short' })).rejects.toThrow(ZodError);
  });

  it('refuses SameSite=None without an https frontend', async () => {
    await expect(loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(48),
      COOKIE_SAME_SITE: 'none',
      FRONTEND_URL: 'http://example.com'
    })).rejects.toThrow(ZodError);
  });

  it('boots in production with a strong secret', async () => {
    const { config } = await loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'b'.repeat(48) });
    expect(config.NODE_ENV).toBe('production');
  });

  it('rejects an invalid log level', async () => {
    await expect(loadConfig({ LOG_LEVEL: 'loud' })).rejects.toThrow(ZodError);
  });

  it('rejects a non url redis configuration', async () => {
    await expect(loadConfig({ REDIS_URL: 'not-a-url' })).rejects.toThrow(ZodError);
  });
});

describe('cookie secure flag', () => {
  const prod = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48) };

  it('is false for a plain http frontend so login works without TLS', async () => {
    const { config } = await loadConfig({ ...prod, FRONTEND_URL: 'http://example.com' });
    expect(config.COOKIE_SECURE).toBe(false);
  });

  it('is true for an https frontend', async () => {
    const { config } = await loadConfig({ ...prod, FRONTEND_URL: 'https://example.com' });
    expect(config.COOKIE_SECURE).toBe(true);
  });

  it('honours an explicit COOKIE_SECURE override', async () => {
    const { config } = await loadConfig({ ...prod, FRONTEND_URL: 'https://example.com', COOKIE_SECURE: 'false' });
    expect(config.COOKIE_SECURE).toBe(false);
  });

  it('treats an empty COOKIE_SECURE as unset', async () => {
    const { config } = await loadConfig({ ...prod, COOKIE_SECURE: '' });
    expect(config.COOKIE_SECURE).toBe(false);
  });

  it('rejects a malformed COOKIE_SECURE value', async () => {
    await expect(loadConfig({ ...prod, COOKIE_SECURE: 'yes' })).rejects.toThrow(ZodError);
  });
});

describe('empty compose environment values', () => {
  it('treats empty optional settings as unset instead of failing to boot', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'g'.repeat(48),
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REDIRECT_URI: '',
      GITHUB_CLIENT_ID: '',
      GITHUB_CLIENT_SECRET: '',
      GITHUB_REDIRECT_URI: '',
      GITHUB_TOKEN: '',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      EMAIL_FROM: '',
      MCP_SERVERS: '',
      COOKIE_SECURE: '',
      SYSTEM_ADMIN_EMAILS: ''
    });
    expect(config.GOOGLE_REDIRECT_URI).toBeUndefined();
    expect(config.GITHUB_REDIRECT_URI).toBeUndefined();
    expect(config.COOKIE_SECURE).toBe(false);
  });

  it('still rejects a malformed redirect uri', async () => {
    await expect(loadConfig({ GOOGLE_REDIRECT_URI: 'not-a-url' })).rejects.toThrow(ZodError);
  });
});
