import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { dbLogger, logError, logger } from './logger.js';
import { withRetry } from '@sme/utils';

// Load env from local .env and also try monorepo root .env
dotenv.config();
const rootEnvPath = path.resolve(process.cwd(), '..', '..', '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const connectionString = process.env.DATABASE_URL;

const pool = new pg.Pool(
  connectionString
    ? {
        connectionString,
        max: 20, // maximum number of clients in the pool
        idleTimeoutMillis: 30000, // how long a client is allowed to remain idle
        connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection cannot be established
        maxUses: 7500, // close (and replace) a connection after it has been used this many times
      }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        maxUses: 7500,
      },
);

// Add error handling for the pool
pool.on('error', (err) => {
  logError(dbLogger, err, { event: 'pool_error' });
});

pool.on('connect', () => {
  dbLogger.debug({ event: 'client_connected' }, 'New PostgreSQL client connected');
});

pool.on('remove', () => {
  dbLogger.debug({ event: 'client_removed' }, 'PostgreSQL client removed from pool');
});

// note: duplicates consolidated via @sme/utils/withRetry

export async function runPostgresQuery<T = unknown>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return await withRetry(async () => {
    const client = await pool.connect();
    try {
      const res = await client.query(text, params);
      return res.rows as T[];
    } catch (error) {
      logError(dbLogger, error, {
        event: 'query_error',
        query: text,
        paramCount: params.length,
      });
      throw error;
    } finally {
      client.release();
    }
  }, {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    isRetryable: (error) => error instanceof Error && (
      error.message.includes('ECONNRESET') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('connection terminated') ||
      error.message.includes('Connection terminated')
    ),
    onRetry: ({ attempt, error, nextDelayMs }) => {
      dbLogger.warn({ attempt, error: (error as Error).message, delay: nextDelayMs }, 'PostgreSQL operation failed, retrying');
    }
  });
}

export function getPool(): pg.Pool {
  return pool;
}

export function hasPgConfig(): boolean {
  if (connectionString) return true;
  return !!(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER);
}

export async function runMigrations() {
  await runPostgresQuery(`create table if not exists catalog_databases (
    name text primary key
  )`);
  await runPostgresQuery(`create table if not exists catalog_schemas (
    database_name text not null,
    schema_name text not null,
    primary key (database_name, schema_name)
  )`);
  await runPostgresQuery(`create table if not exists catalog_tables (
    database_name text not null,
    schema_name text not null,
    table_name text not null,
    table_type text not null,
    table_owner text,
    last_altered timestamptz,
    refreshed_at timestamptz not null default now(),
    freshness_seconds int,
    primary key (database_name, schema_name, table_name)
  )`);
  // Additive migrations for catalog_tables new columns
  await runPostgresQuery('alter table catalog_tables add column if not exists table_owner text');
  await runPostgresQuery(
    'alter table catalog_tables add column if not exists last_altered timestamptz',
  );
  await runPostgresQuery(
    'alter table catalog_tables add column if not exists refreshed_at timestamptz default now()',
  );
  await runPostgresQuery('alter table catalog_tables alter column refreshed_at set not null');
  await runPostgresQuery(
    'alter table catalog_tables add column if not exists freshness_seconds int',
  );
  await runPostgresQuery(`create table if not exists catalog_columns (
    database_name text not null,
    schema_name text not null,
    table_name text not null,
    column_name text not null,
    data_type text not null,
    is_nullable text not null,
    ordinal_position serial,
    primary key (database_name, schema_name, table_name, column_name)
  )`);
  await runPostgresQuery(`create table if not exists catalog_foreign_keys (
    database_name text not null,
    schema_name text not null,
    table_name text not null,
    column_name text not null,
    referenced_table_name text not null,
    referenced_column_name text not null,
    constraint_name text not null,
    primary key (database_name, schema_name, table_name, column_name, constraint_name)
  )`);
  await runPostgresQuery(`create table if not exists schema_changes (
    id bigserial primary key,
    at timestamptz not null default now(),
    database_name text not null,
    schema_name text not null,
    table_name text not null,
    column_name text,
    change_type text not null -- added|removed|modified
  )`);
  await runPostgresQuery(`create table if not exists transform_aliases (
    database_name text not null,
    schema_name text not null,
    table_name text not null,
    column_name text not null,
    alias text,
    label text,
    mapping jsonb,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (database_name, schema_name, table_name, column_name)
  )`);
  await runPostgresQuery('alter table transform_aliases add column if not exists updated_by text');
  await runPostgresQuery(
    'alter table transform_aliases add column if not exists created_at timestamptz default now()',
  );
  await runPostgresQuery('alter table transform_aliases alter column created_at set not null');
  await runPostgresQuery(
    'alter table transform_aliases add column if not exists updated_at timestamptz default now()',
  );
  await runPostgresQuery('alter table transform_aliases alter column updated_at set not null');
  await runPostgresQuery(`create table if not exists etl_schedules (
    id bigserial primary key,
    database_name text not null,
    schema_name text not null,
    cron text not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await runPostgresQuery(`create table if not exists etl_runs (
    id bigserial primary key,
    schedule_id bigint,
    database_name text not null,
    schema_name text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running',
    rows_processed int default 0,
    error text
  )`);
  await runPostgresQuery(`create table if not exists etl_run_logs (
    id bigserial primary key,
    run_id bigint not null,
    at timestamptz not null default now(),
    level text not null default 'info',
    message text not null
  )`);

  // Orgs / Departments / Workspaces, Users, Memberships, Invites, Shares, Audit
  await runPostgresQuery(`create table if not exists orgs (
    id bigserial primary key,
    name text not null,
    created_at timestamptz not null default now()
  )`);
  await runPostgresQuery(`create table if not exists departments (
    id bigserial primary key,
    org_id bigint not null,
    name text not null,
    created_at timestamptz not null default now()
  )`);
  await runPostgresQuery(`create table if not exists workspaces (
    id bigserial primary key,
    department_id bigint not null,
    name text not null,
    created_at timestamptz not null default now()
  )`);
  await runPostgresQuery(`create table if not exists users (
    id bigserial primary key,
    email text unique,
    name text,
    password_hash text,
    email_verified boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  // Add new columns to existing users table
  await runPostgresQuery('alter table users add column if not exists password_hash text');
  await runPostgresQuery(
    'alter table users add column if not exists email_verified boolean default false',
  );
  await runPostgresQuery('alter table users alter column email_verified set not null');
  await runPostgresQuery(
    'alter table users add column if not exists updated_at timestamptz default now()',
  );
  await runPostgresQuery('alter table users alter column updated_at set not null');

  await runPostgresQuery(`create table if not exists password_reset_tokens (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    token text not null unique,
    expires_at timestamptz not null,
    used boolean not null default false,
    created_at timestamptz not null default now()
  )`);

  await runPostgresQuery(`create table if not exists oauth_accounts (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    provider text not null, -- google, microsoft, etc.
    provider_account_id text not null,
    access_token text,
    refresh_token text,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(provider, provider_account_id)
  )`);

  await runPostgresQuery(`create table if not exists user_sessions (
    id text primary key,
    user_id bigint not null references users(id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  )`);

  await runPostgresQuery(`create table if not exists memberships (
    user_id bigint not null,
    org_id bigint,
    department_id bigint,
    workspace_id bigint,
    role text not null,
    primary key (user_id, coalesce(org_id,0), coalesce(department_id,0), coalesce(workspace_id,0))
  )`);
  await runPostgresQuery(`create table if not exists invites (
    id bigserial primary key,
    org_id bigint not null,
    email text not null,
    role text not null,
    invited_by text,
    status text not null default 'pending',
    created_at timestamptz not null default now()
  )`);
  await runPostgresQuery(`create table if not exists shares (
    id bigserial primary key,
    scope text not null, -- org|department|user
    scope_id text not null,
    resource_type text not null,
    resource_id text not null,
    role text not null, -- viewer|editor
    created_at timestamptz not null default now()
  )`);
  await runPostgresQuery(`create table if not exists audit_logs (
    id bigserial primary key,
    at timestamptz not null default now(),
    actor text,
    event text not null,
    details jsonb
  )`);

  // Saved queries and semantic models
  await runPostgresQuery(`create table if not exists saved_queries (
    id bigserial primary key,
    owner text,
    name text not null,
    tags text[],
    sql text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await runPostgresQuery(`create table if not exists semantic_models (
    id bigserial primary key,
    kind text not null, -- metric|dimension
    name text not null,
    version text not null,
    body jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);

  // Governance: PII tags and RLS policies
  await runPostgresQuery(`create table if not exists catalog_pii (
    database_name text not null,
    schema_name text not null,
    table_name text not null,
    column_name text not null,
    tag text not null, -- email|ssn|phone|name|address|custom
    masking text, -- null|hash|redact|partial
    primary key (database_name, schema_name, table_name, column_name)
  )`);
  await runPostgresQuery(`create table if not exists rls_policies (
    id bigserial primary key,
    database_name text not null,
    schema_name text not null,
    table_name text not null,
    policy_sql text not null,
    enabled boolean not null default true,
    created_at timestamptz not null default now()
  )`);

  // Data connector configurations
  await runPostgresQuery(`create table if not exists connector_configurations (
    id text primary key,
    name text not null,
    type text not null,
    config jsonb not null,
    auth_config jsonb not null,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by text,
    updated_by text
  )`);

  // Add new columns to existing connector_configurations table if they exist
  await runPostgresQuery(
    'alter table connector_configurations add column if not exists updated_by text',
  );

  await runPostgresQuery(`create table if not exists connector_test_results (
    id bigserial primary key,
    connector_id text not null references connector_configurations(id) on delete cascade,
    success boolean not null,
    message text,
    latency_ms int,
    version text,
    tested_at timestamptz not null default now(),
    tested_by text
  )`);

  // RBAC System Tables
  await runPostgresQuery(`create table if not exists roles (
    id bigserial primary key,
    name text unique not null,
    description text,
    permissions jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);

  await runPostgresQuery(`create table if not exists user_roles (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    role_id bigint not null references roles(id) on delete cascade,
    org_id bigint references orgs(id) on delete cascade,
    department_id bigint references departments(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, role_id, coalesce(org_id, 0), coalesce(department_id, 0))
  )`);

  // Insert default roles with predefined permissions
  await runPostgresQuery(
    `
    insert into roles (name, description, permissions) values 
    ('Owner', 'Full system access with admin privileges', $1),
    ('Admin', 'Administrative access to manage users and settings', $2),
    ('Editor', 'Can edit and create content within assigned scope', $3),
    ('Viewer', 'Read-only access to view content within assigned scope', $4)
    on conflict (name) do update set 
      description = excluded.description,
      permissions = excluded.permissions,
      updated_at = now()
  `,
    [
      JSON.stringify([
        'system:admin',
        'users:manage',
        'roles:manage',
        'orgs:manage',
        'departments:manage',
        'workspaces:manage',
        'data:read',
        'data:write',
        'data:delete',
        'governance:manage',
        'reports:manage',
        'exports:manage',
      ]),
      JSON.stringify([
        'users:manage',
        'roles:assign',
        'orgs:read',
        'departments:manage',
        'workspaces:manage',
        'data:read',
        'data:write',
        'governance:read',
        'reports:manage',
        'exports:manage',
      ]),
      JSON.stringify([
        'data:read',
        'data:write',
        'reports:create',
        'reports:edit',
        'exports:create',
        'governance:read',
      ]),
      JSON.stringify(['data:read', 'reports:view', 'exports:view']),
    ],
  );

  // Enhanced sharing system migrations
  // Drop the old basic shares table and replace with resource_shares
  await runPostgresQuery('DROP TABLE IF EXISTS shares');
  
  await runPostgresQuery(`CREATE TABLE IF NOT EXISTS resource_shares (
    id BIGSERIAL PRIMARY KEY,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    share_type TEXT NOT NULL,
    share_with_id BIGINT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '["view"]'::jsonb,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(resource_type, resource_id, share_type, share_with_id)
  )`);

  // Create indexes for resource_shares if they don't exist
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_resource_shares_resource 
    ON resource_shares(resource_type, resource_id)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_resource_shares_recipient 
    ON resource_shares(share_type, share_with_id)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_resource_shares_created_by 
    ON resource_shares(created_by)`);

  // Create share_invitations table
  await runPostgresQuery(`CREATE TABLE IF NOT EXISTS share_invitations (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    org_id BIGINT REFERENCES orgs(id) ON DELETE CASCADE,
    department_id BIGINT REFERENCES departments(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ NULL,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_for_resource_type TEXT,
    invited_for_resource_id TEXT,
    invitation_message TEXT
  )`);

  // Create indexes for share_invitations if they don't exist
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_share_invitations_email 
    ON share_invitations(email)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_share_invitations_token 
    ON share_invitations(token)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_share_invitations_org 
    ON share_invitations(org_id)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_share_invitations_dept 
    ON share_invitations(department_id)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_share_invitations_expires 
    ON share_invitations(expires_at)`);

  // Natural Language to SQL (NL2SQL) system tables
  await runPostgresQuery(`CREATE TABLE IF NOT EXISTS nl_queries (
    id BIGSERIAL PRIMARY KEY,
    natural_language TEXT NOT NULL,
    generated_sql TEXT NOT NULL,
    validated BOOLEAN NOT NULL DEFAULT false,
    executed BOOLEAN NOT NULL DEFAULT false,
    execution_success BOOLEAN,
    execution_error TEXT,
    execution_time_ms INTEGER,
    row_count INTEGER,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    database_name TEXT,
    schema_name TEXT,
    confidence_score REAL,
    feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await runPostgresQuery(`CREATE TABLE IF NOT EXISTS query_allowlists (
    id BIGSERIAL PRIMARY KEY,
    database_name TEXT NOT NULL,
    schema_name TEXT,
    table_name TEXT,
    column_name TEXT,
    allowed BOOLEAN NOT NULL DEFAULT true,
    reason TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(database_name, COALESCE(schema_name, ''), COALESCE(table_name, ''), COALESCE(column_name, ''))
  )`);

  await runPostgresQuery(`CREATE TABLE IF NOT EXISTS query_denylists (
    id BIGSERIAL PRIMARY KEY,
    pattern TEXT NOT NULL,
    pattern_type TEXT NOT NULL DEFAULT 'regex', -- regex, sql_keyword, table_name, column_name
    reason TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'high', -- low, medium, high, critical
    active BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await runPostgresQuery(`CREATE TABLE IF NOT EXISTS nl2sql_cost_estimates (
    id BIGSERIAL PRIMARY KEY,
    query_id BIGINT NOT NULL REFERENCES nl_queries(id) ON DELETE CASCADE,
    estimated_bytes_scanned BIGINT,
    estimated_cost_usd DECIMAL(10,4),
    actual_bytes_scanned BIGINT,
    actual_cost_usd DECIMAL(10,4),
    warehouse_size TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  // Create indexes for NL2SQL tables
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_nl_queries_user_id 
    ON nl_queries(user_id)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_nl_queries_created_at 
    ON nl_queries(created_at DESC)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_nl_queries_database_schema 
    ON nl_queries(database_name, schema_name)`);
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_nl_queries_executed 
    ON nl_queries(executed, execution_success)`);
  
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_query_allowlists_database 
    ON query_allowlists(database_name, schema_name, table_name)`);
  
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_query_denylists_active 
    ON query_denylists(active, severity)`);
  
  await runPostgresQuery(`CREATE INDEX IF NOT EXISTS idx_nl2sql_cost_estimates_query_id 
    ON nl2sql_cost_estimates(query_id)`);

  // Insert default denylist patterns for security
  await runPostgresQuery(`
    INSERT INTO query_denylists (pattern, pattern_type, reason, severity) VALUES
    ('DROP\\s+', 'regex', 'Prevent DROP statements', 'critical'),
    ('DELETE\\s+(?!.*(WHERE|LIMIT))', 'regex', 'Prevent DELETE without WHERE clause', 'critical'),
    ('UPDATE\\s+(?!.*WHERE)', 'regex', 'Prevent UPDATE without WHERE clause', 'critical'),
    ('TRUNCATE\\s+', 'regex', 'Prevent TRUNCATE statements', 'critical'),
    ('ALTER\\s+', 'regex', 'Prevent ALTER statements', 'high'),
    ('CREATE\\s+', 'regex', 'Prevent CREATE statements', 'high'),
    ('EXEC\\s+|EXECUTE\\s+', 'regex', 'Prevent stored procedure execution', 'high'),
    ('--', 'sql_keyword', 'Prevent SQL comment injection', 'medium'),
    (';\\s*--', 'regex', 'Prevent comment-based SQL injection', 'high'),
    ('UNION\\s+(?!.*ORDER\\s+BY)', 'regex', 'Prevent UNION-based SQL injection', 'high')
    ON CONFLICT DO NOTHING
  `);

  // Run governance system migration
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationPath = path.join(__dirname, 'db/migrations/003_governance_system.sql');
    
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        await runPostgresQuery(statement);
      }
    }
    
    logger.info('Governance system migration completed');
  } catch (error) {
    logger.warn('Governance system migration failed, will continue without governance features', { error });
  }
}

export async function upsertCatalog(
  database: string,
  schema: string,
  data: {
    tables: {
      TABLE_NAME: string;
      TABLE_TYPE: string;
      LAST_ALTERED?: string;
      TABLE_OWNER?: string;
    }[];
    views: { TABLE_NAME: string; LAST_ALTERED?: string; TABLE_OWNER?: string }[];
    columnsByTable: Record<
      string,
      { COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }[]
    >;
    foreignKeys: {
      CONSTRAINT_NAME: string;
      TABLE_NAME: string;
      COLUMN_NAME: string;
      REFERENCED_TABLE_NAME: string;
      REFERENCED_COLUMN_NAME: string;
    }[];
  },
) {
  await runPostgresQuery(
    'delete from catalog_foreign_keys where database_name=$1 and schema_name=$2',
    [database, schema],
  );
  await runPostgresQuery('delete from catalog_columns where database_name=$1 and schema_name=$2', [
    database,
    schema,
  ]);
  await runPostgresQuery('delete from catalog_tables where database_name=$1 and schema_name=$2', [
    database,
    schema,
  ]);
  await runPostgresQuery('insert into catalog_databases(name) values($1) on conflict do nothing', [
    database,
  ]);
  await runPostgresQuery(
    'insert into catalog_schemas(database_name, schema_name) values($1,$2) on conflict do nothing',
    [database, schema],
  );

  for (const t of data.tables) {
    const lastAltered = t.LAST_ALTERED ? new Date(t.LAST_ALTERED) : null;
    const freshnessSeconds = lastAltered
      ? Math.floor((Date.now() - lastAltered.getTime()) / 1000)
      : null;
    await runPostgresQuery(
      'insert into catalog_tables(database_name,schema_name,table_name,table_type,table_owner,last_altered,refreshed_at,freshness_seconds) values($1,$2,$3,$4,$5,$6,now(),$7) on conflict (database_name,schema_name,table_name) do update set table_type=excluded.table_type, table_owner=excluded.table_owner, last_altered=excluded.last_altered, refreshed_at=now(), freshness_seconds=excluded.freshness_seconds',
      [
        database,
        schema,
        t.TABLE_NAME,
        t.TABLE_TYPE,
        t.TABLE_OWNER ?? null,
        lastAltered,
        freshnessSeconds,
      ],
    );
  }
  for (const v of data.views) {
    const lastAltered = v.LAST_ALTERED ? new Date(v.LAST_ALTERED) : null;
    const freshnessSeconds = lastAltered
      ? Math.floor((Date.now() - lastAltered.getTime()) / 1000)
      : null;
    await runPostgresQuery(
      'insert into catalog_tables(database_name,schema_name,table_name,table_type,table_owner,last_altered,refreshed_at,freshness_seconds) values($1,$2,$3,$4,$5,$6,now(),$7) on conflict (database_name,schema_name,table_name) do update set table_type=excluded.table_type, table_owner=excluded.table_owner, last_altered=excluded.last_altered, refreshed_at=now(), freshness_seconds=excluded.freshness_seconds',
      [
        database,
        schema,
        v.TABLE_NAME,
        'VIEW',
        v.TABLE_OWNER ?? null,
        lastAltered,
        freshnessSeconds,
      ],
    );
  }
  for (const [table, cols] of Object.entries(data.columnsByTable)) {
    for (const c of cols) {
      await runPostgresQuery(
        'insert into catalog_columns(database_name,schema_name,table_name,column_name,data_type,is_nullable) values($1,$2,$3,$4,$5,$6) on conflict (database_name,schema_name,table_name,column_name) do update set data_type=excluded.data_type, is_nullable=excluded.is_nullable',
        [database, schema, table, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE],
      );
    }
  }
  for (const fk of data.foreignKeys) {
    await runPostgresQuery(
      'insert into catalog_foreign_keys(database_name,schema_name,table_name,column_name,referenced_table_name,referenced_column_name,constraint_name) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',
      [
        database,
        schema,
        fk.TABLE_NAME,
        fk.COLUMN_NAME,
        fk.REFERENCED_TABLE_NAME,
        fk.REFERENCED_COLUMN_NAME,
        fk.CONSTRAINT_NAME,
      ],
    );
  }
}
