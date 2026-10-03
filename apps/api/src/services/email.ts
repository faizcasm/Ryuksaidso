import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

const MAX_ATTEMPTS = 3;

export function isEmailConfigured(): boolean {
  return Boolean(config.SMTP_HOST && config.EMAIL_FROM);
}

function useSecureTransport(): boolean {
  return config.SMTP_SECURE || config.SMTP_PORT === 465;
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!isEmailConfigured()) {
    throw new Error('Email delivery is not configured. Set SMTP_HOST and EMAIL_FROM.');
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: useSecureTransport(),
      auth: config.SMTP_USER && config.SMTP_PASSWORD
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return transport;
}

function resetTransport() {
  if (transport) {
    try { transport.close(); } catch {  }
    transport = null;
  }
}

export async function verifyEmailTransport(): Promise<boolean> {
  if (!isEmailConfigured()) {
    logger.warn('Email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM.');
    return false;
  }
  try {
    await getTransport().verify();
    logger.info(
      'SMTP connection verified — email delivery is ready',
      { host: config.SMTP_HOST, port: config.SMTP_PORT, secure: useSecureTransport() },
    );
    return true;
  } catch (error) {
    logger.error(
      'SMTP connection check failed — emails will not be delivered',
      { host: config.SMTP_HOST, port: config.SMTP_PORT, secure: useSecureTransport(), error: describeError(error) },
    );
    resetTransport();
    return false;
  }
}

type ErrorLike = { code?: string; responseCode?: number; message?: string };

function errorOf(error: unknown): ErrorLike {
  return (error ?? {}) as ErrorLike;
}

function describeError(error: unknown): string {
  const { code, message = '' } = errorOf(error);
  const first = message.split('\n')[0];

  if (code === 'EAUTH') {
    return `SMTP authentication failed for ${config.SMTP_USER} at ${config.SMTP_HOST}:${config.SMTP_PORT}. ` +
      `Check SMTP_USER / SMTP_PASSWORD (Gmail requires a 16-character App Password). (${first})`;
  }
  if (code === 'EENVELOPE' || code === 'EMESSAGE' || (errorOf(error).responseCode ?? 0) >= 500) {
    return `The SMTP server rejected the message: ${first}`;
  }
  if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET'].includes(String(code))
    || /closed|timeout|timed out|greeting|socket|connect/i.test(first)) {
    return `Could not reach SMTP server ${config.SMTP_HOST}:${config.SMTP_PORT} (${first}). ` +
      `Check SMTP_HOST / SMTP_PORT and SMTP_SECURE (port 465 requires implicit TLS — enabled automatically when SMTP_PORT=465).`;
  }
  return `Email delivery failed: ${first}`;
}

function isRetriable(error: unknown): boolean {
  const { code } = errorOf(error);
  if (code === 'EAUTH' || code === 'EENVELOPE' || code === 'EMESSAGE') return false;
  return true;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function sendEmail(to: string, subject: string, text: string, html: string) {
  if (!isEmailConfigured()) {
    logger.warn('Email delivery is not configured. Set SMTP_HOST and EMAIL_FROM in your environment variables.');
    throw new Error('Email delivery is not configured. Set SMTP_HOST and EMAIL_FROM.');
  }

  const payload = { from: config.EMAIL_FROM, to, subject, text, html };
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const info = await getTransport().sendMail(payload);
      logger.info('Email sent successfully', { to, subject, messageId: info.messageId, attempt });
      return info;
    } catch (error) {
      lastError = error;
      const { code, message = '' } = errorOf(error);
      const first = message.split('\n')[0];
      logger.warn('Email send attempt failed', { to, subject, attempt, code, error: first });

      if (!isRetriable(error) || attempt === MAX_ATTEMPTS) break;

      if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET'].includes(String(code)) || /closed|timeout/i.test(first)) {
        resetTransport();
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  const friendly = describeError(lastError);
  logger.error('Email sending failed', { to, subject, error: friendly });
  throw new Error(friendly);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail(
    to,
    `${config.APP_NAME} password reset`,
    `Reset your ${config.APP_NAME} password using this link:\n\n${resetUrl}\n\nThis link expires in 30 minutes.`,
    `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>${config.APP_NAME} password reset</h2><p>Use the button below to choose a new password. This link expires in 30 minutes.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#7c3aed;color:#fff;text-decoration:none">Reset password</a></p></div>`
  );
  logger.info('Password reset email sent', { to, event: 'password_reset_email_sent' });
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  await sendEmail(
    to,
    `${config.APP_NAME} verify your email`,
    `Verify your ${config.APP_NAME} account using this link:\n\n${verifyUrl}\n\nThis link expires in 30 minutes.`,
    `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>Verify your ${config.APP_NAME} email</h2><p>Confirm your email address to finish securing your account.</p><p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#7c3aed;color:#fff;text-decoration:none">Verify email</a></p></div>`
  );
  logger.info('Verification email sent', { to, event: 'verification_email_sent' });
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

export async function sendWorkspaceInvitationEmail(to: string, workspaceName: string, role: string, inviteUrl: string) {
  const safeName = escapeHtml(workspaceName);
  const safeRole = escapeHtml(role);
  await sendEmail(
    to,
    `You have been invited to ${workspaceName}`,
    `You have been invited to join ${workspaceName} on ${config.APP_NAME} as ${role}.\n\nAccept the invitation: ${inviteUrl}\n\nThis invitation expires in 7 days.`,
    `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>Join ${safeName}</h2><p>You were invited to join this workspace as <b>${safeRole}</b>.</p><p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#7c3aed;color:#fff;text-decoration:none">Accept invitation</a></p><p>This invitation expires in 7 days.</p></div>`
  );
  logger.info('Workspace invitation sent', { to, workspaceName, role, event: 'workspace_invitation_sent' });
}

export async function sendPromoCodeEmail(to: string, code: string, billingUrl: string) {
  const safeCode = escapeHtml(code);
  await sendEmail(
    to,
    `${config.APP_NAME} — your 20% subscription discount`,
    `You connected your own model provider and ran agents through it, so your 20% discount is unlocked.\n\nPromo code: ${code}\n\nApply it in Settings → Billing before checkout:\n${billingUrl}`,
    `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>Your 20% discount is unlocked</h2><p>Thanks for bringing your own model provider to ${config.APP_NAME}. Apply this code at <b>Settings &rarr; Billing</b> to get <b>20% off</b> your subscription:</p><p style="font-size:22px;font-weight:bold;letter-spacing:2px;padding:14px 18px;border-radius:8px;background:#f3efff;color:#7c3aed;text-align:center">${safeCode}</p><p><a href="${escapeHtml(billingUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#7c3aed;color:#fff;text-decoration:none">Open billing</a></p></div>`
  );
  logger.info('Promo code email sent', { to, event: 'promo_code_email_sent' });
}
