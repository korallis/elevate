'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Label } from '@sme/ui';

interface EmailScheduleFormData {
  name: string;
  description?: string;
  type: 'email';
  schedule: string;
  dashboardId: string;
  recipient: {
    email: string;
    name?: string;
  };
  config: {
    format: 'pdf' | 'png';
    includeCharts: boolean;
    highDPI?: boolean;
    watermark?: string;
    customMessage?: string;
    includeMetrics?: boolean;
  };
  templateConfig?: {
    subject?: string;
    message?: string;
    includeMetrics?: boolean;
  };
  enabled: boolean;
}

interface EmailScheduleFormProps {
  dashboardId?: string;
  schedule?: any;
  onSubmit: (data: EmailScheduleFormData) => void;
  onCancel: () => void;
  onTestNotification: (recipient: { email: string }) => void;
}

const CRON_PRESETS = [
  { label: 'Daily at 9:00 AM', value: '0 9 * * *' },
  { label: 'Weekly on Monday at 9:00 AM', value: '0 9 * * 1' },
  { label: 'Monthly on the 1st at 9:00 AM', value: '0 9 1 * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Custom', value: 'custom' },
];

export function EmailScheduleForm({
  dashboardId,
  schedule,
  onSubmit,
  onCancel,
  onTestNotification,
}: EmailScheduleFormProps) {
  const [formData, setFormData] = useState<EmailScheduleFormData>({
    name: '',
    description: '',
    type: 'email',
    schedule: '0 9 * * *', // Daily at 9 AM
    dashboardId: dashboardId || '',
    recipient: {
      email: '',
      name: '',
    },
    config: {
      format: 'pdf',
      includeCharts: true,
      highDPI: false,
      watermark: '',
      customMessage: '',
      includeMetrics: false,
    },
    templateConfig: {
      subject: '',
      message: '',
      includeMetrics: false,
    },
    enabled: true,
    ...schedule,
  });

  const [cronPreset, setCronPreset] = useState(() => {
    const preset = CRON_PRESETS.find(p => p.value === formData.schedule);
    return preset ? preset.value : 'custom';
  });

  const [isValidating, setIsValidating] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNestedChange = (section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev],
        [field]: value,
      },
    }));
  };

  const handleCronPresetChange = (preset: string) => {
    setCronPreset(preset);
    if (preset !== 'custom') {
      handleInputChange('schedule', preset);
      setCronError(null);
    }
  };

  const validateCronExpression = async (expression: string) => {
    if (!expression.trim()) {
      setCronError('Cron expression is required');
      return false;
    }

    try {
      setIsValidating(true);
      const response = await fetch('/api/scheduling/validate-cron', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expression }),
      });

      const result = await response.json();
      
      if (result.valid) {
        setCronError(null);
        return true;
      } else {
        setCronError(result.error || 'Invalid cron expression');
        return false;
      }
    } catch (error) {
      setCronError('Failed to validate cron expression');
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!formData.name.trim()) {
      alert('Schedule name is required');
      return;
    }

    if (!formData.recipient.email.trim()) {
      alert('Email address is required');
      return;
    }

    if (!formData.dashboardId.trim()) {
      alert('Dashboard ID is required');
      return;
    }

    // Validate cron expression
    const isValidCron = await validateCronExpression(formData.schedule);
    if (!isValidCron) {
      return;
    }

    onSubmit(formData);
  };

  const handleTestEmail = () => {
    if (!formData.recipient.email.trim()) {
      alert('Please enter an email address first');
      return;
    }

    onTestNotification({
      email: formData.recipient.email,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Schedule Name *</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g., Daily Sales Report"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="dashboardId">Dashboard ID *</Label>
            <Input
              id="dashboardId"
              type="text"
              value={formData.dashboardId}
              onChange={(e) => handleInputChange('dashboardId', e.target.value)}
              placeholder="Dashboard UUID"
              required
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.recipient.email}
              onChange={(e) => handleNestedChange('recipient', 'email', e.target.value)}
              placeholder="user@company.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="recipientName">Recipient Name</Label>
            <Input
              id="recipientName"
              type="text"
              value={formData.recipient.name || ''}
              onChange={(e) => handleNestedChange('recipient', 'name', e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="enabled"
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => handleInputChange('enabled', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="enabled">Enable Schedule</Label>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-4">Schedule Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="cronPreset">Schedule Frequency</Label>
            <select
              id="cronPreset"
              value={cronPreset}
              onChange={(e) => handleCronPresetChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {CRON_PRESETS.map(preset => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {cronPreset === 'custom' && (
            <div>
              <Label htmlFor="schedule">
                Cron Expression * 
                <span className="text-sm text-gray-500 ml-1">(minute hour day month weekday)</span>
              </Label>
              <Input
                id="schedule"
                type="text"
                value={formData.schedule}
                onChange={(e) => {
                  handleInputChange('schedule', e.target.value);
                  validateCronExpression(e.target.value);
                }}
                placeholder="0 9 * * *"
                className={cronError ? 'border-red-300' : ''}
              />
              {isValidating && (
                <p className="text-sm text-gray-500 mt-1">Validating...</p>
              )}
              {cronError && (
                <p className="text-sm text-red-600 mt-1">{cronError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-4">Export Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="format">Export Format</Label>
            <select
              id="format"
              value={formData.config.format}
              onChange={(e) => handleNestedChange('config', 'format', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="pdf">PDF</option>
              <option value="png">PNG Image</option>
            </select>
          </div>

          {formData.config.format === 'png' && (
            <div className="flex items-center space-x-2">
              <input
                id="highDPI"
                type="checkbox"
                checked={formData.config.highDPI || false}
                onChange={(e) => handleNestedChange('config', 'highDPI', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="highDPI">High DPI (2x resolution)</Label>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex items-center space-x-2">
            <input
              id="includeCharts"
              type="checkbox"
              checked={formData.config.includeCharts}
              onChange={(e) => handleNestedChange('config', 'includeCharts', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="includeCharts">Include Charts</Label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="includeMetrics"
              type="checkbox"
              checked={formData.config.includeMetrics}
              onChange={(e) => handleNestedChange('config', 'includeMetrics', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="includeMetrics">Include Metrics Summary</Label>
          </div>

          <div>
            <Label htmlFor="watermark">Watermark Text</Label>
            <Input
              id="watermark"
              type="text"
              value={formData.config.watermark || ''}
              onChange={(e) => handleNestedChange('config', 'watermark', e.target.value)}
              placeholder="CONFIDENTIAL"
            />
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-4">Email Template</h3>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="subject">Custom Subject</Label>
            <Input
              id="subject"
              type="text"
              value={formData.templateConfig?.subject || ''}
              onChange={(e) => handleNestedChange('templateConfig', 'subject', e.target.value)}
              placeholder="Leave empty for default subject"
            />
          </div>

          <div>
            <Label htmlFor="customMessage">Custom Message</Label>
            <textarea
              id="customMessage"
              value={formData.config.customMessage || ''}
              onChange={(e) => handleNestedChange('config', 'customMessage', e.target.value)}
              placeholder="Custom message to include in the email"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 border-t">
        <Button
          type="button"
          onClick={handleTestEmail}
          variant="outline"
          className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
        >
          Test Email
        </Button>
        
        <div className="flex gap-2">
          <Button type="button" onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button type="submit" disabled={isValidating}>
            {schedule ? 'Update Schedule' : 'Create Schedule'}
          </Button>
        </div>
      </div>
    </form>
  );
}