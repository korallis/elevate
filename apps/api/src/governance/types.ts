// Governance system type definitions

export interface PIIDetectionRule {
  id: number;
  pattern: string;
  pii_type: string;
  confidence: number;
  description: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PIIColumn {
  id: number;
  database_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  pii_type: string;
  masking_rule: string | null;
  confidence: number | null;
  auto_detected: boolean;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PIIDetectionResult {
  database_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  detected_type: string;
  confidence: number;
  rule_matched: string;
  sample_values?: string[];
}

export interface MaskingStrategy {
  type: 'hash' | 'redact' | 'partial' | 'encrypt' | 'tokenize' | 'none';
  config?: {
    algorithm?: string;
    key?: string;
    partial_show_first?: number;
    partial_show_last?: number;
    replacement_char?: string;
  };
}

export interface RLSPolicy {
  id: number;
  name: string;
  description: string | null;
  database_name: string;
  schema_name: string;
  table_name: string;
  filter_expression: string;
  role_id: number | null;
  enabled: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface RLSAssignment {
  id: number;
  policy_id: number;
  user_id: number | null;
  department_id: number | null;
  org_id: number | null;
  created_at: string;
}

export interface GDPRRequest {
  id: number;
  type: 'export' | 'delete' | 'rectify' | 'portability';
  subject_type: string;
  subject_value: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  reason: string | null;
  metadata: Record<string, unknown> | null;
  requested_by: number | null;
  assigned_to: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GDPRRequestItem {
  id: number;
  request_id: number;
  database_name: string;
  schema_name: string;
  table_name: string;
  column_name: string | null;
  affected_rows: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result_data: Record<string, unknown> | null;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface DataResidency {
  id: number;
  database_name: string;
  schema_name: string | null;
  table_name: string;
  region: string;
  compliance_framework: string[];
  data_classification: string | null;
  retention_period_days: number | null;
  compliance_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GovernanceAuditLog {
  id: number;
  event_type: string;
  resource_type: string;
  resource_id: string;
  actor_id: number | null;
  action: string;
  details: Record<string, unknown> | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  created_at: string;
}

export interface PIIScanOptions {
  database_name: string;
  schema_name: string;
  table_name?: string;
  sample_size?: number;
  confidence_threshold?: number;
}

export interface PIIScanResult {
  total_tables: number;
  total_columns: number;
  pii_columns_found: number;
  scan_duration_ms: number;
  results: PIIDetectionResult[];
}

export interface RLSValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  performance_score?: number;
}

export interface GDPRExportResult {
  request_id: number;
  total_records: number;
  exported_tables: string[];
  export_file_size: number;
  export_format: 'json' | 'csv' | 'parquet';
  completed_at: string;
}

export type PIIType = 
  | 'email' 
  | 'ssn' 
  | 'phone' 
  | 'name' 
  | 'address' 
  | 'credit_card'
  | 'date_of_birth'
  | 'ip_address'
  | 'id_number'
  | 'custom';

export type MaskingRule = 
  | 'hash'
  | 'redact' 
  | 'partial'
  | 'encrypt'
  | 'tokenize'
  | 'none';

export type ComplianceFramework = 
  | 'GDPR'
  | 'CCPA' 
  | 'SOX'
  | 'HIPAA'
  | 'PCI_DSS'
  | 'ISO_27001';

export type DataClassification = 
  | 'public'
  | 'internal' 
  | 'confidential'
  | 'restricted';