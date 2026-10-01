import { softFail } from './util';

const str = (value: unknown): string => String(value ?? '').trim();
const ownerRepo = (input: Record<string, unknown>) => {
  const owner = str(input.owner);
  const repo = str(input.repo ?? input.repository);
  if (!owner || !repo) throw new Error('owner and repo are required');
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) throw new Error('owner and repo may only contain letters, digits, ".", "_" and "-"');
  return { owner, repo };
};
const issueNumber = (input: Record<string, unknown>): number => {
  const value = Number(input.issueNumber ?? input.issue_number ?? input.number);
  if (!Number.isInteger(value) || value <= 0) throw new Error('issueNumber must be a positive integer');
  return value;
};

async function githubApi(path: string, init: { method?: string; body?: unknown } = {}) {
  const token = process.env.GITHUB_TOKEN?.trim();
  const method = (init.method ?? 'GET').toUpperCase();
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'user-agent': 'ryuksaidso-agent/2.0 (+https://github.com/ryuksaidso)',
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' ? String(data.message ?? '') : String(data ?? '').slice(0, 200);
    const hint = response.status === 401 ? ' — check GITHUB_TOKEN' : response.status === 403 ? ' — rate limited or missing permission' : '';
    throw new Error(`GitHub ${response.status}: ${message || 'request failed'}${hint}`);
  }
  return data;
}

const requireToken = () => {
  if (!process.env.GITHUB_TOKEN?.trim()) throw new Error('GITHUB_TOKEN is not configured — GitHub writes are unavailable.');
};

export const githubSearchReposTool = {
  name: 'github_search_repositories',
  description:
    'Search GitHub repositories. Input: { query: string (GitHub search syntax, e.g. "agent framework stars:>1000"), limit?: number (1-20) }.',
  category: 'Integrations',
  scope: 'github:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const query = str(input.query ?? input.q);
      if (!query) throw new Error('query is required');
      const limit = Math.min(Math.max(Number(input.limit ?? 5) || 5, 1), 20);
      const data = await githubApi(`/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`);
      return {
        query,
        results: (data?.items ?? []).map((repo: any) => ({
          fullName: repo.full_name,
          description: repo.description,
          stars: repo.stargazers_count,
          language: repo.language,
          openIssues: repo.open_issues_count,
          url: repo.html_url,
        })),
        totalMatches: data?.total_count ?? 0,
      };
    }),
};

export const githubReadFileTool = {
  name: 'github_read_file',
  description:
    'Read a file (or list a directory) in a GitHub repository. Input: { owner: string, repo: string, path: string (e.g. "src/index.ts" or "" for repo root), ref?: string (branch/tag/commit, defaults to the default branch) }. Returns decoded file content up to 1MB.',
  category: 'Integrations',
  scope: 'github:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const { owner, repo } = ownerRepo(input);
      const path = str(input.path).replace(/^\/+/, '');
      const ref = str(input.ref ?? input.branch);
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const data = await githubApi(`/repos/${owner}/${repo}/contents/${path}${query}`);
      if (Array.isArray(data)) {
        return {
          path: path || '/',
          type: 'directory',
          entries: data.slice(0, 200).map((entry: any) => ({ name: entry.name, type: entry.type, size: entry.size ?? null, path: entry.path })),
        };
      }
      if (data?.type !== 'file') throw new Error(`"${path}" is not a readable file in ${owner}/${repo}`);
      let content = '';
      let truncated = false;
      if (data.encoding === 'base64' && typeof data.content === 'string') {
        content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
      } else if (data.download_url) {
        const response = await fetch(data.download_url, { headers: { 'user-agent': 'ryuksaidso-agent/2.0' }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`GitHub raw download failed: HTTP ${response.status}`);
        content = await response.text();
      }
      if (content.length > 200_000) {
        content = content.slice(0, 200_000);
        truncated = true;
      }
      return { path: data.path, type: 'file', size: data.size, sha: data.sha, ref: ref || 'default branch', content, truncated, url: data.html_url };
    }),
};

export const githubCreateIssueTool = {
  name: 'github_create_issue',
  description:
    'Create a GitHub issue. This is a write side effect and requires human approval. Input: { owner: string, repo: string, title: string, body?: string, labels?: string[], assignees?: string[] }.',
  category: 'Integrations',
  scope: 'github:write',
  requiresApproval: true,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      requireToken();
      const { owner, repo } = ownerRepo(input);
      const title = str(input.title);
      if (!title) throw new Error('title is required');
      const data = await githubApi(`/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        body: {
          title,
          ...(str(input.body) ? { body: str(input.body) } : {}),
          ...(Array.isArray(input.labels) && input.labels.length ? { labels: input.labels.map(String).slice(0, 20) } : {}),
          ...(Array.isArray(input.assignees) && input.assignees.length ? { assignees: input.assignees.map(String).slice(0, 10) } : {}),
        },
      });
      return { action: 'created_issue', number: data.number, title: data.title, state: data.state, url: data.html_url };
    }),
};

export const githubUpdateIssueTool = {
  name: 'github_update_issue',
  description:
    'Update an existing GitHub issue (title, body, state, labels). This is a write side effect and requires human approval. Input: { owner: string, repo: string, issueNumber: number, title?: string, body?: string, state?: "open" | "closed", labels?: string[] }.',
  category: 'Integrations',
  scope: 'github:write',
  requiresApproval: true,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      requireToken();
      const { owner, repo } = ownerRepo(input);
      const number = issueNumber(input);
      const patch: Record<string, unknown> = {};
      if (str(input.title)) patch.title = str(input.title);
      if (str(input.body)) patch.body = str(input.body);
      if (['open', 'closed'].includes(str(input.state))) patch.state = str(input.state);
      if (Array.isArray(input.labels)) patch.labels = input.labels.map(String).slice(0, 20);
      if (!Object.keys(patch).length) throw new Error('Provide at least one field to update (title, body, state or labels)');
      const data = await githubApi(`/repos/${owner}/${repo}/issues/${number}`, { method: 'PATCH', body: patch });
      return { action: 'updated_issue', number: data.number, title: data.title, state: data.state, url: data.html_url, updatedFields: Object.keys(patch) };
    }),
};

export const githubCommentIssueTool = {
  name: 'github_comment_issue',
  description:
    'Add a comment to a GitHub issue or pull request. This is a write side effect and requires human approval. Input: { owner: string, repo: string, issueNumber: number, body: string }.',
  category: 'Integrations',
  scope: 'github:write',
  requiresApproval: true,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      requireToken();
      const { owner, repo } = ownerRepo(input);
      const number = issueNumber(input);
      const body = str(input.body ?? input.comment ?? input.content);
      if (!body) throw new Error('body is required');
      const data = await githubApi(`/repos/${owner}/${repo}/issues/${number}/comments`, { method: 'POST', body: { body } });
      return { action: 'commented', issueNumber: number, commentId: data.id, url: data.html_url, createdAt: data.created_at };
    }),
};

export const githubCreateBranchTool = {
  name: 'github_create_branch',
  description:
    'Create a branch in a GitHub repository from an existing branch. This is a write side effect and requires human approval. Input: { owner: string, repo: string, branch: string (new branch name), fromBranch?: string (defaults to the repository default branch) }.',
  category: 'Integrations',
  scope: 'github:write',
  requiresApproval: true,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      requireToken();
      const { owner, repo } = ownerRepo(input);
      const branch = str(input.branch ?? input.name);
      if (!branch || !/^[A-Za-z0-9._/-]+$/.test(branch)) throw new Error('branch must be a valid git ref name');
      let base = str(input.fromBranch ?? input.base);
      if (!base) {
        const repoData = await githubApi(`/repos/${owner}/${repo}`);
        base = String(repoData?.default_branch ?? 'main');
      }
      const ref = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
      const sha = ref?.object?.sha;
      if (!sha) throw new Error(`Could not resolve commit for base branch "${base}"`);
      const data = await githubApi(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: { ref: `refs/heads/${branch}`, sha },
      });
      return { action: 'created_branch', branch, fromBranch: base, sha, ref: data?.ref };
    }),
};

export const githubGetPullRequestTool = {
  name: 'github_get_pull_request',
  description:
    'Get details of a GitHub pull request (state, branches, mergeability, reviews, checks). Input: { owner: string, repo: string, pullNumber: number }.',
  category: 'Integrations',
  scope: 'github:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const { owner, repo } = ownerRepo(input);
      const number = Number(input.pullNumber ?? input.pull_number ?? input.number);
      if (!Number.isInteger(number) || number <= 0) throw new Error('pullNumber must be a positive integer');
      const data = await githubApi(`/repos/${owner}/${repo}/pulls/${number}`);
      return {
        number: data.number,
        title: data.title,
        state: data.state,
        draft: data.draft,
        merged: data.merged,
        mergeable: data.mergeable,
        mergeableState: data.mergeable_state,
        base: data.base?.ref,
        head: data.head?.ref,
        author: data.user?.login,
        additions: data.additions,
        deletions: data.deletions,
        changedFiles: data.changed_files,
        reviewComments: data.review_comments,
        url: data.html_url,
        updatedAt: data.updated_at,
      };
    }),
};

export const githubCreatePullRequestTool = {
  name: 'github_create_pull_request',
  description:
    'Open a GitHub pull request. This is a write side effect and requires human approval. Input: { owner: string, repo: string, title: string, head: string (source branch), base?: string (target branch, defaults to the repository default branch), body?: string }.',
  category: 'Integrations',
  scope: 'github:write',
  requiresApproval: true,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      requireToken();
      const { owner, repo } = ownerRepo(input);
      const title = str(input.title);
      const head = str(input.head);
      if (!title) throw new Error('title is required');
      if (!head) throw new Error('head (source branch) is required');
      let base = str(input.base);
      if (!base) {
        const repoData = await githubApi(`/repos/${owner}/${repo}`);
        base = String(repoData?.default_branch ?? 'main');
      }
      const data = await githubApi(`/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        body: { title, head, base, ...(str(input.body) ? { body: str(input.body) } : {}) },
      });
      return { action: 'created_pull_request', number: data.number, title: data.title, state: data.state, base, head, url: data.html_url };
    }),
};
