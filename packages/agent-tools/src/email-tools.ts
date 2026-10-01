import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { softFail } from './util';
import type { ToolDef } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 60_000;

const str = (value: unknown): string => String(value ?? '').trim();

function listOrString(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? value.split(/[,;]/) : [];
  return list.map((entry) => str(entry)).filter(Boolean);
}

function assertEmails(list: string[], what: string): string[] {
  if (!list.length) throw new Error(`${what} must include at least one email address`);
  for (const address of list) if (!EMAIL_RE.test(address)) throw new Error(`Invalid email address "${address.slice(0, 80)}" in ${what}`);
  if (list.length > 20) throw new Error(`${what} accepts at most 20 recipients`);
  return list;
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

function imapConfig(): { host: string; port: number; user: string; password: string } | null {
  const smtpHost = process.env.SMTP_HOST ?? '';
  const host = process.env.IMAP_HOST?.trim() || (smtpHost ? smtpHost.replace(/^smtp\./i, 'imap.') : '');
  const user = process.env.IMAP_USER?.trim() || process.env.SMTP_USER?.trim() || '';
  const password = process.env.IMAP_PASSWORD?.trim() || process.env.SMTP_PASSWORD?.trim() || '';
  const port = Number(process.env.IMAP_PORT || 993);
  if (!host || !user || !password) return null;
  return { host, port, user, password };
}

function mailTransport() {
  if (!smtpConfigured()) throw new Error('Email sending is not configured. Set SMTP_HOST and EMAIL_FROM.');
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' } } : {}),
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

async function withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const config = imapConfig();
  if (!config) throw new Error('IMAP inbox is not configured. Set IMAP_HOST, IMAP_USER and IMAP_PASSWORD (or SMTP credentials for Gmail).');
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth: { user: config.user, pass: config.password },
    tls: { rejectUnauthorized: true },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {}
  }
}

function addressList(parsed: any, field: 'from' | 'to' | 'cc'): string[] {
  const value = parsed?.[field]?.value;
  if (!Array.isArray(value)) return [];
  return value.map((entry: any) => entry.address ?? '').filter(Boolean);
}

function firstAddress(parsed: any, field: 'from' | 'to' | 'cc'): string {
  return addressList(parsed, field)[0] ?? '';
}

async function fetchMessage(client: ImapFlow, folder: string, uid: number) {
  const uids = String(uid);
  let source: Buffer | string | null = null;
  const messages = client.fetch(uids, { uid: true, envelope: true, source: true }, { uid: true });
  for await (const message of messages) {
    const raw = (message as any).source;
    source = typeof raw === 'string' ? raw : raw ?? null;
  }
  if (!source) throw new Error(`Message ${folder}:${uid} was not found`);
  return simpleParser(source);
}

export function buildEmailTools(prisma: any): Record<string, ToolDef> {
  async function persist(ctx: any, data: Record<string, unknown>) {
    try {
      return await prisma.emailRecord.create({
        data: {
          organizationId: ctx.user.organizationId,
          direction: String(data.direction ?? 'OUTBOUND'),
          status: String(data.status ?? 'SENT'),
          from: String(data.from ?? ''),
          to: (data.to ?? []) as any,
          cc: (data.cc ?? []) as any,
          subject: String(data.subject ?? ''),
          body: typeof data.body === 'string' ? data.body.slice(0, 20_000) : null,
          messageId: (data.messageId as string) ?? null,
          inReplyTo: (data.inReplyTo as string) ?? null,
          provider: (data.provider as string) ?? null,
          folder: (data.folder as string) ?? null,
          uid: typeof data.uid === 'number' ? data.uid : null,
          runId: ctx.runId,
          sentBy: ctx.user.id,
        },
      });
    } catch {
      return null;
    }
  }

  async function audit(ctx: any, action: string, metadata: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
          action,
          resource: 'tool',
          resourceId: 'email',
          metadata: { runId: ctx.runId, ...metadata } as any,
        },
      });
    } catch {}
  }

  return {
    search_email: {
      name: 'search_email',
      description:
        'Search the mailbox (and locally sent records) for emails. Input: { query: string (matched against subject/sender/body text), folder?: string (default INBOX), limit?: number (1-25, default 10), sinceDays?: number (default 90) }. Returns message ids, senders, subjects, dates and snippets. Falls back to stored sent mail when the inbox is unreachable.',
      category: 'Email',
      scope: 'email:read',
      requiresApproval: false,
      execute: (input: Record<string, unknown>, ctx: any) =>
        softFail(async () => {
          const query = str(input.query ?? input.q);
          const limit = Math.min(Math.max(Number(input.limit ?? 10) || 10, 1), 25);
          const folder = str(input.folder) || 'INBOX';
          const sinceDays = Math.min(Math.max(Number(input.sinceDays ?? 90) || 90, 1), 730);
          const since = new Date();
          since.setDate(since.getDate() - sinceDays);

          let inbox: any[] = [];
          let inboxError: string | null = null;
          try {
            inbox = await withImap(async (client) => {
              const criteria: Record<string, unknown> = { all: true, since };
              const searchSet = await client.search(criteria as any, { uid: true } as any);
              const uids = [...(searchSet as any)].map(Number).filter(Number.isFinite).sort((a, b) => b - a).slice(0, 120);
              if (!uids.length) return [];
              const found: any[] = [];
              const messages = client.fetch(uids.join(','), { uid: true, envelope: true, bodyStructure: false, flags: true }, { uid: true });
              for await (const message of messages) {
                const envelope: any = (message as any).envelope;
                found.push({
                  id: `${folder}:${message.uid}`,
                  uid: message.uid,
                  folder,
                  from: envelope?.from?.map((entry: any) => entry.address).filter(Boolean) ?? [],
                  to: envelope?.to?.map((entry: any) => entry.address).filter(Boolean) ?? [],
                  subject: envelope?.subject ?? '(no subject)',
                  date: envelope?.date ? new Date(envelope.date).toISOString() : null,
                  snippet: '',
                });
              }
              const needle = query.toLowerCase();
              const filtered = needle ? found.filter((entry) => `${entry.subject} ${entry.from.join(' ')}`.toLowerCase().includes(needle)) : found;
              return filtered.slice(0, limit);
            });
          } catch (error) {
            inboxError = error instanceof Error ? error.message : String(error);
          }

          const needle = query.toLowerCase();
          const stored = await prisma.emailRecord.findMany({
            where: { organizationId: ctx.user.organizationId, createdAt: { gte: since } },
            orderBy: { createdAt: 'desc' },
            take: 100,
          });
          const storedMatches = stored
            .filter((record: any) =>
              !needle ||
              `${record.subject} ${record.from}`.toLowerCase().includes(needle) ||
              (record.to as string[] | null)?.join?.(' ').toLowerCase().includes(needle),
            )
            .slice(0, limit)
            .map((record: any) => ({
              id: record.id,
              direction: record.direction,
              from: [record.from],
              to: (record.to as string[]) ?? [],
              subject: record.subject,
              date: record.createdAt.toISOString(),
              snippet: String(record.body ?? '').slice(0, 240),
              stored: true,
            }));

          const merged = [...inbox, ...storedMatches].slice(0, limit);
          return {
            query,
            folder,
            results: merged,
            count: merged.length,
            ...(inboxError ? { inboxNote: `Inbox unavailable (${inboxError}) — showing stored messages only.` } : {}),
            ...(merged.length ? {} : { note: 'No messages matched.' }),
          };
        }),
    },

    read_email: {
      name: 'read_email',
      description:
        'Read one email in full (headers, text body, attachment list). This runs automatically without approval. Input: { id: string — either "FOLDER:UID" (e.g. "INBOX:42") from search_email, or a stored record id }. Body text is capped at 60000 characters.',
      category: 'Email',
      scope: 'email:read',
      requiresApproval: false,
      execute: (input: Record<string, unknown>, ctx: any) =>
        softFail(async () => {
          const id = str(input.id ?? input.uid);
          if (!id) throw new Error('id is required');
          if (!id.includes(':')) {
            const record = await prisma.emailRecord.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
            if (!record) throw new Error(`Stored email ${id} not found`);
            return {
              id: record.id,
              direction: record.direction,
              from: record.from,
              to: (record.to as string[]) ?? [],
              cc: (record.cc as string[]) ?? [],
              subject: record.subject,
              date: record.createdAt.toISOString(),
              body: String(record.body ?? ''),
              stored: true,
            };
          }
          const [folder, uidRaw] = id.split(':');
          const uid = Number(uidRaw);
          if (!Number.isInteger(uid) || uid <= 0) throw new Error('id must look like "FOLDER:UID"');
          const parsed = await withImap((client) => fetchMessage(client, folder, uid));
          const body = (parsed.text ?? '').slice(0, MAX_BODY);
          return {
            id,
            from: addressList(parsed, 'from'),
            to: addressList(parsed, 'to'),
            cc: addressList(parsed, 'cc'),
            subject: parsed.subject ?? '(no subject)',
            date: parsed.date ? parsed.date.toISOString() : null,
            messageId: parsed.messageId ?? null,
            inReplyTo: parsed.inReplyTo ?? null,
            body,
            attachments: (parsed.attachments ?? []).map((entry: any) => ({ filename: entry.filename, size: entry.size, contentType: entry.contentType })),
          };
        }),
    },

    send_email: {
      name: 'send_email',
      description:
        'Send an email through the configured SMTP account. This is an outbound side effect and always requires human confirmation before it runs. Input: { to: string[] | string, subject: string, body: string, cc?: string[] }.',
      category: 'Email',
      scope: 'email:write',
      requiresApproval: true,
      execute: (input: Record<string, unknown>, ctx: any) =>
        softFail(async () => {
          const to = assertEmails(listOrString(input.to), 'to');
          const cc = listOrString(input.cc);
          if (cc.length) assertEmails(cc, 'cc');
          const subject = str(input.subject);
          if (!subject) throw new Error('subject is required');
          const body = str(input.body ?? input.text ?? '');
          if (!body) throw new Error('body is required');
          const from = process.env.EMAIL_FROM ?? '';
          const info = await mailTransport().sendMail({ from, to, ...(cc.length ? { cc } : {}), subject, text: body.slice(0, MAX_BODY) });
          await persist(ctx, { direction: 'OUTBOUND', status: 'SENT', from, to, cc, subject, body, messageId: info.messageId ?? null, provider: 'smtp' });
          await audit(ctx, 'tool.email.send', { to, subject });
          return { sent: true, to, cc, subject, messageId: info.messageId ?? null, from };
        }),
    },

    reply_email: {
      name: 'reply_email',
      description:
        'Reply to an inbound email (threads headers preserved). This is an outbound side effect and requires human confirmation. Input: { id: string ("FOLDER:UID" from search_email), body: string, replyAll?: boolean (default false) }.',
      category: 'Email',
      scope: 'email:write',
      requiresApproval: true,
      execute: (input: Record<string, unknown>, ctx: any) =>
        softFail(async () => {
          const id = str(input.id);
          const body = str(input.body ?? input.text ?? '');
          if (!id.includes(':')) throw new Error('id must reference an inbox message as "FOLDER:UID"');
          if (!body) throw new Error('body is required');
          const [folder, uidRaw] = id.split(':');
          const uid = Number(uidRaw);
          if (!Number.isInteger(uid) || uid <= 0) throw new Error('id must look like "FOLDER:UID"');
          const replyAll = input.replyAll === true || input.replyAll === 'true';
          const parsed = await withImap((client) => fetchMessage(client, folder, uid));
          const from = firstAddress(parsed, 'from');
          if (!from) throw new Error('Original message has no sender to reply to');
          const selfAddress = (process.env.IMAP_USER || process.env.SMTP_USER || process.env.EMAIL_FROM || '').toLowerCase();
          const recipients = [from, ...(replyAll ? addressList(parsed, 'to').filter((address) => address.toLowerCase() !== selfAddress) : [])];
          const uniqueRecipients = [...new Set(recipients)];
          const subject = `Re: ${String(parsed.subject ?? '').replace(/^re:\s*/i, '')}`;
          const fromAddress = process.env.EMAIL_FROM ?? '';
          const references = [parsed.references, parsed.messageId].filter(Boolean).join(' ').trim();
          const info = await mailTransport().sendMail({
            from: fromAddress,
            to: uniqueRecipients,
            subject,
            text: body.slice(0, MAX_BODY),
            ...(parsed.messageId ? { inReplyTo: parsed.messageId } : {}),
            ...(references ? { references } : {}),
          });
          await persist(ctx, {
            direction: 'OUTBOUND',
            status: 'SENT',
            from: fromAddress,
            to: uniqueRecipients,
            subject,
            body,
            messageId: info.messageId ?? null,
            inReplyTo: parsed.messageId ?? null,
            provider: 'smtp',
          });
          await audit(ctx, 'tool.email.reply', { to: uniqueRecipients, subject, inReplyTo: id });
          return { sent: true, to: uniqueRecipients, subject, messageId: info.messageId ?? null, inReplyTo: parsed.messageId ?? null, replyAll };
        }),
    },
  };
}
