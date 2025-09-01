import { z } from 'zod';

export const DataConnectorSchema = z.enum([
  'snowflake',
  'xero',
  'mssql',
  'mysql',
  'postgresql',
  'spendesk',
  'azuredb',
  'salesforce',
  'bigquery',
  'redshift',
  'databricks',
]);

export type DataConnector = z.infer<typeof DataConnectorSchema>;

export interface ConnectorConfig {
  id: DataConnector;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
  features: string[];
  category: 'warehouse' | 'erp' | 'crm' | 'finance' | 'database';
}

export const CONNECTOR_CONFIGS: Record<DataConnector, ConnectorConfig> = {
  snowflake: {
    id: 'snowflake',
    name: 'Snowflake',
    displayName: 'Snowflake Data Cloud',
    description: 'Cloud-native data warehouse with elastic scaling',
    icon: '❄️',
    color: 'hsl(196, 100%, 48%)',
    gradient: 'linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%)',
    features: ['Data Warehouse', 'SQL Analytics', 'Data Sharing'],
    category: 'warehouse',
  },
  xero: {
    id: 'xero',
    name: 'Xero',
    displayName: 'Xero Accounting',
    description: 'Cloud-based accounting software for small businesses',
    icon: '📊',
    color: 'hsl(200, 100%, 40%)',
    gradient: 'linear-gradient(135deg, #13B4CA 0%, #0084FF 100%)',
    features: ['Accounting', 'Invoicing', 'Financial Reports'],
    category: 'erp',
  },
  mssql: {
    id: 'mssql',
    name: 'MS SQL',
    displayName: 'Microsoft SQL Server',
    description: 'Enterprise relational database management system',
    icon: '🗄️',
    color: 'hsl(0, 100%, 43%)',
    gradient: 'linear-gradient(135deg, #CC2936 0%, #F85032 100%)',
    features: ['RDBMS', 'T-SQL', 'Enterprise Analytics'],
    category: 'database',
  },
  mysql: {
    id: 'mysql',
    name: 'MySQL',
    displayName: 'MySQL Database',
    description: 'Open-source relational database system',
    icon: '🐬',
    color: 'hsl(199, 100%, 32%)',
    gradient: 'linear-gradient(135deg, #00678F 0%, #00A8E1 100%)',
    features: ['RDBMS', 'High Performance', 'Replication'],
    category: 'database',
  },
  postgresql: {
    id: 'postgresql',
    name: 'PostgreSQL',
    displayName: 'PostgreSQL Database',
    description: 'Advanced open-source relational database',
    icon: '🐘',
    color: 'hsl(199, 71%, 38%)',
    gradient: 'linear-gradient(135deg, #336791 0%, #4A90C7 100%)',
    features: ['Advanced SQL', 'JSONB', 'Extensions'],
    category: 'database',
  },
  spendesk: {
    id: 'spendesk',
    name: 'Spendesk',
    displayName: 'Spendesk Finance',
    description: 'All-in-one spend management platform',
    icon: '💳',
    color: 'hsl(286, 60%, 50%)',
    gradient: 'linear-gradient(135deg, #7B42BC 0%, #B042FF 100%)',
    features: ['Expense Management', 'Virtual Cards', 'Budgets'],
    category: 'finance',
  },
  azuredb: {
    id: 'azuredb',
    name: 'Azure DB',
    displayName: 'Azure SQL Database',
    description: 'Fully managed cloud database service',
    icon: '☁️',
    color: 'hsl(206, 100%, 48%)',
    gradient: 'linear-gradient(135deg, #0078D4 0%, #40E0D0 100%)',
    features: ['Managed Service', 'Auto-scaling', 'Azure Integration'],
    category: 'database',
  },
  salesforce: {
    id: 'salesforce',
    name: 'Salesforce',
    displayName: 'Salesforce CRM',
    description: 'Leading customer relationship management platform',
    icon: '☁️',
    color: 'hsl(200, 100%, 50%)',
    gradient: 'linear-gradient(135deg, #00A1E0 0%, #79D0F1 100%)',
    features: ['CRM', 'Sales Cloud', 'Marketing Cloud'],
    category: 'crm',
  },
  bigquery: {
    id: 'bigquery',
    name: 'BigQuery',
    displayName: 'Google BigQuery',
    description: 'Serverless, highly scalable data warehouse',
    icon: '🔍',
    color: 'hsl(217, 89%, 61%)',
    gradient: 'linear-gradient(135deg, #4285F4 0%, #34A853 100%)',
    features: ['Serverless', 'ML Integration', 'Real-time Analytics'],
    category: 'warehouse',
  },
  redshift: {
    id: 'redshift',
    name: 'Redshift',
    displayName: 'Amazon Redshift',
    description: 'Fast, scalable data warehouse by AWS',
    icon: '🚀',
    color: 'hsl(24, 100%, 50%)',
    gradient: 'linear-gradient(135deg, #FF6B00 0%, #FF9500 100%)',
    features: ['Columnar Storage', 'Massively Parallel', 'AWS Native'],
    category: 'warehouse',
  },
  databricks: {
    id: 'databricks',
    name: 'Databricks',
    displayName: 'Databricks Lakehouse',
    description: 'Unified analytics platform for big data and AI',
    icon: '🧱',
    color: 'hsl(0, 100%, 50%)',
    gradient: 'linear-gradient(135deg, #FF3621 0%, #FF6B35 100%)',
    features: ['Lakehouse', 'Apache Spark', 'ML Platform'],
    category: 'warehouse',
  },
};

export const getConnectorsByCategory = (
  category: ConnectorConfig['category'],
): ConnectorConfig[] => {
  return Object.values(CONNECTOR_CONFIGS).filter((c) => c.category === category);
};

export const getConnectorConfig = (connector: DataConnector): ConnectorConfig => {
  return CONNECTOR_CONFIGS[connector];
};
