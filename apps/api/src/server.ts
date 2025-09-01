// Initialize OpenTelemetry before any other imports
import { initializeInstrumentation } from './tracing/index.js';
initializeInstrumentation();

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { discovery, testConnection } from './snowflake';
import { hasPgConfig, runMigrations, runPostgresQuery, upsertCatalog } from './postgres';
import cron from 'node-cron';
import { EventEmitter } from 'node:events';
import { useBudget, getActorKey } from './budget';
import { authMiddleware } from './auth-middleware.js';
import { rbacMiddleware } from './rbac-middleware.js';
import authRoutes from './routes/auth.js';
import rbacRoutes from './routes/rbac.js';
import connectorRoutes from './routes/connectors.js';
import sharingRoutes from './routes/sharing.js';
import transformationRoutes from './routes/transformations.js';
import etlRoutes from './routes/etl.js';
import dashboardRoutes from './routes/dashboards.js';
import dashboardGenRoutes from './routes/dashboard-gen.js';
import semanticRoutes from './routes/semantic.js';
import nl2sqlRoutes from './routes/nl2sql.js';
import cacheRoutes from './routes/cache.js';
import governanceRoutes from './routes/governance.js';
import embedRoutes from './routes/embed.js';
import exportRoutes from './routes/export.js';
import schedulingRoutes from './routes/scheduling.js';
import { billing } from './routes/billing.js';
import { initializeStripeClient } from './billing/stripe-client.js';
import { logger, etlLogger, logError } from './logger.js';
import { cacheMiddleware, invalidationMiddleware, cacheHeadersMiddleware } from './middleware/cache.js';
import { cacheWarmer } from './cache/cache-warmer.js';
import { cacheInvalidator } from './cache/cache-invalidator.js';
import { tracingMiddleware, userContextMiddleware, databaseContextMiddleware } from './tracing/index.js';
import { startScheduleManager } from './scheduling/schedule-manager.js';
import { exporterSuccess } from './metrics.js';
import { metricsMiddleware, registry } from './metrics.js';

const app = new Hono();
app.use('*', cors());
// Metrics first to capture all routes
app.use('*', metricsMiddleware());
app.use('*', tracingMiddleware());
app.use('*', userContextMiddleware());
app.use('*', databaseContextMiddleware());
app.use('*', authMiddleware);
app.use('*', rbacMiddleware);

// Add cache middleware for selected routes
app.use('*', cacheHeadersMiddleware());
app.use('/snowflake/*', cacheMiddleware({ 
  ttl: 3600, 
  keyPrefix: 'snowflake',
  cacheHeaders: true
}));
app.use('/catalog/*', cacheMiddleware({ 
  ttl: 1800, 
  keyPrefix: 'catalog',
  cacheHeaders: true
}));

// Add invalidation middleware for data modification routes
app.use('*', invalidationMiddleware());

// Auth routes
app.route('/auth', authRoutes);
app.route('/rbac', rbacRoutes);

// Connector routes
app.route('/connectors', connectorRoutes);

// Transformation routes
app.route('/transformations', transformationRoutes);

// Sharing routes
app.route('/sharing', sharingRoutes);

// ETL routes (new Temporal-based ETL workflows)
app.route('/etl', etlRoutes);

// Dashboard routes
app.route('/dashboards', dashboardRoutes);

// Dashboard generation routes
app.route('/dashboard-gen', dashboardGenRoutes);

// Semantic layer routes
app.route('/semantic', semanticRoutes);

// NL2SQL routes
app.route('/nl2sql', nl2sqlRoutes);

// Cache management routes
app.route('/cache', cacheRoutes);

// Governance routes
app.route('/governance', governanceRoutes);

// Embed routes
app.route('/embed', embedRoutes);

// Export routes
app.route('/export', exportRoutes);

// Scheduling routes
app.route('/scheduling', schedulingRoutes);

// Billing routes
app.route('/billing', billing);

// Simple ETL status event bus (SSE)
const etlEvents = new EventEmitter();
function emitEtl(event: Record<string, unknown>) {
  etlEvents.emit('event', { ts: new Date().toISOString(), ...event });
}

async function addRunLog(runId: number, message: string, level: 'info' | 'error' = 'info') {
  if (!hasPgConfig()) return;
  await runPostgresQuery('insert into etl_run_logs(run_id, level, message) values($1,$2,$3)', [
    runId,
    level,
    message,
  ]);
}

app.get('/health', (c) => c.json({ ok: true }));

// Prometheus metrics endpoint
app.get('/metrics', async () => {
  const body = await registry.metrics();
  return new Response(body, {
    headers: {
      'Content-Type': registry.contentType,
      'Cache-Control': 'no-cache',
    },
  });
});

app.get('/snowflake/test', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  try {
    const ok = await testConnection();
    return c.json({ ok });
  } catch (e: unknown) {
    return c.json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

app.get('/snowflake/databases', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  return c.json(await discovery.listDatabases());
});
app.get('/snowflake/schemas', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  const db = c.req.query('database');
  if (!db) return c.json({ error: 'database required' }, 400);
  return c.json(await discovery.listSchemas(db));
});
app.get('/snowflake/tables', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  if (!db || !schema) return c.json({ error: 'database & schema required' }, 400);
  return c.json(await discovery.listTables(db, schema));
});
app.get('/snowflake/views', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  if (!db || !schema) return c.json({ error: 'database & schema required' }, 400);
  return c.json(await discovery.listViews(db, schema));
});
app.get('/snowflake/columns', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  const table = c.req.query('table');
  if (!db || !schema || !table) return c.json({ error: 'database, schema & table required' }, 400);
  return c.json(await discovery.listColumns(db, schema, table));
});
app.get('/snowflake/foreign-keys', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  if (!db || !schema) return c.json({ error: 'database & schema required' }, 400);
  return c.json(await discovery.listForeignKeys(db, schema));
});

app.get('/snowflake/catalog', async (c) => {
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  if (!db || !schema) return c.json({ error: 'database & schema required' }, 400);
  const [tables, views, fks] = await Promise.all([
    discovery.listTables(db, schema),
    discovery.listViews(db, schema),
    discovery.listForeignKeys(db, schema),
  ]);
  return c.json({ tables, views, foreignKeys: fks });
});

app.post('/catalog/discover', async (c) => {
  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  const { database, schema } = await c.req.json();
  if (!database || !schema) return c.json({ error: 'database & schema required' }, 400);
  const [tables, views, fks] = await Promise.all([
    discovery.listTables(database, schema),
    discovery.listViews(database, schema),
    discovery.listForeignKeys(database, schema),
  ]);
  const columnsByTable: Record<
    string,
    { COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }[]
  > = {};
  for (const t of [...tables.map((t) => t.TABLE_NAME), ...views.map((v) => v.TABLE_NAME)]) {
    columnsByTable[t] = await discovery.listColumns(database, schema, t);
  }
  const inferred = inferRelationships(
    [...tables.map((t) => t.TABLE_NAME), ...views.map((v) => v.TABLE_NAME)],
    columnsByTable,
    fks,
  );
  let persisted = false;
  if (hasPgConfig()) {
    await upsertCatalog(database, schema, {
      tables,
      views,
      columnsByTable,
      foreignKeys: [...fks, ...inferred],
    });
    persisted = true;
  }
  return c.json({
    ok: true,
    persisted,
    counts: {
      tables: tables.length,
      views: views.length,
      columns: Object.values(columnsByTable).reduce((a, b) => a + b.length, 0),
      foreignKeys: fks.length + inferred.length,
    },
  });
});

app.get('/catalog/entities', async (c) => {
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  if (!db || !schema) return c.json({ error: 'database & schema required' }, 400);
  const [tables, columns, fks] = await Promise.all([
    runPostgresQuery(
      'select * from catalog_tables where database_name=$1 and schema_name=$2 order by table_name',
      [db, schema],
    ),
    runPostgresQuery(
      'select * from catalog_columns where database_name=$1 and schema_name=$2 order by table_name, column_name',
      [db, schema],
    ),
    runPostgresQuery(
      'select * from catalog_foreign_keys where database_name=$1 and schema_name=$2 order by table_name, column_name',
      [db, schema],
    ),
  ]);
  return c.json({ tables, columns, foreignKeys: fks });
});

// Catalog search and ownership
app.get('/catalog/search', async (c) => {
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  const q = c.req.query('q') || '';
  if (!db || !schema || !q) return c.json({ error: 'database, schema & q required' }, 400);
  const like = `%${q}%`;
  const rows = await runPostgresQuery(
    `select t.table_name, t.table_type, coalesce(t.table_owner,'') as table_owner, c.column_name, c.data_type
       from catalog_tables t
       left join catalog_columns c
         on c.database_name = t.database_name and c.schema_name = t.schema_name and c.table_name = t.table_name
      where t.database_name = $1 and t.schema_name = $2
        and (t.table_name ilike $3 or c.column_name ilike $3)
      order by t.table_name, c.column_name`,
    [db, schema, like],
  );
  return c.json(rows);
});

app.post('/catalog/ownership', async (c) => {
  const { database, schema, table, owner } = await c.req.json();
  if (!database || !schema || !table)
    return c.json({ error: 'database,schema,table required' }, 400);
  await runPostgresQuery(
    'update catalog_tables set table_owner=$1 where database_name=$2 and schema_name=$3 and table_name=$4',
    [owner ?? null, database, schema, table],
  );
  return c.json({ ok: true });
});

// ETL schedules
app.post('/etl/schedules', async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  const { database, schema, cron: cronExpr, active = true } = await c.req.json();
  if (!database || !schema || !cronExpr)
    return c.json({ error: 'database, schema & cron required' }, 400);
  const rows = await runPostgresQuery(
    'insert into etl_schedules(database_name,schema_name,cron,active) values($1,$2,$3,$4) returning *',
    [database, schema, cronExpr, !!active],
  );
  return c.json(rows[0]);
});

app.get('/etl/schedules', async (c) => {
  const rows = await runPostgresQuery('select * from etl_schedules order by id desc');
  return c.json(rows);
});

app.post('/etl/run-now', async (c) => {
  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
  const { database, schema } = await c.req.json();
  if (!database || !schema) return c.json({ error: 'database & schema required' }, 400);
  const [run] = await runPostgresQuery(
    'insert into etl_runs(database_name,schema_name,status) values($1,$2,$3) returning id',
    [database, schema, 'running'],
  );
  emitEtl({ type: 'run_started', runId: run.id, database, schema });
  await addRunLog(run.id, `Run started for ${database}.${schema}`);
  try {
    await upsertCatalogViaDiscovery(database, schema, async (phase) => {
      emitEtl({ type: 'progress', runId: run.id, phase });
      await addRunLog(run.id, `Phase: ${phase}`);
    });
    await runPostgresQuery('update etl_runs set status=$1, finished_at=now() where id=$2', [
      'success',
      run.id,
    ]);
    emitEtl({ type: 'run_finished', runId: run.id, status: 'success' });
    return c.json({ ok: true, runId: run.id });
  } catch (e) {
    const err = e as Error;
    await runPostgresQuery(
      'update etl_runs set status=$1, finished_at=now(), error=$2 where id=$3',
      ['failed', err?.message || String(err), run.id],
    );
    emitEtl({ type: 'run_finished', runId: run.id, status: 'failed' });
    await addRunLog(run.id, `Error: ${err?.message || String(err)}`, 'error');
    return c.json({ ok: false, error: err?.message || String(err), runId: run.id }, 500);
  }
});

// Transformations & Aliases
app.post('/transform/alias', async (c) => {
  const { database, schema, table, column, alias, label, mapping } = await c.req.json();
  if (!database || !schema || !table || !column)
    return c.json({ error: 'database,schema,table,column required' }, 400);
  const actor = getActorKey(c.req.raw.headers);
  await runPostgresQuery(
    'insert into transform_aliases(database_name,schema_name,table_name,column_name,alias,label,mapping,updated_by,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) on conflict (database_name,schema_name,table_name,column_name) do update set alias=excluded.alias, label=excluded.label, mapping=excluded.mapping, updated_by=excluded.updated_by, updated_at=now()',
    [database, schema, table, column, alias ?? null, label ?? null, mapping ?? null, actor],
  );
  return c.json({ ok: true });
});

app.get('/transform/aliases', async (c) => {
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  const table = c.req.query('table');
  if (!db || !schema || !table) return c.json({ error: 'database,schema,table required' }, 400);
  const rows = await runPostgresQuery(
    'select * from transform_aliases where database_name=$1 and schema_name=$2 and table_name=$3 order by column_name',
    [db, schema, table],
  );
  return c.json(rows);
});

// Basic Orgs/Departments/Workspaces & Invites
app.get('/orgs', async (c) => {
  const rows = await runPostgresQuery('select * from orgs order by id desc');
  return c.json(rows);
});
app.post('/orgs', async (c) => {
  const { name } = await c.req.json();
  if (!name) return c.json({ error: 'name required' }, 400);
  const [row] = await runPostgresQuery('insert into orgs(name) values($1) returning *', [name]);
  await runPostgresQuery('insert into audit_logs(event, details) values($1,$2)', [
    'org_created',
    { id: row.id, name: row.name },
  ] as unknown[]);
  return c.json(row);
});
app.get('/departments', async (c) => {
  const orgId = c.req.query('orgId');
  const rows = await runPostgresQuery(
    'select * from departments where ($1::bigint is null or org_id = $1) order by id desc',
    [orgId ? Number(orgId) : null],
  );
  return c.json(rows);
});
app.post('/departments', async (c) => {
  const { orgId, name } = await c.req.json();
  if (!orgId || !name) return c.json({ error: 'orgId & name required' }, 400);
  const [row] = await runPostgresQuery(
    'insert into departments(org_id, name) values($1,$2) returning *',
    [orgId, name],
  );
  await runPostgresQuery('insert into audit_logs(event, details) values($1,$2)', [
    'department_created',
    { id: row.id, name: row.name, orgId: row.org_id },
  ] as unknown[]);
  return c.json(row);
});
app.get('/workspaces', async (c) => {
  const deptId = c.req.query('departmentId');
  const rows = await runPostgresQuery(
    'select * from workspaces where ($1::bigint is null or department_id = $1) order by id desc',
    [deptId ? Number(deptId) : null],
  );
  return c.json(rows);
});
app.post('/workspaces', async (c) => {
  const { departmentId, name } = await c.req.json();
  if (!departmentId || !name) return c.json({ error: 'departmentId & name required' }, 400);
  const [row] = await runPostgresQuery(
    'insert into workspaces(department_id, name) values($1,$2) returning *',
    [departmentId, name],
  );
  await runPostgresQuery('insert into audit_logs(event, details) values($1,$2)', [
    'workspace_created',
    { id: row.id, name: row.name, departmentId: row.department_id },
  ] as unknown[]);
  return c.json(row);
});
app.post('/invites', async (c) => {
  const { orgId, email, role, invitedBy } = await c.req.json();
  if (!orgId || !email || !role) return c.json({ error: 'orgId,email,role required' }, 400);
  const [row] = await runPostgresQuery(
    'insert into invites(org_id,email,role,invited_by) values($1,$2,$3,$4) returning *',
    [orgId, email, role, invitedBy ?? null],
  );
  await runPostgresQuery('insert into audit_logs(event, details) values($1,$2)', [
    'invite_created',
    { id: row.id, email: row.email, orgId: row.org_id, role: row.role },
  ] as unknown[]);
  return c.json(row);
});

// Governance: PII tags
app.post('/governance/pii/tag', async (c) => {
  const { database, schema, table, column, tag, masking } = await c.req.json();
  if (!database || !schema || !table || !column || !tag)
    return c.json({ error: 'database,schema,table,column,tag required' }, 400);
  await runPostgresQuery(
    'insert into catalog_pii(database_name,schema_name,table_name,column_name,tag,masking) values($1,$2,$3,$4,$5,$6) on conflict (database_name,schema_name,table_name,column_name) do update set tag=excluded.tag, masking=excluded.masking',
    [database, schema, table, column, tag, masking ?? null],
  );
  return c.json({ ok: true });
});

app.get('/governance/pii', async (c) => {
  const db = c.req.query('database');
  const schema = c.req.query('schema');
  const table = c.req.query('table');
  if (!db || !schema || !table) return c.json({ error: 'database,schema,table required' }, 400);
  const rows = await runPostgresQuery(
    'select * from catalog_pii where database_name=$1 and schema_name=$2 and table_name=$3 order by column_name',
    [db, schema, table],
  );
  return c.json(rows);
});

// Saved Queries
app.get('/explore/queries', async (c) => {
  const rows = await runPostgresQuery(
    'select * from saved_queries order by updated_at desc limit 200',
  );
  return c.json(rows);
});
app.post('/explore/queries', async (c) => {
  const { name, sql, tags, owner } = await c.req.json();
  if (!name || !sql) return c.json({ error: 'name & sql required' }, 400);
  const [row] = await runPostgresQuery(
    'insert into saved_queries(name, sql, tags, owner, created_at, updated_at) values($1,$2,$3,$4,now(),now()) returning *',
    [name, sql, tags ?? null, owner ?? null],
  );
  return c.json(row);
});

// CSV Export of posted data rows
app.post('/export/csv', async (c) => {
  const { rows, fields, filename } = await c.req.json();
  if (!Array.isArray(rows)) return c.json({ error: 'rows array required' }, 400);
  const cols =
    fields && Array.isArray(fields) && fields.length > 0 ? fields : Object.keys(rows[0] || {});
  const header = cols.join(',');
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [
    header,
    ...rows.map((r: Record<string, unknown>) => cols.map((k) => esc(r[k])).join(',')),
  ].join('\n');
  // Audit log
  if (hasPgConfig()) {
    try {
      await runPostgresQuery('insert into audit_logs(event, details) values($1,$2)', [
        'export_csv',
        { filename: filename || 'export.csv', rows: rows.length },
      ] as unknown[]);
    } catch {}
  }
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename || 'export'}.csv"`,
    },
  });
  // Mark as success for metrics
  try { exporterSuccess.labels('csv').inc(); } catch {}
});

// ETL status streaming via SSE
app.get('/etl/stream', async () => {
  const stream = new ReadableStream({
    start(controller) {
      const onEvent = (event: Record<string, unknown>) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      };
      const keepalive = setInterval(() => controller.enqueue(`: keepalive\n\n`), 25000);
      etlEvents.on('event', onEvent);
      // send initial hello
      onEvent({ type: 'hello' });
      return () => {
        etlEvents.off('event', onEvent);
        clearInterval(keepalive);
        controller.close();
      };
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

async function main() {
  if (hasPgConfig()) {
    await runMigrations();
  } else {
    logger.warn(
      { event: 'postgres_env_not_configured' },
      'Postgres env not configured; skipping catalog DB migrations',
    );
  }

  // Initialize Stripe client if billing is enabled
  if (process.env.BILLING_ENABLED === 'true' && process.env.STRIPE_SECRET_KEY) {
    try {
      initializeStripeClient({
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        apiVersion: '2024-12-18.acacia',
      });
      logger.info({ event: 'stripe_initialized' }, 'Stripe client initialized');
    } catch (error) {
      logger.error({ 
        error: (error as Error).message,
        event: 'stripe_init_failed' 
      }, 'Failed to initialize Stripe client');
    }
  }

  // Initialize cache warmer
  try {
    await cacheWarmer.initialize();
    logger.info({ event: 'cache_warmer_initialized' }, 'Cache warmer initialized');
  } catch (error) {
    logger.error({ 
      error: (error as Error).message,
      event: 'cache_warmer_init_failed' 
    }, 'Failed to initialize cache warmer');
  }

  // Initialize schedule manager
  try {
    await startScheduleManager();
    logger.info({ event: 'schedule_manager_initialized' }, 'Schedule manager initialized');
  } catch (error) {
    logger.error({ 
      error: (error as Error).message,
      event: 'schedule_manager_init_failed' 
    }, 'Failed to initialize schedule manager');
  }

  // Simple cron reloader: every 5 minutes, refresh active schedules
  cron.schedule('*/5 * * * *', async () => {
    try {
      if (!hasPgConfig()) return;
      const schedules = await runPostgresQuery<{
        id: number;
        database_name: string;
        schema_name: string;
        cron: string;
        active: boolean;
      }>('select * from etl_schedules where active = true');
      for (const s of schedules) {
        emitEtl({ type: 'schedule_tick', scheduleId: s.id });
        await upsertCatalogViaDiscovery(s.database_name, s.schema_name);
        
        // Invalidate related cache after ETL completion
        try {
          await cacheInvalidator.invalidateByTable(
            s.database_name,
            s.schema_name,
            '*',
            'etl_scheduled_update'
          );
        } catch (cacheError) {
          logger.warn({ 
            error: (cacheError as Error).message,
            scheduleId: s.id
          }, 'Failed to invalidate cache after ETL');
        }
      }
    } catch (e) {
      logError(etlLogger, e, { event: 'cron_error' });
    }
  });

  // Cache cleanup cron job: every hour, clean up expired entries
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await cacheInvalidator.cleanupExpired();
      logger.info({ 
        ...result,
        event: 'scheduled_cache_cleanup' 
      }, 'Scheduled cache cleanup completed');
    } catch (error) {
      logger.error({ 
        error: (error as Error).message,
        event: 'scheduled_cache_cleanup_error' 
      }, 'Scheduled cache cleanup failed');
    }
  });

  const port = Number(process.env.PORT || 3001);
  serve({ fetch: app.fetch, port });
  logger.info({ port, event: 'server_start' }, 'API server started');
}

async function upsertCatalogViaDiscovery(
  database: string,
  schema: string,
  onPhase?: (phase: string) => Promise<void> | void,
) {
  onPhase?.('list_entities');
  const [tables, views, fks] = await Promise.all([
    discovery.listTables(database, schema),
    discovery.listViews(database, schema),
    discovery.listForeignKeys(database, schema),
  ]);
  onPhase?.('list_columns');
  const columnsByTable: Record<
    string,
    { COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }[]
  > = {};
  for (const t of [...tables.map((t) => t.TABLE_NAME), ...views.map((v) => v.TABLE_NAME)]) {
    columnsByTable[t] = await discovery.listColumns(database, schema, t);
  }
  onPhase?.('infer_relationships');
  const inferred = inferRelationships(
    [...tables.map((t) => t.TABLE_NAME), ...views.map((v) => v.TABLE_NAME)],
    columnsByTable,
    fks,
  );
  onPhase?.('persist');
  await upsertCatalog(database, schema, {
    tables,
    views,
    columnsByTable,
    foreignKeys: [...fks, ...inferred],
  });
}

function inferRelationships(
  tableNames: string[],
  columnsByTable: Record<string, { COLUMN_NAME: string }[]>,
  existing: { TABLE_NAME: string; COLUMN_NAME: string }[],
): {
  CONSTRAINT_NAME: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
}[] {
  const existingSet = new Set(existing.map((e) => `${e.TABLE_NAME}.${e.COLUMN_NAME}`));
  const lowerSet = new Set(tableNames.map((t) => t.toLowerCase()));
  const results: {
    CONSTRAINT_NAME: string;
    TABLE_NAME: string;
    COLUMN_NAME: string;
    REFERENCED_TABLE_NAME: string;
    REFERENCED_COLUMN_NAME: string;
  }[] = [];
  for (const t of tableNames) {
    const cols = columnsByTable[t] || [];
    for (const c of cols) {
      const name = c.COLUMN_NAME.toLowerCase();
      const base = name.replace(/_?id$/, '');
      if (base === name) continue;
      const possible = [base, `${base}s`, `${base}es`];
      const target = possible.find((p) => lowerSet.has(p));
      if (!target) continue;
      const refTable = tableNames.find((x) => x.toLowerCase() === target)!;
      if (existingSet.has(`${t}.${c.COLUMN_NAME}`)) continue;
      const refCols = columnsByTable[refTable] || [];
      const refCol =
        refCols.find((cc) => cc.COLUMN_NAME.toLowerCase() === 'id')?.COLUMN_NAME ||
        refCols[0]?.COLUMN_NAME ||
        'ID';
      results.push({
        CONSTRAINT_NAME: `inferred_${t}_${c.COLUMN_NAME}_fk`,
        TABLE_NAME: t,
        COLUMN_NAME: c.COLUMN_NAME,
        REFERENCED_TABLE_NAME: refTable,
        REFERENCED_COLUMN_NAME: refCol,
      });
    }
  }
  return results;
}

main().catch((err) => {
  logError(logger, err, { event: 'main_error' });
  process.exit(1);
});
