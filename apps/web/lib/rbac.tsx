'use client';

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';

// Types matching the API
export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  created_at: Date;
  updated_at: Date;
}

export interface UserRole {
  id: number;
  user_id: number;
  role_id: number;
  role_name: string;
  role_permissions: string[];
  org_id: number | null;
  department_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  email_verified: boolean;
  roles: UserRole[];
  permissions: string[];
}

export interface RBACContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  hasPermission: (permission: string) => boolean;
  hasRole: (roleName: string) => boolean;
  hasOrgPermission: (orgId: number, permission: string) => boolean;
  hasDepartmentPermission: (departmentId: number, permission: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const RBACContext = createContext<RBACContextType | undefined>(undefined);

export function RBACProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

  const fetchUserPermissions = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('accessToken');
      if (!token) {
        setUser(null);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/rbac/permissions`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('accessToken');
          setUser(null);
          return;
        }
        throw new Error(`Failed to fetch permissions: ${response.statusText}`);
      }

      const data = await response.json();
      setUser({
        id: data.userId,
        email: data.email,
        name: data.name || null,
        email_verified: data.email_verified || false,
        roles: data.roles || [],
        permissions: data.permissions || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchUserPermissions();
  }, [fetchUserPermissions]);

  const hasPermission = (permission: string): boolean => {
    return user?.permissions?.includes(permission) || false;
  };

  const hasRole = (roleName: string): boolean => {
    return user?.roles?.some((role) => role.role_name === roleName) || false;
  };

  const hasOrgPermission = (orgId: number, permission: string): boolean => {
    if (!user?.roles) return false;

    const orgRoles = user.roles.filter((role) => role.org_id === orgId);
    return orgRoles.some((role) => role.role_permissions.includes(permission));
  };

  const hasDepartmentPermission = (departmentId: number, permission: string): boolean => {
    if (!user?.roles) return false;

    const departmentRoles = user.roles.filter((role) => role.department_id === departmentId);
    return departmentRoles.some((role) => role.role_permissions.includes(permission));
  };

  const refreshPermissions = async (): Promise<void> => {
    await fetchUserPermissions();
  };

  return (
    <RBACContext.Provider
      value={{
        user,
        loading,
        error,
        hasPermission,
        hasRole,
        hasOrgPermission,
        hasDepartmentPermission,
        refreshPermissions,
      }}
    >
      {children}
    </RBACContext.Provider>
  );
}

export function useRBAC(): RBACContextType {
  const context = useContext(RBACContext);
  if (context === undefined) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return context;
}

// Convenience hook for permissions
export function usePermissions() {
  const { user, hasPermission, hasRole, hasOrgPermission, hasDepartmentPermission } = useRBAC();

  return {
    permissions: user?.permissions || [],
    roles: user?.roles || [],
    hasPermission,
    hasRole,
    hasOrgPermission,
    hasDepartmentPermission,

    // Common permission checks
    canManageUsers: hasPermission('users:manage'),
    canManageRoles: hasPermission('roles:manage'),
    canReadData: hasPermission('data:read'),
    canWriteData: hasPermission('data:write'),
    canDeleteData: hasPermission('data:delete'),
    canManageGovernance: hasPermission('governance:manage'),
    canCreateReports: hasPermission('reports:create'),
    canManageReports: hasPermission('reports:manage'),
    canCreateExports: hasPermission('exports:create'),
    canManageExports: hasPermission('exports:manage'),
    isOwner: hasRole('Owner'),
    isAdmin: hasRole('Admin'),
    isEditor: hasRole('Editor'),
    isViewer: hasRole('Viewer'),
  };
}

// Component that conditionally renders children based on permissions
interface RequirePermissionProps {
  permission?: string;
  role?: string;
  orgId?: number;
  departmentId?: number;
  fallback?: ReactNode;
  children: ReactNode;
}

export function RequirePermission({
  permission,
  role,
  orgId,
  departmentId,
  fallback = null,
  children,
}: RequirePermissionProps) {
  const { hasPermission, hasRole, hasOrgPermission, hasDepartmentPermission } = useRBAC();

  let hasAccess = false;

  if (permission) {
    if (orgId) {
      hasAccess = hasOrgPermission(orgId, permission);
    } else if (departmentId) {
      hasAccess = hasDepartmentPermission(departmentId, permission);
    } else {
      hasAccess = hasPermission(permission);
    }
  } else if (role) {
    hasAccess = hasRole(role);
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Component that conditionally renders children based on multiple permissions (OR logic)
interface RequireAnyPermissionProps {
  permissions: string[];
  orgId?: number;
  departmentId?: number;
  fallback?: ReactNode;
  children: ReactNode;
}

export function RequireAnyPermission({
  permissions,
  orgId,
  departmentId,
  fallback = null,
  children,
}: RequireAnyPermissionProps) {
  const { hasPermission, hasOrgPermission, hasDepartmentPermission } = useRBAC();

  const hasAccess = permissions.some((permission) => {
    if (orgId) {
      return hasOrgPermission(orgId, permission);
    } else if (departmentId) {
      return hasDepartmentPermission(departmentId, permission);
    } else {
      return hasPermission(permission);
    }
  });

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Component that conditionally renders children based on multiple permissions (AND logic)
interface RequireAllPermissionsProps {
  permissions: string[];
  orgId?: number;
  departmentId?: number;
  fallback?: ReactNode;
  children: ReactNode;
}

export function RequireAllPermissions({
  permissions,
  orgId,
  departmentId,
  fallback = null,
  children,
}: RequireAllPermissionsProps) {
  const { hasPermission, hasOrgPermission, hasDepartmentPermission } = useRBAC();

  const hasAccess = permissions.every((permission) => {
    if (orgId) {
      return hasOrgPermission(orgId, permission);
    } else if (departmentId) {
      return hasDepartmentPermission(departmentId, permission);
    } else {
      return hasPermission(permission);
    }
  });

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// API functions for RBAC management
export class RBACApi {
  private apiBaseUrl: string;

  constructor(apiBaseUrl?: string) {
    this.apiBaseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
  }

  private async fetch(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      throw new Error('No access token available');
    }

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getRoles(): Promise<Role[]> {
    const data = await this.fetch('/rbac/roles');
    return data.roles;
  }

  async createRole(role: {
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<Role> {
    const data = await this.fetch('/rbac/roles', {
      method: 'POST',
      body: JSON.stringify(role),
    });
    return data.role;
  }

  async updateRole(
    id: number,
    role: { name: string; description?: string; permissions: string[] },
  ): Promise<Role> {
    const data = await this.fetch(`/rbac/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(role),
    });
    return data.role;
  }

  async deleteRole(id: number): Promise<void> {
    await this.fetch(`/rbac/roles/${id}`, {
      method: 'DELETE',
    });
  }

  async getUserRoles(userId: number): Promise<UserRole[]> {
    const data = await this.fetch(`/rbac/user-roles/${userId}`);
    return data.userRoles;
  }

  async assignRole(assignment: {
    userId: number;
    roleId: number;
    orgId?: number;
    departmentId?: number;
  }): Promise<UserRole> {
    const data = await this.fetch('/rbac/assign-role', {
      method: 'POST',
      body: JSON.stringify(assignment),
    });
    return data.userRole;
  }

  async revokeRole(userRoleId: number): Promise<void> {
    await this.fetch('/rbac/revoke-role', {
      method: 'DELETE',
      body: JSON.stringify({ userRoleId }),
    });
  }

  async checkPermission(
    permission: string,
    orgId?: number,
    departmentId?: number,
  ): Promise<{
    permission: string;
    hasAccess: boolean;
    orgId?: number;
    departmentId?: number;
  }> {
    return await this.fetch('/rbac/check-permission', {
      method: 'POST',
      body: JSON.stringify({ permission, orgId, departmentId }),
    });
  }

  async getEffectivePermissions(
    userId: number,
    orgId?: number,
    departmentId?: number,
  ): Promise<{
    userId: number;
    orgId?: number;
    departmentId?: number;
    applicableRoles: UserRole[];
    effectivePermissions: string[];
  }> {
    const params = new URLSearchParams();
    if (orgId) params.set('orgId', orgId.toString());
    if (departmentId) params.set('departmentId', departmentId.toString());

    return await this.fetch(`/rbac/users/${userId}/effective-permissions?${params}`);
  }
}

// Singleton instance for convenience
export const rbacApi = new RBACApi();

// Hook for using the RBAC API
export function useRBACApi() {
  return rbacApi;
}
