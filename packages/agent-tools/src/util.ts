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
