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
  expression?: string;
  description: string;
  values?: Record<string, any>;
  format_string?: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

interface DimensionFormData {
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  table_name: string;
  column_name: string;
  expression?: string;
  description: string;
  values?: Record<string, any>;
  format_string?: string;
  is_primary: boolean;
}

interface DimensionManagerProps {
  dimensions: Dimension[];
  onCreateDimension: (dimension: DimensionFormData) => Promise<void>;
  onUpdateDimension: (id: string, dimension: Partial<DimensionFormData>) => Promise<void>;
  onDeleteDimension: (id: string) => Promise<void>;
  availableTables: string[];
  availableColumns: Record<string, Array<{ name: string; type: string }>>;
  onRefreshSampleData: (tableName: string, columnName: string) => Promise<any>;
}

export function DimensionManager({
  dimensions,
  onCreateDimension,
  onUpdateDimension,
  onDeleteDimension,
  availableTables,
  availableColumns,
  onRefreshSampleData,
}: DimensionManagerProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingDimension, setEditingDimension] = useState<Dimension | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedDimension, setSelectedDimension] = useState<Dimension | null>(null);
  const [sampleData, setSampleData] = useState<any>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const [formData, setFormData] = useState<DimensionFormData>({
    name: '',
    label: '',
    type: 'string',
    table_name: '',
    column_name: '',
    expression: '',
    description: '',
    format_string: '',
    is_primary: false,
  });

  const filteredDimensions = dimensions.filter(dimension => {
    const matchesSearch = dimension.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (dimension.label || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !typeFilter || dimension.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const resetForm = () => {
    setFormData({
      name: '',
      label: '',
      type: 'string',
      table_name: '',
      column_name: '',
      expression: '',
      description: '',
      format_string: '',
      is_primary: false,
    });
    setEditingDimension(null);
    setShowCreateForm(false);
  };

  const handleEdit = (dimension: Dimension) => {
    setFormData({
      name: dimension.name,
      label: dimension.label,
      type: dimension.type,
      table_name: dimension.table_name,
      column_name: dimension.column_name,
      expression: dimension.expression || '',
      description: dimension.description,
      format_string: dimension.format_string || '',
      is_primary: dimension.is_primary,
    });
    setEditingDimension(dimension);
    setShowCreateForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDimension) {
        await onUpdateDimension(editingDimension.id, formData);
      } else {
        await onCreateDimension(formData);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving dimension:', error);
    }
  };

  const handleViewSample = async (dimension: Dimension) => {
    setSelectedDimension(dimension);
    setLoadingSample(true);
    try {
      const data = await onRefreshSampleData(dimension.table_name, dimension.column_name);
      setSampleData(data);
    } catch (error) {
      console.error('Error loading sample data:', error);
      setSampleData(null);
    } finally {
      setLoadingSample(false);
    }
  };

  const selectedTableColumns = availableColumns[formData.table_name] || [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dimension Manager</h1>
          <p className="text-gray-600">Manage dimensions for your semantic layer</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} disabled={showCreateForm}>
          Create Dimension
        </Button>
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingDimension ? 'Edit Dimension' : 'Create New Dimension'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="dimension_name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="label">Display Label</Label>
                <Input
                  id="label"
                  value={formData.label}
                  onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="Dimension Label"
                />
              </div>
              <div>
                <Label htmlFor="type">Type *</Label>
                <select
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as DimensionFormData['type'] }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>
              <div>
                <Label htmlFor="format_string">Format String</Label>
                <Input
                  id="format_string"
                  value={formData.format_string || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, format_string: e.target.value }))}
                  placeholder="YYYY-MM-DD, $#,##0.00, etc."
                />
              </div>
              <div>
                <Label htmlFor="table_name">Table *</Label>
                <select
                  id="table_name"
                  value={formData.table_name}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, table_name: e.target.value, column_name: '' }));
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
                <Label htmlFor="column_name">Column *</Label>
                <select
                  id="column_name"
                  value={formData.column_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, column_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!formData.table_name}
                  required
                >
                  <option value="">Select column...</option>
                  {selectedTableColumns.map(column => (
                    <option key={column.name} value={column.name}>
                      {column.name} ({column.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe this dimension..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <Label htmlFor="expression">Custom SQL Expression (optional)</Label>
              <textarea
                id="expression"
                value={formData.expression || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, expression: e.target.value }))}
                placeholder="CASE WHEN column > 100 THEN 'High' ELSE 'Low' END"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="text-sm text-gray-600 mt-1">
                Override the column with a custom expression
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_primary"
                checked={formData.is_primary}
                onChange={(e) => setFormData(prev => ({ ...prev, is_primary: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="is_primary">Primary dimension for this table</Label>
            </div>

            <div className="flex space-x-2">
              <Button type="submit">
                {editingDimension ? 'Update' : 'Create'} Dimension
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-64">
            <Input
              placeholder="Search dimensions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All types</option>
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="boolean">Boolean</option>
            </select>
          </div>
          <div className="text-sm text-gray-600">
            {filteredDimensions.length} of {dimensions.length} dimensions
          </div>
        </div>
      </Card>

      {/* Dimensions List */}
      <div className="grid gap-4">
        {filteredDimensions.map(dimension => (
          <Card key={dimension.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold">{dimension.label || dimension.name}</h3>
                  <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                    {dimension.type}
                  </span>
                  {dimension.is_primary && (
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-sm mt-1">
                  {dimension.table_name}.{dimension.column_name}
                </p>
                {dimension.description && (
                  <p className="text-gray-500 text-sm mt-2">{dimension.description}</p>
                )}
                {dimension.expression && (
                  <div className="mt-2">
                    <span className="text-xs text-gray-500">Custom Expression:</span>
                    <code className="block text-sm bg-gray-50 p-2 rounded mt-1 font-mono">
                      {dimension.expression}
                    </code>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewSample(dimension)}
                >
                  Sample Data
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(dimension)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeleteDimension(dimension.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Sample Data Modal */}
      {selectedDimension && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-2xl w-full mx-4 max-h-96 overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Sample Data: {selectedDimension.label || selectedDimension.name}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedDimension(null);
                    setSampleData(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="p-4 overflow-auto">
              {loadingSample ? (
                <div className="text-center py-8">Loading sample data...</div>
              ) : sampleData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-semibold">Distinct Values:</span>
                      <div>{sampleData.distinctCount}</div>
                    </div>
                    <div>
                      <span className="font-semibold">Null Count:</span>
                      <div>{sampleData.nullCount}</div>
                    </div>
                    <div>
                      <span className="font-semibold">Sample Size:</span>
                      <div>{sampleData.sampleSize}</div>
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-sm">Sample Values:</span>
                    <div className="mt-2 max-h-48 overflow-auto">
                      <div className="grid gap-1">
                        {sampleData.values?.slice(0, 50).map((value: any, index: number) => (
                          <div key={index} className="px-2 py-1 bg-gray-50 rounded text-sm font-mono">
                            {JSON.stringify(value)}
                          </div>
                        ))}
                        {sampleData.values?.length > 50 && (
                          <div className="text-sm text-gray-500 p-2">
                            ... and {sampleData.values.length - 50} more values
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Failed to load sample data
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {filteredDimensions.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">
            {searchTerm || typeFilter ? 'No dimensions match your filters' : 'No dimensions created yet'}
          </p>
          {!showCreateForm && !searchTerm && !typeFilter && (
            <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
              Create Your First Dimension
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}