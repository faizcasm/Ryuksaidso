import { dynamicImport, errorMessage } from './util';
import type { ToolDef } from './types';

export type McpServerConfig = { command?: string; args?: string[]; env?: Record<string, string>; url?: string };

const WRITE_PATTERN = /(^|_|\b)(create|update|delete|insert|patch|remove|post|send|write|publish|move|archive|reply|comment|upload|execute|trigger|merge|assign|invite|close|resolve|start|stop|add|set|update)(_|$|\b)/i;

const CONNECT_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 30_000;

let cacheKey: string | null = null;
let cachedTools: Record<string, ToolDef> | null = null;
let inflight: Promise<Record<string, ToolDef>> | null = null;

export function mcpConfigured(raw: string | undefined = process.env.MCP_SERVERS): boolean {
  return Boolean(raw && raw.trim() && raw.trim() !== '{}');
}

function parseConfig(raw: string | undefined): Record<string, McpServerConfig> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`MCP_SERVERS is not valid JSON: ${errorMessage(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('MCP_SERVERS must be a JSON object of server configs');
  return parsed as Record<string, McpServerConfig>;
}

function normalizeToolResult(result: any): unknown {
  const content = Array.isArray(result?.content) ? result.content : [];
  const texts = content.filter((part: any) => part?.type === 'text').map((part: any) => String(part.text ?? ''));
  const payload: Record<string, unknown> = { text: texts.join('\n').slice(0, 20_000) };
  if (result?.isError) payload.error = payload.text;
  for (const [key, value] of Object.entries(result?.structuredContent ?? {})) payload[key] = value;
  return payload;
}

async function connectServer(server: string, config: McpServerConfig): Promise<Record<string, ToolDef>> {
  const { Client } = await dynamicImport('@modelcontextprotocol/sdk/client/index.js');

  let transport: any;
  if (config.url) {
    const endpoint = new URL(config.url);
    try {
      const { StreamableHTTPClientTransport } = await dynamicImport('@modelcontextprotocol/sdk/client/streamableHttp.js');
      transport = new StreamableHTTPClientTransport(endpoint);
    } catch {
      const { SSEClientTransport } = await dynamicImport('@modelcontextprotocol/sdk/client/sse.js');
      transport = new SSEClientTransport(endpoint);
    }
  } else if (config.command) {
    const { StdioClientTransport } = await dynamicImport('@modelcontextprotocol/sdk/client/stdio.js');
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...(process.env as Record<string, string>), ...(config.env ?? {}) },
      stderr: 'ignore',
    });
  } else {
    throw new Error(`MCP server "${server}" needs either a command (stdio) or a url (HTTP/SSE)`);
  }

  const client = new Client({ name: 'ryuksaidso', version: '2.0.0' }, { capabilities: {} });
  await Promise.race([
    client.connect(transport),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`MCP server "${server}" connect timeout after ${CONNECT_TIMEOUT_MS}ms`)), CONNECT_TIMEOUT_MS)),
  ]);

  const listed = await client.listTools();
  const tools: Record<string, ToolDef> = {};
  for (const mcpTool of listed?.tools ?? []) {
    const name = `mcp__${server}__${mcpTool.name}`;
    const properties = Object.keys(mcpTool.inputSchema?.properties ?? {});
    tools[name] = {
      name,
      category: 'Integrations (MCP)',
      description:
        `[MCP:${server}] ${mcpTool.description || mcpTool.name}` +
        (properties.length ? ` Input: { ${properties.join(', ')} }.` : ' Input: {}.'),
      scope: `mcp:${server}`,
      requiresApproval: WRITE_PATTERN.test(mcpTool.name ?? ''),
      execute: async (input: Record<string, unknown>) => {
        try {
          const clean = Object.fromEntries(Object.entries(input).filter(([key]) => !['query', 'prompt', 'ticketId', 'metadata', 'reason'].includes(key)));
          const result = await Promise.race([
            client.callTool({ name: mcpTool.name, arguments: clean }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`MCP tool "${name}" timed out after ${CALL_TIMEOUT_MS}ms`)), CALL_TIMEOUT_MS)),
          ]);
          return normalizeToolResult(result);
        } catch (error) {
          return { error: `MCP tool "${name}" failed: ${errorMessage(error)}` };
        }
      },
    };
  }
  return tools;
}

export async function loadMcpTools(raw: string | undefined = process.env.MCP_SERVERS): Promise<Record<string, ToolDef>> {
  const key = raw ?? '';
  if (cachedTools && cacheKey === key) return cachedTools;
  if (inflight) return inflight;

  const run = async (): Promise<Record<string, ToolDef>> => {
    const config = parseConfig(raw);
    const merged: Record<string, ToolDef> = {};
    await Promise.all(
      Object.entries(config).map(async ([server, serverConfig]) => {
        try {
          Object.assign(merged, await connectServer(server, serverConfig));
        } catch (error) {
          console.warn(`[mcp] server "${server}" unavailable: ${errorMessage(error)}`);
        }
      }),
    );
    cacheKey = key;
    cachedTools = merged;
    return merged;
  };

  inflight = run().finally(() => { inflight = null; });
  return inflight;
}

export function resetMcpCache(): void {
  cacheKey = null;
  cachedTools = null;
}
