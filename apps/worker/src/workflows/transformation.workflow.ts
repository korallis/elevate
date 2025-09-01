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
import type { ConnectorType, TableInfo } from '../../../api/src/connectors/types.js';
import type * as activities from '../activities/index.js';

const {
  connectToSource,
  disconnectFromSource,
  validateTransformation,
  executeTransformation,
  createTransformationCheckpoint,
  rollbackTransformation,
  validateTransformationResults,
  updateTransformationStatus,
  sendNotification,
  cleanupTempResources
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '20 minutes',
  retry: {
    initialInterval: '1 minute',
    maximumInterval: '5 minutes',
    maximumAttempts: 2,
    backoffCoefficient: 2.0,
  },
});

export interface TransformationStep {
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
  dependencies: string[]; // IDs of steps this depends on
  validation?: {
    rowCountCheck?: boolean;
    dataTypeCheck?: boolean;
    businessRules?: Array<{
      name: string;
      rule: string;
      severity: 'error' | 'warning';
    }>;
  };
}

export interface TransformationWorkflowInput {
  connectionId: string;
  connectorType: ConnectorType;
  pipeline: {
    id: string;
    name: string;
    description: string;
    steps: TransformationStep[];
    schedule?: {
      expression: string;
      timezone: string;
    };
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
}

export interface TransformationResult {
  stepId: string;
  stepName: string;
  status: 'success' | 'failed' | 'skipped';
  startTime: Date;
  endTime: Date;
  duration: number;
  recordsProcessed: number;
  recordsOutput: number;
  bytesProcessed: number;
  error?: string;
  validationResults?: Array<{
    checkName: string;
    passed: boolean;
    message?: string;
  }>;
  metrics?: {
    cpuTime?: number;
    memoryUsage?: number;
    ioOperations?: number;
  };
}

export interface TransformationStatus {
  phase: 'initializing' | 'validating' | 'executing' | 'validating_results' | 'completed' | 'failed' | 'rolling_back';
  progress: {
    totalSteps: number;
    completedSteps: number;
    currentStep?: string;
    estimatedCompletion?: Date;
  };
  results: TransformationResult[];
  errors: Array<{
    stepId?: string;
    message: string;
    timestamp: Date;
    severity: 'error' | 'warning';
  }>;
  metrics: {
    totalDuration: number;
    totalRecordsProcessed: number;
    totalBytesProcessed: number;
    stepExecutionOrder: string[];
  };
}

// Signals for controlling transformation execution
export const pauseTransformationSignal = defineSignal<[]>('pause-transformation');
export const resumeTransformationSignal = defineSignal<[]>('resume-transformation');
export const cancelTransformationSignal = defineSignal<[]>('cancel-transformation');

// Queries for monitoring transformation state
export const getTransformationStatusQuery = defineQuery<TransformationStatus>('get-transformation-status');

export async function transformationWorkflow(input: TransformationWorkflowInput): Promise<TransformationStatus> {
  const workflowId = workflowInfo().workflowId;
  const startTime = Date.now();
  let isPaused = false;
  let isCancelled = false;

  // Initialize transformation status
  const status: TransformationStatus = {
    phase: 'initializing',
    progress: {
      totalSteps: input.pipeline.steps.length,
      completedSteps: 0
    },
    results: [],
    errors: [],
    metrics: {
      totalDuration: 0,
      totalRecordsProcessed: 0,
      totalBytesProcessed: 0,
      stepExecutionOrder: []
    }
  };

  // Setup signal handlers
  setHandler(pauseTransformationSignal, () => {
    log.info('Transformation workflow paused', { workflowId });
    isPaused = true;
  });

  setHandler(resumeTransformationSignal, () => {
    log.info('Transformation workflow resumed', { workflowId });
    isPaused = false;
  });

  setHandler(cancelTransformationSignal, () => {
    log.info('Transformation workflow cancelled', { workflowId });
    isCancelled = true;
  });

  setHandler(getTransformationStatusQuery, () => status);

  try {
    log.info('Starting transformation workflow', { 
      workflowId, 
      pipelineId: input.pipeline.id,
      totalSteps: input.pipeline.steps.length,
      mode: input.executionConfig.mode
    });

    // Update status in external system
    await updateTransformationStatus(input.connectionId, input.pipeline.id, status);

    // Phase 1: Connect to data source
    await connectToSource(input.connectionId, input.authConfig);

    // Phase 2: Validate transformations
    status.phase = 'validating';
    
    for (const step of input.pipeline.steps) {
      if (isCancelled) break;

      try {
        await validateTransformation({
          connectionId: input.connectionId,
          step: step,
          mode: input.executionConfig.mode
        });
        
        log.info('Transformation step validated', { stepId: step.id, stepName: step.name });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        status.errors.push({
          stepId: step.id,
          message: `Validation failed: ${errorMessage}`,
          timestamp: new Date(),
          severity: 'error'
        });
        
        if (!input.executionConfig.dryRun) {
          throw new Error(`Transformation validation failed for step ${step.name}: ${errorMessage}`);
        }
      }
    }

    if (input.executionConfig.dryRun) {
      status.phase = 'completed';
      status.progress.completedSteps = input.pipeline.steps.length;
      log.info('Dry run completed successfully', { workflowId });
      return status;
    }

    // Phase 3: Execute transformations
    status.phase = 'executing';

    // Build execution order based on dependencies
    const executionOrder = buildExecutionOrder(input.pipeline.steps);
    status.metrics.stepExecutionOrder = executionOrder;

    // Create initial checkpoint
    await createTransformationCheckpoint({
      connectionId: input.connectionId,
      pipelineId: input.pipeline.id,
      executionId: workflowId,
      completedSteps: [],
      startTime: new Date()
    });

    const executeStep = async (stepId: string, parallelGroup: string[]): Promise<void> => {
      const step = input.pipeline.steps.find(s => s.id === stepId);
      if (!step) return;

      // Check for pause/cancel signals
      if (isCancelled) return;
      if (isPaused) {
        await condition(() => !isPaused || isCancelled);
        if (isCancelled) return;
      }

      const stepStartTime = Date.now();
      status.progress.currentStep = step.name;

      const result: TransformationResult = {
        stepId: step.id,
        stepName: step.name,
        status: 'failed',
        startTime: new Date(),
        endTime: new Date(),
        duration: 0,
        recordsProcessed: 0,
        recordsOutput: 0,
        bytesProcessed: 0
      };

      try {
        log.info('Executing transformation step', { 
          stepId: step.id, 
          stepName: step.name,
          type: step.type,
          parallelGroup: parallelGroup.length > 1 ? parallelGroup : undefined
        });

        const executionResult = await executeTransformation({
          connectionId: input.connectionId,
          step: step,
          mode: input.executionConfig.mode,
          executionId: workflowId
        });

        result.status = 'success';
        result.recordsProcessed = executionResult.recordsProcessed;
        result.recordsOutput = executionResult.recordsOutput;
        result.bytesProcessed = executionResult.bytesProcessed;
        result.metrics = executionResult.metrics;

        // Run validation if configured
        if (step.validation) {
          const validationResults = await validateTransformationResults({
            connectionId: input.connectionId,
            step: step,
            executionResult: executionResult
          });

          result.validationResults = validationResults;

          // Check if any critical validations failed
          const criticalFailures = validationResults.filter(v => !v.passed && v.checkName.includes('error'));
          if (criticalFailures.length > 0) {
            throw new Error(`Critical validation failures: ${criticalFailures.map(f => f.message).join(', ')}`);
          }
        }

        status.progress.completedSteps++;
        status.metrics.totalRecordsProcessed += result.recordsProcessed;
        status.metrics.totalBytesProcessed += result.bytesProcessed;

        log.info('Transformation step completed', { 
          stepId: step.id,
          stepName: step.name,
          recordsProcessed: result.recordsProcessed,
          duration: result.duration
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.error = errorMessage;
        result.status = 'failed';

        status.errors.push({
          stepId: step.id,
          message: errorMessage,
          timestamp: new Date(),
          severity: 'error'
        });

        log.error('Transformation step failed', { 
          stepId: step.id,
          stepName: step.name,
          error: errorMessage 
        });

        // Decide whether to continue or fail the entire pipeline
        if (!input.executionConfig.retryFailedSteps) {
          throw error;
        }
      } finally {
        result.endTime = new Date();
        result.duration = Date.now() - stepStartTime;
        status.results.push(result);

        // Update checkpoint
        await createTransformationCheckpoint({
          connectionId: input.connectionId,
          pipelineId: input.pipeline.id,
          executionId: workflowId,
          completedSteps: status.results.filter(r => r.status === 'success').map(r => r.stepId),
          startTime: new Date(startTime)
        });
      }
    };

    // Execute steps according to dependency order
    const processedSteps = new Set<string>();
    
    for (const levelSteps of executionOrder) {
      if (isCancelled) break;

      // Execute steps in parallel if they have no dependencies on each other
      const parallelPromises = levelSteps.map(stepId => {
        if (processedSteps.has(stepId)) return Promise.resolve();
        processedSteps.add(stepId);
        return executeStep(stepId, levelSteps);
      });

      await Promise.all(parallelPromises);
    }

    // Phase 4: Validate final results
    if (!isCancelled && status.errors.filter(e => e.severity === 'error').length === 0) {
      status.phase = 'validating_results';
      // Additional end-to-end validation could go here
    }

    // Phase 5: Complete or rollback
    const hasErrors = status.errors.filter(e => e.severity === 'error').length > 0;
    
    if (isCancelled || (hasErrors && input.executionConfig.rollbackOnFailure)) {
      status.phase = 'rolling_back';
      
      try {
        await rollbackTransformation({
          connectionId: input.connectionId,
          pipelineId: input.pipeline.id,
          executionId: workflowId,
          completedSteps: status.results.filter(r => r.status === 'success').map(r => r.stepId)
        });
        
        log.info('Transformation pipeline rolled back', { workflowId });
        
      } catch (rollbackError) {
        log.error('Rollback failed', { workflowId, error: rollbackError });
        status.errors.push({
          message: `Rollback failed: ${rollbackError}`,
          timestamp: new Date(),
          severity: 'error'
        });
      }
    }

    status.phase = isCancelled ? 'failed' : (hasErrors ? 'failed' : 'completed');
    status.progress.currentStep = undefined;
    status.metrics.totalDuration = Date.now() - startTime;

    // Update final status
    await updateTransformationStatus(input.connectionId, input.pipeline.id, status);

    // Send completion notification
    if (input.notificationConfig) {
      const shouldNotify = status.phase === 'completed' 
        ? input.notificationConfig.onSuccess 
        : input.notificationConfig.onFailure;
        
      if (shouldNotify) {
        await sendNotification({
          type: status.phase === 'completed' ? 'transformation_completed' : 'transformation_failed',
          connectionId: input.connectionId,
          pipelineId: input.pipeline.id,
          status: status,
          config: input.notificationConfig
        });
      }
    }

    log.info('Transformation workflow completed', {
      workflowId,
      phase: status.phase,
      completedSteps: status.progress.completedSteps,
      totalSteps: status.progress.totalSteps,
      errors: status.errors.length,
      duration: status.metrics.totalDuration
    });

  } catch (error) {
    status.phase = 'failed';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    status.errors.push({
      message: errorMessage,
      timestamp: new Date(),
      severity: 'error'
    });
    status.metrics.totalDuration = Date.now() - startTime;

    await updateTransformationStatus(input.connectionId, input.pipeline.id, status);

    log.error('Transformation workflow failed', { workflowId, error: errorMessage });

    // Send failure notification
    if (input.notificationConfig?.onFailure) {
      await sendNotification({
        type: 'transformation_failed',
        connectionId: input.connectionId,
        pipelineId: input.pipeline.id,
        status: status,
        config: input.notificationConfig
      });
    }

    throw error;

  } finally {
    // Cleanup temporary resources
    try {
      await cleanupTempResources({
        connectionId: input.connectionId,
        pipelineId: input.pipeline.id,
        executionId: workflowId
      });
    } catch (error) {
      log.warn('Failed to cleanup temporary resources', { error });
    }

    // Always disconnect from source
    try {
      await disconnectFromSource(input.connectionId);
    } catch (error) {
      log.warn('Failed to disconnect from source', { error });
    }
  }

  return status;
}

// Helper function to build execution order based on dependencies
function buildExecutionOrder(steps: TransformationStep[]): string[][] {
  const stepMap = new Map(steps.map(step => [step.id, step]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const executionLevels: string[][] = [];
  
  const visit = (stepId: string, level: number): void => {
    if (visiting.has(stepId)) {
      throw new Error(`Circular dependency detected involving step: ${stepId}`);
    }
    if (visited.has(stepId)) {
      return;
    }
    
    visiting.add(stepId);
    const step = stepMap.get(stepId);
    if (!step) return;
    
    let maxDependencyLevel = -1;
    
    // Visit all dependencies first
    for (const depId of step.dependencies) {
      visit(depId, level);
      // Find the level where this dependency was placed
      for (let i = 0; i < executionLevels.length; i++) {
        if (executionLevels[i].includes(depId)) {
          maxDependencyLevel = Math.max(maxDependencyLevel, i);
          break;
        }
      }
    }
    
    visiting.delete(stepId);
    visited.add(stepId);
    
    // Place this step in the level after its latest dependency
    const targetLevel = maxDependencyLevel + 1;
    
    // Ensure we have enough levels
    while (executionLevels.length <= targetLevel) {
      executionLevels.push([]);
    }
    
    executionLevels[targetLevel].push(stepId);
  };
  
  // Visit all steps
  for (const step of steps) {
    visit(step.id, 0);
  }
  
  return executionLevels.filter(level => level.length > 0);
}