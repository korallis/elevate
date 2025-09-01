'use client';

import { useState, useEffect } from 'react';
import { Card, Badge, Button } from '@/components/ui/design-system';
import { API_BASE } from '@/lib/api';
import { 
  Shield,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Eye,
  Users,
  Database,
  FileText,
  Clock,
  Activity,
  BarChart3,
  PieChart,
  Globe,
  Lock,
  RefreshCw,
  Download,
  ExternalLink,
  Target,
  Zap,
  AlertCircle
} from 'lucide-react';

// Types for compliance dashboard data
interface ComplianceSummary {
  pii_detection: {
    total_columns_scanned: number;
    pii_columns_found: number;
    verified_pii_columns: number;
    unmasked_pii_columns: number;
    last_scan_date: string;
  };
  rls_policies: {
    total_policies: number;
    active_policies: number;
    tables_covered: number;
    uncovered_tables: number;
    policy_violations: number;
  };
  gdpr_requests: {
    total_requests: number;
    pending_requests: number;
    completed_requests: number;
    avg_response_time_hours: number;
    overdue_requests: number;
  };
  data_governance: {
    governance_score: number;
    total_databases: number;
    cataloged_tables: number;
    compliance_issues: number;
    data_lineage_coverage: number;
  };
}

interface ComplianceAlert {
  id: number;
  type: 'critical' | 'warning' | 'info';
  category: 'pii' | 'rls' | 'gdpr' | 'general';
  title: string;
  description: string;
  created_at: string;
  resolved: boolean;
  action_url?: string;
}

interface TrendData {
  date: string;
  pii_detections: number;
  policy_applications: number;
  gdpr_requests: number;
  governance_score: number;
}

export function ComplianceDashboard() {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState('30d');

  useEffect(() => {
    loadDashboardData();
  }, [selectedTimeRange]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadSummary(),
        loadAlerts(),
        loadTrends()
      ]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await fetch(`${API_BASE}/governance/dashboard/summary`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      if (response.ok) {
        const data = await response.json();
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Failed to load summary:', error);
    }
  };

  const loadAlerts = async () => {
    try {
      const response = await fetch(`${API_BASE}/governance/dashboard/alerts`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  };

  const loadTrends = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/governance/dashboard/trends?period=${selectedTimeRange}`,
        {
          headers: { 
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setTrends(data.trends || []);
      }
    } catch (error) {
      console.error('Failed to load trends:', error);
    }
  };

  const refreshDashboard = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const resolveAlert = async (alertId: number) => {
    try {
      const response = await fetch(`${API_BASE}/governance/alerts/${alertId}/resolve`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (response.ok) {
        setAlerts(prev => prev.map(alert => 
          alert.id === alertId ? { ...alert, resolved: true } : alert
        ));
      }
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  const getAlertIcon = (type: string) => {
    const icons = {
      'critical': AlertCircle,
      'warning': AlertTriangle,
      'info': CheckCircle2
    } as const;
    return icons[type as keyof typeof icons] || AlertTriangle;
  };

  const getAlertVariant = (type: string) => {
    const variants = {
      'critical': 'destructive',
      'warning': 'warning',
      'info': 'default'
    } as const;
    return variants[type as keyof typeof variants] || 'default';
  };

  const getComplianceColor = (score: number) => {
    if (score >= 90) return 'text-success';
    if (score >= 70) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreDescription = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Fair';
    if (score >= 60) return 'Poor';
    return 'Critical';
  };

  if (isLoading || !summary) {
    return (
      <div className="compliance-dashboard space-y-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="compliance-dashboard space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Compliance Dashboard</h1>
          <p className="text-foreground-muted mt-1">
            Monitor your data governance and compliance posture across all systems
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="h-11 px-4 text-base rounded-lg border border-border bg-background/50"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshDashboard}
            disabled={refreshing}
          >
            {refreshing ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Governance Score */}
      <Card variant="premium" padding="lg">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 mb-4">
            <div className="text-3xl font-bold text-primary">
              {summary.data_governance.governance_score}
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">Overall Governance Score</h3>
          <p className={`text-lg font-medium mb-4 ${getComplianceColor(summary.data_governance.governance_score)}`}>
            {getScoreDescription(summary.data_governance.governance_score)} Compliance
          </p>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-foreground-muted">Databases</p>
              <p className="text-lg font-semibold">{summary.data_governance.total_databases}</p>
            </div>
            <div>
              <p className="text-foreground-muted">Cataloged Tables</p>
              <p className="text-lg font-semibold">{summary.data_governance.cataloged_tables}</p>
            </div>
            <div>
              <p className="text-foreground-muted">Lineage Coverage</p>
              <p className="text-lg font-semibold">{summary.data_governance.data_lineage_coverage}%</p>
            </div>
            <div>
              <p className="text-foreground-muted">Active Issues</p>
              <p className="text-lg font-semibold text-warning">{summary.data_governance.compliance_issues}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <Badge variant="outline">{summary.pii_detection.verified_pii_columns}/{summary.pii_detection.pii_columns_found}</Badge>
          </div>
          <h3 className="text-sm font-medium text-foreground-muted mb-1">PII Protection</h3>
          <div className="text-2xl font-semibold mb-1">
            {((summary.pii_detection.pii_columns_found - summary.pii_detection.unmasked_pii_columns) / Math.max(summary.pii_detection.pii_columns_found, 1) * 100).toFixed(0)}%
          </div>
          <p className="text-xs text-foreground-muted">
            {summary.pii_detection.unmasked_pii_columns} columns unprotected
          </p>
        </Card>

        <Card variant="default" padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-success" />
            </div>
            <Badge variant="success">{summary.rls_policies.active_policies} active</Badge>
          </div>
          <h3 className="text-sm font-medium text-foreground-muted mb-1">RLS Coverage</h3>
          <div className="text-2xl font-semibold mb-1">
            {(summary.rls_policies.tables_covered / Math.max(summary.rls_policies.tables_covered + summary.rls_policies.uncovered_tables, 1) * 100).toFixed(0)}%
          </div>
          <p className="text-xs text-foreground-muted">
            {summary.rls_policies.uncovered_tables} tables uncovered
          </p>
        </Card>

        <Card variant="default" padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <Badge variant="warning">{summary.gdpr_requests.pending_requests} pending</Badge>
          </div>
          <h3 className="text-sm font-medium text-foreground-muted mb-1">GDPR Response Time</h3>
          <div className="text-2xl font-semibold mb-1">
            {summary.gdpr_requests.avg_response_time_hours}h
          </div>
          <p className="text-xs text-foreground-muted">
            {summary.gdpr_requests.overdue_requests} requests overdue
          </p>
        </Card>

        <Card variant="default" padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <Badge variant="destructive">{alerts.filter(a => !a.resolved).length}</Badge>
          </div>
          <h3 className="text-sm font-medium text-foreground-muted mb-1">Active Alerts</h3>
          <div className="text-2xl font-semibold mb-1">
            {alerts.filter(a => !a.resolved && a.type === 'critical').length}
          </div>
          <p className="text-xs text-foreground-muted">critical issues</p>
        </Card>
      </div>

      {/* Recent Alerts */}
      <Card variant="default" padding="none">
        <div className="p-6 border-b border-card-border">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Recent Compliance Alerts</h3>
            <Badge variant="outline">
              {alerts.filter(a => !a.resolved).length} active
            </Badge>
          </div>
        </div>
        
        <div className="divide-y divide-card-border max-h-80 overflow-y-auto">
          {alerts.slice(0, 10).map((alert) => {
            const AlertIcon = getAlertIcon(alert.type);
            return (
              <div key={alert.id} className={`p-4 hover:bg-card/20 ${alert.resolved ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-card/50 flex items-center justify-center flex-shrink-0">
                    <AlertIcon className="w-4 h-4" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{alert.title}</h4>
                      <Badge variant={getAlertVariant(alert.type)} className="text-xs">
                        {alert.type}
                      </Badge>
                      {alert.resolved && (
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Resolved
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground-muted mb-2">{alert.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground-muted">
                        {new Date(alert.created_at).toLocaleDateString()} • {alert.category}
                      </span>
                      <div className="flex items-center gap-2">
                        {alert.action_url && (
                          <Button variant="outline" size="sm">
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View
                          </Button>
                        )}
                        {!alert.resolved && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => resolveAlert(alert.id)}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {alerts.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">All Clear!</h3>
            <p className="text-foreground-muted">No compliance alerts at this time</p>
          </div>
        )}
      </Card>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PII Detection Details */}
        <Card variant="default" padding="md">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-medium">PII Detection</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Total Columns Scanned</span>
              <span className="font-medium">{summary.pii_detection.total_columns_scanned.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">PII Columns Found</span>
              <span className="font-medium">{summary.pii_detection.pii_columns_found}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Verified PII</span>
              <span className="font-medium text-success">{summary.pii_detection.verified_pii_columns}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Unmasked PII</span>
              <span className="font-medium text-destructive">{summary.pii_detection.unmasked_pii_columns}</span>
            </div>
            
            <div className="pt-2 border-t border-card-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">Last Scan</span>
                <span>{new Date(summary.pii_detection.last_scan_date).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* RLS Policy Details */}
        <Card variant="default" padding="md">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-success" />
            <h3 className="text-lg font-medium">Row-Level Security</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Total Policies</span>
              <span className="font-medium">{summary.rls_policies.total_policies}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Active Policies</span>
              <span className="font-medium text-success">{summary.rls_policies.active_policies}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Tables Covered</span>
              <span className="font-medium">{summary.rls_policies.tables_covered}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Uncovered Tables</span>
              <span className="font-medium text-warning">{summary.rls_policies.uncovered_tables}</span>
            </div>
            
            <div className="pt-2 border-t border-card-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">Policy Violations</span>
                <span className="text-destructive">{summary.rls_policies.policy_violations}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* GDPR Request Details */}
        <Card variant="default" padding="md">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-medium">GDPR Requests</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Total Requests</span>
              <span className="font-medium">{summary.gdpr_requests.total_requests}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Pending</span>
              <span className="font-medium text-warning">{summary.gdpr_requests.pending_requests}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Completed</span>
              <span className="font-medium text-success">{summary.gdpr_requests.completed_requests}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Overdue</span>
              <span className="font-medium text-destructive">{summary.gdpr_requests.overdue_requests}</span>
            </div>
            
            <div className="pt-2 border-t border-card-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">Avg Response Time</span>
                <span>{summary.gdpr_requests.avg_response_time_hours}h</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Compliance Trends */}
      {trends.length > 0 && (
        <Card variant="default" padding="md">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-medium">Compliance Trends</h3>
            </div>
            <Badge variant="outline">{selectedTimeRange}</Badge>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-semibold mb-1">
                {trends[trends.length - 1]?.governance_score || 0}
              </div>
              <div className="text-sm text-foreground-muted mb-2">Governance Score</div>
              <div className="flex items-center justify-center text-xs">
                {(trends[trends.length - 1]?.governance_score || 0) > (trends[0]?.governance_score || 0) ? (
                  <>
                    <TrendingUp className="w-3 h-3 text-success mr-1" />
                    <span className="text-success">Improving</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3 h-3 text-destructive mr-1" />
                    <span className="text-destructive">Declining</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-semibold mb-1">
                {trends.reduce((sum, t) => sum + t.pii_detections, 0)}
              </div>
              <div className="text-sm text-foreground-muted mb-2">PII Detections</div>
              <div className="text-xs text-foreground-muted">Total this period</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-semibold mb-1">
                {trends.reduce((sum, t) => sum + t.policy_applications, 0)}
              </div>
              <div className="text-sm text-foreground-muted mb-2">Policy Applications</div>
              <div className="text-xs text-foreground-muted">Total this period</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-semibold mb-1">
                {trends.reduce((sum, t) => sum + t.gdpr_requests, 0)}
              </div>
              <div className="text-sm text-foreground-muted mb-2">GDPR Requests</div>
              <div className="text-xs text-foreground-muted">Total this period</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}