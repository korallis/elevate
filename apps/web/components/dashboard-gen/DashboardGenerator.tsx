'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/design-system';
import { PromptInput } from './PromptInput';
import { GenerationPreview } from './GenerationPreview';
import { TemplateSelector } from './TemplateSelector';
import { 
  Wand2, 
  Sparkles, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  RefreshCw
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

export interface DashboardGeneratorProps {
  onDashboardGenerated?: (result: GenerationResult) => void;
  onDashboardCreated?: (dashboardId: string) => void;
  availableTables?: string[];
  availableMetrics?: string[];
  className?: string;
}

type GenerationStep = 'input' | 'template-selection' | 'generating' | 'preview' | 'completed' | 'error';

export function DashboardGenerator({
  onDashboardGenerated,
  onDashboardCreated,
  availableTables = [],
  availableMetrics = [],
  className = ''
}: DashboardGeneratorProps) {
  const [currentStep, setCurrentStep] = useState<GenerationStep>('input');
  const [prompt, setPrompt] = useState('');
  const [userPreferences, setUserPreferences] = useState({
    theme: 'dark',
    chartTypes: [] as string[],
    layout: 'grid' as 'compact' | 'spacious' | 'grid'
  });
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const handlePromptSubmit = useCallback(async (submittedPrompt: string, preferences: typeof userPreferences) => {
    setPrompt(submittedPrompt);
    setUserPreferences(preferences);
    setError(null);
    
    // First, try to find matching templates
    try {
      const response = await fetch('/api/dashboard-gen/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
        
        // Show template selection if we have templates
        if (data.templates && data.templates.length > 0) {
          setCurrentStep('template-selection');
          setShowTemplates(true);
          return;
        }
      }
    } catch (templateError) {
      console.warn('Failed to load templates, proceeding with AI generation');
    }
    
    // If no templates or template loading failed, proceed with AI generation
    await generateDashboard(submittedPrompt, preferences);
  }, [availableTables, availableMetrics]);

  const handleTemplateSelect = useCallback(async (template: DashboardTemplate) => {
    setSelectedTemplate(template);
    setShowTemplates(false);
    
    try {
      setCurrentStep('generating');
      setIsGenerating(true);
      
      const response = await fetch(`/api/dashboard-gen/templates/${template.id}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} Dashboard`,
          customizations: { userPrompt: prompt }
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create dashboard from template');
      }
      
      const result = await response.json();
      
      // Convert template result to GenerationResult format
      const generationResult: GenerationResult = {
        dashboard: {
          name: result.dashboard.name,
          description: result.dashboard.description || template.description,
          widgets: [], // Will be populated by the template
          theme: JSON.parse(result.dashboard.theme || '{}'),
          layout: JSON.parse(result.dashboard.layout || '{}'),
          confidence: 0.95, // High confidence for templates
          reasoning: `Created from ${template.name} template`
        },
        savedDashboard: result.dashboard,
        metadata: {
          confidence: 0.95,
          reasoning: `Created from ${template.name} template`,
          generatedAt: new Date().toISOString()
        }
      };
      
      setGenerationResult(generationResult);
      setCurrentStep('completed');
      
      onDashboardGenerated?.(generationResult);
      onDashboardCreated?.(result.dashboard.id);
      
    } catch (templateError) {
      console.error('Template creation failed:', templateError);
      setError('Failed to create dashboard from template');
      setCurrentStep('error');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, onDashboardGenerated, onDashboardCreated]);

  const handleSkipTemplates = useCallback(async () => {
    setShowTemplates(false);
    await generateDashboard(prompt, userPreferences);
  }, [prompt, userPreferences]);

  const generateDashboard = useCallback(async (submittedPrompt: string, preferences: typeof userPreferences) => {
    try {
      setCurrentStep('generating');
      setIsGenerating(true);
      setError(null);

      const response = await fetch('/api/dashboard-gen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: submittedPrompt,
          availableTables,
          availableMetrics,
          userPreferences: preferences
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Generation failed');
      }

      const result: GenerationResult = await response.json();
      
      setGenerationResult(result);
      setCurrentStep('preview');
      
      onDashboardGenerated?.(result);

    } catch (genError) {
      console.error('Dashboard generation failed:', genError);
      setError(String(genError));
      setCurrentStep('error');
    } finally {
      setIsGenerating(false);
    }
  }, [availableTables, availableMetrics, onDashboardGenerated]);

  const handleCreateDashboard = useCallback(() => {
    if (generationResult?.savedDashboard?.id) {
      onDashboardCreated?.(generationResult.savedDashboard.id);
      setCurrentStep('completed');
    }
  }, [generationResult, onDashboardCreated]);

  const handleStartOver = useCallback(() => {
    setCurrentStep('input');
    setPrompt('');
    setGenerationResult(null);
    setError(null);
    setSelectedTemplate(null);
    setShowTemplates(false);
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 'input':
        return (
          <PromptInput
            onSubmit={handlePromptSubmit}
            availableTables={availableTables}
            availableMetrics={availableMetrics}
            className="max-w-2xl mx-auto"
          />
        );
      
      case 'template-selection':
        return (
          <TemplateSelector
            templates={templates}
            isVisible={showTemplates}
            onSelectTemplate={handleTemplateSelect}
            onSkip={handleSkipTemplates}
            userPrompt={prompt}
            className="max-w-4xl mx-auto"
          />
        );
      
      case 'generating':
        return (
          <div className="text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-6">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Generating Your Dashboard</h3>
            <p className="text-foreground-muted mb-6">
              {selectedTemplate 
                ? `Creating dashboard from ${selectedTemplate.name} template...`
                : 'AI is analyzing your requirements and creating the perfect dashboard...'
              }
            </p>
            <div className="space-y-2 text-sm text-foreground-muted">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Analyzing requirements
              </div>
              {!selectedTemplate && (
                <>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
                    Suggesting widgets
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-foreground-muted" />
                    Optimizing layout
                  </div>
                </>
              )}
            </div>
          </div>
        );
      
      case 'preview':
        return generationResult && (
          <GenerationPreview
            result={generationResult}
            onCreateDashboard={handleCreateDashboard}
            onStartOver={handleStartOver}
            className="max-w-6xl mx-auto"
          />
        );
      
      case 'completed':
        return (
          <div className="text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-green-500/10 rounded-xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Dashboard Created!</h3>
            <p className="text-foreground-muted mb-6">
              Your dashboard has been successfully created and saved.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="primary" onClick={handleStartOver}>
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Another
              </Button>
            </div>
          </div>
        );
      
      case 'error':
        return (
          <div className="text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Generation Failed</h3>
            <p className="text-foreground-muted mb-6">
              {error || 'An error occurred while generating your dashboard.'}
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="ghost" onClick={handleStartOver}>
                Start Over
              </Button>
              <Button 
                variant="primary" 
                onClick={() => generateDashboard(prompt, userPreferences)}
                disabled={isGenerating}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                Try Again
              </Button>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className={`dashboard-generator ${className}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2">AI Dashboard Generator</h1>
        <p className="text-xl text-foreground-muted max-w-2xl mx-auto">
          Create powerful analytics dashboards instantly with AI. 
          Just describe what you need, and we'll build it for you.
        </p>
      </div>

      {/* Step Content */}
      <div className="min-h-[400px] flex items-center justify-center">
        {renderStepContent()}
      </div>

      {/* Progress Indicator */}
      {currentStep !== 'input' && currentStep !== 'error' && (
        <div className="mt-8 max-w-md mx-auto">
          <div className="flex items-center justify-between text-sm text-foreground-muted mb-2">
            <span>Progress</span>
            <span>{currentStep === 'completed' ? '100%' : currentStep === 'generating' ? '50%' : '75%'}</span>
          </div>
          <div className="w-full bg-card-border rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ 
                width: currentStep === 'completed' ? '100%' : 
                       currentStep === 'generating' ? '50%' : 
                       currentStep === 'preview' ? '75%' : '25%' 
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}