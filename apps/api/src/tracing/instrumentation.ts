import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { initializeExporter } from './exporter.js';

/**
 * Initialize OpenTelemetry instrumentation
 * This should be called before any other imports in the application
 */
export function initializeInstrumentation(): void {
  const exporter = initializeExporter();

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'elev8-api',
      [ATTR_SERVICE_VERSION]: '1.0.0',
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Enable specific instrumentations
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          requestHook: (span, request) => {
            // Add custom attributes to HTTP spans
            if (request.url) {
              const url = new URL(request.url, `http://${request.headers.host}`);
              span.setAttributes({
                'http.route': url.pathname,
                'http.query': url.search,
              });
            }
          },
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
          enhancedDatabaseReporting: true,
        },
        '@opentelemetry/instrumentation-redis': {
          enabled: true,
          dbStatementSerializer: (cmdName, cmdArgs) => {
            return `${cmdName} ${cmdArgs.join(' ')}`;
          },
        },
        '@opentelemetry/instrumentation-mysql2': {
          enabled: true,
          enhancedDatabaseReporting: true,
        },
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Usually too noisy
        },
        '@opentelemetry/instrumentation-dns': {
          enabled: false, // Usually too noisy
        },
      }),
    ],
  });

  // Initialize the SDK
  sdk.start();

  // Handle process exit
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(
        () => console.log('OpenTelemetry shut down successfully'),
        (err) => console.error('Error shutting down OpenTelemetry', err)
      )
      .finally(() => process.exit(0));
  });

  console.log('OpenTelemetry instrumentation initialized');
}

/**
 * Gracefully shutdown instrumentation
 */
export function shutdownInstrumentation(): Promise<void> {
  // This would be called by the NodeSDK's shutdown method
  return Promise.resolve();
}