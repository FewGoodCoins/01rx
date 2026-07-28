export interface TelemetrySink {
  capture?(event: string, properties?: Record<string, unknown>): void;
}

export interface TelemetryClient {
  capture(name: string, properties?: Record<string, unknown>): void;
}

export function scrubProperties(properties?: Record<string, unknown>): Record<string, unknown>;
export function createTelemetryClient(options: {
  app: string;
  sink?: TelemetrySink;
  defaults?: Record<string, unknown>;
}): TelemetryClient;
