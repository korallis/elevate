-- Create billing plans table
CREATE TABLE billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  billing_interval VARCHAR(20) NOT NULL DEFAULT 'month', -- month, year
  features JSONB NOT NULL DEFAULT '{}',
  limits JSONB NOT NULL DEFAULT '{}',
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default plans
INSERT INTO billing_plans (name, display_name, description, price_cents, features, limits, sort_order) VALUES
('free', 'Free', 'Limited features for individuals', 0, 
 '{"dashboard_creation": true, "basic_connectors": true, "email_support": true}',
 '{"users": 1, "queries_per_month": 100, "dashboards": 3, "data_sources": 1}',
 1),
('starter', 'Starter', 'Perfect for small teams', 4900,
 '{"dashboard_creation": true, "all_connectors": true, "email_support": true, "basic_analytics": true}',
 '{"users": 5, "queries_per_month": 1000, "dashboards": 10, "data_sources": 3}',
 2),
('professional', 'Professional', 'Advanced features for growing businesses', 19900,
 '{"dashboard_creation": true, "all_connectors": true, "priority_support": true, "advanced_analytics": true, "custom_branding": true, "api_access": true}',
 '{"users": 20, "queries_per_month": 10000, "dashboards": 50, "data_sources": 10}',
 3),
('enterprise', 'Enterprise', 'Unlimited features for large organizations', 0,
 '{"dashboard_creation": true, "all_connectors": true, "premium_support": true, "advanced_analytics": true, "custom_branding": true, "api_access": true, "sso": true, "audit_logs": true}',
 '{"users": -1, "queries_per_month": -1, "dashboards": -1, "data_sources": -1}',
 4);

-- Create indexes
CREATE INDEX idx_billing_plans_name ON billing_plans(name);
CREATE INDEX idx_billing_plans_is_active ON billing_plans(is_active);
CREATE INDEX idx_billing_plans_sort_order ON billing_plans(sort_order);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_billing_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER billing_plans_updated_at_trigger
  BEFORE UPDATE ON billing_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_plans_updated_at();