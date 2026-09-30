export type RuntimeUser = { id: string; email: string; name: string; organizationId: string; role: string };
export type RuntimeEvent = { runId: string; step: number; agent: string; action: string; status: 'running' | 'completed' | 'failed'; data?: unknown; message?: string };

export type RuntimeDeps = {
  prisma: any;
  getLLM: (provider: 'OLLAMA' | 'OMNIROUTE', model?: string) => { chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, json?: boolean): Promise<{ content: string; tokens: number }> };
  logger: { info(meta: unknown, message?: string): void; error(meta: unknown, message?: string): void };
  tools: Record<string, {
    name: string;
    description: string;
    category?: string;
    scope: string;
    requiresApproval: boolean;
    execute: (input: Record<string, unknown>, ctx: { user: RuntimeUser; runId: string; agentId?: string | null }) => Promise<unknown>;
  }>;
  requiresApproval: (organizationId: string, action: string, toolApproval: boolean, runId: string) => Promise<boolean>;
  createApproval: (args: { organizationId: string; runId: string; action: string; payload: unknown }) => Promise<void>;
};

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function parseJson<T>(content: string, fallback: T): T {
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export async function executeAgentRun(deps: RuntimeDeps, runId: string, user: RuntimeUser, emit: (event: RuntimeEvent) => void = () => undefined) {
  const started = Date.now();
  const run = await deps.prisma.agentRun.findFirst({
    where: { id: runId, organizationId: user.organizationId },
    include: { agent: true, agentVersion: true, project: true }
  });
  if (!run) throw new Error('Run not found');
  if (!run.agent || !run.agent.enabled) throw new Error('Agent is disabled or missing');

  await deps.prisma.agentRun.update({ where: { id: runId }, data: { status: 'RUNNING', startedAt: new Date(), error: null } });

  // Get effective agent configuration: use version config if available and valid, otherwise fall back to current agent
  const getEffectiveAgentConfig = () => {
    // If we have a version with config, use it
    if (run.agentVersion && typeof run.agentVersion.config === 'object' && run.agentVersion.config !== null) {
      const config = run.agentVersion.config as any;
      // Check if it has the required fields
      if (typeof config.instructions === 'string' && Array.isArray(config.tools)) {
        return {
          instructions: config.instructions,
          tools: config.tools,
          systemPrompt: typeof config.systemPrompt === 'string' ? config.systemPrompt : (typeof run.agent.systemPrompt === 'string' ? run.agent.systemPrompt : null),
        };
      }
    }
    // Fall back to current agent
    return {
      instructions: run.agent.instructions,
      tools: run.agent.tools,
      systemPrompt: typeof run.agent.systemPrompt === 'string' ? run.agent.systemPrompt : null,
    };
  };

  let stepIndex = 0;
  const step = async <T>(agent: string, action: string, input: unknown, fn: () => Promise<{ output: T; tokens?: number }>): Promise<T> => {
    const current = stepIndex++;
    const stepStarted = Date.now();
    emit({ runId, step: current, agent, action, status: 'running', data: input });
    try {
      const result = await fn();
      const output = result.output;
      await deps.prisma.agentStep.create({
        data: { runId, stepIndex: current, agent, action, status: 'completed', input: jsonValue(input), output: jsonValue(output), durationMs: Date.now() - stepStarted, tokens: Math.max(0, Number(result.tokens ?? 0)) }
      });
      emit({ runId, step: current, agent, action, status: 'completed', data: output });
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.prisma.agentStep.create({
        data: { runId, stepIndex: current, agent, action, status: 'failed', input: jsonValue(input), error: message, durationMs: Date.now() - stepStarted }
      });
      emit({ runId, step: current, agent, action, status: 'failed', message });
      throw error;
    }
  };

  try {
    const payload = (run.input ?? {}) as { prompt?: string; metadata?: Record<string, unknown>; ticketId?: string };
    const provider = (run.provider || 'OLLAMA') as 'OLLAMA' | 'OMNIROUTE';
    const organization = await deps.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { ollamaModel: true, omnirouteModel: true } });
    const model = provider === 'OMNIROUTE' ? organization?.omnirouteModel : organization?.ollamaModel;
    const llm = deps.getLLM(provider, model || undefined);
    const prompt = String(payload.prompt ?? payload.ticketId ?? '').trim();
    if (!prompt) throw new Error('Run input must include a prompt');

    const { instructions, tools: agentTools, systemPrompt } = getEffectiveAgentConfig();
    // Custom system prompt (set on the agent) overrides the instructions in every LLM stage.
    const persona = typeof systemPrompt === 'string' && systemPrompt.trim() ? systemPrompt : instructions;
    const configuredTools = Array.isArray(agentTools) ? agentTools.map(String) : Object.keys(deps.tools);
    const toolCatalog = configuredTools.filter((name: string) => deps.tools[name]).map((name: string) => {
      const tool = deps.tools[name];
      return { name: tool.name, description: tool.description, scope: tool.scope, requiresApproval: tool.requiresApproval };
    });

    const ticketId = String(payload.ticketId ?? '');
    const planner = await step('Planner', 'Build execution plan', { prompt, tools: toolCatalog, ticketId }, async () => {
      const ticketGuidance = ticketId
        ? ` This run handles support ticket ${ticketId}: select get_ticket to read it first, then select add_ticket_message with an "input" object {"content":"..."} holding your drafted reply to the customer.`
        : '';
      const response = await llm.chat([
        { role: 'system', content: `You are the planner for a production AI agent. Agent instructions: ${persona}. Return JSON only with this shape: {"goal":"string","risk":"low|medium|high|critical","toolCalls":[{"tool":"tool_name","reason":"string","input":{}}],"answerStrategy":"string"}. Only select tools from the supplied catalog. Never invent a tool. Never call get_ticket or add_ticket_message unless a ticketId is present.${ticketGuidance}` },
        { role: 'user', content: JSON.stringify({ prompt, toolCatalog, ticketId, metadata: payload.metadata ?? {} }) }
      ], true);
      return { output: parseJson(response.content, { goal: prompt, risk: 'low', toolCalls: [], answerStrategy: 'Answer from the available evidence.' }), tokens: response.tokens };
    });

    const toolResults: Array<{ tool: string; status: string; result?: unknown; approvalId?: string }> = [];
    const requestedCalls: any[] = Array.isArray((planner as any).toolCalls) ? (planner as any).toolCalls.slice(0, 6) : [];
    // Ticket runs always read before they write, and the reply tool is always
    // planned — so the human-approval gate and its continuation run are
    // exercised deterministically instead of depending on model mood.
    const orderedCalls = [
      ...requestedCalls.filter(c => String(c?.tool ?? '') !== 'add_ticket_message'),
      ...requestedCalls.filter(c => String(c?.tool ?? '') === 'add_ticket_message')
    ];
    if (ticketId) {
      if (deps.tools.get_ticket && !orderedCalls.some(c => String(c?.tool ?? '') === 'get_ticket'))
        orderedCalls.unshift({ tool: 'get_ticket', reason: 'Read the support ticket before replying.' });
      if (deps.tools.add_ticket_message && !orderedCalls.some(c => String(c?.tool ?? '') === 'add_ticket_message'))
        orderedCalls.push({ tool: 'add_ticket_message', reason: 'Reply to the support ticket.' });
    }

    for (const call of orderedCalls) {
      const toolName = String(call?.tool ?? '');
      const tool = deps.tools[toolName];
      if (!tool) continue;
      if (!payload.ticketId && (toolName === 'get_ticket' || toolName === 'add_ticket_message')) continue;

      const approvedScopes = Array.isArray(payload.metadata?.approvedScopes) ? payload.metadata?.approvedScopes.map(String) : [];
      const approved = approvedScopes.includes(tool.scope) ? false : await deps.requiresApproval(user.organizationId, tool.scope, Boolean(tool.requiresApproval), runId);
      const extraInput = call?.input && typeof call.input === 'object' && !Array.isArray(call.input) ? call.input : {};
      const input: Record<string, unknown> = { query: prompt, prompt, ticketId: payload.ticketId, ...(payload.metadata ?? {}), ...extraInput };
      if (approved) {
        let approvalId: string | undefined;
        await deps.createApproval({ organizationId: user.organizationId, runId, action: tool.scope, payload: { tool: toolName, input, reason: call?.reason ?? 'Agent requested a side effect.' } });
        const pending = await deps.prisma.approval.findFirst({ where: { runId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
        approvalId = pending?.id;
        toolResults.push({ tool: toolName, status: 'WAITING_APPROVAL', approvalId });
        await deps.prisma.agentRun.update({ where: { id: runId }, data: { status: 'WAITING_APPROVAL' } });
        return { runId, status: 'WAITING_APPROVAL', approvalId };
      }

      // The reply text is drafted here (not by the planner) so a ticket always
      // gets a real answer instead of echoing its own prompt back.
      if (toolName === 'add_ticket_message' && !input.content) {
        const prior = toolResults.find(r => r.tool === 'get_ticket' && r.status === 'COMPLETED');
        const draft = await step('Ticket Reply', 'Draft customer response', { ticketId: payload.ticketId }, async () => {
          const response = await llm.chat([
            { role: 'system', content: `You are a support agent for a production tool. Draft a concise, helpful reply to the customer ticket. Follow the agent instructions: ${persona}. Return the reply text only — no preamble, no JSON.` },
            { role: 'user', content: JSON.stringify({ ticket: prior?.result ?? null, customerMessage: prompt }) }
          ]);
          return { output: { content: response.content }, tokens: response.tokens };
        });
        input.content = draft.content;
      }

      const result = await step('Tool Gateway', `Execute ${toolName}`, { tool: toolName, reason: call?.reason }, async () => {
        const value = await tool.execute(input, { user, runId, agentId: run.agentId ?? null });
        return { output: value };
      });
      toolResults.push({ tool: toolName, status: 'COMPLETED', result });
    }

    const synthesis = await step('Synthesizer', 'Generate evidence-backed result', { planner, toolResults }, async () => {
      const response = await llm.chat([
        { role: 'system', content: `You are the final answer stage of a production agent. Follow these rules: do not claim actions you did not execute; distinguish evidence from assumptions; mention missing information; be concise but useful. Agent instructions: ${persona}` },
        { role: 'user', content: JSON.stringify({ prompt, planner, toolResults }) }
      ]);
      return { output: { answer: response.content, confidence: (planner as any).risk === 'low' ? 'high' : 'review', plan: planner, toolResults }, tokens: response.tokens };
    });

    const latencyMs = Date.now() - started;
    const totalTokens = await deps.prisma.agentStep.aggregate({ where: { runId }, _sum: { tokens: true } });
    await deps.prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', output: jsonValue(synthesis), finishedAt: new Date(), latencyMs, tokenUsage: Number(totalTokens._sum.tokens ?? 0) }
    });
    deps.logger.info({ runId, latencyMs }, 'agent run completed');
    return { runId, status: 'COMPLETED', output: synthesis, latencyMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const latencyMs = Date.now() - started;
    await deps.prisma.agentRun.update({ where: { id: runId }, data: { status: 'FAILED', error: message, finishedAt: new Date(), latencyMs } });
    deps.logger.error({ runId, error: message }, 'agent run failed');
    throw error;
  }
}

export async function runSupportGraph(...args: any[]) {
  throw new Error('runSupportGraph is retired. Create an AgentRun and use executeAgentRun instead.');
}
