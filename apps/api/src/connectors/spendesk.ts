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

export class SpendeskConnector extends BaseConnector {
  readonly type = 'spendesk' as const;
  readonly name = 'Spendesk';
  readonly version = '1.0.0';

  private apiKey: string | null = null;
  private baseUrl: string = 'https://api.spendesk.com/v1';

  async testConnection(config: AuthConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    try {
      this.validateConfig(config, ['apiKey']);
      
      // Test connection by fetching account information
      const response = await this.makeRequest('GET', '/accounts', config.credentials.apiKey);
      
      const latencyMs = Date.now() - startTime;
      
      return {
        success: true,
        latencyMs,
        version: 'Spendesk API v1',
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

    this.validateConfig(config, ['apiKey']);
    
    try {
      // Test the connection first
      await this.makeRequest('GET', '/accounts', config.credentials.apiKey);
      
      this.apiKey = config.credentials.apiKey;
      this.baseUrl = config.credentials.baseUrl || this.baseUrl;
      this.connected = true;
      this.connectionConfig = config;
      this.logConnection('Connected');
    } catch (error) {
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to Spendesk'
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.apiKey) {
      this.connected = false;
      this.apiKey = null;
      this.connectionConfig = undefined;
      this.logConnection('Disconnected');
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    // Spendesk doesn't have databases, return the account as a single "database"
    return [
      {
        name: 'spendesk_account',
        type: 'account'
      }
    ];
  }

  async listSchemas(database?: string): Promise<SchemaInfo[]> {
    // Spendesk API endpoints can be thought of as "schemas"
    return [
      { name: 'expenses', database: 'spendesk_account' },
      { name: 'cards', database: 'spendesk_account' },
      { name: 'users', database: 'spendesk_account' },
      { name: 'vendors', database: 'spendesk_account' },
      { name: 'budgets', database: 'spendesk_account' },
      { name: 'accounting', database: 'spendesk_account' }
    ];
  }

  async listTables(database?: string, schema?: string): Promise<TableInfo[]> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }

    const tables: TableInfo[] = [];
    
    // Define available Spendesk API endpoints as "tables"
    if (!schema || schema === 'expenses') {
      const expenseTables = [
        'expense_reports', 'expenses', 'expense_lines', 'receipts',
        'expense_categories', 'expense_approvals'
      ];
      
      tables.push(...expenseTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'expenses',
        database: 'spendesk_account'
      })));
    }

    if (!schema || schema === 'cards') {
      const cardTables = [
        'cards', 'card_transactions', 'card_holders', 'card_requests'
      ];
      
      tables.push(...cardTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'cards',
        database: 'spendesk_account'
      })));
    }

    if (!schema || schema === 'users') {
      const userTables = [
        'users', 'teams', 'roles', 'permissions'
      ];
      
      tables.push(...userTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'users',
        database: 'spendesk_account'
      })));
    }

    if (!schema || schema === 'vendors') {
      const vendorTables = [
        'vendors', 'vendor_payments', 'purchase_orders'
      ];
      
      tables.push(...vendorTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'vendors',
        database: 'spendesk_account'
      })));
    }

    if (!schema || schema === 'budgets') {
      const budgetTables = [
        'budgets', 'budget_lines', 'budget_allocations'
      ];
      
      tables.push(...budgetTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'budgets',
        database: 'spendesk_account'
      })));
    }

    if (!schema || schema === 'accounting') {
      const accountingTables = [
        'accounts', 'cost_centers', 'projects', 'tags'
      ];
      
      tables.push(...accountingTables.map(table => ({
        name: table,
        type: 'TABLE' as const,
        schema: 'accounting',
        database: 'spendesk_account'
      })));
    }

    return tables;
  }

  async listColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    // Return predefined column structures for common Spendesk entities
    const columnMappings: Record<string, ColumnInfo[]> = {
      'expense_reports': [
        { name: 'id', type: 'string', nullable: false, primaryKey: true },
        { name: 'title', type: 'string', nullable: false },
        { name: 'description', type: 'string', nullable: true },
        { name: 'user_id', type: 'string', nullable: false, foreignKey: true },
        { name: 'status', type: 'string', nullable: false },
        { name: 'currency', type: 'string', nullable: false },
        { name: 'total_amount', type: 'float', nullable: false },
        { name: 'submitted_at', type: 'datetime', nullable: true },
        { name: 'approved_at', type: 'datetime', nullable: true },
        { name: 'created_at', type: 'datetime', nullable: false },
        { name: 'updated_at', type: 'datetime', nullable: false }
      ],
      'expenses': [
        { name: 'id', type: 'string', nullable: false, primaryKey: true },
        { name: 'expense_report_id', type: 'string', nullable: true, foreignKey: true },
        { name: 'title', type: 'string', nullable: false },
        { name: 'description', type: 'string', nullable: true },
        { name: 'amount', type: 'float', nullable: false },
        { name: 'currency', type: 'string', nullable: false },
        { name: 'category_id', type: 'string', nullable: true, foreignKey: true },
        { name: 'vendor_id', type: 'string', nullable: true, foreignKey: true },
        { name: 'receipt_url', type: 'string', nullable: true },
        { name: 'date', type: 'datetime', nullable: false },
        { name: 'created_at', type: 'datetime', nullable: false },
        { name: 'updated_at', type: 'datetime', nullable: false }
      ],
      'cards': [
        { name: 'id', type: 'string', nullable: false, primaryKey: true },
        { name: 'holder_id', type: 'string', nullable: false, foreignKey: true },
        { name: 'card_number', type: 'string', nullable: false },
        { name: 'card_type', type: 'string', nullable: false },
        { name: 'status', type: 'string', nullable: false },
        { name: 'spending_limit', type: 'float', nullable: true },
        { name: 'currency', type: 'string', nullable: false },
        { name: 'expires_at', type: 'datetime', nullable: false },
        { name: 'created_at', type: 'datetime', nullable: false },
        { name: 'updated_at', type: 'datetime', nullable: false }
      ],
      'users': [
        { name: 'id', type: 'string', nullable: false, primaryKey: true },
        { name: 'email', type: 'string', nullable: false },
        { name: 'first_name', type: 'string', nullable: false },
        { name: 'last_name', type: 'string', nullable: false },
        { name: 'role', type: 'string', nullable: false },
        { name: 'team_id', type: 'string', nullable: true, foreignKey: true },
        { name: 'manager_id', type: 'string', nullable: true, foreignKey: true },
        { name: 'status', type: 'string', nullable: false },
        { name: 'created_at', type: 'datetime', nullable: false },
        { name: 'updated_at', type: 'datetime', nullable: false }
      ]
    };

    return columnMappings[table] || [
      { name: 'id', type: 'string', nullable: false, primaryKey: true },
      { name: 'name', type: 'string', nullable: true },
      { name: 'created_at', type: 'datetime', nullable: false },
      { name: 'updated_at', type: 'datetime', nullable: false }
    ];
  }

  async listForeignKeys(database?: string, schema?: string): Promise<ForeignKeyInfo[]> {
    // Return predefined foreign key relationships for Spendesk entities
    const foreignKeys: ForeignKeyInfo[] = [
      {
        constraintName: 'expense_report_user_fk',
        fromTable: 'expense_reports',
        fromColumn: 'user_id',
        toTable: 'users',
        toColumn: 'id'
      },
      {
        constraintName: 'expense_expense_report_fk',
        fromTable: 'expenses',
        fromColumn: 'expense_report_id',
        toTable: 'expense_reports',
        toColumn: 'id'
      },
      {
        constraintName: 'card_user_fk',
        fromTable: 'cards',
        fromColumn: 'holder_id',
        toTable: 'users',
        toColumn: 'id'
      },
      {
        constraintName: 'user_team_fk',
        fromTable: 'users',
        fromColumn: 'team_id',
        toTable: 'teams',
        toColumn: 'id'
      }
    ];

    return foreignKeys;
  }

  async executeQuery(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }

    // Spendesk doesn't support SQL queries directly
    // This is a simplified implementation that could be extended to parse basic queries
    throw new QueryError('Spendesk connector does not support direct SQL queries. Use specific API methods instead.');
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.apiKey) return false;
      
      await this.makeRequest('GET', '/accounts', this.apiKey);
      return true;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string> {
    return 'Spendesk API v1';
  }

  private async makeRequest(method: string, endpoint: string, apiKey?: string, data?: any): Promise<any> {
    const key = apiKey || this.apiKey;
    if (!key) {
      throw new AuthenticationError('API key is required');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Elev8-Analytics-Connector/1.0'
    };

    const options: RequestInit = {
      method,
      headers
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthenticationError('Invalid API key');
        } else if (response.status === 429) {
          throw new QueryError('Rate limit exceeded', true);
        } else if (response.status >= 500) {
          throw new QueryError(`Server error: ${response.status}`, true);
        } else {
          const errorBody = await response.text().catch(() => 'Unknown error');
          throw new QueryError(`API error: ${response.status} - ${errorBody}`);
        }
      }

      return await response.json();
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof QueryError) {
        throw error;
      }
      
      throw new ConnectionError(
        error instanceof Error ? error.message : 'Request failed'
      );
    }
  }

  private isRetryableError(error: any): boolean {
    return error.message?.includes('Rate limit') ||
           error.message?.includes('Server error') ||
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT';
  }

  // Spendesk-specific methods
  async getExpenseReports(status?: string): Promise<any[]> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }
    
    try {
      let endpoint = '/expense_reports';
      if (status) {
        endpoint += `?status=${encodeURIComponent(status)}`;
      }
      
      const response = await this.makeRequest('GET', endpoint);
      return response.data || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get expense reports'
      );
    }
  }

  async getExpenses(expenseReportId?: string): Promise<any[]> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }
    
    try {
      let endpoint = '/expenses';
      if (expenseReportId) {
        endpoint += `?expense_report_id=${encodeURIComponent(expenseReportId)}`;
      }
      
      const response = await this.makeRequest('GET', endpoint);
      return response.data || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get expenses'
      );
    }
  }

  async getCards(holderId?: string): Promise<any[]> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }
    
    try {
      let endpoint = '/cards';
      if (holderId) {
        endpoint += `?holder_id=${encodeURIComponent(holderId)}`;
      }
      
      const response = await this.makeRequest('GET', endpoint);
      return response.data || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get cards'
      );
    }
  }

  async getCardTransactions(cardId?: string, startDate?: string, endDate?: string): Promise<any[]> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }
    
    try {
      let endpoint = '/card_transactions';
      const params = new URLSearchParams();
      
      if (cardId) params.append('card_id', cardId);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }
      
      const response = await this.makeRequest('GET', endpoint);
      return response.data || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get card transactions'
      );
    }
  }

  async getUsers(): Promise<any[]> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }
    
    try {
      const response = await this.makeRequest('GET', '/users');
      return response.data || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get users'
      );
    }
  }

  async getVendors(): Promise<any[]> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }
    
    try {
      const response = await this.makeRequest('GET', '/vendors');
      return response.data || [];
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get vendors'
      );
    }
  }

  async getAccount(): Promise<any> {
    if (!this.connected || !this.apiKey) {
      throw new ConnectionError('Not connected to Spendesk');
    }
    
    try {
      const response = await this.makeRequest('GET', '/accounts');
      return response.data?.[0] || response;
    } catch (error) {
      throw new QueryError(
        error instanceof Error ? error.message : 'Failed to get account information'
      );
    }
  }
}