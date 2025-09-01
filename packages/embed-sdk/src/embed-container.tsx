import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EmbedClient } from './embed-client.js';
import type { EmbedConfig, DashboardConfig, EmbedAppearance } from './types.js';
import { EmbedError } from './types.js';

export interface EmbedContainerProps {
  /** API base URL */
  apiUrl: string;
  /** Dashboard ID to embed */
  dashboardId: string;
  /** JWT token for authentication */
  token: string;
  /** Embed appearance options */
  appearance?: EmbedAppearance;
  /** Container CSS class name */
  className?: string;
  /** Container inline styles */
  style?: React.CSSProperties;
  /** Loading component */
  LoadingComponent?: React.ComponentType;
  /** Error component */
  ErrorComponent?: React.ComponentType<{ error: Error; retry: () => void }>;
  /** Event handlers */
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onResize?: (dimensions: { width: number; height: number }) => void;
  onFilterChange?: (filters: Record<string, unknown>) => void;
  onDataExport?: (data: unknown[]) => void;
}

/**
 * React component for embedding Elev8 dashboards
 */
export const EmbedContainer: React.FC<EmbedContainerProps> = ({
  apiUrl,
  dashboardId,
  token,
  appearance = {},
  className,
  style,
  LoadingComponent = DefaultLoadingComponent,
  ErrorComponent = DefaultErrorComponent,
  onLoad,
  onError,
  onResize,
  onFilterChange,
  onDataExport,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const embedClientRef = useRef<EmbedClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);

  // Initialize embed client
  const initializeEmbed = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      setIsLoading(true);
      setError(null);

      // Clean up existing client
      if (embedClientRef.current) {
        embedClientRef.current.destroy();
      }

      // Create embed configuration
      const config: EmbedConfig = {
        apiUrl,
        dashboardId,
        token,
        container: containerRef.current,
        appearance: {
          autoResize: true,
          showTitle: true,
          showToolbar: true,
          showFilters: true,
          ...appearance,
        },
        onLoad: () => {
          setIsLoading(false);
          onLoad?.();
        },
        onError: (embedError: Error) => {
          setError(embedError);
          setIsLoading(false);
          onError?.(embedError);
        },
        onResize,
        onFilterChange,
        onDataExport,
      };

      // Create and render embed client
      const client = new EmbedClient(config);
      embedClientRef.current = client;

      // Get dashboard configuration
      try {
        const config_data = await client.getDashboardConfig();
        setDashboardConfig(config_data);
      } catch (error) {
        console.warn('Failed to get dashboard config:', error);
      }

      // Render the embedded dashboard
      await client.render();
    } catch (err) {
      const embedError = err as Error;
      setError(embedError);
      setIsLoading(false);
      onError?.(embedError);
    }
  }, [
    apiUrl,
    dashboardId,
    token,
    appearance,
    onLoad,
    onError,
    onResize,
    onFilterChange,
    onDataExport,
  ]);

  // Retry function for error recovery
  const retry = useCallback(() => {
    initializeEmbed();
  }, [initializeEmbed]);

  // Initialize on mount and when dependencies change
  useEffect(() => {
    initializeEmbed();

    // Cleanup on unmount
    return () => {
      if (embedClientRef.current) {
        embedClientRef.current.destroy();
        embedClientRef.current = null;
      }
    };
  }, [initializeEmbed]);

  // Apply filters programmatically
  const applyFilters = useCallback(
    (filters: Record<string, unknown>) => {
      if (embedClientRef.current && !isLoading && !error) {
        embedClientRef.current.applyFilters(filters);
      }
    },
    [isLoading, error],
  );

  // Refresh dashboard data
  const refresh = useCallback(() => {
    if (embedClientRef.current && !isLoading && !error) {
      embedClientRef.current.refresh();
    }
  }, [isLoading, error]);

  // Export dashboard data
  const exportData = useCallback(
    (format: 'csv' | 'json' = 'csv') => {
      if (embedClientRef.current && !isLoading && !error) {
        embedClientRef.current.exportData(format);
      }
    },
    [isLoading, error],
  );

  // Expose methods via ref (for imperative usage)
  React.useImperativeHandle(embedClientRef, () => ({
    applyFilters,
    refresh,
    exportData,
    getDashboardConfig: () => dashboardConfig || null,
    getClient: () => embedClientRef.current,
  }));

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: '400px',
    position: 'relative',
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      role="application"
      aria-label={`Embedded dashboard: ${dashboardConfig?.title || dashboardId}`}
    >
      {isLoading && <LoadingComponent />}
      {error && <ErrorComponent error={error} retry={retry} />}
    </div>
  );
};

/**
 * Default loading component
 */
const DefaultLoadingComponent: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      zIndex: 1000,
    }}
    role="status"
    aria-label="Loading dashboard"
  >
    <div
      style={{
        width: '40px',
        height: '40px',
        border: '4px solid #f3f3f3',
        borderTop: '4px solid #3498db',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}
    />
    <style>
      {`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}
    </style>
  </div>
);

/**
 * Default error component
 */
const DefaultErrorComponent: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      zIndex: 1000,
      padding: '20px',
      textAlign: 'center',
    }}
    role="alert"
    aria-label="Dashboard error"
  >
    <div
      style={{
        color: '#e74c3c',
        fontSize: '48px',
        marginBottom: '16px',
      }}
    >
      ⚠️
    </div>
    <h3
      style={{
        color: '#2c3e50',
        fontSize: '18px',
        fontWeight: '600',
        margin: '0 0 12px 0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      Failed to Load Dashboard
    </h3>
    <p
      style={{
        color: '#7f8c8d',
        fontSize: '14px',
        margin: '0 0 20px 0',
        maxWidth: '300px',
        lineHeight: '1.4',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {error instanceof EmbedError ? error.message : 'An unexpected error occurred'}
    </p>
    <button
      onClick={retry}
      style={{
        backgroundColor: '#3498db',
        color: 'white',
        border: 'none',
        padding: '10px 20px',
        borderRadius: '4px',
        fontSize: '14px',
        cursor: 'pointer',
        fontWeight: '500',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'background-color 0.2s',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.backgroundColor = '#2980b9';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = '#3498db';
      }}
    >
      Try Again
    </button>
  </div>
);

/**
 * Hook for using embed functionality in functional components
 */
export const useEmbed = (config: Omit<EmbedConfig, 'container'>) => {
  const [client, setClient] = useState<EmbedClient | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);

  const initialize = useCallback(
    async (container: HTMLElement) => {
      try {
        setIsLoading(true);
        setError(null);

        const embedClient = new EmbedClient({
          ...config,
          container,
          onLoad: () => {
            setIsLoading(false);
            config.onLoad?.();
          },
          onError: (embedError: Error) => {
            setError(embedError);
            setIsLoading(false);
            config.onError?.(embedError);
          },
        });

        const configData = await embedClient.getDashboardConfig();
        setDashboardConfig(configData);

        await embedClient.render();
        setClient(embedClient);
      } catch (err) {
        const embedError = err as Error;
        setError(embedError);
        setIsLoading(false);
        config.onError?.(embedError);
      }
    },
    [config],
  );

  const destroy = useCallback(() => {
    if (client) {
      client.destroy();
      setClient(null);
      setDashboardConfig(null);
    }
  }, [client]);

  return {
    client,
    isLoading,
    error,
    dashboardConfig,
    initialize,
    destroy,
  };
};

export default EmbedContainer;
