# Elev8 Platform - Rebrand & Multi-Connector Architecture

## Rebrand from SME Analytics to Elev8

- Company Name: Elev8
- Product: Elev8 Analytics Platform
- Tagline: "Elevate Your Data Intelligence"
- Domain: elev8.io (assumed)

## Supported Data Connectors

1. **Snowflake** - Data warehouse (existing)
2. **Microsoft SQL Server** - Enterprise database
3. **PostgreSQL** - Open source database (existing)
4. **MySQL** - Popular open source database
5. **Xero** - Accounting software
6. **Spendesk** - Expense management
7. **Azure SQL Database** - Cloud database
8. **Salesforce** - CRM platform

## Connector Architecture

```typescript
interface DataConnector {
  id: string;
  name: string;
  icon: string;
  color: string;
  category: 'warehouse' | 'database' | 'saas' | 'crm';
  status: 'available' | 'coming-soon' | 'beta';
}

const connectors: DataConnector[] = [
  {
    id: 'snowflake',
    name: 'Snowflake',
    icon: '❄️',
    color: '#29B5E8',
    category: 'warehouse',
    status: 'available',
  },
  {
    id: 'mssql',
    name: 'MS SQL Server',
    icon: '🗄️',
    color: '#CC2927',
    category: 'database',
    status: 'available',
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    icon: '🐘',
    color: '#336791',
    category: 'database',
    status: 'available',
  },
  {
    id: 'mysql',
    name: 'MySQL',
    icon: '🐬',
    color: '#4479A1',
    category: 'database',
    status: 'available',
  },
  { id: 'xero', name: 'Xero', icon: '📊', color: '#13B5EA', category: 'saas', status: 'available' },
  {
    id: 'spendesk',
    name: 'Spendesk',
    icon: '💳',
    color: '#FF5E5B',
    category: 'saas',
    status: 'beta',
  },
  {
    id: 'azure',
    name: 'Azure SQL',
    icon: '☁️',
    color: '#0078D4',
    category: 'database',
    status: 'available',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    icon: '☁️',
    color: '#00A1E0',
    category: 'crm',
    status: 'available',
  },
];
```

## Hero Section Animation

- Rotating text animation cycling through connectors
- Smooth fade/slide transitions
- 3-second intervals per connector
- Color change to match connector brand

## TypeScript Compliance Updates Needed

1. Replace all `any` types with proper types or `unknown`
2. Add explicit return types to all functions
3. Implement proper error handling with custom error types
4. Add Zod validation for API responses
5. Use discriminated unions for state management
6. Enable strict mode in tsconfig.json
