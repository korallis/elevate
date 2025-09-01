import { Worker, NativeConnection } from '@temporalio/worker';
import { log } from '@temporalio/activity';
import { temporalConfig, TASK_QUEUES } from '../temporal.config.js';
import * as activities from './activities/index.js';

/**
 * SME Analytics Temporal Worker
 * 
 * This worker processes ETL workflows for data synchronization,
 * schema discovery, data quality checks, and transformations.
 */

class TemporalWorker {
  private worker: Worker | null = null;
  private connection: NativeConnection | null = null;

  async start(): Promise<void> {
    try {
      log.info('Starting SME Analytics Temporal Worker', {
        serverAddress: temporalConfig.server.address,
        namespace: temporalConfig.server.namespace,
        taskQueue: temporalConfig.worker.taskQueue
      });

      // Create connection to Temporal server
      this.connection = await NativeConnection.connect({
        address: temporalConfig.server.address,
        // Add TLS configuration if needed
        // tls: {
        //   clientCertPair: {
        //     crt: fs.readFileSync(path.join(__dirname, 'certs/client.pem')),
        //     key: fs.readFileSync(path.join(__dirname, 'certs/client-key.pem')),
        //   },
        //   serverNameOverride: 'temporal',
        //   serverRootCACertificate: fs.readFileSync(path.join(__dirname, 'certs/ca.pem')),
        // }
      });

      log.info('Connected to Temporal server');

      // Create and configure worker
      this.worker = await Worker.create({
        connection: this.connection,
        namespace: temporalConfig.server.namespace,
        taskQueue: temporalConfig.worker.taskQueue,
        workflowsPath: new URL('./workflows', import.meta.url).pathname,
        activities,
        maxConcurrentWorkflowTaskExecutions: temporalConfig.worker.maxConcurrentWorkflowTaskExecutions,
        maxConcurrentActivityTaskExecutions: temporalConfig.worker.maxConcurrentActivityTaskExecutions,
        // Enable structured logging
        sinks: {
          // Custom logging sink could be added here
        },
        // Activity options
        activityDefaults: {
          startToCloseTimeout: '10 minutes',
          retry: {
            initialInterval: '30 seconds',
            maximumInterval: '5 minutes',
            maximumAttempts: 3,
            backoffCoefficient: 2.0,
          },
        },
        // Enable replay protection
        enableSDKTracing: process.env.NODE_ENV !== 'production',
        // Graceful shutdown timeout
        shutdownGraceTime: '30 seconds',
      });

      log.info('Temporal worker created successfully', {
        taskQueue: temporalConfig.worker.taskQueue,
        workflowsPath: './workflows',
        maxWorkflowTasks: temporalConfig.worker.maxConcurrentWorkflowTaskExecutions,
        maxActivityTasks: temporalConfig.worker.maxConcurrentActivityTaskExecutions
      });

      // Start the worker
      await this.worker.run();
      
    } catch (error) {
      log.error('Failed to start Temporal worker', { error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    log.info('Shutting down SME Analytics Temporal Worker');
    
    try {
      if (this.worker) {
        this.worker.shutdown();
        log.info('Worker shutdown initiated');
      }

      if (this.connection) {
        await this.connection.close();
        log.info('Connection to Temporal server closed');
      }

      log.info('SME Analytics Temporal Worker shut down successfully');
      
    } catch (error) {
      log.error('Error during worker shutdown', { error });
      throw error;
    }
  }

  async getHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      taskQueue: string;
      namespace: string;
      activeTasks: number;
    };
  }> {
    const isConnected = this.connection !== null;
    const hasWorker = this.worker !== null;
    
    return {
      status: isConnected && hasWorker ? 'healthy' : 'unhealthy',
      details: {
        connected: isConnected,
        taskQueue: temporalConfig.worker.taskQueue,
        namespace: temporalConfig.server.namespace,
        activeTasks: 0 // This would be populated from worker metrics
      }
    };
  }
}

// Create worker instance
const worker = new TemporalWorker();

// Handle process signals for graceful shutdown
process.on('SIGTERM', async () => {
  log.info('Received SIGTERM, shutting down gracefully');
  try {
    await worker.shutdown();
    process.exit(0);
  } catch (error) {
    log.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  log.info('Received SIGINT, shutting down gracefully');
  try {
    await worker.shutdown();
    process.exit(0);
  } catch (error) {
    log.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

// Health check endpoint (if needed)
if (process.env.ENABLE_HEALTH_CHECK === 'true') {
  import('http').then(({ createServer }) => {
    const healthServer = createServer(async (req, res) => {
      if (req.url === '/health') {
        try {
          const health = await worker.getHealth();
          res.writeHead(health.status === 'healthy' ? 200 : 503, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify(health));
        } catch (error) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    const healthPort = parseInt(process.env.HEALTH_PORT || '8080', 10);
    healthServer.listen(healthPort, () => {
      log.info('Health check server started', { port: healthPort });
    });
  });
}

// Start the worker
async function main(): Promise<void> {
  try {
    log.info('Starting SME Analytics ETL Worker');
    await worker.start();
  } catch (error) {
    log.error('Failed to start worker', { error });
    process.exit(1);
  }
}

// Export worker instance for testing
export { worker, TemporalWorker };

// Start the worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Worker startup failed:', error);
    process.exit(1);
  });
}