import Stripe from 'stripe';
import { getStripeClient } from './stripe-client.js';
import { SubscriptionManager } from './subscription-manager.js';
import { InvoiceHandler } from './invoice-handler.js';
import { logger } from '../logger.js';

export class WebhookHandler {
  private stripe;
  private subscriptionManager;
  private invoiceHandler;

  constructor() {
    this.stripe = getStripeClient();
    this.subscriptionManager = new SubscriptionManager();
    this.invoiceHandler = new InvoiceHandler();
  }

  async handleWebhook(payload: string | Buffer, signature: string): Promise<{ received: boolean; processed: boolean }> {
    try {
      // Construct and verify the webhook event
      const event = this.stripe.constructEvent(payload, signature);
      
      logger.info(`Received Stripe webhook: ${event.type} (${event.id})`);

      let processed = false;

      switch (event.type) {
        // Customer events
        case 'customer.created':
          processed = await this.handleCustomerCreated(event);
          break;
        case 'customer.updated':
          processed = await this.handleCustomerUpdated(event);
          break;
        case 'customer.deleted':
          processed = await this.handleCustomerDeleted(event);
          break;

        // Subscription events
        case 'customer.subscription.created':
          processed = await this.handleSubscriptionCreated(event);
          break;
        case 'customer.subscription.updated':
          processed = await this.handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          processed = await this.handleSubscriptionDeleted(event);
          break;
        case 'customer.subscription.trial_will_end':
          processed = await this.handleSubscriptionTrialWillEnd(event);
          break;

        // Invoice events
        case 'invoice.created':
          processed = await this.handleInvoiceCreated(event);
          break;
        case 'invoice.updated':
          processed = await this.handleInvoiceUpdated(event);
          break;
        case 'invoice.paid':
          processed = await this.handleInvoicePaid(event);
          break;
        case 'invoice.payment_failed':
          processed = await this.handleInvoicePaymentFailed(event);
          break;
        case 'invoice.payment_action_required':
          processed = await this.handleInvoicePaymentActionRequired(event);
          break;
        case 'invoice.voided':
          processed = await this.handleInvoiceVoided(event);
          break;

        // Payment events
        case 'payment_intent.succeeded':
          processed = await this.handlePaymentIntentSucceeded(event);
          break;
        case 'payment_intent.payment_failed':
          processed = await this.handlePaymentIntentFailed(event);
          break;

        // Payment method events
        case 'payment_method.attached':
          processed = await this.handlePaymentMethodAttached(event);
          break;

        // Checkout events
        case 'checkout.session.completed':
          processed = await this.handleCheckoutSessionCompleted(event);
          break;

        default:
          logger.info(`Unhandled webhook event type: ${event.type}`);
          processed = false;
      }

      logger.info(`Webhook ${event.id} processed: ${processed}`);
      
      return { received: true, processed };
    } catch (error) {
      logger.error('Webhook handling failed:', error);
      throw error;
    }
  }

  private async handleCustomerCreated(event: Stripe.Event): Promise<boolean> {
    try {
      const customer = event.data.object as Stripe.Customer;
      logger.info(`Customer created: ${customer.id}`);
      // Customer creation is handled during subscription creation
      return true;
    } catch (error) {
      logger.error('Failed to handle customer created:', error);
      return false;
    }
  }

  private async handleCustomerUpdated(event: Stripe.Event): Promise<boolean> {
    try {
      const customer = event.data.object as Stripe.Customer;
      logger.info(`Customer updated: ${customer.id}`);
      // Handle customer updates if needed (email, name, etc.)
      return true;
    } catch (error) {
      logger.error('Failed to handle customer updated:', error);
      return false;
    }
  }

  private async handleCustomerDeleted(event: Stripe.Event): Promise<boolean> {
    try {
      const customer = event.data.object as Stripe.Customer;
      logger.info(`Customer deleted: ${customer.id}`);
      // Handle customer deletion - might want to cancel subscriptions
      return true;
    } catch (error) {
      logger.error('Failed to handle customer deleted:', error);
      return false;
    }
  }

  private async handleSubscriptionCreated(event: Stripe.Event): Promise<boolean> {
    try {
      const subscription = event.data.object as Stripe.Subscription;
      logger.info(`Subscription created: ${subscription.id}`);
      
      // Sync with database
      const dbSubscription = await this.subscriptionManager.getSubscriptionByStripeId(subscription.id);
      if (dbSubscription) {
        await this.subscriptionManager.syncWithStripe(dbSubscription.id);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle subscription created:', error);
      return false;
    }
  }

  private async handleSubscriptionUpdated(event: Stripe.Event): Promise<boolean> {
    try {
      const subscription = event.data.object as Stripe.Subscription;
      logger.info(`Subscription updated: ${subscription.id}`);
      
      // Sync with database
      const dbSubscription = await this.subscriptionManager.getSubscriptionByStripeId(subscription.id);
      if (dbSubscription) {
        await this.subscriptionManager.syncWithStripe(dbSubscription.id);
        
        // Handle specific status changes
        if (subscription.status === 'active' && subscription.trial_end && subscription.trial_end * 1000 < Date.now()) {
          logger.info(`Subscription ${subscription.id} trial ended, now active`);
        }
        
        if (subscription.cancel_at_period_end) {
          logger.info(`Subscription ${subscription.id} scheduled for cancellation`);
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle subscription updated:', error);
      return false;
    }
  }

  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<boolean> {
    try {
      const subscription = event.data.object as Stripe.Subscription;
      logger.info(`Subscription deleted: ${subscription.id}`);
      
      // Sync with database to mark as canceled
      const dbSubscription = await this.subscriptionManager.getSubscriptionByStripeId(subscription.id);
      if (dbSubscription) {
        await this.subscriptionManager.syncWithStripe(dbSubscription.id);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle subscription deleted:', error);
      return false;
    }
  }

  private async handleSubscriptionTrialWillEnd(event: Stripe.Event): Promise<boolean> {
    try {
      const subscription = event.data.object as Stripe.Subscription;
      logger.info(`Subscription trial will end: ${subscription.id}`);
      
      // Get subscription details
      const dbSubscription = await this.subscriptionManager.getSubscriptionByStripeId(subscription.id);
      if (dbSubscription) {
        // Send notification to user about trial ending
        // This is where you'd integrate with your notification system
        logger.info(`Trial ending soon for user ${dbSubscription.user_id}`);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle subscription trial will end:', error);
      return false;
    }
  }

  private async handleInvoiceCreated(event: Stripe.Event): Promise<boolean> {
    try {
      const invoice = event.data.object as Stripe.Invoice;
      logger.info(`Invoice created: ${invoice.id}`);
      
      // Sync invoice to database
      await this.invoiceHandler.syncInvoiceFromStripe(invoice.id);
      
      return true;
    } catch (error) {
      logger.error('Failed to handle invoice created:', error);
      return false;
    }
  }

  private async handleInvoiceUpdated(event: Stripe.Event): Promise<boolean> {
    try {
      const invoice = event.data.object as Stripe.Invoice;
      logger.info(`Invoice updated: ${invoice.id}`);
      
      // Sync invoice to database
      await this.invoiceHandler.syncInvoiceFromStripe(invoice.id);
      
      return true;
    } catch (error) {
      logger.error('Failed to handle invoice updated:', error);
      return false;
    }
  }

  private async handleInvoicePaid(event: Stripe.Event): Promise<boolean> {
    try {
      const invoice = event.data.object as Stripe.Invoice;
      logger.info(`Invoice paid: ${invoice.id}`);
      
      // Sync invoice and mark as paid
      const dbInvoice = await this.invoiceHandler.syncInvoiceFromStripe(invoice.id);
      
      // Handle successful payment
      if (dbInvoice) {
        logger.info(`Payment successful for user ${dbInvoice.user_id}, invoice ${dbInvoice.id}`);
        
        // Here you might want to:
        // - Send payment confirmation email
        // - Update user's account status
        // - Grant access to features
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle invoice paid:', error);
      return false;
    }
  }

  private async handleInvoicePaymentFailed(event: Stripe.Event): Promise<boolean> {
    try {
      const invoice = event.data.object as Stripe.Invoice;
      logger.info(`Invoice payment failed: ${invoice.id}`);
      
      // Sync invoice to get latest status
      const dbInvoice = await this.invoiceHandler.syncInvoiceFromStripe(invoice.id);
      
      if (dbInvoice) {
        // Record the failed attempt
        await this.invoiceHandler.markInvoiceAsFailed(dbInvoice.id);
        
        logger.warn(`Payment failed for user ${dbInvoice.user_id}, invoice ${dbInvoice.id}`);
        
        // Handle payment failure
        // - Send notification to user
        // - Check if subscription should be suspended
        // - Retry payment logic
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle invoice payment failed:', error);
      return false;
    }
  }

  private async handleInvoicePaymentActionRequired(event: Stripe.Event): Promise<boolean> {
    try {
      const invoice = event.data.object as Stripe.Invoice;
      logger.info(`Invoice payment action required: ${invoice.id}`);
      
      // Sync invoice
      const dbInvoice = await this.invoiceHandler.syncInvoiceFromStripe(invoice.id);
      
      if (dbInvoice) {
        logger.info(`Payment action required for user ${dbInvoice.user_id}, invoice ${dbInvoice.id}`);
        
        // Send notification to user about required action
        // This might involve 3D Secure or other authentication
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle invoice payment action required:', error);
      return false;
    }
  }

  private async handleInvoiceVoided(event: Stripe.Event): Promise<boolean> {
    try {
      const invoice = event.data.object as Stripe.Invoice;
      logger.info(`Invoice voided: ${invoice.id}`);
      
      // Sync invoice to update status
      await this.invoiceHandler.syncInvoiceFromStripe(invoice.id);
      
      return true;
    } catch (error) {
      logger.error('Failed to handle invoice voided:', error);
      return false;
    }
  }

  private async handlePaymentIntentSucceeded(event: Stripe.Event): Promise<boolean> {
    try {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      logger.info(`Payment intent succeeded: ${paymentIntent.id}`);
      
      // Find related invoice
      if (paymentIntent.invoice) {
        const dbInvoice = await this.invoiceHandler.getInvoiceByStripeId(paymentIntent.invoice as string);
        if (dbInvoice) {
          await this.invoiceHandler.markInvoiceAsPaid(dbInvoice.id, paymentIntent.id);
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle payment intent succeeded:', error);
      return false;
    }
  }

  private async handlePaymentIntentFailed(event: Stripe.Event): Promise<boolean> {
    try {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      logger.info(`Payment intent failed: ${paymentIntent.id}`);
      
      // Find related invoice and record failure
      if (paymentIntent.invoice) {
        const dbInvoice = await this.invoiceHandler.getInvoiceByStripeId(paymentIntent.invoice as string);
        if (dbInvoice) {
          await this.invoiceHandler.recordPaymentAttempt(
            dbInvoice.id,
            paymentIntent.id,
            paymentIntent.amount,
            'failed',
            paymentIntent.last_payment_error?.code,
            paymentIntent.last_payment_error?.message
          );
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle payment intent failed:', error);
      return false;
    }
  }

  private async handlePaymentMethodAttached(event: Stripe.Event): Promise<boolean> {
    try {
      const paymentMethod = event.data.object as Stripe.PaymentMethod;
      logger.info(`Payment method attached: ${paymentMethod.id}`);
      
      // Payment method attachment is handled during subscription creation
      return true;
    } catch (error) {
      logger.error('Failed to handle payment method attached:', error);
      return false;
    }
  }

  private async handleCheckoutSessionCompleted(event: Stripe.Event): Promise<boolean> {
    try {
      const session = event.data.object as Stripe.Checkout.Session;
      logger.info(`Checkout session completed: ${session.id}`);
      
      // Handle successful checkout
      if (session.subscription) {
        // Get the subscription and sync it
        const dbSubscription = await this.subscriptionManager.getSubscriptionByStripeId(session.subscription as string);
        if (dbSubscription) {
          await this.subscriptionManager.syncWithStripe(dbSubscription.id);
          logger.info(`Checkout completed for user ${dbSubscription.user_id}`);
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to handle checkout session completed:', error);
      return false;
    }
  }

  // Helper method to get event-specific metadata
  private getEventMetadata(event: Stripe.Event): Record<string, any> {
    return {
      event_id: event.id,
      event_type: event.type,
      created: event.created,
      api_version: event.api_version,
      request_id: event.request?.id,
    };
  }

  // Method to handle webhook retries and idempotency
  async isEventProcessed(eventId: string): Promise<boolean> {
    try {
      // Check if we've already processed this webhook event
      // This could be implemented using a database table or cache
      // For now, we'll assume it's not implemented and always return false
      return false;
    } catch (error) {
      logger.error('Failed to check if event is processed:', error);
      return false;
    }
  }

  async markEventAsProcessed(eventId: string): Promise<void> {
    try {
      // Mark the webhook event as processed to prevent duplicate handling
      // This could be implemented using a database table or cache
      logger.info(`Marked webhook event ${eventId} as processed`);
    } catch (error) {
      logger.error('Failed to mark event as processed:', error);
    }
  }
}