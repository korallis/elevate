import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { pdfGenerator, pngGenerator, reportBuilder } from '@sme/exporter';
import ExcelJS from 'exceljs';
import { exporterFailure, exporterSuccess } from '../metrics.js';
import { hasPgConfig, runPostgresQuery } from '../postgres.js';
import type { ReportOptions } from '@sme/exporter';

const app = new Hono();

// Job tracking for async exports
const exportJobs = new Map<string, {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: Buffer;
  filename?: string;
  contentType?: string;
  error?: string;
  createdAt: Date;
}>();

// Cleanup old jobs (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [id, job] of exportJobs.entries()) {
    if (job.createdAt < oneHourAgo) {
      exportJobs.delete(id);
    }
  }
}, 15 * 60 * 1000); // Clean every 15 minutes

// Dashboard PDF export
app.post(
  '/dashboard/:id/pdf',
  zValidator(
    'json',
    z.object({
      title: z.string().optional(),
      format: z.enum(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']).default('A4'),
      orientation: z.enum(['portrait', 'landscape']).default('portrait'),
      includeWatermark: z.boolean().default(false),
      watermarkText: z.string().optional(),
      async: z.boolean().default(false),
    })
  ),
  async (c) => {
    try {
      const dashboardId = c.req.param('id');
      const options = c.req.valid('json');

      if (options.async) {
        // Handle async export
        const jobId = `pdf-${dashboardId}-${Date.now()}`;
        exportJobs.set(jobId, {
          id: jobId,
          status: 'pending',
          createdAt: new Date(),
        });

        // Process in background
        (async () => {
          try {
            const job = exportJobs.get(jobId);
            if (job) {
              job.status = 'processing';
              exportJobs.set(jobId, job);
            }

            let result;
            if (options.includeWatermark && options.watermarkText) {
              result = await pdfGenerator.generatePDFWithWatermark(
                `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${dashboardId}/view`,
                options.watermarkText,
                {
                  title: options.title,
                  format: options.format,
                  orientation: options.orientation,
                }
              );
            } else {
              result = await pdfGenerator.generateDashboardPDF(dashboardId, {
                title: options.title,
                format: options.format,
                orientation: options.orientation,
              });
            }

            const jobUpdate = exportJobs.get(jobId);
            if (jobUpdate) {
              jobUpdate.status = 'completed';
              jobUpdate.result = result.buffer;
              jobUpdate.filename = result.filename;
              jobUpdate.contentType = result.contentType;
              exportJobs.set(jobId, jobUpdate);
            }
          } catch (error) {
            const jobUpdate = exportJobs.get(jobId);
            if (jobUpdate) {
              jobUpdate.status = 'failed';
              jobUpdate.error = (error as Error).message;
              exportJobs.set(jobId, jobUpdate);
            }
          }
        })();

        return c.json({ jobId, status: 'pending' });
      } else {
        // Handle synchronous export
        let result;
        if (options.includeWatermark && options.watermarkText) {
          result = await pdfGenerator.generatePDFWithWatermark(
            `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${dashboardId}/view`,
            options.watermarkText,
            {
              title: options.title,
              format: options.format,
              orientation: options.orientation,
            }
          );
        } else {
          result = await pdfGenerator.generateDashboardPDF(dashboardId, {
            title: options.title,
            format: options.format,
            orientation: options.orientation,
          });
        }

        exporterSuccess.labels('pdf').inc();
        c.header('Content-Type', result.contentType);
        c.header('Content-Disposition', `attachment; filename="${result.filename}"`);
        return c.body(result.buffer);
      }
    } catch (error) {
      console.error('PDF export error:', error);
      exporterFailure.labels('pdf').inc();
      return c.json({ error: 'PDF export failed', details: (error as Error).message }, 500);
    }
  }
);

// Dashboard PNG export
app.post(
  '/dashboard/:id/png',
  zValidator(
    'json',
    z.object({
      width: z.number().min(100).max(4000).default(1920),
      height: z.number().min(100).max(4000).default(1080),
      quality: z.number().min(0).max(100).default(90),
      fullPage: z.boolean().default(true),
      highDPI: z.boolean().default(false),
      widgetId: z.string().optional(), // Export specific widget
      async: z.boolean().default(false),
    })
  ),
  async (c) => {
    try {
      const dashboardId = c.req.param('id');
      const options = c.req.valid('json');

      if (options.async) {
        // Handle async export
        const jobId = `png-${dashboardId}-${Date.now()}`;
        exportJobs.set(jobId, {
          id: jobId,
          status: 'pending',
          createdAt: new Date(),
        });

        // Process in background
        (async () => {
          try {
            const job = exportJobs.get(jobId);
            if (job) {
              job.status = 'processing';
              exportJobs.set(jobId, job);
            }

            let result;
            if (options.widgetId) {
              result = await pngGenerator.generateWidgetPNG(dashboardId, options.widgetId, {
                width: options.width,
                height: options.height,
                quality: options.quality,
                fullPage: options.fullPage,
                deviceScaleFactor: options.highDPI ? 2 : 1,
              });
            } else if (options.highDPI) {
              const url = `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${dashboardId}/view`;
              result = await pngGenerator.generateHighDPIScreenshot(url, {
                width: options.width,
                height: options.height,
                quality: options.quality,
                fullPage: options.fullPage,
              });
            } else {
              result = await pngGenerator.generateDashboardPNG(dashboardId, {
                width: options.width,
                height: options.height,
                quality: options.quality,
                fullPage: options.fullPage,
              });
            }

            const jobUpdate = exportJobs.get(jobId);
            if (jobUpdate) {
              jobUpdate.status = 'completed';
              jobUpdate.result = result.buffer;
              jobUpdate.filename = result.filename;
              jobUpdate.contentType = result.contentType;
              exportJobs.set(jobId, jobUpdate);
            }
          } catch (error) {
            const jobUpdate = exportJobs.get(jobId);
            if (jobUpdate) {
              jobUpdate.status = 'failed';
              jobUpdate.error = (error as Error).message;
              exportJobs.set(jobId, jobUpdate);
            }
          }
        })();

        return c.json({ jobId, status: 'pending' });
      } else {
        // Handle synchronous export
        let result;
        if (options.widgetId) {
          result = await pngGenerator.generateWidgetPNG(dashboardId, options.widgetId, {
            width: options.width,
            height: options.height,
            quality: options.quality,
            fullPage: options.fullPage,
            deviceScaleFactor: options.highDPI ? 2 : 1,
          });
        } else if (options.highDPI) {
          const url = `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${dashboardId}/view`;
          result = await pngGenerator.generateHighDPIScreenshot(url, {
            width: options.width,
            height: options.height,
            quality: options.quality,
            fullPage: options.fullPage,
          });
        } else {
          result = await pngGenerator.generateDashboardPNG(dashboardId, {
            width: options.width,
            height: options.height,
            quality: options.quality,
            fullPage: options.fullPage,
          });
        }

        exporterSuccess.labels('png').inc();
        c.header('Content-Type', result.contentType);
        c.header('Content-Disposition', `attachment; filename="${result.filename}"`);
        return c.body(result.buffer);
      }
    } catch (error) {
      console.error('PNG export error:', error);
      exporterFailure.labels('png').inc();
      return c.json({ error: 'PNG export failed', details: (error as Error).message }, 500);
    }
  }
);

// Multi-page report generation
app.post(
  '/report',
  zValidator(
    'json',
    z.object({
      title: z.string(),
      description: z.string().optional(),
      pages: z.array(
        z.object({
          type: z.enum(['dashboard', 'custom', 'cover', 'summary']),
          title: z.string(),
          dashboardId: z.string().optional(),
          url: z.string().url().optional(),
          content: z.string().optional(),
          waitForSelector: z.string().optional(),
          customCSS: z.string().optional(),
        })
      ),
      format: z.enum(['pdf', 'png']).default('pdf'),
      includeTableOfContents: z.boolean().default(true),
      includeCoverPage: z.boolean().default(true),
      watermark: z.string().optional(),
      theme: z.enum(['light', 'dark']).default('light'),
      pageOrientation: z.enum(['portrait', 'landscape']).default('portrait'),
      pageSize: z.enum(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']).default('A4'),
      async: z.boolean().default(true), // Reports are typically async due to complexity
    })
  ),
  async (c) => {
    try {
      const options = c.req.valid('json') as ReportOptions & { async: boolean };

      if (options.async) {
        const jobId = `report-${Date.now()}`;
        exportJobs.set(jobId, {
          id: jobId,
          status: 'pending',
          createdAt: new Date(),
        });

        // Process in background
        (async () => {
          try {
            const job = exportJobs.get(jobId);
            if (job) {
              job.status = 'processing';
              exportJobs.set(jobId, job);
            }

            const result = await reportBuilder.generateReport(options);

            const jobUpdate = exportJobs.get(jobId);
            if (jobUpdate) {
              jobUpdate.status = 'completed';
              jobUpdate.result = result.buffer;
              jobUpdate.filename = result.filename;
              jobUpdate.contentType = result.contentType;
              exportJobs.set(jobId, jobUpdate);
            }
          } catch (error) {
            const jobUpdate = exportJobs.get(jobId);
            if (jobUpdate) {
              jobUpdate.status = 'failed';
              jobUpdate.error = (error as Error).message;
              exportJobs.set(jobId, jobUpdate);
            }
          }
        })();

        return c.json({ jobId, status: 'pending' });
      } else {
        const result = await reportBuilder.generateReport(options);
        c.header('Content-Type', result.contentType);
        c.header('Content-Disposition', `attachment; filename="${result.filename}"`);
        return c.body(result.buffer);
      }
    } catch (error) {
      console.error('Report generation error:', error);
      return c.json({ error: 'Report generation failed', details: (error as Error).message }, 500);
    }
  }
);

// Check export job status
app.get('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const job = exportJobs.get(jobId);

    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    if (job.status === 'completed' && job.result) {
      // Return the completed result
      c.header('Content-Type', job.contentType || 'application/octet-stream');
      c.header('Content-Disposition', `attachment; filename="${job.filename || 'export'}"`);
      return c.body(job.result);
    } else {
      // Return job status
      return c.json({
        jobId: job.id,
        status: job.status,
        error: job.error,
        createdAt: job.createdAt,
      });
    }
  } catch (error) {
    console.error('Job status error:', error);
    return c.json({ error: 'Failed to get job status', details: (error as Error).message }, 500);
  }
});

// List active export jobs
app.get('/jobs', async (c) => {
  try {
    const jobs = Array.from(exportJobs.values()).map(job => ({
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      error: job.error,
    }));

    return c.json({ jobs });
  } catch (error) {
    console.error('Jobs list error:', error);
    return c.json({ error: 'Failed to list jobs', details: (error as Error).message }, 500);
  }
});

// Generate thumbnail for dashboard
app.post(
  '/dashboard/:id/thumbnail',
  zValidator(
    'json',
    z.object({
      width: z.number().min(50).max(800).default(400),
      height: z.number().min(50).max(600).default(300),
    })
  ),
  async (c) => {
    try {
      const dashboardId = c.req.param('id');
      const { width, height } = c.req.valid('json');

      const url = `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${dashboardId}/view`;
      const result = await pngGenerator.generateThumbnail(url, { width, height });

      c.header('Content-Type', result.contentType);
      c.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      return c.body(result.buffer);
    } catch (error) {
      console.error('Thumbnail generation error:', error);
      return c.json({ error: 'Thumbnail generation failed', details: (error as Error).message }, 500);
    }
  }
);

// XLSX export of posted data rows
app.post(
  '/xlsx',
  zValidator(
    'json',
    z.object({
      rows: z.array(z.record(z.any())),
      fields: z.array(z.string()).optional(),
      filename: z.string().optional(),
      sheetName: z.string().optional(),
      stream: z.boolean().optional().default(true),
      maxBytes: z.number().optional().default(50 * 1024 * 1024), // 50MB guardrail
    })
  ),
  async (c) => {
    try {
      const { rows, fields, filename, sheetName, stream: doStream, maxBytes } = c.req.valid('json');
      if (!Array.isArray(rows)) {
        return c.json({ error: 'rows array required' }, 400);
      }

      const cols = fields && fields.length > 0 ? fields : Object.keys(rows[0] || {});

      // Estimate payload size to enforce guardrail when not streaming
      if (!doStream) {
        const approxBytes = rows.slice(0, 1000).reduce((acc, r) => {
          for (const k of cols) {
            const v = (r as Record<string, unknown>)[k];
            const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
            acc += Math.min(1024, s.length); // cap per-cell for estimate
          }
          return acc;
        }, 0);
        const scale = rows.length / Math.max(1, Math.min(rows.length, 1000));
        if (approxBytes * scale > maxBytes) {
          return c.json({ error: 'payload_too_large', hint: 'Enable streaming or reduce rows' }, 413);
        }
      }

      const fname = `${filename || 'export'}.xlsx`;

      if (doStream) {
        // Streaming writer to keep memory stable for large datasets
        const { PassThrough } = await import('node:stream');
        const pt = new PassThrough();
        const writer = new (ExcelJS as any).stream.xlsx.WorkbookWriter({
          stream: pt,
          useStyles: false,
          useSharedStrings: true,
        });
        const ws = writer.addWorksheet(sheetName || 'Export');
        ws.columns = cols.map((key: string) => ({ header: key, key }));
        // Commit header row styling (bold)
        const header = ws.getRow(1);
        header.font = { bold: true } as any;
        header.commit();
        for (const r of rows) {
          const values = cols.map((k) => {
            const v = (r as Record<string, unknown>)[k];
            if (v == null) return null;
            if (typeof v === 'number' || typeof v === 'boolean') return v;
            if (typeof v === 'string') {
              const d = new Date(v);
              if (!isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(v)) return d;
            }
            return String(v);
          });
          ws.addRow(values).commit();
        }
        ws.commit();
        writer.commit();

        const webStream = (await import('node:stream')).Readable.toWeb(pt) as unknown as ReadableStream;
        // Audit and metrics
        if (hasPgConfig()) {
          try {
            await runPostgresQuery('insert into audit_logs(event, details) values($1,$2)', [
              'export_xlsx',
              { filename: fname, rows: rows.length, streaming: true },
            ] as unknown[]);
          } catch {}
        }
        exporterSuccess.labels('xlsx').inc();
        return new Response(webStream, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${fname}"`,
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
          },
        });
      }

      // Non-streaming small payload
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetName || 'Export');
      ws.columns = cols.map((key) => ({ header: key, key }));
      const header = ws.getRow(1);
      header.font = { bold: true } as any;
      header.commit?.();
      for (const r of rows) {
        const values = cols.map((k) => {
          const v = (r as Record<string, unknown>)[k];
          if (v == null) return null;
          if (typeof v === 'number' || typeof v === 'boolean') return v;
          if (typeof v === 'string') {
            const d = new Date(v);
            if (!isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(v)) return d;
          }
          return String(v);
        });
        ws.addRow(values);
      }
      ws.columns?.forEach((col) => {
        let max = (col.header?.toString().length || 10) + 2;
        col.eachCell({ includeEmpty: false }, (cell) => {
          const len = (cell.value?.toString() || '').length;
          if (len > max) max = len;
        });
        (col as any).width = Math.min(Math.max(10, max + 2), 60);
      });
      const buffer = await wb.xlsx.writeBuffer();

      // Audit log
      if (hasPgConfig()) {
        try {
          await runPostgresQuery('insert into audit_logs(event, details) values($1,$2)', [
            'export_xlsx',
            { filename: fname, rows: rows.length, streaming: false },
          ] as unknown[]);
        } catch {}
      }
      exporterSuccess.labels('xlsx').inc();
      return new Response(buffer as any, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fname}"`,
        },
      });
    } catch (error) {
      exporterFailure.labels('xlsx').inc();
      return c.json({ error: 'XLSX export failed', details: (error as Error).message }, 500);
    }
  }
);

export default app;
