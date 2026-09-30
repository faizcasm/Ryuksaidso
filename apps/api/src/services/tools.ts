import { prisma } from '../lib/db';
import { buildTools, knowledgeTerms, type ToolDef, type ToolContext } from '@ryuksaidso/agent-tools';

export type { ToolDef, ToolContext };
export { knowledgeTerms };

export const tools: Record<string, ToolDef> = buildTools({ prisma });
