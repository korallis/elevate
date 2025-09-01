import { Page } from 'playwright';
import { z } from 'zod';
import { getExporter, ExportResult } from './playwright-exporter.js';

export const PDFOptionsSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  format: z.enum(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']).default('A4'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  margin: z
    .object({
      top: z.string().default('20px'),
      right: z.string().default('20px'),
      bottom: z.string().default('20px'),
      left: z.string().default('20px'),
    })
    .default({}),
  headerTemplate: z.string().default(''),
  footerTemplate: z.string().default(''),
  displayHeaderFooter: z.boolean().default(false),
  printBackground: z.boolean().default(true),
  scale: z.number().min(0.1).max(2).default(1),
  waitForSelector: z.string().optional(),
  waitForTimeout: z.number().default(5000),
  customCSS: z.string().optional(),
});

export type PDFOptions = z.infer<typeof PDFOptionsSchema>;

export class PDFGenerator {
  async generateDashboardPDF(
    dashboardId: string,
    options: Partial<PDFOptions> = {},
  ): Promise<ExportResult> {
    const validatedOptions = PDFOptionsSchema.parse({
      url: `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${dashboardId}/view`,
      ...options,
    });

    const exporter = getExporter();

    return await exporter.export({
      url: validatedOptions.url,
      format: 'pdf',
      width: validatedOptions.orientation === 'landscape' ? 1920 : 1080,
      height: validatedOptions.orientation === 'landscape' ? 1080 : 1920,
      waitForSelector: validatedOptions.waitForSelector,
      waitForTimeout: validatedOptions.waitForTimeout,
      fullPage: true,
    });
  }

  async generateCustomPDF(url: string, options: Partial<PDFOptions> = {}): Promise<ExportResult> {
    const validatedOptions = PDFOptionsSchema.parse({
      url,
      ...options,
    });

    const exporter = getExporter();
    await exporter.initialize();

    const browser = exporter.getBrowser();
    if (!browser) {
      throw new Error('Browser not initialized');
    }

    const page = await browser.newPage({
      viewport: {
        width: validatedOptions.orientation === 'landscape' ? 1920 : 1080,
        height: validatedOptions.orientation === 'landscape' ? 1080 : 1920,
      },
    });

    try {
      // Navigate to the page
      await page.goto(validatedOptions.url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Apply custom CSS if provided
      if (validatedOptions.customCSS) {
        await page.addStyleTag({
          content: validatedOptions.customCSS,
        });
      }

      // Wait for specific selector if provided
      if (validatedOptions.waitForSelector) {
        await page.waitForSelector(validatedOptions.waitForSelector, {
          timeout: validatedOptions.waitForTimeout,
        });
      } else {
        await page.waitForTimeout(validatedOptions.waitForTimeout);
      }

      // Wait for charts to load
      await this.waitForChartsToLoad(page);

      // Generate PDF with advanced options
      const buffer = await page.pdf({
        format: validatedOptions.format,
        landscape: validatedOptions.orientation === 'landscape',
        margin: validatedOptions.margin,
        headerTemplate: validatedOptions.headerTemplate,
        footerTemplate: validatedOptions.footerTemplate,
        displayHeaderFooter: validatedOptions.displayHeaderFooter,
        printBackground: validatedOptions.printBackground,
        scale: validatedOptions.scale,
      });

      const filename = `${validatedOptions.title || 'export'}-${Date.now()}.pdf`;

      return {
        buffer,
        filename,
        contentType: 'application/pdf',
        size: buffer.length,
      };
    } finally {
      await page.close();
    }
  }

  private async waitForChartsToLoad(page: Page): Promise<void> {
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const checkCharts = () => {
          const chartSelectors = [
            '[data-testid="chart"]',
            '.recharts-wrapper',
            '.highcharts-container',
            '.plotly-graph-div',
            'canvas[data-chart-id]',
            '.chart-container',
            '.widget-container',
            '[data-widget-type]',
          ];

          const loadingSelectors = [
            '.loading',
            '.spinner',
            '[data-loading="true"]',
            '.chart-loading',
            '.widget-loading',
          ];

          const hasLoading = loadingSelectors.some((selector) => document.querySelector(selector));

          if (hasLoading) {
            setTimeout(checkCharts, 100);
            return;
          }

          const hasCharts = chartSelectors.some((selector) => {
            const elements = document.querySelectorAll(selector);
            return (
              elements.length > 0 &&
              Array.from(elements).every((el) => (el as HTMLElement).offsetHeight > 0)
            );
          });

          if (hasCharts) {
            setTimeout(resolve, 1000); // Extra time for chart animations
          } else {
            resolve();
          }
        };

        checkCharts();
      });
    });
  }

  async generatePDFWithWatermark(
    url: string,
    watermarkText: string,
    options: Partial<PDFOptions> = {},
  ): Promise<ExportResult> {
    const watermarkCSS = `
      body::before {
        content: "${watermarkText}";
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 72px;
        color: rgba(0, 0, 0, 0.1);
        font-weight: bold;
        z-index: 9999;
        pointer-events: none;
        font-family: Arial, sans-serif;
      }
    `;

    return this.generateCustomPDF(url, {
      ...options,
      customCSS: `${options.customCSS || ''} ${watermarkCSS}`,
    });
  }
}

export const pdfGenerator = new PDFGenerator();
