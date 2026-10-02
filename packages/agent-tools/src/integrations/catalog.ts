export type ProviderCategory = 'email' | 'messaging' | 'knowledge' | 'project' | 'crm' | 'commerce' | 'automation';

export type AuthType = 'oauth2' | 'token' | 'webhook';

export type OAuthConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientAuth: 'body' | 'basic';
  supportsRefresh: boolean;
  pkce?: boolean;
  extraAuthorizeParams?: Record<string, string>;
  tokenHeaders?: Record<string, string>;
  profileUrl?: string;
  profileMap?: (data: any) => { name?: string; email?: string; organization?: string };
  templated?: boolean;
};

export type ProviderDef = {
  key: string;
  name: string;
  category: ProviderCategory;
  authType: AuthType;
  blurb: string;
  website: string;
  envKeys: string[];
  color: string;
  icon: string;
  knowledge?: boolean;
  oauth?: OAuthConfig;
  tokenFields?: Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>;
  webhookEvents?: string[];
  tools: string[];
};

const googleProfile = (data: any) => ({ name: String(data?.name ?? ''), email: String(data?.email ?? '') });

export const INTEGRATION_PROVIDERS: ProviderDef[] = [
  {
    key: 'gmail',
    name: 'Gmail',
    category: 'email',
    authType: 'oauth2',
    blurb: 'Let agents search, read, and send email from a connected Gmail mailbox.',
    website: 'https://mail.google.com',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    color: '#EA4335',
    icon: 'Mail',
    oauth: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email', 'profile'],
      clientAuth: 'body',
      supportsRefresh: true,
      extraAuthorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
      profileUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
      profileMap: googleProfile,
    },
    tools: ['gmail_search', 'gmail_read', 'gmail_send'],
  },
  {
    key: 'outlook',
    name: 'Outlook / Microsoft 365',
    category: 'email',
    authType: 'oauth2',
    blurb: 'Connect a Microsoft 365 mailbox over Microsoft Graph for agent-driven email.',
    website: 'https://outlook.office.com',
    envKeys: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    color: '#0078D4',
    icon: 'Mail',
    oauth: {
      authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: ['openid', 'profile', 'email', 'offline_access', 'Mail.Read', 'Mail.Send', 'User.Read'],
      clientAuth: 'body',
      supportsRefresh: true,
      extraAuthorizeParams: { response_mode: 'query' },
      profileUrl: 'https://graph.microsoft.com/oidc/userinfo',
      profileMap: googleProfile,
    },
    tools: ['outlook_search', 'outlook_read', 'outlook_send'],
  },
  {
    key: 'slack',
    name: 'Slack',
    category: 'messaging',
    authType: 'oauth2',
    blurb: 'Post notifications to channels and let agents read channel context.',
    website: 'https://slack.com',
    envKeys: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
    color: '#4A154B',
    icon: 'MessageSquare',
    oauth: {
      authorizeUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scopes: ['chat:write', 'channels:read', 'channels:history', 'groups:history', 'im:history', 'users:read'],
      clientAuth: 'body',
      supportsRefresh: false,
      profileMap: (data: any) => ({ name: String(data?.team?.name ?? ''), email: String(data?.authed_user?.email ?? '') }),
    },
    tools: ['slack_list_channels', 'slack_send_message'],
  },
  {
    key: 'teams',
    name: 'Microsoft Teams',
    category: 'messaging',
    authType: 'token',
    blurb: 'Send adaptive card messages to a Teams channel with an incoming webhook.',
    website: 'https://teams.microsoft.com',
    envKeys: [],
    color: '#6264A7',
    icon: 'MessagesSquare',
    tokenFields: [
      { key: 'webhookUrl', label: 'Incoming webhook URL', placeholder: 'https://outlook.office.com/webhook/...', secret: true },
    ],
    tools: ['teams_send_message'],
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'messaging',
    authType: 'token',
    blurb: 'Message customers over the WhatsApp Business Cloud API from tickets and agents.',
    website: 'https://business.whatsapp.com',
    envKeys: [],
    color: '#25D366',
    icon: 'MessageCircle',
    tokenFields: [
      { key: 'accessToken', label: 'Permanent access token', placeholder: 'EAAG...', secret: true },
      { key: 'phoneNumberId', label: 'Phone number ID', placeholder: '109987654321' },
    ],
    tools: ['whatsapp_send_message'],
  },
  {
    key: 'google_drive',
    name: 'Google Drive',
    category: 'knowledge',
    authType: 'oauth2',
    blurb: 'Keep the knowledge base in sync with Google Docs and Drive text files.',
    website: 'https://drive.google.com',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    color: '#1FA463',
    icon: 'HardDrive',
    knowledge: true,
    oauth: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/drive.readonly', 'openid', 'email', 'profile'],
      clientAuth: 'body',
      supportsRefresh: true,
      extraAuthorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
      profileUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
      profileMap: googleProfile,
    },
    tools: ['drive_search', 'drive_read'],
  },
  {
    key: 'notion',
    name: 'Notion',
    category: 'knowledge',
    authType: 'oauth2',
    blurb: 'Import Notion pages into the knowledge base and keep them refreshed.',
    website: 'https://www.notion.so',
    envKeys: ['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET'],
    color: '#111111',
    icon: 'NotebookPen',
    knowledge: true,
    oauth: {
      authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      scopes: [],
      clientAuth: 'basic',
      supportsRefresh: false,
      extraAuthorizeParams: { owner: 'user', response_type: 'code' },
      tokenHeaders: { 'content-type': 'application/x-www-form-urlencoded' },
    },
    tools: ['notion_search', 'notion_read'],
  },
  {
    key: 'github',
    name: 'GitHub',
    category: 'knowledge',
    authType: 'oauth2',
    blurb: 'Sync repository docs into knowledge and let agents work issues and PRs.',
    website: 'https://github.com',
    envKeys: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    color: '#181717',
    icon: 'Github',
    knowledge: true,
    oauth: {
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'read:user'],
      clientAuth: 'body',
      supportsRefresh: false,
      tokenHeaders: { accept: 'application/json' },
      profileUrl: 'https://api.github.com/user',
      profileMap: (data: any) => ({ name: String(data?.name ?? ''), email: String(data?.email ?? '') }),
    },
    tools: ['github_search_repositories', 'github_read_file', 'github_create_issue', 'github_create_pull_request'],
  },
  {
    key: 'jira',
    name: 'Jira',
    category: 'project',
    authType: 'oauth2',
    blurb: 'Search, create, and update Jira issues straight from tickets and agents.',
    website: 'https://www.atlassian.com/software/jira',
    envKeys: ['ATLASSIAN_CLIENT_ID', 'ATLASSIAN_CLIENT_SECRET'],
    color: '#0052CC',
    icon: 'Hexagon',
    oauth: {
      authorizeUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      scopes: ['read:jira-work', 'write:jira-work', 'offline_access'],
      clientAuth: 'body',
      supportsRefresh: true,
      extraAuthorizeParams: { audience: 'https://api.atlassian.com', response_type: 'code', prompt: 'consent' },
      profileUrl: 'https://api.atlassian.com/me',
      profileMap: googleProfile,
    },
    tools: ['jira_search_issues', 'jira_create_issue', 'jira_comment_issue'],
  },
  {
    key: 'linear',
    name: 'Linear',
    category: 'project',
    authType: 'oauth2',
    blurb: 'Track issues in Linear with agent-driven search and creation.',
    website: 'https://linear.app',
    envKeys: ['LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET'],
    color: '#5E6AD2',
    icon: 'Box',
    oauth: {
      authorizeUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      scopes: ['read', 'write'],
      clientAuth: 'body',
      supportsRefresh: false,
      profileUrl: 'https://api.linear.app/me',
      profileMap: (data: any) => ({ name: String(data?.name ?? ''), email: String(data?.email ?? '') }),
    },
    tools: ['linear_search_issues', 'linear_create_issue'],
  },
  {
    key: 'hubspot',
    name: 'HubSpot',
    category: 'crm',
    authType: 'oauth2',
    blurb: 'Read and create CRM contacts so agents can work leads with full context.',
    website: 'https://www.hubspot.com',
    envKeys: ['HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET'],
    color: '#FF7A59',
    icon: 'Contact',
    oauth: {
      authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
      tokenUrl: 'https://api.hubspot.com/oauth/v1/token',
      scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.objects.companies.read', 'crm.objects.deals.read'],
      clientAuth: 'body',
      supportsRefresh: true,
      profileUrl: 'https://api.hubspot.com/oauth/v1/access-tokens/me',
      profileMap: (data: any) => ({ name: String(data?.full_name ?? ''), email: String(data?.user ?? '') }),
    },
    tools: ['hubspot_search_contacts', 'hubspot_create_contact'],
  },
  {
    key: 'shopify',
    name: 'Shopify',
    category: 'commerce',
    authType: 'oauth2',
    blurb: 'Connect a Shopify store so agents can look up products, customers, and orders.',
    website: 'https://www.shopify.com',
    envKeys: ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'],
    color: '#96BF48',
    icon: 'ShoppingBag',
    oauth: {
      authorizeUrl: 'https://{shop}/admin/oauth/authorize',
      tokenUrl: 'https://{shop}/admin/oauth/access_token',
      scopes: ['read_products', 'read_orders', 'read_customers'],
      clientAuth: 'body',
      supportsRefresh: false,
      templated: true,
      extraAuthorizeParams: { response_types: 'code' },
    },
    tools: ['shopify_list_products', 'shopify_search_orders'],
  },
  {
    key: 'zapier',
    name: 'Zapier',
    category: 'automation',
    authType: 'webhook',
    blurb: 'Push Ryuksaidso events into thousands of Zapier Zaps with signed webhooks.',
    website: 'https://zapier.com',
    envKeys: [],
    color: '#FF4F00',
    icon: 'Zap',
    webhookEvents: ['ticket.created', 'run.completed', 'run.failed', 'approval.approved', 'approval.rejected', 'document.created', 'integration.connected', 'member.invited'],
    tools: [],
  },
  {
    key: 'make',
    name: 'Make',
    category: 'automation',
    authType: 'webhook',
    blurb: 'Trigger Make scenarios from Ryuksaidso events with HMAC-signed payloads.',
    website: 'https://www.make.com',
    envKeys: [],
    color: '#6D00CC',
    icon: 'Workflow',
    webhookEvents: ['ticket.created', 'run.completed', 'run.failed', 'approval.approved', 'approval.rejected', 'document.created'],
    tools: [],
  },
  {
    key: 'n8n',
    name: 'n8n',
    category: 'automation',
    authType: 'webhook',
    blurb: 'Feed self-hosted n8n workflows with signed event webhooks from Ryuksaidso.',
    website: 'https://n8n.io',
    envKeys: [],
    color: '#EA4B71',
    icon: 'Play',
    webhookEvents: ['ticket.created', 'run.completed', 'run.failed', 'approval.approved', 'approval.rejected', 'document.created'],
    tools: [],
  },
];

export const WEBHOOK_EVENT_CATALOG = [
  { event: 'ticket.created', description: 'A new ticket was created in the workspace.' },
  { event: 'run.completed', description: 'An agent run finished successfully.' },
  { event: 'run.failed', description: 'An agent run failed.' },
  { event: 'approval.approved', description: 'A pending action was approved.' },
  { event: 'approval.rejected', description: 'A pending action was rejected.' },
  { event: 'document.created', description: 'A knowledge document was added or updated.' },
  { event: 'integration.connected', description: 'An integration was connected for an organization.' },
  { event: 'integration.disconnected', description: 'An integration was disconnected.' },
  { event: 'member.invited', description: 'A member was invited to the workspace.' },
  { event: 'widget.conversation_started', description: 'A website visitor started a chat conversation.' },
  { event: 'webhook.test', description: 'A manual test delivery from the webhook settings panel.' },
] as const;

export function getProvider(key: string): ProviderDef | null {
  const normalized = String(key ?? '').trim().toLowerCase();
  return INTEGRATION_PROVIDERS.find((provider) => provider.key === normalized) ?? null;
}

export function providerConfigured(provider: ProviderDef): boolean {
  if (provider.authType === 'oauth2') {
    return provider.envKeys.every((name) => Boolean(process.env[name]?.trim()));
  }
  return true;
}

export function providerConfigHint(provider: ProviderDef): string {
  if (!provider.envKeys.length) return '';
  const missing = provider.envKeys.filter((name) => !process.env[name]?.trim());
  return missing.length ? `Set ${missing.join(' and ')} to enable OAuth connect.` : '';
}
