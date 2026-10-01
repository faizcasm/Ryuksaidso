import { z } from 'zod';

const optionalUrl = z.preprocess(v => (v === undefined || v === '' ? undefined : v), z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  APP_NAME: z.string().default('ryuksaidso'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().min(1),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SAME_SITE: z.enum(['lax','strict','none']).default('lax'),
  COOKIE_SECURE: z.preprocess(v => (v === undefined || v === '' ? undefined : v), z.enum(['true','false']).optional()),
  OMNIROUTE_URL: z.string().url().default('http://localhost:20128/v1'),
  OMNIROUTE_API: z.string().default(''),
  OMNIROUTE_MODEL: z.string().default(''),
  OLLAMA_URL: z.string().url().default('http://localhost:11434/v1'),
  OLLAMA_API: z.string().min(1).default('ollama'),
  OLLAMA_MODEL: z.string().min(1).default('qwen2.5-coder:3b-instruct-q4_K_M'),
  LOG_LEVEL: z.enum(['error','warn','info','http','verbose','debug','silly']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  SYSTEM_ADMIN_EMAILS: z.string().default('').transform(v => v.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)),
  GOOGLE_CLIENT_ID: z.string().optional(), GOOGLE_CLIENT_SECRET: z.string().optional(), GOOGLE_REDIRECT_URI: optionalUrl,
  GITHUB_CLIENT_ID: z.string().optional(), GITHUB_CLIENT_SECRET: z.string().optional(), GITHUB_REDIRECT_URI: optionalUrl,
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().positive().default(587), SMTP_SECURE: z.string().default('false').transform(v => v === 'true'), SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), EMAIL_FROM: z.string().optional(),
  BILLING_PROVIDER: z.string().default('cashfree'),
  CASHFREE_CLIENT_ID: z.string().default(''),
  CASHFREE_CLIENT_SECRET: z.string().default(''),
  CASHFREE_WEBHOOK_SECRET: z.string().default(''),
  CASHFREE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  BILLING_CURRENCY: z.string().trim().min(3).max(3).default('INR'),
  BILLING_RETURN_URL: optionalUrl,
  DOCKER_RUNTIME: z.string().default('false').transform(v => v === 'true')
}).superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production') {
    if (v.JWT_SECRET.length < 48) ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Production JWT_SECRET should be at least 48 characters' });
    if (v.COOKIE_SAME_SITE === 'none' && !v.FRONTEND_URL.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['COOKIE_SAME_SITE'], message: 'SameSite=None requires HTTPS in production' });
  }
});

const parsed = envSchema.parse(process.env);
export const config = {
  ...parsed,
  REFRESH_TOKEN_TTL_MS: parsed.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  COOKIE_SECURE: parsed.COOKIE_SECURE === undefined ? parsed.FRONTEND_URL.startsWith('https://') : parsed.COOKIE_SECURE === 'true',
};

export type LLMProviderName = 'OLLAMA' | 'OMNIROUTE';

export function providerConfig(provider: LLMProviderName) {
  const raw = provider === 'OMNIROUTE' ? config.OMNIROUTE_URL : config.OLLAMA_URL;
  let url = raw;
  try {
    const parsedUrl = new URL(raw);
    if (config.DOCKER_RUNTIME && (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1')) parsedUrl.hostname = 'host.docker.internal';
    url = parsedUrl.toString().replace(/\/$/, '');
  } catch {
    url = raw.replace(/\/$/, '');
  }
  if (!url.endsWith('/v1')) url = `${url}/v1`;
  return {
    baseUrl: url,
    apiKey: provider === 'OMNIROUTE' ? config.OMNIROUTE_API : config.OLLAMA_API,
    model: provider === 'OMNIROUTE' ? config.OMNIROUTE_MODEL : config.OLLAMA_MODEL,
  };
}
