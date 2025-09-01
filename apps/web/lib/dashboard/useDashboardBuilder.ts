'use client';

import { useState, useCallback, useRef } from 'react';
import { DashboardData, DashboardWidget } from '../../components/dashboard/DashboardBuilder';
import { WidgetType } from '../../components/dashboard/WidgetLibrary';
import { FilterValue } from '../../components/dashboard/DashboardFilters';
import { ThemeConfig } from '../../components/dashboard/DashboardTheme';

export interface HistoryEntry {
  dashboard: DashboardData;
  timestamp: number;
  action: string;
}

export interface UseDashboardBuilderReturn {
  // Current state
  dashboard: DashboardData;
  history: HistoryEntry[];
  historyIndex: number;
  isDirty: boolean;
  
  // History management
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  
  // Dashboard mutations
  updateDashboard: (updates: Partial<DashboardData>, action?: string) => void;
  resetDashboard: (newDashboard: DashboardData) => void;
  
  // Widget management
  addWidget: (widgetType: WidgetType, position?: { x: number; y: number }) => void;
  updateWidget: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  removeWidget: (widgetId: string) => void;
  duplicateWidget: (widgetId: string) => void;
  moveWidget: (widgetId: string, newPosition: { x: number; y: number; w: number; h: number }) => void;
  
  // Layout management
  updateLayout: (layout: unknown[], layouts: Record<string, unknown>) => void;
  
  // Filter management
  updateFilters: (filters: FilterValue[]) => void;
  addFilter: (filter: FilterValue) => void;
  removeFilter: (filterId: string) => void;
  clearFilters: () => void;
  
  // Theme management
  updateTheme: (theme: ThemeConfig) => void;
  applyThemePreset: (presetName: string) => void;
  
  // Utility functions
  exportDashboard: () => DashboardData;
  importDashboard: (dashboard: DashboardData) => void;
  validateDashboard: () => { isValid: boolean; errors: string[] };
}

const MAX_HISTORY_SIZE = 50;

export function useDashboardBuilder(initialDashboard: DashboardData): UseDashboardBuilderReturn {
  const [dashboard, setDashboard] = useState<DashboardData>(initialDashboard);
  const [history, setHistory] = useState<HistoryEntry[]>([
    { dashboard: initialDashboard, timestamp: Date.now(), action: 'initial' }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  
  const initialDashboardRef = useRef(initialDashboard);

  const addToHistory = useCallback((newDashboard: DashboardData, action: string) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({
        dashboard: { ...newDashboard },
        timestamp: Date.now(),
        action
      });
      
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        return newHistory;
      }
      
      return newHistory;
    });
    
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
    setIsDirty(true);
  }, [historyIndex]);

  const updateDashboard = useCallback((updates: Partial<DashboardData>, action: string = 'update') => {
    const newDashboard = { ...dashboard, ...updates };
    setDashboard(newDashboard);
    addToHistory(newDashboard, action);
  }, [dashboard, addToHistory]);

  const resetDashboard = useCallback((newDashboard: DashboardData) => {
    setDashboard(newDashboard);
    setHistory([{ dashboard: newDashboard, timestamp: Date.now(), action: 'reset' }]);
    setHistoryIndex(0);
    setIsDirty(false);
    initialDashboardRef.current = newDashboard;
  }, []);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setDashboard(history[newIndex].dashboard);
      setIsDirty(newIndex > 0 || JSON.stringify(history[newIndex].dashboard) !== JSON.stringify(initialDashboardRef.current));
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setDashboard(history[newIndex].dashboard);
      setIsDirty(true);
    }
  }, [historyIndex, history]);

  const clearHistory = useCallback(() => {
    setHistory([{ dashboard, timestamp: Date.now(), action: 'clear_history' }]);
    setHistoryIndex(0);
  }, [dashboard]);

  // Widget management
  const addWidget = useCallback((widgetType: WidgetType, position?: { x: number; y: number }) => {
    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: widgetType.id,
      config: {
        id: `widget-${Date.now()}`,
        title: widgetType.name,
        dataSource: { type: 'mock' },
        visualization: { type: 'line' }
      },
      position: {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        w: widgetType.defaultSize.w,
        h: widgetType.defaultSize.h
      }
    };

    updateDashboard({
      widgets: [...dashboard.widgets, newWidget]
    }, `add_widget_${widgetType.name}`);
  }, [dashboard.widgets, updateDashboard]);

  const updateWidget = useCallback((widgetId: string, updates: Partial<DashboardWidget>) => {
    const updatedWidgets = dashboard.widgets.map(widget =>
      widget.id === widgetId ? { ...widget, ...updates } : widget
    );

    updateDashboard({ widgets: updatedWidgets }, `update_widget_${widgetId}`);
  }, [dashboard.widgets, updateDashboard]);

  const removeWidget = useCallback((widgetId: string) => {
    const updatedWidgets = dashboard.widgets.filter(widget => widget.id !== widgetId);
    updateDashboard({ widgets: updatedWidgets }, `remove_widget_${widgetId}`);
  }, [dashboard.widgets, updateDashboard]);

  const duplicateWidget = useCallback((widgetId: string) => {
    const originalWidget = dashboard.widgets.find(w => w.id === widgetId);
    if (!originalWidget) return;

    const duplicatedWidget: DashboardWidget = {
      ...originalWidget,
      id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      config: {
        ...originalWidget.config,
        id: `widget-${Date.now()}`,
        title: `${originalWidget.config.title} (Copy)`
      },
      position: {
        ...originalWidget.position,
        x: originalWidget.position.x + 1,
        y: originalWidget.position.y + 1
      }
    };

    updateDashboard({
      widgets: [...dashboard.widgets, duplicatedWidget]
    }, `duplicate_widget_${widgetId}`);
  }, [dashboard.widgets, updateDashboard]);

  const moveWidget = useCallback((widgetId: string, newPosition: { x: number; y: number; w: number; h: number }) => {
    const updatedWidgets = dashboard.widgets.map(widget =>
      widget.id === widgetId ? { ...widget, position: newPosition } : widget
    );

    updateDashboard({ widgets: updatedWidgets }, `move_widget_${widgetId}`);
  }, [dashboard.widgets, updateDashboard]);

  // Layout management
  const updateLayout = useCallback((layout: unknown[], layouts: Record<string, unknown>) => {
    const updatedWidgets = dashboard.widgets.map((widget, index) => ({
      ...widget,
      position: layout[index] as { x: number; y: number; w: number; h: number }
    }));

    updateDashboard({
      widgets: updatedWidgets,
      layout: layouts
    }, 'update_layout');
  }, [dashboard.widgets, updateDashboard]);

  // Filter management
  const updateFilters = useCallback((filters: FilterValue[]) => {
    updateDashboard({ filters }, 'update_filters');
  }, [updateDashboard]);

  const addFilter = useCallback((filter: FilterValue) => {
    updateDashboard({
      filters: [...dashboard.filters, filter]
    }, 'add_filter');
  }, [dashboard.filters, updateDashboard]);

  const removeFilter = useCallback((filterId: string) => {
    const updatedFilters = dashboard.filters.filter(f => (f as any).id !== filterId);
    updateDashboard({ filters: updatedFilters }, 'remove_filter');
  }, [dashboard.filters, updateDashboard]);

  const clearFilters = useCallback(() => {
    updateDashboard({ filters: [] }, 'clear_filters');
  }, [updateDashboard]);

  // Theme management
  const updateTheme = useCallback((theme: ThemeConfig) => {
    updateDashboard({ theme }, 'update_theme');
  }, [updateDashboard]);

  const applyThemePreset = useCallback((presetName: string) => {
    // This would typically load a predefined theme configuration
    updateDashboard({
      theme: { ...dashboard.theme, preset: presetName }
    }, `apply_theme_preset_${presetName}`);
  }, [dashboard.theme, updateDashboard]);

  // Utility functions
  const exportDashboard = useCallback(() => {
    return { ...dashboard };
  }, [dashboard]);

  const importDashboard = useCallback((importedDashboard: DashboardData) => {
    resetDashboard(importedDashboard);
  }, [resetDashboard]);

  const validateDashboard = useCallback(() => {
    const errors: string[] = [];

    // Validate dashboard name
    if (!dashboard.name.trim()) {
      errors.push('Dashboard name is required');
    }

    // Validate widgets
    dashboard.widgets.forEach((widget, index) => {
      if (!widget.id) {
        errors.push(`Widget ${index + 1} is missing an ID`);
      }
      if (!widget.type) {
        errors.push(`Widget ${index + 1} is missing a type`);
      }
      if (!widget.position || typeof widget.position.x !== 'number') {
        errors.push(`Widget ${index + 1} has invalid position`);
      }
    });

    // Check for duplicate widget IDs
    const widgetIds = dashboard.widgets.map(w => w.id);
    const duplicateIds = widgetIds.filter((id, index) => widgetIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push(`Duplicate widget IDs found: ${duplicateIds.join(', ')}`);
    }

    // Validate filters
    dashboard.filters.forEach((filter, index) => {
      const f = filter as any;
      if (!f.field) {
        errors.push(`Filter ${index + 1} is missing a field`);
      }
      if (!f.operator) {
        errors.push(`Filter ${index + 1} is missing an operator`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }, [dashboard]);

  return {
    dashboard,
    history,
    historyIndex,
    isDirty,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo,
    redo,
    clearHistory,
    updateDashboard,
    resetDashboard,
    addWidget,
    updateWidget,
    removeWidget,
    duplicateWidget,
    moveWidget,
    updateLayout,
    updateFilters,
    addFilter,
    removeFilter,
    clearFilters,
    updateTheme,
    applyThemePreset,
    exportDashboard,
    importDashboard,
    validateDashboard,
  };
}