import type { Context, Next } from 'hono';
import { runPostgresQuery } from './postgres.js';
import { getUser } from './auth-middleware.js';

export interface Permission {
  action: string; // e.g., 'data:read', 'users:manage', 'reports:create'
}

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

export interface RBACContext {
  user?: {
    id: number;
    email: string;
    name: string | null;
    email_verified: boolean;
    roles: UserRole[];
    permissions: string[];
  };
}

/**
 * Middleware that enriches the auth context with user roles and permissions
 */
export async function rbacMiddleware(c: Context, next: Next): Promise<void> {
  const user = getUser(c);

  if (!user) {
    return next();
  }

  try {
    // Fetch user roles with their permissions
    const userRoles = await runPostgresQuery<{
      id: number;
      user_id: number;
      role_id: number;
      role_name: string;
      role_permissions: string[];
      org_id: number | null;
      department_id: number | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT 
        ur.id, ur.user_id, ur.role_id, ur.org_id, ur.department_id, 
        ur.created_at, ur.updated_at,
        r.name as role_name,
        r.permissions as role_permissions
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
      ORDER BY ur.created_at DESC`,
      [user.id],
    );

    // Aggregate all permissions from all roles
    const allPermissions = new Set<string>();
    userRoles.forEach((role) => {
      role.role_permissions.forEach((permission) => allPermissions.add(permission));
    });

    // Update user context with roles and permissions
    c.set('user', {
      ...user,
      roles: userRoles,
      permissions: Array.from(allPermissions),
    });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    // Continue without roles if there's an error
  }

  return next();
}

/**
 * Middleware factory that requires specific permissions
 */
export function requirePermissions(requiredPermissions: string[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!user.permissions || !Array.isArray(user.permissions)) {
      return c.json({ error: 'User permissions not available' }, 403);
    }

    // Check if user has at least one of the required permissions
    const hasPermission = requiredPermissions.some((permission) =>
      user.permissions.includes(permission),
    );

    if (!hasPermission) {
      return c.json(
        {
          error: 'Insufficient permissions',
          required: requiredPermissions,
          userPermissions: user.permissions,
        },
        403,
      );
    }

    return next();
  };
}

/**
 * Middleware factory that requires all specified permissions
 */
export function requireAllPermissions(requiredPermissions: string[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!user.permissions || !Array.isArray(user.permissions)) {
      return c.json({ error: 'User permissions not available' }, 403);
    }

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every((permission) =>
      user.permissions.includes(permission),
    );

    if (!hasAllPermissions) {
      const missingPermissions = requiredPermissions.filter(
        (permission) => !user.permissions.includes(permission),
      );

      return c.json(
        {
          error: 'Insufficient permissions',
          required: requiredPermissions,
          missing: missingPermissions,
          userPermissions: user.permissions,
        },
        403,
      );
    }

    return next();
  };
}

/**
 * Middleware factory that requires specific roles
 */
export function requireRoles(requiredRoles: string[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!user.roles || !Array.isArray(user.roles)) {
      return c.json({ error: 'User roles not available' }, 403);
    }

    const userRoleNames = user.roles.map((role) => role.role_name);
    const hasRole = requiredRoles.some((role) => userRoleNames.includes(role));

    if (!hasRole) {
      return c.json(
        {
          error: 'Insufficient role',
          required: requiredRoles,
          userRoles: userRoleNames,
        },
        403,
      );
    }

    return next();
  };
}

/**
 * Middleware that requires org-level permissions
 */
export function requireOrgPermissions(orgId: number, requiredPermissions: string[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!user.roles || !Array.isArray(user.roles)) {
      return c.json({ error: 'User roles not available' }, 403);
    }

    // Check if user has roles in the specified org with required permissions
    const orgRoles = user.roles.filter((role) => role.org_id === orgId);
    const orgPermissions = new Set<string>();

    orgRoles.forEach((role) => {
      role.role_permissions.forEach((permission) => orgPermissions.add(permission));
    });

    const hasPermission = requiredPermissions.some((permission) => orgPermissions.has(permission));

    if (!hasPermission) {
      return c.json(
        {
          error: 'Insufficient org-level permissions',
          orgId,
          required: requiredPermissions,
          orgPermissions: Array.from(orgPermissions),
        },
        403,
      );
    }

    return next();
  };
}

/**
 * Utility function to check if user has permission
 */
export function hasPermission(user: RBACContext['user'], permission: string): boolean {
  if (!user || !user.permissions) {
    return false;
  }
  return user.permissions.includes(permission);
}

/**
 * Utility function to check if user has role
 */
export function hasRole(user: RBACContext['user'], roleName: string): boolean {
  if (!user || !user.roles) {
    return false;
  }
  return user.roles.some((role) => role.role_name === roleName);
}

/**
 * Utility function to get user permissions for a specific org
 */
export function getOrgPermissions(user: RBACContext['user'], orgId: number): string[] {
  if (!user || !user.roles) {
    return [];
  }

  const orgRoles = user.roles.filter((role) => role.org_id === orgId);
  const permissions = new Set<string>();

  orgRoles.forEach((role) => {
    role.role_permissions.forEach((permission) => permissions.add(permission));
  });

  return Array.from(permissions);
}

/**
 * Utility function to get user permissions for a specific department
 */
export function getDepartmentPermissions(
  user: RBACContext['user'],
  departmentId: number,
): string[] {
  if (!user || !user.roles) {
    return [];
  }

  const departmentRoles = user.roles.filter((role) => role.department_id === departmentId);
  const permissions = new Set<string>();

  departmentRoles.forEach((role) => {
    role.role_permissions.forEach((permission) => permissions.add(permission));
  });

  return Array.from(permissions);
}
