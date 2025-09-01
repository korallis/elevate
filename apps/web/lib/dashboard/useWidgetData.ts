'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { WidgetConfigData } from '../../components/dashboard/WidgetConfig';

export interface DataSource {
  type: 'snowflake' | 'api' | 'mock';
  query?: string;
  endpoint?: string;
  database?: string;
  schema?: string;
  table?: string;
  refreshInterval?: number;
}

export interface UseWidgetDataOptions {
  config: WidgetConfigData;
  autoRefresh?: boolean;
  onError?: (error: Error) => void;
  onDataChange?: (data: any) => void;
}

export interface UseWidgetDataReturn {
  data: any;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

// Mock data generators for different widget types
const mockDataGenerators = {
  chart: (type: string) => {
    const categories = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    
    if (type === 'pie') {
      return [
        { name: 'Desktop', value: 45, fill: 'hsl(252, 60%, 65%)' },
        { name: 'Mobile', value: 35, fill: 'hsl(163, 50%, 45%)' },
        { name: 'Tablet', value: 20, fill: 'hsl(30, 80%, 60%)' }
      ];
    }

    return categories.map(month => ({
      name: month,
      value: Math.floor(Math.random() * 1000) + 100,
      revenue: Math.floor(Math.random() * 50000) + 10000,
      users: Math.floor(Math.random() * 500) + 50
    }));
  },
  
  metric: () => ({
    value: Math.floor(Math.random() * 10000) + 1000,
    previousValue: Math.floor(Math.random() * 10000) + 1000,
    target: Math.floor(Math.random() * 12000) + 8000,
    unit: '$',
    label: 'Revenue'
  }),
  
  table: () => {
    const categories = ['Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing'];
    const names = ['Acme Corp', 'TechFlow Inc', 'DataMax Ltd', 'InnovateCo', 'NextGen Systems'];
    
    return {
      columns: [
        { key: 'name', label: 'Company', type: 'string', sortable: true },
        { key: 'revenue', label: 'Revenue', type: 'number', sortable: true },
        { key: 'growth', label: 'Growth %', type: 'number', sortable: true },
        { key: 'category', label: 'Category', type: 'string', sortable: true }
      ],
      rows: Array.from({ length: 20 }, (_, i) => ({
        name: names[i % names.length] + ` ${i + 1}`,
        revenue: Math.floor(Math.random() * 1000000) + 100000,
        growth: (Math.random() * 40 - 10).toFixed(1),
        category: categories[Math.floor(Math.random() * categories.length)]
      }))
    };
  },
  
  map: () => {
    const cities = [
      { name: 'New York', lat: 40.7128, lng: -74.0060 },
      { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
      { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
      { name: 'Houston', lat: 29.7604, lng: -95.3698 },
      { name: 'Phoenix', lat: 33.4484, lng: -112.0740 }
    ];
    
    return cities.map((city, index) => ({
      id: `point-${index}`,
      lat: city.lat,
      lng: city.lng,
      value: Math.floor(Math.random() * 10000) + 1000,
      label: city.name,
      category: ['sales', 'support', 'marketing'][index % 3]
    }));
  }
};

export function useWidgetData(options: UseWidgetDataOptions): UseWidgetDataReturn {
  const { config, autoRefresh = false, onError, onDataChange } = options;
  
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);

      if (!config.dataSource) {
        throw new Error('No data source configured');
      }

      let result: any = null;

      switch (config.dataSource.type) {
        case 'mock': {
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Generate mock data based on widget type
          const widgetType = config.id?.includes('chart') ? 'chart' :
                           config.id?.includes('metric') ? 'metric' :
                           config.id?.includes('table') ? 'table' :
                           config.id?.includes('map') ? 'map' : 'chart';
          
          if (widgetType === 'chart' && config.visualization?.type) {
            result = mockDataGenerators.chart(config.visualization.type);
          } else if (widgetType in mockDataGenerators) {
            const generator = mockDataGenerators[widgetType as keyof typeof mockDataGenerators] as () => any;
            result = generator();
          } else {
            result = mockDataGenerators.chart('line');
          }
          break;
        }
        
        case 'api': {
          if (!config.dataSource.endpoint) {
            throw new Error('API endpoint not configured');
          }
          
          const response = await fetch(config.dataSource.endpoint, { signal });
          
          if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
          }
          
          result = await response.json();
          break;
        }
        
        case 'snowflake': {
          if (!config.dataSource.query) {
            throw new Error('Snowflake query not configured');
          }
          
          const response = await fetch(`${API_BASE}/snowflake/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: config.dataSource.query,
              database: config.dataSource.database,
              schema: config.dataSource.schema
            }),
            signal
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Snowflake query failed');
          }
          
          const queryResult = await response.json();
          result = queryResult.data || [];
          break;
        }
        
        default:
          throw new Error(`Unsupported data source type: ${config.dataSource.type}`);
      }

      if (signal?.aborted) return;

      setData(result);
      setLastUpdated(new Date());
      onDataChange?.(result);

    } catch (err) {
      if (signal?.aborted) return;
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [config, onError, onDataChange]);

  const refresh = useCallback(async () => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    
    try {
      await fetchData(abortController.signal);
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [fetchData]);

  // Setup auto-refresh
  useEffect(() => {
    if (autoRefresh && config.dataSource?.refreshInterval) {
      const interval = config.dataSource.refreshInterval * 1000; // Convert to milliseconds
      
      refreshIntervalRef.current = setInterval(() => {
        refresh();
      }, interval);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
  }, [autoRefresh, config.dataSource?.refreshInterval, refresh]);

  // Initial data load and refresh when config changes
  useEffect(() => {
    refresh();

    return () => {
      // Cleanup on unmount or config change
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [refresh]);

  return {
    data,
    isLoading,
    error,
    lastUpdated,
    refresh,
    clearError,
  };
}