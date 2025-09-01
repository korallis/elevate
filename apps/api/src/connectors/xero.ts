import { XeroClient } from 'xero-node';
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

export class XeroConnector extends BaseConnector {
  readonly type = 'xero' as const;
  readonly name = 'Xero';
  readonly version = '1.0.0';

  private xero: XeroClient | null = null;
  private tenantId: string | null = null;

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    try {
      this.validateConfig(config, ['clientId', 'clientSecret']);
      
      if (config.type !== 'oauth2' || !config.credentials.accessToken) {
        throw new AuthenticationError('OAuth2 access token is required for Xero');
      }
      
      const testClient = this.createClient(config);
      testClient.setTokenSet({
        access_token: config.credentials.accessToken,
        refresh_token: config.credentials.refreshToken,
        token_type: 'Bearer',
        expires_at: config.expiresAt?.getTime()
      });
      
      // Test by getting organisation info
      const organisations = await testClient.accountingApi.getOrganisations(config.credentials.tenantId);
      
      const latencyMs = Date.now() - startTime;
      
      return {
        success: true,
        latencyMs,
        version: 'Xero API v2',
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

    this.validateConfig(config, ['clientId', 'clientSecret', 'accessToken', 'tenantId']);
    
    if (config.type !== 'oauth2') {
      throw new AuthenticationError('Xero requires OAuth2 authentication');
    }

    try {
      this.xero = this.createClient(config);
      this.xero.setTokenSet({
        access_token: config.credentials.accessToken,
        refresh_token: config.credentials.refreshToken,
        token_type: 'Bearer',
        expires_at: config.expiresAt?.getTime()
      });
      
      this.tenantId = config.credentials.tenantId;
      this.connected = true;
      this.connectionConfig = config;
      this.logConnection('Connected');
    } catch (error) {
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to Xero'
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.xero) {
      this.connected = false;
      this.xero = null;
      this.tenantId = null;
      this.connectionConfig = undefined;
      this.logConnection('Disconnected');
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    // Xero doesn't have databases, return the organization as a single "database"
    return [
      {
        name: 'xero_organisation',
        type: 'organization'
      }
    ];
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    // Xero API endpoints can be thought of as "schemas"
    return [
      { name: 'accounting', database: 'xero_organisation' },
      { name: 'payroll', database: 'xero_organisation' },
      { name: 'assets', database: 'xero_organisation' },
      { name: 'files', database: 'xero_organisation' }
    ];
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    if (!this.connected || !this.xero || !this.tenantId) {
      throw new ConnectionError('Not connected to Xero');
    }

    const tables: TableInfo[] = [];
    
    // Define available Xero API endpoints as "tables"
    if (!schema || schema === 'accounting') {
      const accountingTables = [
        'accounts', 'contacts', 'invoices', 'payments', 'items',
        'taxRates', 'currencies', 'employees', 'expenses',
        'bankTransactions', 'creditNotes', 'quotes', 'receipts',
        'purchaseOrders', 'journals', 'organisations', 'users'
      ];
      
      tables.push(...accountingTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'accounting',
        database: 'xero_organisation'
      })));
    }

    if (!schema || schema === 'payroll') {
      const payrollTables = [
        'employees', 'payRuns', 'payslips', 'timesheets',
        'leaveApplications', 'leaveTypes', 'payItems', 'settings'
      ];
      
      tables.push(...payrollTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'payroll',
        database: 'xero_organisation'
      })));
    }

    if (!schema || schema === 'assets') {
      const assetTables = [
        'assets', 'assetTypes', 'settings'
      ];
      
      tables.push(...assetTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'assets',
        database: 'xero_organisation'
      })));
    }

    return tables;
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    // Return predefined column structures for common Xero entities
    const columnMappings: Record<string, ColumnInfo[]> = {
      'accounts': [
        { name: 'AccountID', type: 'string', nullable: false, primaryKey: true },
        { name: 'Code', type: 'string', nullable: false },
        { name: 'Name', type: 'string', nullable: false },
        { name: 'Type', type: 'string', nullable: false },
        { name: 'BankAccountNumber', type: 'string', nullable: true },
        { name: 'Status', type: 'string', nullable: false },
        { name: 'Description', type: 'string', nullable: true },
        { name: 'Class', type: 'string', nullable: true },
        { name: 'SystemAccount', type: 'string', nullable: true },
        { name: 'EnablePaymentsToAccount', type: 'boolean', nullable: true },
        { name: 'ShowInExpenseClaims', type: 'boolean', nullable: true },
        { name: 'TaxType', type: 'string', nullable: true },
        { name: 'UpdatedDateUTC', type: 'datetime', nullable: true }
      ],
      'contacts': [
        { name: 'ContactID', type: 'string', nullable: false, primaryKey: true },
        { name: 'ContactNumber', type: 'string', nullable: true },
        { name: 'AccountNumber', type: 'string', nullable: true },
        { name: 'ContactStatus', type: 'string', nullable: false },
        { name: 'Name', type: 'string', nullable: false },
        { name: 'FirstName', type: 'string', nullable: true },
        { name: 'LastName', type: 'string', nullable: true },
        { name: 'EmailAddress', type: 'string', nullable: true },
        { name: 'BankAccountDetails', type: 'string', nullable: true },
        { name: 'TaxNumber', type: 'string', nullable: true },
        { name: 'AccountsReceivableTaxType', type: 'string', nullable: true },
        { name: 'AccountsPayableTaxType', type: 'string', nullable: true },
        { name: 'IsSupplier', type: 'boolean', nullable: true },
        { name: 'IsCustomer', type: 'boolean', nullable: true },
        { name: 'UpdatedDateUTC', type: 'datetime', nullable: true }
      ],
      'invoices': [
        { name: 'InvoiceID', type: 'string', nullable: false, primaryKey: true },
        { name: 'InvoiceNumber', type: 'string', nullable: false },
        { name: 'Reference', type: 'string', nullable: true },
        { name: 'Type', type: 'string', nullable: false },
        { name: 'ContactID', type: 'string', nullable: false, foreignKey: true },
        { name: 'Date', type: 'datetime', nullable: false },
        { name: 'DueDate', type: 'datetime', nullable: true },
        { name: 'Status', type: 'string', nullable: false },
        { name: 'LineAmountTypes', type: 'string', nullable: false },
        { name: 'SubTotal', type: 'float', nullable: false },
        { name: 'TotalTax', type: 'float', nullable: false },
        { name: 'Total', type: 'float', nullable: false },
        { name: 'AmountDue', type: 'float', nullable: false },
        { name: 'AmountPaid', type: 'float', nullable: false },
        { name: 'AmountCredited', type: 'float', nullable: false },
        { name: 'CurrencyCode', type: 'string', nullable: false },
        { name: 'FullyPaidOnDate', type: 'datetime', nullable: true },
        { name: 'UpdatedDateUTC', type: 'datetime', nullable: true }
      ]
    };

    return columnMappings[table] || [
      { name: 'ID', type: 'string', nullable: false, primaryKey: true },
      { name: 'Name', type: 'string', nullable: true },
      { name: 'UpdatedDateUTC', type: 'datetime', nullable: true }
    ];
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    // Return predefined foreign key relationships for Xero entities
    const foreignKeys: ForeignKeyInfo[] = [
      {
        constraintName: 'invoice_contact_fk',
        fromTable: 'invoices',
        fromColumn: 'ContactID',
        toTable: 'contacts',
        toColumn: 'ContactID'
      },
      {
        constraintName: 'payment_invoice_fk',
        fromTable: 'payments',
        fromColumn: 'InvoiceID',
        toTable: 'invoices',
        toColumn: 'InvoiceID'
      },
      {
        constraintName: 'payment_account_fk',
        fromTable: 'payments',
        fromColumn: 'AccountID',
        toTable: 'accounts',
        toColumn: 'AccountID'
      }
    ];

    return foreignKeys;
  }

  async executeQuery(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connected || !this.xero || !this.tenantId) {
      throw new ConnectionError('Not connected to Xero');
    }

    // Xero doesn't support SQL queries directly
    // This is a simplified implementation that maps basic queries to API calls
    throw new QueryError('Xero connector does not support direct SQL queries. Use specific API methods instead.');
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.xero || !this.tenantId) return false;
      
      await this.xero.accountingApi.getOrganisations(this.tenantId);
      return true;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string> {
    return 'Xero API v2.0';
  }

  // OAuth-specific methods
  async getOAuthUrl(redirectUri: string, state?: string): Promise<string> {
    if (!this.connectionConfig) {
      throw new AuthenticationError('Connection configuration is required');
    }
    
    const client = this.createClient(this.connectionConfig);
    return client.buildConsentUrl(redirectUri, 'accounting.transactions', state);
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<AuthConfig> {
    if (!this.connectionConfig) {
      throw new AuthenticationError('Connection configuration is required');
    }
    
    const client = this.createClient(this.connectionConfig);
    const tokenSet = await client.getAccessTokenFromCode(code);
    
    // Get tenant information
    const tenants = await client.updateTenants();
    const tenantId = tenants[0]?.tenantId;
    
    return {
      type: 'oauth2',
      credentials: {
        ...this.connectionConfig.credentials,
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token,
        tenantId: tenantId
      },
      expiresAt: new Date(Date.now() + (tokenSet.expires_in || 1800) * 1000)
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthConfig> {
    if (!this.connectionConfig) {
      throw new AuthenticationError('Connection configuration is required');
    }
    
    const client = this.createClient(this.connectionConfig);
    const tokenSet = await client.refreshAccessToken(refreshToken);
    
    return {
      type: 'oauth2',
      credentials: {
        ...this.connectionConfig.credentials,
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token
      },
      expiresAt: new Date(Date.now() + (tokenSet.expires_in || 1800) * 1000)
    };
  }

  private createClient(config: AuthConfig): XeroClient {
    return new XeroClient({
      clientId: config.credentials.clientId,
      clientSecret: config.credentials.clientSecret,
      redirectUris: [config.credentials.redirectUri],
      scopes: config.credentials.scopes?.split(' ') || ['accounting.transactions', 'accounting.contacts', 'accounting.settings'],
      httpTimeout: config.credentials.httpTimeout || 30000
    });
  }

  private isRetryableError(error: any): boolean {
    return error.response?.status === 429 || // Rate limited
           error.response?.status === 503 || // Service unavailable
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT';
  }

  // Xero-specific methods
  async getAccounts(): Promise<any[]> {
    if (!this.connected || !this.xero || !this.tenantId) {
      throw new ConnectionError('Not connected to Xero');
    }
    
    try {
      const response = await this.xero.accountingApi.getAccounts(this.tenantId);
      return response.body.accounts || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get accounts'
      );
    }
  }

  async getContacts(): Promise<any[]> {
    if (!this.connected || !this.xero || !this.tenantId) {
      throw new ConnectionError('Not connected to Xero');
    }
    
    try {
      const response = await this.xero.accountingApi.getContacts(this.tenantId);
      return response.body.contacts || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get contacts'
      );
    }
  }

  async getInvoices(status?: string): Promise<any[]> {
    if (!this.connected || !this.xero || !this.tenantId) {
      throw new ConnectionError('Not connected to Xero');
    }
    
    try {
      const response = await this.xero.accountingApi.getInvoices(this.tenantId, undefined, undefined, undefined, undefined, status);
      return response.body.invoices || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get invoices'
      );
    }
  }

  async getOrganisation(): Promise<any> {
    if (!this.connected || !this.xero || !this.tenantId) {
      throw new ConnectionError('Not connected to Xero');
    }
    
    try {
      const response = await this.xero.accountingApi.getOrganisations(this.tenantId);
      return response.body.organisations?.[0];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get organisation'
      );
    }
  }

  async getBankTransactions(): Promise<any[]> {
    if (!this.connected || !this.xero || !this.tenantId) {
      throw new ConnectionError('Not connected to Xero');
    }
    
    try {
      const response = await this.xero.accountingApi.getBankTransactions(this.tenantId);
      return response.body.bankTransactions || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get bank transactions'
      );
    }
  }
}