'use client';

import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  ExternalLink,
  Shield
} from 'lucide-react';

export interface Subscription {
  id: string;
  user_id: string;
  organization_id: string | null;
  plan_name: string;
  plan_display_name: string;
  plan_price_cents: number;
  status: string;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionManagerProps {
  subscription: Subscription | null;
  onUpdateSubscription: (updates: { planName?: string; cancelAtPeriodEnd?: boolean }) => Promise<void>;
  onCancelSubscription: (immediately: boolean) => Promise<void>;
  onManageBilling: () => Promise<void>;
  loading?: boolean;
  className?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    case 'trialing':
      return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
    case 'past_due':
      return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
    case 'canceled':
      return 'text-red-600 bg-red-50 dark:bg-red-900/20';
    case 'incomplete':
      return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
    default:
      return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active':
      return <CheckCircle className="w-4 h-4" />;
    case 'trialing':
      return <Clock className="w-4 h-4" />;
    case 'past_due':
      return <AlertTriangle className="w-4 h-4" />;
    case 'canceled':
      return <XCircle className="w-4 h-4" />;
    case 'incomplete':
      return <AlertTriangle className="w-4 h-4" />;
    default:
      return <Shield className="w-4 h-4" />;
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatPrice = (priceCents: number): string => {
  if (priceCents === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(priceCents / 100);
};

export function SubscriptionManager({
  subscription,
  onUpdateSubscription,
  onCancelSubscription,
  onManageBilling,
  loading = false,
  className = ''
}: SubscriptionManagerProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelImmediate, setCancelImmediate] = useState(false);

  if (!subscription) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
        <div className="text-center py-8">
          <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Active Subscription
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            You're currently on the free plan. Upgrade to unlock premium features.
          </p>
        </div>
      </div>
    );
  }

  const isTrialing = subscription.status === 'trialing';
  const trialDaysLeft = subscription.trial_end 
    ? Math.max(0, Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const handleCancelSubscription = async () => {
    try {
      await onCancelSubscription(cancelImmediate);
      setShowCancelDialog(false);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Subscription Details
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage your billing and subscription settings
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription.status)}`}>
            {getStatusIcon(subscription.status)}
            {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Plan Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              Current Plan
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Plan</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {subscription.plan_display_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Price</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatPrice(subscription.plan_price_cents)}/month
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              Billing Cycle
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Current Period</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                </span>
              </div>
              {isTrialing && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Trial Ends</span>
                  <span className="text-sm font-medium text-blue-600">
                    {formatDate(subscription.trial_end)} ({trialDaysLeft} days left)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trial Alert */}
        {isTrialing && trialDaysLeft <= 7 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Trial Ending Soon
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-200 mt-1">
                  Your trial ends in {trialDaysLeft} days. Add a payment method to continue using premium features.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Notice */}
        {subscription.cancel_at_period_end && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Subscription Scheduled for Cancellation
                </h4>
                <p className="text-sm text-orange-700 dark:text-orange-200 mt-1">
                  Your subscription will end on {formatDate(subscription.current_period_end)}. 
                  You'll continue to have access until then.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onManageBilling}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-4 h-4" />
            Manage Billing
            <ExternalLink className="w-3 h-3" />
          </button>

          {!subscription.cancel_at_period_end && subscription.status === 'active' && (
            <button
              onClick={() => setShowCancelDialog(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel Subscription
            </button>
          )}

          {subscription.cancel_at_period_end && (
            <button
              onClick={() => onUpdateSubscription({ cancelAtPeriodEnd: false })}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reactivate Subscription
            </button>
          )}
        </div>

        {/* Subscription History */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Subscription History
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Created</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatDate(subscription.created_at)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Last Updated</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatDate(subscription.updated_at)}
              </span>
            </div>
            {subscription.canceled_at && (
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Canceled</span>
                <span className="font-medium text-red-600">
                  {formatDate(subscription.canceled_at)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Cancel Subscription
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to cancel your subscription? You can choose to cancel immediately 
              or at the end of your current billing period.
            </p>

            <div className="space-y-4 mb-6">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="cancelType"
                  checked={!cancelImmediate}
                  onChange={() => setCancelImmediate(false)}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    Cancel at period end
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Keep access until {formatDate(subscription.current_period_end)}
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="cancelType"
                  checked={cancelImmediate}
                  onChange={() => setCancelImmediate(true)}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    Cancel immediately
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Lose access immediately (no refund)
                  </div>
                </div>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Canceling...' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubscriptionManager;