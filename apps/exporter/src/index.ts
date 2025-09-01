export {
  PlaywrightExporter,
  getExporter,
  cleanupExporter,
} from './exporters/playwright-exporter.js';
export { PDFGenerator, pdfGenerator } from './exporters/pdf-generator.js';
export { PNGGenerator, pngGenerator } from './exporters/png-generator.js';
export { ReportBuilder, reportBuilder } from './exporters/report-builder.js';

export type { ExportOptions, ExportResult } from './exporters/playwright-exporter.js';
export type { PDFOptions } from './exporters/pdf-generator.js';
export type { PNGOptions } from './exporters/png-generator.js';
export type { ReportOptions, ReportPage, ReportResult } from './exporters/report-builder.js';

// Initialize exporter on module load
// import { getExporter } from './exporters/playwright-exporter.js';

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, cleaning up exporter...');
  const { cleanupExporter } = await import('./exporters/playwright-exporter.js');
  await cleanupExporter();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, cleaning up exporter...');
  const { cleanupExporter } = await import('./exporters/playwright-exporter.js');
  await cleanupExporter();
  process.exit(0);
});

console.log('Elev8 Exporter initialized');
