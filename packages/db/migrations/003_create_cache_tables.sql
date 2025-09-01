-- Create query cache metadata table
CREATE TABLE query_cache_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key VARCHAR(255) NOT NULL UNIQUE,
  query_hash VARCHAR(64) NOT NULL,
  table_dependencies TEXT[] NOT NULL DEFAULT '{}',
  hit_count BIGINT NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  data_size BIGINT, -- Size of cached data in bytes
  query_execution_time_ms INTEGER, -- Original query execution time
  created_by VARCHAR(255),
  tags TEXT[] DEFAULT '{}'
);

-- Create cache invalidation rules table
CREATE TABLE cache_invalidation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(255) NOT NULL,
  database_name VARCHAR(255) NOT NULL,
  schema_name VARCHAR(255) NOT NULL,
  invalidation_strategy VARCHAR(50) NOT NULL DEFAULT 'time_based',
  ttl_seconds INTEGER DEFAULT 3600,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(table_name, database_name, schema_name)
);

-- Create cache statistics table for monitoring
CREATE TABLE cache_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_requests BIGINT NOT NULL DEFAULT 0,
  cache_hits BIGINT NOT NULL DEFAULT 0,
  cache_misses BIGINT NOT NULL DEFAULT 0,
  total_cache_size_bytes BIGINT NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date)
);

-- Create indexes for better query performance
CREATE INDEX idx_query_cache_metadata_cache_key ON query_cache_metadata(cache_key);
CREATE INDEX idx_query_cache_metadata_query_hash ON query_cache_metadata(query_hash);
CREATE INDEX idx_query_cache_metadata_expires_at ON query_cache_metadata(expires_at);
CREATE INDEX idx_query_cache_metadata_created_at ON query_cache_metadata(created_at DESC);
CREATE INDEX idx_query_cache_metadata_hit_count ON query_cache_metadata(hit_count DESC);
CREATE INDEX idx_query_cache_metadata_table_deps ON query_cache_metadata USING GIN (table_dependencies);

CREATE INDEX idx_cache_invalidation_rules_table ON cache_invalidation_rules(table_name, database_name, schema_name);
CREATE INDEX idx_cache_invalidation_rules_strategy ON cache_invalidation_rules(invalidation_strategy);
CREATE INDEX idx_cache_invalidation_rules_active ON cache_invalidation_rules(is_active);

CREATE INDEX idx_cache_statistics_date ON cache_statistics(date DESC);

-- Create function to automatically update cache hit statistics
CREATE OR REPLACE FUNCTION update_cache_hit_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update daily statistics
  INSERT INTO cache_statistics (date, total_requests, cache_hits)
  VALUES (CURRENT_DATE, 1, 1)
  ON CONFLICT (date) 
  DO UPDATE SET 
    total_requests = cache_statistics.total_requests + 1,
    cache_hits = cache_statistics.cache_hits + 1;
    
  -- Update metadata hit count and last hit time
  UPDATE query_cache_metadata 
  SET 
    hit_count = hit_count + 1,
    last_hit_at = CURRENT_TIMESTAMP
  WHERE cache_key = NEW.cache_key;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to track cache misses
CREATE OR REPLACE FUNCTION track_cache_miss()
RETURNS void AS $$
BEGIN
  INSERT INTO cache_statistics (date, total_requests, cache_misses)
  VALUES (CURRENT_DATE, 1, 1)
  ON CONFLICT (date) 
  DO UPDATE SET 
    total_requests = cache_statistics.total_requests + 1,
    cache_misses = cache_statistics.cache_misses + 1;
END;
$$ LANGUAGE plpgsql;

-- Create function to cleanup expired cache metadata
CREATE OR REPLACE FUNCTION cleanup_expired_cache_metadata()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM query_cache_metadata 
  WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get cache statistics
CREATE OR REPLACE FUNCTION get_cache_stats(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  date DATE,
  total_requests BIGINT,
  cache_hits BIGINT,
  cache_misses BIGINT,
  hit_rate NUMERIC,
  total_cache_size_bytes BIGINT,
  avg_response_time_ms INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.date,
    cs.total_requests,
    cs.cache_hits,
    cs.cache_misses,
    CASE 
      WHEN cs.total_requests > 0 
      THEN ROUND((cs.cache_hits::NUMERIC / cs.total_requests) * 100, 2)
      ELSE 0 
    END as hit_rate,
    cs.total_cache_size_bytes,
    cs.avg_response_time_ms
  FROM cache_statistics cs
  WHERE cs.date >= CURRENT_DATE - INTERVAL '1 day' * days_back
  ORDER BY cs.date DESC;
END;
$$ LANGUAGE plpgsql;