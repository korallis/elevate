'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  FieldRenameTransformation,
  DerivedFieldTransformation,
  DataTypeConversionTransformation,
} from '@sme/schemas';
import { Button, Card, Input, Badge } from '../ui/design-system';
import { cn } from '@/lib/utils';

interface FieldMapperProps {
  transformation: FieldRenameTransformation | DerivedFieldTransformation | DataTypeConversionTransformation;
  sourceColumns: Array<{ name: string; type: string; nullable: boolean }>;
  onUpdate: (updatedTransformation: any) => void;
  className?: string;
}

export function FieldMapper({ transformation, sourceColumns, onUpdate, className }: FieldMapperProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = (fieldName: string, value: string): string | null => {
    if (!value.trim()) {
      return 'Field name is required';
    }
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value.trim())) {
      return 'Field name must start with letter or underscore, and contain only letters, numbers, and underscores';
    }
    
    return null;
  };

  const handleFieldChange = (field: string, value: string) => {
    const error = validateField(field, value);
    
    setErrors(prev => ({
      ...prev,
      [field]: error || ''
    }));

    onUpdate({
      ...transformation,
      [field]: value.trim()
    });
  };

  const handleDescriptionChange = (value: string) => {
    onUpdate({
      ...transformation,
      description: value.trim() || undefined
    });
  };

  if (transformation.type === 'field_rename') {
    return (
      <Card variant="default" padding="md" className={className}>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏷️</span>
            <div>
              <h3 className="text-lg font-semibold">Rename Field</h3>
              <p className="text-sm text-foreground-muted">
                Rename a field to give it a more meaningful name
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FieldSelector
              label="Source Field"
              value={transformation.sourceField}
              options={sourceColumns}
              onChange={(value) => handleFieldChange('sourceField', value)}
              error={errors.sourceField}
              placeholder="Select field to rename"
            />

            <div className="flex items-center justify-center py-2">
              <div className="flex items-center gap-2 text-foreground-muted">
                <div className="w-12 h-px bg-border"></div>
                <span className="text-lg">→</span>
                <div className="w-12 h-px bg-border"></div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Target Field Name
              </label>
              <Input
                value={transformation.targetField}
                onChange={(e) => handleFieldChange('targetField', e.target.value)}
                placeholder="Enter new field name"
                className={errors.targetField ? 'border-destructive' : ''}
              />
              {errors.targetField && (
                <p className="text-xs text-destructive">{errors.targetField}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Description (optional)
              </label>
              <Input
                value={transformation.description || ''}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Describe this transformation"
                variant="ghost"
              />
            </div>
          </div>

          <TransformationPreviewCard
            title="Field Rename Preview"
            examples={[
              {
                before: `${transformation.sourceField}: "example_value"`,
                after: `${transformation.targetField}: "example_value"`
              }
            ]}
          />
        </div>
      </Card>
    );
  }

  if (transformation.type === 'derived_field') {
    return (
      <Card variant="default" padding="md" className={className}>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧮</span>
            <div>
              <h3 className="text-lg font-semibold">Derived Field</h3>
              <p className="text-sm text-foreground-muted">
                Create a new field by combining or calculating from existing fields
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Target Field Name
              </label>
              <Input
                value={transformation.targetField}
                onChange={(e) => handleFieldChange('targetField', e.target.value)}
                placeholder="Enter new field name"
                className={errors.targetField ? 'border-destructive' : ''}
              />
              {errors.targetField && (
                <p className="text-xs text-destructive">{errors.targetField}</p>
              )}
            </div>

            <OperationSelector
              operation={transformation.operation}
              onChange={(operation) => onUpdate({ ...transformation, operation })}
            />

            <SourceFieldsSelector
              sourceFields={transformation.sourceFields}
              availableFields={sourceColumns}
              operation={transformation.operation}
              onChange={(sourceFields) => onUpdate({ ...transformation, sourceFields })}
            />

            {transformation.operation === 'concatenate' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Separator
                </label>
                <Input
                  value={transformation.parameters?.separator || ' '}
                  onChange={(e) => onUpdate({
                    ...transformation,
                    parameters: { ...transformation.parameters, separator: e.target.value }
                  })}
                  placeholder="Enter separator (default: space)"
                  variant="ghost"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Description (optional)
              </label>
              <Input
                value={transformation.description || ''}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Describe this transformation"
                variant="ghost"
              />
            </div>
          </div>

          <TransformationPreviewCard
            title="Derived Field Preview"
            examples={getDerivedFieldExamples(transformation)}
          />
        </div>
      </Card>
    );
  }

  if (transformation.type === 'data_type_conversion') {
    return (
      <Card variant="default" padding="md" className={className}>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔄</span>
            <div>
              <h3 className="text-lg font-semibold">Data Type Conversion</h3>
              <p className="text-sm text-foreground-muted">
                Convert field data type to another format
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FieldSelector
              label="Source Field"
              value={transformation.sourceField}
              options={sourceColumns}
              onChange={(value) => handleFieldChange('sourceField', value)}
              error={errors.sourceField}
              placeholder="Select field to convert"
            />

            <DataTypeSelector
              currentType={sourceColumns.find(col => col.name === transformation.sourceField)?.type}
              targetType={transformation.targetDataType}
              onChange={(targetDataType) => onUpdate({ ...transformation, targetDataType })}
            />

            {transformation.targetField && transformation.targetField !== transformation.sourceField && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Target Field Name (optional)
                </label>
                <Input
                  value={transformation.targetField}
                  onChange={(e) => handleFieldChange('targetField', e.target.value)}
                  placeholder="Leave empty to convert in place"
                  variant="ghost"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Description (optional)
              </label>
              <Input
                value={transformation.description || ''}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Describe this transformation"
                variant="ghost"
              />
            </div>
          </div>

          <TransformationPreviewCard
            title="Type Conversion Preview"
            examples={getTypeConversionExamples(transformation, sourceColumns)}
          />
        </div>
      </Card>
    );
  }

  return null;
}

// Helper Components

interface FieldSelectorProps {
  label: string;
  value: string;
  options: Array<{ name: string; type: string; nullable: boolean }>;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}

function FieldSelector({ label, value, options, onChange, error, placeholder }: FieldSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full justify-between',
            error && 'border-destructive',
            !value && 'text-foreground-muted'
          )}
        >
          <span>{value || placeholder}</span>
          <span className="ml-2">{isOpen ? '↑' : '↓'}</span>
        </Button>
        
        {isOpen && (
          <Card variant="elevated" padding="sm" className="absolute z-10 w-full mt-1">
            <div className="max-h-48 overflow-y-auto">
              {options.map((option) => (
                <button
                  key={option.name}
                  onClick={() => {
                    onChange(option.name);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-card/50 transition-colors"
                >
                  <span className="font-medium">{option.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {option.type}
                    </Badge>
                    {option.nullable && (
                      <Badge variant="secondary" className="text-xs">nullable</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface OperationSelectorProps {
  operation: DerivedFieldTransformation['operation'];
  onChange: (operation: DerivedFieldTransformation['operation']) => void;
}

function OperationSelector({ operation, onChange }: OperationSelectorProps) {
  const operations = [
    { value: 'concatenate', label: 'Concatenate', icon: '🔗', description: 'Join fields with separator' },
    { value: 'add', label: 'Add', icon: '➕', description: 'Add numeric fields' },
    { value: 'subtract', label: 'Subtract', icon: '➖', description: 'Subtract numeric fields' },
    { value: 'multiply', label: 'Multiply', icon: '✖️', description: 'Multiply numeric fields' },
    { value: 'divide', label: 'Divide', icon: '➗', description: 'Divide numeric fields' },
    { value: 'conditional', label: 'Conditional', icon: '❓', description: 'Conditional logic' }
  ] as const;

  const [isOpen, setIsOpen] = useState(false);
  const selectedOperation = operations.find(op => op.value === operation);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">Operation</label>
      <div className="relative">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <span>{selectedOperation?.icon}</span>
            <span>{selectedOperation?.label}</span>
          </div>
          <span className="ml-2">{isOpen ? '↑' : '↓'}</span>
        </Button>
        
        {isOpen && (
          <Card variant="elevated" padding="sm" className="absolute z-10 w-full mt-1">
            <div className="space-y-1">
              {operations.map((op) => (
                <button
                  key={op.value}
                  onClick={() => {
                    onChange(op.value);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-card/50 transition-colors"
                >
                  <span className="text-lg">{op.icon}</span>
                  <div>
                    <div className="font-medium text-sm">{op.label}</div>
                    <div className="text-xs text-foreground-muted">{op.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

interface SourceFieldsSelectorProps {
  sourceFields: string[];
  availableFields: Array<{ name: string; type: string; nullable: boolean }>;
  operation: DerivedFieldTransformation['operation'];
  onChange: (fields: string[]) => void;
}

function SourceFieldsSelector({ sourceFields, availableFields, operation, onChange }: SourceFieldsSelectorProps) {
  const isNumericOperation = ['add', 'subtract', 'multiply', 'divide'].includes(operation);
  const minFields = operation === 'concatenate' ? 1 : 2;
  const maxFields = operation === 'conditional' ? 3 : undefined;

  const addField = (fieldName: string) => {
    if (!sourceFields.includes(fieldName)) {
      onChange([...sourceFields, fieldName]);
    }
  };

  const removeField = (index: number) => {
    onChange(sourceFields.filter((_, i) => i !== index));
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    const newFields = [...sourceFields];
    const [movedField] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, movedField);
    onChange(newFields);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-foreground">
          Source Fields
          {minFields > 1 && (
            <span className="text-xs text-foreground-muted ml-1">
              (minimum {minFields})
            </span>
          )}
        </label>
        <FieldAdder
          availableFields={availableFields}
          selectedFields={sourceFields}
          onAddField={addField}
          filterNumeric={isNumericOperation}
          disabled={maxFields ? sourceFields.length >= maxFields : false}
        />
      </div>

      <div className="space-y-2">
        {sourceFields.map((field, index) => (
          <div key={index} className="flex items-center gap-2">
            <Badge variant="outline" className="flex-1 justify-between">
              <span>{field}</span>
              <div className="flex items-center gap-1">
                {index > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => moveField(index, index - 1)}
                    className="h-4 w-4 p-0"
                  >
                    ↑
                  </Button>
                )}
                {index < sourceFields.length - 1 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => moveField(index, index + 1)}
                    className="h-4 w-4 p-0"
                  >
                    ↓
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeField(index)}
                  className="h-4 w-4 p-0 text-destructive"
                  disabled={sourceFields.length <= minFields}
                >
                  ✕
                </Button>
              </div>
            </Badge>
          </div>
        ))}
        
        {sourceFields.length === 0 && (
          <div className="text-center py-4 text-foreground-muted text-sm">
            No fields selected. Add fields to use in the operation.
          </div>
        )}
      </div>
    </div>
  );
}

interface FieldAdderProps {
  availableFields: Array<{ name: string; type: string; nullable: boolean }>;
  selectedFields: string[];
  onAddField: (field: string) => void;
  filterNumeric?: boolean;
  disabled?: boolean;
}

function FieldAdder({ availableFields, selectedFields, onAddField, filterNumeric, disabled }: FieldAdderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const filteredFields = availableFields.filter(field => {
    if (selectedFields.includes(field.name)) return false;
    if (filterNumeric) {
      return ['number', 'integer', 'float', 'decimal', 'numeric'].includes(field.type.toLowerCase());
    }
    return true;
  });

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || filteredFields.length === 0}
      >
        ➕ Add Field
      </Button>
      
      {isOpen && (
        <Card variant="elevated" padding="sm" className="absolute z-10 right-0 mt-1 w-48">
          <div className="max-h-48 overflow-y-auto">
            {filteredFields.length === 0 ? (
              <div className="text-center py-4 text-foreground-muted text-sm">
                No available fields
              </div>
            ) : (
              filteredFields.map((field) => (
                <button
                  key={field.name}
                  onClick={() => {
                    onAddField(field.name);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-card/50 transition-colors"
                >
                  <span className="font-medium text-sm">{field.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {field.type}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

interface DataTypeSelectorProps {
  currentType?: string;
  targetType: string;
  onChange: (targetType: string) => void;
}

function DataTypeSelector({ currentType, targetType, onChange }: DataTypeSelectorProps) {
  const dataTypes = [
    { value: 'string', label: 'Text', icon: '📝' },
    { value: 'number', label: 'Number', icon: '🔢' },
    { value: 'boolean', label: 'True/False', icon: '☑️' },
    { value: 'date', label: 'Date', icon: '📅' },
    { value: 'datetime', label: 'Date & Time', icon: '🕐' },
    { value: 'json', label: 'JSON', icon: '📄' }
  ];

  const [isOpen, setIsOpen] = useState(false);
  const selectedType = dataTypes.find(type => type.value === targetType);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">
        Convert To
        {currentType && (
          <span className="text-xs text-foreground-muted ml-1">
            (from {currentType})
          </span>
        )}
      </label>
      <div className="relative">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <span>{selectedType?.icon}</span>
            <span>{selectedType?.label}</span>
          </div>
          <span className="ml-2">{isOpen ? '↑' : '↓'}</span>
        </Button>
        
        {isOpen && (
          <Card variant="elevated" padding="sm" className="absolute z-10 w-full mt-1">
            <div className="space-y-1">
              {dataTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    onChange(type.value);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-card/50 transition-colors"
                >
                  <span className="text-lg">{type.icon}</span>
                  <span className="font-medium text-sm">{type.label}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

interface TransformationPreviewCardProps {
  title: string;
  examples: Array<{ before: string; after: string }>;
}

function TransformationPreviewCard({ title, examples }: TransformationPreviewCardProps) {
  return (
    <Card variant="minimal" padding="sm">
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <div className="space-y-2">
          {examples.map((example, index) => (
            <div key={index} className="flex items-center gap-4 text-sm">
              <div className="flex-1 font-mono bg-card/30 px-3 py-2 rounded-lg">
                {example.before}
              </div>
              <span className="text-foreground-muted">→</span>
              <div className="flex-1 font-mono bg-primary/10 px-3 py-2 rounded-lg">
                {example.after}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// Helper Functions

function getDerivedFieldExamples(transformation: DerivedFieldTransformation) {
  const fields = transformation.sourceFields.join(', ');
  
  switch (transformation.operation) {
    case 'concatenate':
      const separator = transformation.parameters?.separator || ' ';
      return [{
        before: `${transformation.sourceFields.map((f: string) => `${f}: "value"`).join(', ')}`,
        after: `${transformation.targetField}: "value${separator}value"`
      }];
      
    case 'add':
      return [{
        before: `${transformation.sourceFields.map((f: string) => `${f}: 10`).join(', ')}`,
        after: `${transformation.targetField}: ${transformation.sourceFields.length * 10}`
      }];
      
    case 'subtract':
      return [{
        before: `${transformation.sourceFields.map((f: string) => `${f}: 10`).join(', ')}`,
        after: `${transformation.targetField}: 0`
      }];
      
    case 'multiply':
      return [{
        before: `${transformation.sourceFields.map((f: string) => `${f}: 5`).join(', ')}`,
        after: `${transformation.targetField}: ${Math.pow(5, transformation.sourceFields.length)}`
      }];
      
    case 'divide':
      return [{
        before: `${transformation.sourceFields.slice(0, 2).map((f: string) => `${f}: 20`).join(', ')}`,
        after: `${transformation.targetField}: 1`
      }];
      
    case 'conditional':
      return [{
        before: `${transformation.sourceFields[0]}: true, other fields...`,
        after: `${transformation.targetField}: true_value`
      }];
      
    default:
      return [{ before: 'Input data', after: 'Transformed data' }];
  }
}

function getTypeConversionExamples(
  transformation: DataTypeConversionTransformation,
  sourceColumns: Array<{ name: string; type: string; nullable: boolean }>
) {
  const sourceColumn = sourceColumns.find(col => col.name === transformation.sourceField);
  const targetField = transformation.targetField || transformation.sourceField;
  
  if (!sourceColumn) {
    return [{ before: 'No source field selected', after: 'Select a field to see preview' }];
  }
  
  const sourceType = sourceColumn.type.toLowerCase();
  const targetType = transformation.targetDataType;
  
  // Generate realistic examples based on conversion type
  let beforeValue: string;
  let afterValue: string;
  
  switch (`${sourceType}->${targetType}`) {
    case 'string->number':
      beforeValue = '"123.45"';
      afterValue = '123.45';
      break;
    case 'number->string':
      beforeValue = '123.45';
      afterValue = '"123.45"';
      break;
    case 'string->boolean':
      beforeValue = '"true"';
      afterValue = 'true';
      break;
    case 'string->date':
      beforeValue = '"2024-01-15"';
      afterValue = '2024-01-15T00:00:00.000Z';
      break;
    case 'number->boolean':
      beforeValue = '1';
      afterValue = 'true';
      break;
    default:
      beforeValue = 'sample_value';
      afterValue = 'converted_value';
  }
  
  return [{
    before: `${transformation.sourceField}: ${beforeValue}`,
    after: `${targetField}: ${afterValue}`
  }];
}