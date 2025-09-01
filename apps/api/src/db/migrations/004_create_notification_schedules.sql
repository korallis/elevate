-- Create notification schedules table
CREATE TABLE IF NOT EXISTS notification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'slack')),
  schedule VARCHAR(100) NOT NULL, -- Cron expression
  dashboard_id UUID NOT NULL,
  recipient JSONB NOT NULL, -- Email address or Slack channel info
  config JSONB NOT NULL DEFAULT '{}', -- Export config (format, options, etc.)
  template_config JSONB DEFAULT '{}', -- Email/message template configuration
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  
  -- Add constraints
  CONSTRAINT valid_schedule CHECK (schedule ~ '^[0-9\*\,\/\-\s]+$'),
  CONSTRAINT valid_recipient_email CHECK (
    type != 'email' OR (recipient->>'email' IS NOT NULL AND recipient->>'email' ~ '^[^@]+@[^@]+\.[^@]+$')
  ),
  CONSTRAINT valid_recipient_slack CHECK (
    type != 'slack' OR (recipient->>'channel' IS NOT NULL OR recipient->>'user' IS NOT NULL)
  )
);

-- Create notification logs table
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES notification_schedules(id) ON DELETE CASCADE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'pending', 'cancelled')),
  error_message TEXT,
  export_job_id VARCHAR(255), -- Reference to export job if applicable
  metadata JSONB DEFAULT '{}', -- Additional log metadata
  duration_ms INTEGER, -- How long the operation took
  file_size INTEGER, -- Size of exported file in bytes
  
  -- Add index for performance
  INDEX idx_notification_logs_schedule_id (schedule_id),
  INDEX idx_notification_logs_sent_at (sent_at)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_schedules_enabled ON notification_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_notification_schedules_type ON notification_schedules(type);
CREATE INDEX IF NOT EXISTS idx_notification_schedules_dashboard_id ON notification_schedules(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_notification_schedules_created_by ON notification_schedules(created_by);
CREATE INDEX IF NOT EXISTS idx_notification_schedules_next_run ON notification_schedules(next_run_at) WHERE enabled = true;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_schedules_updated_at
  BEFORE UPDATE ON notification_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_schedules_updated_at();

-- Create function to calculate next run time
CREATE OR REPLACE FUNCTION calculate_next_run(cron_expression TEXT, last_run TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
  base_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Use last_run + 1 minute as base time, or current time if no last run
  base_time := COALESCE(last_run + INTERVAL '1 minute', CURRENT_TIMESTAMP);
  
  -- For now, return a simple calculation based on common patterns
  -- In a real implementation, you'd parse the cron expression properly
  CASE
    -- Every minute
    WHEN cron_expression = '* * * * *' THEN
      RETURN base_time + INTERVAL '1 minute';
    -- Every hour
    WHEN cron_expression LIKE '0 * * * *' THEN
      RETURN date_trunc('hour', base_time) + INTERVAL '1 hour';
    -- Daily at specific hour
    WHEN cron_expression LIKE '0 % * * *' THEN
      RETURN date_trunc('day', base_time) + INTERVAL '1 day' + 
             (SPLIT_PART(cron_expression, ' ', 2)::INTEGER || ' hours')::INTERVAL;
    -- Weekly (every Monday)
    WHEN cron_expression LIKE '0 % * * 1' THEN
      RETURN date_trunc('week', base_time) + INTERVAL '1 week' +
             (SPLIT_PART(cron_expression, ' ', 2)::INTEGER || ' hours')::INTERVAL;
    -- Default to hourly
    ELSE
      RETURN base_time + INTERVAL '1 hour';
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update next_run_at
CREATE OR REPLACE FUNCTION update_next_run_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (NEW.schedule != OLD.schedule OR NEW.last_run_at != OLD.last_run_at)) THEN
    NEW.next_run_at = calculate_next_run(NEW.schedule, NEW.last_run_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_next_run_at
  BEFORE INSERT OR UPDATE ON notification_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_next_run_at();

-- Insert sample data for testing (optional)
-- INSERT INTO notification_schedules (name, type, schedule, dashboard_id, recipient, config, created_by)
-- VALUES 
--   ('Daily Sales Report', 'email', '0 8 * * *', 'dashboard-uuid-here', 
--    '{"email": "admin@company.com", "name": "Admin"}', 
--    '{"format": "pdf", "includeCharts": true}', 'user-uuid-here'),
--   ('Weekly Analytics Update', 'slack', '0 9 * * 1', 'dashboard-uuid-here',
--    '{"channel": "#analytics", "webhook_url": "https://hooks.slack.com/..."}',
--    '{"format": "png", "highDPI": true}', 'user-uuid-here');