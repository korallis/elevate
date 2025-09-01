'use client';

import { useState } from 'react';
import { Card, Button } from '@sme/ui';

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

interface ScheduleListProps {
  schedules: Schedule[];
  onEdit: (schedule: Schedule) => void;
  onDelete: (scheduleId: string) => void;
  onExecuteNow: (scheduleId: string) => void;
  onRefresh: () => void;
}

const CRON_DESCRIPTIONS: Record<string, string> = {
  '* * * * *': 'Every minute',
  '0 * * * *': 'Every hour',
  '0 9 * * *': 'Daily at 9:00 AM',
  '0 9 * * 1': 'Weekly on Monday at 9:00 AM',
  '0 9 1 * *': 'Monthly on the 1st at 9:00 AM',
  '*/15 * * * *': 'Every 15 minutes',
  '*/30 * * * *': 'Every 30 minutes',
  '0 */6 * * *': 'Every 6 hours',
  '0 8,20 * * *': 'Twice daily at 8:00 AM and 8:00 PM',
};

function getCronDescription(schedule: string): string {
  return CRON_DESCRIPTIONS[schedule] || schedule;
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function StatusBadge({ status }: { status?: Schedule['status'] }) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        Unknown
      </span>
    );
  }

  if (!status.isActive) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Inactive
      </span>
    );
  }

  if (status.lastResult?.success === false) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
      Active
    </span>
  );
}

function TypeBadge({ type }: { type: 'email' | 'slack' }) {
  const colors = {
    email: 'bg-blue-100 text-blue-800',
    slack: 'bg-purple-100 text-purple-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[type]}`}>
      {type === 'email' ? '📧 Email' : '💬 Slack'}
    </span>
  );
}

function FormatBadge({ format }: { format: 'pdf' | 'png' }) {
  const colors = {
    pdf: 'bg-red-100 text-red-800',
    png: 'bg-green-100 text-green-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[format]}`}>
      {format.toUpperCase()}
    </span>
  );
}

export function ScheduleList({
  schedules,
  onEdit,
  onDelete,
  onExecuteNow,
  onRefresh,
}: ScheduleListProps) {
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);

  if (schedules.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No schedules created</h3>
        <p className="text-gray-500 mb-4">
          Create your first schedule to start receiving automated reports
        </p>
        <Button onClick={onRefresh} variant="outline">
          Refresh
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Schedules ({schedules.length})</h3>
        <Button onClick={onRefresh} variant="outline" size="sm">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </Button>
      </div>

      {schedules.map((schedule) => (
        <Card key={schedule.id} className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h4 className="text-lg font-medium text-gray-900">{schedule.name}</h4>
                <TypeBadge type={schedule.type} />
                <FormatBadge format={schedule.config.format} />
                <StatusBadge status={schedule.status} />
                {!schedule.enabled && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    Disabled
                  </span>
                )}
              </div>

              {schedule.description && (
                <p className="text-gray-600 mb-3">{schedule.description}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Schedule:</span>
                  <p className="text-gray-600">{getCronDescription(schedule.schedule)}</p>
                </div>

                <div>
                  <span className="font-medium text-gray-700">Recipient:</span>
                  <p className="text-gray-600">
                    {schedule.type === 'email' 
                      ? schedule.recipient.email
                      : schedule.recipient.channel || schedule.recipient.user
                    }
                  </p>
                </div>

                <div>
                  <span className="font-medium text-gray-700">Next Run:</span>
                  <p className="text-gray-600">
                    {schedule.status?.nextExecution 
                      ? formatDate(schedule.status.nextExecution)
                      : 'Not scheduled'
                    }
                  </p>
                </div>

                <div>
                  <span className="font-medium text-gray-700">Last Run:</span>
                  <p className="text-gray-600">
                    {schedule.status?.lastExecution 
                      ? formatDate(schedule.status.lastExecution)
                      : 'Never'
                    }
                  </p>
                </div>
              </div>

              {schedule.status?.lastResult?.error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">
                    <span className="font-medium">Last execution failed:</span>{' '}
                    {schedule.status.lastResult.error}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-4">
              <Button
                onClick={() => setExpandedSchedule(
                  expandedSchedule === schedule.id ? null : schedule.id
                )}
                variant="ghost"
                size="sm"
              >
                {expandedSchedule === schedule.id ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </Button>

              <Button
                onClick={() => onExecuteNow(schedule.id)}
                variant="outline"
                size="sm"
                className="text-green-600 border-green-200 hover:bg-green-50"
              >
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
                </svg>
                Run Now
              </Button>

              <Button
                onClick={() => onEdit(schedule)}
                variant="outline"
                size="sm"
              >
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </Button>

              <Button
                onClick={() => onDelete(schedule.id)}
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
            </div>
          </div>

          {expandedSchedule === schedule.id && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h5 className="font-medium text-gray-900 mb-3">Configuration</h5>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-gray-700">Dashboard ID:</dt>
                      <dd className="text-gray-600 font-mono text-xs">{schedule.dashboardId}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-700">Cron Expression:</dt>
                      <dd className="text-gray-600 font-mono">{schedule.schedule}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-700">Include Charts:</dt>
                      <dd className="text-gray-600">{schedule.config.includeCharts ? 'Yes' : 'No'}</dd>
                    </div>
                    {schedule.config.highDPI && (
                      <div>
                        <dt className="font-medium text-gray-700">High DPI:</dt>
                        <dd className="text-gray-600">Yes</dd>
                      </div>
                    )}
                    {schedule.config.watermark && (
                      <div>
                        <dt className="font-medium text-gray-700">Watermark:</dt>
                        <dd className="text-gray-600">{schedule.config.watermark}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div>
                  <h5 className="font-medium text-gray-900 mb-3">Recipient Details</h5>
                  <dl className="space-y-2 text-sm">
                    {schedule.type === 'email' ? (
                      <>
                        <div>
                          <dt className="font-medium text-gray-700">Email:</dt>
                          <dd className="text-gray-600">{schedule.recipient.email}</dd>
                        </div>
                        {schedule.recipient.name && (
                          <div>
                            <dt className="font-medium text-gray-700">Name:</dt>
                            <dd className="text-gray-600">{schedule.recipient.name}</dd>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {schedule.recipient.channel && (
                          <div>
                            <dt className="font-medium text-gray-700">Channel:</dt>
                            <dd className="text-gray-600">{schedule.recipient.channel}</dd>
                          </div>
                        )}
                        {schedule.recipient.user && (
                          <div>
                            <dt className="font-medium text-gray-700">User:</dt>
                            <dd className="text-gray-600">{schedule.recipient.user}</dd>
                          </div>
                        )}
                        {schedule.config.mentionUsers && schedule.config.mentionUsers.length > 0 && (
                          <div>
                            <dt className="font-medium text-gray-700">Mention Users:</dt>
                            <dd className="text-gray-600">{schedule.config.mentionUsers.join(', ')}</dd>
                          </div>
                        )}
                      </>
                    )}
                  </dl>
                </div>
              </div>

              {(schedule.config.customMessage || schedule.templateConfig?.message) && (
                <div className="mt-4">
                  <h5 className="font-medium text-gray-900 mb-2">Custom Message</h5>
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-sm text-gray-700">
                      {schedule.config.customMessage || schedule.templateConfig?.message}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4 text-xs text-gray-500">
                Created: {formatDate(schedule.createdAt)} • 
                Updated: {formatDate(schedule.updatedAt)}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}