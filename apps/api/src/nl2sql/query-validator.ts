import { guardrailsSystem, GuardrailsSystem } from './guardrails.js';
import { logger } from '../logger.js';
import { runPostgresQuery } from '../postgres.js';

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedSql?: string;
  estimatedCost?: CostEstimate;
}

interface ValidationError {
  type: 'syntax' | 'security' | 'permission' | 'complexity' | 'cost';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestion?: string;
  line?: number;
  column?: number;
}

interface ValidationWarning {
  type: 'performance' | 'best_practice' | 'data_quality';
  message: string;
  suggestion?: string;
}

interface CostEstimate {
  estimatedBytesScanned: number;
  estimatedCostUsd: number;
  warehouseSize: string;
  explanation: string;
}

interface SqlParseResult {
  tables: string[];
  columns: string[];
  operations: string[];
  hasWildcard: boolean;
  hasJoins: boolean;
  hasSubqueries: boolean;
  hasAggregations: boolean;
  hasLimit: boolean;
  limitValue?: number;
}

export class QueryValidator {
  private guardrails: GuardrailsSystem;

  constructor(guardrailsInstance?: GuardrailsSystem) {
    this.guardrails = guardrailsInstance || guardrailsSystem;
  }

  /**
   * Validates a SQL query comprehensively
   */
  async validateQuery(
    sql: string,
    database: string,
    schema: string,
    userId?: number,
  ): Promise<ValidationResult> {
    logger.info({ sql: sql.substring(0, 100), database, schema }, 'Validating SQL query');

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // 1. Basic syntax validation
      const syntaxErrors = this.validateSyntax(sql);
      errors.push(...syntaxErrors);

      if (syntaxErrors.length > 0) {
        return {
          isValid: false,
          errors,
          warnings,
        };
      }

      // 2. Parse SQL to extract information
      const parseResult = this.parseSql(sql);

      // 3. Security and guardrail validation
      const guardrailResult = await this.guardrails.validateQuery(sql, database, schema, userId);
      errors.push(
        ...guardrailResult.violations.map((v) => ({
          type: this.mapViolationToErrorType(v.type),
          message: v.message,
          severity: v.severity,
          suggestion: v.suggestion,
        })),
      );

      warnings.push(
        ...guardrailResult.warnings.map((w) => ({
          type: this.mapViolationToWarningType(w.type),
          message: w.message,
          suggestion: w.suggestion,
        })),
      );

      // 4. Performance validation
      const performanceWarnings = this.validatePerformance(parseResult, sql);
      warnings.push(...performanceWarnings);

      // 5. Best practices validation
      const bestPracticeWarnings = this.validateBestPractices(parseResult, sql);
      warnings.push(...bestPracticeWarnings);

      // 6. Estimate query cost
      const costEstimate = await this.estimateQueryCost(parseResult, database, schema);

      if (costEstimate && costEstimate.estimatedCostUsd > this.guardrails.getConfig().maxCostUsd) {
        errors.push({
          type: 'cost',
          message: `Estimated cost ($${costEstimate.estimatedCostUsd.toFixed(2)}) exceeds maximum allowed cost ($${this.guardrails.getConfig().maxCostUsd})`,
          severity: 'high',
          suggestion: 'Add more selective WHERE clauses or LIMIT the result set',
        });
      }

      // 7. Sanitize SQL if valid
      let sanitizedSql: string | undefined;
      if (errors.length === 0) {
        sanitizedSql = this.sanitizeSql(sql);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        sanitizedSql,
        estimatedCost: costEstimate,
      };
    } catch (error) {
      logger.error({ error, sql }, 'Error during query validation');

      return {
        isValid: false,
        errors: [
          {
            type: 'syntax',
            message: 'Query validation failed due to an internal error',
            severity: 'critical',
            suggestion: 'Please check your SQL syntax and try again',
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Performs basic SQL syntax validation
   */
  private validateSyntax(sql: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Remove comments and normalize whitespace
    const cleanSql = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    if (!cleanSql) {
      errors.push({
        type: 'syntax',
        message: 'Query is empty',
        severity: 'critical',
        suggestion: 'Please provide a valid SQL query',
      });
      return errors;
    }

    // Check for basic syntax patterns
    const sqlUpper = cleanSql.toUpperCase();

    // Must start with SELECT for read-only operations
    if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
      errors.push({
        type: 'syntax',
        message: 'Query must start with SELECT or WITH clause',
        severity: 'critical',
        suggestion: 'Only SELECT statements are allowed',
      });
    }

    // Check for balanced parentheses
    const openParens = (cleanSql.match(/\(/g) || []).length;
    const closeParens = (cleanSql.match(/\)/g) || []).length;

    if (openParens !== closeParens) {
      errors.push({
        type: 'syntax',
        message: `Unbalanced parentheses: ${openParens} opening, ${closeParens} closing`,
        severity: 'high',
        suggestion: 'Check that all parentheses are properly matched',
      });
    }

    // Check for FROM clause in SELECT statements
    if (sqlUpper.startsWith('SELECT') && !sqlUpper.includes(' FROM ')) {
      errors.push({
        type: 'syntax',
        message: 'SELECT statement must include a FROM clause',
        severity: 'high',
        suggestion: 'Add a FROM clause to specify the table(s) to query',
      });
    }

    // Check for SQL injection patterns
    const suspiciousPatterns = [
      /;\s*--/, // SQL comment injection
      /union\s+select/i, // UNION injection
      /'\s*or\s*'1'\s*=\s*'1/i, // Classic injection
      /'\s*;\s*drop\s+table/i, // DROP injection
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(sql)) {
        errors.push({
          type: 'security',
          message: 'Potential SQL injection pattern detected',
          severity: 'critical',
          suggestion: 'Remove suspicious patterns from your query',
        });
      }
    }

    return errors;
  }

  /**
   * Parses SQL to extract structural information
   */
  private parseSql(sql: string): SqlParseResult {
    const sqlUpper = sql.toUpperCase();
    // const sqlLower = sql.toLowerCase(); // Will use when needed

    // Extract table names (simplified approach)
    const tableMatches = sql.match(/(?:FROM|JOIN)\s+([`"]?([^`"\s,()]+)[`"]?)/gi) || [];
    const tables = tableMatches.map((match) =>
      match
        .replace(/^(?:FROM|JOIN)\s+/i, '')
        .replace(/[`"]/g, '')
        .trim(),
    );

    // Extract column names from SELECT clause
    const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/is);
    const columns: string[] = [];
    if (selectMatch && selectMatch[1]) {
      const selectClause = selectMatch[1];
      if (selectClause.includes('*')) {
        columns.push('*');
      } else {
        const columnList = selectClause.split(',').map((col) => col.trim().replace(/[`"]/g, ''));
        columns.push(...columnList);
      }
    }

    // Detect various SQL constructs
    const hasWildcard = sql.includes('*');
    const hasJoins = /\bJOIN\b/i.test(sql);
    const hasSubqueries = (sqlUpper.match(/\bSELECT\b/g) || []).length > 1;
    const hasAggregations = /\b(COUNT|SUM|AVG|MIN|MAX|GROUP\s+BY)\b/i.test(sql);
    const hasLimit = /\bLIMIT\b/i.test(sql);

    // Extract LIMIT value
    let limitValue: number | undefined;
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      limitValue = parseInt(limitMatch[1]);
    }

    // Detect operations
    const operations: string[] = [];
    if (/\bSELECT\b/i.test(sql)) operations.push('SELECT');
    if (/\bINSERT\b/i.test(sql)) operations.push('INSERT');
    if (/\bUPDATE\b/i.test(sql)) operations.push('UPDATE');
    if (/\bDELETE\b/i.test(sql)) operations.push('DELETE');

    return {
      tables: [...new Set(tables)], // Remove duplicates
      columns: [...new Set(columns)],
      operations,
      hasWildcard,
      hasJoins,
      hasSubqueries,
      hasAggregations,
      hasLimit,
      limitValue,
    };
  }

  /**
   * Validates query performance characteristics
   */
  private validatePerformance(parseResult: SqlParseResult, sql: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for SELECT *
    if (parseResult.hasWildcard) {
      warnings.push({
        type: 'performance',
        message: 'Using SELECT * may retrieve unnecessary columns',
        suggestion: 'Specify only the columns you need to improve performance and reduce costs',
      });
    }

    // Check for missing LIMIT
    if (!parseResult.hasLimit && !parseResult.hasAggregations) {
      warnings.push({
        type: 'performance',
        message: 'Query does not have a LIMIT clause',
        suggestion: 'Consider adding LIMIT to prevent retrieving excessive rows',
      });
    }

    // Check for large LIMIT values
    if (parseResult.limitValue && parseResult.limitValue > 10000) {
      warnings.push({
        type: 'performance',
        message: `LIMIT ${parseResult.limitValue} is very large`,
        suggestion: 'Consider using pagination or reducing the limit for better performance',
      });
    }

    // Check for potential Cartesian products
    if (parseResult.hasJoins && parseResult.tables.length > 3) {
      warnings.push({
        type: 'performance',
        message: `Query joins ${parseResult.tables.length} tables`,
        suggestion: 'Verify that all JOINs have appropriate conditions to avoid Cartesian products',
      });
    }

    // Check for functions in WHERE clauses (simplified check)
    if (/WHERE\s+.*\b(UPPER|LOWER|SUBSTR|TRIM|CONCAT)\s*\(/i.test(sql)) {
      warnings.push({
        type: 'performance',
        message: 'Functions in WHERE clause may prevent index usage',
        suggestion: 'Consider restructuring conditions to allow index usage',
      });
    }

    return warnings;
  }

  /**
   * Validates SQL best practices
   */
  private validateBestPractices(parseResult: SqlParseResult, sql: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for proper table aliasing with multiple tables
    if (parseResult.tables.length > 1 && !sql.includes(' AS ') && !/\b\w+\.\w+\b/.test(sql)) {
      warnings.push({
        type: 'best_practice',
        message: 'Consider using table aliases for better readability',
        suggestion:
          'Use aliases like "SELECT u.name FROM users u JOIN orders o ON u.id = o.user_id"',
      });
    }

    // Check for ORDER BY with LIMIT
    if (parseResult.hasLimit && !/ORDER\s+BY/i.test(sql)) {
      warnings.push({
        type: 'best_practice',
        message: 'LIMIT without ORDER BY may return inconsistent results',
        suggestion: 'Add ORDER BY clause to ensure deterministic results',
      });
    }

    // Check for GROUP BY best practices
    if (parseResult.hasAggregations && /GROUP\s+BY/i.test(sql)) {
      // Simplified check for SELECT items not in GROUP BY
      const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/is);
      const groupByMatch = sql.match(/GROUP\s+BY\s+(.*?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|$)/is);

      if (
        selectMatch &&
        groupByMatch &&
        !selectMatch[1].includes('COUNT(') &&
        !selectMatch[1].includes('SUM(')
      ) {
        warnings.push({
          type: 'best_practice',
          message: 'Verify that all non-aggregated columns in SELECT are in GROUP BY',
          suggestion: 'Include all non-aggregated columns in the GROUP BY clause',
        });
      }
    }

    return warnings;
  }

  /**
   * Estimates query execution cost
   */
  private async estimateQueryCost(
    parseResult: SqlParseResult,
    database: string,
    schema: string,
  ): Promise<CostEstimate | null> {
    try {
      // This is a simplified cost estimation
      // In a real implementation, you'd integrate with your data warehouse's cost estimation API

      let estimatedBytes = 0;
      let explanation = '';

      // Get table sizes from catalog (if available)
      for (const table of parseResult.tables) {
        try {
          // For now, use a simple heuristic based on table name and query characteristics
          let tableBytes = 1000000; // 1MB default

          // Adjust based on query characteristics
          if (parseResult.hasWildcard) {
            tableBytes *= 2; // SELECT * reads more data
          }

          if (!parseResult.hasLimit) {
            tableBytes *= 10; // No limit = potentially much more data
          } else if (parseResult.limitValue && parseResult.limitValue < 1000) {
            tableBytes *= 0.1; // Small limit = less data
          }

          if (parseResult.hasJoins) {
            tableBytes *= 1.5; // Joins typically increase data processing
          }

          estimatedBytes += tableBytes;
        } catch (error) {
          logger.warn({ error, table }, 'Could not estimate table size');
        }
      }

      // Simple cost calculation (e.g., $5 per TB)
      const estimatedCostUsd = (estimatedBytes / 1000000000000) * 5;

      explanation = `Estimated based on ${parseResult.tables.length} table(s)`;
      if (parseResult.hasJoins) explanation += ', with JOINs';
      if (parseResult.hasWildcard) explanation += ', using SELECT *';
      if (!parseResult.hasLimit) explanation += ', without LIMIT';

      return {
        estimatedBytesScanned: Math.round(estimatedBytes),
        estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100, // Round to 2 decimal places
        warehouseSize: 'MEDIUM', // This would come from configuration
        explanation,
      };
    } catch (error) {
      logger.error({ error, parseResult, database, schema }, 'Error estimating query cost');
      return null;
    }
  }

  /**
   * Sanitizes SQL by removing potentially harmful content
   */
  private sanitizeSql(sql: string): string {
    // Remove SQL comments
    let sanitized = sql.replace(/--.*$/gm, '');
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // Ensure it ends with semicolon if it doesn't already
    if (!sanitized.endsWith(';')) {
      sanitized += ';';
    }

    return sanitized;
  }

  /**
   * Maps violation types to error types
   */
  private mapViolationToErrorType(violationType: string): ValidationError['type'] {
    switch (violationType) {
      case 'denylist':
        return 'security';
      case 'allowlist':
        return 'permission';
      case 'complexity':
        return 'complexity';
      case 'pii':
        return 'security';
      case 'cost':
        return 'cost';
      default:
        return 'syntax';
    }
  }

  /**
   * Maps violation types to warning types
   */
  private mapViolationToWarningType(violationType: string): ValidationWarning['type'] {
    switch (violationType) {
      case 'complexity':
        return 'performance';
      case 'pii':
        return 'data_quality';
      default:
        return 'best_practice';
    }
  }

  /**
   * Stores validation result in database for audit purposes
   */
  async storeValidationResult(
    sql: string,
    validationResult: ValidationResult,
    database: string,
    schema: string,
    userId?: number,
  ): Promise<void> {
    try {
      await runPostgresQuery(
        `INSERT INTO nl_queries (natural_language, generated_sql, validated, database_name, schema_name, user_id, confidence_score, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          'Validated SQL Query', // This would normally be the original natural language query
          sql,
          validationResult.isValid,
          database,
          schema,
          userId || null,
          validationResult.isValid ? 0.9 : 0.1, // Simple confidence score
        ],
      );
    } catch (error) {
      logger.error({ error }, 'Failed to store validation result');
    }
  }
}

export const queryValidator = new QueryValidator();
