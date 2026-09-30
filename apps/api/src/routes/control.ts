
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { prisma } from '../lib/db';
import { audit, type AuthUser } from '../lib/auth';
import { enqueueRun } from '../services/queue';
import {
  createAgentSchema,
  createProjectSchema,
  createPolicySchema,
  createRunSchema,
  createVersionSchema,
  updateAgentSchema,
  updatePolicySchema,
  updateProjectSchema,
} from '../validation';
import type { Prisma } from '@prisma/client';

export const controlRouter = Router();

controlRouter.use(requireAuth);

function auth(req: AuthenticatedRequest): AuthUser {
  if (!req.user) {
    throw new Error('Authenticated user missing');
  }

  return req.user;
}

function requireRole(u: AuthUser, roles: string[]) {
  if (!roles.includes(u.role)) {
    throw Object.assign(
      new Error('Insufficient permissions'),
      { statusCode: 403 },
    );
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}



controlRouter.get('/dashboard', async (req, res) => {
  const u = auth(req as AuthenticatedRequest);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    projects,
    agents,
    runs24,
    pendingApprovals,
    documents,
    latestRuns,
    evaluations,
    failed,
    organization,
  ] = await Promise.all([
    prisma.project.findMany({
      where: {
        organizationId: u.organizationId,
      },
      include: {
        _count: {
          select: {
            agents: true,
            runs: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    }),

    prisma.agent.findMany({
      where: {
        organizationId: u.organizationId,
      },
      include: {
        project: true,
        _count: {
          select: {
            runs: true,
            versions: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),

    prisma.agentRun.findMany({
      where: {
        organizationId: u.organizationId,
        createdAt: {
          gte: since,
        },
      },
      select: {
        status: true,
        latencyMs: true,
        tokenUsage: true,
        createdAt: true,
      },
    }),

    prisma.approval.count({
      where: {
        organizationId: u.organizationId,
        status: 'PENDING',
      },
    }),

    prisma.document.count({
      where: {
        organizationId: u.organizationId,
      },
    }),

    prisma.agentRun.findMany({
      where: {
        organizationId: u.organizationId,
      },
      include: {
        agent: {
          select: {
            name: true,
          },
        },
        project: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 8,
    }),

    prisma.evaluation.findMany({
      where: {
        organizationId: u.organizationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    }),

    prisma.agentRun.count({
      where: {
        organizationId: u.organizationId,
        status: 'FAILED',
        createdAt: {
          gte: since,
        },
      },
    }),

    prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider: true, ollamaModel: true, omnirouteModel: true } }),
  ]);

  const terminal = runs24.filter(
    (r) =>
      r.status === 'COMPLETED' ||
      r.status === 'FAILED',
  );

  const completed = runs24.filter(
    (r) => r.status === 'COMPLETED',
  ).length;

  const successRate = terminal.length
    ? completed / terminal.length
    : 0;

  const latencies = runs24
    .map((r) => r.latencyMs)
    .filter(
      (v): v is number => typeof v === 'number',
    )
    .sort((a, b) => a - b);

  const p95 = latencies.length
    ? latencies[
        Math.min(
          latencies.length - 1,
          Math.ceil(latencies.length * 0.95) - 1,
        )
      ]
    : 0;

  const latestEval = evaluations[0] as any;

  res.json({
    metrics: {
      runs24h: runs24.length,
      successRate,
      p95LatencyMs: p95,
      failed24h: failed,
      pendingApprovals,
      documents,
      provider: organization?.llmProvider ?? 'OLLAMA',
      model: organization?.llmProvider === 'OMNIROUTE' ? organization.omnirouteModel : organization?.ollamaModel,
    },

    projects,
    agents,
    latestRuns,

    latestEvaluation: latestEval
      ? {
          id: latestEval.id,
          name: latestEval.name,
          score: Number(
            latestEval.results?.score ?? 0,
          ),
          createdAt: latestEval.createdAt,
        }
      : null,
  });
});



controlRouter.get('/projects', async (req, res) => {
  const u = auth(req as AuthenticatedRequest);

  const projects = await prisma.project.findMany({
    where: {
      organizationId: u.organizationId,
    },
    include: {
      agents: {
        select: {
          id: true,
          name: true,
          slug: true,
          enabled: true,
        },
      },
      _count: {
        select: {
          runs: true,
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  res.json(projects);
});


controlRouter.post('/projects', async (req, res, next) => {
  try {
    const u = auth(req as AuthenticatedRequest);

    requireRole(u, ['OWNER', 'ADMIN']);

    const body = createProjectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        organizationId: u.organizationId,
        ...body,
      },
    });

    await audit(
      u,
      'project.created',
      'project',
      project.id,
    );

    res.status(201).json(project);
  } catch (e) {
    next(e);
  }
});


controlRouter.patch(
  '/projects/:id',
  async (req, res, next) => {
    try {
      const u = auth(req as AuthenticatedRequest);

      requireRole(u, ['OWNER', 'ADMIN']);

      const body =
        updateProjectSchema.parse(req.body);

      const existing =
        await prisma.project.findFirst({
          where: {
            id: req.params.id,
            organizationId: u.organizationId,
          },
        });

      if (!existing) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Project not found',
        });
      }

      const project = await prisma.project.update({
        where: {
          id: existing.id,
        },
        data: body,
      });

      await audit(
        u,
        'project.updated',
        'project',
        project.id,
        body,
      );

      res.json(project);
    } catch (e) {
      next(e);
    }
  },
);



controlRouter.get('/agents', async (req, res) => {
  const u = auth(req as AuthenticatedRequest);

  const agents = await prisma.agent.findMany({
    where: {
      organizationId: u.organizationId,
    },
    include: {
      project: true,
      versions: {
        orderBy: {
          version: 'desc',
        },
        take: 5,
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  res.json(agents);
});


controlRouter.post('/agents', async (req, res, next) => {
  try {
    const u = auth(req as AuthenticatedRequest);

    requireRole(u, ['OWNER', 'ADMIN']);

    const body =
      createAgentSchema.parse(req.body);

    const projectId =
      body.projectId ??
      (
        await prisma.project.findFirst({
          where: {
            organizationId: u.organizationId,
            status: 'ACTIVE',
          },
          orderBy: {
            createdAt: 'asc',
          },
        })
      )?.id;

    if (!projectId) {
      return res.status(400).json({
        error: 'ValidationError',
        message:
          'Create a project before creating an agent',
      });
    }

    const project =
      await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: u.organizationId,
        },
      });

    if (!project) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Project not found',
      });
    }

    const agent = await prisma.agent.create({
      data: {
        organizationId: u.organizationId,
        projectId,
        name: body.name,
        slug: body.slug,
        instructions: body.instructions,
        systemPrompt: body.systemPrompt || null,
        tools: body.tools,
      },
    });

    const version =
      await prisma.agentVersion.create({
        data: {
          agentId: agent.id,
          version: 1,

          config: json({
            instructions: body.instructions,
            systemPrompt: body.systemPrompt || null,
            tools: body.tools,
            temperature: 0.1,
          }),

          createdBy: u.id,
          publishedAt: new Date(),
          changelog: 'Initial version',
        },
      });

    await audit(
      u,
      'agent.created',
      'agent',
      agent.id,
      {
        versionId: version.id,
      },
    );

    res.status(201).json({
      ...agent,
      version,
    });
  } catch (e) {
    next(e);
  }
});


controlRouter.patch(
  '/agents/:id',
  async (req, res, next) => {
    try {
      const u = auth(req as AuthenticatedRequest);

      requireRole(u, ['OWNER', 'ADMIN']);

      const body =
        updateAgentSchema.parse(req.body);

      const agent =
        await prisma.agent.findFirst({
          where: {
            id: req.params.id,
            organizationId: u.organizationId,
          },
        });

      if (!agent) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Agent not found',
        });
      }

      if (body.projectId) {
        const project =
          await prisma.project.findFirst({
            where: {
              id: body.projectId,
              organizationId: u.organizationId,
            },
          });

        if (!project) {
          return res.status(404).json({
            error: 'NotFound',
            message: 'Project not found',
          });
        }
      }

      const updated =
        await prisma.agent.update({
          where: {
            id: agent.id,
          },
          data: body,
        });

      await audit(
        u,
        'agent.updated',
        'agent',
        agent.id,
        body,
      );

      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);


controlRouter.post(
  '/agents/:id/versions',
  async (req, res, next) => {
    try {
      const u = auth(req as AuthenticatedRequest);

      requireRole(u, ['OWNER', 'ADMIN']);

      const body =
        createVersionSchema.parse(req.body);

      const agent =
        await prisma.agent.findFirst({
          where: {
            id: req.params.id,
            organizationId: u.organizationId,
          },
        });

      if (!agent) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Agent not found',
        });
      }

      const latest =
        await prisma.agentVersion.findFirst({
          where: {
            agentId: agent.id,
          },
          orderBy: {
            version: 'desc',
          },
        });

      const version =
        await prisma.agentVersion.create({
          data: {
            agentId: agent.id,
            version: (latest?.version ?? 0) + 1,

            config: json(
              body.config ?? {
                instructions: agent.instructions,
                tools: agent.tools ?? [],
              },
            ),

            createdBy: u.id,
            changelog: body.changelog,
            publishedAt: body.publish
              ? new Date()
              : null,
          },
        });

      if (
        body.publish &&
        agent.projectId
      ) {
        await prisma.project.update({
          where: {
            id: agent.projectId,
          },
          data: {
            productionVersion:
              `${agent.slug}@v${version.version}`,
          },
        });
      }

      await audit(
        u,
        'agent.version_created',
        'agent',
        agent.id,
        {
          version: version.version,
          published: body.publish,
        },
      );

      res.status(201).json(version);
    } catch (e) {
      next(e);
    }
  },
);



controlRouter.get('/runs', async (req, res) => {
  const u = auth(req as AuthenticatedRequest);

  const limit = Math.min(
    Math.max(
      Number(req.query.limit) || 50,
      1,
    ),
    200,
  );

  const where: any = {
    organizationId: u.organizationId,
  };

  if (
    typeof req.query.status === 'string'
  ) {
    where.status = req.query.status;
  }

  if (
    typeof req.query.projectId === 'string'
  ) {
    where.projectId = req.query.projectId;
  }

  const runs =
    await prisma.agentRun.findMany({
      where,

      include: {
        agent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },

        project: {
          select: {
            id: true,
            name: true,
          },
        },

        agentVersion: {
          select: {
            version: true,
          },
        },

        steps: {
          orderBy: {
            stepIndex: 'asc',
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },

      take: limit,
    });

  res.json(runs);
});


controlRouter.get(
  '/runs/:id',
  async (req, res) => {
    const u = auth(req as AuthenticatedRequest);

    const run =
      await prisma.agentRun.findFirst({
        where: {
          id: req.params.id,
          organizationId: u.organizationId,
        },

        include: {
          agent: true,
          agentVersion: true,
          project: true,

          steps: {
            orderBy: {
              stepIndex: 'asc',
            },
          },

          approvals: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

    if (!run) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Run not found',
      });
    }

    res.json(run);
  },
);


controlRouter.post(
  '/runs',
  async (req, res, next) => {
    try {
      const u = auth(req as AuthenticatedRequest);

      requireRole(
        u,
        ['OWNER', 'ADMIN', 'AGENT'],
      );

      const body =
        createRunSchema.parse(req.body);

      const agent =
        await prisma.agent.findFirst({
          where: {
            id: body.agentId,
            organizationId: u.organizationId,
          },

          include: {
            project: true,

            versions: {
              orderBy: {
                version: 'desc',
              },
              take: 1,
            },
          },
        });

      if (!agent) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Agent not found',
        });
      }

      if (!agent.enabled) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Agent is disabled',
        });
      }

      if (
        body.projectId &&
        agent.projectId &&
        agent.projectId !== body.projectId
      ) {
        return res.status(400).json({
          error: 'ValidationError',
          message:
            'Agent does not belong to selected project',
        });
      }

      const projectId =
        body.projectId ?? agent.projectId;

      const organization = await prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider: true, ollamaModel: true, omnirouteModel: true } });
      const provider = body.provider ?? organization?.llmProvider ?? 'OLLAMA';
      const envModel = provider === 'OMNIROUTE' ? process.env.OMNIROUTE_MODEL : process.env.OLLAMA_MODEL;
      const configuredModel = (provider === 'OMNIROUTE' ? organization?.omnirouteModel : organization?.ollamaModel) || envModel || '';
      if (!configuredModel) return res.status(409).json({ error:'ProviderNotConfigured', message:`${provider} has no model configured for this workspace. Configure it in Settings.` });

      const version =
        agent.versions[0];

      const run =
        await prisma.agentRun.create({
          data: {
            organizationId:
              u.organizationId,

            projectId,

            agentId:
              agent.id,

            agentVersionId:
              version?.id,

            provider: provider as any,

            status:
              'QUEUED',

            trigger:
              body.trigger,

            environment:
              body.environment,

            input: json({
              prompt:
                body.prompt,

              metadata:
                body.metadata ?? {},
            }),
          },
        });

      const job =
        await enqueueRun(
          run.id,
          u.organizationId,
          u,
        );

      await audit(
        u,
        'run.queued',
        'agent_run',
        run.id,
        {
          agentId: agent.id,
          jobId: job.id,
        },
      );

      res.status(202).json({
        runId: run.id,
        jobId: job.id,
      });
    } catch (e) {
      next(e);
    }
  },
);


controlRouter.post(
  '/runs/:id/retry',
  async (req, res, next) => {
    try {
      const u = auth(req as AuthenticatedRequest);

      requireRole(
        u,
        ['OWNER', 'ADMIN', 'AGENT'],
      );

      const run =
        await prisma.agentRun.findFirst({
          where: {
            id: req.params.id,
            organizationId: u.organizationId,
          },
        });

      if (!run) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Run not found',
        });
      }

      const retried =
        await prisma.agentRun.create({
          data: {
            organizationId:
              u.organizationId,

            projectId:
              run.projectId,

            agentId:
              run.agentId,

            agentVersionId:
              run.agentVersionId,

            provider: run.provider,

            status:
              'QUEUED',

            trigger:
              'retry',

            environment:
              run.environment,

            input:
              json(run.input),
          },
        });

      await enqueueRun(
        retried.id,
        u.organizationId,
        u,
      );

      await audit(
        u,
        'run.retried',
        'agent_run',
        retried.id,
        {
          sourceRunId: run.id,
        },
      );

      res.status(202).json({
        runId: retried.id,
      });
    } catch (e) {
      next(e);
    }
  },
);



controlRouter.get(
  '/policies',
  async (req, res) => {
    const u = auth(req as AuthenticatedRequest);

    const policies =
      await prisma.policy.findMany({
        where: {
          organizationId:
            u.organizationId,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    res.json(policies);
  },
);


controlRouter.post(
  '/policies',
  async (req, res, next) => {
    try {
      const u = auth(req as AuthenticatedRequest);

      requireRole(
        u,
        ['OWNER', 'ADMIN'],
      );

      const body =
        createPolicySchema.parse(req.body);

      const policy =
        await prisma.policy.create({
          data: {
            organizationId:
              u.organizationId,

            ...body,

            conditions:
              body.conditions
                ? json(body.conditions)
                : undefined,
          },
        });

      await audit(
        u,
        'policy.created',
        'policy',
        policy.id,
      );

      res.status(201).json(policy);
    } catch (e) {
      next(e);
    }
  },
);


controlRouter.patch(
  '/policies/:id',
  async (req, res, next) => {
    try {
      const u = auth(req as AuthenticatedRequest);

      requireRole(
        u,
        ['OWNER', 'ADMIN'],
      );

      const body =
        updatePolicySchema.parse(req.body);

      const policy =
        await prisma.policy.findFirst({
          where: {
            id: req.params.id,
            organizationId:
              u.organizationId,
          },
        });

      if (!policy) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Policy not found',
        });
      }

      const updated =
        await prisma.policy.update({
          where: {
            id: policy.id,
          },

          data: {
            ...body,

            conditions:
              body.conditions
                ? json(body.conditions)
                : body.conditions,
          },
        });

      await audit(
        u,
        'policy.updated',
        'policy',
        policy.id,
        body,
      );

      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);



controlRouter.get(
  '/tools',
  (_req, res) =>
    res.json([
      {
        name: 'search_knowledge',
        scope: 'knowledge:read',
        risk: 'read',
        description:
          'Search tenant-scoped knowledge.',
      },

      {
        name: 'get_ticket',
        scope: 'ticket:read',
        risk: 'read',
        description:
          'Read ticket context.',
      },

      {
        name: 'add_ticket_message',
        scope: 'ticket:write',
        risk: 'write',
        description:
          'Write a ticket message and require human approval.',
      },
    ]),
);

