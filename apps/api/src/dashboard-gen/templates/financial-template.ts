import type { DashboardTemplate } from '../dashboard-generator.js';
import type { DashboardWidget } from '../../routes/dashboards.js';

export class FinancialTemplate {
  getTemplate(): DashboardTemplate {
    const widgets: DashboardWidget[] = [
      {
        id: 'finance-revenue',
        type: 'metric',
        config: {
          id: 'finance-revenue',
          title: 'Total Revenue',
          description: 'Current period total revenue',
          dataSource: {
            type: 'table',
            source: 'revenue',
            fields: ['amount', 'period', 'category']
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
        id: 'finance-expenses',
        type: 'metric',
        config: {
          id: 'finance-expenses',
          title: 'Total Expenses',
          description: 'Current period total expenses',
          dataSource: {
            type: 'table',
            source: 'expenses',
            fields: ['amount', 'period', 'category']
          },
          visualization: {
            type: 'metric',
            format: 'currency',
            trend: true,
            comparison: 'previous_period'
          }
        },
        position: { x: 3, y: 0, w: 3, h: 2 }
      },
      {
        id: 'finance-profit',
        type: 'metric',
        config: {
          id: 'finance-profit',
          title: 'Net Profit',
          description: 'Revenue minus expenses',
          dataSource: {
            type: 'calculation',
            source: 'financials',
            fields: ['revenue', 'expenses']
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
        id: 'finance-margin',
        type: 'metric',
        config: {
          id: 'finance-margin',
          title: 'Profit Margin',
          description: 'Net profit as percentage of revenue',
          dataSource: {
            type: 'calculation',
            source: 'financials',
            fields: ['net_profit', 'total_revenue']
          },
          visualization: {
            type: 'metric',
            format: 'percentage',
            trend: true,
            comparison: 'previous_period',
            threshold: { target: 20, warning: 10 }
          }
        },
        position: { x: 9, y: 0, w: 3, h: 2 }
      },
      {
        id: 'finance-pnl-trend',
        type: 'line-chart',
        config: {
          id: 'finance-pnl-trend',
          title: 'Profit & Loss Trend',
          description: 'Monthly revenue, expenses, and profit trends',
          dataSource: {
            type: 'table',
            source: 'monthly_pnl',
            fields: ['month', 'revenue', 'expenses', 'gross_profit', 'net_profit']
          },
          visualization: {
            type: 'line',
            x_axis: 'month',
            y_axes: ['revenue', 'expenses', 'net_profit'],
            colors: ['#10B981', '#EF4444', '#8B5CF6'],
            smooth: true
          }
        },
        position: { x: 0, y: 2, w: 8, h: 4 }
      },
      {
        id: 'finance-expense-breakdown',
        type: 'pie-chart',
        config: {
          id: 'finance-expense-breakdown',
          title: 'Expense Categories',
          description: 'Breakdown of expenses by category',
          dataSource: {
            type: 'table',
            source: 'expense_categories',
            fields: ['category', 'amount', 'percentage']
          },
          visualization: {
            type: 'pie',
            value_field: 'amount',
            label_field: 'category',
            colors: ['#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4', '#10B981']
          }
        },
        position: { x: 8, y: 2, w: 4, h: 4 }
      },
      {
        id: 'finance-cash-flow',
        type: 'bar-chart',
        config: {
          id: 'finance-cash-flow',
          title: 'Monthly Cash Flow',
          description: 'Operating, investing, and financing cash flows',
          dataSource: {
            type: 'table',
            source: 'cash_flow',
            fields: ['month', 'operating_cf', 'investing_cf', 'financing_cf', 'net_cf']
          },
          visualization: {
            type: 'bar',
            x_axis: 'month',
            y_axes: ['operating_cf', 'investing_cf', 'financing_cf'],
            colors: ['#10B981', '#F59E0B', '#8B5CF6'],
            stacked: true,
            zero_line: true
          }
        },
        position: { x: 0, y: 6, w: 8, h: 4 }
      },
      {
        id: 'finance-kpis',
        type: 'table',
        config: {
          id: 'finance-kpis',
          title: 'Key Financial Ratios',
          description: 'Important financial health indicators',
          dataSource: {
            type: 'table',
            source: 'financial_ratios',
            fields: ['metric', 'current_period', 'previous_period', 'industry_benchmark']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'metric', title: 'Metric', format: 'text' },
              { key: 'current_period', title: 'Current', format: 'number' },
              { key: 'previous_period', title: 'Previous', format: 'number' },
              { key: 'industry_benchmark', title: 'Benchmark', format: 'number' }
            ],
            conditional_formatting: {
              column: 'current_period',
              rules: [
                { condition: 'above_benchmark', color: 'success' },
                { condition: 'below_benchmark', color: 'warning' }
              ]
            }
          }
        },
        position: { x: 8, y: 6, w: 4, h: 4 }
      },
      {
        id: 'finance-budget-actual',
        type: 'bar-chart',
        config: {
          id: 'finance-budget-actual',
          title: 'Budget vs Actual',
          description: 'Comparison of budgeted vs actual amounts',
          dataSource: {
            type: 'table',
            source: 'budget_comparison',
            fields: ['category', 'budgeted', 'actual', 'variance']
          },
          visualization: {
            type: 'bar',
            x_axis: 'category',
            y_axes: ['budgeted', 'actual'],
            colors: ['#06B6D4', '#10B981'],
            grouped: true
          }
        },
        position: { x: 0, y: 10, w: 6, h: 4 }
      },
      {
        id: 'finance-ar-aging',
        type: 'bar-chart',
        config: {
          id: 'finance-ar-aging',
          title: 'Accounts Receivable Aging',
          description: 'Outstanding invoices by age',
          dataSource: {
            type: 'table',
            source: 'ar_aging',
            fields: ['age_bucket', 'amount', 'count']
          },
          visualization: {
            type: 'bar',
            x_axis: 'age_bucket',
            y_axis: 'amount',
            format: 'currency',
            colors: ['#10B981'],
            horizontal: false
          }
        },
        position: { x: 6, y: 10, w: 6, h: 4 }
      },
      {
        id: 'finance-balance-sheet',
        type: 'table',
        config: {
          id: 'finance-balance-sheet',
          title: 'Balance Sheet Summary',
          description: 'Key balance sheet items',
          dataSource: {
            type: 'table',
            source: 'balance_sheet',
            fields: ['account', 'current_balance', 'previous_balance', 'change']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'account', title: 'Account', format: 'text' },
              { key: 'current_balance', title: 'Current', format: 'currency' },
              { key: 'previous_balance', title: 'Previous', format: 'currency' },
              { key: 'change', title: 'Change %', format: 'percentage' }
            ],
            grouping: true,
            totals: true,
            conditional_formatting: {
              column: 'change',
              rules: [
                { condition: 'positive', color: 'success' },
                { condition: 'negative', color: 'danger' }
              ]
            }
          }
        },
        position: { x: 0, y: 14, w: 12, h: 4 }
      }
    ];

    return {
      id: 'financial-reporting',
      name: 'Financial Reporting',
      description: 'Comprehensive financial dashboard with P&L, cash flow, and key financial metrics',
      domain: 'finance',
      widgets,
      theme: {
        mode: 'dark',
        primary: 'hsl(142, 76%, 36%)', // Green for financial success
        accent: 'hsl(38, 92%, 50%)',
        background: 'hsl(240, 10%, 3.9%)',
        surface: 'hsl(240, 10%, 12%)',
        text: 'hsl(0, 0%, 95%)',
        border: 'hsl(240, 10%, 20%)',
        preset: 'finance'
      },
      layout: {
        style: 'spacious',
        gridWidth: 12,
        rowHeight: 100
      }
    };
  }
}