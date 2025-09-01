import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { logger } from '../logger.js';
import { temporalClient } from '../temporal/temporal-client.js';
import type { ConnectorType } from '../connectors/types.js';

const app = new Hono();

// Validation schemas
const DataSyncSchema = z.object({
  connectionId: z.string().min(1),
  connectorType: z.string() as z.ZodType<ConnectorType>,
  syncConfig: z.object({
    databases: z.array(z.string()).optional(),
    schemas: z.array(z.string()).optional(),
    tables: z.array(z.string()).optional(),
    mode: z.enum(['full', 'incremental', 'snapshot']),
    batchSize: z.number().min(100).max(10000).default(1000),
    parallelism: z.number().min(1).max(10).default(1),
    scheduleExpression: z.string().optional()
  }),
  authConfig: z.object({
    type: z.string(),
    credentials: z.record(z.unknown())
  }),
  notificationConfig: z.object({
    email: z.array(z.string().email()).optional(),
    webhook: z.string().url().optional()
  }).optional()
});

const SchemaDiscoverySchema = z.object({
  connectionId: z.string().min(1),
  connectorType: z.string() as z.ZodType<ConnectorType>,
  discoveryConfig: z.object({
    databases: z.array(z.string()).optional(),
    schemas: z.array(z.string()).optional(),
    includeTables: z.boolean().default(true),
    includeColumns: z.boolean().default(true),
    includeSampleData: z.boolean().default(false),
    includeStatistics: z.boolean().default(false),
    maxSampleRows: z.number().min(10).max(1000).default(100),
    detectRelationships: z.boolean().default(false)
  }),
  authConfig: z.object({
    type: z.string(),
    credentials: z.record(z.unknown())
  }),
  notificationConfig: z.object({
    email: z.array(z.string().email()).optional(),
    webhook: z.string().url().optional()
  }).optional()
});

const IncrementalSyncSchema = z.object({
  connectionId: z.string().min(1),
  connectorType: z.string() as z.ZodType<ConnectorType>,
  tables: z.array(z.object({
    table: z.object({
      name: z.string(),
      schema: z.string(),
      database: z.string().optional()
    }),
    incrementalConfig: z.object({
      column: z.string(),
      strategy: z.enum(['timestamp', 'auto_increment', 'change_log', 'binary_log']),
      batchSize: z.number().min(100).max(5000).default(1000),
      frequency: z.enum(['realtime', 'minute', 'hourly', 'daily'])
    })
  })),
  authConfig: z.object({
    type: z.string(),
    credentials: z.record(z.unknown())
  }),
  syncConfig: z.object({
    maxBatchSize: z.number().min(100).max(10000).default(2000),
    maxConcurrency: z.number().min(1).max(20).default(5),
    retentionDays: z.number().min(1).max(365).default(30)
  }),
  notificationConfig: z.object({
    email: z.array(z.string().email()).optional(),
    webhook: z.string().url().optional(),
    onError: z.boolean().default(true),
    onComplete: z.boolean().default(false)
  }).optional()
});

const DataQualitySchema = z.object({
  connectionId: z.string().min(1),
  connectorType: z.string() as z.ZodType<ConnectorType>,
  tables: z.array(z.object({
    table: z.object({
      name: z.string(),
      schema: z.string(),
      database: z.string().optional()
    }),
    qualityChecks: z.object({
      completeness: z.boolean().default(true),
      uniqueness: z.boolean().default(true),
      validity: z.boolean().default(true),
      accuracy: z.boolean().default(false),
      consistency: z.boolean().default(false),
      timeliness: z.boolean().default(true)
    }),
    businessRules: z.array(z.object({
      name: z.string(),
      description: z.string(),
      rule: z.string(), // SQL expression
      severity: z.enum(['error', 'warning', 'info']).default('warning')
    })).optional(),
    thresholds: z.object({
      completenessThreshold: z.number().min(0).max(1).default(0.95),
      uniquenessThreshold: z.number().min(0).max(1).default(0.95),
      validityThreshold: z.number().min(0).max(1).default(0.90),
      freshnessHours: z.number().min(1).max(168).default(24)
    })
  })),
  authConfig: z.object({
    type: z.string(),
    credentials: z.record(z.unknown())
  }),
  reportConfig: z.object({
    includeDetails: z.boolean().default(true),
    includeSuggestions: z.boolean().default(true),
    format: z.enum(['json', 'html', 'pdf']).default('json')
  }),
  notificationConfig: z.object({
    email: z.array(z.string().email()).optional(),
    webhook: z.string().url().optional(),
    onlyOnFailure: z.boolean().default(false)
  }).optional()
});

const TransformationSchema = z.object({
  connectionId: z.string().min(1),
  connectorType: z.string() as z.ZodType<ConnectorType>,
  pipeline: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    steps: z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      type: z.enum(['sql', 'python', 'javascript', 'dbt', 'spark']),
      transformation: z.object({
        query: z.string().optional(),
        script: z.string().optional(),
        parameters: z.record(z.unknown()).optional()
      }),
      inputTables: z.array(z.string()),
      outputTable: z.string(),
      dependencies: z.array(z.string()).default([])
    }))
  }),
  executionConfig: z.object({
    mode: z.enum(['full', 'incremental', 'test']).default('full'),
    dryRun: z.boolean().default(false),
    parallelism: z.number().min(1).max(10).default(1),
    retryFailedSteps: z.boolean().default(true),
    rollbackOnFailure: z.boolean().default(true)
  }),
  authConfig: z.object({
    type: z.string(),
    credentials: z.record(z.unknown())
  }),
  notificationConfig: z.object({
    email: z.array(z.string().email()).optional(),
    webhook: z.string().url().optional(),
    onSuccess: z.boolean().default(true),
    onFailure: z.boolean().default(true)
  }).optional()
});

// Initialize Temporal client on first request
let temporalInitialized = false;
async function ensureTemporalClient(): Promise<void> {
  if (!temporalInitialized) {
    try {
      await temporalClient.connect();
      temporalInitialized = true;
      logger.info('Temporal client initialized');
    } catch (error) {
      logger.error('Failed to initialize Temporal client', { error });
      throw error;
    }
  }
}

// ETL Routes

/**
 * Start a data sync workflow
 * POST /etl/sync
 */
app.post('/sync', zValidator('json', DataSyncSchema), async (c) => {
  const request = c.req.valid('json');

  try {
    await ensureTemporalClient();

    logger.info('Starting data sync workflow', {
      connectionId: request.connectionId,
      connectorType: request.connectorType,
      mode: request.syncConfig.mode
    });

    const handle = await temporalClient.startDataSync(request);

    return c.json({
      success: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'started',
      message: 'Data sync workflow started successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start data sync workflow', {
      connectionId: request.connectionId,
      error: errorMessage
    });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Start a schema discovery workflow
 * POST /etl/discovery
 */
app.post('/discovery', zValidator('json', SchemaDiscoverySchema), async (c) => {
  const request = c.req.valid('json');

  try {
    await ensureTemporalClient();

    logger.info('Starting schema discovery workflow', {
      connectionId: request.connectionId,
      connectorType: request.connectorType
    });

    const handle = await temporalClient.startSchemaDiscovery(request);

    return c.json({
      success: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'started',
      message: 'Schema discovery workflow started successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start schema discovery workflow', {
      connectionId: request.connectionId,
      error: errorMessage
    });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Start an incremental sync workflow
 * POST /etl/incremental-sync
 */
app.post('/incremental-sync', zValidator('json', IncrementalSyncSchema), async (c) => {
  const request = c.req.valid('json');

  try {
    await ensureTemporalClient();

    logger.info('Starting incremental sync workflow', {
      connectionId: request.connectionId,
      connectorType: request.connectorType,
      tables: request.tables.length
    });

    const handle = await temporalClient.startIncrementalSync(request);

    return c.json({
      success: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'started',
      message: 'Incremental sync workflow started successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start incremental sync workflow', {
      connectionId: request.connectionId,
      error: errorMessage
    });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Start a data quality check workflow
 * POST /etl/quality-check
 */
app.post('/quality-check', zValidator('json', DataQualitySchema), async (c) => {
  const request = c.req.valid('json');

  try {
    await ensureTemporalClient();

    logger.info('Starting data quality check workflow', {
      connectionId: request.connectionId,
      connectorType: request.connectorType,
      tables: request.tables.length
    });

    const handle = await temporalClient.startDataQualityCheck(request);

    return c.json({
      success: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'started',
      message: 'Data quality check workflow started successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start data quality check workflow', {
      connectionId: request.connectionId,
      error: errorMessage
    });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Start a transformation workflow
 * POST /etl/transformation
 */
app.post('/transformation', zValidator('json', TransformationSchema), async (c) => {
  const request = c.req.valid('json');

  try {
    await ensureTemporalClient();

    logger.info('Starting transformation workflow', {
      connectionId: request.connectionId,
      pipelineId: request.pipeline.id,
      pipelineName: request.pipeline.name,
      steps: request.pipeline.steps.length
    });

    const handle = await temporalClient.startTransformation(request);

    return c.json({
      success: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'started',
      message: 'Transformation workflow started successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start transformation workflow', {
      connectionId: request.connectionId,
      pipelineId: request.pipeline.id,
      error: errorMessage
    });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

// Workflow Management Routes

/**
 * List workflows
 * GET /etl/workflows
 */
app.get('/workflows', async (c) => {
  const connectionId = c.req.query('connectionId');
  const workflowType = c.req.query('workflowType');
  const status = c.req.query('status') as 'running' | 'completed' | 'failed' | undefined;

  try {
    await ensureTemporalClient();

    const workflows = await temporalClient.listWorkflows({
      connectionId,
      workflowType,
      status
    });

    return c.json({
      success: true,
      workflows
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list workflows', { error: errorMessage });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Get workflow status
 * GET /etl/workflows/:workflowId/status
 */
app.get('/workflows/:workflowId/status', async (c) => {
  const workflowId = c.req.param('workflowId');

  try {
    await ensureTemporalClient();

    // Try different query types based on workflow type
    const queryTypes = [
      'get-sync-status',
      'get-discovery-status', 
      'get-incremental-sync-status',
      'get-data-quality-status',
      'get-transformation-status'
    ];

    let status = null;
    for (const queryType of queryTypes) {
      try {
        status = await temporalClient.queryWorkflow(workflowId, queryType);
        break;
      } catch (error) {
        // Continue to next query type
      }
    }

    if (!status) {
      // Fallback to workflow handle info
      const handle = await temporalClient.getWorkflowHandle(workflowId);
      const describe = await handle.describe();
      
      status = {
        phase: describe.status.name.toLowerCase(),
        workflowId: describe.workflowId,
        runId: describe.runId,
        startTime: describe.startTime,
        endTime: describe.endTime
      };
    }

    return c.json({
      success: true,
      workflowId,
      status
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get workflow status', { workflowId, error: errorMessage });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Get workflow result
 * GET /etl/workflows/:workflowId/result
 */
app.get('/workflows/:workflowId/result', async (c) => {
  const workflowId = c.req.param('workflowId');

  try {
    await ensureTemporalClient();

    const result = await temporalClient.getWorkflowResult(workflowId);

    return c.json({
      success: true,
      workflowId,
      result
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get workflow result', { workflowId, error: errorMessage });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Cancel workflow
 * POST /etl/workflows/:workflowId/cancel
 */
app.post('/workflows/:workflowId/cancel', async (c) => {
  const workflowId = c.req.param('workflowId');

  try {
    await ensureTemporalClient();

    await temporalClient.cancelWorkflow(workflowId);

    return c.json({
      success: true,
      workflowId,
      message: 'Workflow cancelled successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to cancel workflow', { workflowId, error: errorMessage });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Terminate workflow
 * POST /etl/workflows/:workflowId/terminate
 */
app.post('/workflows/:workflowId/terminate', async (c) => {
  const workflowId = c.req.param('workflowId');
  const { reason } = await c.req.json();

  try {
    await ensureTemporalClient();

    await temporalClient.terminateWorkflow(workflowId, reason);

    return c.json({
      success: true,
      workflowId,
      message: 'Workflow terminated successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to terminate workflow', { workflowId, error: errorMessage });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

/**
 * Send signal to workflow
 * POST /etl/workflows/:workflowId/signal
 */
app.post('/workflows/:workflowId/signal', async (c) => {
  const workflowId = c.req.param('workflowId');
  const { signalName, args } = await c.req.json();

  try {
    await ensureTemporalClient();

    await temporalClient.signalWorkflow(workflowId, signalName, args);

    return c.json({
      success: true,
      workflowId,
      signalName,
      message: 'Signal sent successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send signal to workflow', { workflowId, signalName, error: errorMessage });

    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});

export default app;