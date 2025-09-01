'use client';

import { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { WidgetConfigData } from '../dashboard/WidgetConfig';
import { WidgetContainer } from './WidgetContainer';

export interface ChartWidgetProps {
  type: 'line' | 'bar' | 'pie';
  config: WidgetConfigData;
  onConfigClick: () => void;
  onDeleteClick: () => void;
  isReadOnly?: boolean;
}

// Mock data generator
const generateMockData = (type: string) => {
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
};

export function ChartWidget({ 
  type, 
  config, 
  onConfigClick, 
  onDeleteClick, 
  isReadOnly 
}: ChartWidgetProps) {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (config.dataSource?.type === 'mock') {
          // Simulate loading delay
          await new Promise(resolve => setTimeout(resolve, 500));
          setData(generateMockData(type));
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
          setData(result.data || []);
        } else {
          setData(generateMockData(type));
        }
      } catch (err) {
        console.error('Error loading chart data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        // Fallback to mock data on error
        setData(generateMockData(type));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [type, config.dataSource]);

  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="h-full flex items-center justify-center text-center p-4">
          <div>
            <div className="text-red-400 mb-2">⚠️</div>
            <div className="text-sm text-foreground-muted">{error}</div>
          </div>
        </div>
      );
    }

    if (!data || data.length === 0) {
      return (
        <div className="h-full flex items-center justify-center text-center p-4">
          <div>
            <div className="text-foreground-muted mb-2">📊</div>
            <div className="text-sm text-foreground-muted">No data available</div>
          </div>
        </div>
      );
    }

    const primaryColor = 'hsl(252, 60%, 65%)';
    const secondaryColor = 'hsl(163, 50%, 45%)';

    switch (type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 10%, 20%)" />
              <XAxis 
                dataKey={config.visualization?.xField || 'name'} 
                stroke="hsl(0, 0%, 70%)"
                fontSize={12}
              />
              <YAxis stroke="hsl(0, 0%, 70%)" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(240, 10%, 12%)', 
                  border: '1px solid hsl(240, 10%, 20%)',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey={config.visualization?.yField || 'value'} 
                stroke={primaryColor} 
                strokeWidth={2}
                dot={{ fill: primaryColor, r: 4 }}
                activeDot={{ r: 6, fill: primaryColor }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 10%, 20%)" />
              <XAxis 
                dataKey={config.visualization?.xField || 'name'} 
                stroke="hsl(0, 0%, 70%)"
                fontSize={12}
              />
              <YAxis stroke="hsl(0, 0%, 70%)" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(240, 10%, 12%)', 
                  border: '1px solid hsl(240, 10%, 20%)',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar 
                dataKey={config.visualization?.yField || 'value'} 
                fill={primaryColor}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill || (index % 2 === 0 ? primaryColor : secondaryColor)} 
                  />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(240, 10%, 12%)', 
                  border: '1px solid hsl(240, 10%, 20%)',
                  borderRadius: '8px'
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return <div>Unknown chart type</div>;
    }
  };

  return (
    <WidgetContainer
      title={config.title || `${type.charAt(0).toUpperCase() + type.slice(1)} Chart`}
      onConfigClick={onConfigClick}
      onDeleteClick={onDeleteClick}
      isReadOnly={isReadOnly}
      className="h-full"
    >
      <div className="h-full pt-2">
        {renderChart()}
      </div>
    </WidgetContainer>
  );
}