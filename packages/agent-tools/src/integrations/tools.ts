import type { BuildToolsDeps, ToolContext, ToolDef } from '../types';
import { softFail } from '../util';
import { assertProviderUsable, resolveConnectionTokens, recordIntegrationLog, type TokenBundle } from './connection';
import {
  gmailSearch,
  gmailRead,
  gmailSend,
  outlookSearch,
  outlookRead,
  outlookSend,
  slackChannels,
  slackPostMessage,
  teamsPostWebhook,
  whatsappSend,
  driveSearch,
  driveRead,
  notionSearch,
  notionPageText,
  jiraSearch,
  jiraCreateIssue,
  jiraComment,
  linearSearch,
  linearCreateIssue,
  hubspotSearchContacts,
  hubspotCreateContact,
  shopifyListProducts,
  shopifySearchOrders,
} from './clients';

const str = (value: unknown): string => String(value ?? '').trim();
const intIn = (value: unknown, fallback: number, min: number, max: number): number => {
  const num = Number(value ?? fallback);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(Math.trunc(num), min), max);
};

export function buildIntegrationTools(deps: BuildToolsDeps): Record<string, ToolDef> {
  const { prisma } = deps;

  async function withConnection<T>(
    providerKey: string,
    ctx: ToolContext,
    fn: (tokens: TokenBundle) => Promise<T>,
  ): Promise<T> {
    const organizationId = ctx?.user?.organizationId ?? '';
    if (!organizationId) throw new Error('No organization context for integration tools');
    await assertProviderUsable(prisma, providerKey);
    const { tokens } = await resolveConnectionTokens(prisma, organizationId, providerKey);
    try {
      return await fn(tokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordIntegrationLog(prisma, {
        organizationId,
        provider: providerKey,
        level: 'error',
        event: 'tool_call_failed',
        message: message.slice(0, 500),
        metadata: { runId: ctx.runId, agentId: ctx.agentId ?? null },
      });
      throw error;
    }
  }

  const emailRecord = async (ctx: ToolContext, provider: string, opts: { to: string; subject: string; body: string; messageId?: string }) => {
    try {
      await prisma.emailRecord.create({
        data: {
          organizationId: ctx.user.organizationId,
          direction: 'outbound',
          status: 'sent',
          from: `${provider} mailbox`,
          to: [opts.to],
          subject: opts.subject,
          body: opts.body.slice(0, 20_000),
          messageId: opts.messageId ?? '',
          provider,
          runId: ctx.runId ?? null,
          sentBy: ctx.user.id ?? null,
        },
      });
    } catch {
      return;
    }
  };

  const tools: Record<string, ToolDef> = {
    gmail_search: {
      name: 'gmail_search',
      description: 'Search the connected Gmail mailbox. Input: { query: string (Gmail search syntax, e.g. "from:acme.com subject:invoice"), limit?: number (1-10) }.',
      category: 'Integrations',
      scope: 'gmail:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() =>
          withConnection('gmail', ctx, (tokens) =>
            gmailSearch(tokens, str(input.query ?? input.q), intIn(input.limit, 5, 1, 10)),
          ),
        ),
    },
    gmail_read: {
      name: 'gmail_read',
      description: 'Read one Gmail message by id. Input: { messageId: string }.',
      category: 'Integrations',
      scope: 'gmail:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(async () => {
          const messageId = str(input.messageId ?? input.id);
          if (!messageId) throw new Error('messageId is required');
          return withConnection('gmail', ctx, (tokens) => gmailRead(tokens, messageId));
        }),
    },
    gmail_send: {
      name: 'gmail_send',
      description: 'Send an email from the connected Gmail mailbox. This is a write side effect and requires human approval. Input: { to: string, subject: string, body: string }.',
      category: 'Integrations',
      scope: 'gmail:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const to = str(input.to);
          const subject = str(input.subject);
          const body = str(input.body ?? input.message ?? input.text);
          if (!to || !to.includes('@')) throw new Error('to must be an email address');
          if (!subject) throw new Error('subject is required');
          if (!body) throw new Error('body is required');
          const result = await withConnection('gmail', ctx, (tokens) => gmailSend(tokens, { to, subject, body }));
          await emailRecord(ctx, 'gmail', { to, subject, body, messageId: String(result?.id ?? '') });
          return { action: 'sent_email', provider: 'gmail', to, subject, messageId: String(result?.id ?? '') };
        }),
    },
    outlook_search: {
      name: 'outlook_search',
      description: 'Search the connected Outlook / Microsoft 365 mailbox. Input: { query?: string (matches subject), limit?: number (1-10) }.',
      category: 'Integrations',
      scope: 'outlook:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() => withConnection('outlook', ctx, (tokens) => outlookSearch(tokens, str(input.query ?? input.q), intIn(input.limit, 5, 1, 10)))),
    },
    outlook_read: {
      name: 'outlook_read',
      description: 'Read one Outlook message by id. Input: { messageId: string }.',
      category: 'Integrations',
      scope: 'outlook:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(async () => {
          const messageId = str(input.messageId ?? input.id);
          if (!messageId) throw new Error('messageId is required');
          return withConnection('outlook', ctx, (tokens) => outlookRead(tokens, messageId));
        }),
    },
    outlook_send: {
      name: 'outlook_send',
      description: 'Send an email from the connected Outlook mailbox. This is a write side effect and requires human approval. Input: { to: string, subject: string, body: string }.',
      category: 'Integrations',
      scope: 'outlook:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const to = str(input.to);
          const subject = str(input.subject);
          const body = str(input.body ?? input.message ?? input.text);
          if (!to || !to.includes('@')) throw new Error('to must be an email address');
          if (!subject) throw new Error('subject is required');
          if (!body) throw new Error('body is required');
          await withConnection('outlook', ctx, (tokens) => outlookSend(tokens, { to, subject, body }));
          await emailRecord(ctx, 'outlook', { to, subject, body });
          return { action: 'sent_email', provider: 'outlook', to, subject };
        }),
    },
    slack_list_channels: {
      name: 'slack_list_channels',
      description: 'List Slack channels available to the connected workspace. Input: {}.',
      category: 'Integrations',
      scope: 'slack:read',
      requiresApproval: false,
      execute: (_input, ctx) => softFail(() => withConnection('slack', ctx, (tokens) => slackChannels(tokens))),
    },
    slack_send_message: {
      name: 'slack_send_message',
      description: 'Post a message to a Slack channel. This is a write side effect and requires human approval. Input: { channel: string (channel id like C012345 or name like #support), text: string }.',
      category: 'Integrations',
      scope: 'slack:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const channel = str(input.channel);
          const text = str(input.text ?? input.message ?? input.prompt);
          if (!channel) throw new Error('channel is required');
          if (!text) throw new Error('text is required');
          const result = await withConnection('slack', ctx, (tokens) => slackPostMessage(tokens, channel, text));
          return { action: 'posted_message', provider: 'slack', ...result };
        }),
    },
    teams_send_message: {
      name: 'teams_send_message',
      description: 'Post an adaptive card message to the connected Microsoft Teams channel webhook. This is a write side effect and requires human approval. Input: { text: string }.',
      category: 'Integrations',
      scope: 'teams:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const text = str(input.text ?? input.message ?? input.prompt);
          if (!text) throw new Error('text is required');
          await withConnection('teams', ctx, async (tokens) => teamsPostWebhook(tokens.accessToken, text));
          return { action: 'posted_message', provider: 'teams' };
        }),
    },
    whatsapp_send_message: {
      name: 'whatsapp_send_message',
      description: 'Send a WhatsApp template-free text message through the WhatsApp Business Cloud API. This is a write side effect and requires human approval. Input: { to: string (E.164 phone number), message: string }.',
      category: 'Integrations',
      scope: 'whatsapp:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const to = str(input.to ?? input.phone).replace(/[^\d+]/g, '');
          const message = str(input.message ?? input.text ?? input.prompt);
          if (!/^\+?\d{7,15}$/.test(to)) throw new Error('to must be a phone number in E.164 format');
          if (!message) throw new Error('message is required');
          const result = await withConnection('whatsapp', ctx, (tokens) => whatsappSend(tokens, to.replace('+', ''), message));
          return { action: 'sent_whatsapp', provider: 'whatsapp', to, messageId: String(result?.messages?.[0]?.id ?? '') };
        }),
    },
    drive_search: {
      name: 'drive_search',
      description: 'Search files in the connected Google Drive. Input: { query: string, limit?: number (1-20) }.',
      category: 'Integrations',
      scope: 'drive:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() => withConnection('google_drive', ctx, (tokens) => driveSearch(tokens, str(input.query ?? input.q), intIn(input.limit, 5, 1, 20)))),
    },
    drive_read: {
      name: 'drive_read',
      description: 'Read a Google Drive file (exports Google Docs to text). Input: { fileId: string }.',
      category: 'Integrations',
      scope: 'drive:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(async () => {
          const fileId = str(input.fileId ?? input.id);
          if (!fileId) throw new Error('fileId is required');
          return withConnection('google_drive', ctx, (tokens) => driveRead(tokens, fileId));
        }),
    },
    notion_search: {
      name: 'notion_search',
      description: 'Search Notion pages shared with the connected integration. Input: { query: string }.',
      category: 'Integrations',
      scope: 'notion:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() => withConnection('notion', ctx, (tokens) => notionSearch(tokens, str(input.query ?? input.q), 10))),
    },
    notion_read: {
      name: 'notion_read',
      description: 'Read the text content of a Notion page including nested blocks. Input: { pageId: string }.',
      category: 'Integrations',
      scope: 'notion:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(async () => {
          const pageId = str(input.pageId ?? input.id);
          if (!pageId) throw new Error('pageId is required');
          return withConnection('notion', ctx, async (tokens) => ({ pageId, content: await notionPageText(tokens, pageId) }));
        }),
    },
    jira_search_issues: {
      name: 'jira_search_issues',
      description: 'Search Jira issues with JQL. Input: { jql?: string (e.g. "project = SUPPORT AND status = Open"), limit?: number (1-20) }.',
      category: 'Integrations',
      scope: 'jira:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() => withConnection('jira', ctx, (tokens) => jiraSearch(tokens, str(input.jql ?? input.query), intIn(input.limit, 10, 1, 20)))),
    },
    jira_create_issue: {
      name: 'jira_create_issue',
      description: 'Create a Jira issue. This is a write side effect and requires human approval. Input: { projectKey: string, summary: string, description?: string, issueType?: string (default Task) }.',
      category: 'Integrations',
      scope: 'jira:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const projectKey = str(input.projectKey ?? input.project).toUpperCase();
          const summary = str(input.summary ?? input.title);
          if (!projectKey) throw new Error('projectKey is required');
          if (!summary) throw new Error('summary is required');
          const result = await withConnection('jira', ctx, (tokens) =>
            jiraCreateIssue(tokens, { projectKey, summary, description: str(input.description ?? input.body), issueType: str(input.issueType) || undefined }),
          );
          return { action: 'created_issue', provider: 'jira', key: String(result?.key ?? ''), id: String(result?.id ?? ''), self: String(result?.self ?? '') };
        }),
    },
    jira_comment_issue: {
      name: 'jira_comment_issue',
      description: 'Add a comment to a Jira issue. This is a write side effect and requires human approval. Input: { issueKey: string, comment: string }.',
      category: 'Integrations',
      scope: 'jira:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const issueKey = str(input.issueKey ?? input.issue).toUpperCase();
          const comment = str(input.comment ?? input.body ?? input.text);
          if (!issueKey) throw new Error('issueKey is required');
          if (!comment) throw new Error('comment is required');
          const result = await withConnection('jira', ctx, (tokens) => jiraComment(tokens, issueKey, comment));
          return { action: 'commented', provider: 'jira', issueKey, commentId: String(result?.id ?? '') };
        }),
    },
    linear_search_issues: {
      name: 'linear_search_issues',
      description: 'Search Linear issues. Input: { query?: string (matches title/description), limit?: number (1-20) }.',
      category: 'Integrations',
      scope: 'linear:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() => withConnection('linear', ctx, (tokens) => linearSearch(tokens, str(input.query ?? input.q), intIn(input.limit, 10, 1, 20)))),
    },
    linear_create_issue: {
      name: 'linear_create_issue',
      description: 'Create a Linear issue. This is a write side effect and requires human approval. Input: { title: string, description?: string, teamId?: string }.',
      category: 'Integrations',
      scope: 'linear:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const title = str(input.title ?? input.summary);
          if (!title) throw new Error('title is required');
          const result = await withConnection('linear', ctx, (tokens) =>
            linearCreateIssue(tokens, { title, description: str(input.description ?? input.body), teamId: str(input.teamId) || undefined }),
          );
          return { action: 'created_issue', provider: 'linear', identifier: String(result?.identifier ?? ''), url: String(result?.url ?? '') };
        }),
    },
    hubspot_search_contacts: {
      name: 'hubspot_search_contacts',
      description: 'Search HubSpot CRM contacts by email token. Input: { query?: string (email fragment), limit?: number (1-10) }.',
      category: 'Integrations',
      scope: 'hubspot:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() => withConnection('hubspot', ctx, (tokens) => hubspotSearchContacts(tokens, str(input.query ?? input.q), intIn(input.limit, 5, 1, 10)))),
    },
    hubspot_create_contact: {
      name: 'hubspot_create_contact',
      description: 'Create a HubSpot CRM contact. This is a write side effect and requires human approval. Input: { email: string, firstName?: string, lastName?: string, company?: string }.',
      category: 'Integrations',
      scope: 'hubspot:write',
      requiresApproval: true,
      execute: (input, ctx) =>
        softFail(async () => {
          const email = str(input.email);
          if (!email || !email.includes('@')) throw new Error('email is required');
          const result = await withConnection('hubspot', ctx, (tokens) =>
            hubspotCreateContact(tokens, {
              email,
              firstName: str(input.firstName ?? input.firstname),
              lastName: str(input.lastName ?? input.lastname),
              company: str(input.company),
            }),
          );
          return { action: 'created_contact', provider: 'hubspot', id: String(result?.id ?? ''), email };
        }),
    },
    shopify_list_products: {
      name: 'shopify_list_products',
      description: 'List products from the connected Shopify store. Input: { limit?: number (1-20) }.',
      category: 'Integrations',
      scope: 'shopify:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() => withConnection('shopify', ctx, (tokens) => shopifyListProducts(tokens, intIn(input.limit, 10, 1, 20)))),
    },
    shopify_search_orders: {
      name: 'shopify_search_orders',
      description: 'List open orders from the connected Shopify store. Input: { query?: string (order name e.g. #1001), limit?: number (1-20) }.',
      category: 'Integrations',
      scope: 'shopify:read',
      requiresApproval: false,
      execute: (input, ctx) =>
        softFail(() => withConnection('shopify', ctx, (tokens) => shopifySearchOrders(tokens, str(input.query ?? input.name), intIn(input.limit, 10, 1, 20)))),
    },
  };

  return tools;
}
