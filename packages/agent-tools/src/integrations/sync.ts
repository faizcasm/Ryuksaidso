import { errorMessage } from '../util';
import { resolveConnectionTokens, recordIntegrationLog, getIntegrationSetting, type TokenBundle } from './connection';
import {
  driveListFiles,
  driveRead,
  notionSearch,
  notionPageText,
  githubRepoTree,
  githubRawFile,
} from './clients';

export type SyncItem = {
  externalId: string;
  title: string;
  content: string;
  url?: string;
  updatedAt?: string;
};

export type SyncResult = {
  sourceId: string;
  provider: string;
  status: 'ok' | 'error';
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  error?: string;
  finishedAt: string;
};

const MAX_CONTENT = 200_000;
const MAX_ITEMS_PER_SYNC = 80;

function isFetchableDriveFile(mimeType: string): boolean {
  if (mimeType.startsWith('application/vnd.google-apps.document')) return true;
  if (mimeType.startsWith('application/vnd.google-apps.script')) return false;
  if (mimeType.startsWith('application/vnd.google-apps')) return false;
  return /^(text\/|application\/(json|xml|x-yaml|yaml))/.test(mimeType) || /\.(md|txt|json|csv|ya?ml)$/i.test(mimeType);
}

async function fetchDriveItems(tokens: TokenBundle, folderRef: string): Promise<{ items: SyncItem[]; skipped: number }> {
  const files = await driveListFiles(tokens, folderRef, 100);
  const items: SyncItem[] = [];
  let skipped = 0;
  for (const file of files.slice(0, MAX_ITEMS_PER_SYNC)) {
    if (!isFetchableDriveFile(file.mimeType)) {
      skipped += 1;
      continue;
    }
    try {
      const doc = await driveRead(tokens, file.id);
      items.push({
        externalId: `gdrive:${file.id}`,
        title: doc.name.replace(/\.[a-z0-9]+$/i, ''),
        content: doc.content,
        url: doc.url,
        updatedAt: file.modifiedAt,
      });
    } catch {
      skipped += 1;
    }
  }
  return { items, skipped };
}

async function fetchNotionItems(tokens: TokenBundle, query: string): Promise<{ items: SyncItem[]; skipped: number }> {
  const pages = await notionSearch(tokens, query, 50);
  const items: SyncItem[] = [];
  let skipped = 0;
  for (const page of pages.slice(0, MAX_ITEMS_PER_SYNC)) {
    if (page.archived) {
      skipped += 1;
      continue;
    }
    try {
      const content = await notionPageText(tokens, page.id);
      if (!content.trim()) {
        skipped += 1;
        continue;
      }
      items.push({
        externalId: `notion:${page.id}`,
        title: page.title,
        content,
        url: page.url,
        updatedAt: page.lastEditedAt,
      });
    } catch {
      skipped += 1;
    }
  }
  return { items, skipped };
}

function parseGithubTarget(remotePath: string): { owner: string; repo: string; path: string } | null {
  const raw = remotePath.trim().replace(/^https?:\/\/github\.com\//i, '');
  const [target, ...rest] = raw.split(':');
  const parts = target.replace(/\.git$/, '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1], path: rest.join(':').trim() };
}

async function fetchGithubItems(tokens: TokenBundle | null, remotePath: string): Promise<{ items: SyncItem[]; skipped: number }> {
  const target = parseGithubTarget(remotePath);
  if (!target) throw new Error('Use "owner/repo" or "owner/repo:path" as the GitHub source path');
  const tree = await githubRepoTree(tokens!, target.owner, target.repo, target.path);
  const items: SyncItem[] = [];
  let skipped = 0;
  for (const entry of tree.slice(0, MAX_ITEMS_PER_SYNC)) {
    try {
      const content = await githubRawFile(tokens!, target.owner, target.repo, entry.path);
      if (!content.trim()) {
        skipped += 1;
        continue;
      }
      items.push({
        externalId: `github:${target.owner}/${target.repo}:${entry.path}`,
        title: entry.path.replace(/\.md$/i, ''),
        content,
        url: `https://github.com/${target.owner}/${target.repo}/blob/HEAD/${entry.path}`,
      });
    } catch {
      skipped += 1;
    }
  }
  return { items, skipped };
}

async function upsertDocuments(
  prisma: any,
  organizationId: string,
  source: any,
  items: SyncItem[],
): Promise<{ created: number; updated: number; unchanged: number }> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const item of items) {
    const content = item.content.slice(0, MAX_CONTENT);
    const sourceLabel = `${source.provider}:${source.name}`;
    const existing = await prisma.document.findFirst({
      where: { organizationId, metadata: { path: ['sourceId'], equals: item.externalId } },
      select: { id: true, title: true, content: true },
    });
    if (!existing) {
      await prisma.document.create({
        data: {
          organizationId,
          title: item.title.slice(0, 300),
          source: sourceLabel,
          content,
          agentId: null,
          metadata: {
            sourceId: item.externalId,
            sourceName: source.name,
            provider: source.provider,
            url: item.url ?? '',
            syncedAt: new Date().toISOString(),
          },
        },
      });
      created += 1;
      continue;
    }
    if (existing.title === item.title && existing.content === content) {
      unchanged += 1;
      continue;
    }
    await prisma.document.update({
      where: { id: existing.id },
      data: {
        title: item.title.slice(0, 300),
        source: sourceLabel,
        content,
        metadata: {
          sourceId: item.externalId,
          sourceName: source.name,
          provider: source.provider,
          url: item.url ?? '',
          syncedAt: new Date().toISOString(),
        },
      },
    });
    updated += 1;
  }
  return { created, updated, unchanged };
}

export async function syncKnowledgeSource(prisma: any, source: any): Promise<SyncResult> {
  const started = new Date().toISOString();
  const base: SyncResult = {
    sourceId: String(source.id),
    provider: String(source.provider),
    status: 'ok',
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    finishedAt: started,
  };
  try {
    let tokens: TokenBundle | null = null;
    if (source.provider === 'github') {
      const connected = await prisma.integrationConnection.findFirst({
        where: { organizationId: source.organizationId, provider: 'github' },
      });
      if (connected) {
        tokens = (await resolveConnectionTokens(prisma, source.organizationId, 'github')).tokens;
      } else if (!process.env.GITHUB_TOKEN?.trim()) {
        throw new Error('Connect GitHub or set GITHUB_TOKEN to sync repositories');
      } else {
        tokens = { accessToken: process.env.GITHUB_TOKEN.trim() };
      }
    } else {
      tokens = (await resolveConnectionTokens(prisma, source.organizationId, source.provider)).tokens;
    }

    let fetched: { items: SyncItem[]; skipped: number };
    if (source.provider === 'google_drive') {
      fetched = await fetchDriveItems(tokens, String(source.remotePath ?? ''));
    } else if (source.provider === 'notion') {
      fetched = await fetchNotionItems(tokens, String(source.remotePath ?? ''));
    } else if (source.provider === 'github') {
      fetched = await fetchGithubItems(tokens, String(source.remotePath ?? ''));
    } else {
      throw new Error(`Knowledge sync is not supported for ${source.provider}`);
    }

    const counts = await upsertDocuments(prisma, source.organizationId, source, fetched.items);
    const result: SyncResult = {
      ...base,
      ...counts,
      skipped: fetched.skipped,
      status: 'ok',
      finishedAt: new Date().toISOString(),
    };
    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        lastSyncAt: new Date(),
        lastError: '',
        documentsSynced: counts.created + counts.updated + counts.unchanged,
        status: 'ACTIVE',
      },
    });
    await prisma.integrationConnection.updateMany({
      where: { organizationId: source.organizationId, provider: source.provider },
      data: { lastSyncAt: new Date() },
    });
    await recordIntegrationLog(prisma, {
      organizationId: source.organizationId,
      connectionId: source.connectionId,
      provider: source.provider,
      event: 'knowledge_sync_completed',
      message: `Synced ${source.name}: ${counts.created} created, ${counts.updated} updated, ${fetched.skipped} skipped`,
      metadata: { sourceId: source.id, ...counts, skipped: fetched.skipped },
    });
    return result;
  } catch (error) {
    const message = errorMessage(error);
    await prisma.knowledgeSource
      .update({
        where: { id: source.id },
        data: { lastSyncAt: new Date(), lastError: message.slice(0, 500), status: 'ERROR' },
      })
      .catch(() => undefined);
    await recordIntegrationLog(prisma, {
      organizationId: source.organizationId,
      connectionId: source.connectionId,
      provider: source.provider,
      level: 'error',
      event: 'knowledge_sync_failed',
      message: message.slice(0, 500),
      metadata: { sourceId: source.id },
    });
    return { ...base, status: 'error', error: message.slice(0, 500), finishedAt: new Date().toISOString() };
  }
}

const SYNC_STALENESS_MS = 15 * 60 * 1000;
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

export async function runDueSyncs(prisma: any): Promise<{ checked: number; synced: number; failed: number }> {
  const setting = await getIntegrationSetting(prisma);
  if (!setting.enabled) return { checked: 0, synced: 0, failed: 0 };
  let sources: any[] = [];
  try {
    sources = await prisma.knowledgeSource.findMany({
      where: { status: { not: 'PAUSED' }, autoSync: true },
      orderBy: { lastSyncAt: { sort: 'asc', nulls: 'first' } },
      take: 50,
    });
  } catch {
    return { checked: 0, synced: 0, failed: 0 };
  }
  const now = Date.now();
  let checked = 0;
  let synced = 0;
  let failed = 0;
  for (const source of sources) {
    const last = source.lastSyncAt ? new Date(source.lastSyncAt).getTime() : 0;
    if (last && now - last < SYNC_STALENESS_MS) continue;
    if (setting.disabledProviders.includes(String(source.provider))) continue;
    checked += 1;
    const result = await syncKnowledgeSource(prisma, source);
    if (result.status === 'ok') synced += 1;
    else failed += 1;
  }
  return { checked, synced, failed };
}

export { SYNC_INTERVAL_MS };
