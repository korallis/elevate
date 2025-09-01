import { BigQuery } from '@google-cloud/bigquery';
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

export class BigQueryConnector extends BaseConnector {
  readonly type = 'bigquery' as const;
  readonly name = 'Google BigQuery';
  readonly version = '1.0.0';

  private bigquery: BigQuery | null = null;
  private projectId: string | null = null;

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      this.validateConfig(config, ['projectId']);

      const testClient = this.createClient(config);

      // Test with a simple query
      const [job] = await testClient.createQueryJob({
        query: 'SELECT 1 as test',
        location: config.credentials.location || 'US',
      });

      const [rows] = await job.getQueryResults();

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        latencyMs,
        version: 'BigQuery API v2',
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

    this.validateConfig(config, ['projectId']);

    try {
      this.bigquery = this.createClient(config);
      this.projectId = config.credentials.projectId;
      this.connected = true;
      this.connectionConfig = config;
      this.logConnection('Connected');
    } catch (error) {
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to BigQuery',
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.bigquery) {
      this.connected = false;
      this.bigquery = null;
      this.projectId = null;
      this.connectionConfig = undefined;
      this.logConnection('Disconnected');
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    if (!this.connected || !this.bigquery || !this.projectId) {
      throw new ConnectionError('Not connected to BigQuery');
    }

    try {
      const [datasets] = await this.bigquery.getDatasets();

      return datasets.map((dataset) => ({
        name: dataset.id || '',
        type: 'dataset',
      }));
    } catch (error) {
      throw new QueryError(error instanceof Error ? error.message : 'Failed to list datasets');
    }
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    // In BigQuery, datasets are equivalent to schemas/databases
    const databases = await this.listDatabases();
    return databases.map((db) => ({
      name: db.name,
      database: database || db.name,
    }));
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    if (!this.connected || !this.bigquery) {
      throw new ConnectionError('Not connected to BigQuery');
    }

    const datasetId = database || schema;
    if (!datasetId) {
      throw new QueryError('Dataset ID is required for BigQuery');
    }

    try {
      const dataset = this.bigquery.dataset(datasetId);
      const [tables] = await dataset.getTables();

      return await Promise.all(
        tables.map(async (table) => {
          try {
            const [metadata] = await table.getMetadata();
            return {
              name: table.id || '',
              type: metadata.type === 'VIEW' ? 'VIEW' : 'TABLE',
              schema: datasetId,
              database: datasetId,
              lastModified: metadata.lastModifiedTime
                ? new Date(parseInt(metadata.lastModifiedTime))
                : undefined,
              rowCount: metadata.numRows ? parseInt(metadata.numRows) : undefined,
            };
          } catch {
            return {
              name: table.id || '',
              type: 'TABLE' as const,
              schema: datasetId,
              database: datasetId,
            };
          }
        }),
      );
    } catch (error) {
      throw new QueryError(error instanceof Error ? error.message : 'Failed to list tables');
    }
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    if (!this.connected || !this.bigquery) {
      throw new ConnectionError('Not connected to BigQuery');
    }

    const datasetId = database || schema;

    try {
      const dataset = this.bigquery.dataset(datasetId);
      const tableRef = dataset.table(table);
      const [metadata] = await tableRef.getMetadata();

      if (!metadata.schema || !metadata.schema.fields) {
        return [];
      }

      return metadata.schema.fields.map((field: unknown, index: number) => {
        const f = field as { name: string; type: string; mode?: string; defaultValueExpression?: string };
        return {
          name: f.name,
          type: this.mapColumnType(f.type),
          nullable: f.mode !== 'REQUIRED',
          primaryKey: false, // BigQuery doesn't have primary keys in the traditional sense
          defaultValue: f.defaultValueExpression,
        };
      });
    } catch (error) {
      throw new QueryError(error instanceof Error ? error.message : 'Failed to list columns');
    }
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    // BigQuery doesn't support traditional foreign keys
    // Return empty array as BigQuery uses different relationship models
    return [];
  }

  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.connected || !this.bigquery) {
      throw new ConnectionError('Not connected to BigQuery');
    }

    const startTime = Date.now();

    try {
      const options: Record<string, unknown> = {
        query: sql,
        location: this.connectionConfig?.credentials?.location || 'US',
        useLegacySql: false,
        maximumBytesBilled: this.connectionConfig?.credentials?.maximumBytesBilled,
      };

      // Handle query parameters
      if (params && params.length > 0) {
        options.params = params;
      }

      const [job] = await this.bigquery.createQueryJob(options);
      const [rows] = await job.getQueryResults();

      const executionTimeMs = Date.now() - startTime;

      // Extract column names from the first row if available
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        columns,
        rows: rows as Record<string, unknown>[],
        rowCount: rows.length,
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
    return 'BigQuery API v2';
  }

  private createClient(config: AuthConfig): BigQuery {
    const options: Record<string, unknown> = {
      projectId: config.credentials.projectId,
      location: config.credentials.location || 'US',
    };

    // Handle service account authentication
    if (config.credentials.keyFilename) {
      options.keyFilename = config.credentials.keyFilename;
    } else if (config.credentials.credentials) {
      // JSON service account key
      options.credentials =
        typeof config.credentials.credentials === 'string'
          ? JSON.parse(config.credentials.credentials)
          : config.credentials.credentials;
    }

    // Handle other authentication options
    if (config.credentials.email) {
      options.email = config.credentials.email;
    }

    if (config.credentials.key) {
      options.key = config.credentials.key;
    }

    return new BigQuery(options);
  }

  private isRetryableError(error: unknown): boolean {
    const retryableMessages = [
      'timeout',
      'rate limit',
      'quota exceeded',
      'service unavailable',
      'backend error',
      'internal error',
    ];

    const retryableCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
    ];

    const err = error as Error & { code?: string | number };
    if (err.code && retryableCodes.includes(err.code)) {
      return true;
    }

    const errorMessage = err.message?.toLowerCase() || '';
    return retryableMessages.some((msg) => errorMessage.includes(msg));
  }

  protected mapColumnType(bigqueryType: string): string {
    const type = bigqueryType.toLowerCase();

    if (type === 'string') {
      return 'string';
    }
    if (type === 'integer' || type === 'int64') {
      return 'number';
    }
    if (type === 'float' || type === 'float64' || type === 'numeric' || type === 'bignumeric') {
      return 'float';
    }
    if (type === 'boolean' || type === 'bool') {
      return 'boolean';
    }
    if (type === 'timestamp' || type === 'datetime' || type === 'date' || type === 'time') {
      return 'datetime';
    }
    if (type === 'json') {
      return 'json';
    }
    if (type === 'bytes') {
      return 'binary';
    }
    if (type === 'array' || type === 'repeated') {
      return 'array';
    }
    if (type === 'struct' || type === 'record') {
      return 'object';
    }
    if (type === 'geography') {
      return 'geography';
    }

    return bigqueryType;
  }

  // Optional: Support for streaming queries
  async *executeStreamingQuery(sql: string, params?: unknown[]): AsyncIterable<Record<string, unknown>> {
    if (!this.connected || !this.bigquery) {
      throw new ConnectionError('Not connected to BigQuery');
    }

    const options: Record<string, unknown> = {
      query: sql,
      location: this.connectionConfig?.credentials?.location || 'US',
      useLegacySql: false,
    };

    if (params && params.length > 0) {
      options.params = params;
    }

    try {
      const [job] = await this.bigquery.createQueryJob(options);

      // Stream results
      const stream = job.getQueryResultsStream();

      for await (const row of stream) {
        yield row as Record<string, unknown>;
      }
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Streaming query execution failed',
      );
    }
  }
}
