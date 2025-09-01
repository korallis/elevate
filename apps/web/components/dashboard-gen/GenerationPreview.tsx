'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/design-system';
import { 
  Eye, 
  Save, 
  RefreshCw, 
  Info, 
  CheckCircle, 
  BarChart3,
  TrendingUp,
  Grid3X3,
  FileText,
  Filter,
  Map,
  PieChart,
  LineChart
} from 'lucide-react';

interface GeneratedDashboard {
  name: string;
  description: string;
  widgets: Array<{
    id: string;
    type: string;
    config: Record<string, unknown>;
    position: { x: number; y: number; w: number; h: number };
  }>;
  theme: Record<string, unknown>;
  layout: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

interface GenerationResult {
  dashboard: GeneratedDashboard;
  savedDashboard?: { id: string; name: string };
  metadata: {
    confidence: number;
    reasoning: string;
    generatedAt: string;
  };
}

interface GenerationPreviewProps {
  result: GenerationResult;
  onCreateDashboard: () => void;
  onStartOver: () => void;
  className?: string;
}

const widgetIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'line-chart': LineChart,
  'bar-chart': BarChart3,
  'pie-chart': PieChart,
  'metric': TrendingUp,
  'table': Grid3X3,
  'text': FileText,
  'filter': Filter,
  'map': Map
};

export function GenerationPreview({ 
  result, 
  onCreateDashboard, 
  onStartOver,
  className = '' 
}: GenerationPreviewProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const { dashboard, metadata } = result;

  const handleCreateDashboard = async () => {
    setIsCreating(true);
    try {
      await onCreateDashboard();
    } finally {
      setIsCreating(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <div className={`generation-preview ${className}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Dashboard Generated Successfully!</h2>
        <p className="text-foreground-muted">
          Review your AI-generated dashboard before creating it.
        </p>
      </div>

      {/* Dashboard Info Card */}
      <div className="bg-card border border-card-border rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold mb-2">{dashboard.name}</h3>
            <p className="text-foreground-muted mb-4">{dashboard.description}</p>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-primary" />
                <span className="text-sm">
                  {dashboard.widgets.length} widgets
                </span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className={`w-4 h-4 ${getConfidenceColor(metadata.confidence)}`} />
                <span className="text-sm">
                  {getConfidenceLabel(metadata.confidence)} confidence ({Math.round(metadata.confidence * 100)}%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-foreground-muted" />
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  {showDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Information */}
        {showDetails && (
          <div className="border-t border-card-border pt-4 mt-4 space-y-4">
            <div>
              <h4 className="font-medium mb-2">AI Reasoning</h4>
              <p className="text-sm text-foreground-muted bg-background/50 p-3 rounded-lg">
                {metadata.reasoning}
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Theme Configuration</h4>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: dashboard.theme.primary as string || '#8B5CF6' }}
                  />
                  Primary
                </span>
                <span className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: dashboard.theme.accent as string || '#10B981' }}
                  />
                  Accent
                </span>
                <span className="text-foreground-muted">
                  {dashboard.theme.preset || 'Custom'} theme
                </span>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Generation Details</h4>
              <div className="text-sm text-foreground-muted">
                Generated at: {new Date(metadata.generatedAt).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Widgets Preview */}
      <div className="bg-card border border-card-border rounded-xl p-6 mb-6">
        <h4 className="font-semibold mb-4">Dashboard Widgets</h4>
        
        <div className="grid gap-3">
          {dashboard.widgets.map((widget, index) => {
            const IconComponent = widgetIcons[widget.type] || Grid3X3;
            
            return (
              <div 
                key={widget.id}
                className="flex items-center gap-3 p-3 bg-background/50 rounded-lg"
              >
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <IconComponent className="w-4 h-4 text-primary" />
                </div>
                
                <div className="flex-1">
                  <div className="font-medium text-sm">
                    {widget.config.title as string || `${widget.type} Widget`}
                  </div>
                  <div className="text-xs text-foreground-muted">
                    {widget.type} • {widget.position.w}×{widget.position.h} grid units
                  </div>
                </div>
                
                <div className="text-xs text-foreground-muted">
                  Position ({widget.position.x}, {widget.position.y})
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Layout Preview */}
      <div className="bg-card border border-card-border rounded-xl p-6 mb-8">
        <h4 className="font-semibold mb-4">Layout Preview</h4>
        
        {/* Simplified visual layout */}
        <div className="bg-background/50 rounded-lg p-4 min-h-[200px]">
          <div 
            className="grid gap-2"
            style={{
              gridTemplateColumns: 'repeat(12, 1fr)',
              gridAutoRows: '40px'
            }}
          >
            {dashboard.widgets.map((widget, index) => {
              const IconComponent = widgetIcons[widget.type] || Grid3X3;
              
              return (
                <div
                  key={widget.id}
                  className="bg-primary/10 rounded border border-primary/20 flex items-center justify-center relative group"
                  style={{
                    gridColumn: `span ${widget.position.w}`,
                    gridRow: `span ${Math.ceil(widget.position.h / 2)}` // Adjust for preview scale
                  }}
                >
                  <IconComponent className="w-4 h-4 text-primary" />
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-background border border-card-border rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {widget.config.title as string || widget.type}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="flex items-center gap-4 mt-4 text-sm text-foreground-muted">
          <span>Layout: {dashboard.layout.style || 'Grid'}</span>
          <span>•</span>
          <span>Grid: 12 columns</span>
          <span>•</span>
          <span>Responsive: Yes</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          onClick={onStartOver}
          disabled={isCreating}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Start Over
        </Button>
        
        <Button
          variant="secondary"
          disabled={isCreating}
        >
          <Eye className="w-4 h-4 mr-2" />
          Preview Full Dashboard
        </Button>
        
        <Button
          variant="primary"
          onClick={handleCreateDashboard}
          disabled={isCreating}
          className="px-6"
        >
          {isCreating ? (
            <>
              <div className="w-4 h-4 mr-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Create Dashboard
            </>
          )}
        </Button>
      </div>

      {/* Confidence Warning */}
      {metadata.confidence < 0.6 && (
        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <h5 className="font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                Low Confidence Generation
              </h5>
              <p className="text-sm text-yellow-600 dark:text-yellow-300">
                The AI wasn't completely confident about this dashboard configuration. 
                You may want to review the widgets and layout before creating, or try 
                providing more specific requirements.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}