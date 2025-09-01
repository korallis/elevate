import { z } from 'zod';

// Base transformation types
export const TransformationTypeSchema = z.enum([
  'field_rename',
  'value_mapping',
  'derived_field',
  'data_type_conversion',
  'field_filter',
  'aggregation'
]);

export type TransformationType = z.infer<typeof TransformationTypeSchema>;

// Field rename transformation
export const FieldRenameTransformationSchema = z.object({
  type: z.literal('field_rename'),
  sourceField: z.string(),
  targetField: z.string(),
  description: z.string().optional()
});

export type FieldRenameTransformation = z.infer<typeof FieldRenameTransformationSchema>;

// Value mapping transformation
export const ValueMappingTransformationSchema = z.object({
  type: z.literal('value_mapping'),
  sourceField: z.string(),
  targetField: z.string().optional(), // If not provided, transforms in place
  mappings: z.record(z.string(), z.string()), // source value -> target value
  defaultValue: z.string().optional(),
  description: z.string().optional()
});

export type ValueMappingTransformation = z.infer<typeof ValueMappingTransformationSchema>;

// Derived field transformation
export const DerivedFieldTransformationSchema = z.object({
  type: z.literal('derived_field'),
  targetField: z.string(),
  operation: z.enum(['concatenate', 'add', 'subtract', 'multiply', 'divide', 'conditional']),
  sourceFields: z.array(z.string()),
  parameters: z.record(z.string(), z.any()).optional(), // Additional parameters for operations
  description: z.string().optional()
});

export type DerivedFieldTransformation = z.infer<typeof DerivedFieldTransformationSchema>;

// Data type conversion transformation
export const DataTypeConversionTransformationSchema = z.object({
  type: z.literal('data_type_conversion'),
  sourceField: z.string(),
  targetField: z.string().optional(),
  targetDataType: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'json']),
  format: z.string().optional(), // Date format, etc.
  description: z.string().optional()
});

export type DataTypeConversionTransformation = z.infer<typeof DataTypeConversionTransformationSchema>;

// Field filter transformation
export const FieldFilterTransformationSchema = z.object({
  type: z.literal('field_filter'),
  sourceField: z.string(),
  condition: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_null', 'is_not_null', 'greater_than', 'less_than']),
  value: z.string().optional(),
  action: z.enum(['include', 'exclude']),
  description: z.string().optional()
});

export type FieldFilterTransformation = z.infer<typeof FieldFilterTransformationSchema>;

// Aggregation transformation
export const AggregationTransformationSchema = z.object({
  type: z.literal('aggregation'),
  sourceField: z.string(),
  targetField: z.string(),
  operation: z.enum(['count', 'sum', 'avg', 'min', 'max', 'count_distinct']),
  groupByFields: z.array(z.string()).optional(),
  description: z.string().optional()
});

export type AggregationTransformation = z.infer<typeof AggregationTransformationSchema>;

// Union of all transformation types
export const TransformationRuleSchema = z.discriminatedUnion('type', [
  FieldRenameTransformationSchema,
  ValueMappingTransformationSchema,
  DerivedFieldTransformationSchema,
  DataTypeConversionTransformationSchema,
  FieldFilterTransformationSchema,
  AggregationTransformationSchema
]);

export type TransformationRule = z.infer<typeof TransformationRuleSchema>;

// Transformation configuration
export const TransformationConfigSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sourceTable: z.string().min(1),
  rules: z.array(TransformationRuleSchema),
  version: z.number().int().positive().default(1),
  enabled: z.boolean().default(true),
  createdBy: z.string(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type TransformationConfig = z.infer<typeof TransformationConfigSchema>;

// Transformation history entry
export const TransformationHistorySchema = z.object({
  id: z.string().uuid(),
  transformationId: z.string().uuid(),
  version: z.number().int().positive(),
  name: z.string(),
  description: z.string().optional(),
  sourceTable: z.string(),
  rules: z.array(TransformationRuleSchema),
  createdBy: z.string(),
  createdAt: z.date(),
  changeSummary: z.string().optional()
});

export type TransformationHistory = z.infer<typeof TransformationHistorySchema>;

// API request schemas
export const CreateTransformationRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sourceTable: z.string().min(1),
  rules: z.array(TransformationRuleSchema)
});

export type CreateTransformationRequest = z.infer<typeof CreateTransformationRequestSchema>;

export const UpdateTransformationRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  rules: z.array(TransformationRuleSchema).optional(),
  enabled: z.boolean().optional()
});

export type UpdateTransformationRequest = z.infer<typeof UpdateTransformationRequestSchema>;

export const PreviewTransformationRequestSchema = z.object({
  sourceTable: z.string().min(1),
  rules: z.array(TransformationRuleSchema),
  limit: z.number().int().positive().max(1000).default(100)
});

export type PreviewTransformationRequest = z.infer<typeof PreviewTransformationRequestSchema>;

export const RevertTransformationRequestSchema = z.object({
  version: z.number().int().positive()
});

export type RevertTransformationRequest = z.infer<typeof RevertTransformationRequestSchema>;

// Transformation result types
export interface TransformationResult {
  success: boolean;
  rowsProcessed: number;
  rowsReturned: number;
  executionTimeMs: number;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
  data: Record<string, any>[];
  errors?: string[];
  warnings?: string[];
}

export interface TransformationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Transformation metadata for UI
export interface TransformationMetadata {
  supportedOperations: {
    fieldRename: boolean;
    valueMapping: boolean;
    derivedFields: boolean;
    dataTypeConversion: boolean;
    fieldFilter: boolean;
    aggregation: boolean;
  };
  availableDataTypes: string[];
  maxRulesPerTransformation: number;
}

// Default transformation metadata
export const DEFAULT_TRANSFORMATION_METADATA: TransformationMetadata = {
  supportedOperations: {
    fieldRename: true,
    valueMapping: true,
    derivedFields: true,
    dataTypeConversion: true,
    fieldFilter: true,
    aggregation: true
  },
  availableDataTypes: ['string', 'number', 'boolean', 'date', 'datetime', 'json'],
  maxRulesPerTransformation: 50
};

// Helper functions
export const isValidTransformationType = (type: string): type is TransformationType => {
  return TransformationTypeSchema.safeParse(type).success;
};

export const validateTransformationRule = (rule: unknown): TransformationValidationResult => {
  const result = TransformationRuleSchema.safeParse(rule);
  
  if (result.success) {
    return {
      valid: true,
      errors: [],
      warnings: []
    };
  }

  return {
    valid: false,
    errors: result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
    warnings: []
  };
};

export const validateTransformationConfig = (config: unknown): TransformationValidationResult => {
  const result = TransformationConfigSchema.safeParse(config);
  
  if (result.success) {
    // Additional validation logic
    const warnings: string[] = [];
    
    // Check for duplicate field names in rules
    const fieldNames = new Set<string>();
    const duplicates: string[] = [];
    
    result.data.rules.forEach(rule => {
      if ('targetField' in rule && rule.targetField) {
        if (fieldNames.has(rule.targetField)) {
          duplicates.push(rule.targetField);
        } else {
          fieldNames.add(rule.targetField);
        }
      }
    });
    
    if (duplicates.length > 0) {
      warnings.push(`Duplicate target fields found: ${duplicates.join(', ')}`);
    }
    
    return {
      valid: true,
      errors: [],
      warnings
    };
  }

  return {
    valid: false,
    errors: result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
    warnings: []
  };
};