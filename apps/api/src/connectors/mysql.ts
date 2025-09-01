import mysql from 'mysql2/promise';
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

export class MySQLConnector extends BaseConnector {
  readonly type = 'mysql' as const;
  readonly name = 'MySQL';
  readonly version = '1.0.0';

  private connection: mysql.Connection | null = null;

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      this.validateConfig(config, ['host', 'user', 'password']);

      const testConnection = await this.createConnection(config);

      // Test with a simple query
      const [rows] = await testConnection.execute('SELECT 1 as test');

      await testConnection.end();

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        latencyMs,
        version: await this.getVersionFromConnection(testConnection),
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

    this.validateConfig(config, ['host', 'user', 'password']);

    try {
      this.connection = await this.createConnection(config);
      this.connected = true;
      this.connectionConfig = config;
      this.logConnection('Connected');
    } catch (error) {
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to MySQL',
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connected = false;
      this.connection = null;
      this.connectionConfig = undefined;
      this.logConnection('Disconnected');
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery('SHOW DATABASES');
    return result.rows
      .filter(
        (row) =>
          !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(row.Database),
      )
      .map((row) => ({
        name: row.Database,
        type: 'database',
      }));
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    // In MySQL, schemas and databases are the same thing
    const databases = await this.listDatabases();
    return databases.map((db) => ({
      name: db.name,
      database: database || db.name,
    }));
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    const dbName = database || schema;
    if (!dbName) {
      throw new QueryError('Database parameter is required for MySQL');
    }

    const result = await this.executeQuery(
      `
      SELECT table_name, table_type, update_time
      FROM information_schema.tables 
      WHERE table_schema = ?
      ORDER BY table_name
    `,
      [dbName],
    );

    return result.rows.map((row) => ({
      name: row.table_name,
      type: row.table_type === 'BASE TABLE' ? 'TABLE' : 'VIEW',
      schema: dbName,
      database: dbName,
      lastModified: row.update_time ? new Date(row.update_time) : undefined,
    }));
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const dbName = database || schema;

    const result = await this.executeQuery(
      `
      SELECT column_name, data_type, is_nullable, column_key, column_default, 
             character_maximum_length, numeric_precision, numeric_scale, ordinal_position
      FROM information_schema.columns 
      WHERE table_schema = ? AND table_name = ? 
      ORDER BY ordinal_position
    `,
      [dbName, table],
    );

    return result.rows.map((row) => ({
      name: row.column_name,
      type: this.mapColumnType(row.data_type),
      nullable: row.is_nullable === 'YES',
      primaryKey: row.column_key === 'PRI',
      foreignKey: row.column_key === 'MUL',
      defaultValue: row.column_default,
      maxLength: row.character_maximum_length,
      precision: row.numeric_precision,
      scale: row.numeric_scale,
    }));
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    const dbName = database || schema;
    if (!dbName) {
      throw new QueryError('Database parameter is required for MySQL');
    }

    const result = await this.executeQuery(
      `
      SELECT constraint_name,
             table_name,
             column_name,
             referenced_table_name,
             referenced_column_name
      FROM information_schema.key_column_usage
      WHERE table_schema = ? 
        AND referenced_table_name IS NOT NULL
      ORDER BY constraint_name, table_name, ordinal_position
    `,
      [dbName],
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
    if (!this.connected || !this.connection) {
      throw new ConnectionError('Not connected to MySQL');
    }

    const startTime = Date.now();

    try {
      const [rows, fields] = await this.connection.execute(sql, params);
      const executionTimeMs = Date.now() - startTime;

      const columns = Array.isArray(fields) ? fields.map((field) => field.name || '') : [];
      const resultRows = Array.isArray(rows) ? (rows as Record<string, any>[]) : [];

      return {
        columns,
        rows: resultRows,
        rowCount: resultRows.length,
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
      const result = await this.executeQuery('SELECT VERSION() as version');
      return result.rows[0]?.version || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private async createConnection(config: AuthConfig): Promise<mysql.Connection> {
    const connectionOptions: mysql.ConnectionOptions = {
      host: config.credentials.host,
      port: config.credentials.port || 3306,
      user: config.credentials.user,
      password: config.credentials.password,
      database: config.credentials.database,
      ssl: config.credentials.ssl,
      connectTimeout: config.credentials.connectTimeout || 60000,
      acquireTimeout: config.credentials.acquireTimeout || 60000,
      timeout: config.credentials.timeout || 60000,
    };

    // Handle connection string if provided
    if (config.credentials.connectionString) {
      const parsed = this.parseConnectionString(config.credentials.connectionString);
      Object.assign(connectionOptions, parsed);
    }

    return mysql.createConnection(connectionOptions);
  }

  private async getVersionFromConnection(connection: mysql.Connection): Promise<string> {
    try {
      const [rows] = await connection.execute('SELECT VERSION() as version');
      const result = rows as unknown[];
      return result[0]?.version || 'Unknown';
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
      'ER_LOCK_WAIT_TIMEOUT',
      'ER_LOCK_DEADLOCK',
    ];

    const err = error as Error & { code?: string; errno?: number };
    return (
      (err.code && retryableCodes.includes(err.code)) ||
      err.errno === 1205 || // Lock wait timeout
      err.errno === 1213
    ); // Deadlock
  }

  protected mapColumnType(mysqlType: string): string {
    const type = mysqlType.toLowerCase();

    if (type.includes('varchar') || type.includes('text') || type.includes('char')) {
      return 'string';
    }
    if (
      type.includes('int') ||
      type.includes('bigint') ||
      type.includes('smallint') ||
      type.includes('tinyint')
    ) {
      return 'number';
    }
    if (
      type.includes('decimal') ||
      type.includes('numeric') ||
      type.includes('float') ||
      type.includes('double')
    ) {
      return 'float';
    }
    if (type.includes('bool') || type.includes('bit')) {
      return 'boolean';
    }
    if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
      return 'datetime';
    }
    if (type.includes('json')) {
      return 'json';
    }
    if (type.includes('blob') || type.includes('binary')) {
      return 'binary';
    }

    return mysqlType;
  }
}
