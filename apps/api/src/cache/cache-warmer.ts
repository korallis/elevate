import { logger } from '../logger.js';
import { runPostgresQuery, hasPgConfig } from '../postgres.js';
import { discovery } from '../snowflake.js';
import { cacheManager } from './cache-manager.js';
import { CacheKeyGenerator, QueryContext } from './cache-key-generator.js';
import cron from 'node-cron';

export interface WarmupJob {
  id: string;
  name: string;
  type: 'query' | 'catalog' | 'dashboard' | 'transformation';
  priority: 'low' | 'medium' | 'high';
  schedule?: string; // Cron expression
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  config: WarmupConfig;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarmupConfig {
  // For query warmup
  sql?: string;
  database?: string;
  schema?: string;
  table?: string;

  // For catalog warmup
  includeViews?: boolean;
  includeColumns?: boolean;

  // For dashboard warmup
  dashboardId?: string;
  widgetIds?: string[];

  // For transformation warmup
  transformationId?: string;

  // Common options
  ttl?: number;
  tags?: string[];
  filters?: Record<string, unknown>;
}

export interface WarmupResult {
  jobId: string;
  success: boolean;
  itemsWarmed: number;
  totalTime: number;
  errors: string[];
  details?: Record<string, unknown>;
}

/**
 * Handles pre-warming of popular queries and data
 */
export class CacheWarmer {
  private runningJobs = new Map<string, Promise<WarmupResult>>();
  private scheduledJobs = new Map<string, cron.ScheduledTask>();

  /**
   * Initialize the cache warmer and start scheduled jobs
   */
  async initialize(): Promise<void> {
    try {
      if (!hasPgConfig()) {
        logger.warn('PostgreSQL not configured, cache warming will be limited');
        return;
      }

      const jobs = await this.getWarmupJobs();
      for (const job of jobs) {
        if (job.enabled && job.schedule) {
          this.scheduleJob(job);
        }
      }

      logger.info(
        {
          scheduledJobs: this.scheduledJobs.size,
          event: 'cache_warmer_initialized',
        },
        'Cache warmer initialized',
      );
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'cache_warmer_init_error',
        },
        'Error initializing cache warmer',
      );
    }
  }

  /**
   * Warm cache for popular queries based on hit count
   */
  async warmPopularQueries(limit = 10): Promise<WarmupResult> {
    const jobId = `popular_queries_${Date.now()}`;

    try {
      if (!hasPgConfig()) {
        return {
          jobId,
          success: false,
          itemsWarmed: 0,
          totalTime: 0,
          errors: ['PostgreSQL not configured'],
        };
      }

      const startTime = Date.now();
      const errors: string[] = [];
      let itemsWarmed = 0;

      // Get popular queries from metadata
      const popularQueries = await runPostgresQuery<{
        cache_key: string;
        query_hash: string;
        hit_count: string;
        table_dependencies: string[];
        expires_at: string | null;
      }>(
        `
        SELECT cache_key, query_hash, hit_count::text, table_dependencies, expires_at::text
        FROM query_cache_metadata
        WHERE hit_count > 1 
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP + INTERVAL '1 hour')
        ORDER BY hit_count DESC, last_hit_at DESC
        LIMIT $1
      `,
        [limit],
      );

      for (const query of popularQueries) {
        try {
          // Check if cache is still valid and doesn't need warming
          const existing = await cacheManager.get(query.cache_key);
          if (existing) {
            continue; // Already cached
          }

          // For now, we'll just mark it as warmed in metadata
          // In a real implementation, you'd re-execute the original query
          await this.warmQueryByKey(query.cache_key, query.query_hash);
          itemsWarmed++;
        } catch (error) {
          errors.push(`Failed to warm ${query.cache_key}: ${(error as Error).message}`);
        }
      }

      const totalTime = Date.now() - startTime;

      logger.info(
        {
          jobId,
          itemsWarmed,
          totalTime,
          errors: errors.length,
          event: 'popular_queries_warmed',
        },
        'Popular queries cache warming completed',
      );

      return {
        jobId,
        success: errors.length === 0,
        itemsWarmed,
        totalTime,
        errors,
      };
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          jobId,
          event: 'popular_queries_warm_error',
        },
        'Error warming popular queries',
      );

      return {
        jobId,
        success: false,
        itemsWarmed: 0,
        totalTime: Date.now() - Date.now(),
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Warm catalog data for commonly accessed databases/schemas
   */
  async warmCatalogData(
    database: string,
    schema: string,
    options: { includeViews?: boolean; includeColumns?: boolean } = {},
  ): Promise<WarmupResult> {
    const jobId = `catalog_${database}_${schema}_${Date.now()}`;

    try {
      const startTime = Date.now();
      const errors: string[] = [];
      let itemsWarmed = 0;

      // Warm tables list
      try {
        const tablesKey = CacheKeyGenerator.forCatalog(database, schema);
        const existingTables = await cacheManager.get(tablesKey);

        if (!existingTables) {
          const tables = await discovery.listTables(database, schema);
          await cacheManager.set(tablesKey, tables, {
            ttl: 3600,
            tableDependencies: [`${database}.${schema}.*`],
            tags: ['catalog', 'tables'],
          });
          itemsWarmed++;
        }
      } catch (error) {
        errors.push(`Failed to warm tables: ${(error as Error).message}`);
      }

      // Warm views if requested
      if (options.includeViews) {
        try {
          const viewsKey = CacheKeyGenerator.forCatalog(database, schema, undefined, {
            customPrefix: 'catalog_views',
          });
          const existingViews = await cacheManager.get(viewsKey);

          if (!existingViews) {
            const views = await discovery.listViews(database, schema);
            await cacheManager.set(viewsKey, views, {
              ttl: 3600,
              tableDependencies: [`${database}.${schema}.*`],
              tags: ['catalog', 'views'],
            });
            itemsWarmed++;
          }
        } catch (error) {
          errors.push(`Failed to warm views: ${(error as Error).message}`);
        }
      }

      // Warm column data for popular tables if requested
      if (options.includeColumns) {
        try {
          const tables = await discovery.listTables(database, schema);
          const popularTables = tables.slice(0, 5); // Top 5 tables

          for (const table of popularTables) {
            const columnsKey = CacheKeyGenerator.forCatalog(database, schema, table.TABLE_NAME, {
              customPrefix: 'catalog_columns',
            });
            const existingColumns = await cacheManager.get(columnsKey);

            if (!existingColumns) {
              const columns = await discovery.listColumns(database, schema, table.TABLE_NAME);
              await cacheManager.set(columnsKey, columns, {
                ttl: 7200,
                tableDependencies: [`${database}.${schema}.${table.TABLE_NAME}`],
                tags: ['catalog', 'columns'],
              });
              itemsWarmed++;
            }
          }
        } catch (error) {
          errors.push(`Failed to warm columns: ${(error as Error).message}`);
        }
      }

      const totalTime = Date.now() - startTime;

      logger.info(
        {
          jobId,
          database,
          schema,
          itemsWarmed,
          totalTime,
          errors: errors.length,
          event: 'catalog_data_warmed',
        },
        'Catalog data cache warming completed',
      );

      return {
        jobId,
        success: errors.length === 0,
        itemsWarmed,
        totalTime,
        errors,
        details: { database, schema, options },
      };
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          jobId,
          database,
          schema,
          event: 'catalog_data_warm_error',
        },
        'Error warming catalog data',
      );

      return {
        jobId,
        success: false,
        itemsWarmed: 0,
        totalTime: 0,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Warm dashboard data
   */
  async warmDashboard(dashboardId: string, widgetIds?: string[]): Promise<WarmupResult> {
    const jobId = `dashboard_${dashboardId}_${Date.now()}`;

    try {
      const startTime = Date.now();
      const errors: string[] = [];
      let itemsWarmed = 0;

      // Get dashboard configuration
      if (!hasPgConfig()) {
        errors.push('PostgreSQL not configured for dashboard warming');
        return { jobId, success: false, itemsWarmed: 0, totalTime: 0, errors };
      }

      // In a real implementation, you would:
      // 1. Get dashboard configuration from database
      // 2. Get each widget's query configuration
      // 3. Pre-execute the queries and cache the results
      // 4. Handle any filters or parameters

      // For now, we'll create placeholder warming
      const dashboardKey = CacheKeyGenerator.forDashboard(dashboardId);
      const existingDashboard = await cacheManager.get(dashboardKey);

      if (!existingDashboard) {
        // Simulate dashboard data warming
        const mockDashboardData = {
          id: dashboardId,
          widgets: widgetIds || [],
          warmedAt: new Date().toISOString(),
        };

        await cacheManager.set(dashboardKey, mockDashboardData, {
          ttl: 1800, // 30 minutes
          tags: ['dashboard', dashboardId],
        });
        itemsWarmed++;
      }

      // Warm individual widgets if specified
      if (widgetIds) {
        for (const widgetId of widgetIds) {
          try {
            const widgetKey = CacheKeyGenerator.forDashboard(dashboardId, widgetId);
            const existingWidget = await cacheManager.get(widgetKey);

            if (!existingWidget) {
              const mockWidgetData = {
                widgetId,
                dashboardId,
                warmedAt: new Date().toISOString(),
              };

              await cacheManager.set(widgetKey, mockWidgetData, {
                ttl: 1800,
                tags: ['dashboard', 'widget', dashboardId, widgetId],
              });
              itemsWarmed++;
            }
          } catch (error) {
            errors.push(`Failed to warm widget ${widgetId}: ${(error as Error).message}`);
          }
        }
      }

      const totalTime = Date.now() - startTime;

      logger.info(
        {
          jobId,
          dashboardId,
          widgetIds,
          itemsWarmed,
          totalTime,
          errors: errors.length,
          event: 'dashboard_warmed',
        },
        'Dashboard cache warming completed',
      );

      return {
        jobId,
        success: errors.length === 0,
        itemsWarmed,
        totalTime,
        errors,
        details: { dashboardId, widgetIds },
      };
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          jobId,
          dashboardId,
          event: 'dashboard_warm_error',
        },
        'Error warming dashboard',
      );

      return {
        jobId,
        success: false,
        itemsWarmed: 0,
        totalTime: 0,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Create a scheduled warmup job
   */
  async createWarmupJob(
    job: Omit<WarmupJob, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WarmupJob | null> {
    try {
      if (!hasPgConfig()) {
        logger.warn('PostgreSQL not configured, cannot create warmup job');
        return null;
      }

      const jobId = `warmup_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const result = await runPostgresQuery<{
        id: string;
        name: string;
        type: string;
        priority: string;
        schedule: string | null;
        enabled: boolean;
        created_at: string;
        updated_at: string;
        config: Record<string, unknown>;
        created_by: string | null;
      }>(
        `
        INSERT INTO warmup_jobs (
          id, name, type, priority, schedule, enabled, config, created_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `,
        [
          jobId,
          job.name,
          job.type,
          job.priority,
          job.schedule || null,
          job.enabled,
          JSON.stringify(job.config),
          job.createdBy || null,
        ],
      );

      if (result.length === 0) return null;

      const savedJob = this.mapRowToJob(result[0]);

      // Schedule the job if enabled and has schedule
      if (savedJob.enabled && savedJob.schedule) {
        this.scheduleJob(savedJob);
      }

      return savedJob;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          job,
          event: 'warmup_job_create_error',
        },
        'Error creating warmup job',
      );
      return null;
    }
  }

  /**
   * Get all warmup jobs
   */
  async getWarmupJobs(): Promise<WarmupJob[]> {
    try {
      if (!hasPgConfig()) return [];

      const result = await runPostgresQuery<{
        id: string;
        name: string;
        type: string;
        priority: string;
        schedule: string | null;
        enabled: boolean;
        last_run: string | null;
        next_run: string | null;
        created_at: string;
        updated_at: string;
        config: Record<string, unknown>;
        created_by: string | null;
      }>(`
        SELECT * FROM warmup_jobs 
        ORDER BY priority DESC, created_at DESC
      `);

      return result.map(this.mapRowToJob);
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'warmup_jobs_get_error',
        },
        'Error getting warmup jobs',
      );
      return [];
    }
  }

  /**
   * Execute a warmup job by ID
   */
  async executeWarmupJob(jobId: string): Promise<WarmupResult> {
    try {
      // Prevent concurrent execution of the same job
      if (this.runningJobs.has(jobId)) {
        const existingJob = this.runningJobs.get(jobId)!;
        return await existingJob;
      }

      const jobPromise = this.doExecuteWarmupJob(jobId);
      this.runningJobs.set(jobId, jobPromise);

      try {
        const result = await jobPromise;
        return result;
      } finally {
        this.runningJobs.delete(jobId);
      }
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          jobId,
          event: 'warmup_job_execute_error',
        },
        'Error executing warmup job',
      );

      return {
        jobId,
        success: false,
        itemsWarmed: 0,
        totalTime: 0,
        errors: [(error as Error).message],
      };
    }
  }

  private async doExecuteWarmupJob(jobId: string): Promise<WarmupResult> {
    if (!hasPgConfig()) {
      return {
        jobId,
        success: false,
        itemsWarmed: 0,
        totalTime: 0,
        errors: ['PostgreSQL not configured'],
      };
    }

    // Get job details
    const jobResult = await runPostgresQuery<{
      id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
    }>(
      `
      SELECT id, name, type, config 
      FROM warmup_jobs 
      WHERE id = $1 AND enabled = true
    `,
      [jobId],
    );

    if (jobResult.length === 0) {
      return {
        jobId,
        success: false,
        itemsWarmed: 0,
        totalTime: 0,
        errors: ['Job not found or disabled'],
      };
    }

    const job = jobResult[0];
    const config = job.config as WarmupConfig;

    // Update last run time
    await runPostgresQuery(
      `
      UPDATE warmup_jobs 
      SET last_run = CURRENT_TIMESTAMP 
      WHERE id = $1
    `,
      [jobId],
    );

    // Execute based on job type
    switch (job.type) {
      case 'catalog':
        if (config.database && config.schema) {
          return await this.warmCatalogData(config.database, config.schema, {
            includeViews: config.includeViews,
            includeColumns: config.includeColumns,
          });
        }
        break;

      case 'dashboard':
        if (config.dashboardId) {
          return await this.warmDashboard(config.dashboardId, config.widgetIds);
        }
        break;

      case 'query':
        return await this.warmPopularQueries();

      default:
        return {
          jobId,
          success: false,
          itemsWarmed: 0,
          totalTime: 0,
          errors: [`Unknown job type: ${job.type}`],
        };
    }

    return {
      jobId,
      success: false,
      itemsWarmed: 0,
      totalTime: 0,
      errors: ['Invalid job configuration'],
    };
  }

  private scheduleJob(job: WarmupJob): void {
    if (!job.schedule) return;

    try {
      const task = cron.schedule(
        job.schedule,
        async () => {
          logger.info(
            {
              jobId: job.id,
              jobName: job.name,
              event: 'scheduled_warmup_started',
            },
            'Starting scheduled warmup job',
          );

          await this.executeWarmupJob(job.id);
        },
        {
          scheduled: false,
        },
      );

      task.start();
      this.scheduledJobs.set(job.id, task);

      logger.info(
        {
          jobId: job.id,
          jobName: job.name,
          schedule: job.schedule,
          event: 'warmup_job_scheduled',
        },
        'Warmup job scheduled',
      );
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          jobId: job.id,
          schedule: job.schedule,
          event: 'warmup_job_schedule_error',
        },
        'Error scheduling warmup job',
      );
    }
  }

  private async warmQueryByKey(cacheKey: string, queryHash: string): Promise<void> {
    // In a real implementation, you would:
    // 1. Look up the original query from the queryHash
    // 2. Re-execute the query
    // 3. Cache the results

    // For now, we'll just update the metadata to indicate warming
    if (hasPgConfig()) {
      await runPostgresQuery(
        `
        UPDATE query_cache_metadata 
        SET last_hit_at = CURRENT_TIMESTAMP 
        WHERE cache_key = $1
      `,
        [cacheKey],
      );
    }
  }

  private mapRowToJob(row: {
    id: string;
    name: string;
    type: string;
    priority: string;
    schedule: string | null;
    enabled: boolean;
    last_run?: string | null;
    next_run?: string | null;
    created_at: string;
    updated_at: string;
    config: Record<string, unknown>;
    created_by: string | null;
  }): WarmupJob {
    return {
      id: row.id,
      name: row.name,
      type: row.type as WarmupJob['type'],
      priority: row.priority as WarmupJob['priority'],
      schedule: row.schedule || undefined,
      enabled: row.enabled,
      lastRun: row.last_run ? new Date(row.last_run) : undefined,
      nextRun: row.next_run ? new Date(row.next_run) : undefined,
      config: row.config as WarmupConfig,
      createdBy: row.created_by || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// Singleton instance
export const cacheWarmer = new CacheWarmer();
