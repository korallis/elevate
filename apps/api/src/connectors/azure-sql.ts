import * as sql from 'mssql';
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

export class AzureSQLConnector extends BaseConnector {
  readonly type = 'azure-sql' as const;
  readonly name = 'Azure SQL Database';
  readonly version = '1.0.0';

  private pool: sql.ConnectionPool | null = null;

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      this.validateConfig(config, ['server', 'user', 'password', 'database']);

      const testPool = this.createPool(config);
      await testPool.connect();

      // Test with a simple query
      const request = testPool.request();
      const result = await request.query('SELECT 1 as test');

      await testPool.close();

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        latencyMs,
        version: await this.getVersionFromPool(testPool),
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

    this.validateConfig(config, ['server', 'user', 'password', 'database']);

    try {
      this.pool = this.createPool(config);
      await this.pool.connect();
      this.connected = true;
      this.connectionConfig = config;
      this.logConnection('Connected');
    } catch (error) {
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to Azure SQL Database',
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.connected = false;
      this.pool = null;
      this.connectionConfig = undefined;
      this.logConnection('Disconnected');
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    // In Azure SQL Database, you're typically connected to a specific database
    // We can only list the current database
    const result = await this.executeQuery('SELECT DB_NAME() as name');

    return result.rows.map((row: any) => ({
      name: row.name as string,
      type: 'database',
    }));
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    const result = await this.executeQuery(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('sys', 'INFORMATION_SCHEMA', 'db_owner', 'db_datareader', 'db_datawriter', 'db_ddladmin', 'db_securityadmin', 'db_accessadmin', 'db_backupoperator', 'db_denydatareader', 'db_denydatawriter')
      ORDER BY schema_name
    `);

    return result.rows.map((row) => ({
      name: row.schema_name,
      database: database || this.connectionConfig?.credentials?.database,
    }));
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    const schemaName = schema || 'dbo';

    const result = await this.executeQuery(
      `
      SELECT t.table_name, t.table_type,
             s.last_user_update as last_modified
      FROM information_schema.tables t
      LEFT JOIN sys.dm_db_index_usage_stats s
        ON OBJECT_NAME(s.object_id) = t.table_name
      WHERE t.table_schema = @schema
      ORDER BY t.table_name
    `,
      [schemaName],
    );

    return result.rows.map((row) => ({
      name: row.table_name,
      type: row.table_type === 'BASE TABLE' ? 'TABLE' : 'VIEW',
      schema: schemaName,
      database: database || this.connectionConfig?.credentials?.database,
      lastModified: row.last_modified ? new Date(row.last_modified) : undefined,
    }));
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.executeQuery(
      `
      SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
             c.character_maximum_length, c.numeric_precision, c.numeric_scale,
             c.ordinal_position,
             CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END as is_primary_key,
             CASE WHEN fk.column_name IS NOT NULL THEN 1 ELSE 0 END as is_foreign_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = @schema 
          AND tc.table_name = @table
      ) pk ON pk.column_name = c.column_name
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = @schema 
          AND tc.table_name = @table
      ) fk ON fk.column_name = c.column_name
      WHERE c.table_schema = @schema AND c.table_name = @table
      ORDER BY c.ordinal_position
    `,
      [schema, table],
    );

    return result.rows.map((row) => ({
      name: row.column_name,
      type: this.mapColumnType(row.data_type),
      nullable: row.is_nullable === 'YES',
      primaryKey: row.is_primary_key === 1,
      foreignKey: row.is_foreign_key === 1,
      defaultValue: row.column_default,
      maxLength: row.character_maximum_length,
      precision: row.numeric_precision,
      scale: row.numeric_scale,
    }));
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    const schemaName = schema || 'dbo';

    const result = await this.executeQuery(
      `
      SELECT rc.constraint_name,
             kcu.table_name,
             kcu.column_name,
             kcu2.table_name as referenced_table_name,
             kcu2.column_name as referenced_column_name
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON rc.constraint_name = kcu.constraint_name
        AND rc.constraint_schema = kcu.table_schema
      JOIN information_schema.key_column_usage kcu2
        ON rc.unique_constraint_name = kcu2.constraint_name
        AND rc.unique_constraint_schema = kcu2.table_schema
      WHERE kcu.table_schema = @schema
      ORDER BY rc.constraint_name, kcu.table_name, kcu.ordinal_position
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
    if (!this.connected || !this.pool) {
      throw new ConnectionError('Not connected to Azure SQL Database');
    }

    const startTime = Date.now();

    try {
      const request = this.pool.request();

      // Add parameters if provided
      if (params) {
        params.forEach((param, index) => {
          request.input(`param${index}`, param);
        });

        // Replace @param placeholders with proper parameter names
        let parameterizedSql = sql;
        params.forEach((_, index) => {
          parameterizedSql = parameterizedSql.replace('@schema', `@param${index}`);
          parameterizedSql = parameterizedSql.replace('@table', `@param${index}`);
        });
        sql = parameterizedSql;
      }

      const result = await request.query(sql);
      const executionTimeMs = Date.now() - startTime;

      const columns =
        result.recordset && result.recordset.columns ? Object.keys(result.recordset.columns) : [];

      return {
        columns,
        rows: result.recordset || [],
        rowCount: result.recordset?.length || 0,
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
      const result = await this.executeQuery('SELECT @@VERSION as version');
      return result.rows[0]?.version || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private createPool(config: AuthConfig): sql.ConnectionPool {
    const poolConfig: sql.config = {
      server: config.credentials.server,
      port: config.credentials.port || 1433,
      user: config.credentials.user,
      password: config.credentials.password,
      database: config.credentials.database,
      options: {
        encrypt: true, // Always encrypt for Azure SQL
        trustServerCertificate: false, // Don't trust self-signed certificates in Azure
        enableArithAbort: true,
        requestTimeout: config.credentials.requestTimeout || 30000,
        connectionTimeout: config.credentials.connectionTimeout || 30000,
        // Azure SQL specific options
        multipleActiveResultSets: config.credentials.multipleActiveResultSets !== false,
        ...config.credentials.options,
      },
      pool: {
        max: config.credentials.poolMax || 10,
        min: config.credentials.poolMin || 0,
        idleTimeoutMillis: config.credentials.poolIdleTimeout || 30000,
        acquireTimeoutMillis: config.credentials.poolAcquireTimeout || 60000,
        createTimeoutMillis: config.credentials.poolCreateTimeout || 30000,
        destroyTimeoutMillis: config.credentials.poolDestroyTimeout || 5000,
        ...config.credentials.pool,
      },
    };

    // Handle connection string if provided (common for Azure SQL)
    if (config.credentials.connectionString) {
      poolConfig.connectionString = config.credentials.connectionString;
    }

    // Support Azure Active Directory authentication
    if (config.credentials.authentication) {
      poolConfig.authentication = {
        type: config.credentials.authentication.type || 'default',
        options: config.credentials.authentication.options || {},
      };
    }

    return new sql.ConnectionPool(poolConfig);
  }

  private async getVersionFromPool(pool: sql.ConnectionPool): Promise<string> {
    try {
      const request = pool.request();
      const result = await request.query('SELECT @@VERSION as version');
      return result.recordset[0]?.version || 'Unknown';
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
      'EREQUEST',
      'ETIMEOUT',
    ];

    // Azure SQL specific error codes
    const retryableSqlCodes = [
      1205, // Deadlock victim
      1222, // Lock request timeout
      2, // Timeout expired
      53, // Could not open a connection
      233, // Connection was successfully established with the server, but then an error occurred
      10053, // Connection broken
      10054, // Connection reset by peer
      10060, // Connection timeout
      10061, // Connection refused
      40197, // Service has encountered an error processing your request
      40501, // Service is currently busy
      40613, // Database on server is not currently available
      49918, // Cannot process request. Not enough resources to process request
      49919, // Cannot process create or update request. Too many create or update operations in progress
      49920, // Cannot process request. Too many operations in progress
    ];

    const err = error as Error & { code?: string; number?: number };
    return (
      (err.code && retryableCodes.includes(err.code)) ||
      (err.number && retryableSqlCodes.includes(err.number)) ||
      err.message?.includes('timeout') ||
      err.message?.includes('connection') ||
      err.message?.includes('Azure') ||
      err.message?.includes('busy')
    );
  }

  protected mapColumnType(azureSqlType: string): string {
    const type = azureSqlType.toLowerCase();

    if (
      type.includes('varchar') ||
      type.includes('text') ||
      type.includes('char') ||
      type.includes('ntext')
    ) {
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
      type.includes('real') ||
      type.includes('money')
    ) {
      return 'float';
    }
    if (type.includes('bit')) {
      return 'boolean';
    }
    if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
      return 'datetime';
    }
    if (type.includes('xml')) {
      return 'xml';
    }
    if (type.includes('uniqueidentifier')) {
      return 'uuid';
    }
    if (type.includes('binary') || type.includes('image') || type.includes('varbinary')) {
      return 'binary';
    }
    if (type.includes('geography') || type.includes('geometry')) {
      return 'spatial';
    }

    return azureSqlType;
  }
}
