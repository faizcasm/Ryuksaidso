import { describe, expect, it, vi } from 'vitest';
import { config } from '../lib/config';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  cookieOptions,
  csrfCookieOptions,
  hashPassword,
  setCsrfCookie,
  setSessionCookies,
  verifyPassword
} from '../lib/auth';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('never returns the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    expect(hash.startsWith('$2')).toBe(true);
  });
});

describe('cookie helpers', () => {
  it('sets session cookies httpOnly with the configured same site policy', () => {
    expect(cookieOptions(1000)).toMatchObject({ httpOnly: true, path: '/', maxAge: 1000, sameSite: config.COOKIE_SAME_SITE });
  });

  it('exposes the csrf cookie to scripts', () => {
    expect(csrfCookieOptions()).toMatchObject({ httpOnly: false, path: '/' });
  });

  it('writes the access, refresh and csrf cookies', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    setSessionCookies(res, 'access-token', 'refresh-token');

    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.objectContaining({ path: '/api/auth' }));

    const cookies = res.cookie.mock.calls.map((call) => call[0]);
    expect(cookies).toEqual([ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]);

    const [accessName, accessToken, accessOptions] = res.cookie.mock.calls[0];
    expect(accessName).toBe(ACCESS_COOKIE);
    expect(accessToken).toBe('access-token');
    expect(accessOptions).toMatchObject({ httpOnly: true, path: '/' });

    const [, refreshToken, refreshOptions] = res.cookie.mock.calls[1];
    expect(refreshToken).toBe('refresh-token');
    expect(refreshOptions).toMatchObject({ httpOnly: true, path: '/api', maxAge: config.REFRESH_TOKEN_TTL_MS });

    const [csrfName, csrfValue, csrfOptions] = res.cookie.mock.calls[2];
    expect(csrfName).toBe(CSRF_COOKIE);
    expect(typeof csrfValue).toBe('string');
    expect(csrfValue.length).toBeGreaterThanOrEqual(32);
    expect(csrfOptions).toMatchObject({ httpOnly: false });
  });

  it('clears every auth cookie including the legacy refresh path', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    clearAuthCookies(res);

    const cleared = res.clearCookie.mock.calls.map((call) => [call[0], call[1]?.path]);
    expect(cleared).toEqual([
      [ACCESS_COOKIE, '/'],
      [REFRESH_COOKIE, '/api'],
      [REFRESH_COOKIE, '/api/auth'],
      [CSRF_COOKIE, '/']
    ]);
  });

  it('reuses a caller supplied csrf token', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    expect(setCsrfCookie(res, 'known-token')).toBe('known-token');
    expect(res.cookie).toHaveBeenCalledWith(CSRF_COOKIE, 'known-token', expect.anything());
  });
});
