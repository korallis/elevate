import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

export const logger = pino({
  level: logLevel,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined, // Use JSON output in production
  base: {
    pid: false,
    hostname: false,
  },
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

// Create a child logger for database operations
export const dbLogger = logger.child({ component: 'database' });

// Create a child logger for API operations
export const apiLogger = logger.child({ component: 'api' });

// Create a child logger for ETL operations
export const etlLogger = logger.child({ component: 'etl' });

// Create a child logger for authentication operations
export const authLogger = logger.child({ component: 'auth' });

// Utility function to log errors with context
export function logError(logger: pino.Logger, error: unknown, context?: Record<string, unknown>) {
  if (error instanceof Error) {
    logger.error(
      {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        ...context,
      },
      'Error occurred',
    );
  } else {
    logger.error(
      {
        error: String(error),
        ...context,
      },
      'Unknown error occurred',
    );
  }
}

// Utility function to create request correlation IDs
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default logger;
