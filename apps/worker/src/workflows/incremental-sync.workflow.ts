import { 
  proxyActivities, 
  sleep, 
  log, 
  defineSignal, 
  defineQuery, 
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type { ConnectorType, TableInfo } from '../../../api/src/connectors/types.js';
import type * as activities from '../activities/index.js';

const {
  connectToSource,
  disconnectFromSource,
  getIncrementalChanges,
  processChangeBatch,
  updateWatermark,
  getWatermark,
  validateIncrementalSync,
  sendNotification,
  createSyncCheckpoint,
  cleanupOldCheckpoints
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '10 seconds',
    maximumInterval: '1 minute',
    maximumAttempts: 5,
    backoffCoefficient: 1.5,
  },
});

export interface IncrementalSyncWorkflowInput {
  connectionId: string;
  connectorType: ConnectorType;
  tables: Array<{
    table: TableInfo;
    incrementalConfig: {
      column: string; // timestamp or auto-increment column
      strategy: 'timestamp' | 'auto_increment' | 'change_log' | 'binary_log';
      batchSize: number;
      frequency: 'realtime' | 'minute' | 'hourly' | 'daily';
    };
  }>;
  authConfig: {
    type: string;
    credentials: Record<string, unknown>;
  };
  syncConfig: {
    maxBatchSize: number;
    maxConcurrency: number;
    retentionDays: number;
  };
  notificationConfig?: {
    email?: string[];
    webhook?: string;
    onError?: boolean;
    onComplete?: boolean;
  };
}

export interface IncrementalChange {
  operation: 'insert' | 'update' | 'delete';
  table: string;
  primaryKey: Record<string, unknown>;
  data?: Record<string, unknown>;
  timestamp: Date;
  watermarkValue: unknown;
}

export interface IncrementalSyncStatus {
  phase: 'initializing' | 'syncing' | 'completed' | 'failed' | 'waiting';
  currentTable?: string;
  progress: {
    totalTables: number;
    processedTables: number;
    changesProcessed: number;
    batchesProcessed: number;
    lastSyncTime: Date;
  };
  watermarks: Record<string, unknown>;
  errors: Array<{
    table?: string;
    message: string;
    timestamp: Date;
    retryCount: number;
  }>;
  metrics: {
    avgProcessingTime: number;
    changesPerSecond: number;
    totalBytesProcessed: number;
  };
}

// Signals for controlling incremental sync
export const pauseIncrementalSyncSignal = defineSignal<[]>('pause-incremental-sync');
export const resumeIncrementalSyncSignal = defineSignal<[]>('resume-incremental-sync');
export const refreshWatermarksSignal = defineSignal<[]>('refresh-watermarks');

// Queries for monitoring sync state
export const getIncrementalSyncStatusQuery = defineQuery<IncrementalSyncStatus>('get-incremental-sync-status');

export async function incrementalSyncWorkflow(input: IncrementalSyncWorkflowInput): Promise<IncrementalSyncStatus> {
  const workflowId = workflowInfo().workflowId;
  let isPaused = false;

  // Initialize sync status
  const status: IncrementalSyncStatus = {
    phase: 'initializing',
    progress: {
      totalTables: input.tables.length,
      processedTables: 0,
      changesProcessed: 0,
      batchesProcessed: 0,
      lastSyncTime: new Date()
    },
    watermarks: {},
    errors: [],
    metrics: {
      avgProcessingTime: 0,
      changesPerSecond: 0,
      totalBytesProcessed: 0
    }
  };

  // Setup signal handlers
  setHandler(pauseIncrementalSyncSignal, () => {
    log.info('Incremental sync paused', { workflowId });
    isPaused = true;
  });

  setHandler(resumeIncrementalSyncSignal, () => {
    log.info('Incremental sync resumed', { workflowId });
    isPaused = false;
  });

  setHandler(refreshWatermarksSignal, async () => {
    log.info('Refreshing watermarks', { workflowId });
    // Refresh watermarks for all tables
    for (const tableConfig of input.tables) {
      const tableName = `${tableConfig.table.schema}.${tableConfig.table.name}`;
      try {
        const watermark = await getWatermark(input.connectionId, tableName);
        status.watermarks[tableName] = watermark.value;
      } catch (error) {
        log.warn('Failed to refresh watermark', { table: tableName, error });
      }
    }
  });

  setHandler(getIncrementalSyncStatusQuery, () => status);

  try {
    log.info('Starting incremental sync workflow', { 
      workflowId, 
      connectionId: input.connectionId,
      tables: input.tables.length
    });

    // Connect to data source
    await connectToSource(input.connectionId, input.authConfig);

    // Initialize watermarks for all tables
    for (const tableConfig of input.tables) {
      const tableName = `${tableConfig.table.schema}.${tableConfig.table.name}`;
      try {
        const watermark = await getWatermark(input.connectionId, tableName);
        status.watermarks[tableName] = watermark.value;
        log.info('Initialized watermark', { table: tableName, watermark: watermark.value });
      } catch (error) {
        log.warn('Failed to get watermark, starting from beginning', { table: tableName });
        status.watermarks[tableName] = null;
      }
    }

    // Main sync loop - runs continuously until stopped
    while (!isPaused) {
      status.phase = 'syncing';
      status.progress.lastSyncTime = new Date();
      const syncStartTime = Date.now();
      let totalChangesInCycle = 0;

      for (let i = 0; i < input.tables.length; i++) {
        const tableConfig = input.tables[i];
        const tableName = `${tableConfig.table.schema}.${tableConfig.table.name}`;
        status.currentTable = tableName;

        try {
          // Get incremental changes since last watermark
          const changesResult = await getIncrementalChanges({
            connectionId: input.connectionId,
            table: tableConfig.table,
            incrementalConfig: tableConfig.incrementalConfig,
            fromWatermark: status.watermarks[tableName],
            batchSize: Math.min(tableConfig.incrementalConfig.batchSize, input.syncConfig.maxBatchSize)
          });

          if (changesResult.changes.length > 0) {
            log.info('Processing incremental changes', { 
              table: tableName, 
              changes: changesResult.changes.length,
              fromWatermark: status.watermarks[tableName]
            });

            // Process changes in batches
            const batches = chunkArray(changesResult.changes, tableConfig.incrementalConfig.batchSize);
            
            for (const batch of batches) {
              if (isPaused) break;

              const batchResult = await processChangeBatch({
                connectionId: input.connectionId,
                table: tableConfig.table,
                changes: batch,
                strategy: tableConfig.incrementalConfig.strategy
              });

              status.progress.changesProcessed += batch.length;
              status.progress.batchesProcessed++;
              status.metrics.totalBytesProcessed += batchResult.bytesProcessed;
              totalChangesInCycle += batch.length;

              // Update watermark to highest processed value
              const maxWatermark = getMaxWatermark(batch, tableConfig.incrementalConfig.column);
              if (maxWatermark !== null) {
                await updateWatermark(input.connectionId, tableName, maxWatermark);
                status.watermarks[tableName] = maxWatermark;
              }

              // Create checkpoint periodically
              if (status.progress.batchesProcessed % 10 === 0) {
                await createSyncCheckpoint({
                  connectionId: input.connectionId,
                  table: tableName,
                  watermark: status.watermarks[tableName],
                  changesProcessed: status.progress.changesProcessed,
                  timestamp: new Date()
                });
              }
            }

            log.info('Completed incremental sync for table', { 
              table: tableName,
              changesProcessed: changesResult.changes.length,
              newWatermark: status.watermarks[tableName]
            });
          }

          status.progress.processedTables = i + 1;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const existingError = status.errors.find(e => e.table === tableName && e.message === errorMessage);
          
          if (existingError) {
            existingError.retryCount++;
            existingError.timestamp = new Date();
          } else {
            status.errors.push({
              table: tableName,
              message: errorMessage,
              timestamp: new Date(),
              retryCount: 1
            });
          }

          log.error('Incremental sync failed for table', { 
            table: tableName, 
            error: errorMessage 
          });

          // Skip table if too many errors
          if ((existingError?.retryCount || 1) >= 3) {
            log.error('Skipping table due to repeated failures', { table: tableName });
          }
        }
      }

      // Calculate metrics
      const syncDuration = Date.now() - syncStartTime;
      status.metrics.avgProcessingTime = syncDuration;
      status.metrics.changesPerSecond = totalChangesInCycle > 0 ? totalChangesInCycle / (syncDuration / 1000) : 0;

      // Cleanup old checkpoints periodically
      if (status.progress.batchesProcessed % 100 === 0) {
        try {
          await cleanupOldCheckpoints({
            connectionId: input.connectionId,
            retentionDays: input.syncConfig.retentionDays
          });
        } catch (error) {
          log.warn('Failed to cleanup old checkpoints', { error });
        }
      }

      // Determine sleep duration based on frequency and if changes were found
      const sleepDuration = getSleepDuration(
        input.tables.map(t => t.incrementalConfig.frequency),
        totalChangesInCycle > 0
      );

      if (sleepDuration > 0) {
        status.phase = 'waiting';
        status.currentTable = undefined;
        log.info('Sleeping between sync cycles', { duration: sleepDuration });
        await sleep(sleepDuration);
      }
    }

    status.phase = 'completed';
    status.currentTable = undefined;

    // Send completion notification if requested
    if (input.notificationConfig?.onComplete) {
      await sendNotification({
        type: 'incremental_sync_completed',
        connectionId: input.connectionId,
        status: status,
        config: input.notificationConfig
      });
    }

    log.info('Incremental sync workflow completed', {
      workflowId,
      changesProcessed: status.progress.changesProcessed,
      errors: status.errors.length
    });

  } catch (error) {
    status.phase = 'failed';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    status.errors.push({
      message: errorMessage,
      timestamp: new Date(),
      retryCount: 1
    });

    log.error('Incremental sync workflow failed', { workflowId, error: errorMessage });

    // Send failure notification if requested
    if (input.notificationConfig?.onError) {
      await sendNotification({
        type: 'incremental_sync_failed',
        connectionId: input.connectionId,
        status: status,
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

  return status;
}

// Helper functions
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

function getMaxWatermark(changes: IncrementalChange[], watermarkColumn: string): unknown {
  let max = null;
  for (const change of changes) {
    const value = change.watermarkValue;
    if (value !== null && value !== undefined) {
      if (max === null || value > max) {
        max = value;
      }
    }
  }
  return max;
}

function getSleepDuration(frequencies: Array<'realtime' | 'minute' | 'hourly' | 'daily'>, hasChanges: boolean): number {
  // Find the most frequent sync requirement
  if (frequencies.includes('realtime')) {
    return hasChanges ? 1000 : 5000; // 1s if changes, 5s if no changes
  } else if (frequencies.includes('minute')) {
    return 60 * 1000; // 1 minute
  } else if (frequencies.includes('hourly')) {
    return 60 * 60 * 1000; // 1 hour
  } else {
    return 24 * 60 * 60 * 1000; // 1 day
  }
}