import { chromium, Browser, Page } from 'playwright';
import { z } from 'zod';

export const ExportOptionsSchema = z.object({
  url: z.string().url(),
  format: z.enum(['pdf', 'png']),
  width: z.number().default(1920),
  height: z.number().default(1080),
  waitForSelector: z.string().optional(),
  waitForTimeout: z.number().default(5000),
  fullPage: z.boolean().default(true),
  quality: z.number().min(0).max(100).default(90).optional(),
});

export type ExportOptions = z.infer<typeof ExportOptionsSchema>;

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
  size: number;
}

export class PlaywrightExporter {
  private browser: Browser | null = null;

  // Public getter for browser access
  getBrowser(): Browser | null {
    return this.browser;
  }

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
      });
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    const validatedOptions = ExportOptionsSchema.parse(options);

    await this.initialize();
    if (!this.browser) {
      throw new Error('Failed to initialize browser');
    }

    const page = await this.browser.newPage({
      viewport: {
        width: validatedOptions.width,
        height: validatedOptions.height,
      },
    });

    try {
      // Navigate to the dashboard URL
      await page.goto(validatedOptions.url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Wait for specific selector if provided
      if (validatedOptions.waitForSelector) {
        await page.waitForSelector(validatedOptions.waitForSelector, {
          timeout: validatedOptions.waitForTimeout,
        });
      } else {
        // Default wait for page content to load
        await page.waitForTimeout(validatedOptions.waitForTimeout);
      }

      // Wait for any charts/visualizations to load
      await this.waitForChartsToLoad(page);

      let buffer: Buffer;
      let contentType: string;
      let filename: string;

      if (validatedOptions.format === 'pdf') {
        buffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '20px',
            bottom: '20px',
            left: '20px',
            right: '20px',
          },
        });
        contentType = 'application/pdf';
        filename = `export-${Date.now()}.pdf`;
      } else {
        buffer = await page.screenshot({
          fullPage: validatedOptions.fullPage,
          type: 'png',
          quality: validatedOptions.quality,
        });
        contentType = 'image/png';
        filename = `export-${Date.now()}.png`;
      }

      return {
        buffer,
        filename,
        contentType,
        size: buffer.length,
      };
    } finally {
      await page.close();
    }
  }

  private async waitForChartsToLoad(page: Page): Promise<void> {
    // Wait for common chart libraries to finish rendering
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const checkCharts = () => {
          // Check for common chart selectors and loading states
          const chartSelectors = [
            '[data-testid="chart"]',
            '.recharts-wrapper',
            '.highcharts-container',
            '.plotly-graph-div',
            'canvas[data-chart-id]',
            '.chart-container',
          ];

          const loadingSelectors = [
            '.loading',
            '.spinner',
            '[data-loading="true"]',
            '.chart-loading',
          ];

          // Check if any loading indicators are still present
          const hasLoading = loadingSelectors.some((selector) => document.querySelector(selector));

          if (hasLoading) {
            setTimeout(checkCharts, 100);
            return;
          }

          // Check if charts are present and rendered
          const hasCharts = chartSelectors.some((selector) => {
            const elements = document.querySelectorAll(selector);
            return (
              elements.length > 0 &&
              Array.from(elements).every((el) => (el as HTMLElement).offsetHeight > 0)
            );
          });

          if (hasCharts) {
            // Additional wait for chart animations to complete
            setTimeout(resolve, 500);
          } else {
            // No charts detected, proceed
            resolve();
          }
        };

        checkCharts();
      });
    });
  }

  async exportWithRetry(options: ExportOptions, maxRetries: number = 3): Promise<ExportResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.export(options);
      } catch (error) {
        lastError = error as Error;
        console.warn(`Export attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(`Export failed after ${maxRetries} attempts: ${lastError?.message}`);
  }
}

// Singleton instance for reuse across requests
let exporterInstance: PlaywrightExporter | null = null;

export function getExporter(): PlaywrightExporter {
  if (!exporterInstance) {
    exporterInstance = new PlaywrightExporter();
  }
  return exporterInstance;
}

// Cleanup function for graceful shutdown
export async function cleanupExporter(): Promise<void> {
  if (exporterInstance) {
    await exporterInstance.cleanup();
    exporterInstance = null;
  }
}
