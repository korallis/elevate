import {
  TransformationRule,
  TransformationConfig,
  TransformationValidationResult,
  validateTransformationRule,
  validateTransformationConfig
} from '@sme/schemas/transformations';

export class TransformationValidator {
  /**
   * Validate a complete transformation configuration
   */
  validateTransformation(config: unknown): TransformationValidationResult {
    return validateTransformationConfig(config);
  }

  /**
   * Validate a single transformation rule
   */
  validateRule(rule: unknown): TransformationValidationResult {
    return validateTransformationRule(rule);
  }

  /**
   * Validate transformation rules against source schema
   */
  validateAgainstSchema(
    rules: TransformationRule[],
    sourceColumns: Array<{ name: string; type: string; nullable: boolean }>
  ): TransformationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const columnNames = new Set(sourceColumns.map(col => col.name));
    const createdFields = new Set<string>();
    const renamedFields = new Map<string, string>(); // original -> new name

    // Track field dependencies and creation order
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const rulePrefix = `Rule ${i + 1} (${rule.type})`;

      switch (rule.type) {
        case 'field_rename':
          // Check if source field exists (considering previous renames)
          const actualSourceField = this.resolveFieldName(rule.sourceField, renamedFields);
          if (!columnNames.has(actualSourceField) && !createdFields.has(actualSourceField)) {
            errors.push(`${rulePrefix}: Source field '${rule.sourceField}' does not exist`);
          }

          // Check if target field already exists
          const actualTargetField = this.resolveFieldName(rule.targetField, renamedFields);
          if (columnNames.has(actualTargetField) || createdFields.has(actualTargetField)) {
            warnings.push(`${rulePrefix}: Target field '${rule.targetField}' already exists and will be overwritten`);
          }

          // Update field tracking
          renamedFields.set(rule.sourceField, rule.targetField);
          createdFields.add(rule.targetField);
          break;

        case 'value_mapping':
          // Check if source field exists
          const mappingSourceField = this.resolveFieldName(rule.sourceField, renamedFields);
          if (!columnNames.has(mappingSourceField) && !createdFields.has(mappingSourceField)) {
            errors.push(`${rulePrefix}: Source field '${rule.sourceField}' does not exist`);
          }

          // If creating a new field, track it
          if (rule.targetField && rule.targetField !== rule.sourceField) {
            createdFields.add(rule.targetField);
          }

          // Validate mapping values
          if (Object.keys(rule.mappings).length === 0) {
            warnings.push(`${rulePrefix}: No mappings defined - values will remain unchanged`);
          }
          break;

        case 'derived_field':
          // Check if all source fields exist
          for (const sourceField of rule.sourceFields) {
            const actualField = this.resolveFieldName(sourceField, renamedFields);
            if (!columnNames.has(actualField) && !createdFields.has(actualField)) {
              errors.push(`${rulePrefix}: Source field '${sourceField}' does not exist`);
            }
          }

          // Validate operation-specific requirements
          switch (rule.operation) {
            case 'add':
            case 'subtract':
            case 'multiply':
            case 'divide':
              if (rule.sourceFields.length < 2) {
                errors.push(`${rulePrefix}: ${rule.operation} operation requires at least 2 source fields`);
              }
              // Check if source fields are numeric types
              for (const sourceField of rule.sourceFields) {
                const actualField = this.resolveFieldName(sourceField, renamedFields);
                const column = sourceColumns.find(col => col.name === actualField);
                if (column && !['number', 'integer', 'float', 'decimal'].includes(column.type.toLowerCase())) {
                  warnings.push(`${rulePrefix}: Field '${sourceField}' may not be numeric (type: ${column.type})`);
                }
              }
              break;

            case 'concatenate':
              if (rule.sourceFields.length < 1) {
                errors.push(`${rulePrefix}: Concatenate operation requires at least 1 source field`);
              }
              break;

            case 'conditional':
              if (rule.sourceFields.length < 1) {
                errors.push(`${rulePrefix}: Conditional operation requires at least 1 source field for condition`);
              }
              break;
          }

          createdFields.add(rule.targetField);
          break;

        case 'data_type_conversion':
          // Check if source field exists
          const conversionSourceField = this.resolveFieldName(rule.sourceField, renamedFields);
          if (!columnNames.has(conversionSourceField) && !createdFields.has(conversionSourceField)) {
            errors.push(`${rulePrefix}: Source field '${rule.sourceField}' does not exist`);
          }

          // Validate conversion compatibility
          const sourceColumn = sourceColumns.find(col => col.name === conversionSourceField);
          if (sourceColumn) {
            const conversionWarning = this.validateTypeConversion(sourceColumn.type, rule.targetDataType);
            if (conversionWarning) {
              warnings.push(`${rulePrefix}: ${conversionWarning}`);
            }
          }

          // If creating a new field, track it
          if (rule.targetField && rule.targetField !== rule.sourceField) {
            createdFields.add(rule.targetField);
          }
          break;

        case 'field_filter':
          // Check if source field exists
          const filterSourceField = this.resolveFieldName(rule.sourceField, renamedFields);
          if (!columnNames.has(filterSourceField) && !createdFields.has(filterSourceField)) {
            errors.push(`${rulePrefix}: Source field '${rule.sourceField}' does not exist`);
          }

          // Validate filter conditions that require values
          if (['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'greater_than', 'less_than'].includes(rule.condition)) {
            if (!rule.value && rule.value !== '') {
              errors.push(`${rulePrefix}: Condition '${rule.condition}' requires a value`);
            }
          }
          break;

        case 'aggregation':
          // Check if source field exists
          const aggSourceField = this.resolveFieldName(rule.sourceField, renamedFields);
          if (!columnNames.has(aggSourceField) && !createdFields.has(aggSourceField)) {
            errors.push(`${rulePrefix}: Source field '${rule.sourceField}' does not exist`);
          }

          // Check if group by fields exist
          if (rule.groupByFields) {
            for (const groupField of rule.groupByFields) {
              const actualGroupField = this.resolveFieldName(groupField, renamedFields);
              if (!columnNames.has(actualGroupField) && !createdFields.has(actualGroupField)) {
                errors.push(`${rulePrefix}: Group by field '${groupField}' does not exist`);
              }
            }
          }

          // Validate aggregation operation compatibility
          const aggSourceColumn = sourceColumns.find(col => col.name === aggSourceField);
          if (aggSourceColumn && ['sum', 'avg', 'min', 'max'].includes(rule.operation)) {
            if (!['number', 'integer', 'float', 'decimal'].includes(aggSourceColumn.type.toLowerCase())) {
              warnings.push(`${rulePrefix}: Aggregation operation '${rule.operation}' may not work correctly with non-numeric field '${rule.sourceField}' (type: ${aggSourceColumn.type})`);
            }
          }

          createdFields.add(rule.targetField);
          break;
      }
    }

    // Check for circular dependencies in field renames
    const circularDeps = this.findCircularDependencies(renamedFields);
    if (circularDeps.length > 0) {
      errors.push(`Circular field rename dependencies detected: ${circularDeps.join(' -> ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Resolve field name considering previous renames
   */
  private resolveFieldName(fieldName: string, renamedFields: Map<string, string>): string {
    let resolvedName = fieldName;
    const visited = new Set<string>();

    while (renamedFields.has(resolvedName) && !visited.has(resolvedName)) {
      visited.add(resolvedName);
      resolvedName = renamedFields.get(resolvedName)!;
    }

    return resolvedName;
  }

  /**
   * Find circular dependencies in field renames
   */
  private findCircularDependencies(renamedFields: Map<string, string>): string[] {
    for (const [source, target] of renamedFields.entries()) {
      const visited = new Set<string>();
      const path: string[] = [source];
      let current = target;

      while (renamedFields.has(current)) {
        if (visited.has(current)) {
          // Found a cycle
          const cycleStart = path.indexOf(current);
          return path.slice(cycleStart).concat([current]);
        }
        visited.add(current);
        path.push(current);
        current = renamedFields.get(current)!;
      }
    }

    return [];
  }

  /**
   * Validate data type conversion compatibility
   */
  private validateTypeConversion(sourceType: string, targetType: string): string | null {
    const source = sourceType.toLowerCase();
    const target = targetType.toLowerCase();

    // Define conversion compatibility matrix
    const incompatibleConversions: Record<string, string[]> = {
      'boolean': ['date', 'datetime'],
      'date': ['number', 'boolean'],
      'datetime': ['number', 'boolean'],
      'json': ['number', 'boolean', 'date', 'datetime']
    };

    if (incompatibleConversions[source]?.includes(target)) {
      return `Converting from ${sourceType} to ${targetType} may result in data loss or errors`;
    }

    // Warn about potentially lossy conversions
    if (source.includes('decimal') || source.includes('float')) {
      if (target.includes('int')) {
        return `Converting from ${sourceType} to ${targetType} will lose decimal precision`;
      }
    }

    if (source.includes('timestamp') && target === 'date') {
      return `Converting from ${sourceType} to ${targetType} will lose time information`;
    }

    return null;
  }

  /**
   * Validate transformation performance implications
   */
  validatePerformance(rules: TransformationRule[]): TransformationValidationResult {
    const warnings: string[] = [];
    
    // Count expensive operations
    const expensiveOps = rules.filter(rule => 
      ['aggregation', 'derived_field', 'data_type_conversion'].includes(rule.type)
    ).length;

    if (expensiveOps > 10) {
      warnings.push(`High number of expensive operations (${expensiveOps}). Consider optimizing or splitting the transformation.`);
    }

    // Check for multiple aggregations
    const aggregations = rules.filter(rule => rule.type === 'aggregation');
    if (aggregations.length > 3) {
      warnings.push(`Multiple aggregation operations detected (${aggregations.length}). Consider combining them for better performance.`);
    }

    // Check for field filters early in the pipeline
    const firstFilterIndex = rules.findIndex(rule => rule.type === 'field_filter');
    if (firstFilterIndex > 5) {
      warnings.push('Field filters should be applied early in the transformation pipeline to reduce data processing overhead.');
    }

    return {
      valid: true,
      errors: [],
      warnings
    };
  }
}