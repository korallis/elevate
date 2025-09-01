-- Create semantic layer tables for metrics and dimensions management

-- Semantic Dimensions table
CREATE TABLE semantic_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  label VARCHAR(255),
  type VARCHAR(50) NOT NULL CHECK (type IN ('string', 'number', 'date', 'boolean')),
  table_name VARCHAR(255) NOT NULL,
  column_name VARCHAR(255) NOT NULL,
  expression TEXT, -- Custom SQL expression if needed
  description TEXT,
  values JSONB, -- Possible values for categorical dimensions
  format_string VARCHAR(100), -- Display format (for dates, numbers)
  is_primary BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Semantic Metrics table
CREATE TABLE semantic_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  label VARCHAR(255),
  type VARCHAR(50) NOT NULL CHECK (type IN ('count', 'sum', 'avg', 'min', 'max', 'distinct_count', 'custom')),
  table_name VARCHAR(255) NOT NULL,
  column_name VARCHAR(255), -- Can be NULL for count(*) metrics
  expression TEXT, -- Custom SQL expression for complex metrics
  description TEXT,
  format_type VARCHAR(50) DEFAULT 'number', -- number, currency, percentage
  format_options JSONB DEFAULT '{}', -- Additional formatting options
  aggregation_type VARCHAR(50) DEFAULT 'sum', -- How to aggregate when rolling up
  filters JSONB DEFAULT '[]', -- Default filters applied to this metric
  dimensions JSONB DEFAULT '[]', -- Associated dimension names
  version VARCHAR(10) NOT NULL DEFAULT 'v1.0',
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Semantic Versions table for change tracking
CREATE TABLE semantic_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('metric', 'dimension')),
  entity_id UUID NOT NULL,
  version VARCHAR(10) NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}', -- What changed
  notes TEXT,
  impact_analysis JSONB DEFAULT '{}', -- What queries/dashboards are affected
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Semantic Dependencies table for tracking usage
CREATE TABLE semantic_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('metric', 'dimension')),
  source_id UUID NOT NULL,
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('query', 'dashboard', 'report', 'metric')),
  target_id VARCHAR(255) NOT NULL, -- Can be UUID or string identifier
  target_name VARCHAR(255),
  dependency_type VARCHAR(50) DEFAULT 'uses', -- uses, references, derives_from
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Metric Queries Cache table for performance
CREATE TABLE semantic_query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of normalized query
  metric_id UUID REFERENCES semantic_metrics(id) ON DELETE CASCADE,
  dimensions JSONB DEFAULT '[]',
  filters JSONB DEFAULT '[]',
  sql_query TEXT NOT NULL,
  result_data JSONB,
  result_count INTEGER,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour')
);

-- Create indexes for better query performance
CREATE INDEX idx_semantic_dimensions_name ON semantic_dimensions(name);
CREATE INDEX idx_semantic_dimensions_table_name ON semantic_dimensions(table_name);
CREATE INDEX idx_semantic_dimensions_type ON semantic_dimensions(type);
CREATE INDEX idx_semantic_dimensions_created_by ON semantic_dimensions(created_by);
CREATE INDEX idx_semantic_dimensions_updated_at ON semantic_dimensions(updated_at DESC);

CREATE INDEX idx_semantic_metrics_name ON semantic_metrics(name);
CREATE INDEX idx_semantic_metrics_table_name ON semantic_metrics(table_name);
CREATE INDEX idx_semantic_metrics_type ON semantic_metrics(type);
CREATE INDEX idx_semantic_metrics_version ON semantic_metrics(version);
CREATE INDEX idx_semantic_metrics_is_active ON semantic_metrics(is_active);
CREATE INDEX idx_semantic_metrics_created_by ON semantic_metrics(created_by);
CREATE INDEX idx_semantic_metrics_updated_at ON semantic_metrics(updated_at DESC);

CREATE INDEX idx_semantic_versions_entity ON semantic_versions(entity_type, entity_id);
CREATE INDEX idx_semantic_versions_version ON semantic_versions(entity_type, entity_id, version);
CREATE INDEX idx_semantic_versions_created_at ON semantic_versions(created_at DESC);

CREATE INDEX idx_semantic_dependencies_source ON semantic_dependencies(source_type, source_id);
CREATE INDEX idx_semantic_dependencies_target ON semantic_dependencies(target_type, target_id);

CREATE INDEX idx_semantic_query_cache_hash ON semantic_query_cache(query_hash);
CREATE INDEX idx_semantic_query_cache_metric ON semantic_query_cache(metric_id);
CREATE INDEX idx_semantic_query_cache_expires ON semantic_query_cache(expires_at);

-- Add foreign key constraints with proper references
ALTER TABLE semantic_versions 
ADD CONSTRAINT fk_semantic_versions_metric 
FOREIGN KEY (entity_id) REFERENCES semantic_metrics(id) ON DELETE CASCADE
WHERE entity_type = 'metric';

-- Create triggers for automatic versioning

-- Function to create version history for metrics
CREATE OR REPLACE FUNCTION create_semantic_metric_version()
RETURNS TRIGGER AS $$
DECLARE
  changes JSONB := '{}';
  old_version VARCHAR(10);
  new_version VARCHAR(10);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Extract version numbers for comparison
    old_version := OLD.version;
    new_version := NEW.version;
    
    -- Build changes object
    IF OLD.name != NEW.name THEN
      changes := changes || jsonb_build_object('name', jsonb_build_object('from', OLD.name, 'to', NEW.name));
    END IF;
    IF OLD.expression != NEW.expression OR (OLD.expression IS NULL) != (NEW.expression IS NULL) THEN
      changes := changes || jsonb_build_object('expression', jsonb_build_object('from', OLD.expression, 'to', NEW.expression));
    END IF;
    IF OLD.type != NEW.type THEN
      changes := changes || jsonb_build_object('type', jsonb_build_object('from', OLD.type, 'to', NEW.type));
    END IF;
    IF OLD.filters::text != NEW.filters::text THEN
      changes := changes || jsonb_build_object('filters', jsonb_build_object('from', OLD.filters, 'to', NEW.filters));
    END IF;
    
    -- Only create version entry if there are actual changes and version changed
    IF jsonb_object_keys(changes) IS NOT NULL AND old_version != new_version THEN
      INSERT INTO semantic_versions (entity_type, entity_id, version, changes, notes, created_by)
      VALUES ('metric', OLD.id, old_version, changes, 'Automated version on update', OLD.created_by);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create version history for dimensions
CREATE OR REPLACE FUNCTION create_semantic_dimension_version()
RETURNS TRIGGER AS $$
DECLARE
  changes JSONB := '{}';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Build changes object
    IF OLD.name != NEW.name THEN
      changes := changes || jsonb_build_object('name', jsonb_build_object('from', OLD.name, 'to', NEW.name));
    END IF;
    IF OLD.expression != NEW.expression OR (OLD.expression IS NULL) != (NEW.expression IS NULL) THEN
      changes := changes || jsonb_build_object('expression', jsonb_build_object('from', OLD.expression, 'to', NEW.expression));
    END IF;
    IF OLD.type != NEW.type THEN
      changes := changes || jsonb_build_object('type', jsonb_build_object('from', OLD.type, 'to', NEW.type));
    END IF;
    
    -- Only create version entry if there are actual changes
    IF jsonb_object_keys(changes) IS NOT NULL THEN
      INSERT INTO semantic_versions (entity_type, entity_id, version, changes, notes, created_by)
      VALUES ('dimension', OLD.id, 'v1.0', changes, 'Automated version on update', OLD.created_by);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_semantic_query_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM semantic_query_cache WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER semantic_metric_version_trigger
  AFTER UPDATE ON semantic_metrics
  FOR EACH ROW
  EXECUTE FUNCTION create_semantic_metric_version();

CREATE TRIGGER semantic_dimension_version_trigger
  AFTER UPDATE ON semantic_dimensions
  FOR EACH ROW
  EXECUTE FUNCTION create_semantic_dimension_version();

-- Function to automatically update timestamps
CREATE OR REPLACE FUNCTION update_semantic_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create timestamp update triggers
CREATE TRIGGER semantic_metrics_timestamp_trigger
  BEFORE UPDATE ON semantic_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_semantic_timestamp();

CREATE TRIGGER semantic_dimensions_timestamp_trigger
  BEFORE UPDATE ON semantic_dimensions
  FOR EACH ROW
  EXECUTE FUNCTION update_semantic_timestamp();

CREATE TRIGGER semantic_dependencies_timestamp_trigger
  BEFORE UPDATE ON semantic_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION update_semantic_timestamp();

-- Insert some sample data for development
INSERT INTO semantic_dimensions (name, label, type, table_name, column_name, description, created_by) VALUES
('product_category', 'Product Category', 'string', 'products', 'category', 'Product classification', 'system'),
('order_date', 'Order Date', 'date', 'orders', 'created_at', 'When the order was placed', 'system'),
('customer_region', 'Customer Region', 'string', 'customers', 'region', 'Geographic region of customer', 'system');

INSERT INTO semantic_metrics (name, label, type, table_name, column_name, description, created_by) VALUES
('total_revenue', 'Total Revenue', 'sum', 'orders', 'total_amount', 'Sum of all order amounts', 'system'),
('order_count', 'Order Count', 'count', 'orders', NULL, 'Total number of orders', 'system'),
('average_order_value', 'Average Order Value', 'avg', 'orders', 'total_amount', 'Average value per order', 'system');