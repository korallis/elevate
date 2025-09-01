import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';
import type { PIIDetectionRule, PIIDetectionResult, PIIScanOptions, PIIScanResult, PIIColumn } from './types.js';

interface ColumnInfo {
  database_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  data_type: string;
}

interface SampleData {
  column_name: string;
  sample_values: (string | null)[];
}

export class PIIDetector {
  private detectionRules: PIIDetectionRule[] = [];

  async initialize(): Promise<void> {
    await this.loadDetectionRules();
  }

  private async loadDetectionRules(): Promise<void> {
    try {
      this.detectionRules = await runPostgresQuery<PIIDetectionRule>(
        'SELECT * FROM pii_detection_rules WHERE enabled = true ORDER BY confidence DESC'
      );
      logger.info(`Loaded ${this.detectionRules.length} PII detection rules`);
    } catch (error) {
      logger.error('Failed to load PII detection rules', { error });
      throw error;
    }
  }

  async scanForPII(options: PIIScanOptions): Promise<PIIScanResult> {
    const startTime = Date.now();
    logger.info('Starting PII scan', options);

    try {
      // Get columns to scan
      const columns = await this.getColumnsToScan(options);
      logger.info(`Scanning ${columns.length} columns for PII`);

      const results: PIIDetectionResult[] = [];
      let totalTables = 0;
      const processedTables = new Set<string>();

      for (const column of columns) {
        const tableKey = `${column.database_name}.${column.schema_name}.${column.table_name}`;
        if (!processedTables.has(tableKey)) {
          processedTables.add(tableKey);
          totalTables++;
        }

        const detectionResult = await this.analyzeColumn(column, options);
        if (detectionResult) {
          results.push(detectionResult);
        }
      }

      const scanDuration = Date.now() - startTime;
      
      const scanResult: PIIScanResult = {
        total_tables: totalTables,
        total_columns: columns.length,
        pii_columns_found: results.length,
        scan_duration_ms: scanDuration,
        results
      };

      logger.info('PII scan completed', {
        ...scanResult,
        duration_ms: scanDuration
      });

      return scanResult;
    } catch (error) {
      logger.error('PII scan failed', { error, options });
      throw error;
    }
  }

  private async getColumnsToScan(options: PIIScanOptions): Promise<ColumnInfo[]> {
    let query = `
      SELECT database_name, schema_name, table_name, column_name, data_type
      FROM catalog_columns 
      WHERE database_name = $1 AND schema_name = $2
    `;
    const params: string[] = [options.database_name, options.schema_name];

    if (options.table_name) {
      query += ' AND table_name = $3';
      params.push(options.table_name);
    }

    query += ' ORDER BY table_name, column_name';

    return runPostgresQuery<ColumnInfo>(query, params);
  }

  private async analyzeColumn(
    column: ColumnInfo, 
    options: PIIScanOptions
  ): Promise<PIIDetectionResult | null> {
    // First, check column name patterns
    const nameBasedDetection = this.detectPIIByName(column);
    
    // Then, check data samples if available and confidence is below threshold
    let contentBasedDetection = null;
    if (!nameBasedDetection || (nameBasedDetection.confidence < (options.confidence_threshold || 0.8))) {
      contentBasedDetection = await this.detectPIIByContent(column, options.sample_size || 100);
    }

    // Use the detection with higher confidence
    const finalDetection = this.selectBestDetection(nameBasedDetection, contentBasedDetection);
    
    if (finalDetection && finalDetection.confidence >= (options.confidence_threshold || 0.7)) {
      return finalDetection;
    }

    return null;
  }

  private detectPIIByName(column: ColumnInfo): PIIDetectionResult | null {
    const columnName = column.column_name.toLowerCase();
    
    for (const rule of this.detectionRules) {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(columnName)) {
        return {
          database_name: column.database_name,
          schema_name: column.schema_name,
          table_name: column.table_name,
          column_name: column.column_name,
          detected_type: rule.pii_type,
          confidence: rule.confidence,
          rule_matched: rule.pattern
        };
      }
    }

    return null;
  }

  private async detectPIIByContent(
    column: ColumnInfo, 
    sampleSize: number
  ): Promise<PIIDetectionResult | null> {
    try {
      // This is a simplified content-based detection
      // In a real implementation, you would sample data from Snowflake
      // For now, we'll use data type patterns
      
      const dataTypePatterns = this.getDataTypePatterns();
      const dataType = column.data_type.toLowerCase();
      
      for (const [pattern, piiType, confidence] of dataTypePatterns) {
        if (dataType.includes(pattern)) {
          return {
            database_name: column.database_name,
            schema_name: column.schema_name,
            table_name: column.table_name,
            column_name: column.column_name,
            detected_type: piiType,
            confidence: confidence * 0.6, // Lower confidence for data type only
            rule_matched: `data_type:${pattern}`
          };
        }
      }

      return null;
    } catch (error) {
      logger.warn('Content-based PII detection failed', { 
        column: `${column.database_name}.${column.schema_name}.${column.table_name}.${column.column_name}`,
        error 
      });
      return null;
    }
  }

  private getDataTypePatterns(): [string, string, number][] {
    return [
      ['varchar(255)', 'email', 0.7],
      ['varchar(320)', 'email', 0.8],
      ['char(11)', 'ssn', 0.8],
      ['varchar(20)', 'phone', 0.6],
      ['varchar(50)', 'name', 0.5],
      ['text', 'address', 0.4],
      ['varchar(16)', 'credit_card', 0.7],
      ['date', 'date_of_birth', 0.3]
    ];
  }

  private selectBestDetection(
    nameDetection: PIIDetectionResult | null,
    contentDetection: PIIDetectionResult | null
  ): PIIDetectionResult | null {
    if (!nameDetection && !contentDetection) return null;
    if (!nameDetection) return contentDetection;
    if (!contentDetection) return nameDetection;
    
    return nameDetection.confidence >= contentDetection.confidence 
      ? nameDetection 
      : contentDetection;
  }

  async tagPIIColumn(
    database_name: string,
    schema_name: string,
    table_name: string,
    column_name: string,
    pii_type: string,
    masking_rule: string | null = null,
    confidence: number | null = null,
    auto_detected = false
  ): Promise<PIIColumn> {
    try {
      const [result] = await runPostgresQuery<PIIColumn>(`
        INSERT INTO pii_columns 
        (database_name, schema_name, table_name, column_name, pii_type, masking_rule, confidence, auto_detected, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (database_name, schema_name, table_name, column_name)
        DO UPDATE SET 
          pii_type = EXCLUDED.pii_type,
          masking_rule = EXCLUDED.masking_rule,
          confidence = EXCLUDED.confidence,
          auto_detected = EXCLUDED.auto_detected,
          updated_at = NOW()
        RETURNING *
      `, [database_name, schema_name, table_name, column_name, pii_type, masking_rule, confidence, auto_detected]);

      // Also update the legacy catalog_pii table for backward compatibility
      await runPostgresQuery(`
        INSERT INTO catalog_pii (database_name, schema_name, table_name, column_name, tag, masking)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (database_name, schema_name, table_name, column_name)
        DO UPDATE SET tag = EXCLUDED.tag, masking = EXCLUDED.masking
      `, [database_name, schema_name, table_name, column_name, pii_type, masking_rule]);

      logger.info('PII column tagged', {
        database_name,
        schema_name,
        table_name,
        column_name,
        pii_type,
        masking_rule,
        auto_detected
      });

      return result;
    } catch (error) {
      logger.error('Failed to tag PII column', { 
        database_name,
        schema_name, 
        table_name,
        column_name,
        pii_type,
        error 
      });
      throw error;
    }
  }

  async bulkTagPIIColumns(detectionResults: PIIDetectionResult[]): Promise<PIIColumn[]> {
    const results: PIIColumn[] = [];
    
    for (const detection of detectionResults) {
      const tagged = await this.tagPIIColumn(
        detection.database_name,
        detection.schema_name,
        detection.table_name,
        detection.column_name,
        detection.detected_type,
        null, // No masking rule assigned automatically
        detection.confidence,
        true // Mark as auto-detected
      );
      results.push(tagged);
    }
    
    return results;
  }

  async getPIIColumns(
    database_name: string,
    schema_name: string,
    table_name?: string
  ): Promise<PIIColumn[]> {
    let query = `
      SELECT * FROM pii_columns 
      WHERE database_name = $1 AND schema_name = $2
    `;
    const params: string[] = [database_name, schema_name];

    if (table_name) {
      query += ' AND table_name = $3';
      params.push(table_name);
    }

    query += ' ORDER BY table_name, column_name';

    return runPostgresQuery<PIIColumn>(query, params);
  }

  async reviewPIIColumn(
    id: number,
    reviewed_by: string,
    approved = true
  ): Promise<PIIColumn> {
    const [result] = await runPostgresQuery<PIIColumn>(`
      UPDATE pii_columns 
      SET reviewed = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, approved, reviewed_by]);

    logger.info('PII column reviewed', { id, reviewed_by, approved });
    return result;
  }

  async getDetectionStatistics(
    database_name: string,
    schema_name: string
  ): Promise<{
    total_columns: number;
    pii_columns: number;
    auto_detected: number;
    reviewed: number;
    by_type: Record<string, number>;
  }> {
    const [stats] = await runPostgresQuery<{
      total_columns: number;
      pii_columns: number;
      auto_detected: number;
      reviewed: number;
    }>(`
      SELECT 
        (SELECT COUNT(*) FROM catalog_columns WHERE database_name = $1 AND schema_name = $2) as total_columns,
        COUNT(pc.*) as pii_columns,
        COUNT(*) FILTER (WHERE pc.auto_detected = true) as auto_detected,
        COUNT(*) FILTER (WHERE pc.reviewed = true) as reviewed
      FROM pii_columns pc
      WHERE pc.database_name = $1 AND pc.schema_name = $2
    `, [database_name, schema_name]);

    const typeStats = await runPostgresQuery<{ pii_type: string; count: number }>(`
      SELECT pii_type, COUNT(*) as count
      FROM pii_columns
      WHERE database_name = $1 AND schema_name = $2
      GROUP BY pii_type
      ORDER BY count DESC
    `, [database_name, schema_name]);

    const by_type: Record<string, number> = {};
    for (const { pii_type, count } of typeStats) {
      by_type[pii_type] = Number(count);
    }

    return {
      ...stats,
      by_type
    };
  }
}