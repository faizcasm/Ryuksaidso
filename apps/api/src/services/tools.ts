import { prisma } from '../lib/db';
import { buildTools, knowledgeTerms, type ToolDef, type ToolContext } from '@ryuksaidso/agent-tools';

export type { ToolDef, ToolContext };
export { knowledgeTerms };

/**
 * Single source of truth for agent tools lives in @ryuksaidso/agent-tools —
 * the API uses it for tool metadata (agent picker) and the worker for
 * execution, so the two can never drift.
 */
export const tools: Record<string, ToolDef> = buildTools({ prisma });
