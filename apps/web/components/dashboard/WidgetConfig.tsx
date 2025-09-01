'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/design-system';
import { X, Settings, Database, Palette, Filter } from 'lucide-react';

export interface WidgetConfigData {
  id: string;
  title?: string;
  dataSource?: {
    type: 'snowflake' | 'api' | 'mock';
    query?: string;
    endpoint?: string;
    database?: string;
    schema?: string;
    table?: string;
    refreshInterval?: number;
  };
  visualization?: {
    type: 'line' | 'bar' | 'pie' | 'area' | 'metric' | 'table';
    xField?: string;
    yField?: string;
    colorField?: string;
    aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  };
  styling?: {
    backgroundColor?: string;
    textColor?: string;
    borderRadius?: number;
    padding?: number;
  };
  filters?: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'greater' | 'less';
    value: unknown;
  }>;
}

export interface WidgetConfigProps {
  isOpen: boolean;
  onClose: () => void;
  widget: WidgetConfigData | null;
  onSave: (config: WidgetConfigData) => void;
}

export function WidgetConfig({ isOpen, onClose, widget, onSave }: WidgetConfigProps) {
  const [config, setConfig] = useState<WidgetConfigData | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'data' | 'style' | 'filters'>('general');

  useEffect(() => {
    if (widget) {
      setConfig({ ...widget });
    }
  }, [widget]);

  if (!isOpen || !config) return null;

  const updateConfig = (updates: Partial<WidgetConfigData>) => {
    setConfig(prev => prev ? { ...prev, ...updates } : null);
  };

  const updateDataSource = (updates: Partial<WidgetConfigData['dataSource']>) => {
    setConfig(prev => prev ? {
      ...prev,
      dataSource: { 
        type: 'mock' as const,
        ...prev.dataSource,
        ...updates
      }
    } : null);
  };

  const updateVisualization = (updates: Partial<WidgetConfigData['visualization']>) => {
    setConfig(prev => prev ? {
      ...prev,
      visualization: { 
        type: 'line' as const,
        ...prev.visualization,
        ...updates
      }
    } : null);
  };

  const updateStyling = (updates: Partial<WidgetConfigData['styling']>) => {
    setConfig(prev => prev ? {
      ...prev,
      styling: { ...prev.styling, ...updates }
    } : null);
  };

  const handleSave = () => {
    if (config) {
      onSave(config);
      onClose();
    }
  };

  const tabs = [
    { id: 'general' as const, name: 'General', icon: Settings },
    { id: 'data' as const, name: 'Data', icon: Database },
    { id: 'style' as const, name: 'Style', icon: Palette },
    { id: 'filters' as const, name: 'Filters', icon: Filter },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-card/95 backdrop-blur-sm border border-card-border rounded-xl shadow-xl max-h-[90vh] overflow-hidden">
        <div className="flex flex-col h-full max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-card-border">
            <h2 className="text-xl font-semibold">Configure Widget</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-card-border bg-background/50">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-foreground-muted hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.name}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Widget Title</label>
                  <input
                    type="text"
                    value={config.title || ''}
                    onChange={(e) => updateConfig({ title: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Enter widget title..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Data Source Type</label>
                  <select
                    value={config.dataSource?.type || 'mock'}
                    onChange={(e) => updateDataSource({ type: e.target.value as 'snowflake' | 'api' | 'mock' })}
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="mock">Mock Data</option>
                    <option value="snowflake">Snowflake</option>
                    <option value="api">API Endpoint</option>
                  </select>
                </div>

                {config.dataSource?.type === 'snowflake' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Database</label>
                        <input
                          type="text"
                          value={config.dataSource.database || ''}
                          onChange={(e) => updateDataSource({ database: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Schema</label>
                        <input
                          type="text"
                          value={config.dataSource.schema || ''}
                          onChange={(e) => updateDataSource({ schema: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">SQL Query</label>
                      <textarea
                        value={config.dataSource.query || ''}
                        onChange={(e) => updateDataSource({ query: e.target.value })}
                        rows={4}
                        className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono text-sm"
                        placeholder="SELECT * FROM your_table LIMIT 100"
                      />
                    </div>
                  </>
                )}

                {config.dataSource?.type === 'api' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">API Endpoint</label>
                    <input
                      type="url"
                      value={config.dataSource.endpoint || ''}
                      onChange={(e) => updateDataSource({ endpoint: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="https://api.example.com/data"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">Visualization Type</label>
                  <select
                    value={config.visualization?.type || 'line'}
                    onChange={(e) => updateVisualization({ type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="line">Line Chart</option>
                    <option value="bar">Bar Chart</option>
                    <option value="pie">Pie Chart</option>
                    <option value="area">Area Chart</option>
                    <option value="metric">Metric</option>
                    <option value="table">Table</option>
                  </select>
                </div>

                {['line', 'bar', 'area'].includes(config.visualization?.type || '') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">X Field</label>
                      <input
                        type="text"
                        value={config.visualization?.xField || ''}
                        onChange={(e) => updateVisualization({ xField: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Y Field</label>
                      <input
                        type="text"
                        value={config.visualization?.yField || ''}
                        onChange={(e) => updateVisualization({ yField: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'style' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Background Color</label>
                    <input
                      type="color"
                      value={config.styling?.backgroundColor || '#000000'}
                      onChange={(e) => updateStyling({ backgroundColor: e.target.value })}
                      className="w-full h-10 bg-background border border-card-border rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Text Color</label>
                    <input
                      type="color"
                      value={config.styling?.textColor || '#ffffff'}
                      onChange={(e) => updateStyling({ textColor: e.target.value })}
                      className="w-full h-10 bg-background border border-card-border rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Border Radius</label>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      value={config.styling?.borderRadius || 8}
                      onChange={(e) => updateStyling({ borderRadius: parseInt(e.target.value) })}
                      className="w-full"
                    />
                    <span className="text-sm text-foreground-muted">{config.styling?.borderRadius || 8}px</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Padding</label>
                    <input
                      type="range"
                      min="0"
                      max="32"
                      value={config.styling?.padding || 16}
                      onChange={(e) => updateStyling({ padding: parseInt(e.target.value) })}
                      className="w-full"
                    />
                    <span className="text-sm text-foreground-muted">{config.styling?.padding || 16}px</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'filters' && (
              <div className="space-y-4">
                <div className="text-foreground-muted">
                  Filters will be applied to the data before visualization.
                </div>
                {/* Add filter configuration UI here */}
                <div className="text-sm text-foreground-muted bg-card/50 p-4 rounded-lg">
                  Filter configuration coming soon...
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-card-border bg-background/50">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}