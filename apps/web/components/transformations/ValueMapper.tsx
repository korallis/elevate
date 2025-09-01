'use client';

import * as React from 'react';
import { useState } from 'react';
import { ValueMappingTransformation } from '@sme/schemas';
import { Button, Card, Input, Badge } from '../ui/design-system';
import { cn } from '@/lib/utils';

interface ValueMapperProps {
  transformation: ValueMappingTransformation;
  sourceColumns: Array<{ name: string; type: string; nullable: boolean }>;
  onUpdate: (updatedTransformation: ValueMappingTransformation) => void;
  className?: string;
}

export function ValueMapper({ transformation, sourceColumns, onUpdate, className }: ValueMapperProps) {
  const [newMappingKey, setNewMappingKey] = useState('');
  const [newMappingValue, setNewMappingValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (field: 'sourceField' | 'targetField', value: string) => {
    setErrors(prev => ({ ...prev, [field]: '' }));
    
    onUpdate({
      ...transformation,
      [field]: value || undefined
    });
  };

  const handleDescriptionChange = (value: string) => {
    onUpdate({
      ...transformation,
      description: value.trim() || undefined
    });
  };

  const handleDefaultValueChange = (value: string) => {
    onUpdate({
      ...transformation,
      defaultValue: value.trim() || undefined
    });
  };

  const addMapping = () => {
    if (!newMappingKey.trim()) {
      setErrors(prev => ({ ...prev, mappingKey: 'Source value is required' }));
      return;
    }

    if (!newMappingValue.trim()) {
      setErrors(prev => ({ ...prev, mappingValue: 'Target value is required' }));
      return;
    }

    const updatedMappings = {
      ...transformation.mappings,
      [newMappingKey.trim()]: newMappingValue.trim()
    };

    onUpdate({
      ...transformation,
      mappings: updatedMappings
    });

    setNewMappingKey('');
    setNewMappingValue('');
    setErrors({});
  };

  const removeMapping = (key: string) => {
    const updatedMappings = { ...transformation.mappings };
    delete updatedMappings[key];
    
    onUpdate({
      ...transformation,
      mappings: updatedMappings
    });
  };

  const updateMapping = (oldKey: string, newKey: string, value: string) => {
    const updatedMappings = { ...transformation.mappings };
    
    if (oldKey !== newKey) {
      delete updatedMappings[oldKey];
    }
    
    updatedMappings[newKey] = value;
    
    onUpdate({
      ...transformation,
      mappings: updatedMappings
    });
  };

  const importCommonMappings = (type: 'boolean' | 'status' | 'priority') => {
    let commonMappings: Record<string, string> = {};
    
    switch (type) {
      case 'boolean':
        commonMappings = {
          '1': 'true',
          '0': 'false',
          'yes': 'true',
          'no': 'false',
          'y': 'true',
          'n': 'false',
          'true': 'true',
          'false': 'false'
        };
        break;
      case 'status':
        commonMappings = {
          '1': 'Active',
          '0': 'Inactive',
          'active': 'Active',
          'inactive': 'Inactive',
          'enabled': 'Active',
          'disabled': 'Inactive',
          'on': 'Active',
          'off': 'Inactive'
        };
        break;
      case 'priority':
        commonMappings = {
          '1': 'Low',
          '2': 'Medium',
          '3': 'High',
          '4': 'Critical',
          'low': 'Low',
          'medium': 'Medium',
          'high': 'High',
          'critical': 'Critical'
        };
        break;
    }

    onUpdate({
      ...transformation,
      mappings: { ...transformation.mappings, ...commonMappings }
    });
  };

  const mappingEntries = Object.entries(transformation.mappings);
  const sourceColumn = sourceColumns.find(col => col.name === transformation.sourceField);

  return (
    <Card variant="default" padding="md" className={className}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🗺️</span>
          <div>
            <h3 className="text-lg font-semibold">Value Mapping</h3>
            <p className="text-sm text-foreground-muted">
              Map specific values in a field to new values (e.g., status codes to labels)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Source Field Selection */}
          <FieldSelector
            label="Source Field"
            value={transformation.sourceField}
            options={sourceColumns}
            onChange={(value) => handleFieldChange('sourceField', value)}
            placeholder="Select field to map values"
          />

          {/* Target Field (Optional) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Target Field (optional)
            </label>
            <Input
              value={transformation.targetField || ''}
              onChange={(e) => handleFieldChange('targetField', e.target.value)}
              placeholder="Leave empty to transform in place"
              variant="ghost"
            />
            <p className="text-xs text-foreground-muted">
              If specified, creates a new field with mapped values. Otherwise, transforms the source field in place.
            </p>
          </div>

          {/* Common Mappings */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Quick Start</label>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => importCommonMappings('boolean')}
              >
                Boolean Mappings
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => importCommonMappings('status')}
              >
                Status Mappings
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => importCommonMappings('priority')}
              >
                Priority Mappings
              </Button>
            </div>
          </div>

          {/* Mapping Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">
                Value Mappings
              </label>
              <Badge variant="secondary" className="text-xs">
                {mappingEntries.length} mapping{mappingEntries.length === 1 ? '' : 's'}
              </Badge>
            </div>

            {/* Add New Mapping */}
            <Card variant="minimal" padding="sm">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Add New Mapping</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Input
                      value={newMappingKey}
                      onChange={(e) => {
                        setNewMappingKey(e.target.value);
                        setErrors(prev => ({ ...prev, mappingKey: '' }));
                      }}
                      placeholder="Source value"
                      size="sm"
                      className={errors.mappingKey ? 'border-destructive' : ''}
                    />
                    {errors.mappingKey && (
                      <p className="text-xs text-destructive">{errors.mappingKey}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Input
                      value={newMappingValue}
                      onChange={(e) => {
                        setNewMappingValue(e.target.value);
                        setErrors(prev => ({ ...prev, mappingValue: '' }));
                      }}
                      placeholder="Target value"
                      size="sm"
                      className={errors.mappingValue ? 'border-destructive' : ''}
                    />
                    {errors.mappingValue && (
                      <p className="text-xs text-destructive">{errors.mappingValue}</p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={addMapping}
                    disabled={!newMappingKey.trim() || !newMappingValue.trim()}
                  >
                    ➕ Add
                  </Button>
                </div>
              </div>
            </Card>

            {/* Existing Mappings */}
            <div className="space-y-2">
              {mappingEntries.length === 0 ? (
                <div className="text-center py-8 text-foreground-muted">
                  <p className="text-lg mb-2">📝</p>
                  <p>No value mappings defined</p>
                  <p className="text-sm">Add mappings above or use Quick Start templates</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {mappingEntries.map(([key, value], index) => (
                    <MappingRow
                      key={`${key}-${index}`}
                      sourceValue={key}
                      targetValue={value as string}
                      onUpdate={(newKey, newValue) => updateMapping(key, newKey, newValue)}
                      onRemove={() => removeMapping(key)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Default Value */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Default Value (optional)
            </label>
            <Input
              value={transformation.defaultValue || ''}
              onChange={(e) => handleDefaultValueChange(e.target.value)}
              placeholder="Value for unmapped inputs"
              variant="ghost"
            />
            <p className="text-xs text-foreground-muted">
              Used when a source value doesn't have a mapping. If not specified, unmapped values remain unchanged.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Description (optional)
            </label>
            <Input
              value={transformation.description || ''}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Describe this mapping"
              variant="ghost"
            />
          </div>
        </div>

        {/* Preview */}
        <MappingPreview
          mappings={transformation.mappings}
          defaultValue={transformation.defaultValue}
          sourceField={transformation.sourceField}
          targetField={transformation.targetField}
        />
      </div>
    </Card>
  );
}

// Helper Components

interface FieldSelectorProps {
  label: string;
  value: string;
  options: Array<{ name: string; type: string; nullable: boolean }>;
  onChange: (value: string) => void;
  placeholder?: string;
}

function FieldSelector({ label, value, options, onChange, placeholder }: FieldSelectorProps) {
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
    </div>
  );
}

interface MappingRowProps {
  sourceValue: string;
  targetValue: string;
  onUpdate: (sourceValue: string, targetValue: string) => void;
  onRemove: () => void;
}

function MappingRow({ sourceValue, targetValue, onUpdate, onRemove }: MappingRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editSourceValue, setEditSourceValue] = useState(sourceValue);
  const [editTargetValue, setEditTargetValue] = useState(targetValue);

  const handleSave = () => {
    if (editSourceValue.trim() && editTargetValue.trim()) {
      onUpdate(editSourceValue.trim(), editTargetValue.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditSourceValue(sourceValue);
    setEditTargetValue(targetValue);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Card variant="minimal" padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <Input
            value={editSourceValue}
            onChange={(e) => setEditSourceValue(e.target.value)}
            size="sm"
            placeholder="Source value"
          />
          <Input
            value={editTargetValue}
            onChange={(e) => setEditTargetValue(e.target.value)}
            size="sm"
            placeholder="Target value"
          />
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={!editSourceValue.trim() || !editTargetValue.trim()}
            >
              ✓ Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
            >
              ✕ Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="minimal" padding="sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-2 flex-1">
            <Badge variant="outline" className="font-mono text-xs">
              {sourceValue}
            </Badge>
            <span className="text-foreground-muted">→</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {targetValue}
            </Badge>
          </div>
        </div>
        
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsEditing(true)}
            className="h-6 w-6 p-0"
          >
            ✏️
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          >
            🗑️
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface MappingPreviewProps {
  mappings: Record<string, string>;
  defaultValue?: string;
  sourceField: string;
  targetField?: string;
}

function MappingPreview({ mappings, defaultValue, sourceField, targetField }: MappingPreviewProps) {
  const mappingEntries = Object.entries(mappings);
  const displayTargetField = targetField || sourceField;
  
  if (mappingEntries.length === 0 && !defaultValue) {
    return null;
  }

  const examples = [
    ...mappingEntries.slice(0, 3).map(([key, value]) => ({
      before: `${sourceField}: "${key}"`,
      after: `${displayTargetField}: "${value}"`
    })),
    ...(defaultValue ? [{
      before: `${sourceField}: "unknown_value"`,
      after: `${displayTargetField}: "${defaultValue}"`
    }] : [])
  ];

  return (
    <Card variant="minimal" padding="sm">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">Mapping Preview</h4>
          <Badge variant="secondary" className="text-xs">
            {mappingEntries.length} rule{mappingEntries.length === 1 ? '' : 's'}
            {defaultValue && ' + default'}
          </Badge>
        </div>
        
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
          
          {mappingEntries.length > 3 && (
            <div className="text-center text-sm text-foreground-muted">
              ... and {mappingEntries.length - 3} more mapping{mappingEntries.length - 3 === 1 ? '' : 's'}
            </div>
          )}
        </div>
        
        {!defaultValue && (
          <div className="text-xs text-foreground-muted bg-warning/10 p-2 rounded-lg">
            💡 Tip: Set a default value to handle unmapped source values
          </div>
        )}
      </div>
    </Card>
  );
}