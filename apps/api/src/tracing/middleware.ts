import type { Context, Next } from 'hono';
import { createHttpSpan } from './tracer.js';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

/**
 * Hono middleware for OpenTelemetry tracing
 * Automatically creates spans for all HTTP requests
 */
export function tracingMiddleware() {
  return async (c: Context, next: Next) => {
    const method = c.req.method;
    const path = c.req.path;
    const startTime = Date.now();

    // Create HTTP span
    const { span, setStatusCode, setError, end } = createHttpSpan(method, path);

    // Add request attributes
    span.setAttributes({
      'http.url': c.req.url,
      'http.user_agent': c.req.header('user-agent') || '',
      'http.request.content_length': c.req.header('content-length') || '0',
      'elev8.request.id': crypto.randomUUID(),
    });

    // Run the request in the span context
    try {
      await context.with(trace.setSpan(context.active(), span), async () => {
        await next();
      });

      // Set response attributes
      const responseTime = Date.now() - startTime;
      const statusCode = c.res.status;

      span.setAttributes({
        'http.response.status_code': statusCode,
        'http.response.content_length': c.res.headers.get('content-length') || '0',
        'elev8.response.time_ms': responseTime,
      });

      setStatusCode(statusCode);

      // Add performance metrics
      if (responseTime > 1000) {
        span.addEvent('slow_request', {
          'response_time_ms': responseTime,
          'threshold_ms': 1000,
        });
      }

    } catch (error) {
      // Handle errors
      if (error instanceof Error) {
        setError(error);
        span.setAttributes({
          'error.name': error.name,
          'error.message': error.message,
          'error.stack': error.stack || '',
        });
      }
      
      throw error; // Re-throw to maintain normal error handling
    } finally {
      end();
    }
  };
}

/**
 * Custom span middleware for specific routes
 * Allows adding custom attributes and events to spans
 */
export function customSpanMiddleware(
  spanName?: string,
  getAttributes?: (c: Context) => Record<string, string | number | boolean>
) {
  return async (c: Context, next: Next) => {
    const activeSpan = trace.getActiveSpan();
    
    if (activeSpan && spanName) {
      // Create a child span with custom name
      const childSpan = trace.getTracer('elev8-api').startSpan(spanName, {
        parent: activeSpan,
      });

      // Add custom attributes if provided
      if (getAttributes) {
        try {
          const attributes = getAttributes(c);
          childSpan.setAttributes(attributes);
        } catch (error) {
          console.warn('Failed to get custom attributes for span:', error);
        }
      }

      try {
        await context.with(trace.setSpan(context.active(), childSpan), async () => {
          await next();
        });
      } catch (error) {
        if (error instanceof Error) {
          childSpan.recordException(error);
          childSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
        }
        throw error;
      } finally {
        childSpan.end();
      }
    } else {
      await next();
    }
  };
}

/**
 * Middleware to add user context to spans
 */
export function userContextMiddleware() {
  return async (c: Context, next: Next) => {
    const activeSpan = trace.getActiveSpan();
    
    if (activeSpan) {
      // Extract user information from auth context
      const authHeader = c.req.header('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          // Decode JWT to get user info (implementation depends on your auth system)
          const token = authHeader.slice(7);
          // Add user attributes to span
          activeSpan.setAttributes({
            'user.authenticated': true,
            'user.token.present': true,
          });
        } catch (error) {
          activeSpan.setAttributes({
            'user.authenticated': false,
            'user.auth.error': error instanceof Error ? error.message : 'Unknown error',
          });
        }
      } else {
        activeSpan.setAttributes({
          'user.authenticated': false,
        });
      }
    }

    await next();
  };
}

/**
 * Middleware to add database operation context
 */
export function databaseContextMiddleware() {
  return async (c: Context, next: Next) => {
    const activeSpan = trace.getActiveSpan();
    
    if (activeSpan) {
      // Add database connection info
      activeSpan.setAttributes({
        'db.connection_pool.active': true,
        'db.connection_pool.name': 'main',
      });
    }

    await next();
  };
}