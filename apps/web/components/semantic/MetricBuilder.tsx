'use client';

import React, { useState, useEffect } from 'react';
import { Button } from 'ui/Button';
import { Input } from 'ui/Input';
import { Label } from 'ui/Label';
import { Card } from 'ui/Card';

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

interface Metric {
  id?: string;
  name: string;
  label: string;
  type: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct_count' | 'custom';
  table_name: string;
  column_name?: string;
  expression?: string;
  description: string;
  format_type: 'number' | 'currency' | 'percentage';
  aggregation_type: 'sum' | 'avg' | 'min' | 'max' | 'count';
  filters: Filter[];
  dimensions: string[];
}

interface MetricBuilderProps {
  metric?: Metric;
  onSave: (metric: Metric) => void;
  onCancel: () => void;
  availableDimensions: Dimension[];
  availableTables: string[];
  availableColumns: Record<string, Array<{ name: string; type: string }>>;
}

export function MetricBuilder({
  metric,
  onSave,
  onCancel,
  availableDimensions,
  availableTables,
  availableColumns,
}: MetricBuilderProps) {
  const [formData, setFormData] = useState<Metric>(() => ({
    name: '',
    label: '',
    type: 'count',
    table_name: '',
    column_name: '',
    expression: '',
    description: '',
    format_type: 'number',
    aggregation_type: 'sum',
    filters: [],
    dimensions: [],
    ...metric,
  }));

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newFilter, setNewFilter] = useState<Filter>({
    table: '',
    column: '',
    op: '=',
    value: '',
  });

  const handleInputChange = (field: keyof Metric, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addFilter = () => {
    if (newFilter.table && newFilter.column) {
      setFormData(prev => ({
        ...prev,
        filters: [...prev.filters, { ...newFilter }],
      }));
      setNewFilter({ table: '', column: '', op: '=', value: '' });
    }
  };

  const removeFilter = (index: number) => {
    setFormData(prev => ({
      ...prev,
      filters: prev.filters.filter((_, i) => i !== index),
    }));
  };

  const toggleDimension = (dimensionName: string) => {
    setFormData(prev => ({
      ...prev,
      dimensions: prev.dimensions.includes(dimensionName)
        ? prev.dimensions.filter(d => d !== dimensionName)
        : [...prev.dimensions, dimensionName],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const selectedTableColumns = availableColumns[formData.table_name] || [];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {metric ? 'Edit Metric' : 'Create New Metric'}
        </h2>
        <div className="space-x-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!formData.name || !formData.table_name}>
            Save Metric
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="metric_name"
                required
              />
            </div>
            <div>
              <Label htmlFor="label">Display Label</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => handleInputChange('label', e.target.value)}
                placeholder="Metric Label"
              />
            </div>
            <div>
              <Label htmlFor="type">Metric Type *</Label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => handleInputChange('type', e.target.value as Metric['type'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="count">Count</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Minimum</option>
                <option value="max">Maximum</option>
                <option value="distinct_count">Distinct Count</option>
                <option value="custom">Custom Expression</option>
              </select>
            </div>
            <div>
              <Label htmlFor="format_type">Format Type</Label>
              <select
                id="format_type"
                value={formData.format_type}
                onChange={(e) => handleInputChange('format_type', e.target.value as Metric['format_type'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="number">Number</option>
                <option value="currency">Currency</option>
                <option value="percentage">Percentage</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe what this metric measures..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </Card>

        {/* Data Source */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Data Source</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="table_name">Table *</Label>
              <select
                id="table_name"
                value={formData.table_name}
                onChange={(e) => {
                  handleInputChange('table_name', e.target.value);
                  handleInputChange('column_name', ''); // Reset column when table changes
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select table...</option>
                {availableTables.map(table => (
                  <option key={table} value={table}>{table}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="column_name">Column {formData.type !== 'count' && '*'}</Label>
              <select
                id="column_name"
                value={formData.column_name || ''}
                onChange={(e) => handleInputChange('column_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!formData.table_name || formData.type === 'count'}
                required={formData.type !== 'count'}
              >
                <option value="">
                  {formData.type === 'count' ? 'Not required for count' : 'Select column...'}
                </option>
                {selectedTableColumns.map(column => (
                  <option key={column.name} value={column.name}>
                    {column.name} ({column.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formData.type === 'custom' && (
            <div className="mt-4">
              <Label htmlFor="expression">Custom SQL Expression *</Label>
              <textarea
                id="expression"
                value={formData.expression || ''}
                onChange={(e) => handleInputChange('expression', e.target.value)}
                placeholder="SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                required={formData.type === 'custom'}
              />
              <p className="text-sm text-gray-600 mt-1">
                Use standard SQL expressions. Table columns can be referenced directly.
              </p>
            </div>
          )}
        </Card>

        {/* Associated Dimensions */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Associated Dimensions</h3>
          <p className="text-gray-600 mb-4">
            Select dimensions that can be used to group this metric:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {availableDimensions.map(dimension => (
              <label
                key={dimension.id}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={formData.dimensions.includes(dimension.name)}
                  onChange={() => toggleDimension(dimension.name)}
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

        {/* Advanced Options */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Advanced Options</h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </Button>
          </div>

          {showAdvanced && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="aggregation_type">Aggregation Type</Label>
                <select
                  id="aggregation_type"
                  value={formData.aggregation_type}
                  onChange={(e) => handleInputChange('aggregation_type', e.target.value as Metric['aggregation_type'])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                  <option value="count">Count</option>
                </select>
                <p className="text-sm text-gray-600 mt-1">
                  How to aggregate this metric when rolling up to higher levels
                </p>
              </div>

              {/* Default Filters */}
              <div>
                <Label>Default Filters</Label>
                <p className="text-sm text-gray-600 mb-2">
                  Filters that are always applied to this metric:
                </p>
                
                {formData.filters.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {formData.filters.map((filter, index) => (
                      <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                        <span className="text-sm font-mono">
                          {filter.table}.{filter.column} {filter.op} {JSON.stringify(filter.value)}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeFilter(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2">
                  <select
                    value={newFilter.table}
                    onChange={(e) => setNewFilter(prev => ({ ...prev, table: e.target.value, column: '' }))}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Table...</option>
                    {availableTables.map(table => (
                      <option key={table} value={table}>{table}</option>
                    ))}
                  </select>

                  <select
                    value={newFilter.column}
                    onChange={(e) => setNewFilter(prev => ({ ...prev, column: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!newFilter.table}
                  >
                    <option value="">Column...</option>
                    {(availableColumns[newFilter.table] || []).map(column => (
                      <option key={column.name} value={column.name}>{column.name}</option>
                    ))}
                  </select>

                  <select
                    value={newFilter.op}
                    onChange={(e) => setNewFilter(prev => ({ ...prev, op: e.target.value as Filter['op'] }))}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">{'>'}</option>
                    <option value=">=">{'>='}</option>
                    <option value="<">{'<'}</option>
                    <option value="<=">{'<='}</option>
                    <option value="in">in</option>
                    <option value="not in">not in</option>
                    <option value="like">like</option>
                  </select>

                  <div className="flex space-x-1">
                    <Input
                      value={typeof newFilter.value === 'string' ? newFilter.value : ''}
                      onChange={(e) => setNewFilter(prev => ({ ...prev, value: e.target.value }))}
                      placeholder="Value..."
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={addFilter}
                      disabled={!newFilter.table || !newFilter.column}
                      size="sm"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </form>
    </div>
  );
}