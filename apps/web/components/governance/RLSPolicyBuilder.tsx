'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Card, Input, Badge } from '@/components/ui/design-system';
import { API_BASE } from '@/lib/api';
import { 
  Shield,
  Lock,
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Code,
  Users,
  Building,
  Clock,
  Globe,
  Eye,
  PlayCircle,
  Copy,
  Download,
  RefreshCw,
  Lightbulb,
  Settings,
  X,
  Search,
  Filter
} from 'lucide-react';

// Types for RLS Policy management
interface RLSPolicy {
  id: number;
  name: string;
  description: string;
  database_name: string;
  schema_name: string;
  table_name: string;
  filter_expression: string;
  policy_type: 'restrictive' | 'permissive';
  is_enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface PolicyTemplate {
  name: string;
  description: string;
  category: string;
  filter_expression_template: string;
  parameters: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'list';
    description: string;
    required: boolean;
    default_value?: unknown;
  }>;
}

interface PolicySuggestion {
  template_name: string;
  relevance_score: number;
  suggested_parameters: Record<string, unknown>;
  reasoning: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface PolicyImpact {
  estimated_row_reduction: number;
  performance_impact: 'low' | 'medium' | 'high';
  warnings: string[];
}

export function RLSPolicyBuilder() {
  const [policies, setPolicies] = useState<RLSPolicy[]>([]);
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [suggestions, setSuggestions] = useState<PolicySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<RLSPolicy | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PolicyTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [databases, setDatabases] = useState<{ NAME: string }[]>([]);

  // Form state for policy creation/editing
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    database_name: '',
    schema_name: '',
    table_name: '',
    filter_expression: '',
    policy_type: 'restrictive' as 'restrictive' | 'permissive',
    template_parameters: {} as Record<string, unknown>
  });

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [impact, setImpact] = useState<PolicyImpact | null>(null);

  useEffect(() => {
    loadPolicies();
    loadTemplates();
    loadDatabases();
  }, []);

  const loadPolicies = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/governance/rls/policies`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPolicies(data.policies || []);
      }
    } catch (error) {
      console.error('Failed to load RLS policies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch(`${API_BASE}/governance/rls/templates`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadDatabases = async () => {
    try {
      const response = await fetch(`${API_BASE}/snowflake/databases`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
        },
      });
      if (response.ok) {
        const data = await response.json();
        setDatabases(data || []);
      }
    } catch (error) {
      console.error('Failed to load databases:', error);
    }
  };

  const loadSuggestions = async (database: string, schema: string, table: string) => {
    try {
      const response = await fetch(
        `${API_BASE}/governance/rls/suggestions?database_name=${database}&schema_name=${schema}&table_name=${table}`,
        {
          headers: { 
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}` 
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const validateExpression = async (expression: string) => {
    if (!expression.trim()) {
      setValidation(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/governance/rls/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ filter_expression: expression })
      });

      if (response.ok) {
        const result = await response.json();
        setValidation(result);
      }
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const previewImpact = async (expression: string, database: string, schema: string, table: string) => {
    if (!expression.trim() || !database || !schema || !table) {
      setImpact(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/governance/rls/preview-impact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          filter_expression: expression,
          database_name: database,
          schema_name: schema,
          table_name: table
        })
      });

      if (response.ok) {
        const result = await response.json();
        setImpact(result);
      }
    } catch (error) {
      console.error('Impact preview failed:', error);
    }
  };

  const createPolicy = async () => {
    try {
      const response = await fetch(`${API_BASE}/governance/rls/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await loadPolicies();
        resetForm();
        setShowCreateForm(false);
      }
    } catch (error) {
      console.error('Failed to create policy:', error);
    }
  };

  const updatePolicy = async (policyId: number, updates: Partial<RLSPolicy>) => {
    try {
      const response = await fetch(`${API_BASE}/governance/rls/policies/${policyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        setPolicies(prev => prev.map(policy => 
          policy.id === policyId ? { ...policy, ...updates } : policy
        ));
      }
    } catch (error) {
      console.error('Failed to update policy:', error);
    }
  };

  const deletePolicy = async (policyId: number) => {
    if (!confirm('Are you sure you want to delete this policy?')) return;

    try {
      const response = await fetch(`${API_BASE}/governance/rls/policies/${policyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (response.ok) {
        setPolicies(prev => prev.filter(policy => policy.id !== policyId));
      }
    } catch (error) {
      console.error('Failed to delete policy:', error);
    }
  };

  const buildFromTemplate = async (templateName: string, parameters: Record<string, unknown>) => {
    try {
      const response = await fetch(`${API_BASE}/governance/rls/build-from-template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          template_name: templateName,
          parameters,
          custom_name: formData.name
        })
      });

      if (response.ok) {
        const result = await response.json();
        setFormData(prev => ({
          ...prev,
          filter_expression: result.filter_expression,
          description: result.description
        }));
        setValidation(result.validation);
        setShowTemplateSelector(false);
      }
    } catch (error) {
      console.error('Failed to build from template:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      database_name: '',
      schema_name: '',
      table_name: '',
      filter_expression: '',
      policy_type: 'restrictive',
      template_parameters: {}
    });
    setValidation(null);
    setImpact(null);
    setSelectedTemplate(null);
  };

  const filteredPolicies = policies.filter(policy => {
    const matchesSearch = !searchQuery || 
      policy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      policy.table_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      policy.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, PolicyTemplate[]>);

  const getCategoryIcon = (category: string) => {
    const icons = {
      'organizational': Building,
      'ownership': Users,
      'role': Shield,
      'geographic': Globe,
      'temporal': Clock,
      'customer': Users,
      'privacy': Lock,
      'tenant': Building,
      'compliance': CheckCircle2
    } as const;
    return icons[category as keyof typeof icons] || Shield;
  };

  const getPerformanceImpactColor = (impact: 'low' | 'medium' | 'high') => {
    return {
      low: 'text-success',
      medium: 'text-warning',
      high: 'text-destructive'
    }[impact];
  };

  return (
    <div className="rls-policy-builder space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Row-Level Security Policies</h1>
          <p className="text-foreground-muted mt-1">
            Configure data access policies to enforce fine-grained security controls
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowTemplateSelector(true)}
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            Browse Templates
          </Button>
          <Button 
            variant="primary" 
            size="sm"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Policy
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card variant="default" padding="md">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground-muted" />
            <Input
              placeholder="Search policies by name, table, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-4 h-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Policies List */}
      <Card variant="default" padding="none">
        <div className="p-6 border-b border-card-border">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Active Policies</h3>
            <div className="flex items-center gap-4 text-sm text-foreground-muted">
              <span>{filteredPolicies.length} of {policies.length} policies</span>
              <span>{policies.filter(p => p.is_enabled).length} enabled</span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-card-border">
          {filteredPolicies.map((policy) => (
            <div key={policy.id} className="p-6 hover:bg-card/20">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-lg">{policy.name}</h4>
                    <Badge 
                      variant={policy.is_enabled ? 'success' : 'outline'}
                    >
                      {policy.is_enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Badge 
                      variant={policy.policy_type === 'restrictive' ? 'destructive' : 'success'}
                    >
                      {policy.policy_type}
                    </Badge>
                  </div>
                  
                  <p className="text-foreground-muted mb-3">{policy.description}</p>
                  
                  <div className="flex items-center gap-4 text-sm text-foreground-muted mb-4">
                    <span className="flex items-center gap-1">
                      <Building className="w-3 h-3" />
                      {policy.database_name}.{policy.schema_name}.{policy.table_name}
                    </span>
                    <span>
                      Updated {new Date(policy.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="bg-card/30 rounded-lg p-3 font-mono text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Code className="w-3 h-3" />
                      <span className="text-xs font-medium text-foreground-muted">FILTER EXPRESSION</span>
                    </div>
                    {policy.filter_expression}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updatePolicy(policy.id, { is_enabled: !policy.is_enabled })}
                  >
                    {policy.is_enabled ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <PlayCircle className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedPolicy(policy);
                      setFormData({
                        name: policy.name,
                        description: policy.description,
                        database_name: policy.database_name,
                        schema_name: policy.schema_name,
                        table_name: policy.table_name,
                        filter_expression: policy.filter_expression,
                        policy_type: policy.policy_type,
                        template_parameters: {}
                      });
                      setShowCreateForm(true);
                    }}
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePolicy(policy.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredPolicies.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Policies Found</h3>
            <p className="text-foreground-muted mb-4">
              {policies.length === 0 
                ? "Create your first RLS policy to start securing your data"
                : "No policies match your current search"
              }
            </p>
            <Button variant="primary" onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Policy
            </Button>
          </div>
        )}
      </Card>

      {/* Create/Edit Policy Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card variant="elevated" padding="none" className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-card-border">
              <h3 className="text-lg font-medium">
                {selectedPolicy ? 'Edit Policy' : 'Create New Policy'}
              </h3>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Policy Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Department Access Policy"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Policy Type</label>
                  <select
                    value={formData.policy_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, policy_type: e.target.value as any }))}
                    className="w-full h-11 px-4 text-base rounded-lg border border-border bg-background/50"
                  >
                    <option value="restrictive">Restrictive</option>
                    <option value="permissive">Permissive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this policy controls..."
                  className="w-full h-20 px-4 py-2 text-base rounded-lg border border-border bg-background/50 resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Database</label>
                  <select
                    value={formData.database_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, database_name: e.target.value }))}
                    className="w-full h-11 px-4 text-base rounded-lg border border-border bg-background/50"
                  >
                    <option value="">Select database</option>
                    {databases.map(db => (
                      <option key={db.NAME} value={db.NAME}>{db.NAME}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Schema</label>
                  <Input
                    value={formData.schema_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, schema_name: e.target.value }))}
                    placeholder="Schema name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Table</label>
                  <Input
                    value={formData.table_name}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, table_name: e.target.value }));
                      if (e.target.value && formData.database_name && formData.schema_name) {
                        loadSuggestions(formData.database_name, formData.schema_name, e.target.value);
                      }
                    }}
                    placeholder="Table name"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Filter Expression</label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTemplateSelector(true)}
                    >
                      <Lightbulb className="w-4 h-4 mr-2" />
                      Use Template
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => validateExpression(formData.filter_expression)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Validate
                    </Button>
                  </div>
                </div>
                <textarea
                  value={formData.filter_expression}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, filter_expression: e.target.value }));
                    validateExpression(e.target.value);
                    if (formData.database_name && formData.schema_name && formData.table_name) {
                      previewImpact(e.target.value, formData.database_name, formData.schema_name, formData.table_name);
                    }
                  }}
                  placeholder="e.g., department_id = current_user_department()"
                  className="w-full h-32 px-4 py-2 text-base rounded-lg border border-border bg-background/50 font-mono resize-none"
                />
              </div>

              {/* Validation Results */}
              {validation && (
                <Card 
                  variant={validation.valid ? 'default' : 'elevated'} 
                  padding="md"
                  className={validation.valid ? 'border-success' : 'border-destructive'}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {validation.valid ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                    )}
                    <h4 className="font-medium">
                      {validation.valid ? 'Expression Valid' : 'Validation Errors'}
                    </h4>
                  </div>
                  
                  {validation.errors.map((error, index) => (
                    <p key={index} className="text-sm text-destructive mb-1">{error}</p>
                  ))}
                  
                  {validation.warnings.map((warning, index) => (
                    <p key={index} className="text-sm text-warning mb-1">{warning}</p>
                  ))}
                </Card>
              )}

              {/* Impact Preview */}
              {impact && (
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-5 h-5 text-primary" />
                    <h4 className="font-medium">Policy Impact Preview</h4>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div>
                      <span className="text-sm text-foreground-muted">Est. Row Reduction</span>
                      <p className="text-lg font-medium">{impact.estimated_row_reduction}%</p>
                    </div>
                    <div>
                      <span className="text-sm text-foreground-muted">Performance Impact</span>
                      <p className={`text-lg font-medium ${getPerformanceImpactColor(impact.performance_impact)}`}>
                        {impact.performance_impact.charAt(0).toUpperCase() + impact.performance_impact.slice(1)}
                      </p>
                    </div>
                  </div>
                  
                  {impact.warnings.map((warning, index) => (
                    <p key={index} className="text-sm text-warning">{warning}</p>
                  ))}
                </Card>
              )}

              {/* Policy Suggestions */}
              {suggestions.length > 0 && (
                <Card variant="premium" padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-5 h-5 text-primary" />
                    <h4 className="font-medium">Suggested Policies for this Table</h4>
                  </div>
                  
                  <div className="space-y-3">
                    {suggestions.slice(0, 3).map((suggestion, index) => (
                      <div key={index} className="p-3 border border-card-border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{suggestion.template_name}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="default">
                              {(suggestion.relevance_score * 100).toFixed(0)}% match
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const template = templates.find(t => t.name === suggestion.template_name);
                                if (template) {
                                  buildFromTemplate(template.name, suggestion.suggested_parameters);
                                }
                              }}
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Use
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-foreground-muted">{suggestion.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            <div className="p-6 border-t border-card-border flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowCreateForm(false);
                setSelectedPolicy(null);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                onClick={createPolicy}
                disabled={!formData.name || !formData.filter_expression || !validation?.valid}
              >
                {selectedPolicy ? 'Update Policy' : 'Create Policy'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card variant="elevated" padding="none" className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-card-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Policy Templates</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowTemplateSelector(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-6">
                {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => {
                  const Icon = getCategoryIcon(category);
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-4">
                        <Icon className="w-5 h-5 text-primary" />
                        <h4 className="text-lg font-medium capitalize">{category}</h4>
                        <Badge variant="outline">{categoryTemplates.length}</Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {categoryTemplates.map((template) => (
                          <Card 
                            key={template.name} 
                            variant="default" 
                            padding="md"
                            className="cursor-pointer hover:border-primary/50"
                            onClick={() => {
                              setSelectedTemplate(template);
                              setFormData(prev => ({
                                ...prev,
                                name: template.name,
                                description: template.description
                              }));
                            }}
                          >
                            <h5 className="font-medium mb-2">{template.name}</h5>
                            <p className="text-sm text-foreground-muted mb-3">{template.description}</p>
                            
                            <div className="bg-card/30 rounded p-2 mb-3">
                              <code className="text-xs">{template.filter_expression_template}</code>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {template.parameters.length} parameters
                              </Badge>
                              <Button variant="primary" size="sm">
                                Select Template
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}