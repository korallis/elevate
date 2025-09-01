export { MetricBuilder } from './MetricBuilder';
export { DimensionManager } from './DimensionManager';
export { SemanticPreview } from './SemanticPreview';
export { VersionHistory } from './VersionHistory';
export { ImpactAnalysis } from './ImpactAnalysis';

// Type definitions used across components
export interface Metric {
  id?: string;
  name: string;
  label: string;
  type: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct_count' | 'custom';
  table_name: string;
  column_name?: string;
  expression?: string;
  description: string;
  format_type: 'number' | 'currency' | 'percentage';
  aggregation_type: 'sum' | 'avg' | 'min' | 'max' | 'count';
  filters: Filter[];
  dimensions: string[];
  version?: string;
  is_active?: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Dimension {
  id: string;
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  table_name: string;
  column_name: string;
  expression?: string;
  description: string;
  values?: Record<string, any>;
  format_string?: string;
  is_primary: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Filter {
  table: string;
  column: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not in' | 'like';
  value: string | number | boolean | null | Array<string | number | boolean | null>;
}

export interface PreviewResult {
  data: Record<string, any>[];
  sql: string;
  executionTimeMs: number;
  rowCount: number;
  columnInfo: Array<{
    name: string;
    type: string;
    nullable?: boolean;
  }>;
  stats?: {
    distinctValues: Record<string, number>;
    nullCounts: Record<string, number>;
    sampleStats?: Record<string, {
      min?: any;
      max?: any;
      avg?: number;
    }>;
  };
}

export interface SemanticVersion {
  id: string;
  entityType: 'metric' | 'dimension';
  entityId: string;
  version: string;
  changes: Record<string, {
    from?: any;
    to?: any;
    changeType: string;
  }>;
  notes?: string;
  impactAnalysis?: {
    affectedQueries: string[];
    affectedDashboards: string[];
    affectedReports: string[];
    breakingChanges: boolean;
    riskLevel: 'low' | 'medium' | 'high';
  };
  createdBy: string;
  createdAt: string;
}

export interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  changes: Array<{
    field: string;
    changeType: string;
    fromValue?: any;
    toValue?: any;
    impact?: string;
  }>;
  summary: string;
  breakingChanges: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ImpactedEntity {
  type: string;
  id: string;
  name: string;
}

export interface ImpactAnalysisData {
  directDependencies: ImpactedEntity[];
  indirectDependencies: ImpactedEntity[];
}