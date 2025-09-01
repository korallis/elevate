import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';

interface ConsentRecord {
  id: number;
  subject_type: string;
  subject_value: string;
  consent_type: string;
  purpose: string;
  granted: boolean;
  granted_at: string | null;
  withdrawn_at: string | null;
  legal_basis: string;
  processor: string | null;
  retention_period_days: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ConsentRequest {
  subject_type: string;
  subject_value: string;
  consents: Array<{
    consent_type: string;
    purpose: string;
    legal_basis: string;
    granted: boolean;
    processor?: string;
    retention_period_days?: number;
    metadata?: Record<string, unknown>;
  }>;
}

interface ConsentAuditLog {
  id: number;
  consent_id: number;
  action: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown>;
  actor_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export class GDPRConsentManager {
  /**
   * Initialize consent management tables if they don't exist
   */
  async initialize(): Promise<void> {
    try {
      // Create consent records table
      await runPostgresQuery(`
        CREATE TABLE IF NOT EXISTS gdpr_consents (
          id BIGSERIAL PRIMARY KEY,
          subject_type TEXT NOT NULL,
          subject_value TEXT NOT NULL,
          consent_type TEXT NOT NULL,
          purpose TEXT NOT NULL,
          granted BOOLEAN NOT NULL DEFAULT false,
          granted_at TIMESTAMPTZ,
          withdrawn_at TIMESTAMPTZ,
          legal_basis TEXT NOT NULL,
          processor TEXT,
          retention_period_days INTEGER,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(subject_type, subject_value, consent_type, purpose)
        )
      `);

      // Create consent audit log table
      await runPostgresQuery(`
        CREATE TABLE IF NOT EXISTS gdpr_consent_audit (
          id BIGSERIAL PRIMARY KEY,
          consent_id BIGINT NOT NULL,
          action TEXT NOT NULL,
          previous_state JSONB,
          new_state JSONB NOT NULL,
          actor_id BIGINT,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create indexes
      await runPostgresQuery(`
        CREATE INDEX IF NOT EXISTS idx_gdpr_consents_subject 
        ON gdpr_consents(subject_type, subject_value)
      `);
      
      await runPostgresQuery(`
        CREATE INDEX IF NOT EXISTS idx_gdpr_consents_type_purpose 
        ON gdpr_consents(consent_type, purpose)
      `);
      
      await runPostgresQuery(`
        CREATE INDEX IF NOT EXISTS idx_gdpr_consent_audit_consent_id 
        ON gdpr_consent_audit(consent_id)
      `);

      logger.info('GDPR consent management initialized');
    } catch (error) {
      logger.error('Failed to initialize GDPR consent management', { error });
      throw error;
    }
  }

  /**
   * Record consent for a subject
   */
  async recordConsent(
    request: ConsentRequest,
    actorId?: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ConsentRecord[]> {
    const results: ConsentRecord[] = [];

    try {
      for (const consent of request.consents) {
        const [existing] = await runPostgresQuery<ConsentRecord>(`
          SELECT * FROM gdpr_consents 
          WHERE subject_type = $1 AND subject_value = $2 
            AND consent_type = $3 AND purpose = $4
        `, [request.subject_type, request.subject_value, consent.consent_type, consent.purpose]);

        let result: ConsentRecord;

        if (existing) {
          // Update existing consent
          const previousState = { ...existing };
          
          [result] = await runPostgresQuery<ConsentRecord>(`
            UPDATE gdpr_consents
            SET granted = $5,
                granted_at = CASE WHEN $5 = true THEN NOW() ELSE granted_at END,
                withdrawn_at = CASE WHEN $5 = false THEN NOW() ELSE NULL END,
                legal_basis = $6,
                processor = $7,
                retention_period_days = $8,
                metadata = $9,
                updated_at = NOW()
            WHERE subject_type = $1 AND subject_value = $2 
              AND consent_type = $3 AND purpose = $4
            RETURNING *
          `, [
            request.subject_type, request.subject_value, 
            consent.consent_type, consent.purpose,
            consent.granted, consent.legal_basis,
            consent.processor || null, consent.retention_period_days || null,
            consent.metadata ? JSON.stringify(consent.metadata) : null
          ]);

          // Log the change
          await this.logConsentChange(
            result.id,
            consent.granted ? 'updated_granted' : 'updated_withdrawn',
            previousState,
            result,
            actorId,
            ipAddress,
            userAgent
          );
        } else {
          // Create new consent record
          [result] = await runPostgresQuery<ConsentRecord>(`
            INSERT INTO gdpr_consents (
              subject_type, subject_value, consent_type, purpose, granted,
              granted_at, legal_basis, processor, retention_period_days, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
          `, [
            request.subject_type, request.subject_value,
            consent.consent_type, consent.purpose, consent.granted,
            consent.granted ? new Date().toISOString() : null,
            consent.legal_basis, consent.processor || null,
            consent.retention_period_days || null,
            consent.metadata ? JSON.stringify(consent.metadata) : null
          ]);

          // Log the creation
          await this.logConsentChange(
            result.id,
            consent.granted ? 'granted' : 'created_withdrawn',
            null,
            result,
            actorId,
            ipAddress,
            userAgent
          );
        }

        results.push(result);
      }

      logger.info('Consent recorded successfully', {
        subject_type: request.subject_type,
        subject_value: request.subject_value,
        consents_count: results.length
      });

      return results;
    } catch (error) {
      logger.error('Failed to record consent', { error, request });
      throw error;
    }
  }

  /**
   * Withdraw consent for specific purposes
   */
  async withdrawConsent(
    subject_type: string,
    subject_value: string,
    consent_types: string[],
    purposes?: string[],
    actorId?: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ConsentRecord[]> {
    try {
      let query = `
        UPDATE gdpr_consents
        SET granted = false,
            withdrawn_at = NOW(),
            updated_at = NOW()
        WHERE subject_type = $1 AND subject_value = $2 
          AND consent_type = ANY($3::text[])
          AND granted = true
      `;
      const params: unknown[] = [subject_type, subject_value, consent_types];

      if (purposes && purposes.length > 0) {
        query += ' AND purpose = ANY($4::text[])';
        params.push(purposes);
      }

      query += ' RETURNING *';

      const results = await runPostgresQuery<ConsentRecord>(query, params);

      // Log withdrawals
      for (const result of results) {
        await this.logConsentChange(
          result.id,
          'withdrawn',
          { granted: true, withdrawn_at: null },
          result,
          actorId,
          ipAddress,
          userAgent
        );
      }

      logger.info('Consent withdrawn', {
        subject_type,
        subject_value,
        consent_types,
        purposes,
        withdrawn_count: results.length
      });

      return results;
    } catch (error) {
      logger.error('Failed to withdraw consent', { error, subject_type, subject_value });
      throw error;
    }
  }

  /**
   * Get current consent status for a subject
   */
  async getConsentStatus(
    subject_type: string,
    subject_value: string,
    consent_type?: string,
    purpose?: string
  ): Promise<ConsentRecord[]> {
    let query = `
      SELECT * FROM gdpr_consents
      WHERE subject_type = $1 AND subject_value = $2
    `;
    const params: unknown[] = [subject_type, subject_value];
    let paramIndex = 3;

    if (consent_type) {
      query += ` AND consent_type = $${paramIndex++}`;
      params.push(consent_type);
    }

    if (purpose) {
      query += ` AND purpose = $${paramIndex}`;
      params.push(purpose);
    }

    query += ' ORDER BY consent_type, purpose, updated_at DESC';

    return runPostgresQuery<ConsentRecord>(query, params);
  }

  /**
   * Check if specific consent is granted
   */
  async hasValidConsent(
    subject_type: string,
    subject_value: string,
    consent_type: string,
    purpose: string
  ): Promise<{
    granted: boolean;
    consent_record?: ConsentRecord;
    reason?: string;
  }> {
    try {
      const [consent] = await runPostgresQuery<ConsentRecord>(`
        SELECT * FROM gdpr_consents
        WHERE subject_type = $1 AND subject_value = $2 
          AND consent_type = $3 AND purpose = $4
        ORDER BY updated_at DESC
        LIMIT 1
      `, [subject_type, subject_value, consent_type, purpose]);

      if (!consent) {
        return { granted: false, reason: 'No consent record found' };
      }

      if (!consent.granted) {
        return { 
          granted: false, 
          consent_record: consent,
          reason: consent.withdrawn_at ? 'Consent was withdrawn' : 'Consent not granted'
        };
      }

      // Check if consent has expired based on retention period
      if (consent.retention_period_days && consent.granted_at) {
        const grantedDate = new Date(consent.granted_at);
        const expiryDate = new Date(grantedDate.getTime() + (consent.retention_period_days * 24 * 60 * 60 * 1000));
        
        if (new Date() > expiryDate) {
          return {
            granted: false,
            consent_record: consent,
            reason: `Consent expired on ${expiryDate.toISOString()}`
          };
        }
      }

      return { granted: true, consent_record: consent };
    } catch (error) {
      logger.error('Failed to check consent validity', { error, subject_type, subject_value });
      return { granted: false, reason: 'Error checking consent' };
    }
  }

  /**
   * Get consent audit trail for a subject
   */
  async getConsentAuditTrail(
    subject_type: string,
    subject_value: string,
    limit = 100
  ): Promise<Array<ConsentAuditLog & { consent_type: string; purpose: string }>> {
    return runPostgresQuery(`
      SELECT 
        ca.*,
        c.consent_type,
        c.purpose
      FROM gdpr_consent_audit ca
      INNER JOIN gdpr_consents c ON ca.consent_id = c.id
      WHERE c.subject_type = $1 AND c.subject_value = $2
      ORDER BY ca.created_at DESC
      LIMIT $3
    `, [subject_type, subject_value, limit]);
  }

  /**
   * Log consent changes for audit trail
   */
  private async logConsentChange(
    consentId: number,
    action: string,
    previousState: any,
    newState: ConsentRecord,
    actorId?: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await runPostgresQuery(`
        INSERT INTO gdpr_consent_audit (
          consent_id, action, previous_state, new_state, 
          actor_id, ip_address, user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        consentId, action,
        previousState ? JSON.stringify(previousState) : null,
        JSON.stringify(newState),
        actorId || null, ipAddress || null, userAgent || null
      ]);
    } catch (error) {
      logger.warn('Failed to log consent change', { error, consentId, action });
    }
  }

  /**
   * Get consent statistics
   */
  async getConsentStatistics(filters: {
    consent_type?: string;
    purpose?: string;
    date_from?: string;
    date_to?: string;
  } = {}): Promise<{
    total_subjects: number;
    granted_consents: number;
    withdrawn_consents: number;
    expired_consents: number;
    by_type: Record<string, { granted: number; withdrawn: number }>;
    by_legal_basis: Record<string, number>;
    recent_changes: number; // Last 7 days
  }> {
    let whereClause = '1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.consent_type) {
      whereClause += ` AND consent_type = $${paramIndex++}`;
      params.push(filters.consent_type);
    }

    if (filters.purpose) {
      whereClause += ` AND purpose = $${paramIndex++}`;
      params.push(filters.purpose);
    }

    if (filters.date_from) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(filters.date_to);
    }

    const [stats] = await runPostgresQuery<{
      total_subjects: number;
      granted_consents: number;
      withdrawn_consents: number;
    }>(`
      SELECT 
        COUNT(DISTINCT CONCAT(subject_type, ':', subject_value)) as total_subjects,
        COUNT(*) FILTER (WHERE granted = true) as granted_consents,
        COUNT(*) FILTER (WHERE granted = false) as withdrawn_consents
      FROM gdpr_consents
      WHERE ${whereClause}
    `, params);

    const byType = await runPostgresQuery<{
      consent_type: string;
      granted: number;
      withdrawn: number;
    }>(`
      SELECT 
        consent_type,
        COUNT(*) FILTER (WHERE granted = true) as granted,
        COUNT(*) FILTER (WHERE granted = false) as withdrawn
      FROM gdpr_consents
      WHERE ${whereClause}
      GROUP BY consent_type
    `, params);

    const byLegalBasis = await runPostgresQuery<{
      legal_basis: string;
      count: number;
    }>(`
      SELECT 
        legal_basis,
        COUNT(*) as count
      FROM gdpr_consents
      WHERE ${whereClause}
      GROUP BY legal_basis
    `, params);

    const [recentChanges] = await runPostgresQuery<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM gdpr_consents
      WHERE ${whereClause} AND updated_at >= NOW() - INTERVAL '7 days'
    `, params);

    // Calculate expired consents
    const [expiredCount] = await runPostgresQuery<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM gdpr_consents
      WHERE ${whereClause}
        AND granted = true
        AND retention_period_days IS NOT NULL
        AND granted_at + (retention_period_days || ' days')::INTERVAL < NOW()
    `, params);

    return {
      total_subjects: Number(stats.total_subjects),
      granted_consents: Number(stats.granted_consents),
      withdrawn_consents: Number(stats.withdrawn_consents),
      expired_consents: Number(expiredCount.count),
      by_type: byType.reduce((acc, item) => {
        acc[item.consent_type] = {
          granted: Number(item.granted),
          withdrawn: Number(item.withdrawn)
        };
        return acc;
      }, {} as Record<string, { granted: number; withdrawn: number }>),
      by_legal_basis: byLegalBasis.reduce((acc, item) => {
        acc[item.legal_basis] = Number(item.count);
        return acc;
      }, {} as Record<string, number>),
      recent_changes: Number(recentChanges.count)
    };
  }

  /**
   * Clean up expired consents
   */
  async cleanupExpiredConsents(): Promise<{ updated_count: number }> {
    try {
      const results = await runPostgresQuery<ConsentRecord>(`
        UPDATE gdpr_consents
        SET granted = false,
            withdrawn_at = NOW(),
            updated_at = NOW()
        WHERE granted = true
          AND retention_period_days IS NOT NULL
          AND granted_at + (retention_period_days || ' days')::INTERVAL < NOW()
        RETURNING *
      `);

      // Log the automatic withdrawals
      for (const result of results) {
        await this.logConsentChange(
          result.id,
          'expired',
          { granted: true },
          result
        );
      }

      logger.info('Expired consents cleaned up', { updated_count: results.length });

      return { updated_count: results.length };
    } catch (error) {
      logger.error('Failed to cleanup expired consents', { error });
      throw error;
    }
  }

  /**
   * Export consent data for a subject
   */
  async exportConsentData(
    subject_type: string,
    subject_value: string
  ): Promise<{
    consents: ConsentRecord[];
    audit_trail: Array<ConsentAuditLog & { consent_type: string; purpose: string }>;
    summary: {
      total_consents: number;
      granted_consents: number;
      withdrawn_consents: number;
      export_generated_at: string;
    };
  }> {
    const consents = await this.getConsentStatus(subject_type, subject_value);
    const auditTrail = await this.getConsentAuditTrail(subject_type, subject_value, 1000);

    return {
      consents,
      audit_trail: auditTrail,
      summary: {
        total_consents: consents.length,
        granted_consents: consents.filter(c => c.granted).length,
        withdrawn_consents: consents.filter(c => !c.granted).length,
        export_generated_at: new Date().toISOString()
      }
    };
  }

  /**
   * Get predefined consent types and purposes
   */
  getConsentTemplates(): Record<string, Array<{
    purpose: string;
    description: string;
    legal_basis: string;
    retention_period_days?: number;
    required: boolean;
  }>> {
    return {
      'marketing': [
        {
          purpose: 'email_marketing',
          description: 'Send promotional emails and newsletters',
          legal_basis: 'consent',
          retention_period_days: 1095, // 3 years
          required: false
        },
        {
          purpose: 'sms_marketing',
          description: 'Send promotional SMS messages',
          legal_basis: 'consent',
          retention_period_days: 1095,
          required: false
        },
        {
          purpose: 'targeted_advertising',
          description: 'Show personalized advertisements',
          legal_basis: 'consent',
          retention_period_days: 365,
          required: false
        }
      ],
      'analytics': [
        {
          purpose: 'website_analytics',
          description: 'Analyze website usage and performance',
          legal_basis: 'legitimate_interest',
          retention_period_days: 1095,
          required: false
        },
        {
          purpose: 'user_behavior_tracking',
          description: 'Track user behavior for service improvement',
          legal_basis: 'consent',
          retention_period_days: 730, // 2 years
          required: false
        }
      ],
      'functional': [
        {
          purpose: 'service_provision',
          description: 'Provide core service functionality',
          legal_basis: 'contract',
          required: true
        },
        {
          purpose: 'account_management',
          description: 'Manage user accounts and profiles',
          legal_basis: 'contract',
          required: true
        },
        {
          purpose: 'customer_support',
          description: 'Provide customer support services',
          legal_basis: 'contract',
          retention_period_days: 2555, // 7 years
          required: true
        }
      ],
      'legal': [
        {
          purpose: 'compliance_monitoring',
          description: 'Monitor compliance with legal obligations',
          legal_basis: 'legal_obligation',
          retention_period_days: 2555,
          required: true
        },
        {
          purpose: 'fraud_prevention',
          description: 'Prevent fraudulent activities',
          legal_basis: 'legitimate_interest',
          retention_period_days: 1825, // 5 years
          required: true
        }
      ]
    };
  }
}