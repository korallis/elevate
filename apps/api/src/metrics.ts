import client from 'prom-client';

// Create a dedicated registry to avoid polluting global
export const registry = new client.Registry();

// Default metrics (process, event loop, memory)
client.collectDefaultMetrics({ register: registry, prefix: 'elev8_' });

// HTTP request duration histogram
export const httpDuration = new client.Histogram({
  name: 'elev8_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [registry],
  buckets: [0.05, 0.1, 0.2, 0.4, 0.8, 1, 2, 5, 10],
});

// HTTP request counter
export const httpRequests = new client.Counter({
  name: 'elev8_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [registry],
});

// Exporter success/failure
export const exporterSuccess = new client.Counter({
  name: 'elev8_export_success_total',
  help: 'Successful exports count by format',
  labelNames: ['format'] as const,
  registers: [registry],
});

export const exporterFailure = new client.Counter({
  name: 'elev8_export_failure_total',
  help: 'Failed exports count by format',
  labelNames: ['format'] as const,
  registers: [registry],
});

export function metricsMiddleware() {
  return async (c: any, next: any) => {
    const start = process.hrtime.bigint();
    try {
      await next();
    } finally {
      try {
        const end = process.hrtime.bigint();
        const durationSec = Number(end - start) / 1e9;
        const method = c.req.method;
        // Use route path if available, else raw path
        const path = c.req.path || c.req.url || 'unknown';
        const status = String(c.res?.status ?? 0);
        httpDuration.labels(method, path, status).observe(durationSec);
        httpRequests.labels(method, path, status).inc();
      } catch {
        // ignore metrics errors
      }
    }
  };
}

