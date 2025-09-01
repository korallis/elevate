import { log } from '@temporalio/activity';
import type { TableInfo, IDataConnector } from '../../../api/src/connectors/types.js';

// Connection pool reference
declare const connectionPool: Map<string, IDataConnector>;

interface SyncTableDataParams {
  connectionId: string;
  table: TableInfo;
  mode: 'full' | 'incremental' | 'snapshot';
  batchSize: number;
  checkpoint?: {
    lastSyncTimestamp?: Date;
    lastId?: unknown;
    resumeToken?: string;
  };
}

interface SyncTableDataResult {
  recordsProcessed: number;
  bytesTransferred: number;
  startTime: Date;
  endTime: Date;
  checkpoint?: {
    lastSyncTimestamp: Date;
    lastId?: unknown;
    resumeToken?: string;
  };
  errors?: Array<{
    batchIndex: number;
    error: string;
    recordsAffected: number;
  }>;
}

export async function syncTableData(params: SyncTableDataParams): Promise<SyncTableDataResult> {
  const tableName = `${params.table.schema}.${params.table.name}`;
  log.info('Starting table data sync', { 
    connectionId: params.connectionId,
    table: tableName,
    mode: params.mode,
    batchSize: params.batchSize
  });
  
  const connector = getConnector(params.connectionId);
  const startTime = new Date();
  let recordsProcessed = 0;
  let bytesTransferred = 0;
  const errors: Array<{ batchIndex: number; error: string; recordsAffected: number }> = [];
  
  try {
    // Get table schema information
    const columns = await connector.listColumns(
      params.table.database || '',
      params.table.schema || '',
      params.table.name
    );
    
    const columnNames = columns.map(col => col.name);
    const qualifiedTableName = [
      params.table.database,
      params.table.schema,
      params.table.name
    ].filter(Boolean).join('.');
    
    // Build the sync query based on mode
    let syncQuery = '';
    let queryParams: unknown[] = [];
    
    if (params.mode === 'full' || params.mode === 'snapshot') {
      syncQuery = `SELECT ${columnNames.join(', ')} FROM ${qualifiedTableName}`;
    } else if (params.mode === 'incremental') {
      // For incremental sync, we need a timestamp or ID column
      const timestampColumn = findTimestampColumn(columns);
      const idColumn = findIncrementalColumn(columns);
      
      if (timestampColumn && params.checkpoint?.lastSyncTimestamp) {
        syncQuery = `SELECT ${columnNames.join(', ')} FROM ${qualifiedTableName} 
                    WHERE ${timestampColumn} > ? ORDER BY ${timestampColumn}`;
        queryParams = [params.checkpoint.lastSyncTimestamp];
      } else if (idColumn && params.checkpoint?.lastId) {
        syncQuery = `SELECT ${columnNames.join(', ')} FROM ${qualifiedTableName} 
                    WHERE ${idColumn} > ? ORDER BY ${idColumn}`;
        queryParams = [params.checkpoint.lastId];
      } else {
        log.warn('No suitable incremental column found, falling back to full sync', { 
          table: tableName 
        });
        syncQuery = `SELECT ${columnNames.join(', ')} FROM ${qualifiedTableName}`;
      }
    }
    
    log.info('Executing sync query', { 
      table: tableName,
      query: syncQuery.substring(0, 200) + '...'
    });
    
    // Use streaming query if available for large datasets
    if (connector.executeStreamingQuery) {
      let batchIndex = 0;
      let batch: Record<string, unknown>[] = [];
      let lastTimestamp: Date | undefined;
      let lastId: unknown;
      
      for await (const row of connector.executeStreamingQuery(syncQuery, queryParams)) {
        batch.push(row);
        recordsProcessed++;
        
        // Track checkpoint values
        if (params.mode === 'incremental') {
          const timestampColumn = findTimestampColumn(columns);
          const idColumn = findIncrementalColumn(columns);
          
          if (timestampColumn && row[timestampColumn] instanceof Date) {
            lastTimestamp = row[timestampColumn] as Date;
          }
          if (idColumn) {
            lastId = row[idColumn];
          }
        }
        
        // Process batch when full
        if (batch.length >= params.batchSize) {
          try {
            const batchResult = await processSyncBatch({
              connectionId: params.connectionId,
              table: params.table,
              batch,
              batchIndex
            });
            
            bytesTransferred += batchResult.bytesTransferred;
            log.info('Processed sync batch', { 
              table: tableName,
              batchIndex,
              records: batch.length,
              bytes: batchResult.bytesTransferred
            });
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push({
              batchIndex,
              error: errorMessage,
              recordsAffected: batch.length
            });
            log.error('Batch processing failed', { 
              table: tableName,
              batchIndex,
              error: errorMessage
            });
          }
          
          batch = [];
          batchIndex++;
        }
      }
      
      // Process remaining records
      if (batch.length > 0) {
        try {
          const batchResult = await processSyncBatch({
            connectionId: params.connectionId,
            table: params.table,
            batch,
            batchIndex
          });
          
          bytesTransferred += batchResult.bytesTransferred;
          log.info('Processed final sync batch', { 
            table: tableName,
            batchIndex,
            records: batch.length,
            bytes: batchResult.bytesTransferred
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            batchIndex,
            error: errorMessage,
            recordsAffected: batch.length
          });
        }
      }
      
      const result: SyncTableDataResult = {
        recordsProcessed,
        bytesTransferred,
        startTime,
        endTime: new Date(),
        errors: errors.length > 0 ? errors : undefined
      };
      
      // Set checkpoint for incremental sync
      if (params.mode === 'incremental' && (lastTimestamp || lastId)) {
        result.checkpoint = {
          lastSyncTimestamp: lastTimestamp || startTime,
          lastId
        };
      }
      
      return result;
      
    } else {
      // Fallback to regular query with manual batching
      const result = await connector.executeQuery(syncQuery, queryParams);
      recordsProcessed = result.rows.length;
      
      // Process in batches
      let batchIndex = 0;
      for (let i = 0; i < result.rows.length; i += params.batchSize) {
        const batch = result.rows.slice(i, i + params.batchSize);
        
        try {
          const batchResult = await processSyncBatch({
            connectionId: params.connectionId,
            table: params.table,
            batch,
            batchIndex
          });
          
          bytesTransferred += batchResult.bytesTransferred;
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            batchIndex,
            error: errorMessage,
            recordsAffected: batch.length
          });
        }
        
        batchIndex++;
      }
      
      const syncResult: SyncTableDataResult = {
        recordsProcessed,
        bytesTransferred,
        startTime,
        endTime: new Date(),
        errors: errors.length > 0 ? errors : undefined
      };
      
      // Set checkpoint for incremental sync
      if (params.mode === 'incremental' && result.rows.length > 0) {
        const lastRow = result.rows[result.rows.length - 1];
        const timestampColumn = findTimestampColumn(columns);
        const idColumn = findIncrementalColumn(columns);
        
        syncResult.checkpoint = {
          lastSyncTimestamp: timestampColumn && lastRow[timestampColumn] instanceof Date 
            ? lastRow[timestampColumn] as Date 
            : new Date(),
          lastId: idColumn ? lastRow[idColumn] : undefined
        };
      }
      
      return syncResult;
    }
    
  } catch (error) {
    log.error('Table sync failed', { 
      connectionId: params.connectionId,
      table: tableName,
      error 
    });
    throw error;
  }
}

export async function updateSyncStatus(
  connectionId: string,
  status: {
    phase: string;
    progress: {
      totalTables: number;
      syncedTables: number;
      recordsProcessed: number;
    };
    errors: Array<{
      table?: string;
      message: string;
      timestamp: Date;
    }>;
  }
): Promise<void> {
  log.info('Updating sync status', { 
    connectionId,
    phase: status.phase,
    progress: status.progress
  });
  
  try {
    // This would update the sync status in storage
    // For now, just log the status update
    // In real implementation, this would:
    // 1. Connect to status storage (database, Redis, etc.)
    // 2. Update sync progress and status
    // 3. Update timestamps and error counts
    
    log.info('Sync status updated', { connectionId });
    
  } catch (error) {
    log.error('Failed to update sync status', { connectionId, error });
    // Don't throw here as this is non-critical
  }
}

export async function createCheckpoint(
  connectionId: string,
  checkpoint: {
    tableIndex: number;
    syncedTables: number;
    recordsProcessed: number;
    tableCheckpoints: Record<string, unknown>;
  }
): Promise<void> {
  log.info('Creating sync checkpoint', { 
    connectionId,
    tableIndex: checkpoint.tableIndex,
    syncedTables: checkpoint.syncedTables
  });
  
  try {
    // This would store the checkpoint for resuming failed syncs
    // For now, just log the checkpoint creation
    // In real implementation, this would:
    // 1. Store checkpoint data in persistent storage
    // 2. Include timestamp and sync metadata
    // 3. Clean up old checkpoints
    
    log.info('Sync checkpoint created', { connectionId });
    
  } catch (error) {
    log.error('Failed to create sync checkpoint', { connectionId, error });
    throw error;
  }
}

export async function restoreFromCheckpoint(
  connectionId: string
): Promise<{
  tableIndex: number;
  syncedTables: number;
  recordsProcessed: number;
  tableCheckpoints: Record<string, unknown>;
} | null> {
  log.info('Attempting to restore from checkpoint', { connectionId });
  
  try {
    // This would restore the last checkpoint
    // For now, return null indicating no checkpoint found
    // In real implementation, this would:
    // 1. Query checkpoint storage
    // 2. Validate checkpoint integrity
    // 3. Return checkpoint data or null
    
    return null;
    
  } catch (error) {
    log.error('Failed to restore from checkpoint', { connectionId, error });
    return null;
  }
}

// Helper functions
async function processSyncBatch(params: {
  connectionId: string;
  table: TableInfo;
  batch: Record<string, unknown>[];
  batchIndex: number;
}): Promise<{ bytesTransferred: number }> {
  // This would process a batch of records for syncing
  // For now, simulate processing by calculating estimated bytes
  
  const estimatedBytes = params.batch.length * 1024; // 1KB per record estimate
  
  // In real implementation, this would:
  // 1. Transform data if needed
  // 2. Write to target system (data warehouse, etc.)
  // 3. Handle conflicts and deduplication
  // 4. Return actual bytes transferred
  
  log.debug('Processing sync batch', { 
    table: `${params.table.schema}.${params.table.name}`,
    batchIndex: params.batchIndex,
    records: params.batch.length,
    estimatedBytes
  });
  
  return { bytesTransferred: estimatedBytes };
}

function getConnector(connectionId: string): IDataConnector {
  const connector = connectionPool.get(connectionId);
  if (!connector || !connector.isConnected()) {
    throw new Error(`No active connection found for ${connectionId}`);
  }
  return connector;
}

function findTimestampColumn(columns: Array<{ name: string; type: string }>): string | null {
  // Look for common timestamp column patterns
  const timestampPatterns = [
    'updated_at', 'modified_at', 'last_modified', 'timestamp',
    'created_at', 'inserted_at', 'date_modified', 'last_updated'
  ];
  
  for (const pattern of timestampPatterns) {
    const column = columns.find(col => 
      col.name.toLowerCase() === pattern ||
      col.name.toLowerCase().includes(pattern.split('_')[0])
    );
    if (column && isTimestampType(column.type)) {
      return column.name;
    }
  }
  
  // Look for any timestamp/datetime columns
  const timestampColumn = columns.find(col => isTimestampType(col.type));
  return timestampColumn?.name || null;
}

function findIncrementalColumn(columns: Array<{ name: string; type: string; primaryKey?: boolean }>): string | null {
  // Look for auto-incrementing ID columns
  const idColumn = columns.find(col => 
    col.primaryKey && 
    (col.name.toLowerCase().includes('id') || col.name.toLowerCase() === 'pk') &&
    isNumericType(col.type)
  );
  
  return idColumn?.name || null;
}

function isTimestampType(type: string): boolean {
  const timestampTypes = ['timestamp', 'datetime', 'date', 'time'];
  return timestampTypes.some(t => type.toLowerCase().includes(t));
}

function isNumericType(type: string): boolean {
  const numericTypes = ['int', 'integer', 'bigint', 'serial', 'identity', 'auto_increment'];
  return numericTypes.some(t => type.toLowerCase().includes(t));
}