import { createTelemetryClient } from '@01resolved/telemetry';

export function installBrowserTelemetry(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const telemetry = createTelemetryClient({
    app: 'futarchy_terminal',
    defaults: {
      cluster: 'solana_mainnet',
      product_surface: '01rx',
    },
    sink: {
      capture(event, properties) {
        runtime.posthog?.capture?.(event, properties);
      },
    },
  });
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.telemetry = telemetry;
  return telemetry;
}
