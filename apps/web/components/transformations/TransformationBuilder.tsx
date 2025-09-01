'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  TransformationRule,
  TransformationType,
  CreateTransformationRequest,
  TransformationResult,
  TransformationConfig,
  DEFAULT_TRANSFORMATION_METADATA
} from '@sme/schemas';
import { Button, Card, Input, Badge, Container } from '../ui/design-system';
import { FieldMapper } from './FieldMapper';
import { ValueMapper } from './ValueMapper';
import { TransformationPreview } from './TransformationPreview';
import { TransformationHistory } from './TransformationHistory';
import { cn } from '@/lib/utils';

interface TransformationBuilderProps {
  initialTransformation?: TransformationConfig;
  sourceTable: string;
  sourceColumns: Array<{ name: string; type: string; nullable: boolean }>;
  connectorId?: string;
  onSave?: (transformation: CreateTransformationRequest) => Promise<void>;
  onPreview?: (rules: TransformationRule[]) => Promise<TransformationResult>;
  className?: string;
}

export function TransformationBuilder({
  initialTransformation,
  sourceTable,
  sourceColumns,
  connectorId,
  onSave,
  onPreview,
  className
}: TransformationBuilderProps) {
  const [name, setName] = useState(initialTransformation?.name || '');
  const [description, setDescription] = useState(initialTransformation?.description || '');
  const [rules, setRules] = useState<TransformationRule[]>(initialTransformation?.rules || []);
  const [activeTab, setActiveTab] = useState<'builder' | 'preview' | 'history'>('builder');
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null);
  const [previewResult, setPreviewResult] = useState<TransformationResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const tabs = [
    { id: 'builder', label: 'Transformation Builder', icon: '🔧' },
    { id: 'preview', label: 'Preview', icon: '👁️' },
    { id: 'history', label: 'History', icon: '📚' }
  ] as const;

  const addRule = useCallback((ruleType: TransformationType) => {
    const newRule = createDefaultRule(ruleType, sourceColumns);
    setRules(prev => [...prev, newRule]);
    setSelectedRuleIndex(rules.length);
  }, [rules.length, sourceColumns]);

  const updateRule = useCallback((index: number, updatedRule: TransformationRule) => {
    setRules(prev => prev.map((rule, i) => i === index ? updatedRule : rule));
  }, []);

  const removeRule = useCallback((index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index));
    setSelectedRuleIndex(null);
  }, []);

  const moveRule = useCallback((fromIndex: number, toIndex: number) => {
    setRules(prev => {
      const newRules = [...prev];
      const [movedRule] = newRules.splice(fromIndex, 1);
      newRules.splice(toIndex, 0, movedRule);
      return newRules;
    });
    
    // Update selected index if needed
    if (selectedRuleIndex === fromIndex) {
      setSelectedRuleIndex(toIndex);
    } else if (selectedRuleIndex !== null) {
      if (fromIndex < selectedRuleIndex && toIndex >= selectedRuleIndex) {
        setSelectedRuleIndex(selectedRuleIndex - 1);
      } else if (fromIndex > selectedRuleIndex && toIndex <= selectedRuleIndex) {
        setSelectedRuleIndex(selectedRuleIndex + 1);
      }
    }
  }, [selectedRuleIndex]);

  const handlePreview = useCallback(async () => {
    if (!onPreview) return;
    
    setIsPreviewLoading(true);
    try {
      const result = await onPreview(rules);
      setPreviewResult(result);
      setActiveTab('preview');
    } catch (error) {
      console.error('Preview failed:', error);
      // Handle error - could show toast notification
    } finally {
      setIsPreviewLoading(false);
    }
  }, [rules, onPreview]);

  const handleSave = useCallback(async () => {
    if (!onSave || !name.trim()) return;
    
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        sourceTable,
        rules
      });
      // Handle success - could show toast notification
    } catch (error) {
      console.error('Save failed:', error);
      // Handle error - could show toast notification
    } finally {
      setIsSaving(false);
    }
  }, [name, description, sourceTable, rules, onSave]);

  const canSave = name.trim().length > 0 && rules.length > 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-4">
          <Input
            placeholder="Transformation name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="lg"
            className="text-xl font-semibold"
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            variant="ghost"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handlePreview}
            disabled={rules.length === 0 || isPreviewLoading}
          >
            {isPreviewLoading ? 'Previewing...' : '👁️ Preview'}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!canSave || isSaving}
          >
            {isSaving ? 'Saving...' : '💾 Save'}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <Card variant="minimal" padding="sm">
        <div className="flex items-center gap-4 text-sm text-foreground-muted">
          <span>Source: <strong>{sourceTable}</strong></span>
          <span>•</span>
          <span>Fields: <strong>{sourceColumns.length}</strong></span>
          <span>•</span>
          <span>Rules: <strong>{rules.length}</strong></span>
          {rules.length > 0 && (
            <>
              <span>•</span>
              <Badge variant="secondary" className="text-xs">
                {rules.length} transformation{rules.length === 1 ? '' : 's'}
              </Badge>
            </>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-1 py-4 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-foreground-muted hover:text-foreground hover:border-border'
              )}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Rules List */}
          <div className="lg:col-span-1">
            <Card variant="default" padding="md">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Transformation Rules</h3>
                  <RuleTypeSelector onAddRule={addRule} />
                </div>
                
                <div className="space-y-2">
                  {rules.length === 0 ? (
                    <div className="text-center py-8 text-foreground-muted">
                      <p className="text-lg mb-2">🪄</p>
                      <p>No rules yet</p>
                      <p className="text-sm">Add a rule to get started</p>
                    </div>
                  ) : (
                    rules.map((rule, index) => (
                      <RuleCard
                        key={index}
                        rule={rule}
                        index={index}
                        isSelected={selectedRuleIndex === index}
                        onSelect={() => setSelectedRuleIndex(index)}
                        onRemove={() => removeRule(index)}
                        onMoveUp={index > 0 ? () => moveRule(index, index - 1) : undefined}
                        onMoveDown={index < rules.length - 1 ? () => moveRule(index, index + 1) : undefined}
                      />
                    ))
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Rule Editor */}
          <div className="lg:col-span-2">
            {selectedRuleIndex !== null && rules[selectedRuleIndex] ? (
              <RuleEditor
                rule={rules[selectedRuleIndex]}
                sourceColumns={sourceColumns}
                onUpdate={(updatedRule) => updateRule(selectedRuleIndex, updatedRule)}
              />
            ) : (
              <Card variant="minimal" padding="lg">
                <div className="text-center py-12 text-foreground-muted">
                  <p className="text-lg mb-2">⚙️</p>
                  <p>Select a rule to edit its configuration</p>
                  <p className="text-sm">Or add a new rule to get started</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <TransformationPreview
          result={previewResult}
          isLoading={isPreviewLoading}
          onRefresh={handlePreview}
          sourceColumns={sourceColumns}
        />
      )}

      {activeTab === 'history' && initialTransformation?.id && (
        <TransformationHistory
          transformationId={initialTransformation.id}
          currentVersion={initialTransformation.version}
        />
      )}
    </div>
  );
}

// Helper Components

interface RuleTypeSelectorProps {
  onAddRule: (ruleType: TransformationType) => void;
}

function RuleTypeSelector({ onAddRule }: RuleTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const ruleTypes: Array<{ type: TransformationType; label: string; icon: string; description: string }> = [
    { type: 'field_rename', label: 'Rename Field', icon: '🏷️', description: 'Rename a field' },
    { type: 'value_mapping', label: 'Map Values', icon: '🗺️', description: 'Map field values' },
    { type: 'derived_field', label: 'Derived Field', icon: '🧮', description: 'Create calculated field' },
    { type: 'data_type_conversion', label: 'Convert Type', icon: '🔄', description: 'Change data type' },
    { type: 'field_filter', label: 'Filter Rows', icon: '🔍', description: 'Filter data rows' },
    { type: 'aggregation', label: 'Aggregate', icon: '📊', description: 'Aggregate data' }
  ];

  if (!isOpen) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setIsOpen(true)}>
        ➕ Add Rule
      </Button>
    );
  }

  return (
    <Card variant="elevated" padding="sm" className="absolute z-10 right-0 mt-2">
      <div className="space-y-1 w-48">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Add Rule</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setIsOpen(false)}>
            ✕
          </Button>
        </div>
        {ruleTypes.map((ruleType) => (
          <button
            key={ruleType.type}
            onClick={() => {
              onAddRule(ruleType.type);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-card/50 transition-colors"
          >
            <span className="text-lg">{ruleType.icon}</span>
            <div>
              <div className="font-medium text-sm">{ruleType.label}</div>
              <div className="text-xs text-foreground-muted">{ruleType.description}</div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

interface RuleCardProps {
  rule: TransformationRule;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function RuleCard({ rule, index, isSelected, onSelect, onRemove, onMoveUp, onMoveDown }: RuleCardProps) {
  const ruleTypeConfig = getRuleTypeConfig(rule.type);
  
  return (
    <Card
      variant={isSelected ? 'premium' : 'default'}
      padding="sm"
      className={cn(
        'cursor-pointer transition-all duration-200',
        isSelected && 'ring-2 ring-primary/20'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">{ruleTypeConfig.icon}</span>
          <div>
            <div className="font-medium text-sm">{ruleTypeConfig.label}</div>
            <div className="text-xs text-foreground-muted">
              {getRuleDescription(rule)}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs">
            {index + 1}
          </Badge>
          <div className="flex flex-col gap-0.5">
            {onMoveUp && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp();
                }}
                className="h-4 w-4 p-0 text-xs"
              >
                ↑
              </Button>
            )}
            {onMoveDown && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown();
                }}
                className="h-4 w-4 p-0 text-xs"
              >
                ↓
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-destructive hover:text-destructive"
          >
            🗑️
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface RuleEditorProps {
  rule: TransformationRule;
  sourceColumns: Array<{ name: string; type: string; nullable: boolean }>;
  onUpdate: (updatedRule: TransformationRule) => void;
}

function RuleEditor({ rule, sourceColumns, onUpdate }: RuleEditorProps) {
  switch (rule.type) {
    case 'field_rename':
      return (
        <FieldMapper
          transformation={rule}
          sourceColumns={sourceColumns}
          onUpdate={onUpdate}
        />
      );
    
    case 'value_mapping':
      return (
        <ValueMapper
          transformation={rule}
          sourceColumns={sourceColumns}
          onUpdate={onUpdate}
        />
      );
    
    default:
      return (
        <Card variant="default" padding="md">
          <div className="text-center py-8 text-foreground-muted">
            <p>Editor for {rule.type} is coming soon</p>
          </div>
        </Card>
      );
  }
}

// Helper Functions

function createDefaultRule(ruleType: TransformationType, sourceColumns: Array<{ name: string; type: string; nullable: boolean }>): TransformationRule {
  const firstColumn = sourceColumns[0]?.name || 'field';
  
  switch (ruleType) {
    case 'field_rename':
      return {
        type: 'field_rename',
        sourceField: firstColumn,
        targetField: `${firstColumn}_renamed`,
        description: `Rename ${firstColumn}`
      };
      
    case 'value_mapping':
      return {
        type: 'value_mapping',
        sourceField: firstColumn,
        mappings: {},
        description: `Map values in ${firstColumn}`
      };
      
    case 'derived_field':
      return {
        type: 'derived_field',
        targetField: 'derived_field',
        operation: 'concatenate',
        sourceFields: [firstColumn],
        description: 'Create derived field'
      };
      
    case 'data_type_conversion':
      return {
        type: 'data_type_conversion',
        sourceField: firstColumn,
        targetDataType: 'string',
        description: `Convert ${firstColumn} to string`
      };
      
    case 'field_filter':
      return {
        type: 'field_filter',
        sourceField: firstColumn,
        condition: 'is_not_null',
        action: 'include',
        description: `Filter by ${firstColumn}`
      };
      
    case 'aggregation':
      return {
        type: 'aggregation',
        sourceField: firstColumn,
        targetField: `${firstColumn}_count`,
        operation: 'count',
        description: `Count ${firstColumn}`
      };
      
    default:
      throw new Error(`Unknown rule type: ${ruleType}`);
  }
}

function getRuleTypeConfig(ruleType: TransformationType) {
  const configs: Record<TransformationType, { label: string; icon: string }> = {
    'field_rename': { label: 'Rename Field', icon: '🏷️' },
    'value_mapping': { label: 'Map Values', icon: '🗺️' },
    'derived_field': { label: 'Derived Field', icon: '🧮' },
    'data_type_conversion': { label: 'Convert Type', icon: '🔄' },
    'field_filter': { label: 'Filter Rows', icon: '🔍' },
    'aggregation': { label: 'Aggregate', icon: '📊' }
  };
  
  return configs[ruleType] || { label: 'Unknown', icon: '❓' };
}

function getRuleDescription(rule: TransformationRule): string {
  switch (rule.type) {
    case 'field_rename':
      return `${rule.sourceField} → ${rule.targetField}`;
    case 'value_mapping':
      const mappingCount = Object.keys(rule.mappings).length;
      return `${rule.sourceField} (${mappingCount} mappings)`;
    case 'derived_field':
      return `${rule.operation}(${rule.sourceFields.join(', ')}) → ${rule.targetField}`;
    case 'data_type_conversion':
      return `${rule.sourceField} → ${rule.targetDataType}`;
    case 'field_filter':
      return `${rule.sourceField} ${rule.condition} ${rule.value || ''}`;
    case 'aggregation':
      return `${rule.operation}(${rule.sourceField}) → ${rule.targetField}`;
    default:
      return 'Unknown rule type';
  }
}