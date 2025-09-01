-- Share invitations system for inviting new users to the platform
-- Extends the existing 'invites' table with sharing-specific functionality

CREATE TABLE share_invitations (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'viewer', 'editor', 'admin'
  org_id BIGINT REFERENCES orgs(id) ON DELETE CASCADE,
  department_id BIGINT REFERENCES departments(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE, -- Unique invitation token
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ NULL,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Additional sharing context
  invited_for_resource_type TEXT, -- Optional: specific resource type invitation is for
  invited_for_resource_id TEXT,   -- Optional: specific resource ID invitation is for
  invitation_message TEXT,        -- Optional: custom message from inviter
  
  -- Ensure email can't have duplicate pending invitations for same org/dept
  UNIQUE(email, org_id, department_id) DEFERRABLE INITIALLY DEFERRED
);

-- Indexes for performance
CREATE INDEX idx_share_invitations_email ON share_invitations(email);
CREATE INDEX idx_share_invitations_token ON share_invitations(token);
CREATE INDEX idx_share_invitations_org ON share_invitations(org_id);
CREATE INDEX idx_share_invitations_dept ON share_invitations(department_id);
CREATE INDEX idx_share_invitations_expires ON share_invitations(expires_at);

-- Function to automatically clean up expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void
LANGUAGE SQL
AS $$
  DELETE FROM share_invitations 
  WHERE expires_at < NOW() AND accepted_at IS NULL;
$$;