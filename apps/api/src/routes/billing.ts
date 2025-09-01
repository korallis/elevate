import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { SubscriptionManager, CreateSubscriptionSchema, UpdateSubscriptionSchema } from '../billing/subscription-manager.js';
import { UsageTracker, RecordUsageSchema, UsageQuerySchema } from '../billing/usage-tracker.js';
import { InvoiceHandler, InvoiceQuerySchema } from '../billing/invoice-handler.js';
import { WebhookHandler } from '../billing/webhook-handler.js';
import { getStripeClient } from '../billing/stripe-client.js';
import { getPostgresClient } from '../postgres.js';
import { logger } from '../logger.js';

const billing = new Hono();

// Initialize services
const subscriptionManager = new SubscriptionManager();
const usageTracker = new UsageTracker();
const invoiceHandler = new InvoiceHandler();
const webhookHandler = new WebhookHandler();

// Middleware to extract user info from headers/token
// This is a placeholder - replace with your actual auth middleware
const requireAuth = async (c: any, next: any) => {
  const userId = c.req.header('x-user-id') || 'user123'; // Replace with actual auth
  const organizationId = c.req.header('x-organization-id') || undefined;
  
  c.set('userId', userId);
  c.set('organizationId', organizationId);
  await next();
};

// Schemas for API validation
const BillingPlanQuerySchema = z.object({
  active: z.string().optional().transform(val => val === 'true'),
});

const CheckoutSessionSchema = z.object({
  planName: z.enum(['free', 'starter', 'professional', 'enterprise']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  customerEmail: z.string().email(),
  customerName: z.string().optional(),
  trialDays: z.number().min(0).max(30).optional(),
});

const BillingPortalSchema = z.object({
  returnUrl: z.string().url(),
});

// GET /billing/plans - List available billing plans
billing.get('/plans', zValidator('query', BillingPlanQuerySchema), async (c) => {
  try {
    const { active } = c.req.valid('query');
    
    const postgres = getPostgresClient();
    const conditions = active !== undefined ? 'WHERE is_active = $1' : '';
    const params = active !== undefined ? [active] : [];
    
    const result = await postgres.query(
      `SELECT 
        id, name, display_name, description, price_cents, currency,
        billing_interval, features, limits, sort_order, is_active
       FROM billing_plans 
       ${conditions}
       ORDER BY sort_order ASC`,
      params
    );

    return c.json({
      success: true,
      data: result.rows.map(plan => ({
        ...plan,
        price: {
          amount: plan.price_cents,
          currency: plan.currency,
          formatted: `$${(plan.price_cents / 100).toFixed(2)}`,
        },
      })),
    });
  } catch (error) {
    logger.error('Failed to list billing plans:', error);
    return c.json({ success: false, error: 'Failed to list billing plans' }, 500);
  }
});

// POST /billing/subscribe - Create a new subscription
billing.post('/subscribe', requireAuth, zValidator('json', CreateSubscriptionSchema), async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const subscriptionData = c.req.valid('json');

    const subscription = await subscriptionManager.createSubscription({
      ...subscriptionData,
      userId,
      organizationId,
    });

    return c.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    logger.error('Failed to create subscription:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create subscription' 
    }, 400);
  }
});

// GET /billing/subscription - Get current subscription
billing.get('/subscription', requireAuth, async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;

    const subscription = await subscriptionManager.getSubscription(userId, organizationId);
    
    if (!subscription) {
      return c.json({
        success: true,
        data: null,
      });
    }

    return c.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    logger.error('Failed to get subscription:', error);
    return c.json({ success: false, error: 'Failed to get subscription' }, 500);
  }
});

// PUT /billing/subscription - Update subscription
billing.put('/subscription', requireAuth, zValidator('json', UpdateSubscriptionSchema), async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const updates = c.req.valid('json');

    const subscription = await subscriptionManager.updateSubscription(userId, organizationId, updates);

    return c.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    logger.error('Failed to update subscription:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update subscription' 
    }, 400);
  }
});

// DELETE /billing/subscription - Cancel subscription
billing.delete('/subscription', requireAuth, async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const immediately = c.req.query('immediately') === 'true';

    const subscription = await subscriptionManager.cancelSubscription(userId, organizationId, immediately);

    return c.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    logger.error('Failed to cancel subscription:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to cancel subscription' 
    }, 400);
  }
});

// POST /billing/usage - Record usage
billing.post('/usage', requireAuth, zValidator('json', RecordUsageSchema), async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const usageData = c.req.valid('json');

    const usageId = await usageTracker.recordUsage({
      ...usageData,
      userId,
      organizationId,
    });

    return c.json({
      success: true,
      data: { usageId },
    });
  } catch (error) {
    logger.error('Failed to record usage:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to record usage' 
    }, 400);
  }
});

// GET /billing/usage - Get usage metrics
billing.get('/usage', requireAuth, zValidator('query', UsageQuerySchema.partial().extend({
  current_month: z.string().optional().transform(val => val === 'true'),
})), async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const query = c.req.valid('query');

    if (query.current_month) {
      const usage = await usageTracker.getCurrentMonthUsage(userId, organizationId);
      return c.json({
        success: true,
        data: usage,
      });
    }

    const usage = await usageTracker.getUsage({
      userId,
      organizationId,
      metric: query.metric,
      periodStart: query.periodStart,
      periodEnd: query.periodEnd,
    });

    return c.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    logger.error('Failed to get usage:', error);
    return c.json({ success: false, error: 'Failed to get usage' }, 500);
  }
});

// GET /billing/usage/alerts - Get usage alerts
billing.get('/usage/alerts', requireAuth, async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;

    const alerts = await usageTracker.getUsageAlerts(userId, organizationId);

    return c.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    logger.error('Failed to get usage alerts:', error);
    return c.json({ success: false, error: 'Failed to get usage alerts' }, 500);
  }
});

// GET /billing/usage/check/:metric - Check usage limit for a specific metric
billing.get('/usage/check/:metric', requireAuth, async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const metric = c.req.param('metric');

    const usageCheck = await usageTracker.checkUsageLimit(userId, organizationId, metric);

    return c.json({
      success: true,
      data: usageCheck,
    });
  } catch (error) {
    logger.error('Failed to check usage limit:', error);
    return c.json({ success: false, error: 'Failed to check usage limit' }, 500);
  }
});

// GET /billing/invoices - List invoices
billing.get('/invoices', requireAuth, zValidator('query', InvoiceQuerySchema.partial().extend({
  limit: z.string().optional().transform(val => val ? parseInt(val) : undefined),
  offset: z.string().optional().transform(val => val ? parseInt(val) : undefined),
})), async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const query = c.req.valid('query');

    const result = await invoiceHandler.listInvoices({
      userId,
      organizationId,
      status: query.status,
      limit: query.limit || 20,
      offset: query.offset || 0,
    });

    return c.json({
      success: true,
      data: result.invoices,
      meta: {
        total: result.total,
        hasMore: result.hasMore,
        limit: query.limit || 20,
        offset: query.offset || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to list invoices:', error);
    return c.json({ success: false, error: 'Failed to list invoices' }, 500);
  }
});

// GET /billing/invoices/:id - Get specific invoice
billing.get('/invoices/:id', requireAuth, async (c) => {
  try {
    const invoiceId = c.req.param('id');
    const invoice = await invoiceHandler.getInvoice(invoiceId);

    if (!invoice) {
      return c.json({ success: false, error: 'Invoice not found' }, 404);
    }

    // Check if user has access to this invoice
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    
    if (invoice.user_id !== userId || invoice.organization_id !== organizationId) {
      return c.json({ success: false, error: 'Access denied' }, 403);
    }

    return c.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Failed to get invoice:', error);
    return c.json({ success: false, error: 'Failed to get invoice' }, 500);
  }
});

// GET /billing/invoices/:id/pdf - Get invoice PDF
billing.get('/invoices/:id/pdf', requireAuth, async (c) => {
  try {
    const invoiceId = c.req.param('id');
    const pdfUrl = await invoiceHandler.generateInvoicePDF(invoiceId);

    if (!pdfUrl) {
      return c.json({ success: false, error: 'PDF not available' }, 404);
    }

    return c.redirect(pdfUrl);
  } catch (error) {
    logger.error('Failed to get invoice PDF:', error);
    return c.json({ success: false, error: 'Failed to get invoice PDF' }, 500);
  }
});

// GET /billing/summary - Get billing summary
billing.get('/summary', requireAuth, async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;

    const [subscription, usage, invoiceSummary] = await Promise.all([
      subscriptionManager.getSubscription(userId, organizationId),
      usageTracker.getCurrentMonthUsage(userId, organizationId),
      invoiceHandler.getInvoiceSummary(userId, organizationId),
    ]);

    return c.json({
      success: true,
      data: {
        subscription,
        usage,
        invoices: invoiceSummary,
      },
    });
  } catch (error) {
    logger.error('Failed to get billing summary:', error);
    return c.json({ success: false, error: 'Failed to get billing summary' }, 500);
  }
});

// POST /billing/checkout - Create Stripe checkout session
billing.post('/checkout', requireAuth, zValidator('json', CheckoutSessionSchema), async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const checkoutData = c.req.valid('json');

    // Get plan details
    const postgres = getPostgresClient();
    const planResult = await postgres.query(
      'SELECT * FROM billing_plans WHERE name = $1 AND is_active = true',
      [checkoutData.planName]
    );

    if (planResult.rows.length === 0) {
      return c.json({ success: false, error: 'Plan not found' }, 404);
    }

    const plan = planResult.rows[0];

    if (!plan.stripe_price_id) {
      return c.json({ success: false, error: 'Plan not available for checkout' }, 400);
    }

    const stripe = getStripeClient();
    const session = await stripe.createCheckoutSession({
      customerEmail: checkoutData.customerEmail,
      priceId: plan.stripe_price_id,
      successUrl: checkoutData.successUrl,
      cancelUrl: checkoutData.cancelUrl,
      trialPeriodDays: checkoutData.trialDays,
      metadata: {
        userId,
        organizationId: organizationId || '',
        planName: checkoutData.planName,
      },
    });

    return c.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    logger.error('Failed to create checkout session:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create checkout session' 
    }, 400);
  }
});

// POST /billing/portal - Create billing portal session
billing.post('/portal', requireAuth, zValidator('json', BillingPortalSchema), async (c) => {
  try {
    const userId = c.get('userId') as string;
    const organizationId = c.get('organizationId') as string | undefined;
    const { returnUrl } = c.req.valid('json');

    // Get subscription to find customer ID
    const subscription = await subscriptionManager.getSubscription(userId, organizationId);
    
    if (!subscription || !subscription.stripe_customer_id) {
      return c.json({ success: false, error: 'No active subscription found' }, 404);
    }

    const stripe = getStripeClient();
    const session = await stripe.createBillingPortalSession({
      customerId: subscription.stripe_customer_id,
      returnUrl,
    });

    return c.json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    logger.error('Failed to create billing portal session:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create billing portal session' 
    }, 400);
  }
});

// POST /billing/webhook - Handle Stripe webhooks
billing.post('/webhook', async (c) => {
  try {
    const payload = await c.req.text();
    const signature = c.req.header('stripe-signature');
    
    if (!signature) {
      return c.json({ success: false, error: 'Missing Stripe signature' }, 400);
    }

    const result = await webhookHandler.handleWebhook(payload, signature);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Webhook handling failed:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Webhook handling failed' 
    }, 400);
  }
});

// Middleware to enforce usage limits
export const enforceUsageLimit = (metric: string) => {
  return async (c: any, next: any) => {
    try {
      const userId = c.get('userId') as string;
      const organizationId = c.get('organizationId') as string | undefined;

      if (userId) {
        await usageTracker.enforceUsageLimit(userId, organizationId, metric);
      }

      await next();
    } catch (error) {
      logger.error(`Usage limit enforcement failed for ${metric}:`, error);
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Usage limit exceeded' 
      }, 403);
    }
  };
};

export { billing };