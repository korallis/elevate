import { z } from 'zod';
import Stripe from 'stripe';
import { getStripeClient } from './stripe-client.js';
import { getPostgresClient } from '../postgres.js';
import { logger } from '../logger.js';

// Subscription schemas
export const CreateSubscriptionSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().optional(),
  planName: z.enum(['free', 'starter', 'professional', 'enterprise']),
  trialDays: z.number().min(0).max(30).optional(),
  customerEmail: z.string().email(),
  customerName: z.string().optional(),
  paymentMethodId: z.string().optional(),
});

export const UpdateSubscriptionSchema = z.object({
  planName: z.enum(['free', 'starter', 'professional', 'enterprise']).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});

export interface DatabaseSubscription {
  id: string;
  user_id: string;
  organization_id: string | null;
  plan_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: string;
  trial_start: Date | null;
  trial_end: Date | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  canceled_at: Date | null;
  ended_at: Date | null;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  // Joined fields from billing_plans
  plan_name: string;
  plan_display_name: string;
  plan_price_cents: number;
  plan_features: Record<string, any>;
  plan_limits: Record<string, any>;
}

export class SubscriptionManager {
  private postgres;
  private stripe;

  constructor() {
    this.postgres = getPostgresClient();
    this.stripe = getStripeClient();
  }

  async createSubscription(data: z.infer<typeof CreateSubscriptionSchema>): Promise<DatabaseSubscription> {
    const validatedData = CreateSubscriptionSchema.parse(data);
    
    try {
      // Start database transaction
      const client = await this.postgres.connect();
      
      try {
        await client.query('BEGIN');

        // Get plan details
        const planResult = await client.query(
          'SELECT * FROM billing_plans WHERE name = $1 AND is_active = true',
          [validatedData.planName]
        );

        if (planResult.rows.length === 0) {
          throw new Error(`Plan ${validatedData.planName} not found or inactive`);
        }

        const plan = planResult.rows[0];

        // Check for existing active subscription
        const existingResult = await client.query(
          `SELECT id FROM subscriptions 
           WHERE user_id = $1 AND (organization_id = $2 OR (organization_id IS NULL AND $2 IS NULL))
           AND status IN ('active', 'trialing', 'past_due')`,
          [validatedData.userId, validatedData.organizationId || null]
        );

        if (existingResult.rows.length > 0) {
          throw new Error('User already has an active subscription');
        }

        let stripeCustomer: Stripe.Customer | null = null;
        let stripeSubscription: Stripe.Subscription | null = null;

        // For paid plans, create Stripe customer and subscription
        if (plan.price_cents > 0) {
          // Create Stripe customer
          stripeCustomer = await this.stripe.createCustomer({
            email: validatedData.customerEmail,
            name: validatedData.customerName,
            metadata: {
              userId: validatedData.userId,
              organizationId: validatedData.organizationId || '',
              planName: validatedData.planName,
            },
          });

          // Attach payment method if provided
          if (validatedData.paymentMethodId) {
            await this.stripe.attachPaymentMethod(validatedData.paymentMethodId, stripeCustomer.id);
            await this.stripe.setDefaultPaymentMethod(stripeCustomer.id, validatedData.paymentMethodId);
          }

          // Create subscription if plan has Stripe price
          if (plan.stripe_price_id) {
            stripeSubscription = await this.stripe.createSubscription({
              customerId: stripeCustomer.id,
              priceId: plan.stripe_price_id,
              trialPeriodDays: validatedData.trialDays,
              metadata: {
                userId: validatedData.userId,
                organizationId: validatedData.organizationId || '',
                planName: validatedData.planName,
              },
            });
          }
        }

        // Create database subscription
        const subscriptionResult = await client.query(
          `INSERT INTO subscriptions (
            user_id, organization_id, plan_id, stripe_subscription_id, stripe_customer_id,
            status, trial_start, trial_end, current_period_start, current_period_end,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *`,
          [
            validatedData.userId,
            validatedData.organizationId || null,
            plan.id,
            stripeSubscription?.id || null,
            stripeCustomer?.id || null,
            stripeSubscription?.status || (plan.price_cents === 0 ? 'active' : 'incomplete'),
            stripeSubscription ? new Date(stripeSubscription.trial_start! * 1000) : null,
            stripeSubscription ? new Date(stripeSubscription.trial_end! * 1000) : null,
            stripeSubscription ? new Date(stripeSubscription.current_period_start * 1000) : new Date(),
            stripeSubscription ? new Date(stripeSubscription.current_period_end * 1000) : null,
            {
              stripeSubscriptionId: stripeSubscription?.id,
              stripeCustomerId: stripeCustomer?.id,
              createdVia: 'api',
            },
          ]
        );

        await client.query('COMMIT');
        
        // Fetch complete subscription data with plan details
        const completeSubscription = await this.getSubscription(
          validatedData.userId,
          validatedData.organizationId
        );

        if (!completeSubscription) {
          throw new Error('Failed to retrieve created subscription');
        }

        logger.info(`Created subscription for user ${validatedData.userId} with plan ${validatedData.planName}`);
        return completeSubscription;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create subscription:', error);
      throw error;
    }
  }

  async getSubscription(userId: string, organizationId?: string): Promise<DatabaseSubscription | null> {
    try {
      const result = await this.postgres.query(
        `SELECT 
          s.*,
          bp.name as plan_name,
          bp.display_name as plan_display_name,
          bp.price_cents as plan_price_cents,
          bp.features as plan_features,
          bp.limits as plan_limits
         FROM subscriptions s
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE s.user_id = $1 
         AND (s.organization_id = $2 OR (s.organization_id IS NULL AND $2 IS NULL))
         AND s.status IN ('active', 'trialing', 'past_due', 'canceled')
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [userId, organizationId || null]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get subscription:', error);
      throw error;
    }
  }

  async updateSubscription(
    userId: string,
    organizationId: string | undefined,
    updates: z.infer<typeof UpdateSubscriptionSchema>
  ): Promise<DatabaseSubscription> {
    const validatedUpdates = UpdateSubscriptionSchema.parse(updates);

    try {
      const client = await this.postgres.connect();
      
      try {
        await client.query('BEGIN');

        // Get current subscription
        const currentSubscription = await this.getSubscription(userId, organizationId);
        if (!currentSubscription) {
          throw new Error('Subscription not found');
        }

        let updatedStripeSubscription: Stripe.Subscription | null = null;

        // Handle plan change
        if (validatedUpdates.planName) {
          const newPlanResult = await client.query(
            'SELECT * FROM billing_plans WHERE name = $1 AND is_active = true',
            [validatedUpdates.planName]
          );

          if (newPlanResult.rows.length === 0) {
            throw new Error(`Plan ${validatedUpdates.planName} not found or inactive`);
          }

          const newPlan = newPlanResult.rows[0];

          // Update Stripe subscription if it exists and new plan has Stripe price
          if (currentSubscription.stripe_subscription_id && newPlan.stripe_price_id) {
            updatedStripeSubscription = await this.stripe.updateSubscription(
              currentSubscription.stripe_subscription_id,
              {
                priceId: newPlan.stripe_price_id,
                metadata: {
                  userId: currentSubscription.user_id,
                  organizationId: currentSubscription.organization_id || '',
                  planName: validatedUpdates.planName,
                },
              }
            );
          }

          // Update database subscription
          await client.query(
            'UPDATE subscriptions SET plan_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPlan.id, currentSubscription.id]
          );
        }

        // Handle cancellation
        if (validatedUpdates.cancelAtPeriodEnd !== undefined) {
          if (currentSubscription.stripe_subscription_id) {
            updatedStripeSubscription = await this.stripe.updateSubscription(
              currentSubscription.stripe_subscription_id,
              {
                cancelAtPeriodEnd: validatedUpdates.cancelAtPeriodEnd,
              }
            );
          }

          await client.query(
            'UPDATE subscriptions SET cancel_at_period_end = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [validatedUpdates.cancelAtPeriodEnd, currentSubscription.id]
          );
        }

        await client.query('COMMIT');

        // Return updated subscription
        const updatedSubscription = await this.getSubscription(userId, organizationId);
        if (!updatedSubscription) {
          throw new Error('Failed to retrieve updated subscription');
        }

        logger.info(`Updated subscription for user ${userId}`);
        return updatedSubscription;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update subscription:', error);
      throw error;
    }
  }

  async cancelSubscription(
    userId: string,
    organizationId: string | undefined,
    immediately = false
  ): Promise<DatabaseSubscription> {
    try {
      const subscription = await this.getSubscription(userId, organizationId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.stripe_subscription_id) {
        await this.stripe.cancelSubscription(subscription.stripe_subscription_id, immediately);
      }

      // Update database
      const updateQuery = immediately
        ? 'UPDATE subscriptions SET status = $1, ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2'
        : 'UPDATE subscriptions SET cancel_at_period_end = true, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
      
      const updateParams = immediately 
        ? ['canceled', subscription.id]
        : [subscription.id];

      await this.postgres.query(updateQuery, updateParams);

      // Return updated subscription
      const updatedSubscription = await this.getSubscription(userId, organizationId);
      if (!updatedSubscription) {
        throw new Error('Failed to retrieve canceled subscription');
      }

      logger.info(`${immediately ? 'Canceled' : 'Scheduled cancellation for'} subscription for user ${userId}`);
      return updatedSubscription;
    } catch (error) {
      logger.error('Failed to cancel subscription:', error);
      throw error;
    }
  }

  async syncWithStripe(subscriptionId: string): Promise<DatabaseSubscription> {
    try {
      // Get subscription from database
      const dbResult = await this.postgres.query(
        `SELECT 
          s.*,
          bp.name as plan_name,
          bp.display_name as plan_display_name,
          bp.price_cents as plan_price_cents,
          bp.features as plan_features,
          bp.limits as plan_limits
         FROM subscriptions s
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE s.id = $1`,
        [subscriptionId]
      );

      if (dbResult.rows.length === 0) {
        throw new Error('Subscription not found in database');
      }

      const dbSubscription = dbResult.rows[0];

      // Get subscription from Stripe
      if (!dbSubscription.stripe_subscription_id) {
        logger.warn(`Subscription ${subscriptionId} has no Stripe subscription ID`);
        return dbSubscription;
      }

      const stripeSubscription = await this.stripe.getSubscription(dbSubscription.stripe_subscription_id);
      if (!stripeSubscription) {
        logger.warn(`Stripe subscription ${dbSubscription.stripe_subscription_id} not found`);
        return dbSubscription;
      }

      // Update database with Stripe data
      await this.postgres.query(
        `UPDATE subscriptions SET
          status = $1,
          current_period_start = $2,
          current_period_end = $3,
          cancel_at_period_end = $4,
          canceled_at = $5,
          ended_at = $6,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [
          stripeSubscription.status,
          new Date(stripeSubscription.current_period_start * 1000),
          new Date(stripeSubscription.current_period_end * 1000),
          stripeSubscription.cancel_at_period_end,
          stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
          stripeSubscription.ended_at ? new Date(stripeSubscription.ended_at * 1000) : null,
          subscriptionId,
        ]
      );

      // Return updated subscription
      const updatedResult = await this.postgres.query(
        `SELECT 
          s.*,
          bp.name as plan_name,
          bp.display_name as plan_display_name,
          bp.price_cents as plan_price_cents,
          bp.features as plan_features,
          bp.limits as plan_limits
         FROM subscriptions s
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE s.id = $1`,
        [subscriptionId]
      );

      logger.info(`Synced subscription ${subscriptionId} with Stripe`);
      return updatedResult.rows[0];
    } catch (error) {
      logger.error('Failed to sync subscription with Stripe:', error);
      throw error;
    }
  }

  async listUserSubscriptions(userId: string): Promise<DatabaseSubscription[]> {
    try {
      const result = await this.postgres.query(
        `SELECT 
          s.*,
          bp.name as plan_name,
          bp.display_name as plan_display_name,
          bp.price_cents as plan_price_cents,
          bp.features as plan_features,
          bp.limits as plan_limits
         FROM subscriptions s
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE s.user_id = $1
         ORDER BY s.created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to list user subscriptions:', error);
      throw error;
    }
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<DatabaseSubscription | null> {
    try {
      const result = await this.postgres.query(
        `SELECT 
          s.*,
          bp.name as plan_name,
          bp.display_name as plan_display_name,
          bp.price_cents as plan_price_cents,
          bp.features as plan_features,
          bp.limits as plan_limits
         FROM subscriptions s
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE s.stripe_subscription_id = $1`,
        [stripeSubscriptionId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get subscription by Stripe ID:', error);
      throw error;
    }
  }
}