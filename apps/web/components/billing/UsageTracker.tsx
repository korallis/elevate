'use client';

import React from 'react';
import { 
  BarChart3, 
  Database, 
  Users, 
  Zap, 
  Download, 
  AlertTriangle,
  TrendingUp,
  Activity
} from 'lucide-react';

export interface UsageSummary {
  metric: string;
  total_quantity: number;
  plan_limit: number | null;
  usage_percentage: number | null;
  is_over_limit: boolean;
}

export interface UsageAlert {
  metric: string;
  current_usage: number;
  limit: number;
  usage_percentage: number;
  alert_level: 'warning' | 'critical' | 'exceeded';
}

interface UsageTrackerProps {
  usage: UsageSummary[];
  alerts: UsageAlert[];
  className?: string;
}

const getMetricIcon = (metric: string) => {
  switch (metric) {
    case 'queries':
      return <Database className="w-5 h-5" />;
    case 'users':
      return <Users className="w-5 h-5" />;
    case 'dashboards':
      return <BarChart3 className="w-5 h-5" />;
    case 'api_calls':
      return <Zap className="w-5 h-5" />;
    case 'exports':
      return <Download className="w-5 h-5" />;
    default:
      return <Activity className="w-5 h-5" />;
  }
};

const getMetricLabel = (metric: string) => {
  switch (metric) {
    case 'queries':
      return 'Queries';
    case 'users':
      return 'Users';
    case 'dashboards':
      return 'Dashboards';
    case 'api_calls':
      return 'API Calls';
    case 'exports':
      return 'Exports';
    case 'data_sources':
      return 'Data Sources';
    default:
      return metric.charAt(0).toUpperCase() + metric.slice(1);
  }
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toString();
};

const getUsageColor = (percentage: number | null, isOverLimit: boolean) => {
  if (isOverLimit || (percentage && percentage >= 100)) {
    return 'bg-red-500';
  }
  if (percentage && percentage >= 90) {
    return 'bg-orange-500';
  }
  if (percentage && percentage >= 70) {
    return 'bg-yellow-500';
  }
  return 'bg-green-500';
};

const getAlertColor = (level: string) => {
  switch (level) {
    case 'exceeded':
      return 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800';
    case 'critical':
      return 'border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800';
    case 'warning':
      return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800';
    default:
      return 'border-gray-200 bg-gray-50 dark:bg-gray-900/20 dark:border-gray-800';
  }
};

const getAlertIcon = (level: string) => {
  switch (level) {
    case 'exceeded':
      return <AlertTriangle className="w-4 h-4 text-red-600" />;
    case 'critical':
      return <AlertTriangle className="w-4 h-4 text-orange-600" />;
    case 'warning':
      return <TrendingUp className="w-4 h-4 text-yellow-600" />;
    default:
      return <Activity className="w-4 h-4 text-gray-600" />;
  }
};

export function UsageTracker({ usage, alerts, className = '' }: UsageTrackerProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Usage Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Usage Alerts
          </h3>
          {alerts.map((alert) => (
            <div
              key={alert.metric}
              className={`border rounded-lg p-4 ${getAlertColor(alert.alert_level)}`}
            >
              <div className="flex items-center gap-3">
                {getAlertIcon(alert.alert_level)}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {getMetricLabel(alert.metric)} Usage Alert
                    </h4>
                    <span className="text-sm font-medium">
                      {alert.usage_percentage.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {alert.current_usage} of {alert.limit} used
                    {alert.alert_level === 'exceeded' && ' - Limit exceeded!'}
                    {alert.alert_level === 'critical' && ' - Approaching limit'}
                    {alert.alert_level === 'warning' && ' - High usage detected'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage Metrics */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Current Month Usage
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {usage.map((metric) => (
            <div
              key={metric.metric}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {getMetricIcon(metric.metric)}
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {getMetricLabel(metric.metric)}
                  </h4>
                </div>
                {metric.is_over_limit && (
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatNumber(metric.total_quantity)}
                  </span>
                  {metric.plan_limit !== null && metric.plan_limit > 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      of {formatNumber(metric.plan_limit)}
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                {metric.plan_limit !== null && metric.plan_limit > 0 && (
                  <div className="space-y-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getUsageColor(
                          metric.usage_percentage,
                          metric.is_over_limit
                        )}`}
                        style={{
                          width: `${Math.min(100, metric.usage_percentage || 0)}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{metric.usage_percentage?.toFixed(1)}% used</span>
                      {metric.plan_limit > 0 && (
                        <span>
                          {formatNumber(Math.max(0, metric.plan_limit - metric.total_quantity))} remaining
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Unlimited Plan */}
                {metric.plan_limit === -1 && (
                  <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                    Unlimited
                  </div>
                )}

                {/* Over Limit Warning */}
                {metric.is_over_limit && (
                  <div className="text-xs text-red-600 dark:text-red-400 font-medium">
                    Over limit by {formatNumber(metric.total_quantity - (metric.plan_limit || 0))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Usage Trends */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Usage Insights
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Highest Usage */}
          {usage.length > 0 && (
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 mb-1">
                {Math.max(...usage.map(u => u.usage_percentage || 0)).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Highest Usage
              </div>
            </div>
          )}

          {/* Total Resources Used */}
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 mb-1">
              {usage.reduce((sum, u) => sum + u.total_quantity, 0)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Total Resources Used
            </div>
          </div>

          {/* Metrics Tracked */}
          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-2xl font-bold text-purple-600 mb-1">
              {usage.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Metrics Tracked
            </div>
          </div>
        </div>

        {/* Usage Tips */}
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-white mb-2">
            💡 Usage Tips
          </h4>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>• Monitor your usage regularly to avoid hitting limits</li>
            <li>• Consider upgrading if you consistently use over 80% of your limits</li>
            <li>• Usage resets at the beginning of each billing cycle</li>
            <li>• Contact support if you need temporary limit increases</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default UsageTracker;