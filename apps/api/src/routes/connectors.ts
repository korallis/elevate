import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { 
  createConnector, 
  getAvailableConnectorTypes,
  getConnectorMetadata,
  getConnectorRequirements,
  validateConnectorConfig,
  getOAuthConfig,
  isValidConnectorType
} from '../connectors/index.js';
import { hasPgConfig, runPostgresQuery } from '../postgres.js';
import { useBudget, getActorKey } from '../budget.js';
import crypto from 'crypto';

const app = new Hono();

// Validation schemas
const ConnectorConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.string(),
  config: z.record(z.any()).optional().default({}),
  authConfig: z.object({
    type: z.enum(['password', 'oauth2', 'api_key', 'service_account', 'iam', 'token', 'key_pair']),
    credentials: z.record(z.any()),
    refreshToken: z.string().optional(),
    expiresAt: z.string().datetime().optional()
  }),
  enabled: z.boolean().default(true)
});

const TestConnectionSchema = z.object({
  type: z.string(),
  authConfig: z.object({
    type: z.enum(['password', 'oauth2', 'api_key', 'service_account', 'iam', 'token', 'key_pair']),
    credentials: z.record(z.any()),
    refreshToken: z.string().optional(),
    expiresAt: z.string().datetime().optional()
  })
});

const QuerySchema = z.object({
  sql: z.string(),
  params: z.array(z.any()).optional()
});

// Get all available connector types
app.get('/types', (c) => {
  return c.json({
    types: getAvailableConnectorTypes(),
    metadata: getConnectorMetadata()
  });
});

// Get connector requirements and configuration info
app.get('/types/:type', (c) => {
  const type = c.req.param('type');
  
  if (!isValidConnectorType(type)) {
    return c.json({ error: 'Invalid connector type' }, 400);
  }

  const requirements = getConnectorRequirements(type);
  const oauthConfig = getOAuthConfig(type);
  const metadata = getConnectorMetadata().find(m => m.type === type);

  return c.json({
    type,
    requirements,
    oauthConfig,
    metadata
  });
});

// List all connector configurations
app.get('/', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  try {
    const rows = await runPostgresQuery(`
      SELECT id, name, type, config, enabled, created_at, updated_at, created_by, updated_by
      FROM connector_configurations 
      ORDER BY created_at DESC
    `);

    return c.json(rows);
  } catch (error) {
    console.error('Error listing connectors:', error);
    return c.json({ error: 'Failed to list connectors' }, 500);
  }
});

// Get specific connector configuration
app.get('/:id', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const id = c.req.param('id');

  try {
    const rows = await runPostgresQuery(`
      SELECT id, name, type, config, auth_config, enabled, created_at, updated_at, created_by, updated_by
      FROM connector_configurations 
      WHERE id = $1
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found' }, 404);
    }

    const connector = rows[0];
    
    // Remove sensitive information from auth_config for security
    if (connector.auth_config?.credentials) {
      const sanitized = { ...connector.auth_config };
      sanitized.credentials = Object.keys(sanitized.credentials).reduce((acc: Record<string, any>, key) => {
        if (['password', 'token', 'secret', 'key', 'privateKey', 'clientSecret', 'apiKey'].some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))) {
          acc[key] = '***';
        } else {
          acc[key] = sanitized.credentials[key];
        }
        return acc;
      }, {});
      connector.auth_config = sanitized;
    }

    return c.json(connector);
  } catch (error) {
    console.error('Error getting connector:', error);
    return c.json({ error: 'Failed to get connector' }, 500);
  }
});

// Create new connector configuration
app.post('/', zValidator('json', ConnectorConfigSchema), async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const data = c.req.valid('json');
  const actor = getActorKey(c.req.raw.headers);

  // Validate connector type
  if (!isValidConnectorType(data.type)) {
    return c.json({ error: 'Invalid connector type' }, 400);
  }

  // Validate configuration
  const validation = validateConnectorConfig(data.type, data.authConfig);
  if (!validation.valid) {
    return c.json({ error: 'Invalid configuration', details: validation.errors }, 400);
  }

  try {
    const id = data.id || crypto.randomUUID();
    
    const rows = await runPostgresQuery(`
      INSERT INTO connector_configurations (id, name, type, config, auth_config, enabled, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, type, config, enabled, created_at, updated_at, created_by
    `, [
      id,
      data.name,
      data.type,
      JSON.stringify(data.config),
      JSON.stringify(data.authConfig),
      data.enabled,
      actor,
      actor
    ]);

    return c.json(rows[0], 201);
  } catch (error) {
    console.error('Error creating connector:', error);
    return c.json({ error: 'Failed to create connector' }, 500);
  }
});

// Update connector configuration
app.put('/:id', zValidator('json', ConnectorConfigSchema), async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const data = c.req.valid('json');
  const actor = getActorKey(c.req.raw.headers);

  // Validate connector type
  if (!isValidConnectorType(data.type)) {
    return c.json({ error: 'Invalid connector type' }, 400);
  }

  // Validate configuration
  const validation = validateConnectorConfig(data.type, data.authConfig);
  if (!validation.valid) {
    return c.json({ error: 'Invalid configuration', details: validation.errors }, 400);
  }

  try {
    const rows = await runPostgresQuery(`
      UPDATE connector_configurations 
      SET name = $2, type = $3, config = $4, auth_config = $5, enabled = $6, updated_by = $7, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, type, config, enabled, created_at, updated_at, created_by, updated_by
    `, [
      id,
      data.name,
      data.type,
      JSON.stringify(data.config),
      JSON.stringify(data.authConfig),
      data.enabled,
      actor
    ]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found' }, 404);
    }

    return c.json(rows[0]);
  } catch (error) {
    console.error('Error updating connector:', error);
    return c.json({ error: 'Failed to update connector' }, 500);
  }
});

// Delete connector configuration
app.delete('/:id', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const id = c.req.param('id');

  try {
    const rows = await runPostgresQuery(`
      DELETE FROM connector_configurations 
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting connector:', error);
    return c.json({ error: 'Failed to delete connector' }, 500);
  }
});

// Test connection
app.post('/test', zValidator('json', TestConnectionSchema), async (c) => {
  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const data = c.req.valid('json');

  if (!isValidConnectorType(data.type)) {
    return c.json({ error: 'Invalid connector type' }, 400);
  }

  try {
    const connector = createConnector(data.type);
    const result = await connector.testConnection(data.authConfig);

    // Store test result if database is configured
    if (hasPgConfig()) {
      try {
        const actor = getActorKey(c.req.raw.headers);
        await runPostgresQuery(`
          INSERT INTO connector_test_results (connector_id, success, message, latency_ms, version, tested_by)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['test', result.success, result.message, result.latencyMs, result.version, actor]);
      } catch (error) {
        console.warn('Failed to store test result:', error);
      }
    }

    return c.json(result);
  } catch (error) {
    console.error('Error testing connection:', error);
    return c.json({ 
      success: false,
      message: error instanceof Error ? error.message : 'Test failed'
    }, 500);
  }
});

// Test existing connector configuration
app.post('/:id/test', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');

  try {
    const rows = await runPostgresQuery(`
      SELECT id, name, type, auth_config
      FROM connector_configurations 
      WHERE id = $1
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found' }, 404);
    }

    const config = rows[0];
    const connector = createConnector(config.type);
    const result = await connector.testConnection(config.auth_config);

    // Store test result
    const actor = getActorKey(c.req.raw.headers);
    await runPostgresQuery(`
      INSERT INTO connector_test_results (connector_id, success, message, latency_ms, version, tested_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, result.success, result.message, result.latencyMs, result.version, actor]);

    return c.json(result);
  } catch (error) {
    console.error('Error testing connector:', error);
    return c.json({ 
      success: false,
      message: error instanceof Error ? error.message : 'Test failed'
    }, 500);
  }
});

// Get connector schema discovery endpoints
app.get('/:id/databases', async (c) => {
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
      SELECT type, auth_config
      FROM connector_configurations 
      WHERE id = $1 AND enabled = true
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found or disabled' }, 404);
    }

    const config = rows[0];
    const connector = createConnector(config.type);
    
    await connector.connect(config.auth_config);
    const databases = await connector.listDatabases();
    await connector.disconnect();

    return c.json(databases);
  } catch (error) {
    console.error('Error listing databases:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to list databases' }, 500);
  }
});

app.get('/:id/schemas', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const database = c.req.query('database');

  try {
    const rows = await runPostgresQuery(`
      SELECT type, auth_config
      FROM connector_configurations 
      WHERE id = $1 AND enabled = true
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found or disabled' }, 404);
    }

    const config = rows[0];
    const connector = createConnector(config.type);
    
    await connector.connect(config.auth_config);
    const schemas = await connector.listSchemas(database);
    await connector.disconnect();

    return c.json(schemas);
  } catch (error) {
    console.error('Error listing schemas:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to list schemas' }, 500);
  }
});

app.get('/:id/tables', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const database = c.req.query('database');
  const schema = c.req.query('schema');

  try {
    const rows = await runPostgresQuery(`
      SELECT type, auth_config
      FROM connector_configurations 
      WHERE id = $1 AND enabled = true
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found or disabled' }, 404);
    }

    const config = rows[0];
    const connector = createConnector(config.type);
    
    await connector.connect(config.auth_config);
    const tables = await connector.listTables(database, schema);
    await connector.disconnect();

    return c.json(tables);
  } catch (error) {
    console.error('Error listing tables:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to list tables' }, 500);
  }
});

app.get('/:id/columns', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const database = c.req.query('database');
  const schema = c.req.query('schema');
  const table = c.req.query('table');

  if (!database || !schema || !table) {
    return c.json({ error: 'database, schema, and table parameters are required' }, 400);
  }

  try {
    const rows = await runPostgresQuery(`
      SELECT type, auth_config
      FROM connector_configurations 
      WHERE id = $1 AND enabled = true
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found or disabled' }, 404);
    }

    const config = rows[0];
    const connector = createConnector(config.type);
    
    await connector.connect(config.auth_config);
    const columns = await connector.listColumns(database, schema, table);
    await connector.disconnect();

    return c.json(columns);
  } catch (error) {
    console.error('Error listing columns:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to list columns' }, 500);
  }
});

// Execute query on connector
app.post('/:id/query', zValidator('json', QuerySchema), async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const budget = useBudget(c.req.raw.headers, 10); // Higher cost for queries
  if (!budget.ok) {
    return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  }

  const id = c.req.param('id');
  const { sql, params } = c.req.valid('json');

  try {
    const rows = await runPostgresQuery(`
      SELECT type, auth_config
      FROM connector_configurations 
      WHERE id = $1 AND enabled = true
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found or disabled' }, 404);
    }

    const config = rows[0];
    const connector = createConnector(config.type);
    
    await connector.connect(config.auth_config);
    const result = await connector.executeQuery(sql, params);
    await connector.disconnect();

    return c.json(result);
  } catch (error) {
    console.error('Error executing query:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Query execution failed' }, 500);
  }
});

// OAuth endpoints for supported connectors
app.get('/:id/oauth/url', async (c) => {
  if (!hasPgConfig()) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const id = c.req.param('id');
  const redirectUri = c.req.query('redirect_uri');
  const state = c.req.query('state');

  if (!redirectUri) {
    return c.json({ error: 'redirect_uri parameter is required' }, 400);
  }

  try {
    const rows = await runPostgresQuery(`
      SELECT type, auth_config
      FROM connector_configurations 
      WHERE id = $1
    `, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Connector not found' }, 404);
    }

    const config = rows[0];
    const connector = createConnector(config.type);

    if (!connector.getOAuthUrl) {
      return c.json({ error: 'Connector does not support OAuth' }, 400);
    }

    const url = await connector.getOAuthUrl(redirectUri, state);
    return c.json({ url });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to generate OAuth URL' }, 500);
  }
});

export default app;