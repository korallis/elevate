import { Page } from 'playwright';
import { z } from 'zod';
import { getExporter, ExportResult } from './playwright-exporter.js';

export const PNGOptionsSchema = z.object({
  url: z.string().url(),
  width: z.number().min(100).max(4000).default(1920),
  height: z.number().min(100).max(4000).default(1080),
  quality: z.number().min(0).max(100).default(90),
  fullPage: z.boolean().default(true),
  clip: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  waitForSelector: z.string().optional(),
  waitForTimeout: z.number().default(5000),
  deviceScaleFactor: z.number().min(1).max(3).default(1),
  animations: z.enum(['disabled', 'allow']).default('disabled'),
  customCSS: z.string().optional(),
});

export type PNGOptions = z.infer<typeof PNGOptionsSchema>;

export class PNGGenerator {
  async generateDashboardPNG(
    dashboardId: string,
    options: Partial<PNGOptions> = {},
  ): Promise<ExportResult> {
    const validatedOptions = PNGOptionsSchema.parse({
      url: `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${dashboardId}/view`,
      ...options,
    });

    return this.generateCustomPNG(validatedOptions);
  }

  async generateWidgetPNG(
    dashboardId: string,
    widgetId: string,
    options: Partial<PNGOptions> = {},
  ): Promise<ExportResult> {
    const validatedOptions = PNGOptionsSchema.parse({
      url: `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/dashboards/${dashboardId}/view`,
      waitForSelector: `[data-widget-id="${widgetId}"]`,
      fullPage: false,
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
        width: validatedOptions.width,
        height: validatedOptions.height,
      },
      deviceScaleFactor: validatedOptions.deviceScaleFactor,
    });

    try {
      // Disable animations if specified
      if (validatedOptions.animations === 'disabled') {
        await page.addStyleTag({
          content: `
            *, *::before, *::after {
              animation-duration: 0s !important;
              animation-delay: 0s !important;
              transition-duration: 0s !important;
              transition-delay: 0s !important;
            }
          `,
        });
      }

      // Navigate to the dashboard
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

      // Wait for the specific widget
      if (validatedOptions.waitForSelector) {
        await page.waitForSelector(validatedOptions.waitForSelector, {
          timeout: validatedOptions.waitForTimeout,
        });
      } else {
        await page.waitForTimeout(validatedOptions.waitForTimeout);
      }

      // Wait for charts to load
      await this.waitForChartsToLoad(page);

      // Get the widget element for clipping
      let clip = validatedOptions.clip;
      if (!clip && validatedOptions.waitForSelector) {
        const element = await page.$(validatedOptions.waitForSelector);
        if (element) {
          const box = await element.boundingBox();
          if (box) {
            clip = {
              x: Math.max(0, box.x - 10), // Add small margin
              y: Math.max(0, box.y - 10),
              width: box.width + 20,
              height: box.height + 20,
            };
          }
        }
      }

      const buffer = await page.screenshot({
        fullPage: validatedOptions.fullPage,
        type: 'png',
        quality: validatedOptions.quality,
        clip,
      });

      const filename = `widget-${widgetId}-${Date.now()}.png`;

      return {
        buffer,
        filename,
        contentType: 'image/png',
        size: buffer.length,
      };
    } finally {
      await page.close();
    }
  }

  async generateCustomPNG(options: PNGOptions): Promise<ExportResult> {
    const exporter = getExporter();
    await exporter.initialize();

    const browser = exporter.getBrowser();
    if (!browser) {
      throw new Error('Browser not initialized');
    }

    const page = await browser.newPage({
      viewport: {
        width: options.width,
        height: options.height,
      },
      deviceScaleFactor: options.deviceScaleFactor,
    });

    try {
      // Disable animations if specified
      if (options.animations === 'disabled') {
        await page.addStyleTag({
          content: `
            *, *::before, *::after {
              animation-duration: 0s !important;
              animation-delay: 0s !important;
              transition-duration: 0s !important;
              transition-delay: 0s !important;
            }
          `,
        });
      }

      // Navigate to the page
      await page.goto(options.url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Apply custom CSS if provided
      if (options.customCSS) {
        await page.addStyleTag({
          content: options.customCSS,
        });
      }

      // Wait for specific selector if provided
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: options.waitForTimeout,
        });
      } else {
        await page.waitForTimeout(options.waitForTimeout);
      }

      // Wait for charts to load
      await this.waitForChartsToLoad(page);

      const buffer = await page.screenshot({
        fullPage: options.fullPage,
        type: 'png',
        quality: options.quality,
        clip: options.clip,
      });

      const filename = `export-${Date.now()}.png`;

      return {
        buffer,
        filename,
        contentType: 'image/png',
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
            setTimeout(resolve, 500);
          } else {
            resolve();
          }
        };

        checkCharts();
      });
    });
  }

  async generateHighDPIScreenshot(
    url: string,
    options: Partial<PNGOptions> = {},
  ): Promise<ExportResult> {
    return this.generateCustomPNG({
      url,
      width: 1920,
      height: 1080,
      waitForTimeout: 5000,
      fullPage: true,
      quality: 100,
      deviceScaleFactor: 2,
      animations: 'disabled',
      ...options,
    });
  }

  async generateThumbnail(
    url: string,
    thumbnailSize: { width: number; height: number } = { width: 400, height: 300 },
  ): Promise<ExportResult> {
    return this.generateCustomPNG({
      url,
      width: 1920,
      height: 1080,
      waitForTimeout: 5000,
      fullPage: false,
      quality: 80,
      deviceScaleFactor: 1,
      animations: 'disabled',
      clip: {
        x: 0,
        y: 0,
        width: thumbnailSize.width * 4.8, // Scale up for better quality
        height: thumbnailSize.height * 3.6,
      },
    });
  }
}

export const pngGenerator = new PNGGenerator();
