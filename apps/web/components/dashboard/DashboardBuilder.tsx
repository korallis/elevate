'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Button } from '@/components/ui/design-system';
import { GridLayout } from './GridLayout';
import { WidgetLibrary, availableWidgets, WidgetType } from './WidgetLibrary';
import { WidgetConfig, WidgetConfigData } from './WidgetConfig';
import { DashboardFilters, FilterValue } from './DashboardFilters';
import { DashboardTheme, ThemeConfig } from './DashboardTheme';
import { ChartWidget } from '../widgets/ChartWidget';
import { MetricWidget } from '../widgets/MetricWidget';
import { TableWidget } from '../widgets/TableWidget';
import { TextWidget } from '../widgets/TextWidget';
import { FilterWidget } from '../widgets/FilterWidget';
import { MapWidget } from '../widgets/MapWidget';
import { 
  Save,
  Undo,
  Redo,
  Play,
  Settings,
  Plus,
  Palette,
  Filter,
  Maximize,
  Download,
  Share
} from 'lucide-react';

export interface DashboardWidget {
  id: string;
  type: string;
  config: WidgetConfigData;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface DashboardData {
  id?: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  filters: FilterValue[];
  theme: ThemeConfig;
  layout: Record<string, unknown>;
}

export interface DashboardBuilderProps {
  initialDashboard?: DashboardData;
  onSave?: (dashboard: DashboardData) => Promise<void>;
  onExport?: (dashboard: DashboardData, format: 'pdf' | 'png') => Promise<void>;
  onShare?: (dashboard: DashboardData) => Promise<void>;
  isReadOnly?: boolean;
}

export function DashboardBuilder({ 
  initialDashboard,
  onSave,
  onExport,
  onShare,
  isReadOnly = false
}: DashboardBuilderProps) {
  const [dashboard, setDashboard] = useState<DashboardData>(
    initialDashboard || {
      name: 'Untitled Dashboard',
      widgets: [],
      filters: [],
      theme: {
        mode: 'dark',
        primary: 'hsl(252, 60%, 65%)',
        accent: 'hsl(163, 50%, 45%)',
        background: 'hsl(240, 10%, 3.9%)',
        surface: 'hsl(240, 10%, 12%)',
        text: 'hsl(0, 0%, 95%)',
        border: 'hsl(240, 10%, 20%)',
        preset: 'elev8'
      },
      layout: {}
    }
  );

  const [history, setHistory] = useState<DashboardData[]>([dashboard]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<DashboardWidget | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-save with debounce
  const debouncedSave = useDebouncedCallback(
    async (dashboardToSave: DashboardData) => {
      if (onSave && !isReadOnly) {
        setIsSaving(true);
        try {
          await onSave(dashboardToSave);
        } catch (error) {
          console.error('Auto-save failed:', error);
        } finally {
          setIsSaving(false);
        }
      }
    },
    2000
  );

  useEffect(() => {
    debouncedSave(dashboard);
  }, [dashboard, debouncedSave]);

  const addToHistory = useCallback((newDashboard: DashboardData) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newDashboard);
      if (newHistory.length > 50) { // Limit history size
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const updateDashboard = useCallback((updates: Partial<DashboardData>) => {
    const newDashboard = { ...dashboard, ...updates };
    setDashboard(newDashboard);
    addToHistory(newDashboard);
  }, [dashboard, addToHistory]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setDashboard(history[newIndex]);
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setDashboard(history[newIndex]);
    }
  }, [historyIndex, history]);

  const handleAddWidget = useCallback((widgetType: WidgetType) => {
    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}`,
      type: widgetType.id,
      config: {
        id: `widget-${Date.now()}`,
        title: widgetType.name,
        dataSource: { type: 'mock' },
        visualization: { type: 'line' }
      },
      position: {
        x: 0,
        y: 0,
        w: widgetType.defaultSize.w,
        h: widgetType.defaultSize.h
      }
    };

    updateDashboard({
      widgets: [...dashboard.widgets, newWidget]
    });

    setIsLibraryOpen(false);
  }, [dashboard.widgets, updateDashboard]);

  const handleLayoutChange = useCallback((layout: unknown[], layouts: Record<string, unknown>) => {
    const updatedWidgets = dashboard.widgets.map((widget, index) => ({
      ...widget,
      position: layout[index] as { x: number; y: number; w: number; h: number }
    }));

    updateDashboard({
      widgets: updatedWidgets,
      layout: layouts
    });
  }, [dashboard.widgets, updateDashboard]);

  const handleWidgetConfig = useCallback((widget: DashboardWidget) => {
    setSelectedWidget(widget);
    setIsConfigOpen(true);
  }, []);

  const handleConfigSave = useCallback((config: WidgetConfigData) => {
    if (selectedWidget) {
      const updatedWidgets = dashboard.widgets.map(widget =>
        widget.id === selectedWidget.id
          ? { ...widget, config }
          : widget
      );

      updateDashboard({ widgets: updatedWidgets });
    }
    setSelectedWidget(null);
  }, [selectedWidget, dashboard.widgets, updateDashboard]);

  const handleWidgetDelete = useCallback((widgetId: string) => {
    const updatedWidgets = dashboard.widgets.filter(widget => widget.id !== widgetId);
    updateDashboard({ widgets: updatedWidgets });
  }, [dashboard.widgets, updateDashboard]);

  const renderWidget = (widget: DashboardWidget) => {
    const commonProps = {
      config: widget.config,
      onConfigClick: () => handleWidgetConfig(widget),
      onDeleteClick: () => handleWidgetDelete(widget.id),
      isReadOnly
    };

    switch (widget.type) {
      case 'line-chart':
      case 'bar-chart':
      case 'pie-chart':
        return <ChartWidget {...commonProps} type={widget.type.replace('-chart', '') as 'line' | 'bar' | 'pie'} />;
      case 'metric':
        return <MetricWidget {...commonProps} />;
      case 'table':
        return <TableWidget {...commonProps} />;
      case 'text':
        return <TextWidget {...commonProps} />;
      case 'filter':
        return <FilterWidget {...commonProps} />;
      case 'map':
        return <MapWidget {...commonProps} />;
      default:
        return <div className="p-4 bg-card border border-card-border rounded">Unknown widget type: {widget.type}</div>;
    }
  };

  return (
    <div 
      className="dashboard-builder h-full flex flex-col"
      style={{
        backgroundColor: dashboard.theme.background,
        color: dashboard.theme.text
      }}
    >
      {/* Header */}
      {!isFullscreen && (
        <div className="flex items-center justify-between p-4 border-b border-card-border bg-card/30 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={dashboard.name}
              onChange={(e) => updateDashboard({ name: e.target.value })}
              className="text-xl font-semibold bg-transparent border-none outline-none focus:bg-background/20 px-2 py-1 rounded"
              disabled={isReadOnly}
            />
            {isSaving && (
              <span className="text-sm text-foreground-muted">Saving...</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={undo}
                  disabled={historyIndex <= 0}
                >
                  <Undo className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                >
                  <Redo className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-card-border mx-1" />
              </>
            )}

            <DashboardFilters
              filters={dashboard.filters}
              onFiltersChange={(filters) => updateDashboard({ filters })}
              availableFields={[
                { name: 'date', type: 'date', label: 'Date' },
                { name: 'category', type: 'string', label: 'Category' },
                { name: 'value', type: 'number', label: 'Value' }
              ]}
              className="mr-2"
            />

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsThemeOpen(true)}
            >
              <Palette className="w-4 h-4" />
            </Button>

            {!isReadOnly && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsLibraryOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Widget
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              <Maximize className="w-4 h-4" />
            </Button>

            <div className="w-px h-6 bg-card-border mx-1" />

            {onExport && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onExport(dashboard, 'pdf')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </>
            )}

            {onShare && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onShare(dashboard)}
              >
                <Share className="w-4 h-4 mr-2" />
                Share
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Dashboard Canvas */}
      <div className="flex-1 overflow-hidden">
        {dashboard.widgets.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-card/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-foreground-muted" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Start Building Your Dashboard</h3>
              <p className="text-foreground-muted mb-4">
                Add widgets to visualize your data and create insightful dashboards.
              </p>
              {!isReadOnly && (
                <Button
                  variant="primary"
                  onClick={() => setIsLibraryOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Widget
                </Button>
              )}
            </div>
          </div>
        ) : (
          <GridLayout
            layouts={dashboard.layout}
            onLayoutChange={handleLayoutChange}
            isDraggable={!isReadOnly}
            isResizable={!isReadOnly}
            className="p-4"
          >
            {dashboard.widgets.map((widget) => (
              <div key={widget.id} data-grid={widget.position}>
                {renderWidget(widget)}
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Modals */}
      <WidgetLibrary
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onAddWidget={handleAddWidget}
      />

      <WidgetConfig
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        widget={selectedWidget?.config || null}
        onSave={handleConfigSave}
      />

      <DashboardTheme
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        theme={dashboard.theme}
        onThemeChange={(theme) => updateDashboard({ theme })}
      />
    </div>
  );
}