import {
  IDataConnector,
  ConnectorType,
  AuthConfig,
  ConnectionTestResult,
  RetryOptions,
  BaseConnectorError,
} from './types.js';
import { withRetry as sharedWithRetry } from '@sme/utils';

export abstract class BaseConnector implements IDataConnector {
  protected connected = false;
  protected connectionConfig?: AuthConfig;
  protected retryOptions: RetryOptions = {
    maxAttempts: 3,
    backoffMs: 1000,
    exponentialBackoff: true,
    retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
  };

  abstract readonly type: ConnectorType;
  abstract readonly name: string;
  abstract readonly version: string;

  // Abstract methods that must be implemented by each connector
  abstract testConnection(config: AuthConfig): Promise<ConnectionTestResult>;
  abstract connect(config: AuthConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listDatabases(): Promise<import('./types.js').DatabaseInfo[]>;
  abstract listSchemas(database?: string): Promise<import('./types.js').SchemaInfo[]>;
  abstract listTables(
    database?: string,
    schema?: string,
  ): Promise<import('./types.js').TableInfo[]>;
  abstract listColumns(
    database: string,
    schema: string,
    table: string,
  ): Promise<import('./types.js').ColumnInfo[]>;
  abstract listForeignKeys(
    database?: string,
    schema?: string,
  ): Promise<import('./types.js').ForeignKeyInfo[]>;
  abstract executeQuery(sql: string, params?: unknown[]): Promise<import('./types.js').QueryResult>;
  abstract ping(): Promise<boolean>;
  abstract getVersion(): Promise<string>;

  isConnected(): boolean {
    return this.connected;
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    // Delegate to shared util to avoid duplication across codebase
    const opts = { ...this.retryOptions, ...options } as RetryOptions;
    return sharedWithRetry(operation, {
      maxAttempts: opts.maxAttempts,
      initialDelayMs: opts.backoffMs,
      backoffMultiplier: opts.exponentialBackoff ? 2 : 1,
      isRetryable: (e) => this.isRetryableError(e as Error, opts as RetryOptions),
    });
  }

  protected isRetryableError(error: Error, options?: RetryOptions): boolean {
    // Check if it's a ConnectorError with retryable flag
    if (error instanceof BaseConnectorError) {
      return error.retryable;
    }

    // Check against common retryable error codes
    const errorCode = (error as Error & { code?: string }).code;
    if (errorCode && options.retryableErrors?.includes(errorCode)) {
      return true;
    }

    // Check common network-related error messages
    const retryableMessages = [
      'timeout',
      'connection reset',
      'connection refused',
      'network error',
      'socket hang up',
    ];

    return retryableMessages.some((msg) => error.message.toLowerCase().includes(msg));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected validateConfig(config: AuthConfig, requiredFields: string[]): void {
    for (const field of requiredFields) {
      if (!config.credentials[field]) {
        throw new BaseConnectorError(
          'INVALID_CONFIG',
          `Missing required configuration field: ${field}`,
          false,
          { field },
        );
      }
    }
  }

  protected sanitizeConfigForLogging(config: AuthConfig): Record<string, unknown> {
    const sanitized = { ...config };

    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'privateKey',
      'clientSecret',
      'refreshToken',
      'accessToken',
    ];

    if (sanitized.credentials) {
      sanitized.credentials = { ...sanitized.credentials };
      sensitiveFields.forEach((field) => {
        if (sanitized.credentials[field]) {
          sanitized.credentials[field] = '***';
        }
      });
    }

    return sanitized;
  }

  protected logConnection(action: string, config?: AuthConfig): void {
    console.log(`[${this.type}] ${action}`, config ? this.sanitizeConfigForLogging(config) : '');
  }

  protected mapColumnType(nativeType: string): string {
    // Default implementation - override in specific connectors for better mapping
    const type = nativeType.toLowerCase();

    // Common type mappings
    if (type.includes('varchar') || type.includes('text') || type.includes('string')) {
      return 'string';
    }
    if (type.includes('int') || type.includes('number')) {
      return 'number';
    }
    if (type.includes('bool')) {
      return 'boolean';
    }
    if (type.includes('date') || type.includes('time')) {
      return 'datetime';
    }
    if (type.includes('float') || type.includes('double') || type.includes('decimal')) {
      return 'float';
    }

    return nativeType; // Return original if no mapping found
  }

  protected parseConnectionString(connectionString: string): Record<string, string> {
    const params: Record<string, string> = {};

    // Handle different connection string formats
    if (connectionString.includes('://')) {
      // URL format: protocol://user:pass@host:port/database?param=value
      const url = new URL(connectionString);
      params.host = url.hostname;
      params.port = url.port;
      params.database = url.pathname.slice(1); // Remove leading '/'
      params.username = url.username;
      params.password = url.password;

      // Add query parameters
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
    } else {
      // Key-value format: key=value;key2=value2
      connectionString.split(';').forEach((pair) => {
        const [key, value] = pair.split('=');
        if (key && value) {
          params[key.trim().toLowerCase()] = value.trim();
        }
      });
    }

    return params;
  }

  // Helper method for OAuth connectors
  protected generateStateParameter(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  // Helper method for secure token storage
  protected encryptToken(token: string): string {
    // In production, use proper encryption
    // This is a simple base64 encoding for demonstration
    return Buffer.from(token).toString('base64');
  }

  protected decryptToken(encryptedToken: string): string {
    // In production, use proper decryption
    return Buffer.from(encryptedToken, 'base64').toString();
  }
}
