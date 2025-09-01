import { 
  proxyActivities, 
  log, 
  defineQuery, 
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type { ConnectorType, DatabaseInfo, SchemaInfo, TableInfo, ColumnInfo } from '../../../api/src/connectors/types.js';
import type * as activities from '../activities/index.js';

const {
  connectToSource,
  disconnectFromSource,
  discoverDatabases,
  discoverSchemas,
  discoverTables,
  discoverColumns,
  analyzeSampleData,
  inferDataTypes,
  detectPrimaryKeys,
  detectRelationships,
  updateCatalog,
  sendNotification
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '15 minutes',
  retry: {
    initialInterval: '10 seconds',
    maximumInterval: '2 minutes',
    maximumAttempts: 3,
    backoffCoefficient: 2.0,
  },
});

export interface SchemaDiscoveryWorkflowInput {
  connectionId: string;
  connectorType: ConnectorType;
  discoveryConfig: {
    databases?: string[];
    schemas?: string[];
    includeTables: boolean;
    includeColumns: boolean;
    includeSampleData: boolean;
    includeStatistics: boolean;
    maxSampleRows: number;
    detectRelationships: boolean;
  };
  authConfig: {
    type: string;
    credentials: Record<string, unknown>;
  };
  notificationConfig?: {
    email?: string[];
    webhook?: string;
  };
}

export interface DiscoveredSchema {
  databases: DatabaseInfo[];
  schemas: SchemaInfo[];
  tables: Array<TableInfo & {
    columns?: Array<ColumnInfo & {
      sampleValues?: unknown[];
      statistics?: {
        nullCount?: number;
        uniqueCount?: number;
        minValue?: unknown;
        maxValue?: unknown;
        avgLength?: number;
      };
    }>;
    relationships?: Array<{
      type: 'foreign_key' | 'inferred';
      targetTable: string;
      columns: Array<{
        source: string;
        target: string;
      }>;
      confidence?: number;
    }>;
    sampleData?: Record<string, unknown>[];
  }>;
  metadata: {
    discoveryTime: Date;
    totalObjects: number;
    connectionInfo: {
      version?: string;
      capabilities: string[];
    };
  };
}

export interface SchemaDiscoveryStatus {
  phase: 'connecting' | 'discovering_databases' | 'discovering_schemas' | 'discovering_tables' | 'discovering_columns' | 'analyzing_data' | 'detecting_relationships' | 'updating_catalog' | 'completed' | 'failed';
  progress: {
    totalDatabases: number;
    processedDatabases: number;
    totalSchemas: number;
    processedSchemas: number;
    totalTables: number;
    processedTables: number;
    currentObject?: string;
  };
  result?: DiscoveredSchema;
  errors: Array<{
    object?: string;
    message: string;
    timestamp: Date;
  }>;
}

// Queries for monitoring workflow state
export const getDiscoveryStatusQuery = defineQuery<SchemaDiscoveryStatus>('get-discovery-status');

export async function schemaDiscoveryWorkflow(input: SchemaDiscoveryWorkflowInput): Promise<DiscoveredSchema> {
  const workflowId = workflowInfo().workflowId;

  // Initialize discovery status
  const status: SchemaDiscoveryStatus = {
    phase: 'connecting',
    progress: {
      totalDatabases: 0,
      processedDatabases: 0,
      totalSchemas: 0,
      processedSchemas: 0,
      totalTables: 0,
      processedTables: 0
    },
    errors: []
  };

  setHandler(getDiscoveryStatusQuery, () => status);

  const discoveredSchema: DiscoveredSchema = {
    databases: [],
    schemas: [],
    tables: [],
    metadata: {
      discoveryTime: new Date(),
      totalObjects: 0,
      connectionInfo: {
        capabilities: []
      }
    }
  };

  try {
    log.info('Starting schema discovery workflow', { 
      workflowId, 
      connectionId: input.connectionId,
      connectorType: input.connectorType 
    });

    // Phase 1: Connect to data source
    await connectToSource(input.connectionId, input.authConfig);
    
    // Phase 2: Discover databases
    status.phase = 'discovering_databases';
    log.info('Discovering databases');
    
    const databases = await discoverDatabases({
      connectionId: input.connectionId,
      targetDatabases: input.discoveryConfig.databases
    });
    
    discoveredSchema.databases = databases;
    status.progress.totalDatabases = databases.length;

    // Phase 3: Discover schemas for each database
    status.phase = 'discovering_schemas';
    const allSchemas: SchemaInfo[] = [];
    
    for (const database of databases) {
      status.progress.currentObject = database.name;
      status.progress.processedDatabases++;
      
      try {
        const schemas = await discoverSchemas({
          connectionId: input.connectionId,
          connectorType: input.connectorType,
          databases: [database.name],
          schemas: input.discoveryConfig.schemas
        });
        
        allSchemas.push(...schemas.schemas);
        log.info('Discovered schemas', { database: database.name, count: schemas.schemas.length });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        status.errors.push({
          object: `database:${database.name}`,
          message: errorMessage,
          timestamp: new Date()
        });
        log.error('Failed to discover schemas', { database: database.name, error: errorMessage });
      }
    }

    discoveredSchema.schemas = allSchemas;
    status.progress.totalSchemas = allSchemas.length;

    // Phase 4: Discover tables if requested
    if (input.discoveryConfig.includeTables) {
      status.phase = 'discovering_tables';
      const allTables: TableInfo[] = [];

      for (const schema of allSchemas) {
        status.progress.currentObject = `${schema.database || 'default'}.${schema.name}`;
        status.progress.processedSchemas++;

        try {
          const tables = await discoverTables({
            connectionId: input.connectionId,
            database: schema.database,
            schema: schema.name
          });

          allTables.push(...tables);
          log.info('Discovered tables', { 
            schema: `${schema.database || 'default'}.${schema.name}`, 
            count: tables.length 
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          status.errors.push({
            object: `schema:${schema.database || 'default'}.${schema.name}`,
            message: errorMessage,
            timestamp: new Date()
          });
          log.error('Failed to discover tables', { 
            schema: `${schema.database || 'default'}.${schema.name}`, 
            error: errorMessage 
          });
        }
      }

      status.progress.totalTables = allTables.length;

      // Phase 5: Discover columns if requested
      if (input.discoveryConfig.includeColumns) {
        status.phase = 'discovering_columns';

        for (const table of allTables) {
          const tableName = `${table.database || 'default'}.${table.schema || 'default'}.${table.name}`;
          status.progress.currentObject = tableName;
          status.progress.processedTables++;

          const extendedTable = { ...table, columns: [] } as DiscoveredSchema['tables'][0];

          try {
            const columns = await discoverColumns({
              connectionId: input.connectionId,
              database: table.database || '',
              schema: table.schema || '',
              table: table.name
            });

            extendedTable.columns = columns.map(col => ({ ...col }));
            log.info('Discovered columns', { table: tableName, count: columns.length });

            // Phase 6: Analyze sample data if requested
            if (input.discoveryConfig.includeSampleData && extendedTable.columns) {
              try {
                const sampleData = await analyzeSampleData({
                  connectionId: input.connectionId,
                  table: table,
                  maxRows: input.discoveryConfig.maxSampleRows
                });

                extendedTable.sampleData = sampleData.rows;

                // Add statistics to columns
                for (const column of extendedTable.columns) {
                  if (sampleData.columnStatistics?.[column.name]) {
                    column.statistics = sampleData.columnStatistics[column.name];
                  }
                  if (sampleData.sampleValues?.[column.name]) {
                    column.sampleValues = sampleData.sampleValues[column.name];
                  }
                }

                log.info('Analyzed sample data', { table: tableName, rows: sampleData.rows.length });

              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                status.errors.push({
                  object: `table_data:${tableName}`,
                  message: errorMessage,
                  timestamp: new Date()
                });
                log.warn('Failed to analyze sample data', { table: tableName, error: errorMessage });
              }
            }

            // Phase 7: Detect relationships if requested
            if (input.discoveryConfig.detectRelationships) {
              try {
                const relationships = await detectRelationships({
                  connectionId: input.connectionId,
                  table: table,
                  allTables: allTables
                });

                extendedTable.relationships = relationships;
                log.info('Detected relationships', { table: tableName, count: relationships.length });

              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                log.warn('Failed to detect relationships', { table: tableName, error: errorMessage });
              }
            }

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            status.errors.push({
              object: `table:${tableName}`,
              message: errorMessage,
              timestamp: new Date()
            });
            log.error('Failed to discover columns', { table: tableName, error: errorMessage });
          }

          discoveredSchema.tables.push(extendedTable);
        }
      } else {
        // Add tables without column details
        discoveredSchema.tables = allTables.map(table => ({ ...table }));
      }
    }

    // Phase 8: Update catalog with discovered schema
    status.phase = 'updating_catalog';
    status.progress.currentObject = 'catalog';

    try {
      await updateCatalog({
        connectionId: input.connectionId,
        schema: discoveredSchema
      });
      log.info('Updated data catalog', { totalObjects: discoveredSchema.tables.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      status.errors.push({
        object: 'catalog',
        message: errorMessage,
        timestamp: new Date()
      });
      log.error('Failed to update catalog', { error: errorMessage });
    }

    // Phase 9: Complete
    status.phase = 'completed';
    status.result = discoveredSchema;
    status.progress.currentObject = undefined;

    discoveredSchema.metadata.totalObjects = 
      discoveredSchema.databases.length + 
      discoveredSchema.schemas.length + 
      discoveredSchema.tables.length;

    // Send completion notification
    if (input.notificationConfig) {
      await sendNotification({
        type: 'discovery_completed',
        connectionId: input.connectionId,
        result: discoveredSchema,
        config: input.notificationConfig
      });
    }

    log.info('Schema discovery workflow completed', {
      workflowId,
      totalObjects: discoveredSchema.metadata.totalObjects,
      errors: status.errors.length
    });

  } catch (error) {
    status.phase = 'failed';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    status.errors.push({
      message: errorMessage,
      timestamp: new Date()
    });

    log.error('Schema discovery workflow failed', { workflowId, error: errorMessage });

    // Send failure notification
    if (input.notificationConfig) {
      await sendNotification({
        type: 'discovery_failed',
        connectionId: input.connectionId,
        error: errorMessage,
        config: input.notificationConfig
      });
    }

    throw error;

  } finally {
    // Always disconnect from source
    try {
      await disconnectFromSource(input.connectionId);
    } catch (error) {
      log.warn('Failed to disconnect from source', { error });
    }
  }

  return discoveredSchema;
}