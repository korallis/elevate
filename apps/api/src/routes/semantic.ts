import { Hono } from 'hono';
import { z } from 'zod';
import { hasPgConfig, getPool } from '../postgres.js';
import { useBudget } from '../budget.js';
import { createSemanticPreview, PreviewQuerySchema, validatePreviewQuery } from '../semantic/preview.js';
import { createSemanticVersioning } from '../semantic/versioning.js';
import { MetricQuerySchema } from '@sme/schemas';

const app = new Hono();

// Validation schemas for API requests
const CreateMetricSchema = z.object({
  name: z.string().min(1).max(255),
  label: z.string().optional(),
  type: z.enum(['count', 'sum', 'avg', 'min', 'max', 'distinct_count', 'custom']),
  table_name: z.string().min(1).max(255),
  column_name: z.string().max(255).optional(),
  expression: z.string().optional(),
  description: z.string().optional(),
  format_type: z.enum(['number', 'currency', 'percentage']).default('number'),
  format_options: z.record(z.unknown()).default({}),
  aggregation_type: z.enum(['sum', 'avg', 'min', 'max', 'count']).default('sum'),
  filters: z.array(z.record(z.unknown())).default([]),
  dimensions: z.array(z.string()).default([]),
});

const UpdateMetricSchema = CreateMetricSchema.partial().extend({
  version_notes: z.string().optional(),
});

const CreateDimensionSchema = z.object({
  name: z.string().min(1).max(255),
  label: z.string().optional(),
  type: z.enum(['string', 'number', 'date', 'boolean']),
  table_name: z.string().min(1).max(255),
  column_name: z.string().min(1).max(255),
  expression: z.string().optional(),
  description: z.string().optional(),
  values: z.record(z.unknown()).optional(),
  format_string: z.string().max(100).optional(),
  is_primary: z.boolean().default(false),
});

const UpdateDimensionSchema = CreateDimensionSchema.partial().extend({
  version_notes: z.string().optional(),
});

// Helper function to get user from headers/context
function getUserFromContext(): string {
  // In a real implementation, this would extract the user from JWT or session
  return 'system'; // Placeholder
}

// Metrics endpoints
app.get('/metrics', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const pool = getPool();
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    const search = c.req.query('search') || '';
    const isActive = c.req.query('active');

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      whereClause += ' AND (name ILIKE $' + (params.length + 1) + ' OR label ILIKE $' + (params.length + 1) + ')';
      params.push(`%${search}%`);
    }

    if (isActive !== undefined) {
      whereClause += ' AND is_active = $' + (params.length + 1);
      params.push(isActive === 'true');
    }

    const sql = `
      SELECT id, name, label, type, table_name, column_name, expression, description,
             format_type, format_options, aggregation_type, filters, dimensions,
             version, is_active, created_by, created_at, updated_at
      FROM semantic_metrics 
      ${whereClause}
      ORDER BY updated_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM semantic_metrics 
      ${whereClause}
    `;

    params.push(limit, offset);
    const [result, countResult] = await Promise.all([
      pool.query(sql, params.slice(0, -2).concat(limit, offset)),
      pool.query(countSql, params.slice(0, -2)),
    ]);

    return c.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return c.json({ error: 'Failed to fetch metrics' }, 500);
  }
});

app.post('/metrics', async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const body = await c.req.json();
    const validatedData = CreateMetricSchema.parse(body);
    const pool = getPool();
    const user = getUserFromContext();

    const sql = `
      INSERT INTO semantic_metrics (
        name, label, type, table_name, column_name, expression, description,
        format_type, format_options, aggregation_type, filters, dimensions,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, version, created_at
    `;

    const params = [
      validatedData.name,
      validatedData.label,
      validatedData.type,
      validatedData.table_name,
      validatedData.column_name,
      validatedData.expression,
      validatedData.description,
      validatedData.format_type,
      JSON.stringify(validatedData.format_options),
      validatedData.aggregation_type,
      JSON.stringify(validatedData.filters),
      JSON.stringify(validatedData.dimensions),
      user,
    ];

    const result = await pool.query(sql, params);
    const metric = result.rows[0];

    // Create initial version entry
    const versioning = createSemanticVersioning(pool);
    await versioning.createVersion(
      'metric',
      metric.id,
      { created: { changeType: 'created' } },
      'Initial metric creation',
      user
    );

    return c.json({
      id: metric.id,
      version: metric.version,
      created_at: metric.created_at,
      ...validatedData,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400);
    }
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return c.json({ error: 'Metric name already exists' }, 409);
    }
    console.error('Error creating metric:', error);
    return c.json({ error: 'Failed to create metric' }, 500);
  }
});

app.get('/metrics/:id', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const id = c.req.param('id');
    const pool = getPool();

    const sql = `
      SELECT id, name, label, type, table_name, column_name, expression, description,
             format_type, format_options, filters, dimensions, version, is_active,
             created_by, created_at, updated_at
      FROM semantic_metrics 
      WHERE id = $1
    `;

    const result = await pool.query(sql, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Metric not found' }, 404);
    }

    return c.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching metric:', error);
    return c.json({ error: 'Failed to fetch metric' }, 500);
  }
});

app.put('/metrics/:id', async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validatedData = UpdateMetricSchema.parse(body);
    const pool = getPool();
    const user = getUserFromContext();

    // Get current metric for comparison
    const currentResult = await pool.query('SELECT * FROM semantic_metrics WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return c.json({ error: 'Metric not found' }, 404);
    }
    
    const current = currentResult.rows[0];

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    const changes: Record<string, any> = {};

    Object.entries(validatedData).forEach(([key, value], index) => {
      if (key === 'version_notes' || value === undefined) return;
      
      const currentValue = current[key];
      if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
        updates.push(`${key} = $${params.length + 1}`);
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        changes[key] = {
          from: currentValue,
          to: value,
          changeType: key === 'expression' ? 'expression_changed' : 
                     key === 'filters' ? 'filters_changed' :
                     key === 'dimensions' ? 'dimensions_changed' : 'updated',
        };
      }
    });

    if (updates.length === 0) {
      return c.json({ error: 'No changes detected' }, 400);
    }

    // Update the metric (this will trigger version increment via database trigger)
    const sql = `
      UPDATE semantic_metrics 
      SET ${updates.join(', ')}
      WHERE id = $${params.length + 1}
      RETURNING version, updated_at
    `;
    params.push(id);

    const result = await pool.query(sql, params);
    const updated = result.rows[0];

    // Create version entry with changes
    const versioning = createSemanticVersioning(pool);
    await versioning.createVersion(
      'metric',
      id,
      changes,
      validatedData.version_notes || 'Metric updated',
      user
    );

    return c.json({
      id,
      version: updated.version,
      updated_at: updated.updated_at,
      changes: Object.keys(changes),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400);
    }
    console.error('Error updating metric:', error);
    return c.json({ error: 'Failed to update metric' }, 500);
  }
});

app.get('/metrics/:id/versions', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const id = c.req.param('id');
    const pool = getPool();
    const versioning = createSemanticVersioning(pool);

    const versions = await versioning.getVersionHistory('metric', id);
    return c.json(versions);
  } catch (error) {
    console.error('Error fetching metric versions:', error);
    return c.json({ error: 'Failed to fetch versions' }, 500);
  }
});

app.post('/metrics/:id/preview', async (c) => {
  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const pool = getPool();
    const preview = createSemanticPreview(pool);

    // Get the metric details
    const metricResult = await pool.query(
      'SELECT name, type, table_name, column_name, expression FROM semantic_metrics WHERE id = $1',
      [id]
    );

    if (metricResult.rows.length === 0) {
      return c.json({ error: 'Metric not found' }, 404);
    }

    const metric = metricResult.rows[0];

    // Build preview query
    const previewQuery = validatePreviewQuery({
      metric: {
        name: metric.name,
        type: metric.type,
        table: metric.table_name,
        column: metric.column_name,
      },
      dimensions: body.dimensions || [],
      filters: body.filters || [],
      limit: body.limit || 100,
      sampleSize: body.sampleSize || 100,
      includeStats: body.includeStats || false,
    });

    const result = await preview.executePreview(previewQuery);
    return c.json(result);
  } catch (error) {
    console.error('Error executing preview:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Preview failed' }, 500);
  }
});

app.get('/metrics/:id/impact', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const id = c.req.param('id');
    const pool = getPool();
    const versioning = createSemanticVersioning(pool);

    const impact = await versioning.getImpactedEntities('metric', id);
    return c.json(impact);
  } catch (error) {
    console.error('Error analyzing impact:', error);
    return c.json({ error: 'Failed to analyze impact' }, 500);
  }
});

app.post('/metrics/:id/rollback', async (c) => {
  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const id = c.req.param('id');
    const { targetVersion, notes } = await c.req.json();
    const pool = getPool();
    const versioning = createSemanticVersioning(pool);
    const user = getUserFromContext();

    if (!targetVersion) {
      return c.json({ error: 'targetVersion is required' }, 400);
    }

    const rollbackVersion = await versioning.rollbackToVersion(
      'metric',
      id,
      targetVersion,
      notes,
      user
    );

    return c.json(rollbackVersion);
  } catch (error) {
    console.error('Error rolling back metric:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Rollback failed' }, 500);
  }
});

// Dimensions endpoints (similar structure to metrics)
app.get('/dimensions', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const pool = getPool();
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    const search = c.req.query('search') || '';
    const type = c.req.query('type');

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      whereClause += ' AND (name ILIKE $' + (params.length + 1) + ' OR label ILIKE $' + (params.length + 1) + ')';
      params.push(`%${search}%`);
    }

    if (type) {
      whereClause += ' AND type = $' + (params.length + 1);
      params.push(type);
    }

    const sql = `
      SELECT id, name, label, type, table_name, column_name, expression, description,
             values, format_string, is_primary, created_by, created_at, updated_at
      FROM semantic_dimensions 
      ${whereClause}
      ORDER BY updated_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countSql = `SELECT COUNT(*) as total FROM semantic_dimensions ${whereClause}`;

    params.push(limit, offset);
    const [result, countResult] = await Promise.all([
      pool.query(sql, params.slice(0, -2).concat(limit, offset)),
      pool.query(countSql, params.slice(0, -2)),
    ]);

    return c.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching dimensions:', error);
    return c.json({ error: 'Failed to fetch dimensions' }, 500);
  }
});

app.post('/dimensions', async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const body = await c.req.json();
    const validatedData = CreateDimensionSchema.parse(body);
    const pool = getPool();
    const user = getUserFromContext();

    const sql = `
      INSERT INTO semantic_dimensions (
        name, label, type, table_name, column_name, expression, description,
        values, format_string, is_primary, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, created_at
    `;

    const params = [
      validatedData.name,
      validatedData.label,
      validatedData.type,
      validatedData.table_name,
      validatedData.column_name,
      validatedData.expression,
      validatedData.description,
      validatedData.values ? JSON.stringify(validatedData.values) : null,
      validatedData.format_string,
      validatedData.is_primary,
      user,
    ];

    const result = await pool.query(sql, params);
    const dimension = result.rows[0];

    // Create initial version entry
    const versioning = createSemanticVersioning(pool);
    await versioning.createVersion(
      'dimension',
      dimension.id,
      { created: { changeType: 'created' } },
      'Initial dimension creation',
      user
    );

    return c.json({
      id: dimension.id,
      created_at: dimension.created_at,
      ...validatedData,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400);
    }
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return c.json({ error: 'Dimension name already exists' }, 409);
    }
    console.error('Error creating dimension:', error);
    return c.json({ error: 'Failed to create dimension' }, 500);
  }
});

// Sample data endpoints
app.get('/dimensions/:id/sample', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const id = c.req.param('id');
    const limit = Math.min(parseInt(c.req.query('limit') || '100'), 1000);
    const pool = getPool();
    const preview = createSemanticPreview(pool);

    // Get dimension details
    const dimensionResult = await pool.query(
      'SELECT table_name, column_name FROM semantic_dimensions WHERE id = $1',
      [id]
    );

    if (dimensionResult.rows.length === 0) {
      return c.json({ error: 'Dimension not found' }, 404);
    }

    const { table_name, column_name } = dimensionResult.rows[0];
    const sampleData = await preview.getSampleData(table_name, column_name, limit);

    return c.json(sampleData);
  } catch (error) {
    console.error('Error fetching sample data:', error);
    return c.json({ error: 'Failed to fetch sample data' }, 500);
  }
});

// Schema exploration endpoints
app.get('/tables/:tableName/schema', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const tableName = c.req.param('tableName');
    const pool = getPool();
    const preview = createSemanticPreview(pool);

    const schema = await preview.getTableSchema(tableName);
    return c.json(schema);
  } catch (error) {
    console.error('Error fetching table schema:', error);
    return c.json({ error: 'Failed to fetch table schema' }, 500);
  }
});

// Version comparison endpoint
app.get('/metrics/:id/versions/compare', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const id = c.req.param('id');
    const fromVersion = c.req.query('from');
    const toVersion = c.req.query('to');

    if (!fromVersion || !toVersion) {
      return c.json({ error: 'Both "from" and "to" version parameters are required' }, 400);
    }

    const pool = getPool();
    const versioning = createSemanticVersioning(pool);

    const comparison = await versioning.compareVersions('metric', id, fromVersion, toVersion);
    return c.json(comparison);
  } catch (error) {
    console.error('Error comparing versions:', error);
    return c.json({ error: 'Failed to compare versions' }, 500);
  }
});

// Raw SQL preview endpoint (use with caution)
app.post('/preview/sql', async (c) => {
  const budget = useBudget(c.req.raw.headers, 10); // Higher cost for raw SQL
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 503);
  }

  try {
    const { sql, params = [], limit = 100 } = await c.req.json();
    
    if (!sql) {
      return c.json({ error: 'SQL query is required' }, 400);
    }

    const pool = getPool();
    const preview = createSemanticPreview(pool);

    const result = await preview.executeRawPreview(sql, params, limit);
    return c.json(result);
  } catch (error) {
    console.error('Error executing raw SQL preview:', error);
    return c.json({ error: error instanceof Error ? error.message : 'SQL preview failed' }, 500);
  }
});

export default app;