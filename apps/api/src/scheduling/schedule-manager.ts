import * as cron from 'node-cron';
import { z } from 'zod';
import { getEmailScheduler } from './email-scheduler.js';
import { getSlackScheduler } from './slack-scheduler.js';
import { pdfGenerator, pngGenerator } from '@sme/exporter';

export const ScheduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['email', 'slack']),
  schedule: z.string(), // Cron expression
  dashboardId: z.string(),
  recipient: z.object({
    // For email
    email: z.string().email().optional(),
    name: z.string().optional(),
    // For Slack
    channel: z.string().optional(),
    user: z.string().optional(),
    webhookUrl: z.string().optional(),
  }),
  config: z.object({
    format: z.enum(['pdf', 'png']).default('pdf'),
    includeCharts: z.boolean().default(true),
    highDPI: z.boolean().default(false),
    watermark: z.string().optional(),
    customMessage: z.string().optional(),
    includeMetrics: z.boolean().default(false),
    mentionUsers: z.array(z.string()).optional(), // For Slack
  }),
  templateConfig: z.object({
    subject: z.string().optional(),
    message: z.string().optional(),
    includeMetrics: z.boolean().default(false),
  }).optional(),
  enabled: z.boolean().default(true),
  createdBy: z.string(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  lastRunAt: z.date().optional(),
  nextRunAt: z.date().optional(),
});

export type Schedule = z.infer<typeof ScheduleSchema>;

export interface ScheduleExecutionResult {
  scheduleId: string;
  success: boolean;
  executionTime: Date;
  duration: number;
  error?: string;
  fileSize?: number;
  recipients: string[];
}

export class ScheduleManager {
  private schedules = new Map<string, Schedule>();
  private cronJobs = new Map<string, cron.ScheduledTask>();
  private executionHistory = new Map<string, ScheduleExecutionResult[]>();
  private isRunning = false;

  constructor() {
    // Graceful shutdown handler
    process.on('SIGTERM', () => this.stopAll());
    process.on('SIGINT', () => this.stopAll());
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Schedule manager is already running');
      return;
    }

    console.log('Starting schedule manager...');
    this.isRunning = true;
    
    // Load schedules from database would go here
    // For now, we'll use in-memory storage
    
    console.log('Schedule manager started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping schedule manager...');
    this.stopAll();
    this.isRunning = false;
    console.log('Schedule manager stopped');
  }

  addSchedule(schedule: Schedule): void {
    const validatedSchedule = ScheduleSchema.parse(schedule);
    
    // Remove existing schedule if it exists
    this.removeSchedule(validatedSchedule.id);
    
    // Add to storage
    this.schedules.set(validatedSchedule.id, validatedSchedule);
    
    // Create cron job if enabled
    if (validatedSchedule.enabled && this.isValidCron(validatedSchedule.schedule)) {
      const task = cron.schedule(validatedSchedule.schedule, async () => {
        await this.executeSchedule(validatedSchedule.id);
      }, {
        scheduled: false, // Don't start immediately
        timezone: process.env.TZ || 'UTC',
      });
      
      this.cronJobs.set(validatedSchedule.id, task);
      task.start();
      
      console.log(`Added schedule: ${validatedSchedule.name} (${validatedSchedule.schedule})`);
    } else {
      console.log(`Added disabled schedule: ${validatedSchedule.name}`);
    }
  }

  removeSchedule(scheduleId: string): void {
    // Stop and remove cron job
    const task = this.cronJobs.get(scheduleId);
    if (task) {
      task.stop();
      task.destroy();
      this.cronJobs.delete(scheduleId);
    }
    
    // Remove from storage
    this.schedules.delete(scheduleId);
    this.executionHistory.delete(scheduleId);
    
    console.log(`Removed schedule: ${scheduleId}`);
  }

  updateSchedule(scheduleId: string, updates: Partial<Schedule>): void {
    const existingSchedule = this.schedules.get(scheduleId);
    if (!existingSchedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const updatedSchedule = ScheduleSchema.parse({
      ...existingSchedule,
      ...updates,
      updatedAt: new Date(),
    });

    // Remove old schedule and add updated one
    this.removeSchedule(scheduleId);
    this.addSchedule(updatedSchedule);
  }

  getSchedule(scheduleId: string): Schedule | undefined {
    return this.schedules.get(scheduleId);
  }

  getAllSchedules(): Schedule[] {
    return Array.from(this.schedules.values());
  }

  getExecutionHistory(scheduleId: string): ScheduleExecutionResult[] {
    return this.executionHistory.get(scheduleId) || [];
  }

  private async executeSchedule(scheduleId: string): Promise<ScheduleExecutionResult> {
    const startTime = Date.now();
    const schedule = this.schedules.get(scheduleId);
    
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    console.log(`Executing schedule: ${schedule.name} (${scheduleId})`);

    try {
      // Generate the export
      const exportResult = await this.generateExport(schedule);
      
      // Send via appropriate channel
      let sendResult;
      if (schedule.type === 'email') {
        sendResult = await this.sendEmailReport(schedule, exportResult);
      } else if (schedule.type === 'slack') {
        sendResult = await this.sendSlackReport(schedule, exportResult);
      } else {
        throw new Error(`Unsupported schedule type: ${schedule.type}`);
      }

      const duration = Date.now() - startTime;
      const result: ScheduleExecutionResult = {
        scheduleId,
        success: sendResult.success,
        executionTime: new Date(),
        duration,
        fileSize: exportResult.buffer.length,
        recipients: sendResult.recipients || [],
        error: sendResult.error,
      };

      // Update schedule last run time
      schedule.lastRunAt = new Date();
      schedule.nextRunAt = this.calculateNextRun(schedule.schedule);
      this.schedules.set(scheduleId, schedule);

      // Store execution result
      this.addExecutionResult(scheduleId, result);

      if (result.success) {
        console.log(`Schedule executed successfully: ${schedule.name} (${duration}ms)`);
      } else {
        console.error(`Schedule execution failed: ${schedule.name} - ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: ScheduleExecutionResult = {
        scheduleId,
        success: false,
        executionTime: new Date(),
        duration,
        error: (error as Error).message,
        recipients: [],
      };

      this.addExecutionResult(scheduleId, result);
      console.error(`Schedule execution failed: ${schedule.name}`, error);

      // Send error notification to admins
      await this.sendErrorNotification(schedule, (error as Error).message);

      return result;
    }
  }

  private async generateExport(schedule: Schedule): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    const dashboardUrl = `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${schedule.dashboardId}/view`;
    
    if (schedule.config.format === 'pdf') {
      const result = await pdfGenerator.generateDashboardPDF(schedule.dashboardId, {
        title: schedule.name,
        orientation: 'portrait',
      });
      return result;
    } else {
      const result = await pngGenerator.generateDashboardPNG(schedule.dashboardId, {
        width: 1920,
        height: 1080,
        quality: schedule.config.highDPI ? 100 : 90,
        deviceScaleFactor: schedule.config.highDPI ? 2 : 1,
      });
      return result;
    }
  }

  private async sendEmailReport(
    schedule: Schedule,
    exportResult: { buffer: Buffer; filename: string; contentType: string }
  ): Promise<{ success: boolean; error?: string; recipients: string[] }> {
    if (!schedule.recipient.email) {
      throw new Error('Email recipient not configured');
    }

    const emailScheduler = getEmailScheduler();
    const result = await emailScheduler.sendScheduledReport(
      [{ email: schedule.recipient.email, name: schedule.recipient.name }],
      schedule.name,
      `Dashboard ${schedule.dashboardId}`,
      exportResult.buffer,
      exportResult.filename,
      exportResult.contentType,
      schedule.templateConfig
    );

    return {
      success: result[0]?.success || false,
      error: result[0]?.error,
      recipients: result[0]?.recipients || [],
    };
  }

  private async sendSlackReport(
    schedule: Schedule,
    exportResult: { buffer: Buffer; filename: string; contentType: string }
  ): Promise<{ success: boolean; error?: string; recipients: string[] }> {
    const channel = schedule.recipient.channel || schedule.recipient.user;
    if (!channel) {
      throw new Error('Slack channel/user not configured');
    }

    const slackScheduler = getSlackScheduler();
    const result = await slackScheduler.sendScheduledReport(
      channel,
      schedule.name,
      `Dashboard ${schedule.dashboardId}`,
      exportResult.buffer,
      exportResult.filename,
      {
        message: schedule.config.customMessage,
        includeMetrics: schedule.config.includeMetrics,
        mentionUsers: schedule.config.mentionUsers,
      }
    );

    return {
      success: result.success,
      error: result.error,
      recipients: [channel],
    };
  }

  private async sendErrorNotification(schedule: Schedule, error: string): Promise<void> {
    try {
      const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').filter(e => e.trim());
      const adminSlackChannel = process.env.ADMIN_SLACK_CHANNEL;

      if (adminEmails.length > 0) {
        const emailScheduler = getEmailScheduler();
        await emailScheduler.sendErrorNotification(
          adminEmails,
          schedule.id,
          schedule.name,
          error
        );
      }

      if (adminSlackChannel) {
        const slackScheduler = getSlackScheduler();
        await slackScheduler.sendErrorNotification(
          adminSlackChannel,
          schedule.id,
          schedule.name,
          error
        );
      }
    } catch (notificationError) {
      console.error('Failed to send error notification:', notificationError);
    }
  }

  private addExecutionResult(scheduleId: string, result: ScheduleExecutionResult): void {
    const history = this.executionHistory.get(scheduleId) || [];
    history.push(result);
    
    // Keep only last 100 executions
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    this.executionHistory.set(scheduleId, history);
  }

  private calculateNextRun(cronExpression: string): Date {
    // Simple calculation - in production, you'd use a proper cron parser
    const now = new Date();
    const next = new Date(now.getTime() + 60 * 60 * 1000); // Default to 1 hour from now
    return next;
  }

  private isValidCron(expression: string): boolean {
    return cron.validate(expression);
  }

  private stopAll(): void {
    console.log('Stopping all scheduled tasks...');
    
    for (const [scheduleId, task] of this.cronJobs.entries()) {
      task.stop();
      task.destroy();
      console.log(`Stopped schedule: ${scheduleId}`);
    }
    
    this.cronJobs.clear();
  }

  async executeScheduleNow(scheduleId: string): Promise<ScheduleExecutionResult> {
    return this.executeSchedule(scheduleId);
  }

  getScheduleStatus(scheduleId: string): {
    isActive: boolean;
    nextExecution?: Date;
    lastExecution?: Date;
    lastResult?: ScheduleExecutionResult;
  } {
    const schedule = this.schedules.get(scheduleId);
    const task = this.cronJobs.get(scheduleId);
    const history = this.executionHistory.get(scheduleId) || [];
    const lastResult = history[history.length - 1];

    return {
      isActive: !!task,
      nextExecution: schedule?.nextRunAt,
      lastExecution: schedule?.lastRunAt,
      lastResult,
    };
  }

  getSystemStatus(): {
    totalSchedules: number;
    activeSchedules: number;
    recentExecutions: number;
    failedExecutions: number;
  } {
    const totalSchedules = this.schedules.size;
    const activeSchedules = this.cronJobs.size;
    
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let recentExecutions = 0;
    let failedExecutions = 0;

    for (const history of this.executionHistory.values()) {
      for (const execution of history) {
        if (execution.executionTime.getTime() > oneHourAgo) {
          recentExecutions++;
          if (!execution.success) {
            failedExecutions++;
          }
        }
      }
    }

    return {
      totalSchedules,
      activeSchedules,
      recentExecutions,
      failedExecutions,
    };
  }
}

// Global instance
let globalScheduleManager: ScheduleManager | null = null;

export function getScheduleManager(): ScheduleManager {
  if (!globalScheduleManager) {
    globalScheduleManager = new ScheduleManager();
  }
  return globalScheduleManager;
}

export async function startScheduleManager(): Promise<void> {
  const manager = getScheduleManager();
  await manager.start();
}

export async function stopScheduleManager(): Promise<void> {
  if (globalScheduleManager) {
    await globalScheduleManager.stop();
  }
}