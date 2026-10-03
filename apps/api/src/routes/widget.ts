import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/db';
import { assertQuota, monthStart } from '../lib/entitlements';
import { emitWebhookEvent } from '@ryuksaidso/agent-tools';
import { enqueueRun } from '../services/queue';
import { widgetMessageSchema } from '../validation';

export const widgetRouter = Router();

export function widgetCorsHeaders(req: Request, res: Response, next: NextFunction) {
  const origin = String(req.headers.origin ?? '');
  res.setHeader('vary', 'Origin');
  res.setHeader('cross-origin-resource-policy', 'cross-origin');
  if (origin) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, x-request-id');
    res.setHeader('access-control-max-age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

const widgetLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'RateLimitExceeded', message: 'Too many requests, please try again later.' },
});

widgetRouter.use(widgetCorsHeaders);
widgetRouter.use(widgetLimiter);

const WIDGET_JS = String.raw`(() => {
  const script = document.currentScript;
  if (!script) return;
  const key = script.getAttribute('data-key');
  if (!key) return;
  const api = script.src.replace(/\/widget\.js(?:\?.*)?$/, '');
  const state = { cfg: null, sessionId: null, email: '', open: false, pending: false, timer: null, sent: false };

  const mount = () => {
    const host = document.createElement('div');
    host.setAttribute('data-ryuksaidso-widget', '1');
    const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    shadow.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.bubble{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:var(--acc,#8b5cf6);box-shadow:0 8px 24px rgba(0,0,0,.28);z-index:2147483000;display:flex;align-items:center;justify-content:center;color:#fff}' +
      '.bubble svg{width:26px;height:26px}' +
      '.panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;z-index:2147483001;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111827}' +
      '.panel[hidden]{display:none}' +
      '.head{background:var(--acc,#8b5cf6);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:15px}' +
      '.close{background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0 2px}' +
      '.msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f9fafb}' +
      '.msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word}' +
      '.visitor{align-self:flex-end;background:var(--acc,#8b5cf6);color:#fff;border-bottom-right-radius:4px}' +
      '.assistant{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}' +
      '.typing{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px;color:#6b7280;font-style:italic}' +
      '.compose{padding:10px 12px;background:#fff;border-top:1px solid #e5e7eb;display:flex;flex-direction:column;gap:8px}' +
      '.email{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font-size:13px}' +
      '.row{display:flex;gap:8px}' +
      '.input{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:9px 11px;font-size:13.5px;outline:none}' +
      '.input:focus{border-color:var(--acc,#8b5cf6)}' +
      '.send{background:var(--acc,#8b5cf6);color:#fff;border:none;border-radius:8px;padding:0 14px;font-size:13px;cursor:pointer;font-weight:600}' +
      '.send[disabled]{opacity:.55;cursor:default}' +
      '.foot{text-align:center;font-size:10.5px;color:#9ca3af;padding:6px 0 8px;background:#fff}' +
      '</style>' +
      '<button class="bubble" type="button" aria-label="Open chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></button>' +
      '<div class="panel" hidden>' +
      '<div class="head"><span class="title">Chat with us</span><button class="close" type="button" aria-label="Close chat">&times;</button></div>' +
      '<div class="msgs"></div>' +
      '<form class="compose"><input class="email" type="email" placeholder="Email (optional)" hidden /><div class="row"><input class="input" type="text" placeholder="Type a message..." maxlength="4000" /><button class="send" type="submit">Send</button></div></form>' +
      '<div class="foot">Powered by Ryuksaidso</div>' +
      '</div>';
    document.body.appendChild(host);

    const $ = (sel) => shadow.querySelector(sel);
    const bubble = $('.bubble');
    const panel = $('.panel');
    const msgs = $('.msgs');
    const form = $('.compose');
    const input = $('.input');
    const emailInput = $('.email');
    const send = $('.send');
    const title = $('.title');
    let greeted = false;

    const apiFetch = (path, opts) => fetch(api + '/' + key + path, Object.assign({ headers: { 'content-type': 'application/json', accept: 'application/json' } }, opts || {}));

    const render = () => {
      msgs.innerHTML = '';
      if (!greeted && state.cfg && state.cfg.greeting) {
        greeted = true;
        const g = document.createElement('div');
        g.className = 'msg assistant';
        g.textContent = state.cfg.greeting;
        msgs.appendChild(g);
      }
      (state.messages || []).forEach((m) => {
        const el = document.createElement('div');
        el.className = 'msg ' + (m.role === 'assistant' ? 'assistant' : 'visitor');
        el.textContent = String(m.content || '');
        msgs.appendChild(el);
      });
      if (state.pending) {
        const t = document.createElement('div');
        t.className = 'msg typing';
        t.textContent = 'Agent is thinking...';
        msgs.appendChild(t);
      }
      msgs.scrollTop = msgs.scrollHeight;
      send.disabled = state.pending;
    };

    const poll = async () => {
      if (!state.sessionId) return;
      try {
        const res = await apiFetch('/sessions/' + state.sessionId);
        if (!res.ok) return;
        const data = await res.json();
        state.messages = data.messages || [];
        state.pending = Boolean(data.pending);
        render();
      } catch {}
      if (state.pending) state.timer = setTimeout(poll, 2000);
      else state.timer = null;
    };

    const openPanel = () => {
      state.open = true;
      panel.hidden = false;
      if (state.cfg && state.cfg.collectEmail) emailInput.hidden = false;
      render();
      input.focus();
    };

    bubble.addEventListener('click', () => (state.open ? null : openPanel()));
    $('.close').addEventListener('click', () => {
      state.open = false;
      panel.hidden = true;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const content = input.value.trim();
      if (!content || state.pending) return;
      const email = (emailInput.value || '').trim() || state.email;
      send.disabled = true;
      try {
        const res = await apiFetch('/messages', {
          method: 'POST',
          body: JSON.stringify({ sessionId: state.sessionId || undefined, content, email: email || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          send.disabled = false;
          const el = document.createElement('div');
          el.className = 'msg assistant';
          el.textContent = data && data.message ? String(data.message) : 'Sorry, chat is unavailable right now. Please try again later.';
          msgs.appendChild(el);
          msgs.scrollTop = msgs.scrollHeight;
          return;
        }
        state.email = email;
        state.sessionId = data.sessionId;
        state.pending = true;
        state.messages = (data.messages || state.messages || []).concat([{ role: 'visitor', content }]);
        input.value = '';
        greeted = greeted || Boolean(state.cfg && state.cfg.greeting);
        render();
        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(poll, 1500);
      } catch {
        send.disabled = false;
      }
    });

    fetch(api + '/' + key + '/config', { headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('config'))))
      .then((cfg) => {
        state.cfg = cfg;
        host.style.setProperty('--acc', cfg.accent || '#8b5cf6');
        document.documentElement.style.setProperty('--ryuksaidso-widget-accent', cfg.accent || '#8b5cf6');
        title.textContent = cfg.title || 'Chat with us';
        if (cfg.collectEmail) emailInput.hidden = false;
      })
      .catch(() => {
        host.remove();
      });
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
`;

export function widgetScriptHandler(_req: Request, res: Response) {
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cross-origin-resource-policy', 'cross-origin');
  res.setHeader('cache-control', 'public, max-age=300');
  res.send(WIDGET_JS);
}

async function loadSetting(key: string) {
  const setting = await prisma.widgetSetting.findUnique({ where: { publicKey: key } });
  if (!setting) return { status: 404 as const, setting: null, message: 'Widget not found' };
  if (!setting.enabled) return { status: 403 as const, setting: null, message: 'Chat is disabled' };
  return { status: 200 as const, setting, message: '' };
}

function originAllowed(setting: { allowedOrigins: string[] }, req: Request): boolean {
  const allowed = Array.isArray(setting.allowedOrigins) ? setting.allowedOrigins : [];
  if (!allowed.length) return true;
  const origin = String(req.headers.origin ?? '').replace(/\/$/, '');
  if (!origin) return true;
  return allowed.some((entry) => String(entry).replace(/\/$/, '') === origin);
}

widgetRouter.get('/:key/config', async (req, res, next) => {
  try {
    const loaded = await loadSetting(String(req.params.key ?? ''));
    if (!loaded.setting) return res.status(loaded.status).json({ error: loaded.status === 404 ? 'NotFound' : 'Forbidden', message: loaded.message });
    const setting = loaded.setting;
    if (!originAllowed(setting, req)) return res.status(403).json({ error: 'Forbidden', message: 'Origin not allowed' });
    const agent = setting.agentId
      ? await prisma.agent.findFirst({ where: { id: setting.agentId, organizationId: setting.organizationId }, select: { name: true } })
      : null;
    res.json({
      title: setting.title,
      greeting: setting.greeting,
      accent: setting.accent,
      collectEmail: setting.collectEmail,
      agentName: agent?.name ?? null,
    });
  } catch (error) {
    next(error);
  }
});

widgetRouter.post('/:key/messages', async (req, res, next) => {
  try {
    const loaded = await loadSetting(String(req.params.key ?? ''));
    if (!loaded.setting) return res.status(loaded.status).json({ error: loaded.status === 404 ? 'NotFound' : 'Forbidden', message: loaded.message });
    const setting = loaded.setting;
    if (!originAllowed(setting, req)) return res.status(403).json({ error: 'Forbidden', message: 'Origin not allowed' });
    const body = widgetMessageSchema.parse(req.body);

    let session: any = null;
    if (body.sessionId) {
      session = await prisma.widgetSession.findFirst({ where: { id: body.sessionId, settingId: setting.id } });
      if (!session) return res.status(404).json({ error: 'NotFound', message: 'Session not found' });
    }

    const organizationId = setting.organizationId;
    const currentRuns = await prisma.agentRun.count({ where: { organizationId, createdAt: { gte: monthStart() } } });
    await assertQuota(organizationId, 'runs', currentRuns);

    let priorMessages = 0;
    if (!session) {
      if (!setting.agentId) return res.status(503).json({ error: 'Unavailable', message: 'Chat is not fully configured' });
      const agent = await prisma.agent.findFirst({ where: { id: setting.agentId, organizationId }, select: { id: true } });
      if (!agent) return res.status(503).json({ error: 'Unavailable', message: 'Chat is not fully configured' });
      session = await prisma.widgetSession.create({
        data: {
          organizationId,
          settingId: setting.id,
          visitorId: body.visitorId || `v_${Math.random().toString(36).slice(2, 12)}`,
          email: body.email ?? '',
          userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
        },
      });
    } else {
      priorMessages = await prisma.widgetMessage.count({ where: { sessionId: session.id } });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: setting.agentId ?? '', organizationId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!agent) return res.status(503).json({ error: 'Unavailable', message: 'Chat is not fully configured' });
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { llmProvider: true, ollamaModel: true, omnirouteModel: true } });
    const provider = organization?.llmProvider ?? 'OMNIROUTE';
    const model = provider === 'OMNIROUTE'
      ? organization?.omnirouteModel || ''
      : provider === 'OLLAMA'
        ? organization?.ollamaModel || ''
        : '';

    const run = await prisma.agentRun.create({
      data: {
        organizationId,
        projectId: agent.projectId ?? null,
        agentId: agent.id,
        agentVersionId: agent.versions[0]?.id ?? null,
        provider: provider as any,
        model,
        status: 'QUEUED',
        trigger: 'widget',
        environment: 'production',
        input: { prompt: body.content, widgetSessionId: session.id },
      },
    });

    await prisma.widgetMessage.create({
      data: { sessionId: session.id, organizationId, role: 'visitor', content: body.content.slice(0, 4000) },
    });
    if (body.email && !session.email) {
      await prisma.widgetSession.update({ where: { id: session.id }, data: { email: body.email } });
    }
    await prisma.widgetSession.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } });

    const firstMessage = priorMessages === 0;
    try {
      await enqueueRun(run.id, organizationId, {
        id: 'widget',
        email: session.email || 'visitor@widget.local',
        name: 'Website visitor',
        organizationId,
        role: 'AGENT',
      });
    } catch {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', error: 'Could not queue the chat request', finishedAt: new Date() },
      });
      await prisma.widgetMessage.create({
        data: {
          sessionId: session.id,
          organizationId,
          role: 'assistant',
          content: 'Sorry, chat is unavailable right now. Please try again in a moment.',
          runId: run.id,
        },
      }).catch(() => undefined);
    }
    if (firstMessage) {
      void emitWebhookEvent(prisma, organizationId, 'widget.conversation_started', { sessionId: session.id, runId: run.id }).catch(() => undefined);
    }

    const messages = await prisma.widgetMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' } });
    res.status(201).json({ sessionId: session.id, runId: run.id, pending: true, messages: messages.map((m: any) => ({ role: m.role, content: m.content, createdAt: m.createdAt })) });
  } catch (error) {
    next(error);
  }
});

widgetRouter.get('/:key/sessions/:id', async (req, res, next) => {
  try {
    const loaded = await loadSetting(String(req.params.key ?? ''));
    if (!loaded.setting) return res.status(loaded.status).json({ error: loaded.status === 404 ? 'NotFound' : 'Forbidden', message: loaded.message });
    const setting = loaded.setting;
    if (!originAllowed(setting, req)) return res.status(403).json({ error: 'Forbidden', message: 'Origin not allowed' });
    const session = await prisma.widgetSession.findFirst({ where: { id: String(req.params.id ?? ''), settingId: setting.id } });
    if (!session) return res.status(404).json({ error: 'NotFound', message: 'Session not found' });

    const runs = await prisma.agentRun.findMany({
      where: { organizationId: session.organizationId, input: { path: ['widgetSessionId'], equals: session.id } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const pending = runs.some((run: any) => ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(run.status));
    for (const run of runs) {
      if (!['COMPLETED', 'FAILED'].includes(run.status)) continue;
      const existing = await prisma.widgetMessage.findFirst({ where: { runId: run.id } });
      if (existing) continue;
      const output = (run.output ?? {}) as any;
      const answer = String(output.answer ?? output.response ?? output.text ?? '').trim();
      const content = run.status === 'COMPLETED'
        ? answer || 'I could not produce a response for that. Could you rephrase your question?'
        : String(run.error ?? '').slice(0, 500) || 'Sorry, something went wrong while handling your request.';
      try {
        await prisma.widgetMessage.create({
          data: { sessionId: session.id, organizationId: session.organizationId, role: 'assistant', content, runId: run.id },
        });
      } catch {
        continue;
      }
    }

    await prisma.widgetSession.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
    const messages = await prisma.widgetMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' } });
    res.json({
      sessionId: session.id,
      pending,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    });
  } catch (error) {
    next(error);
  }
});
