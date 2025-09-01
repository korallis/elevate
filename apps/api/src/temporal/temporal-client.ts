import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import { logger } from '../logger.js';

/**
 * Temporal Client Wrapper for SME Analytics
 * 
 * Provides a centralized client for starting and managing ETL workflows
 */

interface TemporalConfig {
  server: {
    address: string;
    namespace: string;
  };
  client: {
    connectionTimeout: number;
  };
}

const temporalConfig: TemporalConfig = {
  server: {
    address: process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'sme-analytics'
  },
  client: {
    connectionTimeout: 10000
  }
};

export const TASK_QUEUES = {
  ETL: 'etl-task-queue',
  DATA_SYNC: 'data-sync-queue',
  SCHEMA_DISCOVERY: 'schema-discovery-queue',
  DATA_QUALITY: 'data-quality-queue',
  TRANSFORMATION: 'transformation-queue'
} as const;

class TemporalClientWrapper {
  private client: Client | null = null;
  private connection: Connection | null = null;

  async connect(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    try {
      logger.info('Connecting to Temporal server', {
        address: temporalConfig.server.address,
        namespace: temporalConfig.server.namespace
      });

      // Create connection to Temporal server
      this.connection = await Connection.connect({
        address: temporalConfig.server.address,
        // Add TLS configuration if needed
        // tls: {
        //   clientCertPair: {
        //     crt: Buffer.from(process.env.TEMPORAL_TLS_CRT || ''),
        //     key: Buffer.from(process.env.TEMPORAL_TLS_KEY || ''),
        //   },
        //   serverNameOverride: process.env.TEMPORAL_TLS_SERVER_NAME,
        //   serverRootCACertificate: Buffer.from(process.env.TEMPORAL_TLS_CA || ''),
        // }
      });

      // Create Temporal client
      this.client = new Client({
        connection: this.connection,
        namespace: temporalConfig.server.namespace,
      });

      logger.info('Successfully connected to Temporal server');

    } catch (error) {
      logger.error('Failed to connect to Temporal server', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.client = null;
      logger.info('Disconnected from Temporal server');
    } catch (error) {
      logger.error('Error disconnecting from Temporal server', { error });
    }
  }

  private async ensureConnected(): Promise<Client> {
    if (!this.client) {
      await this.connect();
    }
    return this.client!;
  }

  // Data Sync Workflows
  async startDataSync(params: {
    connectionId: string;
    connectorType: string;
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
  }): Promise<WorkflowHandle> {
    const client = await this.ensureConnected();

    const workflowId = `data-sync-${params.connectionId}-${Date.now()}`;

    try {
      logger.info('Starting data sync workflow', {
        workflowId,
        connectionId: params.connectionId,
        connectorType: params.connectorType
      });

      const handle = await client.workflow.start('dataSyncWorkflow', {
        args: [params],
        taskQueue: TASK_QUEUES.DATA_SYNC,
        workflowId,
        // Set workflow timeout based on sync mode
        workflowRunTimeout: params.syncConfig.mode === 'full' ? '12 hours' : '2 hours',
        memo: {
          connectionId: params.connectionId,
          connectorType: params.connectorType,
          syncMode: params.syncConfig.mode
        },
        searchAttributes: {
          connectionId: [params.connectionId],
          workflowType: ['data-sync'],
          syncMode: [params.syncConfig.mode]
        }
      });

      logger.info('Data sync workflow started', {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId
      });

      return handle;

    } catch (error) {
      logger.error('Failed to start data sync workflow', {
        workflowId,
        connectionId: params.connectionId,
        error
      });
      throw error;
    }
  }

  // Schema Discovery Workflows
  async startSchemaDiscovery(params: {
    connectionId: string;
    connectorType: string;
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
  }): Promise<WorkflowHandle> {
    const client = await this.ensureConnected();

    const workflowId = `schema-discovery-${params.connectionId}-${Date.now()}`;

    try {
      logger.info('Starting schema discovery workflow', {
        workflowId,
        connectionId: params.connectionId,
        connectorType: params.connectorType
      });

      const handle = await client.workflow.start('schemaDiscoveryWorkflow', {
        args: [params],
        taskQueue: TASK_QUEUES.SCHEMA_DISCOVERY,
        workflowId,
        workflowRunTimeout: '1 hour',
        memo: {
          connectionId: params.connectionId,
          connectorType: params.connectorType
        },
        searchAttributes: {
          connectionId: [params.connectionId],
          workflowType: ['schema-discovery']
        }
      });

      logger.info('Schema discovery workflow started', {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId
      });

      return handle;

    } catch (error) {
      logger.error('Failed to start schema discovery workflow', {
        workflowId,
        connectionId: params.connectionId,
        error
      });
      throw error;
    }
  }

  // Incremental Sync Workflows
  async startIncrementalSync(params: {
    connectionId: string;
    connectorType: string;
    tables: Array<{
      table: any;
      incrementalConfig: {
        column: string;
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
  }): Promise<WorkflowHandle> {
    const client = await this.ensureConnected();

    const workflowId = `incremental-sync-${params.connectionId}-${Date.now()}`;

    try {
      logger.info('Starting incremental sync workflow', {
        workflowId,
        connectionId: params.connectionId,
        tables: params.tables.length
      });

      const handle = await client.workflow.start('incrementalSyncWorkflow', {
        args: [params],
        taskQueue: TASK_QUEUES.DATA_SYNC,
        workflowId,
        // Long-running workflow - continues until stopped
        workflowRunTimeout: '30 days',
        memo: {
          connectionId: params.connectionId,
          connectorType: params.connectorType,
          tablesCount: params.tables.length
        },
        searchAttributes: {
          connectionId: [params.connectionId],
          workflowType: ['incremental-sync']
        }
      });

      logger.info('Incremental sync workflow started', {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId
      });

      return handle;

    } catch (error) {
      logger.error('Failed to start incremental sync workflow', {
        workflowId,
        connectionId: params.connectionId,
        error
      });
      throw error;
    }
  }

  // Data Quality Workflows
  async startDataQualityCheck(params: {
    connectionId: string;
    connectorType: string;
    tables: Array<{
      table: any;
      qualityChecks: {
        completeness: boolean;
        uniqueness: boolean;
        validity: boolean;
        accuracy: boolean;
        consistency: boolean;
        timeliness: boolean;
      };
      businessRules?: Array<{
        name: string;
        description: string;
        rule: string;
        severity: 'error' | 'warning' | 'info';
      }>;
      thresholds: {
        completenessThreshold: number;
        uniquenessThreshold: number;
        validityThreshold: number;
        freshnessHours: number;
      };
    }>;
    authConfig: {
      type: string;
      credentials: Record<string, unknown>;
    };
    reportConfig: {
      includeDetails: boolean;
      includeSuggestions: boolean;
      format: 'json' | 'html' | 'pdf';
    };
    notificationConfig?: {
      email?: string[];
      webhook?: string;
      onlyOnFailure?: boolean;
    };
  }): Promise<WorkflowHandle> {
    const client = await this.ensureConnected();

    const workflowId = `data-quality-${params.connectionId}-${Date.now()}`;

    try {
      logger.info('Starting data quality workflow', {
        workflowId,
        connectionId: params.connectionId,
        tables: params.tables.length
      });

      const handle = await client.workflow.start('dataQualityWorkflow', {
        args: [params],
        taskQueue: TASK_QUEUES.DATA_QUALITY,
        workflowId,
        workflowRunTimeout: '2 hours',
        memo: {
          connectionId: params.connectionId,
          connectorType: params.connectorType,
          tablesCount: params.tables.length
        },
        searchAttributes: {
          connectionId: [params.connectionId],
          workflowType: ['data-quality']
        }
      });

      logger.info('Data quality workflow started', {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId
      });

      return handle;

    } catch (error) {
      logger.error('Failed to start data quality workflow', {
        workflowId,
        connectionId: params.connectionId,
        error
      });
      throw error;
    }
  }

  // Transformation Workflows
  async startTransformation(params: {
    connectionId: string;
    connectorType: string;
    pipeline: {
      id: string;
      name: string;
      description: string;
      steps: Array<{
        id: string;
        name: string;
        description: string;
        type: 'sql' | 'python' | 'javascript' | 'dbt' | 'spark';
        transformation: {
          query?: string;
          script?: string;
          parameters?: Record<string, unknown>;
        };
        inputTables: string[];
        outputTable: string;
        dependencies: string[];
      }>;
    };
    executionConfig: {
      mode: 'full' | 'incremental' | 'test';
      dryRun: boolean;
      parallelism: number;
      retryFailedSteps: boolean;
      rollbackOnFailure: boolean;
    };
    authConfig: {
      type: string;
      credentials: Record<string, unknown>;
    };
    notificationConfig?: {
      email?: string[];
      webhook?: string;
      onSuccess?: boolean;
      onFailure?: boolean;
    };
  }): Promise<WorkflowHandle> {
    const client = await this.ensureConnected();

    const workflowId = `transformation-${params.pipeline.id}-${Date.now()}`;

    try {
      logger.info('Starting transformation workflow', {
        workflowId,
        pipelineId: params.pipeline.id,
        connectionId: params.connectionId,
        steps: params.pipeline.steps.length
      });

      const handle = await client.workflow.start('transformationWorkflow', {
        args: [params],
        taskQueue: TASK_QUEUES.TRANSFORMATION,
        workflowId,
        workflowRunTimeout: '6 hours',
        memo: {
          connectionId: params.connectionId,
          pipelineId: params.pipeline.id,
          pipelineName: params.pipeline.name,
          stepsCount: params.pipeline.steps.length
        },
        searchAttributes: {
          connectionId: [params.connectionId],
          pipelineId: [params.pipeline.id],
          workflowType: ['transformation']
        }
      });

      logger.info('Transformation workflow started', {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId
      });

      return handle;

    } catch (error) {
      logger.error('Failed to start transformation workflow', {
        workflowId,
        pipelineId: params.pipeline.id,
        connectionId: params.connectionId,
        error
      });
      throw error;
    }
  }

  // Workflow Management
  async getWorkflowHandle(workflowId: string): Promise<WorkflowHandle> {
    const client = await this.ensureConnected();
    return client.workflow.getHandle(workflowId);
  }

  async listWorkflows(params?: {
    connectionId?: string;
    workflowType?: string;
    status?: 'running' | 'completed' | 'failed';
  }): Promise<Array<{
    workflowId: string;
    runId: string;
    status: string;
    startTime: Date;
    endTime?: Date;
    memo?: Record<string, any>;
  }>> {
    const client = await this.ensureConnected();

    try {
      // Build query
      let query = 'WorkflowType = "dataSyncWorkflow" OR WorkflowType = "schemaDiscoveryWorkflow" OR WorkflowType = "incrementalSyncWorkflow" OR WorkflowType = "dataQualityWorkflow" OR WorkflowType = "transformationWorkflow"';

      if (params?.connectionId) {
        query += ` AND connectionId = "${params.connectionId}"`;
      }

      if (params?.workflowType) {
        query += ` AND workflowType = "${params.workflowType}"`;
      }

      if (params?.status) {
        const statusFilter = params.status === 'running' ? 'ExecutionStatus = "Running"' :
                            params.status === 'completed' ? 'ExecutionStatus = "Completed"' :
                            'ExecutionStatus = "Failed" OR ExecutionStatus = "Terminated"';
        query += ` AND ${statusFilter}`;
      }

      const workflows = client.workflow.list({ query });
      const results: Array<any> = [];

      for await (const workflow of workflows) {
        results.push({
          workflowId: workflow.workflowId,
          runId: workflow.runId,
          status: workflow.status.name,
          startTime: workflow.startTime,
          endTime: workflow.endTime,
          memo: workflow.memo
        });
      }

      return results;

    } catch (error) {
      logger.error('Failed to list workflows', { params, error });
      throw error;
    }
  }

  async terminateWorkflow(workflowId: string, reason?: string): Promise<void> {
    const client = await this.ensureConnected();

    try {
      const handle = await this.getWorkflowHandle(workflowId);
      await handle.terminate(reason || 'Terminated by user');
      
      logger.info('Workflow terminated', { workflowId, reason });

    } catch (error) {
      logger.error('Failed to terminate workflow', { workflowId, error });
      throw error;
    }
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    const client = await this.ensureConnected();

    try {
      const handle = await this.getWorkflowHandle(workflowId);
      await handle.cancel();
      
      logger.info('Workflow cancelled', { workflowId });

    } catch (error) {
      logger.error('Failed to cancel workflow', { workflowId, error });
      throw error;
    }
  }

  async getWorkflowResult(workflowId: string): Promise<any> {
    const client = await this.ensureConnected();

    try {
      const handle = await this.getWorkflowHandle(workflowId);
      const result = await handle.result();
      
      logger.info('Retrieved workflow result', { workflowId });
      return result;

    } catch (error) {
      logger.error('Failed to get workflow result', { workflowId, error });
      throw error;
    }
  }

  async queryWorkflow(workflowId: string, queryName: string): Promise<any> {
    const client = await this.ensureConnected();

    try {
      const handle = await this.getWorkflowHandle(workflowId);
      const result = await handle.query(queryName);
      
      logger.debug('Queried workflow', { workflowId, queryName });
      return result;

    } catch (error) {
      logger.error('Failed to query workflow', { workflowId, queryName, error });
      throw error;
    }
  }

  async signalWorkflow(workflowId: string, signalName: string, args?: any[]): Promise<void> {
    const client = await this.ensureConnected();

    try {
      const handle = await this.getWorkflowHandle(workflowId);
      await handle.signal(signalName, ...(args || []));
      
      logger.info('Sent signal to workflow', { workflowId, signalName });

    } catch (error) {
      logger.error('Failed to send signal to workflow', { workflowId, signalName, error });
      throw error;
    }
  }
}

// Export singleton instance
export const temporalClient = new TemporalClientWrapper();