export interface DatabaseInfo {
  name: string;
  type?: string;
}

export interface SchemaInfo {
  name: string;
  database?: string;
}

export interface TableInfo {
  name: string;
  type: 'TABLE' | 'VIEW';
  schema?: string;
  database?: string;
  lastModified?: Date;
  owner?: string;
  rowCount?: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  foreignKey?: boolean;
  defaultValue?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface ForeignKeyInfo {
  constraintName: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs?: number;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  type: ConnectorType;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface AuthConfig {
  type: 'password' | 'oauth2' | 'api_key' | 'service_account' | 'iam' | 'token' | 'key_pair';
  credentials: Record<string, unknown>;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface ConnectionTestResult {
  success: boolean;
  message?: string;
  latencyMs?: number;
  version?: string;
}

export type ConnectorType =
  | 'snowflake'
  | 'xero'
  | 'mssql'
  | 'mysql'
  | 'postgresql'
  | 'spendesk'
  | 'azure-sql'
  | 'salesforce'
  | 'bigquery'
  | 'redshift'
  | 'databricks';

export interface RetryOptions {
  maxAttempts: number;
  backoffMs: number;
  exponentialBackoff: boolean;
  retryableErrors?: string[];
}

export interface IDataConnector {
  readonly type: ConnectorType;
  readonly name: string;
  readonly version: string;

  // Connection management
  testConnection(config: AuthConfig): Promise<ConnectionTestResult>;
  connect(config: AuthConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Schema discovery
  listDatabases(): Promise<DatabaseInfo[]>;
  listSchemas(database?: string): Promise<SchemaInfo[]>;
  listTables(database?: string, schema?: string): Promise<TableInfo[]>;
  listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]>;
  listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]>;

  // Data querying
  executeQuery(sql: string, params?: unknown[]): Promise<QueryResult>;

  // Optional: Streaming support
  executeStreamingQuery?(sql: string, params?: unknown[]): AsyncIterable<Record<string, unknown>>;

  // Optional: OAuth support
  getOAuthUrl?(redirectUri: string, state?: string): Promise<string>;
  exchangeCodeForTokens?(code: string, redirectUri: string): Promise<AuthConfig>;
  refreshAccessToken?(refreshToken: string): Promise<AuthConfig>;

  // Connection health
  ping(): Promise<boolean>;
  getVersion(): Promise<string>;
}

export interface ConnectorError extends Error {
  code: string;
  retryable: boolean;
  context?: Record<string, unknown>;
}

export class BaseConnectorError extends Error implements ConnectorError {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = false,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export class ConnectionError extends BaseConnectorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONNECTION_FAILED', message, true, context);
    this.name = 'ConnectionError';
  }
}

export class AuthenticationError extends BaseConnectorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('AUTH_FAILED', message, false, context);
    this.name = 'AuthenticationError';
  }
}

export class QueryError extends BaseConnectorError {
  constructor(message: string, retryable = false, context?: Record<string, unknown>) {
    super('QUERY_FAILED', message, retryable, context);
    this.name = 'QueryError';
  }
}

export class RateLimitError extends BaseConnectorError {
  constructor(message: string, retryAfterMs?: number) {
    super('RATE_LIMITED', message, true, { retryAfterMs });
    this.name = 'RateLimitError';
  }
}
