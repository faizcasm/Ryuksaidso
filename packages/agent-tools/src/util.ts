export function dynamicImport<T = any>(specifier: string): Promise<T> {
  return new Function('specifier', 'return import(specifier)')(specifier) as Promise<T>;
}

export const USER_AGENT = 'ryuksaidso-agent/2.0 (+https://github.com/ryuksaidso)';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function httpJson(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}: ${text.slice(0, 240)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function softFail(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /\brsk_[A-Za-z0-9_-]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{12,}/g,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
  /\b(?:Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /((?:password|passwd|secret|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|auth[-_]?token|jwt|credential)[a-z0-9_-]*["']?\s*[:=]\s*["']?)[^\s"',;&]{6,}/gi,
];

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, (match, prefix) => (prefix ? `${prefix}[REDACTED]` : '[REDACTED]'));
    return out;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = /passw|secret|token|api[-_]?key|apikey|credential|authorization|jwt|cookie|private/i.test(key) ? '[REDACTED]' : redactSecrets(entry);
    }
    return out;
  }
  return value;
}

const PRIVATE_HOSTS = new Set(['localhost', '0.0.0.0', '::1', 'host.docker.internal', 'metadata.google.internal']);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error(`Invalid URL "${String(raw).slice(0, 120)}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Only http(s) URLs are allowed, got "${url.protocol}"`);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (PRIVATE_HOSTS.has(host) || isPrivateIpv4(host) || host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.localhost')) {
    throw new Error(`Refusing to fetch private/internal host "${url.hostname}"`);
  }
  return url;
}

export function parseDateInput(value: unknown, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
