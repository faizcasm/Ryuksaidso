import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { softFail } from './util';

const MAX_WRITE_BYTES = 1_000_000;
const MAX_READ_BYTES = 500_000;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', '__pycache__', '.venv']);
const MAX_WALK_FILES = 3000;
const MAX_DEPTH = 8;
const NUL = String.fromCharCode(0);

function filesRoot(): string {
  const configured = process.env.FILES_ROOT?.trim();
  if (configured) return configured;
  return path.resolve(process.cwd(), 'data/files');
}

function orgRoot(organizationId: string): string {
  const root = path.resolve(filesRoot());
  const scoped = path.resolve(root, organizationId);
  if (!scoped.startsWith(root + path.sep) && scoped !== root) throw new Error('Invalid organization storage path');
  return scoped;
}

function safePath(organizationId: string, relative: string): string {
  const scoped = orgRoot(organizationId);
  const resolved = path.resolve(scoped, String(relative ?? '').replace(/^\/+/, ''));
  if (resolved !== scoped && !resolved.startsWith(scoped + path.sep)) {
    throw new Error(`Path escapes the workspace file root: "${String(relative).slice(0, 120)}"`);
  }
  return resolved;
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096);
  for (const byte of sample) if (byte === 0) return true;
  return false;
}

type WalkResult = { path: string; size: number; modifiedAt: string; nameMatch?: boolean; line?: number; snippet?: string };

function walk(dir: string, root: string, query: string, results: WalkResult[], depth: number) {
  if (depth > MAX_DEPTH || results.length >= MAX_WALK_FILES) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const needle = query.toLowerCase();
  for (const entry of entries) {
    if (results.length >= MAX_WALK_FILES) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(full, root, query, results, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    const relative = path.relative(root, full);
    const nameMatch = entry.name.toLowerCase().includes(needle);
    let line: number | undefined;
    let snippet: string | undefined;
    if (!nameMatch && stat.size <= 200_000) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        if (!content.includes(NUL)) {
          const lines = content.split('\n');
          const index = lines.findIndex((candidate) => candidate.toLowerCase().includes(needle));
          if (index >= 0) {
            line = index + 1;
            snippet = lines[index].trim().slice(0, 240);
          }
        }
      } catch {
        continue;
      }
    }
    if (nameMatch || line) {
      results.push({
        path: relative,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ...(nameMatch ? { nameMatch: true } : {}),
        ...(line ? { line, snippet } : {}),
      });
    }
  }
}

export const fsListTool = {
  name: 'fs_list',
  description:
    'List files and folders in the agent workspace file storage. Input: { path?: string (relative directory, defaults to the workspace root) }. Returns names, sizes and modification times.',
  category: 'Files',
  scope: 'fs:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>, ctx: any) =>
    softFail(async () => {
      const dir = safePath(ctx.user.organizationId, String(input.path ?? ''));
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch (error: any) {
        if (error?.code === 'ENOENT') return { path: String(input.path ?? ''), entries: [], note: 'Directory does not exist yet.' };
        throw error;
      }
      const listing: Array<Record<string, unknown>> = [];
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500)) {
        const full = path.join(dir, entry.name);
        let size: number | null = null;
        let modifiedAt: string | null = null;
        try {
          const stat = await fsp.stat(full);
          size = stat.size;
          modifiedAt = stat.mtime.toISOString();
        } catch {}
        listing.push({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file', size, modifiedAt });
      }
      return { path: String(input.path ?? ''), entries: listing, count: listing.length };
    }),
};

export const fsReadTool = {
  name: 'fs_read',
  description:
    'Read a text file from the agent workspace file storage. Input: { path: string (relative file path), maxBytes?: number (default 200000) }. Binary files are rejected with a clear error.',
  category: 'Files',
  scope: 'fs:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>, ctx: any) =>
    softFail(async () => {
      const relative = String(input.path ?? '').trim();
      if (!relative) throw new Error('path is required');
      const file = safePath(ctx.user.organizationId, relative);
      const stat = await fsp.stat(file).catch(() => null);
      if (!stat) throw new Error(`File not found: ${relative}`);
      if (stat.isDirectory()) throw new Error(`${relative} is a directory — use fs_list instead`);
      if (stat.size > MAX_READ_BYTES) throw new Error(`File is ${stat.size} bytes; the read cap is ${MAX_READ_BYTES} bytes`);
      const buffer = await fsp.readFile(file);
      if (looksBinary(buffer)) throw new Error(`${relative} looks like a binary file`);
      const maxBytes = Math.min(Math.max(Number(input.maxBytes ?? 200_000) || 200_000, 1000), MAX_READ_BYTES);
      const content = buffer.toString('utf8');
      const truncated = content.length > maxBytes;
      return {
        path: relative,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        content: truncated ? content.slice(0, maxBytes) : content,
        truncated,
      };
    }),
};

export const fsSearchTool = {
  name: 'fs_search',
  description:
    'Search files in the agent workspace file storage by file name or content. Input: { query: string, path?: string (restrict to a subdirectory), maxResults?: number (1-50) }. Returns matching files with line numbers and snippets.',
  category: 'Files',
  scope: 'fs:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>, ctx: any) =>
    softFail(async () => {
      const query = String(input.query ?? '').trim();
      if (!query) throw new Error('query is required');
      const base = safePath(ctx.user.organizationId, String(input.path ?? ''));
      const exists = await fsp.stat(base).catch(() => null);
      if (!exists) return { query, results: [], note: 'Search path does not exist.' };
      const results: WalkResult[] = [];
      walk(base, base, query, results, 0);
      const maxResults = Math.min(Math.max(Number(input.maxResults ?? 20) || 20, 1), 50);
      return { query, searchedRoot: String(input.path ?? ''), results: results.slice(0, maxResults), totalMatches: results.length };
    }),
};

export const fsWriteTool = {
  name: 'fs_write',
  description:
    'Write a text file into the agent workspace file storage (creates parent folders). This is a write side effect and requires human approval. Input: { path: string (relative file path), content: string, mode?: "create" | "overwrite" } — mode defaults to "overwrite"; use "create" to fail if the file already exists.',
  category: 'Files',
  scope: 'fs:write',
  requiresApproval: true,
  execute: (input: Record<string, unknown>, ctx: any) =>
    softFail(async () => {
      const relative = String(input.path ?? '').trim();
      if (!relative) throw new Error('path is required');
      const content = String(input.content ?? '');
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > MAX_WRITE_BYTES) throw new Error(`Content is ${bytes} bytes; the write cap is ${MAX_WRITE_BYTES} bytes`);
      const file = safePath(ctx.user.organizationId, relative);
      const mode = String(input.mode ?? 'overwrite');
      if (mode === 'create' && (await fsp.stat(file).catch(() => null))) throw new Error(`${relative} already exists (mode "create")`);
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(file, content, 'utf8');
      const stat = await fsp.stat(file);
      return { path: relative, bytes, size: stat.size, modifiedAt: stat.mtime.toISOString(), mode };
    }),
};
