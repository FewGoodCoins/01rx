const SENSITIVE_KEY = /(?:authorization|cookie|email|owner|private|public_?key|secret|seed|signature|token|wallet(?:_?address)?)/i;
const SAFE_NAME = /^[a-z][a-z0-9_]{0,63}$/;

function scrubProperties(properties = {}) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key, value]) => !SENSITIVE_KEY.test(key) && value !== undefined)
      .map(([key, value]) => {
        if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
          return [key, typeof value === 'string' ? value.slice(0, 240) : value];
        }
        return [key, String(value).slice(0, 240)];
      }),
  );
}

export function createTelemetryClient(options = {}) {
  const app = String(options.app || '').trim().toLowerCase();
  const sink = options.sink;
  const defaults = scrubProperties(options.defaults);
  if (!SAFE_NAME.test(app)) {
    throw new TypeError('Telemetry app must be a lowercase snake_case identifier');
  }

  return Object.freeze({
    capture(name, properties = {}) {
      const event = String(name || '').trim().toLowerCase();
      if (!SAFE_NAME.test(event)) throw new TypeError('Telemetry event must be a lowercase snake_case identifier');
      try {
        sink?.capture?.(`01rx.${app}.${event}`, {
          ...defaults,
          ...scrubProperties(properties),
        });
      } catch (_) {
        // Observability must never interrupt a labs experience.
      }
    },
  });
}

export { scrubProperties };
