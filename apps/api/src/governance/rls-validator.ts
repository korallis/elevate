import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';
import type { RLSPolicy, RLSValidationResult } from './types.js';

interface ConflictDetails {
  policy1: RLSPolicy;
  policy2: RLSPolicy;
  conflict_type: 'contradictory' | 'redundant' | 'overlapping';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

interface PerformanceAnalysis {
  query_time_impact: number; // Percentage increase
  index_recommendations: string[];
  optimization_suggestions: string[];
}

export class RLSValidator {
  /**
   * Comprehensive validation of RLS policies
   */
  async validatePolicies(
    database_name: string,
    schema_name: string,
    table_name: string
  ): Promise<{
    overall_valid: boolean;
    policy_conflicts: ConflictDetails[];
    performance_analysis: PerformanceAnalysis;
    coverage_gaps: string[];
    recommendations: string[];
  }> {
    try {
      // Get all policies for the table
      const policies = await runPostgresQuery<RLSPolicy>(`
        SELECT * FROM rls_policies 
        WHERE database_name = $1 AND schema_name = $2 AND table_name = $3 AND enabled = true
        ORDER BY name
      `, [database_name, schema_name, table_name]);

      const conflicts = await this.detectPolicyConflicts(policies);
      const performanceAnalysis = await this.analyzePerformance(policies, database_name, schema_name, table_name);
      const coverageGaps = await this.identifyCoverageGaps(policies, database_name, schema_name, table_name);
      const recommendations = this.generateRecommendations(policies, conflicts, performanceAnalysis);

      const overallValid = conflicts.filter(c => c.severity === 'high').length === 0;

      logger.info('RLS policy validation completed', {
        database_name,
        schema_name,
        table_name,
        policies_count: policies.length,
        conflicts_count: conflicts.length,
        overall_valid: overallValid
      });

      return {
        overall_valid: overallValid,
        policy_conflicts: conflicts,
        performance_analysis: performanceAnalysis,
        coverage_gaps: coverageGaps,
        recommendations
      };
    } catch (error) {
      logger.error('RLS policy validation failed', { error, database_name, schema_name, table_name });
      throw error;
    }
  }

  /**
   * Detect conflicts between policies
   */
  private async detectPolicyConflicts(policies: RLSPolicy[]): Promise<ConflictDetails[]> {
    const conflicts: ConflictDetails[] = [];

    for (let i = 0; i < policies.length; i++) {
      for (let j = i + 1; j < policies.length; j++) {
        const policy1 = policies[i];
        const policy2 = policies[j];

        // Skip if different tables
        if (policy1.table_name !== policy2.table_name) continue;

        const conflictType = this.analyzeFilterConflict(policy1.filter_expression, policy2.filter_expression);
        
        if (conflictType) {
          conflicts.push({
            policy1,
            policy2,
            conflict_type: conflictType.type,
            description: conflictType.description,
            severity: conflictType.severity
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Analyze conflict between two filter expressions
   */
  private analyzeFilterConflict(expr1: string, expr2: string): {
    type: 'contradictory' | 'redundant' | 'overlapping';
    description: string;
    severity: 'low' | 'medium' | 'high';
  } | null {
    const normalized1 = this.normalizeExpression(expr1);
    const normalized2 = this.normalizeExpression(expr2);

    // Exact match - redundant
    if (normalized1 === normalized2) {
      return {
        type: 'redundant',
        description: 'Policies have identical filter expressions',
        severity: 'medium'
      };
    }

    // Check for contradictory conditions
    if (this.areContradictory(normalized1, normalized2)) {
      return {
        type: 'contradictory',
        description: 'Policies contain contradictory conditions that may prevent data access',
        severity: 'high'
      };
    }

    // Check for overlapping but non-contradictory conditions
    if (this.hasOverlap(normalized1, normalized2)) {
      return {
        type: 'overlapping',
        description: 'Policies have overlapping conditions that may create confusion',
        severity: 'low'
      };
    }

    return null;
  }

  /**
   * Normalize expression for comparison
   */
  private normalizeExpression(expr: string): string {
    return expr
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if two expressions are contradictory
   */
  private areContradictory(expr1: string, expr2: string): boolean {
    // Simple pattern matching for common contradictions
    const patterns = [
      // user_id = X vs user_id != X - need different approach without backreferences
      [/user_id\s*=\s*\d+/, /user_id\s*!=\s*\d+/],
      // department_id = X vs department_id = Y  
      [/department_id\s*=\s*\d+/, /department_id\s*=\s*\d+/],
      // org_id = X vs org_id = Y  
      [/org_id\s*=\s*\d+/, /org_id\s*=\s*\d+/],
      // status = 'active' vs status = 'inactive'
      [/status\s*=\s*'active'/, /status\s*=\s*'inactive'/],
      // enabled = true vs enabled = false
      [/enabled\s*=\s*true/, /enabled\s*=\s*false/]
    ];

    for (const [pattern1, pattern2] of patterns) {
      if (pattern1.test(expr1) && pattern2.test(expr2)) return true;
      if (pattern1.test(expr2) && pattern2.test(expr1)) return true;
    }

    return false;
  }

  /**
   * Check if expressions have overlapping conditions
   */
  private hasOverlap(expr1: string, expr2: string): boolean {
    // Extract column references
    const columns1 = this.extractColumnReferences(expr1);
    const columns2 = this.extractColumnReferences(expr2);
    
    // Check for common columns with different conditions
    const commonColumns = columns1.filter(col => columns2.includes(col));
    return commonColumns.length > 0 && expr1 !== expr2;
  }

  /**
   * Extract column references from expression
   */
  private extractColumnReferences(expr: string): string[] {
    const columnPattern = /\b([a-z_][a-z0-9_]*)\s*[=!<>]/gi;
    const matches = expr.match(columnPattern);
    return matches ? matches.map(m => m.replace(/\s*[=!<>].*/, '').trim()) : [];
  }

  /**
   * Analyze performance impact of policies
   */
  private async analyzePerformance(
    policies: RLSPolicy[],
    database_name: string,
    schema_name: string,
    table_name: string
  ): Promise<PerformanceAnalysis> {
    let estimatedImpact = 0;
    const indexRecommendations: string[] = [];
    const optimizationSuggestions: string[] = [];

    for (const policy of policies) {
      const expr = policy.filter_expression.toLowerCase();

      // Estimate performance impact
      if (expr.includes('select')) {
        estimatedImpact += 50; // Subqueries add significant overhead
        optimizationSuggestions.push(`Policy '${policy.name}': Consider replacing subqueries with JOINs`);
      }

      if (expr.includes('like')) {
        estimatedImpact += 20; // LIKE operations are slower
        optimizationSuggestions.push(`Policy '${policy.name}': LIKE operations may benefit from full-text search`);
      }

      if (expr.includes('in (')) {
        estimatedImpact += 15; // IN clauses can be optimized
        optimizationSuggestions.push(`Policy '${policy.name}': Large IN lists may benefit from temp tables`);
      }

      // Suggest indexes based on filter expressions
      const columns = this.extractColumnReferences(expr);
      for (const column of columns) {
        if (!indexRecommendations.includes(column)) {
          indexRecommendations.push(column);
        }
      }
    }

    // Check for existing indexes
    try {
      const existingIndexes = await this.getExistingIndexes(database_name, schema_name, table_name);
      const newIndexRecommendations = indexRecommendations.filter(
        col => !existingIndexes.some(idx => idx.includes(col))
      );

      return {
        query_time_impact: Math.min(estimatedImpact, 200), // Cap at 200%
        index_recommendations: newIndexRecommendations.map(col => 
          `CREATE INDEX idx_${table_name}_${col} ON ${database_name}.${schema_name}.${table_name} (${col})`
        ),
        optimization_suggestions
      };
    } catch (error) {
      logger.warn('Could not check existing indexes', { error });
      return {
        query_time_impact: estimatedImpact,
        index_recommendations: indexRecommendations.map(col => 
          `Consider creating index on column: ${col}`
        ),
        optimization_suggestions
      };
    }
  }

  /**
   * Get existing indexes for a table (simplified - would need Snowflake integration)
   */
  private async getExistingIndexes(
    database_name: string,
    schema_name: string,
    table_name: string
  ): Promise<string[]> {
    // This would typically query Snowflake's information schema
    // For now, return empty array
    return [];
  }

  /**
   * Identify coverage gaps in RLS policies
   */
  private async identifyCoverageGaps(
    policies: RLSPolicy[],
    database_name: string,
    schema_name: string,
    table_name: string
  ): Promise<string[]> {
    const gaps: string[] = [];

    try {
      // Get table columns to analyze
      const columns = await runPostgresQuery<{
        column_name: string;
        data_type: string;
      }>(`
        SELECT column_name, data_type
        FROM catalog_columns
        WHERE database_name = $1 AND schema_name = $2 AND table_name = $3
      `, [database_name, schema_name, table_name]);

      const columnNames = columns.map(c => c.column_name.toLowerCase());
      const policyExpressions = policies.map(p => p.filter_expression.toLowerCase()).join(' ');

      // Check for common columns that should have RLS policies
      const criticalColumns = [
        'user_id', 'created_by', 'owner_id', 'assigned_to',
        'department_id', 'org_id', 'organization_id',
        'tenant_id', 'client_id', 'company_id',
        'region', 'country', 'location'
      ];

      for (const criticalColumn of criticalColumns) {
        if (columnNames.includes(criticalColumn) && !policyExpressions.includes(criticalColumn)) {
          gaps.push(`No RLS policy found for critical column: ${criticalColumn}`);
        }
      }

      // Check for PII columns without protection
      const piiColumns = await runPostgresQuery<{ column_name: string }>(`
        SELECT column_name
        FROM pii_columns
        WHERE database_name = $1 AND schema_name = $2 AND table_name = $3
      `, [database_name, schema_name, table_name]);

      for (const piiColumn of piiColumns) {
        const columnName = piiColumn.column_name.toLowerCase();
        if (!policyExpressions.includes(columnName)) {
          gaps.push(`PII column '${piiColumn.column_name}' lacks RLS protection`);
        }
      }

      // Check for temporal data without time-based policies
      const temporalColumns = ['created_at', 'updated_at', 'expires_at', 'valid_from', 'valid_to'];
      const hasTemporalColumns = temporalColumns.some(col => columnNames.includes(col));
      const hasTimePolicies = policies.some(p => 
        p.filter_expression.toLowerCase().includes('interval') || 
        p.filter_expression.toLowerCase().includes('now()')
      );

      if (hasTemporalColumns && !hasTimePolicies) {
        gaps.push('Table has temporal columns but no time-based RLS policies');
      }

    } catch (error) {
      logger.warn('Error identifying coverage gaps', { error });
      gaps.push('Unable to analyze coverage gaps due to metadata access issues');
    }

    return gaps;
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(
    policies: RLSPolicy[],
    conflicts: ConflictDetails[],
    performanceAnalysis: PerformanceAnalysis
  ): string[] {
    const recommendations: string[] = [];

    // Conflict-based recommendations
    const highSeverityConflicts = conflicts.filter(c => c.severity === 'high');
    if (highSeverityConflicts.length > 0) {
      recommendations.push(`Resolve ${highSeverityConflicts.length} high-severity policy conflicts immediately`);
    }

    const redundantPolicies = conflicts.filter(c => c.conflict_type === 'redundant');
    if (redundantPolicies.length > 0) {
      recommendations.push(`Remove ${redundantPolicies.length} redundant policies to simplify governance`);
    }

    // Performance-based recommendations
    if (performanceAnalysis.query_time_impact > 50) {
      recommendations.push('Consider optimizing RLS policies to reduce query performance impact');
    }

    if (performanceAnalysis.index_recommendations.length > 0) {
      recommendations.push(`Create ${performanceAnalysis.index_recommendations.length} recommended indexes to improve RLS performance`);
    }

    // Policy coverage recommendations
    if (policies.length === 0) {
      recommendations.push('No RLS policies found - consider implementing basic access controls');
    } else if (policies.length === 1) {
      recommendations.push('Single RLS policy may not provide adequate coverage - consider additional policies');
    }

    // Security recommendations
    const hasUserLevelPolicies = policies.some(p => 
      p.filter_expression.toLowerCase().includes('user_id') ||
      p.filter_expression.toLowerCase().includes('created_by')
    );
    
    if (!hasUserLevelPolicies) {
      recommendations.push('Consider implementing user-level access control policies');
    }

    const hasOrgLevelPolicies = policies.some(p => 
      p.filter_expression.toLowerCase().includes('org_id') ||
      p.filter_expression.toLowerCase().includes('department_id')
    );
    
    if (!hasOrgLevelPolicies) {
      recommendations.push('Consider implementing organizational-level access control policies');
    }

    // Governance best practices
    recommendations.push('Regularly review and audit RLS policies for effectiveness');
    recommendations.push('Test RLS policies with sample queries before deploying to production');
    recommendations.push('Document policy purpose and business rules for maintenance');

    return recommendations;
  }

  /**
   * Test RLS policies with sample data scenarios
   */
  async testPolicyScenarios(
    policyId: number,
    scenarios: Array<{
      name: string;
      user_context: {
        user_id: number;
        department_id?: number;
        org_id?: number;
        role?: string;
      };
      expected_result: 'allow' | 'deny';
      test_query: string;
    }>
  ): Promise<Array<{
    scenario_name: string;
    expected: 'allow' | 'deny';
    actual: 'allow' | 'deny' | 'error';
    success: boolean;
    details: string;
  }>> {
    const results: Array<{
      scenario_name: string;
      expected: 'allow' | 'deny';
      actual: 'allow' | 'deny' | 'error';
      success: boolean;
      details: string;
    }> = [];

    try {
      const [policy] = await runPostgresQuery<RLSPolicy>(
        'SELECT * FROM rls_policies WHERE id = $1',
        [policyId]
      );

      if (!policy) {
        throw new Error(`Policy ${policyId} not found`);
      }

      for (const scenario of scenarios) {
        try {
          // This is a simplified test - in practice you'd need to:
          // 1. Set up test data
          // 2. Execute the query with RLS applied
          // 3. Compare results
          
          const testResult = this.simulatePolicyApplication(
            policy.filter_expression,
            scenario.user_context,
            scenario.test_query
          );

          results.push({
            scenario_name: scenario.name,
            expected: scenario.expected_result,
            actual: testResult.allowed ? 'allow' : 'deny',
            success: (testResult.allowed && scenario.expected_result === 'allow') ||
                    (!testResult.allowed && scenario.expected_result === 'deny'),
            details: testResult.reason
          });
        } catch (error) {
          results.push({
            scenario_name: scenario.name,
            expected: scenario.expected_result,
            actual: 'error',
            success: false,
            details: `Test error: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Policy scenario testing failed', { error, policyId });
      throw error;
    }
  }

  /**
   * Simulate policy application (simplified for demonstration)
   */
  private simulatePolicyApplication(
    filterExpression: string,
    userContext: any,
    testQuery: string
  ): { allowed: boolean; reason: string } {
    // This is a very simplified simulation
    // In practice, you'd need proper SQL parsing and evaluation
    
    const expr = filterExpression.toLowerCase();
    
    // Replace placeholders with actual values
    let evaluatedExpr = expr
      .replace(/{user_id}/g, String(userContext.user_id))
      .replace(/{user_department_id}/g, String(userContext.department_id || 'NULL'))
      .replace(/{user_org_id}/g, String(userContext.org_id || 'NULL'));

    // Simple evaluation - this would need proper SQL evaluation in practice
    if (evaluatedExpr.includes('null') && !evaluatedExpr.includes('is null')) {
      return { allowed: false, reason: 'Filter contains NULL values' };
    }

    return { allowed: true, reason: 'Policy conditions satisfied' };
  }
}