'use client';

import { useState, useEffect } from 'react';
import { Card } from '@sme/ui';
import { EmailScheduleForm } from './EmailScheduleForm';
import { SlackScheduleForm } from './SlackScheduleForm';
import { ScheduleList } from './ScheduleList';

interface Schedule {
  id: string;
  name: string;
  description?: string;
  type: 'email' | 'slack';
  schedule: string;
  dashboardId: string;
  recipient: {
    email?: string;
    name?: string;
    channel?: string;
    user?: string;
  };
  config: {
    format: 'pdf' | 'png';
    includeCharts: boolean;
    highDPI?: boolean;
    watermark?: string;
    customMessage?: string;
    includeMetrics?: boolean;
    mentionUsers?: string[];
  };
  templateConfig?: {
    subject?: string;
    message?: string;
    includeMetrics?: boolean;
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  status?: {
    isActive: boolean;
    nextExecution?: string;
    lastExecution?: string;
    lastResult?: {
      success: boolean;
      error?: string;
    };
  };
}

interface ScheduleManagerProps {
  dashboardId?: string;
}

export function ScheduleManager({ dashboardId }: ScheduleManagerProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formType, setFormType] = useState<'email' | 'slack'>('email');
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/scheduling');
      if (!response.ok) {
        throw new Error('Failed to load schedules');
      }
      const data = await response.json();
      setSchedules(data.schedules || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSchedule = async (scheduleData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
    try {
      const response = await fetch('/api/scheduling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scheduleData),
      });

      if (!response.ok) {
        throw new Error('Failed to create schedule');
      }

      await loadSchedules();
      setShowCreateForm(false);
      setEditingSchedule(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleUpdateSchedule = async (scheduleId: string, updates: Partial<Schedule>) => {
    try {
      const response = await fetch(`/api/scheduling/${scheduleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update schedule');
      }

      await loadSchedules();
      setEditingSchedule(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      const response = await fetch(`/api/scheduling/${scheduleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete schedule');
      }

      await loadSchedules();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleExecuteNow = async (scheduleId: string) => {
    try {
      const response = await fetch(`/api/scheduling/${scheduleId}/execute`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to execute schedule');
      }

      const result = await response.json();
      alert(result.message);
      await loadSchedules();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleTestNotification = async (type: 'email' | 'slack', recipient: any) => {
    try {
      const response = await fetch('/api/scheduling/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          recipient,
          dashboardId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send test notification');
      }

      const result = await response.json();
      alert(result.message);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Schedule Manager</h2>
          <p className="text-gray-600">Manage automated reports and notifications</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setFormType('email');
              setShowCreateForm(true);
              setEditingSchedule(null);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Email Schedule
          </button>
          <button
            onClick={() => {
              setFormType('slack');
              setShowCreateForm(true);
              setEditingSchedule(null);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Create Slack Schedule
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              Create {formType === 'email' ? 'Email' : 'Slack'} Schedule
            </h3>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setEditingSchedule(null);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {formType === 'email' ? (
            <EmailScheduleForm
              dashboardId={dashboardId}
              onSubmit={handleCreateSchedule}
              onCancel={() => setShowCreateForm(false)}
              onTestNotification={(recipient) => handleTestNotification('email', recipient)}
            />
          ) : (
            <SlackScheduleForm
              dashboardId={dashboardId}
              onSubmit={handleCreateSchedule}
              onCancel={() => setShowCreateForm(false)}
              onTestNotification={(recipient) => handleTestNotification('slack', recipient)}
            />
          )}
        </Card>
      )}

      {editingSchedule && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Edit Schedule</h3>
            <button
              onClick={() => setEditingSchedule(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {editingSchedule.type === 'email' ? (
            <EmailScheduleForm
              dashboardId={dashboardId}
              schedule={editingSchedule}
              onSubmit={(data) => handleUpdateSchedule(editingSchedule.id, data)}
              onCancel={() => setEditingSchedule(null)}
              onTestNotification={(recipient) => handleTestNotification('email', recipient)}
            />
          ) : (
            <SlackScheduleForm
              dashboardId={dashboardId}
              schedule={editingSchedule}
              onSubmit={(data) => handleUpdateSchedule(editingSchedule.id, data)}
              onCancel={() => setEditingSchedule(null)}
              onTestNotification={(recipient) => handleTestNotification('slack', recipient)}
            />
          )}
        </Card>
      )}

      <ScheduleList
        schedules={schedules}
        onEdit={setEditingSchedule}
        onDelete={handleDeleteSchedule}
        onExecuteNow={handleExecuteNow}
        onRefresh={loadSchedules}
      />
    </div>
  );
}