import type {
  EmbedConfig,
  EmbedMessage,
  DashboardConfig,
} from './types.js';
import { EmbedError, EMBED_ERRORS } from './types.js';

/**
 * Client-side embed SDK for integrating Elev8 dashboards
 */
export class EmbedClient {
  private config: EmbedConfig;
  private iframe: HTMLIFrameElement | null = null;
  private container: HTMLElement | null = null;
  private isLoaded = false;
  private messageHandlers = new Map<string, (data?: unknown) => void>();

  constructor(config: EmbedConfig) {
    this.config = { ...config };
    this.validateConfig();
    this.setupMessageListener();
  }

  /**
   * Initialize and render the embedded dashboard
   */
  async render(): Promise<void> {
    try {
      // Get container element
      this.container = this.getContainer();

      // Validate token before rendering
      await this.validateToken();

      // Create and configure iframe
      this.createIFrame();

      // Load dashboard
      await this.loadDashboard();
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Update the embedded dashboard with new configuration
   */
  async update(newConfig: Partial<EmbedConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };

    if (this.iframe && this.isLoaded) {
      // Send update message to iframe
      this.postMessage({
        type: 'update',
        data: {
          dashboardId: this.config.dashboardId,
          token: this.config.token,
          appearance: this.config.appearance,
        },
      });
    } else {
      // Re-render if not loaded
      await this.render();
    }
  }

  /**
   * Apply filters to the embedded dashboard
   */
  applyFilters(filters: Record<string, unknown>): void {
    if (!this.isLoaded || !this.iframe) {
      throw new Error('Dashboard not loaded yet');
    }

    this.postMessage({
      type: 'apply-filters',
      data: { filters },
    });
  }

  /**
   * Refresh the dashboard data
   */
  refresh(): void {
    if (!this.isLoaded || !this.iframe) {
      throw new Error('Dashboard not loaded yet');
    }

    this.postMessage({
      type: 'refresh',
      data: {},
    });
  }

  /**
   * Export dashboard data
   */
  exportData(format: 'csv' | 'json' = 'csv'): void {
    if (!this.isLoaded || !this.iframe) {
      throw new Error('Dashboard not loaded yet');
    }

    this.postMessage({
      type: 'export',
      data: { format },
    });
  }

  /**
   * Destroy the embedded dashboard and clean up resources
   */
  destroy(): void {
    if (this.iframe && this.container) {
      this.container.removeChild(this.iframe);
    }

    this.iframe = null;
    this.container = null;
    this.isLoaded = false;
    this.messageHandlers.clear();

    // Remove global message listener
    window.removeEventListener('message', this.handleMessage);
  }

  /**
   * Get current dashboard configuration
   */
  async getDashboardConfig(): Promise<DashboardConfig> {
    const response = await fetch(
      `${this.config.apiUrl}/embed/dashboard/${this.config.dashboardId}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard config: ${response.statusText}`);
    }

    const data = await response.json();
    return data.dashboard;
  }

  /**
   * Register event handler
   */
  on(event: string, handler: (data?: unknown) => void): void {
    this.messageHandlers.set(event, handler);
  }

  /**
   * Unregister event handler
   */
  off(event: string): void {
    this.messageHandlers.delete(event);
  }

  private validateConfig(): void {
    if (!this.config.apiUrl) {
      throw new EmbedError('API URL is required', EMBED_ERRORS.INITIALIZATION_ERROR);
    }

    if (!this.config.dashboardId) {
      throw new EmbedError('Dashboard ID is required', EMBED_ERRORS.INITIALIZATION_ERROR);
    }

    if (!this.config.token) {
      throw new EmbedError('Authentication token is required', EMBED_ERRORS.INITIALIZATION_ERROR);
    }

    if (!this.config.container) {
      throw new EmbedError('Container is required', EMBED_ERRORS.INITIALIZATION_ERROR);
    }
  }

  private getContainer(): HTMLElement {
    if (typeof this.config.container === 'string') {
      const element = document.querySelector(this.config.container);
      if (!element) {
        throw new EmbedError(
          `Container element not found: ${this.config.container}`,
          EMBED_ERRORS.INITIALIZATION_ERROR,
        );
      }
      return element as HTMLElement;
    }

    return this.config.container;
  }

  private async validateToken(): Promise<void> {
    try {
      const response = await fetch(`${this.config.apiUrl}/embed/validate`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new EmbedError('Invalid or expired token', EMBED_ERRORS.INVALID_TOKEN);
        }
        throw new EmbedError(
          `Token validation failed: ${response.statusText}`,
          EMBED_ERRORS.NETWORK_ERROR,
        );
      }

      const validation = await response.json();
      if (!validation.valid) {
        throw new EmbedError(
          validation.error || 'Token validation failed',
          EMBED_ERRORS.INVALID_TOKEN,
        );
      }
    } catch (error) {
      if (error instanceof EmbedError) {
        throw error;
      }
      throw new EmbedError(
        `Network error during token validation: ${(error as Error).message}`,
        EMBED_ERRORS.NETWORK_ERROR,
      );
    }
  }

  private createIFrame(): void {
    if (!this.container) return;

    this.iframe = document.createElement('iframe');

    // Configure iframe
    const embedUrl = this.buildEmbedUrl();
    this.iframe.src = embedUrl;
    this.iframe.width = '100%';
    this.iframe.height = '100%';
    this.iframe.style.border = 'none';
    this.iframe.style.overflow = 'hidden';

    // Set sandbox permissions for security
    this.iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms');

    // Apply custom styles if provided
    if (this.config.appearance?.customStyles) {
      this.iframe.style.cssText += this.config.appearance.customStyles;
    }

    // Auto-resize functionality
    if (this.config.appearance?.autoResize !== false) {
      this.iframe.style.minHeight = '400px';
      this.iframe.style.resize = 'both';
    }

    this.container.appendChild(this.iframe);
  }

  private buildEmbedUrl(): string {
    const baseUrl = `${this.config.apiUrl}/embed/dashboard/${this.config.dashboardId}`;
    const params = new URLSearchParams();

    params.set('token', this.config.token);

    // Add appearance options
    if (this.config.appearance) {
      const appearance = this.config.appearance;
      if (appearance.showTitle !== undefined) {
        params.set('showTitle', appearance.showTitle.toString());
      }
      if (appearance.showToolbar !== undefined) {
        params.set('showToolbar', appearance.showToolbar.toString());
      }
      if (appearance.showFilters !== undefined) {
        params.set('showFilters', appearance.showFilters.toString());
      }
      if (appearance.theme) {
        params.set('theme', JSON.stringify(appearance.theme));
      }
    }

    return `${baseUrl}?${params.toString()}`;
  }

  private async loadDashboard(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.iframe) {
        reject(new Error('IFrame not created'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new EmbedError('Dashboard load timeout', EMBED_ERRORS.INITIALIZATION_ERROR));
      }, 30000); // 30 second timeout

      this.iframe.onload = () => {
        clearTimeout(timeout);
        this.isLoaded = true;

        if (this.config.onLoad) {
          this.config.onLoad();
        }

        resolve();
      };

      this.iframe.onerror = () => {
        clearTimeout(timeout);
        reject(new EmbedError('Failed to load dashboard', EMBED_ERRORS.INITIALIZATION_ERROR));
      };
    });
  }

  private setupMessageListener(): void {
    this.handleMessage = this.handleMessage.bind(this);
    window.addEventListener('message', this.handleMessage);
  }

  private handleMessage = (event: MessageEvent<EmbedMessage>): void => {
    // Validate message origin for security
    if (!this.isValidOrigin(event.origin)) {
      return;
    }

    const message = event.data;
    if (message.source !== 'elev8-embed') {
      return;
    }

    switch (message.type) {
      case 'resize':
        this.handleResize(message.data as { width: number; height: number });
        break;

      case 'error':
        this.handleError(message.data as Error);
        break;

      case 'filter-change':
        if (this.config.onFilterChange) {
          this.config.onFilterChange(message.data as Record<string, unknown>);
        }
        break;

      case 'export':
        if (this.config.onDataExport) {
          this.config.onDataExport(message.data as unknown[]);
        }
        break;
    }

    // Call custom event handlers
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.data);
    }
  };

  private isValidOrigin(origin: string): boolean {
    try {
      const apiUrl = new URL(this.config.apiUrl);
      const messageUrl = new URL(origin);
      return apiUrl.origin === messageUrl.origin;
    } catch {
      return false;
    }
  }

  private handleResize(dimensions: { width: number; height: number }): void {
    if (this.iframe && this.config.appearance?.autoResize !== false) {
      this.iframe.style.height = `${dimensions.height}px`;
    }

    if (this.config.onResize) {
      this.config.onResize(dimensions);
    }
  }

  private handleError(error: Error): void {
    if (this.config.onError) {
      this.config.onError(error);
    } else {
      console.error('Embed SDK Error:', error);
    }
  }

  private postMessage(message: Omit<EmbedMessage, 'source'>): void {
    if (!this.iframe?.contentWindow) return;

    this.iframe.contentWindow.postMessage(
      { ...message, source: 'elev8-embed' },
      this.config.apiUrl,
    );
  }
}
