import { logger } from '../logger.js';
import { runPostgresQuery } from '../postgres.js';

interface OptimizationResult {
  originalSql: string;
  optimizedSql: string;
  optimizations: Optimization[];
  estimatedImprovementPercent: number;
}

interface Optimization {
  type:
    | 'index_suggestion'
    | 'query_rewrite'
    | 'limit_addition'
    | 'column_pruning'
    | 'join_optimization';
  description: string;
  impact: 'low' | 'medium' | 'high';
  applied: boolean;
}

interface TableStats {
  tableName: string;
  rowCount: number;
  avgRowSize: number;
  indexedColumns: string[];
}

export class QueryOptimizer {
  /**
   * Optimizes a SQL query for better performance
   */
  async optimizeQuery(
    sql: string,
    database: string,
    schema: string,
    options: {
      addLimits?: boolean;
      pruneColumns?: boolean;
      optimizeJoins?: boolean;
      suggestIndexes?: boolean;
    } = {},
  ): Promise<OptimizationResult> {
    logger.info({ sql: sql.substring(0, 100), database, schema }, 'Optimizing SQL query');

    const optimizations: Optimization[] = [];
    let optimizedSql = sql;
    let totalImpact = 0;

    try {
      // 1. Add missing LIMIT clauses
      if (options.addLimits !== false) {
        const limitResult = this.addMissingLimits(optimizedSql);
        if (limitResult.changed) {
          optimizedSql = limitResult.sql;
          optimizations.push({
            type: 'limit_addition',
            description: limitResult.description,
            impact: 'high',
            applied: true,
          });
          totalImpact += 30;
        }
      }

      // 2. Prune unnecessary columns
      if (options.pruneColumns) {
        const pruningResult = await this.pruneUnnecessaryColumns(optimizedSql, database, schema);
        if (pruningResult.changed) {
          optimizedSql = pruningResult.sql;
          optimizations.push({
            type: 'column_pruning',
            description: pruningResult.description,
            impact: 'medium',
            applied: true,
          });
          totalImpact += 20;
        }
      }

      // 3. Optimize JOIN operations
      if (options.optimizeJoins !== false) {
        const joinResult = this.optimizeJoins(optimizedSql);
        if (joinResult.changed) {
          optimizedSql = joinResult.sql;
          optimizations.push({
            type: 'join_optimization',
            description: joinResult.description,
            impact: joinResult.impact,
            applied: true,
          });
          totalImpact +=
            joinResult.impact === 'high' ? 25 : joinResult.impact === 'medium' ? 15 : 5;
        }
      }

      // 4. Rewrite query patterns for better performance
      const rewriteResult = this.rewriteQueryPatterns(optimizedSql);
      if (rewriteResult.changed) {
        optimizedSql = rewriteResult.sql;
        optimizations.push({
          type: 'query_rewrite',
          description: rewriteResult.description,
          impact: rewriteResult.impact,
          applied: true,
        });
        totalImpact +=
          rewriteResult.impact === 'high' ? 20 : rewriteResult.impact === 'medium' ? 10 : 5;
      }

      // 5. Generate index suggestions
      if (options.suggestIndexes !== false) {
        const indexSuggestions = await this.suggestIndexes(optimizedSql, database, schema);
        optimizations.push(...indexSuggestions);
      }

      // Cap the estimated improvement at 80%
      const estimatedImprovement = Math.min(totalImpact, 80);

      return {
        originalSql: sql,
        optimizedSql: optimizedSql.trim(),
        optimizations,
        estimatedImprovementPercent: estimatedImprovement,
      };
    } catch (error) {
      logger.error({ error, sql }, 'Error optimizing query');

      return {
        originalSql: sql,
        optimizedSql: sql,
        optimizations: [],
        estimatedImprovementPercent: 0,
      };
    }
  }

  /**
   * Adds LIMIT clauses to queries that don't have them
   */
  private addMissingLimits(sql: string): { sql: string; changed: boolean; description: string } {
    const sqlUpper = sql.toUpperCase();

    // Skip if already has LIMIT, or is an aggregation query
    if (
      sqlUpper.includes('LIMIT') ||
      sqlUpper.includes('COUNT(') ||
      sqlUpper.includes('SUM(') ||
      sqlUpper.includes('AVG(') ||
      sqlUpper.includes('GROUP BY')
    ) {
      return { sql, changed: false, description: '' };
    }

    // Add LIMIT before ORDER BY, or at the end
    let optimizedSql = sql.trim();

    if (sqlUpper.includes('ORDER BY')) {
      optimizedSql = optimizedSql.replace(/\s+ORDER\s+BY\s+/i, ' LIMIT 1000 ORDER BY ');
    } else {
      // Remove trailing semicolon if present
      optimizedSql = optimizedSql.replace(/;?\s*$/, '');
      optimizedSql += ' LIMIT 1000';
    }

    return {
      sql: optimizedSql,
      changed: true,
      description: 'Added LIMIT 1000 to prevent excessive data retrieval',
    };
  }

  /**
   * Removes unnecessary columns from SELECT *
   */
  private async pruneUnnecessaryColumns(
    sql: string,
    database: string,
    schema: string,
  ): Promise<{ sql: string; changed: boolean; description: string }> {
    // This is a simplified implementation - in practice, you'd need to analyze
    // the query context to determine which columns are actually needed

    if (!sql.includes('SELECT *')) {
      return { sql, changed: false, description: '' };
    }

    try {
      // Extract table name from FROM clause
      const fromMatch = sql.match(/FROM\s+([`"]?([^`"\s,()]+)[`"]?)/i);
      if (!fromMatch) {
        return { sql, changed: false, description: '' };
      }

      const tableName = fromMatch[2];

      // Get table columns from catalog
      const columns = await runPostgresQuery<{ column_name: string; data_type: string }>(
        'SELECT column_name, data_type FROM catalog_columns WHERE database_name = $1 AND schema_name = $2 AND table_name = $3 ORDER BY ordinal_position LIMIT 10',
        [database, schema, tableName],
      );

      if (columns.length === 0) {
        return { sql, changed: false, description: '' };
      }

      // Select first 10 columns to avoid extremely wide result sets
      const selectedColumns = columns
        .slice(0, 10)
        .map((col) => col.column_name)
        .join(', ');
      const optimizedSql = sql.replace('SELECT *', `SELECT ${selectedColumns}`);

      return {
        sql: optimizedSql,
        changed: true,
        description: `Replaced SELECT * with specific columns to reduce data transfer`,
      };
    } catch (error) {
      logger.error({ error, sql, database, schema }, 'Error pruning columns');
      return { sql, changed: false, description: '' };
    }
  }

  /**
   * Optimizes JOIN operations
   */
  private optimizeJoins(sql: string): {
    sql: string;
    changed: boolean;
    description: string;
    impact: Optimization['impact'];
  } {
    let optimizedSql = sql;
    let changed = false;
    const optimizations: string[] = [];

    // Convert CROSS JOINs to INNER JOINs where possible
    if (optimizedSql.toUpperCase().includes('CROSS JOIN')) {
      // This is a simplified check - would need more sophisticated parsing in practice
      const crossJoinRegex = /CROSS\s+JOIN/gi;
      if (crossJoinRegex.test(optimizedSql)) {
        optimizedSql = optimizedSql.replace(crossJoinRegex, 'INNER JOIN');
        changed = true;
        optimizations.push('Converted CROSS JOIN to INNER JOIN');
      }
    }

    // Suggest moving conditions from WHERE to ON clause for better performance
    const whereMatch = optimizedSql.match(
      /WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/is,
    );
    const joinMatches = optimizedSql.match(/JOIN\s+[^ON]+ON\s+[^WHERE]+/gi);

    if (whereMatch && joinMatches && whereMatch[1].includes('=')) {
      // This is a simplified optimization - would need proper SQL parsing
      optimizations.push('Consider moving JOIN conditions from WHERE to ON clause');
    }

    // Reorder JOINs to put smaller tables first (heuristic based)
    if (optimizedSql.toUpperCase().includes('JOIN') && optimizations.length === 0) {
      optimizations.push('Consider reordering JOINs to process smaller tables first');
    }

    const impact: Optimization['impact'] = changed
      ? 'high'
      : optimizations.length > 0
        ? 'medium'
        : 'low';

    return {
      sql: optimizedSql,
      changed,
      description: optimizations.join('; '),
      impact,
    };
  }

  /**
   * Rewrites common query patterns for better performance
   */
  private rewriteQueryPatterns(sql: string): {
    sql: string;
    changed: boolean;
    description: string;
    impact: Optimization['impact'];
  } {
    let optimizedSql = sql;
    const changed = false;
    const optimizations: string[] = [];

    // Replace OR conditions with UNION for better index usage
    if (sql.includes(' OR ') && !sql.toUpperCase().includes('WHERE (')) {
      // This is a very simplified check - proper implementation would need SQL parsing
      optimizations.push('Consider rewriting OR conditions as UNION for better index usage');
    }

    // Suggest using EXISTS instead of IN with subqueries
    if (sql.toUpperCase().includes('IN (SELECT')) {
      optimizedSql = optimizedSql.replace(/\bIN\s*\(\s*SELECT/gi, 'EXISTS (SELECT 1 FROM (SELECT');
      optimizedSql = optimizedSql.replace(
        /\)\s*\)/g,
        ') AS subq WHERE subq.column = main_table.column)',
      );
      // Note: This is a simplified replacement - actual implementation needs proper parsing
      optimizations.push('Consider using EXISTS instead of IN with subqueries');
    }

    // Replace LIKE with wildcards at the beginning with full-text search suggestions
    if (sql.includes("LIKE '%")) {
      optimizations.push('Consider using full-text search instead of LIKE with leading wildcards');
    }

    // Suggest using appropriate date functions
    if (sql.includes('YEAR(') || sql.includes('MONTH(') || sql.includes('DAY(')) {
      optimizations.push(
        'Consider using date range conditions instead of date functions for better index usage',
      );
    }

    const impact: Optimization['impact'] = changed
      ? 'high'
      : optimizations.length > 1
        ? 'medium'
        : 'low';

    return {
      sql: optimizedSql,
      changed,
      description: optimizations.join('; '),
      impact,
    };
  }

  /**
   * Suggests indexes that could improve query performance
   */
  private async suggestIndexes(
    sql: string,
    database: string,
    schema: string,
  ): Promise<Optimization[]> {
    const suggestions: Optimization[] = [];

    try {
      // Extract WHERE clause conditions
      const whereConditions = this.extractWhereConditions(sql);

      // Extract JOIN conditions
      const joinConditions = this.extractJoinConditions(sql);

      // Extract ORDER BY columns
      const orderByColumns = this.extractOrderByColumns(sql);

      // Suggest indexes for WHERE conditions
      for (const condition of whereConditions) {
        suggestions.push({
          type: 'index_suggestion',
          description: `Consider creating an index on column '${condition}' used in WHERE clause`,
          impact: 'medium',
          applied: false,
        });
      }

      // Suggest indexes for JOIN conditions
      for (const condition of joinConditions) {
        suggestions.push({
          type: 'index_suggestion',
          description: `Consider creating an index on column '${condition}' used in JOIN condition`,
          impact: 'high',
          applied: false,
        });
      }

      // Suggest composite indexes for ORDER BY
      if (orderByColumns.length > 1) {
        suggestions.push({
          type: 'index_suggestion',
          description: `Consider creating a composite index on columns (${orderByColumns.join(', ')}) used in ORDER BY`,
          impact: 'medium',
          applied: false,
        });
      }
    } catch (error) {
      logger.error({ error, sql }, 'Error suggesting indexes');
    }

    return suggestions;
  }

  /**
   * Extracts column names from WHERE conditions
   */
  private extractWhereConditions(sql: string): string[] {
    const conditions: string[] = [];

    try {
      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/is);
      if (whereMatch) {
        const whereClause = whereMatch[1];

        // Extract column names from simple conditions (simplified approach)
        const columnMatches = whereClause.match(/(\w+)\s*[=<>]/g);
        if (columnMatches) {
          for (const match of columnMatches) {
            const column = match.replace(/\s*[=<>].*$/, '').trim();
            if (!conditions.includes(column)) {
              conditions.push(column);
            }
          }
        }
      }
    } catch (error) {
      logger.warn({ error, sql }, 'Error extracting WHERE conditions');
    }

    return conditions;
  }

  /**
   * Extracts column names from JOIN conditions
   */
  private extractJoinConditions(sql: string): string[] {
    const conditions: string[] = [];

    try {
      const joinMatches = sql.match(/JOIN\s+[^ON]+ON\s+([^WHERE\s]+)/gi);
      if (joinMatches) {
        for (const match of joinMatches) {
          const onClause = match.replace(/^.*ON\s+/i, '');
          const columnMatches = onClause.match(/(\w+\.\w+|\w+)/g);

          if (columnMatches) {
            for (const column of columnMatches) {
              if (column.includes('.')) {
                const columnName = column.split('.')[1];
                if (!conditions.includes(columnName)) {
                  conditions.push(columnName);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logger.warn({ error, sql }, 'Error extracting JOIN conditions');
    }

    return conditions;
  }

  /**
   * Extracts column names from ORDER BY clause
   */
  private extractOrderByColumns(sql: string): string[] {
    const columns: string[] = [];

    try {
      const orderByMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/is);
      if (orderByMatch) {
        const orderByClause = orderByMatch[1];
        const columnMatches = orderByClause.split(',');

        for (const match of columnMatches) {
          const column = match
            .trim()
            .replace(/\s+(ASC|DESC)$/i, '')
            .replace(/.*\./, '');
          if (!columns.includes(column)) {
            columns.push(column);
          }
        }
      }
    } catch (error) {
      logger.warn({ error, sql }, 'Error extracting ORDER BY columns');
    }

    return columns;
  }

  /**
   * Analyzes query execution plan (placeholder for integration with actual database)
   */
  async analyzeExecutionPlan(
    _sql: string,
    _database: string,
    _schema: string,
  ): Promise<{
    estimatedCost: number;
    bottlenecks: string[];
    recommendations: string[];
  }> {
    // This would integrate with the actual database's EXPLAIN PLAN functionality
    // For now, return a placeholder result

    return {
      estimatedCost: 100, // In query units
      bottlenecks: ['Table scan on large table', 'Missing index on join column'],
      recommendations: [
        'Add index on frequently filtered columns',
        'Consider partitioning large tables',
        'Use LIMIT clauses to reduce data transfer',
      ],
    };
  }

  /**
   * Gets table statistics for optimization decisions
   */
  private async getTableStats(
    _database: string,
    _schema: string,
    tableName: string,
  ): Promise<TableStats | null> {
    try {
      // In a real implementation, this would query the database's statistics tables
      // For now, return placeholder data

      return {
        tableName,
        rowCount: 1000000, // Would come from actual table stats
        avgRowSize: 256, // Would come from actual table stats
        indexedColumns: ['id', 'created_at'], // Would come from actual index information
      };
    } catch (error) {
      logger.error({ error, database, schema, tableName }, 'Error getting table statistics');
      return null;
    }
  }
}

export const queryOptimizer = new QueryOptimizer();
