/**
 * Documentation and Architecture Pages for Ryuksaidso
 * 
 * Author: Faizan Hameed
 * Website: http://faizcasm.me
 */

import { Router } from 'express';

export const docsRouter = Router();

// Main documentation page
docsRouter.get('/docs', (req, res) => {
  res.json({
    title: 'Ryuksaidso Documentation',
    author: 'Faizan Hameed',
    website: 'http://faizcasm.me',
    version: '2.0.0',
    lastUpdated: '2026-09-21',
    sections: [
      {
        title: 'Getting Started',
        slug: 'getting-started',
        items: [
          { title: 'Introduction', url: '/docs/introduction' },
          { title: 'Quick Start', url: '/docs/quick-start' },
          { title: 'Installation', url: '/docs/installation' },
          { title: 'Environment Setup', url: '/docs/environment' },
        ],
      },
      {
        title: 'Core Concepts',
        slug: 'core-concepts',
        items: [
          { title: 'Agents & Workflows', url: '/docs/agents' },
          { title: 'Agent Versioning', url: '/docs/versioning' },
          { title: 'Tool Gateway', url: '/docs/tools' },
          { title: 'Approval System', url: '/docs/approvals' },
          { title: 'Evaluations', url: '/docs/evaluations' },
        ],
      },
      {
        title: 'API Reference',
        slug: 'api-reference',
        items: [
          { title: 'Authentication', url: '/docs/api/auth' },
          { title: 'Agents API', url: '/docs/api/agents' },
          { title: 'Runs API', url: '/docs/api/runs' },
          { title: 'Projects API', url: '/docs/api/projects' },
          { title: 'Admin API', url: '/docs/api/admin' },
        ],
      },
      {
        title: 'Advanced Features',
        slug: 'advanced',
        items: [
          { title: 'LangChain Integration', url: '/docs/langchain' },
          { title: 'LangGraph Workflows', url: '/docs/langgraph' },
          { title: 'MCP Tools', url: '/docs/mcp' },
        ],
      },
      {
        title: 'Deployment',
        slug: 'deployment',
        items: [
          { title: 'Docker Deployment', url: '/docs/deploy/docker' },
          { title: 'Kubernetes', url: '/docs/deploy/kubernetes' },
          { title: 'Production Checklist', url: '/docs/deploy/production' },
          { title: 'Monitoring & Alerts', url: '/docs/observability' },
        ],
      },
    ],
  });
});

// Architecture page
docsRouter.get('/architecture', (req, res) => {
  res.json({
    title: 'Ryuksaidso Architecture',
    author: 'Faizan Hameed',
    website: 'http://faizcasm.me',
    version: '2.0.0',
    architecture: {
      overview: {
        title: 'System Overview',
        description: 'Multi-tenant SaaS platform for AI agent reliability & control',
        components: [
          { name: 'Web UI', type: 'Next.js', purpose: 'Control plane interface' },
          { name: 'API Server', type: 'Express.js', purpose: 'RESTful API & auth' },
          { name: 'Agent Worker', type: 'BullMQ', purpose: 'Async agent execution' },
          { name: 'Database', type: 'PostgreSQL', purpose: 'Data persistence' },
          { name: 'Cache', type: 'Redis', purpose: 'Session & queue management' },
        ],
      },
      layers: [
        {
          name: 'Presentation Layer',
          technologies: ['Next.js 15', 'React 19', 'TypeScript'],
          components: [
            'Dashboard & analytics',
            'Agent configuration UI',
            'Run trace visualization',
            'Admin dashboard',
            'Settings & management',
          ],
        },
        {
          name: 'API Layer',
          technologies: ['Express.js', 'Zod', 'Helmet', 'CORS'],
          components: [
            'RESTful endpoints',
            'Authentication (JWT)',
            'Request validation',
            'Rate limiting',
            'Error handling',
          ],
        },
        {
          name: 'Business Logic Layer',
          technologies: ['Node.js', 'BullMQ', 'LangChain', 'LangGraph'],
          components: [
            'Agent orchestration',
            'Tool execution',
            'Approval workflows',
            'Evaluations',
          ],
        },
        {
          name: 'Data Layer',
          technologies: ['Prisma ORM', 'PostgreSQL', 'pgvector', 'Redis'],
          components: [
            'Agent definitions',
            'Run history & traces',
            'User & organization data',
            'Knowledge base',
            'Policy definitions',
            'Session management',
          ],
        },
      ],
      dataFlow: {
        title: 'Request Flow',
        steps: [
          'User authenticates via OAuth or credentials',
          'JWT tokens issued with CSRF protection',
          'API routes validate token and permissions',
          'RBAC checks enforce role-based access',
          'Requests queued in Redis/BullMQ for async processing',
          'Agent worker picks up jobs from queue',
          'LangGraph orchestrates planning → tool execution → synthesis',
          'Results stored in PostgreSQL with full history',
          'User notified of completion via polling',
        ],
      },
      agentRuntime: {
        title: 'Agent Runtime Architecture',
        flow: [
          {
            phase: 'Planning',
            tools: ['LangChain LLM', 'Prompt templates'],
            output: 'Execution plan with tool calls',
          },
          {
            phase: 'Tool Execution',
            tools: ['MCP Tool Gateway', 'Approval checks'],
            output: 'Tool results or approval requests',
          },
          {
            phase: 'Synthesis',
            tools: ['LangChain LLM', 'Response templates'],
            output: 'Final answer with confidence score',
          },
        ],
      },
      security: {
        title: 'Security Features',
        features: [
          { name: 'Authentication', description: 'JWT access tokens + rotating refresh tokens' },
          { name: 'Authorization', description: 'RBAC with OWNER/ADMIN/AGENT/VIEWER roles' },
          { name: 'CSRF Protection', description: 'Token-based protection on state-changing requests' },
          { name: 'SQL Injection', description: 'Parameterized queries via Prisma' },
          { name: 'Input Validation', description: 'Zod schemas on all endpoints' },
          { name: 'Password Security', description: 'bcrypt hashing with cost factor 12' },
          { name: 'API Keys', description: 'Hashed secrets with SHA-256' },
        ],
      },
      observability: {
        title: 'Observability Stack',
        components: [
          { name: 'Prometheus', description: 'Metrics collection' },
          { name: 'Grafana', description: 'Dashboards & visualization' },
          { name: 'Loki', description: 'Log aggregation' },
          { name: 'Promtail', description: 'Log shipping' },
        ],
        metrics: [
          'HTTP request rates & latencies',
          'Agent run success rates',
          'Queue depths & job latency',
          'Token usage & costs',
          'Database connection pool',
        ],
      },
    },
    architectureVisualization3D: {
      description: 'Interactive 3D visualization available at /architecture/visualize',
      viewOptions: ['Top-down', 'Side view', 'Rotating', 'Isometric'],
      clickableLayers: true,
      tools: [
        'Zoom: Scroll wheel',
        'Rotate: Left-click + drag',
        'Pan: Right-click + drag',
        'Reset: Double-click',
      ],
    },
  });
});

// Detailed architecture visualization
docsRouter.get('/architecture/visualize', (req, res) => {
  res.json({
    title: '3D Architecture Visualization',
    type: 'interactive',
    mode: 'WebGL',
    scene: {
      camera: { position: [0, 10, 20], lookAt: [0, 0, 0] },
      lights: [
        { type: 'ambient', intensity: 0.5 },
        { type: 'directional', position: [10, 20, 10], intensity: 1 },
      ],
    },
    layers: [
      {
        name: 'Presentation Layer',
        color: '#6366f1',
        position: [0, 0, 0],
        size: [5, 5, 5],
        description: 'Next.js Web UI',
        opacity: 0.8,
      },
      {
        name: 'API Layer',
        color: '#10b981',
        position: [0, -5, 0],
        size: [6, 3, 6],
        description: 'Express.js REST API',
        opacity: 0.7,
      },
      {
        name: 'Business Logic',
        color: '#f59e0b',
        position: [0, -10, 0],
        size: [7, 4, 7],
        description: 'LangChain & BullMQ',
        opacity: 0.6,
      },
      {
        name: 'Data Layer',
        color: '#ef4444',
        position: [0, -16, 0],
        size: [8, 6, 8],
        description: 'PostgreSQL + Redis',
        opacity: 0.5,
      },
    ],
    connections: [
      { from: 'Presentation Layer', to: 'API Layer', label: 'HTTP/REST' },
      { from: 'API Layer', to: 'Business Logic', label: 'BullMQ Jobs' },
      { from: 'Business Logic', to: 'Data Layer', label: 'Prisma ORM' },
    ],
  });
});

// Agent documentation
docsRouter.get('/docs/agents', (req, res) => {
  res.json({
    title: 'Agents & Workflows',
    description: 'Create, configure, and run AI agents on Ryuksaidso',
    agentTypes: [
      { name: 'Triage Agent', purpose: 'Classify and route support requests' },
      { name: 'Knowledge Agent', purpose: 'Retrieve organization knowledge' },
      { name: 'Research Agent', purpose: 'Investigate and gather information' },
      { name: 'Resolution Agent', purpose: 'Synthesize support responses' },
    ],
    lifecycle: {
      creation: 'Create with instructions and tools',
      versioning: 'Immutable version history',
      execution: 'Async via BullMQ queue',
      tracing: 'Full step-by-step trace',
    },
  });
});

// LangChain documentation
docsRouter.get('/docs/langchain', (req, res) => {
  res.json({
    title: 'LangChain Integration',
    description: 'Using LangChain for LLM orchestration',
    components: [
      'Chat models (OpenAI, Ollama)',
      'Prompt templates',
      'Memory management',
      'Tool calling',
    ],
    examples: [
      { title: 'Basic Chat', code: 'import { ChatOpenAI } from "@langchain/openai";' },
      { title: 'Prompt Templates', code: 'import { ChatPromptTemplate } from "@langchain/core/prompts";' },
      { title: 'Tool Calling', code: 'import { tool } from "@langchain/core/tools";' },
    ],
  });
});

// LangGraph documentation
docsRouter.get('/docs/langgraph', (req, res) => {
  res.json({
    title: 'LangGraph Workflows',
    description: 'State machine workflows for complex agent logic',
    patterns: [
      { name: 'Sequential', description: 'Planner → Tools → Synthesizer' },
      { name: 'StateGraph', description: 'Annotation-based state management' },
      { name: 'Conditional Edges', description: 'Dynamic routing based on state' },
      { name: 'Loops', description: 'Retry and iteration patterns' },
    ],
    codeExample: `import { Annotation, StateGraph } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

const workflow = new StateGraph(AgentState)
  .addNode("planner", plannerNode)
  .addNode("executor", executorNode)
  .addEdge("__start__", "planner")
  .addEdge("planner", "executor");
  
const graph = workflow.compile({ checkpointer: new MemorySaver() });`,
  });
});

// MCP documentation
docsRouter.get('/docs/mcp', (req, res) => {
  res.json({
    title: 'MCP (Model Calling Protocol)',
    description: 'Standardized tool calling interface',
    structure: {
      name: 'string',
      description: 'string',
      parameters: 'object',
      handler: 'async function',
    },
    security: {
      scope: 'tool:read|tool:write',
      approval: 'Optional human approval required',
    },
  });
});

// API endpoints
docsRouter.get('/docs/api/auth', (req, res) => {
  res.json({
    endpoints: [
      { path: '/auth/login', method: 'POST', description: 'User login' },
      { path: '/auth/register', method: 'POST', description: 'Create new user' },
      { path: '/auth/logout', method: 'POST', description: 'User logout' },
      { path: '/auth/refresh', method: 'POST', description: 'Refresh access token' },
      { path: '/auth/forgot-password', method: 'POST', description: 'Request password reset' },
      { path: '/auth/reset-password', method: 'POST', description: 'Reset password' },
    ],
  });
});

// Root endpoint
docsRouter.get('/', (req, res) => {
  res.json({
    redirect: '/docs',
    message: 'Ryuksaidso Documentation',
  });
});

export default docsRouter;