'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/design-system';
import { 
  BarChart,
  LineChart,
  PieChart,
  TrendingUp,
  Grid3X3,
  FileText,
  Filter,
  Map,
  X,
  Search
} from 'lucide-react';

export interface WidgetType {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'charts' | 'data' | 'filters' | 'text';
  defaultSize: { w: number; h: number };
}

export const availableWidgets: WidgetType[] = [
  // Charts
  {
    id: 'line-chart',
    name: 'Line Chart',
    description: 'Display trends over time with line visualizations',
    icon: LineChart,
    category: 'charts',
    defaultSize: { w: 6, h: 4 }
  },
  {
    id: 'bar-chart',
    name: 'Bar Chart',
    description: 'Compare categories with vertical or horizontal bars',
    icon: BarChart,
    category: 'charts',
    defaultSize: { w: 6, h: 4 }
  },
  {
    id: 'pie-chart',
    name: 'Pie Chart',
    description: 'Show proportions and percentages',
    icon: PieChart,
    category: 'charts',
    defaultSize: { w: 4, h: 4 }
  },
  
  // Data
  {
    id: 'metric',
    name: 'Metric Card',
    description: 'Display key performance indicators',
    icon: TrendingUp,
    category: 'data',
    defaultSize: { w: 3, h: 2 }
  },
  {
    id: 'table',
    name: 'Data Table',
    description: 'Show structured data in rows and columns',
    icon: Grid3X3,
    category: 'data',
    defaultSize: { w: 8, h: 6 }
  },
  {
    id: 'map',
    name: 'Map Widget',
    description: 'Geographic visualization of data',
    icon: Map,
    category: 'data',
    defaultSize: { w: 6, h: 6 }
  },
  
  // Text
  {
    id: 'text',
    name: 'Text Widget',
    description: 'Add markdown text, notes, or documentation',
    icon: FileText,
    category: 'text',
    defaultSize: { w: 4, h: 3 }
  },
  
  // Filters
  {
    id: 'filter',
    name: 'Filter Widget',
    description: 'Interactive filters for dashboard data',
    icon: Filter,
    category: 'filters',
    defaultSize: { w: 3, h: 2 }
  }
];

export interface WidgetLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (widgetType: WidgetType) => void;
}

export function WidgetLibrary({ isOpen, onClose, onAddWidget }: WidgetLibraryProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', name: 'All Widgets' },
    { id: 'charts', name: 'Charts' },
    { id: 'data', name: 'Data' },
    { id: 'text', name: 'Text' },
    { id: 'filters', name: 'Filters' }
  ];

  const filteredWidgets = availableWidgets.filter(widget => {
    const matchesSearch = widget.name.toLowerCase().includes(search.toLowerCase()) ||
                         widget.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || widget.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="relative w-80 bg-card/90 backdrop-blur-sm border-r border-card-border shadow-xl">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-card-border">
            <h2 className="text-lg font-semibold">Widget Library</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search widgets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="px-4 pb-4">
            <div className="flex gap-2 overflow-x-auto">
              {categories.map(category => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="whitespace-nowrap"
                >
                  {category.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Widgets */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-3">
              {filteredWidgets.map(widget => (
                <div
                  key={widget.id}
                  className="group p-3 bg-background/50 border border-card-border rounded-lg hover:bg-card-hover hover:border-card-border/50 cursor-pointer transition-colors"
                  onClick={() => onAddWidget(widget)}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <widget.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {widget.name}
                      </h3>
                      <p className="text-sm text-foreground-muted mt-1">
                        {widget.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-foreground-muted bg-card-border/20 px-2 py-1 rounded">
                          {widget.defaultSize.w}×{widget.defaultSize.h}
                        </span>
                        <span className="text-xs text-foreground-muted capitalize">
                          {widget.category}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredWidgets.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-foreground-muted mb-2">No widgets found</div>
                  <p className="text-sm text-foreground-muted">
                    Try adjusting your search or category filter
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}