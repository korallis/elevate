-- Comprehensive data governance system tables
-- Extends existing PII system with full governance features

-- Extend PII system with detection rules and columns metadata
CREATE TABLE IF NOT EXISTS pii_detection_rules (
  id BIGSERIAL PRIMARY KEY,
  pattern TEXT NOT NULL,
  pii_type TEXT NOT NULL, -- 'email', 'ssn', 'phone', 'name', 'address', 'credit_card', 'custom'
  confidence REAL NOT NULL DEFAULT 0.8,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enhanced PII columns table (extends catalog_pii with more metadata)  
CREATE TABLE IF NOT EXISTS pii_columns (
  id BIGSERIAL PRIMARY KEY,
  database_name TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  pii_type TEXT NOT NULL,
  masking_rule TEXT, -- 'hash', 'redact', 'partial', 'encrypt', 'tokenize', 'none'
  confidence REAL,
  auto_detected BOOLEAN NOT NULL DEFAULT false,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(database_name, schema_name, table_name, column_name)
);

-- Row-Level Security (RLS) system
CREATE TABLE IF NOT EXISTS rls_policies (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  database_name TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  filter_expression TEXT NOT NULL, -- SQL WHERE clause expression
  role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rls_assignments (
  id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT NOT NULL REFERENCES rls_policies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  department_id BIGINT REFERENCES departments(id) ON DELETE CASCADE,
  org_id BIGINT REFERENCES orgs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure at least one assignment target is specified
  CHECK (user_id IS NOT NULL OR department_id IS NOT NULL OR org_id IS NOT NULL)
);

-- GDPR Compliance system
CREATE TABLE IF NOT EXISTS gdpr_requests (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL, -- 'export', 'delete', 'rectify', 'portability'
  subject_type TEXT NOT NULL, -- 'user_id', 'email', 'customer_id'
  subject_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  reason TEXT,
  metadata JSONB,
  requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gdpr_request_items (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES gdpr_requests(id) ON DELETE CASCADE,
  database_name TEXT NOT NULL,
  schema_name TEXT NOT NULL,  
  table_name TEXT NOT NULL,
  column_name TEXT,
  affected_rows INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  result_data JSONB,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_residency (
  id BIGSERIAL PRIMARY KEY,
  database_name TEXT NOT NULL,
  schema_name TEXT,
  table_name TEXT NOT NULL,
  region TEXT NOT NULL, -- 'US', 'EU', 'UK', 'CA', 'APAC', etc.
  compliance_framework TEXT[], -- ['GDPR', 'CCPA', 'SOX', 'HIPAA', etc.]
  data_classification TEXT, -- 'public', 'internal', 'confidential', 'restricted'
  retention_period_days INTEGER,
  compliance_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(database_name, COALESCE(schema_name, ''), table_name)
);

-- Data lineage and impact tracking
CREATE TABLE IF NOT EXISTS data_lineage (
  id BIGSERIAL PRIMARY KEY,
  source_database TEXT NOT NULL,
  source_schema TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_column TEXT,
  target_database TEXT NOT NULL,
  target_schema TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_column TEXT,
  transformation_type TEXT, -- 'copy', 'aggregate', 'join', 'filter', 'compute'
  transformation_sql TEXT,
  confidence REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Governance audit logs (separate from general audit_logs)
CREATE TABLE IF NOT EXISTS governance_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'pii_tagged', 'policy_applied', 'gdpr_request', 'data_masked'
  resource_type TEXT NOT NULL, -- 'column', 'table', 'query', 'export'
  resource_id TEXT NOT NULL,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  severity TEXT DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pii_detection_rules_type ON pii_detection_rules(pii_type, enabled);
CREATE INDEX IF NOT EXISTS idx_pii_columns_table ON pii_columns(database_name, schema_name, table_name);
CREATE INDEX IF NOT EXISTS idx_pii_columns_type ON pii_columns(pii_type, auto_detected);

CREATE INDEX IF NOT EXISTS idx_rls_policies_table ON rls_policies(database_name, schema_name, table_name, enabled);
CREATE INDEX IF NOT EXISTS idx_rls_assignments_policy ON rls_assignments(policy_id);
CREATE INDEX IF NOT EXISTS idx_rls_assignments_user ON rls_assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status ON gdpr_requests(status, type);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_subject ON gdpr_requests(subject_type, subject_value);
CREATE INDEX IF NOT EXISTS idx_gdpr_request_items_request ON gdpr_request_items(request_id);

CREATE INDEX IF NOT EXISTS idx_data_residency_table ON data_residency(database_name, schema_name, table_name);
CREATE INDEX IF NOT EXISTS idx_data_residency_region ON data_residency(region);

CREATE INDEX IF NOT EXISTS idx_data_lineage_source ON data_lineage(source_database, source_schema, source_table);
CREATE INDEX IF NOT EXISTS idx_data_lineage_target ON data_lineage(target_database, target_schema, target_table);

CREATE INDEX IF NOT EXISTS idx_governance_audit_logs_type ON governance_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governance_audit_logs_resource ON governance_audit_logs(resource_type, resource_id);

-- Insert default PII detection rules
INSERT INTO pii_detection_rules (pattern, pii_type, confidence, description) VALUES
  ('.*email.*', 'email', 0.9, 'Email column pattern'),
  ('.*mail.*', 'email', 0.8, 'Mail column pattern'),
  ('.*ssn.*|.*social.*security.*', 'ssn', 0.95, 'Social Security Number pattern'),
  ('.*phone.*|.*tel.*|.*mobile.*', 'phone', 0.9, 'Phone number pattern'),
  ('.*first.*name.*|.*fname.*|.*given.*name.*', 'name', 0.8, 'First name pattern'),  
  ('.*last.*name.*|.*lname.*|.*surname.*|.*family.*name.*', 'name', 0.8, 'Last name pattern'),
  ('.*full.*name.*|.*name$|^name.*', 'name', 0.7, 'Full name pattern'),
  ('.*address.*|.*addr.*|.*street.*', 'address', 0.8, 'Address pattern'),
  ('.*city.*|.*town.*', 'address', 0.6, 'City pattern'),
  ('.*zip.*|.*postal.*|.*postcode.*', 'address', 0.7, 'Postal code pattern'),
  ('.*credit.*card.*|.*cc.*num.*|.*card.*number.*', 'credit_card', 0.95, 'Credit card pattern'),
  ('.*birth.*date.*|.*dob.*|.*date.*of.*birth.*', 'date_of_birth', 0.9, 'Date of birth pattern'),
  ('.*ip.*address.*|.*ip_addr.*', 'ip_address', 0.8, 'IP address pattern'),
  ('.*passport.*|.*license.*number.*', 'id_number', 0.8, 'ID number pattern')
ON CONFLICT DO NOTHING;