export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  layout: Record<string, unknown>;
  theme: Record<string, unknown>;
  filters: unknown[];
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidget {
  id: string;
  dashboardId: string;
  widgetType: string;
  config: Record<string, unknown>;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardShare {
  id: string;
  dashboardId: string;
  shareToken: string;
  permissions: {
    read: boolean;
    write: boolean;
  };
  expiresAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export const tables = {
  dashboards: 'dashboards',
  dashboardWidgets: 'dashboard_widgets',
  dashboardShares: 'dashboard_shares',
} as const;
