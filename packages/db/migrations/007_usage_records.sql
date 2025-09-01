-- Create usage records table
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  organization_id VARCHAR(255),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  metric VARCHAR(100) NOT NULL, -- queries, users, dashboards, api_calls, etc.
  quantity INTEGER NOT NULL DEFAULT 1,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  
  -- Composite indexes for efficient queries
  CONSTRAINT usage_records_period_check CHECK (period_end > period_start)
);

-- Create indexes for efficient usage tracking
CREATE INDEX idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX idx_usage_records_organization_id ON usage_records(organization_id);
CREATE INDEX idx_usage_records_subscription_id ON usage_records(subscription_id);
CREATE INDEX idx_usage_records_metric ON usage_records(metric);
CREATE INDEX idx_usage_records_period ON usage_records(period_start, period_end);
CREATE INDEX idx_usage_records_user_metric_period ON usage_records(user_id, metric, period_start, period_end);
CREATE INDEX idx_usage_records_recorded_at ON usage_records(recorded_at DESC);

-- Create usage aggregation view for monthly usage
CREATE OR REPLACE VIEW monthly_usage_summary AS
SELECT 
  user_id,
  organization_id,
  subscription_id,
  metric,
  DATE_TRUNC('month', period_start) as month_start,
  SUM(quantity) as total_quantity,
  COUNT(*) as record_count,
  MIN(period_start) as first_recorded,
  MAX(period_end) as last_recorded
FROM usage_records
GROUP BY user_id, organization_id, subscription_id, metric, DATE_TRUNC('month', period_start);

-- Create function to record usage
CREATE OR REPLACE FUNCTION record_usage(
  p_user_id VARCHAR(255),
  p_organization_id VARCHAR(255),
  p_metric VARCHAR(100),
  p_quantity INTEGER DEFAULT 1,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_subscription_id UUID;
  v_usage_id UUID;
  v_period_start TIMESTAMP WITH TIME ZONE;
  v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get active subscription
  SELECT id INTO v_subscription_id
  FROM subscriptions
  WHERE user_id = p_user_id 
    AND (organization_id = p_organization_id OR (organization_id IS NULL AND p_organization_id IS NULL))
    AND status IN ('active', 'trialing')
  LIMIT 1;
  
  -- Set period to current hour for granular tracking
  v_period_start = DATE_TRUNC('hour', CURRENT_TIMESTAMP);
  v_period_end = v_period_start + INTERVAL '1 hour';
  
  -- Insert or update usage record
  INSERT INTO usage_records (
    user_id, organization_id, subscription_id, metric, quantity,
    period_start, period_end, metadata
  ) VALUES (
    p_user_id, p_organization_id, v_subscription_id, p_metric, p_quantity,
    v_period_start, v_period_end, p_metadata
  )
  ON CONFLICT (user_id, organization_id, metric, period_start, period_end)
  DO UPDATE SET
    quantity = usage_records.quantity + EXCLUDED.quantity,
    metadata = EXCLUDED.metadata,
    recorded_at = CURRENT_TIMESTAMP
  RETURNING id INTO v_usage_id;
  
  RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql;

-- Create unique constraint to prevent duplicate usage records for same period
CREATE UNIQUE INDEX idx_usage_records_unique_period 
ON usage_records (user_id, COALESCE(organization_id, ''), metric, period_start, period_end);