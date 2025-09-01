import { z } from 'zod';
import { getPostgresClient } from '../postgres.js';
import { getStripeClient } from './stripe-client.js';
import { logger } from '../logger.js';

// Usage tracking schemas
export const RecordUsageSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().optional(),
  metric: z.enum(['queries', 'users', 'dashboards', 'api_calls', 'data_sources', 'exports']),
  quantity: z.number().min(1).default(1),
  metadata: z.record(z.any()).optional(),
});

export const UsageQuerySchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().optional(),
  metric: z.enum(['queries', 'users', 'dashboards', 'api_calls', 'data_sources', 'exports']).optional(),
  periodStart: z.date().optional(),
  periodEnd: z.date().optional(),
});

export interface UsageRecord {
  id: string;
  user_id: string;
  organization_id: string | null;
  subscription_id: string | null;
  metric: string;
  quantity: number;
  period_start: Date;
  period_end: Date;
  recorded_at: Date;
  metadata: Record<string, any>;
}

export interface UsageSummary {
  user_id: string;
  organization_id: string | null;
  subscription_id: string | null;
  metric: string;
  total_quantity: number;
  record_count: number;
  period_start: Date;
  period_end: Date;
  plan_limit: number | null;
  usage_percentage: number | null;
  is_over_limit: boolean;
}

export interface PlanLimits {
  users: number;
  queries_per_month: number;
  dashboards: number;
  data_sources: number;
  api_calls_per_month?: number;
  exports_per_month?: number;
}

export class UsageTracker {
  private postgres;
  private stripe;

  constructor() {
    this.postgres = getPostgresClient();
    this.stripe = getStripeClient();
  }

  async recordUsage(data: z.infer<typeof RecordUsageSchema>): Promise<string> {
    const validatedData = RecordUsageSchema.parse(data);

    try {
      // Use the PostgreSQL function for efficient usage recording
      const result = await this.postgres.query(
        'SELECT record_usage($1, $2, $3, $4, $5)',
        [
          validatedData.userId,
          validatedData.organizationId || null,
          validatedData.metric,
          validatedData.quantity,
          JSON.stringify(validatedData.metadata || {}),
        ]
      );

      const usageId = result.rows[0].record_usage;
      
      // For metered plans, report usage to Stripe if applicable
      await this.reportToStripe(validatedData.userId, validatedData.organizationId, validatedData.metric, validatedData.quantity);

      logger.info(`Recorded usage: ${validatedData.metric} = ${validatedData.quantity} for user ${validatedData.userId}`);
      return usageId;
    } catch (error) {
      logger.error('Failed to record usage:', error);
      throw error;
    }
  }

  async getUsage(query: z.infer<typeof UsageQuerySchema>): Promise<UsageRecord[]> {
    const validatedQuery = UsageQuerySchema.parse(query);

    try {
      const conditions: string[] = ['user_id = $1'];
      const params: any[] = [validatedQuery.userId];
      let paramIndex = 2;

      if (validatedQuery.organizationId) {
        conditions.push(`organization_id = $${paramIndex++}`);
        params.push(validatedQuery.organizationId);
      }

      if (validatedQuery.metric) {
        conditions.push(`metric = $${paramIndex++}`);
        params.push(validatedQuery.metric);
      }

      if (validatedQuery.periodStart) {
        conditions.push(`period_start >= $${paramIndex++}`);
        params.push(validatedQuery.periodStart);
      }

      if (validatedQuery.periodEnd) {
        conditions.push(`period_end <= $${paramIndex++}`);
        params.push(validatedQuery.periodEnd);
      }

      const sql = `
        SELECT * FROM usage_records
        WHERE ${conditions.join(' AND ')}
        ORDER BY recorded_at DESC
        LIMIT 1000
      `;

      const result = await this.postgres.query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get usage:', error);
      throw error;
    }
  }

  async getCurrentMonthUsage(userId: string, organizationId?: string): Promise<UsageSummary[]> {
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const result = await this.postgres.query(
        `SELECT 
          ur.user_id,
          ur.organization_id,
          ur.subscription_id,
          ur.metric,
          SUM(ur.quantity) as total_quantity,
          COUNT(*) as record_count,
          MIN(ur.period_start) as period_start,
          MAX(ur.period_end) as period_end,
          CASE 
            WHEN ur.metric = 'queries' THEN (bp.limits->>'queries_per_month')::int
            WHEN ur.metric = 'users' THEN (bp.limits->>'users')::int
            WHEN ur.metric = 'dashboards' THEN (bp.limits->>'dashboards')::int
            WHEN ur.metric = 'data_sources' THEN (bp.limits->>'data_sources')::int
            WHEN ur.metric = 'api_calls' THEN (bp.limits->>'api_calls_per_month')::int
            WHEN ur.metric = 'exports' THEN (bp.limits->>'exports_per_month')::int
            ELSE NULL
          END as plan_limit
        FROM usage_records ur
        LEFT JOIN subscriptions s ON ur.subscription_id = s.id
        LEFT JOIN billing_plans bp ON s.plan_id = bp.id
        WHERE ur.user_id = $1
        AND (ur.organization_id = $2 OR (ur.organization_id IS NULL AND $2 IS NULL))
        AND ur.period_start >= $3
        AND ur.period_end < $4
        GROUP BY ur.user_id, ur.organization_id, ur.subscription_id, ur.metric, bp.limits`,
        [userId, organizationId || null, monthStart, monthEnd]
      );

      return result.rows.map(row => ({
        ...row,
        total_quantity: parseInt(row.total_quantity),
        record_count: parseInt(row.record_count),
        plan_limit: row.plan_limit ? parseInt(row.plan_limit) : null,
        usage_percentage: row.plan_limit && row.plan_limit > 0 
          ? (parseInt(row.total_quantity) / parseInt(row.plan_limit)) * 100 
          : null,
        is_over_limit: row.plan_limit && row.plan_limit > 0 
          ? parseInt(row.total_quantity) > parseInt(row.plan_limit)
          : false,
      }));
    } catch (error) {
      logger.error('Failed to get current month usage:', error);
      throw error;
    }
  }

  async checkUsageLimit(
    userId: string, 
    organizationId: string | undefined, 
    metric: string
  ): Promise<{ allowed: boolean; currentUsage: number; limit: number | null; remaining: number | null }> {
    try {
      const usageSummary = await this.getCurrentMonthUsage(userId, organizationId);
      const metricUsage = usageSummary.find(u => u.metric === metric);
      
      const currentUsage = metricUsage?.total_quantity || 0;
      const limit = metricUsage?.plan_limit || null;
      
      if (limit === null || limit === -1) {
        // Unlimited plan
        return {
          allowed: true,
          currentUsage,
          limit: null,
          remaining: null,
        };
      }

      const remaining = Math.max(0, limit - currentUsage);
      const allowed = currentUsage < limit;

      return {
        allowed,
        currentUsage,
        limit,
        remaining,
      };
    } catch (error) {
      logger.error('Failed to check usage limit:', error);
      throw error;
    }
  }

  async enforceUsageLimit(
    userId: string,
    organizationId: string | undefined,
    metric: string,
    requestedQuantity = 1
  ): Promise<void> {
    const usageCheck = await this.checkUsageLimit(userId, organizationId, metric);
    
    if (!usageCheck.allowed || (usageCheck.remaining !== null && requestedQuantity > usageCheck.remaining)) {
      throw new Error(
        `Usage limit exceeded for ${metric}. ` +
        `Current: ${usageCheck.currentUsage}, Limit: ${usageCheck.limit}, Requested: ${requestedQuantity}`
      );
    }
  }

  async getUsageAlerts(userId: string, organizationId?: string): Promise<Array<{
    metric: string;
    current_usage: number;
    limit: number;
    usage_percentage: number;
    alert_level: 'warning' | 'critical' | 'exceeded';
  }>> {
    try {
      const usageSummary = await this.getCurrentMonthUsage(userId, organizationId);
      
      const alerts = usageSummary
        .filter(usage => usage.plan_limit && usage.plan_limit > 0)
        .map(usage => ({
          metric: usage.metric,
          current_usage: usage.total_quantity,
          limit: usage.plan_limit!,
          usage_percentage: usage.usage_percentage!,
          alert_level: usage.usage_percentage! >= 100 
            ? 'exceeded' as const
            : usage.usage_percentage! >= 90 
            ? 'critical' as const 
            : 'warning' as const,
        }))
        .filter(alert => alert.usage_percentage >= 80); // Only show alerts for 80%+ usage

      return alerts;
    } catch (error) {
      logger.error('Failed to get usage alerts:', error);
      throw error;
    }
  }

  private async reportToStripe(
    userId: string,
    organizationId: string | undefined,
    metric: string,
    quantity: number
  ): Promise<void> {
    try {
      // Get subscription with metered usage
      const subscriptionResult = await this.postgres.query(
        `SELECT s.stripe_subscription_id, bp.name as plan_name
         FROM subscriptions s
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE s.user_id = $1 
         AND (s.organization_id = $2 OR (s.organization_id IS NULL AND $2 IS NULL))
         AND s.status IN ('active', 'trialing')
         AND bp.name IN ('professional', 'enterprise')`, // Only metered plans
        [userId, organizationId || null]
      );

      if (subscriptionResult.rows.length === 0) {
        // No metered subscription found
        return;
      }

      const subscription = subscriptionResult.rows[0];
      
      if (!subscription.stripe_subscription_id) {
        return;
      }

      // Get Stripe subscription to find metered subscription items
      const stripeSubscription = await this.stripe.getSubscription(subscription.stripe_subscription_id);
      if (!stripeSubscription) {
        return;
      }

      // Find subscription item for the metric (if exists)
      const metricItem = stripeSubscription.items.data.find(item => 
        item.price.lookup_key === `${subscription.plan_name}_${metric}`
      );

      if (metricItem) {
        await this.stripe.createUsageRecord({
          subscriptionItemId: metricItem.id,
          quantity,
          action: 'increment',
        });
        
        logger.info(`Reported ${quantity} ${metric} usage to Stripe for subscription ${subscription.stripe_subscription_id}`);
      }
    } catch (error) {
      // Log error but don't fail the usage recording
      logger.warn('Failed to report usage to Stripe:', error);
    }
  }

  async generateUsageReport(
    userId: string,
    organizationId: string | undefined,
    startDate: Date,
    endDate: Date
  ): Promise<{
    period: { start: Date; end: Date };
    user_id: string;
    organization_id: string | null;
    metrics: Array<{
      metric: string;
      total_usage: number;
      daily_breakdown: Array<{
        date: string;
        usage: number;
      }>;
      limit: number | null;
      overage: number;
    }>;
    total_cost_cents: number;
  }> {
    try {
      // Get usage breakdown by day
      const result = await this.postgres.query(
        `SELECT 
          metric,
          DATE(period_start) as usage_date,
          SUM(quantity) as daily_usage
         FROM usage_records
         WHERE user_id = $1
         AND (organization_id = $2 OR (organization_id IS NULL AND $2 IS NULL))
         AND period_start >= $3
         AND period_end <= $4
         GROUP BY metric, DATE(period_start)
         ORDER BY metric, usage_date`,
        [userId, organizationId || null, startDate, endDate]
      );

      // Get current plan limits
      const limitsResult = await this.postgres.query(
        `SELECT bp.limits
         FROM subscriptions s
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE s.user_id = $1 
         AND (s.organization_id = $2 OR (s.organization_id IS NULL AND $2 IS NULL))
         AND s.status IN ('active', 'trialing', 'canceled')
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [userId, organizationId || null]
      );

      const limits = limitsResult.rows[0]?.limits || {};

      // Group by metric
      const metricMap = new Map<string, any>();
      
      result.rows.forEach(row => {
        if (!metricMap.has(row.metric)) {
          metricMap.set(row.metric, {
            metric: row.metric,
            total_usage: 0,
            daily_breakdown: [],
            limit: limits[`${row.metric}_per_month`] || limits[row.metric] || null,
            overage: 0,
          });
        }
        
        const metricData = metricMap.get(row.metric)!;
        metricData.total_usage += parseInt(row.daily_usage);
        metricData.daily_breakdown.push({
          date: row.usage_date,
          usage: parseInt(row.daily_usage),
        });
      });

      // Calculate overages
      const metrics = Array.from(metricMap.values()).map(metric => {
        if (metric.limit && metric.limit > 0) {
          metric.overage = Math.max(0, metric.total_usage - metric.limit);
        }
        return metric;
      });

      return {
        period: { start: startDate, end: endDate },
        user_id: userId,
        organization_id: organizationId || null,
        metrics,
        total_cost_cents: 0, // TODO: Calculate based on overage pricing
      };
    } catch (error) {
      logger.error('Failed to generate usage report:', error);
      throw error;
    }
  }

  async resetMonthlyUsage(): Promise<void> {
    // This would typically be called by a cron job at the beginning of each month
    try {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 2); // Keep 2 months of history

      // Archive old usage records (optional - for performance)
      await this.postgres.query(
        'DELETE FROM usage_records WHERE recorded_at < $1',
        [lastMonth]
      );

      logger.info('Monthly usage reset completed');
    } catch (error) {
      logger.error('Failed to reset monthly usage:', error);
      throw error;
    }
  }
}