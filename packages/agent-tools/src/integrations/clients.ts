import type { ProviderDef } from './catalog';
import type { TokenBundle } from './connection';
import { USER_AGENT } from '../util';

const TIMEOUT_MS = 15_000;

function stub(key: string, name: string, extra: Partial<ProviderDef> = {}): ProviderDef {
  return {
    key,
    name,
    category: 'knowledge',
    authType: 'oauth2',
    blurb: '',
    website: '',
    envKeys: [],
    color: '#888888',
    icon: 'Puzzle',
    tools: [],
    ...extra,
  };
}

export function providerAuthHeaders(provider: ProviderDef, tokens: TokenBundle): Record<string, string> {
  switch (provider.key) {
    case 'shopify':
      return { 'x-shopify-access-token': tokens.accessToken };
    case 'notion':
      return { authorization: `Bearer ${tokens.accessToken}`, 'notion-version': '2022-06-28' };
    case 'github':
      return { authorization: `Bearer ${tokens.accessToken}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
    case 'whatsapp':
      return { authorization: `Bearer ${tokens.accessToken}` };
    default:
      return { authorization: `${tokens.tokenType || 'Bearer'} ${tokens.accessToken}` };
  }
}

export async function providerFetch(provider: ProviderDef, tokens: TokenBundle, url: string, init: RequestInit = {}): Promise<any> {
  const target = provider.oauth?.templated && tokens.shop ? url.replace('{shop}', tokens.shop) : url;
  const method = (init.method ?? 'GET').toUpperCase();
  const response = await fetch(target, {
    ...init,
    method,
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
      ...(init.body !== undefined && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...providerAuthHeaders(provider, tokens),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const detail =
      data && typeof data === 'object'
        ? String(data.error?.message ?? data.error_description ?? data.error ?? data.message ?? '')
        : String(data ?? '').slice(0, 240);
    throw new Error(`${provider.name} request failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  return data;
}

export function shopifyBase(tokens: TokenBundle): string {
  if (!tokens.shop) throw new Error('Missing shop domain on the Shopify connection');
  return `https://${tokens.shop}/admin/api/2024-10`;
}

export async function jiraRequest(tokens: TokenBundle, path: string, init: RequestInit = {}, provider?: ProviderDef): Promise<any> {
  const def = provider ?? stub('jira', 'Jira', { category: 'project' });
  let cloudId = String((tokens.extra as any)?.cloudId ?? '');
  if (!cloudId) {
    const resources = await providerFetch(def, tokens, 'https://api.atlassian.com/oauth/token/accessible-resources');
    cloudId = String(Array.isArray(resources) ? resources[0]?.id ?? '' : '');
    if (!cloudId) throw new Error('No Atlassian site is authorized for this connection');
    tokens.extra = { ...(tokens.extra ?? {}), cloudId };
  }
  return providerFetch(def, tokens, `https://api.atlassian.com/ex/jira/${cloudId}${path}`, init);
}

const slice = (value: string, max = 12_000): string => (value.length > max ? `${value.slice(0, max)}…` : value);

function decodeGmailBody(data: any): string {
  const payload = data?.payload;
  const collect = (part: any): string => {
    if (part?.body?.data) {
      try {
        return Buffer.from(String(part.body.data), 'base64url').toString('utf8');
      } catch {
        return '';
      }
    }
    return (part?.parts ?? []).map(collect).join('\n');
  };
  const raw = collect(payload) || String(data?.snippet ?? '');
  return slice(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 20_000);
}

function header(payload: any, name: string): string {
  const headers: any[] = payload?.headers ?? [];
  const found = headers.find((h) => String(h?.name ?? '').toLowerCase() === name.toLowerCase());
  return String(found?.value ?? '');
}

export async function gmailSearch(tokens: TokenBundle, query: string, limit: number): Promise<any[]> {
  const provider = stub('gmail', 'Gmail');
  const list = await providerFetch(
    provider,
    tokens,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${Math.min(limit, 10)}`,
  );
  const ids: string[] = (list?.messages ?? []).map((m: any) => String(m.id));
  const out: any[] = [];
  for (const id of ids.slice(0, 5)) {
    try {
      const msg = await providerFetch(
        provider,
        tokens,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      );
      out.push({
        id,
        threadId: msg.threadId,
        subject: header(msg.payload, 'Subject'),
        from: header(msg.payload, 'From'),
        date: header(msg.payload, 'Date'),
        snippet: String(msg.snippet ?? '').slice(0, 400),
        labelIds: msg.labelIds ?? [],
      });
    } catch {
      continue;
    }
  }
  return out;
}

export async function gmailRead(tokens: TokenBundle, messageId: string): Promise<any> {
  const provider = stub('gmail', 'Gmail');
  const msg = await providerFetch(
    provider,
    tokens,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
  );
  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: header(msg.payload, 'Subject'),
    from: header(msg.payload, 'From'),
    to: header(msg.payload, 'To'),
    date: header(msg.payload, 'Date'),
    body: decodeGmailBody(msg),
    labelIds: msg.labelIds ?? [],
  };
}

export async function gmailSend(tokens: TokenBundle, opts: { to: string; subject: string; body: string }): Promise<any> {
  const provider = stub('gmail', 'Gmail');
  const mime = [`To: ${opts.to}`, `Subject: ${opts.subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', '', opts.body].join('\r\n');
  const raw = Buffer.from(mime, 'utf8').toString('base64url');
  return providerFetch(provider, tokens, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });
}

export async function outlookSearch(tokens: TokenBundle, query: string, limit: number): Promise<any[]> {
  const provider = stub('outlook', 'Outlook');
  const filter = query ? `&$filter=${encodeURIComponent(`contains(subject,'${query.replace(/'/g, "''")}')`)}` : '';
  const data = await providerFetch(
    provider,
    tokens,
    `https://graph.microsoft.com/v1.0/me/messages?$select=id,subject,from,receivedDateTime,bodyPreview&$top=${Math.min(limit, 10)}${filter}`,
  );
  return (data?.value ?? []).map((m: any) => ({
    id: m.id,
    subject: String(m.subject ?? ''),
    from: String(m.from?.emailAddress?.address ?? ''),
    receivedAt: String(m.receivedDateTime ?? ''),
    preview: String(m.bodyPreview ?? '').slice(0, 400),
  }));
}

export async function outlookRead(tokens: TokenBundle, messageId: string): Promise<any> {
  const provider = stub('outlook', 'Outlook');
  const msg = await providerFetch(
    provider,
    tokens,
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,body,from,to,receivedDateTime`,
  );
  return {
    id: msg.id,
    subject: String(msg.subject ?? ''),
    from: String(msg.from?.emailAddress?.address ?? ''),
    to: (msg?.to?.value ?? []).map((entry: any) => String(entry?.emailAddress?.address ?? '')).filter(Boolean),
    receivedAt: String(msg.receivedDateTime ?? ''),
    body: slice(String(msg.body?.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 20_000),
  };
}

export async function outlookSend(tokens: TokenBundle, opts: { to: string; subject: string; body: string }): Promise<void> {
  const provider = stub('outlook', 'Outlook');
  await providerFetch(provider, tokens, 'https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: { contentType: 'Text', content: opts.body },
        toRecipients: [{ emailAddress: { address: opts.to } }],
      },
      saveToSentItems: true,
    }),
  });
}

export async function slackChannels(tokens: TokenBundle): Promise<any[]> {
  const provider = stub('slack', 'Slack');
  const data = await providerFetch(provider, tokens, 'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200');
  if (data?.ok === false) throw new Error(`Slack: ${String(data.error ?? 'request failed')}`);
  return (data?.channels ?? []).map((channel: any) => ({ id: channel.id, name: String(channel.name ?? ''), isMember: Boolean(channel.is_member) }));
}

export async function slackPostMessage(tokens: TokenBundle, channel: string, text: string): Promise<any> {
  const provider = stub('slack', 'Slack');
  const data = await providerFetch(provider, tokens, 'https://slack.com/api/chat.postMessage', {
    method: 'POST',
    body: JSON.stringify({ channel, text }),
  });
  if (data?.ok === false) throw new Error(`Slack: ${String(data.error ?? 'post failed')}`);
  return { channel: data?.channel, ts: data?.ts, message: data?.message?.text };
}

export async function teamsPostWebhook(webhookUrl: string, text: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [{ type: 'TextBlock', text, wrap: true }],
          },
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Teams webhook failed (${response.status}) ${body.slice(0, 160)}`);
  }
}

export async function whatsappSend(tokens: TokenBundle, to: string, text: string): Promise<any> {
  const provider = stub('whatsapp', 'WhatsApp');
  const phoneId = String((tokens.extra as any)?.phoneNumberId ?? '');
  if (!phoneId) throw new Error('Missing phone number ID on the WhatsApp connection');
  return providerFetch(provider, tokens, `https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', type: 'text', to, text: { preview_url: false, body: text } }),
  });
}

export async function driveSearch(tokens: TokenBundle, query: string, limit: number): Promise<any[]> {
  const provider = stub('google_drive', 'Google Drive');
  const q = query
    ? `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`
    : 'trashed = false';
  const data = await providerFetch(
    provider,
    tokens,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${Math.min(limit, 20)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
  );
  return (data?.files ?? []).map((file: any) => ({
    id: file.id,
    name: String(file.name ?? ''),
    mimeType: String(file.mimeType ?? ''),
    modifiedAt: String(file.modifiedTime ?? ''),
    url: String(file.webViewLink ?? ''),
  }));
}

export async function driveRead(tokens: TokenBundle, fileId: string): Promise<{ name: string; content: string; url: string; mimeType: string }> {
  const provider = stub('google_drive', 'Google Drive');
  const meta = await providerFetch(
    provider,
    tokens,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,modifiedTime`,
  );
  const mimeType = String(meta.mimeType ?? '');
  let content = '';
  if (mimeType.startsWith('application/vnd.google-apps')) {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
      { headers: { ...providerAuthHeaders(provider, tokens) }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!response.ok) throw new Error(`Google Drive export failed (${response.status})`);
    content = await response.text();
  } else {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { ...providerAuthHeaders(provider, tokens) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Google Drive download failed (${response.status})`);
    content = await response.text();
  }
  return {
    name: String(meta.name ?? fileId),
    mimeType,
    url: String(meta.webViewLink ?? ''),
    content: slice(content, 200_000),
  };
}

export async function driveListFiles(tokens: TokenBundle, folderId: string, pageSize = 100): Promise<any[]> {
  const provider = stub('google_drive', 'Google Drive');
  const folderFilter = folderId ? `'${folderId.replace(/'/g, "\\'")}' in parents and ` : '';
  const data = await providerFetch(
    provider,
    tokens,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`${folderFilter}trashed = false`)}&pageSize=${Math.min(pageSize, 100)}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
  );
  return (data?.files ?? []).map((file: any) => ({
    id: file.id,
    name: String(file.name ?? ''),
    mimeType: String(file.mimeType ?? ''),
    modifiedAt: String(file.modifiedTime ?? ''),
    url: String(file.webViewLink ?? ''),
  }));
}

const NOTION_TEXT_TYPES = new Set([
  'paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item',
  'quote', 'code', 'callout', 'to_do', 'toggle', 'divider', 'column_list',
]);

function notionBlockText(block: any): string {
  const type = String(block?.type ?? '');
  if (type === 'divider') return '---';
  const data = block?.[type];
  const rich: any[] = data?.rich_text ?? [];
  const text = rich.map((entry) => String(entry?.plain_text ?? '')).join('');
  return text;
}

export function notionTitle(page: any): string {
  const properties: Record<string, any> = page?.properties ?? {};
  for (const value of Object.values(properties)) {
    if (value?.type === 'title') {
      return (value.title ?? []).map((entry: any) => String(entry?.plain_text ?? '')).join('') || 'Untitled';
    }
  }
  return 'Untitled';
}

export async function notionSearch(tokens: TokenBundle, query: string, pageSize = 10): Promise<any[]> {
  const provider = stub('notion', 'Notion');
  const data = await providerFetch(provider, tokens, 'https://api.notion.com/v1/search', {
    method: 'POST',
    body: JSON.stringify({ query, page_size: Math.min(pageSize, 20), filter: { property: 'object', value: 'page' } }),
  });
  return (data?.results ?? []).map((page: any) => ({
    id: page.id,
    title: notionTitle(page),
    url: page.url,
    lastEditedAt: page.last_edited_time,
    archived: Boolean(page.archived),
  }));
}

async function notionBlockChildren(provider: ProviderDef, tokens: TokenBundle, blockId: string, depth: number): Promise<string> {
  const data = await providerFetch(provider, tokens, `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`);
  const lines: string[] = [];
  for (const block of data?.results ?? []) {
    const type = String(block?.type ?? '');
    if (!NOTION_TEXT_TYPES.has(type)) continue;
    const text = notionBlockText(block);
    if (text) lines.push(text);
    if (depth > 0 && block?.has_children) {
      try {
        lines.push(await notionBlockChildren(provider, tokens, block.id, depth - 1));
      } catch {
        continue;
      }
    }
  }
  return lines.join('\n');
}

export async function notionPageText(tokens: TokenBundle, pageId: string, depth = 3): Promise<string> {
  const provider = stub('notion', 'Notion');
  const lines: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 8; page += 1) {
    const url: string = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const data = await providerFetch(provider, tokens, url);
    for (const block of data?.results ?? []) {
      const type = String(block?.type ?? '');
      if (!NOTION_TEXT_TYPES.has(type)) continue;
      const text = notionBlockText(block);
      if (type.startsWith('heading')) lines.push(`\n## ${text}`);
      else if (type === 'code') lines.push(`\n\`\`\`\n${text}\n\`\`\``);
      else if (text) lines.push(text);
      if (depth > 0 && block?.has_children && type !== 'column_list') {
        try {
          lines.push(await notionBlockChildren(provider, tokens, block.id, depth - 1));
        } catch {
          continue;
        }
      }
    }
    if (data?.has_more && data?.next_cursor) cursor = String(data.next_cursor);
    else break;
  }
  return lines.join('\n').trim();
}

export async function jiraSearch(tokens: TokenBundle, jql: string, limit: number): Promise<any[]> {
  const data = await jiraRequest(
    tokens,
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql || 'order by updated DESC')}&maxResults=${Math.min(limit, 20)}&fields=summary,status,assignee,updated,issuetype`,
  );
  const issues = data?.issues ?? [];
  return issues.map((issue: any) => ({
    key: issue.key,
    summary: String(issue.fields?.summary ?? ''),
    status: String(issue.fields?.status?.name ?? ''),
    type: String(issue.fields?.issuetype?.name ?? ''),
    assignee: String(issue.fields?.assignee?.displayName ?? ''),
    updated: String(issue.fields?.updated ?? ''),
    url: String(issue.self ?? ''),
  }));
}

export async function jiraCreateIssue(tokens: TokenBundle, opts: { projectKey: string; summary: string; description?: string; issueType?: string }): Promise<any> {
  return jiraRequest(tokens, '/rest/api/3/issue', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        project: { key: opts.projectKey },
        summary: opts.summary,
        issuetype: { name: opts.issueType ?? 'Task' },
        ...(opts.description ? { description: opts.description } : {}),
      },
    }),
  });
}

export async function jiraComment(tokens: TokenBundle, issueKey: string, body: string): Promise<any> {
  return jiraRequest(tokens, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body: { type: 'text', text: body, version: 1 } }),
  });
}

export async function linearSearch(tokens: TokenBundle, query: string, limit: number): Promise<any[]> {
  const provider = stub('linear', 'Linear');
  const data = await providerFetch(provider, tokens, 'https://api.linear.app/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query: `query SearchIssues($first: Int, $filter: IssueFilter) { issues(first: $first, filter: $filter) { nodes { identifier title state { name } url updatedAt } } }`,
      variables: {
        first: Math.min(limit, 20),
        filter: query ? { or: [{ title: { contains: query } }, { description: { contains: query } }] } : undefined,
      },
    }),
  });
  const nodes = data?.data?.issues?.nodes ?? [];
  if (data?.errors?.length) throw new Error(`Linear: ${String(data.errors[0]?.message ?? 'query failed')}`);
  return nodes.map((issue: any) => ({
    identifier: issue.identifier,
    title: String(issue.title ?? ''),
    state: String(issue.state?.name ?? ''),
    url: issue.url,
    updatedAt: issue.updatedAt,
  }));
}

export async function linearCreateIssue(tokens: TokenBundle, opts: { title: string; description?: string; teamId?: string }): Promise<any> {
  const provider = stub('linear', 'Linear');
  let teamId = opts.teamId ?? '';
  if (!teamId) {
    const teams = await providerFetch(provider, tokens, 'https://api.linear.app/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: 'query { teams(first: 1) { nodes { id name } } }' }),
    });
    teamId = String(teams?.data?.teams?.nodes?.[0]?.id ?? '');
    if (!teamId) throw new Error('No Linear team is accessible for this connection');
  }
  const data = await providerFetch(provider, tokens, 'https://api.linear.app/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }`,
      variables: { input: { title: opts.title, teamId, ...(opts.description ? { description: opts.description } : {}) } },
    }),
  });
  if (data?.errors?.length || !data?.data?.issueCreate?.success) {
    throw new Error(`Linear: ${String(data?.errors?.[0]?.message ?? 'issue create failed')}`);
  }
  return { identifier: data.data.issueCreate.issue.identifier, url: data.data.issueCreate.issue.url };
}

export async function hubspotSearchContacts(tokens: TokenBundle, query: string, limit: number): Promise<any[]> {
  const provider = stub('hubspot', 'HubSpot', { category: 'crm' });
  const properties = ['email', 'firstname', 'lastname', 'company', 'phone', 'lifecyclestage'];
  const body = query
    ? {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'CONTAINS_TOKEN', value: query }] }],
        limit: Math.min(limit, 10),
        properties,
      }
    : { limit: Math.min(limit, 10), properties };
  const data = await providerFetch(provider, tokens, 'https://api.hubspot.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return (data?.results ?? []).map((contact: any) => ({
    id: contact.id,
    email: String(contact.properties?.email ?? ''),
    name: `${contact.properties?.firstname ?? ''} ${contact.properties?.lastname ?? ''}`.trim(),
    company: String(contact.properties?.company ?? ''),
    phone: String(contact.properties?.phone ?? ''),
    stage: String(contact.properties?.lifecyclestage ?? ''),
  }));
}

export async function hubspotCreateContact(tokens: TokenBundle, opts: { email: string; firstName?: string; lastName?: string; company?: string }): Promise<any> {
  const provider = stub('hubspot', 'HubSpot');
  return providerFetch(provider, tokens, 'https://api.hubspot.com/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        email: opts.email,
        ...(opts.firstName ? { firstname: opts.firstName } : {}),
        ...(opts.lastName ? { lastname: opts.lastName } : {}),
        ...(opts.company ? { company: opts.company } : {}),
      },
    }),
  });
}

export async function shopifyListProducts(tokens: TokenBundle, limit: number): Promise<any[]> {
  const data = await providerFetch(
    stub('shopify', 'Shopify'),
    tokens,
    `${shopifyBase(tokens)}/products.json?limit=${Math.min(limit, 20)}&fields=id,title,handle,variants,status,updated_at`,
  );
  return (data?.products ?? []).map((product: any) => ({
    id: product.id,
    title: String(product.title ?? ''),
    handle: String(product.handle ?? ''),
    status: String(product.status ?? ''),
    price: String(product.variants?.[0]?.price ?? ''),
    updatedAt: String(product.updated_at ?? ''),
  }));
}

export async function shopifySearchOrders(tokens: TokenBundle, query: string, limit: number): Promise<any[]> {
  const data = await providerFetch(
    stub('shopify', 'Shopify'),
    tokens,
    `${shopifyBase(tokens)}/orders.json?status=open&limit=${Math.min(limit, 20)}${query ? `&name=${encodeURIComponent(query)}` : ''}&fields=id,name,total_price,currency,financial_status,created_at,email`,
  );
  return (data?.orders ?? []).map((order: any) => ({
    id: order.id,
    name: String(order.name ?? ''),
    email: String(order.email ?? ''),
    total: String(order.total_price ?? ''),
    currency: String(order.currency ?? ''),
    financialStatus: String(order.financial_status ?? ''),
    createdAt: String(order.created_at ?? ''),
  }));
}

export async function githubRepoTree(tokens: TokenBundle, owner: string, repo: string, pathPrefix: string): Promise<Array<{ path: string; sha: string }>> {
  const provider = stub('github', 'GitHub');
  const data = await providerFetch(provider, tokens, `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
  const entries: any[] = data?.tree ?? [];
  const prefix = pathPrefix.replace(/^\/+|\/+$/g, '');
  return entries
    .filter((entry) => entry.type === 'blob' && String(entry.path).endsWith('.md'))
    .filter((entry) => (prefix ? String(entry.path).startsWith(`${prefix}/`) || String(entry.path) === prefix : true))
    .slice(0, 120)
    .map((entry) => ({ path: String(entry.path), sha: String(entry.sha) }));
}

export async function githubRawFile(tokens: TokenBundle, owner: string, repo: string, path: string): Promise<string> {
  const provider = stub('github', 'GitHub');
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { ...providerAuthHeaders(provider, tokens), accept: 'application/vnd.github.raw', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${(await response.text()).slice(0, 160)}`);
  const text = await response.text();
  return text.length > 400_000 ? text.slice(0, 400_000) : text;
}
