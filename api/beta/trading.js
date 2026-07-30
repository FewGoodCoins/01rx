import {
  CONTRACT_HEADERS,
  CONTRACT_RELEASE,
  getEndpoint,
} from '@01resolved/contracts';
import {
  createDflowSpotOrderService,
  tradingError,
} from '../_lib/dflow-spot-order.js';

const MAX_REQUEST_BYTES = 128 * 1024;
const RATE_LIMITS = Object.freeze({
  'spot-order': Object.freeze({ limit: 60, windowMs: 60_000 }),
  'spot-submit': Object.freeze({ limit: 10, windowMs: 60_000 }),
});
const ENDPOINTS = Object.freeze({
  'spot-order': getEndpoint('trading.spotOrder'),
  'spot-submit': getEndpoint('trading.spotSubmit'),
});
const buckets = new Map();
const defaultService = createDflowSpotOrderService();

function responseStatus(response, statusCode) {
  if (typeof response.status === 'function') return response.status(statusCode);
  response.statusCode = statusCode;
  return response;
}

function sendJson(response, statusCode, value) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  responseStatus(response, statusCode);
  if (typeof response.json === 'function') return response.json(value);
  response.end(JSON.stringify(value));
  return response;
}

function envelope(data) {
  return {
    data,
    ok: true,
    ts: new Date().toISOString(),
  };
}

function failure(message, code) {
  return {
    code,
    error: message,
    ok: false,
    ts: new Date().toISOString(),
  };
}

function safeErrorText(value) {
  return String(value || '')
    .replace(/([?&]api-key=)[^&\s"'<>]+/gi, '$1[redacted]')
    .replace(/https:\/\/[^?\s"'<>]+\?[^ \n\r"'<>]+/gi, '[redacted-url]')
    .slice(0, 500);
}

function logServerError(logger, error, statusCode) {
  if (statusCode < 500 || typeof logger?.error !== 'function') return;
  const diagnostic = {
    code: safeErrorText(error?.code || 'INTERNAL_ERROR'),
    message: safeErrorText(error?.message || 'Unknown server error'),
    name: safeErrorText(error?.name || 'Error'),
    statusCode,
  };
  logger.error(`[01rx-trading-error] ${JSON.stringify(diagnostic)}`);
}

function requestUrl(request) {
  return new URL(String(request.url || '/api/beta/trading'), 'https://01rx.invalid');
}

function requestQuery(request) {
  const url = requestUrl(request);
  const query = new Map(url.searchParams);
  Object.entries(request.query || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length === 1) query.set(key, String(value[0]));
      else query.set(key, '');
    } else if (value != null) {
      query.set(key, String(value));
    }
  });
  return query;
}

function requestHeader(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function trustedClientKey(request) {
  const forwarded = requestHeader(request, 'x-vercel-forwarded-for')
    || requestHeader(request, 'x-real-ip');
  return forwarded.split(',')[0].trim().slice(0, 80) || 'local';
}

function takeRateLimit(request, view, now = Date.now()) {
  const policy = RATE_LIMITS[view];
  const key = `${view}:${trustedClientKey(request)}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + policy.windowMs }
    : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [candidate, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(candidate);
    }
  }
  return {
    allowed: bucket.count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

async function rawRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw tradingError('Request body is too large', 'REQUEST_TOO_LARGE', 413);
    }
    chunks.push(buffer);
  }
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
}

async function parseRequestBody(request) {
  let source = request.body;
  if (source == null && request?.[Symbol.asyncIterator]) {
    source = await rawRequestBody(request);
  }
  if (Buffer.isBuffer(source)) source = source.toString('utf8');
  if (typeof source === 'string') {
    if (Buffer.byteLength(source) > MAX_REQUEST_BYTES) {
      throw tradingError('Request body is too large', 'REQUEST_TOO_LARGE', 413);
    }
    try {
      source = JSON.parse(source);
    } catch {
      throw tradingError('Request body must be valid JSON', 'INVALID_JSON', 400);
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw tradingError('Request body must be a JSON object', 'INVALID_JSON', 400);
  }
  if (Buffer.byteLength(JSON.stringify(source)) > MAX_REQUEST_BYTES) {
    throw tradingError('Request body is too large', 'REQUEST_TOO_LARGE', 413);
  }
  return source;
}

function setContractHeaders(response, endpoint) {
  response.setHeader(CONTRACT_HEADERS.contract, endpoint.contract);
  response.setHeader(CONTRACT_HEADERS.release, CONTRACT_RELEASE);
  response.setHeader(CONTRACT_HEADERS.surface, endpoint.surface);
}

function setRateLimitHeaders(response, result) {
  response.setHeader('X-RateLimit-Limit', String(result.limit));
  response.setHeader('X-RateLimit-Remaining', String(result.remaining));
  response.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1_000)));
}

export function createTradingHandler(options = {}) {
  const service = options.service || defaultService;
  const now = options.now || (() => Date.now());
  const logger = options.logger || console;

  return async function tradingHandler(request, response) {
    response.setHeader('Cache-Control', 'private, no-store');
    if (String(request.method || 'GET').toUpperCase() === 'OPTIONS') {
      response.setHeader('Allow', 'POST, OPTIONS');
      responseStatus(response, 204).end();
      return;
    }
    if (String(request.method || 'GET').toUpperCase() !== 'POST') {
      response.setHeader('Allow', 'POST, OPTIONS');
      sendJson(response, 405, failure('Method not allowed', 'METHOD_NOT_ALLOWED'));
      return;
    }
    const contentType = requestHeader(request, 'content-type').toLowerCase();
    if (contentType && !contentType.startsWith('application/json')) {
      sendJson(
        response,
        415,
        failure('Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE'),
      );
      return;
    }

    const query = requestQuery(request);
    const unknown = [...query.keys()].filter(key => key !== 'view');
    if (unknown.length) {
      sendJson(
        response,
        400,
        failure(
          `Unknown query parameter${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
          'BAD_REQUEST',
        ),
      );
      return;
    }
    const view = query.get('view') || '';
    const endpoint = ENDPOINTS[view];
    if (!endpoint) {
      sendJson(response, 404, failure('Unknown trading view', 'NOT_FOUND'));
      return;
    }
    setContractHeaders(response, endpoint);
    const rateLimit = takeRateLimit(request, view, now());
    setRateLimitHeaders(response, rateLimit);
    if (!rateLimit.allowed) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((rateLimit.resetAt - now()) / 1_000))),
      );
      sendJson(response, 429, failure('Rate limit exceeded', 'RATE_LIMITED'));
      return;
    }

    try {
      const body = await parseRequestBody(request);
      const data = view === 'spot-order'
        ? await service.spotOrder(body)
        : await service.spotSubmit(body);
      sendJson(response, 200, envelope(data));
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      logServerError(logger, error, statusCode);
      if (statusCode >= 500) {
        response.setHeader('X-NAVgator-Degraded', 'true');
        response.setHeader('X-NAVgator-Degraded-Services', 'dflow-trading');
      }
      sendJson(
        response,
        statusCode,
        failure(
          statusCode < 500
            ? error.message
            : error.statusCode
              ? error.message
              : 'Ownership trading is temporarily unavailable',
          error.code || 'INTERNAL_ERROR',
        ),
      );
    }
  };
}

export const tradingHandler = createTradingHandler();

export default tradingHandler;

export {
  safeErrorText,
};
