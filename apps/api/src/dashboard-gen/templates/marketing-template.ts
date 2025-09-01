import type { DashboardTemplate } from '../dashboard-generator.js';
import type { DashboardWidget } from '../../routes/dashboards.js';

export class MarketingTemplate {
  getTemplate(): DashboardTemplate {
    const widgets: DashboardWidget[] = [
      {
        id: 'marketing-leads',
        type: 'metric',
        config: {
          id: 'marketing-leads',
          title: 'Total Leads',
          description: 'Number of qualified leads generated',
          dataSource: {
            type: 'table',
            source: 'leads',
            fields: ['lead_id', 'lead_status', 'created_at']
          },
          visualization: {
            type: 'metric',
            format: 'number',
            trend: true,
            comparison: 'previous_month'
          }
        },
        position: { x: 0, y: 0, w: 3, h: 2 }
      },
      {
        id: 'marketing-cpl',
        type: 'metric',
        config: {
          id: 'marketing-cpl',
          title: 'Cost Per Lead',
          description: 'Average cost to acquire a qualified lead',
          dataSource: {
            type: 'calculation',
            source: 'campaign_spend',
            fields: ['total_spend', 'leads_generated']
          },
          visualization: {
            type: 'metric',
            format: 'currency',
            trend: true,
            comparison: 'previous_month',
            threshold: { target: 50, warning: 100 }
          }
        },
        position: { x: 3, y: 0, w: 3, h: 2 }
      },
      {
        id: 'marketing-conversion',
        type: 'metric',
        config: {
          id: 'marketing-conversion',
          title: 'Lead Conversion Rate',
          description: 'Percentage of leads that become customers',
          dataSource: {
            type: 'table',
            source: 'lead_conversion',
            fields: ['leads', 'customers']
          },
          visualization: {
            type: 'metric',
            format: 'percentage',
            trend: true,
            comparison: 'previous_month'
          }
        },
        position: { x: 6, y: 0, w: 3, h: 2 }
      },
      {
        id: 'marketing-roas',
        type: 'metric',
        config: {
          id: 'marketing-roas',
          title: 'Return on Ad Spend',
          description: 'Revenue generated per dollar of ad spend',
          dataSource: {
            type: 'calculation',
            source: 'campaign_performance',
            fields: ['revenue', 'ad_spend']
          },
          visualization: {
            type: 'metric',
            format: 'currency',
            prefix: '$',
            suffix: ':$1',
            trend: true,
            comparison: 'previous_month'
          }
        },
        position: { x: 9, y: 0, w: 3, h: 2 }
      },
      {
        id: 'marketing-funnel',
        type: 'bar-chart',
        config: {
          id: 'marketing-funnel',
          title: 'Marketing Funnel Performance',
          description: 'Conversion rates through each funnel stage',
          dataSource: {
            type: 'table',
            source: 'funnel_metrics',
            fields: ['stage', 'visitors', 'conversion_rate']
          },
          visualization: {
            type: 'bar',
            x_axis: 'stage',
            y_axis: 'conversion_rate',
            format: 'percentage',
            colors: ['#8B5CF6'],
            horizontal: false
          }
        },
        position: { x: 0, y: 2, w: 6, h: 4 }
      },
      {
        id: 'marketing-channel-performance',
        type: 'pie-chart',
        config: {
          id: 'marketing-channel-performance',
          title: 'Lead Sources',
          description: 'Lead generation by marketing channel',
          dataSource: {
            type: 'table',
            source: 'lead_sources',
            fields: ['channel', 'leads', 'cost', 'quality_score']
          },
          visualization: {
            type: 'pie',
            value_field: 'leads',
            label_field: 'channel',
            colors: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444']
          }
        },
        position: { x: 6, y: 2, w: 6, h: 4 }
      },
      {
        id: 'marketing-campaign-performance',
        type: 'table',
        config: {
          id: 'marketing-campaign-performance',
          title: 'Campaign Performance',
          description: 'Detailed performance metrics by campaign',
          dataSource: {
            type: 'table',
            source: 'campaigns',
            fields: ['campaign_name', 'impressions', 'clicks', 'ctr', 'conversions', 'cost', 'roas']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'campaign_name', title: 'Campaign', format: 'text' },
              { key: 'impressions', title: 'Impressions', format: 'number' },
              { key: 'clicks', title: 'Clicks', format: 'number' },
              { key: 'ctr', title: 'CTR', format: 'percentage' },
              { key: 'conversions', title: 'Conversions', format: 'number' },
              { key: 'cost', title: 'Cost', format: 'currency' },
              { key: 'roas', title: 'ROAS', format: 'number' }
            ],
            sorting: true,
            pagination: true
          }
        },
        position: { x: 0, y: 6, w: 12, h: 4 }
      },
      {
        id: 'marketing-monthly-trends',
        type: 'line-chart',
        config: {
          id: 'marketing-monthly-trends',
          title: 'Monthly Marketing Trends',
          description: 'Leads, conversions, and spend over time',
          dataSource: {
            type: 'table',
            source: 'monthly_marketing',
            fields: ['month', 'leads', 'conversions', 'spend', 'revenue']
          },
          visualization: {
            type: 'line',
            x_axis: 'month',
            y_axes: ['leads', 'conversions'],
            colors: ['#8B5CF6', '#10B981'],
            smooth: true
          }
        },
        position: { x: 0, y: 10, w: 8, h: 4 }
      },
      {
        id: 'marketing-lead-quality',
        type: 'bar-chart',
        config: {
          id: 'marketing-lead-quality',
          title: 'Lead Quality by Source',
          description: 'Lead-to-customer conversion rate by channel',
          dataSource: {
            type: 'table',
            source: 'lead_quality',
            fields: ['source', 'leads', 'customers', 'quality_score']
          },
          visualization: {
            type: 'bar',
            x_axis: 'source',
            y_axis: 'quality_score',
            format: 'percentage',
            colors: ['#10B981'],
            horizontal: true
          }
        },
        position: { x: 8, y: 10, w: 4, h: 4 }
      },
      {
        id: 'marketing-attribution',
        type: 'table',
        config: {
          id: 'marketing-attribution',
          title: 'Multi-Touch Attribution',
          description: 'Revenue attribution across touchpoints',
          dataSource: {
            type: 'table',
            source: 'attribution_model',
            fields: ['touchpoint', 'first_touch_revenue', 'last_touch_revenue', 'linear_attribution']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'touchpoint', title: 'Touchpoint', format: 'text' },
              { key: 'first_touch_revenue', title: 'First Touch', format: 'currency' },
              { key: 'last_touch_revenue', title: 'Last Touch', format: 'currency' },
              { key: 'linear_attribution', title: 'Linear Model', format: 'currency' }
            ],
            sorting: true,
            totals: true
          }
        },
        position: { x: 0, y: 14, w: 12, h: 4 }
      }
    ];

    return {
      id: 'marketing-performance',
      name: 'Marketing Performance',
      description: 'Comprehensive marketing analytics including campaigns, attribution, and ROI',
      domain: 'marketing',
      widgets,
      theme: {
        mode: 'dark',
        primary: 'hsl(271, 81%, 56%)', // Purple for creativity
        accent: 'hsl(347, 77%, 50%)',
        background: 'hsl(240, 10%, 3.9%)',
        surface: 'hsl(240, 10%, 12%)',
        text: 'hsl(0, 0%, 95%)',
        border: 'hsl(240, 10%, 20%)',
        preset: 'marketing'
      },
      layout: {
        style: 'priority-based',
        gridWidth: 12,
        rowHeight: 100
      }
    };
  }
}