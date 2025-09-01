import type { DashboardTemplate } from '../dashboard-generator.js';
import type { DashboardWidget } from '../../routes/dashboards.js';

export class ComplianceTemplate {
  getTemplate(): DashboardTemplate {
    const widgets: DashboardWidget[] = [
      {
        id: 'compliance-score',
        type: 'metric',
        config: {
          id: 'compliance-score',
          title: 'Overall Compliance Score',
          description: 'Aggregate compliance score across all frameworks',
          dataSource: {
            type: 'calculation',
            source: 'compliance_metrics',
            fields: ['compliant_controls', 'total_controls']
          },
          visualization: {
            type: 'metric',
            format: 'percentage',
            trend: true,
            comparison: 'previous_quarter',
            threshold: { target: 95, warning: 85, critical: 70 }
          }
        },
        position: { x: 0, y: 0, w: 3, h: 2 }
      },
      {
        id: 'open-findings',
        type: 'metric',
        config: {
          id: 'open-findings',
          title: 'Open Findings',
          description: 'Number of unresolved compliance findings',
          dataSource: {
            type: 'table',
            source: 'compliance_findings',
            fields: ['finding_id', 'status', 'severity']
          },
          visualization: {
            type: 'metric',
            format: 'number',
            trend: true,
            comparison: 'previous_month',
            threshold: { warning: 10, critical: 25 }
          }
        },
        position: { x: 3, y: 0, w: 3, h: 2 }
      },
      {
        id: 'critical-controls',
        type: 'metric',
        config: {
          id: 'critical-controls',
          title: 'Critical Controls',
          description: 'Status of critical security controls',
          dataSource: {
            type: 'table',
            source: 'critical_controls',
            fields: ['control_id', 'status', 'last_tested']
          },
          visualization: {
            type: 'metric',
            format: 'fraction',
            trend: true,
            comparison: 'previous_month'
          }
        },
        position: { x: 6, y: 0, w: 3, h: 2 }
      },
      {
        id: 'audit-readiness',
        type: 'metric',
        config: {
          id: 'audit-readiness',
          title: 'Audit Readiness',
          description: 'Percentage of audit requirements met',
          dataSource: {
            type: 'table',
            source: 'audit_readiness',
            fields: ['requirement', 'status', 'evidence']
          },
          visualization: {
            type: 'metric',
            format: 'percentage',
            trend: true,
            comparison: 'previous_assessment'
          }
        },
        position: { x: 9, y: 0, w: 3, h: 2 }
      },
      {
        id: 'compliance-trends',
        type: 'line-chart',
        config: {
          id: 'compliance-trends',
          title: 'Compliance Score Trends',
          description: 'Monthly compliance scores by framework',
          dataSource: {
            type: 'table',
            source: 'compliance_history',
            fields: ['month', 'sox_score', 'pci_score', 'gdpr_score', 'iso27001_score']
          },
          visualization: {
            type: 'line',
            x_axis: 'month',
            y_axes: ['sox_score', 'pci_score', 'gdpr_score', 'iso27001_score'],
            colors: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B'],
            smooth: true,
            target_line: 95
          }
        },
        position: { x: 0, y: 2, w: 8, h: 4 }
      },
      {
        id: 'risk-distribution',
        type: 'pie-chart',
        config: {
          id: 'risk-distribution',
          title: 'Risk Distribution',
          description: 'Distribution of risks by severity level',
          dataSource: {
            type: 'table',
            source: 'risk_register',
            fields: ['severity', 'count', 'impact']
          },
          visualization: {
            type: 'pie',
            value_field: 'count',
            label_field: 'severity',
            colors: ['#EF4444', '#F59E0B', '#10B981', '#06B6D4']
          }
        },
        position: { x: 8, y: 2, w: 4, h: 4 }
      },
      {
        id: 'control-effectiveness',
        type: 'table',
        config: {
          id: 'control-effectiveness',
          title: 'Control Effectiveness',
          description: 'Detailed view of control testing results',
          dataSource: {
            type: 'table',
            source: 'control_testing',
            fields: ['control_id', 'control_name', 'last_test_date', 'result', 'effectiveness', 'owner']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'control_id', title: 'Control ID', format: 'text' },
              { key: 'control_name', title: 'Control Name', format: 'text' },
              { key: 'last_test_date', title: 'Last Tested', format: 'date' },
              { key: 'result', title: 'Result', format: 'badge' },
              { key: 'effectiveness', title: 'Effectiveness', format: 'percentage' },
              { key: 'owner', title: 'Owner', format: 'text' }
            ],
            sorting: true,
            filtering: true,
            conditional_formatting: {
              column: 'result',
              rules: [
                { value: 'Pass', color: 'success' },
                { value: 'Fail', color: 'danger' },
                { value: 'Exception', color: 'warning' }
              ]
            }
          }
        },
        position: { x: 0, y: 6, w: 12, h: 4 }
      },
      {
        id: 'remediation-timeline',
        type: 'bar-chart',
        config: {
          id: 'remediation-timeline',
          title: 'Remediation Timeline',
          description: 'Timeline for fixing open compliance issues',
          dataSource: {
            type: 'table',
            source: 'remediation_plan',
            fields: ['month', 'planned_closures', 'actual_closures', 'overdue']
          },
          visualization: {
            type: 'bar',
            x_axis: 'month',
            y_axes: ['planned_closures', 'actual_closures'],
            colors: ['#06B6D4', '#10B981'],
            grouped: true
          }
        },
        position: { x: 0, y: 10, w: 6, h: 4 }
      },
      {
        id: 'vendor-compliance',
        type: 'table',
        config: {
          id: 'vendor-compliance',
          title: 'Vendor Compliance Status',
          description: 'Third-party vendor compliance assessments',
          dataSource: {
            type: 'table',
            source: 'vendor_assessments',
            fields: ['vendor_name', 'assessment_date', 'compliance_score', 'risk_level', 'next_review']
          },
          visualization: {
            type: 'table',
            columns: [
              { key: 'vendor_name', title: 'Vendor', format: 'text' },
              { key: 'assessment_date', title: 'Last Assessment', format: 'date' },
              { key: 'compliance_score', title: 'Score', format: 'percentage' },
              { key: 'risk_level', title: 'Risk Level', format: 'badge' },
              { key: 'next_review', title: 'Next Review', format: 'date' }
            ],
            sorting: true,
            filtering: true,
            alerts: {
              column: 'next_review',
              condition: 'overdue',
              color: 'warning'
            }
          }
        },
        position: { x: 6, y: 10, w: 6, h: 4 }
      },
      {
        id: 'policy-compliance',
        type: 'bar-chart',
        config: {
          id: 'policy-compliance',
          title: 'Policy Compliance by Department',
          description: 'Compliance rates across organizational departments',
          dataSource: {
            type: 'table',
            source: 'policy_compliance',
            fields: ['department', 'employees', 'trained', 'compliant', 'compliance_rate']
          },
          visualization: {
            type: 'bar',
            x_axis: 'department',
            y_axis: 'compliance_rate',
            format: 'percentage',
            colors: ['#8B5CF6'],
            target_line: 95,
            horizontal: true
          }
        },
        position: { x: 0, y: 14, w: 8, h: 4 }
      },
      {
        id: 'incident-summary',
        type: 'metric',
        config: {
          id: 'incident-summary',
          title: 'Security Incidents',
          description: 'Number of security incidents this quarter',
          dataSource: {
            type: 'table',
            source: 'security_incidents',
            fields: ['incident_id', 'severity', 'status', 'reported_date']
          },
          visualization: {
            type: 'metric',
            format: 'number',
            trend: true,
            comparison: 'previous_quarter'
          }
        },
        position: { x: 8, y: 14, w: 4, h: 2 }
      },
      {
        id: 'data-classification',
        type: 'text',
        config: {
          id: 'data-classification',
          title: 'Data Classification Summary',
          description: 'Overview of data classification and handling requirements',
          dataSource: {
            type: 'table',
            source: 'data_inventory',
            fields: ['classification', 'volume', 'controls']
          },
          visualization: {
            type: 'text',
            content: 'Data classification compliance maintained across all sensitive data categories.'
          }
        },
        position: { x: 8, y: 16, w: 4, h: 2 }
      }
    ];

    return {
      id: 'compliance-dashboard',
      name: 'Compliance Dashboard',
      description: 'Comprehensive compliance monitoring with controls, risks, and audit readiness',
      domain: 'compliance',
      widgets,
      theme: {
        mode: 'dark',
        primary: 'hsl(199, 89%, 48%)', // Blue for trust and security
        accent: 'hsl(142, 76%, 36%)',
        background: 'hsl(240, 10%, 3.9%)',
        surface: 'hsl(240, 10%, 12%)',
        text: 'hsl(0, 0%, 95%)',
        border: 'hsl(240, 10%, 20%)',
        preset: 'compliance'
      },
      layout: {
        style: 'compact',
        gridWidth: 12,
        rowHeight: 100
      }
    };
  }
}