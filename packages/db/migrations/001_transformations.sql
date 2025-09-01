-- Create transformations table
CREATE TABLE transformations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_table VARCHAR(255) NOT NULL,
  transformations JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name)
);

-- Create transformation history table for versioning
CREATE TABLE transformation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transformation_id UUID NOT NULL REFERENCES transformations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_table VARCHAR(255) NOT NULL,
  transformations JSONB NOT NULL DEFAULT '{}',
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  change_summary TEXT,
  UNIQUE(transformation_id, version)
);

-- Create indexes for better query performance
CREATE INDEX idx_transformations_source_table ON transformations(source_table);
CREATE INDEX idx_transformations_created_by ON transformations(created_by);
CREATE INDEX idx_transformations_updated_at ON transformations(updated_at DESC);
CREATE INDEX idx_transformation_history_transformation_id ON transformation_history(transformation_id);
CREATE INDEX idx_transformation_history_version ON transformation_history(transformation_id, version DESC);

-- Create trigger to automatically create history entries
CREATE OR REPLACE FUNCTION create_transformation_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into history table when transformation is updated
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO transformation_history (
      transformation_id, version, name, description, source_table, 
      transformations, created_by, change_summary
    )
    VALUES (
      OLD.id, OLD.version, OLD.name, OLD.description, OLD.source_table,
      OLD.transformations, OLD.created_by, 'Version ' || OLD.version || ' archived'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER transformation_history_trigger
  BEFORE UPDATE ON transformations
  FOR EACH ROW
  EXECUTE FUNCTION create_transformation_history();

-- Create function to increment version on update
CREATE OR REPLACE FUNCTION increment_transformation_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for version increment
CREATE TRIGGER transformation_version_trigger
  BEFORE UPDATE ON transformations
  FOR EACH ROW
  EXECUTE FUNCTION increment_transformation_version();