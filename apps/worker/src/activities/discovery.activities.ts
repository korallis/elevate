import { log } from '@temporalio/activity';
import type { 
  ConnectorType, 
  DatabaseInfo, 
  SchemaInfo, 
  TableInfo, 
  ColumnInfo,
  ForeignKeyInfo,
  IDataConnector 
} from '../../../api/src/connectors/types.js';

// Connection pool reference (shared with connector activities)
declare const connectionPool: Map<string, IDataConnector>;

export async function discoverDatabases(params: {
  connectionId: string;
  targetDatabases?: string[];
}): Promise<DatabaseInfo[]> {
  log.info('Discovering databases', { connectionId: params.connectionId });
  
  const connector = getConnector(params.connectionId);
  
  try {
    const databases = await connector.listDatabases();
    
    // Filter databases if targets specified
    const filteredDatabases = params.targetDatabases 
      ? databases.filter(db => params.targetDatabases!.includes(db.name))
      : databases;
    
    log.info('Database discovery completed', { 
      connectionId: params.connectionId,
      totalDatabases: databases.length,
      filteredDatabases: filteredDatabases.length
    });
    
    return filteredDatabases;
    
  } catch (error) {
    log.error('Database discovery failed', { connectionId: params.connectionId, error });
    throw error;
  }
}

export async function discoverSchemas(params: {
  connectionId: string;
  connectorType: ConnectorType;
  databases?: string[];
  schemas?: string[];
}): Promise<{ schemas: SchemaInfo[]; tables: TableInfo[] }> {
  log.info('Discovering schemas', { 
    connectionId: params.connectionId,
    databases: params.databases?.length || 'all'
  });
  
  const connector = getConnector(params.connectionId);
  const allSchemas: SchemaInfo[] = [];
  const allTables: TableInfo[] = [];
  
  try {
    if (params.databases && params.databases.length > 0) {
      // Discover schemas for specific databases
      for (const database of params.databases) {
        const schemas = await connector.listSchemas(database);
        const dbSchemas = schemas.map(schema => ({
          ...schema,
          database: database
        }));
        
        // Filter schemas if targets specified
        const filteredSchemas = params.schemas 
          ? dbSchemas.filter(schema => params.schemas!.includes(schema.name))
          : dbSchemas;
        
        allSchemas.push(...filteredSchemas);
        
        // Also discover tables for these schemas
        for (const schema of filteredSchemas) {
          try {
            const tables = await connector.listTables(database, schema.name);
            allTables.push(...tables);
          } catch (error) {
            log.warn('Failed to discover tables for schema', { 
              database, 
              schema: schema.name, 
              error 
            });
          }
        }
      }
    } else {
      // Discover all schemas
      const schemas = await connector.listSchemas();
      const filteredSchemas = params.schemas 
        ? schemas.filter(schema => params.schemas!.includes(schema.name))
        : schemas;
      
      allSchemas.push(...filteredSchemas);
      
      // Discover tables for all schemas
      for (const schema of filteredSchemas) {
        try {
          const tables = await connector.listTables(schema.database, schema.name);
          allTables.push(...tables);
        } catch (error) {
          log.warn('Failed to discover tables for schema', { 
            schema: schema.name, 
            error 
          });
        }
      }
    }
    
    log.info('Schema discovery completed', { 
      connectionId: params.connectionId,
      schemas: allSchemas.length,
      tables: allTables.length
    });
    
    return { schemas: allSchemas, tables: allTables };
    
  } catch (error) {
    log.error('Schema discovery failed', { connectionId: params.connectionId, error });
    throw error;
  }
}

export async function discoverTables(params: {
  connectionId: string;
  database?: string;
  schema?: string;
}): Promise<TableInfo[]> {
  log.info('Discovering tables', { 
    connectionId: params.connectionId,
    database: params.database,
    schema: params.schema
  });
  
  const connector = getConnector(params.connectionId);
  
  try {
    const tables = await connector.listTables(params.database, params.schema);
    
    log.info('Table discovery completed', { 
      connectionId: params.connectionId,
      tables: tables.length
    });
    
    return tables;
    
  } catch (error) {
    log.error('Table discovery failed', { connectionId: params.connectionId, error });
    throw error;
  }
}

export async function discoverColumns(params: {
  connectionId: string;
  database: string;
  schema: string;
  table: string;
}): Promise<ColumnInfo[]> {
  log.info('Discovering columns', { 
    connectionId: params.connectionId,
    table: `${params.database}.${params.schema}.${params.table}`
  });
  
  const connector = getConnector(params.connectionId);
  
  try {
    const columns = await connector.listColumns(params.database, params.schema, params.table);
    
    log.info('Column discovery completed', { 
      connectionId: params.connectionId,
      table: `${params.database}.${params.schema}.${params.table}`,
      columns: columns.length
    });
    
    return columns;
    
  } catch (error) {
    log.error('Column discovery failed', { 
      connectionId: params.connectionId, 
      table: `${params.database}.${params.schema}.${params.table}`,
      error 
    });
    throw error;
  }
}

export async function analyzeSampleData(params: {
  connectionId: string;
  table: TableInfo;
  maxRows: number;
}): Promise<{
  rows: Record<string, unknown>[];
  columnStatistics: Record<string, {
    nullCount: number;
    uniqueCount: number;
    minValue?: unknown;
    maxValue?: unknown;
    avgLength?: number;
  }>;
  sampleValues: Record<string, unknown[]>;
}> {
  log.info('Analyzing sample data', { 
    connectionId: params.connectionId,
    table: `${params.table.schema}.${params.table.name}`,
    maxRows: params.maxRows
  });
  
  const connector = getConnector(params.connectionId);
  
  try {
    // Get column information first
    const columns = await connector.listColumns(
      params.table.database || '', 
      params.table.schema || '', 
      params.table.name
    );
    
    // Build sample query
    const columnNames = columns.map(col => col.name);
    const qualifiedTableName = [
      params.table.database,
      params.table.schema, 
      params.table.name
    ].filter(Boolean).join('.');
    
    const sampleQuery = `SELECT ${columnNames.join(', ')} FROM ${qualifiedTableName} LIMIT ${params.maxRows}`;
    
    // Execute sample query
    const result = await connector.executeQuery(sampleQuery);
    
    // Analyze the data
    const columnStatistics: Record<string, any> = {};
    const sampleValues: Record<string, unknown[]> = {};
    
    for (const column of columns) {
      const values = result.rows.map(row => row[column.name]).filter(val => val !== null && val !== undefined);
      const uniqueValues = [...new Set(values)];
      
      columnStatistics[column.name] = {
        nullCount: result.rows.length - values.length,
        uniqueCount: uniqueValues.length,
        minValue: values.length > 0 ? Math.min(...values.filter(v => typeof v === 'number')) : undefined,
        maxValue: values.length > 0 ? Math.max(...values.filter(v => typeof v === 'number')) : undefined,
        avgLength: values.filter(v => typeof v === 'string').reduce((sum, v) => sum + v.length, 0) / values.filter(v => typeof v === 'string').length || undefined
      };
      
      // Take sample of unique values (max 10)
      sampleValues[column.name] = uniqueValues.slice(0, 10);
    }
    
    log.info('Sample data analysis completed', { 
      connectionId: params.connectionId,
      table: `${params.table.schema}.${params.table.name}`,
      rows: result.rows.length,
      columns: columnNames.length
    });
    
    return {
      rows: result.rows,
      columnStatistics,
      sampleValues
    };
    
  } catch (error) {
    log.error('Sample data analysis failed', { 
      connectionId: params.connectionId,
      table: `${params.table.schema}.${params.table.name}`,
      error 
    });
    throw error;
  }
}

export async function inferDataTypes(params: {
  connectionId: string;
  table: TableInfo;
  sampleData: Record<string, unknown>[];
}): Promise<Record<string, {
  inferredType: string;
  confidence: number;
  samples: unknown[];
}>> {
  log.info('Inferring data types', { 
    connectionId: params.connectionId,
    table: `${params.table.schema}.${params.table.name}`,
    sampleRows: params.sampleData.length
  });
  
  const typeInference: Record<string, any> = {};
  
  try {
    // Get existing column information
    const connector = getConnector(params.connectionId);
    const columns = await connector.listColumns(
      params.table.database || '', 
      params.table.schema || '', 
      params.table.name
    );
    
    for (const column of columns) {
      const values = params.sampleData.map(row => row[column.name]).filter(val => val !== null && val !== undefined);
      
      if (values.length === 0) {
        typeInference[column.name] = {
          inferredType: 'unknown',
          confidence: 0,
          samples: []
        };
        continue;
      }
      
      // Simple type inference based on sample values
      const typeGuesses = values.map(inferValueType);
      const typeCounts = typeGuesses.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const mostCommonType = Object.entries(typeCounts)
        .sort(([,a], [,b]) => b - a)[0][0];
      
      const confidence = typeCounts[mostCommonType] / values.length;
      
      typeInference[column.name] = {
        inferredType: mostCommonType,
        confidence,
        samples: values.slice(0, 5)
      };
    }
    
    log.info('Data type inference completed', { 
      connectionId: params.connectionId,
      table: `${params.table.schema}.${params.table.name}`,
      columns: Object.keys(typeInference).length
    });
    
    return typeInference;
    
  } catch (error) {
    log.error('Data type inference failed', { 
      connectionId: params.connectionId,
      table: `${params.table.schema}.${params.table.name}`,
      error 
    });
    throw error;
  }
}

export async function detectPrimaryKeys(params: {
  connectionId: string;
  table: TableInfo;
}): Promise<Array<{
  columns: string[];
  confidence: number;
  reasoning: string;
}>> {
  log.info('Detecting primary keys', { 
    connectionId: params.connectionId,
    table: `${params.table.schema}.${params.table.name}`
  });
  
  const connector = getConnector(params.connectionId);
  const candidates: Array<{ columns: string[]; confidence: number; reasoning: string }> = [];
  
  try {
    // Get column information
    const columns = await connector.listColumns(
      params.table.database || '', 
      params.table.schema || '', 
      params.table.name
    );
    
    // Check for existing primary key constraints
    const existingPKs = columns.filter(col => col.primaryKey);
    if (existingPKs.length > 0) {
      candidates.push({
        columns: existingPKs.map(col => col.name),
        confidence: 1.0,
        reasoning: 'Defined primary key constraint'
      });
    }
    
    // Analyze column patterns for potential primary keys
    const qualifiedTableName = [
      params.table.database,
      params.table.schema, 
      params.table.name
    ].filter(Boolean).join('.');
    
    for (const column of columns) {
      // Check uniqueness
      const uniquenessQuery = `
        SELECT COUNT(*) as total_count, COUNT(DISTINCT ${column.name}) as unique_count 
        FROM ${qualifiedTableName}
      `;
      
      try {
        const result = await connector.executeQuery(uniquenessQuery);
        const row = result.rows[0];
        const totalCount = Number(row.total_count);
        const uniqueCount = Number(row.unique_count);
        
        if (totalCount > 0 && uniqueCount === totalCount) {
          // Column has unique values
          let confidence = 0.8;
          let reasoning = 'Column contains only unique values';
          
          // Boost confidence for typical ID column names
          if (column.name.toLowerCase().includes('id') || 
              column.name.toLowerCase().includes('key') ||
              column.name.toLowerCase() === 'pk') {
            confidence = 0.9;
            reasoning += ' and has ID/key naming pattern';
          }
          
          // Check for auto-increment pattern (if supported)
          if (column.type.toLowerCase().includes('int') || 
              column.type.toLowerCase().includes('serial')) {
            confidence += 0.05;
            reasoning += ' with numeric auto-increment type';
          }
          
          candidates.push({
            columns: [column.name],
            confidence: Math.min(confidence, 0.95), // Cap at 0.95 for inferred keys
            reasoning
          });
        }
      } catch (error) {
        log.warn('Failed to check uniqueness for column', { 
          column: column.name, 
          error 
        });
      }
    }
    
    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);
    
    log.info('Primary key detection completed', { 
      connectionId: params.connectionId,
      table: `${params.table.schema}.${params.table.name}`,
      candidates: candidates.length
    });
    
    return candidates;
    
  } catch (error) {
    log.error('Primary key detection failed', { 
      connectionId: params.connectionId,
      table: `${params.table.schema}.${params.table.name}`,
      error 
    });
    throw error;
  }
}

export async function detectRelationships(params: {
  connectionId: string;
  table: TableInfo;
  allTables: TableInfo[];
}): Promise<Array<{
  type: 'foreign_key' | 'inferred';
  targetTable: string;
  columns: Array<{ source: string; target: string }>;
  confidence?: number;
}>> {
  log.info('Detecting relationships', { 
    connectionId: params.connectionId,
    table: `${params.table.schema}.${params.table.name}`,
    totalTables: params.allTables.length
  });
  
  const connector = getConnector(params.connectionId);
  const relationships: Array<any> = [];
  
  try {
    // Get explicit foreign key constraints
    const foreignKeys = await connector.listForeignKeys(
      params.table.database, 
      params.table.schema
    );
    
    // Add explicit foreign keys
    for (const fk of foreignKeys) {
      if (fk.fromTable === params.table.name) {
        relationships.push({
          type: 'foreign_key',
          targetTable: fk.toTable,
          columns: [{ source: fk.fromColumn, target: fk.toColumn }],
          confidence: 1.0
        });
      }
    }
    
    // Infer relationships based on naming patterns and data
    const columns = await connector.listColumns(
      params.table.database || '', 
      params.table.schema || '', 
      params.table.name
    );
    
    for (const column of columns) {
      // Look for columns that might be foreign keys (ending in _id, _key, etc.)
      const columnName = column.name.toLowerCase();
      
      if (columnName.endsWith('_id') || columnName.endsWith('_key') || columnName.includes('ref')) {
        // Try to find matching tables
        const potentialTableName = columnName
          .replace(/_id$|_key$/, '')
          .replace(/ref_/, '');
        
        const matchingTables = params.allTables.filter(table => 
          table.name.toLowerCase().includes(potentialTableName) ||
          potentialTableName.includes(table.name.toLowerCase())
        );
        
        for (const targetTable of matchingTables) {
          // Check if target table has a primary key or ID column
          try {
            const targetColumns = await connector.listColumns(
              targetTable.database || '', 
              targetTable.schema || '', 
              targetTable.name
            );
            
            const pkColumns = targetColumns.filter(col => 
              col.primaryKey || 
              col.name.toLowerCase() === 'id' ||
              col.name.toLowerCase().endsWith('_id')
            );
            
            if (pkColumns.length > 0) {
              relationships.push({
                type: 'inferred',
                targetTable: targetTable.name,
                columns: [{ source: column.name, target: pkColumns[0].name }],
                confidence: 0.7
              });
            }
          } catch (error) {
            log.warn('Failed to analyze target table for relationship', { 
              targetTable: targetTable.name, 
              error 
            });
          }
        }
      }
    }
    
    log.info('Relationship detection completed', { 
      connectionId: params.connectionId,
      table: `${params.table.schema}.${params.table.name}`,
      relationships: relationships.length
    });
    
    return relationships;
    
  } catch (error) {
    log.error('Relationship detection failed', { 
      connectionId: params.connectionId,
      table: `${params.table.schema}.${params.table.name}`,
      error 
    });
    throw error;
  }
}

export async function updateCatalog(params: {
  connectionId: string;
  schema: {
    databases: DatabaseInfo[];
    schemas: SchemaInfo[];
    tables: TableInfo[];
  };
}): Promise<void> {
  log.info('Updating data catalog', { 
    connectionId: params.connectionId,
    databases: params.schema.databases.length,
    schemas: params.schema.schemas.length,
    tables: params.schema.tables.length
  });
  
  try {
    // This would update the data catalog storage
    // For now, just log the update
    // In real implementation, this would:
    // 1. Connect to catalog database
    // 2. Update database, schema, and table metadata
    // 3. Update discovery timestamps
    // 4. Trigger indexing for search
    
    log.info('Data catalog update completed', { 
      connectionId: params.connectionId 
    });
    
  } catch (error) {
    log.error('Data catalog update failed', { 
      connectionId: params.connectionId, 
      error 
    });
    throw error;
  }
}

// Helper functions
function getConnector(connectionId: string): IDataConnector {
  const connector = connectionPool.get(connectionId);
  if (!connector || !connector.isConnected()) {
    throw new Error(`No active connection found for ${connectionId}`);
  }
  return connector;
}

function inferValueType(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'float';
  }
  if (typeof value === 'string') {
    // Try to detect dates
    if (isValidDate(value)) return 'date';
    if (isValidEmail(value)) return 'email';
    if (isValidUrl(value)) return 'url';
    return 'string';
  }
  if (value instanceof Date) return 'datetime';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  
  return 'unknown';
}

function isValidDate(str: string): boolean {
  const date = new Date(str);
  return !isNaN(date.getTime()) && str.length > 8;
}

function isValidEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}