'use client';

import { useState, useEffect } from 'react';
import { MapPin, Layers, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/design-system';
import { WidgetConfigData } from '../dashboard/WidgetConfig';
import { WidgetContainer } from './WidgetContainer';

export interface MapWidgetProps {
  config: WidgetConfigData;
  onConfigClick: () => void;
  onDeleteClick: () => void;
  isReadOnly?: boolean;
}

interface MapDataPoint {
  id: string;
  lat: number;
  lng: number;
  value: number;
  label: string;
  category?: string;
  color?: string;
}

// Mock geographic data
const generateMockMapData = (): MapDataPoint[] => {
  const cities = [
    { name: 'New York', lat: 40.7128, lng: -74.0060 },
    { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
    { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
    { name: 'Houston', lat: 29.7604, lng: -95.3698 },
    { name: 'Phoenix', lat: 33.4484, lng: -112.0740 },
    { name: 'Philadelphia', lat: 39.9526, lng: -75.1652 },
    { name: 'San Antonio', lat: 29.4241, lng: -98.4936 },
    { name: 'San Diego', lat: 32.7157, lng: -117.1611 },
    { name: 'Dallas', lat: 32.7767, lng: -96.7970 },
    { name: 'San Jose', lat: 37.3382, lng: -121.8863 }
  ];

  const categories = ['sales', 'support', 'marketing'];
  const colors = ['hsl(252, 60%, 65%)', 'hsl(163, 50%, 45%)', 'hsl(30, 80%, 60%)'];

  return cities.map((city, index) => ({
    id: `point-${index}`,
    lat: city.lat,
    lng: city.lng,
    value: Math.floor(Math.random() * 10000) + 1000,
    label: city.name,
    category: categories[index % categories.length],
    color: colors[index % colors.length]
  }));
};

export function MapWidget({ 
  config, 
  onConfigClick, 
  onDeleteClick, 
  isReadOnly 
}: MapWidgetProps) {
  const [data, setData] = useState<MapDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'points' | 'heatmap'>('points');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (config.dataSource?.type === 'mock') {
          // Simulate loading delay
          await new Promise(resolve => setTimeout(resolve, 500));
          setData(generateMockMapData());
        } else if (config.dataSource?.type === 'api' && config.dataSource.endpoint) {
          const response = await fetch(config.dataSource.endpoint);
          if (!response.ok) throw new Error('Failed to fetch data');
          const result = await response.json();
          setData(result.data || []);
        } else {
          setData(generateMockMapData());
        }
      } catch (err) {
        console.error('Error loading map data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        // Fallback to mock data on error
        setData(generateMockMapData());
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [config.dataSource]);

  const filteredData = data.filter(point => 
    selectedCategory === 'all' || point.category === selectedCategory
  );

  const categories = Array.from(new Set(data.map(point => point.category))).filter(Boolean);

  const getMarkerSize = (value: number) => {
    const maxValue = Math.max(...data.map(d => d.value));
    const minSize = 8;
    const maxSize = 24;
    return Math.max(minSize, (value / maxValue) * maxSize);
  };

  const headerActions = (
    <div className="flex items-center gap-1">
      <select
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
        className="px-2 py-1 text-xs bg-background border border-card-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        <option value="all">All Categories</option>
        {categories.map(category => (
          <option key={category} value={category}>
            {category ? category.charAt(0).toUpperCase() + category.slice(1) : category}
          </option>
        ))}
      </select>
      
      <Button
        variant={viewType === 'points' ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => setViewType('points')}
        className="text-xs px-2"
      >
        Points
      </Button>
      <Button
        variant={viewType === 'heatmap' ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => setViewType('heatmap')}
        className="text-xs px-2"
      >
        Heat
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <WidgetContainer
        title={config.title || 'Map Visualization'}
        onConfigClick={onConfigClick}
        onDeleteClick={onDeleteClick}
        isReadOnly={isReadOnly}
        headerActions={headerActions}
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
        title={config.title || 'Map Visualization'}
        onConfigClick={onConfigClick}
        onDeleteClick={onDeleteClick}
        isReadOnly={isReadOnly}
        headerActions={headerActions}
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

  // Simple SVG-based map visualization
  // In a real implementation, you'd use a proper mapping library like Leaflet or Mapbox
  const svgWidth = 400;
  const svgHeight = 250;
  const usaBounds = {
    minLat: 24.396308,
    maxLat: 49.384358,
    minLng: -125.0,
    maxLng: -66.93457
  };

  const projectPoint = (lat: number, lng: number) => {
    const x = ((lng - usaBounds.minLng) / (usaBounds.maxLng - usaBounds.minLng)) * svgWidth;
    const y = ((usaBounds.maxLat - lat) / (usaBounds.maxLat - usaBounds.minLat)) * svgHeight;
    return { x, y };
  };

  return (
    <WidgetContainer
      title={config.title || 'Map Visualization'}
      onConfigClick={onConfigClick}
      onDeleteClick={onDeleteClick}
      isReadOnly={isReadOnly}
      headerActions={headerActions}
      className="h-full"
    >
      <div className="h-full flex flex-col">
        {/* Map Container */}
        <div className="flex-1 relative bg-gradient-to-b from-blue-950/20 to-blue-900/10 overflow-hidden">
          <svg 
            width="100%" 
            height="100%" 
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-full"
          >
            {/* Simple US outline (very basic) */}
            <rect 
              x="0" 
              y="0" 
              width={svgWidth} 
              height={svgHeight}
              fill="transparent"
              stroke="hsl(240, 10%, 30%)"
              strokeWidth="2"
              rx="8"
            />
            
            {/* State boundaries (simplified) */}
            <g stroke="hsl(240, 10%, 25%)" strokeWidth="1" fill="none" opacity="0.3">
              {/* Simplified state lines */}
              <line x1="100" y1="0" x2="100" y2={svgHeight} />
              <line x1="200" y1="0" x2="200" y2={svgHeight} />
              <line x1="300" y1="0" x2="300" y2={svgHeight} />
              <line x1="0" y1="80" x2={svgWidth} y2="80" />
              <line x1="0" y1="160" x2={svgWidth} y2="160" />
            </g>

            {/* Data Points */}
            {viewType === 'points' && filteredData.map(point => {
              const { x, y } = projectPoint(point.lat, point.lng);
              const size = getMarkerSize(point.value);
              
              return (
                <g key={point.id}>
                  {/* Glow effect */}
                  <circle
                    cx={x}
                    cy={y}
                    r={size + 4}
                    fill={point.color}
                    opacity="0.2"
                    className="animate-pulse"
                  />
                  {/* Main marker */}
                  <circle
                    cx={x}
                    cy={y}
                    r={size / 2}
                    fill={point.color}
                    stroke="white"
                    strokeWidth="2"
                    opacity="0.9"
                  />
                  {/* Center dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={2}
                    fill="white"
                  />
                </g>
              );
            })}

            {/* Heatmap visualization */}
            {viewType === 'heatmap' && filteredData.map(point => {
              const { x, y } = projectPoint(point.lat, point.lng);
              const intensity = point.value / Math.max(...data.map(d => d.value));
              
              return (
                <circle
                  key={point.id}
                  cx={x}
                  cy={y}
                  r={30}
                  fill={`hsl(${60 - intensity * 60}, 100%, 50%)`}
                  opacity={intensity * 0.6}
                  className="blur-sm"
                />
              );
            })}
          </svg>

          {/* Map Controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <Button variant="ghost" size="icon-sm" className="bg-background/80 backdrop-blur-sm">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="bg-background/80 backdrop-blur-sm">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="bg-background/80 backdrop-blur-sm">
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="p-4 border-t border-card-border bg-background/50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              {categories.slice(0, 3).map((category, index) => (
                <div key={category} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: ['hsl(252, 60%, 65%)', 'hsl(163, 50%, 45%)', 'hsl(30, 80%, 60%)'][index] }}
                  />
                  <span className="text-foreground-muted capitalize">{category}</span>
                </div>
              ))}
            </div>
            <div className="text-foreground-muted">
              {filteredData.length} locations
            </div>
          </div>
        </div>
      </div>
    </WidgetContainer>
  );
}