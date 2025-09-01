import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';
import type { RLSValidationResult } from './types.js';

interface PolicyTemplate {
  name: string;
  description: string;
  category: string;
  filter_expression_template: string;
  parameters: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'list';
    description: string;
    required: boolean;
    default_value?: unknown;
  }>;
}

export class RLSPolicyBuilder {
  /**
   * Get predefined policy templates
   */
  getPolicyTemplates(): PolicyTemplate[] {
    return [
      {
        name: 'Department Access',
        description: 'Restrict access to records belonging to the user\'s department',
        category: 'organizational',
        filter_expression_template: 'department_id = {user_department_id}',
        parameters: [
          {
            name: 'user_department_id',
            type: 'number',
            description: 'Department ID from user context',
            required: true
          }
        ]
      },
      {
        name: 'Organization Access',
        description: 'Restrict access to records within the user\'s organization',
        category: 'organizational',
        filter_expression_template: 'org_id = {user_org_id}',
        parameters: [
          {
            name: 'user_org_id',
            type: 'number',
            description: 'Organization ID from user context',
            required: true
          }
        ]
      },
      {
        name: 'User Ownership',
        description: 'Only show records owned by the current user',
        category: 'ownership',
        filter_expression_template: 'created_by = {user_id} OR assigned_to = {user_id}',
        parameters: [
          {
            name: 'user_id',
            type: 'number',
            description: 'Current user ID',
            required: true
          }
        ]
      },
      {
        name: 'Role-Based Access',
        description: 'Filter based on user role permissions',
        category: 'role',
        filter_expression_template: 'security_level <= {user_clearance_level}',
        parameters: [
          {
            name: 'user_clearance_level',
            type: 'number',
            description: 'User clearance level (1-5)',
            required: true
          }
        ]
      },
      {
        name: 'Geographic Restriction',
        description: 'Limit access based on geographic location',
        category: 'geographic',
        filter_expression_template: 'region IN ({allowed_regions})',
        parameters: [
          {
            name: 'allowed_regions',
            type: 'list',
            description: 'List of allowed regions',
            required: true
          }
        ]
      },
      {
        name: 'Time-Based Access',
        description: 'Restrict access to recent records only',
        category: 'temporal',
        filter_expression_template: 'created_at >= NOW() - INTERVAL \'{retention_days} days\'',
        parameters: [
          {
            name: 'retention_days',
            type: 'number',
            description: 'Number of days to retain access',
            required: true,
            default_value: 90
          }
        ]
      },
      {
        name: 'Customer Data Access',
        description: 'Limit access to specific customer data',
        category: 'customer',
        filter_expression_template: 'customer_id IN (SELECT customer_id FROM user_customer_access WHERE user_id = {user_id})',
        parameters: [
          {
            name: 'user_id',
            type: 'number',
            description: 'Current user ID',
            required: true
          }
        ]
      },
      {
        name: 'PII Data Protection',
        description: 'Restrict access to PII data based on user permissions',
        category: 'privacy',
        filter_expression_template: 'data_classification != \'PII\' OR user_id IN (SELECT user_id FROM pii_access_permissions WHERE table_name = \'{table_name}\')',
        parameters: [
          {
            name: 'table_name',
            type: 'string',
            description: 'Name of the table being accessed',
            required: true
          }
        ]
      },
      {
        name: 'Multi-Tenant Isolation',
        description: 'Ensure tenant data isolation in multi-tenant systems',
        category: 'tenant',
        filter_expression_template: 'tenant_id = {user_tenant_id}',
        parameters: [
          {
            name: 'user_tenant_id',
            type: 'string',
            description: 'Tenant ID from user context',
            required: true
          }
        ]
      },
      {
        name: 'Compliance-Based Filtering',
        description: 'Filter data based on compliance requirements',
        category: 'compliance',
        filter_expression_template: 'compliance_level IN ({user_compliance_levels}) AND data_residency = \'{user_region}\'',
        parameters: [
          {
            name: 'user_compliance_levels',
            type: 'list',
            description: 'List of compliance levels user can access',
            required: true
          },
          {
            name: 'user_region',
            type: 'string',
            description: 'User\'s region for data residency compliance',
            required: true
          }
        ]
      }
    ];
  }

  /**
   * Build a policy from a template with provided parameters
   */
  buildFromTemplate(
    templateName: string,
    parameters: Record<string, unknown>,
    customName?: string
  ): {
    name: string;
    description: string;
    filter_expression: string;
    validation: RLSValidationResult;
  } {
    const template = this.getPolicyTemplates().find(t => t.name === templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Validate required parameters
    const validation = this.validateTemplateParameters(template, parameters);
    if (!validation.valid) {
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    // Build filter expression by replacing placeholders
    let filterExpression = template.filter_expression_template;
    for (const param of template.parameters) {
      const value = parameters[param.name];
      const placeholder = `{${param.name}}`;
      
      if (param.type === 'list' && Array.isArray(value)) {
        const listValues = value.map(v => `'${String(v)}'`).join(', ');
        filterExpression = filterExpression.replace(placeholder, listValues);
      } else if (param.type === 'string') {
        filterExpression = filterExpression.replace(placeholder, String(value));
      } else {
        filterExpression = filterExpression.replace(placeholder, String(value));
      }
    }

    return {
      name: customName || `${template.name} Policy`,
      description: template.description,
      filter_expression: filterExpression,
      validation: { valid: true, errors: [], warnings: [] }
    };
  }

  /**
   * Validate template parameters
   */
  private validateTemplateParameters(
    template: PolicyTemplate,
    parameters: Record<string, unknown>
  ): RLSValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const param of template.parameters) {
      const value = parameters[param.name];
      
      // Check required parameters
      if (param.required && (value === undefined || value === null)) {
        errors.push(`Required parameter '${param.name}' is missing`);
        continue;
      }

      // Skip validation for optional missing parameters
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      switch (param.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Parameter '${param.name}' must be a string`);
          }
          break;
        case 'number':
          if (typeof value !== 'number' && !Number.isFinite(Number(value))) {
            errors.push(`Parameter '${param.name}' must be a number`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Parameter '${param.name}' must be a boolean`);
          }
          break;
        case 'list':
          if (!Array.isArray(value)) {
            errors.push(`Parameter '${param.name}' must be an array`);
          } else if (value.length === 0) {
            warnings.push(`Parameter '${param.name}' is an empty array`);
          }
          break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Generate policy suggestions based on table schema
   */
  async generateSuggestions(
    database_name: string,
    schema_name: string,
    table_name: string
  ): Promise<Array<{
    template_name: string;
    relevance_score: number;
    suggested_parameters: Record<string, unknown>;
    reasoning: string;
  }>> {
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

      const suggestions: Array<{
        template_name: string;
        relevance_score: number;
        suggested_parameters: Record<string, unknown>;
        reasoning: string;
      }> = [];

      const columnNames = columns.map(c => c.column_name.toLowerCase());
      const templates = this.getPolicyTemplates();

      // Analyze columns for organizational structure
      if (columnNames.includes('department_id')) {
        suggestions.push({
          template_name: 'Department Access',
          relevance_score: 0.9,
          suggested_parameters: {},
          reasoning: 'Table contains department_id column, suggesting departmental data organization'
        });
      }

      if (columnNames.includes('org_id') || columnNames.includes('organization_id')) {
        suggestions.push({
          template_name: 'Organization Access',
          relevance_score: 0.85,
          suggested_parameters: {},
          reasoning: 'Table contains organization identifier, suitable for org-level access control'
        });
      }

      // Check for ownership columns
      if (columnNames.includes('created_by') || columnNames.includes('user_id') || columnNames.includes('owner_id')) {
        suggestions.push({
          template_name: 'User Ownership',
          relevance_score: 0.8,
          suggested_parameters: {},
          reasoning: 'Table has ownership/creator columns, suitable for user-based access control'
        });
      }

      // Check for tenant isolation
      if (columnNames.includes('tenant_id') || columnNames.includes('client_id')) {
        suggestions.push({
          template_name: 'Multi-Tenant Isolation',
          relevance_score: 0.95,
          suggested_parameters: {},
          reasoning: 'Multi-tenant table detected, tenant isolation is critical for data security'
        });
      }

      // Check for geographic/regional data
      if (columnNames.includes('region') || columnNames.includes('country') || columnNames.includes('location')) {
        suggestions.push({
          template_name: 'Geographic Restriction',
          relevance_score: 0.7,
          suggested_parameters: {
            allowed_regions: ['US', 'EU', 'APAC']
          },
          reasoning: 'Table contains geographic information, may require region-based access control'
        });
      }

      // Check for time-sensitive data
      if (columnNames.includes('created_at') || columnNames.includes('updated_at')) {
        suggestions.push({
          template_name: 'Time-Based Access',
          relevance_score: 0.6,
          suggested_parameters: {
            retention_days: 365
          },
          reasoning: 'Table has timestamp columns, time-based access control may be beneficial'
        });
      }

      // Check for customer data
      if (columnNames.includes('customer_id') || table_name.toLowerCase().includes('customer')) {
        suggestions.push({
          template_name: 'Customer Data Access',
          relevance_score: 0.75,
          suggested_parameters: {},
          reasoning: 'Customer data table detected, customer-specific access control recommended'
        });
      }

      // Check for PII/sensitive data
      const piiColumns = await runPostgresQuery<{ column_name: string }>(`
        SELECT column_name
        FROM pii_columns
        WHERE database_name = $1 AND schema_name = $2 AND table_name = $3
      `, [database_name, schema_name, table_name]);

      if (piiColumns.length > 0) {
        suggestions.push({
          template_name: 'PII Data Protection',
          relevance_score: 0.9,
          suggested_parameters: {
            table_name: table_name
          },
          reasoning: `Table contains ${piiColumns.length} PII columns, privacy protection policies recommended`
        });
      }

      // Sort by relevance score
      suggestions.sort((a, b) => b.relevance_score - a.relevance_score);

      return suggestions;
    } catch (error) {
      logger.error('Failed to generate policy suggestions', {
        error,
        database_name,
        schema_name,
        table_name
      });
      return [];
    }
  }

  /**
   * Preview policy impact on query results
   */
  async previewPolicyImpact(
    filterExpression: string,
    database_name: string,
    schema_name: string,
    table_name: string
  ): Promise<{
    estimated_row_reduction: number;
    performance_impact: 'low' | 'medium' | 'high';
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    // This would typically require running sample queries against the actual data
    // For now, we'll provide static analysis
    
    let performanceImpact: 'low' | 'medium' | 'high' = 'low';
    let estimatedRowReduction = 0;

    // Analyze filter complexity
    if (filterExpression.toLowerCase().includes('select')) {
      performanceImpact = 'high';
      warnings.push('Subqueries in RLS policies can significantly impact performance');
    }

    if (filterExpression.toLowerCase().includes('like')) {
      performanceImpact = performanceImpact === 'high' ? 'high' : 'medium';
      warnings.push('LIKE operations may slow down queries');
    }

    if (filterExpression.toLowerCase().includes('in (')) {
      performanceImpact = performanceImpact === 'high' ? 'high' : 'medium';
      warnings.push('IN clauses with large lists can impact performance');
    }

    // Estimate row reduction based on common filter patterns
    if (filterExpression.includes('user_id') || filterExpression.includes('created_by')) {
      estimatedRowReduction = 95; // User-specific filters typically reduce data significantly
    } else if (filterExpression.includes('department_id')) {
      estimatedRowReduction = 80; // Department filters reduce data substantially
    } else if (filterExpression.includes('org_id')) {
      estimatedRowReduction = 70; // Organization filters
    } else if (filterExpression.includes('tenant_id')) {
      estimatedRowReduction = 85; // Tenant isolation
    } else {
      estimatedRowReduction = 30; // Generic filters
    }

    return {
      estimated_row_reduction: estimatedRowReduction,
      performance_impact: performanceImpact,
      warnings
    };
  }

  /**
   * Get policy template by category
   */
  getTemplatesByCategory(category?: string): Record<string, PolicyTemplate[]> {
    const templates = this.getPolicyTemplates();
    
    if (category) {
      return {
        [category]: templates.filter(t => t.category === category)
      };
    }

    // Group by category
    const grouped: Record<string, PolicyTemplate[]> = {};
    for (const template of templates) {
      if (!grouped[template.category]) {
        grouped[template.category] = [];
      }
      grouped[template.category].push(template);
    }

    return grouped;
  }

  /**
   * Validate a custom filter expression
   */
  async validateCustomExpression(expression: string): Promise<RLSValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!expression.trim()) {
      errors.push('Filter expression cannot be empty');
    }

    // Check for SQL injection patterns
    const injectionPatterns = [
      { pattern: /--/, message: 'SQL comments not allowed in filter expressions' },
      { pattern: /\/\*/, message: 'Multi-line comments not allowed in filter expressions' },
      { pattern: /;\s*(?:drop|delete|update|insert|create|alter)/i, message: 'Dangerous SQL operations not allowed' },
      { pattern: /'\s*or\s*'.*'=/i, message: 'Potential SQL injection pattern detected' },
      { pattern: /union\s+select/i, message: 'UNION SELECT operations not allowed' }
    ];

    for (const { pattern, message } of injectionPatterns) {
      if (pattern.test(expression)) {
        errors.push(message);
      }
    }

    // Performance warnings
    if (expression.toLowerCase().includes('like')) {
      warnings.push('LIKE operations can impact query performance');
    }

    if ((expression.match(/select/gi) || []).length > 1) {
      warnings.push('Multiple subqueries may significantly impact performance');
    }

    // Check for unbalanced parentheses
    const openParens = (expression.match(/\(/g) || []).length;
    const closeParens = (expression.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push('Unbalanced parentheses in expression');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}