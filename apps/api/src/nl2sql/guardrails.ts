import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';

interface GuardrailViolation {
  type: 'denylist' | 'allowlist' | 'complexity' | 'pii' | 'cost';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  pattern?: string;
  suggestion?: string;
}

interface GuardrailConfig {
  maxJoins: number;
  maxSubqueries: number;
  maxRowsLimit: number;
  maxCostUsd: number;
  allowPiiAccess: boolean;
  requireWhereClause: boolean;
  allowedOperations: string[];
  blockedOperations: string[];
}

interface DenylistRule {
  id: number;
  pattern: string;
  pattern_type: string;
  reason: string;
  severity: string;
  active: boolean;
}

interface AllowlistRule {
  id: number;
  database_name: string;
  schema_name?: string;
  table_name?: string;
  column_name?: string;
  allowed: boolean;
  reason?: string;
}

const DEFAULT_CONFIG: GuardrailConfig = {
  maxJoins: 5,
  maxSubqueries: 3,
  maxRowsLimit: 10000,
  maxCostUsd: 10.0,
  allowPiiAccess: false,
  requireWhereClause: false,
  allowedOperations: ['SELECT'],
  blockedOperations: ['DROP', 'DELETE', 'UPDATE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT'],
};

export class GuardrailsSystem {
  private config: GuardrailConfig;

  constructor(config: Partial<GuardrailConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validates a SQL query against all guardrails
   */
  async validateQuery(
    sql: string,
    database: string,
    schema: string,
    _userId?: number,
  ): Promise<{
    isValid: boolean;
    violations: GuardrailViolation[];
    warnings: GuardrailViolation[];
  }> {
    logger.info({ sql: sql.substring(0, 100) }, 'Validating query against guardrails');

    const violations: GuardrailViolation[] = [];
    const warnings: GuardrailViolation[] = [];

    try {
      // 1. Check denylist patterns
      const denylistViolations = await this.checkDenylist(sql);
      violations.push(
        ...denylistViolations.filter((v) => v.severity === 'critical' || v.severity === 'high'),
      );
      warnings.push(
        ...denylistViolations.filter((v) => v.severity === 'medium' || v.severity === 'low'),
      );

      // 2. Check allowlist constraints
      const allowlistViolations = await this.checkAllowlist(sql, database, schema);
      violations.push(...allowlistViolations);

      // 3. Check query complexity
      const complexityViolations = this.checkComplexity(sql);
      violations.push(
        ...complexityViolations.filter((v) => v.severity === 'critical' || v.severity === 'high'),
      );
      warnings.push(
        ...complexityViolations.filter((v) => v.severity === 'medium' || v.severity === 'low'),
      );

      // 4. Check PII access
      const piiViolations = await this.checkPiiAccess(sql, database, schema);
      if (!this.config.allowPiiAccess) {
        violations.push(
          ...piiViolations.filter((v) => v.severity === 'critical' || v.severity === 'high'),
        );
        warnings.push(
          ...piiViolations.filter((v) => v.severity === 'medium' || v.severity === 'low'),
        );
      }

      // 5. Check operation restrictions
      const operationViolations = this.checkOperations(sql);
      violations.push(...operationViolations);

      // 6. Check row limits
      const limitViolations = this.checkRowLimits(sql);
      warnings.push(...limitViolations);

      return {
        isValid: violations.length === 0,
        violations,
        warnings,
      };
    } catch (error) {
      logger.error({ error, sql }, 'Error validating query against guardrails');
      throw error;
    }
  }

  /**
   * Checks query against denylist patterns
   */
  private async checkDenylist(sql: string): Promise<GuardrailViolation[]> {
    const violations: GuardrailViolation[] = [];

    try {
      const denylistRules = await runPostgresQuery<DenylistRule>(
        'SELECT * FROM query_denylists WHERE active = true ORDER BY severity DESC',
      );

      const sqlUpper = sql.toUpperCase();
      const sqlLower = sql.toLowerCase();

      for (const rule of denylistRules) {
        let matches = false;

        switch (rule.pattern_type) {
          case 'regex':
            try {
              const regex = new RegExp(rule.pattern, 'gi');
              matches = regex.test(sql);
            } catch (regexError) {
              logger.warn(
                { pattern: rule.pattern, error: regexError },
                'Invalid regex pattern in denylist',
              );
            }
            break;

          case 'sql_keyword':
            matches = sqlUpper.includes(rule.pattern.toUpperCase());
            break;

          case 'table_name':
            matches = sqlLower.includes(rule.pattern.toLowerCase());
            break;

          case 'column_name':
            matches = sqlLower.includes(rule.pattern.toLowerCase());
            break;
        }

        if (matches) {
          violations.push({
            type: 'denylist',
            severity: rule.severity as GuardrailViolation['severity'],
            message: `Blocked pattern detected: ${rule.reason}`,
            pattern: rule.pattern,
            suggestion: this.getSuggestionForDenylistViolation(rule),
          });
        }
      }
    } catch (error) {
      logger.error({ error, sql }, 'Error checking denylist patterns');
    }

    return violations;
  }

  /**
   * Checks query against allowlist constraints
   */
  private async checkAllowlist(
    sql: string,
    database: string,
    schema: string,
  ): Promise<GuardrailViolation[]> {
    const violations: GuardrailViolation[] = [];

    try {
      // Extract table names from SQL (simplified approach)
      const tableMatches = sql.match(/(?:FROM|JOIN)\s+([`"]?([^`"\s,]+)[`"]?)/gi);

      if (tableMatches) {
        for (const match of tableMatches) {
          const tableName = match
            .replace(/^(?:FROM|JOIN)\s+/i, '')
            .replace(/[`"]/g, '')
            .trim();

          // Check if table is explicitly allowed
          const allowlistCheck = await runPostgresQuery<AllowlistRule>(
            'SELECT * FROM query_allowlists WHERE database_name = $1 AND (schema_name IS NULL OR schema_name = $2) AND (table_name IS NULL OR table_name = $3) AND allowed = false',
            [database, schema, tableName],
          );

          if (allowlistCheck.length > 0) {
            violations.push({
              type: 'allowlist',
              severity: 'high',
              message: `Table '${tableName}' is not allowed for querying: ${allowlistCheck[0].reason || 'Access restricted'}`,
              suggestion: 'Contact your administrator to request access to this table',
            });
          }
        }
      }

      // Check for column-level restrictions (simplified)
      const columnMatches = sql.match(/SELECT\s+(.+?)\s+FROM/is);
      if (columnMatches && columnMatches[1]) {
        const selectClause = columnMatches[1];
        if (!selectClause.includes('*')) {
          const columns = selectClause.split(',').map((col) => col.trim().replace(/[`"]/g, ''));

          for (const column of columns) {
            const columnName = column.split('.').pop() || column;

            const columnAllowlistCheck = await runPostgresQuery<AllowlistRule>(
              'SELECT * FROM query_allowlists WHERE database_name = $1 AND (schema_name IS NULL OR schema_name = $2) AND column_name = $3 AND allowed = false',
              [database, schema, columnName],
            );

            if (columnAllowlistCheck.length > 0) {
              violations.push({
                type: 'allowlist',
                severity: 'high',
                message: `Column '${columnName}' is not allowed for querying: ${columnAllowlistCheck[0].reason || 'Access restricted'}`,
                suggestion: 'Remove this column from your query or request access',
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error({ error, sql, database, schema }, 'Error checking allowlist constraints');
    }

    return violations;
  }

  /**
   * Checks query complexity
   */
  private checkComplexity(sql: string): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];
    const sqlUpper = sql.toUpperCase();

    // Count JOINs
    const joinCount = (sqlUpper.match(/\bJOIN\b/g) || []).length;
    if (joinCount > this.config.maxJoins) {
      violations.push({
        type: 'complexity',
        severity: 'medium',
        message: `Query has ${joinCount} JOINs, maximum allowed is ${this.config.maxJoins}`,
        suggestion: 'Consider breaking this into multiple simpler queries',
      });
    }

    // Count subqueries
    const subqueryCount = (sqlUpper.match(/\bSELECT\b/g) || []).length - 1;
    if (subqueryCount > this.config.maxSubqueries) {
      violations.push({
        type: 'complexity',
        severity: 'medium',
        message: `Query has ${subqueryCount} subqueries, maximum allowed is ${this.config.maxSubqueries}`,
        suggestion: 'Consider using CTEs (WITH clauses) or breaking into multiple queries',
      });
    }

    // Check for potentially expensive operations
    if (sqlUpper.includes('CROSS JOIN')) {
      violations.push({
        type: 'complexity',
        severity: 'high',
        message: 'CROSS JOIN detected - this can be very expensive',
        suggestion: 'Consider using INNER JOIN with appropriate WHERE conditions instead',
      });
    }

    return violations;
  }

  /**
   * Checks for PII column access
   */
  private async checkPiiAccess(
    sql: string,
    database: string,
    schema: string,
  ): Promise<GuardrailViolation[]> {
    const violations: GuardrailViolation[] = [];

    try {
      // Get all PII columns for this database/schema
      const piiColumns = await runPostgresQuery<{
        table_name: string;
        column_name: string;
        tag: string;
        masking?: string;
      }>(
        'SELECT table_name, column_name, tag, masking FROM catalog_pii WHERE database_name = $1 AND schema_name = $2',
        [database, schema],
      );

      // const sqlLower = sql.toLowerCase(); // Will use when needed

      for (const piiColumn of piiColumns) {
        // Simple check - look for column name in query
        const columnPattern = new RegExp(`\\b${piiColumn.column_name.toLowerCase()}\\b`, 'i');

        if (columnPattern.test(sql)) {
          const severity = this.getPiiSeverity(piiColumn.tag);

          violations.push({
            type: 'pii',
            severity,
            message: `PII column '${piiColumn.column_name}' (${piiColumn.tag}) detected in query`,
            suggestion: piiColumn.masking
              ? `This column has ${piiColumn.masking} masking applied`
              : 'Consider whether PII access is necessary for this query',
          });
        }
      }
    } catch (error) {
      logger.error({ error, sql, database, schema }, 'Error checking PII access');
    }

    return violations;
  }

  /**
   * Checks for restricted SQL operations
   */
  private checkOperations(sql: string): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];
    const sqlUpper = sql.toUpperCase().trim();

    // Check for blocked operations
    for (const operation of this.config.blockedOperations) {
      if (sqlUpper.startsWith(operation + ' ') || sqlUpper === operation) {
        violations.push({
          type: 'denylist',
          severity: 'critical',
          message: `${operation} statements are not allowed`,
          suggestion: 'Only SELECT queries are permitted',
        });
      }
    }

    // Check if operation is in allowed list
    const firstWord = sqlUpper.split(' ')[0];
    if (!this.config.allowedOperations.includes(firstWord)) {
      violations.push({
        type: 'denylist',
        severity: 'critical',
        message: `${firstWord} operation is not allowed`,
        suggestion: `Only the following operations are allowed: ${this.config.allowedOperations.join(', ')}`,
      });
    }

    return violations;
  }

  /**
   * Checks for appropriate row limits
   */
  private checkRowLimits(sql: string): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];
    const sqlUpper = sql.toUpperCase();

    if (!sqlUpper.includes('LIMIT')) {
      violations.push({
        type: 'complexity',
        severity: 'medium',
        message: 'Query does not include a LIMIT clause',
        suggestion: `Consider adding LIMIT ${Math.min(1000, this.config.maxRowsLimit)} to prevent retrieving too much data`,
      });
    } else {
      // Extract LIMIT value
      const limitMatch = sqlUpper.match(/LIMIT\s+(\d+)/);
      if (limitMatch) {
        const limitValue = parseInt(limitMatch[1]);
        if (limitValue > this.config.maxRowsLimit) {
          violations.push({
            type: 'complexity',
            severity: 'high',
            message: `LIMIT ${limitValue} exceeds maximum allowed limit of ${this.config.maxRowsLimit}`,
            suggestion: `Reduce LIMIT to ${this.config.maxRowsLimit} or less`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Adds a new denylist rule
   */
  async addDenylistRule(
    pattern: string,
    patternType: string,
    reason: string,
    severity: string,
    userId?: number,
  ): Promise<void> {
    await runPostgresQuery(
      'INSERT INTO query_denylists (pattern, pattern_type, reason, severity, created_by) VALUES ($1, $2, $3, $4, $5)',
      [pattern, patternType, reason, severity, userId || null],
    );
  }

  /**
   * Adds a new allowlist rule
   */
  async addAllowlistRule(
    database: string,
    schema?: string,
    table?: string,
    column?: string,
    allowed: boolean = true,
    reason?: string,
    userId?: number,
  ): Promise<void> {
    await runPostgresQuery(
      "INSERT INTO query_allowlists (database_name, schema_name, table_name, column_name, allowed, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (database_name, COALESCE(schema_name, ''), COALESCE(table_name, ''), COALESCE(column_name, '')) DO UPDATE SET allowed = EXCLUDED.allowed, reason = EXCLUDED.reason, updated_at = NOW()",
      [
        database,
        schema || null,
        table || null,
        column || null,
        allowed,
        reason || null,
        userId || null,
      ],
    );
  }

  /**
   * Gets severity level for PII tags
   */
  private getPiiSeverity(tag: string): GuardrailViolation['severity'] {
    const highRiskTags = ['ssn', 'credit_card', 'bank_account', 'passport'];
    const mediumRiskTags = ['email', 'phone', 'address', 'name'];

    if (highRiskTags.includes(tag.toLowerCase())) {
      return 'high';
    } else if (mediumRiskTags.includes(tag.toLowerCase())) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Provides suggestions for denylist violations
   */
  private getSuggestionForDenylistViolation(rule: DenylistRule): string {
    switch (rule.pattern.toLowerCase()) {
      case 'drop\\s+':
        return 'Use SELECT statements to query data instead of DROP';
      case 'delete\\s+(?!.*(where|limit))':
        return 'If DELETE is necessary, always include a WHERE clause to limit scope';
      case 'update\\s+(?!.*where)':
        return 'If UPDATE is necessary, always include a WHERE clause to limit scope';
      case '--':
        return 'Remove SQL comments from your query';
      default:
        return 'Modify your query to avoid this restricted pattern';
    }
  }

  /**
   * Updates configuration
   */
  updateConfig(newConfig: Partial<GuardrailConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Gets current configuration
   */
  getConfig(): GuardrailConfig {
    return { ...this.config };
  }
}

export const guardrailsSystem = new GuardrailsSystem();
