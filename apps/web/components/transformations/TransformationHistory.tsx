'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { TransformationHistory as TransformationHistoryType } from '@sme/schemas';
import { Button, Card, Badge } from '../ui/design-system';
import { cn } from '@/lib/utils';

interface TransformationHistoryProps {
  transformationId: string;
  currentVersion?: number;
  onRevert?: (version: number) => Promise<void>;
  className?: string;
}

export function TransformationHistory({
  transformationId,
  currentVersion,
  onRevert,
  className
}: TransformationHistoryProps) {
  const [history, setHistory] = useState<TransformationHistoryType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revertingVersion, setRevertingVersion] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<TransformationHistoryType | null>(null);

  useEffect(() => {
    loadHistory();
  }, [transformationId]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // This would call the actual API in a real implementation
      const response = await fetch(`/api/transformations/${transformationId}/history`);
      if (!response.ok) {
        throw new Error('Failed to load history');
      }
      
      const historyData = await response.json();
      setHistory(historyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
      // Mock data for demo
      setHistory([
        {
          id: '1',
          transformationId,
          version: 3,
          name: 'Customer Data Transformation',
          description: 'Transform customer data with validation',
          sourceTable: 'customers',
          rules: [
            { type: 'field_rename', sourceField: 'name', targetField: 'customer_name', description: 'Rename name field' },
            { type: 'value_mapping', sourceField: 'status', mappings: { '1': 'Active', '0': 'Inactive' }, description: 'Map status codes' }
          ],
          createdBy: 'user@example.com',
          createdAt: new Date('2024-01-15T10:00:00Z'),
          changeSummary: 'Added value mapping for status field'
        },
        {
          id: '2',
          transformationId,
          version: 2,
          name: 'Customer Data Transformation',
          description: 'Transform customer data',
          sourceTable: 'customers',
          rules: [
            { type: 'field_rename', sourceField: 'name', targetField: 'customer_name', description: 'Rename name field' }
          ],
          createdBy: 'user@example.com',
          createdAt: new Date('2024-01-14T15:30:00Z'),
          changeSummary: 'Initial transformation setup'
        }
      ] as TransformationHistoryType[]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevert = async (version: number) => {
    if (!onRevert) return;

    try {
      setRevertingVersion(version);
      await onRevert(version);
      // Refresh history after revert
      await loadHistory();
    } catch (err) {
      console.error('Revert failed:', err);
      // Handle error - could show toast notification
    } finally {
      setRevertingVersion(null);
    }
  };

  if (isLoading) {
    return (
      <Card variant="default" padding="md" className={className}>
        <div className="text-center py-8">
          <div className="animate-spin text-2xl mb-2">⏳</div>
          <p>Loading history...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="default" padding="md" className={className}>
        <div className="text-center py-8 text-destructive">
          <p className="text-lg mb-2">❌</p>
          <p>Failed to load history</p>
          <p className="text-sm text-foreground-muted mb-4">{error}</p>
          <Button variant="secondary" onClick={loadHistory}>
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card variant="minimal" padding="lg" className={className}>
        <div className="text-center py-8 text-foreground-muted">
          <p className="text-lg mb-2">📚</p>
          <p>No history available</p>
          <p className="text-sm">Version history will appear here after making changes</p>
        </div>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* History Timeline */}
        <div className="lg:col-span-1">
          <Card variant="default" padding="md">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Version History</h3>
                <Badge variant="secondary" className="text-xs">
                  {history.length} version{history.length === 1 ? '' : 's'}
                </Badge>
              </div>

              <div className="space-y-2">
                {history.map((version, index) => (
                  <VersionCard
                    key={version.id}
                    version={version}
                    isCurrent={version.version === currentVersion}
                    isSelected={selectedVersion?.id === version.id}
                    onSelect={() => setSelectedVersion(version)}
                    onRevert={onRevert ? () => handleRevert(version.version) : undefined}
                    isReverting={revertingVersion === version.version}
                    showRevertOption={version.version !== currentVersion}
                  />
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Version Details */}
        <div className="lg:col-span-2">
          {selectedVersion ? (
            <VersionDetails version={selectedVersion} />
          ) : (
            <Card variant="minimal" padding="lg">
              <div className="text-center py-12 text-foreground-muted">
                <p className="text-lg mb-2">📝</p>
                <p>Select a version to see details</p>
                <p className="text-sm">Click on any version in the timeline to view its configuration</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components

interface VersionCardProps {
  version: TransformationHistoryType;
  isCurrent: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onRevert?: () => void;
  isReverting?: boolean;
  showRevertOption?: boolean;
}

function VersionCard({
  version,
  isCurrent,
  isSelected,
  onSelect,
  onRevert,
  isReverting = false,
  showRevertOption = false
}: VersionCardProps) {
  return (
    <Card
      variant={isSelected ? 'premium' : 'default'}
      padding="sm"
      className={cn(
        'cursor-pointer transition-all duration-200',
        isSelected && 'ring-2 ring-primary/20',
        isCurrent && 'bg-success/5 border-success/20'
      )}
      onClick={onSelect}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant={isCurrent ? 'success' : 'secondary'}
              className="text-xs"
            >
              v{version.version}
              {isCurrent && ' (Current)'}
            </Badge>
            {isSelected && (
              <Badge variant="default" className="text-xs">
                Selected
              </Badge>
            )}
          </div>
          
          {showRevertOption && onRevert && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRevert();
              }}
              disabled={isReverting}
              className="text-xs"
            >
              {isReverting ? '⏳' : '↩️'} Revert
            </Button>
          )}
        </div>

        <div className="space-y-1">
          <div className="font-medium text-sm">{version.name}</div>
          {version.description && (
            <div className="text-xs text-foreground-muted line-clamp-2">
              {version.description}
            </div>
          )}
          {version.changeSummary && (
            <div className="text-xs text-primary">
              {version.changeSummary}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-foreground-muted">
          <span>{version.createdBy}</span>
          <span>{formatDate(version.createdAt)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {version.rules.length} rule{version.rules.length === 1 ? '' : 's'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {version.sourceTable}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

interface VersionDetailsProps {
  version: TransformationHistoryType;
}

function VersionDetails({ version }: VersionDetailsProps) {
  const [expandedRules, setExpandedRules] = useState<Set<number>>(new Set());

  const toggleRule = (index: number) => {
    setExpandedRules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <Card variant="default" padding="md">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Version {version.version} Details</h3>
            <p className="text-sm text-foreground-muted mt-1">
              Created on {formatDate(version.createdAt)} by {version.createdBy}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {version.rules.length} transformation{version.rules.length === 1 ? '' : 's'}
          </Badge>
        </div>

        {version.description && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Description</h4>
            <p className="text-sm text-foreground-muted">{version.description}</p>
          </div>
        )}

        {version.changeSummary && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Changes</h4>
            <p className="text-sm text-primary">{version.changeSummary}</p>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Transformation Rules</h4>
          <div className="space-y-2">
            {version.rules.map((rule: any, index: number) => (
              <Card
                key={index}
                variant="minimal"
                padding="sm"
                className="cursor-pointer"
                onClick={() => toggleRule(index)}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        {index + 1}
                      </Badge>
                      <span className="font-medium text-sm">
                        {getRuleTypeLabel(rule.type)}
                      </span>
                      <span className="text-sm text-foreground-muted">
                        {getRuleDescription(rule)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-4 w-4 p-0"
                    >
                      {expandedRules.has(index) ? '↑' : '↓'}
                    </Button>
                  </div>

                  {expandedRules.has(index) && (
                    <div className="pt-2 border-t border-border">
                      <pre className="text-xs bg-card/50 p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(rule, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-border">
          <h4 className="text-sm font-medium">Metadata</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-foreground-muted">Source Table:</span>
              <span className="ml-2 font-medium">{version.sourceTable}</span>
            </div>
            <div>
              <span className="text-foreground-muted">Version:</span>
              <span className="ml-2 font-medium">{version.version}</span>
            </div>
            <div>
              <span className="text-foreground-muted">Created By:</span>
              <span className="ml-2 font-medium">{version.createdBy}</span>
            </div>
            <div>
              <span className="text-foreground-muted">Created At:</span>
              <span className="ml-2 font-medium">{formatDateTime(version.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Helper Functions

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(date));
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(date));
}

function getRuleTypeLabel(ruleType: string): string {
  const labels: Record<string, string> = {
    'field_rename': 'Rename Field',
    'value_mapping': 'Map Values',
    'derived_field': 'Derived Field',
    'data_type_conversion': 'Convert Type',
    'field_filter': 'Filter Rows',
    'aggregation': 'Aggregate'
  };
  
  return labels[ruleType] || 'Unknown Rule';
}

function getRuleDescription(rule: any): string {
  switch (rule.type) {
    case 'field_rename':
      return `${rule.sourceField} → ${rule.targetField}`;
    case 'value_mapping':
      const mappingCount = Object.keys(rule.mappings || {}).length;
      return `${rule.sourceField} (${mappingCount} mappings)`;
    case 'derived_field':
      return `${rule.operation}(${rule.sourceFields?.join(', ') || 'fields'}) → ${rule.targetField}`;
    case 'data_type_conversion':
      return `${rule.sourceField} → ${rule.targetDataType}`;
    case 'field_filter':
      return `${rule.sourceField} ${rule.condition} ${rule.value || ''}`;
    case 'aggregation':
      return `${rule.operation}(${rule.sourceField}) → ${rule.targetField}`;
    default:
      return rule.description || 'No description';
  }
}