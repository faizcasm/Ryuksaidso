import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'ryuksaidso_' });

export const httpDuration = new client.Histogram({
  name: 'ryuksaidso_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

export const httpRequests = new client.Counter({
  name: 'ryuksaidso_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const
});

export const agentRuns = new client.Counter({
  name: 'ryuksaidso_agent_runs_total',
  help: 'Agent runs by terminal status',
  labelNames: ['status'] as const
});

export const agentDuration = new client.Histogram({
  name: 'ryuksaidso_agent_duration_seconds',
  help: 'Agent run duration in seconds',
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120]
});

export const metricsRegistry = client.register;
