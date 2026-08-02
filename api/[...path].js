import {
  PRIVATE_NO_STORE,
  methodAllowed,
  relayRoutePolicy,
} from './_lib/relay-policy.js';

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST']);
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 25_000;
const REQUEST_HEADERS = new Set([
  'accept',
  'content-type',
]);
const RESPONSE_HEADERS = new Set([
  'content-type',
  'etag',
  'retry-after',
  'x-01r-contract',
  'x-01r-contract-release',
  'x-01r-surface',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
]);

export function normalizeUpstreamOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== '/' && url.pathname !== '')
    ) {
      return '';
    }
    return url.origin;
  } catch {
    return '';
  }
}

export function upstreamApiUrl(requestUrl, upstreamOrigin) {
  const origin = normalizeUpstreamOrigin(upstreamOrigin);
  if (!origin) {
    throw relayError(
      'This route has no 01Resolved data contract',
      503,
      'DATA_NOT_AVAILABLE_FROM_01RESOLVED',
    );
  }
  const incoming = new URL(String(requestUrl || '/'), 'https://01rx.invalid');
  if (!incoming.pathname.startsWith('/api/')) {
    throw new TypeError('Only /api routes can be relayed');
  }
  return new URL(`${incoming.pathname}${incoming.search}`, origin);
}

export function relayedApiRequestUrl(request = {}) {
  const incoming = new URL(String(request.url || '/'), 'https://01rx.invalid');
  const queryPath = request.query?.relayPath;
  const relayPath = Array.isArray(queryPath)
    ? queryPath.length === 1
      ? queryPath[0]
      : ''
    : queryPath || incoming.searchParams.get('relayPath');
  if (!relayPath) return `${incoming.pathname}${incoming.search}`;

  incoming.pathname = `/api/${String(relayPath).replace(/^\/+/, '')}`;
  incoming.searchParams.delete('relayPath');
  return `${incoming.pathname}${incoming.search}`;
}

function requestHeaders(headers = {}) {
  const forwarded = new Headers();
  Object.entries(headers).forEach(([name, value]) => {
    const normalizedName = String(name).toLowerCase();
    if (!REQUEST_HEADERS.has(normalizedName) || value == null) return;
    forwarded.set(normalizedName, Array.isArray(value) ? value.join(', ') : String(value));
  });
  forwarded.set('user-agent', '01rx-api-relay/1.0');
  return forwarded;
}

async function requestBody(request) {
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === 'string') return request.body;
  if (request.body != null) return JSON.stringify(request.body);

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function copyResponseHeaders(upstream, response) {
  upstream.headers.forEach((value, name) => {
    if (RESPONSE_HEADERS.has(name.toLowerCase())) response.setHeader(name, value);
  });
}

function clearCopiedResponseHeaders(response) {
  if (typeof response.removeHeader !== 'function') return;
  for (const name of RESPONSE_HEADERS) response.removeHeader(name);
}

function relayError(message, statusCode = 502, code = 'UPSTREAM_UNAVAILABLE', cause) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function declaredResponseSize(upstream) {
  const raw = upstream?.headers?.get?.('content-length');
  if (raw == null || raw === '') return null;
  if (!/^\d+$/.test(raw)) return null;
  const size = Number(raw);
  return Number.isSafeInteger(size) ? size : null;
}

export async function readBoundedResponse(upstream, maxBytes) {
  const declaredSize = declaredResponseSize(upstream);
  if (declaredSize != null && declaredSize > maxBytes) {
    throw relayError(
      'Upstream response exceeds its reviewed size limit',
      502,
      'UPSTREAM_RESPONSE_TOO_LARGE',
    );
  }
  if (!upstream?.body) return Buffer.alloc(0);

  const reader = upstream.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) {
        await reader.cancel('01RX upstream response size limit exceeded').catch(() => {});
        throw relayError(
          'Upstream response exceeds its reviewed size limit',
          502,
          'UPSTREAM_RESPONSE_TOO_LARGE',
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, size);
}

function responseCacheControl(policyValue, upstream) {
  if (
    upstream.status < 200
    || upstream.status >= 300
  ) return PRIVATE_NO_STORE;
  return policyValue.cacheControl;
}

export async function relayApiRequest(request, response, options = {}) {
  const method = String(request.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    response.setHeader('Allow', [...ALLOWED_METHODS].join(', '));
    response.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  if (method === 'OPTIONS') {
    response.setHeader('Cache-Control', PRIVATE_NO_STORE);
    response.status(204).end();
    return;
  }

  const restoredUrl = relayedApiRequestUrl(request);
  const routePolicy = relayRoutePolicy(restoredUrl);
  if (!routePolicy) {
    response.setHeader('Cache-Control', PRIVATE_NO_STORE);
    response.status(404).json({ ok: false, error: 'API route not available' });
    return;
  }
  if (!methodAllowed(routePolicy, method)) {
    response.setHeader('Allow', routePolicy.methods.join(', '));
    response.setHeader('Cache-Control', PRIVATE_NO_STORE);
    response.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const upstreamOrigin = options.upstreamOrigin || '';
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0
    ? Math.min(options.timeoutMs, UPSTREAM_TIMEOUT_MS)
    : UPSTREAM_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  try {
    const url = upstreamApiUrl(restoredUrl, upstreamOrigin);
    const body = await requestBody(request);
    if (body && Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    const upstream = await fetchImpl(url, {
      method,
      headers: requestHeaders(request.headers),
      body,
      redirect: 'manual',
      signal: timeoutSignal,
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      throw relayError(
        'Upstream redirects are not allowed',
        502,
        'UPSTREAM_REDIRECT_REJECTED',
      );
    }
    copyResponseHeaders(upstream, response);
    const cacheControl = responseCacheControl(routePolicy, upstream);
    response.setHeader('Cache-Control', cacheControl);
    if (cacheControl === PRIVATE_NO_STORE) response.removeHeader?.('etag');
    response.status(upstream.status);
    if (method === 'HEAD') {
      response.end();
      return;
    }
    if (upstream.status >= 500) {
      if (typeof upstream.body?.cancel === 'function') {
        await upstream.body.cancel('01RX replaces upstream server diagnostics').catch(() => {});
      }
      clearCopiedResponseHeaders(response);
      response.setHeader('Cache-Control', PRIVATE_NO_STORE);
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(Buffer.from(JSON.stringify({
        ok: false,
        code: 'UPSTREAM_UNAVAILABLE',
        error: '01RX upstream is temporarily unavailable',
      })));
      return;
    }
    const upstreamBody = await readBoundedResponse(
      upstream,
      routePolicy.maxResponseBytes,
    );
    response.end(upstreamBody);
  } catch (error) {
    const timedOut = timeoutSignal.aborted
      || error?.name === 'AbortError'
      || error?.name === 'TimeoutError';
    const status = timedOut ? 504 : Number(error?.statusCode) || 502;
    clearCopiedResponseHeaders(response);
    response.setHeader('Cache-Control', PRIVATE_NO_STORE);
    response.status(status).json({
      ok: false,
      code: error?.code || 'UPSTREAM_UNAVAILABLE',
      error: error?.code === 'DATA_NOT_AVAILABLE_FROM_01RESOLVED'
        ? 'This data is not available from 01Resolved yet'
        : status === 413
          ? 'Request body is too large'
          : timedOut
            ? '01RX upstream timed out'
            : error?.code === 'UPSTREAM_RESPONSE_TOO_LARGE'
              ? '01RX upstream response is too large'
              : '01RX upstream is temporarily unavailable',
      ...(error?.code === 'DATA_NOT_AVAILABLE_FROM_01RESOLVED'
        ? { missingPath: new URL(restoredUrl, 'https://01rx.invalid').pathname }
        : {}),
    });
  }
}

export default function handler(request, response) {
  return relayApiRequest(request, response);
}
