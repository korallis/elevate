'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { TransformationResult } from '@sme/schemas';
import { Button, Card, Badge, Input } from '../ui/design-system';
import { cn } from '@/lib/utils';

interface TransformationPreviewProps {
  result: TransformationResult | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  sourceColumns?: Array<{ name: string; type: string; nullable: boolean }>;
  className?: string;
}

export function TransformationPreview({
  result,
  isLoading = false,
  onRefresh,
  sourceColumns = [],
  className
}: TransformationPreviewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  // Filter and paginate data
  const filteredData = useMemo(() => {
    if (!result?.data || !searchTerm) return result?.data || [];
    
    return result.data.filter((row: Record<string, any>) =>
      Object.values(row).some((value: any) =>
        String(value || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [result?.data, searchTerm]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  if (isLoading) {
    return (
      <Card variant="default" padding="md" className={className}>
        <div className="text-center py-12">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-lg font-medium">Generating Preview...</p>
          <p className="text-sm text-foreground-muted">This may take a moment</p>
        </div>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card variant="minimal" padding="lg" className={className}>
        <div className="text-center py-12 text-foreground-muted">
          <p className="text-lg mb-2">👁️</p>
          <p className="text-lg mb-2">No Preview Available</p>
          <p className="text-sm mb-4">Run the transformation to see a preview of the results</p>
          {onRefresh && (
            <Button variant="secondary" onClick={onRefresh}>
              🔄 Generate Preview
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Result Summary */}
      <Card variant="default" padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {result.success ? (
                <Badge variant="success" className="flex items-center gap-1">
                  ✅ Success
                </Badge>
              ) : (
                <Badge variant="destructive" className="flex items-center gap-1">
                  ❌ Failed
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-6 text-sm text-foreground-muted">
              <span>
                Processed: <strong className="text-foreground">{result.rowsProcessed.toLocaleString()}</strong>
              </span>
              <span>•</span>
              <span>
                Returned: <strong className="text-foreground">{result.rowsReturned.toLocaleString()}</strong>
              </span>
              <span>•</span>
              <span>
                Time: <strong className="text-foreground">{result.executionTimeMs}ms</strong>
              </span>
              <span>•</span>
              <span>
                Columns: <strong className="text-foreground">{result.columns.length}</strong>
              </span>
            </div>
          </div>

          {onRefresh && (
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              🔄 Refresh
            </Button>
          )}
        </div>
      </Card>

      {/* Errors and Warnings */}
      {(result.errors || result.warnings) && (
        <div className="space-y-2">
          {result.errors && result.errors.length > 0 && (
            <Card variant="minimal" padding="sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">
                    {result.errors.length} Error{result.errors.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {result.errors.map((error: string, index: number) => (
                    <div key={index} className="text-sm text-destructive bg-destructive/10 p-2 rounded-lg">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {result.warnings && result.warnings.length > 0 && (
            <Card variant="minimal" padding="sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="text-xs">
                    {result.warnings.length} Warning{result.warnings.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {result.warnings.map((warning: string, index: number) => (
                    <div key={index} className="text-sm text-warning bg-warning/10 p-2 rounded-lg">
                      {warning}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Schema Comparison */}
      {sourceColumns.length > 0 && (
        <SchemaComparison
          originalSchema={sourceColumns}
          transformedSchema={result.columns}
        />
      )}

      {/* Data Preview */}
      {result.data && result.data.length > 0 && (
        <Card variant="default" padding="md">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Transformed Data</h3>
              <div className="flex items-center gap-3">
                <Input
                  placeholder="Search data..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  size="sm"
                  className="w-48"
                />
                <Badge variant="secondary" className="text-xs">
                  {filteredData.length} of {result.data.length} rows
                </Badge>
              </div>
            </div>

            <DataTable
              data={paginatedData}
              columns={result.columns}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="text-sm text-foreground-muted">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} results
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    ← Previous
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "primary" : "ghost"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {result.data && result.data.length === 0 && (
        <Card variant="minimal" padding="lg">
          <div className="text-center py-8 text-foreground-muted">
            <p className="text-lg mb-2">📋</p>
            <p>No data returned</p>
            <p className="text-sm">The transformation resulted in an empty dataset</p>
          </div>
        </Card>
      )}
    </div>
  );
}

// Helper Components

interface SchemaComparisonProps {
  originalSchema: Array<{ name: string; type: string; nullable: boolean }>;
  transformedSchema: Array<{ name: string; type: string; nullable: boolean }>;
}

function SchemaComparison({ originalSchema, transformedSchema }: SchemaComparisonProps) {
  const changes = useMemo(() => {
    const original = new Map(originalSchema.map(col => [col.name, col]));
    const transformed = new Map(transformedSchema.map(col => [col.name, col]));
    
    const added: typeof originalSchema = [];
    const removed: typeof originalSchema = [];
    const modified: Array<{
      name: string;
      originalType: string;
      newType: string;
      originalNullable: boolean;
      newNullable: boolean;
    }> = [];
    
    // Find added columns
    transformed.forEach((col, name) => {
      if (!original.has(name)) {
        added.push(col);
      }
    });
    
    // Find removed columns
    original.forEach((col, name) => {
      if (!transformed.has(name)) {
        removed.push(col);
      }
    });
    
    // Find modified columns
    original.forEach((originalCol, name) => {
      const transformedCol = transformed.get(name);
      if (transformedCol && (originalCol.type !== transformedCol.type || originalCol.nullable !== transformedCol.nullable)) {
        modified.push({
          name,
          originalType: originalCol.type,
          newType: transformedCol.type,
          originalNullable: originalCol.nullable,
          newNullable: transformedCol.nullable
        });
      }
    });
    
    return { added, removed, modified };
  }, [originalSchema, transformedSchema]);

  const hasChanges = changes.added.length > 0 || changes.removed.length > 0 || changes.modified.length > 0;

  if (!hasChanges) {
    return (
      <Card variant="minimal" padding="sm">
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Badge variant="secondary" className="text-xs">Schema</Badge>
          <span>No schema changes detected</span>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="minimal" padding="sm">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">Schema Changes</Badge>
          <span className="text-sm text-foreground-muted">
            {changes.added.length + changes.removed.length + changes.modified.length} change{changes.added.length + changes.removed.length + changes.modified.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* Added Columns */}
          {changes.added.length > 0 && (
            <div className="space-y-2">
              <Badge variant="success" className="text-xs">
                +{changes.added.length} Added
              </Badge>
              <div className="space-y-1">
                {changes.added.map((col) => (
                  <div key={col.name} className="flex items-center justify-between bg-success/10 p-2 rounded">
                    <span className="font-medium">{col.name}</span>
                    <Badge variant="outline" className="text-xs">{col.type}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Removed Columns */}
          {changes.removed.length > 0 && (
            <div className="space-y-2">
              <Badge variant="destructive" className="text-xs">
                -{changes.removed.length} Removed
              </Badge>
              <div className="space-y-1">
                {changes.removed.map((col) => (
                  <div key={col.name} className="flex items-center justify-between bg-destructive/10 p-2 rounded">
                    <span className="font-medium line-through">{col.name}</span>
                    <Badge variant="outline" className="text-xs">{col.type}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modified Columns */}
          {changes.modified.length > 0 && (
            <div className="space-y-2">
              <Badge variant="warning" className="text-xs">
                ~{changes.modified.length} Modified
              </Badge>
              <div className="space-y-1">
                {changes.modified.map((change) => (
                  <div key={change.name} className="bg-warning/10 p-2 rounded">
                    <div className="font-medium">{change.name}</div>
                    <div className="flex items-center gap-1 text-xs text-foreground-muted">
                      <Badge variant="outline" className="text-xs">{change.originalType}</Badge>
                      <span>→</span>
                      <Badge variant="outline" className="text-xs">{change.newType}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

interface DataTableProps {
  data: Record<string, any>[];
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

function DataTable({ data, columns }: DataTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-foreground-muted">
        <p>No data to display</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.name}
                className="text-left py-3 px-4 font-medium text-sm text-foreground"
              >
                <div className="flex items-center gap-2">
                  <span>{column.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {column.type}
                  </Badge>
                  {column.nullable && (
                    <Badge variant="secondary" className="text-xs">
                      nullable
                    </Badge>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              className={cn(
                'border-b border-border/50',
                index % 2 === 0 ? 'bg-background' : 'bg-card/20'
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.name}
                  className="py-3 px-4 text-sm"
                >
                  <CellValue
                    value={row[column.name]}
                    type={column.type}
                    nullable={column.nullable}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CellValueProps {
  value: any;
  type: string;
  nullable: boolean;
}

function CellValue({ value, type, nullable }: CellValueProps) {
  if (value === null || value === undefined) {
    return (
      <span className="text-foreground-muted italic text-xs">
        {nullable ? 'null' : 'undefined'}
      </span>
    );
  }

  const stringValue = String(value);
  
  // Truncate long values
  const displayValue = stringValue.length > 50 
    ? `${stringValue.substring(0, 47)}...`
    : stringValue;

  const typeStyles: Record<string, string> = {
    string: 'text-foreground',
    number: 'text-blue-600 font-mono',
    boolean: value ? 'text-green-600' : 'text-red-600',
    date: 'text-purple-600 font-mono',
    datetime: 'text-purple-600 font-mono',
    json: 'text-orange-600 font-mono'
  };

  return (
    <span 
      className={cn(
        typeStyles[type.toLowerCase()] || 'text-foreground',
        'text-sm'
      )}
      title={stringValue.length > 50 ? stringValue : undefined}
    >
      {type.toLowerCase() === 'boolean' ? (value ? 'true' : 'false') : displayValue}
    </span>
  );
}