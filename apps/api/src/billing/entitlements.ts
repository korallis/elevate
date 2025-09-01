import { z } from 'zod';
import { getPostgresClient } from '../postgres.js';
import { UsageTracker } from './usage-tracker.js';
import { logger } from '../logger.js';

export interface UserEntitlements {
  subscription: {
    id: string;
    plan_name: string;
    plan_display_name: string;
    status: string;
    trial_end: Date | null;
    current_period_end: Date | null;
    cancel_at_period_end: boolean;
  };
  features: Record<string, boolean>;
  limits: Record<string, number>;
  usage: Record<string, {
    current: number;
    limit: number;
    remaining: number;
    percentage: number;
  }>;
  access: {
    can_create_dashboards: boolean;
    can_use_api: boolean;
    can_export_data: boolean;
    can_use_advanced_analytics: boolean;
    can_use_custom_branding: boolean;
    can_use_sso: boolean;
    can_access_audit_logs: boolean;
    has_priority_support: boolean;
    has_premium_support: boolean;
  };
}

export enum Feature {
  DASHBOARD_CREATION = 'dashboard_creation',
  BASIC_CONNECTORS = 'basic_connectors',
  ALL_CONNECTORS = 'all_connectors',
  EMAIL_SUPPORT = 'email_support',
  PRIORITY_SUPPORT = 'priority_support',
  PREMIUM_SUPPORT = 'premium_support',
  BASIC_ANALYTICS = 'basic_analytics',
  ADVANCED_ANALYTICS = 'advanced_analytics',
  CUSTOM_BRANDING = 'custom_branding',
  API_ACCESS = 'api_access',
  SSO = 'sso',
  AUDIT_LOGS = 'audit_logs',
}

export enum Limit {
  USERS = 'users',
  QUERIES_PER_MONTH = 'queries_per_month',
  DASHBOARDS = 'dashboards',
  DATA_SOURCES = 'data_sources',
  API_CALLS_PER_MONTH = 'api_calls_per_month',
  EXPORTS_PER_MONTH = 'exports_per_month',
}

export class EntitlementsService {
  private postgres;
  private usageTracker;

  constructor() {
    this.postgres = getPostgresClient();
    this.usageTracker = new UsageTracker();
  }

  async getUserEntitlements(userId: string, organizationId?: string): Promise<UserEntitlements> {
    try {
      // Get subscription with plan details
      const subscriptionResult = await this.postgres.query(
        `SELECT 
          s.id, s.status, s.trial_end, s.current_period_end, s.cancel_at_period_end,
          bp.name as plan_name,
          bp.display_name as plan_display_name,
          bp.features,
          bp.limits
         FROM subscriptions s
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE s.user_id = $1 
         AND (s.organization_id = $2 OR (s.organization_id IS NULL AND $2 IS NULL))
         AND s.status IN ('active', 'trialing', 'past_due')
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [userId, organizationId || null]
      );

      // Default to free plan if no subscription found
      let subscription, features, limits;
      
      if (subscriptionResult.rows.length === 0) {
        const freePlanResult = await this.postgres.query(
          'SELECT * FROM billing_plans WHERE name = $1',
          ['free']
        );
        
        const freePlan = freePlanResult.rows[0];
        subscription = {
          id: 'free',
          plan_name: 'free',
          plan_display_name: freePlan.display_name,
          status: 'active',
          trial_end: null,
          current_period_end: null,
          cancel_at_period_end: false,
        };
        features = freePlan.features;
        limits = freePlan.limits;
      } else {
        const sub = subscriptionResult.rows[0];
        subscription = {
          id: sub.id,
          plan_name: sub.plan_name,
          plan_display_name: sub.plan_display_name,
          status: sub.status,
          trial_end: sub.trial_end,
          current_period_end: sub.current_period_end,
          cancel_at_period_end: sub.cancel_at_period_end,
        };
        features = sub.features;
        limits = sub.limits;
      }

      // Get current usage
      const usageSummary = await this.usageTracker.getCurrentMonthUsage(userId, organizationId);
      
      // Build usage object
      const usage: Record<string, any> = {};
      for (const metric in limits) {
        const limit = limits[metric];
        const currentUsage = usageSummary.find(u => u.metric === metric.replace('_per_month', ''))?.total_quantity || 0;
        
        if (limit > 0) {
          usage[metric] = {
            current: currentUsage,
            limit,
            remaining: Math.max(0, limit - currentUsage),
            percentage: Math.min(100, (currentUsage / limit) * 100),
          };
        } else if (limit === -1) {
          // Unlimited
          usage[metric] = {
            current: currentUsage,
            limit: -1,
            remaining: -1,
            percentage: 0,
          };
        }
      }

      // Build access object
      const access = {
        can_create_dashboards: features[Feature.DASHBOARD_CREATION] === true,
        can_use_api: features[Feature.API_ACCESS] === true,
        can_export_data: true, // Basic feature available to all plans
        can_use_advanced_analytics: features[Feature.ADVANCED_ANALYTICS] === true,
        can_use_custom_branding: features[Feature.CUSTOM_BRANDING] === true,
        can_use_sso: features[Feature.SSO] === true,
        can_access_audit_logs: features[Feature.AUDIT_LOGS] === true,
        has_priority_support: features[Feature.PRIORITY_SUPPORT] === true,
        has_premium_support: features[Feature.PREMIUM_SUPPORT] === true,
      };

      return {
        subscription,
        features,
        limits,
        usage,
        access,
      };
    } catch (error) {
      logger.error('Failed to get user entitlements:', error);
      throw error;
    }
  }

  async hasFeature(userId: string, organizationId: string | undefined, feature: Feature): Promise<boolean> {
    try {
      const entitlements = await this.getUserEntitlements(userId, organizationId);
      return entitlements.features[feature] === true;
    } catch (error) {
      logger.error(`Failed to check feature ${feature}:`, error);
      return false;
    }
  }

  async checkLimit(userId: string, organizationId: string | undefined, limit: Limit): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
  }> {
    try {
      const entitlements = await this.getUserEntitlements(userId, organizationId);
      const limitData = entitlements.usage[limit];
      
      if (!limitData) {
        // If limit not found, assume unlimited
        return {
          allowed: true,
          current: 0,
          limit: -1,
          remaining: -1,
        };
      }

      return {
        allowed: limitData.remaining > 0 || limitData.limit === -1,
        current: limitData.current,
        limit: limitData.limit,
        remaining: limitData.remaining,
      };
    } catch (error) {
      logger.error(`Failed to check limit ${limit}:`, error);
      return {
        allowed: false,
        current: 0,
        limit: 0,
        remaining: 0,
      };
    }
  }

  async enforceFeature(userId: string, organizationId: string | undefined, feature: Feature): Promise<void> {
    const hasAccess = await this.hasFeature(userId, organizationId, feature);
    if (!hasAccess) {
      throw new Error(`Feature ${feature} not available in your current plan`);
    }
  }

  async enforceLimit(userId: string, organizationId: string | undefined, limit: Limit, requestedQuantity = 1): Promise<void> {
    const limitCheck = await this.checkLimit(userId, organizationId, limit);
    
    if (!limitCheck.allowed || (limitCheck.remaining >= 0 && requestedQuantity > limitCheck.remaining)) {
      throw new Error(
        `${limit} limit exceeded. Current: ${limitCheck.current}, Limit: ${limitCheck.limit}, Requested: ${requestedQuantity}`
      );
    }
  }

  async canUpgrade(userId: string, organizationId: string | undefined, targetPlan: string): Promise<{
    canUpgrade: boolean;
    reason?: string;
    currentPlan: string;
  }> {
    try {
      const entitlements = await this.getUserEntitlements(userId, organizationId);
      const currentPlan = entitlements.subscription.plan_name;
      
      // Define plan hierarchy
      const planHierarchy = {
        'free': 0,
        'starter': 1,
        'professional': 2,
        'enterprise': 3,
      };
      
      const currentLevel = planHierarchy[currentPlan as keyof typeof planHierarchy] || 0;
      const targetLevel = planHierarchy[targetPlan as keyof typeof planHierarchy];
      
      if (targetLevel === undefined) {
        return {
          canUpgrade: false,
          reason: 'Invalid target plan',
          currentPlan,
        };
      }
      
      if (targetLevel <= currentLevel) {
        return {
          canUpgrade: false,
          reason: targetLevel < currentLevel ? 'This would be a downgrade' : 'Already on this plan',
          currentPlan,
        };
      }
      
      // Check if subscription is in a valid state for upgrade
      if (entitlements.subscription.status === 'past_due') {
        return {
          canUpgrade: false,
          reason: 'Cannot upgrade while subscription is past due',
          currentPlan,
        };
      }
      
      return {
        canUpgrade: true,
        currentPlan,
      };
    } catch (error) {
      logger.error('Failed to check upgrade eligibility:', error);
      return {
        canUpgrade: false,
        reason: 'Failed to check upgrade eligibility',
        currentPlan: 'unknown',
      };
    }
  }

  async getPlanComparison(): Promise<Array<{
    name: string;
    display_name: string;
    price_cents: number;
    features: Record<string, boolean>;
    limits: Record<string, number>;
    popular?: boolean;
    recommended?: boolean;
  }>> {
    try {
      const result = await this.postgres.query(
        `SELECT name, display_name, price_cents, features, limits, sort_order
         FROM billing_plans 
         WHERE is_active = true
         ORDER BY sort_order ASC`
      );

      return result.rows.map((plan, index) => ({
        ...plan,
        popular: plan.name === 'professional',
        recommended: plan.name === 'starter',
      }));
    } catch (error) {
      logger.error('Failed to get plan comparison:', error);
      throw error;
    }
  }

  async getTrialStatus(userId: string, organizationId?: string): Promise<{
    hasTrialEligibility: boolean;
    trialEndsAt: Date | null;
    daysRemaining: number;
    isTrialActive: boolean;
  }> {
    try {
      const entitlements = await this.getUserEntitlements(userId, organizationId);
      const subscription = entitlements.subscription;
      
      const now = new Date();
      const isTrialActive = subscription.trial_end && new Date(subscription.trial_end) > now;
      const daysRemaining = subscription.trial_end 
        ? Math.max(0, Math.ceil((new Date(subscription.trial_end).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      
      // Check if user has had trials before
      const trialHistoryResult = await this.postgres.query(
        `SELECT COUNT(*) as trial_count
         FROM subscriptions 
         WHERE user_id = $1 
         AND (organization_id = $2 OR (organization_id IS NULL AND $2 IS NULL))
         AND trial_end IS NOT NULL`,
        [userId, organizationId || null]
      );
      
      const hasTrialEligibility = parseInt(trialHistoryResult.rows[0].trial_count) === 0;
      
      return {
        hasTrialEligibility,
        trialEndsAt: subscription.trial_end,
        daysRemaining,
        isTrialActive: isTrialActive || false,
      };
    } catch (error) {
      logger.error('Failed to get trial status:', error);
      throw error;
    }
  }

  // Utility middleware function to check feature access
  static requireFeature(feature: Feature) {
    return async (c: any, next: any) => {
      try {
        const entitlementsService = new EntitlementsService();
        const userId = c.get('userId');
        const organizationId = c.get('organizationId');
        
        if (userId) {
          await entitlementsService.enforceFeature(userId, organizationId, feature);
        }
        
        await next();
      } catch (error) {
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Feature not available',
          upgrade_required: true,
        }, 403);
      }
    };
  }

  // Utility middleware function to check usage limits
  static requireLimit(limit: Limit, quantity = 1) {
    return async (c: any, next: any) => {
      try {
        const entitlementsService = new EntitlementsService();
        const userId = c.get('userId');
        const organizationId = c.get('organizationId');
        
        if (userId) {
          await entitlementsService.enforceLimit(userId, organizationId, limit, quantity);
        }
        
        await next();
      } catch (error) {
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Usage limit exceeded',
          upgrade_required: true,
        }, 403);
      }
    };
  }
}