import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_CONTEXT = 'ryuksaidso:integrations:v1';

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (!cachedKey) {
    const secret = process.env.JWT_SECRET?.trim() || 'ryuksaidso-integrations-dev-secret';
    cachedKey = scryptSync(secret, KEY_CONTEXT, 32);
  }
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const parts = String(payload ?? '').split('.');
  if (parts.length !== 3) throw new Error('Stored credential is malformed');
  const [ivRaw, tagRaw, dataRaw] = parts;
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64')), decipher.final()]).toString('utf8');
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value ?? null));
}

export function decryptJson<T = Record<string, unknown>>(payload: string): T {
  return JSON.parse(decryptSecret(payload)) as T;
}

export function signIntegrationState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', encryptionKey()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyIntegrationState(token: string): Record<string, unknown> | null {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = createHmac('sha256', encryptionKey()).update(body).digest('base64url');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function webhookSignature(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyWebhookSignature(secret: string, timestamp: string, body: string, signature: string): boolean {
  const expected = webhookSignature(secret, timestamp, body);
  const a = Buffer.from(String(signature ?? ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function randomWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function randomWidgetKey(): string {
  return `wgt_${randomBytes(18).toString('base64url')}`;
}
