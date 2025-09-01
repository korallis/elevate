'use client';

import { useState, useCallback, useMemo } from 'react';
import { FilterValue } from '../../components/dashboard/DashboardFilters';

export interface GlobalFilter {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'between' | 'in';
  value: unknown;
  label?: string;
  isActive: boolean;
}

export interface FilterField {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  label?: string;
  options?: Array<{ value: unknown; label: string; count?: number }>;
}

export interface UseDashboardFiltersOptions {
  initialFilters?: FilterValue[];
  availableFields?: FilterField[];
  onFiltersChange?: (filters: FilterValue[]) => void;
}

export interface UseDashboardFiltersReturn {
  // Filter state
  filters: FilterValue[];
  activeFilters: FilterValue[];
  filterCount: number;
  
  // Filter management
  addFilter: (filter: Omit<FilterValue, 'id'>) => void;
  updateFilter: (id: string, updates: Partial<FilterValue>) => void;
  removeFilter: (id: string) => void;
  toggleFilter: (id: string) => void;
  clearFilters: () => void;
  resetFilters: () => void;
  
  // Filter operations
  applyFilters: (data: any[]) => any[];
  getFilteredData: <T>(data: T[]) => T[];
  validateFilter: (filter: FilterValue) => { isValid: boolean; errors: string[] };
  
  // Filter presets
  saveFilterPreset: (name: string) => void;
  loadFilterPreset: (name: string) => void;
  getFilterPresets: () => Array<{ name: string; filters: FilterValue[] }>;
  deleteFilterPreset: (name: string) => void;
  
  // Utility functions
  getFilterSummary: () => string;
  exportFilters: () => FilterValue[];
  importFilters: (filters: FilterValue[]) => void;
}

const generateId = () => `filter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Local storage key for filter presets
const FILTER_PRESETS_KEY = 'dashboard_filter_presets';

export function useDashboardFilters(options: UseDashboardFiltersOptions = {}): UseDashboardFiltersReturn {
  const { 
    initialFilters = [], 
    availableFields = [],
    onFiltersChange 
  } = options;

  const [filters, setFiltersState] = useState<FilterValue[]>(
    initialFilters.map(f => ({ ...f, id: f.id || generateId() }))
  );

  const setFilters = useCallback((newFilters: FilterValue[]) => {
    setFiltersState(newFilters);
    onFiltersChange?.(newFilters);
  }, [onFiltersChange]);

  // Derived state
  const activeFilters = useMemo(() => 
    filters.filter(filter => 
      filter.value !== null && 
      filter.value !== undefined && 
      filter.value !== '' &&
      (Array.isArray(filter.value) ? filter.value.length > 0 : true)
    ), [filters]
  );

  const filterCount = activeFilters.length;

  // Filter management
  const addFilter = useCallback((filterData: Omit<FilterValue, 'id'>) => {
    const newFilter: FilterValue = {
      ...filterData,
      id: generateId()
    };
    
    setFilters([...filters, newFilter]);
  }, [filters, setFilters]);

  const updateFilter = useCallback((id: string, updates: Partial<FilterValue>) => {
    setFilters(
      filters.map(filter =>
        filter.id === id ? { ...filter, ...updates } : filter
      )
    );
  }, [filters, setFilters]);

  const removeFilter = useCallback((id: string) => {
    setFilters(filters.filter(filter => filter.id !== id));
  }, [filters, setFilters]);

  const toggleFilter = useCallback((id: string) => {
    const filter = filters.find(f => f.id === id);
    if (filter) {
      updateFilter(id, { value: filter.value ? null : filter.value });
    }
  }, [filters, updateFilter]);

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, [setFilters]);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters.map(f => ({ ...f, id: f.id || generateId() })));
  }, [initialFilters, setFilters]);

  // Filter operations
  const applyFilters = useCallback((data: any[]) => {
    if (activeFilters.length === 0) return data;

    return data.filter(item => {
      return activeFilters.every(filter => {
        const fieldValue = item[filter.field];
        const filterValue = filter.value;

        switch (filter.operator) {
          case 'equals':
            return fieldValue === filterValue;
            
          case 'contains':
            if (typeof fieldValue === 'string' && typeof filterValue === 'string') {
              return fieldValue.toLowerCase().includes(filterValue.toLowerCase());
            }
            return false;
            
          case 'greater':
            return Number(fieldValue) > Number(filterValue);
            
          case 'less':
            return Number(fieldValue) < Number(filterValue);
            
          case 'between':
            if (Array.isArray(filterValue) && filterValue.length === 2) {
              const [min, max] = filterValue;
              const numValue = Number(fieldValue);
              return numValue >= Number(min) && numValue <= Number(max);
            }
            return false;
            
          case 'in':
            if (Array.isArray(filterValue)) {
              return filterValue.includes(fieldValue);
            }
            return false;
            
          default:
            return true;
        }
      });
    });
  }, [activeFilters]);

  const getFilteredData = useCallback(<T>(data: T[]): T[] => {
    return applyFilters(data) as T[];
  }, [applyFilters]);

  const validateFilter = useCallback((filter: FilterValue) => {
    const errors: string[] = [];

    if (!filter.field) {
      errors.push('Field is required');
    }

    if (!filter.operator) {
      errors.push('Operator is required');
    }

    if (filter.value === null || filter.value === undefined || filter.value === '') {
      errors.push('Value is required');
    }

    // Validate field exists in available fields
    if (availableFields.length > 0 && !availableFields.find(f => f.name === filter.field)) {
      errors.push(`Field '${filter.field}' is not available`);
    }

    // Validate operator compatibility with field type
    const field = availableFields.find(f => f.name === filter.field);
    if (field) {
      const incompatibleOperators = {
        string: ['greater', 'less', 'between'],
        boolean: ['contains', 'greater', 'less', 'between', 'in']
      };

      const incompatible = incompatibleOperators[field.type as keyof typeof incompatibleOperators];
      if (incompatible && incompatible.includes(filter.operator)) {
        errors.push(`Operator '${filter.operator}' is not compatible with field type '${field.type}'`);
      }
    }

    // Validate value format for specific operators
    if (filter.operator === 'between' && !Array.isArray(filter.value)) {
      errors.push('Between operator requires an array of two values');
    }

    if (filter.operator === 'in' && !Array.isArray(filter.value)) {
      errors.push('In operator requires an array of values');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, [availableFields]);

  // Filter presets
  const saveFilterPreset = useCallback((name: string) => {
    try {
      const presets = JSON.parse(localStorage.getItem(FILTER_PRESETS_KEY) || '{}');
      presets[name] = filters;
      localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error('Failed to save filter preset:', error);
    }
  }, [filters]);

  const loadFilterPreset = useCallback((name: string) => {
    try {
      const presets = JSON.parse(localStorage.getItem(FILTER_PRESETS_KEY) || '{}');
      if (presets[name]) {
        setFilters(presets[name]);
      }
    } catch (error) {
      console.error('Failed to load filter preset:', error);
    }
  }, [setFilters]);

  const getFilterPresets = useCallback(() => {
    try {
      const presets = JSON.parse(localStorage.getItem(FILTER_PRESETS_KEY) || '{}');
      return Object.entries(presets).map(([name, filters]) => ({
        name,
        filters: filters as FilterValue[]
      }));
    } catch (error) {
      console.error('Failed to get filter presets:', error);
      return [];
    }
  }, []);

  const deleteFilterPreset = useCallback((name: string) => {
    try {
      const presets = JSON.parse(localStorage.getItem(FILTER_PRESETS_KEY) || '{}');
      delete presets[name];
      localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error('Failed to delete filter preset:', error);
    }
  }, []);

  // Utility functions
  const getFilterSummary = useCallback(() => {
    if (activeFilters.length === 0) return 'No filters applied';

    const summaries = activeFilters.map(filter => {
      const field = filter.label || filter.field;
      const operator = {
        equals: '=',
        contains: 'contains',
        greater: '>',
        less: '<',
        between: 'between',
        in: 'in'
      }[filter.operator];

      return `${field} ${operator} ${Array.isArray(filter.value) ? filter.value.join(', ') : filter.value}`;
    });

    return summaries.join('; ');
  }, [activeFilters]);

  const exportFilters = useCallback(() => {
    return JSON.parse(JSON.stringify(filters));
  }, [filters]);

  const importFilters = useCallback((importedFilters: FilterValue[]) => {
    const filtersWithIds = importedFilters.map(f => ({
      ...f,
      id: f.id || generateId()
    }));
    setFilters(filtersWithIds);
  }, [setFilters]);

  return {
    filters,
    activeFilters,
    filterCount,
    addFilter,
    updateFilter,
    removeFilter,
    toggleFilter,
    clearFilters,
    resetFilters,
    applyFilters,
    getFilteredData,
    validateFilter,
    saveFilterPreset,
    loadFilterPreset,
    getFilterPresets,
    deleteFilterPreset,
    getFilterSummary,
    exportFilters,
    importFilters,
  };
}