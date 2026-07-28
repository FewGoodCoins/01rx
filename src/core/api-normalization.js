/**
 * Preserve the response-envelope contract shared by the direct and
 * consolidated API families. Non-envelope payloads intentionally pass through
 * untouched for legacy endpoints.
 */
export function unwrapApiEnvelope(envelope) {
  return (envelope && typeof envelope === 'object' && envelope.ok && envelope.hasOwnProperty('data'))
    ? envelope.data
    : envelope;
}

export function normalizeDegradedServices(raw) {
  return (raw || 'backend')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}
