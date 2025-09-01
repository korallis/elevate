'use client';

import React, { useState, useEffect } from 'react';

type DataConnector =
  | 'snowflake'
  | 'xero'
  | 'mssql'
  | 'mysql'
  | 'postgresql'
  | 'spendesk'
  | 'azuredb'
  | 'salesforce'
  | 'bigquery'
  | 'redshift'
  | 'databricks';

interface ConnectorConfig {
  id: DataConnector;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
}

const CONNECTOR_CONFIGS: Record<DataConnector, ConnectorConfig> = {
  snowflake: {
    id: 'snowflake',
    name: 'Snowflake',
    displayName: 'Snowflake Data Cloud',
    description: 'Cloud-native data warehouse',
    icon: '❄️',
    color: 'hsl(196, 100%, 48%)',
    gradient: 'linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%)',
  },
  xero: {
    id: 'xero',
    name: 'Xero',
    displayName: 'Xero Accounting',
    description: 'Cloud accounting software',
    icon: '📊',
    color: 'hsl(200, 100%, 40%)',
    gradient: 'linear-gradient(135deg, #13B4CA 0%, #0084FF 100%)',
  },
  mssql: {
    id: 'mssql',
    name: 'MS SQL',
    displayName: 'Microsoft SQL Server',
    description: 'Enterprise database',
    icon: '🗄️',
    color: 'hsl(0, 100%, 43%)',
    gradient: 'linear-gradient(135deg, #CC2936 0%, #F85032 100%)',
  },
  mysql: {
    id: 'mysql',
    name: 'MySQL',
    displayName: 'MySQL Database',
    description: 'Open-source database',
    icon: '🐬',
    color: 'hsl(199, 100%, 32%)',
    gradient: 'linear-gradient(135deg, #00678F 0%, #00A8E1 100%)',
  },
  postgresql: {
    id: 'postgresql',
    name: 'PostgreSQL',
    displayName: 'PostgreSQL Database',
    description: 'Advanced open-source database',
    icon: '🐘',
    color: 'hsl(199, 71%, 38%)',
    gradient: 'linear-gradient(135deg, #336791 0%, #4A90C7 100%)',
  },
  spendesk: {
    id: 'spendesk',
    name: 'Spendesk',
    displayName: 'Spendesk Finance',
    description: 'Spend management platform',
    icon: '💳',
    color: 'hsl(286, 60%, 50%)',
    gradient: 'linear-gradient(135deg, #7B42BC 0%, #B042FF 100%)',
  },
  azuredb: {
    id: 'azuredb',
    name: 'Azure SQL',
    displayName: 'Azure SQL Database',
    description: 'Cloud database service',
    icon: '☁️',
    color: 'hsl(206, 100%, 48%)',
    gradient: 'linear-gradient(135deg, #0078D4 0%, #40E0D0 100%)',
  },
  salesforce: {
    id: 'salesforce',
    name: 'Salesforce',
    displayName: 'Salesforce CRM',
    description: 'Customer relationship management',
    icon: '☁️',
    color: 'hsl(200, 100%, 50%)',
    gradient: 'linear-gradient(135deg, #00A1E0 0%, #79D0F1 100%)',
  },
  bigquery: {
    id: 'bigquery',
    name: 'BigQuery',
    displayName: 'Google BigQuery',
    description: 'Serverless data warehouse',
    icon: '🔍',
    color: 'hsl(217, 89%, 61%)',
    gradient: 'linear-gradient(135deg, #4285F4 0%, #34A853 100%)',
  },
  redshift: {
    id: 'redshift',
    name: 'Redshift',
    displayName: 'Amazon Redshift',
    description: 'AWS data warehouse',
    icon: '🚀',
    color: 'hsl(24, 100%, 50%)',
    gradient: 'linear-gradient(135deg, #FF6B00 0%, #FF9500 100%)',
  },
  databricks: {
    id: 'databricks',
    name: 'Databricks',
    displayName: 'Databricks Lakehouse',
    description: 'Unified analytics platform',
    icon: '🧱',
    color: 'hsl(0, 100%, 50%)',
    gradient: 'linear-gradient(135deg, #FF3621 0%, #FF6B35 100%)',
  },
};

const FEATURED_CONNECTORS: DataConnector[] = [
  'snowflake',
  'xero',
  'mssql',
  'spendesk',
  'azuredb',
  'salesforce',
  'bigquery',
  'databricks',
];

export function ConnectorSwitcher() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % FEATURED_CONNECTORS.length);
        setIsAnimating(false);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const currentConnector = CONNECTOR_CONFIGS[FEATURED_CONNECTORS[currentIndex]];

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`
          inline-block transition-all duration-300 font-bold text-5xl sm:text-6xl lg:text-7xl xl:text-8xl
          bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent
          ${isAnimating ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'}
        `}
      >
        {currentConnector.displayName}
      </span>
      <span
        className={`
          text-4xl sm:text-5xl lg:text-6xl transition-all duration-300
          ${isAnimating ? 'rotate-180 scale-0' : 'rotate-0 scale-100'}
        `}
      >
        {currentConnector.icon}
      </span>
    </div>
  );
}
