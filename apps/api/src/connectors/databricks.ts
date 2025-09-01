import { DBSQLClient } from '@databricks/sql';
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
  AuthenticationError,
  ConnectionError,
  QueryError
} from './types.js';

export class DatabricksConnector extends BaseConnector {
  readonly type = 'databricks' as const;
  readonly name = 'Databricks';
  readonly version = '1.0.0';

  private client: DBSQLClient | null = null;
  private session: any = null;

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    try {
      this.validateConfig(config, ['serverHostname', 'httpPath', 'token']);
      
      const testClient = this.createClient(config);
      const testSession = await testClient.openSession();
      
      // Test with a simple query
      const operation = await testSession.executeStatement('SELECT 1 as test');
      const result = await operation.fetchAll();
      
      await testSession.close();
      await testClient.close();

      const latencyMs = Date.now() - startTime;
      
      return {
        success: true,
        latencyMs,
        version: 'Databricks SQL Driver',
        message: 'Connection successful'
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async connect(config: AuthConfig): Promise<void> {
    if (this.connected) {
      return;
    }

    this.validateConfig(config, ['serverHostname', 'httpPath', 'token']);
    
    try {
      this.client = this.createClient(config);
      this.session = await this.client.openSession();
      this.connected = true;
      this.connectionConfig = config;
      this.logConnection('Connected');
    } catch (error) {
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to Databricks'
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.connected = false;
    this.connectionConfig = undefined;
    this.logConnection('Disconnected');
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery('SHOW DATABASES');
    
    return result.rows.map(row => ({
      name: row.databaseName || row.namespace_name || row.database_name,
      type: 'database'
    }));
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    let sql = 'SHOW SCHEMAS';
    if (database) {
      sql = `SHOW SCHEMAS IN ${database}`;
    }
    
    const result = await this.executeQuery(sql);
    
    return result.rows.map(row => ({
      name: row.schemaName || row.schema_name || row.databaseName,
      database: database
    }));
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    let sql = 'SHOW TABLES';
    
    if (database && schema) {
      sql = `SHOW TABLES IN ${database}.${schema}`;
    } else if (schema) {
      sql = `SHOW TABLES IN ${schema}`;
    }
    
    const result = await this.executeQuery(sql);
    
    return result.rows.map(row => ({
      name: row.tableName || row.table_name,
      type: (row.tableType || row.table_type || 'TABLE') === 'VIEW' ? 'VIEW' : 'TABLE',
      schema: schema || row.schema || row.database,
      database: database || row.database
    }));
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const fullTableName = `${database}.${schema}.${table}`;
    const result = await this.executeQuery(`DESCRIBE TABLE ${fullTableName}`);
    
    return result.rows
      .filter(row => row.col_name && row.col_name !== '' && !row.col_name.startsWith('#'))
      .map(row => ({
        name: row.col_name,
        type: this.mapColumnType(row.data_type),
        nullable: !row.data_type?.includes('NOT NULL'),
        primaryKey: false, // Databricks doesn't enforce primary keys
        defaultValue: row.comment?.includes('default:') 
          ? row.comment.split('default:')[1].trim() 
          : undefined
      }));
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    // Databricks doesn't enforce foreign keys like traditional databases
    // Return empty array as relationships are typically managed at application level
    return [];
  }

  async executeQuery(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connected || !this.session) {
      throw new ConnectionError('Not connected to Databricks');
    }

    const startTime = Date.now();
    
    try {
      // Handle parameterized queries
      let finalSql = sql;
      if (params && params.length > 0) {
        params.forEach((param, index) => {
          // Simple parameter substitution (in production, use proper parameterization)
          finalSql = finalSql.replace(`$${index + 1}`, this.escapeParam(param));
        });
      }

      const operation = await this.session.executeStatement(finalSql, {
        runAsync: true,
        maxRows: 10000 // Configurable limit
      });
      
      const result = await operation.fetchAll();
      const executionTimeMs = Date.now() - startTime;
      
      // Extract column names from the schema
      const schema = await operation.getSchema();
      const columns = schema?.columns?.map((col: any) => col.columnName) || [];
      
      await operation.close();
      
      return {
        columns,
        rows: result || [],
        rowCount: result?.length || 0,
        executionTimeMs
      };
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Query execution failed',
        this.isRetryableError(error)
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
      const result = await this.executeQuery('SELECT version() as version');
      return result.rows[0]?.version || 'Databricks';
    } catch {
      return 'Databricks';
    }
  }

  private createClient(config: AuthConfig): DBSQLClient {
    return new DBSQLClient({
      serverHostname: config.credentials.serverHostname,
      httpPath: config.credentials.httpPath,
      token: config.credentials.token,
      authFlow: config.credentials.authFlow || 'databricks-oauth',
      port: config.credentials.port || 443,
      connectionTimeout: config.credentials.connectionTimeout || 900000, // 15 minutes
      // Additional Databricks-specific options
      catalogName: config.credentials.catalogName,
      schemaName: config.credentials.schemaName,
    });
  }

  private escapeParam(param: any): string {
    if (param === null || param === undefined) {
      return 'NULL';
    }
    if (typeof param === 'string') {
      return `'${param.replace(/'/g, "''")}'`;
    }
    if (typeof param === 'number' || typeof param === 'boolean') {
      return param.toString();
    }
    if (param instanceof Date) {
      return `'${param.toISOString()}'`;
    }
    return `'${String(param)}'`;
  }

  private isRetryableError(error: any): boolean {
    const retryableMessages = [
      'timeout',
      'connection reset',
      'connection refused',
      'service unavailable',
      'too many requests',
      'rate limit',
      'cluster is starting',
      'cluster is restarting'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return retryableMessages.some(msg => errorMessage.includes(msg)) ||
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT' ||
           error.statusCode === 429 || // Rate limited
           error.statusCode === 503;   // Service unavailable
  }

  protected mapColumnType(databricksType: string): string {
    if (!databricksType) return 'string';
    
    const type = databricksType.toLowerCase();
    
    if (type.includes('string') || type.includes('varchar') || type.includes('char')) {
      return 'string';
    }
    if (type.includes('int') || type.includes('bigint') || type.includes('smallint') || type.includes('tinyint')) {
      return 'number';
    }
    if (type.includes('decimal') || type.includes('numeric') || type.includes('float') || 
        type.includes('double') || type.includes('real')) {
      return 'float';
    }
    if (type.includes('bool')) {
      return 'boolean';
    }
    if (type.includes('date') || type.includes('timestamp') || type.includes('time')) {
      return 'datetime';
    }
    if (type.includes('binary') || type.includes('varbinary')) {
      return 'binary';
    }
    if (type.includes('array')) {
      return 'array';
    }
    if (type.includes('map') || type.includes('struct')) {
      return 'object';
    }
    
    return databricksType;
  }

  // Databricks-specific methods
  async listCatalogs(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery('SHOW CATALOGS');
    
    return result.rows.map(row => ({
      name: row.catalog || row.catalogName,
      type: 'catalog'
    }));
  }

  async getCurrentCatalog(): Promise<string> {
    const result = await this.executeQuery('SELECT current_catalog() as catalog');
    return result.rows[0]?.catalog || 'hive_metastore';
  }

  async getCurrentSchema(): Promise<string> {
    const result = await this.executeQuery('SELECT current_schema() as schema');
    return result.rows[0]?.schema || 'default';
  }

  async optimizeTable(database: string, schema: string, table: string): Promise<void> {
    if (!this.connected) {
      throw new ConnectionError('Not connected to Databricks');
    }
    
    const fullTableName = `${database}.${schema}.${table}`;
    await this.executeQuery(`OPTIMIZE ${fullTableName}`);
  }

  async analyzeTable(database: string, schema: string, table: string): Promise<void> {
    if (!this.connected) {
      throw new ConnectionError('Not connected to Databricks');
    }
    
    const fullTableName = `${database}.${schema}.${table}`;
    await this.executeQuery(`ANALYZE TABLE ${fullTableName} COMPUTE STATISTICS`);
  }

  async getTableHistory(database: string, schema: string, table: string): Promise<any[]> {
    if (!this.connected) {
      throw new ConnectionError('Not connected to Databricks');
    }
    
    const fullTableName = `${database}.${schema}.${table}`;
    const result = await this.executeQuery(`DESCRIBE HISTORY ${fullTableName}`);
    return result.rows;
  }
}