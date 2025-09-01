import type { DashboardTemplate } from '../dashboard-generator.js';
import type { DashboardWidget } from '../../routes/dashboards.js';

export class EcommerceTemplate {
  getTemplate(): DashboardTemplate {
    const widgets: DashboardWidget[] = [
      {
        id: 'ecom-revenue',
        type: 'metric',
        config: {
          id: 'ecom-revenue',
          title: 'Total Revenue',
          description: 'Total sales revenue for the current period',
          dataSource: {
            type: 'table',
            source: 'orders',
            fields: ['order_total', 'order_status', 'created_at']
          },
          visualization: {
            type: 'metric',
            format: 'currency',
            trend: true,
            comparison: 'previous_period'
          }
        },
        position: { x: 0, y: 0, w: 3, h: 2 }
      },
      {
        id: 'ecom-orders',
        type: 'metric',
        config: {
          id: 'ecom-orders',
          title: 'Total Orders',
          description: 'Number of completed orders',
          dataSource: {
            type: 'table',
            source: 'orders',
            fields: ['order_id', 'order_status']
          },
          visualization: {
            type: 'metric',
            format: 'number',
            trend: true,
            comparison: 'previous_period'
          }
        },
        position: { x: 3, y: 0, w: 3, h: 2 }
      },
      {
        id: 'ecom-aov',
        type: 'metric',
        config: {
          id: 'ecom-aov',
          title: 'Average Order Value',
          description: 'Average value per order',
          dataSource: {
            type: 'calculation',
            source: 'orders',
            fields: ['order_total', 'order_count']
          },
          visualization: {
            type: 'metric',
            format: 'currency',
            trend: true,
            comparison: 'previous_period'
          }
        },
        position: { x: 6, y: 0, w: 3, h: 2 }
      },
      {
        id: 'ecom-conversion',
        type: 'metric',
        config: {
          id: 'ecom-conversion',
          title: 'Conversion Rate',
          description: 'Percentage of sessions that result in purchases',
          dataSource: {
            type: 'table',
            source: 'analytics',
            fields: ['sessions', 'transactions']
          },
          visualization: {
            type: 'metric',
            format: 'percentage',
            trend: true,
            comparison: 'previous_period',
            threshold: { target: 3.5, warning: 2.0 }
          }
        },
        position: { x: 9, y: 0, w: 3, h: 2 }
      },
      {
        id: 'ecom-sales-trend',
        type: 'line-chart',
        config: {
          id: 'ecom-sales-trend',
          title: 'Sales Performance Over Time',
          description: 'Daily revenue and order trends',
          dataSource: {
            type: 'table',
            source: 'daily_sales',
            fields: ['date', 'revenue', 'orders', 'sessions']
          },
          visualization: {
            type: 'line',
            x_axis: 'date',
            y_axes: ['revenue', 'orders'],
            colors: ['#10B981', '#06B6D4'],
            smooth: true,
            dual_axis: true
          }
        },
        position: { x: 0, y: 2, w: 8, h: 4 }
      },
      {
        id: 'ecom-traffic-sources',
        type: 'pie-chart',
        config: {
          id: 'ecom-traffic-sources',
          title: 'Traffic Sources',
          description: 'Distribution of website traffic by source',
          dataSource: {
            type: 'table',
            source: 'traffic_sources',
            fields: ['source', 'sessions', 'revenue']
          },
          visualization: {
            type: 'pie',
            value_field: 'sessions',
            label_field: 'source',
            colors: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444']
          }
        },
        position: { x: 8, y: 2, w: 4, h: 4 }
      },
      {
        id: 'ecom-top-products',
        type: 'table',
        config: {
          id: 'ecom-top-products',
          title: 'Top Selling Products',
          description: 'Best performing products by revenue and quantity',
          dataSource: {
            type: 'table',
            source: 'product_performance',
            fields: ['product_name', 'quantity_sold', 'revenue', 'profit_margin']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'product_name', title: 'Product', format: 'text' },
              { key: 'quantity_sold', title: 'Qty Sold', format: 'number' },
              { key: 'revenue', title: 'Revenue', format: 'currency' },
              { key: 'profit_margin', title: 'Margin %', format: 'percentage' }
            ],
            sorting: true,
            pagination: true,
            limit: 10
          }
        },
        position: { x: 0, y: 6, w: 6, h: 4 }
      },
      {
        id: 'ecom-customer-segments',
        type: 'bar-chart',
        config: {
          id: 'ecom-customer-segments',
          title: 'Customer Segments by Value',
          description: 'Revenue contribution by customer segments',
          dataSource: {
            type: 'table',
            source: 'customer_segments',
            fields: ['segment', 'customer_count', 'revenue', 'avg_order_value']
          },
          visualization: {
            type: 'bar',
            x_axis: 'segment',
            y_axis: 'revenue',
            format: 'currency',
            colors: ['#8B5CF6']
          }
        },
        position: { x: 6, y: 6, w: 6, h: 4 }
      },
      {
        id: 'ecom-inventory-status',
        type: 'table',
        config: {
          id: 'ecom-inventory-status',
          title: 'Inventory Status',
          description: 'Current stock levels and alerts',
          dataSource: {
            type: 'table',
            source: 'inventory',
            fields: ['product_name', 'current_stock', 'reorder_point', 'status']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'product_name', title: 'Product', format: 'text' },
              { key: 'current_stock', title: 'Stock', format: 'number' },
              { key: 'reorder_point', title: 'Reorder Point', format: 'number' },
              { key: 'status', title: 'Status', format: 'badge' }
            ],
            sorting: true,
            filtering: true,
            alerts: {
              column: 'status',
              conditions: {
                'Low Stock': 'warning',
                'Out of Stock': 'critical'
              }
            }
          }
        },
        position: { x: 0, y: 10, w: 8, h: 4 }
      },
      {
        id: 'ecom-monthly-growth',
        type: 'bar-chart',
        config: {
          id: 'ecom-monthly-growth',
          title: 'Month-over-Month Growth',
          description: 'Revenue growth compared to previous months',
          dataSource: {
            type: 'table',
            source: 'monthly_growth',
            fields: ['month', 'revenue', 'growth_rate']
          },
          visualization: {
            type: 'bar',
            x_axis: 'month',
            y_axis: 'growth_rate',
            format: 'percentage',
            colors: ['#10B981'],
            zero_line: true
          }
        },
        position: { x: 8, y: 10, w: 4, h: 4 }
      }
    ];

    return {
      id: 'ecommerce-analytics',
      name: 'E-commerce Analytics',
      description: 'Complete e-commerce performance dashboard with sales, traffic, and inventory insights',
      domain: 'ecommerce',
      widgets,
      theme: {
        mode: 'dark',
        primary: 'hsl(217, 91%, 60%)', // Blue for trust/commerce
        accent: 'hsl(152, 69%, 31%)',
        background: 'hsl(240, 10%, 3.9%)',
        surface: 'hsl(240, 10%, 12%)',
        text: 'hsl(0, 0%, 95%)',
        border: 'hsl(240, 10%, 20%)',
        preset: 'ecommerce'
      },
      layout: {
        style: 'grid',
        gridWidth: 12,
        rowHeight: 100
      }
    };
  }
}