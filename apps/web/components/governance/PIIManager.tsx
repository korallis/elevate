'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Card, Input, Badge } from '@/components/ui/design-system';
import { api, API_BASE } from '@/lib/api';
import { 
  Shield,
  Eye,
  EyeOff,
  Search,
  Database,
  Table,
  Columns,
  AlertTriangle,
  CheckCircle2,
  Scan,
  Tag,
  Settings,
  Download,
  Upload,
  RefreshCw,
  Filter,
  X
} from 'lucide-react';

// Types for PII management
interface PIIColumn {
  id: number;
  database_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  pii_type: string;
  confidence_score: number;
  detection_method: 'manual' | 'pattern' | 'ml' | 'user';
  masking_rule: 'none' | 'hash' | 'redact' | 'partial' | 'encrypt' | 'tokenize';
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface PIIScanResult {
  total_tables: number;
  total_columns: number;
  pii_columns_found: number;
  results: PIIDetectionResult[];
}

interface PIIDetectionResult {
  database_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  pii_type: string;
  confidence_score: number;
  detection_method: string;
  sample_values: string[];
  recommended_masking: string;
}

interface MaskingStrategy {
  rule: 'none' | 'hash' | 'redact' | 'partial' | 'encrypt' | 'tokenize';
  config?: {
    algorithm?: string;
    key?: string;
    replacement_char?: string;
    partial_show_first?: number;
    partial_show_last?: number;
  };
}

interface PIIScanOptions {
  database_name: string;
  schema_name?: string;
  table_names?: string[];
  rescan_existing?: boolean;
  confidence_threshold?: number;
}

export function PIIManager() {
  const [piiColumns, setPiiColumns] = useState<PIIColumn[]>([]);
  const [scanResults, setScanResults] = useState<PIIScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [selectedSchema, setSelectedSchema] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaskingRule, setSelectedMaskingRule] = useState<string>('');
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [databases, setDatabases] = useState<{ NAME: string }[]>([]);
  const [schemas, setSchemas] = useState<{ SCHEMA_NAME: string }[]>([]);

  // Load initial data
  useEffect(() => {
    loadDatabases();
    loadPIIColumns();
  }, []);

  useEffect(() => {
    if (selectedDatabase) {
      loadSchemas();
    }
  }, [selectedDatabase]);

  const loadDatabases = async () => {
    try {
      const dbs = await api.listDatabases();
      setDatabases(dbs);
      if (dbs.length > 0 && !selectedDatabase) {
        setSelectedDatabase(dbs[0].NAME);
      }
    } catch (error) {
      console.error('Failed to load databases:', error);
    }
  };

  const loadSchemas = async () => {
    if (!selectedDatabase) return;
    try {
      const schemaList = await api.listSchemas(selectedDatabase);
      setSchemas(schemaList);
      if (schemaList.length > 0 && !selectedSchema) {
        setSelectedSchema(schemaList[0].SCHEMA_NAME);
      }
    } catch (error) {
      console.error('Failed to load schemas:', error);
    }
  };

  const loadPIIColumns = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/governance/pii/columns`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPiiColumns(data.columns || []);
      }
    } catch (error) {
      console.error('Failed to load PII columns:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runPIIScan = async () => {
    if (!selectedDatabase) return;
    
    setIsScanning(true);
    setScanResults(null);
    
    try {
      const scanOptions: PIIScanOptions = {
        database_name: selectedDatabase,
        schema_name: selectedSchema || undefined,
        rescan_existing: true,
        confidence_threshold: 0.7
      };

      const response = await fetch(`${API_BASE}/governance/pii/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify(scanOptions)
      });

      if (response.ok) {
        const result = await response.json();
        setScanResults(result);
        await loadPIIColumns(); // Refresh the PII columns list
      }
    } catch (error) {
      console.error('PII scan failed:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const updateMaskingRule = async (columnId: number, maskingRule: string) => {
    try {
      const response = await fetch(`${API_BASE}/governance/pii/columns/${columnId}/masking`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ masking_rule: maskingRule })
      });

      if (response.ok) {
        setPiiColumns(prev => prev.map(col => 
          col.id === columnId 
            ? { ...col, masking_rule: maskingRule as any }
            : col
        ));
      }
    } catch (error) {
      console.error('Failed to update masking rule:', error);
    }
  };

  const verifyPIIColumn = async (columnId: number, verified: boolean) => {
    try {
      const response = await fetch(`${API_BASE}/governance/pii/columns/${columnId}/verify`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ is_verified: verified })
      });

      if (response.ok) {
        setPiiColumns(prev => prev.map(col => 
          col.id === columnId 
            ? { ...col, is_verified: verified }
            : col
        ));
      }
    } catch (error) {
      console.error('Failed to verify PII column:', error);
    }
  };

  const acceptScanResult = async (result: PIIDetectionResult) => {
    try {
      const response = await fetch(`${API_BASE}/governance/pii/columns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          database_name: result.database_name,
          schema_name: result.schema_name,
          table_name: result.table_name,
          column_name: result.column_name,
          pii_type: result.pii_type,
          confidence_score: result.confidence_score,
          detection_method: result.detection_method,
          masking_rule: result.recommended_masking
        })
      });

      if (response.ok) {
        await loadPIIColumns();
        // Remove from scan results
        setScanResults(prev => prev ? {
          ...prev,
          results: prev.results.filter(r => 
            !(r.database_name === result.database_name &&
              r.schema_name === result.schema_name &&
              r.table_name === result.table_name &&
              r.column_name === result.column_name)
          )
        } : null);
      }
    } catch (error) {
      console.error('Failed to accept scan result:', error);
    }
  };

  const filteredColumns = piiColumns.filter(col => {
    const matchesSearch = !searchQuery || 
      col.table_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      col.column_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      col.pii_type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesMasking = !selectedMaskingRule || col.masking_rule === selectedMaskingRule;
    const matchesVerified = !showVerifiedOnly || col.is_verified;
    
    return matchesSearch && matchesMasking && matchesVerified;
  });

  const getPIITypeBadgeVariant = (piiType: string) => {
    const typeColors = {
      'email': 'default',
      'ssn': 'destructive',
      'phone': 'warning', 
      'name': 'secondary',
      'address': 'outline',
      'credit_card': 'destructive',
      'date_of_birth': 'warning',
      'ip_address': 'secondary'
    } as const;
    return typeColors[piiType as keyof typeof typeColors] || 'outline';
  };

  const getMaskingRuleBadgeVariant = (rule: string) => {
    const ruleColors = {
      'none': 'outline',
      'hash': 'secondary',
      'redact': 'destructive',
      'partial': 'warning',
      'encrypt': 'success',
      'tokenize': 'default'
    } as const;
    return ruleColors[rule as keyof typeof ruleColors] || 'outline';
  };

  return (
    <div className="pii-manager space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PII Data Management</h1>
          <p className="text-foreground-muted mt-1">
            Discover, classify, and protect personally identifiable information in your datasets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
          <Button variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-2" />
            Import Rules
          </Button>
        </div>
      </div>

      {/* Scan Controls */}
      <Card variant="default" padding="md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scan className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-medium">PII Detection Scan</h3>
          </div>
          <Button 
            variant="primary" 
            size="sm"
            onClick={runPIIScan}
            disabled={isScanning || !selectedDatabase}
          >
            {isScanning ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Scan className="w-4 h-4 mr-2" />
            )}
            {isScanning ? 'Scanning...' : 'Run Scan'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Database</label>
            <select
              value={selectedDatabase}
              onChange={(e) => setSelectedDatabase(e.target.value)}
              className="w-full h-11 px-4 text-base rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isScanning}
            >
              <option value="">Select database</option>
              {databases.map(db => (
                <option key={db.NAME} value={db.NAME}>{db.NAME}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Schema (Optional)</label>
            <select
              value={selectedSchema}
              onChange={(e) => setSelectedSchema(e.target.value)}
              className="w-full h-11 px-4 text-base rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isScanning || !selectedDatabase}
            >
              <option value="">All schemas</option>
              {schemas.map(schema => (
                <option key={schema.SCHEMA_NAME} value={schema.SCHEMA_NAME}>{schema.SCHEMA_NAME}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Scan Results */}
      {scanResults && scanResults.results.length > 0 && (
        <Card variant="premium" padding="md">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-medium">New PII Detection Results</h3>
            <Badge variant="warning">{scanResults.results.length} found</Badge>
          </div>
          
          <div className="space-y-3">
            {scanResults.results.map((result, index) => (
              <div key={index} className="p-4 border border-card-border rounded-lg bg-card/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-foreground-muted" />
                    <span className="font-medium">
                      {result.database_name}.{result.schema_name}.{result.table_name}.{result.column_name}
                    </span>
                    <Badge variant={getPIITypeBadgeVariant(result.pii_type)}>
                      {result.pii_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground-muted">
                      {(result.confidence_score * 100).toFixed(0)}% confidence
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => acceptScanResult(result)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Accept
                    </Button>
                  </div>
                </div>
                
                {result.sample_values.length > 0 && (
                  <div className="mt-2 text-sm text-foreground-muted">
                    <span className="font-medium">Sample values: </span>
                    {result.sample_values.slice(0, 3).join(', ')}
                    {result.sample_values.length > 3 && '...'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card variant="default" padding="md">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground-muted" />
            <Input
              placeholder="Search by table, column, or PII type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <select
            value={selectedMaskingRule}
            onChange={(e) => setSelectedMaskingRule(e.target.value)}
            className="h-11 px-4 text-base rounded-lg border border-border bg-background/50"
          >
            <option value="">All masking rules</option>
            <option value="none">No masking</option>
            <option value="hash">Hash</option>
            <option value="redact">Redact</option>
            <option value="partial">Partial</option>
            <option value="encrypt">Encrypt</option>
            <option value="tokenize">Tokenize</option>
          </select>

          <Button
            variant={showVerifiedOnly ? "primary" : "outline"}
            size="sm"
            onClick={() => setShowVerifiedOnly(!showVerifiedOnly)}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Verified Only
          </Button>

          {(searchQuery || selectedMaskingRule || showVerifiedOnly) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedMaskingRule('');
                setShowVerifiedOnly(false);
              }}
            >
              <X className="w-4 h-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* PII Columns Table */}
      <Card variant="default" padding="none">
        <div className="p-6 border-b border-card-border">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Detected PII Columns</h3>
            <div className="flex items-center gap-4 text-sm text-foreground-muted">
              <span>{filteredColumns.length} of {piiColumns.length} columns</span>
              <span>{piiColumns.filter(col => col.is_verified).length} verified</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-card/30">
              <tr>
                <th className="text-left p-4 font-medium">Column</th>
                <th className="text-left p-4 font-medium">PII Type</th>
                <th className="text-left p-4 font-medium">Confidence</th>
                <th className="text-left p-4 font-medium">Masking Rule</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredColumns.map((column) => (
                <tr key={column.id} className="border-t border-card-border hover:bg-card/20">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1 text-sm text-foreground-muted">
                          <Database className="w-3 h-3" />
                          {column.database_name}.{column.schema_name}
                        </div>
                        <div className="flex items-center gap-1 font-medium">
                          <Table className="w-3 h-3" />
                          {column.table_name}.{column.column_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge variant={getPIITypeBadgeVariant(column.pii_type)}>
                      {column.pii_type}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-card-border rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${column.confidence_score * 100}%` }}
                        />
                      </div>
                      <span className="text-sm">
                        {(column.confidence_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <select
                      value={column.masking_rule}
                      onChange={(e) => updateMaskingRule(column.id, e.target.value)}
                      className="h-9 px-3 text-sm rounded-md border border-border bg-background/50"
                    >
                      <option value="none">No masking</option>
                      <option value="hash">Hash</option>
                      <option value="redact">Redact</option>
                      <option value="partial">Partial</option>
                      <option value="encrypt">Encrypt</option>
                      <option value="tokenize">Tokenize</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {column.is_verified ? (
                        <Badge variant="success">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Unverified
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => verifyPIIColumn(column.id, !column.is_verified)}
                      >
                        {column.is_verified ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredColumns.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No PII Columns Found</h3>
            <p className="text-foreground-muted mb-4">
              {piiColumns.length === 0 
                ? "Run a scan to detect PII in your database tables"
                : "No columns match your current filters"
              }
            </p>
            {piiColumns.length === 0 && selectedDatabase && (
              <Button variant="primary" onClick={runPIIScan}>
                <Scan className="w-4 h-4 mr-2" />
                Run PII Scan
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}