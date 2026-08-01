import {
  CONTRACT_HEADERS,
  CONTRACT_RELEASE,
  getEndpoint,
} from '@01resolved/contracts';
import { createFutarchyRpcRelay } from './futarchy-rpc-relay.js';
import { createFutarchyService, futarchyServiceError } from './futarchy-service.js';

const MAX_REQUEST_BYTES = 128 * 1024;
const ENDPOINTS = Object.freeze({
  'active-markets': getEndpoint('futarchy.activeMarkets'),
  proposals: getEndpoint('futarchy.proposals'),
  'proposal-history': getEndpoint('futarchy.proposalHistory'),
  integrity: getEndpoint('futarchy.programIntegrity'),
  'market-data': getEndpoint('futarchy.marketData'),
  positions: getEndpoint('futarchy.positions'),
  'recurring-config': getEndpoint('futarchy.recurringConfig'),
  'solana-rpc': getEndpoint('futarchy.solanaRpc'),
});
const RATE_LIMITS = Object.freeze({
  'active-markets': 90,
  proposals: 90,
  'proposal-history': 90,
  integrity: 120,
  'market-data': 120,
  positions: 60,
  'recurring-config': 120,
  'solana-rpc': 180,
});
const buckets = new Map();

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

function envelope(data, now) {
  return { ok: true, data, ts: new Date(now()).toISOString() };
}

function failure(message, code, now) {
  return { ok: false, error: message, code, ts: new Date(now()).toISOString() };
}

function requestUrl(request) {
  return new URL(String(request.url || '/api/v1/futarchy'), 'https://01rx.invalid');
}

function requestQuery(request) {
  const url = requestUrl(request);
  const entries = new Map();
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    entries.set(key, values.length === 1 ? values[0] : '');
  }
  Object.entries(request.query || {}).forEach(([key, value]) => {
    if (key === 'relayPath') return;
    entries.set(key, Array.isArray(value) && value.length === 1 ? String(value[0]) : String(value || ''));
  });
  return entries;
}

function requestHeader(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function rateLimitKey(request, view) {
  const address = requestHeader(request, 'x-vercel-forwarded-for')
    || requestHeader(request, 'x-real-ip')
    || 'local';
  return `${view}:${address.split(',')[0].trim().slice(0, 80)}`;
}

function takeRateLimit(request, view, now) {
  const windowMs = 60_000;
  const limit = RATE_LIMITS[view];
  const key = rateLimitKey(request, view);
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [candidate, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(candidate);
    }
  }
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

async function rawBody(request) {
  if (request.body != null) {
    const source = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body));
    if (source.length > MAX_REQUEST_BYTES) {
      throw futarchyServiceError('Request body is too large', 'REQUEST_TOO_LARGE', 413);
    }
    return source;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw futarchyServiceError('Request body is too large', 'REQUEST_TOO_LARGE', 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}

async function parseJsonBody(request) {
  const body = await rawBody(request);
  if (!body.length) throw futarchyServiceError('Request body is required', 'INVALID_JSON', 400);
  try {
    const value = JSON.parse(body.toString('utf8'));
    if (!value || typeof value !== 'object') throw new Error('invalid');
    return value;
  } catch {
    throw futarchyServiceError('Request body must be valid JSON', 'INVALID_JSON', 400);
  }
}

function cachePolicy(view) {
  if (view === 'proposal-history') return 'public, s-maxage=60, stale-while-revalidate=300';
  if (view === 'active-markets' || view === 'market-data') {
    return 'public, s-maxage=5, stale-while-revalidate=10';
  }
  if (view === 'proposals') return 'public, s-maxage=30, stale-while-revalidate=120';
  if (view === 'recurring-config') return 'public, s-maxage=300, stale-while-revalidate=600';
  return 'private, no-store';
}

function setContractHeaders(response, endpoint) {
  response.setHeader(CONTRACT_HEADERS.contract, endpoint.contract);
  response.setHeader(CONTRACT_HEADERS.release, CONTRACT_RELEASE);
  response.setHeader(CONTRACT_HEADERS.surface, endpoint.surface);
}

function safeServerMessage(error, statusCode, view) {
  if (statusCode < 500) return String(error?.message || 'Request failed').slice(0, 300);
  if (error?.statusCode) return String(error.message || 'Service unavailable').slice(0, 300);
  return view === 'solana-rpc'
    ? 'Solana RPC is temporarily unavailable'
    : 'Decision-market data is temporarily unavailable';
}

function logServerError(logger, error, statusCode, view) {
  if (statusCode < 500 || typeof logger?.error !== 'function') return;
  const diagnostic = {
    view,
    statusCode,
    code: String(error?.code || 'INTERNAL_ERROR').slice(0, 100),
    message: String(error?.message || 'Unknown error')
      .replace(/https:\/\/[^\s"'<>]+/g, '[redacted-url]')
      .slice(0, 300),
    cause: String(error?.cause?.code || error?.cause?.message || '').slice(0, 160),
  };
  logger.error(`[01rx-futarchy-error] ${JSON.stringify(diagnostic)}`);
}

export function createFutarchyHandler(options = {}) {
  const service = options.service || createFutarchyService(options);
  const rpcRelay = options.rpcRelay || createFutarchyRpcRelay({
    env: options.env || process.env,
    fetchImpl: options.fetchImpl || fetch,
    programIntegrity: service.programIntegrity,
  });
  const now = options.now || (() => Date.now());
  const logger = options.logger || console;

  return async function futarchyHandler(request, response) {
    const method = String(request.method || 'GET').toUpperCase();
    const query = requestQuery(request);
    const view = query.get('view') || '';
    const endpoint = ENDPOINTS[view];
    if (!endpoint) {
      response.setHeader('Cache-Control', 'private, no-store');
      sendJson(response, 404, failure('Unknown futarchy view', 'NOT_FOUND', now));
      return;
    }
    setContractHeaders(response, endpoint);
    response.setHeader('Cache-Control', cachePolicy(view));
    const allowedMethods = endpoint.method === 'POST' ? 'POST, OPTIONS' : 'GET, HEAD, OPTIONS';
    if (method === 'OPTIONS') {
      response.setHeader('Allow', allowedMethods);
      responseStatus(response, 204).end();
      return;
    }
    if (method !== endpoint.method && !(endpoint.method === 'GET' && method === 'HEAD')) {
      response.setHeader('Allow', allowedMethods);
      response.setHeader('Cache-Control', 'private, no-store');
      sendJson(response, 405, failure('Method not allowed', 'METHOD_NOT_ALLOWED', now));
      return;
    }
    const unknown = [...query.keys()].filter(key => (
      key !== 'view' && !endpoint.query.includes(key)
    ));
    if (unknown.length) {
      response.setHeader('Cache-Control', 'private, no-store');
      sendJson(
        response,
        400,
        failure(`Unknown query parameter${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`, 'BAD_REQUEST', now),
      );
      return;
    }
    const missing = endpoint.required.filter(key => !query.get(key));
    if (missing.length) {
      response.setHeader('Cache-Control', 'private, no-store');
      sendJson(response, 400, failure(`Missing required query parameter: ${missing[0]}`, 'BAD_REQUEST', now));
      return;
    }
    const rate = takeRateLimit(request, view, now());
    response.setHeader('X-RateLimit-Limit', String(rate.limit));
    response.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(rate.resetAt / 1_000)));
    if (!rate.allowed) {
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((rate.resetAt - now()) / 1_000))));
      sendJson(response, 429, failure('Rate limit exceeded', 'RATE_LIMITED', now));
      return;
    }
    if (method === 'HEAD') {
      responseStatus(response, 200).end();
      return;
    }

    try {
      let data;
      if (view === 'active-markets') data = await service.activeMarkets();
      else if (view === 'proposals') data = await service.proposals(Object.fromEntries(query));
      else if (view === 'proposal-history') data = await service.proposalHistory(Object.fromEntries(query));
      else if (view === 'market-data') data = await service.marketData(Object.fromEntries(query));
      else if (view === 'positions') data = await service.positions(Object.fromEntries(query));
      else if (view === 'integrity') data = await service.programIntegrity();
      else if (view === 'recurring-config') data = await service.recurringConfig();
      else {
        const contentType = requestHeader(request, 'content-type').toLowerCase();
        if (contentType && !contentType.startsWith('application/json')) {
          throw futarchyServiceError('Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE', 415);
        }
        data = await rpcRelay(await parseJsonBody(request));
      }
      sendJson(response, 200, envelope(data, now));
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      logServerError(logger, error, statusCode, view);
      response.setHeader('Cache-Control', 'private, no-store');
      if (statusCode >= 500) {
        response.setHeader('X-NAVgator-Degraded', 'true');
        response.setHeader('X-NAVgator-Degraded-Services', `01rx-${view}`);
      }
      sendJson(
        response,
        statusCode,
        failure(safeServerMessage(error, statusCode, view), error?.code || 'INTERNAL_ERROR', now),
      );
    }
  };
}

export const futarchyHandler = createFutarchyHandler();
export default futarchyHandler;

export const _test = Object.freeze({
  ENDPOINTS,
  RATE_LIMITS,
  cachePolicy,
  requestQuery,
});
