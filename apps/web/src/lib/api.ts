const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

let refreshPromise: Promise<boolean> | null = null;

function csrfToken() {
  if (typeof document === 'undefined') return undefined;
  const part = document.cookie.split('; ').find(x => x.startsWith('ryuksaidso_csrf='));
  return part?.split('=').slice(1).join('=');
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
    })
      .then(res => res.ok)
      .catch(() => false)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (!headers.has('content-type') && options.body) headers.set('content-type', 'application/json');
  const csrf = csrfToken();
  if (csrf && !['GET','HEAD','OPTIONS'].includes(method)) headers.set('x-csrf-token', decodeURIComponent(csrf));
  const res = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include', cache: 'no-store' });
  if (res.status === 401 && !retried && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/login') && !path.startsWith('/auth/register') && !path.startsWith('/auth/forgot-password') && !path.startsWith('/auth/reset-password') && !path.startsWith('/auth/verify-email')) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, options, true);
  }
  if (!res.ok) {
    const text = await res.text();
    const error = new Error(text) as Error & { status?: number };
    error.status = res.status; // lets callers tell "expired/forbidden" from transient failures
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function api<T>(path: string, options: RequestInit = {}) { return request<T>(path, options); }
export { API };
