import jsforce from 'jsforce';
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

export class SalesforceConnector extends BaseConnector {
  readonly type = 'salesforce' as const;
  readonly name = 'Salesforce';
  readonly version = '1.0.0';

  private connection: jsforce.Connection | null = null;

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    try {
      const testConnection = this.createConnection(config);
      
      if (config.type === 'oauth2') {
        if (!config.credentials.accessToken) {
          throw new AuthenticationError('Access token is required for OAuth authentication');
        }
        // For OAuth, we assume the token is valid and test with a simple query
        testConnection.setAccessToken(config.credentials.accessToken, config.credentials.refreshToken);
      } else {
        // Username/password authentication
        this.validateConfig(config, ['username', 'password']);
        await testConnection.login(config.credentials.username, config.credentials.password + (config.credentials.securityToken || ''));
      }
      
      // Test with a simple SOQL query
      const result = await testConnection.query('SELECT Id FROM User LIMIT 1');
      
      const latencyMs = Date.now() - startTime;
      
      return {
        success: true,
        latencyMs,
        version: testConnection.version,
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

    try {
      this.connection = this.createConnection(config);
      
      if (config.type === 'oauth2') {
        if (!config.credentials.accessToken) {
          throw new AuthenticationError('Access token is required for OAuth authentication');
        }
        this.connection.setAccessToken(config.credentials.accessToken, config.credentials.refreshToken);
      } else {
        this.validateConfig(config, ['username', 'password']);
        await this.connection.login(config.credentials.username, config.credentials.password + (config.credentials.securityToken || ''));
      }
      
      this.connected = true;
      this.connectionConfig = config;
      this.logConnection('Connected');
    } catch (error) {
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to Salesforce'
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.logout();
      } catch {
        // Ignore logout errors
      }
      this.connected = false;
      this.connection = null;
      this.connectionConfig = undefined;
      this.logConnection('Disconnected');
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    // Salesforce doesn't have databases in the traditional sense
    // Return the org as a single "database"
    return [
      {
        name: 'salesforce_org',
        type: 'organization'
      }
    ];
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    // Salesforce doesn't have schemas in the traditional sense
    // Return different object categories as "schemas"
    return [
      { name: 'standard_objects', database: 'salesforce_org' },
      { name: 'custom_objects', database: 'salesforce_org' },
      { name: 'all_objects', database: 'salesforce_org' }
    ];
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    if (!this.connected || !this.connection) {
      throw new ConnectionError('Not connected to Salesforce');
    }

    try {
      const describe = await this.connection.describeGlobal();
      const sobjects = describe.sobjects;
      
      let filteredObjects = sobjects;
      
      // Filter based on schema
      if (schema === 'standard_objects') {
        filteredObjects = sobjects.filter(obj => !obj.custom);
      } else if (schema === 'custom_objects') {
        filteredObjects = sobjects.filter(obj => obj.custom);
      }
      
      return filteredObjects.map(obj => ({
        name: obj.name,
        type: 'TABLE' as const,
        schema: schema || 'all_objects',
        database: 'salesforce_org'
      }));
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to list Salesforce objects'
      );
    }
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    if (!this.connected || !this.connection) {
      throw new ConnectionError('Not connected to Salesforce');
    }

    try {
      const sobject = this.connection.sobject(table);
      const describe = await sobject.describe();
      
      return describe.fields.map(field => ({
        name: field.name,
        type: this.mapColumnType(field.type),
        nullable: field.nillable,
        primaryKey: field.name === 'Id',
        foreignKey: field.type === 'reference',
        defaultValue: field.defaultValue,
        maxLength: field.length
      }));
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to describe Salesforce object'
      );
    }
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    // Salesforce relationships are complex and context-dependent
    // This would require analyzing all objects and their reference fields
    // Return empty array for now - could be enhanced to analyze reference fields
    return [];
  }

  async executeQuery(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connected || !this.connection) {
      throw new ConnectionError('Not connected to Salesforce');
    }

    const startTime = Date.now();
    
    try {
      // Handle simple parameter substitution for SOQL
      let soql = sql;
      if (params) {
        params.forEach((param, index) => {
          soql = soql.replace(`$${index + 1}`, this.escapeSOQLParam(param));
        });
      }
      
      const result = await this.connection.query(soql);
      const executionTimeMs = Date.now() - startTime;
      
      // Extract column names from the first record
      const columns = result.records && result.records.length > 0 
        ? Object.keys(result.records[0]).filter(key => key !== 'attributes')
        : [];
      
      // Clean up the records (remove Salesforce attributes)
      const cleanRecords = result.records.map(record => {
        const { attributes, ...cleanRecord } = record;
        return cleanRecord;
      });
      
      return {
        columns,
        rows: cleanRecords,
        rowCount: result.totalSize || cleanRecords.length,
        executionTimeMs
      };
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'SOQL query execution failed',
        this.isRetryableError(error)
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.executeQuery('SELECT Id FROM User LIMIT 1');
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string> {
    return this.connection?.version || 'Unknown';
  }

  // OAuth-specific methods
  async getOAuthUrl(redirectUri: string, state?: string): Promise<string> {
    if (!this.connectionConfig || this.connectionConfig.type !== 'oauth2') {
      throw new AuthenticationError('OAuth configuration is required');
    }
    
    const oauth2 = new jsforce.OAuth2({
      clientId: this.connectionConfig.credentials.clientId,
      clientSecret: this.connectionConfig.credentials.clientSecret,
      redirectUri: redirectUri,
      loginUrl: this.connectionConfig.credentials.loginUrl || 'https://login.salesforce.com'
    });
    
    return oauth2.getAuthorizationUrl({
      scope: this.connectionConfig.credentials.scope || 'api refresh_token',
      state: state
    });
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<AuthConfig> {
    if (!this.connectionConfig || this.connectionConfig.type !== 'oauth2') {
      throw new AuthenticationError('OAuth configuration is required');
    }
    
    const oauth2 = new jsforce.OAuth2({
      clientId: this.connectionConfig.credentials.clientId,
      clientSecret: this.connectionConfig.credentials.clientSecret,
      redirectUri: redirectUri,
      loginUrl: this.connectionConfig.credentials.loginUrl || 'https://login.salesforce.com'
    });
    
    const connection = new jsforce.Connection({ oauth2 });
    const userInfo = await connection.authorize(code);
    
    return {
      type: 'oauth2',
      credentials: {
        ...this.connectionConfig.credentials,
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        instanceUrl: connection.instanceUrl
      },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthConfig> {
    if (!this.connectionConfig || this.connectionConfig.type !== 'oauth2') {
      throw new AuthenticationError('OAuth configuration is required');
    }
    
    const oauth2 = new jsforce.OAuth2({
      clientId: this.connectionConfig.credentials.clientId,
      clientSecret: this.connectionConfig.credentials.clientSecret,
      loginUrl: this.connectionConfig.credentials.loginUrl || 'https://login.salesforce.com'
    });
    
    const connection = new jsforce.Connection({
      oauth2,
      refreshToken: refreshToken
    });
    
    await connection.refresh();
    
    return {
      type: 'oauth2',
      credentials: {
        ...this.connectionConfig.credentials,
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        instanceUrl: connection.instanceUrl
      },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
    };
  }

  private createConnection(config: AuthConfig): jsforce.Connection {
    const options: any = {
      version: config.credentials.version || '62.0',
      maxRequest: config.credentials.maxRequest || 200,
      loginUrl: config.credentials.loginUrl || 'https://login.salesforce.com'
    };

    if (config.type === 'oauth2') {
      options.oauth2 = {
        clientId: config.credentials.clientId,
        clientSecret: config.credentials.clientSecret,
        redirectUri: config.credentials.redirectUri,
        loginUrl: options.loginUrl
      };
      
      if (config.credentials.instanceUrl) {
        options.instanceUrl = config.credentials.instanceUrl;
      }
    }

    return new jsforce.Connection(options);
  }

  private escapeSOQLParam(param: any): string {
    if (param === null || param === undefined) {
      return 'null';
    }
    if (typeof param === 'string') {
      return `'${param.replace(/'/g, "\\'")}'`;
    }
    if (typeof param === 'number' || typeof param === 'boolean') {
      return param.toString();
    }
    if (param instanceof Date) {
      return param.toISOString();
    }
    return `'${String(param)}'`;
  }

  private isRetryableError(error: any): boolean {
    const retryableErrorCodes = [
      'REQUEST_LIMIT_EXCEEDED',
      'SERVER_UNAVAILABLE',
      'UNABLE_TO_LOCK_ROW',
      'TIMEOUT'
    ];
    
    return retryableErrorCodes.includes(error.errorCode) ||
           error.message?.includes('timeout') ||
           error.message?.includes('rate limit') ||
           error.statusCode === 429 || // Too Many Requests
           error.statusCode === 503;   // Service Unavailable
  }

  protected mapColumnType(salesforceType: string): string {
    const type = salesforceType.toLowerCase();
    
    if (type === 'string' || type === 'textarea' || type === 'picklist' || 
        type === 'multipicklist' || type === 'email' || type === 'phone' || 
        type === 'url' || type === 'id') {
      return 'string';
    }
    if (type === 'int' || type === 'integer') {
      return 'number';
    }
    if (type === 'double' || type === 'currency' || type === 'percent') {
      return 'float';
    }
    if (type === 'boolean') {
      return 'boolean';
    }
    if (type === 'date' || type === 'datetime' || type === 'time') {
      return 'datetime';
    }
    if (type === 'reference') {
      return 'reference';
    }
    if (type === 'base64') {
      return 'binary';
    }
    
    return salesforceType;
  }

  // Salesforce-specific methods
  async bulkQuery(soql: string): Promise<any[]> {
    if (!this.connected || !this.connection) {
      throw new ConnectionError('Not connected to Salesforce');
    }
    
    return new Promise((resolve, reject) => {
      this.connection!.bulk.query(soql)
        .on('record', (records) => {
          resolve(records);
        })
        .on('error', (error) => {
          reject(new QueryError(error.message || 'Bulk query failed'));
        });
    });
  }

  async describeObject(objectName: string): Promise<any> {
    if (!this.connected || !this.connection) {
      throw new ConnectionError('Not connected to Salesforce');
    }
    
    const sobject = this.connection.sobject(objectName);
    return sobject.describe();
  }

  async getObjectMetadata(objectName: string): Promise<any> {
    if (!this.connected || !this.connection) {
      throw new ConnectionError('Not connected to Salesforce');
    }
    
    const describe = await this.describeObject(objectName);
    return {
      name: describe.name,
      label: describe.label,
      fields: describe.fields.length,
      recordTypes: describe.recordTypeInfos?.length || 0,
      createable: describe.createable,
      updateable: describe.updateable,
      deletable: describe.deletable,
      queryable: describe.queryable
    };
  }
}