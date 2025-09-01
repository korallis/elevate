import { logger } from '../logger.js';
import type { DashboardTemplate, UserIntent } from './dashboard-generator.js';
import { SaasTemplate } from './templates/saas-template.js';
import { EcommerceTemplate } from './templates/ecommerce-template.js';
import { MarketingTemplate } from './templates/marketing-template.js';
import { FinancialTemplate } from './templates/financial-template.js';
import { ComplianceTemplate } from './templates/compliance-template.js';

export interface TemplateMatch {
  template: DashboardTemplate;
  confidence: number;
  reasoning: string;
}

export class TemplateMatcher {
  private templates: DashboardTemplate[];

  constructor() {
    this.templates = [
      new SaasTemplate().getTemplate(),
      new EcommerceTemplate().getTemplate(),
      new MarketingTemplate().getTemplate(),
      new FinancialTemplate().getTemplate(),
      new ComplianceTemplate().getTemplate()
    ];
  }

  async findBestMatch(intent: UserIntent): Promise<TemplateMatch | null> {
    try {
      logger.info('Finding template match', { domain: intent.domain, metrics: intent.keyMetrics });

      const matches = this.templates.map(template => ({
        template,
        confidence: this.calculateMatchConfidence(intent, template),
        reasoning: this.generateMatchReasoning(intent, template)
      }));

      // Sort by confidence and return the best match
      matches.sort((a, b) => b.confidence - a.confidence);
      
      const bestMatch = matches[0];
      
      if (bestMatch && bestMatch.confidence > 0.5) {
        logger.info('Template match found', {
          template: bestMatch.template.name,
          confidence: bestMatch.confidence
        });
        return bestMatch;
      }

      logger.info('No suitable template match found', { 
        bestConfidence: bestMatch?.confidence || 0 
      });
      return null;

    } catch (error) {
      logger.error('Template matching failed', { error: String(error) });
      return null;
    }
  }

  private calculateMatchConfidence(intent: UserIntent, template: DashboardTemplate): number {
    let confidence = 0;

    // Domain match (most important factor)
    const domainMatch = this.calculateDomainMatch(intent.domain, template.domain);
    confidence += domainMatch * 0.5;

    // Metrics overlap
    const metricsMatch = this.calculateMetricsMatch(intent.keyMetrics, template);
    confidence += metricsMatch * 0.3;

    // Audience level compatibility
    const audienceMatch = this.calculateAudienceMatch(intent.audienceLevel, template);
    confidence += audienceMatch * 0.1;

    // Visualization preferences alignment
    const vizMatch = this.calculateVisualizationMatch(intent.visualizationPreferences, template);
    confidence += vizMatch * 0.1;

    return Math.min(1.0, confidence);
  }

  private calculateDomainMatch(intentDomain: string, templateDomain: string): number {
    const domainSynonyms: Record<string, string[]> = {
      'finance': ['financial', 'accounting', 'fintech', 'banking', 'investment'],
      'sales': ['revenue', 'crm', 'pipeline', 'deals', 'customers'],
      'marketing': ['campaigns', 'leads', 'advertising', 'growth', 'acquisition'],
      'saas': ['software', 'subscription', 'platform', 'service', 'application'],
      'ecommerce': ['retail', 'commerce', 'store', 'shopping', 'marketplace'],
      'operations': ['operational', 'logistics', 'supply', 'manufacturing', 'process'],
      'compliance': ['regulatory', 'audit', 'governance', 'risk', 'legal']
    };

    // Direct match
    if (intentDomain.toLowerCase() === templateDomain.toLowerCase()) {
      return 1.0;
    }

    // Synonym match
    for (const [domain, synonyms] of Object.entries(domainSynonyms)) {
      if (domain === templateDomain.toLowerCase() && 
          synonyms.includes(intentDomain.toLowerCase())) {
        return 0.8;
      }
      if (domain === intentDomain.toLowerCase() && 
          synonyms.includes(templateDomain.toLowerCase())) {
        return 0.8;
      }
    }

    // Partial text match
    if (intentDomain.toLowerCase().includes(templateDomain.toLowerCase()) ||
        templateDomain.toLowerCase().includes(intentDomain.toLowerCase())) {
      return 0.6;
    }

    return 0;
  }

  private calculateMetricsMatch(intentMetrics: string[], template: DashboardTemplate): number {
    if (intentMetrics.length === 0) return 0;

    // Extract metrics mentioned in template widgets
    const templateMetrics = template.widgets
      .map(w => w.config.title?.toLowerCase() || '')
      .filter(title => title.length > 0);

    let matchCount = 0;
    
    for (const intentMetric of intentMetrics) {
      const metric = intentMetric.toLowerCase();
      
      // Check for direct mentions or keyword matches
      const hasMatch = templateMetrics.some(templateMetric => 
        templateMetric.includes(metric) || 
        metric.includes(templateMetric) ||
        this.areRelatedMetrics(metric, templateMetric)
      );
      
      if (hasMatch) {
        matchCount++;
      }
    }

    return matchCount / intentMetrics.length;
  }

  private calculateAudienceMatch(audienceLevel: string, template: DashboardTemplate): number {
    // Different templates are designed for different audience levels
    const templateAudiences: Record<string, string[]> = {
      'executive': ['saas-metrics', 'financial-reporting', 'compliance-dashboard'],
      'analyst': ['ecommerce-analytics', 'marketing-performance'],
      'operational': ['marketing-performance', 'ecommerce-analytics']
    };

    const matchingTemplates = templateAudiences[audienceLevel] || [];
    return matchingTemplates.includes(template.id) ? 1.0 : 0.5;
  }

  private calculateVisualizationMatch(
    preferences: string[], 
    template: DashboardTemplate
  ): number {
    if (preferences.length === 0) return 0.5; // Neutral if no preferences

    const templateVizTypes = template.widgets.map(w => w.type);
    let matchCount = 0;

    for (const preference of preferences) {
      if (templateVizTypes.includes(preference)) {
        matchCount++;
      }
    }

    return matchCount / preferences.length;
  }

  private areRelatedMetrics(metric1: string, metric2: string): boolean {
    const relatedMetrics: Record<string, string[]> = {
      'revenue': ['sales', 'income', 'earnings', 'turnover'],
      'customers': ['users', 'clients', 'subscribers', 'accounts'],
      'growth': ['increase', 'expansion', 'scaling', 'improvement'],
      'conversion': ['rate', 'percentage', 'success', 'completion'],
      'retention': ['churn', 'loyalty', 'repeat', 'engagement'],
      'cost': ['expense', 'spending', 'budget', 'investment'],
      'profit': ['margin', 'earnings', 'return', 'roi'],
      'performance': ['kpi', 'metrics', 'results', 'outcomes']
    };

    for (const [key, related] of Object.entries(relatedMetrics)) {
      if ((metric1.includes(key) || related.some(r => metric1.includes(r))) &&
          (metric2.includes(key) || related.some(r => metric2.includes(r)))) {
        return true;
      }
    }

    return false;
  }

  private generateMatchReasoning(intent: UserIntent, template: DashboardTemplate): string {
    const domainMatch = this.calculateDomainMatch(intent.domain, template.domain);
    const metricsMatch = this.calculateMetricsMatch(intent.keyMetrics, template);
    
    let reasoning = `Template "${template.name}" `;
    
    if (domainMatch > 0.8) {
      reasoning += 'closely matches the domain. ';
    } else if (domainMatch > 0.5) {
      reasoning += 'partially matches the domain. ';
    } else {
      reasoning += 'does not match the domain well. ';
    }
    
    if (metricsMatch > 0.6) {
      reasoning += `Good overlap with requested metrics (${(metricsMatch * 100).toFixed(0)}% match). `;
    } else {
      reasoning += `Limited metric overlap (${(metricsMatch * 100).toFixed(0)}% match). `;
    }
    
    reasoning += `Designed for ${template.domain} use cases with ${template.widgets.length} widgets.`;
    
    return reasoning;
  }

  getAvailableTemplates(): DashboardTemplate[] {
    return this.templates;
  }
}