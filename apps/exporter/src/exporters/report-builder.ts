import { z } from 'zod';
import { PDFGenerator } from './pdf-generator.js';
import { PNGGenerator } from './png-generator.js';
import { getExporter } from './playwright-exporter.js';

export const ReportPageSchema = z.object({
  type: z.enum(['dashboard', 'custom', 'cover', 'summary']),
  title: z.string(),
  dashboardId: z.string().optional(),
  url: z.string().url().optional(),
  content: z.string().optional(), // HTML content for custom pages
  waitForSelector: z.string().optional(),
  customCSS: z.string().optional(),
});

export const ReportOptionsSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  pages: z.array(ReportPageSchema),
  format: z.enum(['pdf', 'png']).default('pdf'),
  includeTableOfContents: z.boolean().default(true),
  includeCoverPage: z.boolean().default(true),
  headerTemplate: z.string().optional(),
  footerTemplate: z.string().optional(),
  watermark: z.string().optional(),
  theme: z.enum(['light', 'dark']).default('light'),
  pageOrientation: z.enum(['portrait', 'landscape']).default('portrait'),
  pageSize: z.enum(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']).default('A4'),
});

export type ReportPage = z.infer<typeof ReportPageSchema>;
export type ReportOptions = z.infer<typeof ReportOptionsSchema>;

export interface ReportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
  size: number;
  pageCount?: number;
}

export class ReportBuilder {
  private pdfGenerator: PDFGenerator;
  private pngGenerator: PNGGenerator;

  constructor() {
    this.pdfGenerator = new PDFGenerator();
    this.pngGenerator = new PNGGenerator();
  }

  async generateReport(options: ReportOptions): Promise<ReportResult> {
    const validatedOptions = ReportOptionsSchema.parse(options);

    if (validatedOptions.format === 'pdf') {
      return this.generatePDFReport(validatedOptions);
    } else {
      return this.generatePNGReport(validatedOptions);
    }
  }

  private async generatePDFReport(options: ReportOptions): Promise<ReportResult> {
    const exporter = getExporter();
    await exporter.initialize();

    const browser = exporter.getBrowser();
    if (!browser) {
      throw new Error('Browser not initialized');
    }

    const page = await browser.newPage({
      viewport: {
        width: options.pageOrientation === 'landscape' ? 1920 : 1080,
        height: options.pageOrientation === 'landscape' ? 1080 : 1920,
      },
    });

    try {
      const html = await this.buildReportHTML(options);

      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Apply theme styling
      await page.addStyleTag({
        content: this.getThemeCSS(options.theme),
      });

      // Wait for all content to load
      await page.waitForTimeout(5000);

      const headerTemplate = this.buildHeaderTemplate(options);
      const footerTemplate = this.buildFooterTemplate(options);

      const buffer = await page.pdf({
        format: options.pageSize,
        landscape: options.pageOrientation === 'landscape',
        margin: {
          top: '60px',
          right: '40px',
          bottom: '60px',
          left: '40px',
        },
        headerTemplate,
        footerTemplate,
        displayHeaderFooter: true,
        printBackground: true,
        scale: 0.8,
      });

      const filename = `${options.title.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`;

      return {
        buffer,
        filename,
        contentType: 'application/pdf',
        size: buffer.length,
        pageCount:
          options.pages.length +
          (options.includeCoverPage ? 1 : 0) +
          (options.includeTableOfContents ? 1 : 0),
      };
    } finally {
      await page.close();
    }
  }

  private async generatePNGReport(options: ReportOptions): Promise<ReportResult> {
    // For PNG reports, we'll create individual images for each page
    // and combine them into a single image or zip file
    const images: Buffer[] = [];

    for (const pageConfig of options.pages) {
      let buffer: Buffer;

      if (pageConfig.type === 'dashboard' && pageConfig.dashboardId) {
        const result = await this.pngGenerator.generateDashboardPNG(pageConfig.dashboardId, {
          width: 1920,
          height: 1080,
          customCSS: pageConfig.customCSS,
          waitForSelector: pageConfig.waitForSelector,
        });
        buffer = result.buffer;
      } else if (pageConfig.url) {
        const result = await this.pngGenerator.generateCustomPNG({
          url: pageConfig.url,
          width: 1920,
          height: 1080,
          waitForTimeout: 5000,
          fullPage: true,
          quality: 90,
          deviceScaleFactor: 1,
          animations: 'disabled',
          customCSS: pageConfig.customCSS,
          waitForSelector: pageConfig.waitForSelector,
        });
        buffer = result.buffer;
      } else {
        // Generate a custom page with content
        const html = this.buildCustomPageHTML(pageConfig, options);
        const result = await this.generateHTMLToPNG(html);
        buffer = result.buffer;
      }

      images.push(buffer);
    }

    // For now, return the first image. In a real implementation,
    // you might want to combine images or create a zip file
    const buffer = images[0] || Buffer.alloc(0);
    const filename = `${options.title.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.png`;

    return {
      buffer,
      filename,
      contentType: 'image/png',
      size: buffer.length,
      pageCount: images.length,
    };
  }

  private async buildReportHTML(options: ReportOptions): Promise<string> {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${options.title}</title>
        <style>
          ${this.getBaseCSS()}
          ${this.getThemeCSS(options.theme)}
        </style>
      </head>
      <body>
    `;

    // Add cover page
    if (options.includeCoverPage) {
      html += this.buildCoverPageHTML(options);
    }

    // Add table of contents
    if (options.includeTableOfContents) {
      html += this.buildTableOfContentsHTML(options);
    }

    // Add report pages
    for (let i = 0; i < options.pages.length; i++) {
      const page = options.pages[i];
      html += await this.buildPageHTML(page, options);
    }

    html += `
      </body>
      </html>
    `;

    return html;
  }

  private buildCoverPageHTML(options: ReportOptions): string {
    return `
      <div class="cover-page page-break">
        <div class="cover-content">
          <h1 class="report-title">${options.title}</h1>
          ${options.description ? `<p class="report-description">${options.description}</p>` : ''}
          <div class="cover-meta">
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
            <p>Pages: ${options.pages.length}</p>
          </div>
          ${options.watermark ? `<div class="watermark">${options.watermark}</div>` : ''}
        </div>
      </div>
    `;
  }

  private buildTableOfContentsHTML(options: ReportOptions): string {
    let tocHTML = `
      <div class="toc-page page-break">
        <h2>Table of Contents</h2>
        <ul class="toc-list">
    `;

    options.pages.forEach((page, index) => {
      tocHTML += `
        <li class="toc-item">
          <span class="toc-title">${page.title}</span>
          <span class="toc-page-number">${index + 1}</span>
        </li>
      `;
    });

    tocHTML += `
        </ul>
      </div>
    `;

    return tocHTML;
  }

  private async buildPageHTML(page: ReportPage, options: ReportOptions): Promise<string> {
    let pageHTML = `<div class="report-page page-break">`;
    pageHTML += `<h3 class="page-title">${page.title}</h3>`;

    if (page.type === 'dashboard' && page.dashboardId) {
      // For dashboard pages, we'll embed an iframe or placeholder
      pageHTML += `
        <div class="dashboard-container">
          <p>Dashboard: ${page.dashboardId}</p>
          <p class="note">Dashboard content will be rendered when generating the actual report</p>
        </div>
      `;
    } else if (page.type === 'custom' && page.content) {
      pageHTML += `<div class="custom-content">${page.content}</div>`;
    } else if (page.type === 'summary') {
      pageHTML += this.buildSummaryPageHTML(options);
    }

    pageHTML += `</div>`;

    return pageHTML;
  }

  private buildCustomPageHTML(page: ReportPage, options: ReportOptions): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${page.title}</title>
        <style>
          ${this.getBaseCSS()}
          ${this.getThemeCSS(options.theme)}
          ${page.customCSS || ''}
        </style>
      </head>
      <body>
        <div class="custom-page">
          <h1>${page.title}</h1>
          ${page.content || ''}
        </div>
      </body>
      </html>
    `;
  }

  private buildSummaryPageHTML(options: ReportOptions): string {
    return `
      <div class="summary-content">
        <h4>Report Summary</h4>
        <ul>
          <li>Total Pages: ${options.pages.length}</li>
          <li>Generated: ${new Date().toLocaleString()}</li>
          <li>Format: ${options.format.toUpperCase()}</li>
          <li>Theme: ${options.theme}</li>
        </ul>
      </div>
    `;
  }

  private buildHeaderTemplate(options: ReportOptions): string {
    return (
      options.headerTemplate ||
      `
      <div style="font-size: 10px; padding: 5px; width: 100%; text-align: center;">
        ${options.title}
      </div>
    `
    );
  }

  private buildFooterTemplate(options: ReportOptions): string {
    return (
      options.footerTemplate ||
      `
      <div style="font-size: 10px; padding: 5px; width: 100%; display: flex; justify-content: space-between;">
        <span>Generated on ${new Date().toLocaleDateString()}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `
    );
  }

  private getBaseCSS(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
      }

      .page-break {
        page-break-before: always;
        min-height: 100vh;
        padding: 20px;
      }

      .cover-page {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .report-title {
        font-size: 48px;
        font-weight: bold;
        margin-bottom: 20px;
      }

      .report-description {
        font-size: 18px;
        margin-bottom: 40px;
        max-width: 600px;
        line-height: 1.8;
      }

      .cover-meta {
        margin-top: 40px;
        font-size: 14px;
        opacity: 0.8;
      }

      .toc-page {
        padding-top: 40px;
      }

      .toc-list {
        list-style: none;
        margin-top: 20px;
      }

      .toc-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px dotted #ccc;
      }

      .page-title {
        font-size: 24px;
        margin-bottom: 20px;
        border-bottom: 2px solid #007acc;
        padding-bottom: 10px;
      }

      .dashboard-container {
        border: 2px dashed #ccc;
        padding: 40px;
        text-align: center;
        border-radius: 8px;
        margin: 20px 0;
      }

      .custom-content {
        margin-top: 20px;
      }

      .watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 60px;
        opacity: 0.1;
        font-weight: bold;
        z-index: -1;
      }

      @media print {
        .page-break {
          page-break-before: always;
        }
      }
    `;
  }

  private getThemeCSS(theme: 'light' | 'dark'): string {
    if (theme === 'dark') {
      return `
        body {
          background-color: #1a1a1a;
          color: #ffffff;
        }

        .page-title {
          border-bottom-color: #4a9eff;
          color: #ffffff;
        }

        .toc-item {
          border-bottom-color: #444;
        }

        .dashboard-container {
          border-color: #444;
          background-color: #2a2a2a;
        }
      `;
    }

    return `
      body {
        background-color: #ffffff;
        color: #333333;
      }
    `;
  }

  private async generateHTMLToPNG(
    html: string,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string; size: number }> {
    const exporter = getExporter();
    await exporter.initialize();

    const browser = exporter.getBrowser();
    if (!browser) {
      throw new Error('Browser not initialized');
    }

    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });

    try {
      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      const buffer = await page.screenshot({
        fullPage: true,
        type: 'png',
        quality: 90,
      });

      return {
        buffer,
        filename: `custom-page-${Date.now()}.png`,
        contentType: 'image/png',
        size: buffer.length,
      };
    } finally {
      await page.close();
    }
  }
}

export const reportBuilder = new ReportBuilder();
