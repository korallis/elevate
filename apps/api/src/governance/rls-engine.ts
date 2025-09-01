import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';
import type { RLSPolicy, RLSAssignment, RLSValidationResult } from './types.js';

export class RLSEngine {
  /**
   * Apply RLS filters to a SQL query based on user context
   */
  async applyRLSFilters(
    originalQuery: string,
    userId: number,
    departmentId?: number,
    orgId?: number
  ): Promise<{ query: string; applied_policies: string[] }> {
    try {
      // Get applicable policies for the user
      const policies = await this.getApplicablePolicies(userId, departmentId, orgId);
      
      if (policies.length === 0) {
        return { query: originalQuery, applied_policies: [] };
      }

      // Parse and modify the query
      const modifiedQuery = this.injectRLSFilters(originalQuery, policies);
      
      logger.info('RLS filters applied', {
        userId,
        departmentId,
        orgId,
        policiesApplied: policies.length,
        policyNames: policies.map(p => p.name)
      });

      return {
        query: modifiedQuery,
        applied_policies: policies.map(p => p.name)
      };
    } catch (error) {
      logger.error('Failed to apply RLS filters', { error, userId });
      // Return original query to prevent data access issues
      return { query: originalQuery, applied_policies: [] };
    }
  }

  /**
   * Get all policies applicable to a user based on their assignments
   */
  private async getApplicablePolicies(
    userId: number,
    departmentId?: number,
    orgId?: number
  ): Promise<RLSPolicy[]> {
    const query = `
      SELECT DISTINCT p.*
      FROM rls_policies p
      INNER JOIN rls_assignments ra ON ra.policy_id = p.id
      WHERE p.enabled = true
        AND (
          ra.user_id = $1
          OR ($2::bigint IS NOT NULL AND ra.department_id = $2)
          OR ($3::bigint IS NOT NULL AND ra.org_id = $3)
        )
      ORDER BY p.name
    `;

    return runPostgresQuery<RLSPolicy>(query, [userId, departmentId || null, orgId || null]);
  }

  /**
   * Inject RLS filter expressions into SQL query
   */
  private injectRLSFilters(originalQuery: string, policies: RLSPolicy[]): string {
    let modifiedQuery = originalQuery;
    
    // Group policies by table
    const policiesByTable = new Map<string, RLSPolicy[]>();
    for (const policy of policies) {
      const tableKey = `${policy.database_name}.${policy.schema_name}.${policy.table_name}`;
      if (!policiesByTable.has(tableKey)) {
        policiesByTable.set(tableKey, []);
      }
      policiesByTable.get(tableKey)!.push(policy);
    }

    // Apply filters for each table
    for (const [tableKey, tablePolicies] of policiesByTable) {
      const [database, schema, table] = tableKey.split('.');
      modifiedQuery = this.addTableFilters(modifiedQuery, database, schema, table, tablePolicies);
    }

    return modifiedQuery;
  }

  /**
   * Add RLS filters for a specific table in the query
   */
  private addTableFilters(
    query: string,
    database: string,
    schema: string,
    table: string,
    policies: RLSPolicy[]
  ): string {
    // This is a simplified implementation
    // In production, you'd want proper SQL parsing and AST manipulation
    
    const fullTableName = `${database}.${schema}.${table}`;
    const filterExpressions = policies.map(p => `(${p.filter_expression})`);
    
    if (filterExpressions.length === 0) {
      return query;
    }

    // Combine all filter expressions with AND
    const combinedFilter = filterExpressions.join(' AND ');
    
    // Look for WHERE clauses and add to them, or add new WHERE clause
    const tableRegex = new RegExp(`FROM\\s+${fullTableName}`, 'gi');
    const whereRegex = new RegExp(`(FROM\\s+${fullTableName}[^\\s]*)(\\s+WHERE\\s+)`, 'gi');
    
    if (whereRegex.test(query)) {
      // Add to existing WHERE clause
      return query.replace(whereRegex, `$1$2(${combinedFilter}) AND `);
    } else {
      // Add new WHERE clause
      return query.replace(tableRegex, `$& WHERE ${combinedFilter}`);
    }
  }

  /**
   * Create a new RLS policy
   */
  async createPolicy(
    name: string,
    description: string | null,
    database_name: string,
    schema_name: string,
    table_name: string,
    filter_expression: string,
    role_id: number | null,
    created_by: number,
    enabled = true
  ): Promise<RLSPolicy> {
    try {
      // Validate the filter expression first
      const validation = await this.validateFilterExpression(filter_expression);
      if (!validation.valid) {
        throw new Error(`Invalid filter expression: ${validation.errors.join(', ')}`);
      }

      const [result] = await runPostgresQuery<RLSPolicy>(`
        INSERT INTO rls_policies 
        (name, description, database_name, schema_name, table_name, filter_expression, role_id, enabled, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `, [name, description, database_name, schema_name, table_name, filter_expression, role_id, enabled, created_by]);

      logger.info('RLS policy created', {
        id: result.id,
        name,
        database_name,
        schema_name,
        table_name
      });

      return result;
    } catch (error) {
      logger.error('Failed to create RLS policy', { error, name, filter_expression });
      throw error;
    }
  }

  /**
   * Update an existing RLS policy
   */
  async updatePolicy(
    id: number,
    updates: Partial<Pick<RLSPolicy, 'name' | 'description' | 'filter_expression' | 'enabled'>>
  ): Promise<RLSPolicy> {
    try {
      // Validate filter expression if it's being updated
      if (updates.filter_expression) {
        const validation = await this.validateFilterExpression(updates.filter_expression);
        if (!validation.valid) {
          throw new Error(`Invalid filter expression: ${validation.errors.join(', ')}`);
        }
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        params.push(updates.name);
      }
      
      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        params.push(updates.description);
      }
      
      if (updates.filter_expression !== undefined) {
        setClauses.push(`filter_expression = $${paramIndex++}`);
        params.push(updates.filter_expression);
      }
      
      if (updates.enabled !== undefined) {
        setClauses.push(`enabled = $${paramIndex++}`);
        params.push(updates.enabled);
      }

      if (setClauses.length === 0) {
        throw new Error('No updates provided');
      }

      setClauses.push(`updated_at = NOW()`);
      params.push(id);

      const query = `
        UPDATE rls_policies 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const [result] = await runPostgresQuery<RLSPolicy>(query, params);

      logger.info('RLS policy updated', { id, updates });
      return result;
    } catch (error) {
      logger.error('Failed to update RLS policy', { error, id, updates });
      throw error;
    }
  }

  /**
   * Delete an RLS policy and its assignments
   */
  async deletePolicy(id: number): Promise<void> {
    try {
      await runPostgresQuery('DELETE FROM rls_policies WHERE id = $1', [id]);
      logger.info('RLS policy deleted', { id });
    } catch (error) {
      logger.error('Failed to delete RLS policy', { error, id });
      throw error;
    }
  }

  /**
   * Get RLS policies with optional filtering
   */
  async getPolicies(filters: {
    database_name?: string;
    schema_name?: string;
    table_name?: string;
    enabled?: boolean;
    role_id?: number;
  } = {}): Promise<RLSPolicy[]> {
    let query = 'SELECT * FROM rls_policies WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.database_name) {
      query += ` AND database_name = $${paramIndex++}`;
      params.push(filters.database_name);
    }
    
    if (filters.schema_name) {
      query += ` AND schema_name = $${paramIndex++}`;
      params.push(filters.schema_name);
    }
    
    if (filters.table_name) {
      query += ` AND table_name = $${paramIndex++}`;
      params.push(filters.table_name);
    }
    
    if (filters.enabled !== undefined) {
      query += ` AND enabled = $${paramIndex++}`;
      params.push(filters.enabled);
    }
    
    if (filters.role_id !== undefined) {
      query += ` AND role_id = $${paramIndex++}`;
      params.push(filters.role_id);
    }

    query += ' ORDER BY name';

    return runPostgresQuery<RLSPolicy>(query, params);
  }

  /**
   * Assign a policy to users, departments, or organizations
   */
  async assignPolicy(
    policyId: number,
    assignments: Array<{
      user_id?: number;
      department_id?: number;
      org_id?: number;
    }>
  ): Promise<RLSAssignment[]> {
    const results: RLSAssignment[] = [];

    for (const assignment of assignments) {
      if (!assignment.user_id && !assignment.department_id && !assignment.org_id) {
        throw new Error('At least one assignment target (user_id, department_id, org_id) must be specified');
      }

      try {
        const [result] = await runPostgresQuery<RLSAssignment>(`
          INSERT INTO rls_assignments (policy_id, user_id, department_id, org_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (policy_id, COALESCE(user_id, 0), COALESCE(department_id, 0), COALESCE(org_id, 0))
          DO NOTHING
          RETURNING *
        `, [policyId, assignment.user_id || null, assignment.department_id || null, assignment.org_id || null]);

        if (result) {
          results.push(result);
        }
      } catch (error) {
        logger.error('Failed to create RLS assignment', { error, policyId, assignment });
        throw error;
      }
    }

    logger.info('RLS policy assignments created', { policyId, count: results.length });
    return results;
  }

  /**
   * Remove policy assignments
   */
  async removeAssignments(assignmentIds: number[]): Promise<void> {
    if (assignmentIds.length === 0) return;

    await runPostgresQuery(
      `DELETE FROM rls_assignments WHERE id = ANY($1::bigint[])`,
      [assignmentIds]
    );

    logger.info('RLS assignments removed', { count: assignmentIds.length });
  }

  /**
   * Get assignments for a policy
   */
  async getPolicyAssignments(policyId: number): Promise<Array<RLSAssignment & {
    user_name?: string;
    department_name?: string;
    org_name?: string;
  }>> {
    return runPostgresQuery(`
      SELECT 
        ra.*,
        u.name as user_name,
        d.name as department_name,
        o.name as org_name
      FROM rls_assignments ra
      LEFT JOIN users u ON ra.user_id = u.id
      LEFT JOIN departments d ON ra.department_id = d.id
      LEFT JOIN orgs o ON ra.org_id = o.id
      WHERE ra.policy_id = $1
      ORDER BY ra.created_at
    `, [policyId]);
  }

  /**
   * Validate an RLS filter expression
   */
  async validateFilterExpression(expression: string): Promise<RLSValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic syntax checks
    if (!expression || expression.trim().length === 0) {
      errors.push('Filter expression cannot be empty');
      return { valid: false, errors, warnings };
    }

    // Check for dangerous SQL keywords
    const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'CREATE', 'ALTER', 'TRUNCATE'];
    const upperExpression = expression.toUpperCase();
    
    for (const keyword of dangerousKeywords) {
      if (upperExpression.includes(keyword)) {
        errors.push(`Dangerous SQL keyword detected: ${keyword}`);
      }
    }

    // Check for balanced parentheses
    let parenCount = 0;
    for (const char of expression) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (parenCount < 0) {
        errors.push('Unbalanced parentheses in filter expression');
        break;
      }
    }
    if (parenCount !== 0) {
      errors.push('Unbalanced parentheses in filter expression');
    }

    // Check for SQL injection patterns
    const injectionPatterns = [
      /--/,           // SQL comments
      /\/\*/,         // Multi-line comments
      /;\s*--/,       // Statement termination with comment
      /'\s*OR\s*'.*'=/i,  // Classic OR injection
      /'\s*UNION\s*/i     // UNION injection
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(expression)) {
        errors.push('Potential SQL injection pattern detected');
      }
    }

    // Performance warnings
    if (expression.toLowerCase().includes('like')) {
      warnings.push('LIKE operations may impact query performance');
    }

    if (expression.toLowerCase().includes('select')) {
      warnings.push('Subqueries in RLS policies may impact performance');
    }

    // Estimate performance score (simplified)
    let performanceScore = 100;
    if (warnings.length > 0) performanceScore -= warnings.length * 20;
    if (expression.length > 200) performanceScore -= 10;
    if (/\bLIKE\b/i.test(expression)) performanceScore -= 15;
    if (/\bIN\s*\(/i.test(expression)) performanceScore -= 10;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      performance_score: Math.max(0, performanceScore)
    };
  }

  /**
   * Get RLS statistics and metrics
   */
  async getStatistics(): Promise<{
    total_policies: number;
    enabled_policies: number;
    total_assignments: number;
    policies_by_table: Array<{ table_name: string; policy_count: number }>;
    recent_activity: Array<{
      policy_name: string;
      action: string;
      created_at: string;
    }>;
  }> {
    const [totalStats] = await runPostgresQuery<{
      total_policies: number;
      enabled_policies: number;
      total_assignments: number;
    }>(`
      SELECT 
        COUNT(*) as total_policies,
        COUNT(*) FILTER (WHERE enabled = true) as enabled_policies,
        (SELECT COUNT(*) FROM rls_assignments) as total_assignments
      FROM rls_policies
    `);

    const policiesByTable = await runPostgresQuery<{
      table_name: string;
      policy_count: number;
    }>(`
      SELECT 
        CONCAT(database_name, '.', schema_name, '.', table_name) as table_name,
        COUNT(*) as policy_count
      FROM rls_policies
      WHERE enabled = true
      GROUP BY database_name, schema_name, table_name
      ORDER BY policy_count DESC
      LIMIT 10
    `);

    const recentActivity = await runPostgresQuery<{
      policy_name: string;
      action: string;
      created_at: string;
    }>(`
      SELECT name as policy_name, 'created' as action, created_at
      FROM rls_policies
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return {
      ...totalStats,
      policies_by_table: policiesByTable,
      recent_activity: recentActivity
    };
  }

  /**
   * Test RLS policy against sample queries
   */
  async testPolicy(
    policyId: number,
    sampleQueries: string[]
  ): Promise<Array<{
    original_query: string;
    modified_query: string;
    validation_result: RLSValidationResult;
  }>> {
    const policy = await runPostgresQuery<RLSPolicy>(
      'SELECT * FROM rls_policies WHERE id = $1',
      [policyId]
    );

    if (policy.length === 0) {
      throw new Error(`Policy with id ${policyId} not found`);
    }

    const results: Array<{
      original_query: string;
      modified_query: string;
      validation_result: RLSValidationResult;
    }> = [];

    for (const query of sampleQueries) {
      const modifiedQuery = this.injectRLSFilters(query, policy);
      const validation = await this.validateFilterExpression(policy[0].filter_expression);

      results.push({
        original_query: query,
        modified_query: modifiedQuery,
        validation_result: validation
      });
    }

    return results;
  }
}