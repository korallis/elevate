import { 
  proxyActivities, 
  log, 
  defineQuery, 
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type { ConnectorType, TableInfo, ColumnInfo } from '../../../api/src/connectors/types.js';
import type * as activities from '../activities/index.js';

const {
  connectToSource,
  disconnectFromSource,
  runDataQualityChecks,
  validateDataIntegrity,
  detectDataAnomalies,
  checkDataFreshness,
  validateBusinessRules,
  generateQualityReport,
  updateQualityMetrics,
  sendNotification
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  retry: {
    initialInterval: '30 seconds',
    maximumInterval: '3 minutes',
    maximumAttempts: 2,
    backoffCoefficient: 2.0,
  },
});

export interface DataQualityWorkflowInput {
  connectionId: string;
  connectorType: ConnectorType;
  tables: Array<{
    table: TableInfo;
    qualityChecks: {
      completeness: boolean;
      uniqueness: boolean;
      validity: boolean;
      accuracy: boolean;
      consistency: boolean;
      timeliness: boolean;
    };
    businessRules?: Array<{
      name: string;
      description: string;
      rule: string; // SQL expression
      severity: 'error' | 'warning' | 'info';
    }>;
    thresholds: {
      completenessThreshold: number; // 0-1
      uniquenessThreshold: number; // 0-1
      validityThreshold: number; // 0-1
      freshnessHours: number;
    };
  }>;
  authConfig: {
    type: string;
    credentials: Record<string, unknown>;
  };
  reportConfig: {
    includeDetails: boolean;
    includeSuggestions: boolean;
    format: 'json' | 'html' | 'pdf';
  };
  notificationConfig?: {
    email?: string[];
    webhook?: string;
    onlyOnFailure?: boolean;
  };
}

export interface QualityCheckResult {
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

export interface DataQualityReport {
  summary: {
    totalTables: number;
    tablesChecked: number;
    overallScore: number;
    checksRun: number;
    checksPassed: number;
    checksFailed: number;
    criticalIssues: number;
    warnings: number;
  };
  tableResults: Array<{
    table: TableInfo;
    overallScore: number;
    checks: QualityCheckResult[];
    recommendations: string[];
  }>;
  metadata: {
    executionTime: Date;
    duration: number;
    configuration: {
      connectionId: string;
      totalChecks: number;
    };
  };
}

export interface DataQualityStatus {
  phase: 'connecting' | 'running_checks' | 'validating_integrity' | 'detecting_anomalies' | 'validating_business_rules' | 'generating_report' | 'completed' | 'failed';
  progress: {
    totalTables: number;
    processedTables: number;
    totalChecks: number;
    completedChecks: number;
    currentTable?: string;
    currentCheck?: string;
  };
  results: {
    overallScore: number;
    criticalIssues: number;
    warnings: number;
  };
  errors: Array<{
    table?: string;
    check?: string;
    message: string;
    timestamp: Date;
  }>;
}

// Queries for monitoring workflow state
export const getDataQualityStatusQuery = defineQuery<DataQualityStatus>('get-data-quality-status');

export async function dataQualityWorkflow(input: DataQualityWorkflowInput): Promise<DataQualityReport> {
  const workflowId = workflowInfo().workflowId;
  const startTime = Date.now();

  // Initialize quality status
  const status: DataQualityStatus = {
    phase: 'connecting',
    progress: {
      totalTables: input.tables.length,
      processedTables: 0,
      totalChecks: 0,
      completedChecks: 0
    },
    results: {
      overallScore: 0,
      criticalIssues: 0,
      warnings: 0
    },
    errors: []
  };

  // Calculate total number of checks
  for (const tableConfig of input.tables) {
    const checks = Object.values(tableConfig.qualityChecks).filter(Boolean).length;
    const businessRules = tableConfig.businessRules?.length || 0;
    status.progress.totalChecks += checks + businessRules;
  }

  setHandler(getDataQualityStatusQuery, () => status);

  const report: DataQualityReport = {
    summary: {
      totalTables: input.tables.length,
      tablesChecked: 0,
      overallScore: 0,
      checksRun: 0,
      checksPassed: 0,
      checksFailed: 0,
      criticalIssues: 0,
      warnings: 0
    },
    tableResults: [],
    metadata: {
      executionTime: new Date(),
      duration: 0,
      configuration: {
        connectionId: input.connectionId,
        totalChecks: status.progress.totalChecks
      }
    }
  };

  try {
    log.info('Starting data quality workflow', { 
      workflowId, 
      connectionId: input.connectionId,
      totalTables: input.tables.length,
      totalChecks: status.progress.totalChecks
    });

    // Phase 1: Connect to data source
    await connectToSource(input.connectionId, input.authConfig);
    
    // Phase 2: Run quality checks for each table
    status.phase = 'running_checks';

    for (const tableConfig of input.tables) {
      const tableName = `${tableConfig.table.schema}.${tableConfig.table.name}`;
      status.progress.currentTable = tableName;

      const tableResults: QualityCheckResult[] = [];
      let tableScore = 0;
      let tableChecks = 0;

      try {
        log.info('Running quality checks for table', { table: tableName });

        // Completeness checks
        if (tableConfig.qualityChecks.completeness) {
          status.progress.currentCheck = 'completeness';
          try {
            const result = await runDataQualityChecks({
              connectionId: input.connectionId,
              table: tableConfig.table,
              checkType: 'completeness',
              threshold: tableConfig.thresholds.completenessThreshold
            });
            
            tableResults.push(result);
            tableScore += result.score;
            tableChecks++;
            
            if (!result.passed && result.severity === 'error') {
              status.results.criticalIssues++;
            } else if (!result.passed && result.severity === 'warning') {
              status.results.warnings++;
            }
            
            status.progress.completedChecks++;
            log.info('Completeness check completed', { table: tableName, score: result.score });
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            status.errors.push({
              table: tableName,
              check: 'completeness',
              message: errorMessage,
              timestamp: new Date()
            });
            log.error('Completeness check failed', { table: tableName, error: errorMessage });
          }
        }

        // Uniqueness checks
        if (tableConfig.qualityChecks.uniqueness) {
          status.progress.currentCheck = 'uniqueness';
          try {
            const result = await runDataQualityChecks({
              connectionId: input.connectionId,
              table: tableConfig.table,
              checkType: 'uniqueness',
              threshold: tableConfig.thresholds.uniquenessThreshold
            });
            
            tableResults.push(result);
            tableScore += result.score;
            tableChecks++;
            
            if (!result.passed && result.severity === 'error') {
              status.results.criticalIssues++;
            } else if (!result.passed && result.severity === 'warning') {
              status.results.warnings++;
            }
            
            status.progress.completedChecks++;
            log.info('Uniqueness check completed', { table: tableName, score: result.score });
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            status.errors.push({
              table: tableName,
              check: 'uniqueness',
              message: errorMessage,
              timestamp: new Date()
            });
            log.error('Uniqueness check failed', { table: tableName, error: errorMessage });
          }
        }

        // Validity checks
        if (tableConfig.qualityChecks.validity) {
          status.progress.currentCheck = 'validity';
          try {
            const result = await runDataQualityChecks({
              connectionId: input.connectionId,
              table: tableConfig.table,
              checkType: 'validity',
              threshold: tableConfig.thresholds.validityThreshold
            });
            
            tableResults.push(result);
            tableScore += result.score;
            tableChecks++;
            
            if (!result.passed && result.severity === 'error') {
              status.results.criticalIssues++;
            } else if (!result.passed && result.severity === 'warning') {
              status.results.warnings++;
            }
            
            status.progress.completedChecks++;
            log.info('Validity check completed', { table: tableName, score: result.score });
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            status.errors.push({
              table: tableName,
              check: 'validity',
              message: errorMessage,
              timestamp: new Date()
            });
            log.error('Validity check failed', { table: tableName, error: errorMessage });
          }
        }

        // Timeliness/Freshness checks
        if (tableConfig.qualityChecks.timeliness) {
          status.progress.currentCheck = 'timeliness';
          try {
            const result = await checkDataFreshness({
              connectionId: input.connectionId,
              table: tableConfig.table,
              freshnessHours: tableConfig.thresholds.freshnessHours
            });
            
            tableResults.push(result);
            tableScore += result.score;
            tableChecks++;
            
            if (!result.passed && result.severity === 'error') {
              status.results.criticalIssues++;
            } else if (!result.passed && result.severity === 'warning') {
              status.results.warnings++;
            }
            
            status.progress.completedChecks++;
            log.info('Timeliness check completed', { table: tableName, score: result.score });
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            status.errors.push({
              table: tableName,
              check: 'timeliness',
              message: errorMessage,
              timestamp: new Date()
            });
            log.error('Timeliness check failed', { table: tableName, error: errorMessage });
          }
        }

        // Business rule validation
        if (tableConfig.businessRules && tableConfig.businessRules.length > 0) {
          status.progress.currentCheck = 'business_rules';
          try {
            const results = await validateBusinessRules({
              connectionId: input.connectionId,
              table: tableConfig.table,
              businessRules: tableConfig.businessRules
            });
            
            for (const result of results) {
              tableResults.push(result);
              tableScore += result.score;
              tableChecks++;
              
              if (!result.passed && result.severity === 'error') {
                status.results.criticalIssues++;
              } else if (!result.passed && result.severity === 'warning') {
                status.results.warnings++;
              }
            }
            
            status.progress.completedChecks += results.length;
            log.info('Business rules validation completed', { table: tableName, rules: results.length });
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            status.errors.push({
              table: tableName,
              check: 'business_rules',
              message: errorMessage,
              timestamp: new Date()
            });
            log.error('Business rules validation failed', { table: tableName, error: errorMessage });
          }
        }

        // Calculate table score
        const finalTableScore = tableChecks > 0 ? tableScore / tableChecks : 0;
        
        // Generate recommendations for this table
        const recommendations = generateTableRecommendations(tableResults);

        report.tableResults.push({
          table: tableConfig.table,
          overallScore: finalTableScore,
          checks: tableResults,
          recommendations
        });

        report.summary.tablesChecked++;
        report.summary.checksRun += tableResults.length;
        report.summary.checksPassed += tableResults.filter(r => r.passed).length;
        report.summary.checksFailed += tableResults.filter(r => !r.passed).length;

        status.progress.processedTables++;
        log.info('Completed quality checks for table', { 
          table: tableName, 
          score: finalTableScore,
          checks: tableResults.length
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        status.errors.push({
          table: tableName,
          message: errorMessage,
          timestamp: new Date()
        });
        log.error('Quality checks failed for table', { table: tableName, error: errorMessage });
      }
    }

    // Phase 3: Generate final report
    status.phase = 'generating_report';
    status.progress.currentTable = undefined;
    status.progress.currentCheck = 'report_generation';

    // Calculate overall statistics
    const totalScores = report.tableResults.reduce((sum, result) => sum + result.overallScore, 0);
    report.summary.overallScore = report.tableResults.length > 0 ? totalScores / report.tableResults.length : 0;
    report.summary.criticalIssues = status.results.criticalIssues;
    report.summary.warnings = status.results.warnings;

    // Update quality metrics in storage
    await updateQualityMetrics({
      connectionId: input.connectionId,
      report: report
    });

    // Generate detailed report if requested
    if (input.reportConfig.includeDetails) {
      const detailedReport = await generateQualityReport({
        connectionId: input.connectionId,
        report: report,
        format: input.reportConfig.format,
        includeSuggestions: input.reportConfig.includeSuggestions
      });
      
      log.info('Generated detailed quality report', { 
        format: input.reportConfig.format,
        size: detailedReport.size 
      });
    }

    // Phase 4: Complete
    status.phase = 'completed';
    status.results.overallScore = report.summary.overallScore;
    status.progress.currentCheck = undefined;

    report.metadata.duration = Date.now() - startTime;

    // Send notification if requested
    if (input.notificationConfig && (!input.notificationConfig.onlyOnFailure || report.summary.criticalIssues > 0)) {
      await sendNotification({
        type: 'quality_check_completed',
        connectionId: input.connectionId,
        report: report,
        config: input.notificationConfig
      });
    }

    log.info('Data quality workflow completed', {
      workflowId,
      overallScore: report.summary.overallScore,
      criticalIssues: report.summary.criticalIssues,
      warnings: report.summary.warnings,
      duration: report.metadata.duration
    });

  } catch (error) {
    status.phase = 'failed';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    status.errors.push({
      message: errorMessage,
      timestamp: new Date()
    });

    report.metadata.duration = Date.now() - startTime;

    log.error('Data quality workflow failed', { workflowId, error: errorMessage });

    // Send failure notification
    if (input.notificationConfig) {
      await sendNotification({
        type: 'quality_check_failed',
        connectionId: input.connectionId,
        error: errorMessage,
        config: input.notificationConfig
      });
    }

    throw error;

  } finally {
    // Always disconnect from source
    try {
      await disconnectFromSource(input.connectionId);
    } catch (error) {
      log.warn('Failed to disconnect from source', { error });
    }
  }

  return report;
}

function generateTableRecommendations(results: QualityCheckResult[]): string[] {
  const recommendations: string[] = [];
  
  for (const result of results) {
    if (!result.passed && result.suggestions) {
      recommendations.push(...result.suggestions);
    }
  }
  
  // Add generic recommendations based on common patterns
  if (results.some(r => r.checkType === 'completeness' && !r.passed)) {
    recommendations.push('Consider implementing data validation rules to prevent null values in critical columns');
  }
  
  if (results.some(r => r.checkType === 'uniqueness' && !r.passed)) {
    recommendations.push('Review data ingestion process to prevent duplicate records');
  }
  
  if (results.some(r => r.checkType === 'timeliness' && !r.passed)) {
    recommendations.push('Implement more frequent data refresh schedules for time-sensitive tables');
  }
  
  return [...new Set(recommendations)]; // Remove duplicates
}