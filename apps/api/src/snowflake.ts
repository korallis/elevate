import dotenv from 'dotenv';
import snowflake from 'snowflake-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { dbLogger, logError } from './logger.js';
import { withRetry } from '@sme/utils';
// optional key-pair auth via PEM string

// Load env from local .env and also try monorepo root .env
dotenv.config();
const rootEnvPath = path.resolve(process.cwd(), '..', '..', '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

type QueryResultRow = Record<string, unknown>;

const cfg = {
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USER,
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  role: process.env.SNOWFLAKE_ROLE,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
};

function loadPrivateKeyPEM(): string | undefined {
  const pem = process.env.SNOWFLAKE_PRIVATE_KEY;
  const p = process.env.SNOWFLAKE_PRIVATE_KEY_PATH;
  if (pem) return pem;
  if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return undefined;
}

// note: duplicates consolidated via @sme/utils/withRetry

function getConnection() {
  if (!cfg.account || !cfg.username || !cfg.password || !cfg.warehouse) {
    // allow key pair auth without password if private key provided
    const pk = loadPrivateKeyPEM();
    if (!(cfg.account && cfg.username && pk && cfg.warehouse)) {
      throw new Error('Missing Snowflake env (see .env.example)');
    }
    return snowflake.createConnection({
      account: cfg.account!,
      username: cfg.username!,
      privateKey: pk,
      warehouse: cfg.warehouse!,
      role: cfg.role,
      database: cfg.database,
      schema: cfg.schema,
      timeout: 60000, // 60 second timeout
    });
  }
  return snowflake.createConnection({
    account: cfg.account!,
    username: cfg.username!,
    password: cfg.password!,
    warehouse: cfg.warehouse!,
    role: cfg.role,
    database: cfg.database,
    schema: cfg.schema,
    timeout: 60000, // 60 second timeout
  });
}

export async function runSnowflakeQuery<T = QueryResultRow>(
  sql: string,
  binds: unknown[] = [],
): Promise<T[]> {
  return await withRetry(async () => {
    const connection = getConnection();

    try {
      await new Promise<void>((resolve, reject) =>
        connection.connect((err) => {
          if (err) {
            logError(dbLogger, err, { event: 'snowflake_connection_error' });
            return reject(err);
          }
          dbLogger.debug({ event: 'snowflake_connected' }, 'Snowflake connection established');
          resolve();
        }),
      );

      const rows = await new Promise<T[]>((resolve, reject) => {
        connection.execute({
          sqlText: sql,
          binds,
          complete: (err, stmt, rowsParam) => {
            if (err) {
              logError(dbLogger, err, {
                event: 'snowflake_query_error',
                query: sql,
                bindCount: binds.length,
              });
              return reject(err);
            }
            const arr = (rowsParam ?? []) as T[];
            dbLogger.debug(
              {
                event: 'snowflake_query_success',
                rowCount: arr.length,
                query: sql.substring(0, 100), // Log only first 100 chars for brevity
              },
              'Snowflake query executed successfully',
            );
            resolve(arr);
          },
        });
      });
      return rows;
    } finally {
      connection.destroy((/*err*/) => {});
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
      error.message.includes('Network error') ||
      error.message.includes('Connection timeout') ||
      error.message.includes('Service temporarily unavailable')
    ),
    onRetry: ({ attempt, error, nextDelayMs }) => {
      dbLogger.warn({ attempt, error: (error as Error).message, delay: nextDelayMs }, 'Snowflake operation failed, retrying');
    }
  });
}

export async function testConnection(): Promise<boolean> {
  const rows = await runSnowflakeQuery<{ ONE: number }>('select 1 as ONE');
  return rows?.[0]?.ONE === 1;
}

export const discovery = {
  listDatabases: () => runSnowflakeQuery<{ NAME: string }>('show databases'),
  listSchemas: (database: string) =>
    runSnowflakeQuery<{ SCHEMA_NAME: string }>(
      `select schema_name from ${database}.information_schema.schemata order by schema_name`,
    ),
  listTables: (database: string, schema: string) =>
    runSnowflakeQuery<{ TABLE_NAME: string; TABLE_TYPE: string; LAST_ALTERED?: string }>(
      `select table_name, table_type, last_altered as LAST_ALTERED from ${database}.information_schema.tables where table_schema = ? order by table_name`,
      [schema],
    ),
  listViews: (database: string, schema: string) =>
    runSnowflakeQuery<{ TABLE_NAME: string; LAST_ALTERED?: string }>(
      `select table_name, last_altered as LAST_ALTERED from ${database}.information_schema.views where table_schema = ? order by table_name`,
      [schema],
    ),
  listColumns: (database: string, schema: string, table: string) =>
    runSnowflakeQuery<{ COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>(
      `select column_name, data_type, is_nullable from ${database}.information_schema.columns where table_schema = ? and table_name = ? order by ordinal_position`,
      [schema, table],
    ),
  listForeignKeys: (database: string, schema: string) =>
    runSnowflakeQuery<{
      CONSTRAINT_NAME: string;
      TABLE_NAME: string;
      COLUMN_NAME: string;
      REFERENCED_TABLE_NAME: string;
      REFERENCED_COLUMN_NAME: string;
    }>(
      `select tc.constraint_name as CONSTRAINT_NAME,
              kcu.table_name as TABLE_NAME,
              kcu.column_name as COLUMN_NAME,
              ccu.table_name as REFERENCED_TABLE_NAME,
              ccu.column_name as REFERENCED_COLUMN_NAME
         from ${database}.information_schema.table_constraints tc
         join ${database}.information_schema.key_column_usage kcu
           on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
         join ${database}.information_schema.constraint_column_usage ccu
           on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema = ?
        order by tc.constraint_name, kcu.table_name, kcu.ordinal_position`,
      [schema],
    ),
};
