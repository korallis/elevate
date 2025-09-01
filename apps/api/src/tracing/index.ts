/**
 * OpenTelemetry tracing exports for the Elev8 API
 */

export { initializeInstrumentation, shutdownInstrumentation } from './instrumentation.js';
export { initializeExporter, OBSERVABILITY_CONFIGS } from './exporter.js';
export { 
  tracer, 
  createDatabaseSpan, 
  createHttpSpan, 
  createBusinessSpan,
  traceAsyncFunction,
  traceSyncFunction 
} from './tracer.js';
export { 
  tracingMiddleware, 
  customSpanMiddleware,
  userContextMiddleware,
  databaseContextMiddleware 
} from './middleware.js';