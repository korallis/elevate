'use client';

import React, { useState } from 'react';
import { 
  Download, 
  Eye, 
  Calendar, 
  DollarSign, 
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  ExternalLink
} from 'lucide-react';

export interface Invoice {
  id: string;
  subscription_id: string;
  stripe_invoice_id: string | null;
  invoice_number: string | null;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  status: string;
  invoice_pdf_url: string | null;
  hosted_invoice_url: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  plan_name: string;
  plan_display_name: string;
}

export interface BillingHistoryProps {
  invoices: Invoice[];
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onDownloadInvoice: (invoiceId: string) => void;
  loading?: boolean;
  className?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'paid':
      return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    case 'open':
      return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
    case 'draft':
      return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
    case 'void':
      return 'text-red-600 bg-red-50 dark:bg-red-900/20';
    case 'uncollectible':
      return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
    default:
      return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'paid':
      return <CheckCircle className="w-4 h-4" />;
    case 'open':
      return <Clock className="w-4 h-4" />;
    case 'draft':
      return <FileText className="w-4 h-4" />;
    case 'void':
      return <AlertCircle className="w-4 h-4" />;
    case 'uncollectible':
      return <AlertCircle className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatAmount = (amountCents: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
};

export function BillingHistory({
  invoices,
  total,
  hasMore,
  onLoadMore,
  onViewInvoice,
  onDownloadInvoice,
  loading = false,
  className = ''
}: BillingHistoryProps) {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    onViewInvoice(invoice);
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      await onDownloadInvoice(invoiceId);
    } catch (error) {
      console.error('Failed to download invoice:', error);
    }
  };

  if (invoices.length === 0 && !loading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center ${className}`}>
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Billing History
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Your invoices and billing history will appear here once you have a subscription.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Billing History
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {total} invoice{total !== 1 ? 's' : ''} total
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <DollarSign className="w-4 h-4" />
            <span>All amounts in USD</span>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                    {getStatusIcon(invoice.status)}
                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </div>
                  
                  {invoice.invoice_number && (
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                      #{invoice.invoice_number}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(invoice.created_at)}</span>
                  </div>
                  
                  {invoice.period_start && invoice.period_end && (
                    <div className="hidden sm:flex items-center gap-1">
                      <span>
                        {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1">
                    <span>{invoice.plan_display_name}</span>
                  </div>
                </div>

                {invoice.due_date && invoice.status === 'open' && (
                  <div className="text-sm text-orange-600 dark:text-orange-400">
                    Due: {formatDate(invoice.due_date)}
                  </div>
                )}

                {invoice.paid_at && (
                  <div className="text-sm text-green-600 dark:text-green-400">
                    Paid: {formatDate(invoice.paid_at)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 ml-4">
                <div className="text-right">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatAmount(invoice.amount_due, invoice.currency)}
                  </div>
                  {invoice.amount_remaining > 0 && invoice.status !== 'paid' && (
                    <div className="text-sm text-orange-600">
                      {formatAmount(invoice.amount_remaining, invoice.currency)} due
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewInvoice(invoice)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    title="View Invoice"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {(invoice.invoice_pdf_url || invoice.stripe_invoice_id) && (
                    <button
                      onClick={() => handleDownloadInvoice(invoice.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}

                  {invoice.hosted_invoice_url && (
                    <a
                      href={invoice.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      title="View in Stripe"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 text-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                Loading...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Load More Invoices
              </>
            )}
          </button>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Invoice Details
              </h3>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Invoice Header */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedInvoice.invoice_number || 'Draft Invoice'}
                    </span>
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedInvoice.status)}`}>
                      {getStatusIcon(selectedInvoice.status)}
                      {selectedInvoice.status.charAt(0).toUpperCase() + selectedInvoice.status.slice(1)}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Created {formatDate(selectedInvoice.created_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatAmount(selectedInvoice.amount_due, selectedInvoice.currency)}
                  </div>
                  {selectedInvoice.amount_remaining > 0 && (
                    <div className="text-sm text-orange-600">
                      {formatAmount(selectedInvoice.amount_remaining, selectedInvoice.currency)} remaining
                    </div>
                  )}
                </div>
              </div>

              {/* Invoice Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    Billing Period
                  </h4>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedInvoice.period_start && selectedInvoice.period_end
                      ? `${formatDate(selectedInvoice.period_start)} - ${formatDate(selectedInvoice.period_end)}`
                      : 'One-time charge'
                    }
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    Plan
                  </h4>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedInvoice.plan_display_name}
                  </div>
                </div>

                {selectedInvoice.due_date && (
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      Due Date
                    </h4>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(selectedInvoice.due_date)}
                    </div>
                  </div>
                )}

                {selectedInvoice.paid_at && (
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      Paid Date
                    </h4>
                    <div className="text-sm text-green-600">
                      {formatDate(selectedInvoice.paid_at)}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Summary */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Payment Summary
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                    <span className="text-gray-900 dark:text-white">
                      {formatAmount(selectedInvoice.amount_due, selectedInvoice.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Amount Paid</span>
                    <span className="text-green-600">
                      -{formatAmount(selectedInvoice.amount_paid, selectedInvoice.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-medium border-t border-gray-200 dark:border-gray-700 pt-2">
                    <span className="text-gray-900 dark:text-white">Amount Due</span>
                    <span className="text-gray-900 dark:text-white">
                      {formatAmount(selectedInvoice.amount_remaining, selectedInvoice.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {selectedInvoice.hosted_invoice_url && (
                  <a
                    href={selectedInvoice.hosted_invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View in Stripe
                  </a>
                )}

                <button
                  onClick={() => handleDownloadInvoice(selectedInvoice.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BillingHistory;