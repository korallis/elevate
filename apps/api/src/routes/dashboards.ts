import { Hono } from 'hono';
import { hasPgConfig, runPostgresQuery } from '../postgres.js';
import { useBudget, getActorKey } from '../budget.js';
import type { Dashboard, DashboardWidget, DashboardShare } from '@sme/db/schema';

const dashboardRoutes = new Hono();

// List all dashboards for a user
dashboardRoutes.get('/', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  
  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const actor = getActorKey(c.req.raw.headers);
  const limit = Math.min(100, parseInt(c.req.query('limit') || '50'));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0'));

  try {
    const dashboards = await runPostgresQuery(
      'SELECT id, name, description, theme, is_public, created_by, created_at, updated_at FROM dashboards WHERE created_by = $1 OR is_public = true ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
      [actor, limit, offset]
    );

    return c.json({ dashboards, limit, offset });
  } catch (error) {
    return c.json({ error: 'failed_to_fetch_dashboards', details: String(error) }, 500);
  }
});

// Get a specific dashboard
dashboardRoutes.get('/:id', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const { id } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);

  try {
    const [dashboard] = await runPostgresQuery(
      'SELECT * FROM dashboards WHERE id = $1 AND (created_by = $2 OR is_public = true)',
      [id, actor]
    );

    if (!dashboard) {
      return c.json({ error: 'dashboard_not_found' }, 404);
    }

    return c.json(dashboard);
  } catch (error) {
    return c.json({ error: 'failed_to_fetch_dashboard', details: String(error) }, 500);
  }
});

// Create a new dashboard
dashboardRoutes.post('/', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const actor = getActorKey(c.req.raw.headers);
  const { name, description, layout = {}, theme = {}, filters = [], isPublic = false } = await c.req.json();

  if (!name) {
    return c.json({ error: 'name_required' }, 400);
  }

  try {
    const [dashboard] = await runPostgresQuery(
      'INSERT INTO dashboards(name, description, layout, theme, filters, is_public, created_by) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, description || null, JSON.stringify(layout), JSON.stringify(theme), JSON.stringify(filters), !!isPublic, actor]
    );

    return c.json(dashboard, 201);
  } catch (error) {
    return c.json({ error: 'failed_to_create_dashboard', details: String(error) }, 500);
  }
});

// Update a dashboard
dashboardRoutes.put('/:id', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const { id } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);
  const { name, description, layout, theme, filters, isPublic } = await c.req.json();

  try {
    // Check if dashboard exists and user has permission
    const [existing] = await runPostgresQuery(
      'SELECT id FROM dashboards WHERE id = $1 AND created_by = $2',
      [id, actor]
    );

    if (!existing) {
      return c.json({ error: 'dashboard_not_found_or_no_permission' }, 404);
    }

    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(description);
    }
    if (layout !== undefined) {
      updateFields.push(`layout = $${paramIndex++}`);
      updateValues.push(JSON.stringify(layout));
    }
    if (theme !== undefined) {
      updateFields.push(`theme = $${paramIndex++}`);
      updateValues.push(JSON.stringify(theme));
    }
    if (filters !== undefined) {
      updateFields.push(`filters = $${paramIndex++}`);
      updateValues.push(JSON.stringify(filters));
    }
    if (isPublic !== undefined) {
      updateFields.push(`is_public = $${paramIndex++}`);
      updateValues.push(!!isPublic);
    }

    if (updateFields.length === 0) {
      return c.json({ error: 'no_fields_to_update' }, 400);
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    const [updated] = await runPostgresQuery(
      `UPDATE dashboards SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'failed_to_update_dashboard', details: String(error) }, 500);
  }
});

// Delete a dashboard
dashboardRoutes.delete('/:id', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const { id } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);

  try {
    const result = await runPostgresQuery(
      'DELETE FROM dashboards WHERE id = $1 AND created_by = $2',
      [id, actor]
    );

    if (result.length === 0) {
      return c.json({ error: 'dashboard_not_found_or_no_permission' }, 404);
    }

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: 'failed_to_delete_dashboard', details: String(error) }, 500);
  }
});

// Get widgets for a dashboard
dashboardRoutes.get('/:id/widgets', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const { id } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);

  try {
    // Check if dashboard exists and user has access
    const [dashboard] = await runPostgresQuery(
      'SELECT id FROM dashboards WHERE id = $1 AND (created_by = $2 OR is_public = true)',
      [id, actor]
    );

    if (!dashboard) {
      return c.json({ error: 'dashboard_not_found' }, 404);
    }

    const widgets = await runPostgresQuery(
      'SELECT * FROM dashboard_widgets WHERE dashboard_id = $1 ORDER BY created_at',
      [id]
    );

    return c.json(widgets);
  } catch (error) {
    return c.json({ error: 'failed_to_fetch_widgets', details: String(error) }, 500);
  }
});

// Add a widget to dashboard
dashboardRoutes.post('/:id/widgets', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const { id } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);
  const { widgetType, config = {}, position = { x: 0, y: 0, w: 4, h: 4 } } = await c.req.json();

  if (!widgetType) {
    return c.json({ error: 'widget_type_required' }, 400);
  }

  try {
    // Check if dashboard exists and user has permission
    const [dashboard] = await runPostgresQuery(
      'SELECT id FROM dashboards WHERE id = $1 AND created_by = $2',
      [id, actor]
    );

    if (!dashboard) {
      return c.json({ error: 'dashboard_not_found_or_no_permission' }, 404);
    }

    const [widget] = await runPostgresQuery(
      'INSERT INTO dashboard_widgets(dashboard_id, widget_type, config, position) VALUES($1, $2, $3, $4) RETURNING *',
      [id, widgetType, JSON.stringify(config), JSON.stringify(position)]
    );

    return c.json(widget, 201);
  } catch (error) {
    return c.json({ error: 'failed_to_create_widget', details: String(error) }, 500);
  }
});

// Update a widget
dashboardRoutes.put('/:id/widgets/:widgetId', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const { id, widgetId } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);
  const { widgetType, config, position } = await c.req.json();

  try {
    // Check if dashboard exists and user has permission
    const [dashboard] = await runPostgresQuery(
      'SELECT id FROM dashboards WHERE id = $1 AND created_by = $2',
      [id, actor]
    );

    if (!dashboard) {
      return c.json({ error: 'dashboard_not_found_or_no_permission' }, 404);
    }

    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let paramIndex = 1;

    if (widgetType !== undefined) {
      updateFields.push(`widget_type = $${paramIndex++}`);
      updateValues.push(widgetType);
    }
    if (config !== undefined) {
      updateFields.push(`config = $${paramIndex++}`);
      updateValues.push(JSON.stringify(config));
    }
    if (position !== undefined) {
      updateFields.push(`position = $${paramIndex++}`);
      updateValues.push(JSON.stringify(position));
    }

    if (updateFields.length === 0) {
      return c.json({ error: 'no_fields_to_update' }, 400);
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(widgetId, id);

    const [updated] = await runPostgresQuery(
      `UPDATE dashboard_widgets SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND dashboard_id = $${paramIndex + 1} RETURNING *`,
      updateValues
    );

    if (!updated) {
      return c.json({ error: 'widget_not_found' }, 404);
    }

    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'failed_to_update_widget', details: String(error) }, 500);
  }
});

// Delete a widget
dashboardRoutes.delete('/:id/widgets/:widgetId', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const { id, widgetId } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);

  try {
    // Check if dashboard exists and user has permission
    const [dashboard] = await runPostgresQuery(
      'SELECT id FROM dashboards WHERE id = $1 AND created_by = $2',
      [id, actor]
    );

    if (!dashboard) {
      return c.json({ error: 'dashboard_not_found_or_no_permission' }, 404);
    }

    const result = await runPostgresQuery(
      'DELETE FROM dashboard_widgets WHERE id = $1 AND dashboard_id = $2',
      [widgetId, id]
    );

    if (result.length === 0) {
      return c.json({ error: 'widget_not_found' }, 404);
    }

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: 'failed_to_delete_widget', details: String(error) }, 500);
  }
});

// Duplicate a dashboard
dashboardRoutes.post('/:id/duplicate', async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const { id } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);
  const { name } = await c.req.json();

  try {
    // Get original dashboard
    const [original] = await runPostgresQuery(
      'SELECT * FROM dashboards WHERE id = $1 AND (created_by = $2 OR is_public = true)',
      [id, actor]
    );

    if (!original) {
      return c.json({ error: 'dashboard_not_found' }, 404);
    }

    // Create new dashboard
    const [newDashboard] = await runPostgresQuery(
      'INSERT INTO dashboards(name, description, layout, theme, filters, is_public, created_by) VALUES($1, $2, $3, $4, $5, false, $6) RETURNING *',
      [
        name || `${original.name} (Copy)`,
        original.description,
        original.layout,
        original.theme,
        original.filters,
        actor
      ]
    );

    // Copy widgets
    const widgets = await runPostgresQuery(
      'SELECT widget_type, config, position FROM dashboard_widgets WHERE dashboard_id = $1',
      [id]
    );

    for (const widget of widgets) {
      await runPostgresQuery(
        'INSERT INTO dashboard_widgets(dashboard_id, widget_type, config, position) VALUES($1, $2, $3, $4)',
        [newDashboard.id, widget.widget_type, widget.config, widget.position]
      );
    }

    return c.json(newDashboard, 201);
  } catch (error) {
    return c.json({ error: 'failed_to_duplicate_dashboard', details: String(error) }, 500);
  }
});

export default dashboardRoutes;