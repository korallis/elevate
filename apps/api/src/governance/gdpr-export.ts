import { runPostgresQuery } from '../postgres.js';
import { discovery } from '../snowflake.js';
import { logger } from '../logger.js';
import type { GDPRRequest, GDPRRequestItem, GDPRExportResult } from './types.js';

interface ExportOptions {
  format: 'json' | 'csv' | 'parquet';
  include_metadata: boolean;
  compress: boolean;
  chunk_size?: number;
}

export class GDPRExporter {
  /**
   * Create a new GDPR export request
   */
  async createExportRequest(
    subject_type: string,
    subject_value: string,
    requested_by: number,
    reason?: string,
    metadata?: Record<string, unknown>
  ): Promise<GDPRRequest> {
    try {
      const [request] = await runPostgresQuery<GDPRRequest>(`
        INSERT INTO gdpr_requests (type, subject_type, subject_value, reason, metadata, requested_by, updated_at)
        VALUES ('export', $1, $2, $3, $4, $5, NOW())
        RETURNING *
      `, [subject_type, subject_value, reason, metadata ? JSON.stringify(metadata) : null, requested_by]);

      logger.info('GDPR export request created', {
        request_id: request.id,
        subject_type,
        subject_value,
        requested_by
      });

      // Start the export process asynchronously
      this.processExportRequest(request.id).catch(error => {
        logger.error('Export request processing failed', { error, request_id: request.id });
      });

      return request;
    } catch (error) {
      logger.error('Failed to create GDPR export request', { error, subject_type, subject_value });
      throw error;
    }
  }

  /**
   * Process GDPR export request
   */
  private async processExportRequest(requestId: number): Promise<void> {
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

      // Discover tables that might contain the subject's data
      const relevantTables = await this.discoverRelevantTables(request.subject_type, request.subject_value);
      
      // Create request items for each table
      const requestItems: GDPRRequestItem[] = [];
      for (const table of relevantTables) {
        const item = await this.createRequestItem(
          requestId,
          table.database_name,
          table.schema_name,
          table.table_name,
          table.columns
        );
        requestItems.push(item);
      }

      // Process each request item
      const exportResults: any[] = [];
      for (const item of requestItems) {
        const result = await this.processRequestItem(item, request);
        exportResults.push(result);
      }

      // Compile final export
      const exportResult = await this.compileExport(exportResults, {
        format: 'json',
        include_metadata: true,
        compress: false
      });

      // Update request as completed
      await runPostgresQuery(`
        UPDATE gdpr_requests 
        SET status = 'completed', completed_at = NOW(), updated_at = NOW(), metadata = $2
        WHERE id = $1
      `, [requestId, JSON.stringify(exportResult)]);

      logger.info('GDPR export request completed', { request_id: requestId });

    } catch (error) {
      logger.error('GDPR export request processing failed', { error, request_id: requestId });
      
      await runPostgresQuery(`
        UPDATE gdpr_requests 
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1
      `, [requestId]);
    }
  }

  /**
   * Discover tables that might contain subject data
   */
  private async discoverRelevantTables(
    subject_type: string,
    subject_value: string
  ): Promise<Array<{
    database_name: string;
    schema_name: string;
    table_name: string;
    columns: string[];
    confidence: number;
  }>> {
    const relevantTables: Array<{
      database_name: string;
      schema_name: string;
      table_name: string;
      columns: string[];
      confidence: number;
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
        ORDER BY database_name, schema_name, table_name
      `);

      // Check each table for relevant columns
      for (const table of tables) {
        const columns = await runPostgresQuery<{
          column_name: string;
          data_type: string;
        }>(`
          SELECT column_name, data_type
          FROM catalog_columns
          WHERE database_name = $1 AND schema_name = $2 AND table_name = $3
        `, [table.database_name, table.schema_name, table.table_name]);

        const relevantColumns = this.identifyRelevantColumns(columns, subject_type);
        
        if (relevantColumns.length > 0) {
          // Calculate confidence based on column matches and naming patterns
          const confidence = this.calculateTableRelevance(table, relevantColumns, subject_type);
          
          relevantTables.push({
            database_name: table.database_name,
            schema_name: table.schema_name,
            table_name: table.table_name,
            columns: relevantColumns.map(c => c.column_name),
            confidence
          });
        }
      }

      // Sort by confidence and return top matches
      return relevantTables
        .sort((a, b) => b.confidence - a.confidence)
        .filter(table => table.confidence > 0.3); // Only include likely matches

    } catch (error) {
      logger.error('Failed to discover relevant tables', { error, subject_type });
      return [];
    }
  }

  /**
   * Identify columns that might contain subject data
   */
  private identifyRelevantColumns(
    columns: Array<{ column_name: string; data_type: string }>,
    subject_type: string
  ): Array<{ column_name: string; data_type: string; relevance: number }> {
    const relevantColumns: Array<{ column_name: string; data_type: string; relevance: number }> = [];
    
    const subjectPatterns: Record<string, string[]> = {
      'user_id': ['user_id', 'id', 'customer_id', 'account_id'],
      'email': ['email', 'email_address', 'user_email', 'contact_email'],
      'customer_id': ['customer_id', 'client_id', 'account_id', 'user_id'],
      'phone': ['phone', 'phone_number', 'mobile', 'telephone'],
      'name': ['name', 'first_name', 'last_name', 'full_name', 'username']
    };

    const patterns = subjectPatterns[subject_type] || [subject_type];
    
    for (const column of columns) {
      const columnName = column.column_name.toLowerCase();
      
      for (const pattern of patterns) {
        if (columnName.includes(pattern.toLowerCase())) {
          let relevance = 0.8;
          
          // Exact match gets higher relevance
          if (columnName === pattern.toLowerCase()) {
            relevance = 1.0;
          }
          // Partial match with suffix/prefix
          else if (columnName.startsWith(pattern.toLowerCase()) || columnName.endsWith(pattern.toLowerCase())) {
            relevance = 0.9;
          }
          
          relevantColumns.push({
            column_name: column.column_name,
            data_type: column.data_type,
            relevance
          });
          break;
        }
      }
    }

    return relevantColumns;
  }

  /**
   * Calculate table relevance score
   */
  private calculateTableRelevance(
    table: { database_name: string; schema_name: string; table_name: string },
    relevantColumns: Array<{ column_name: string; relevance: number }>,
    subject_type: string
  ): number {
    let score = 0;
    
    // Base score from column relevance
    const avgColumnRelevance = relevantColumns.reduce((sum, col) => sum + col.relevance, 0) / relevantColumns.length;
    score += avgColumnRelevance * 0.6;
    
    // Table name patterns
    const tableName = table.table_name.toLowerCase();
    const tablePatterns = ['user', 'customer', 'account', 'profile', 'contact', 'order', 'transaction'];
    
    for (const pattern of tablePatterns) {
      if (tableName.includes(pattern)) {
        score += 0.3;
        break;
      }
    }
    
    // Schema patterns
    const schemaName = table.schema_name.toLowerCase();
    if (schemaName.includes('user') || schemaName.includes('customer') || schemaName.includes('crm')) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Create a request item for a table
   */
  private async createRequestItem(
    requestId: number,
    database_name: string,
    schema_name: string,
    table_name: string,
    columns: string[]
  ): Promise<GDPRRequestItem> {
    const [item] = await runPostgresQuery<GDPRRequestItem>(`
      INSERT INTO gdpr_request_items 
      (request_id, database_name, schema_name, table_name, column_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [requestId, database_name, schema_name, table_name, columns.join(',')]);

    return item;
  }

  /**
   * Process a single request item (export data from one table)
   */
  private async processRequestItem(
    item: GDPRRequestItem,
    request: GDPRRequest
  ): Promise<{ table: string; data: any[]; metadata: any }> {
    try {
      await runPostgresQuery(`
        UPDATE gdpr_request_items
        SET status = 'processing'
        WHERE id = $1
      `, [item.id]);

      // This would typically query Snowflake for the actual data
      // For now, we'll simulate the data export
      const mockData = await this.simulateDataExtraction(item, request);
      
      await runPostgresQuery(`
        UPDATE gdpr_request_items
        SET status = 'completed', 
            affected_rows = $2,
            result_data = $3,
            processed_at = NOW()
        WHERE id = $1
      `, [item.id, mockData.length, JSON.stringify({ row_count: mockData.length })]);

      return {
        table: `${item.database_name}.${item.schema_name}.${item.table_name}`,
        data: mockData,
        metadata: {
          columns: item.column_name?.split(',') || [],
          row_count: mockData.length,
          extracted_at: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Failed to process request item', { error, item_id: item.id });
      
      await runPostgresQuery(`
        UPDATE gdpr_request_items
        SET status = 'failed',
            error_message = $2,
            processed_at = NOW()
        WHERE id = $1
      `, [item.id, error instanceof Error ? error.message : String(error)]);

      throw error;
    }
  }

  /**
   * Simulate data extraction (in real implementation, this would query Snowflake)
   */
  private async simulateDataExtraction(
    item: GDPRRequestItem,
    request: GDPRRequest
  ): Promise<any[]> {
    // In a real implementation, this would:
    // 1. Build SQL query to extract subject's data
    // 2. Execute query against Snowflake
    // 3. Apply any necessary data masking
    // 4. Return the results
    
    logger.info('Simulating data extraction', {
      table: `${item.database_name}.${item.schema_name}.${item.table_name}`,
      subject_type: request.subject_type,
      subject_value: request.subject_value
    });

    // Mock data based on table type
    const tableName = item.table_name.toLowerCase();
    
    if (tableName.includes('user') || tableName.includes('customer')) {
      return [{
        id: request.subject_value,
        created_at: '2023-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
        table_source: `${item.database_name}.${item.schema_name}.${item.table_name}`
      }];
    }
    
    if (tableName.includes('order') || tableName.includes('transaction')) {
      return [
        {
          order_id: 'ORD-001',
          user_id: request.subject_value,
          amount: 99.99,
          created_at: '2024-01-10T14:22:00Z',
          table_source: `${item.database_name}.${item.schema_name}.${item.table_name}`
        },
        {
          order_id: 'ORD-002',
          user_id: request.subject_value,
          amount: 149.99,
          created_at: '2024-02-15T09:15:00Z',
          table_source: `${item.database_name}.${item.schema_name}.${item.table_name}`
        }
      ];
    }

    return [];
  }

  /**
   * Compile export results into final format
   */
  private async compileExport(
    results: any[],
    options: ExportOptions
  ): Promise<GDPRExportResult> {
    const totalRecords = results.reduce((sum, result) => sum + result.data.length, 0);
    const exportedTables = results.map(result => result.table);
    
    let compiledData: any;
    
    switch (options.format) {
      case 'json':
        compiledData = {
          export_metadata: {
            exported_at: new Date().toISOString(),
            format: 'json',
            total_records: totalRecords,
            tables: exportedTables.length
          },
          data: results.reduce((acc, result) => {
            acc[result.table] = result.data;
            return acc;
          }, {} as Record<string, any[]>)
        };
        break;
        
      case 'csv':
        compiledData = this.convertToCSV(results);
        break;
        
      case 'parquet':
        // Parquet conversion would require additional library
        compiledData = { error: 'Parquet format not yet implemented' };
        break;
        
      default:
        compiledData = results;
    }

    const exportSize = JSON.stringify(compiledData).length;

    return {
      request_id: 0, // Will be set by caller
      total_records: totalRecords,
      exported_tables: exportedTables,
      export_file_size: exportSize,
      export_format: options.format,
      completed_at: new Date().toISOString()
    };
  }

  /**
   * Convert results to CSV format
   */
  private convertToCSV(results: any[]): string {
    const csvLines: string[] = [];
    
    for (const result of results) {
      if (result.data.length === 0) continue;
      
      // Add table header
      csvLines.push(`\n# Table: ${result.table}`);
      
      // Add CSV header
      const headers = Object.keys(result.data[0]);
      csvLines.push(headers.join(','));
      
      // Add data rows
      for (const row of result.data) {
        const values = headers.map(header => {
          const value = row[header];
          // Escape commas and quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value || '');
        });
        csvLines.push(values.join(','));
      }
    }
    
    return csvLines.join('\n');
  }

  /**
   * Get export request status
   */
  async getExportStatus(requestId: number): Promise<{
    request: GDPRRequest;
    items: GDPRRequestItem[];
    progress: {
      total_items: number;
      completed_items: number;
      failed_items: number;
      percentage: number;
    };
  }> {
    const [request] = await runPostgresQuery<GDPRRequest>(
      'SELECT * FROM gdpr_requests WHERE id = $1',
      [requestId]
    );

    if (!request) {
      throw new Error(`Export request ${requestId} not found`);
    }

    const items = await runPostgresQuery<GDPRRequestItem>(
      'SELECT * FROM gdpr_request_items WHERE request_id = $1 ORDER BY created_at',
      [requestId]
    );

    const totalItems = items.length;
    const completedItems = items.filter(item => item.status === 'completed').length;
    const failedItems = items.filter(item => item.status === 'failed').length;
    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return {
      request,
      items,
      progress: {
        total_items: totalItems,
        completed_items: completedItems,
        failed_items: failedItems,
        percentage
      }
    };
  }

  /**
   * Get all export requests with optional filtering
   */
  async getExportRequests(filters: {
    status?: string;
    subject_type?: string;
    requested_by?: number;
    limit?: number;
  } = {}): Promise<GDPRRequest[]> {
    let query = `
      SELECT * FROM gdpr_requests 
      WHERE type = 'export'
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.subject_type) {
      query += ` AND subject_type = $${paramIndex++}`;
      params.push(filters.subject_type);
    }

    if (filters.requested_by) {
      query += ` AND requested_by = $${paramIndex++}`;
      params.push(filters.requested_by);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
    }

    return runPostgresQuery<GDPRRequest>(query, params);
  }

  /**
   * Cancel an export request
   */
  async cancelExportRequest(requestId: number, cancelledBy?: number): Promise<void> {
    const [request] = await runPostgresQuery<GDPRRequest>(
      'SELECT status FROM gdpr_requests WHERE id = $1',
      [requestId]
    );

    if (!request) {
      throw new Error(`Export request ${requestId} not found`);
    }

    if (request.status === 'completed') {
      throw new Error('Cannot cancel completed export request');
    }

    await runPostgresQuery(`
      UPDATE gdpr_requests 
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
    `, [requestId]);

    // Cancel pending items
    await runPostgresQuery(`
      UPDATE gdpr_request_items 
      SET status = 'cancelled'
      WHERE request_id = $1 AND status = 'pending'
    `, [requestId]);

    logger.info('Export request cancelled', { request_id: requestId, cancelled_by: cancelledBy });
  }
}