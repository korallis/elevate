import { Hono } from 'hono';
import { runPostgresQuery } from '../postgres.js';
import { requireAuth, getUser } from '../auth-middleware.js';
import {
  rbacMiddleware,
  requirePermissions,
  type Role,
  type UserRole,
  type RBACContext,
} from '../rbac-middleware.js';

const app = new Hono();

// Apply auth and RBAC middleware to all routes
app.use('*', requireAuth);
app.use('*', rbacMiddleware);

/**
 * GET /rbac/roles - List all available roles
 */
app.get('/roles', requirePermissions(['roles:manage', 'system:admin']), async (c) => {
  try {
    const roles = await runPostgresQuery<Role>(
      `SELECT id, name, description, permissions, created_at, updated_at 
       FROM roles 
       ORDER BY name`,
    );

    return c.json({ roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    return c.json({ error: 'Failed to fetch roles' }, 500);
  }
});

/**
 * POST /rbac/roles - Create a new role (system admins only)
 */
app.post('/roles', requirePermissions(['system:admin']), async (c) => {
  try {
    const { name, description, permissions } = await c.req.json();

    if (!name || !Array.isArray(permissions)) {
      return c.json({ error: 'Name and permissions array are required' }, 400);
    }

    const [role] = await runPostgresQuery<Role>(
      `INSERT INTO roles (name, description, permissions) 
       VALUES ($1, $2, $3) 
       RETURNING id, name, description, permissions, created_at, updated_at`,
      [name, description || null, JSON.stringify(permissions)],
    );

    return c.json({ role }, 201);
  } catch (error) {
    console.error('Error creating role:', error);
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return c.json({ error: 'Role name already exists' }, 409);
    }
    return c.json({ error: 'Failed to create role' }, 500);
  }
});

/**
 * PUT /rbac/roles/:id - Update an existing role
 */
app.put('/roles/:id', requirePermissions(['system:admin']), async (c) => {
  try {
    const roleId = parseInt(c.req.param('id'));
    const { name, description, permissions } = await c.req.json();

    if (!name || !Array.isArray(permissions)) {
      return c.json({ error: 'Name and permissions array are required' }, 400);
    }

    const [role] = await runPostgresQuery<Role>(
      `UPDATE roles 
       SET name = $1, description = $2, permissions = $3, updated_at = now() 
       WHERE id = $4 
       RETURNING id, name, description, permissions, created_at, updated_at`,
      [name, description || null, JSON.stringify(permissions), roleId],
    );

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    return c.json({ role });
  } catch (error) {
    console.error('Error updating role:', error);
    return c.json({ error: 'Failed to update role' }, 500);
  }
});

/**
 * DELETE /rbac/roles/:id - Delete a role
 */
app.delete('/roles/:id', requirePermissions(['system:admin']), async (c) => {
  try {
    const roleId = parseInt(c.req.param('id'));

    // Check if role is in use
    const [usage] = await runPostgresQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_roles WHERE role_id = $1',
      [roleId],
    );

    if (usage.count > 0) {
      return c.json(
        {
          error: 'Cannot delete role that is assigned to users',
          usageCount: usage.count,
        },
        400,
      );
    }

    await runPostgresQuery('DELETE FROM roles WHERE id = $1', [roleId]);

    return c.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    return c.json({ error: 'Failed to delete role' }, 500);
  }
});

/**
 * GET /rbac/user-roles/:userId - Get roles for a specific user
 */
app.get('/user-roles/:userId', requirePermissions(['users:manage', 'system:admin']), async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    const currentUser = getUser(c) as RBACContext['user'];

    // Users can view their own roles, or admins can view any user's roles
    if (
      !currentUser ||
      (currentUser.id !== userId && !hasPermission(currentUser, 'users:manage'))
    ) {
      return c.json({ error: 'Insufficient permissions to view user roles' }, 403);
    }

    const userRoles = await runPostgresQuery<UserRole>(
      `SELECT 
        ur.id, ur.user_id, ur.role_id, ur.org_id, ur.department_id, 
        ur.created_at, ur.updated_at,
        r.name as role_name,
        r.permissions as role_permissions,
        o.name as org_name,
        d.name as department_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN orgs o ON ur.org_id = o.id
      LEFT JOIN departments d ON ur.department_id = d.id
      WHERE ur.user_id = $1
      ORDER BY ur.created_at DESC`,
      [userId],
    );

    return c.json({ userRoles });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return c.json({ error: 'Failed to fetch user roles' }, 500);
  }
});

/**
 * POST /rbac/assign-role - Assign a role to a user
 */
app.post('/assign-role', requirePermissions(['users:manage', 'roles:assign']), async (c) => {
  try {
    const { userId, roleId, orgId, departmentId } = await c.req.json();

    if (!userId || !roleId) {
      return c.json({ error: 'userId and roleId are required' }, 400);
    }

    // Check if role exists
    const [role] = await runPostgresQuery<Role>('SELECT id, name FROM roles WHERE id = $1', [
      roleId,
    ]);

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    // Check if user exists
    const [user] = await runPostgresQuery<{ id: number; email: string }>(
      'SELECT id, email FROM users WHERE id = $1',
      [userId],
    );

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Insert the role assignment
    const [userRole] = await runPostgresQuery<UserRole>(
      `INSERT INTO user_roles (user_id, role_id, org_id, department_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, user_id, role_id, org_id, department_id, created_at, updated_at`,
      [userId, roleId, orgId || null, departmentId || null],
    );

    // Add role name to response
    const enrichedUserRole = {
      ...userRole,
      role_name: role.name,
      role_permissions: [],
    };

    return c.json({ userRole: enrichedUserRole }, 201);
  } catch (error) {
    console.error('Error assigning role:', error);
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return c.json({ error: 'User already has this role in the specified scope' }, 409);
    }
    return c.json({ error: 'Failed to assign role' }, 500);
  }
});

/**
 * DELETE /rbac/revoke-role - Revoke a role from a user
 */
app.delete('/revoke-role', requirePermissions(['users:manage', 'roles:assign']), async (c) => {
  try {
    const { userRoleId } = await c.req.json();

    if (!userRoleId) {
      return c.json({ error: 'userRoleId is required' }, 400);
    }

    const result = await runPostgresQuery('DELETE FROM user_roles WHERE id = $1 RETURNING id', [
      userRoleId,
    ]);

    if (result.length === 0) {
      return c.json({ error: 'User role assignment not found' }, 404);
    }

    return c.json({ message: 'Role revoked successfully' });
  } catch (error) {
    console.error('Error revoking role:', error);
    return c.json({ error: 'Failed to revoke role' }, 500);
  }
});

/**
 * GET /rbac/permissions - Get current user's permissions
 */
app.get('/permissions', async (c) => {
  try {
    const user = getUser(c) as RBACContext['user'];

    if (!user) {
      return c.json({ error: 'User not authenticated' }, 401);
    }

    return c.json({
      userId: user.id,
      email: user.email,
      roles: user.roles || [],
      permissions: user.permissions || [],
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return c.json({ error: 'Failed to fetch permissions' }, 500);
  }
});

/**
 * POST /rbac/check-permission - Check if current user has specific permission
 */
app.post('/check-permission', async (c) => {
  try {
    const { permission, orgId, departmentId } = await c.req.json();
    const user = getUser(c) as RBACContext['user'];

    if (!user) {
      return c.json({ error: 'User not authenticated' }, 401);
    }

    if (!permission) {
      return c.json({ error: 'Permission is required' }, 400);
    }

    let hasAccess = false;

    if (orgId || departmentId) {
      // Check scoped permissions
      const scopedRoles =
        user.roles?.filter((role) => {
          if (orgId && departmentId) {
            return role.org_id === orgId && role.department_id === departmentId;
          } else if (orgId) {
            return role.org_id === orgId;
          } else if (departmentId) {
            return role.department_id === departmentId;
          }
          return false;
        }) || [];

      hasAccess = scopedRoles.some((role) => role.role_permissions.includes(permission));
    } else {
      // Check global permissions
      hasAccess = hasPermission(user, permission);
    }

    return c.json({
      permission,
      hasAccess,
      orgId,
      departmentId,
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    return c.json({ error: 'Failed to check permission' }, 500);
  }
});

/**
 * GET /rbac/users/:userId/effective-permissions - Get effective permissions for a user in specific context
 */
app.get(
  '/users/:userId/effective-permissions',
  requirePermissions(['users:manage', 'system:admin']),
  async (c) => {
    try {
      const userId = parseInt(c.req.param('userId'));
      const orgId = c.req.query('orgId') ? parseInt(c.req.query('orgId')!) : undefined;
      const departmentId = c.req.query('departmentId')
        ? parseInt(c.req.query('departmentId')!)
        : undefined;

      const userRoles = await runPostgresQuery<UserRole>(
        `SELECT 
        ur.id, ur.user_id, ur.role_id, ur.org_id, ur.department_id, 
        ur.created_at, ur.updated_at,
        r.name as role_name,
        r.permissions as role_permissions
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
      ${orgId ? 'AND (ur.org_id = $2 OR ur.org_id IS NULL)' : ''}
      ${departmentId ? 'AND (ur.department_id = $3 OR ur.department_id IS NULL)' : ''}
      ORDER BY ur.created_at DESC`,
        [userId, orgId, departmentId].filter(Boolean),
      );

      // Calculate effective permissions
      const effectivePermissions = new Set<string>();
      const applicableRoles: UserRole[] = [];

      userRoles.forEach((role) => {
        // Global roles (no org/department) apply everywhere
        if (!role.org_id && !role.department_id) {
          applicableRoles.push(role);
          role.role_permissions.forEach((permission) => effectivePermissions.add(permission));
          return;
        }

        // Org-specific roles
        if (orgId && role.org_id === orgId && !role.department_id) {
          applicableRoles.push(role);
          role.role_permissions.forEach((permission) => effectivePermissions.add(permission));
          return;
        }

        // Department-specific roles
        if (departmentId && role.department_id === departmentId) {
          applicableRoles.push(role);
          role.role_permissions.forEach((permission) => effectivePermissions.add(permission));
          return;
        }
      });

      return c.json({
        userId,
        orgId,
        departmentId,
        applicableRoles,
        effectivePermissions: Array.from(effectivePermissions).sort(),
      });
    } catch (error) {
      console.error('Error fetching effective permissions:', error);
      return c.json({ error: 'Failed to fetch effective permissions' }, 500);
    }
  },
);

export default app;
