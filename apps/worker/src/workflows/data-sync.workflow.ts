import { 
  proxyActivities, 
  sleep, 
  log, 
  defineSignal, 
  defineQuery, 
  setHandler,
  condition,
  workflowInfo,
} from '@temporalio/workflow';
import type { ConnectorType } from '../../../api/src/connectors/types.js';
import type * as activities from '../activities/index.js';

const {
  connectToSource,
  disconnectFromSource,
  discoverSchemas,
  syncTableData,
  validateDataQuality,
  sendNotification,
  updateSyncStatus,
  createCheckpoint,
  restoreFromCheckpoint
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '30 seconds',
    maximumInterval: '5 minutes',
    maximumAttempts: 3,
    backoffCoefficient: 2.0,
  },
});

export interface DataSyncWorkflowInput {
  connectionId: string;
  connectorType: ConnectorType;
  syncConfig: {
    databases?: string[];
    schemas?: string[];
    tables?: string[];
    mode: 'full' | 'incremental' | 'snapshot';
    batchSize: number;
    parallelism: number;
    scheduleExpression?: string;
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

export interface DataSyncStatus {
  phase: 'initializing' | 'discovering' | 'syncing' | 'validating' | 'completed' | 'failed' | 'paused';
  progress: {
    totalTables: number;
    syncedTables: number;
    currentTable?: string;
    recordsProcessed: number;
    estimatedCompletion?: Date;
  };
  errors: Array<{
    table?: string;
    message: string;
    timestamp: Date;
    retryable: boolean;
  }>;
  metrics: {
    startTime: Date;
    endTime?: Date;
    bytesTransferred: number;
    recordsTransferred: number;
    tablesSkipped: number;
  };
}

// Signals for controlling workflow execution
export const pauseSyncSignal = defineSignal<[]>('pause-sync');
export const resumeSyncSignal = defineSignal<[]>('resume-sync');
export const cancelSyncSignal = defineSignal<[]>('cancel-sync');

// Queries for monitoring workflow state
export const getSyncStatusQuery = defineQuery<DataSyncStatus>('get-sync-status');

export async function dataSyncWorkflow(input: DataSyncWorkflowInput): Promise<DataSyncStatus> {
  const workflowId = workflowInfo().workflowId;
  let isPaused = false;
  let isCancelled = false;

  // Initialize sync status
  const status: DataSyncStatus = {
    phase: 'initializing',
    progress: {
      totalTables: 0,
      syncedTables: 0,
      recordsProcessed: 0
    },
    errors: [],
    metrics: {
      startTime: new Date(),
      bytesTransferred: 0,
      recordsTransferred: 0,
      tablesSkipped: 0
    }
  };

  // Setup signal handlers
  setHandler(pauseSyncSignal, () => {
    log.info('Data sync workflow paused', { workflowId });
    isPaused = true;
  });

  setHandler(resumeSyncSignal, () => {
    log.info('Data sync workflow resumed', { workflowId });
    isPaused = false;
  });

  setHandler(cancelSyncSignal, () => {
    log.info('Data sync workflow cancelled', { workflowId });
    isCancelled = true;
  });

  setHandler(getSyncStatusQuery, () => status);

  try {
    log.info('Starting data sync workflow', { 
      workflowId, 
      connectionId: input.connectionId,
      connectorType: input.connectorType 
    });

    // Update status in external system
    await updateSyncStatus(input.connectionId, status);

    // Phase 1: Connect to data source
    status.phase = 'discovering';
    await connectToSource(input.connectionId, input.authConfig);
    
    // Phase 2: Discover schemas and tables
    log.info('Discovering schemas and tables');
    const discoveryResult = await discoverSchemas({
      connectionId: input.connectionId,
      connectorType: input.connectorType,
      databases: input.syncConfig.databases,
      schemas: input.syncConfig.schemas,
      tables: input.syncConfig.tables
    });

    status.progress.totalTables = discoveryResult.tables.length;
    await updateSyncStatus(input.connectionId, status);

    // Phase 3: Sync data
    status.phase = 'syncing';
    let checkpoint = null;
    
    // Restore from checkpoint if this is a retry
    try {
      checkpoint = await restoreFromCheckpoint(input.connectionId);
      if (checkpoint) {
        status.progress.syncedTables = checkpoint.syncedTables;
        status.progress.recordsProcessed = checkpoint.recordsProcessed;
        log.info('Restored from checkpoint', { checkpoint });
      }
    } catch (error) {
      log.warn('No checkpoint found, starting fresh sync', { error });
    }

    for (let i = checkpoint?.tableIndex || 0; i < discoveryResult.tables.length; i++) {
      const table = discoveryResult.tables[i];
      
      // Check for pause/cancel signals
      if (isCancelled) {
        status.phase = 'failed';
        status.errors.push({
          message: 'Workflow cancelled by user',
          timestamp: new Date(),
          retryable: false
        });
        break;
      }

      if (isPaused) {
        // Wait until resumed
        await condition(() => !isPaused || isCancelled);
        if (isCancelled) break;
      }

      try {
        status.progress.currentTable = `${table.schema}.${table.name}`;
        await updateSyncStatus(input.connectionId, status);

        log.info('Syncing table', { table: status.progress.currentTable });
        
        const syncResult = await syncTableData({
          connectionId: input.connectionId,
          table: table,
          mode: input.syncConfig.mode,
          batchSize: input.syncConfig.batchSize,
          checkpoint: checkpoint?.tableCheckpoints?.[table.name]
        });

        status.progress.syncedTables++;
        status.progress.recordsProcessed += syncResult.recordsProcessed;
        status.metrics.bytesTransferred += syncResult.bytesTransferred;
        status.metrics.recordsTransferred += syncResult.recordsProcessed;

        // Create checkpoint every 10 tables
        if (i % 10 === 0) {
          await createCheckpoint(input.connectionId, {
            tableIndex: i,
            syncedTables: status.progress.syncedTables,
            recordsProcessed: status.progress.recordsProcessed,
            tableCheckpoints: {}
          });
        }

        log.info('Table sync completed', { 
          table: status.progress.currentTable,
          recordsProcessed: syncResult.recordsProcessed 
        });

      } catch (error) {
        const errorInfo = {
          table: status.progress.currentTable,
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
          retryable: true
        };
        
        status.errors.push(errorInfo);
        status.metrics.tablesSkipped++;
        
        log.error('Table sync failed', { error: errorInfo });

        // Continue with next table for non-critical errors
        if (status.errors.length > 10) {
          throw new Error('Too many sync errors, aborting workflow');
        }
      }
    }

    // Phase 4: Data quality validation
    if (!isCancelled && status.errors.length === 0) {
      status.phase = 'validating';
      await updateSyncStatus(input.connectionId, status);

      try {
        const qualityResult = await validateDataQuality({
          connectionId: input.connectionId,
          tables: discoveryResult.tables
        });

        if (!qualityResult.passed) {
          status.errors.push({
            message: `Data quality validation failed: ${qualityResult.issues.join(', ')}`,
            timestamp: new Date(),
            retryable: false
          });
        }
      } catch (error) {
        log.warn('Data quality validation failed', { error });
      }
    }

    // Phase 5: Complete
    status.phase = isCancelled ? 'failed' : (status.errors.length > 0 ? 'failed' : 'completed');
    status.metrics.endTime = new Date();
    status.progress.currentTable = undefined;

    await updateSyncStatus(input.connectionId, status);

    // Send completion notification
    if (input.notificationConfig) {
      await sendNotification({
        type: status.phase === 'completed' ? 'sync_completed' : 'sync_failed',
        connectionId: input.connectionId,
        status: status,
        config: input.notificationConfig
      });
    }

    log.info('Data sync workflow completed', {
      workflowId,
      phase: status.phase,
      recordsProcessed: status.progress.recordsProcessed,
      errors: status.errors.length
    });

  } catch (error) {
    status.phase = 'failed';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    status.errors.push({
      message: errorMessage,
      timestamp: new Date(),
      retryable: false
    });
    status.metrics.endTime = new Date();

    await updateSyncStatus(input.connectionId, status);

    log.error('Data sync workflow failed', { workflowId, error: errorMessage });

    // Send failure notification
    if (input.notificationConfig) {
      await sendNotification({
        type: 'sync_failed',
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