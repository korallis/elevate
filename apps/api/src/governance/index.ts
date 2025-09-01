// Main governance system exports

export * from './types.js';

// PII Management
export { PIIDetector } from './pii-detector.js';
export { PIIMasker } from './pii-masker.js';
export { PIIRulesEngine } from './pii-rules.js';

// Row-Level Security
export { RLSEngine } from './rls-engine.js';
export { RLSPolicyBuilder } from './rls-policy.js';
export { RLSValidator } from './rls-validator.js';

// GDPR Compliance
export { GDPRExporter } from './gdpr-export.js';
export { GDPRDeleter } from './gdpr-delete.js';
export { GDPRConsentManager } from './gdpr-consent.js';

// Initialize all governance systems
import { PIIDetector } from './pii-detector.js';
import { GDPRConsentManager } from './gdpr-consent.js';
import { logger } from '../logger.js';

let piiDetector: PIIDetector | null = null;
let consentManager: GDPRConsentManager | null = null;

export async function initializeGovernance(): Promise<void> {
  try {
    logger.info('Initializing governance systems...');

    // Initialize PII detector
    piiDetector = new PIIDetector();
    await piiDetector.initialize();

    // Initialize consent manager
    consentManager = new GDPRConsentManager();
    await consentManager.initialize();

    logger.info('All governance systems initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize governance systems', { error });
    throw error;
  }
}

// Singleton instances
export function getPIIDetector(): PIIDetector {
  if (!piiDetector) {
    throw new Error('PII Detector not initialized. Call initializeGovernance() first.');
  }
  return piiDetector;
}

export function getConsentManager(): GDPRConsentManager {
  if (!consentManager) {
    throw new Error('Consent Manager not initialized. Call initializeGovernance() first.');
  }
  return consentManager;
}