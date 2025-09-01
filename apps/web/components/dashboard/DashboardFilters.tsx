'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/design-system';
import { Filter, Calendar, Search, X, Plus } from 'lucide-react';

export interface FilterValue {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'between' | 'in';
  value: unknown;
  label?: string;
}

export interface DashboardFiltersProps {
  filters: FilterValue[];
  onFiltersChange: (filters: FilterValue[]) => void;
  availableFields?: Array<{ name: string; type: 'string' | 'number' | 'date'; label?: string }>;
  className?: string;
}

export function DashboardFilters({ 
  filters, 
  onFiltersChange, 
  availableFields = [],
  className = '' 
}: DashboardFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const addFilter = () => {
    const newFilter: FilterValue = {
      id: `filter-${Date.now()}`,
      field: availableFields[0]?.name || '',
      operator: 'equals',
      value: ''
    };
    onFiltersChange([...filters, newFilter]);
  };

  const updateFilter = (id: string, updates: Partial<FilterValue>) => {
    onFiltersChange(
      filters.map(filter => 
        filter.id === id ? { ...filter, ...updates } : filter
      )
    );
  };

  const removeFilter = (id: string) => {
    onFiltersChange(filters.filter(filter => filter.id !== id));
  };

  const clearAllFilters = () => {
    onFiltersChange([]);
  };

  const getOperatorLabel = (operator: FilterValue['operator']) => {
    const labels = {
      equals: 'equals',
      contains: 'contains',
      greater: 'greater than',
      less: 'less than',
      between: 'between',
      in: 'in list'
    };
    return labels[operator];
  };

  const getOperatorOptions = (fieldType: string) => {
    const baseOptions = ['equals'];
    
    if (fieldType === 'string') {
      return [...baseOptions, 'contains', 'in'];
    }
    if (fieldType === 'number' || fieldType === 'date') {
      return [...baseOptions, 'greater', 'less', 'between'];
    }
    
    return baseOptions;
  };

  const getFieldType = (fieldName: string) => {
    const field = availableFields.find(f => f.name === fieldName);
    return field?.type || 'string';
  };

  const activeFiltersCount = filters.filter(f => f.value !== '' && f.value !== null && f.value !== undefined).length;

  return (
    <div className={`dashboard-filters ${className}`}>
      <div className="flex items-center gap-3">
        {/* Filter Toggle Button */}
        <Button
          variant={activeFiltersCount > 0 ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="ml-2 px-2 py-1 text-xs bg-primary/20 rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </Button>

        {/* Quick Actions */}
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
          >
            Clear All
          </Button>
        )}

        {/* Active Filters Summary */}
        {!isOpen && activeFiltersCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {filters.filter(f => f.value !== '' && f.value !== null).slice(0, 3).map(filter => (
              <div 
                key={filter.id}
                className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-lg text-sm"
              >
                <span>
                  {filter.label || filter.field} {getOperatorLabel(filter.operator)} {String(filter.value)}
                </span>
                <button
                  onClick={() => removeFilter(filter.id)}
                  className="hover:bg-primary/20 rounded p-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {activeFiltersCount > 3 && (
              <span className="text-sm text-foreground-muted">
                +{activeFiltersCount - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter Panel */}
      {isOpen && (
        <div className="mt-4 p-4 bg-card/50 border border-card-border rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Dashboard Filters</h3>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={addFilter}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Filter
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {filters.length === 0 ? (
            <div className="text-center py-6 text-foreground-muted">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No filters applied</p>
              <p className="text-sm">Add filters to refine your dashboard data</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filters.map(filter => {
                const fieldType = getFieldType(filter.field);
                const operatorOptions = getOperatorOptions(fieldType);
                
                return (
                  <div key={filter.id} className="flex items-center gap-3 p-3 bg-background/50 rounded-lg">
                    {/* Field Selection */}
                    <select
                      value={filter.field}
                      onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                      className="flex-1 px-3 py-2 bg-background border border-card-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">Select field...</option>
                      {availableFields.map(field => (
                        <option key={field.name} value={field.name}>
                          {field.label || field.name}
                        </option>
                      ))}
                    </select>

                    {/* Operator Selection */}
                    <select
                      value={filter.operator}
                      onChange={(e) => updateFilter(filter.id, { operator: e.target.value as FilterValue['operator'] })}
                      className="px-3 py-2 bg-background border border-card-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {operatorOptions.map(op => (
                        <option key={op} value={op}>
                          {getOperatorLabel(op as FilterValue['operator'])}
                        </option>
                      ))}
                    </select>

                    {/* Value Input */}
                    {fieldType === 'date' ? (
                      <input
                        type="date"
                        value={filter.value as string || ''}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        className="flex-1 px-3 py-2 bg-background border border-card-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    ) : fieldType === 'number' ? (
                      <input
                        type="number"
                        value={filter.value as string || ''}
                        onChange={(e) => updateFilter(filter.id, { value: parseFloat(e.target.value) || 0 })}
                        className="flex-1 px-3 py-2 bg-background border border-card-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="Enter value..."
                      />
                    ) : (
                      <input
                        type="text"
                        value={filter.value as string || ''}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        className="flex-1 px-3 py-2 bg-background border border-card-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="Enter value..."
                      />
                    )}

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeFilter(filter.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}