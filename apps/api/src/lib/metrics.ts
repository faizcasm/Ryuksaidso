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

export const billingEvents = new client.Counter({
  name: 'ryuksaidso_billing_events_total',
  help: 'Billing lifecycle events by type',
  labelNames: ['event'] as const
});

export const billingEntitlementDenials = new client.Counter({
  name: 'ryuksaidso_billing_entitlement_denials_total',
  help: 'Entitlement denials by feature',
  labelNames: ['feature'] as const
});

export const billingWebhookDuration = new client.Histogram({
  name: 'ryuksaidso_billing_webhook_duration_seconds',
  help: 'Billing webhook processing duration in seconds',
  labelNames: ['event', 'outcome'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

export async function billingMetricSnapshot() {
  const json = await metricsRegistry.getMetricsAsJSON();
  const read = (name: string) => {
    const metric = json.find(x => x.name === name) as { values?: Array<{ value: number; labels?: Record<string, string> }> } | undefined;
    if (!metric?.values) return [];
    return metric.values.map(v => ({ value: v.value, labels: v.labels ?? {} }));
  };
  return {
    events: read('ryuksaidso_billing_events_total'),
    entitlementDenials: read('ryuksaidso_billing_entitlement_denials_total'),
  };
}
