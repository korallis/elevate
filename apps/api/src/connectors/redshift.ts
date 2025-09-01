import pg from 'pg';
import { BaseConnector } from './base.js';
import {
  AuthConfig,
  ConnectionTestResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  QueryResult,
  ConnectionError,
  QueryError,
} from './types.js';

export class RedshiftConnector extends BaseConnector {
  readonly type = 'redshift' as const;
  readonly name = 'Amazon Redshift';
  readonly version = '1.0.0';

  private client: pg.Client | null = null;

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      this.validateConfig(config, ['host', 'user', 'password', 'database']);

      const testClient = this.createClient(config);
      await testClient.connect();

      // Test with a simple query
      const result = await testClient.query('SELECT 1 as test');

      await testClient.end();

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        latencyMs,
        version: await this.getVersionFromClient(testClient),
        message: 'Connection successful',
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async connect(config: AuthConfig): Promise<void> {
    if (this.connected) {
      return;
    }

    this.validateConfig(config, ['host', 'user', 'password', 'database']);

    try {
      this.client = this.createClient(config);
      await this.client.connect();
      this.connected = true;
      this.connectionConfig = config;
      this.logConnection('Connected');
    } catch (error) {
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to Redshift',
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.connected = false;
      this.client = null;
      this.connectionConfig = undefined;
      this.logConnection('Disconnected');
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery(`
      SELECT datname as name 
      FROM pg_database 
      WHERE datistemplate = false 
      ORDER BY datname
    `);

    return result.rows.map((row) => ({
      name: row.name,
      type: 'database',
    }));
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    const result = await this.executeQuery(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1')
        AND schema_name NOT LIKE 'pg_temp_%'
        AND schema_name NOT LIKE 'pg_toast_temp_%'
      ORDER BY schema_name
    `);

    return result.rows.map((row) => ({
      name: row.schema_name,
      database: database || this.connectionConfig?.credentials?.database,
    }));
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    const schemaName = schema || 'public';

    const result = await this.executeQuery(
      `
      SELECT t.table_name, t.table_type,
             s.size_in_mb,
             s.sortkey1,
             s.distkey
      FROM information_schema.tables t
      LEFT JOIN (
        SELECT schemaname, tablename,
               size / (1024 * 1024) as size_in_mb,
               sortkey1,
               distkey
        FROM pg_table_def 
        WHERE schemaname = $1
      ) s ON s.schemaname = t.table_schema AND s.tablename = t.table_name
      WHERE t.table_schema = $1
      ORDER BY t.table_name
    `,
      [schemaName],
    );

    return result.rows.map((row) => ({
      name: row.table_name,
      type: row.table_type === 'BASE TABLE' ? 'TABLE' : 'VIEW',
      schema: schemaName,
      database: database || this.connectionConfig?.credentials?.database,
    }));
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.executeQuery(
      `
      SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
             c.character_maximum_length, c.numeric_precision, c.numeric_scale,
             c.ordinal_position,
             CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
             td.distkey,
             td.sortkey,
             td.encoding
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1 
          AND tc.table_name = $2
      ) pk ON pk.column_name = c.column_name
      LEFT JOIN (
        SELECT schemaname, tablename, column as column_name, distkey, sortkey, encoding
        FROM pg_table_def
        WHERE schemaname = $1 AND tablename = $2
      ) td ON td.column_name = c.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `,
      [schema, table],
    );

    return result.rows.map((row) => ({
      name: row.column_name,
      type: this.mapColumnType(row.data_type),
      nullable: row.is_nullable === 'YES',
      primaryKey: row.is_primary_key,
      defaultValue: row.column_default,
      maxLength: row.character_maximum_length,
      precision: row.numeric_precision,
      scale: row.numeric_scale,
    }));
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    const schemaName = schema || 'public';

    const result = await this.executeQuery(
      `
      SELECT tc.constraint_name,
             kcu.table_name,
             kcu.column_name,
             ccu.table_name as referenced_table_name,
             ccu.column_name as referenced_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
      ORDER BY tc.constraint_name, kcu.table_name, kcu.ordinal_position
    `,
      [schemaName],
    );

    return result.rows.map((row) => ({
      constraintName: row.constraint_name,
      fromTable: row.table_name,
      fromColumn: row.column_name,
      toTable: row.referenced_table_name,
      toColumn: row.referenced_column_name,
    }));
  }

  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.connected || !this.client) {
      throw new ConnectionError('Not connected to Redshift');
    }

    const startTime = Date.now();

    try {
      const result = await this.client.query(sql, params);
      const executionTimeMs = Date.now() - startTime;

      const columns = result.fields ? result.fields.map((field) => field.name) : [];

      return {
        columns,
        rows: result.rows,
        rowCount: result.rowCount || 0,
        executionTimeMs,
      };
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Query execution failed',
        this.isRetryableError(error),
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.executeQuery('SELECT 1 as ping');
      return result.rows.length > 0 && result.rows[0].ping === 1;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string> {
    try {
      const result = await this.executeQuery('SELECT version()');
      return result.rows[0]?.version || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private createClient(config: AuthConfig): pg.Client {
    // Support connection string if provided
    if (config.credentials.connectionString) {
      return new pg.Client({
        connectionString: config.credentials.connectionString,
        ssl: config.credentials.ssl !== false ? { rejectUnauthorized: false } : false,
      });
    }

    return new pg.Client({
      host: config.credentials.host,
      port: config.credentials.port || 5439, // Default Redshift port
      user: config.credentials.user,
      password: config.credentials.password,
      database: config.credentials.database,
      ssl: config.credentials.ssl !== false ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: config.credentials.connectionTimeoutMillis || 60000,
      query_timeout: config.credentials.queryTimeout || 300000, // 5 minutes for Redshift
      statement_timeout: config.credentials.statementTimeout || 300000,
    });
  }

  private async getVersionFromClient(client: pg.Client): Promise<string> {
    try {
      const result = await client.query('SELECT version()');
      return result.rows[0]?.version || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private isRetryableError(error: unknown): boolean {
    const retryableCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      '53300', // Too many connections
      '57P01', // Admin shutdown
      '08006', // Connection failure
      '08001', // Unable to connect
    ];

    // Redshift specific error codes
    const redshiftRetryableCodes = [
      '1023', // Serialization failure
      '1018', // Connection limit exceeded
      '1017', // Query queue full
    ];

    const err = error as Error & { code?: string; errno?: string };
    return (
      (err.code && retryableCodes.includes(err.code)) ||
      (err.errno && retryableCodes.includes(err.errno)) ||
      (err.code && redshiftRetryableCodes.includes(err.code)) ||
      err.message?.includes('connection') ||
      err.message?.includes('timeout') ||
      err.message?.includes('queue')
    );
  }

  protected mapColumnType(redshiftType: string): string {
    const type = redshiftType.toLowerCase();

    if (
      type.includes('varchar') ||
      type.includes('text') ||
      type.includes('char') ||
      type.includes('bpchar')
    ) {
      return 'string';
    }
    if (
      type.includes('int') ||
      type.includes('serial') ||
      type.includes('bigserial') ||
      type === 'smallint' ||
      type === 'integer' ||
      type === 'bigint'
    ) {
      return 'number';
    }
    if (
      type.includes('numeric') ||
      type.includes('decimal') ||
      type.includes('real') ||
      type.includes('double') ||
      type === 'float4' ||
      type === 'float8'
    ) {
      return 'float';
    }
    if (type.includes('bool')) {
      return 'boolean';
    }
    if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
      return 'datetime';
    }
    if (type === 'super') {
      return 'json'; // Redshift's semi-structured data type
    }
    if (type.includes('geometry') || type.includes('geography')) {
      return 'spatial';
    }

    return redshiftType;
  }

  // Redshift-specific optimization methods
  async analyzeTable(schema: string, table: string): Promise<void> {
    if (!this.connected) {
      throw new ConnectionError('Not connected to Redshift');
    }

    await this.executeQuery(`ANALYZE ${schema}.${table}`);
  }

  async vacuumTable(schema: string, table: string, full = false): Promise<void> {
    if (!this.connected) {
      throw new ConnectionError('Not connected to Redshift');
    }

    const vacuumType = full ? 'VACUUM FULL' : 'VACUUM';
    await this.executeQuery(`${vacuumType} ${schema}.${table}`);
  }

  async getTableStats(schema: string, table: string): Promise<any> {
    if (!this.connected) {
      throw new ConnectionError('Not connected to Redshift');
    }

    const result = await this.executeQuery(
      `
      SELECT schemaname, tablename, 
             size / (1024 * 1024) as size_mb,
             tbl_rows,
             sortkey1, distkey,
             encoded, diststyle
      FROM pg_table_def 
      WHERE schemaname = $1 AND tablename = $2
    `,
      [schema, table],
    );

    return result.rows[0];
  }
}
