import type { BuildToolsDeps, ToolDef } from './types';
import { calculate } from './calc';
import { currentTimeTool, currentWeatherTool, webSearchTool, githubTool } from './external';
import {
  currencyConvertTool,
  unitConvertTool,
  dictionaryTool,
  newsTool,
  textToolsTool,
} from './data';
import { softFail } from './util';

export type { ToolDef, ToolContext, BuildToolsDeps } from './types';
export { calculate } from './calc';
export { loadMcpTools, mcpConfigured, resetMcpCache } from './mcp';
export { currentTimeTool, currentWeatherTool, webSearchTool, githubTool } from './external';
export {
  currencyConvertTool,
  unitConvertTool,
  dictionaryTool,
  newsTool,
  textToolsTool,
} from './data';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'can', 'could',
  'should', 'would', 'will', 'shall', 'i', 'me', 'my', 'we', 'our', 'us', 'you', 'your', 'he', 'she', 'they', 'them',
  'who', 'what', 'when', 'where', 'why', 'how', 'which', 'tell', 'show', 'give', 'about', 'of', 'to', 'in', 'on', 'at',
  'for', 'and', 'or', 'not', 'with', 'from', 'by', 'as', 'it', 'its', 'this', 'that', 'these', 'those', 'please', 'need',
  'want', 'know', 'information', 'info', 'details', 'there', 'here', 'if', 'then', 'than', 'so', 'very', 'just',
]);

export function knowledgeTerms(query: string): string[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);
  const significant = words.filter(w => !STOPWORDS.has(w));
  return [...new Set(significant.length ? significant : words)].slice(0, 12);
}

export function buildTools(deps: BuildToolsDeps): Record<string, ToolDef> {
  const { prisma } = deps;

  const builtIn: Record<string, ToolDef> = {
    search_knowledge: {
      name: 'search_knowledge',
      description: 'Search workspace knowledge (shared documents plus documents assigned to this agent) using PostgreSQL full-text ranking.',
      category: 'Knowledge',
      scope: 'knowledge:read',
      requiresApproval: false,
      execute: async (input, ctx) => {
        const terms = knowledgeTerms(String(input.query ?? ''));
        if (!terms.length) return [];
        const tsquery = terms.join(' OR ');
        const agentId = ctx.agentId ?? null;
        return prisma.$queryRaw<Array<{ id: string; title: string; source: string; content: string; rank: number }>>`
          SELECT id,title,source,LEFT(content,4000) AS content,
            ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')), websearch_to_tsquery('simple', ${tsquery})) AS rank
          FROM "Document"
          WHERE "organizationId" = ${ctx.user.organizationId}
            AND ("agentId" IS NULL OR "agentId" = ${agentId})
            AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')) @@ websearch_to_tsquery('simple', ${tsquery})
          ORDER BY rank DESC, "createdAt" DESC LIMIT 8`;
      },
    },
    get_ticket: {
      name: 'get_ticket',
      description: 'Read an organization ticket and its conversation. Input: { ticketId: string }.',
      category: 'Tickets',
      scope: 'ticket:read',
      requiresApproval: false,
      execute: async (input, ctx) =>
        prisma.ticket.findFirst({
          where: { id: String(input.ticketId ?? ''), organizationId: ctx.user.organizationId },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        }),
    },
    add_ticket_message: {
      name: 'add_ticket_message',
      description: 'Append an assistant message to a ticket. This is a write side effect. Input: { ticketId: string, content: string }.',
      category: 'Tickets',
      scope: 'ticket:write',
      requiresApproval: true,
      execute: async (input, ctx) => {
        const ticketId = String(input.ticketId ?? '');
        const ticket = await prisma.ticket.findFirst({
          where: { id: ticketId, organizationId: ctx.user.organizationId },
          select: { id: true },
        });
        if (!ticket) throw new Error('Ticket not found');
        return prisma.message.create({
          data: {
            ticketId: ticket.id,
            role: 'assistant',
            content: String(input.content ?? input.prompt ?? ''),
            metadata: { runId: ctx.runId },
          },
        });
      },
    },
    current_time: { ...currentTimeTool, execute: currentTimeTool.execute as ToolDef['execute'] },
    calculator: {
      name: 'calculator',
      description:
        'Evaluate an arithmetic expression safely ( + - * / % ^, parentheses, functions sqrt/abs/round/floor/ceil/sin/cos/tan/log/ln/exp, constants pi/e ). Input: { expression: string } e.g. "23*7+5".',
      category: 'Utilities',
      scope: 'calculator:use',
      requiresApproval: false,
      execute: (input) => softFail(async () => {
        const expression = String(input.expression ?? input.query ?? input.prompt ?? '').trim();
        if (!expression) throw new Error('expression is required');
        return { expression, result: calculate(expression) };
      }),
    },
    current_weather: { ...currentWeatherTool, execute: currentWeatherTool.execute as ToolDef['execute'] },
    web_search: { ...webSearchTool, execute: webSearchTool.execute as ToolDef['execute'] },
    github: { ...githubTool, execute: githubTool.execute as ToolDef['execute'] },
    currency_convert: { ...currencyConvertTool, execute: currencyConvertTool.execute as ToolDef['execute'] },
    unit_convert: { ...unitConvertTool, execute: unitConvertTool.execute as ToolDef['execute'] },
    dictionary: { ...dictionaryTool, execute: dictionaryTool.execute as ToolDef['execute'] },
    news: { ...newsTool, execute: newsTool.execute as ToolDef['execute'] },
    text_tools: { ...textToolsTool, execute: textToolsTool.execute as ToolDef['execute'] },
  };

  return { ...builtIn, ...(deps.extra ?? {}) };
}
