'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Target } from 'lucide-react';
import { WidgetConfigData } from '../dashboard/WidgetConfig';
import { WidgetContainer } from './WidgetContainer';

export interface MetricWidgetProps {
  config: WidgetConfigData;
  onConfigClick: () => void;
  onDeleteClick: () => void;
  isReadOnly?: boolean;
}

interface MetricData {
  value: number;
  previousValue?: number;
  target?: number;
  unit?: string;
  label?: string;
}

// Mock data generator
const generateMockMetricData = (): MetricData => {
  const value = Math.floor(Math.random() * 10000) + 1000;
  const previousValue = Math.floor(Math.random() * 10000) + 1000;
  
  return {
    value,
    previousValue,
    target: Math.floor(value * 1.2),
    unit: '$',
    label: 'Revenue'
  };
};

export function MetricWidget({ 
  config, 
  onConfigClick, 
  onDeleteClick, 
  isReadOnly 
}: MetricWidgetProps) {
  const [data, setData] = useState<MetricData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (config.dataSource?.type === 'mock') {
          // Simulate loading delay
          await new Promise(resolve => setTimeout(resolve, 300));
          setData(generateMockMetricData());
        } else if (config.dataSource?.type === 'api' && config.dataSource.endpoint) {
          const response = await fetch(config.dataSource.endpoint);
          if (!response.ok) throw new Error('Failed to fetch data');
          const result = await response.json();
          setData(result);
        } else if (config.dataSource?.type === 'snowflake' && config.dataSource.query) {
          // In a real implementation, this would call your API to execute the Snowflake query
          const response = await fetch('/api/query/snowflake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: config.dataSource.query,
              database: config.dataSource.database,
              schema: config.dataSource.schema
            })
          });
          
          if (!response.ok) throw new Error('Failed to execute query');
          const result = await response.json();
          setData(result.data?.[0] || generateMockMetricData());
        } else {
          setData(generateMockMetricData());
        }
      } catch (err) {
        console.error('Error loading metric data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        // Fallback to mock data on error
        setData(generateMockMetricData());
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [config.dataSource]);

  const formatValue = (value: number, unit?: string) => {
    const formatted = new Intl.NumberFormat().format(value);
    return unit ? `${unit}${formatted}` : formatted;
  };

  const calculateChange = (current: number, previous: number) => {
    const change = ((current - previous) / previous) * 100;
    return {
      percentage: Math.abs(change).toFixed(1),
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
      isPositive: change > 0
    };
  };

  const calculateTargetProgress = (current: number, target: number) => {
    const progress = (current / target) * 100;
    return Math.min(progress, 100);
  };

  if (isLoading) {
    return (
      <WidgetContainer
        title={config.title || 'Metric'}
        onConfigClick={onConfigClick}
        onDeleteClick={onDeleteClick}
        isReadOnly={isReadOnly}
        className="h-full"
      >
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </WidgetContainer>
    );
  }

  if (error) {
    return (
      <WidgetContainer
        title={config.title || 'Metric'}
        onConfigClick={onConfigClick}
        onDeleteClick={onDeleteClick}
        isReadOnly={isReadOnly}
        className="h-full"
      >
        <div className="flex items-center justify-center h-32 text-center p-4">
          <div>
            <div className="text-red-400 mb-2">⚠️</div>
            <div className="text-sm text-foreground-muted">{error}</div>
          </div>
        </div>
      </WidgetContainer>
    );
  }

  if (!data) {
    return (
      <WidgetContainer
        title={config.title || 'Metric'}
        onConfigClick={onConfigClick}
        onDeleteClick={onDeleteClick}
        isReadOnly={isReadOnly}
        className="h-full"
      >
        <div className="flex items-center justify-center h-32 text-center p-4">
          <div>
            <div className="text-foreground-muted mb-2">📊</div>
            <div className="text-sm text-foreground-muted">No data available</div>
          </div>
        </div>
      </WidgetContainer>
    );
  }

  const change = data.previousValue ? calculateChange(data.value, data.previousValue) : null;
  const targetProgress = data.target ? calculateTargetProgress(data.value, data.target) : null;

  return (
    <WidgetContainer
      title={config.title || data.label || 'Metric'}
      onConfigClick={onConfigClick}
      onDeleteClick={onDeleteClick}
      isReadOnly={isReadOnly}
      className="h-full"
    >
      <div className="p-6 h-full flex flex-col justify-center">
        {/* Main Value */}
        <div className="mb-4">
          <div className="text-3xl font-bold text-foreground mb-1">
            {formatValue(data.value, data.unit)}
          </div>
          
          {/* Change Indicator */}
          {change && (
            <div className={`flex items-center gap-1 text-sm ${
              change.direction === 'up' ? 'text-green-400' :
              change.direction === 'down' ? 'text-red-400' :
              'text-foreground-muted'
            }`}>
              {change.direction === 'up' && <TrendingUp className="w-4 h-4" />}
              {change.direction === 'down' && <TrendingDown className="w-4 h-4" />}
              {change.direction === 'neutral' && <Minus className="w-4 h-4" />}
              <span>
                {change.direction === 'neutral' ? 'No change' : `${change.percentage}%`}
              </span>
              {change.direction !== 'neutral' && (
                <span className="text-foreground-muted">
                  vs. previous period
                </span>
              )}
            </div>
          )}
        </div>

        {/* Target Progress */}
        {data.target && targetProgress !== null && (
          <div className="mt-auto">
            <div className="flex items-center justify-between text-sm text-foreground-muted mb-2">
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3" />
                Target Progress
              </span>
              <span>{targetProgress.toFixed(1)}%</span>
            </div>
            
            <div className="w-full bg-card-border/50 rounded-full h-2">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  targetProgress >= 100 ? 'bg-green-400' :
                  targetProgress >= 75 ? 'bg-primary' :
                  'bg-yellow-400'
                }`}
                style={{ width: `${targetProgress}%` }}
              />
            </div>
            
            <div className="flex justify-between text-xs text-foreground-muted mt-1">
              <span>Current: {formatValue(data.value, data.unit)}</span>
              <span>Target: {formatValue(data.target, data.unit)}</span>
            </div>
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}