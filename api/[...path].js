const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST']);
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const REQUEST_HEADERS = new Set([
  'accept',
  'content-type',
]);
const RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-type',
  'etag',
  'retry-after',
  'x-01r-contract',
  'x-01r-contract-release',
  'x-01r-surface',
  'x-navgator-degraded',
  'x-navgator-degraded-services',
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
  if (!origin) throw new TypeError('NAVGATOR_API_ORIGIN must be an HTTPS origin');
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

export async function relayApiRequest(request, response, options = {}) {
  const method = String(request.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    response.setHeader('Allow', [...ALLOWED_METHODS].join(', '));
    response.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  if (method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  const upstreamOrigin = (
    options.upstreamOrigin
    || process.env.NAVGATOR_API_ORIGIN
    || 'https://navgator.xyz'
  );
  const fetchImpl = options.fetchImpl || fetch;

  try {
    const url = upstreamApiUrl(relayedApiRequestUrl(request), upstreamOrigin);
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
      signal: AbortSignal.timeout(25_000),
    });
    copyResponseHeaders(upstream, response);
    response.status(upstream.status);
    if (method === 'HEAD') {
      response.end();
      return;
    }
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const status = Number(error?.statusCode) || 502;
    response.setHeader('Cache-Control', 'private, no-store');
    response.status(status).json({
      ok: false,
      error: status === 413
        ? 'Request body is too large'
        : 'NAVgator API is temporarily unavailable',
    });
  }
}

export default function handler(request, response) {
  return relayApiRequest(request, response);
}
