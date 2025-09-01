import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';
import type { GDPRRequest, GDPRRequestItem } from './types.js';

interface DeletionOptions {
  cascade_delete: boolean;
  soft_delete: boolean;
  backup_before_delete: boolean;
  verification_required: boolean;
}

interface DeletionPlan {
  tables_to_process: Array<{
    database_name: string;
    schema_name: string;
    table_name: string;
    columns: string[];
    estimated_rows: number;
    dependencies: string[];
    deletion_order: number;
  }>;
  total_estimated_rows: number;
  warnings: string[];
  requires_approval: boolean;
}

export class GDPRDeleter {
  /**
   * Create a new GDPR deletion request (Right to be Forgotten)
   */
  async createDeletionRequest(
    subject_type: string,
    subject_value: string,
    requested_by: number,
    reason?: string,
    options: Partial<DeletionOptions> = {},
    metadata?: Record<string, unknown>
  ): Promise<GDPRRequest> {
    try {
      const deletionOptions: DeletionOptions = {
        cascade_delete: false,
        soft_delete: true, // Default to soft delete for safety
        backup_before_delete: true,
        verification_required: true,
        ...options
      };

      const [request] = await runPostgresQuery<GDPRRequest>(`
        INSERT INTO gdpr_requests (type, subject_type, subject_value, reason, metadata, requested_by, updated_at)
        VALUES ('delete', $1, $2, $3, $4, $5, NOW())
        RETURNING *
      `, [
        subject_type, 
        subject_value, 
        reason, 
        JSON.stringify({ ...metadata, options: deletionOptions }), 
        requested_by
      ]);

      logger.info('GDPR deletion request created', {
        request_id: request.id,
        subject_type,
        subject_value,
        requested_by,
        options: deletionOptions
      });

      // Generate deletion plan
      const plan = await this.generateDeletionPlan(request);
      
      // Update request with plan
      await runPostgresQuery(`
        UPDATE gdpr_requests 
        SET metadata = $2
        WHERE id = $1
      `, [request.id, JSON.stringify({ 
        ...JSON.parse(request.metadata as string || '{}'),
        deletion_plan: plan 
      })]);

      // If verification not required and low risk, start processing immediately
      if (!deletionOptions.verification_required && !plan.requires_approval) {
        this.processDeletionRequest(request.id).catch(error => {
          logger.error('Deletion request processing failed', { error, request_id: request.id });
        });
      }

      return request;
    } catch (error) {
      logger.error('Failed to create GDPR deletion request', { error, subject_type, subject_value });
      throw error;
    }
  }

  /**
   * Generate a deletion plan for the request
   */
  async generateDeletionPlan(request: GDPRRequest): Promise<DeletionPlan> {
    try {
      // Find all tables containing subject data
      const relevantTables = await this.discoverDataLocations(request.subject_type, request.subject_value);
      
      // Analyze dependencies and determine deletion order
      const orderedTables = await this.analyzeDependencies(relevantTables);
      
      // Calculate estimates and warnings
      const totalEstimatedRows = orderedTables.reduce((sum, table) => sum + table.estimated_rows, 0);
      const warnings: string[] = [];
      
      // Determine if approval is required
      let requiresApproval = false;
      
      if (totalEstimatedRows > 10000) {
        warnings.push('Large number of records to be deleted (>10,000)');
        requiresApproval = true;
      }
      
      if (orderedTables.some(table => table.dependencies.length > 0)) {
        warnings.push('Some tables have referential dependencies');
        requiresApproval = true;
      }
      
      if (orderedTables.some(table => this.isCriticalTable(table.table_name))) {
        warnings.push('Critical business tables will be affected');
        requiresApproval = true;
      }

      return {
        tables_to_process: orderedTables,
        total_estimated_rows: totalEstimatedRows,
        warnings,
        requires_approval: requiresApproval
      };
    } catch (error) {
      logger.error('Failed to generate deletion plan', { error, request_id: request.id });
      throw error;
    }
  }

  /**
   * Discover all data locations for the subject
   */
  private async discoverDataLocations(
    subject_type: string,
    subject_value: string
  ): Promise<Array<{
    database_name: string;
    schema_name: string;
    table_name: string;
    columns: string[];
    estimated_rows: number;
  }>> {
    const locations: Array<{
      database_name: string;
      schema_name: string;
      table_name: string;
      columns: string[];
      estimated_rows: number;
    }> = [];

    try {
      // Get all tables from catalog
      const tables = await runPostgresQuery<{
        database_name: string;
        schema_name: string;
        table_name: string;
      }>(`
        SELECT DISTINCT database_name, schema_name, table_name
        FROM catalog_tables
        WHERE table_type = 'BASE TABLE'
        ORDER BY database_name, schema_name, table_name
      `);

      // Check each table for subject data
      for (const table of tables) {
        const columns = await runPostgresQuery<{
          column_name: string;
          data_type: string;
        }>(`
          SELECT column_name, data_type
          FROM catalog_columns
          WHERE database_name = $1 AND schema_name = $2 AND table_name = $3
        `, [table.database_name, table.schema_name, table.table_name]);

        const relevantColumns = this.identifySubjectColumns(columns, subject_type);
        
        if (relevantColumns.length > 0) {
          // Estimate number of records (in real implementation, query the actual data)
          const estimatedRows = await this.estimateAffectedRows(
            table, 
            relevantColumns, 
            subject_value
          );
          
          if (estimatedRows > 0) {
            locations.push({
              database_name: table.database_name,
              schema_name: table.schema_name,
              table_name: table.table_name,
              columns: relevantColumns.map(c => c.column_name),
              estimated_rows: estimatedRows
            });
          }
        }
      }

      return locations;
    } catch (error) {
      logger.error('Failed to discover data locations', { error, subject_type, subject_value });
      return [];
    }
  }

  /**
   * Identify columns that contain subject data
   */
  private identifySubjectColumns(
    columns: Array<{ column_name: string; data_type: string }>,
    subject_type: string
  ): Array<{ column_name: string; data_type: string }> {
    const subjectPatterns: Record<string, string[]> = {
      'user_id': ['user_id', 'id', 'customer_id', 'account_id', 'member_id'],
      'email': ['email', 'email_address', 'user_email', 'contact_email'],
      'customer_id': ['customer_id', 'client_id', 'account_id', 'user_id'],
      'phone': ['phone', 'phone_number', 'mobile', 'telephone', 'cell_phone'],
      'name': ['name', 'first_name', 'last_name', 'full_name', 'username']
    };

    const patterns = subjectPatterns[subject_type] || [subject_type];
    const matchedColumns: Array<{ column_name: string; data_type: string }> = [];

    for (const column of columns) {
      const columnName = column.column_name.toLowerCase();
      
      for (const pattern of patterns) {
        if (columnName === pattern.toLowerCase() || columnName.includes(pattern.toLowerCase())) {
          matchedColumns.push(column);
          break;
        }
      }
    }

    return matchedColumns;
  }

  /**
   * Estimate number of affected rows
   */
  private async estimateAffectedRows(
    table: { database_name: string; schema_name: string; table_name: string },
    relevantColumns: Array<{ column_name: string }>,
    subject_value: string
  ): Promise<number> {
    // In real implementation, this would query Snowflake to count matching records
    // For now, return a mock estimate based on table patterns
    
    const tableName = table.table_name.toLowerCase();
    
    if (tableName.includes('user') || tableName.includes('customer') || tableName.includes('profile')) {
      return 1; // Primary subject tables typically have 1 record
    }
    
    if (tableName.includes('order') || tableName.includes('transaction') || tableName.includes('purchase')) {
      return Math.floor(Math.random() * 50) + 1; // Order-related tables can have multiple records
    }
    
    if (tableName.includes('log') || tableName.includes('audit') || tableName.includes('event')) {
      return Math.floor(Math.random() * 500) + 1; // Log tables can have many records
    }
    
    return Math.floor(Math.random() * 10) + 1; // Default estimate
  }

  /**
   * Analyze dependencies between tables to determine deletion order
   */
  private async analyzeDependencies(
    tables: Array<{
      database_name: string;
      schema_name: string;
      table_name: string;
      columns: string[];
      estimated_rows: number;
    }>
  ): Promise<Array<{
    database_name: string;
    schema_name: string;
    table_name: string;
    columns: string[];
    estimated_rows: number;
    dependencies: string[];
    deletion_order: number;
  }>> {
    const tablesWithDeps = [];
    
    for (const table of tables) {
      try {
        // Get foreign key dependencies
        const dependencies = await runPostgresQuery<{
          referenced_table_name: string;
        }>(`
          SELECT DISTINCT referenced_table_name
          FROM catalog_foreign_keys
          WHERE database_name = $1 AND schema_name = $2 AND table_name = $3
        `, [table.database_name, table.schema_name, table.table_name]);

        tablesWithDeps.push({
          ...table,
          dependencies: dependencies.map(dep => dep.referenced_table_name),
          deletion_order: 0 // Will be calculated
        });
      } catch (error) {
        logger.warn('Failed to analyze dependencies for table', {
          error,
          table: `${table.database_name}.${table.schema_name}.${table.table_name}`
        });
        
        tablesWithDeps.push({
          ...table,
          dependencies: [],
          deletion_order: 0
        });
      }
    }

    // Calculate deletion order (tables with no dependencies first)
    return this.calculateDeletionOrder(tablesWithDeps);
  }

  /**
   * Calculate optimal deletion order based on dependencies
   */
  private calculateDeletionOrder<T extends { table_name: string; dependencies: string[] }>(
    tables: T[]
  ): Array<T & { deletion_order: number }> {
    const tableMap = new Map(tables.map(table => [table.table_name, table]));
    const ordered: Array<T & { deletion_order: number }> = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (tableName: string): void => {
      if (visited.has(tableName)) return;
      if (visiting.has(tableName)) {
        logger.warn('Circular dependency detected', { table: tableName });
        return;
      }
      
      const table = tableMap.get(tableName);
      if (!table) return;
      
      visiting.add(tableName);
      
      // Visit dependencies first
      for (const dep of table.dependencies) {
        if (tableMap.has(dep)) {
          visit(dep);
        }
      }
      
      visiting.delete(tableName);
      visited.add(tableName);
      
      ordered.push({ ...table, deletion_order: ordered.length + 1 });
    };
    
    // Visit all tables
    for (const table of tables) {
      visit(table.table_name);
    }
    
    // Add any remaining tables (shouldn't happen with correct logic)
    for (const table of tables) {
      if (!visited.has(table.table_name)) {
        ordered.push({ ...table, deletion_order: ordered.length + 1 });
      }
    }
    
    return ordered.reverse(); // Reverse for proper deletion order
  }

  /**
   * Check if a table is critical for business operations
   */
  private isCriticalTable(tableName: string): boolean {
    const criticalPatterns = [
      'payment', 'billing', 'invoice', 'financial',
      'audit', 'compliance', 'legal',
      'system', 'config', 'admin'
    ];
    
    const lowerTableName = tableName.toLowerCase();
    return criticalPatterns.some(pattern => lowerTableName.includes(pattern));
  }

  /**
   * Process deletion request
   */
  private async processDeletionRequest(requestId: number): Promise<void> {
    try {
      // Update status to processing
      await runPostgresQuery(`
        UPDATE gdpr_requests 
        SET status = 'processing', updated_at = NOW()
        WHERE id = $1
      `, [requestId]);

      const [request] = await runPostgresQuery<GDPRRequest>(
        'SELECT * FROM gdpr_requests WHERE id = $1',
        [requestId]
      );

      if (!request) {
        throw new Error(`Request ${requestId} not found`);
      }

      const metadata = JSON.parse(request.metadata as string || '{}');
      const plan: DeletionPlan = metadata.deletion_plan;
      const options: DeletionOptions = metadata.options || {};

      // Create request items for each table
      const requestItems: GDPRRequestItem[] = [];
      for (const table of plan.tables_to_process) {
        const item = await this.createDeletionItem(
          requestId,
          table.database_name,
          table.schema_name,
          table.table_name,
          table.columns,
          table.estimated_rows
        );
        requestItems.push(item);
      }

      // Process deletions in order
      let totalDeletedRows = 0;
      for (const item of requestItems.sort((a, b) => (a.id || 0) - (b.id || 0))) {
        const deletedRows = await this.processDeleteItem(item, request, options);
        totalDeletedRows += deletedRows;
      }

      // Update request as completed
      await runPostgresQuery(`
        UPDATE gdpr_requests 
        SET status = 'completed', 
            completed_at = NOW(), 
            updated_at = NOW(),
            metadata = $2
        WHERE id = $1
      `, [requestId, JSON.stringify({
        ...metadata,
        deletion_summary: {
          total_deleted_rows: totalDeletedRows,
          completed_at: new Date().toISOString()
        }
      })]);

      logger.info('GDPR deletion request completed', { 
        request_id: requestId, 
        total_deleted_rows: totalDeletedRows 
      });

    } catch (error) {
      logger.error('GDPR deletion request processing failed', { error, request_id: requestId });
      
      await runPostgresQuery(`
        UPDATE gdpr_requests 
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1
      `, [requestId]);
    }
  }

  /**
   * Create a deletion item for a table
   */
  private async createDeletionItem(
    requestId: number,
    database_name: string,
    schema_name: string,
    table_name: string,
    columns: string[],
    estimatedRows: number
  ): Promise<GDPRRequestItem> {
    const [item] = await runPostgresQuery<GDPRRequestItem>(`
      INSERT INTO gdpr_request_items 
      (request_id, database_name, schema_name, table_name, column_name, affected_rows)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [requestId, database_name, schema_name, table_name, columns.join(','), estimatedRows]);

    return item;
  }

  /**
   * Process deletion for a single table
   */
  private async processDeleteItem(
    item: GDPRRequestItem,
    request: GDPRRequest,
    options: DeletionOptions
  ): Promise<number> {
    try {
      await runPostgresQuery(`
        UPDATE gdpr_request_items
        SET status = 'processing'
        WHERE id = $1
      `, [item.id]);

      // In real implementation, this would execute actual deletion queries
      const deletedRows = await this.simulateDataDeletion(item, request, options);
      
      await runPostgresQuery(`
        UPDATE gdpr_request_items
        SET status = 'completed', 
            affected_rows = $2,
            result_data = $3,
            processed_at = NOW()
        WHERE id = $1
      `, [item.id, deletedRows, JSON.stringify({ 
        deleted_rows: deletedRows,
        deletion_type: options.soft_delete ? 'soft' : 'hard'
      })]);

      logger.info('Table deletion completed', {
        table: `${item.database_name}.${item.schema_name}.${item.table_name}`,
        deleted_rows: deletedRows
      });

      return deletedRows;

    } catch (error) {
      logger.error('Failed to process delete item', { error, item_id: item.id });
      
      await runPostgresQuery(`
        UPDATE gdpr_request_items
        SET status = 'failed',
            error_message = $2,
            processed_at = NOW()
        WHERE id = $1
      `, [item.id, error instanceof Error ? error.message : String(error)]);

      return 0;
    }
  }

  /**
   * Simulate data deletion (in real implementation, would execute actual SQL)
   */
  private async simulateDataDeletion(
    item: GDPRRequestItem,
    request: GDPRRequest,
    options: DeletionOptions
  ): Promise<number> {
    logger.info('Simulating data deletion', {
      table: `${item.database_name}.${item.schema_name}.${item.table_name}`,
      subject_type: request.subject_type,
      subject_value: request.subject_value,
      soft_delete: options.soft_delete,
      cascade_delete: options.cascade_delete
    });

    // Return the estimated rows as "deleted"
    return item.affected_rows || 0;
  }

  /**
   * Approve a deletion request
   */
  async approveDeletionRequest(requestId: number, approvedBy: number): Promise<void> {
    const [request] = await runPostgresQuery<GDPRRequest>(
      'SELECT * FROM gdpr_requests WHERE id = $1 AND type = $2',
      [requestId, 'delete']
    );

    if (!request) {
      throw new Error(`Deletion request ${requestId} not found`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot approve request with status: ${request.status}`);
    }

    await runPostgresQuery(`
      UPDATE gdpr_requests 
      SET assigned_to = $2, updated_at = NOW()
      WHERE id = $1
    `, [requestId, approvedBy]);

    logger.info('Deletion request approved', { request_id: requestId, approved_by: approvedBy });

    // Start processing the approved request
    this.processDeletionRequest(requestId).catch(error => {
      logger.error('Approved deletion request processing failed', { error, request_id: requestId });
    });
  }

  /**
   * Reject a deletion request
   */
  async rejectDeletionRequest(
    requestId: number, 
    rejectedBy: number, 
    reason: string
  ): Promise<void> {
    await runPostgresQuery(`
      UPDATE gdpr_requests 
      SET status = 'failed', 
          assigned_to = $2, 
          reason = $3, 
          updated_at = NOW()
      WHERE id = $1
    `, [requestId, rejectedBy, reason]);

    logger.info('Deletion request rejected', { request_id: requestId, rejected_by: rejectedBy, reason });
  }

  /**
   * Get deletion request with detailed status
   */
  async getDeletionStatus(requestId: number): Promise<{
    request: GDPRRequest;
    items: GDPRRequestItem[];
    plan?: DeletionPlan;
    progress: {
      total_items: number;
      completed_items: number;
      failed_items: number;
      total_deleted_rows: number;
      percentage: number;
    };
  }> {
    const [request] = await runPostgresQuery<GDPRRequest>(
      'SELECT * FROM gdpr_requests WHERE id = $1 AND type = $2',
      [requestId, 'delete']
    );

    if (!request) {
      throw new Error(`Deletion request ${requestId} not found`);
    }

    const items = await runPostgresQuery<GDPRRequestItem>(
      'SELECT * FROM gdpr_request_items WHERE request_id = $1 ORDER BY created_at',
      [requestId]
    );

    const metadata = JSON.parse(request.metadata as string || '{}');
    const plan = metadata.deletion_plan;

    const totalItems = items.length;
    const completedItems = items.filter(item => item.status === 'completed').length;
    const failedItems = items.filter(item => item.status === 'failed').length;
    const totalDeletedRows = items
      .filter(item => item.status === 'completed')
      .reduce((sum, item) => sum + (item.affected_rows || 0), 0);
    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return {
      request,
      items,
      plan,
      progress: {
        total_items: totalItems,
        completed_items: completedItems,
        failed_items: failedItems,
        total_deleted_rows: totalDeletedRows,
        percentage
      }
    };
  }
}