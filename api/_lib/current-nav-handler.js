import {
  CONTRACT_HEADERS,
  CONTRACT_RELEASE,
  getEndpoint,
} from '@01resolved/contracts';
import {
  currentNavServiceError,
  loadZeroOneCurrentNav,
} from './zero-one-current-nav.js';

const ENDPOINT = getEndpoint('core.currentNav');
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BOOLEAN_QUERY_VALUES = new Set(['0', '1', 'false', 'true']);

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

function success(data, now) {
  return { data, ok: true, ts: new Date(now()).toISOString() };
}

function failure(message, code, now) {
  return { code, error: message, ok: false, ts: new Date(now()).toISOString() };
}

function requestQuery(request) {
  const url = new URL(String(request.url || ENDPOINT.path), 'https://01rx.invalid');
  const query = new Map();
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    query.set(key, values.length === 1 ? values[0] : null);
  }
  for (const [key, value] of Object.entries(request.query || {})) {
    if (key === 'relayPath' || query.has(key)) continue;
    query.set(
      key,
      Array.isArray(value)
        ? (value.length === 1 ? String(value[0]) : null)
        : String(value ?? ''),
    );
  }
  return query;
}

function validateQuery(query) {
  const unknown = [...query.keys()].filter(key => !ENDPOINT.query.includes(key));
  if (unknown.length) {
    throw currentNavServiceError(
      `Unknown query parameter${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
      'BAD_REQUEST',
      400,
    );
  }
  for (const [key, value] of query) {
    if (value == null) {
      throw currentNavServiceError(
        `Query parameter must be supplied once: ${key}`,
        'BAD_REQUEST',
        400,
      );
    }
  }
  const token = String(query.get('token') || '').trim().toLowerCase();
  if (token && !TOKEN_PATTERN.test(token)) {
    throw currentNavServiceError('token is invalid', 'BAD_REQUEST', 400);
  }
  for (const key of ['includeInactive', 'compact', 'includeDaoBreakdown', 'cache']) {
    if (query.has(key) && !BOOLEAN_QUERY_VALUES.has(String(query.get(key)).toLowerCase())) {
      throw currentNavServiceError(`${key} must be a boolean`, 'BAD_REQUEST', 400);
    }
  }
  const cacheValue = String(query.get('cache') || '').toLowerCase();
  return {
    cacheBypass: query.has('cache') && (cacheValue === '0' || cacheValue === 'false'),
    token,
  };
}

function setContractHeaders(response) {
  response.setHeader(CONTRACT_HEADERS.contract, ENDPOINT.contract);
  response.setHeader(CONTRACT_HEADERS.release, CONTRACT_RELEASE);
  response.setHeader(CONTRACT_HEADERS.surface, ENDPOINT.surface);
}

function safeServerMessage(error, statusCode) {
  if (statusCode < 500) return String(error?.message || 'Request failed').slice(0, 300);
  if (error?.code === 'MISSING_API_KEY') return 'Current NAV is not configured';
  return 'Current NAV is temporarily unavailable';
}

function logServerError(logger, error, statusCode) {
  if (statusCode < 500 || typeof logger?.error !== 'function') return;
  const diagnostic = {
    code: String(error?.code || 'INTERNAL_ERROR').slice(0, 100),
    message: String(error?.message || 'Unknown error')
      .replace(/https:\/\/[^\s"'<>]+/g, '[redacted-url]')
      .slice(0, 300),
    statusCode,
  };
  logger.error(`[01rx-current-nav-error] ${JSON.stringify(diagnostic)}`);
}

export function createCurrentNavHandler(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const logger = options.logger || console;
  const now = options.now || (() => Date.now());
  const load = options.loadCurrentNav || (() => loadZeroOneCurrentNav({
    env,
    fetchImpl,
    now,
    timeoutMs: options.timeoutMs,
  }));

  return async function currentNavHandler(request, response) {
    setContractHeaders(response);
    const method = String(request.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      response.setHeader('Allow', 'GET, HEAD, OPTIONS');
      response.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
      responseStatus(response, 204).end();
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD, OPTIONS');
      response.setHeader('Cache-Control', 'private, no-store');
      sendJson(response, 405, failure('Method not allowed', 'METHOD_NOT_ALLOWED', now));
      return;
    }

    let input;
    try {
      input = validateQuery(requestQuery(request));
    } catch (error) {
      response.setHeader('Cache-Control', 'private, no-store');
      sendJson(
        response,
        error.statusCode || 400,
        failure(error.message, error.code || 'BAD_REQUEST', now),
      );
      return;
    }

    response.setHeader(
      'Cache-Control',
      input.cacheBypass
        ? 'private, no-store'
        : 'public, s-maxage=10, stale-while-revalidate=20',
    );
    if (method === 'HEAD') {
      responseStatus(response, 200).end();
      return;
    }

    try {
      const data = await load();
      const selected = input.token
        ? data.tokens.find(row => row.token === input.token)
        : null;
      if (input.token && !selected) {
        response.setHeader('Cache-Control', 'private, no-store');
        sendJson(
          response,
          404,
          failure('Current NAV token was not found', 'NOT_FOUND', now),
        );
        return;
      }
      sendJson(response, 200, success(selected || data, now));
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      response.setHeader('Cache-Control', 'private, no-store');
      logServerError(logger, error, statusCode);
      sendJson(
        response,
        statusCode,
        failure(
          safeServerMessage(error, statusCode),
          String(error?.code || 'INTERNAL_ERROR').slice(0, 100),
          now,
        ),
      );
    }
  };
}

export default createCurrentNavHandler();

export const _test = Object.freeze({
  requestQuery,
  validateQuery,
});
