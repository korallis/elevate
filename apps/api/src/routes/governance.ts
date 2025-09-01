import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { 
  PIIDetector, PIIMasker, PIIRulesEngine,
  RLSEngine, RLSPolicyBuilder, RLSValidator,
  GDPRExporter, GDPRDeleter, GDPRConsentManager
} from '../governance/index.js';
import { logger } from '../logger.js';
import { useBudget, getActorKey } from '../budget.js';

const governance = new Hono();

// Initialize governance services
const piiDetector = new PIIDetector();
const piiMasker = new PIIMasker();
const piiRules = new PIIRulesEngine();
const rlsEngine = new RLSEngine();
const rlsPolicyBuilder = new RLSPolicyBuilder();
const rlsValidator = new RLSValidator();
const gdprExporter = new GDPRExporter();
const gdprDeleter = new GDPRDeleter();
const consentManager = new GDPRConsentManager();

// Initialize governance systems on module load
Promise.all([
  piiDetector.initialize(),
  consentManager.initialize()
]).catch(error => {
  logger.error('Failed to initialize governance services', { error });
});

// =============================================================================
// PII MANAGEMENT ENDPOINTS
// =============================================================================

// PII Detection and Scanning
governance.get('/pii/scan', zValidator('query', z.object({
  database: z.string(),
  schema: z.string(),
  table: z.string().optional(),
  confidence_threshold: z.number().min(0).max(1).optional(),
  sample_size: z.number().positive().optional()
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 5);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  const { database, schema, table, confidence_threshold, sample_size } = c.req.valid('query');
  
  try {
    const scanResult = await piiDetector.scanForPII({
      database_name: database,
      schema_name: schema,
      table_name: table,
      confidence_threshold,
      sample_size
    });

    return c.json(scanResult);
  } catch (error) {
    logger.error('PII scan failed', { error });
    return c.json({ error: 'scan_failed' }, 500);
  }
});

governance.post('/pii/tag', zValidator('json', z.object({
  database_name: z.string(),
  schema_name: z.string(),
  table_name: z.string(),
  column_name: z.string(),
  pii_type: z.string(),
  masking_rule: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  const data = c.req.valid('json');
  
  try {
    const result = await piiDetector.tagPIIColumn(
      data.database_name,
      data.schema_name,
      data.table_name,
      data.column_name,
      data.pii_type,
      data.masking_rule,
      data.confidence
    );

    return c.json(result);
  } catch (error) {
    logger.error('PII tagging failed', { error });
    return c.json({ error: 'tagging_failed' }, 500);
  }
});

governance.post('/pii/mask', zValidator('json', z.object({
  data: z.array(z.record(z.unknown())),
  masking_rules: z.record(z.object({
    rule: z.enum(['none', 'hash', 'redact', 'partial', 'encrypt', 'tokenize']),
    config: z.record(z.unknown()).optional()
  }))
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  const { data, masking_rules } = c.req.valid('json');
  
  try {
    const maskedData = piiMasker.maskQueryResults(data, masking_rules);
    return c.json({ masked_data: maskedData });
  } catch (error) {
    logger.error('Data masking failed', { error });
    return c.json({ error: 'masking_failed' }, 500);
  }
});

governance.get('/pii/columns', zValidator('query', z.object({
  database: z.string(),
  schema: z.string(),
  table: z.string().optional()
})), async (c) => {
  const { database, schema, table } = c.req.valid('query');
  
  try {
    const columns = await piiDetector.getPIIColumns(database, schema, table);
    return c.json(columns);
  } catch (error) {
    logger.error('Failed to get PII columns', { error });
    return c.json({ error: 'fetch_failed' }, 500);
  }
});

governance.get('/pii/statistics', zValidator('query', z.object({
  database: z.string(),
  schema: z.string()
})), async (c) => {
  const { database, schema } = c.req.valid('query');
  
  try {
    const stats = await piiDetector.getDetectionStatistics(database, schema);
    return c.json(stats);
  } catch (error) {
    logger.error('Failed to get PII statistics', { error });
    return c.json({ error: 'stats_failed' }, 500);
  }
});

// PII Rules Management
governance.get('/pii/rules', async (c) => {
  try {
    const rules = await piiRules.getDetectionRules();
    return c.json(rules);
  } catch (error) {
    logger.error('Failed to get PII rules', { error });
    return c.json({ error: 'fetch_failed' }, 500);
  }
});

governance.get('/pii/masking-strategies', async (c) => {
  try {
    const strategies = piiRules.getMaskingStrategies();
    return c.json(strategies);
  } catch (error) {
    logger.error('Failed to get masking strategies', { error });
    return c.json({ error: 'fetch_failed' }, 500);
  }
});

// =============================================================================
// ROW-LEVEL SECURITY ENDPOINTS
// =============================================================================

governance.get('/rls/policies', zValidator('query', z.object({
  database_name: z.string().optional(),
  schema_name: z.string().optional(),
  table_name: z.string().optional(),
  enabled: z.boolean().optional()
})), async (c) => {
  const filters = c.req.valid('query');
  
  try {
    const policies = await rlsEngine.getPolicies(filters);
    return c.json(policies);
  } catch (error) {
    logger.error('Failed to get RLS policies', { error });
    return c.json({ error: 'fetch_failed' }, 500);
  }
});

governance.post('/rls/policies', zValidator('json', z.object({
  name: z.string(),
  description: z.string().optional(),
  database_name: z.string(),
  schema_name: z.string(),
  table_name: z.string(),
  filter_expression: z.string(),
  role_id: z.number().optional(),
  enabled: z.boolean().default(true)
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  const data = c.req.valid('json');
  const actorKey = getActorKey(c.req.raw.headers);
  
  try {
    // Get user ID from actor key (simplified)
    const createdBy = 1; // In real implementation, extract from JWT/session

    const policy = await rlsEngine.createPolicy(
      data.name,
      data.description || null,
      data.database_name,
      data.schema_name,
      data.table_name,
      data.filter_expression,
      data.role_id || null,
      createdBy,
      data.enabled
    );

    return c.json(policy);
  } catch (error) {
    logger.error('Failed to create RLS policy', { error });
    return c.json({ error: 'creation_failed', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

governance.post('/rls/apply', zValidator('json', z.object({
  query: z.string(),
  user_id: z.number(),
  department_id: z.number().optional(),
  org_id: z.number().optional()
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 2);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  const { query, user_id, department_id, org_id } = c.req.valid('json');
  
  try {
    const result = await rlsEngine.applyRLSFilters(query, user_id, department_id, org_id);
    return c.json(result);
  } catch (error) {
    logger.error('Failed to apply RLS filters', { error });
    return c.json({ error: 'rls_failed' }, 500);
  }
});

governance.get('/rls/templates', async (c) => {
  try {
    const templates = rlsPolicyBuilder.getPolicyTemplates();
    return c.json(templates);
  } catch (error) {
    logger.error('Failed to get RLS templates', { error });
    return c.json({ error: 'fetch_failed' }, 500);
  }
});

governance.post('/rls/validate', zValidator('json', z.object({
  database_name: z.string(),
  schema_name: z.string(),
  table_name: z.string()
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 4);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  const { database_name, schema_name, table_name } = c.req.valid('json');
  
  try {
    const validation = await rlsValidator.validatePolicies(database_name, schema_name, table_name);
    return c.json(validation);
  } catch (error) {
    logger.error('Failed to validate RLS policies', { error });
    return c.json({ error: 'validation_failed' }, 500);
  }
});

// =============================================================================
// GDPR COMPLIANCE ENDPOINTS
// =============================================================================

// GDPR Export (Right to Data Portability)
governance.post('/gdpr/export', zValidator('json', z.object({
  subject_type: z.string(),
  subject_value: z.string(),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 10);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  const data = c.req.valid('json');
  
  try {
    // Get requesting user ID (simplified)
    const requestedBy = 1; // In real implementation, extract from JWT/session

    const request = await gdprExporter.createExportRequest(
      data.subject_type,
      data.subject_value,
      requestedBy,
      data.reason,
      data.metadata
    );

    return c.json(request);
  } catch (error) {
    logger.error('Failed to create GDPR export request', { error });
    return c.json({ error: 'export_failed' }, 500);
  }
});

governance.get('/gdpr/export/:id', async (c) => {
  const requestId = parseInt(c.req.param('id'));
  
  try {
    const status = await gdprExporter.getExportStatus(requestId);
    return c.json(status);
  } catch (error) {
    logger.error('Failed to get export status', { error });
    return c.json({ error: 'status_failed' }, 500);
  }
});

// GDPR Delete (Right to be Forgotten)
governance.post('/gdpr/delete', zValidator('json', z.object({
  subject_type: z.string(),
  subject_value: z.string(),
  reason: z.string().optional(),
  options: z.object({
    cascade_delete: z.boolean().optional(),
    soft_delete: z.boolean().optional(),
    backup_before_delete: z.boolean().optional(),
    verification_required: z.boolean().optional()
  }).optional(),
  metadata: z.record(z.unknown()).optional()
})), async (c) => {
  const budget = useBudget(c.req.raw.headers, 15);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  const data = c.req.valid('json');
  
  try {
    // Get requesting user ID (simplified)
    const requestedBy = 1; // In real implementation, extract from JWT/session

    const request = await gdprDeleter.createDeletionRequest(
      data.subject_type,
      data.subject_value,
      requestedBy,
      data.reason,
      data.options,
      data.metadata
    );

    return c.json(request);
  } catch (error) {
    logger.error('Failed to create GDPR deletion request', { error });
    return c.json({ error: 'deletion_failed' }, 500);
  }
});

governance.get('/gdpr/delete/:id', async (c) => {
  const requestId = parseInt(c.req.param('id'));
  
  try {
    const status = await gdprDeleter.getDeletionStatus(requestId);
    return c.json(status);
  } catch (error) {
    logger.error('Failed to get deletion status', { error });
    return c.json({ error: 'status_failed' }, 500);
  }
});

governance.post('/gdpr/delete/:id/approve', async (c) => {
  const requestId = parseInt(c.req.param('id'));
  
  try {
    // Get approving user ID (simplified)
    const approvedBy = 1; // In real implementation, extract from JWT/session

    await gdprDeleter.approveDeletionRequest(requestId, approvedBy);
    return c.json({ success: true });
  } catch (error) {
    logger.error('Failed to approve deletion request', { error });
    return c.json({ error: 'approval_failed' }, 500);
  }
});

// GDPR Consent Management
governance.post('/gdpr/consent', zValidator('json', z.object({
  subject_type: z.string(),
  subject_value: z.string(),
  consents: z.array(z.object({
    consent_type: z.string(),
    purpose: z.string(),
    legal_basis: z.string(),
    granted: z.boolean(),
    processor: z.string().optional(),
    retention_period_days: z.number().optional(),
    metadata: z.record(z.unknown()).optional()
  }))
})), async (c) => {
  const data = c.req.valid('json');
  
  try {
    const results = await consentManager.recordConsent(data);
    return c.json(results);
  } catch (error) {
    logger.error('Failed to record consent', { error });
    return c.json({ error: 'consent_failed' }, 500);
  }
});

governance.get('/gdpr/consent', zValidator('query', z.object({
  subject_type: z.string(),
  subject_value: z.string(),
  consent_type: z.string().optional(),
  purpose: z.string().optional()
})), async (c) => {
  const { subject_type, subject_value, consent_type, purpose } = c.req.valid('query');
  
  try {
    const consents = await consentManager.getConsentStatus(subject_type, subject_value, consent_type, purpose);
    return c.json(consents);
  } catch (error) {
    logger.error('Failed to get consent status', { error });
    return c.json({ error: 'fetch_failed' }, 500);
  }
});

governance.post('/gdpr/consent/withdraw', zValidator('json', z.object({
  subject_type: z.string(),
  subject_value: z.string(),
  consent_types: z.array(z.string()),
  purposes: z.array(z.string()).optional()
})), async (c) => {
  const { subject_type, subject_value, consent_types, purposes } = c.req.valid('json');
  
  try {
    const results = await consentManager.withdrawConsent(subject_type, subject_value, consent_types, purposes);
    return c.json(results);
  } catch (error) {
    logger.error('Failed to withdraw consent', { error });
    return c.json({ error: 'withdrawal_failed' }, 500);
  }
});

governance.get('/gdpr/consent/templates', async (c) => {
  try {
    const templates = consentManager.getConsentTemplates();
    return c.json(templates);
  } catch (error) {
    logger.error('Failed to get consent templates', { error });
    return c.json({ error: 'fetch_failed' }, 500);
  }
});

governance.get('/gdpr/consent/statistics', zValidator('query', z.object({
  consent_type: z.string().optional(),
  purpose: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional()
})), async (c) => {
  const filters = c.req.valid('query');
  
  try {
    const stats = await consentManager.getConsentStatistics(filters);
    return c.json(stats);
  } catch (error) {
    logger.error('Failed to get consent statistics', { error });
    return c.json({ error: 'stats_failed' }, 500);
  }
});

// General GDPR Requests
governance.get('/gdpr/requests', zValidator('query', z.object({
  type: z.enum(['export', 'delete', 'rectify', 'portability']).optional(),
  status: z.string().optional(),
  subject_type: z.string().optional(),
  limit: z.number().positive().max(100).optional()
})), async (c) => {
  const filters = c.req.valid('query');
  
  try {
    // This would need a combined query across both exporters and deleters
    // For now, just return export requests as an example
    const requests = await gdprExporter.getExportRequests({
      status: filters.status,
      subject_type: filters.subject_type,
      limit: filters.limit
    });
    
    return c.json(requests);
  } catch (error) {
    logger.error('Failed to get GDPR requests', { error });
    return c.json({ error: 'fetch_failed' }, 500);
  }
});

// =============================================================================
// GOVERNANCE OVERVIEW AND STATISTICS
// =============================================================================

governance.get('/overview', zValidator('query', z.object({
  database: z.string().optional(),
  schema: z.string().optional()
})), async (c) => {
  const { database, schema } = c.req.valid('query');
  
  try {
    // This would aggregate statistics across all governance systems
    const overview = {
      pii_detection: database && schema ? await piiDetector.getDetectionStatistics(database, schema) : null,
      rls_policies: await rlsEngine.getStatistics(),
      consent_management: await consentManager.getConsentStatistics(),
      system_status: {
        services_healthy: true,
        last_scan: new Date().toISOString(),
        active_policies: 0 // Would be calculated
      }
    };

    return c.json(overview);
  } catch (error) {
    logger.error('Failed to get governance overview', { error });
    return c.json({ error: 'overview_failed' }, 500);
  }
});

export default governance;