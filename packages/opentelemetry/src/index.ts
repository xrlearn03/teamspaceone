import { trace, type Tracer, type Span, type Context, context, propagation } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
}

let sdk: NodeSDK | undefined;

export function initTelemetry(options: TelemetryOptions): void {
  if (sdk) {
    return;
  }

  const endpoint =
    options.otlpEndpoint ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    'http://localhost:4318/v1/traces';

  const exporter = new OTLPTraceExporter({ url: endpoint });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? '0.0.1',
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
    textMapPropagator: new W3CTraceContextPropagator(),
  });

  sdk.start();

  process.on('SIGTERM', async () => {
    await sdk?.shutdown();
  });
}

export function shutdownTelemetry(): Promise<void> | undefined {
  return sdk?.shutdown();
}

export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  fn: (span: Span) => T | Promise<T>,
  parent?: Context,
): Promise<T> {
  const tracer = getTracer(tracerName);
  const ctx = parent ?? context.active();
  return new Promise((resolve, reject) => {
    tracer.startActiveSpan(spanName, { links: [] }, ctx, async (span) => {
      try {
        const result = await fn(span);
        span.end();
        resolve(result);
      } catch (err) {
        span.recordException(err as Error);
        span.end();
        reject(err);
      }
    });
  });
}

export { context, propagation, trace };
