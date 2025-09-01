import {
  TransformationRule,
  TransformationResult,
  FieldRenameTransformation,
  ValueMappingTransformation,
  DerivedFieldTransformation,
  DataTypeConversionTransformation,
  FieldFilterTransformation,
  AggregationTransformation
} from '@sme/schemas/transformations';

export class TransformationEngine {
  /**
   * Apply transformations to query results
   */
  async applyTransformations(
    data: Record<string, any>[],
    rules: TransformationRule[],
    sourceColumns: Array<{ name: string; type: string; nullable: boolean }>
  ): Promise<TransformationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      let transformedData = [...data];
      let currentColumns = [...sourceColumns];
      
      // Apply each transformation rule in sequence
      for (const rule of rules) {
        const ruleResult = await this.applyRule(transformedData, rule, currentColumns);
        transformedData = ruleResult.data;
        currentColumns = ruleResult.columns;
        
        if (ruleResult.errors.length > 0) {
          errors.push(...ruleResult.errors);
        }
        if (ruleResult.warnings.length > 0) {
          warnings.push(...ruleResult.warnings);
        }
      }
      
      const executionTimeMs = Date.now() - startTime;
      
      return {
        success: errors.length === 0,
        rowsProcessed: data.length,
        rowsReturned: transformedData.length,
        executionTimeMs,
        columns: currentColumns,
        data: transformedData,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      
      return {
        success: false,
        rowsProcessed: data.length,
        rowsReturned: 0,
        executionTimeMs,
        columns: sourceColumns,
        data: [],
        errors: [error instanceof Error ? error.message : 'Unknown transformation error']
      };
    }
  }

  /**
   * Apply a single transformation rule
   */
  private async applyRule(
    data: Record<string, any>[],
    rule: TransformationRule,
    columns: Array<{ name: string; type: string; nullable: boolean }>
  ): Promise<{
    data: Record<string, any>[];
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    errors: string[];
    warnings: string[];
  }> {
    switch (rule.type) {
      case 'field_rename':
        return this.applyFieldRename(data, rule, columns);
      case 'value_mapping':
        return this.applyValueMapping(data, rule, columns);
      case 'derived_field':
        return this.applyDerivedField(data, rule, columns);
      case 'data_type_conversion':
        return this.applyDataTypeConversion(data, rule, columns);
      case 'field_filter':
        return this.applyFieldFilter(data, rule, columns);
      case 'aggregation':
        return this.applyAggregation(data, rule, columns);
      default:
        return {
          data,
          columns,
          errors: [`Unknown transformation type: ${(rule as any).type}`],
          warnings: []
        };
    }
  }

  /**
   * Apply field rename transformation
   */
  private applyFieldRename(
    data: Record<string, any>[],
    rule: FieldRenameTransformation,
    columns: Array<{ name: string; type: string; nullable: boolean }>
  ): Promise<{
    data: Record<string, any>[];
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if source field exists
    const sourceColumn = columns.find(col => col.name === rule.sourceField);
    if (!sourceColumn) {
      errors.push(`Source field '${rule.sourceField}' not found`);
      return Promise.resolve({ data, columns, errors, warnings });
    }

    // Check if target field already exists
    const targetExists = columns.some(col => col.name === rule.targetField);
    if (targetExists) {
      warnings.push(`Target field '${rule.targetField}' already exists and will be overwritten`);
    }

    // Transform data
    const transformedData = data.map(row => {
      const newRow = { ...row };
      newRow[rule.targetField] = newRow[rule.sourceField];
      delete newRow[rule.sourceField];
      return newRow;
    });

    // Update columns
    const newColumns = columns.map(col => 
      col.name === rule.sourceField 
        ? { ...col, name: rule.targetField }
        : col
    );

    return Promise.resolve({
      data: transformedData,
      columns: newColumns,
      errors,
      warnings
    });
  }

  /**
   * Apply value mapping transformation
   */
  private applyValueMapping(
    data: Record<string, any>[],
    rule: ValueMappingTransformation,
    columns: Array<{ name: string; type: string; nullable: boolean }>
  ): Promise<{
    data: Record<string, any>[];
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const targetField = rule.targetField || rule.sourceField;

    // Check if source field exists
    const sourceColumn = columns.find(col => col.name === rule.sourceField);
    if (!sourceColumn) {
      errors.push(`Source field '${rule.sourceField}' not found`);
      return Promise.resolve({ data, columns, errors, warnings });
    }

    // Transform data
    const transformedData = data.map(row => {
      const sourceValue = String(row[rule.sourceField] || '');
      const mappedValue = rule.mappings[sourceValue] || rule.defaultValue || sourceValue;
      
      const newRow = { ...row };
      newRow[targetField] = mappedValue;
      
      return newRow;
    });

    // Update columns if creating a new field
    let newColumns = columns;
    if (rule.targetField && rule.targetField !== rule.sourceField) {
      const targetExists = columns.some(col => col.name === rule.targetField);
      if (!targetExists) {
        newColumns = [...columns, {
          name: rule.targetField,
          type: 'string',
          nullable: true
        }];
      }
    }

    return Promise.resolve({
      data: transformedData,
      columns: newColumns,
      errors,
      warnings
    });
  }

  /**
   * Apply derived field transformation
   */
  private applyDerivedField(
    data: Record<string, any>[],
    rule: DerivedFieldTransformation,
    columns: Array<{ name: string; type: string; nullable: boolean }>
  ): Promise<{
    data: Record<string, any>[];
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if all source fields exist
    for (const field of rule.sourceFields) {
      const exists = columns.some(col => col.name === field);
      if (!exists) {
        errors.push(`Source field '${field}' not found`);
      }
    }

    if (errors.length > 0) {
      return Promise.resolve({ data, columns, errors, warnings });
    }

    // Transform data based on operation
    const transformedData = data.map(row => {
      const newRow = { ...row };
      
      switch (rule.operation) {
        case 'concatenate':
          const separator = rule.parameters?.separator || ' ';
          newRow[rule.targetField] = rule.sourceFields
            .map(field => String(row[field] || ''))
            .join(separator);
          break;
          
        case 'add':
          newRow[rule.targetField] = rule.sourceFields
            .reduce((sum, field) => sum + (Number(row[field]) || 0), 0);
          break;
          
        case 'subtract':
          newRow[rule.targetField] = rule.sourceFields
            .reduce((diff, field, index) => 
              index === 0 ? Number(row[field]) || 0 : diff - (Number(row[field]) || 0)
            );
          break;
          
        case 'multiply':
          newRow[rule.targetField] = rule.sourceFields
            .reduce((product, field) => product * (Number(row[field]) || 0), 1);
          break;
          
        case 'divide':
          const [dividend, divisor, ...rest] = rule.sourceFields;
          const divisorValue = Number(row[divisor]) || 1;
          newRow[rule.targetField] = divisorValue !== 0 
            ? (Number(row[dividend]) || 0) / divisorValue
            : null;
          break;
          
        case 'conditional':
          const conditionField = rule.sourceFields[0];
          const trueValue = rule.parameters?.trueValue || rule.sourceFields[1] ? row[rule.sourceFields[1]] : true;
          const falseValue = rule.parameters?.falseValue || rule.sourceFields[2] ? row[rule.sourceFields[2]] : false;
          newRow[rule.targetField] = row[conditionField] ? trueValue : falseValue;
          break;
          
        default:
          warnings.push(`Unknown derived field operation: ${rule.operation}`);
      }
      
      return newRow;
    });

    // Add target column if it doesn't exist
    const targetExists = columns.some(col => col.name === rule.targetField);
    const newColumns = targetExists ? columns : [...columns, {
      name: rule.targetField,
      type: rule.operation === 'concatenate' || rule.operation === 'conditional' ? 'string' : 'number',
      nullable: true
    }];

    return Promise.resolve({
      data: transformedData,
      columns: newColumns,
      errors,
      warnings
    });
  }

  /**
   * Apply data type conversion transformation
   */
  private applyDataTypeConversion(
    data: Record<string, any>[],
    rule: DataTypeConversionTransformation,
    columns: Array<{ name: string; type: string; nullable: boolean }>
  ): Promise<{
    data: Record<string, any>[];
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const targetField = rule.targetField || rule.sourceField;

    // Check if source field exists
    const sourceColumn = columns.find(col => col.name === rule.sourceField);
    if (!sourceColumn) {
      errors.push(`Source field '${rule.sourceField}' not found`);
      return Promise.resolve({ data, columns, errors, warnings });
    }

    // Transform data
    const transformedData = data.map(row => {
      const sourceValue = row[rule.sourceField];
      const newRow = { ...row };
      
      try {
        switch (rule.targetDataType) {
          case 'string':
            newRow[targetField] = String(sourceValue);
            break;
          case 'number':
            newRow[targetField] = sourceValue === null || sourceValue === undefined ? null : Number(sourceValue);
            break;
          case 'boolean':
            newRow[targetField] = Boolean(sourceValue);
            break;
          case 'date':
          case 'datetime':
            if (sourceValue) {
              const date = new Date(sourceValue);
              newRow[targetField] = isNaN(date.getTime()) ? null : date.toISOString();
            } else {
              newRow[targetField] = null;
            }
            break;
          case 'json':
            newRow[targetField] = typeof sourceValue === 'string' ? JSON.parse(sourceValue) : sourceValue;
            break;
          default:
            warnings.push(`Unknown target data type: ${rule.targetDataType}`);
            newRow[targetField] = sourceValue;
        }
      } catch (error) {
        warnings.push(`Failed to convert value '${sourceValue}' to ${rule.targetDataType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        newRow[targetField] = null;
      }
      
      return newRow;
    });

    // Update columns
    let newColumns = columns;
    if (rule.targetField && rule.targetField !== rule.sourceField) {
      const targetExists = columns.some(col => col.name === rule.targetField);
      if (!targetExists) {
        newColumns = [...columns, {
          name: rule.targetField,
          type: rule.targetDataType,
          nullable: true
        }];
      }
    } else {
      newColumns = columns.map(col => 
        col.name === rule.sourceField 
          ? { ...col, type: rule.targetDataType }
          : col
      );
    }

    return Promise.resolve({
      data: transformedData,
      columns: newColumns,
      errors,
      warnings
    });
  }

  /**
   * Apply field filter transformation
   */
  private applyFieldFilter(
    data: Record<string, any>[],
    rule: FieldFilterTransformation,
    columns: Array<{ name: string; type: string; nullable: boolean }>
  ): Promise<{
    data: Record<string, any>[];
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if source field exists
    const sourceColumn = columns.find(col => col.name === rule.sourceField);
    if (!sourceColumn) {
      errors.push(`Source field '${rule.sourceField}' not found`);
      return Promise.resolve({ data, columns, errors, warnings });
    }

    // Filter data based on condition
    const filteredData = data.filter(row => {
      const value = row[rule.sourceField];
      const strValue = String(value || '');
      
      let matches = false;
      
      switch (rule.condition) {
        case 'equals':
          matches = strValue === (rule.value || '');
          break;
        case 'not_equals':
          matches = strValue !== (rule.value || '');
          break;
        case 'contains':
          matches = strValue.includes(rule.value || '');
          break;
        case 'not_contains':
          matches = !strValue.includes(rule.value || '');
          break;
        case 'starts_with':
          matches = strValue.startsWith(rule.value || '');
          break;
        case 'ends_with':
          matches = strValue.endsWith(rule.value || '');
          break;
        case 'is_null':
          matches = value === null || value === undefined;
          break;
        case 'is_not_null':
          matches = value !== null && value !== undefined;
          break;
        case 'greater_than':
          matches = Number(value) > Number(rule.value);
          break;
        case 'less_than':
          matches = Number(value) < Number(rule.value);
          break;
        default:
          warnings.push(`Unknown filter condition: ${rule.condition}`);
          return true;
      }
      
      return rule.action === 'include' ? matches : !matches;
    });

    return Promise.resolve({
      data: filteredData,
      columns,
      errors,
      warnings
    });
  }

  /**
   * Apply aggregation transformation
   */
  private applyAggregation(
    data: Record<string, any>[],
    rule: AggregationTransformation,
    columns: Array<{ name: string; type: string; nullable: boolean }>
  ): Promise<{
    data: Record<string, any>[];
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if source field exists
    const sourceColumn = columns.find(col => col.name === rule.sourceField);
    if (!sourceColumn) {
      errors.push(`Source field '${rule.sourceField}' not found`);
      return Promise.resolve({ data, columns, errors, warnings });
    }

    // Check if group by fields exist
    if (rule.groupByFields) {
      for (const field of rule.groupByFields) {
        const exists = columns.some(col => col.name === field);
        if (!exists) {
          errors.push(`Group by field '${field}' not found`);
        }
      }
    }

    if (errors.length > 0) {
      return Promise.resolve({ data, columns, errors, warnings });
    }

    // Group data if needed
    const groups = new Map<string, Record<string, any>[]>();
    
    if (rule.groupByFields && rule.groupByFields.length > 0) {
      data.forEach(row => {
        const groupKey = rule.groupByFields!.map(field => String(row[field] || '')).join('|');
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(row);
      });
    } else {
      groups.set('all', data);
    }

    // Apply aggregation
    const aggregatedData: Record<string, any>[] = [];
    
    groups.forEach((groupData, groupKey) => {
      const values = groupData.map(row => row[rule.sourceField]).filter(v => v !== null && v !== undefined);
      const numericValues = values.map(Number).filter(v => !isNaN(v));
      
      let aggregatedValue: any;
      
      switch (rule.operation) {
        case 'count':
          aggregatedValue = groupData.length;
          break;
        case 'count_distinct':
          aggregatedValue = new Set(values).size;
          break;
        case 'sum':
          aggregatedValue = numericValues.reduce((sum, val) => sum + val, 0);
          break;
        case 'avg':
          aggregatedValue = numericValues.length > 0 
            ? numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length
            : null;
          break;
        case 'min':
          aggregatedValue = numericValues.length > 0 ? Math.min(...numericValues) : null;
          break;
        case 'max':
          aggregatedValue = numericValues.length > 0 ? Math.max(...numericValues) : null;
          break;
        default:
          warnings.push(`Unknown aggregation operation: ${rule.operation}`);
          aggregatedValue = null;
      }
      
      const resultRow: Record<string, any> = {};
      
      // Add group by fields
      if (rule.groupByFields && rule.groupByFields.length > 0) {
        const groupValues = groupKey.split('|');
        rule.groupByFields.forEach((field, index) => {
          resultRow[field] = groupValues[index];
        });
      }
      
      // Add aggregated value
      resultRow[rule.targetField] = aggregatedValue;
      
      aggregatedData.push(resultRow);
    });

    // Update columns
    let newColumns: Array<{ name: string; type: string; nullable: boolean }> = [];
    
    // Add group by columns
    if (rule.groupByFields && rule.groupByFields.length > 0) {
      rule.groupByFields.forEach(field => {
        const sourceCol = columns.find(col => col.name === field);
        if (sourceCol) {
          newColumns.push(sourceCol);
        }
      });
    }
    
    // Add target column
    newColumns.push({
      name: rule.targetField,
      type: ['count', 'count_distinct'].includes(rule.operation) ? 'number' : sourceColumn.type,
      nullable: ['avg', 'min', 'max'].includes(rule.operation)
    });

    return Promise.resolve({
      data: aggregatedData,
      columns: newColumns,
      errors,
      warnings
    });
  }
}