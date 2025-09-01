'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/design-system';
import { Palette, Monitor, Sun, Moon, Droplet, Zap, Leaf, X } from 'lucide-react';

export interface ThemeConfig {
  mode: 'light' | 'dark' | 'auto';
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  border: string;
  preset?: string;
}

export const themePresets = {
  elev8: {
    name: 'Elev8 Default',
    primary: 'hsl(252, 60%, 65%)',
    accent: 'hsl(163, 50%, 45%)',
    background: 'hsl(240, 10%, 3.9%)',
    surface: 'hsl(240, 10%, 12%)',
    text: 'hsl(0, 0%, 95%)',
    border: 'hsl(240, 10%, 20%)'
  },
  ocean: {
    name: 'Ocean Blue',
    primary: 'hsl(210, 100%, 60%)',
    accent: 'hsl(190, 100%, 50%)',
    background: 'hsl(220, 20%, 8%)',
    surface: 'hsl(220, 15%, 15%)',
    text: 'hsl(210, 20%, 95%)',
    border: 'hsl(220, 10%, 25%)'
  },
  forest: {
    name: 'Forest Green',
    primary: 'hsl(120, 60%, 50%)',
    accent: 'hsl(80, 70%, 60%)',
    background: 'hsl(120, 20%, 8%)',
    surface: 'hsl(120, 15%, 15%)',
    text: 'hsl(120, 20%, 95%)',
    border: 'hsl(120, 10%, 25%)'
  },
  sunset: {
    name: 'Sunset Orange',
    primary: 'hsl(30, 80%, 60%)',
    accent: 'hsl(350, 70%, 60%)',
    background: 'hsl(15, 20%, 8%)',
    surface: 'hsl(15, 15%, 15%)',
    text: 'hsl(30, 20%, 95%)',
    border: 'hsl(15, 10%, 25%)'
  },
  midnight: {
    name: 'Midnight Purple',
    primary: 'hsl(270, 60%, 60%)',
    accent: 'hsl(300, 70%, 60%)',
    background: 'hsl(240, 30%, 5%)',
    surface: 'hsl(250, 20%, 12%)',
    text: 'hsl(270, 20%, 95%)',
    border: 'hsl(250, 15%, 20%)'
  }
};

export interface DashboardThemeProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeConfig;
  onThemeChange: (theme: ThemeConfig) => void;
}

export function DashboardTheme({ isOpen, onClose, theme, onThemeChange }: DashboardThemeProps) {
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');

  if (!isOpen) return null;

  const applyPreset = (presetKey: string) => {
    const preset = themePresets[presetKey as keyof typeof themePresets];
    if (preset) {
      onThemeChange({
        ...theme,
        ...preset,
        preset: presetKey
      });
    }
  };

  const updateCustomColor = (key: keyof ThemeConfig, value: string) => {
    onThemeChange({
      ...theme,
      [key]: value,
      preset: undefined // Clear preset when custom changes are made
    });
  };

  const tabs = [
    { id: 'presets' as const, name: 'Presets', icon: Palette },
    { id: 'custom' as const, name: 'Custom', icon: Droplet },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card/95 backdrop-blur-sm border border-card-border rounded-xl shadow-xl max-h-[90vh] overflow-hidden">
        <div className="flex flex-col h-full max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-card-border">
            <h2 className="text-xl font-semibold">Dashboard Theme</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Mode Selector */}
          <div className="p-4 border-b border-card-border bg-background/20">
            <label className="block text-sm font-medium mb-3">Theme Mode</label>
            <div className="flex gap-2">
              {[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'auto', label: 'Auto', icon: Monitor }
              ].map(mode => (
                <Button
                  key={mode.value}
                  variant={theme.mode === mode.value ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => onThemeChange({ ...theme, mode: mode.value as ThemeConfig['mode'] })}
                >
                  <mode.icon className="w-4 h-4 mr-2" />
                  {mode.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-card-border bg-background/50">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors flex-1 justify-center ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-foreground-muted hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.name}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'presets' && (
              <div className="space-y-3">
                {Object.entries(themePresets).map(([key, preset]) => (
                  <div
                    key={key}
                    className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                      theme.preset === key
                        ? 'border-primary bg-primary/5'
                        : 'border-card-border bg-background/50 hover:border-card-border/50'
                    }`}
                    onClick={() => applyPreset(key)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium">{preset.name}</h3>
                      <div className="flex gap-1">
                        <div 
                          className="w-4 h-4 rounded-full border border-card-border"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <div 
                          className="w-4 h-4 rounded-full border border-card-border"
                          style={{ backgroundColor: preset.accent }}
                        />
                        <div 
                          className="w-4 h-4 rounded-full border border-card-border"
                          style={{ backgroundColor: preset.surface }}
                        />
                      </div>
                    </div>
                    
                    {/* Preview */}
                    <div 
                      className="rounded border p-3 text-sm"
                      style={{ 
                        backgroundColor: preset.surface,
                        borderColor: preset.border,
                        color: preset.text
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span style={{ color: preset.primary }}>Sample Widget</span>
                        <span style={{ color: preset.accent }}>📊</span>
                      </div>
                      <div className="text-xs opacity-70">
                        This is how your dashboard will look
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'custom' && (
              <div className="space-y-4">
                <div className="text-sm text-foreground-muted mb-4">
                  Customize individual colors for your dashboard theme.
                </div>
                
                {[
                  { key: 'primary' as const, label: 'Primary Color', description: 'Main accent color' },
                  { key: 'accent' as const, label: 'Accent Color', description: 'Secondary accent' },
                  { key: 'background' as const, label: 'Background', description: 'Main background' },
                  { key: 'surface' as const, label: 'Surface', description: 'Card backgrounds' },
                  { key: 'text' as const, label: 'Text Color', description: 'Primary text' },
                  { key: 'border' as const, label: 'Border Color', description: 'Element borders' }
                ].map(({ key, label, description }) => (
                  <div key={key} className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">{label}</label>
                      <p className="text-xs text-foreground-muted">{description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme[key] as string || '#000000'}
                        onChange={(e) => updateCustomColor(key, e.target.value)}
                        className="w-10 h-10 bg-background border border-card-border rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme[key] as string || ''}
                        onChange={(e) => updateCustomColor(key, e.target.value)}
                        className="w-32 px-3 py-2 text-sm bg-background border border-card-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                        placeholder="hsl(0, 0%, 0%)"
                      />
                    </div>
                  </div>
                ))}

                {/* Preview */}
                <div className="mt-6 p-4 border border-card-border rounded-lg">
                  <h4 className="text-sm font-medium mb-3">Preview</h4>
                  <div 
                    className="rounded border p-4"
                    style={{ 
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h5 style={{ color: theme.primary }} className="font-medium">
                        Sample Dashboard Widget
                      </h5>
                      <span style={{ color: theme.accent }}>📈</span>
                    </div>
                    <div className="text-sm opacity-80 mb-2">
                      Revenue Growth: +24.5%
                    </div>
                    <div className="flex gap-2 mt-3">
                      <div 
                        className="px-3 py-1 rounded text-xs"
                        style={{ backgroundColor: theme.primary, color: theme.surface }}
                      >
                        Primary Action
                      </div>
                      <div 
                        className="px-3 py-1 rounded text-xs"
                        style={{ 
                          backgroundColor: 'transparent', 
                          color: theme.accent,
                          border: `1px solid ${theme.accent}`
                        }}
                      >
                        Secondary
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-card-border bg-background/50">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onClose}>
              Apply Theme
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}