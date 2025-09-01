import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getScheduleManager, type Schedule, type ScheduleExecutionResult } from '../scheduling/schedule-manager.js';
import { getEmailScheduler } from '../scheduling/email-scheduler.js';
import { getSlackScheduler } from '../scheduling/slack-scheduler.js';
import { getTemplateEngine } from '../scheduling/template-engine.js';

const app = new Hono();

// Validation schemas
const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['email', 'slack']),
  schedule: z.string().regex(/^[0-9\*\,\/\-\s]+$/), // Basic cron validation
  dashboardId: z.string().uuid(),
  recipient: z.object({
    // Email fields
    email: z.string().email().optional(),
    name: z.string().optional(),
    // Slack fields
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
    mentionUsers: z.array(z.string()).optional(),
  }).default({}),
  templateConfig: z.object({
    subject: z.string().optional(),
    message: z.string().optional(),
    includeMetrics: z.boolean().default(false),
  }).optional(),
  enabled: z.boolean().default(true),
});

const UpdateScheduleSchema = CreateScheduleSchema.partial();

const TestNotificationSchema = z.object({
  type: z.enum(['email', 'slack']),
  recipient: z.object({
    email: z.string().email().optional(),
    channel: z.string().optional(),
  }),
  dashboardId: z.string().uuid().optional(),
});

// Get all schedules
app.get('/', async (c) => {
  try {
    const scheduleManager = getScheduleManager();
    const schedules = scheduleManager.getAllSchedules();

    // Add status information to each schedule
    const schedulesWithStatus = schedules.map(schedule => {
      const status = scheduleManager.getScheduleStatus(schedule.id);
      return {
        ...schedule,
        status,
      };
    });

    return c.json({ schedules: schedulesWithStatus });
  } catch (error) {
    console.error('Failed to get schedules:', error);
    return c.json({ error: 'Failed to get schedules', details: (error as Error).message }, 500);
  }
});

// Get specific schedule
app.get('/:id', async (c) => {
  try {
    const scheduleId = c.req.param('id');
    const scheduleManager = getScheduleManager();
    const schedule = scheduleManager.getSchedule(scheduleId);

    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    const status = scheduleManager.getScheduleStatus(scheduleId);
    const history = scheduleManager.getExecutionHistory(scheduleId);

    return c.json({
      schedule: {
        ...schedule,
        status,
        executionHistory: history.slice(-10), // Last 10 executions
      },
    });
  } catch (error) {
    console.error('Failed to get schedule:', error);
    return c.json({ error: 'Failed to get schedule', details: (error as Error).message }, 500);
  }
});

// Create new schedule
app.post(
  '/',
  zValidator('json', CreateScheduleSchema),
  async (c) => {
    try {
      const data = c.req.valid('json');
      const scheduleManager = getScheduleManager();

      // Validate recipient based on type
      if (data.type === 'email' && !data.recipient.email) {
        return c.json({ error: 'Email address is required for email schedules' }, 400);
      }

      if (data.type === 'slack' && !data.recipient.channel && !data.recipient.user) {
        return c.json({ error: 'Channel or user is required for Slack schedules' }, 400);
      }

      // Create schedule object
      const schedule: Schedule = {
        id: crypto.randomUUID(),
        ...data,
        createdBy: 'current-user-id', // TODO: Get from authentication context
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      scheduleManager.addSchedule(schedule);

      return c.json({ schedule, message: 'Schedule created successfully' }, 201);
    } catch (error) {
      console.error('Failed to create schedule:', error);
      return c.json({ error: 'Failed to create schedule', details: (error as Error).message }, 500);
    }
  }
);

// Update existing schedule
app.put(
  '/:id',
  zValidator('json', UpdateScheduleSchema),
  async (c) => {
    try {
      const scheduleId = c.req.param('id');
      const updates = c.req.valid('json');
      const scheduleManager = getScheduleManager();

      const existingSchedule = scheduleManager.getSchedule(scheduleId);
      if (!existingSchedule) {
        return c.json({ error: 'Schedule not found' }, 404);
      }

      // Validate recipient if being updated
      if (updates.type || updates.recipient) {
        const type = updates.type || existingSchedule.type;
        const recipient = { ...existingSchedule.recipient, ...updates.recipient };

        if (type === 'email' && !recipient.email) {
          return c.json({ error: 'Email address is required for email schedules' }, 400);
        }

        if (type === 'slack' && !recipient.channel && !recipient.user) {
          return c.json({ error: 'Channel or user is required for Slack schedules' }, 400);
        }
      }

      scheduleManager.updateSchedule(scheduleId, updates);
      const updatedSchedule = scheduleManager.getSchedule(scheduleId);

      return c.json({ schedule: updatedSchedule, message: 'Schedule updated successfully' });
    } catch (error) {
      console.error('Failed to update schedule:', error);
      return c.json({ error: 'Failed to update schedule', details: (error as Error).message }, 500);
    }
  }
);

// Delete schedule
app.delete('/:id', async (c) => {
  try {
    const scheduleId = c.req.param('id');
    const scheduleManager = getScheduleManager();

    const schedule = scheduleManager.getSchedule(scheduleId);
    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    scheduleManager.removeSchedule(scheduleId);

    return c.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Failed to delete schedule:', error);
    return c.json({ error: 'Failed to delete schedule', details: (error as Error).message }, 500);
  }
});

// Execute schedule immediately
app.post('/:id/execute', async (c) => {
  try {
    const scheduleId = c.req.param('id');
    const scheduleManager = getScheduleManager();

    const schedule = scheduleManager.getSchedule(scheduleId);
    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    const result = await scheduleManager.executeScheduleNow(scheduleId);

    return c.json({ 
      result,
      message: result.success 
        ? 'Schedule executed successfully' 
        : 'Schedule execution failed'
    });
  } catch (error) {
    console.error('Failed to execute schedule:', error);
    return c.json({ error: 'Failed to execute schedule', details: (error as Error).message }, 500);
  }
});

// Get schedule execution history
app.get('/:id/history', async (c) => {
  try {
    const scheduleId = c.req.param('id');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const scheduleManager = getScheduleManager();
    const schedule = scheduleManager.getSchedule(scheduleId);

    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    const history = scheduleManager.getExecutionHistory(scheduleId);
    const paginatedHistory = history.slice(offset, offset + limit);

    return c.json({
      history: paginatedHistory,
      total: history.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to get schedule history:', error);
    return c.json({ error: 'Failed to get schedule history', details: (error as Error).message }, 500);
  }
});

// Test notification
app.post(
  '/test',
  zValidator('json', TestNotificationSchema),
  async (c) => {
    try {
      const { type, recipient, dashboardId } = c.req.valid('json');

      if (type === 'email') {
        if (!recipient.email) {
          return c.json({ error: 'Email address is required' }, 400);
        }

        const emailScheduler = getEmailScheduler();
        
        if (dashboardId) {
          // Test with actual dashboard report
          const result = await emailScheduler.sendDashboardReport(
            { email: recipient.email, name: 'Test User' },
            `Test Dashboard ${dashboardId}`,
            Buffer.from('Test report content'),
            'test-report.pdf',
            'application/pdf',
            'This is a test report to verify email configuration.'
          );

          return c.json({
            success: result.success,
            message: result.success 
              ? 'Test email sent successfully' 
              : 'Failed to send test email',
            error: result.error,
          });
        } else {
          // Send simple test email
          const result = await emailScheduler.sendTestEmail(recipient.email);

          return c.json({
            success: result.success,
            message: result.success 
              ? 'Test email sent successfully' 
              : 'Failed to send test email',
            error: result.error,
          });
        }
      } else if (type === 'slack') {
        if (!recipient.channel) {
          return c.json({ error: 'Channel is required' }, 400);
        }

        const slackScheduler = getSlackScheduler();
        
        if (dashboardId) {
          // Test with actual dashboard report
          const result = await slackScheduler.sendDashboardReport(
            recipient.channel,
            `Test Dashboard ${dashboardId}`,
            Buffer.from('Test report content'),
            'test-report.pdf',
            'This is a test report to verify Slack configuration.'
          );

          return c.json({
            success: result.success,
            message: result.success 
              ? 'Test Slack message sent successfully' 
              : 'Failed to send test Slack message',
            error: result.error,
          });
        } else {
          // Send simple test message
          const result = await slackScheduler.sendTestMessage(recipient.channel);

          return c.json({
            success: result.success,
            message: result.success 
              ? 'Test Slack message sent successfully' 
              : 'Failed to send test Slack message',
            error: result.error,
          });
        }
      }

      return c.json({ error: 'Invalid notification type' }, 400);
    } catch (error) {
      console.error('Failed to send test notification:', error);
      return c.json({ error: 'Failed to send test notification', details: (error as Error).message }, 500);
    }
  }
);

// Get notification logs
app.get('/logs', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');
    const scheduleId = c.req.query('scheduleId');
    const status = c.req.query('status');

    const scheduleManager = getScheduleManager();
    
    // If specific schedule requested
    if (scheduleId) {
      const history = scheduleManager.getExecutionHistory(scheduleId);
      let filteredHistory = history;

      if (status) {
        filteredHistory = history.filter(h => h.success === (status === 'success'));
      }

      const paginatedHistory = filteredHistory.slice(offset, offset + limit);

      return c.json({
        logs: paginatedHistory,
        total: filteredHistory.length,
        limit,
        offset,
      });
    }

    // Get all execution history
    const allSchedules = scheduleManager.getAllSchedules();
    const allLogs: (ScheduleExecutionResult & { scheduleName: string })[] = [];

    for (const schedule of allSchedules) {
      const history = scheduleManager.getExecutionHistory(schedule.id);
      for (const execution of history) {
        allLogs.push({
          ...execution,
          scheduleName: schedule.name,
        });
      }
    }

    // Sort by execution time (newest first)
    allLogs.sort((a, b) => b.executionTime.getTime() - a.executionTime.getTime());

    // Apply status filter if provided
    let filteredLogs = allLogs;
    if (status) {
      filteredLogs = allLogs.filter(log => log.success === (status === 'success'));
    }

    const paginatedLogs = filteredLogs.slice(offset, offset + limit);

    return c.json({
      logs: paginatedLogs,
      total: filteredLogs.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to get notification logs:', error);
    return c.json({ error: 'Failed to get notification logs', details: (error as Error).message }, 500);
  }
});

// Get system status
app.get('/status', async (c) => {
  try {
    const scheduleManager = getScheduleManager();
    const systemStatus = scheduleManager.getSystemStatus();

    // Test connections
    let emailStatus = 'unknown';
    let slackStatus = 'unknown';

    try {
      const emailScheduler = getEmailScheduler();
      emailStatus = await emailScheduler.verifyConnection() ? 'connected' : 'disconnected';
    } catch {
      emailStatus = 'error';
    }

    try {
      const slackScheduler = getSlackScheduler();
      slackStatus = await slackScheduler.verifyConnection() ? 'connected' : 'disconnected';
    } catch {
      slackStatus = 'error';
    }

    return c.json({
      system: systemStatus,
      connections: {
        email: emailStatus,
        slack: slackStatus,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get system status:', error);
    return c.json({ error: 'Failed to get system status', details: (error as Error).message }, 500);
  }
});

// Get available templates
app.get('/templates', async (c) => {
  try {
    const templateEngine = getTemplateEngine();
    
    return c.json({
      email: templateEngine.getEmailTemplates(),
      slack: templateEngine.getSlackTemplates(),
    });
  } catch (error) {
    console.error('Failed to get templates:', error);
    return c.json({ error: 'Failed to get templates', details: (error as Error).message }, 500);
  }
});

// Preview template
app.post(
  '/templates/preview',
  zValidator(
    'json',
    z.object({
      type: z.enum(['email', 'slack']),
      template: z.string(),
      variables: z.object({
        dashboardName: z.string().default('Sample Dashboard'),
        scheduleName: z.string().default('Sample Schedule'),
        recipientName: z.string().default('John Doe'),
        customData: z.record(z.any()).optional(),
      }),
    })
  ),
  async (c) => {
    try {
      const { type, template, variables } = c.req.valid('json');
      const templateEngine = getTemplateEngine();

      if (type === 'email') {
        const rendered = templateEngine.renderEmailTemplate(template, variables);
        return c.json({ rendered });
      } else {
        const rendered = templateEngine.renderSlackTemplate(template, variables);
        return c.json({ rendered });
      }
    } catch (error) {
      console.error('Failed to preview template:', error);
      return c.json({ error: 'Failed to preview template', details: (error as Error).message }, 500);
    }
  }
);

// Validate cron expression
app.post(
  '/validate-cron',
  zValidator('json', z.object({ expression: z.string() })),
  async (c) => {
    try {
      const { expression } = c.req.valid('json');
      
      // Basic cron validation (you might want to use a proper cron parser library)
      const isValid = /^[0-9\*\,\/\-\s]+$/.test(expression);
      
      if (!isValid) {
        return c.json({ valid: false, error: 'Invalid cron expression format' });
      }

      // Additional validation for cron parts
      const parts = expression.trim().split(/\s+/);
      if (parts.length !== 5) {
        return c.json({ valid: false, error: 'Cron expression must have 5 parts' });
      }

      return c.json({ valid: true });
    } catch (error) {
      console.error('Failed to validate cron expression:', error);
      return c.json({ error: 'Failed to validate cron expression', details: (error as Error).message }, 500);
    }
  }
);

export default app;