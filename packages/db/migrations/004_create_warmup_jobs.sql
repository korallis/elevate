-- Create warmup jobs table
CREATE TABLE warmup_jobs (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  schedule VARCHAR(100), -- Cron expression
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run TIMESTAMP WITH TIME ZONE,
  next_run TIMESTAMP WITH TIME ZONE,
  config JSONB NOT NULL DEFAULT '{}',
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for warmup jobs
CREATE INDEX idx_warmup_jobs_enabled ON warmup_jobs(enabled);
CREATE INDEX idx_warmup_jobs_schedule ON warmup_jobs(schedule) WHERE schedule IS NOT NULL;
CREATE INDEX idx_warmup_jobs_type ON warmup_jobs(type);
CREATE INDEX idx_warmup_jobs_priority ON warmup_jobs(priority);
CREATE INDEX idx_warmup_jobs_next_run ON warmup_jobs(next_run) WHERE next_run IS NOT NULL;