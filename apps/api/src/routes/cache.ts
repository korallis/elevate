import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { logger } from '../logger.js';
import { cacheManager } from '../cache/cache-manager.js';
import { cacheInvalidator } from '../cache/cache-invalidator.js';
import { cacheWarmer } from '../cache/cache-warmer.js';
import { useBudget, getActorKey } from '../budget.js';

const cache = new Hono();

// Validation schemas
const InvalidateSchema = z
  .object({
    keys: z.array(z.string()).optional(),
    pattern: z.string().optional(),
    tags: z.array(z.string()).optional(),
    database: z.string().optional(),
    schema: z.string().optional(),
    table: z.string().optional(),
  })
  .refine((data) => data.keys || data.pattern || data.tags || (data.database && data.schema), {
    message: 'At least one invalidation method must be specified',
  });

const WarmCatalogSchema = z.object({
  database: z.string().min(1),
  schema: z.string().min(1),
  includeViews: z.boolean().default(false),
  includeColumns: z.boolean().default(false),
});

const WarmDashboardSchema = z.object({
  dashboardId: z.string().min(1),
  widgetIds: z.array(z.string()).optional(),
});

const WarmupJobSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['query', 'catalog', 'dashboard', 'transformation']),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  schedule: z.string().optional(), // Cron expression
  enabled: z.boolean().default(true),
  config: z.object({
    // Query warmup
    sql: z.string().optional(),
    database: z.string().optional(),
    schema: z.string().optional(),
    table: z.string().optional(),

    // Catalog warmup
    includeViews: z.boolean().optional(),
    includeColumns: z.boolean().optional(),

    // Dashboard warmup
    dashboardId: z.string().optional(),
    widgetIds: z.array(z.string()).optional(),

    // Transformation warmup
    transformationId: z.string().optional(),

    // Common options
    ttl: z.number().positive().optional(),
    tags: z.array(z.string()).optional(),
    filters: z.record(z.unknown()).optional(),
  }),
});

const InvalidationRuleSchema = z.object({
  tableName: z.string().min(1),
  databaseName: z.string().min(1),
  schemaName: z.string().min(1),
  strategy: z.enum(['time_based', 'event_based', 'manual', 'dependency', 'cascade']),
  ttlSeconds: z.number().positive().optional(),
  isActive: z.boolean().default(true),
});

/**
 * GET /cache/stats - Get cache statistics
 */
cache.get('/stats', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const stats = await cacheManager.getStats();
    const healthCheck = await cacheManager.healthCheck();

    return c.json({
      ...stats,
      redis: healthCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_stats_api_error',
      },
      'Error getting cache stats',
    );

    return c.json(
      {
        error: 'Failed to get cache statistics',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * GET /cache/keys - List cached keys with metadata
 */
cache.get('/keys', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '100'), 1000);
    const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);

    const keys = await cacheManager.getKeys(limit, offset);

    return c.json({
      keys,
      pagination: {
        limit,
        offset,
        count: keys.length,
      },
    });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_keys_api_error',
      },
      'Error getting cache keys',
    );

    return c.json(
      {
        error: 'Failed to get cache keys',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * POST /cache/invalidate - Manual cache invalidation
 */
cache.post('/invalidate', zValidator('json', InvalidateSchema), async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const data = c.req.valid('json');
    const actor = getActorKey(c.req.raw.headers);
    let totalInvalidated = 0;

    // Invalidate by specific keys
    if (data.keys?.length) {
      for (const key of data.keys) {
        const success = await cacheManager.delete(key);
        if (success) totalInvalidated++;
      }
    }

    // Invalidate by pattern
    if (data.pattern) {
      totalInvalidated += await cacheInvalidator.invalidateByPattern(data.pattern);
    }

    // Invalidate by tags
    if (data.tags?.length) {
      totalInvalidated += await cacheInvalidator.invalidateByTags(data.tags);
    }

    // Invalidate by table
    if (data.database && data.schema) {
      if (data.table) {
        totalInvalidated += await cacheInvalidator.invalidateByTable(
          data.database,
          data.schema,
          data.table,
          'manual_invalidation',
        );
      } else {
        totalInvalidated += await cacheInvalidator.invalidateByPattern(
          `*:db:${data.database}:schema:${data.schema}*`,
        );
      }
    }

    logger.info(
      {
        invalidationRequest: data,
        totalInvalidated,
        actor,
        event: 'manual_cache_invalidation',
      },
      'Manual cache invalidation completed',
    );

    return c.json({
      success: true,
      invalidatedCount: totalInvalidated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_invalidate_api_error',
      },
      'Error during manual cache invalidation',
    );

    return c.json(
      {
        error: 'Failed to invalidate cache',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * DELETE /cache/clear - Clear all cache data
 */
cache.delete('/clear', async (c) => {
  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const actor = getActorKey(c.req.raw.headers);
    const success = await cacheManager.clear();

    logger.warn(
      {
        actor,
        success,
        event: 'cache_cleared_manually',
      },
      'Cache cleared manually via API',
    );

    return c.json({
      success,
      message: success ? 'All cache data cleared' : 'Failed to clear cache',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_clear_api_error',
      },
      'Error clearing cache',
    );

    return c.json(
      {
        error: 'Failed to clear cache',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * POST /cache/warm - Pre-warm cache with popular queries
 */
cache.post('/warm', async (c) => {
  const budget = useBudget(c.req.raw.headers, 10);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50);
    const result = await cacheWarmer.warmPopularQueries(limit);

    return c.json(result);
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_warm_api_error',
      },
      'Error warming cache',
    );

    return c.json(
      {
        error: 'Failed to warm cache',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * POST /cache/warm/catalog - Pre-warm catalog data
 */
cache.post('/warm/catalog', zValidator('json', WarmCatalogSchema), async (c) => {
  const budget = useBudget(c.req.raw.headers, 10);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const data = c.req.valid('json');
    const result = await cacheWarmer.warmCatalogData(data.database, data.schema, {
      includeViews: data.includeViews,
      includeColumns: data.includeColumns,
    });

    return c.json(result);
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_warm_catalog_api_error',
      },
      'Error warming catalog cache',
    );

    return c.json(
      {
        error: 'Failed to warm catalog cache',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * POST /cache/warm/dashboard - Pre-warm dashboard data
 */
cache.post('/warm/dashboard', zValidator('json', WarmDashboardSchema), async (c) => {
  const budget = useBudget(c.req.raw.headers, 10);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const data = c.req.valid('json');
    const result = await cacheWarmer.warmDashboard(data.dashboardId, data.widgetIds);

    return c.json(result);
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_warm_dashboard_api_error',
      },
      'Error warming dashboard cache',
    );

    return c.json(
      {
        error: 'Failed to warm dashboard cache',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * POST /cache/cleanup - Clean up expired entries
 */
cache.post('/cleanup', async (c) => {
  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const result = await cacheInvalidator.cleanupExpired();

    return c.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_cleanup_api_error',
      },
      'Error cleaning up cache',
    );

    return c.json(
      {
        error: 'Failed to cleanup cache',
        details: (error as Error).message,
      },
      500,
    );
  }
});

// Invalidation Rules Management

/**
 * GET /cache/rules - Get all invalidation rules
 */
cache.get('/rules', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const rules = await cacheInvalidator.getAllInvalidationRules();
    return c.json({ rules });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_rules_get_api_error',
      },
      'Error getting invalidation rules',
    );

    return c.json(
      {
        error: 'Failed to get invalidation rules',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * POST /cache/rules - Create or update invalidation rule
 */
cache.post('/rules', zValidator('json', InvalidationRuleSchema), async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const data = c.req.valid('json');
    const actor = getActorKey(c.req.raw.headers);

    const rule = await cacheInvalidator.setInvalidationRule({
      ...data,
      createdBy: actor,
    });

    if (!rule) {
      return c.json({ error: 'Failed to create invalidation rule' }, 500);
    }

    return c.json({ success: true, rule });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_rules_create_api_error',
      },
      'Error creating invalidation rule',
    );

    return c.json(
      {
        error: 'Failed to create invalidation rule',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * DELETE /cache/rules - Remove invalidation rule
 */
cache.delete('/rules', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const database = c.req.query('database');
    const schema = c.req.query('schema');
    const table = c.req.query('table');

    if (!database || !schema || !table) {
      return c.json(
        {
          error: 'Missing required parameters: database, schema, table',
        },
        400,
      );
    }

    const success = await cacheInvalidator.removeInvalidationRule(database, schema, table);

    return c.json({ success });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_rules_delete_api_error',
      },
      'Error deleting invalidation rule',
    );

    return c.json(
      {
        error: 'Failed to delete invalidation rule',
        details: (error as Error).message,
      },
      500,
    );
  }
});

// Warmup Jobs Management

/**
 * GET /cache/jobs - Get all warmup jobs
 */
cache.get('/jobs', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const jobs = await cacheWarmer.getWarmupJobs();
    return c.json({ jobs });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_jobs_get_api_error',
      },
      'Error getting warmup jobs',
    );

    return c.json(
      {
        error: 'Failed to get warmup jobs',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * POST /cache/jobs - Create warmup job
 */
cache.post('/jobs', zValidator('json', WarmupJobSchema), async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const data = c.req.valid('json');
    const actor = getActorKey(c.req.raw.headers);

    const job = await cacheWarmer.createWarmupJob({
      ...data,
      createdBy: actor,
    });

    if (!job) {
      return c.json({ error: 'Failed to create warmup job' }, 500);
    }

    return c.json({ success: true, job });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_jobs_create_api_error',
      },
      'Error creating warmup job',
    );

    return c.json(
      {
        error: 'Failed to create warmup job',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * POST /cache/jobs/:jobId/execute - Execute warmup job
 */
cache.post('/jobs/:jobId/execute', async (c) => {
  const budget = useBudget(c.req.raw.headers, 10);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const jobId = c.req.param('jobId');
    const result = await cacheWarmer.executeWarmupJob(jobId);

    return c.json(result);
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_job_execute_api_error',
      },
      'Error executing warmup job',
    );

    return c.json(
      {
        error: 'Failed to execute warmup job',
        details: (error as Error).message,
      },
      500,
    );
  }
});

/**
 * GET /cache/health - Cache system health check
 */
cache.get('/health', async (c) => {
  try {
    const healthCheck = await cacheManager.healthCheck();

    return c.json({
      healthy: healthCheck.connected,
      redis: healthCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        event: 'cache_health_api_error',
      },
      'Error checking cache health',
    );

    return c.json(
      {
        healthy: false,
        error: (error as Error).message,
      },
      503,
    );
  }
});

export default cache;
