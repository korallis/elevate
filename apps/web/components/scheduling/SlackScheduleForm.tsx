'use client';

import { useState } from 'react';
import { Button, Input, Label } from '@sme/ui';

interface SlackScheduleFormData {
  name: string;
  description?: string;
  type: 'slack';
  schedule: string;
  dashboardId: string;
  recipient: {
    channel?: string;
    user?: string;
  };
  config: {
    format: 'pdf' | 'png';
    includeCharts: boolean;
    highDPI?: boolean;
    customMessage?: string;
    includeMetrics?: boolean;
    mentionUsers?: string[];
  };
  templateConfig?: {
    message?: string;
    includeMetrics?: boolean;
  };
  enabled: boolean;
}

interface SlackScheduleFormProps {
  dashboardId?: string;
  schedule?: any;
  onSubmit: (data: SlackScheduleFormData) => void;
  onCancel: () => void;
  onTestNotification: (recipient: { channel?: string; user?: string }) => void;
}

const CRON_PRESETS = [
  { label: 'Daily at 9:00 AM', value: '0 9 * * *' },
  { label: 'Weekly on Monday at 9:00 AM', value: '0 9 * * 1' },
  { label: 'Monthly on the 1st at 9:00 AM', value: '0 9 1 * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Custom', value: 'custom' },
];

export function SlackScheduleForm({
  dashboardId,
  schedule,
  onSubmit,
  onCancel,
  onTestNotification,
}: SlackScheduleFormProps) {
  const [formData, setFormData] = useState<SlackScheduleFormData>({
    name: '',
    description: '',
    type: 'slack',
    schedule: '0 9 * * *', // Daily at 9 AM
    dashboardId: dashboardId || '',
    recipient: {
      channel: '',
      user: '',
    },
    config: {
      format: 'png', // Default to PNG for Slack
      includeCharts: true,
      highDPI: true, // Default to high DPI for better quality in Slack
      customMessage: '',
      includeMetrics: false,
      mentionUsers: [],
    },
    templateConfig: {
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

  const [recipientType, setRecipientType] = useState<'channel' | 'user'>(
    formData.recipient.channel ? 'channel' : 'user'
  );

  const [isValidating, setIsValidating] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  const [mentionUsersInput, setMentionUsersInput] = useState(
    formData.config.mentionUsers?.join(', ') || ''
  );

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

  const handleRecipientTypeChange = (type: 'channel' | 'user') => {
    setRecipientType(type);
    // Clear the other recipient type
    if (type === 'channel') {
      handleNestedChange('recipient', 'user', '');
    } else {
      handleNestedChange('recipient', 'channel', '');
    }
  };

  const handleMentionUsersChange = (value: string) => {
    setMentionUsersInput(value);
    const users = value.split(',').map(u => u.trim()).filter(u => u.length > 0);
    handleNestedChange('config', 'mentionUsers', users);
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

    if (!formData.recipient.channel && !formData.recipient.user) {
      alert('Slack channel or user is required');
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

  const handleTestMessage = () => {
    const recipient = recipientType === 'channel' 
      ? { channel: formData.recipient.channel }
      : { user: formData.recipient.user };

    if (!recipient.channel && !recipient.user) {
      alert('Please enter a channel or user first');
      return;
    }

    onTestNotification(recipient);
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
              placeholder="e.g., Weekly Analytics Update"
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
            <Label>Recipient Type</Label>
            <div className="flex space-x-4 mt-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="channel"
                  checked={recipientType === 'channel'}
                  onChange={(e) => handleRecipientTypeChange(e.target.value as 'channel')}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                Channel
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="user"
                  checked={recipientType === 'user'}
                  onChange={(e) => handleRecipientTypeChange(e.target.value as 'user')}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                Direct Message
              </label>
            </div>
          </div>

          {recipientType === 'channel' ? (
            <div>
              <Label htmlFor="channel">Slack Channel *</Label>
              <Input
                id="channel"
                type="text"
                value={formData.recipient.channel || ''}
                onChange={(e) => handleNestedChange('recipient', 'channel', e.target.value)}
                placeholder="#analytics or C1234567890"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Use # for channel names or channel ID for private channels
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="user">Slack User *</Label>
              <Input
                id="user"
                type="text"
                value={formData.recipient.user || ''}
                onChange={(e) => handleNestedChange('recipient', 'user', e.target.value)}
                placeholder="@username or U1234567890"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Use @ for usernames or user ID
              </p>
            </div>
          )}

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
              <option value="png">PNG Image (Recommended)</option>
              <option value="pdf">PDF</option>
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
              <Label htmlFor="highDPI">High DPI (Better quality in Slack)</Label>
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
            <Label htmlFor="mentionUsers">Mention Users</Label>
            <Input
              id="mentionUsers"
              type="text"
              value={mentionUsersInput}
              onChange={(e) => handleMentionUsersChange(e.target.value)}
              placeholder="john.doe, jane.smith (comma-separated usernames)"
            />
            <p className="text-sm text-gray-500 mt-1">
              Users to mention when posting the report (without @)
            </p>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-4">Message Template</h3>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="customMessage">Custom Message</Label>
            <textarea
              id="customMessage"
              value={formData.config.customMessage || ''}
              onChange={(e) => handleNestedChange('config', 'customMessage', e.target.value)}
              placeholder="Custom message to include with the report"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 border-t">
        <Button
          type="button"
          onClick={handleTestMessage}
          variant="outline"
          className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
        >
          Test Message
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