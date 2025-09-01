import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

/**
 * OpenTelemetry tracer instance for the Elev8 API
 */
export const tracer = trace.getTracer('elev8-api', '1.0.0');

/**
 * Creates a span for database operations
 */
export function createDatabaseSpan(
  operationName: string,
  dbType: string,
  query?: string
) {
  const span = tracer.startSpan(`db.${operationName}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': dbType,
      'db.operation': operationName,
      ...(query && { 'db.statement': query }),
    },
  });

  return {
    span,
    setError: (error: Error) => {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    },
    end: () => span.end(),
  };
}

/**
 * Creates a span for HTTP operations
 */
export function createHttpSpan(
  method: string,
  path: string,
  statusCode?: number
) {
  const span = tracer.startSpan(`HTTP ${method} ${path}`, {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': method,
      'http.target': path,
      ...(statusCode && { 'http.status_code': statusCode }),
    },
  });

  return {
    span,
    setStatusCode: (code: number) => {
      span.setAttributes({ 'http.status_code': code });
      if (code >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${code}`,
        });
      }
    },
    setError: (error: Error) => {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    },
    end: () => span.end(),
  };
}

/**
 * Creates a span for business logic operations
 */
export function createBusinessSpan(operationName: string, attributes?: Record<string, string | number | boolean>) {
  const span = tracer.startSpan(operationName, {
    kind: SpanKind.INTERNAL,
    attributes,
  });

  return {
    span,
    addEvent: (name: string, eventAttributes?: Record<string, string | number | boolean>) => {
      span.addEvent(name, eventAttributes);
    },
    setAttributes: (attrs: Record<string, string | number | boolean>) => {
      span.setAttributes(attrs);
    },
    setError: (error: Error) => {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    },
    end: () => span.end(),
  };
}

/**
 * Wraps an async function with tracing
 */
export function traceAsyncFunction<T extends unknown[], R>(
  name: string,
  fn: (...args: T) => Promise<R>,
  getAttributes?: (...args: T) => Record<string, string | number | boolean>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const attributes = getAttributes ? getAttributes(...args) : undefined;
    const { span, setError, end } = createBusinessSpan(name, attributes);

    try {
      const result = await fn(...args);
      end();
      return result;
    } catch (error) {
      if (error instanceof Error) {
        setError(error);
      }
      end();
      throw error;
    }
  };
}

/**
 * Wraps a synchronous function with tracing
 */
export function traceSyncFunction<T extends unknown[], R>(
  name: string,
  fn: (...args: T) => R,
  getAttributes?: (...args: T) => Record<string, string | number | boolean>
): (...args: T) => R {
  return (...args: T): R => {
    const attributes = getAttributes ? getAttributes(...args) : undefined;
    const { span, setError, end } = createBusinessSpan(name, attributes);

    try {
      const result = fn(...args);
      end();
      return result;
    } catch (error) {
      if (error instanceof Error) {
        setError(error);
      }
      end();
      throw error;
    }
  };
}