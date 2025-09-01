import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';
import { PIIMasker } from './pii-masker.js';
import type { PIIDetectionRule, MaskingRule, MaskingStrategy, PIIType } from './types.js';

export class PIIRulesEngine {
  private masker: PIIMasker;

  constructor() {
    this.masker = new PIIMasker();
  }

  /**
   * Create or update a PII detection rule
   */
  async upsertDetectionRule(
    pattern: string,
    pii_type: PIIType,
    confidence: number,
    description?: string,
    enabled = true
  ): Promise<PIIDetectionRule> {
    try {
      const [result] = await runPostgresQuery<PIIDetectionRule>(`
        INSERT INTO pii_detection_rules (pattern, pii_type, confidence, description, enabled, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (pattern, pii_type) 
        DO UPDATE SET 
          confidence = EXCLUDED.confidence,
          description = EXCLUDED.description,
          enabled = EXCLUDED.enabled,
          updated_at = NOW()
        RETURNING *
      `, [pattern, pii_type, confidence, description, enabled]);

      logger.info('PII detection rule created/updated', {
        pattern,
        pii_type,
        confidence,
        enabled
      });

      return result;
    } catch (error) {
      logger.error('Failed to upsert PII detection rule', { error, pattern, pii_type });
      throw error;
    }
  }

  /**
   * Get all detection rules, optionally filtered by type or status
   */
  async getDetectionRules(
    pii_type?: PIIType,
    enabled?: boolean
  ): Promise<PIIDetectionRule[]> {
    let query = 'SELECT * FROM pii_detection_rules WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (pii_type) {
      query += ` AND pii_type = $${paramIndex}`;
      params.push(pii_type);
      paramIndex++;
    }

    if (enabled !== undefined) {
      query += ` AND enabled = $${paramIndex}`;
      params.push(enabled);
    }

    query += ' ORDER BY confidence DESC, pii_type, pattern';

    return runPostgresQuery<PIIDetectionRule>(query, params);
  }

  /**
   * Delete a detection rule
   */
  async deleteDetectionRule(id: number): Promise<void> {
    await runPostgresQuery('DELETE FROM pii_detection_rules WHERE id = $1', [id]);
    logger.info('PII detection rule deleted', { id });
  }

  /**
   * Enable or disable a detection rule
   */
  async toggleDetectionRule(id: number, enabled: boolean): Promise<PIIDetectionRule> {
    const [result] = await runPostgresQuery<PIIDetectionRule>(`
      UPDATE pii_detection_rules 
      SET enabled = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, enabled]);

    logger.info('PII detection rule toggled', { id, enabled });
    return result;
  }

  /**
   * Test detection rules against sample column names
   */
  async testDetectionRules(columnNames: string[]): Promise<{
    column_name: string;
    matches: Array<{
      rule_id: number;
      pattern: string;
      pii_type: string;
      confidence: number;
    }>;
  }[]> {
    const rules = await this.getDetectionRules(undefined, true);
    const results: {
      column_name: string;
      matches: Array<{
        rule_id: number;
        pattern: string;
        pii_type: string;
        confidence: number;
      }>;
    }[] = [];

    for (const columnName of columnNames) {
      const matches: Array<{
        rule_id: number;
        pattern: string;
        pii_type: string;
        confidence: number;
      }> = [];

      for (const rule of rules) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(columnName.toLowerCase())) {
            matches.push({
              rule_id: rule.id,
              pattern: rule.pattern,
              pii_type: rule.pii_type,
              confidence: rule.confidence
            });
          }
        } catch (error) {
          logger.warn('Invalid regex pattern in detection rule', {
            rule_id: rule.id,
            pattern: rule.pattern,
            error
          });
        }
      }

      results.push({
        column_name: columnName,
        matches: matches.sort((a, b) => b.confidence - a.confidence)
      });
    }

    return results;
  }

  /**
   * Get predefined masking strategies for different PII types
   */
  getMaskingStrategies(): Record<PIIType, MaskingStrategy[]> {
    return {
      email: [
        { type: 'partial', config: { partial_show_first: 2, partial_show_last: 0, replacement_char: '*' } },
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'tokenize', config: {} },
        { type: 'redact', config: {} }
      ],
      ssn: [
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'partial', config: { partial_show_first: 0, partial_show_last: 4, replacement_char: 'X' } },
        { type: 'tokenize', config: {} },
        { type: 'redact', config: {} }
      ],
      phone: [
        { type: 'partial', config: { partial_show_first: 3, partial_show_last: 4, replacement_char: '-' } },
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'redact', config: {} }
      ],
      name: [
        { type: 'partial', config: { partial_show_first: 1, partial_show_last: 1, replacement_char: '*' } },
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'redact', config: {} }
      ],
      address: [
        { type: 'redact', config: {} },
        { type: 'partial', config: { partial_show_first: 0, partial_show_last: 5, replacement_char: '*' } },
        { type: 'hash', config: { algorithm: 'sha256' } }
      ],
      credit_card: [
        { type: 'tokenize', config: {} },
        { type: 'partial', config: { partial_show_first: 4, partial_show_last: 4, replacement_char: '*' } },
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'redact', config: {} }
      ],
      date_of_birth: [
        { type: 'partial', config: { partial_show_first: 0, partial_show_last: 4, replacement_char: 'X' } },
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'redact', config: {} }
      ],
      ip_address: [
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'partial', config: { partial_show_first: 7, partial_show_last: 0, replacement_char: 'X' } },
        { type: 'redact', config: {} }
      ],
      id_number: [
        { type: 'tokenize', config: {} },
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'partial', config: { partial_show_first: 2, partial_show_last: 2, replacement_char: '*' } },
        { type: 'redact', config: {} }
      ],
      custom: [
        { type: 'redact', config: {} },
        { type: 'hash', config: { algorithm: 'sha256' } },
        { type: 'partial', config: { partial_show_first: 2, partial_show_last: 2, replacement_char: '*' } }
      ]
    };
  }

  /**
   * Get recommended masking rule for a PII type
   */
  getRecommendedMasking(pii_type: PIIType): MaskingStrategy {
    const strategies = this.getMaskingStrategies();
    return strategies[pii_type]?.[0] || { type: 'redact', config: {} };
  }

  /**
   * Validate a masking strategy configuration
   */
  validateMaskingStrategy(strategy: MaskingStrategy): { valid: boolean; errors: string[] } {
    return this.masker.validateMaskingRule(strategy.type, strategy.config);
  }

  /**
   * Test masking strategy with sample data
   */
  testMaskingStrategy(
    strategy: MaskingStrategy,
    sampleValues: string[]
  ): { original: string; masked: string }[] {
    return this.masker.testMaskingRule(strategy.type, strategy.config, sampleValues);
  }

  /**
   * Get compliance recommendations for PII types
   */
  getComplianceRecommendations(): Record<PIIType, {
    frameworks: string[];
    retention_days?: number;
    masking_required: boolean;
    encryption_required: boolean;
    access_controls: string[];
  }> {
    return {
      email: {
        frameworks: ['GDPR', 'CCPA'],
        retention_days: 2555, // 7 years
        masking_required: false,
        encryption_required: false,
        access_controls: ['authenticated_users']
      },
      ssn: {
        frameworks: ['SOX', 'CCPA'],
        retention_days: 2555,
        masking_required: true,
        encryption_required: true,
        access_controls: ['hr_staff', 'compliance_team']
      },
      phone: {
        frameworks: ['GDPR', 'CCPA'],
        retention_days: 1825, // 5 years
        masking_required: false,
        encryption_required: false,
        access_controls: ['authenticated_users']
      },
      name: {
        frameworks: ['GDPR', 'CCPA'],
        retention_days: 2555,
        masking_required: false,
        encryption_required: false,
        access_controls: ['authenticated_users']
      },
      address: {
        frameworks: ['GDPR', 'CCPA'],
        retention_days: 2555,
        masking_required: true,
        encryption_required: false,
        access_controls: ['authenticated_users']
      },
      credit_card: {
        frameworks: ['PCI_DSS', 'CCPA'],
        retention_days: 365,
        masking_required: true,
        encryption_required: true,
        access_controls: ['payment_processors', 'compliance_team']
      },
      date_of_birth: {
        frameworks: ['GDPR', 'HIPAA', 'CCPA'],
        retention_days: 2555,
        masking_required: true,
        encryption_required: false,
        access_controls: ['authenticated_users', 'healthcare_staff']
      },
      ip_address: {
        frameworks: ['GDPR'],
        retention_days: 90,
        masking_required: true,
        encryption_required: false,
        access_controls: ['system_admins', 'security_team']
      },
      id_number: {
        frameworks: ['GDPR', 'CCPA', 'SOX'],
        retention_days: 2555,
        masking_required: true,
        encryption_required: true,
        access_controls: ['compliance_team', 'identity_verification']
      },
      custom: {
        frameworks: ['GDPR'],
        retention_days: 365,
        masking_required: false,
        encryption_required: false,
        access_controls: ['authenticated_users']
      }
    };
  }

  /**
   * Generate masking policy documentation
   */
  async generatePolicyDocumentation(): Promise<{
    detection_rules: PIIDetectionRule[];
    masking_strategies: Record<PIIType, MaskingStrategy[]>;
    compliance_matrix: Record<PIIType, any>;
    statistics: {
      total_rules: number;
      enabled_rules: number;
      pii_types_covered: number;
    };
  }> {
    const detectionRules = await this.getDetectionRules();
    const maskingStrategies = this.getMaskingStrategies();
    const complianceMatrix = this.getComplianceRecommendations();

    const statistics = {
      total_rules: detectionRules.length,
      enabled_rules: detectionRules.filter(r => r.enabled).length,
      pii_types_covered: new Set(detectionRules.map(r => r.pii_type)).size
    };

    return {
      detection_rules: detectionRules,
      masking_strategies: maskingStrategies,
      compliance_matrix: complianceMatrix,
      statistics
    };
  }

  /**
   * Import detection rules from configuration
   */
  async importDetectionRules(rules: Array<{
    pattern: string;
    pii_type: PIIType;
    confidence: number;
    description?: string;
    enabled?: boolean;
  }>): Promise<PIIDetectionRule[]> {
    const results: PIIDetectionRule[] = [];

    for (const rule of rules) {
      const result = await this.upsertDetectionRule(
        rule.pattern,
        rule.pii_type,
        rule.confidence,
        rule.description,
        rule.enabled ?? true
      );
      results.push(result);
    }

    logger.info('Imported PII detection rules', { count: results.length });
    return results;
  }

  /**
   * Export detection rules for backup or configuration
   */
  async exportDetectionRules(): Promise<Array<{
    pattern: string;
    pii_type: string;
    confidence: number;
    description: string | null;
    enabled: boolean;
  }>> {
    const rules = await this.getDetectionRules();
    
    return rules.map(rule => ({
      pattern: rule.pattern,
      pii_type: rule.pii_type,
      confidence: rule.confidence,
      description: rule.description,
      enabled: rule.enabled
    }));
  }
}