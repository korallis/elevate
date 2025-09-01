import { IDataConnector, ConnectorType, AuthConfig } from './types.js';
import { SnowflakeConnector } from './snowflake.js';
import { MySQLConnector } from './mysql.js';
import { PostgreSQLConnector } from './postgres.js';
import { MSSQLConnector } from './mssql.js';
import { AzureSQLConnector } from './azure-sql.js';
import { BigQueryConnector } from './bigquery.js';
import { RedshiftConnector } from './redshift.js';
import { DatabricksConnector } from './databricks.js';
import { SalesforceConnector } from './salesforce.js';
import { XeroConnector } from './xero.js';
import { SpendeskConnector } from './spendesk.js';

export type { IDataConnector, ConnectorType, AuthConfig } from './types.js';
export * from './types.js';

// Connector registry
const connectorRegistry = new Map<ConnectorType, () => IDataConnector>([
  ['snowflake', () => new SnowflakeConnector()],
  ['mysql', () => new MySQLConnector()],
  ['postgresql', () => new PostgreSQLConnector()],
  ['mssql', () => new MSSQLConnector()],
  ['azure-sql', () => new AzureSQLConnector()],
  ['bigquery', () => new BigQueryConnector()],
  ['redshift', () => new RedshiftConnector()],
  ['databricks', () => new DatabricksConnector()],
  ['salesforce', () => new SalesforceConnector()],
  ['xero', () => new XeroConnector()],
  ['spendesk', () => new SpendeskConnector()],
]);

/**
 * Get a list of all available connector types
 */
export function getAvailableConnectorTypes(): ConnectorType[] {
  return Array.from(connectorRegistry.keys());
}

/**
 * Create a new connector instance by type
 */
export function createConnector(type: ConnectorType): IDataConnector {
  const factory = connectorRegistry.get(type);
  if (!factory) {
    throw new Error(`Unknown connector type: ${type}`);
  }
  return factory();
}

/**
 * Get connector metadata for all available connectors
 */
export function getConnectorMetadata(): Array<{
  type: ConnectorType;
  name: string;
  version: string;
  description: string;
  authTypes: string[];
  features: string[];
}> {
  return Array.from(connectorRegistry.entries()).map(([type, factory]) => {
    const connector = factory();
    return {
      type,
      name: connector.name,
      version: connector.version,
      description: getConnectorDescription(type),
      authTypes: getConnectorAuthTypes(type),
      features: getConnectorFeatures(type),
    };
  });
}

/**
 * Get description for a connector type
 */
function getConnectorDescription(type: ConnectorType): string {
  const descriptions: Record<ConnectorType, string> = {
    snowflake: 'Connect to Snowflake data cloud platform with support for key-pair and password authentication',
    mysql: 'Connect to MySQL databases with full schema discovery and querying capabilities',
    postgresql: 'Connect to PostgreSQL databases with comprehensive metadata and query support',
    mssql: 'Connect to Microsoft SQL Server with enterprise-grade features and performance',
    'azure-sql': 'Connect to Azure SQL Database with cloud-optimized performance and security',
    bigquery: 'Connect to Google BigQuery for large-scale analytics and data warehousing',
    redshift: 'Connect to Amazon Redshift for petabyte-scale data warehouse operations',
    databricks: 'Connect to Databricks for unified analytics and machine learning workloads',
    salesforce: 'Connect to Salesforce CRM with OAuth authentication and comprehensive object access',
    xero: 'Connect to Xero accounting platform with OAuth 2.0 for financial data integration',
    spendesk: 'Connect to Spendesk expense management platform via API key authentication'
  };
  return descriptions[type] || 'Database connector';
}

/**
 * Get supported authentication types for a connector
 */
function getConnectorAuthTypes(type: ConnectorType): string[] {
  const authTypes: Record<ConnectorType, string[]> = {
    snowflake: ['password', 'key_pair'],
    mysql: ['password'],
    postgresql: ['password'],
    mssql: ['password'],
    'azure-sql': ['password', 'aad'],
    bigquery: ['service_account'],
    redshift: ['password', 'iam'],
    databricks: ['token'],
    salesforce: ['password', 'oauth2'],
    xero: ['oauth2'],
    spendesk: ['api_key']
  };
  return authTypes[type] || ['password'];
}

/**
 * Get features supported by a connector
 */
function getConnectorFeatures(type: ConnectorType): string[] {
  const baseFeatures = ['schema_discovery', 'query_execution', 'connection_test'];
  
  const additionalFeatures: Record<ConnectorType, string[]> = {
    snowflake: ['streaming_queries', 'warehouse_management'],
    mysql: ['foreign_keys', 'indexes'],
    postgresql: ['foreign_keys', 'indexes', 'schemas'],
    mssql: ['foreign_keys', 'schemas', 'procedures'],
    'azure-sql': ['foreign_keys', 'schemas', 'azure_features'],
    bigquery: ['streaming_queries', 'partitioned_tables', 'datasets'],
    redshift: ['column_encoding', 'distribution_keys', 'sort_keys'],
    databricks: ['delta_tables', 'streaming', 'ml_features'],
    salesforce: ['oauth_refresh', 'bulk_operations', 'metadata_api'],
    xero: ['oauth_refresh', 'webhook_support'],
    spendesk: ['expense_reports', 'card_management']
  };
  
  return [...baseFeatures, ...(additionalFeatures[type] || [])];
}

/**
 * Check if a connector type is valid
 */
export function isValidConnectorType(type: string): type is ConnectorType {
  return connectorRegistry.has(type as ConnectorType);
}

/**
 * Get connector requirements for setup
 */
export function getConnectorRequirements(type: ConnectorType): {
  requiredFields: string[];
  optionalFields: string[];
  instructions: string;
} {
  const requirements: Record<ConnectorType, {
    requiredFields: string[];
    optionalFields: string[];
    instructions: string;
  }> = {
    snowflake: {
      requiredFields: ['account', 'username', 'warehouse'],
      optionalFields: ['password', 'privateKey', 'role', 'database', 'schema'],
      instructions: 'Either password or privateKey is required. For key-pair auth, provide privateKey (PEM format).'
    },
    mysql: {
      requiredFields: ['host', 'user', 'password'],
      optionalFields: ['port', 'database', 'ssl', 'connectionString'],
      instructions: 'Standard MySQL connection. Use connectionString for advanced configurations.'
    },
    postgresql: {
      requiredFields: ['host', 'user', 'password', 'database'],
      optionalFields: ['port', 'ssl', 'connectionString'],
      instructions: 'Standard PostgreSQL connection. Use connectionString for advanced configurations.'
    },
    mssql: {
      requiredFields: ['server', 'user', 'password'],
      optionalFields: ['port', 'database', 'encrypt', 'trustServerCertificate', 'connectionString'],
      instructions: 'SQL Server connection. Encryption is enabled by default.'
    },
    'azure-sql': {
      requiredFields: ['server', 'user', 'password', 'database'],
      optionalFields: ['port', 'authentication', 'connectionString'],
      instructions: 'Azure SQL Database connection. Encryption is always enabled.'
    },
    bigquery: {
      requiredFields: ['projectId'],
      optionalFields: ['keyFilename', 'credentials', 'location', 'email', 'key'],
      instructions: 'Use service account key file (keyFilename) or JSON credentials.'
    },
    redshift: {
      requiredFields: ['host', 'user', 'password', 'database'],
      optionalFields: ['port', 'ssl', 'connectionString'],
      instructions: 'Amazon Redshift connection. Default port is 5439.'
    },
    databricks: {
      requiredFields: ['serverHostname', 'httpPath', 'token'],
      optionalFields: ['port', 'catalogName', 'schemaName', 'connectionTimeout'],
      instructions: 'Databricks SQL connection using personal access token.'
    },
    salesforce: {
      requiredFields: ['username', 'password'],
      optionalFields: ['securityToken', 'clientId', 'clientSecret', 'loginUrl', 'accessToken', 'refreshToken'],
      instructions: 'Use username/password + security token OR OAuth with clientId/clientSecret.'
    },
    xero: {
      requiredFields: ['clientId', 'clientSecret', 'accessToken', 'tenantId'],
      optionalFields: ['redirectUri', 'scopes'],
      instructions: 'OAuth 2.0 authentication required. Complete OAuth flow to get access token.'
    },
    spendesk: {
      requiredFields: ['apiKey'],
      optionalFields: ['baseUrl'],
      instructions: 'API key authentication. Get your API key from Spendesk settings.'
    }
  };
  
  return requirements[type] || {
    requiredFields: [],
    optionalFields: [],
    instructions: 'No specific requirements defined.'
  };
}

/**
 * Validate connector configuration
 */
export function validateConnectorConfig(type: ConnectorType, config: AuthConfig): {
  valid: boolean;
  errors: string[];
} {
  const requirements = getConnectorRequirements(type);
  const errors: string[] = [];
  
  // Check required fields
  for (const field of requirements.requiredFields) {
    if (!config.credentials[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Type-specific validations
  if (type === 'snowflake') {
    if (!config.credentials.password && !config.credentials.privateKey) {
      errors.push('Either password or privateKey is required for Snowflake');
    }
  }
  
  if (type === 'xero' && config.type !== 'oauth2') {
    errors.push('Xero requires OAuth2 authentication type');
  }
  
  if (type === 'salesforce' && config.type === 'oauth2' && !config.credentials.clientId) {
    errors.push('clientId is required for Salesforce OAuth authentication');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get OAuth configuration for OAuth-enabled connectors
 */
export function getOAuthConfig(type: ConnectorType): {
  supportsOAuth: boolean;
  authUrl?: string;
  scopes?: string[];
} {
  const oauthConfigs: Record<string, {
    supportsOAuth: boolean;
    authUrl?: string;
    scopes?: string[];
  }> = {
    salesforce: {
      supportsOAuth: true,
      authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
      scopes: ['api', 'refresh_token', 'web']
    },
    xero: {
      supportsOAuth: true,
      authUrl: 'https://login.xero.com/identity/connect/authorize',
      scopes: ['accounting.transactions', 'accounting.contacts', 'accounting.settings']
    }
  };
  
  return oauthConfigs[type] || { supportsOAuth: false };
}

// Re-export all connector classes for direct usage
export {
  SnowflakeConnector,
  MySQLConnector,
  PostgreSQLConnector,
  MSSQLConnector,
  AzureSQLConnector,
  BigQueryConnector,
  RedshiftConnector,
  DatabricksConnector,
  SalesforceConnector,
  XeroConnector,
  SpendeskConnector
};