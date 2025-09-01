/**
 * TypeScript definitions for the Elev8 Embed SDK
 */

// JWT token payload structure
export interface EmbedTokenPayload {
  /** Dashboard ID to embed */
  dashboardId: string;
  /** User identifier */
  userId: string;
  /** User email */
  userEmail?: string;
  /** Organization ID */
  orgId: string;
  /** Allowed permissions for the embedded dashboard */
  permissions: EmbedPermissions;
  /** Token expiration timestamp */
  exp: number;
  /** Token issued at timestamp */
  iat: number;
  /** Token issuer */
  iss: string;
  /** Token audience */
  aud: string;
}

// Embed permissions
export interface EmbedPermissions {
  /** Can view the dashboard */
  view: boolean;
  /** Can export data */
  export: boolean;
  /** Can apply filters */
  filter: boolean;
  /** Can drill down into data */
  drilldown: boolean;
  /** Can refresh data */
  refresh: boolean;
}

// Dashboard configuration
export interface DashboardConfig {
  /** Dashboard ID */
  id: string;
  /** Dashboard title */
  title: string;
  /** Dashboard description */
  description?: string;
  /** Dashboard widgets */
  widgets: DashboardWidget[];
  /** Dashboard filters */
  filters?: DashboardFilter[];
  /** Dashboard theme */
  theme?: DashboardTheme;
}

// Widget types
export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'text' | 'filter';
  title: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  config: Record<string, unknown>;
  dataSource?: {
    query: string;
    database: string;
    schema: string;
    table?: string;
  };
}

// Filter types
export interface DashboardFilter {
  id: string;
  name: string;
  type: 'select' | 'multiselect' | 'date' | 'daterange' | 'text' | 'number';
  column: string;
  values?: string[];
  defaultValue?: unknown;
  required?: boolean;
}

// Theme configuration
export interface DashboardTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  fontFamily?: string;
  fontSize?: string;
}

// Embed configuration options
export interface EmbedConfig {
  /** API base URL */
  apiUrl: string;
  /** Dashboard ID to embed */
  dashboardId: string;
  /** JWT token for authentication */
  token: string;
  /** Container element or selector */
  container: string | HTMLElement;
  /** Embed appearance options */
  appearance?: EmbedAppearance;
  /** Event handlers */
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onResize?: (dimensions: { width: number; height: number }) => void;
  onFilterChange?: (filters: Record<string, unknown>) => void;
  onDataExport?: (data: unknown[]) => void;
}

// Embed appearance options
export interface EmbedAppearance {
  /** Show dashboard title */
  showTitle?: boolean;
  /** Show dashboard toolbar */
  showToolbar?: boolean;
  /** Show filter bar */
  showFilters?: boolean;
  /** Enable auto-resize */
  autoResize?: boolean;
  /** Custom CSS styles */
  customStyles?: string;
  /** Theme overrides */
  theme?: Partial<DashboardTheme>;
}

// Token generation options
export interface TokenGenerationOptions {
  /** Dashboard ID */
  dashboardId: string;
  /** User information */
  user: {
    id: string;
    email?: string;
    orgId: string;
  };
  /** Token permissions */
  permissions: EmbedPermissions;
  /** Token expiration in seconds (default: 3600) */
  expiresIn?: number;
  /** Custom claims */
  customClaims?: Record<string, unknown>;
}

// API response types
export interface EmbedTokenResponse {
  token: string;
  expiresAt: string;
  dashboardId: string;
}

export interface EmbedValidationResponse {
  valid: boolean;
  payload?: EmbedTokenPayload;
  error?: string;
}

export interface EmbedDashboardResponse {
  dashboard: DashboardConfig;
  permissions: EmbedPermissions;
  user: {
    id: string;
    email?: string;
    orgId: string;
  };
}

// Event types for parent-child communication
export interface EmbedMessage {
  type: 'resize' | 'error' | 'load' | 'filter-change' | 'export' | 'navigate' | 'update' | 'apply-filters' | 'refresh';
  data?: unknown;
  source: 'elev8-embed';
}

// Error types
export class EmbedError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'EmbedError';
  }
}

// Constants
export const EMBED_ERRORS = {
  INVALID_TOKEN: 'INVALID_TOKEN',
  EXPIRED_TOKEN: 'EXPIRED_TOKEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  DASHBOARD_NOT_FOUND: 'DASHBOARD_NOT_FOUND',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INITIALIZATION_ERROR: 'INITIALIZATION_ERROR',
} as const;

export type EmbedErrorCode = (typeof EMBED_ERRORS)[keyof typeof EMBED_ERRORS];
