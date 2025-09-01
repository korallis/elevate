import {
  TransformationRule,
  FieldRenameTransformation,
  ValueMappingTransformation,
  FieldFilterTransformation
} from '@sme/schemas/transformations';

export interface OptimizationResult {
  optimizedRules: TransformationRule[];
  optimizationsApplied: string[];
  performanceImprovement: number; // Estimated percentage improvement
}

export class TransformationOptimizer {
  /**
   * Optimize transformation rules for better performance
   */
  optimize(rules: TransformationRule[]): OptimizationResult {
    let optimizedRules = [...rules];
    const optimizationsApplied: string[] = [];
    let performanceImprovement = 0;

    // Apply optimizations in order of impact
    const filterOptimization = this.moveFiltersEarly(optimizedRules);
    optimizedRules = filterOptimization.rules;
    if (filterOptimization.applied) {
      optimizationsApplied.push('Moved field filters to early execution');
      performanceImprovement += 15;
    }

    const renameOptimization = this.combineFieldRenames(optimizedRules);
    optimizedRules = renameOptimization.rules;
    if (renameOptimization.applied) {
      optimizationsApplied.push('Combined sequential field renames');
      performanceImprovement += 10;
    }

    const mappingOptimization = this.combineMappings(optimizedRules);
    optimizedRules = mappingOptimization.rules;
    if (mappingOptimization.applied) {
      optimizationsApplied.push('Combined value mappings on same fields');
      performanceImprovement += 8;
    }

    const redundantOptimization = this.removeRedundantRules(optimizedRules);
    optimizedRules = redundantOptimization.rules;
    if (redundantOptimization.applied) {
      optimizationsApplied.push('Removed redundant transformation rules');
      performanceImprovement += 5;
    }

    const orderOptimization = this.optimizeExecutionOrder(optimizedRules);
    optimizedRules = orderOptimization.rules;
    if (orderOptimization.applied) {
      optimizationsApplied.push('Optimized rule execution order');
      performanceImprovement += 12;
    }

    return {
      optimizedRules,
      optimizationsApplied,
      performanceImprovement: Math.min(performanceImprovement, 100)
    };
  }

  /**
   * Move field filters to early execution for better performance
   */
  private moveFiltersEarly(rules: TransformationRule[]): { rules: TransformationRule[]; applied: boolean } {
    const filters: FieldFilterTransformation[] = [];
    const otherRules: TransformationRule[] = [];
    
    // Separate filters from other rules
    rules.forEach(rule => {
      if (rule.type === 'field_filter') {
        filters.push(rule);
      } else {
        otherRules.push(rule);
      }
    });

    // If no filters or filters are already first, no optimization needed
    if (filters.length === 0 || rules.findIndex(r => r.type === 'field_filter') < 3) {
      return { rules, applied: false };
    }

    // Sort filters by selectivity (most restrictive first)
    const sortedFilters = filters.sort((a, b) => {
      const selectivityA = this.estimateFilterSelectivity(a);
      const selectivityB = this.estimateFilterSelectivity(b);
      return selectivityA - selectivityB; // Lower selectivity (more restrictive) first
    });

    return {
      rules: [...sortedFilters, ...otherRules],
      applied: true
    };
  }

  /**
   * Estimate filter selectivity (0 = most restrictive, 1 = least restrictive)
   */
  private estimateFilterSelectivity(filter: FieldFilterTransformation): number {
    switch (filter.condition) {
      case 'is_null':
      case 'is_not_null':
        return 0.1; // Very selective
      case 'equals':
        return 0.2; // Highly selective
      case 'starts_with':
      case 'ends_with':
        return 0.3; // Moderately selective
      case 'contains':
        return 0.4; // Less selective
      case 'not_equals':
      case 'not_contains':
        return 0.8; // Less restrictive
      case 'greater_than':
      case 'less_than':
        return 0.5; // Depends on data distribution
      default:
        return 0.5;
    }
  }

  /**
   * Combine sequential field renames that can be merged
   */
  private combineFieldRenames(rules: TransformationRule[]): { rules: TransformationRule[]; applied: boolean } {
    const optimizedRules: TransformationRule[] = [];
    const renameChains = new Map<string, string>(); // source -> final target
    let applied = false;
    
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      
      if (rule.type === 'field_rename') {
        // Check if this is part of a rename chain
        const existingChain = renameChains.get(rule.sourceField);
        if (existingChain) {
          // This is a continuation of a rename chain
          renameChains.set(rule.sourceField, rule.targetField);
          applied = true;
        } else {
          renameChains.set(rule.sourceField, rule.targetField);
        }
      } else {
        // Process accumulated renames
        if (renameChains.size > 0) {
          renameChains.forEach((target, source) => {
            optimizedRules.push({
              type: 'field_rename',
              sourceField: source,
              targetField: target,
              description: `Optimized rename chain: ${source} -> ${target}`
            } as FieldRenameTransformation);
          });
          renameChains.clear();
        }
        
        optimizedRules.push(rule);
      }
    }
    
    // Process any remaining renames at the end
    if (renameChains.size > 0) {
      renameChains.forEach((target, source) => {
        optimizedRules.push({
          type: 'field_rename',
          sourceField: source,
          targetField: target,
          description: `Optimized rename chain: ${source} -> ${target}`
        } as FieldRenameTransformation);
      });
    }

    return { rules: optimizedRules, applied };
  }

  /**
   * Combine value mappings on the same field
   */
  private combineMappings(rules: TransformationRule[]): { rules: TransformationRule[]; applied: boolean } {
    const optimizedRules: TransformationRule[] = [];
    const mappingsByField = new Map<string, ValueMappingTransformation[]>();
    let applied = false;

    // Group mappings by source field
    rules.forEach(rule => {
      if (rule.type === 'value_mapping') {
        const key = `${rule.sourceField}->${rule.targetField || rule.sourceField}`;
        if (!mappingsByField.has(key)) {
          mappingsByField.set(key, []);
        }
        mappingsByField.get(key)!.push(rule);
      } else {
        optimizedRules.push(rule);
      }
    });

    // Combine mappings for each field
    mappingsByField.forEach((mappings, key) => {
      if (mappings.length > 1) {
        // Combine all mappings for this field
        const combinedMapping: ValueMappingTransformation = {
          type: 'value_mapping',
          sourceField: mappings[0].sourceField,
          targetField: mappings[0].targetField,
          mappings: {},
          defaultValue: mappings[mappings.length - 1].defaultValue, // Use last default
          description: `Combined ${mappings.length} value mappings`
        };

        // Merge all mapping dictionaries
        mappings.forEach(mapping => {
          Object.assign(combinedMapping.mappings, mapping.mappings);
        });

        optimizedRules.push(combinedMapping);
        applied = true;
      } else {
        optimizedRules.push(mappings[0]);
      }
    });

    return { rules: optimizedRules, applied };
  }

  /**
   * Remove redundant transformation rules
   */
  private removeRedundantRules(rules: TransformationRule[]): { rules: TransformationRule[]; applied: boolean } {
    const optimizedRules: TransformationRule[] = [];
    const processedFields = new Set<string>();
    let applied = false;

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      let isRedundant = false;

      // Check for redundant field renames (A -> B, then B -> A)
      if (rule.type === 'field_rename') {
        const reverseRename = rules.slice(i + 1).find(r => 
          r.type === 'field_rename' && 
          r.sourceField === rule.targetField && 
          r.targetField === rule.sourceField
        );
        
        if (reverseRename) {
          // Skip both rules as they cancel out
          const reverseIndex = rules.indexOf(reverseRename);
          rules.splice(reverseIndex, 1);
          isRedundant = true;
          applied = true;
        }
      }

      // Check for duplicate transformations on the same field
      if (!isRedundant) {
        const fieldKey = this.getFieldKey(rule);
        if (fieldKey && processedFields.has(fieldKey)) {
          // Check if this is truly redundant
          const existing = optimizedRules.find(r => this.getFieldKey(r) === fieldKey);
          if (existing && this.areRulesEquivalent(existing, rule)) {
            isRedundant = true;
            applied = true;
          }
        }
        
        if (fieldKey) {
          processedFields.add(fieldKey);
        }
      }

      if (!isRedundant) {
        optimizedRules.push(rule);
      }
    }

    return { rules: optimizedRules, applied };
  }

  /**
   * Get a unique key for field-based rules
   */
  private getFieldKey(rule: TransformationRule): string | null {
    switch (rule.type) {
      case 'field_rename':
        return `rename:${rule.sourceField}`;
      case 'value_mapping':
        return `mapping:${rule.sourceField}`;
      case 'data_type_conversion':
        return `conversion:${rule.sourceField}`;
      default:
        return null;
    }
  }

  /**
   * Check if two rules are equivalent
   */
  private areRulesEquivalent(rule1: TransformationRule, rule2: TransformationRule): boolean {
    if (rule1.type !== rule2.type) return false;

    switch (rule1.type) {
      case 'field_rename':
        const rename1 = rule1 as FieldRenameTransformation;
        const rename2 = rule2 as FieldRenameTransformation;
        return rename1.sourceField === rename2.sourceField && 
               rename1.targetField === rename2.targetField;

      case 'value_mapping':
        const mapping1 = rule1 as ValueMappingTransformation;
        const mapping2 = rule2 as ValueMappingTransformation;
        return mapping1.sourceField === mapping2.sourceField &&
               JSON.stringify(mapping1.mappings) === JSON.stringify(mapping2.mappings);

      default:
        return false;
    }
  }

  /**
   * Optimize the execution order of transformation rules
   */
  private optimizeExecutionOrder(rules: TransformationRule[]): { rules: TransformationRule[]; applied: boolean } {
    // Define operation priorities (lower = execute earlier)
    const operationPriorities: Record<string, number> = {
      'field_filter': 1,      // Execute filters first to reduce data size
      'field_rename': 2,      // Rename fields early
      'data_type_conversion': 3, // Convert types before computations
      'value_mapping': 4,     // Map values
      'derived_field': 5,     // Create derived fields
      'aggregation': 6        // Aggregate last
    };

    // Check if reordering is needed
    let needsReordering = false;
    for (let i = 1; i < rules.length; i++) {
      const currentPriority = operationPriorities[rules[i].type] || 999;
      const previousPriority = operationPriorities[rules[i - 1].type] || 999;
      
      if (currentPriority < previousPriority) {
        needsReordering = true;
        break;
      }
    }

    if (!needsReordering) {
      return { rules, applied: false };
    }

    // Sort rules by priority while maintaining dependency order
    const optimizedRules = [...rules].sort((a, b) => {
      const priorityA = operationPriorities[a.type] || 999;
      const priorityB = operationPriorities[b.type] || 999;
      
      // If priorities are different, sort by priority
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same priority, maintain original order
      return rules.indexOf(a) - rules.indexOf(b);
    });

    // Validate that dependencies are still satisfied
    if (this.validateDependencies(optimizedRules)) {
      return { rules: optimizedRules, applied: true };
    }

    // If dependencies are broken, return original order
    return { rules, applied: false };
  }

  /**
   * Validate that rule dependencies are satisfied
   */
  private validateDependencies(rules: TransformationRule[]): boolean {
    const availableFields = new Set<string>();
    const renamedFields = new Map<string, string>();

    for (const rule of rules) {
      const requiredFields = this.getRequiredFields(rule);
      
      // Check if all required fields are available
      for (const field of requiredFields) {
        const actualField = renamedFields.get(field) || field;
        if (!availableFields.has(actualField) && !this.isSourceField(actualField)) {
          return false; // Dependency not satisfied
        }
      }

      // Update available fields based on rule output
      this.updateAvailableFields(rule, availableFields, renamedFields);
    }

    return true;
  }

  /**
   * Get fields required by a transformation rule
   */
  private getRequiredFields(rule: TransformationRule): string[] {
    switch (rule.type) {
      case 'field_rename':
      case 'value_mapping':
      case 'data_type_conversion':
      case 'field_filter':
        return [rule.sourceField];
      case 'derived_field':
        return rule.sourceFields;
      case 'aggregation':
        return [rule.sourceField, ...(rule.groupByFields || [])];
      default:
        return [];
    }
  }

  /**
   * Update available fields after rule execution
   */
  private updateAvailableFields(
    rule: TransformationRule, 
    availableFields: Set<string>, 
    renamedFields: Map<string, string>
  ): void {
    switch (rule.type) {
      case 'field_rename':
        availableFields.delete(rule.sourceField);
        availableFields.add(rule.targetField);
        renamedFields.set(rule.sourceField, rule.targetField);
        break;
      case 'value_mapping':
        if (rule.targetField && rule.targetField !== rule.sourceField) {
          availableFields.add(rule.targetField);
        }
        break;
      case 'derived_field':
      case 'aggregation':
        availableFields.add(rule.targetField);
        break;
      case 'data_type_conversion':
        if (rule.targetField && rule.targetField !== rule.sourceField) {
          availableFields.add(rule.targetField);
        }
        break;
    }
  }

  /**
   * Check if a field is from the source data (not created by transformations)
   */
  private isSourceField(field: string): boolean {
    // This would need to be provided by the caller with actual source schema
    // For now, assume any field could be a source field
    return true;
  }

  /**
   * Generate optimization report
   */
  generateOptimizationReport(originalRules: TransformationRule[], optimizedResult: OptimizationResult): string {
    const report: string[] = [];
    
    report.push('=== Transformation Optimization Report ===\n');
    report.push(`Original rules: ${originalRules.length}`);
    report.push(`Optimized rules: ${optimizedResult.optimizedRules.length}`);
    report.push(`Rules eliminated: ${originalRules.length - optimizedResult.optimizedRules.length}`);
    report.push(`Estimated performance improvement: ${optimizedResult.performanceImprovement}%\n`);
    
    if (optimizedResult.optimizationsApplied.length > 0) {
      report.push('Applied optimizations:');
      optimizedResult.optimizationsApplied.forEach((optimization, index) => {
        report.push(`${index + 1}. ${optimization}`);
      });
    } else {
      report.push('No optimizations applied - rules are already optimal.');
    }

    return report.join('\n');
  }
}