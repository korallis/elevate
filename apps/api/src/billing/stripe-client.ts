import Stripe from 'stripe';
import { logger } from '../logger.js';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  apiVersion: '2024-12-18.acacia';
}

export class StripeClient {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion,
    });
    this.webhookSecret = config.webhookSecret;
    
    logger.info('Stripe client initialized');
  }

  // Customer Management
  async createCustomer(params: {
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.create({
        email: params.email,
        name: params.name,
        metadata: params.metadata || {},
      });
      
      logger.info(`Created Stripe customer: ${customer.id}`);
      return customer;
    } catch (error) {
      logger.error('Failed to create customer:', error);
      throw error;
    }
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      return customer as Stripe.Customer;
    } catch (error) {
      if ((error as Stripe.errors.StripeError).type === 'StripeInvalidRequestError') {
        return null;
      }
      logger.error('Failed to retrieve customer:', error);
      throw error;
    }
  }

  async updateCustomer(customerId: string, params: {
    email?: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, params);
      logger.info(`Updated Stripe customer: ${customer.id}`);
      return customer;
    } catch (error) {
      logger.error('Failed to update customer:', error);
      throw error;
    }
  }

  // Price Management
  async createPrice(params: {
    productId: string;
    unitAmount: number;
    currency: string;
    recurring?: {
      interval: 'month' | 'year';
      intervalCount?: number;
    };
    metadata?: Record<string, string>;
  }): Promise<Stripe.Price> {
    try {
      const price = await this.stripe.prices.create({
        product: params.productId,
        unit_amount: params.unitAmount,
        currency: params.currency,
        recurring: params.recurring,
        metadata: params.metadata,
      });
      
      logger.info(`Created Stripe price: ${price.id}`);
      return price;
    } catch (error) {
      logger.error('Failed to create price:', error);
      throw error;
    }
  }

  async listPrices(params?: {
    product?: string;
    active?: boolean;
    limit?: number;
  }): Promise<Stripe.Price[]> {
    try {
      const prices = await this.stripe.prices.list({
        product: params?.product,
        active: params?.active,
        limit: params?.limit || 100,
      });
      
      return prices.data;
    } catch (error) {
      logger.error('Failed to list prices:', error);
      throw error;
    }
  }

  // Subscription Management
  async createSubscription(params: {
    customerId: string;
    priceId: string;
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: params.customerId,
        items: [{
          price: params.priceId,
        }],
        trial_period_days: params.trialPeriodDays,
        metadata: params.metadata || {},
        expand: ['latest_invoice.payment_intent'],
      });
      
      logger.info(`Created Stripe subscription: ${subscription.id}`);
      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription:', error);
      throw error;
    }
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice.payment_intent'],
      });
      return subscription;
    } catch (error) {
      if ((error as Stripe.errors.StripeError).type === 'StripeInvalidRequestError') {
        return null;
      }
      logger.error('Failed to retrieve subscription:', error);
      throw error;
    }
  }

  async updateSubscription(subscriptionId: string, params: {
    priceId?: string;
    metadata?: Record<string, string>;
    cancelAtPeriodEnd?: boolean;
  }): Promise<Stripe.Subscription> {
    try {
      const updateParams: Stripe.SubscriptionUpdateParams = {};
      
      if (params.priceId) {
        updateParams.items = [{
          id: (await this.stripe.subscriptions.retrieve(subscriptionId)).items.data[0].id,
          price: params.priceId,
        }];
      }
      
      if (params.metadata) {
        updateParams.metadata = params.metadata;
      }
      
      if (params.cancelAtPeriodEnd !== undefined) {
        updateParams.cancel_at_period_end = params.cancelAtPeriodEnd;
      }
      
      const subscription = await this.stripe.subscriptions.update(subscriptionId, updateParams);
      logger.info(`Updated Stripe subscription: ${subscription.id}`);
      return subscription;
    } catch (error) {
      logger.error('Failed to update subscription:', error);
      throw error;
    }
  }

  async cancelSubscription(subscriptionId: string, immediately = false): Promise<Stripe.Subscription> {
    try {
      const subscription = immediately 
        ? await this.stripe.subscriptions.cancel(subscriptionId)
        : await this.stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
          });
      
      logger.info(`${immediately ? 'Canceled' : 'Scheduled cancellation for'} subscription: ${subscription.id}`);
      return subscription;
    } catch (error) {
      logger.error('Failed to cancel subscription:', error);
      throw error;
    }
  }

  // Invoice Management
  async createInvoice(params: {
    customerId: string;
    subscriptionId?: string;
    autoAdvance?: boolean;
  }): Promise<Stripe.Invoice> {
    try {
      const invoice = await this.stripe.invoices.create({
        customer: params.customerId,
        subscription: params.subscriptionId,
        auto_advance: params.autoAdvance !== false,
      });
      
      logger.info(`Created Stripe invoice: ${invoice.id}`);
      return invoice;
    } catch (error) {
      logger.error('Failed to create invoice:', error);
      throw error;
    }
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice | null> {
    try {
      const invoice = await this.stripe.invoices.retrieve(invoiceId);
      return invoice;
    } catch (error) {
      if ((error as Stripe.errors.StripeError).type === 'StripeInvalidRequestError') {
        return null;
      }
      logger.error('Failed to retrieve invoice:', error);
      throw error;
    }
  }

  async listInvoices(params: {
    customerId?: string;
    subscriptionId?: string;
    status?: Stripe.Invoice.Status;
    limit?: number;
  }): Promise<Stripe.Invoice[]> {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: params.customerId,
        subscription: params.subscriptionId,
        status: params.status,
        limit: params.limit || 100,
      });
      
      return invoices.data;
    } catch (error) {
      logger.error('Failed to list invoices:', error);
      throw error;
    }
  }

  // Usage Records (for metered billing)
  async createUsageRecord(params: {
    subscriptionItemId: string;
    quantity: number;
    timestamp?: number;
    action?: 'increment' | 'set';
  }): Promise<Stripe.UsageRecord> {
    try {
      const usageRecord = await this.stripe.subscriptionItems.createUsageRecord(
        params.subscriptionItemId,
        {
          quantity: params.quantity,
          timestamp: params.timestamp || Math.floor(Date.now() / 1000),
          action: params.action || 'increment',
        }
      );
      
      logger.info(`Created usage record for subscription item: ${params.subscriptionItemId}`);
      return usageRecord;
    } catch (error) {
      logger.error('Failed to create usage record:', error);
      throw error;
    }
  }

  // Payment Methods
  async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      
      logger.info(`Attached payment method ${paymentMethodId} to customer ${customerId}`);
      return paymentMethod;
    } catch (error) {
      logger.error('Failed to attach payment method:', error);
      throw error;
    }
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      
      logger.info(`Set default payment method for customer: ${customerId}`);
      return customer;
    } catch (error) {
      logger.error('Failed to set default payment method:', error);
      throw error;
    }
  }

  // Webhook handling
  constructEvent(payload: string | Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (error) {
      logger.error('Failed to construct webhook event:', error);
      throw error;
    }
  }

  // Portal Sessions
  async createBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<Stripe.BillingPortal.Session> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
      });
      
      logger.info(`Created billing portal session for customer: ${params.customerId}`);
      return session;
    } catch (error) {
      logger.error('Failed to create billing portal session:', error);
      throw error;
    }
  }

  // Checkout Sessions
  async createCheckoutSession(params: {
    customerId?: string;
    customerEmail?: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        customer: params.customerId,
        customer_email: params.customerEmail,
        line_items: [{
          price: params.priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        subscription_data: {
          trial_period_days: params.trialPeriodDays,
          metadata: params.metadata,
        },
      });
      
      logger.info(`Created checkout session: ${session.id}`);
      return session;
    } catch (error) {
      logger.error('Failed to create checkout session:', error);
      throw error;
    }
  }
}

// Singleton instance
let stripeClient: StripeClient | null = null;

export function initializeStripeClient(config: StripeConfig): StripeClient {
  stripeClient = new StripeClient(config);
  return stripeClient;
}

export function getStripeClient(): StripeClient {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Call initializeStripeClient first.');
  }
  return stripeClient;
}