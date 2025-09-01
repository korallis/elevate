import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

/**
 * Initialize the appropriate trace exporter based on environment configuration
 */
export function initializeExporter(): SpanExporter {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const environment = process.env.NODE_ENV || 'development';

  if (otlpEndpoint && environment === 'production') {
    // Production: Use OTLP exporter for observability platform
    console.log(`Initializing OTLP exporter with endpoint: ${otlpEndpoint}`);
    
    return new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
      headers: {
        // Add authentication headers if needed
        ...(process.env.OTEL_EXPORTER_OTLP_HEADERS && 
          parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
        ),
      },
      compression: 'gzip',
    });
  }

  if (environment === 'development' || environment === 'test') {
    // Development: Use console exporter for local debugging
    console.log('Initializing Console exporter for development');
    return new ConsoleSpanExporter();
  }

  // Fallback to console exporter
  console.log('No OTLP endpoint configured, using Console exporter');
  return new ConsoleSpanExporter();
}

/**
 * Parse header string from environment variable
 * Format: "key1=value1,key2=value2"
 */
function parseHeaders(headerString: string): Record<string, string> {
  const headers: Record<string, string> = {};
  
  headerString.split(',').forEach(header => {
    const [key, value] = header.split('=');
    if (key && value) {
      headers[key.trim()] = value.trim();
    }
  });
  
  return headers;
}

/**
 * Configuration for different observability platforms
 */
export const OBSERVABILITY_CONFIGS = {
  // Jaeger configuration
  jaeger: {
    endpoint: 'http://localhost:14268/api/traces',
    headers: {},
  },
  
  // Zipkin configuration
  zipkin: {
    endpoint: 'http://localhost:9411/api/v2/spans',
    headers: {
      'Content-Type': 'application/json',
    },
  },
  
  // Honeycomb configuration
  honeycomb: {
    endpoint: 'https://api.honeycomb.io/v1/traces',
    headers: {
      'x-honeycomb-team': process.env.HONEYCOMB_API_KEY || '',
      'x-honeycomb-dataset': process.env.HONEYCOMB_DATASET || 'elev8-api',
    },
  },
  
  // Datadog configuration
  datadog: {
    endpoint: 'https://trace.agent.datadoghq.com/v1/traces',
    headers: {
      'DD-API-KEY': process.env.DD_API_KEY || '',
    },
  },
  
  // New Relic configuration
  newrelic: {
    endpoint: 'https://trace-api.newrelic.com/trace/v1',
    headers: {
      'Api-Key': process.env.NEW_RELIC_LICENSE_KEY || '',
      'Data-Format': 'otlp',
      'Data-Format-Version': '1',
    },
  },
} as const;