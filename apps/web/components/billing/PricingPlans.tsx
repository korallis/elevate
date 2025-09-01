'use client';

import React from 'react';
import { Check, X, Sparkles } from 'lucide-react';

export interface PricingPlan {
  name: string;
  display_name: string;
  price_cents: number;
  currency: string;
  billing_interval: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  popular?: boolean;
  recommended?: boolean;
}

interface PricingPlansProps {
  plans: PricingPlan[];
  currentPlan?: string;
  onSelectPlan: (planName: string) => void;
  loading?: boolean;
  className?: string;
}

const formatPrice = (priceCents: number, currency: string = 'USD'): string => {
  if (priceCents === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(priceCents / 100);
};

const formatLimit = (limit: number): string => {
  if (limit === -1) return 'Unlimited';
  if (limit >= 1000) return `${(limit / 1000).toFixed(0)}k`;
  return limit.toString();
};

const getFeatureIcon = (hasFeature: boolean) => {
  return hasFeature ? (
    <Check className="w-4 h-4 text-green-500" />
  ) : (
    <X className="w-4 h-4 text-gray-300" />
  );
};

export function PricingPlans({ 
  plans, 
  currentPlan, 
  onSelectPlan, 
  loading = false,
  className = '' 
}: PricingPlansProps) {
  const allFeatures = [
    { key: 'dashboard_creation', label: 'Dashboard Creation' },
    { key: 'basic_connectors', label: 'Basic Connectors' },
    { key: 'all_connectors', label: 'All Connectors' },
    { key: 'basic_analytics', label: 'Basic Analytics' },
    { key: 'advanced_analytics', label: 'Advanced Analytics' },
    { key: 'custom_branding', label: 'Custom Branding' },
    { key: 'api_access', label: 'API Access' },
    { key: 'sso', label: 'Single Sign-On' },
    { key: 'audit_logs', label: 'Audit Logs' },
    { key: 'email_support', label: 'Email Support' },
    { key: 'priority_support', label: 'Priority Support' },
    { key: 'premium_support', label: 'Premium Support' },
  ];

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ${className}`}>
      {plans.map((plan) => (
        <div
          key={plan.name}
          className={`relative rounded-2xl border p-6 transition-all hover:shadow-lg ${
            plan.popular 
              ? 'border-blue-500 shadow-blue-100 shadow-lg' 
              : 'border-gray-200 dark:border-gray-800'
          } ${
            currentPlan === plan.name 
              ? 'ring-2 ring-blue-500' 
              : ''
          }`}
        >
          {/* Popular Badge */}
          {plan.popular && (
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-500 text-white">
                <Sparkles className="w-3 h-3" />
                Most Popular
              </span>
            </div>
          )}

          {/* Recommended Badge */}
          {plan.recommended && !plan.popular && (
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500 text-white">
                Recommended
              </span>
            </div>
          )}

          <div className="space-y-4">
            {/* Plan Name */}
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                {plan.display_name}
              </h3>
            </div>

            {/* Price */}
            <div className="space-y-1">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(plan.price_cents, plan.currency)}
                </span>
                {plan.price_cents > 0 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    /{plan.billing_interval}
                  </span>
                )}
              </div>
            </div>

            {/* Key Limits */}
            <div className="space-y-2">
              {plan.limits.users && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Users</span>
                  <span className="font-medium">{formatLimit(plan.limits.users)}</span>
                </div>
              )}
              {plan.limits.queries_per_month && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Queries/month</span>
                  <span className="font-medium">{formatLimit(plan.limits.queries_per_month)}</span>
                </div>
              )}
              {plan.limits.dashboards && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Dashboards</span>
                  <span className="font-medium">{formatLimit(plan.limits.dashboards)}</span>
                </div>
              )}
              {plan.limits.data_sources && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Data Sources</span>
                  <span className="font-medium">{formatLimit(plan.limits.data_sources)}</span>
                </div>
              )}
            </div>

            {/* Features List */}
            <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
              {allFeatures.map((feature) => (
                <div key={feature.key} className="flex items-center gap-2 text-sm">
                  {getFeatureIcon(plan.features[feature.key] === true)}
                  <span className={
                    plan.features[feature.key] === true 
                      ? 'text-gray-900 dark:text-white' 
                      : 'text-gray-400'
                  }>
                    {feature.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Action Button */}
            <div className="pt-4">
              <button
                onClick={() => onSelectPlan(plan.name)}
                disabled={loading || currentPlan === plan.name}
                className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPlan === plan.name
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    : plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </div>
                ) : currentPlan === plan.name ? (
                  'Current Plan'
                ) : plan.price_cents === 0 ? (
                  'Get Started'
                ) : (
                  'Upgrade'
                )}
              </button>
            </div>

            {/* Trial Info */}
            {plan.price_cents > 0 && plan.name !== 'enterprise' && (
              <div className="text-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  14-day free trial included
                </span>
              </div>
            )}

            {/* Custom Pricing */}
            {plan.name === 'enterprise' && (
              <div className="text-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Custom pricing available
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PricingPlans;