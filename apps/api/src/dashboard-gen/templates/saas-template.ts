import type { DashboardTemplate, GeneratedDashboardWidget } from '../dashboard-generator.js';

export class SaasTemplate {
  getTemplate(): DashboardTemplate {
    const widgets: GeneratedDashboardWidget[] = [
      {
        id: 'saas-mrr',
        type: 'metric',
        config: {
          id: 'saas-mrr',
          title: 'Monthly Recurring Revenue',
          description: 'Total MRR from active subscriptions',
          dataSource: {
            type: 'table',
            source: 'subscriptions',
            fields: ['amount', 'status', 'billing_cycle']
          },
          visualization: {
            type: 'metric',
            format: 'currency',
            trend: true,
            comparison: 'previous_month'
          }
        },
        position: { x: 0, y: 0, w: 3, h: 2 }
      },
      {
        id: 'saas-arr',
        type: 'metric',
        config: {
          id: 'saas-arr',
          title: 'Annual Recurring Revenue',
          description: 'Projected ARR based on current MRR',
          dataSource: {
            type: 'calculation',
            source: 'subscriptions',
            fields: ['mrr']
          },
          visualization: {
            type: 'metric',
            format: 'currency',
            trend: true,
            comparison: 'previous_year'
          }
        },
        position: { x: 3, y: 0, w: 3, h: 2 }
      },
      {
        id: 'saas-churn-rate',
        type: 'metric',
        config: {
          id: 'saas-churn-rate',
          title: 'Monthly Churn Rate',
          description: 'Percentage of customers who cancelled this month',
          dataSource: {
            type: 'table',
            source: 'subscription_events',
            fields: ['event_type', 'event_date', 'customer_id']
          },
          visualization: {
            type: 'metric',
            format: 'percentage',
            trend: true,
            comparison: 'previous_month',
            threshold: { warning: 5, critical: 10 }
          }
        },
        position: { x: 6, y: 0, w: 3, h: 2 }
      },
      {
        id: 'saas-active-users',
        type: 'metric',
        config: {
          id: 'saas-active-users',
          title: 'Monthly Active Users',
          description: 'Users who logged in this month',
          dataSource: {
            type: 'table',
            source: 'user_activity',
            fields: ['user_id', 'last_login_date']
          },
          visualization: {
            type: 'metric',
            format: 'number',
            trend: true,
            comparison: 'previous_month'
          }
        },
        position: { x: 9, y: 0, w: 3, h: 2 }
      },
      {
        id: 'saas-revenue-trend',
        type: 'line-chart',
        config: {
          id: 'saas-revenue-trend',
          title: 'Revenue Growth Trend',
          description: 'MRR and ARR growth over time',
          dataSource: {
            type: 'table',
            source: 'revenue_monthly',
            fields: ['month', 'mrr', 'arr', 'new_mrr', 'expansion_mrr', 'churn_mrr']
          },
          visualization: {
            type: 'line',
            x_axis: 'month',
            y_axes: ['mrr', 'arr'],
            colors: ['#8B5CF6', '#10B981'],
            smooth: true
          }
        },
        position: { x: 0, y: 2, w: 8, h: 4 }
      },
      {
        id: 'saas-customer-breakdown',
        type: 'pie-chart',
        config: {
          id: 'saas-customer-breakdown',
          title: 'Customers by Plan',
          description: 'Distribution of customers across pricing tiers',
          dataSource: {
            type: 'table',
            source: 'subscriptions',
            fields: ['plan_name', 'customer_count']
          },
          visualization: {
            type: 'pie',
            value_field: 'customer_count',
            label_field: 'plan_name',
            colors: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B']
          }
        },
        position: { x: 8, y: 2, w: 4, h: 4 }
      },
      {
        id: 'saas-cohort-retention',
        type: 'table',
        config: {
          id: 'saas-cohort-retention',
          title: 'Cohort Retention Analysis',
          description: 'Customer retention by signup month',
          dataSource: {
            type: 'table',
            source: 'cohort_analysis',
            fields: ['cohort_month', 'month_0', 'month_1', 'month_3', 'month_6', 'month_12']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'cohort_month', title: 'Cohort', format: 'date' },
              { key: 'month_0', title: 'Month 0', format: 'percentage' },
              { key: 'month_1', title: 'Month 1', format: 'percentage' },
              { key: 'month_3', title: 'Month 3', format: 'percentage' },
              { key: 'month_6', title: 'Month 6', format: 'percentage' },
              { key: 'month_12', title: 'Month 12', format: 'percentage' }
            ],
            sorting: true,
            pagination: true
          }
        },
        position: { x: 0, y: 6, w: 12, h: 4 }
      },
      {
        id: 'saas-ltv-cac',
        type: 'bar-chart',
        config: {
          id: 'saas-ltv-cac',
          title: 'LTV:CAC Ratio by Channel',
          description: 'Lifetime Value to Customer Acquisition Cost ratio',
          dataSource: {
            type: 'table',
            source: 'channel_metrics',
            fields: ['channel', 'ltv', 'cac', 'ltv_cac_ratio']
          },
          visualization: {
            type: 'bar',
            x_axis: 'channel',
            y_axis: 'ltv_cac_ratio',
            target_line: 3, // Good LTV:CAC ratio is 3:1
            colors: ['#8B5CF6']
          }
        },
        position: { x: 0, y: 10, w: 6, h: 4 }
      },
      {
        id: 'saas-feature-adoption',
        type: 'bar-chart',
        config: {
          id: 'saas-feature-adoption',
          title: 'Feature Adoption Rates',
          description: 'Percentage of users who have used each feature',
          dataSource: {
            type: 'table',
            source: 'feature_usage',
            fields: ['feature_name', 'adoption_rate', 'user_count']
          },
          visualization: {
            type: 'bar',
            x_axis: 'feature_name',
            y_axis: 'adoption_rate',
            format: 'percentage',
            horizontal: true,
            colors: ['#10B981']
          }
        },
        position: { x: 6, y: 10, w: 6, h: 4 }
      }
    ];

    return {
      id: 'saas-metrics',
      name: 'SaaS Metrics Dashboard',
      description: 'Comprehensive SaaS business metrics including MRR, churn, retention, and growth',
      domain: 'saas',
      widgets,
      theme: {
        mode: 'dark',
        primary: 'hsl(252, 60%, 65%)', // Purple for SaaS
        accent: 'hsl(163, 50%, 45%)',
        background: 'hsl(240, 10%, 3.9%)',
        surface: 'hsl(240, 10%, 12%)',
        text: 'hsl(0, 0%, 95%)',
        border: 'hsl(240, 10%, 20%)',
        preset: 'saas'
      },
      layout: {
        style: 'grid',
        gridWidth: 12,
        rowHeight: 100
      }
    };
  }
}