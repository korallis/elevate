'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';

export interface Dashboard {
  id?: string;
  name: string;
  description?: string;
  layout: Record<string, unknown>;
  theme: Record<string, unknown>;
  filters: unknown[];
  isPublic: boolean;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UseDashboardOptions {
  dashboardId?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
}

export interface UseDashboardReturn {
  dashboard: Dashboard | null;
  dashboards: Dashboard[];
  isLoading: boolean;
  isLoadingList: boolean;
  error: string | null;
  // CRUD operations
  createDashboard: (dashboard: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Dashboard>;
  updateDashboard: (id: string, updates: Partial<Dashboard>) => Promise<Dashboard>;
  deleteDashboard: (id: string) => Promise<void>;
  duplicateDashboard: (id: string, name?: string) => Promise<Dashboard>;
  // Data management
  loadDashboard: (id: string) => Promise<void>;
  loadDashboards: () => Promise<void>;
  saveDashboard: (dashboard: Dashboard) => Promise<void>;
  // State management
  setDashboard: (dashboard: Dashboard | null) => void;
  clearError: () => void;
  refresh: () => Promise<void>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

export function useDashboard(options: UseDashboardOptions = {}): UseDashboardReturn {
  const { dashboardId, autoSave = false, autoSaveDelay = 2000 } = options;

  const [dashboard, setDashboardState] = useState<Dashboard | null>(null);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-save with debounce
  const debouncedSave = useDebouncedCallback(
    async (dashboardToSave: Dashboard) => {
      if (dashboardToSave.id) {
        try {
          await updateDashboard(dashboardToSave.id, dashboardToSave);
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }
    },
    autoSaveDelay
  );

  const setDashboard = useCallback((newDashboard: Dashboard | null) => {
    setDashboardState(newDashboard);
    if (autoSave && newDashboard?.id) {
      debouncedSave(newDashboard);
    }
  }, [autoSave, debouncedSave]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const createDashboard = useCallback(async (dashboardData: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>): Promise<Dashboard> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/dashboards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dashboardData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create dashboard');
      }

      const newDashboard = await response.json();
      setDashboards(prev => [newDashboard, ...prev]);
      return newDashboard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create dashboard';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateDashboard = useCallback(async (id: string, updates: Partial<Dashboard>): Promise<Dashboard> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/dashboards/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update dashboard');
      }

      const updatedDashboard = await response.json();
      
      // Update the dashboard in the list
      setDashboards(prev => 
        prev.map(d => d.id === id ? updatedDashboard : d)
      );
      
      // Update current dashboard if it's the same one
      if (dashboard?.id === id) {
        setDashboardState(updatedDashboard);
      }

      return updatedDashboard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update dashboard';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [dashboard?.id]);

  const deleteDashboard = useCallback(async (id: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/dashboards/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete dashboard');
      }

      // Remove from the list
      setDashboards(prev => prev.filter(d => d.id !== id));
      
      // Clear current dashboard if it's the same one
      if (dashboard?.id === id) {
        setDashboardState(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete dashboard';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [dashboard?.id]);

  const duplicateDashboard = useCallback(async (id: string, name?: string): Promise<Dashboard> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/dashboards/${id}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to duplicate dashboard');
      }

      const duplicatedDashboard = await response.json();
      setDashboards(prev => [duplicatedDashboard, ...prev]);
      return duplicatedDashboard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to duplicate dashboard';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async (id: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/dashboards/${id}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load dashboard');
      }

      const loadedDashboard = await response.json();
      setDashboardState(loadedDashboard);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDashboards = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingList(true);
      setError(null);

      const response = await fetch(`${API_BASE}/dashboards`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load dashboards');
      }

      const data = await response.json();
      setDashboards(data.dashboards || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboards';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const saveDashboard = useCallback(async (dashboardToSave: Dashboard): Promise<void> => {
    if (dashboardToSave.id) {
      await updateDashboard(dashboardToSave.id, dashboardToSave);
    } else {
      await createDashboard(dashboardToSave);
    }
  }, [createDashboard, updateDashboard]);

  const refresh = useCallback(async (): Promise<void> => {
    const promises: Promise<void>[] = [loadDashboards()];
    
    if (dashboardId) {
      promises.push(loadDashboard(dashboardId));
    }

    await Promise.all(promises);
  }, [loadDashboards, loadDashboard, dashboardId]);

  // Load data on mount and when dashboardId changes
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        await loadDashboards();
        
        if (dashboardId) {
          await loadDashboard(dashboardId);
        }
      } catch (err) {
        if (mounted) {
          console.error('Error loading dashboard data:', err);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [dashboardId, loadDashboards, loadDashboard]);

  return {
    dashboard,
    dashboards,
    isLoading,
    isLoadingList,
    error,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    duplicateDashboard,
    loadDashboard,
    loadDashboards,
    saveDashboard,
    setDashboard,
    clearError,
    refresh,
  };
}