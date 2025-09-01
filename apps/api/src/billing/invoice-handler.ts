import { z } from 'zod';
import Stripe from 'stripe';
import { getStripeClient } from './stripe-client.js';
import { getPostgresClient } from '../postgres.js';
import { logger } from '../logger.js';

// Invoice schemas
export const CreateInvoiceSchema = z.object({
  subscriptionId: z.string().uuid(),
  customerId: z.string().min(1),
  dueDate: z.date().optional(),
  autoAdvance: z.boolean().default(true),
});

export const InvoiceQuerySchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().optional(),
  status: z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export interface DatabaseInvoice {
  id: string;
  subscription_id: string;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  invoice_number: string | null;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  status: string;
  invoice_pdf_url: string | null;
  hosted_invoice_url: string | null;
  period_start: Date | null;
  period_end: Date | null;
  due_date: Date | null;
  paid_at: Date | null;
  voided_at: Date | null;
  attempt_count: number;
  next_payment_attempt: Date | null;
  line_items: any[];
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  // Joined subscription data
  user_id: string;
  organization_id: string | null;
  plan_name: string;
  plan_display_name: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  stripe_line_item_id: string | null;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  currency: string;
  period_start: Date | null;
  period_end: Date | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export class InvoiceHandler {
  private postgres;
  private stripe;

  constructor() {
    this.postgres = getPostgresClient();
    this.stripe = getStripeClient();
  }

  async syncInvoiceFromStripe(stripeInvoiceId: string): Promise<DatabaseInvoice> {
    try {
      // Get invoice from Stripe
      const stripeInvoice = await this.stripe.getInvoice(stripeInvoiceId);
      if (!stripeInvoice) {
        throw new Error(`Stripe invoice ${stripeInvoiceId} not found`);
      }

      // Get subscription from database
      const subscriptionResult = await this.postgres.query(
        'SELECT id FROM subscriptions WHERE stripe_subscription_id = $1',
        [stripeInvoice.subscription]
      );

      if (subscriptionResult.rows.length === 0) {
        throw new Error(`Subscription not found for Stripe subscription ${stripeInvoice.subscription}`);
      }

      const subscriptionId = subscriptionResult.rows[0].id;

      // Upsert invoice
      const invoiceResult = await this.postgres.query(
        `INSERT INTO invoices (
          subscription_id, stripe_invoice_id, stripe_payment_intent_id, invoice_number,
          amount_due, amount_paid, amount_remaining, currency, status,
          invoice_pdf_url, hosted_invoice_url, period_start, period_end,
          due_date, paid_at, voided_at, attempt_count, next_payment_attempt,
          line_items, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (stripe_invoice_id) DO UPDATE SET
          stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
          invoice_number = EXCLUDED.invoice_number,
          amount_due = EXCLUDED.amount_due,
          amount_paid = EXCLUDED.amount_paid,
          amount_remaining = EXCLUDED.amount_remaining,
          status = EXCLUDED.status,
          invoice_pdf_url = EXCLUDED.invoice_pdf_url,
          hosted_invoice_url = EXCLUDED.hosted_invoice_url,
          due_date = EXCLUDED.due_date,
          paid_at = EXCLUDED.paid_at,
          voided_at = EXCLUDED.voided_at,
          attempt_count = EXCLUDED.attempt_count,
          next_payment_attempt = EXCLUDED.next_payment_attempt,
          line_items = EXCLUDED.line_items,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id`,
        [
          subscriptionId,
          stripeInvoice.id,
          stripeInvoice.payment_intent as string | null,
          stripeInvoice.number,
          stripeInvoice.amount_due,
          stripeInvoice.amount_paid,
          stripeInvoice.amount_remaining,
          stripeInvoice.currency,
          stripeInvoice.status,
          stripeInvoice.invoice_pdf,
          stripeInvoice.hosted_invoice_url,
          stripeInvoice.period_start ? new Date(stripeInvoice.period_start * 1000) : null,
          stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000) : null,
          stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null,
          stripeInvoice.status_transitions.paid_at ? new Date(stripeInvoice.status_transitions.paid_at * 1000) : null,
          stripeInvoice.status_transitions.voided_at ? new Date(stripeInvoice.status_transitions.voided_at * 1000) : null,
          stripeInvoice.attempt_count,
          stripeInvoice.next_payment_attempt ? new Date(stripeInvoice.next_payment_attempt * 1000) : null,
          JSON.stringify(stripeInvoice.lines.data),
          JSON.stringify(stripeInvoice.metadata),
        ]
      );

      const invoiceId = invoiceResult.rows[0].id;

      // Sync line items
      await this.syncInvoiceLineItems(invoiceId, stripeInvoice.lines.data);

      // Get complete invoice with subscription data
      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        throw new Error('Failed to retrieve synced invoice');
      }

      logger.info(`Synced invoice ${stripeInvoiceId} to database`);
      return invoice;
    } catch (error) {
      logger.error('Failed to sync invoice from Stripe:', error);
      throw error;
    }
  }

  private async syncInvoiceLineItems(invoiceId: string, stripeLineItems: Stripe.InvoiceLineItem[]): Promise<void> {
    try {
      // Delete existing line items
      await this.postgres.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [invoiceId]);

      // Insert new line items
      for (const item of stripeLineItems) {
        await this.postgres.query(
          `INSERT INTO invoice_line_items (
            invoice_id, stripe_line_item_id, description, quantity,
            unit_amount, amount, currency, period_start, period_end, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            invoiceId,
            item.id,
            item.description || '',
            item.quantity || 1,
            item.unit_amount || 0,
            item.amount,
            item.currency,
            item.period?.start ? new Date(item.period.start * 1000) : null,
            item.period?.end ? new Date(item.period.end * 1000) : null,
            JSON.stringify(item.metadata || {}),
          ]
        );
      }
    } catch (error) {
      logger.error('Failed to sync invoice line items:', error);
      throw error;
    }
  }

  async getInvoice(invoiceId: string): Promise<DatabaseInvoice | null> {
    try {
      const result = await this.postgres.query(
        `SELECT 
          i.*,
          s.user_id,
          s.organization_id,
          bp.name as plan_name,
          bp.display_name as plan_display_name
         FROM invoices i
         JOIN subscriptions s ON i.subscription_id = s.id
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE i.id = $1`,
        [invoiceId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get invoice:', error);
      throw error;
    }
  }

  async getInvoiceByStripeId(stripeInvoiceId: string): Promise<DatabaseInvoice | null> {
    try {
      const result = await this.postgres.query(
        `SELECT 
          i.*,
          s.user_id,
          s.organization_id,
          bp.name as plan_name,
          bp.display_name as plan_display_name
         FROM invoices i
         JOIN subscriptions s ON i.subscription_id = s.id
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE i.stripe_invoice_id = $1`,
        [stripeInvoiceId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get invoice by Stripe ID:', error);
      throw error;
    }
  }

  async listInvoices(query: z.infer<typeof InvoiceQuerySchema>): Promise<{
    invoices: DatabaseInvoice[];
    total: number;
    hasMore: boolean;
  }> {
    const validatedQuery = InvoiceQuerySchema.parse(query);

    try {
      const conditions: string[] = ['s.user_id = $1'];
      const params: any[] = [validatedQuery.userId];
      let paramIndex = 2;

      if (validatedQuery.organizationId) {
        conditions.push(`s.organization_id = $${paramIndex++}`);
        params.push(validatedQuery.organizationId);
      }

      if (validatedQuery.status) {
        conditions.push(`i.status = $${paramIndex++}`);
        params.push(validatedQuery.status);
      }

      // Get total count
      const countResult = await this.postgres.query(
        `SELECT COUNT(*) as total
         FROM invoices i
         JOIN subscriptions s ON i.subscription_id = s.id
         WHERE ${conditions.join(' AND ')}`,
        params.slice(0, paramIndex - 1)
      );

      const total = parseInt(countResult.rows[0].total);

      // Get invoices with pagination
      const invoicesResult = await this.postgres.query(
        `SELECT 
          i.*,
          s.user_id,
          s.organization_id,
          bp.name as plan_name,
          bp.display_name as plan_display_name
         FROM invoices i
         JOIN subscriptions s ON i.subscription_id = s.id
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY i.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params.slice(0, paramIndex - 3), validatedQuery.limit, validatedQuery.offset]
      );

      return {
        invoices: invoicesResult.rows,
        total,
        hasMore: validatedQuery.offset + validatedQuery.limit < total,
      };
    } catch (error) {
      logger.error('Failed to list invoices:', error);
      throw error;
    }
  }

  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    try {
      const result = await this.postgres.query(
        'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at',
        [invoiceId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get invoice line items:', error);
      throw error;
    }
  }

  async markInvoiceAsPaid(invoiceId: string, paymentIntentId?: string): Promise<DatabaseInvoice> {
    try {
      await this.postgres.query(
        `UPDATE invoices SET
          status = 'paid',
          amount_paid = amount_due,
          amount_remaining = 0,
          paid_at = CURRENT_TIMESTAMP,
          stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [invoiceId, paymentIntentId || null]
      );

      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        throw new Error('Failed to retrieve updated invoice');
      }

      logger.info(`Marked invoice ${invoiceId} as paid`);
      return invoice;
    } catch (error) {
      logger.error('Failed to mark invoice as paid:', error);
      throw error;
    }
  }

  async markInvoiceAsFailed(invoiceId: string): Promise<DatabaseInvoice> {
    try {
      await this.postgres.query(
        `UPDATE invoices SET
          attempt_count = attempt_count + 1,
          next_payment_attempt = CURRENT_TIMESTAMP + INTERVAL '1 day',
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [invoiceId]
      );

      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        throw new Error('Failed to retrieve updated invoice');
      }

      logger.info(`Marked invoice ${invoiceId} as failed attempt`);
      return invoice;
    } catch (error) {
      logger.error('Failed to mark invoice as failed:', error);
      throw error;
    }
  }

  async voidInvoice(invoiceId: string): Promise<DatabaseInvoice> {
    try {
      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Void in Stripe if it exists
      if (invoice.stripe_invoice_id) {
        await this.stripe.getStripeClient().invoices.voidInvoice(invoice.stripe_invoice_id);
      }

      // Update database
      await this.postgres.query(
        `UPDATE invoices SET
          status = 'void',
          voided_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [invoiceId]
      );

      const updatedInvoice = await this.getInvoice(invoiceId);
      if (!updatedInvoice) {
        throw new Error('Failed to retrieve voided invoice');
      }

      logger.info(`Voided invoice ${invoiceId}`);
      return updatedInvoice;
    } catch (error) {
      logger.error('Failed to void invoice:', error);
      throw error;
    }
  }

  async generateInvoicePDF(invoiceId: string): Promise<string | null> {
    try {
      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.stripe_invoice_id) {
        const stripeInvoice = await this.stripe.getInvoice(invoice.stripe_invoice_id);
        if (stripeInvoice?.invoice_pdf) {
          return stripeInvoice.invoice_pdf;
        }
      }

      // Generate PDF URL (implementation would depend on your PDF generation service)
      // This is a placeholder - you'd implement actual PDF generation
      return `${process.env.API_BASE_URL}/billing/invoices/${invoiceId}/pdf`;
    } catch (error) {
      logger.error('Failed to generate invoice PDF:', error);
      throw error;
    }
  }

  async getOverdueInvoices(): Promise<DatabaseInvoice[]> {
    try {
      const result = await this.postgres.query(
        `SELECT 
          i.*,
          s.user_id,
          s.organization_id,
          bp.name as plan_name,
          bp.display_name as plan_display_name
         FROM invoices i
         JOIN subscriptions s ON i.subscription_id = s.id
         JOIN billing_plans bp ON s.plan_id = bp.id
         WHERE i.status = 'open'
         AND i.due_date < CURRENT_TIMESTAMP
         AND i.amount_remaining > 0
         ORDER BY i.due_date ASC`
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get overdue invoices:', error);
      throw error;
    }
  }

  async getInvoiceSummary(userId: string, organizationId?: string): Promise<{
    total_invoices: number;
    total_amount_due: number;
    total_amount_paid: number;
    overdue_count: number;
    overdue_amount: number;
    next_due_date: Date | null;
    currency: string;
  }> {
    try {
      const result = await this.postgres.query(
        `SELECT 
          COUNT(*) as total_invoices,
          SUM(amount_due) as total_amount_due,
          SUM(amount_paid) as total_amount_paid,
          SUM(CASE WHEN status = 'open' AND due_date < CURRENT_TIMESTAMP AND amount_remaining > 0 THEN 1 ELSE 0 END) as overdue_count,
          SUM(CASE WHEN status = 'open' AND due_date < CURRENT_TIMESTAMP THEN amount_remaining ELSE 0 END) as overdue_amount,
          MIN(CASE WHEN status = 'open' AND due_date > CURRENT_TIMESTAMP THEN due_date END) as next_due_date,
          COALESCE(MAX(currency), 'USD') as currency
         FROM invoices i
         JOIN subscriptions s ON i.subscription_id = s.id
         WHERE s.user_id = $1
         AND (s.organization_id = $2 OR (s.organization_id IS NULL AND $2 IS NULL))`,
        [userId, organizationId || null]
      );

      const summary = result.rows[0];
      
      return {
        total_invoices: parseInt(summary.total_invoices) || 0,
        total_amount_due: parseInt(summary.total_amount_due) || 0,
        total_amount_paid: parseInt(summary.total_amount_paid) || 0,
        overdue_count: parseInt(summary.overdue_count) || 0,
        overdue_amount: parseInt(summary.overdue_amount) || 0,
        next_due_date: summary.next_due_date,
        currency: summary.currency,
      };
    } catch (error) {
      logger.error('Failed to get invoice summary:', error);
      throw error;
    }
  }

  async recordPaymentAttempt(
    invoiceId: string,
    paymentIntentId: string,
    amount: number,
    status: string,
    failureCode?: string,
    failureMessage?: string
  ): Promise<void> {
    try {
      await this.postgres.query(
        `INSERT INTO payment_attempts (
          invoice_id, stripe_payment_intent_id, amount, status,
          failure_code, failure_message, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          invoiceId,
          paymentIntentId,
          amount,
          status,
          failureCode || null,
          failureMessage || null,
          JSON.stringify({ attempted_at: new Date().toISOString() }),
        ]
      );

      logger.info(`Recorded payment attempt for invoice ${invoiceId}: ${status}`);
    } catch (error) {
      logger.error('Failed to record payment attempt:', error);
      throw error;
    }
  }
}