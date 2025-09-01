'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Card, Input, Badge } from '@/components/ui/design-system';
import { API_BASE } from '@/lib/api';
import { 
  UserCheck,
  Download,
  Trash2,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Eye,
  User,
  Mail,
  Calendar,
  Search,
  Filter,
  X,
  ExternalLink,
  RefreshCw,
  Archive,
  MessageSquare
} from 'lucide-react';

// Types for GDPR Request management
interface GDPRRequest {
  id: number;
  request_type: 'export' | 'delete' | 'consent_withdraw';
  subject_type: 'email' | 'user_id' | 'customer_id';
  subject_identifier: string;
  requester_email: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  requested_at: string;
  completed_at?: string;
  data_retention_days?: number;
  export_format?: 'json' | 'csv' | 'pdf';
  export_url?: string;
  deletion_approved_by?: number;
  deletion_approved_at?: string;
  notes?: string;
}

interface ConsentRecord {
  id: number;
  user_id: number;
  purpose: string;
  consent_given: boolean;
  consent_date: string;
  expiry_date?: string;
  withdrawn_date?: string;
  legal_basis: string;
  data_categories: string[];
  processing_activities: string[];
}

interface DataDiscoveryResult {
  total_records: number;
  affected_tables: Array<{
    database_name: string;
    schema_name: string;
    table_name: string;
    record_count: number;
    columns: string[];
  }>;
  estimated_export_size_mb: number;
}

export function GDPRRequestForm() {
  const [requests, setRequests] = useState<GDPRRequest[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<GDPRRequest | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [discoveryResult, setDiscoveryResult] = useState<DataDiscoveryResult | null>(null);

  // Form state for GDPR request creation
  const [formData, setFormData] = useState({
    request_type: 'export' as 'export' | 'delete' | 'consent_withdraw',
    subject_type: 'email' as 'email' | 'user_id' | 'customer_id',
    subject_identifier: '',
    requester_email: '',
    export_format: 'json' as 'json' | 'csv' | 'pdf',
    data_retention_days: 30,
    notes: ''
  });

  useEffect(() => {
    loadRequests();
    loadConsents();
  }, []);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/governance/gdpr/requests`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to load GDPR requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConsents = async () => {
    try {
      const response = await fetch(`${API_BASE}/governance/gdpr/consents`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      if (response.ok) {
        const data = await response.json();
        setConsents(data.consents || []);
      }
    } catch (error) {
      console.error('Failed to load consent records:', error);
    }
  };

  const discoverData = async (subjectType: string, identifier: string) => {
    try {
      const response = await fetch(`${API_BASE}/governance/gdpr/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          subject_type: subjectType,
          subject_identifier: identifier
        })
      });

      if (response.ok) {
        const result = await response.json();
        setDiscoveryResult(result);
      }
    } catch (error) {
      console.error('Data discovery failed:', error);
    }
  };

  const createRequest = async () => {
    try {
      const response = await fetch(`${API_BASE}/governance/gdpr/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await loadRequests();
        resetForm();
        setShowCreateForm(false);
        setDiscoveryResult(null);
      }
    } catch (error) {
      console.error('Failed to create GDPR request:', error);
    }
  };

  const updateRequestStatus = async (requestId: number, status: string, notes?: string) => {
    try {
      const response = await fetch(`${API_BASE}/governance/gdpr/requests/${requestId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ status, notes })
      });

      if (response.ok) {
        setRequests(prev => prev.map(req => 
          req.id === requestId 
            ? { ...req, status: status as any, notes }
            : req
        ));
      }
    } catch (error) {
      console.error('Failed to update request status:', error);
    }
  };

  const approveDataDeletion = async (requestId: number) => {
    if (!confirm('Are you sure you want to approve this data deletion request? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/governance/gdpr/requests/${requestId}/approve-deletion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (response.ok) {
        await loadRequests();
      }
    } catch (error) {
      console.error('Failed to approve deletion:', error);
    }
  };

  const updateConsent = async (consentId: number, consentGiven: boolean) => {
    try {
      const response = await fetch(`${API_BASE}/governance/gdpr/consents/${consentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ consent_given: consentGiven })
      });

      if (response.ok) {
        setConsents(prev => prev.map(consent => 
          consent.id === consentId 
            ? { ...consent, consent_given: consentGiven }
            : consent
        ));
      }
    } catch (error) {
      console.error('Failed to update consent:', error);
    }
  };

  const downloadExport = async (request: GDPRRequest) => {
    if (!request.export_url) return;

    try {
      const response = await fetch(request.export_url, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gdpr-export-${request.id}.${request.export_format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to download export:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      request_type: 'export',
      subject_type: 'email',
      subject_identifier: '',
      requester_email: '',
      export_format: 'json',
      data_retention_days: 30,
      notes: ''
    });
  };

  const filteredRequests = requests.filter(request => {
    const matchesSearch = !searchQuery || 
      request.subject_identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.requester_email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = !statusFilter || request.status === statusFilter;
    const matchesType = !typeFilter || request.request_type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusBadgeVariant = (status: string) => {
    const statusColors = {
      'pending': 'warning',
      'in_progress': 'default',
      'completed': 'success',
      'failed': 'destructive',
      'cancelled': 'outline'
    } as const;
    return statusColors[status as keyof typeof statusColors] || 'outline';
  };

  const getRequestTypeIcon = (type: string) => {
    const typeIcons = {
      'export': Download,
      'delete': Trash2,
      'consent_withdraw': UserCheck
    } as const;
    return typeIcons[type as keyof typeof typeIcons] || FileText;
  };

  const getRequestTypeBadgeVariant = (type: string) => {
    const typeColors = {
      'export': 'default',
      'delete': 'destructive',
      'consent_withdraw': 'warning'
    } as const;
    return typeColors[type as keyof typeof typeColors] || 'outline';
  };

  return (
    <div className="gdpr-request-form space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">GDPR Request Management</h1>
          <p className="text-foreground-muted mt-1">
            Process data subject rights requests including data export, deletion, and consent withdrawal
          </p>
        </div>
        <Button 
          variant="primary" 
          size="sm"
          onClick={() => setShowCreateForm(true)}
        >
          <FileText className="w-4 h-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card variant="default" padding="md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground-muted">Total Requests</p>
              <p className="text-2xl font-semibold">{requests.length}</p>
            </div>
            <FileText className="w-8 h-8 text-primary" />
          </div>
        </Card>
        <Card variant="default" padding="md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground-muted">Pending</p>
              <p className="text-2xl font-semibold text-warning">
                {requests.filter(r => r.status === 'pending').length}
              </p>
            </div>
            <Clock className="w-8 h-8 text-warning" />
          </div>
        </Card>
        <Card variant="default" padding="md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground-muted">Completed</p>
              <p className="text-2xl font-semibold text-success">
                {requests.filter(r => r.status === 'completed').length}
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
        </Card>
        <Card variant="default" padding="md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground-muted">This Month</p>
              <p className="text-2xl font-semibold">
                {requests.filter(r => 
                  new Date(r.requested_at).getMonth() === new Date().getMonth()
                ).length}
              </p>
            </div>
            <Calendar className="w-8 h-8 text-primary" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card variant="default" padding="md">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground-muted" />
            <Input
              placeholder="Search by subject identifier or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 px-4 text-base rounded-lg border border-border bg-background/50"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-11 px-4 text-base rounded-lg border border-border bg-background/50"
          >
            <option value="">All Types</option>
            <option value="export">Data Export</option>
            <option value="delete">Data Deletion</option>
            <option value="consent_withdraw">Consent Withdrawal</option>
          </select>

          {(searchQuery || statusFilter || typeFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setTypeFilter('');
              }}
            >
              <X className="w-4 h-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Requests List */}
      <Card variant="default" padding="none">
        <div className="p-6 border-b border-card-border">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">GDPR Requests</h3>
            <div className="flex items-center gap-4 text-sm text-foreground-muted">
              <span>{filteredRequests.length} of {requests.length} requests</span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-card-border">
          {filteredRequests.map((request) => {
            const TypeIcon = getRequestTypeIcon(request.request_type);
            return (
              <div key={request.id} className="p-6 hover:bg-card/20">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-card/50 flex items-center justify-center">
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant={getRequestTypeBadgeVariant(request.request_type)}>
                          {request.request_type.replace('_', ' ')}
                        </Badge>
                        <Badge variant={getStatusBadgeVariant(request.status)}>
                          {request.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                        <div>
                          <span className="text-foreground-muted">Subject:</span>
                          <p className="font-medium">{request.subject_identifier}</p>
                        </div>
                        <div>
                          <span className="text-foreground-muted">Requester:</span>
                          <p className="font-medium">{request.requester_email}</p>
                        </div>
                        <div>
                          <span className="text-foreground-muted">Requested:</span>
                          <p>{new Date(request.requested_at).toLocaleDateString()}</p>
                        </div>
                        {request.completed_at && (
                          <div>
                            <span className="text-foreground-muted">Completed:</span>
                            <p>{new Date(request.completed_at).toLocaleDateString()}</p>
                          </div>
                        )}
                      </div>

                      {request.notes && (
                        <div className="bg-card/30 rounded p-3 text-sm mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="w-3 h-3" />
                            <span className="font-medium">Notes</span>
                          </div>
                          {request.notes}
                        </div>
                      )}

                      {request.export_url && request.status === 'completed' && (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-success" />
                          <span>Export ready for download</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadExport(request)}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {request.request_type === 'delete' && request.status === 'pending' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => approveDataDeletion(request.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Approve Deletion
                      </Button>
                    )}
                    
                    {request.status === 'pending' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => updateRequestStatus(request.id, 'in_progress')}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Start Processing
                      </Button>
                    )}

                    {request.status === 'in_progress' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateRequestStatus(request.id, 'completed')}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Mark Complete
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRequest(request)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredRequests.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Requests Found</h3>
            <p className="text-foreground-muted mb-4">
              {requests.length === 0 
                ? "No GDPR requests have been submitted yet"
                : "No requests match your current filters"
              }
            </p>
            <Button variant="primary" onClick={() => setShowCreateForm(true)}>
              <FileText className="w-4 h-4 mr-2" />
              Create First Request
            </Button>
          </div>
        )}
      </Card>

      {/* Create Request Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card variant="elevated" padding="none" className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-card-border">
              <h3 className="text-lg font-medium">Create GDPR Request</h3>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Request Type</label>
                  <select
                    value={formData.request_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, request_type: e.target.value as any }))}
                    className="w-full h-11 px-4 text-base rounded-lg border border-border bg-background/50"
                  >
                    <option value="export">Data Export</option>
                    <option value="delete">Data Deletion</option>
                    <option value="consent_withdraw">Consent Withdrawal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Subject Type</label>
                  <select
                    value={formData.subject_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject_type: e.target.value as any }))}
                    className="w-full h-11 px-4 text-base rounded-lg border border-border bg-background/50"
                  >
                    <option value="email">Email Address</option>
                    <option value="user_id">User ID</option>
                    <option value="customer_id">Customer ID</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Subject Identifier</label>
                <div className="flex gap-2">
                  <Input
                    value={formData.subject_identifier}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject_identifier: e.target.value }))}
                    placeholder="Enter email, user ID, or customer ID"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => discoverData(formData.subject_type, formData.subject_identifier)}
                    disabled={!formData.subject_identifier}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Discover
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Requester Email</label>
                <Input
                  type="email"
                  value={formData.requester_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, requester_email: e.target.value }))}
                  placeholder="Enter requester's email address"
                />
              </div>

              {formData.request_type === 'export' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Export Format</label>
                    <select
                      value={formData.export_format}
                      onChange={(e) => setFormData(prev => ({ ...prev, export_format: e.target.value as any }))}
                      className="w-full h-11 px-4 text-base rounded-lg border border-border bg-background/50"
                    >
                      <option value="json">JSON</option>
                      <option value="csv">CSV</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Data Retention (days)</label>
                    <Input
                      type="number"
                      value={formData.data_retention_days}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        data_retention_days: parseInt(e.target.value) || 30 
                      }))}
                      min="1"
                      max="90"
                    />
                  </div>
                </div>
              )}

              {/* Data Discovery Results */}
              {discoveryResult && (
                <Card variant="premium" padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <Search className="w-5 h-5 text-primary" />
                    <h4 className="font-medium">Data Discovery Results</h4>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <span className="text-sm text-foreground-muted">Total Records</span>
                      <p className="text-lg font-medium">{discoveryResult.total_records.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-sm text-foreground-muted">Affected Tables</span>
                      <p className="text-lg font-medium">{discoveryResult.affected_tables.length}</p>
                    </div>
                    <div>
                      <span className="text-sm text-foreground-muted">Export Size</span>
                      <p className="text-lg font-medium">{discoveryResult.estimated_export_size_mb}MB</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {discoveryResult.affected_tables.slice(0, 5).map((table, index) => (
                      <div key={index} className="p-2 bg-card/30 rounded text-sm">
                        <div className="font-medium">
                          {table.database_name}.{table.schema_name}.{table.table_name}
                        </div>
                        <div className="text-foreground-muted">
                          {table.record_count} records, {table.columns.length} columns
                        </div>
                      </div>
                    ))}
                    {discoveryResult.affected_tables.length > 5 && (
                      <p className="text-sm text-foreground-muted">
                        +{discoveryResult.affected_tables.length - 5} more tables
                      </p>
                    )}
                  </div>
                </Card>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add any additional notes or context..."
                  className="w-full h-24 px-4 py-2 text-base rounded-lg border border-border bg-background/50 resize-none"
                />
              </div>
            </div>

            <div className="p-6 border-t border-card-border flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowCreateForm(false);
                resetForm();
                setDiscoveryResult(null);
              }}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                onClick={createRequest}
                disabled={!formData.subject_identifier || !formData.requester_email}
              >
                Create Request
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}