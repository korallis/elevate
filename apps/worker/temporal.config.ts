/**
 * Temporal configuration for the SME Analytics worker
 */

export interface TemporalConfig {
  server: {
    address: string;
    namespace: string;
  };
  worker: {
    taskQueue: string;
    maxConcurrentWorkflowTaskExecutions: number;
    maxConcurrentActivityTaskExecutions: number;
  };
  client: {
    connectionTimeout: number;
  };
}

export const temporalConfig: TemporalConfig = {
  server: {
    address: process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'sme-analytics'
  },
  worker: {
    taskQueue: 'etl-task-queue',
    maxConcurrentWorkflowTaskExecutions: 10,
    maxConcurrentActivityTaskExecutions: 100
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

export type TaskQueue = typeof TASK_QUEUES[keyof typeof TASK_QUEUES];