import * as crypto from 'node:crypto';
import { logger } from '../logger.js';
import type { MaskingStrategy, MaskingRule } from './types.js';

export class PIIMasker {
  private readonly algorithms = ['sha256', 'sha1', 'md5'] as const;
  private readonly defaultKey = 'elev8-pii-masking-key-2025';

  /**
   * Apply masking to a single value based on the masking rule
   */
  maskValue(value: unknown, rule: MaskingRule, config?: MaskingStrategy['config']): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);
    
    try {
      switch (rule) {
        case 'none':
          return stringValue;
          
        case 'hash':
          return this.hashValue(stringValue, config);
          
        case 'redact':
          return this.redactValue(stringValue, config);
          
        case 'partial':
          return this.partialMask(stringValue, config);
          
        case 'encrypt':
          return this.encryptValue(stringValue, config);
          
        case 'tokenize':
          return this.tokenizeValue(stringValue, config);
          
        default:
          logger.warn('Unknown masking rule, using redact', { rule });
          return this.redactValue(stringValue, config);
      }
    } catch (error) {
      logger.error('Masking failed, returning redacted value', { error, rule });
      return '[MASKED]';
    }
  }

  /**
   * Hash-based masking - creates irreversible hash
   */
  private hashValue(value: string, config?: MaskingStrategy['config']): string {
    const algorithm = config?.algorithm || 'sha256';
    const key = config?.key || this.defaultKey;
    
    if (!this.algorithms.includes(algorithm as any)) {
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }
    
    const hash = crypto.createHmac(algorithm, key);
    hash.update(value);
    return hash.digest('hex').substring(0, 16); // Truncate for readability
  }

  /**
   * Redaction masking - completely replaces with placeholder
   */
  private redactValue(value: string, config?: MaskingStrategy['config']): string {
    const replacement = config?.replacement_char || '*';
    return '[REDACTED]';
  }

  /**
   * Partial masking - shows first and last characters
   */
  private partialMask(value: string, config?: MaskingStrategy['config']): string {
    const showFirst = config?.partial_show_first || 2;
    const showLast = config?.partial_show_last || 2;
    const maskChar = config?.replacement_char || '*';
    
    if (value.length <= showFirst + showLast) {
      return maskChar.repeat(value.length);
    }
    
    const firstPart = value.substring(0, showFirst);
    const lastPart = value.substring(value.length - showLast);
    const middleLength = value.length - showFirst - showLast;
    const middlePart = maskChar.repeat(Math.min(middleLength, 8)); // Limit mask length
    
    return `${firstPart}${middlePart}${lastPart}`;
  }

  /**
   * Encryption masking - reversible with key (simplified implementation)
   */
  private encryptValue(value: string, config?: MaskingStrategy['config']): string {
    const key = config?.key || this.defaultKey;
    const algorithm = 'aes-256-gcm';
    
    try {
      // Generate a random IV for each encryption
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key.padEnd(32).slice(0, 32), iv);
      
      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Return as base64 for better storage/display
      const combined = iv.toString('hex') + ':' + encrypted;
      return Buffer.from(combined).toString('base64');
    } catch (error) {
      logger.error('Encryption failed', { error });
      return '[ENCRYPTED]';
    }
  }

  /**
   * Tokenization masking - replaces with consistent token
   */
  private tokenizeValue(value: string, config?: MaskingStrategy['config']): string {
    // Create deterministic token based on value hash
    const hash = crypto.createHash('sha256');
    hash.update(value + (config?.key || this.defaultKey));
    const tokenSeed = hash.digest('hex');
    
    // Generate token in format TOKEN_XXXXXXXX
    return `TOKEN_${tokenSeed.substring(0, 8).toUpperCase()}`;
  }

  /**
   * Apply masking to SQL query results
   */
  maskQueryResults<T extends Record<string, unknown>>(
    results: T[],
    maskingRules: Record<string, { rule: MaskingRule; config?: MaskingStrategy['config'] }>
  ): T[] {
    if (!results || results.length === 0) {
      return results;
    }

    return results.map(row => {
      const maskedRow = { ...row };
      
      for (const [columnName, maskingConfig] of Object.entries(maskingRules)) {
        if (columnName in maskedRow) {
          (maskedRow as Record<string, any>)[columnName] = this.maskValue(
            row[columnName], 
            maskingConfig.rule, 
            maskingConfig.config
          );
        }
      }
      
      return maskedRow;
    });
  }

  /**
   * Generate SQL query with masking applied at database level
   */
  generateMaskedQuery(
    originalQuery: string,
    maskingRules: Record<string, { rule: MaskingRule; config?: MaskingStrategy['config'] }>
  ): string {
    let maskedQuery = originalQuery;
    
    for (const [columnName, maskingConfig] of Object.entries(maskingRules)) {
      const maskFunction = this.generateSQLMaskFunction(columnName, maskingConfig.rule, maskingConfig.config);
      
      // Simple replacement - in production, you'd want proper SQL parsing
      const columnPattern = new RegExp(`\\b${columnName}\\b(?=(?:[^"]*"[^"]*")*[^"]*$)`, 'gi');
      maskedQuery = maskedQuery.replace(columnPattern, maskFunction);
    }
    
    return maskedQuery;
  }

  /**
   * Generate SQL masking function for Snowflake
   */
  private generateSQLMaskFunction(
    columnName: string, 
    rule: MaskingRule, 
    config?: MaskingStrategy['config']
  ): string {
    switch (rule) {
      case 'none':
        return columnName;
        
      case 'hash':
        const algorithm = config?.algorithm === 'md5' ? 'MD5' : 'SHA2';
        return `${algorithm}(${columnName})`;
        
      case 'redact':
        return "'[REDACTED]'";
        
      case 'partial':
        const showFirst = config?.partial_show_first || 2;
        const showLast = config?.partial_show_last || 2;
        const maskChar = config?.replacement_char || '*';
        return `CASE 
          WHEN LENGTH(${columnName}) <= ${showFirst + showLast} THEN REPEAT('${maskChar}', LENGTH(${columnName}))
          ELSE CONCAT(
            LEFT(${columnName}, ${showFirst}),
            REPEAT('${maskChar}', LEAST(LENGTH(${columnName}) - ${showFirst + showLast}, 8)),
            RIGHT(${columnName}, ${showLast})
          )
        END`;
        
      case 'encrypt':
        // Snowflake encryption would require additional setup
        return `'[ENCRYPTED]'`;
        
      case 'tokenize':
        return `CONCAT('TOKEN_', UPPER(LEFT(SHA2(CONCAT(${columnName}, 'elev8')), 8)))`;
        
      default:
        return `'[MASKED]'`;
    }
  }

  /**
   * Get recommended masking rule for PII type
   */
  getRecommendedMaskingRule(piiType: string): MaskingRule {
    const recommendations: Record<string, MaskingRule> = {
      'email': 'partial',
      'ssn': 'hash',
      'phone': 'partial', 
      'name': 'partial',
      'address': 'redact',
      'credit_card': 'tokenize',
      'date_of_birth': 'partial',
      'ip_address': 'hash',
      'id_number': 'tokenize'
    };
    
    return recommendations[piiType] || 'redact';
  }

  /**
   * Get default masking configuration for rule
   */
  getDefaultMaskingConfig(rule: MaskingRule): MaskingStrategy['config'] {
    const defaults: Record<MaskingRule, MaskingStrategy['config']> = {
      'none': {},
      'hash': { algorithm: 'sha256' },
      'redact': { replacement_char: '*' },
      'partial': { 
        partial_show_first: 2, 
        partial_show_last: 2, 
        replacement_char: '*' 
      },
      'encrypt': { algorithm: 'aes-256-gcm' },
      'tokenize': {}
    };
    
    return defaults[rule] || {};
  }

  /**
   * Validate masking rule and configuration
   */
  validateMaskingRule(rule: MaskingRule, config?: MaskingStrategy['config']): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    const validRules: MaskingRule[] = ['none', 'hash', 'redact', 'partial', 'encrypt', 'tokenize'];
    if (!validRules.includes(rule)) {
      errors.push(`Invalid masking rule: ${rule}`);
    }
    
    if (rule === 'hash' && config?.algorithm && !this.algorithms.includes(config.algorithm as any)) {
      errors.push(`Unsupported hash algorithm: ${config.algorithm}`);
    }
    
    if (rule === 'partial') {
      if (config?.partial_show_first && config.partial_show_first < 0) {
        errors.push('partial_show_first must be >= 0');
      }
      if (config?.partial_show_last && config.partial_show_last < 0) {
        errors.push('partial_show_last must be >= 0');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Test masking rule with sample data
   */
  testMaskingRule(
    rule: MaskingRule, 
    config: MaskingStrategy['config'], 
    sampleValues: string[]
  ): { original: string; masked: string }[] {
    return sampleValues.map(value => ({
      original: value,
      masked: this.maskValue(value, rule, config)
    }));
  }
}