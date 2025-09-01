import { WebClient } from '@slack/web-api';
import { z } from 'zod';

export const SlackConfigSchema = z.object({
  token: z.string(),
  signingSecret: z.string().optional(),
});

export const SlackMessageSchema = z.object({
  channel: z.string(), // Channel ID or name (e.g., "#general", "@username", "C1234567890")
  text: z.string().optional(),
  blocks: z.array(z.any()).optional(),
  attachments: z.array(z.any()).optional(),
  thread_ts: z.string().optional(),
  username: z.string().optional(),
  icon_emoji: z.string().optional(),
  icon_url: z.string().optional(),
});

export const SlackFileUploadSchema = z.object({
  channels: z.union([z.string(), z.array(z.string())]),
  file: z.union([z.string(), z.instanceof(Buffer)]),
  filename: z.string(),
  title: z.string().optional(),
  initial_comment: z.string().optional(),
  filetype: z.string().optional(),
});

export type SlackConfig = z.infer<typeof SlackConfigSchema>;
export type SlackMessage = z.infer<typeof SlackMessageSchema>;
export type SlackFileUpload = z.infer<typeof SlackFileUploadSchema>;

export interface SlackSendResult {
  success: boolean;
  ts?: string; // Message timestamp
  error?: string;
  channel?: string;
  fileId?: string;
}

export class SlackScheduler {
  private client: WebClient | null = null;
  private config: SlackConfig | null = null;

  constructor(config?: SlackConfig) {
    if (config) {
      this.configure(config);
    }
  }

  configure(config: SlackConfig): void {
    const validatedConfig = SlackConfigSchema.parse(config);
    this.config = validatedConfig;
    
    this.client = new WebClient(validatedConfig.token);
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.client) {
      throw new Error('Slack scheduler not configured');
    }

    try {
      const result = await this.client.auth.test();
      return result.ok === true;
    } catch (error) {
      console.error('Slack verification failed:', error);
      return false;
    }
  }

  async sendMessage(message: SlackMessage): Promise<SlackSendResult> {
    if (!this.client) {
      throw new Error('Slack scheduler not configured');
    }

    const validatedMessage = SlackMessageSchema.parse(message);
    
    try {
      const result = await this.client.chat.postMessage(validatedMessage);
      
      if (result.ok) {
        return {
          success: true,
          ts: result.ts,
          channel: result.channel,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error',
        };
      }
    } catch (error) {
      console.error('Slack message send failed:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async uploadFile(upload: SlackFileUpload): Promise<SlackSendResult> {
    if (!this.client) {
      throw new Error('Slack scheduler not configured');
    }

    const validatedUpload = SlackFileUploadSchema.parse(upload);
    
    try {
      const result = await this.client.files.upload({
        channels: Array.isArray(validatedUpload.channels) 
          ? validatedUpload.channels.join(',') 
          : validatedUpload.channels,
        file: validatedUpload.file,
        filename: validatedUpload.filename,
        title: validatedUpload.title,
        initial_comment: validatedUpload.initial_comment,
        filetype: validatedUpload.filetype,
      });

      if (result.ok && result.file) {
        return {
          success: true,
          fileId: result.file.id,
          channel: Array.isArray(validatedUpload.channels) 
            ? validatedUpload.channels[0] 
            : validatedUpload.channels,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error',
        };
      }
    } catch (error) {
      console.error('Slack file upload failed:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async sendDashboardReport(
    channel: string,
    dashboardName: string,
    reportBuffer: Buffer,
    reportFilename: string,
    customMessage?: string
  ): Promise<SlackSendResult> {
    const message = customMessage || `📊 Dashboard Report: *${dashboardName}*\nGenerated on ${new Date().toLocaleDateString()}`;

    return this.uploadFile({
      channels: channel,
      file: reportBuffer,
      filename: reportFilename,
      title: `${dashboardName} - Dashboard Report`,
      initial_comment: message,
    });
  }

  async sendScheduledReport(
    channel: string,
    scheduleName: string,
    dashboardName: string,
    reportBuffer: Buffer,
    reportFilename: string,
    templateConfig?: {
      message?: string;
      includeMetrics?: boolean;
      mentionUsers?: string[];
    }
  ): Promise<SlackSendResult> {
    let message = templateConfig?.message || 
      `📈 *Scheduled Report: ${scheduleName}*\n\nDashboard: *${dashboardName}*\nGenerated: ${new Date().toLocaleString()}`;

    if (templateConfig?.includeMetrics) {
      const sizeKB = (reportBuffer.length / 1024).toFixed(2);
      message += `\n\n📋 *Report Details:*\n• File size: ${sizeKB} KB\n• Generated: ${new Date().toLocaleString()}`;
    }

    if (templateConfig?.mentionUsers && templateConfig.mentionUsers.length > 0) {
      const mentions = templateConfig.mentionUsers.map(user => `<@${user}>`).join(' ');
      message = `${mentions}\n\n${message}`;
    }

    return this.uploadFile({
      channels: channel,
      file: reportBuffer,
      filename: reportFilename,
      title: `${scheduleName} - Scheduled Report`,
      initial_comment: message,
    });
  }

  async sendRichMessage(
    channel: string,
    title: string,
    description: string,
    fields?: Array<{ title: string; value: string; short?: boolean }>,
    color?: string
  ): Promise<SlackSendResult> {
    const attachment = {
      color: color || '#007acc',
      title,
      text: description,
      fields: fields || [],
      footer: 'Elev8 Analytics',
      ts: Math.floor(Date.now() / 1000),
    };

    return this.sendMessage({
      channel,
      attachments: [attachment],
    });
  }

  async sendDashboardMetrics(
    channel: string,
    dashboardName: string,
    metrics: Array<{ name: string; value: string; change?: string }>,
    reportUrl?: string
  ): Promise<SlackSendResult> {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 ${dashboardName} - Key Metrics`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Dashboard:* ${dashboardName}\n*Updated:* ${new Date().toLocaleString()}`,
        },
      },
      {
        type: 'divider',
      },
    ];

    // Add metrics as fields
    const metricsFields: any[] = [];
    metrics.forEach(metric => {
      let valueText = `*${metric.value}*`;
      if (metric.change) {
        valueText += ` (${metric.change})`;
      }
      
      metricsFields.push({
        type: 'mrkdwn',
        text: `*${metric.name}*\n${valueText}`,
      });
    });

    if (metricsFields.length > 0) {
      blocks.push({
        type: 'section',
        fields: metricsFields,
      });
    }

    // Add link to full report if provided
    if (reportUrl) {
      blocks.push(
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${reportUrl}|View Full Dashboard →>`,
          },
        }
      );
    }

    return this.sendMessage({
      channel,
      blocks,
    });
  }

  async sendTestMessage(channel: string): Promise<SlackSendResult> {
    return this.sendMessage({
      channel,
      text: '🧪 *Slack Configuration Test*\n\nThis is a test message to verify your Slack integration is working correctly!\n\n✅ If you see this message, your Slack scheduler is properly configured.',
      username: 'Elev8 Analytics',
      icon_emoji: ':chart_with_upwards_trend:',
    });
  }

  async sendErrorNotification(
    channel: string,
    scheduleId: string,
    scheduleName: string,
    error: string
  ): Promise<SlackSendResult> {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Schedule Execution Failed',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Schedule:* ${scheduleName}\n*Schedule ID:* \`${scheduleId}\`\n*Time:* ${new Date().toLocaleString()}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error:*\n\`\`\`${error}\`\`\``,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Please check the system logs and schedule configuration.',
          },
        ],
      },
    ];

    return this.sendMessage({
      channel,
      blocks,
      username: 'Elev8 Analytics',
      icon_emoji: ':warning:',
    });
  }

  async getUserInfo(userId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Slack scheduler not configured');
    }

    try {
      const result = await this.client.users.info({ user: userId });
      return result.ok ? result.user : null;
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  }

  async getChannelInfo(channelId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Slack scheduler not configured');
    }

    try {
      const result = await this.client.conversations.info({ channel: channelId });
      return result.ok ? result.channel : null;
    } catch (error) {
      console.error('Failed to get channel info:', error);
      return null;
    }
  }

  static createFromEnv(): SlackScheduler {
    const config: SlackConfig = {
      token: process.env.SLACK_BOT_TOKEN || '',
      signingSecret: process.env.SLACK_SIGNING_SECRET,
    };

    return new SlackScheduler(config);
  }
}

// Global instance
let globalSlackScheduler: SlackScheduler | null = null;

export function getSlackScheduler(): SlackScheduler {
  if (!globalSlackScheduler) {
    globalSlackScheduler = SlackScheduler.createFromEnv();
  }
  return globalSlackScheduler;
}

export function setSlackScheduler(scheduler: SlackScheduler): void {
  globalSlackScheduler = scheduler;
}