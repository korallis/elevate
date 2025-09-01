import Redis from 'ioredis';
import { logger } from '../logger.js';
import { runPostgresQuery, hasPgConfig } from '../postgres.js';
import { generateCacheKey } from './cache-key-generator.js';
import crypto from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean; // Whether to compress the data
  tableDependencies?: string[]; // Tables this cache depends on
  tags?: string[]; // Tags for grouping cache entries
}

export interface CacheMetadata {
  key: string;
  queryHash: string;
  tableDependencies: string[];
  hitCount: number;
  createdAt: Date;
  expiresAt?: Date;
  dataSize?: number;
  queryExecutionTime?: number;
  createdBy?: string;
  tags: string[];
}

export interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  totalCacheSize: number;
  avgResponseTime: number;
  totalKeys: number;
  expiredKeys: number;
}

export class CacheManager {
  private redis: Redis;
  private defaultTTL = 3600; // 1 hour
  private compressionThreshold = 1024; // Compress data larger than 1KB
  private keyPrefix = 'elev8:cache:';

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    } else {
      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    }

    this.redis.on('error', (err) => {
      logger.error({ error: err.message, event: 'redis_error' }, 'Redis connection error');
    });

    this.redis.on('connect', () => {
      logger.info({ event: 'redis_connected' }, 'Redis connected successfully');
    });
  }

  /**
   * Get cached data by key
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const cacheKey = this.keyPrefix + key;
      const cachedData = await this.redis.get(cacheKey);

      if (!cachedData) {
        await this.trackCacheMiss();
        return null;
      }

      // Update hit statistics in background
      this.updateHitStats(key).catch((err) =>
        logger.warn({ error: err.message, key }, 'Failed to update hit stats'),
      );

      // Decompress if needed
      let data: string = cachedData;
      if (cachedData.startsWith('gzip:')) {
        const compressed = Buffer.from(cachedData.substring(5), 'base64');
        data = gunzipSync(compressed).toString('utf-8');
      }

      return JSON.parse(data) as T;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          key,
          event: 'cache_get_error',
        },
        'Error getting cached data',
      );
      return null;
    }
  }

  /**
   * Set cached data with options
   */
  async set<T = unknown>(key: string, data: T, options: CacheOptions = {}): Promise<boolean> {
    try {
      const {
        ttl = this.defaultTTL,
        compress = false,
        tableDependencies = [],
        tags = [],
      } = options;

      const cacheKey = this.keyPrefix + key;
      let serializedData = JSON.stringify(data);
      const dataSize = Buffer.byteLength(serializedData, 'utf-8');

      // Auto-compress large data
      const shouldCompress = compress || dataSize > this.compressionThreshold;
      if (shouldCompress) {
        const compressed = gzipSync(serializedData);
        serializedData = 'gzip:' + compressed.toString('base64');
      }

      // Set data in Redis with TTL
      const result = await this.redis.setex(cacheKey, ttl, serializedData);

      // Store metadata in PostgreSQL
      if (hasPgConfig()) {
        await this.storeCacheMetadata(key, {
          tableDependencies,
          dataSize,
          tags,
          ttl,
        });
      }

      logger.debug(
        {
          key,
          dataSize,
          compressed: shouldCompress,
          ttl,
          event: 'cache_set',
        },
        'Data cached successfully',
      );

      return result === 'OK';
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          key,
          event: 'cache_set_error',
        },
        'Error setting cached data',
      );
      return false;
    }
  }

  /**
   * Delete cached data by key
   */
  async delete(key: string): Promise<boolean> {
    try {
      const cacheKey = this.keyPrefix + key;
      const result = await this.redis.del(cacheKey);

      // Remove metadata
      if (hasPgConfig()) {
        await runPostgresQuery('DELETE FROM query_cache_metadata WHERE cache_key = $1', [key]);
      }

      return result > 0;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          key,
          event: 'cache_delete_error',
        },
        'Error deleting cached data',
      );
      return false;
    }
  }

  /**
   * Delete cached data by pattern
   */
  async deleteByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(this.keyPrefix + pattern);
      if (keys.length === 0) return 0;

      const result = await this.redis.del(...keys);

      // Remove metadata for matching keys
      if (hasPgConfig()) {
        const cacheKeys = keys.map((key) => key.replace(this.keyPrefix, ''));
        await runPostgresQuery('DELETE FROM query_cache_metadata WHERE cache_key = ANY($1)', [
          cacheKeys,
        ]);
      }

      return result;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          pattern,
          event: 'cache_delete_pattern_error',
        },
        'Error deleting cached data by pattern',
      );
      return 0;
    }
  }

  /**
   * Clear all cache data
   */
  async clear(): Promise<boolean> {
    try {
      const keys = await this.redis.keys(this.keyPrefix + '*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      // Clear metadata
      if (hasPgConfig()) {
        await runPostgresQuery('DELETE FROM query_cache_metadata', []);
      }

      logger.info({ keysDeleted: keys.length, event: 'cache_cleared' }, 'Cache cleared');
      return true;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'cache_clear_error',
        },
        'Error clearing cache',
      );
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      // Get Redis info
      const redisInfo = await this.redis.info('memory');
      const memoryUsage = this.parseRedisMemoryInfo(redisInfo);

      // Get total keys
      const keys = await this.redis.keys(this.keyPrefix + '*');
      const totalKeys = keys.length;

      // Get PostgreSQL stats
      let pgStats = {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        hitRate: 0,
        avgResponseTime: 0,
      };

      if (hasPgConfig()) {
        const statsResult = await runPostgresQuery<{
          total_requests: string;
          cache_hits: string;
          cache_misses: string;
          hit_rate: string;
          avg_response_time_ms: number;
        }>(`
          SELECT 
            COALESCE(SUM(total_requests), 0)::text as total_requests,
            COALESCE(SUM(cache_hits), 0)::text as cache_hits,
            COALESCE(SUM(cache_misses), 0)::text as cache_misses,
            CASE 
              WHEN SUM(total_requests) > 0 
              THEN ROUND((SUM(cache_hits)::NUMERIC / SUM(total_requests)) * 100, 2)::text
              ELSE '0' 
            END as hit_rate,
            COALESCE(AVG(avg_response_time_ms), 0)::integer as avg_response_time_ms
          FROM cache_statistics 
          WHERE date >= CURRENT_DATE - INTERVAL '7 days'
        `);

        if (statsResult.length > 0) {
          const row = statsResult[0];
          pgStats = {
            totalRequests: parseInt(row.total_requests, 10),
            cacheHits: parseInt(row.cache_hits, 10),
            cacheMisses: parseInt(row.cache_misses, 10),
            hitRate: parseFloat(row.hit_rate),
            avgResponseTime: row.avg_response_time_ms,
          };
        }
      }

      // Count expired keys (keys with TTL < 60 seconds)
      let expiredKeys = 0;
      for (const key of keys.slice(0, 100)) {
        // Sample first 100 keys
        const ttl = await this.redis.ttl(key);
        if (ttl > 0 && ttl < 60) {
          expiredKeys++;
        }
      }

      return {
        ...pgStats,
        totalCacheSize: memoryUsage,
        totalKeys,
        expiredKeys: Math.round(expiredKeys * (totalKeys / 100)),
      };
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'cache_stats_error',
        },
        'Error getting cache stats',
      );

      return {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        hitRate: 0,
        totalCacheSize: 0,
        avgResponseTime: 0,
        totalKeys: 0,
        expiredKeys: 0,
      };
    }
  }

  /**
   * Get all cache keys with metadata
   */
  async getKeys(limit = 100, offset = 0): Promise<CacheMetadata[]> {
    try {
      if (!hasPgConfig()) {
        // Fallback to Redis-only data
        const keys = await this.redis.keys(this.keyPrefix + '*');
        const limitedKeys = keys.slice(offset, offset + limit);

        const metadata: CacheMetadata[] = [];
        for (const redisKey of limitedKeys) {
          const key = redisKey.replace(this.keyPrefix, '');
          const ttl = await this.redis.ttl(redisKey);
          const size = await this.redis.memory('USAGE', redisKey);

          metadata.push({
            key,
            queryHash: '',
            tableDependencies: [],
            hitCount: 0,
            createdAt: new Date(),
            expiresAt: ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined,
            dataSize: size || 0,
            tags: [],
          });
        }

        return metadata;
      }

      const result = await runPostgresQuery<{
        cache_key: string;
        query_hash: string;
        table_dependencies: string[];
        hit_count: string;
        created_at: string;
        expires_at: string | null;
        data_size: string | null;
        query_execution_time_ms: number | null;
        created_by: string | null;
        tags: string[];
      }>(
        `
        SELECT 
          cache_key,
          query_hash,
          table_dependencies,
          hit_count::text,
          created_at::text,
          expires_at::text,
          data_size::text,
          query_execution_time_ms,
          created_by,
          tags
        FROM query_cache_metadata 
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `,
        [limit, offset],
      );

      return result.map((row) => ({
        key: row.cache_key,
        queryHash: row.query_hash,
        tableDependencies: row.table_dependencies || [],
        hitCount: parseInt(row.hit_count, 10),
        createdAt: new Date(row.created_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
        dataSize: row.data_size ? parseInt(row.data_size, 10) : undefined,
        queryExecutionTime: row.query_execution_time_ms || undefined,
        createdBy: row.created_by || undefined,
        tags: row.tags || [],
      }));
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'cache_get_keys_error',
        },
        'Error getting cache keys',
      );
      return [];
    }
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupExpired(): Promise<number> {
    try {
      let deletedCount = 0;

      // Cleanup Redis expired keys (Redis does this automatically, but we can help)
      const keys = await this.redis.keys(this.keyPrefix + '*');
      const expiredKeys: string[] = [];

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -2) {
          // Key doesn't exist (expired)
          expiredKeys.push(key);
        }
      }

      if (expiredKeys.length > 0) {
        deletedCount += expiredKeys.length;
      }

      // Cleanup PostgreSQL metadata
      if (hasPgConfig()) {
        const pgResult = await runPostgresQuery<{ cleanup_expired_cache_metadata: number }>(`
          SELECT cleanup_expired_cache_metadata() as cleanup_expired_cache_metadata
        `);
        deletedCount += pgResult[0]?.cleanup_expired_cache_metadata || 0;
      }

      if (deletedCount > 0) {
        logger.info(
          {
            deletedCount,
            event: 'cache_cleanup_expired',
          },
          'Cleaned up expired cache entries',
        );
      }

      return deletedCount;
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'cache_cleanup_error',
        },
        'Error cleaning up expired cache entries',
      );
      return 0;
    }
  }

  /**
   * Check if Redis is connected and healthy
   */
  async healthCheck(): Promise<{ connected: boolean; latency?: number }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      return { connected: true, latency };
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          event: 'cache_health_check_error',
        },
        'Redis health check failed',
      );
      return { connected: false };
    }
  }

  private async updateHitStats(key: string): Promise<void> {
    if (!hasPgConfig()) return;

    try {
      await runPostgresQuery(
        `
        INSERT INTO cache_statistics (date, total_requests, cache_hits)
        VALUES (CURRENT_DATE, 1, 1)
        ON CONFLICT (date) 
        DO UPDATE SET 
          total_requests = cache_statistics.total_requests + 1,
          cache_hits = cache_statistics.cache_hits + 1;
          
        UPDATE query_cache_metadata 
        SET 
          hit_count = hit_count + 1,
          last_hit_at = CURRENT_TIMESTAMP
        WHERE cache_key = $1;
      `,
        [key],
      );
    } catch (error) {
      // Don't throw, just log
      logger.warn(
        {
          error: (error as Error).message,
          key,
        },
        'Failed to update hit stats',
      );
    }
  }

  private async trackCacheMiss(): Promise<void> {
    if (!hasPgConfig()) return;

    try {
      await runPostgresQuery(`
        INSERT INTO cache_statistics (date, total_requests, cache_misses)
        VALUES (CURRENT_DATE, 1, 1)
        ON CONFLICT (date) 
        DO UPDATE SET 
          total_requests = cache_statistics.total_requests + 1,
          cache_misses = cache_statistics.cache_misses + 1;
      `);
    } catch (error) {
      // Don't throw, just log
      logger.warn(
        {
          error: (error as Error).message,
        },
        'Failed to track cache miss',
      );
    }
  }

  private async storeCacheMetadata(
    key: string,
    options: {
      tableDependencies: string[];
      dataSize: number;
      tags: string[];
      ttl: number;
    },
  ): Promise<void> {
    try {
      const queryHash = crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);

      const expiresAt = new Date(Date.now() + options.ttl * 1000);

      await runPostgresQuery(
        `
        INSERT INTO query_cache_metadata (
          cache_key, query_hash, table_dependencies, data_size, expires_at, tags
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (cache_key) 
        DO UPDATE SET 
          query_hash = EXCLUDED.query_hash,
          table_dependencies = EXCLUDED.table_dependencies,
          data_size = EXCLUDED.data_size,
          expires_at = EXCLUDED.expires_at,
          tags = EXCLUDED.tags
      `,
        [key, queryHash, options.tableDependencies, options.dataSize, expiresAt, options.tags],
      );
    } catch (error) {
      logger.warn(
        {
          error: (error as Error).message,
          key,
        },
        'Failed to store cache metadata',
      );
    }
  }

  private parseRedisMemoryInfo(info: string): number {
    const lines = info.split('\n');
    const memoryLine = lines.find((line) => line.startsWith('used_memory:'));
    if (memoryLine) {
      return parseInt(memoryLine.split(':')[1], 10);
    }
    return 0;
  }
}

// Singleton instance
export const cacheManager = new CacheManager();
