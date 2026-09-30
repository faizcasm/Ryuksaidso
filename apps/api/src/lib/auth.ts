import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { prisma } from './db';

export type AuthUser = { id: string; email: string; name: string; organizationId: string; role: string; userRole?: string };
export type OAuthProvider = 'google' | 'github';

const ACCESS_COOKIE = 'ryuksaidso_access';
const REFRESH_COOKIE = 'ryuksaidso_refresh';
const CSRF_COOKIE = 'ryuksaidso_csrf';

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: config.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none', path: '/', maxAge } as const;
}

export function csrfCookieOptions() {
  return { httpOnly: false, secure: config.COOKIE_SECURE, sameSite: config.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none', path: '/', maxAge: 86_400_000 } as const;
}

type CookieFn = (...args: any[]) => any;

export function setCsrfCookie(res: { cookie: CookieFn }, token = crypto.randomBytes(32).toString('hex')) {
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  return token;
}

export function clearAuthCookies(res: { clearCookie: CookieFn }) {
  const base = { secure: config.COOKIE_SECURE, sameSite: config.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none' } as const;
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false, path: '/' });
}

export function setSessionCookies(res: { cookie: CookieFn; clearCookie: CookieFn }, accessToken: string, refreshToken: string) {
  const base = { secure: config.COOKIE_SECURE, sameSite: config.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none', httpOnly: true } as const;
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/auth' });
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, path: '/api', maxAge: config.REFRESH_TOKEN_TTL_MS });
  setCsrfCookie(res);
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, config.JWT_SECRET, { expiresIn: config.ACCESS_TOKEN_TTL as any, issuer: 'ryuksaidso-api', audience: 'ryuksaidso-web' });
}

export function verifyToken(token: string): AuthUser | null {
  try { return jwt.verify(token, config.JWT_SECRET, { issuer: 'ryuksaidso-api', audience: 'ryuksaidso-web' }) as AuthUser; }
  catch { return null; }
}

export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }

function hashToken(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
function randomToken() { return crypto.randomBytes(48).toString('base64url'); }

export async function resolveSystemRole(user: Pick<AuthUser, 'id' | 'email' | 'userRole'>): Promise<string> {
  const email = (user.email || '').toLowerCase();
  if (config.SYSTEM_ADMIN_EMAILS.includes(email)) {
    if (user.userRole !== 'ADMIN') {
      await prisma.user.updateMany({ where: { id: user.id, userRole: { not: 'ADMIN' } }, data: { userRole: 'ADMIN' } });
    }
    return 'ADMIN';
  }
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { userRole: true } });
  return row?.userRole ?? 'USER';
}

export async function createSession(user: AuthUser) {
  const refreshToken = randomToken();
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_MS);
  const subject: AuthUser = { ...user, userRole: await resolveSystemRole(user) };
  await prisma.session.create({ data: { userId: user.id, organizationId: user.organizationId, tokenHash: hashToken(refreshToken), expiresAt } });
  return { accessToken: signToken(subject), refreshToken, expiresAt, user: subject };
}

export async function rotateSession(refreshToken: string): Promise<{ user: AuthUser; accessToken: string; refreshToken: string } | null> {
  const old = await prisma.session.findUnique({ where: { tokenHash: hashToken(refreshToken) }, include: { user: { include: { memberships: true } } } });
  if (!old || old.revokedAt || old.expiresAt <= new Date()) return null;
  const organizationId = old.organizationId || old.user.memberships[0]?.organizationId;
  if (!organizationId) return null;
  const membership = old.user.memberships.find(m => m.organizationId === organizationId);
  if (!membership) return null;
  const user: AuthUser = { id: old.user.id, email: old.user.email, name: old.user.name, organizationId, role: membership.role, userRole: old.user.userRole };
  const next = await prisma.$transaction(async tx => {
    const revoked = await tx.session.updateMany({ where: { id: old.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
    if (revoked.count !== 1) return null;
    const token = randomToken();
    await tx.session.create({ data: { userId: user.id, organizationId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_MS) } });
    return token;
  });
  if (!next) return null;
  user.userRole = await resolveSystemRole(user);
  return { user, accessToken: signToken(user), refreshToken: next };
}

export async function switchSessionOrganization(refreshToken: string, organizationId: string): Promise<{ user: AuthUser; accessToken: string; refreshToken: string } | null> {
  const old = await prisma.session.findUnique({ where: { tokenHash: hashToken(refreshToken) }, include: { user: { include: { memberships: true } } } });
  if (!old || old.revokedAt || old.expiresAt <= new Date()) return null;
  const membership = old.user.memberships.find(m => m.organizationId === organizationId);
  if (!membership) return null;
  const user: AuthUser = { id: old.user.id, email: old.user.email, name: old.user.name, organizationId, role: membership.role, userRole: old.user.userRole };
  const next = await prisma.$transaction(async tx => {
    const changed = await tx.session.updateMany({ where: { id: old.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
    if (changed.count !== 1) return null;
    const token = randomToken();
    await tx.session.create({ data: { userId: user.id, organizationId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_MS) } });
    return token;
  });
  if (!next) return null;
  user.userRole = await resolveSystemRole(user);
  return { user, accessToken: signToken(user), refreshToken: next };
}

export async function revokeSession(refreshToken: string) {
  await prisma.session.updateMany({ where: { tokenHash: hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function userFromAccessToken(token: string) { return verifyToken(token); }

export async function audit(user: AuthUser | undefined, action: string, resource: string, resourceId?: string, metadata?: unknown) {
  await prisma.auditLog.create({ data: { organizationId: user?.organizationId, userId: user?.id, action, resource, resourceId, metadata: metadata as any } });
}

export function providerConfig(provider: OAuthProvider) {
  if (provider === 'google') {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI) return null;
    return { authorization: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', userinfo: 'https://openidconnect.googleapis.com/v1/userinfo', clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET, redirectUri: config.GOOGLE_REDIRECT_URI, scope: 'openid email profile' };
  }
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET || !config.GITHUB_REDIRECT_URI) return null;
  return { authorization: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', userinfo: 'https://api.github.com/user', clientId: config.GITHUB_CLIENT_ID, clientSecret: config.GITHUB_CLIENT_SECRET, redirectUri: config.GITHUB_REDIRECT_URI, scope: 'read:user user:email' };
}

export { ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE };
