'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/design-system';
import { Filter, Search, X, Check } from 'lucide-react';
import { WidgetConfigData } from '../dashboard/WidgetConfig';
import { WidgetContainer } from './WidgetContainer';

export interface FilterWidgetProps {
  config: WidgetConfigData;
  onConfigClick: () => void;
  onDeleteClick: () => void;
  isReadOnly?: boolean;
}

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterConfig {
  type: 'select' | 'multiselect' | 'date-range' | 'search';
  field: string;
  label: string;
  options?: FilterOption[];
  placeholder?: string;
}

// Mock filter configurations
const mockFilterConfigs: FilterConfig[] = [
  {
    type: 'multiselect',
    field: 'category',
    label: 'Category',
    options: [
      { value: 'technology', label: 'Technology', count: 24 },
      { value: 'healthcare', label: 'Healthcare', count: 18 },
      { value: 'finance', label: 'Finance', count: 32 },
      { value: 'retail', label: 'Retail', count: 15 },
      { value: 'manufacturing', label: 'Manufacturing', count: 9 }
    ]
  },
  {
    type: 'date-range',
    field: 'date',
    label: 'Date Range',
    placeholder: 'Select date range'
  },
  {
    type: 'search',
    field: 'search',
    label: 'Search',
    placeholder: 'Search all fields...'
  },
  {
    type: 'select',
    field: 'status',
    label: 'Status',
    options: [
      { value: 'active', label: 'Active', count: 45 },
      { value: 'pending', label: 'Pending', count: 12 },
      { value: 'inactive', label: 'Inactive', count: 8 }
    ]
  }
];

export function FilterWidget({ 
  config, 
  onConfigClick, 
  onDeleteClick, 
  isReadOnly 
}: FilterWidgetProps) {
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(mockFilterConfigs[0]);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Load filter configuration from widget config
    const configType = (config as any)?.filterType || 'multiselect';
    const configField = (config as any)?.filterField || 'category';
    
    const foundConfig = mockFilterConfigs.find(fc => 
      fc.type === configType && fc.field === configField
    ) || mockFilterConfigs[0];
    
    setFilterConfig(foundConfig);
  }, [config]);

  const handleValueToggle = (value: string) => {
    if (filterConfig.type === 'multiselect') {
      setSelectedValues(prev => 
        prev.includes(value) 
          ? prev.filter(v => v !== value)
          : [...prev, value]
      );
    } else if (filterConfig.type === 'select') {
      setSelectedValues([value]);
    }
  };

  const clearFilters = () => {
    setSelectedValues([]);
    setSearchTerm('');
    setDateRange({ start: '', end: '' });
  };

  const applyFilters = () => {
    // In a real implementation, this would emit filter changes to the dashboard
    console.log('Applying filters:', {
      field: filterConfig.field,
      values: selectedValues,
      search: searchTerm,
      dateRange
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (selectedValues.length > 0) count += selectedValues.length;
    if (searchTerm.trim()) count += 1;
    if (dateRange.start || dateRange.end) count += 1;
    return count;
  };

  const renderFilterContent = () => {
    switch (filterConfig.type) {
      case 'multiselect':
      case 'select':
        return (
          <div className="space-y-2">
            {filterConfig.options?.map(option => (
              <label
                key={option.value}
                className="flex items-center gap-3 p-2 hover:bg-card/50 rounded cursor-pointer group"
              >
                <div className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
                  selectedValues.includes(option.value)
                    ? 'bg-primary border-primary'
                    : 'border-card-border group-hover:border-primary/50'
                } ${filterConfig.type === 'select' ? 'rounded-full' : 'rounded-sm'}`}>
                  {selectedValues.includes(option.value) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <span className="flex-1 text-sm">{option.label}</span>
                {option.count && (
                  <span className="text-xs text-foreground-muted bg-card-border/30 px-2 py-1 rounded">
                    {option.count}
                  </span>
                )}
              </label>
            ))}
          </div>
        );

      case 'search':
        return (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={filterConfig.placeholder}
              className="w-full pl-10 pr-4 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        );

      case 'date-range':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-foreground-muted mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-card-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-muted mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-card-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
              />
            </div>
          </div>
        );

      default:
        return <div>Unknown filter type</div>;
    }
  };

  const activeCount = getActiveFilterCount();

  return (
    <WidgetContainer
      title={config.title || filterConfig.label}
      onConfigClick={onConfigClick}
      onDeleteClick={onDeleteClick}
      isReadOnly={isReadOnly}
      className="h-full"
    >
      <div className="h-full flex flex-col">
        {/* Filter Header */}
        <div className="p-4 border-b border-card-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{filterConfig.label}</span>
              {activeCount > 0 && (
                <span className="px-2 py-1 bg-primary/20 text-primary text-xs rounded-full">
                  {activeCount}
                </span>
              )}
            </div>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs"
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Active filters summary */}
          {activeCount > 0 && !isExpanded && (
            <div className="text-xs text-foreground-muted">
              {selectedValues.length > 0 && (
                <span>{selectedValues.length} selected</span>
              )}
              {searchTerm && (
                <span>{selectedValues.length > 0 ? ', ' : ''}Search: "{searchTerm}"</span>
              )}
              {(dateRange.start || dateRange.end) && (
                <span>{(selectedValues.length > 0 || searchTerm) ? ', ' : ''}Date filtered</span>
              )}
            </div>
          )}
        </div>

        {/* Filter Content */}
        <div className="flex-1 overflow-auto p-4">
          {renderFilterContent()}
        </div>

        {/* Actions */}
        {!isReadOnly && (
          <div className="p-4 border-t border-card-border bg-background/50">
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={applyFilters}
                className="flex-1"
                disabled={activeCount === 0}
              >
                Apply Filters
              </Button>
              {activeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}