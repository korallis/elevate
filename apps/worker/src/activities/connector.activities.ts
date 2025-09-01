import { log } from '@temporalio/activity';
import type { ConnectorType, ConnectionTestResult, IDataConnector } from '../../../api/src/connectors/types.js';

// Import connector implementations (these would need to be available)
// For now, using a mock implementation pattern
interface ConnectorRegistry {
  [key: string]: () => Promise<IDataConnector>;
}

const connectorRegistry: ConnectorRegistry = {
  // These would be actual imports in a real implementation
  snowflake: async () => (await import('../../../api/src/connectors/snowflake.js')).default,
  postgresql: async () => (await import('../../../api/src/connectors/postgres.js')).default,
  mysql: async () => (await import('../../../api/src/connectors/mysql.js')).default,
  // Add other connectors as needed
};

// Connection pool to reuse connections
const connectionPool = new Map<string, IDataConnector>();

export async function connectToSource(
  connectionId: string, 
  authConfig: { type: string; credentials: Record<string, unknown> }
): Promise<void> {
  log.info('Connecting to data source', { connectionId });
  
  try {
    // Get connection configuration from database/storage
    const connectionConfig = await getConnectionConfig(connectionId);
    
    // Get connector instance
    const connectorFactory = connectorRegistry[connectionConfig.type];
    if (!connectorFactory) {
      throw new Error(`Unsupported connector type: ${connectionConfig.type}`);
    }
    
    const connector = await connectorFactory();
    
    // Test connection first
    const testResult = await connector.testConnection(authConfig);
    if (!testResult.success) {
      throw new Error(`Connection test failed: ${testResult.message}`);
    }
    
    // Establish connection
    await connector.connect(authConfig);
    
    // Store in connection pool
    connectionPool.set(connectionId, connector);
    
    log.info('Successfully connected to data source', { 
      connectionId, 
      connectorType: connectionConfig.type,
      version: testResult.version,
      latency: testResult.latencyMs
    });
    
  } catch (error) {
    log.error('Failed to connect to data source', { connectionId, error });
    throw error;
  }
}

export async function disconnectFromSource(connectionId: string): Promise<void> {
  log.info('Disconnecting from data source', { connectionId });
  
  try {
    const connector = connectionPool.get(connectionId);
    if (connector && connector.isConnected()) {
      await connector.disconnect();
      connectionPool.delete(connectionId);
      log.info('Successfully disconnected from data source', { connectionId });
    } else {
      log.warn('No active connection found for disconnection', { connectionId });
    }
  } catch (error) {
    log.error('Failed to disconnect from data source', { connectionId, error });
    // Don't throw here as this is cleanup
  }
}

export async function testConnection(
  connectionId: string,
  authConfig: { type: string; credentials: Record<string, unknown> }
): Promise<ConnectionTestResult> {
  log.info('Testing connection', { connectionId });
  
  try {
    const connectionConfig = await getConnectionConfig(connectionId);
    const connectorFactory = connectorRegistry[connectionConfig.type];
    
    if (!connectorFactory) {
      return {
        success: false,
        message: `Unsupported connector type: ${connectionConfig.type}`
      };
    }
    
    const connector = await connectorFactory();
    const result = await connector.testConnection(authConfig);
    
    log.info('Connection test completed', { connectionId, success: result.success });
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Connection test failed', { connectionId, error: errorMessage });
    
    return {
      success: false,
      message: errorMessage
    };
  }
}

export async function executeQuery(
  connectionId: string,
  query: string,
  parameters?: unknown[]
): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}> {
  log.info('Executing query', { connectionId, queryLength: query.length });
  
  const connector = connectionPool.get(connectionId);
  if (!connector || !connector.isConnected()) {
    throw new Error(`No active connection found for ${connectionId}`);
  }
  
  try {
    const startTime = Date.now();
    const result = await connector.executeQuery(query, parameters);
    const executionTimeMs = Date.now() - startTime;
    
    log.info('Query executed successfully', { 
      connectionId,
      rowCount: result.rowCount,
      executionTimeMs
    });
    
    return {
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      executionTimeMs
    };
    
  } catch (error) {
    log.error('Query execution failed', { connectionId, error, query: query.substring(0, 200) });
    throw error;
  }
}

export async function executeStreamingQuery(
  connectionId: string,
  query: string,
  batchSize: number = 1000,
  parameters?: unknown[]
): Promise<AsyncIterable<Record<string, unknown>>> {
  log.info('Executing streaming query', { connectionId, batchSize });
  
  const connector = connectionPool.get(connectionId);
  if (!connector || !connector.isConnected()) {
    throw new Error(`No active connection found for ${connectionId}`);
  }
  
  if (!connector.executeStreamingQuery) {
    // Fall back to regular query for connectors that don't support streaming
    log.warn('Connector does not support streaming, falling back to regular query', { connectionId });
    const result = await connector.executeQuery(query, parameters);
    
    // Convert to async iterable
    return (async function* () {
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        for (const row of batch) {
          yield row;
        }
      }
    })();
  }
  
  return connector.executeStreamingQuery(query, parameters);
}

export async function pingConnection(connectionId: string): Promise<boolean> {
  log.info('Pinging connection', { connectionId });
  
  try {
    const connector = connectionPool.get(connectionId);
    if (!connector) {
      return false;
    }
    
    const isHealthy = await connector.ping();
    log.info('Connection ping completed', { connectionId, healthy: isHealthy });
    
    return isHealthy;
    
  } catch (error) {
    log.error('Connection ping failed', { connectionId, error });
    return false;
  }
}

export async function getConnectionVersion(connectionId: string): Promise<string> {
  log.info('Getting connection version', { connectionId });
  
  const connector = connectionPool.get(connectionId);
  if (!connector || !connector.isConnected()) {
    throw new Error(`No active connection found for ${connectionId}`);
  }
  
  try {
    const version = await connector.getVersion();
    log.info('Connection version retrieved', { connectionId, version });
    return version;
    
  } catch (error) {
    log.error('Failed to get connection version', { connectionId, error });
    throw error;
  }
}

// Helper function to get connection configuration
async function getConnectionConfig(connectionId: string): Promise<{
  id: string;
  name: string;
  type: ConnectorType;
  config: Record<string, unknown>;
  enabled: boolean;
}> {
  // This would typically fetch from a database or configuration service
  // For now, return a mock configuration
  // In real implementation, this would query the database
  
  // Mock implementation - replace with actual database query
  return {
    id: connectionId,
    name: `Connection ${connectionId}`,
    type: 'snowflake', // This would be dynamic based on stored config
    config: {},
    enabled: true
  };
}