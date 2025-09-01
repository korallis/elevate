import snowflake from 'snowflake-sdk';
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

export class SnowflakeConnector extends BaseConnector {
  readonly type = 'snowflake' as const;
  readonly name = 'Snowflake';
  readonly version = '1.0.0';

  private connection: snowflake.Connection | null = null;

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      this.validateConfig(config, ['account', 'username', 'warehouse']);

      // Support both password and key-pair authentication
      if (!config.credentials.password && !config.credentials.privateKey) {
        throw new AuthenticationError('Either password or privateKey is required');
      }

      const testConnection = this.createConnection(config);

      await new Promise<void>((resolve, reject) => {
        testConnection.connect((err) => {
          if (err) reject(new ConnectionError(err.message));
          else resolve();
        });
      });

      // Test with a simple query
      const result = await this.executeQueryOnConnection(testConnection, 'SELECT 1 as test');

      testConnection.destroy(() => {});

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        latencyMs,
        version: await this.getVersionFromResult(result),
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

    this.validateConfig(config, ['account', 'username', 'warehouse']);

    this.connection = this.createConnection(config);

    await new Promise<void>((resolve, reject) => {
      this.connection!.connect((err) => {
        if (err) {
          reject(new ConnectionError(err.message));
        } else {
          this.connected = true;
          this.connectionConfig = config;
          resolve();
        }
      });
    });

    this.logConnection('Connected');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await new Promise<void>((resolve) => {
        this.connection!.destroy(() => {
          this.connected = false;
          this.connection = null;
          this.connectionConfig = undefined;
          resolve();
        });
      });
      this.logConnection('Disconnected');
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery('SHOW DATABASES');
    return result.rows.map((row) => ({
      name: row.name,
      type: 'database',
    }));
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    if (!database) {
      throw new QueryError('Database parameter is required for Snowflake');
    }

    const sql = `SELECT schema_name FROM ${database}.information_schema.schemata ORDER BY schema_name`;
    const result = await this.executeQuery(sql);

    return result.rows.map((row) => ({
      name: row.schema_name,
      database,
    }));
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    if (!database || !schema) {
      throw new QueryError('Both database and schema parameters are required for Snowflake');
    }

    const sql = `
      SELECT table_name, table_type, last_altered 
      FROM ${database}.information_schema.tables 
      WHERE table_schema = ? 
      ORDER BY table_name
    `;

    const result = await this.executeQuery(sql, [schema]);

    return result.rows.map((row) => ({
      name: row.table_name,
      type: row.table_type === 'BASE TABLE' ? 'TABLE' : 'VIEW',
      schema,
      database,
      lastModified: row.last_altered ? new Date(row.last_altered) : undefined,
    }));
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const sql = `
      SELECT column_name, data_type, is_nullable, ordinal_position
      FROM ${database}.information_schema.columns 
      WHERE table_schema = ? AND table_name = ? 
      ORDER BY ordinal_position
    `;

    const result = await this.executeQuery(sql, [schema, table]);

    return result.rows.map((row) => ({
      name: row.column_name,
      type: this.mapColumnType(row.data_type),
      nullable: row.is_nullable === 'YES',
    }));
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    if (!database || !schema) {
      throw new QueryError('Both database and schema parameters are required for Snowflake');
    }

    const sql = `
      SELECT tc.constraint_name,
             kcu.table_name,
             kcu.column_name,
             ccu.table_name as referenced_table_name,
             ccu.column_name as referenced_column_name
      FROM ${database}.information_schema.table_constraints tc
      JOIN ${database}.information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name 
        AND tc.table_schema = kcu.table_schema
      JOIN ${database}.information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name 
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = ?
      ORDER BY tc.constraint_name, kcu.table_name, kcu.ordinal_position
    `;

    const result = await this.executeQuery(sql, [schema]);

    return result.rows.map((row) => ({
      constraintName: row.constraint_name,
      fromTable: row.table_name,
      fromColumn: row.column_name,
      toTable: row.referenced_table_name,
      toColumn: row.referenced_column_name,
    }));
  }

  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.connected || !this.connection) {
      throw new ConnectionError('Not connected to Snowflake');
    }

    return this.executeQueryOnConnection(this.connection, sql, params);
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
    const result = await this.executeQuery('SELECT CURRENT_VERSION() as version');
    return result.rows[0]?.version || 'Unknown';
  }

  private createConnection(config: AuthConfig): snowflake.Connection {
    const connectionOptions: Record<string, unknown> = {
      account: config.credentials.account,
      username: config.credentials.username,
      warehouse: config.credentials.warehouse,
      role: config.credentials.role,
      database: config.credentials.database,
      schema: config.credentials.schema,
    };

    // Support both password and key-pair authentication
    if (config.credentials.password) {
      connectionOptions.password = config.credentials.password;
    } else if (config.credentials.privateKey) {
      connectionOptions.privateKey = config.credentials.privateKey;
      if (config.credentials.privateKeyPassphrase) {
        connectionOptions.privateKeyPassphrase = config.credentials.privateKeyPassphrase;
      }
    }

    return snowflake.createConnection(connectionOptions);
  }

  private async executeQueryOnConnection(
    connection: snowflake.Connection,
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      connection.execute({
        sqlText: sql,
        binds: params,
        complete: (err, stmt, rows) => {
          if (err) {
            reject(new QueryError(err.message, this.isRetryableError(err)));
            return;
          }

          const columns = stmt.getColumns().map((col) => col.getName());
          const executionTimeMs = Date.now() - startTime;

          resolve({
            columns,
            rows: (rows as any[]) || [],
            rowCount: rows?.length || 0,
            executionTimeMs,
          });
        },
      });
    });
  }

  private async getVersionFromResult(result: QueryResult): Promise<string> {
    // Try to get version from a test query result
    try {
      const versionResult = await this.executeQuery('SELECT CURRENT_VERSION() as version');
      return versionResult.rows[0]?.version || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private isRetryableError(error: unknown): boolean {
    const retryableCodes = [
      '390144', // Session token expired
      '390318', // Network error
      '390400', // Connection lost
    ];

    const err = error as Error & { code?: string };
    return (
      (err.code && retryableCodes.includes(err.code)) ||
      err.message?.includes('network') ||
      err.message?.includes('timeout')
    );
  }

  protected mapColumnType(snowflakeType: string): string {
    const type = snowflakeType.toLowerCase();

    if (type.includes('varchar') || type.includes('text') || type.includes('string')) {
      return 'string';
    }
    if (type.includes('number') || type.includes('integer') || type.includes('int')) {
      return 'number';
    }
    if (type.includes('float') || type.includes('double') || type.includes('real')) {
      return 'float';
    }
    if (type.includes('boolean')) {
      return 'boolean';
    }
    if (type.includes('date') || type.includes('timestamp') || type.includes('time')) {
      return 'datetime';
    }

    return snowflakeType;
  }
}
