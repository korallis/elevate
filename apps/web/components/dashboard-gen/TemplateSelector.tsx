'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/design-system';
import { 
  Template, 
  Sparkles, 
  ArrowRight, 
  CheckCircle, 
  Search,
  Filter,
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Shield,
  X
} from 'lucide-react';

interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  domain: string;
  widgetCount: number;
  preview: Array<{
    type: string;
    title: string;
  }>;
}

interface TemplateSelectorProps {
  templates: DashboardTemplate[];
  isVisible: boolean;
  onSelectTemplate: (template: DashboardTemplate) => void;
  onSkip: () => void;
  userPrompt: string;
  className?: string;
}

const domainIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'saas': TrendingUp,
  'ecommerce': ShoppingCart,
  'marketing': Users,
  'finance': DollarSign,
  'compliance': Shield,
  'default': BarChart3
};

const domainColors: Record<string, string> = {
  'saas': 'text-purple-500 bg-purple-500/10',
  'ecommerce': 'text-blue-500 bg-blue-500/10',
  'marketing': 'text-pink-500 bg-pink-500/10',
  'finance': 'text-green-500 bg-green-500/10',
  'compliance': 'text-orange-500 bg-orange-500/10',
  'default': 'text-primary bg-primary/10'
};

export function TemplateSelector({
  templates,
  isVisible,
  onSelectTemplate,
  onSkip,
  userPrompt,
  className = ''
}: TemplateSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');

  if (!isVisible) return null;

  // Get unique domains
  const domains = ['all', ...Array.from(new Set(templates.map(t => t.domain)))];

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.domain.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDomain = selectedDomain === 'all' || template.domain === selectedDomain;
    return matchesSearch && matchesDomain;
  });

  return (
    <div className={`template-selector ${className}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Template className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Choose a Template</h2>
        <p className="text-foreground-muted max-w-2xl mx-auto">
          We found some dashboard templates that might match your needs. 
          Select one to get started quickly, or skip to generate a custom dashboard.
        </p>
      </div>

      {/* User Prompt Context */}
      <div className="bg-card/30 rounded-lg p-4 mb-6">
        <div className="text-sm text-foreground-muted mb-2">Your request:</div>
        <div className="text-sm font-medium">"{userPrompt}"</div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-foreground-muted" />
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="px-3 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {domains.map(domain => (
              <option key={domain} value={domain}>
                {domain === 'all' ? 'All Domains' : domain.charAt(0).toUpperCase() + domain.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {filteredTemplates.map(template => {
          const IconComponent = domainIcons[template.domain] || domainIcons.default;
          const colorClasses = domainColors[template.domain] || domainColors.default;
          
          return (
            <div
              key={template.id}
              className="group bg-card border border-card-border rounded-xl p-6 hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer"
              onClick={() => onSelectTemplate(template)}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses.split(' ')[1]}`}>
                  <IconComponent className={`w-6 h-6 ${colorClasses.split(' ')[0]}`} />
                </div>
                <div className="text-xs text-foreground-muted">
                  {template.widgetCount} widgets
                </div>
              </div>

              {/* Content */}
              <div className="mb-4">
                <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                  {template.name}
                </h3>
                <p className="text-sm text-foreground-muted line-clamp-2">
                  {template.description}
                </p>
              </div>

              {/* Domain Tag */}
              <div className="flex items-center justify-between mb-4">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colorClasses}`}>
                  {template.domain.charAt(0).toUpperCase() + template.domain.slice(1)}
                </span>
              </div>

              {/* Widget Preview */}
              <div className="space-y-2">
                <div className="text-xs text-foreground-muted">Includes:</div>
                <div className="flex flex-wrap gap-1">
                  {template.preview.slice(0, 3).map((widget, index) => (
                    <span
                      key={index}
                      className="text-xs px-2 py-1 bg-background rounded text-foreground-muted"
                    >
                      {widget.title}
                    </span>
                  ))}
                  {template.preview.length > 3 && (
                    <span className="text-xs px-2 py-1 bg-background rounded text-foreground-muted">
                      +{template.preview.length - 3} more
                    </span>
                  )}
                </div>
              </div>

              {/* Hover Effect */}
              <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center text-sm text-primary font-medium">
                  Use this template
                  <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* No Results */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-card/30 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-foreground-muted" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No templates found</h3>
          <p className="text-foreground-muted mb-4">
            Try adjusting your search terms or select a different domain.
          </p>
          <Button variant="ghost" onClick={() => {
            setSearchTerm('');
            setSelectedDomain('all');
          }}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-4 pt-6 border-t border-card-border">
        <Button
          variant="ghost"
          onClick={onSkip}
          className="px-6"
        >
          Skip Templates
        </Button>
        
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <span>or</span>
        </div>
        
        <Button
          variant="primary"
          onClick={onSkip}
          className="px-6"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Generate Custom Dashboard
        </Button>
      </div>

      {/* Help Text */}
      <div className="text-center mt-4">
        <p className="text-xs text-foreground-muted">
          Templates provide a quick start with pre-configured widgets. 
          You can always customize them after creation.
        </p>
      </div>
    </div>
  );
}