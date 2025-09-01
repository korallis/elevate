import { z } from 'zod';
import type { Pool } from 'pg';
import { MetricQuerySchema, type MetricQuery, emitSql } from '@sme/schemas';

// Extended schemas for preview functionality
export const PreviewQuerySchema = MetricQuerySchema.extend({
  sampleSize: z.number().int().positive().max(1000).default(100),
  includeStats: z.boolean().default(false),
});

export type PreviewQuery = z.infer<typeof PreviewQuerySchema>;

export const PreviewResultSchema = z.object({
  data: z.array(z.record(z.unknown())),
  sql: z.string(),
  executionTimeMs: z.number(),
  rowCount: z.number(),
  columnInfo: z.array(z.object({
    name: z.string(),
    type: z.string(),
    nullable: z.boolean().optional(),
  })),
  stats: z.object({
    distinctValues: z.record(z.number()),
    nullCounts: z.record(z.number()),
    sampleStats: z.record(z.object({
      min: z.unknown().optional(),
      max: z.unknown().optional(),
      avg: z.number().optional(),
    })).optional(),
  }).optional(),
});

export type PreviewResult = z.infer<typeof PreviewResultSchema>;

export class SemanticPreview {
  constructor(private pg: Pool) {}

  /**
   * Execute a preview query with sample data and optional statistics
   */
  async executePreview(query: PreviewQuery): Promise<PreviewResult> {
    const startTime = Date.now();
    
    try {
      // Validate the query first
      const validatedQuery = PreviewQuerySchema.parse(query);
      
      // Generate the base SQL
      const baseSql = emitSql({
        metric: validatedQuery.metric,
        dimensions: validatedQuery.dimensions,
        filters: validatedQuery.filters,
        limit: validatedQuery.sampleSize,
      });

      // Execute the query
      const result = await this.pg.query(baseSql);
      const executionTime = Date.now() - startTime;

      // Extract column information
      const columnInfo = result.fields.map(field => ({
        name: field.name,
        type: this.mapPostgresType(field.dataTypeID),
        nullable: true, // PostgreSQL doesn't provide this info easily
      }));

      let stats = undefined;
      
      if (validatedQuery.includeStats && result.rows.length > 0) {
        stats = await this.calculateStats(result.rows, columnInfo);
      }

      return {
        data: result.rows,
        sql: baseSql,
        executionTimeMs: executionTime,
        rowCount: result.rows.length,
        columnInfo,
        stats,
      };
    } catch (error) {
      throw new Error(`Preview query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate a metric query without executing it
   */
  async validateQuery(query: MetricQuery): Promise<{ valid: boolean; sql: string; errors?: string[] }> {
    try {
      const validatedQuery = MetricQuerySchema.parse(query);
      const sql = emitSql(validatedQuery);
      
      // Try to explain the query to validate it without execution
      const explainSql = `EXPLAIN ${sql}`;
      await this.pg.query(explainSql);
      
      return {
        valid: true,
        sql,
      };
    } catch (error) {
      return {
        valid: false,
        sql: '',
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
      };
    }
  }

  /**
   * Get sample data from a table for dimension exploration
   */
  async getSampleData(tableName: string, columnName: string, limit: number = 100): Promise<{
    values: unknown[];
    distinctCount: number;
    nullCount: number;
    sampleSize: number;
  }> {
    try {
      // Validate table and column names to prevent SQL injection
      if (!this.isValidIdentifier(tableName) || !this.isValidIdentifier(columnName)) {
        throw new Error('Invalid table or column name');
      }

      const sql = `
        SELECT 
          "${columnName}" as value,
          COUNT(*) as frequency
        FROM "${tableName}" 
        WHERE "${columnName}" IS NOT NULL
        GROUP BY "${columnName}"
        ORDER BY frequency DESC, "${columnName}"
        LIMIT $1
      `;

      const nullCountSql = `
        SELECT COUNT(*) as null_count
        FROM "${tableName}" 
        WHERE "${columnName}" IS NULL
      `;

      const distinctCountSql = `
        SELECT COUNT(DISTINCT "${columnName}") as distinct_count
        FROM "${tableName}"
      `;

      const [valuesResult, nullResult, distinctResult] = await Promise.all([
        this.pg.query(sql, [limit]),
        this.pg.query(nullCountSql),
        this.pg.query(distinctCountSql),
      ]);

      return {
        values: valuesResult.rows.map(row => row.value),
        distinctCount: parseInt(distinctResult.rows[0].distinct_count),
        nullCount: parseInt(nullResult.rows[0].null_count),
        sampleSize: valuesResult.rows.length,
      };
    } catch (error) {
      throw new Error(`Failed to get sample data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get schema information for a table
   */
  async getTableSchema(tableName: string): Promise<{
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      defaultValue: string | null;
    }>;
    primaryKeys: string[];
  }> {
    try {
      if (!this.isValidIdentifier(tableName)) {
        throw new Error('Invalid table name');
      }

      const columnsSql = `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
      `;

      const pkSql = `
        SELECT a.attname as column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary
      `;

      const [columnsResult, pkResult] = await Promise.all([
        this.pg.query(columnsSql, [tableName]),
        this.pg.query(pkSql, [tableName]),
      ]);

      return {
        columns: columnsResult.rows.map(row => ({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          defaultValue: row.column_default,
        })),
        primaryKeys: pkResult.rows.map(row => row.column_name),
      };
    } catch (error) {
      throw new Error(`Failed to get table schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate basic statistics for the result data
   */
  private async calculateStats(data: any[], columnInfo: Array<{ name: string; type: string }>): Promise<{
    distinctValues: Record<string, number>;
    nullCounts: Record<string, number>;
    sampleStats?: Record<string, { min?: unknown; max?: unknown; avg?: number }>;
  }> {
    const distinctValues: Record<string, number> = {};
    const nullCounts: Record<string, number> = {};
    const sampleStats: Record<string, { min?: unknown; max?: unknown; avg?: number }> = {};

    columnInfo.forEach(column => {
      const values = data.map(row => row[column.name]);
      const nonNullValues = values.filter(v => v !== null && v !== undefined);
      
      distinctValues[column.name] = new Set(nonNullValues).size;
      nullCounts[column.name] = values.length - nonNullValues.length;

      // Calculate stats for numeric columns
      if (column.type.includes('int') || column.type.includes('numeric') || column.type.includes('float') || column.type.includes('double')) {
        const numericValues = nonNullValues.filter(v => typeof v === 'number').map(v => Number(v));
        if (numericValues.length > 0) {
          sampleStats[column.name] = {
            min: Math.min(...numericValues),
            max: Math.max(...numericValues),
            avg: numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length,
          };
        }
      }
    });

    return {
      distinctValues,
      nullCounts,
      sampleStats: Object.keys(sampleStats).length > 0 ? sampleStats : undefined,
    };
  }

  /**
   * Map PostgreSQL type IDs to readable type names
   */
  private mapPostgresType(typeId: number): string {
    // Common PostgreSQL type OIDs
    const typeMap: Record<number, string> = {
      16: 'boolean',
      17: 'bytea',
      20: 'bigint',
      21: 'smallint',
      23: 'integer',
      25: 'text',
      700: 'real',
      701: 'double precision',
      1043: 'varchar',
      1082: 'date',
      1114: 'timestamp',
      1184: 'timestamptz',
      1700: 'numeric',
    };

    return typeMap[typeId] || 'unknown';
  }

  /**
   * Validate SQL identifiers to prevent injection
   */
  private isValidIdentifier(identifier: string): boolean {
    // Allow alphanumeric characters, underscores, and some common characters
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return validPattern.test(identifier) && identifier.length <= 63; // PostgreSQL identifier limit
  }

  /**
   * Execute a raw SQL query for advanced previews (use with caution)
   */
  async executeRawPreview(sql: string, params: any[] = [], limit: number = 1000): Promise<PreviewResult> {
    const startTime = Date.now();
    
    try {
      // Add LIMIT clause if not present to prevent runaway queries
      let safeSql = sql.trim();
      if (!safeSql.toLowerCase().includes('limit ')) {
        safeSql += ` LIMIT ${Math.min(limit, 1000)}`;
      }

      const result = await this.pg.query(safeSql, params);
      const executionTime = Date.now() - startTime;

      const columnInfo = result.fields.map(field => ({
        name: field.name,
        type: this.mapPostgresType(field.dataTypeID),
        nullable: true,
      }));

      return {
        data: result.rows,
        sql: safeSql,
        executionTimeMs: executionTime,
        rowCount: result.rows.length,
        columnInfo,
      };
    } catch (error) {
      throw new Error(`Raw preview query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export utility functions
export const createSemanticPreview = (pg: Pool): SemanticPreview => {
  return new SemanticPreview(pg);
};

export const validatePreviewQuery = (query: unknown): PreviewQuery => {
  return PreviewQuerySchema.parse(query);
};