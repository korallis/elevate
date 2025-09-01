import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { EmbedTokenGenerator } from '@sme/embed-sdk/src/token-generator.js';
import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';
import { createBusinessSpan } from '../tracing/index.js';
import type { 
  EmbedTokenPayload,
  EmbedPermissions,
  TokenGenerationOptions,
  DashboardConfig 
} from '@sme/embed-sdk/src/types.js';

const app = new Hono();

// Initialize token generator with secret from environment
const EMBED_SECRET = process.env.EMBED_JWT_SECRET || process.env.JWT_SECRET || 'fallback-secret-key';
const tokenGenerator = new EmbedTokenGenerator(EMBED_SECRET);

// Validation schemas
const tokenRequestSchema = z.object({
  dashboardId: z.string().min(1, 'Dashboard ID is required'),
  user: z.object({
    id: z.string().min(1, 'User ID is required'),
    email: z.string().email().optional(),
    orgId: z.string().min(1, 'Organization ID is required'),
  }),
  permissions: z.object({
    view: z.boolean().default(true),
    export: z.boolean().default(false),
    filter: z.boolean().default(true),
    drilldown: z.boolean().default(false),
    refresh: z.boolean().default(false),
  }).optional(),
  expiresIn: z.number().min(60).max(86400).default(3600), // 1 minute to 24 hours
  customClaims: z.record(z.unknown()).optional(),
});

const dashboardPermissionsSchema = z.object({
  dashboardId: z.string().min(1),
  userId: z.string().min(1),
  orgId: z.string().min(1),
  permissions: z.object({
    view: z.boolean(),
    export: z.boolean(),
    filter: z.boolean(),
    drilldown: z.boolean(),
    refresh: z.boolean(),
  }),
});

/**
 * Generate embed token
 * POST /embed/token
 */
app.post('/token', zValidator('json', tokenRequestSchema), async (c) => {
  const { span, setError, end } = createBusinessSpan('embed.generate_token');
  
  try {
    const data = c.req.valid('json');
    
    // Set span attributes
    span.setAttributes({
      'embed.dashboard_id': data.dashboardId,
      'embed.user_id': data.user.id,
      'embed.org_id': data.user.orgId,
      'embed.expires_in': data.expiresIn,
    });

    // Verify dashboard exists and user has access
    const dashboard = await getDashboardById(data.dashboardId, data.user.orgId);
    if (!dashboard) {
      span.addEvent('dashboard_not_found');
      return c.json(
        { error: 'Dashboard not found or access denied', code: 'DASHBOARD_NOT_FOUND' },
        404
      );
    }

    // Check user permissions for this dashboard
    const hasAccess = await checkUserDashboardAccess(
      data.user.id, 
      data.dashboardId, 
      data.user.orgId
    );
    
    if (!hasAccess) {
      span.addEvent('access_denied');
      return c.json(
        { error: 'Insufficient permissions', code: 'INSUFFICIENT_PERMISSIONS' },
        403
      );
    }

    // Set default permissions based on user role
    const defaultPermissions: EmbedPermissions = {
      view: true,
      export: false,
      filter: true,
      drilldown: false,
      refresh: false,
    };

    const permissions = { ...defaultPermissions, ...data.permissions };

    // Generate token
    const tokenOptions: TokenGenerationOptions = {
      dashboardId: data.dashboardId,
      user: data.user,
      permissions,
      expiresIn: data.expiresIn,
      customClaims: data.customClaims,
    };

    const token = tokenGenerator.generateToken(tokenOptions);
    const expiresAt = new Date(Date.now() + data.expiresIn * 1000);

    // Log token generation
    await logEmbedActivity({
      action: 'token_generated',
      dashboardId: data.dashboardId,
      userId: data.user.id,
      orgId: data.user.orgId,
      permissions,
      expiresAt,
    });

    span.addEvent('token_generated_successfully');
    
    return c.json({
      token,
      expiresAt: expiresAt.toISOString(),
      dashboardId: data.dashboardId,
      permissions,
    });

  } catch (error) {
    setError(error as Error);
    logger.error({ error: (error as Error).message, event: 'embed_token_generation_failed' });
    
    return c.json(
      { error: 'Failed to generate embed token', code: 'TOKEN_GENERATION_ERROR' },
      500
    );
  } finally {
    end();
  }
});

/**
 * Validate embed token
 * GET /embed/validate
 */
app.get('/validate', async (c) => {
  const { span, setError, end } = createBusinessSpan('embed.validate_token');
  
  try {
    const authHeader = c.req.header('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      span.addEvent('missing_authorization_header');
      return c.json(
        { valid: false, error: 'Missing or invalid authorization header' },
        401
      );
    }

    const token = authHeader.slice(7);
    
    // Verify and decode token
    const payload = tokenGenerator.verifyToken(token);
    
    span.setAttributes({
      'embed.dashboard_id': payload.dashboardId,
      'embed.user_id': payload.userId,
      'embed.org_id': payload.orgId,
    });

    // Additional validation: check if dashboard still exists
    const dashboard = await getDashboardById(payload.dashboardId, payload.orgId);
    if (!dashboard) {
      span.addEvent('dashboard_no_longer_exists');
      return c.json({
        valid: false,
        error: 'Dashboard no longer exists or has been moved',
      });
    }

    // Log token validation
    await logEmbedActivity({
      action: 'token_validated',
      dashboardId: payload.dashboardId,
      userId: payload.userId,
      orgId: payload.orgId,
      permissions: payload.permissions,
    });

    span.addEvent('token_validated_successfully');
    
    return c.json({
      valid: true,
      payload: {
        dashboardId: payload.dashboardId,
        userId: payload.userId,
        userEmail: payload.userEmail,
        orgId: payload.orgId,
        permissions: payload.permissions,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      },
    });

  } catch (error) {
    setError(error as Error);
    
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        span.addEvent('token_expired');
        return c.json({
          valid: false,
          error: 'Token has expired',
          code: 'EXPIRED_TOKEN',
        });
      }
      
      if (error.message.includes('Invalid token')) {
        span.addEvent('token_invalid');
        return c.json({
          valid: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
      }
    }

    logger.error({ error: (error as Error).message, event: 'embed_token_validation_failed' });
    
    return c.json({
      valid: false,
      error: 'Token validation failed',
      code: 'VALIDATION_ERROR',
    }, 500);
  } finally {
    end();
  }
});

/**
 * Get embedded dashboard
 * GET /embed/dashboard/:id
 */
app.get('/dashboard/:id', async (c) => {
  const { span, setError, end } = createBusinessSpan('embed.get_dashboard');
  
  try {
    const dashboardId = c.req.param('id');
    const authHeader = c.req.header('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const token = authHeader.slice(7);
    const payload = tokenGenerator.verifyToken(token);

    // Verify token is for this dashboard
    if (payload.dashboardId !== dashboardId) {
      span.addEvent('dashboard_id_mismatch');
      return c.json({ error: 'Token not valid for this dashboard' }, 403);
    }

    span.setAttributes({
      'embed.dashboard_id': dashboardId,
      'embed.user_id': payload.userId,
      'embed.org_id': payload.orgId,
    });

    // Get dashboard configuration
    const dashboard = await getDashboardById(dashboardId, payload.orgId);
    if (!dashboard) {
      return c.json({ error: 'Dashboard not found' }, 404);
    }

    // Apply permission filtering to dashboard config
    const filteredDashboard = filterDashboardByPermissions(dashboard, payload.permissions);

    // Log dashboard access
    await logEmbedActivity({
      action: 'dashboard_accessed',
      dashboardId,
      userId: payload.userId,
      orgId: payload.orgId,
      permissions: payload.permissions,
    });

    span.addEvent('dashboard_retrieved_successfully');

    // Get query parameters for appearance customization
    const showTitle = c.req.query('showTitle') === 'true';
    const showToolbar = c.req.query('showToolbar') === 'true';
    const showFilters = c.req.query('showFilters') === 'true';
    const themeParam = c.req.query('theme');
    
    let theme;
    if (themeParam) {
      try {
        theme = JSON.parse(themeParam);
      } catch {
        // Invalid theme JSON, ignore
      }
    }

    return c.json({
      dashboard: filteredDashboard,
      permissions: payload.permissions,
      user: {
        id: payload.userId,
        email: payload.userEmail,
        orgId: payload.orgId,
      },
      appearance: {
        showTitle,
        showToolbar,
        showFilters,
        theme,
      },
    });

  } catch (error) {
    setError(error as Error);
    logger.error({ error: (error as Error).message, event: 'embed_dashboard_access_failed' });
    
    if (error instanceof Error && error.message.includes('expired')) {
      return c.json({ error: 'Token has expired' }, 401);
    }
    
    if (error instanceof Error && error.message.includes('Invalid token')) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    return c.json({ error: 'Failed to get dashboard' }, 500);
  } finally {
    end();
  }
});

/**
 * Update embed permissions
 * PUT /embed/permissions
 */
app.put('/permissions', zValidator('json', dashboardPermissionsSchema), async (c) => {
  const { span, setError, end } = createBusinessSpan('embed.update_permissions');
  
  try {
    const data = c.req.valid('json');
    
    span.setAttributes({
      'embed.dashboard_id': data.dashboardId,
      'embed.user_id': data.userId,
      'embed.org_id': data.orgId,
    });

    // Verify admin access (this would depend on your auth middleware)
    // For now, we'll assume the request is authenticated
    
    // Update permissions in database
    await updateEmbedPermissions(
      data.dashboardId,
      data.userId,
      data.orgId,
      data.permissions
    );

    // Log permission update
    await logEmbedActivity({
      action: 'permissions_updated',
      dashboardId: data.dashboardId,
      userId: data.userId,
      orgId: data.orgId,
      permissions: data.permissions,
    });

    span.addEvent('permissions_updated_successfully');
    
    return c.json({ success: true, permissions: data.permissions });

  } catch (error) {
    setError(error as Error);
    logger.error({ error: (error as Error).message, event: 'embed_permissions_update_failed' });
    
    return c.json({ error: 'Failed to update permissions' }, 500);
  } finally {
    end();
  }
});

/**
 * Get embed analytics
 * GET /embed/analytics
 */
app.get('/analytics', async (c) => {
  const { span, setError, end } = createBusinessSpan('embed.get_analytics');
  
  try {
    const orgId = c.req.query('orgId');
    const dashboardId = c.req.query('dashboardId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    if (!orgId) {
      return c.json({ error: 'Organization ID is required' }, 400);
    }

    span.setAttributes({
      'embed.org_id': orgId,
      ...(dashboardId && { 'embed.dashboard_id': dashboardId }),
    });

    // Get embed usage analytics
    const analytics = await getEmbedAnalytics({
      orgId,
      dashboardId: dashboardId || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    span.addEvent('analytics_retrieved_successfully');
    
    return c.json(analytics);

  } catch (error) {
    setError(error as Error);
    logger.error({ error: (error as Error).message, event: 'embed_analytics_failed' });
    
    return c.json({ error: 'Failed to get embed analytics' }, 500);
  } finally {
    end();
  }
});

// Helper functions

async function getDashboardById(dashboardId: string, orgId: string): Promise<DashboardConfig | null> {
  try {
    // This would fetch from your dashboards table
    const rows = await runPostgresQuery(
      'SELECT * FROM dashboards WHERE id = $1 AND org_id = $2',
      [dashboardId, orgId]
    );
    
    if (rows.length === 0) {
      return null;
    }

    const dashboard = rows[0];
    
    // Convert database row to DashboardConfig
    return {
      id: dashboard.id,
      title: dashboard.title,
      description: dashboard.description,
      widgets: JSON.parse(dashboard.widgets || '[]'),
      filters: JSON.parse(dashboard.filters || '[]'),
      theme: JSON.parse(dashboard.theme || '{}'),
    };
  } catch (error) {
    logger.error({ error: (error as Error).message, dashboardId, orgId });
    return null;
  }
}

async function checkUserDashboardAccess(userId: string, dashboardId: string, orgId: string): Promise<boolean> {
  try {
    // This would check user permissions for the dashboard
    const rows = await runPostgresQuery(
      `SELECT 1 FROM dashboard_permissions dp
       JOIN dashboards d ON d.id = dp.dashboard_id
       WHERE dp.user_id = $1 AND dp.dashboard_id = $2 AND d.org_id = $3 AND dp.can_view = true`,
      [userId, dashboardId, orgId]
    );
    
    return rows.length > 0;
  } catch (error) {
    logger.error({ error: (error as Error).message, userId, dashboardId, orgId });
    return false;
  }
}

function filterDashboardByPermissions(dashboard: DashboardConfig, permissions: EmbedPermissions): DashboardConfig {
  const filtered = { ...dashboard };
  
  // Remove widgets that require permissions user doesn't have
  filtered.widgets = dashboard.widgets.filter(widget => {
    if (widget.type === 'filter' && !permissions.filter) {
      return false;
    }
    return true;
  });
  
  // Remove filters if user can't use them
  if (!permissions.filter) {
    filtered.filters = [];
  }
  
  return filtered;
}

async function updateEmbedPermissions(
  dashboardId: string, 
  userId: string, 
  orgId: string, 
  permissions: EmbedPermissions
): Promise<void> {
  await runPostgresQuery(
    `INSERT INTO embed_permissions (dashboard_id, user_id, org_id, permissions, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (dashboard_id, user_id, org_id) 
     DO UPDATE SET permissions = $4, updated_at = NOW()`,
    [dashboardId, userId, orgId, JSON.stringify(permissions)]
  );
}

async function logEmbedActivity(activity: {
  action: string;
  dashboardId: string;
  userId: string;
  orgId: string;
  permissions: EmbedPermissions;
  expiresAt?: Date;
}): Promise<void> {
  try {
    await runPostgresQuery(
      'INSERT INTO embed_activity_logs (action, dashboard_id, user_id, org_id, permissions, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [
        activity.action,
        activity.dashboardId,
        activity.userId,
        activity.orgId,
        JSON.stringify(activity.permissions),
        activity.expiresAt || null,
      ]
    );
  } catch (error) {
    logger.warn({ error: (error as Error).message, event: 'embed_activity_log_failed' });
  }
}

async function getEmbedAnalytics(options: {
  orgId: string;
  dashboardId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<{
  totalTokensGenerated: number;
  totalDashboardViews: number;
  uniqueUsers: number;
  popularDashboards: Array<{ dashboardId: string; views: number; title: string }>;
  timeSeriesData: Array<{ date: string; tokens: number; views: number }>;
}> {
  const { orgId, dashboardId, startDate, endDate } = options;
  
  const baseCondition = 'org_id = $1';
  const params: unknown[] = [orgId];
  let paramIndex = 2;
  
  let dashboardCondition = '';
  if (dashboardId) {
    dashboardCondition = ` AND dashboard_id = $${paramIndex}`;
    params.push(dashboardId);
    paramIndex++;
  }
  
  let dateCondition = '';
  if (startDate) {
    dateCondition += ` AND created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  if (endDate) {
    dateCondition += ` AND created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  const fullCondition = `${baseCondition}${dashboardCondition}${dateCondition}`;
  
  // Get total tokens generated
  const [totalTokensResult] = await runPostgresQuery(
    `SELECT COUNT(*) as count FROM embed_activity_logs WHERE action = 'token_generated' AND ${fullCondition}`,
    params
  );
  
  // Get total dashboard views
  const [totalViewsResult] = await runPostgresQuery(
    `SELECT COUNT(*) as count FROM embed_activity_logs WHERE action = 'dashboard_accessed' AND ${fullCondition}`,
    params
  );
  
  // Get unique users
  const [uniqueUsersResult] = await runPostgresQuery(
    `SELECT COUNT(DISTINCT user_id) as count FROM embed_activity_logs WHERE ${fullCondition}`,
    params
  );
  
  // Get popular dashboards
  const popularDashboards = await runPostgresQuery(
    `SELECT 
       e.dashboard_id, 
       COUNT(*) as views,
       COALESCE(d.title, 'Unknown Dashboard') as title
     FROM embed_activity_logs e
     LEFT JOIN dashboards d ON d.id = e.dashboard_id
     WHERE e.action = 'dashboard_accessed' AND ${fullCondition}
     GROUP BY e.dashboard_id, d.title
     ORDER BY views DESC
     LIMIT 10`,
    params
  );
  
  // Get time series data (daily aggregation)
  const timeSeriesData = await runPostgresQuery(
    `SELECT 
       DATE(created_at) as date,
       COUNT(*) FILTER (WHERE action = 'token_generated') as tokens,
       COUNT(*) FILTER (WHERE action = 'dashboard_accessed') as views
     FROM embed_activity_logs 
     WHERE ${fullCondition}
     GROUP BY DATE(created_at)
     ORDER BY date DESC
     LIMIT 30`,
    params
  );
  
  return {
    totalTokensGenerated: parseInt(totalTokensResult.count),
    totalDashboardViews: parseInt(totalViewsResult.count),
    uniqueUsers: parseInt(uniqueUsersResult.count),
    popularDashboards: popularDashboards.map(row => ({
      dashboardId: row.dashboard_id,
      views: parseInt(row.views),
      title: row.title,
    })),
    timeSeriesData: timeSeriesData.map(row => ({
      date: row.date,
      tokens: parseInt(row.tokens || 0),
      views: parseInt(row.views || 0),
    })),
  };
}

export default app;