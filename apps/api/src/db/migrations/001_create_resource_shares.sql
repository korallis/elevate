-- Enhanced resource sharing system
-- Replaces the basic 'shares' table with more comprehensive sharing functionality

DROP TABLE IF EXISTS shares;

CREATE TABLE resource_shares (
  id BIGSERIAL PRIMARY KEY,
  resource_type TEXT NOT NULL, -- 'dashboard', 'query', 'report', 'dataset', 'table'
  resource_id TEXT NOT NULL,   -- ID of the resource being shared
  share_type TEXT NOT NULL,    -- 'user', 'department', 'organization'
  share_with_id BIGINT NOT NULL, -- ID of user/department/org receiving access
  permissions JSONB NOT NULL DEFAULT '["view"]'::jsonb, -- ['view', 'edit', 'admin']
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure unique sharing per resource/recipient combination
  UNIQUE(resource_type, resource_id, share_type, share_with_id)
);

-- Indexes for performance
CREATE INDEX idx_resource_shares_resource ON resource_shares(resource_type, resource_id);
CREATE INDEX idx_resource_shares_recipient ON resource_shares(share_type, share_with_id);
CREATE INDEX idx_resource_shares_created_by ON resource_shares(created_by);