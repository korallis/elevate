import { Context, Next } from 'hono';
import { logger } from '../logger.js';
import { cacheManager } from '../cache/cache-manager.js';
import { CacheKeyGenerator, extractTableDeps } from '../cache/cache-key-generator.js';
import { cacheInvalidator } from '../cache/cache-invalidator.js';
import { getActorKey } from '../budget.js';

export interface CacheMiddlewareOptions {
  ttl?: number;
  keyPrefix?: string;
  includePaths?: string[];
  excludePaths?: string[];
  bypassHeader?: string;
  cacheHeaders?: boolean;
  compressResponse?: boolean;
  onlySuccessful?: boolean;
}

export interface CachedResponse {
  data: unknown;
  headers: Record<string, string>;
  status: number;
  timestamp: number;
  ttl: number;
}

/**
 * Cache middleware for HTTP responses
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const {
    ttl = 3600,
    keyPrefix = 'http',
    includePaths = [],
    excludePaths = ['/health', '/cache', '/auth'],
    bypassHeader = 'x-cache-bypass',
    cacheHeaders = true,
    compressResponse = true,
    onlySuccessful = true,
  } = options;

  return async (c: Context, next: Next) => {
    const method = c.req.method;
    const pathname = new URL(c.req.url).pathname;

    // Only cache GET requests
    if (method !== 'GET') {
      return next();
    }

    // Check if path should be cached
    if (!shouldCache(pathname, includePaths, excludePaths)) {
      return next();
    }

    // Check for cache bypass header
    if (c.req.header(bypassHeader)) {
      c.header('X-Cache-Bypass', 'true');
      return next();
    }

    const startTime = Date.now();
    const cacheKey = generateHttpCacheKey(c, keyPrefix);

    try {
      // Try to get cached response
      const cached = await cacheManager.get<CachedResponse>(cacheKey);

      if (cached) {
        const age = Math.floor((Date.now() - cached.timestamp) / 1000);
        const remainingTtl = Math.max(0, cached.ttl - age);

        if (remainingTtl > 0) {
          // Set cache headers
          if (cacheHeaders) {
            c.header('X-Cache-Hit', 'true');
            c.header('X-Cache-Age', age.toString());
            c.header('X-Cache-TTL', remainingTtl.toString());
            c.header('Cache-Control', `max-age=${remainingTtl}`);
          }

          // Restore original headers
          Object.entries(cached.headers).forEach(([key, value]) => {
            c.header(key, value);
          });

          logger.debug(
            {
              cacheKey,
              age,
              remainingTtl,
              responseTime: Date.now() - startTime,
              event: 'cache_hit',
            },
            'Cache hit for HTTP request',
          );

          return c.json(cached.data, cached.status);
        }
      }

      // Cache miss - execute request and cache response
      await next();

      // Only cache successful responses if configured
      const status = c.res.status;
      if (onlySuccessful && (status < 200 || status >= 300)) {
        return;
      }

      // Extract response data
      const responseData = await extractResponseData(c);
      if (!responseData) {
        return;
      }

      // Prepare cached response
      const cachedResponse: CachedResponse = {
        data: responseData,
        headers: extractHeaders(c),
        status,
        timestamp: Date.now(),
        ttl,
      };

      // Determine table dependencies from request
      const tableDependencies = extractTableDependenciesFromRequest(c);
      const tags = generateCacheTags(c);

      // Cache the response
      await cacheManager.set(cacheKey, cachedResponse, {
        ttl,
        compress: compressResponse,
        tableDependencies,
        tags,
      });

      // Set cache headers
      if (cacheHeaders) {
        c.header('X-Cache-Miss', 'true');
        c.header('X-Cache-TTL', ttl.toString());
        c.header('Cache-Control', `max-age=${ttl}`);
      }

      logger.debug(
        {
          cacheKey,
          status,
          tableDependencies,
          tags,
          responseTime: Date.now() - startTime,
          event: 'cache_miss_stored',
        },
        'Response cached after cache miss',
      );
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          cacheKey,
          pathname,
          event: 'cache_middleware_error',
        },
        'Error in cache middleware',
      );

      // Continue without caching on error
      if (!c.res.status || c.res.status === 200) {
        await next();
      }
    }
  };
}

/**
 * Middleware to handle cache invalidation on data modifications
 */
export function invalidationMiddleware() {
  return async (c: Context, next: Next) => {
    const method = c.req.method;

    // Only handle modification requests
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      return next();
    }

    const pathname = new URL(c.req.url).pathname;

    // Execute the request first
    await next();

    // Only invalidate on successful responses
    const status = c.res.status;
    if (status < 200 || status >= 300) {
      return;
    }

    try {
      // Determine what data was modified based on the endpoint
      const invalidationInfo = extractInvalidationInfo(pathname, c);

      if (invalidationInfo) {
        await processInvalidation(invalidationInfo, c);
      }
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          pathname,
          method,
          event: 'invalidation_middleware_error',
        },
        'Error in invalidation middleware',
      );
    }
  };
}

/**
 * Middleware to add cache-related headers to responses
 */
export function cacheHeadersMiddleware() {
  return async (c: Context, next: Next) => {
    await next();

    // Add cache-related headers
    c.header('X-Cache-Enabled', 'true');
    c.header('Vary', 'Authorization, Accept-Encoding');
  };
}

// Helper functions

function shouldCache(pathname: string, includePaths: string[], excludePaths: string[]): boolean {
  // Check exclusions first
  if (excludePaths.some((path) => pathname.startsWith(path))) {
    return false;
  }

  // If include paths are specified, only cache those
  if (includePaths.length > 0) {
    return includePaths.some((path) => pathname.startsWith(path));
  }

  // Default caching for common data endpoints
  const cacheable = [
    '/snowflake/',
    '/catalog/',
    '/transformations/',
    '/dashboards/',
    '/semantic/',
    '/explore/',
  ];

  return cacheable.some((path) => pathname.startsWith(path));
}

function generateHttpCacheKey(c: Context, prefix: string): string {
  const url = new URL(c.req.url);
  const pathname = url.pathname;
  const query = url.searchParams;
  const userId = getActorKey(c.req.raw.headers);

  // Sort query parameters for consistent keys
  const sortedQuery = Array.from(query.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(',');

  const parts = [
    prefix,
    'path:' + pathname.replace(/\//g, '_'),
    sortedQuery ? 'query:' + sortedQuery : '',
    userId ? 'user:' + userId : '',
  ].filter(Boolean);

  return parts.join(':');
}

async function extractResponseData(c: Context): Promise<unknown> {
  try {
    if (!c.res.body) return null;

    const contentType = c.res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return null; // Only cache JSON responses
    }

    // Clone the response to read the body
    const cloned = c.res.clone();
    const text = await cloned.text();

    return JSON.parse(text);
  } catch (error) {
    logger.warn(
      {
        error: (error as Error).message,
        event: 'extract_response_data_error',
      },
      'Failed to extract response data for caching',
    );
    return null;
  }
}

function extractHeaders(c: Context): Record<string, string> {
  const headers: Record<string, string> = {};
  const importantHeaders = ['content-type', 'content-encoding', 'etag', 'last-modified'];

  importantHeaders.forEach((header) => {
    const value = c.res.headers.get(header);
    if (value) {
      headers[header] = value;
    }
  });

  return headers;
}

function extractTableDependenciesFromRequest(c: Context): string[] {
  const pathname = new URL(c.req.url).pathname;
  const query = new URL(c.req.url).searchParams;
  const dependencies: string[] = [];

  // Extract from common query parameters
  const database = query.get('database');
  const schema = query.get('schema');
  const table = query.get('table');

  if (database && schema) {
    if (table) {
      dependencies.push(`${database}.${schema}.${table}`);
    } else {
      dependencies.push(`${database}.${schema}.*`);
    }
  }

  // Extract from path patterns
  if (pathname.includes('/snowflake/') || pathname.includes('/catalog/')) {
    // These endpoints typically work with database objects
    if (database && schema) {
      dependencies.push(`${database}.${schema}.*`);
    }
  }

  return dependencies;
}

function generateCacheTags(c: Context): string[] {
  const pathname = new URL(c.req.url).pathname;
  const tags: string[] = ['http'];

  // Add tags based on endpoint type
  if (pathname.includes('/snowflake/')) {
    tags.push('snowflake');
  }
  if (pathname.includes('/catalog/')) {
    tags.push('catalog');
  }
  if (pathname.includes('/transformations/')) {
    tags.push('transformations');
  }
  if (pathname.includes('/dashboards/')) {
    tags.push('dashboards');
  }

  return tags;
}

interface InvalidationInfo {
  type: 'table' | 'catalog' | 'transformation' | 'dashboard';
  database?: string;
  schema?: string;
  table?: string;
  id?: string;
}

function extractInvalidationInfo(pathname: string, c: Context): InvalidationInfo | null {
  const query = new URL(c.req.url).searchParams;

  // Catalog discovery/updates
  if (pathname.includes('/catalog/discover') || pathname.includes('/catalog/ownership')) {
    const database = query.get('database');
    const schema = query.get('schema');
    if (database && schema) {
      return {
        type: 'catalog',
        database,
        schema,
      };
    }
  }

  // ETL operations
  if (pathname.includes('/etl/run-now')) {
    const database = query.get('database');
    const schema = query.get('schema');
    if (database && schema) {
      return {
        type: 'catalog',
        database,
        schema,
      };
    }
  }

  // Transform operations
  if (pathname.includes('/transform/')) {
    const database = query.get('database');
    const schema = query.get('schema');
    const table = query.get('table');
    if (database && schema && table) {
      return {
        type: 'table',
        database,
        schema,
        table,
      };
    }
  }

  return null;
}

async function processInvalidation(info: InvalidationInfo, c: Context): Promise<void> {
  switch (info.type) {
    case 'table':
      if (info.database && info.schema && info.table) {
        await cacheInvalidator.invalidateByTable(
          info.database,
          info.schema,
          info.table,
          'api_modification',
        );
      }
      break;

    case 'catalog':
      if (info.database && info.schema) {
        // Invalidate catalog-related caches
        await cacheInvalidator.invalidateByPattern(
          `catalog:db:${info.database}:schema:${info.schema}*`,
        );
      }
      break;

    case 'transformation':
      // Invalidate transformation-related caches
      await cacheInvalidator.invalidateByTags(['transformations']);
      break;

    case 'dashboard':
      if (info.id) {
        await cacheInvalidator.invalidateByTags(['dashboard', info.id]);
      }
      break;
  }

  logger.info(
    {
      invalidationInfo: info,
      pathname: new URL(c.req.url).pathname,
      event: 'cache_invalidated_by_api',
    },
    'Cache invalidated by API modification',
  );
}
