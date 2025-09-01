'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/design-system';
import { 
  Send, 
  Lightbulb, 
  Database, 
  TrendingUp, 
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface PromptInputProps {
  onSubmit: (prompt: string, preferences: UserPreferences) => void;
  availableTables?: string[];
  availableMetrics?: string[];
  className?: string;
}

interface UserPreferences {
  theme: string;
  chartTypes: string[];
  layout: 'compact' | 'spacious' | 'grid';
}

export function PromptInput({ 
  onSubmit, 
  availableTables = [], 
  availableMetrics = [],
  className = '' 
}: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [preferences, setPreferences] = useState<UserPreferences>({
    theme: 'dark',
    chartTypes: [],
    layout: 'grid'
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const examplePrompts = [
    "Create a SaaS metrics dashboard showing MRR, churn rate, and customer acquisition",
    "Build an e-commerce analytics dashboard with sales, conversion rates, and top products",
    "Generate a financial dashboard tracking revenue, expenses, and profit margins",
    "Design a marketing performance dashboard with campaign metrics and ROI",
    "Create an operational dashboard showing KPIs, inventory, and performance metrics"
  ];

  const chartTypeOptions = [
    { id: 'line-chart', name: 'Line Charts', description: 'Trends over time' },
    { id: 'bar-chart', name: 'Bar Charts', description: 'Category comparisons' },
    { id: 'pie-chart', name: 'Pie Charts', description: 'Proportional data' },
    { id: 'metric', name: 'KPI Cards', description: 'Key metrics' },
    { id: 'table', name: 'Data Tables', description: 'Detailed data' }
  ];

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(prompt.trim(), preferences);
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, preferences, onSubmit, isSubmitting]);

  const handleExampleClick = useCallback((example: string) => {
    setPrompt(example);
  }, []);

  const handleChartTypeToggle = useCallback((chartType: string) => {
    setPreferences(prev => ({
      ...prev,
      chartTypes: prev.chartTypes.includes(chartType)
        ? prev.chartTypes.filter(t => t !== chartType)
        : [...prev.chartTypes, chartType]
    }));
  }, []);

  return (
    <div className={`prompt-input ${className}`}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Prompt Input */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground">
            What kind of dashboard would you like to create?
          </label>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the dashboard you need. For example: 'Create a sales dashboard showing monthly revenue, top customers, and conversion rates by channel...'"
              className="w-full h-32 px-4 py-3 bg-background border border-card-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-foreground-muted"
              disabled={isSubmitting}
            />
            <div className="absolute bottom-3 right-3 text-xs text-foreground-muted">
              {prompt.length}/1000
            </div>
          </div>
        </div>

        {/* Context Information */}
        {(availableTables.length > 0 || availableMetrics.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4 p-4 bg-card/30 rounded-lg">
            {availableTables.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Database className="w-4 h-4" />
                  Available Tables
                </div>
                <div className="flex flex-wrap gap-1">
                  {availableTables.slice(0, 5).map(table => (
                    <span
                      key={table}
                      className="px-2 py-1 text-xs bg-primary/10 text-primary rounded cursor-pointer hover:bg-primary/20 transition-colors"
                      onClick={() => setPrompt(prev => prev + (prev ? ' ' : '') + table)}
                    >
                      {table}
                    </span>
                  ))}
                  {availableTables.length > 5 && (
                    <span className="px-2 py-1 text-xs text-foreground-muted">
                      +{availableTables.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {availableMetrics.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <TrendingUp className="w-4 h-4" />
                  Available Metrics
                </div>
                <div className="flex flex-wrap gap-1">
                  {availableMetrics.slice(0, 5).map(metric => (
                    <span
                      key={metric}
                      className="px-2 py-1 text-xs bg-accent/10 text-accent rounded cursor-pointer hover:bg-accent/20 transition-colors"
                      onClick={() => setPrompt(prev => prev + (prev ? ' ' : '') + metric)}
                    >
                      {metric}
                    </span>
                  ))}
                  {availableMetrics.length > 5 && (
                    <span className="px-2 py-1 text-xs text-foreground-muted">
                      +{availableMetrics.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Example Prompts */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Lightbulb className="w-4 h-4" />
            Need inspiration? Try these examples:
          </div>
          <div className="grid gap-2">
            {examplePrompts.map((example, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleExampleClick(example)}
                className="text-left p-3 text-sm bg-card/30 hover:bg-card/50 rounded-lg transition-colors border border-transparent hover:border-card-border"
                disabled={isSubmitting}
              >
                "{example}"
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Preferences */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            <Settings className="w-4 h-4" />
            Advanced Preferences
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="p-4 bg-card/30 rounded-lg space-y-4">
              {/* Layout Style */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Layout Style</label>
                <div className="flex gap-2">
                  {(['grid', 'compact', 'spacious'] as const).map(layout => (
                    <button
                      key={layout}
                      type="button"
                      onClick={() => setPreferences(prev => ({ ...prev, layout }))}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        preferences.layout === layout
                          ? 'bg-primary text-white border-primary'
                          : 'bg-background border-card-border hover:border-primary/50'
                      }`}
                    >
                      {layout.charAt(0).toUpperCase() + layout.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart Type Preferences */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Preferred Chart Types (optional)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {chartTypeOptions.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleChartTypeToggle(option.id)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        preferences.chartTypes.includes(option.id)
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-background border-card-border hover:border-card-border/50'
                      }`}
                    >
                      <div className="font-medium">{option.name}</div>
                      <div className="text-xs text-foreground-muted">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Theme</label>
                <div className="flex gap-2">
                  {(['dark', 'light'] as const).map(theme => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => setPreferences(prev => ({ ...prev, theme }))}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        preferences.theme === theme
                          ? 'bg-primary text-white border-primary'
                          : 'bg-background border-card-border hover:border-primary/50'
                      }`}
                    >
                      {theme.charAt(0).toUpperCase() + theme.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-center">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!prompt.trim() || isSubmitting}
            className="px-8 py-3"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 mr-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating Dashboard...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-3" />
                Generate Dashboard
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}