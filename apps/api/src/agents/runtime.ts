import { prisma } from '../lib/db';
import type { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { agentDuration, agentRuns } from '../lib/metrics';
import { llm } from '../services/llm';
import { tools } from '../services/tools';
import type { AuthUser } from '../lib/auth';

export type TraceEvent = { runId: string; step: string; agent: string; status: string; message: string; data?: unknown };
export type TraceListener = (event: TraceEvent) => void;

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function step(
  runId: string,
  index: number,
  agent: string,
  action: string,
  input: unknown,
  fn: () => Promise<unknown>,
  emit: TraceListener
) {
  const started = Date.now();
  emit({ runId, step: `${index}`, agent, status: 'running', message: action, data: input });
  try {
    const output = await fn();
    await prisma.agentStep.create({
      data: { runId, stepIndex: index, agent, action, status: 'completed', input: input as any, output: output as any, durationMs: Date.now() - started }
    });
    emit({ runId, step: `${index}`, agent, status: 'completed', message: action, data: output });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.agentStep.create({
      data: { runId, stepIndex: index, agent, action, status: 'failed', input: input as any, error: message, durationMs: Date.now() - started }
    });
    emit({ runId, step: `${index}`, agent, status: 'failed', message });
    throw error;
  }
}

export async function runSupportGraph(user: AuthUser, ticketId: string, emit: TraceListener = () => undefined) {
  const started = Date.now();
  const run = await prisma.agentRun.create({
    data: {
      organizationId: user.organizationId,
      ticketId,
      status: 'RUNNING',
      startedAt: new Date(),
      input: { ticketId }
    }
  });

  try {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, organizationId: user.organizationId }, include: { messages: true } });
    if (!ticket) throw new Error('Ticket not found');

    const triage = await step(run.id, 0, 'Triage Agent', 'Classify request', { title: ticket.title }, () => llm.chat([
      { role: 'system', content: 'Return JSON with intent, urgency, entities, nextAgents.' },
      { role: 'user', content: `${ticket.title}\n${ticket.description}` }
    ], true), emit);
    const knowledge = await step(run.id, 1, 'Knowledge Agent', 'Retrieve relevant knowledge', { query: ticket.title }, () => tools.search_knowledge.execute({ query: ticket.title }, { user, runId: run.id }), emit);
    const research = await step(run.id, 2, 'Research Agent', 'Investigate with ticket context', { ticketId }, () => tools.get_ticket.execute({ ticketId }, { user, runId: run.id }), emit);
    const resolution = await step(run.id, 3, 'Resolution Agent', 'Synthesize a safe resolution', { triage, knowledge, research }, () => llm.chat([
      { role: 'system', content: 'You are the resolution agent. Use evidence only. Produce a concise support response and mention uncertainty.' },
      { role: 'user', content: JSON.stringify({ ticket, triage, knowledge, research }) }
    ]), emit);

    const output: Prisma.InputJsonValue = toJson({ triage, knowledge, research, resolution });
    const tokenUsage = [triage, resolution].reduce<number>((total, item) => {
      if (typeof item !== 'object' || item === null || !('tokens' in item)) return total;
      const tokens = Number((item as { tokens?: unknown }).tokens ?? 0);
      return total + (Number.isFinite(tokens) ? tokens : 0);
    }, 0);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', output, finishedAt: new Date(), tokenUsage } });
    agentRuns.inc({ status: 'completed' });
    agentDuration.observe((Date.now() - started) / 1000);
    logger.info('Agent run completed', { runId: run.id, ticketId });
    return run.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: message, finishedAt: new Date() } });
    agentRuns.inc({ status: 'failed' });
    throw error;
  }
}
