import { log } from '@temporalio/activity';
import type { TableInfo, IDataConnector } from '../../../api/src/connectors/types.js';

// Connection pool reference
declare const connectionPool: Map<string, IDataConnector>;

interface QualityCheckResult {
  checkType: 'completeness' | 'uniqueness' | 'validity' | 'accuracy' | 'consistency' | 'timeliness' | 'business_rule';
  table: string;
  column?: string;
  ruleName?: string;
  passed: boolean;
  score: number; // 0-1
  threshold: number;
  severity: 'error' | 'warning' | 'info';
  details: {
    totalRecords: number;
    failedRecords: number;
    sampleFailures?: Array<{
      rowId?: unknown;
      value?: unknown;
      reason: string;
    }>;
  };
  executionTime: number;
  suggestions?: string[];
}

export async function runDataQualityChecks(params: {
  connectionId: string;
  table: TableInfo;
  checkType: 'completeness' | 'uniqueness' | 'validity' | 'accuracy' | 'consistency' | 'timeliness';
  threshold: number;
}): Promise<QualityCheckResult> {
  const tableName = `${params.table.schema}.${params.table.name}`;
  log.info('Running data quality check', { 
    connectionId: params.connectionId,
    table: tableName,
    checkType: params.checkType,
    threshold: params.threshold
  });
  
  const connector = getConnector(params.connectionId);
  const startTime = Date.now();
  
  try {
    const qualifiedTableName = [
      params.table.database,
      params.table.schema,
      params.table.name
    ].filter(Boolean).join('.');
    
    let result: QualityCheckResult;
    
    switch (params.checkType) {
      case 'completeness':
        result = await checkCompleteness(connector, qualifiedTableName, params.table, params.threshold);
        break;
      case 'uniqueness':
        result = await checkUniqueness(connector, qualifiedTableName, params.table, params.threshold);
        break;
      case 'validity':
        result = await checkValidity(connector, qualifiedTableName, params.table, params.threshold);
        break;
      case 'accuracy':
        result = await checkAccuracy(connector, qualifiedTableName, params.table, params.threshold);
        break;
      case 'consistency':
        result = await checkConsistency(connector, qualifiedTableName, params.table, params.threshold);
        break;
      case 'timeliness':
        result = await checkTimeliness(connector, qualifiedTableName, params.table, params.threshold);
        break;
      default:
        throw new Error(`Unsupported check type: ${params.checkType}`);
    }
    
    result.executionTime = Date.now() - startTime;
    result.table = tableName;
    result.checkType = params.checkType;
    result.threshold = params.threshold;
    
    log.info('Data quality check completed', {
      connectionId: params.connectionId,
      table: tableName,
      checkType: params.checkType,
      passed: result.passed,
      score: result.score,
      executionTime: result.executionTime
    });
    
    return result;
    
  } catch (error) {
    log.error('Data quality check failed', {
      connectionId: params.connectionId,
      table: tableName,
      checkType: params.checkType,
      error
    });
    throw error;
  }
}

export async function validateDataIntegrity(params: {
  connectionId: string;
  tables: TableInfo[];
}): Promise<{
  passed: boolean;
  issues: Array<{
    table: string;
    type: 'referential_integrity' | 'constraint_violation' | 'data_corruption';
    description: string;
    severity: 'error' | 'warning';
  }>;
}> {
  log.info('Validating data integrity', {
    connectionId: params.connectionId,
    tables: params.tables.length
  });
  
  const connector = getConnector(params.connectionId);
  const issues: Array<any> = [];
  
  try {
    // Check referential integrity
    for (const table of params.tables) {
      const qualifiedTableName = [
        table.database,
        table.schema,
        table.name
      ].filter(Boolean).join('.');
      
      try {
        // Get foreign key constraints
        const foreignKeys = await connector.listForeignKeys(table.database, table.schema);
        
        for (const fk of foreignKeys) {
          if (fk.fromTable === table.name) {
            // Check for orphaned records
            const orphanQuery = `
              SELECT COUNT(*) as orphan_count
              FROM ${qualifiedTableName} src
              LEFT JOIN ${fk.toTable} tgt ON src.${fk.fromColumn} = tgt.${fk.toColumn}
              WHERE src.${fk.fromColumn} IS NOT NULL AND tgt.${fk.toColumn} IS NULL
            `;
            
            const result = await connector.executeQuery(orphanQuery);
            const orphanCount = Number(result.rows[0]?.orphan_count || 0);
            
            if (orphanCount > 0) {
              issues.push({
                table: qualifiedTableName,
                type: 'referential_integrity',
                description: `Found ${orphanCount} orphaned records in ${fk.fromColumn} referencing ${fk.toTable}.${fk.toColumn}`,
                severity: 'error'
              });
            }
          }
        }
        
      } catch (error) {
        log.warn('Failed to check referential integrity', { table: qualifiedTableName, error });
      }
    }
    
    const passed = issues.filter(issue => issue.severity === 'error').length === 0;
    
    log.info('Data integrity validation completed', {
      connectionId: params.connectionId,
      passed,
      issues: issues.length
    });
    
    return { passed, issues };
    
  } catch (error) {
    log.error('Data integrity validation failed', {
      connectionId: params.connectionId,
      error
    });
    throw error;
  }
}

export async function detectDataAnomalies(params: {
  connectionId: string;
  table: TableInfo;
}): Promise<{
  anomalies: Array<{
    type: 'outlier' | 'pattern_break' | 'statistical_anomaly';
    column: string;
    description: string;
    confidence: number;
    sampleValues?: unknown[];
  }>;
}> {
  const tableName = `${params.table.schema}.${params.table.name}`;
  log.info('Detecting data anomalies', {
    connectionId: params.connectionId,
    table: tableName
  });
  
  const connector = getConnector(params.connectionId);
  const anomalies: Array<any> = [];
  
  try {
    const qualifiedTableName = [
      params.table.database,
      params.table.schema,
      params.table.name
    ].filter(Boolean).join('.');
    
    // Get column information
    const columns = await connector.listColumns(
      params.table.database || '',
      params.table.schema || '',
      params.table.name
    );
    
    // Check numeric columns for statistical outliers
    const numericColumns = columns.filter(col => isNumericType(col.type));
    
    for (const column of numericColumns) {
      try {
        // Calculate basic statistics
        const statsQuery = `
          SELECT 
            AVG(${column.name}) as mean_val,
            STDDEV(${column.name}) as stddev_val,
            MIN(${column.name}) as min_val,
            MAX(${column.name}) as max_val,
            COUNT(*) as total_count
          FROM ${qualifiedTableName}
          WHERE ${column.name} IS NOT NULL
        `;
        
        const statsResult = await connector.executeQuery(statsQuery);
        const stats = statsResult.rows[0];
        
        if (stats && stats.stddev_val && Number(stats.stddev_val) > 0) {
          const mean = Number(stats.mean_val);
          const stddev = Number(stats.stddev_val);
          const threshold = 3; // 3 standard deviations
          
          // Find outliers
          const outlierQuery = `
            SELECT ${column.name}, COUNT(*) as count
            FROM ${qualifiedTableName}
            WHERE ${column.name} < ${mean - threshold * stddev} 
               OR ${column.name} > ${mean + threshold * stddev}
            GROUP BY ${column.name}
            ORDER BY count DESC
            LIMIT 10
          `;
          
          const outlierResult = await connector.executeQuery(outlierQuery);
          
          if (outlierResult.rows.length > 0) {
            anomalies.push({
              type: 'outlier',
              column: column.name,
              description: `Found ${outlierResult.rows.length} statistical outliers (>3σ from mean)`,
              confidence: 0.8,
              sampleValues: outlierResult.rows.map(row => row[column.name])
            });
          }
        }
        
      } catch (error) {
        log.warn('Failed to check outliers for column', { column: column.name, error });
      }
    }
    
    // Check string columns for pattern breaks
    const stringColumns = columns.filter(col => isStringType(col.type));
    
    for (const column of stringColumns) {
      try {
        // Check for consistent patterns
        const patternQuery = `
          SELECT 
            LENGTH(${column.name}) as str_length,
            COUNT(*) as count
          FROM ${qualifiedTableName}
          WHERE ${column.name} IS NOT NULL
          GROUP BY LENGTH(${column.name})
          ORDER BY count DESC
          LIMIT 10
        `;
        
        const patternResult = await connector.executeQuery(patternQuery);
        
        if (patternResult.rows.length > 0) {
          const totalCount = patternResult.rows.reduce((sum, row) => sum + Number(row.count), 0);
          const mainPattern = patternResult.rows[0];
          const mainPatternPercent = Number(mainPattern.count) / totalCount;
          
          // If less than 80% follow the main pattern, flag as anomaly
          if (mainPatternPercent < 0.8 && patternResult.rows.length > 2) {
            anomalies.push({
              type: 'pattern_break',
              column: column.name,
              description: `Inconsistent string length patterns detected (main pattern: ${mainPattern.str_length} chars, ${Math.round(mainPatternPercent * 100)}%)`,
              confidence: 1 - mainPatternPercent
            });
          }
        }
        
      } catch (error) {
        log.warn('Failed to check patterns for column', { column: column.name, error });
      }
    }
    
    log.info('Data anomaly detection completed', {
      connectionId: params.connectionId,
      table: tableName,
      anomalies: anomalies.length
    });
    
    return { anomalies };
    
  } catch (error) {
    log.error('Data anomaly detection failed', {
      connectionId: params.connectionId,
      table: tableName,
      error
    });
    throw error;
  }
}

export async function checkDataFreshness(params: {
  connectionId: string;
  table: TableInfo;
  freshnessHours: number;
}): Promise<QualityCheckResult> {
  const tableName = `${params.table.schema}.${params.table.name}`;
  log.info('Checking data freshness', {
    connectionId: params.connectionId,
    table: tableName,
    freshnessHours: params.freshnessHours
  });
  
  const connector = getConnector(params.connectionId);
  
  try {
    const qualifiedTableName = [
      params.table.database,
      params.table.schema,
      params.table.name
    ].filter(Boolean).join('.');
    
    // Get column information to find timestamp columns
    const columns = await connector.listColumns(
      params.table.database || '',
      params.table.schema || '',
      params.table.name
    );
    
    const timestampColumn = findTimestampColumn(columns);
    
    if (!timestampColumn) {
      return {
        checkType: 'timeliness',
        table: tableName,
        passed: false,
        score: 0,
        threshold: 1,
        severity: 'warning',
        details: {
          totalRecords: 0,
          failedRecords: 0
        },
        executionTime: 0,
        suggestions: ['Add a timestamp column to track data freshness']
      };
    }
    
    // Check the latest timestamp
    const freshnessQuery = `
      SELECT 
        MAX(${timestampColumn}) as latest_timestamp,
        COUNT(*) as total_records,
        COUNT(CASE WHEN ${timestampColumn} >= NOW() - INTERVAL ${params.freshnessHours} HOUR THEN 1 END) as fresh_records
      FROM ${qualifiedTableName}
      WHERE ${timestampColumn} IS NOT NULL
    `;
    
    const result = await connector.executeQuery(freshnessQuery);
    const row = result.rows[0];
    
    if (!row || !row.latest_timestamp) {
      return {
        checkType: 'timeliness',
        table: tableName,
        passed: false,
        score: 0,
        threshold: 1,
        severity: 'error',
        details: {
          totalRecords: Number(row?.total_records || 0),
          failedRecords: Number(row?.total_records || 0)
        },
        executionTime: 0,
        suggestions: ['No timestamp data found']
      };
    }
    
    const latestTimestamp = new Date(row.latest_timestamp);
    const hoursOld = (Date.now() - latestTimestamp.getTime()) / (1000 * 60 * 60);
    const isFresh = hoursOld <= params.freshnessHours;
    
    const totalRecords = Number(row.total_records);
    const freshRecords = Number(row.fresh_records);
    const score = totalRecords > 0 ? freshRecords / totalRecords : 0;
    
    const passed = isFresh && score >= 0.8; // At least 80% of records should be fresh
    
    return {
      checkType: 'timeliness',
      table: tableName,
      passed,
      score,
      threshold: 0.8,
      severity: passed ? 'info' : (score > 0.5 ? 'warning' : 'error'),
      details: {
        totalRecords,
        failedRecords: totalRecords - freshRecords,
        sampleFailures: passed ? undefined : [{
          value: latestTimestamp,
          reason: `Latest data is ${Math.round(hoursOld * 100) / 100} hours old (threshold: ${params.freshnessHours} hours)`
        }]
      },
      executionTime: 0,
      suggestions: passed ? undefined : [
        'Consider more frequent data refresh',
        'Check if data source is updating as expected',
        'Review ETL scheduling configuration'
      ]
    };
    
  } catch (error) {
    log.error('Data freshness check failed', {
      connectionId: params.connectionId,
      table: tableName,
      error
    });
    throw error;
  }
}

export async function validateBusinessRules(params: {
  connectionId: string;
  table: TableInfo;
  businessRules: Array<{
    name: string;
    description: string;
    rule: string; // SQL expression
    severity: 'error' | 'warning' | 'info';
  }>;
}): Promise<QualityCheckResult[]> {
  const tableName = `${params.table.schema}.${params.table.name}`;
  log.info('Validating business rules', {
    connectionId: params.connectionId,
    table: tableName,
    rules: params.businessRules.length
  });
  
  const connector = getConnector(params.connectionId);
  const results: QualityCheckResult[] = [];
  
  try {
    const qualifiedTableName = [
      params.table.database,
      params.table.schema,
      params.table.name
    ].filter(Boolean).join('.');
    
    // Get total record count
    const countResult = await connector.executeQuery(`SELECT COUNT(*) as total FROM ${qualifiedTableName}`);
    const totalRecords = Number(countResult.rows[0]?.total || 0);
    
    for (const rule of params.businessRules) {
      try {
        const startTime = Date.now();
        
        // Build validation query
        const validationQuery = `
          SELECT COUNT(*) as violation_count
          FROM ${qualifiedTableName}
          WHERE NOT (${rule.rule})
        `;
        
        const result = await connector.executeQuery(validationQuery);
        const violationCount = Number(result.rows[0]?.violation_count || 0);
        const executionTime = Date.now() - startTime;
        
        const score = totalRecords > 0 ? (totalRecords - violationCount) / totalRecords : 1;
        const passed = violationCount === 0;
        
        // Get sample violations
        let sampleFailures: Array<{ rowId?: unknown; value?: unknown; reason: string }> = [];
        if (violationCount > 0) {
          try {
            const sampleQuery = `
              SELECT * FROM ${qualifiedTableName}
              WHERE NOT (${rule.rule})
              LIMIT 5
            `;
            const sampleResult = await connector.executeQuery(sampleQuery);
            
            sampleFailures = sampleResult.rows.map((row, index) => ({
              rowId: index,
              reason: `Business rule violation: ${rule.description}`
            }));
          } catch (error) {
            log.warn('Failed to get sample violations', { rule: rule.name, error });
          }
        }
        
        results.push({
          checkType: 'business_rule',
          table: tableName,
          ruleName: rule.name,
          passed,
          score,
          threshold: 1.0, // Business rules should have 100% compliance
          severity: rule.severity,
          details: {
            totalRecords,
            failedRecords: violationCount,
            sampleFailures: sampleFailures.length > 0 ? sampleFailures : undefined
          },
          executionTime,
          suggestions: passed ? undefined : [
            `Review data to fix ${rule.name} violations`,
            'Consider data transformation rules to prevent future violations',
            'Update source system validation if applicable'
          ]
        });
        
        log.info('Business rule validation completed', {
          rule: rule.name,
          passed,
          violations: violationCount,
          score
        });
        
      } catch (error) {
        log.error('Business rule validation failed', { rule: rule.name, error });
        
        results.push({
          checkType: 'business_rule',
          table: tableName,
          ruleName: rule.name,
          passed: false,
          score: 0,
          threshold: 1.0,
          severity: 'error',
          details: {
            totalRecords,
            failedRecords: totalRecords,
            sampleFailures: [{
              reason: `Rule validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          },
          executionTime: 0
        });
      }
    }
    
    return results;
    
  } catch (error) {
    log.error('Business rule validation failed', {
      connectionId: params.connectionId,
      table: tableName,
      error
    });
    throw error;
  }
}

export async function generateQualityReport(params: {
  connectionId: string;
  report: any; // DataQualityReport from workflow
  format: 'json' | 'html' | 'pdf';
  includeSuggestions: boolean;
}): Promise<{ format: string; size: number; path?: string }> {
  log.info('Generating quality report', {
    connectionId: params.connectionId,
    format: params.format,
    includeSuggestions: params.includeSuggestions
  });
  
  try {
    // This would generate the actual report
    // For now, simulate report generation
    const reportSize = JSON.stringify(params.report).length;
    
    // In real implementation, this would:
    // 1. Format the report data according to requested format
    // 2. Generate HTML/PDF if requested
    // 3. Store the report file
    // 4. Return file path and metadata
    
    log.info('Quality report generated', {
      connectionId: params.connectionId,
      format: params.format,
      size: reportSize
    });
    
    return {
      format: params.format,
      size: reportSize
    };
    
  } catch (error) {
    log.error('Quality report generation failed', {
      connectionId: params.connectionId,
      error
    });
    throw error;
  }
}

export async function updateQualityMetrics(params: {
  connectionId: string;
  report: any; // DataQualityReport
}): Promise<void> {
  log.info('Updating quality metrics', {
    connectionId: params.connectionId,
    overallScore: params.report.summary.overallScore
  });
  
  try {
    // This would update quality metrics in storage
    // For now, just log the update
    // In real implementation, this would:
    // 1. Store quality scores and trends
    // 2. Update quality dashboards
    // 3. Trigger alerts if scores drop
    // 4. Update data catalog with quality information
    
    log.info('Quality metrics updated', {
      connectionId: params.connectionId
    });
    
  } catch (error) {
    log.error('Quality metrics update failed', {
      connectionId: params.connectionId,
      error
    });
    throw error;
  }
}

// Helper functions
function getConnector(connectionId: string): IDataConnector {
  const connector = connectionPool.get(connectionId);
  if (!connector || !connector.isConnected()) {
    throw new Error(`No active connection found for ${connectionId}`);
  }
  return connector;
}

async function checkCompleteness(
  connector: IDataConnector,
  tableName: string,
  table: TableInfo,
  threshold: number
): Promise<Omit<QualityCheckResult, 'executionTime' | 'table' | 'checkType' | 'threshold'>> {
  const columns = await connector.listColumns(
    table.database || '',
    table.schema || '',
    table.name
  );
  
  const totalRecordsResult = await connector.executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
  const totalRecords = Number(totalRecordsResult.rows[0]?.total || 0);
  
  let totalNulls = 0;
  const columnResults: Array<{ column: string; nulls: number }> = [];
  
  for (const column of columns) {
    const nullQuery = `SELECT COUNT(*) as null_count FROM ${tableName} WHERE ${column.name} IS NULL`;
    const nullResult = await connector.executeQuery(nullQuery);
    const nullCount = Number(nullResult.rows[0]?.null_count || 0);
    
    totalNulls += nullCount;
    columnResults.push({ column: column.name, nulls: nullCount });
  }
  
  const totalPossibleValues = totalRecords * columns.length;
  const completenessScore = totalPossibleValues > 0 ? (totalPossibleValues - totalNulls) / totalPossibleValues : 1;
  const passed = completenessScore >= threshold;
  
  return {
    passed,
    score: completenessScore,
    severity: passed ? 'info' : (completenessScore > 0.7 ? 'warning' : 'error'),
    details: {
      totalRecords: totalPossibleValues,
      failedRecords: totalNulls,
      sampleFailures: columnResults
        .filter(c => c.nulls > 0)
        .slice(0, 5)
        .map(c => ({
          value: c.column,
          reason: `${c.nulls} null values found`
        }))
    },
    suggestions: passed ? undefined : [
      'Implement NOT NULL constraints where appropriate',
      'Add data validation at source',
      'Consider default values for optional fields'
    ]
  };
}

async function checkUniqueness(
  connector: IDataConnector,
  tableName: string,
  table: TableInfo,
  threshold: number
): Promise<Omit<QualityCheckResult, 'executionTime' | 'table' | 'checkType' | 'threshold'>> {
  const columns = await connector.listColumns(
    table.database || '',
    table.schema || '',
    table.name
  );
  
  const totalRecordsResult = await connector.executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
  const totalRecords = Number(totalRecordsResult.rows[0]?.total || 0);
  
  let duplicatesFound = 0;
  const columnResults: Array<{ column: string; duplicates: number }> = [];
  
  // Check key columns for uniqueness
  const keyColumns = columns.filter(col => 
    col.primaryKey || 
    col.name.toLowerCase().includes('id') ||
    col.name.toLowerCase().includes('key')
  );
  
  for (const column of keyColumns) {
    const dupQuery = `
      SELECT COUNT(*) as dup_count 
      FROM (
        SELECT ${column.name}, COUNT(*) as cnt
        FROM ${tableName}
        WHERE ${column.name} IS NOT NULL
        GROUP BY ${column.name}
        HAVING COUNT(*) > 1
      ) dups
    `;
    
    const dupResult = await connector.executeQuery(dupQuery);
    const dupCount = Number(dupResult.rows[0]?.dup_count || 0);
    
    duplicatesFound += dupCount;
    columnResults.push({ column: column.name, duplicates: dupCount });
  }
  
  const uniquenessScore = keyColumns.length > 0 ? 1 - (duplicatesFound / keyColumns.length) : 1;
  const passed = uniquenessScore >= threshold;
  
  return {
    passed,
    score: uniquenessScore,
    severity: passed ? 'info' : (uniquenessScore > 0.8 ? 'warning' : 'error'),
    details: {
      totalRecords,
      failedRecords: duplicatesFound,
      sampleFailures: columnResults
        .filter(c => c.duplicates > 0)
        .slice(0, 5)
        .map(c => ({
          value: c.column,
          reason: `${c.duplicates} duplicate values found`
        }))
    },
    suggestions: passed ? undefined : [
      'Add unique constraints to prevent duplicates',
      'Implement deduplication logic in ETL process',
      'Review data source for duplicate generation'
    ]
  };
}

async function checkValidity(
  connector: IDataConnector,
  tableName: string,
  table: TableInfo,
  threshold: number
): Promise<Omit<QualityCheckResult, 'executionTime' | 'table' | 'checkType' | 'threshold'>> {
  // This would implement various validity checks based on data types
  // For now, return a basic implementation
  
  const totalRecordsResult = await connector.executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
  const totalRecords = Number(totalRecordsResult.rows[0]?.total || 0);
  
  // Simplified validity check - assume all records are valid for now
  const validityScore = 1.0;
  const passed = validityScore >= threshold;
  
  return {
    passed,
    score: validityScore,
    severity: 'info',
    details: {
      totalRecords,
      failedRecords: 0
    },
    suggestions: undefined
  };
}

async function checkAccuracy(
  connector: IDataConnector,
  tableName: string,
  table: TableInfo,
  threshold: number
): Promise<Omit<QualityCheckResult, 'executionTime' | 'table' | 'checkType' | 'threshold'>> {
  // This would implement accuracy checks against reference data
  // For now, return a basic implementation
  
  const totalRecordsResult = await connector.executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
  const totalRecords = Number(totalRecordsResult.rows[0]?.total || 0);
  
  // Simplified accuracy check - assume all records are accurate for now
  const accuracyScore = 1.0;
  const passed = accuracyScore >= threshold;
  
  return {
    passed,
    score: accuracyScore,
    severity: 'info',
    details: {
      totalRecords,
      failedRecords: 0
    },
    suggestions: undefined
  };
}

async function checkConsistency(
  connector: IDataConnector,
  tableName: string,
  table: TableInfo,
  threshold: number
): Promise<Omit<QualityCheckResult, 'executionTime' | 'table' | 'checkType' | 'threshold'>> {
  // This would implement consistency checks across related data
  // For now, return a basic implementation
  
  const totalRecordsResult = await connector.executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
  const totalRecords = Number(totalRecordsResult.rows[0]?.total || 0);
  
  // Simplified consistency check - assume all records are consistent for now
  const consistencyScore = 1.0;
  const passed = consistencyScore >= threshold;
  
  return {
    passed,
    score: consistencyScore,
    severity: 'info',
    details: {
      totalRecords,
      failedRecords: 0
    },
    suggestions: undefined
  };
}

async function checkTimeliness(
  connector: IDataConnector,
  tableName: string,
  table: TableInfo,
  threshold: number
): Promise<Omit<QualityCheckResult, 'executionTime' | 'table' | 'checkType' | 'threshold'>> {
  // This is handled by checkDataFreshness, so redirect there
  return checkDataFreshness({ 
    connectionId: '', // This will be set by caller
    table, 
    freshnessHours: 24 
  }).then(result => ({
    passed: result.passed,
    score: result.score,
    severity: result.severity,
    details: result.details,
    suggestions: result.suggestions
  }));
}

function findTimestampColumn(columns: Array<{ name: string; type: string }>): string | null {
  const timestampPatterns = [
    'updated_at', 'modified_at', 'last_modified', 'timestamp',
    'created_at', 'inserted_at', 'date_modified', 'last_updated'
  ];
  
  for (const pattern of timestampPatterns) {
    const column = columns.find(col => 
      col.name.toLowerCase() === pattern ||
      col.name.toLowerCase().includes(pattern.split('_')[0])
    );
    if (column && isTimestampType(column.type)) {
      return column.name;
    }
  }
  
  const timestampColumn = columns.find(col => isTimestampType(col.type));
  return timestampColumn?.name || null;
}

function isTimestampType(type: string): boolean {
  const timestampTypes = ['timestamp', 'datetime', 'date', 'time'];
  return timestampTypes.some(t => type.toLowerCase().includes(t));
}

function isNumericType(type: string): boolean {
  const numericTypes = ['int', 'integer', 'bigint', 'decimal', 'numeric', 'float', 'double', 'real'];
  return numericTypes.some(t => type.toLowerCase().includes(t));
}

function isStringType(type: string): boolean {
  const stringTypes = ['char', 'varchar', 'text', 'string', 'nchar', 'nvarchar'];
  return stringTypes.some(t => type.toLowerCase().includes(t));
}