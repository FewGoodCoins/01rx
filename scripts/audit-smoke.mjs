import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORIGIN = 'https://01rx.vercel.app';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;
const SELECTED_HEADERS = Object.freeze([
  'allow',
  'cache-control',
  'content-security-policy',
  'permissions-policy',
  'referrer-policy',
  'x-01r-contract',
  'x-01r-execution',
  'x-content-type-options',
  'x-permitted-cross-domain-policies',
]);

export function normalizeAuditOrigin(value) {
  const raw = String(value || '').trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError('Audit origin must be a valid HTTPS origin');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new TypeError('Audit origin must be an HTTPS origin without credentials or a path');
  }
  return url.origin;
}

function selectedResponseHeaders(headers) {
  return Object.fromEntries(SELECTED_HEADERS.flatMap((name) => {
    const value = headers.get(name);
    return value == null ? [] : [[name, value]];
  }));
}

function unwrapEnvelope(value) {
  return value?.ok === true && value.data && typeof value.data === 'object'
    ? value.data
    : value;
}

function summarizeJson(id, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = unwrapEnvelope(value);
  const base = {
    code: typeof value.code === 'string' ? value.code.slice(0, 100) : null,
    ok: value.ok === true,
  };
  if (id === 'current-nav') {
    return {
      ...base,
      provider: String(
        data?.source?.provider
        || data?.provider
        || value?.source?.provider
        || '',
      ).slice(0, 100),
      tokenCount: Array.isArray(data?.tokens) ? data.tokens.length : null,
    };
  }
  if (id === 'active-markets') {
    return {
      ...base,
      degraded: data?.degraded?.active === true,
      marketCount: Array.isArray(data?.markets) ? data.markets.length : null,
    };
  }
  return {
    ...base,
    missingPath: typeof value.missingPath === 'string'
      ? value.missingPath.slice(0, 200)
      : null,
  };
}

async function readBoundedBody(response) {
  const declared = response.headers.get('content-length');
  if (/^\d+$/.test(declared || '') && Number(declared) > MAX_RESPONSE_BYTES) {
    throw new Error('Response exceeded the audit evidence size limit');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_RESPONSE_BYTES) {
    throw new Error('Response exceeded the audit evidence size limit');
  }
  return bytes.toString('utf8');
}

async function requestEvidence(fetchImpl, origin, definition) {
  const url = new URL(definition.path, origin);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: definition.accept || 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = definition.readJson === false
      ? ''
      : await readBoundedBody(response);
    let json = null;
    if (body) {
      try {
        json = JSON.parse(body);
      } catch {
        json = null;
      }
    }
    return {
      error: null,
      headers: selectedResponseHeaders(response.headers),
      id: definition.id,
      json: summarizeJson(definition.id, json),
      method: 'GET',
      path: definition.path,
      redirected: response.status >= 300 && response.status < 400,
      status: response.status,
    };
  } catch (error) {
    return {
      error: String(error?.message || error || 'Request failed').slice(0, 300),
      headers: {},
      id: definition.id,
      json: null,
      method: 'GET',
      path: definition.path,
      redirected: false,
      status: null,
    };
  }
}

function check(id, ok, expected, observed) {
  return { id, ok: ok === true, expected, observed };
}

export function evaluateAuditSmoke(responses) {
  const byId = new Map(responses.map(response => [response.id, response]));
  const homepage = byId.get('homepage') || { headers: {} };
  const currentNav = byId.get('current-nav') || { headers: {}, json: {} };
  const activeMarkets = byId.get('active-markets') || { headers: {}, json: {} };
  const historicNav = byId.get('historic-nav-gap') || { headers: {}, json: {} };
  const execution = byId.get('execution-state') || { headers: {}, json: {} };
  const csp = homepage.headers['content-security-policy'] || '';
  const permissions = homepage.headers['permissions-policy'] || '';

  return [
    check('homepage-status', homepage.status === 200 && !homepage.redirected, '200 without redirect', homepage.status),
    check('header-nosniff', homepage.headers['x-content-type-options'] === 'nosniff', 'nosniff', homepage.headers['x-content-type-options'] || null),
    check('header-referrer', homepage.headers['referrer-policy'] === 'strict-origin-when-cross-origin', 'strict-origin-when-cross-origin', homepage.headers['referrer-policy'] || null),
    check('header-permissions', /camera=\(\)/.test(permissions) && /geolocation=\(\)/.test(permissions) && /microphone=\(\)/.test(permissions), 'camera, geolocation, and microphone disabled', permissions || null),
    check('header-csp-baseline', csp.includes("base-uri 'self'") && csp.includes("object-src 'none'"), "base-uri 'self'; object-src 'none'", csp || null),
    check('current-nav-contract', currentNav.status === 200 && currentNav.headers['x-01r-contract'] === 'core.current-nav.v1', '200 core.current-nav.v1', `${currentNav.status || 'no status'} ${currentNav.headers['x-01r-contract'] || 'no contract'}`),
    check('current-nav-provider', String(currentNav.json?.provider || '').toLowerCase() === '01resolved', '01Resolved', currentNav.json?.provider || null),
    check('active-markets-contract', activeMarkets.status === 200 && activeMarkets.headers['x-01r-contract'] === 'futarchy.markets.v1', '200 futarchy.markets.v1', `${activeMarkets.status || 'no status'} ${activeMarkets.headers['x-01r-contract'] || 'no contract'}`),
    check('historic-nav-fails-closed', historicNav.status === 503 && historicNav.json?.code === 'DATA_NOT_AVAILABLE_FROM_01RESOLVED' && historicNav.json?.missingPath === '/api/historic-nav', '503 DATA_NOT_AVAILABLE_FROM_01RESOLVED', `${historicNav.status || 'no status'} ${historicNav.json?.code || 'no code'}`),
    check('execution-paused', execution.status === 405 && execution.headers['x-01r-execution'] === 'paused' && /POST/.test(execution.headers.allow || ''), '405, X-01R-Execution: paused, Allow: POST', `${execution.status || 'no status'}, ${execution.headers['x-01r-execution'] || 'no execution header'}, ${execution.headers.allow || 'no allow header'}`),
  ];
}

export async function runAuditSmoke(options = {}) {
  const origin = normalizeAuditOrigin(options.origin || DEFAULT_ORIGIN);
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => new Date().toISOString());
  const startedAt = now();
  const definitions = [
    { id: 'homepage', path: '/', readJson: false, accept: 'text/html' },
    { id: 'current-nav', path: '/api/current-nav?token=solo' },
    { id: 'active-markets', path: '/api/v1/futarchy?view=active-markets' },
    { id: 'historic-nav-gap', path: '/api/historic-nav?token=solo' },
    { id: 'execution-state', path: '/api/beta/trading?view=spot-order' },
  ];
  const responses = [];
  for (const definition of definitions) {
    responses.push(await requestEvidence(fetchImpl, origin, definition));
  }
  const checks = evaluateAuditSmoke(responses);
  return {
    schemaVersion: 1,
    mode: 'read-only-get-only',
    origin,
    startedAt,
    finishedAt: now(),
    ok: checks.every(item => item.ok),
    checks,
    responses,
  };
}

function parseArguments(argv) {
  const result = { origin: process.env.AUDIT_ORIGIN || DEFAULT_ORIGIN, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--origin') result.origin = argv[++index] || '';
    else if (argument.startsWith('--origin=')) result.origin = argument.slice(9);
    else if (argument === '--output') result.output = argv[++index] || '';
    else if (argument.startsWith('--output=')) result.output = argument.slice(9);
    else throw new TypeError(`Unknown argument: ${argument}`);
  }
  return result;
}

async function main() {
  const argumentsValue = parseArguments(process.argv.slice(2));
  let evidence;
  try {
    evidence = await runAuditSmoke({ origin: argumentsValue.origin });
  } catch (error) {
    evidence = {
      schemaVersion: 1,
      mode: 'read-only-get-only',
      origin: String(argumentsValue.origin || ''),
      ok: false,
      fatalError: String(error?.message || error || 'Audit smoke failed').slice(0, 300),
    };
  }
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (argumentsValue.output) {
    await writeFile(argumentsValue.output, serialized, { encoding: 'utf8', mode: 0o600 });
  }
  process.stdout.write(serialized);
  if (!evidence.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
