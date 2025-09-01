import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  CreateTransformationRequestSchema,
  UpdateTransformationRequestSchema,
  PreviewTransformationRequestSchema,
  RevertTransformationRequestSchema,
  TransformationConfig,
  TransformationHistory,
  DEFAULT_TRANSFORMATION_METADATA
} from '@sme/schemas/transformations';
import { TransformationEngine, TransformationValidator, TransformationOptimizer } from '../transform/index.js';
import { hasPgConfig, runPostgresQuery } from '../postgres.js';
import { useBudget, getActorKey } from '../budget.js';
import { createConnector } from '../connectors/index.js';
import crypto from 'crypto';

const app = new Hono();

const transformationEngine = new TransformationEngine();
const transformationValidator = new TransformationValidator();
const transformationOptimizer = new TransformationOptimizer();

// Get transformation metadata
app.get('/metadata', (c) => {
  return c.json(DEFAULT_TRANSFORMATION_METADATA);
});

// List all transformations
app.get('/', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const sourceTable = c.req.query('source_table');

    let query = `
      SELECT id, name, description, source_table, transformations, version, 
             created_by, created_at, updated_at
      FROM transformations
    `;
    const params: any[] = [];

    if (sourceTable) {
      query += ` WHERE source_table = $1`;
      params.push(sourceTable);
    }

    query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const rows = await runPostgresQuery(query, params);

    const transformations = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      sourceTable: row.source_table,
      rules: row.transformations.rules || [],
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return c.json(transformations);
  } catch (error) {
    console.error('Error listing transformations:', error);
    return c.json({ error: 'Failed to list transformations' }, 500);
  }
});

// Get specific transformation
app.get('/:id', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');

  try {
    const rows = await runPostgresQuery(`
      SELECT id, name, description, source_table, transformations, version,
             created_by, created_at, updated_at
      FROM transformations
      WHERE id = $1
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    const row = rows[0];
    const transformation: TransformationConfig = {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceTable: row.source_table,
      rules: row.transformations.rules || [],
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    return c.json(transformation);
  } catch (error) {
    console.error('Error getting transformation:', error);
    return c.json({ error: 'Failed to get transformation' }, 500);
  }
});

// Create new transformation
app.post('/', zValidator('json', CreateTransformationRequestSchema), async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const data = c.req.valid('json');
  const actor = getActorKey(c.req.raw.headers);

  // Validate transformation rules
  const validation = transformationValidator.validateTransformation({
    ...data,
    createdBy: actor
  });

  if (!validation.valid) {
    return c.json({ 
      error: 'Invalid transformation configuration',
      details: validation.errors,
      warnings: validation.warnings
    }, 400);
  }

  try {
    const id = crypto.randomUUID();
    const transformationsJson = { rules: data.rules };

    const rows = await runPostgresQuery(`
      INSERT INTO transformations (id, name, description, source_table, transformations, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, description, source_table, transformations, version, created_by, created_at, updated_at
    `, [
      id,
      data.name,
      data.description,
      data.sourceTable,
      JSON.stringify(transformationsJson),
      actor,
      actor
    ]);

    const row = rows[0];
    const transformation: TransformationConfig = {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceTable: row.source_table,
      rules: row.transformations.rules || [],
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    return c.json(transformation, 201);
  } catch (error) {
    console.error('Error creating transformation:', error);
    
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return c.json({ error: 'A transformation with this name already exists' }, 409);
    }
    
    return c.json({ error: 'Failed to create transformation' }, 500);
  }
});

// Update transformation
app.put('/:id', zValidator('json', UpdateTransformationRequestSchema), async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const data = c.req.valid('json');
  const actor = getActorKey(c.req.raw.headers);

  // Validate transformation rules if provided
  if (data.rules) {
    const validation = transformationValidator.validateTransformation({
      name: data.name || 'temp',
      sourceTable: 'temp',
      rules: data.rules,
      createdBy: actor
    });

    if (!validation.valid) {
      return c.json({ 
        error: 'Invalid transformation configuration',
        details: validation.errors,
        warnings: validation.warnings
      }, 400);
    }
  }

  try {
    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }

    if (data.rules !== undefined) {
      updates.push(`transformations = $${paramIndex++}`);
      params.push(JSON.stringify({ rules: data.rules }));
    }

    if (data.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      params.push(data.enabled);
    }

    updates.push(`updated_by = $${paramIndex++}`);
    params.push(actor);

    params.push(id);

    const rows = await runPostgresQuery(`
      UPDATE transformations 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, description, source_table, transformations, version, created_by, created_at, updated_at
    `, params);

    if (rows.length === 0) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    const row = rows[0];
    const transformation: TransformationConfig = {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceTable: row.source_table,
      rules: row.transformations.rules || [],
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    return c.json(transformation);
  } catch (error) {
    console.error('Error updating transformation:', error);
    
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return c.json({ error: 'A transformation with this name already exists' }, 409);
    }
    
    return c.json({ error: 'Failed to update transformation' }, 500);
  }
});

// Delete transformation
app.delete('/:id', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');

  try {
    const rows = await runPostgresQuery(`
      DELETE FROM transformations 
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting transformation:', error);
    return c.json({ error: 'Failed to delete transformation' }, 500);
  }
});

// Preview transformation results
app.post('/preview', zValidator('json', PreviewTransformationRequestSchema), async (c) => {
  const budget = useBudget(c.req.raw.headers, 10); // Higher cost for preview
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const data = c.req.valid('json');

  try {
    // Get sample data from source table
    // This would need to be enhanced to work with different connectors
    const sampleQuery = `SELECT * FROM ${data.sourceTable} LIMIT ${data.limit}`;
    
    // For now, return mock data - this would be replaced with actual connector query
    const mockData = [
      { id: 1, name: 'John Doe', status: 'active', amount: 100.50 },
      { id: 2, name: 'Jane Smith', status: 'inactive', amount: 200.75 }
    ];
    
    const mockColumns = [
      { name: 'id', type: 'number', nullable: false },
      { name: 'name', type: 'string', nullable: false },
      { name: 'status', type: 'string', nullable: false },
      { name: 'amount', type: 'number', nullable: true }
    ];

    // Apply transformations
    const result = await transformationEngine.applyTransformations(
      mockData,
      data.rules,
      mockColumns
    );

    return c.json(result);
  } catch (error) {
    console.error('Error previewing transformation:', error);
    return c.json({ 
      error: 'Failed to preview transformation',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Preview transformation with specific connector
app.post('/:id/preview', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 10);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const connectorId = c.req.query('connector_id');
  const limit = parseInt(c.req.query('limit') || '100');

  if (!connectorId) {
    return c.json({ error: 'connector_id query parameter is required' }, 400);
  }

  try {
    // Get transformation
    const transformationRows = await runPostgresQuery(`
      SELECT name, description, source_table, transformations, version
      FROM transformations
      WHERE id = $1
    `, [id]);

    if (transformationRows.length === 0) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    const transformation = transformationRows[0];
    const rules = transformation.transformations.rules || [];

    // Get connector configuration
    const connectorRows = await runPostgresQuery(`
      SELECT type, auth_config
      FROM connector_configurations
      WHERE id = $1 AND enabled = true
    `, [connectorId]);

    if (connectorRows.length === 0) {
      return c.json({ error: 'Connector not found or disabled' }, 404);
    }

    const connectorConfig = connectorRows[0];
    const connector = createConnector(connectorConfig.type);

    // Get sample data from source
    await connector.connect(connectorConfig.auth_config);
    
    const sampleQuery = `SELECT * FROM ${transformation.source_table} LIMIT ${limit}`;
    const queryResult = await connector.executeQuery(sampleQuery);
    
    await connector.disconnect();

    if (!queryResult.success) {
      return c.json({ 
        error: 'Failed to query source table',
        details: queryResult.error
      }, 500);
    }

    // Apply transformations
    const result = await transformationEngine.applyTransformations(
      queryResult.data,
      rules,
      queryResult.columns
    );

    return c.json(result);
  } catch (error) {
    console.error('Error previewing transformation with connector:', error);
    return c.json({ 
      error: 'Failed to preview transformation',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Get transformation history
app.get('/:id/history', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '20');

  try {
    const rows = await runPostgresQuery(`
      SELECT id, version, name, description, source_table, transformations,
             created_by, created_at, change_summary
      FROM transformation_history
      WHERE transformation_id = $1
      ORDER BY version DESC
      LIMIT $2
    `, [id, limit]);

    const history: TransformationHistory[] = rows.map(row => ({
      id: row.id,
      transformationId: id,
      version: row.version,
      name: row.name,
      description: row.description,
      sourceTable: row.source_table,
      rules: row.transformations.rules || [],
      createdBy: row.created_by,
      createdAt: row.created_at,
      changeSummary: row.change_summary
    }));

    return c.json(history);
  } catch (error) {
    console.error('Error getting transformation history:', error);
    return c.json({ error: 'Failed to get transformation history' }, 500);
  }
});

// Revert transformation to previous version
app.post('/:id/revert', zValidator('json', RevertTransformationRequestSchema), async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const { version } = c.req.valid('json');
  const actor = getActorKey(c.req.raw.headers);

  try {
    // Get the historical version
    const historyRows = await runPostgresQuery(`
      SELECT name, description, source_table, transformations
      FROM transformation_history
      WHERE transformation_id = $1 AND version = $2
    `, [id, version]);

    if (historyRows.length === 0) {
      return c.json({ error: 'Historical version not found' }, 404);
    }

    const historicalData = historyRows[0];

    // Update current transformation with historical data
    const rows = await runPostgresQuery(`
      UPDATE transformations
      SET name = $2, description = $3, transformations = $4, updated_by = $5
      WHERE id = $1
      RETURNING id, name, description, source_table, transformations, version, created_by, created_at, updated_at
    `, [
      id,
      historicalData.name,
      historicalData.description,
      JSON.stringify(historicalData.transformations),
      actor
    ]);

    if (rows.length === 0) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    const row = rows[0];
    const transformation: TransformationConfig = {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceTable: row.source_table,
      rules: row.transformations.rules || [],
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    return c.json(transformation);
  } catch (error) {
    console.error('Error reverting transformation:', error);
    return c.json({ error: 'Failed to revert transformation' }, 500);
  }
});

// Optimize transformation
app.post('/:id/optimize', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');

  try {
    // Get transformation
    const rows = await runPostgresQuery(`
      SELECT transformations FROM transformations WHERE id = $1
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    const rules = rows[0].transformations.rules || [];
    
    // Optimize the transformation
    const optimizationResult = transformationOptimizer.optimize(rules);
    
    // Generate report
    const report = transformationOptimizer.generateOptimizationReport(rules, optimizationResult);

    return c.json({
      originalRules: rules,
      optimizedRules: optimizationResult.optimizedRules,
      optimizationsApplied: optimizationResult.optimizationsApplied,
      performanceImprovement: optimizationResult.performanceImprovement,
      report
    });
  } catch (error) {
    console.error('Error optimizing transformation:', error);
    return c.json({ error: 'Failed to optimize transformation' }, 500);
  }
});

// Apply optimization to transformation
app.put('/:id/optimize', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const actor = getActorKey(c.req.raw.headers);

  try {
    // Get transformation
    const rows = await runPostgresQuery(`
      SELECT transformations FROM transformations WHERE id = $1
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    const rules = rows[0].transformations.rules || [];
    
    // Optimize the transformation
    const optimizationResult = transformationOptimizer.optimize(rules);
    
    if (optimizationResult.optimizationsApplied.length === 0) {
      return c.json({ error: 'No optimizations available' }, 400);
    }

    // Update transformation with optimized rules
    const updateRows = await runPostgresQuery(`
      UPDATE transformations
      SET transformations = $2, updated_by = $3
      WHERE id = $1
      RETURNING id, name, description, source_table, transformations, version, created_by, created_at, updated_at
    `, [
      id,
      JSON.stringify({ rules: optimizationResult.optimizedRules }),
      actor
    ]);

    const row = updateRows[0];
    const transformation: TransformationConfig = {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceTable: row.source_table,
      rules: row.transformations.rules || [],
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    return c.json({
      transformation,
      optimizationsApplied: optimizationResult.optimizationsApplied,
      performanceImprovement: optimizationResult.performanceImprovement
    });
  } catch (error) {
    console.error('Error applying optimization:', error);
    return c.json({ error: 'Failed to apply optimization' }, 500);
  }
});

// Validate transformation rules against schema
app.post('/validate', zValidator('json', z.object({
  rules: z.array(z.any()),
  sourceTable: z.string(),
  connectorId: z.string().optional()
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const { rules, sourceTable, connectorId } = c.req.valid('json');

  try {
    // Basic rule validation
    const basicValidation = transformationValidator.validateTransformation({
      name: 'temp',
      sourceTable,
      rules,
      createdBy: 'temp'
    });

    if (!basicValidation.valid) {
      return c.json(basicValidation);
    }

    // If connector is specified, validate against actual schema
    if (connectorId && hasPgConfig()) {
      const connectorRows = await runPostgresQuery(`
        SELECT type, auth_config
        FROM connector_configurations
        WHERE id = $1 AND enabled = true
      `, [connectorId]);

      if (connectorRows.length > 0) {
        const connectorConfig = connectorRows[0];
        const connector = createConnector(connectorConfig.type);

        try {
          await connector.connect(connectorConfig.auth_config);
          
          // Get table schema (this would need to be implemented in connectors)
          // For now, return mock schema validation
          const mockColumns = [
            { name: 'id', type: 'number', nullable: false },
            { name: 'name', type: 'string', nullable: false },
            { name: 'status', type: 'string', nullable: false },
            { name: 'amount', type: 'number', nullable: true }
          ];

          const schemaValidation = transformationValidator.validateAgainstSchema(rules, mockColumns);
          await connector.disconnect();

          return c.json(schemaValidation);
        } catch (error) {
          await connector.disconnect();
          return c.json({
            valid: false,
            errors: [`Failed to validate against connector schema: ${error instanceof Error ? error.message : 'Unknown error'}`],
            warnings: []
          });
        }
      }
    }

    return c.json(basicValidation);
  } catch (error) {
    console.error('Error validating transformation:', error);
    return c.json({ 
      valid: false,
      errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: []
    });
  }
});

export default app;