import { log } from '@temporalio/activity';

interface NotificationConfig {
  email?: string[];
  webhook?: string;
  onSuccess?: boolean;
  onFailure?: boolean;
  onError?: boolean;
  onComplete?: boolean;
  onlyOnFailure?: boolean;
}

interface NotificationParams {
  type: 'sync_completed' | 'sync_failed' | 'discovery_completed' | 'discovery_failed' | 
        'incremental_sync_completed' | 'incremental_sync_failed' |
        'quality_check_completed' | 'quality_check_failed' |
        'transformation_completed' | 'transformation_failed';
  connectionId: string;
  pipelineId?: string;
  status?: any;
  report?: any;
  result?: any;
  error?: string;
  config: NotificationConfig;
}

export async function sendNotification(params: NotificationParams): Promise<void> {
  log.info('Sending notification', {
    type: params.type,
    connectionId: params.connectionId,
    emailRecipients: params.config.email?.length || 0,
    hasWebhook: !!params.config.webhook
  });
  
  try {
    const notification = await buildNotificationContent(params);
    
    // Send email notifications
    if (params.config.email && params.config.email.length > 0) {
      await sendEmailNotification({
        recipients: params.config.email,
        subject: notification.subject,
        content: notification.content,
        isHtml: notification.isHtml
      });
    }
    
    // Send webhook notifications
    if (params.config.webhook) {
      await sendWebhookNotification({
        url: params.config.webhook,
        payload: notification.payload
      });
    }
    
    log.info('Notification sent successfully', {
      type: params.type,
      connectionId: params.connectionId
    });
    
  } catch (error) {
    log.error('Failed to send notification', {
      type: params.type,
      connectionId: params.connectionId,
      error
    });
    // Don't throw here as notifications are non-critical
  }
}

export async function sendAlert(params: {
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  connectionId?: string;
  metadata?: Record<string, unknown>;
  config: NotificationConfig;
}): Promise<void> {
  log.info('Sending alert', {
    type: params.type,
    title: params.title,
    connectionId: params.connectionId
  });
  
  try {
    const alertContent = {
      timestamp: new Date().toISOString(),
      type: params.type,
      title: params.title,
      message: params.message,
      connectionId: params.connectionId,
      metadata: params.metadata
    };
    
    // Send email alert
    if (params.config.email && params.config.email.length > 0) {
      await sendEmailNotification({
        recipients: params.config.email,
        subject: `${params.type.toUpperCase()}: ${params.title}`,
        content: buildAlertEmailContent(alertContent),
        isHtml: true
      });
    }
    
    // Send webhook alert
    if (params.config.webhook) {
      await sendWebhookNotification({
        url: params.config.webhook,
        payload: {
          alert: alertContent
        }
      });
    }
    
    log.info('Alert sent successfully', {
      type: params.type,
      title: params.title
    });
    
  } catch (error) {
    log.error('Failed to send alert', {
      type: params.type,
      title: params.title,
      error
    });
  }
}

export async function sendSlackNotification(params: {
  webhookUrl: string;
  message: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}): Promise<void> {
  log.info('Sending Slack notification', {
    channel: params.channel,
    username: params.username
  });
  
  try {
    const slackPayload = {
      text: params.message,
      channel: params.channel,
      username: params.username || 'SME Analytics',
      icon_emoji: params.iconEmoji || ':robot_face:',
      mrkdwn: true
    };
    
    const response = await fetch(params.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackPayload)
    });
    
    if (!response.ok) {
      throw new Error(`Slack API returned ${response.status}: ${response.statusText}`);
    }
    
    log.info('Slack notification sent successfully');
    
  } catch (error) {
    log.error('Failed to send Slack notification', { error });
    throw error;
  }
}

export async function sendTeamsNotification(params: {
  webhookUrl: string;
  title: string;
  text: string;
  color?: string;
  sections?: Array<{
    activityTitle?: string;
    activitySubtitle?: string;
    facts?: Array<{ name: string; value: string }>;
  }>;
}): Promise<void> {
  log.info('Sending Teams notification', {
    title: params.title
  });
  
  try {
    const teamsPayload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: params.color || '0076D7',
      summary: params.title,
      sections: [
        {
          activityTitle: params.title,
          activitySubtitle: params.text,
          ...(params.sections?.[0] || {})
        },
        ...(params.sections?.slice(1) || [])
      ]
    };
    
    const response = await fetch(params.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(teamsPayload)
    });
    
    if (!response.ok) {
      throw new Error(`Teams API returned ${response.status}: ${response.statusText}`);
    }
    
    log.info('Teams notification sent successfully');
    
  } catch (error) {
    log.error('Failed to send Teams notification', { error });
    throw error;
  }
}

// Helper functions
async function buildNotificationContent(params: NotificationParams): Promise<{
  subject: string;
  content: string;
  isHtml: boolean;
  payload: Record<string, unknown>;
}> {
  const timestamp = new Date().toISOString();
  
  switch (params.type) {
    case 'sync_completed':
      return {
        subject: `Data Sync Completed - Connection ${params.connectionId}`,
        content: buildSyncCompletedEmail(params),
        isHtml: true,
        payload: {
          event: 'sync_completed',
          connectionId: params.connectionId,
          timestamp,
          status: params.status
        }
      };
      
    case 'sync_failed':
      return {
        subject: `Data Sync Failed - Connection ${params.connectionId}`,
        content: buildSyncFailedEmail(params),
        isHtml: true,
        payload: {
          event: 'sync_failed',
          connectionId: params.connectionId,
          timestamp,
          status: params.status,
          error: params.error
        }
      };
      
    case 'discovery_completed':
      return {
        subject: `Schema Discovery Completed - Connection ${params.connectionId}`,
        content: buildDiscoveryCompletedEmail(params),
        isHtml: true,
        payload: {
          event: 'discovery_completed',
          connectionId: params.connectionId,
          timestamp,
          result: params.result
        }
      };
      
    case 'discovery_failed':
      return {
        subject: `Schema Discovery Failed - Connection ${params.connectionId}`,
        content: buildDiscoveryFailedEmail(params),
        isHtml: true,
        payload: {
          event: 'discovery_failed',
          connectionId: params.connectionId,
          timestamp,
          error: params.error
        }
      };
      
    case 'quality_check_completed':
      return {
        subject: `Data Quality Check Completed - Connection ${params.connectionId}`,
        content: buildQualityCheckCompletedEmail(params),
        isHtml: true,
        payload: {
          event: 'quality_check_completed',
          connectionId: params.connectionId,
          timestamp,
          report: params.report
        }
      };
      
    case 'quality_check_failed':
      return {
        subject: `Data Quality Check Failed - Connection ${params.connectionId}`,
        content: buildQualityCheckFailedEmail(params),
        isHtml: true,
        payload: {
          event: 'quality_check_failed',
          connectionId: params.connectionId,
          timestamp,
          error: params.error
        }
      };
      
    case 'transformation_completed':
      return {
        subject: `Data Transformation Completed - Pipeline ${params.pipelineId}`,
        content: buildTransformationCompletedEmail(params),
        isHtml: true,
        payload: {
          event: 'transformation_completed',
          connectionId: params.connectionId,
          pipelineId: params.pipelineId,
          timestamp,
          status: params.status
        }
      };
      
    case 'transformation_failed':
      return {
        subject: `Data Transformation Failed - Pipeline ${params.pipelineId}`,
        content: buildTransformationFailedEmail(params),
        isHtml: true,
        payload: {
          event: 'transformation_failed',
          connectionId: params.connectionId,
          pipelineId: params.pipelineId,
          timestamp,
          status: params.status,
          error: params.error
        }
      };
      
    default:
      return {
        subject: `SME Analytics Notification - ${params.type}`,
        content: `Event: ${params.type}\nConnection: ${params.connectionId}\nTimestamp: ${timestamp}`,
        isHtml: false,
        payload: {
          event: params.type,
          connectionId: params.connectionId,
          timestamp
        }
      };
  }
}

async function sendEmailNotification(params: {
  recipients: string[];
  subject: string;
  content: string;
  isHtml: boolean;
}): Promise<void> {
  log.info('Sending email notification', {
    recipients: params.recipients.length,
    subject: params.subject
  });
  
  try {
    // This would integrate with an email service (SendGrid, SES, etc.)
    // For now, just log the email content
    
    log.info('Email notification would be sent', {
      to: params.recipients,
      subject: params.subject,
      contentLength: params.content.length,
      isHtml: params.isHtml
    });
    
    // In real implementation:
    // - Use email service SDK
    // - Handle retries and failures
    // - Track delivery status
    
  } catch (error) {
    log.error('Failed to send email notification', { error });
    throw error;
  }
}

async function sendWebhookNotification(params: {
  url: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  log.info('Sending webhook notification', {
    url: params.url,
    payloadSize: JSON.stringify(params.payload).length
  });
  
  try {
    const response = await fetch(params.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SME-Analytics-Webhook/1.0'
      },
      body: JSON.stringify(params.payload)
    });
    
    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }
    
    log.info('Webhook notification sent successfully', {
      status: response.status,
      statusText: response.statusText
    });
    
  } catch (error) {
    log.error('Failed to send webhook notification', {
      url: params.url,
      error
    });
    throw error;
  }
}

// Email template builders
function buildSyncCompletedEmail(params: NotificationParams): string {
  const status = params.status;
  return `
    <html>
    <body>
      <h2>Data Sync Completed Successfully</h2>
      <p><strong>Connection ID:</strong> ${params.connectionId}</p>
      <p><strong>Completion Time:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Summary</h3>
      <ul>
        <li>Tables Synced: ${status?.progress?.syncedTables || 0}</li>
        <li>Records Processed: ${status?.progress?.recordsProcessed || 0}</li>
        <li>Data Transferred: ${formatBytes(status?.metrics?.bytesTransferred || 0)}</li>
        <li>Duration: ${formatDuration(status?.metrics?.startTime, status?.metrics?.endTime)}</li>
      </ul>
      
      ${status?.errors?.length > 0 ? `
        <h3>Warnings</h3>
        <ul>
          ${status.errors.slice(0, 5).map((error: any) => `<li>${error.message}</li>`).join('')}
        </ul>
      ` : ''}
      
      <p>Your data is now up to date and ready for analysis.</p>
    </body>
    </html>
  `;
}

function buildSyncFailedEmail(params: NotificationParams): string {
  const status = params.status;
  return `
    <html>
    <body>
      <h2>Data Sync Failed</h2>
      <p><strong>Connection ID:</strong> ${params.connectionId}</p>
      <p><strong>Failure Time:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Error Details</h3>
      <p>${params.error || 'Unknown error occurred'}</p>
      
      <h3>Progress Before Failure</h3>
      <ul>
        <li>Tables Synced: ${status?.progress?.syncedTables || 0}</li>
        <li>Records Processed: ${status?.progress?.recordsProcessed || 0}</li>
      </ul>
      
      <p>Please check the logs for more details and retry the sync operation.</p>
    </body>
    </html>
  `;
}

function buildDiscoveryCompletedEmail(params: NotificationParams): string {
  const result = params.result;
  return `
    <html>
    <body>
      <h2>Schema Discovery Completed</h2>
      <p><strong>Connection ID:</strong> ${params.connectionId}</p>
      <p><strong>Discovery Time:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Discovered Objects</h3>
      <ul>
        <li>Databases: ${result?.databases?.length || 0}</li>
        <li>Schemas: ${result?.schemas?.length || 0}</li>
        <li>Tables: ${result?.tables?.length || 0}</li>
      </ul>
      
      <p>Schema information has been updated in the data catalog.</p>
    </body>
    </html>
  `;
}

function buildDiscoveryFailedEmail(params: NotificationParams): string {
  return `
    <html>
    <body>
      <h2>Schema Discovery Failed</h2>
      <p><strong>Connection ID:</strong> ${params.connectionId}</p>
      <p><strong>Failure Time:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Error Details</h3>
      <p>${params.error || 'Unknown error occurred'}</p>
      
      <p>Please check the connection configuration and try again.</p>
    </body>
    </html>
  `;
}

function buildQualityCheckCompletedEmail(params: NotificationParams): string {
  const report = params.report;
  return `
    <html>
    <body>
      <h2>Data Quality Check Completed</h2>
      <p><strong>Connection ID:</strong> ${params.connectionId}</p>
      <p><strong>Check Time:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Quality Summary</h3>
      <ul>
        <li>Overall Score: ${Math.round((report?.summary?.overallScore || 0) * 100)}%</li>
        <li>Tables Checked: ${report?.summary?.tablesChecked || 0}</li>
        <li>Critical Issues: ${report?.summary?.criticalIssues || 0}</li>
        <li>Warnings: ${report?.summary?.warnings || 0}</li>
      </ul>
      
      ${report?.summary?.criticalIssues > 0 ? `
        <h3>Critical Issues Found</h3>
        <p>Please review the quality report for detailed findings.</p>
      ` : ''}
      
      <p>Data quality assessment is complete.</p>
    </body>
    </html>
  `;
}

function buildQualityCheckFailedEmail(params: NotificationParams): string {
  return `
    <html>
    <body>
      <h2>Data Quality Check Failed</h2>
      <p><strong>Connection ID:</strong> ${params.connectionId}</p>
      <p><strong>Failure Time:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Error Details</h3>
      <p>${params.error || 'Unknown error occurred'}</p>
      
      <p>Please check the connection and retry the quality check.</p>
    </body>
    </html>
  `;
}

function buildTransformationCompletedEmail(params: NotificationParams): string {
  const status = params.status;
  return `
    <html>
    <body>
      <h2>Data Transformation Completed</h2>
      <p><strong>Pipeline ID:</strong> ${params.pipelineId}</p>
      <p><strong>Connection ID:</strong> ${params.connectionId}</p>
      <p><strong>Completion Time:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Transformation Summary</h3>
      <ul>
        <li>Steps Completed: ${status?.progress?.completedSteps || 0}</li>
        <li>Total Steps: ${status?.progress?.totalSteps || 0}</li>
        <li>Records Processed: ${status?.metrics?.totalRecordsProcessed || 0}</li>
        <li>Duration: ${formatDuration(null, null, status?.metrics?.totalDuration)}</li>
      </ul>
      
      <p>Data transformation pipeline has completed successfully.</p>
    </body>
    </html>
  `;
}

function buildTransformationFailedEmail(params: NotificationParams): string {
  const status = params.status;
  return `
    <html>
    <body>
      <h2>Data Transformation Failed</h2>
      <p><strong>Pipeline ID:</strong> ${params.pipelineId}</p>
      <p><strong>Connection ID:</strong> ${params.connectionId}</p>
      <p><strong>Failure Time:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Error Details</h3>
      <p>${params.error || 'Unknown error occurred'}</p>
      
      <h3>Progress Before Failure</h3>
      <ul>
        <li>Steps Completed: ${status?.progress?.completedSteps || 0}</li>
        <li>Total Steps: ${status?.progress?.totalSteps || 0}</li>
      </ul>
      
      <p>Please check the logs and retry the transformation.</p>
    </body>
    </html>
  `;
}

function buildAlertEmailContent(alert: any): string {
  return `
    <html>
    <body>
      <h2>${alert.type.toUpperCase()}: ${alert.title}</h2>
      <p><strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}</p>
      ${alert.connectionId ? `<p><strong>Connection:</strong> ${alert.connectionId}</p>` : ''}
      
      <h3>Details</h3>
      <p>${alert.message}</p>
      
      ${alert.metadata ? `
        <h3>Additional Information</h3>
        <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
      ` : ''}
    </body>
    </html>
  `;
}

// Utility functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(startTime?: Date, endTime?: Date, durationMs?: number): string {
  let duration: number;
  
  if (durationMs) {
    duration = durationMs;
  } else if (startTime && endTime) {
    duration = endTime.getTime() - startTime.getTime();
  } else {
    return 'Unknown';
  }
  
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}