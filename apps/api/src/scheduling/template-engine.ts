import { z } from 'zod';

export const TemplateVariableSchema = z.object({
  dashboardName: z.string().optional(),
  scheduleName: z.string().optional(),
  reportDate: z.string().optional(),
  recipientName: z.string().optional(),
  companyName: z.string().optional(),
  customData: z.record(z.any()).optional(),
});

export const EmailTemplateSchema = z.object({
  subject: z.string(),
  htmlBody: z.string(),
  textBody: z.string().optional(),
  preheader: z.string().optional(),
});

export const SlackTemplateSchema = z.object({
  message: z.string(),
  blocks: z.array(z.any()).optional(),
  attachments: z.array(z.any()).optional(),
});

export type TemplateVariables = z.infer<typeof TemplateVariableSchema>;
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;
export type SlackTemplate = z.infer<typeof SlackTemplateSchema>;

export class TemplateEngine {
  private emailTemplates = new Map<string, EmailTemplate>();
  private slackTemplates = new Map<string, SlackTemplate>();

  constructor() {
    this.loadDefaultTemplates();
  }

  // Template variable replacement
  private replaceVariables(template: string, variables: TemplateVariables): string {
    let result = template;

    // Standard variables
    if (variables.dashboardName) {
      result = result.replace(/\{\{dashboardName\}\}/g, variables.dashboardName);
    }
    if (variables.scheduleName) {
      result = result.replace(/\{\{scheduleName\}\}/g, variables.scheduleName);
    }
    if (variables.reportDate) {
      result = result.replace(/\{\{reportDate\}\}/g, variables.reportDate);
    }
    if (variables.recipientName) {
      result = result.replace(/\{\{recipientName\}\}/g, variables.recipientName);
    }
    if (variables.companyName) {
      result = result.replace(/\{\{companyName\}\}/g, variables.companyName);
    }

    // Custom data variables
    if (variables.customData) {
      for (const [key, value] of Object.entries(variables.customData)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, String(value));
      }
    }

    // Default date and time
    const now = new Date();
    result = result.replace(/\{\{currentDate\}\}/g, now.toLocaleDateString());
    result = result.replace(/\{\{currentTime\}\}/g, now.toLocaleTimeString());
    result = result.replace(/\{\{currentDateTime\}\}/g, now.toLocaleString());

    // Company defaults
    result = result.replace(/\{\{platformName\}\}/g, 'Elev8 Analytics');

    return result;
  }

  // Email template methods
  registerEmailTemplate(name: string, template: EmailTemplate): void {
    const validatedTemplate = EmailTemplateSchema.parse(template);
    this.emailTemplates.set(name, validatedTemplate);
  }

  renderEmailTemplate(templateName: string, variables: TemplateVariables): EmailTemplate {
    const template = this.emailTemplates.get(templateName);
    if (!template) {
      throw new Error(`Email template not found: ${templateName}`);
    }

    return {
      subject: this.replaceVariables(template.subject, variables),
      htmlBody: this.replaceVariables(template.htmlBody, variables),
      textBody: template.textBody ? this.replaceVariables(template.textBody, variables) : undefined,
      preheader: template.preheader ? this.replaceVariables(template.preheader, variables) : undefined,
    };
  }

  // Slack template methods
  registerSlackTemplate(name: string, template: SlackTemplate): void {
    const validatedTemplate = SlackTemplateSchema.parse(template);
    this.slackTemplates.set(name, validatedTemplate);
  }

  renderSlackTemplate(templateName: string, variables: TemplateVariables): SlackTemplate {
    const template = this.slackTemplates.get(templateName);
    if (!template) {
      throw new Error(`Slack template not found: ${templateName}`);
    }

    const rendered: SlackTemplate = {
      message: this.replaceVariables(template.message, variables),
    };

    if (template.blocks) {
      rendered.blocks = this.replaceVariablesInBlocks(template.blocks, variables);
    }

    if (template.attachments) {
      rendered.attachments = this.replaceVariablesInAttachments(template.attachments, variables);
    }

    return rendered;
  }

  private replaceVariablesInBlocks(blocks: any[], variables: TemplateVariables): any[] {
    return blocks.map(block => {
      const blockStr = JSON.stringify(block);
      const replacedStr = this.replaceVariables(blockStr, variables);
      return JSON.parse(replacedStr);
    });
  }

  private replaceVariablesInAttachments(attachments: any[], variables: TemplateVariables): any[] {
    return attachments.map(attachment => {
      const attachmentStr = JSON.stringify(attachment);
      const replacedStr = this.replaceVariables(attachmentStr, variables);
      return JSON.parse(replacedStr);
    });
  }

  // Template listing
  getEmailTemplates(): string[] {
    return Array.from(this.emailTemplates.keys());
  }

  getSlackTemplates(): string[] {
    return Array.from(this.slackTemplates.keys());
  }

  // Default templates
  private loadDefaultTemplates(): void {
    // Default email templates
    this.registerEmailTemplate('default_report', {
      subject: '📊 {{scheduleName}} - Dashboard Report',
      preheader: 'Your scheduled {{dashboardName}} report is ready',
      htmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>{{scheduleName}} Report</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #007acc 0%, #0056b3 100%);
              color: white;
              padding: 30px 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background: #fff;
              padding: 30px 20px;
              border: 1px solid #e0e0e0;
              border-top: none;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              border-radius: 0 0 8px 8px;
              font-size: 12px;
              color: #666;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #007acc;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              font-weight: bold;
              margin: 20px 0;
            }
            .metrics {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 6px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📊 {{scheduleName}}</h1>
            <p>Dashboard: {{dashboardName}}</p>
          </div>
          <div class="content">
            <p>Hello {{recipientName}},</p>
            <p>Your scheduled dashboard report is ready and attached to this email.</p>
            <div class="metrics">
              <h3>Report Details</h3>
              <ul>
                <li><strong>Dashboard:</strong> {{dashboardName}}</li>
                <li><strong>Generated:</strong> {{currentDateTime}}</li>
                <li><strong>Schedule:</strong> {{scheduleName}}</li>
              </ul>
            </div>
            <p>This report contains the latest data from your analytics dashboard.</p>
            <p>If you have any questions about this report, please contact your administrator.</p>
          </div>
          <div class="footer">
            <p>This is an automated report from {{platformName}}</p>
            <p>Generated on {{currentDateTime}}</p>
          </div>
        </body>
        </html>
      `,
      textBody: `
        {{scheduleName}} - Dashboard Report
        
        Hello {{recipientName}},
        
        Your scheduled dashboard report is ready and attached to this email.
        
        Report Details:
        - Dashboard: {{dashboardName}}
        - Generated: {{currentDateTime}}
        - Schedule: {{scheduleName}}
        
        This report contains the latest data from your analytics dashboard.
        
        If you have any questions about this report, please contact your administrator.
        
        ---
        This is an automated report from {{platformName}}
        Generated on {{currentDateTime}}
      `,
    });

    this.registerEmailTemplate('executive_summary', {
      subject: '📈 Executive Summary - {{dashboardName}}',
      preheader: 'Key metrics and insights from {{dashboardName}}',
      htmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Executive Summary</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
              color: white;
              padding: 30px 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .executive-summary {
              background: #fff;
              padding: 30px;
              border: 1px solid #e0e0e0;
            }
            .metric-card {
              background: #f8f9fa;
              padding: 20px;
              margin: 15px 0;
              border-left: 4px solid #007acc;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📈 Executive Summary</h1>
            <p>{{dashboardName}} - {{currentDate}}</p>
          </div>
          <div class="executive-summary">
            <p>Dear {{recipientName}},</p>
            <p>Please find attached the executive summary report for {{dashboardName}}.</p>
            <div class="metric-card">
              <h3>Key Highlights</h3>
              <p>This report includes comprehensive analytics and key performance indicators for the reporting period.</p>
            </div>
            <p>The attached report provides detailed insights and actionable recommendations based on the latest data.</p>
          </div>
        </body>
        </html>
      `,
    });

    // Default Slack templates
    this.registerSlackTemplate('default_report', {
      message: `📊 *{{scheduleName}}* - Dashboard Report Ready!

*Dashboard:* {{dashboardName}}
*Generated:* {{currentDateTime}}

Your scheduled report is attached above. Check out the latest insights! 📈`,
    });

    this.registerSlackTemplate('metrics_summary', {
      message: '📊 Dashboard Metrics Update',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 {{dashboardName}} - Metrics Update',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Schedule:* {{scheduleName}}\n*Updated:* {{currentDateTime}}',
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Your scheduled dashboard report is ready! 📈\n\nThe report contains the latest data and insights from your analytics dashboard.',
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Generated by {{platformName}} on {{currentDateTime}}',
            },
          ],
        },
      ],
    });

    this.registerSlackTemplate('alert_style', {
      message: '🚨 Important Dashboard Update',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 {{dashboardName}} Alert',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Attention:* New data available for {{dashboardName}}',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Schedule: {{scheduleName}}\nGenerated: {{currentDateTime}}',
          },
        },
      ],
    });
  }

  // Helper methods for creating custom templates
  createSimpleEmailTemplate(
    subject: string,
    heading: string,
    message: string,
    includeMetrics: boolean = true
  ): EmailTemplate {
    const metricsSection = includeMetrics ? `
      <div class="metrics">
        <h3>Report Details</h3>
        <ul>
          <li><strong>Dashboard:</strong> {{dashboardName}}</li>
          <li><strong>Generated:</strong> {{currentDateTime}}</li>
          <li><strong>Schedule:</strong> {{scheduleName}}</li>
        </ul>
      </div>
    ` : '';

    return {
      subject,
      htmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007acc; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .metrics { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${heading}</h1>
          </div>
          <div class="content">
            <p>Hello {{recipientName}},</p>
            <p>${message}</p>
            ${metricsSection}
            <p>Best regards,<br/>{{platformName}} Team</p>
          </div>
        </body>
        </html>
      `,
    };
  }

  createSimpleSlackTemplate(message: string, useBlocks: boolean = false): SlackTemplate {
    if (useBlocks) {
      return {
        message: '',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message,
            },
          },
        ],
      };
    }

    return { message };
  }
}

// Global instance
let globalTemplateEngine: TemplateEngine | null = null;

export function getTemplateEngine(): TemplateEngine {
  if (!globalTemplateEngine) {
    globalTemplateEngine = new TemplateEngine();
  }
  return globalTemplateEngine;
}