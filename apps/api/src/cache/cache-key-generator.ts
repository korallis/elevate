import crypto from 'crypto';

export interface QueryContext {
  sql?: string;
  database?: string;
  schema?: string;
  table?: string;
  columns?: string[];
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  orderBy?: string[];
  userId?: string;
  orgId?: string;
  [key: string]: unknown;
}

export interface CacheKeyOptions {
  includeUser?: boolean;
  includeOrg?: boolean;
  includeTiming?: boolean;
  customPrefix?: string;
  hashLongQueries?: boolean;
  maxKeyLength?: number;
}

/**
 * Generate consistent cache keys for queries and data
 */
export class CacheKeyGenerator {
  private static readonly DEFAULT_MAX_KEY_LENGTH = 250;
  private static readonly HASH_THRESHOLD = 100; // Hash SQL queries longer than this

  /**
   * Generate a cache key for a SQL query
   */
  static forQuery(context: QueryContext, options: CacheKeyOptions = {}): string {
    const {
      includeUser = false,
      includeOrg = true,
      includeTiming = false,
      customPrefix = 'query',
      hashLongQueries = true,
      maxKeyLength = this.DEFAULT_MAX_KEY_LENGTH,
    } = options;

    const parts: string[] = [customPrefix];

    // Add database/schema/table context
    if (context.database) {
      parts.push(`db:${this.sanitize(context.database)}`);
    }
    if (context.schema) {
      parts.push(`schema:${this.sanitize(context.schema)}`);
    }
    if (context.table) {
      parts.push(`table:${this.sanitize(context.table)}`);
    }

    // Add organizational context
    if (includeOrg && context.orgId) {
      parts.push(`org:${context.orgId}`);
    }
    if (includeUser && context.userId) {
      parts.push(`user:${context.userId}`);
    }

    // Handle SQL query
    if (context.sql) {
      const normalizedSql = this.normalizeSql(context.sql);
      if (hashLongQueries && normalizedSql.length > this.HASH_THRESHOLD) {
        const sqlHash = this.hashString(normalizedSql);
        parts.push(`sql:${sqlHash}`);
      } else {
        parts.push(`sql:${this.sanitize(normalizedSql)}`);
      }
    }

    // Add columns if specified
    if (context.columns?.length) {
      const columnsStr = context.columns.sort().join(',');
      parts.push(`cols:${this.sanitize(columnsStr)}`);
    }

    // Add filters (sorted for consistency)
    if (context.filters && Object.keys(context.filters).length > 0) {
      const filterPairs = Object.entries(context.filters)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${this.serializeValue(value)}`);
      parts.push(`filters:${this.sanitize(filterPairs.join(','))}`);
    }

    // Add pagination
    if (context.limit !== undefined) {
      parts.push(`limit:${context.limit}`);
    }
    if (context.offset !== undefined) {
      parts.push(`offset:${context.offset}`);
    }

    // Add sorting
    if (context.orderBy?.length) {
      const orderStr = context.orderBy.join(',');
      parts.push(`order:${this.sanitize(orderStr)}`);
    }

    // Add timing if requested (for time-sensitive queries)
    if (includeTiming) {
      const hourly = Math.floor(Date.now() / (60 * 60 * 1000));
      parts.push(`time:${hourly}`);
    }

    let key = parts.join(':');

    // Ensure key doesn't exceed maximum length
    if (key.length > maxKeyLength) {
      const prefix = parts[0];
      const suffix = this.hashString(key);
      key = `${prefix}:hash:${suffix}`;
    }

    return key;
  }

  /**
   * Generate a cache key for catalog/discovery data
   */
  static forCatalog(
    database: string,
    schema: string,
    table?: string,
    options: CacheKeyOptions = {},
  ): string {
    const { customPrefix = 'catalog', includeOrg = true } = options;

    const context: QueryContext = {
      database,
      schema,
      table,
      orgId: options.includeOrg ? 'shared' : undefined,
    };

    return this.forQuery(context, { ...options, customPrefix });
  }

  /**
   * Generate a cache key for transformation results
   */
  static forTransformation(
    transformationId: string,
    version: number,
    inputHash?: string,
    options: CacheKeyOptions = {},
  ): string {
    const { customPrefix = 'transform' } = options;
    const parts = [customPrefix, `id:${this.sanitize(transformationId)}`, `v:${version}`];

    if (inputHash) {
      parts.push(`input:${inputHash}`);
    }

    return parts.join(':');
  }

  /**
   * Generate a cache key for dashboard data
   */
  static forDashboard(
    dashboardId: string,
    widgetId?: string,
    filters?: Record<string, unknown>,
    options: CacheKeyOptions = {},
  ): string {
    const { customPrefix = 'dashboard', includeUser = false } = options;

    const context: QueryContext = {
      userId: includeUser ? options.includeUser?.toString() : undefined,
      filters,
    };

    const parts = [customPrefix, `id:${this.sanitize(dashboardId)}`];

    if (widgetId) {
      parts.push(`widget:${this.sanitize(widgetId)}`);
    }

    // Add filters if present
    if (context.filters && Object.keys(context.filters).length > 0) {
      const filterHash = this.hashString(JSON.stringify(context.filters));
      parts.push(`filters:${filterHash}`);
    }

    if (context.userId) {
      parts.push(`user:${context.userId}`);
    }

    return parts.join(':');
  }

  /**
   * Generate a cache key for export operations
   */
  static forExport(format: string, queryHash: string, options: CacheKeyOptions = {}): string {
    const { customPrefix = 'export', includeUser = true } = options;

    const parts = [customPrefix, `format:${this.sanitize(format)}`, `query:${queryHash}`];

    if (includeUser && options.includeUser) {
      parts.push(`user:${options.includeUser}`);
    }

    return parts.join(':');
  }

  /**
   * Generate a cache key for ETL/workflow results
   */
  static forETL(
    workflowId: string,
    runId: string,
    step?: string,
    options: CacheKeyOptions = {},
  ): string {
    const { customPrefix = 'etl' } = options;

    const parts = [
      customPrefix,
      `workflow:${this.sanitize(workflowId)}`,
      `run:${this.sanitize(runId)}`,
    ];

    if (step) {
      parts.push(`step:${this.sanitize(step)}`);
    }

    return parts.join(':');
  }

  /**
   * Generate a pattern for invalidating related cache keys
   */
  static forInvalidationPattern(database: string, schema: string, table: string): string {
    return `*:db:${this.sanitize(database)}:schema:${this.sanitize(schema)}:table:${this.sanitize(table)}*`;
  }

  /**
   * Parse table dependencies from SQL query
   */
  static extractTableDependencies(sql: string): string[] {
    const dependencies: string[] = [];
    const normalizedSql = sql.toUpperCase();

    // Simple regex to extract FROM and JOIN clauses
    // This is a basic implementation - in production you might want to use a SQL parser
    const patterns = [
      /FROM\s+([`"]?)([^`"\s,]+)\1/gi,
      /JOIN\s+([`"]?)([^`"\s,]+)\1/gi,
      /UPDATE\s+([`"]?)([^`"\s,]+)\1/gi,
      /INSERT\s+INTO\s+([`"]?)([^`"\s,]+)\1/gi,
      /DELETE\s+FROM\s+([`"]?)([^`"\s,]+)\1/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        const tableName = match[2];
        if (tableName && !dependencies.includes(tableName)) {
          dependencies.push(tableName);
        }
      }
    });

    return dependencies.map((dep) => this.sanitize(dep)).filter(Boolean);
  }

  /**
   * Create a hash of a query for deduplication
   */
  static hashQuery(sql: string, context: Partial<QueryContext> = {}): string {
    const normalizedSql = this.normalizeSql(sql);
    const contextStr = JSON.stringify(context, Object.keys(context).sort());
    const combined = `${normalizedSql}:${contextStr}`;
    return this.hashString(combined);
  }

  private static normalizeSql(sql: string): string {
    return sql
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^\s+|\s+$/g, '') // Trim
      .toLowerCase();
  }

  private static sanitize(value: string): string {
    return value
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private static serializeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'object') {
      return this.hashString(JSON.stringify(value));
    }
    return String(value).replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  private static hashString(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16); // Use first 16 chars for shorter keys
  }
}

// Convenience functions for common use cases
export const generateCacheKey = CacheKeyGenerator.forQuery;
export const generateQueryHash = CacheKeyGenerator.hashQuery;
export const extractTableDeps = CacheKeyGenerator.extractTableDependencies;
