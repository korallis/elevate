import { logger } from '../logger.js';
import { runPostgresQuery, hasPgConfig } from '../postgres.js';
import { cacheManager } from './cache-manager.js';
import { CacheKeyGenerator } from './cache-key-generator.js';

export type InvalidationStrategy =
  | 'time_based' // TTL-based expiration
  | 'event_based' // Triggered by data changes
  | 'manual' // Manual invalidation only
  | 'dependency' // Based on table dependencies
  | 'cascade'; // Invalidate related caches

export interface InvalidationRule {
  id?: string;
  tableName: string;
  databaseName: string;
  schemaName: string;
  strategy: InvalidationStrategy;
  ttlSeconds?: number;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface InvalidationEvent {
  type: 'insert' | 'update' | 'delete' | 'truncate' | 'drop';
  database: string;
  schema: string;
  table: string;
  affectedRows?: number;
  timestamp: Date;
  userId?: string;
}

/**
 * Handles cache invalidation strategies and rules
 */
export class CacheInvalidator {
  /**
   * Invalidate cache entries based on table changes
   */
  async invalidateByTable(
    database: string,
    schema: string,
    table: string,
    reason = 'data_change',
  ): Promise<number> {
    try {
      // Get invalidation rules for this table
      const rules = await this.getInvalidationRules(database, schema, table);
      let totalInvalidated = 0;

      for (const rule of rules) {
        if (!rule.isActive) continue;

        switch (rule.strategy) {
          case 'dependency':
          case 'cascade':
            totalInvalidated += await this.invalidateByDependency(database, schema, table);
            break;

          case 'event_based':
            totalInvalidated += await this.invalidateByEvent(database, schema, table);
            break;

          case 'manual':
            // Skip automatic invalidation for manual strategy
            break;

          case 'time_based':
            // Time-based invalidation is handled by TTL, but we can force expire
            totalInvalidated += await this.invalidateByPattern(
              CacheKeyGenerator.forInvalidationPattern(database, schema, table),
            );
            break;
        }
      }

      logger.info(
        {
          database,
          schema,
          table,
          reason,
          invalidatedCount: totalInvalidated,
          event: 'cache_invalidated_by_table',
        },
        'Cache invalidated by table change',
      );

      return totalInvalidated;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          database,
          schema,
          table,
          event: 'cache_invalidation_error',
        },
        'Error invalidating cache by table',
      );
      return 0;
    }
  }

  /**
   * Invalidate cache entries based on dependency relationships
   */
  async invalidateByDependency(database: string, schema: string, table: string): Promise<number> {
    try {
      if (!hasPgConfig()) {
        return await this.invalidateByPattern(
          CacheKeyGenerator.forInvalidationPattern(database, schema, table),
        );
      }

      // Find all cache entries that depend on this table
      const dependentEntries = await runPostgresQuery<{
        cache_key: string;
        table_dependencies: string[];
      }>(
        `
        SELECT cache_key, table_dependencies 
        FROM query_cache_metadata 
        WHERE $1 = ANY(table_dependencies)
      `,
        [`${database}.${schema}.${table}`],
      );

      let totalInvalidated = 0;

      for (const entry of dependentEntries) {
        const success = await cacheManager.delete(entry.cache_key);
        if (success) {
          totalInvalidated++;
        }
      }

      // Also invalidate by pattern as fallback
      totalInvalidated += await this.invalidateByPattern(
        CacheKeyGenerator.forInvalidationPattern(database, schema, table),
      );

      return totalInvalidated;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          database,
          schema,
          table,
          event: 'cache_invalidation_dependency_error',
        },
        'Error invalidating cache by dependency',
      );
      return 0;
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const invalidatedCount = await cacheManager.deleteByPattern(pattern);

      logger.debug(
        {
          pattern,
          invalidatedCount,
          event: 'cache_invalidated_by_pattern',
        },
        'Cache invalidated by pattern',
      );

      return invalidatedCount;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          pattern,
          event: 'cache_invalidation_pattern_error',
        },
        'Error invalidating cache by pattern',
      );
      return 0;
    }
  }

  /**
   * Invalidate cache entries based on specific event
   */
  async invalidateByEvent(
    database: string,
    schema: string,
    table: string,
    eventType?: InvalidationEvent['type'],
  ): Promise<number> {
    try {
      // Different invalidation strategies based on event type
      const patterns = [
        CacheKeyGenerator.forInvalidationPattern(database, schema, table),
        `*:table:${table}*`, // Any cache mentioning this table
        `catalog:db:${database}:schema:${schema}*`, // Catalog caches
      ];

      let totalInvalidated = 0;

      for (const pattern of patterns) {
        totalInvalidated += await this.invalidateByPattern(pattern);
      }

      // For DROP events, also clear related metadata
      if (eventType === 'drop') {
        await this.cleanupTableMetadata(database, schema, table);
      }

      return totalInvalidated;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          database,
          schema,
          table,
          eventType,
          event: 'cache_invalidation_event_error',
        },
        'Error invalidating cache by event',
      );
      return 0;
    }
  }

  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      if (!hasPgConfig() || tags.length === 0) return 0;

      // Find cache entries with matching tags
      const entries = await runPostgresQuery<{
        cache_key: string;
      }>(
        `
        SELECT cache_key 
        FROM query_cache_metadata 
        WHERE tags && $1
      `,
        [tags],
      );

      let totalInvalidated = 0;

      for (const entry of entries) {
        const success = await cacheManager.delete(entry.cache_key);
        if (success) {
          totalInvalidated++;
        }
      }

      logger.info(
        {
          tags,
          invalidatedCount: totalInvalidated,
          event: 'cache_invalidated_by_tags',
        },
        'Cache invalidated by tags',
      );

      return totalInvalidated;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          tags,
          event: 'cache_invalidation_tags_error',
        },
        'Error invalidating cache by tags',
      );
      return 0;
    }
  }

  /**
   * Process a data change event and invalidate appropriate caches
   */
  async processDataChangeEvent(event: InvalidationEvent): Promise<number> {
    try {
      logger.info(
        {
          event: event,
          cache_event: 'data_change_event_received',
        },
        'Processing data change event',
      );

      const invalidatedCount = await this.invalidateByTable(
        event.database,
        event.schema,
        event.table,
        `${event.type}_operation`,
      );

      // Log the event for audit purposes
      if (hasPgConfig()) {
        await runPostgresQuery(
          `
          INSERT INTO audit_logs (event, details) 
          VALUES ('cache_invalidation', $1)
        `,
          [
            JSON.stringify({
              ...event,
              invalidatedCount,
              timestamp: event.timestamp.toISOString(),
            }),
          ],
        );
      }

      return invalidatedCount;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event,
          cache_event: 'data_change_event_error',
        },
        'Error processing data change event',
      );
      return 0;
    }
  }

  /**
   * Create or update invalidation rule for a table
   */
  async setInvalidationRule(rule: Omit<InvalidationRule, 'id'>): Promise<InvalidationRule | null> {
    try {
      if (!hasPgConfig()) {
        logger.warn('PostgreSQL not configured, cannot store invalidation rules');
        return null;
      }

      const result = await runPostgresQuery<{
        id: string;
        table_name: string;
        database_name: string;
        schema_name: string;
        invalidation_strategy: string;
        ttl_seconds: number | null;
        created_at: string;
        updated_at: string;
        created_by: string | null;
        is_active: boolean;
      }>(
        `
        INSERT INTO cache_invalidation_rules (
          table_name, database_name, schema_name, invalidation_strategy, 
          ttl_seconds, created_by, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (table_name, database_name, schema_name)
        DO UPDATE SET 
          invalidation_strategy = EXCLUDED.invalidation_strategy,
          ttl_seconds = EXCLUDED.ttl_seconds,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
        [
          rule.tableName,
          rule.databaseName,
          rule.schemaName,
          rule.strategy,
          rule.ttlSeconds || null,
          rule.createdBy || null,
          rule.isActive,
        ],
      );

      if (result.length === 0) return null;

      const row = result[0];
      return {
        id: row.id,
        tableName: row.table_name,
        databaseName: row.database_name,
        schemaName: row.schema_name,
        strategy: row.invalidation_strategy as InvalidationStrategy,
        ttlSeconds: row.ttl_seconds || undefined,
        isActive: row.is_active,
        createdBy: row.created_by || undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          rule,
          event: 'cache_invalidation_rule_set_error',
        },
        'Error setting invalidation rule',
      );
      return null;
    }
  }

  /**
   * Get invalidation rules for a specific table
   */
  async getInvalidationRules(
    database: string,
    schema: string,
    table: string,
  ): Promise<InvalidationRule[]> {
    try {
      if (!hasPgConfig()) {
        // Return default rule
        return [
          {
            tableName: table,
            databaseName: database,
            schemaName: schema,
            strategy: 'dependency',
            isActive: true,
          },
        ];
      }

      const result = await runPostgresQuery<{
        id: string;
        table_name: string;
        database_name: string;
        schema_name: string;
        invalidation_strategy: string;
        ttl_seconds: number | null;
        created_at: string;
        updated_at: string;
        created_by: string | null;
        is_active: boolean;
      }>(
        `
        SELECT * FROM cache_invalidation_rules 
        WHERE table_name = $1 AND database_name = $2 AND schema_name = $3 AND is_active = true
      `,
        [table, database, schema],
      );

      return result.map((row) => ({
        id: row.id,
        tableName: row.table_name,
        databaseName: row.database_name,
        schemaName: row.schema_name,
        strategy: row.invalidation_strategy as InvalidationStrategy,
        ttlSeconds: row.ttl_seconds || undefined,
        isActive: row.is_active,
        createdBy: row.created_by || undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          database,
          schema,
          table,
          event: 'cache_invalidation_rules_get_error',
        },
        'Error getting invalidation rules',
      );
      return [];
    }
  }

  /**
   * Get all invalidation rules
   */
  async getAllInvalidationRules(): Promise<InvalidationRule[]> {
    try {
      if (!hasPgConfig()) return [];

      const result = await runPostgresQuery<{
        id: string;
        table_name: string;
        database_name: string;
        schema_name: string;
        invalidation_strategy: string;
        ttl_seconds: number | null;
        created_at: string;
        updated_at: string;
        created_by: string | null;
        is_active: boolean;
      }>(`
        SELECT * FROM cache_invalidation_rules 
        ORDER BY database_name, schema_name, table_name
      `);

      return result.map((row) => ({
        id: row.id,
        tableName: row.table_name,
        databaseName: row.database_name,
        schemaName: row.schema_name,
        strategy: row.invalidation_strategy as InvalidationStrategy,
        ttlSeconds: row.ttl_seconds || undefined,
        isActive: row.is_active,
        createdBy: row.created_by || undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'cache_invalidation_rules_get_all_error',
        },
        'Error getting all invalidation rules',
      );
      return [];
    }
  }

  /**
   * Remove invalidation rule
   */
  async removeInvalidationRule(database: string, schema: string, table: string): Promise<boolean> {
    try {
      if (!hasPgConfig()) return false;

      await runPostgresQuery(
        `
        DELETE FROM cache_invalidation_rules 
        WHERE table_name = $1 AND database_name = $2 AND schema_name = $3
      `,
        [table, database, schema],
      );

      logger.info(
        {
          database,
          schema,
          table,
          event: 'cache_invalidation_rule_removed',
        },
        'Invalidation rule removed',
      );

      return true;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          database,
          schema,
          table,
          event: 'cache_invalidation_rule_remove_error',
        },
        'Error removing invalidation rule',
      );
      return false;
    }
  }

  /**
   * Clean up expired cache entries and update statistics
   */
  async cleanupExpired(): Promise<{
    expiredCache: number;
    cleanedMetadata: number;
  }> {
    try {
      const expiredCache = await cacheManager.cleanupExpired();

      let cleanedMetadata = 0;
      if (hasPgConfig()) {
        const result = await runPostgresQuery<{ cleanup_expired_cache_metadata: number }>(`
          SELECT cleanup_expired_cache_metadata() as cleanup_expired_cache_metadata
        `);
        cleanedMetadata = result[0]?.cleanup_expired_cache_metadata || 0;
      }

      logger.info(
        {
          expiredCache,
          cleanedMetadata,
          event: 'cache_cleanup_completed',
        },
        'Cache cleanup completed',
      );

      return { expiredCache, cleanedMetadata };
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'cache_cleanup_error',
        },
        'Error during cache cleanup',
      );
      return { expiredCache: 0, cleanedMetadata: 0 };
    }
  }

  private async cleanupTableMetadata(
    database: string,
    schema: string,
    table: string,
  ): Promise<void> {
    try {
      if (!hasPgConfig()) return;

      // Remove invalidation rules for dropped table
      await runPostgresQuery(
        `
        DELETE FROM cache_invalidation_rules 
        WHERE table_name = $1 AND database_name = $2 AND schema_name = $3
      `,
        [table, database, schema],
      );

      logger.debug(
        {
          database,
          schema,
          table,
          event: 'cache_table_metadata_cleaned',
        },
        'Cleaned up cache metadata for dropped table',
      );
    } catch (error) {
      logger.warn(
        {
          error: (error as Error).message,
          database,
          schema,
          table,
        },
        'Failed to cleanup table metadata',
      );
    }
  }
}

// Singleton instance
export const cacheInvalidator = new CacheInvalidator();
