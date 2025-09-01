'use client';

import React, { useState, useEffect } from 'react';
import { Button } from 'ui/Button';
import { Card } from 'ui/Card';
import { Label } from 'ui/Label';

interface Metric {
  id: string;
  name: string;
  label: string;
  type: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct_count' | 'custom';
  table_name: string;
  column_name?: string;
  expression?: string;
}

interface Dimension {
  id: string;
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  table_name: string;
  column_name: string;
}

interface Filter {
  table: string;
  column: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not in' | 'like';
  value: string | number | boolean | null | Array<string | number | boolean | null>;
}

interface PreviewResult {
  data: Record<string, any>[];
  sql: string;
  executionTimeMs: number;
  rowCount: number;
  columnInfo: Array<{
    name: string;
    type: string;
    nullable?: boolean;
  }>;
  stats?: {
    distinctValues: Record<string, number>;
    nullCounts: Record<string, number>;
    sampleStats?: Record<string, {
      min?: any;
      max?: any;
      avg?: number;
    }>;
  };
}

interface SemanticPreviewProps {
  metric: Metric;
  availableDimensions: Dimension[];
  onExecutePreview: (query: {
    metricId: string;
    dimensions: Dimension[];
    filters: Filter[];
    limit: number;
    sampleSize: number;
    includeStats: boolean;
  }) => Promise<PreviewResult>;
}

export function SemanticPreview({
  metric,
  availableDimensions,
  onExecutePreview,
}: SemanticPreviewProps) {
  const [selectedDimensions, setSelectedDimensions] = useState<Dimension[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [limit, setLimit] = useState(100);
  const [includeStats, setIncludeStats] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newFilter, setNewFilter] = useState<Filter>({
    table: '',
    column: '',
    op: '=',
    value: '',
  });

  // Get available tables from dimensions and metric
  const availableTables = Array.from(new Set([
    metric.table_name,
    ...availableDimensions.map(d => d.table_name)
  ]));

  // Get columns for the selected table in filter
  const getColumnsForTable = (tableName: string) => {
    if (tableName === metric.table_name && metric.column_name) {
      return [{ name: metric.column_name, type: 'unknown' }];
    }
    return availableDimensions
      .filter(d => d.table_name === tableName)
      .map(d => ({ name: d.column_name, type: d.type }));
  };

  const toggleDimension = (dimension: Dimension) => {
    setSelectedDimensions(prev => {
      const isSelected = prev.some(d => d.id === dimension.id);
      if (isSelected) {
        return prev.filter(d => d.id !== dimension.id);
      } else {
        return [...prev, dimension];
      }
    });
  };

  const addFilter = () => {
    if (newFilter.table && newFilter.column && newFilter.value !== '') {
      setFilters(prev => [...prev, { ...newFilter }]);
      setNewFilter({ table: '', column: '', op: '=', value: '' });
    }
  };

  const removeFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const executePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await onExecutePreview({
        metricId: metric.id,
        dimensions: selectedDimensions,
        filters,
        limit,
        sampleSize: limit,
        includeStats,
      });
      setPreviewResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
      setPreviewResult(null);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: any, columnType?: string) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">null</span>;
    }
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return String(value);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Preview: {metric.label || metric.name}</h2>
        <p className="text-gray-600">
          Interactive preview of your metric with custom dimensions and filters
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Dimensions Selection */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Group By Dimensions</h3>
            <div className="space-y-2">
              {availableDimensions.map(dimension => (
                <label
                  key={dimension.id}
                  className="flex items-center space-x-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedDimensions.some(d => d.id === dimension.id)}
                    onChange={() => toggleDimension(dimension)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">
                    {dimension.label || dimension.name}
                    <span className="text-gray-500"> ({dimension.type})</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          {/* Filters */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Filters</h3>
            
            {/* Existing Filters */}
            {filters.length > 0 && (
              <div className="space-y-2 mb-4">
                {filters.map((filter, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <span className="font-mono">
                      {filter.table}.{filter.column} {filter.op} {JSON.stringify(filter.value)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeFilter(index)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Filter */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newFilter.table}
                  onChange={(e) => setNewFilter(prev => ({ ...prev, table: e.target.value, column: '' }))}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="">Table...</option>
                  {availableTables.map(table => (
                    <option key={table} value={table}>{table}</option>
                  ))}
                </select>

                <select
                  value={newFilter.column}
                  onChange={(e) => setNewFilter(prev => ({ ...prev, column: e.target.value }))}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                  disabled={!newFilter.table}
                >
                  <option value="">Column...</option>
                  {getColumnsForTable(newFilter.table).map(column => (
                    <option key={column.name} value={column.name}>{column.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newFilter.op}
                  onChange={(e) => setNewFilter(prev => ({ ...prev, op: e.target.value as Filter['op'] }))}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="=">=</option>
                  <option value="!=">≠</option>
                  <option value=">">{'>'}</option>
                  <option value=">=">{'>='}</option>
                  <option value="<">{'<'}</option>
                  <option value="<=">{'<='}</option>
                  <option value="in">in</option>
                  <option value="not in">not in</option>
                  <option value="like">like</option>
                </select>

                <input
                  type="text"
                  value={typeof newFilter.value === 'string' ? newFilter.value : ''}
                  onChange={(e) => setNewFilter(prev => ({ ...prev, value: e.target.value }))}
                  placeholder="Value..."
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>

              <Button
                onClick={addFilter}
                disabled={!newFilter.table || !newFilter.column || newFilter.value === ''}
                size="sm"
                className="w-full"
              >
                Add Filter
              </Button>
            </div>
          </Card>

          {/* Options */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Options</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="limit">Row Limit</Label>
                <select
                  id="limit"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                >
                  <option value={10}>10 rows</option>
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                  <option value={500}>500 rows</option>
                  <option value={1000}>1000 rows</option>
                </select>
              </div>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={includeStats}
                  onChange={(e) => setIncludeStats(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">Include statistics</span>
              </label>
            </div>

            <Button
              onClick={executePreview}
              disabled={loading}
              className="w-full mt-4"
            >
              {loading ? 'Executing...' : 'Run Preview'}
            </Button>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          {error && (
            <Card className="p-4 border-red-200 bg-red-50">
              <h3 className="font-semibold text-red-800">Error</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </Card>
          )}

          {previewResult && (
            <>
              {/* Query Info */}
              <Card className="p-4">
                <h3 className="font-semibold mb-2">Query Information</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Execution Time:</span>
                    <div>{previewResult.executionTimeMs}ms</div>
                  </div>
                  <div>
                    <span className="font-medium">Rows Returned:</span>
                    <div>{previewResult.rowCount}</div>
                  </div>
                  <div>
                    <span className="font-medium">Columns:</span>
                    <div>{previewResult.columnInfo.length}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <span className="font-medium text-sm">Generated SQL:</span>
                  <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded text-xs overflow-x-auto">
                    {previewResult.sql}
                  </pre>
                </div>
              </Card>

              {/* Statistics */}
              {previewResult.stats && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Statistics</h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2">Distinct Values</h4>
                      <div className="space-y-1 text-sm">
                        {Object.entries(previewResult.stats.distinctValues).map(([column, count]) => (
                          <div key={column} className="flex justify-between">
                            <span>{column}:</span>
                            <span>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Null Counts</h4>
                      <div className="space-y-1 text-sm">
                        {Object.entries(previewResult.stats.nullCounts).map(([column, count]) => (
                          <div key={column} className="flex justify-between">
                            <span>{column}:</span>
                            <span>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {previewResult.stats.sampleStats && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Sample Statistics</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Column</th>
                              <th className="text-left p-2">Min</th>
                              <th className="text-left p-2">Max</th>
                              <th className="text-left p-2">Avg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(previewResult.stats.sampleStats).map(([column, stats]) => (
                              <tr key={column} className="border-b">
                                <td className="p-2 font-medium">{column}</td>
                                <td className="p-2">{formatValue(stats.min)}</td>
                                <td className="p-2">{formatValue(stats.max)}</td>
                                <td className="p-2">{stats.avg?.toFixed(2) || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Data Table */}
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Preview Data</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {previewResult.columnInfo.map(column => (
                          <th key={column.name} className="text-left p-2 font-medium">
                            {column.name}
                            <span className="text-gray-500 font-normal ml-1">({column.type})</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.data.map((row, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          {previewResult.columnInfo.map(column => (
                            <td key={column.name} className="p-2">
                              {formatValue(row[column.name], column.type)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewResult.rowCount === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No data returned by the query
                  </div>
                )}
              </Card>
            </>
          )}

          {!previewResult && !error && !loading && (
            <Card className="p-8 text-center">
              <p className="text-gray-500">
                Configure your preview options and click "Run Preview" to see the results
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}