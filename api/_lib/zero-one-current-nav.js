import { resolveZeroOneResolvedApiKey } from './zero-one-api-key.js';

const ZERO_ONE_RESOLVED_ORIGIN = 'https://api.01resolved.com';
const CURRENT_NAV_PATH = '/v1/global-dashboard/projects';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_PROJECT_ROWS = 250;
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const PROJECT_SLUG_ALIASES = Object.freeze({
  'areal-finance': 'arl',
  arealfinance: 'arl',
  'credible-finance': 'cred',
  credible: 'cred',
  'flash-trade': 'faf',
  'futardio-cult': 'futardio',
  futario: 'futardio',
  gesim: 'gsim',
  'jurassic-finance': 'rawr',
  jurassicfi: 'rawr',
  'laso-finance': 'laso',
  metadao: 'meta',
  mtncapital: 'mtn',
  omnipair: 'omfg',
  'ordr-trade': 'ordr',
  paystream: 'pays',
  ranger: 'rngr',
  'rip-cars': 'cars',
  ripcars: 'cars',
  solomon: 'solo',
  'solomon-labs': 'solo',
  superclaw: 'super',
  'turbine-cash': 'zkfg',
});

const PROJECT_NAME_OVERRIDES = Object.freeze({
  solo: 'Solomon Labs',
});

export function currentNavServiceError(
  message,
  code = 'UPSTREAM_UNAVAILABLE',
  statusCode = 503,
  cause,
) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function finiteNumber(value, options = {}) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (options.nonNegative && number < 0) return null;
  if (options.positive && number <= 0) return null;
  return number;
}

function safeToken(value) {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\$+/, '');
  return TOKEN_PATTERN.test(token) ? token : '';
}

function safeText(value, maximumLength) {
  return String(value || '').trim().slice(0, maximumLength);
}

function safeHttpsUrl(value) {
  const raw = safeText(value, 2_048);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}

function isoTimestamp(value) {
  const milliseconds = new Date(value || '').getTime();
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function tokenFromProject(row) {
  const ticker = safeToken(row?.tokenSymbol || row?.ticker || row?.symbol);
  if (ticker) return ticker;
  const slug = safeToken(row?.organizationSlug || row?.projectSlug || row?.slug);
  return PROJECT_SLUG_ALIASES[slug] || slug;
}

function unwrapPayload(payload) {
  if (payload?.ok === true && payload.data != null) return payload.data;
  return payload?.data ?? payload;
}

function projectRows(payload) {
  const data = unwrapPayload(payload);
  if (Array.isArray(data)) return data;
  for (const candidate of [
    data?.projects,
    data?.items,
    data?.rows,
    payload?.projects,
    payload?.items,
    payload?.rows,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

async function boundedJson(response) {
  if (!response.ok || response.status >= 300) {
    throw currentNavServiceError(
      `01Resolved current NAV returned HTTP ${response.status}`,
      response.status === 404 ? 'UPSTREAM_NOT_FOUND' : 'UPSTREAM_UNAVAILABLE',
    );
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw currentNavServiceError(
      '01Resolved current NAV response is too large',
      'UPSTREAM_RESPONSE_TOO_LARGE',
    );
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_RESPONSE_BYTES) {
    throw currentNavServiceError(
      '01Resolved current NAV response is too large',
      'UPSTREAM_RESPONSE_TOO_LARGE',
    );
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (cause) {
    throw currentNavServiceError(
      '01Resolved current NAV returned invalid JSON',
      'UPSTREAM_INVALID',
      503,
      cause,
    );
  }
}

export function normalizeZeroOneCurrentNavRow(row, options = {}) {
  if (!row || typeof row !== 'object') return null;
  const token = tokenFromProject(row);
  if (!token) return null;

  const retrievedAt = isoTimestamp(options.retrievedAt) || new Date().toISOString();
  const observedAt = isoTimestamp(
    row.updatedAt
      || row.lastUpdatedAt
      || row.asOf
      || row.timestamp
      || options.observedAt,
  );
  const snapshotTime = observedAt || retrievedAt;
  const ticker = safeText(row.tokenSymbol || row.ticker || token, 32)
    .replace(/^\$+/, '')
    .toUpperCase();
  const name = PROJECT_NAME_OVERRIDES[token] || safeText(
    row.organizationName || row.projectName || row.name || ticker,
    160,
  );
  const spot = finiteNumber(row.tokenUsdPrice, { nonNegative: true });
  const nav = finiteNumber(row.netAssetValue, { nonNegative: true });
  const treasuryUSDC = finiteNumber(row.treasuryValue, { nonNegative: true });
  const circulatingSupply = finiteNumber(row.tokenCirculatingSupply, { nonNegative: true });
  const totalSupply = finiteNumber(row.tokenTotalSupply, { nonNegative: true });
  const marketCap = finiteNumber(row.marketCap, { nonNegative: true });
  const fdv = finiteNumber(row.fdv, { nonNegative: true });
  const change24h = finiteNumber(row.tokenPriceChangePercentage24h);
  const spendingLimit = finiteNumber(row.spendingLimit, { nonNegative: true });
  const runway = finiteNumber(row.runway, { nonNegative: true });
  const proposalCount = finiteNumber(row.proposalCount, { nonNegative: true });
  const lockedTokens = totalSupply != null && circulatingSupply != null
    ? Math.max(0, totalSupply - circulatingSupply)
    : null;
  const navAvailable = nav != null && nav > 0;
  const source = Object.freeze({
    endpoint: CURRENT_NAV_PATH,
    observedAt,
    provider: '01Resolved',
    retrievedAt,
    scope: 'current-nav',
  });
  const navSnapshot = {
    formulaVersion: '01resolved-current-nav-v1',
    issues: navAvailable ? [] : [{
      code: 'ZERO_ONE_CURRENT_NAV_UNAVAILABLE',
      message: '01Resolved did not publish a current NAV for this project.',
    }],
    market: {
      fdv,
      marketCap,
      spot,
    },
    navPerToken: nav,
    source,
    sources: { currentNav: source },
    status: navAvailable ? 'verified' : 'unverified',
    statusLabel: navAvailable
      ? '01Resolved current NAV'
      : '01Resolved current NAV unavailable',
    supply: {
      circulating: circulatingSupply,
      effective: circulatingSupply,
      locked: lockedTokens,
      onChain: totalSupply,
    },
    timestamp: snapshotTime,
    treasury: treasuryUSDC == null ? { components: [] } : {
      components: [{
        key: '01resolvedTreasury',
        label: '01Resolved treasury',
        usd: treasuryUSDC,
      }],
      reportedUSDC: treasuryUSDC,
    },
    treasuryUSDC,
  };

  return {
    change24h,
    circulatingSupply,
    currentNavStatus: navAvailable ? 'available' : 'unavailable',
    currentPriceTracked: spot != null && spot > 0,
    effectiveSupply: circulatingSupply,
    fdv,
    hasCurrentNav: navAvailable,
    hasHistoricNav: false,
    key: token,
    lockedTokens,
    logo: safeHttpsUrl(row.organizationImageUrl || row.logo),
    mNAV: finiteNumber(row.mNAV),
    marketCap,
    monthlyAllowance: spendingLimit,
    name,
    nav,
    navSnapshot,
    navSource: '01resolved',
    navVerified: navAvailable,
    navVerifiedAt: snapshotTime,
    onChainSupply: totalSupply,
    pair: `${ticker}/USD`,
    premDisc: finiteNumber(row.premDisc),
    priceChange1h: finiteNumber(row.tokenPriceChangePercentage1h),
    priceChange7d: finiteNumber(row.tokenPriceChangePercentage7d),
    priceChange24h: change24h,
    priceChange24hPct: change24h,
    proposalCount,
    runway,
    snapshotTime,
    snapshotType: '01resolved_current',
    source,
    spendingLimit,
    spot,
    ticker,
    token,
    totalSupply,
    treasuryUSDC,
  };
}

export async function loadZeroOneCurrentNav(options = {}) {
  const env = options.env || process.env;
  const apiKey = resolveZeroOneResolvedApiKey(env);
  if (!apiKey) {
    throw currentNavServiceError(
      '01Resolved current NAV is not configured',
      'MISSING_API_KEY',
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => Date.now());
  const retrievedAt = new Date(now()).toISOString();
  const url = new URL(CURRENT_NAV_PATH, ZERO_ONE_RESOLVED_ORIGIN);
  url.searchParams.set('limit', '100');
  url.searchParams.set('page', '1');

  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'user-agent': '01rx-current-nav/1.0',
        'x-api-key': apiKey,
      },
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS),
    });
  } catch (cause) {
    throw currentNavServiceError(
      '01Resolved current NAV did not respond',
      'UPSTREAM_TIMEOUT',
      504,
      cause,
    );
  }
  if (response.status >= 300 && response.status < 400) {
    throw currentNavServiceError(
      '01Resolved current NAV redirect was rejected',
      'UPSTREAM_REDIRECT_REJECTED',
    );
  }
  const payload = await boundedJson(response);
  const tokens = projectRows(payload)
    .slice(0, MAX_PROJECT_ROWS)
    .map(row => normalizeZeroOneCurrentNavRow(row, { retrievedAt }))
    .filter(Boolean)
    .sort((left, right) => left.token.localeCompare(right.token));
  if (!tokens.length) {
    throw currentNavServiceError(
      '01Resolved returned no current NAV projects',
      'UPSTREAM_EMPTY',
    );
  }

  return {
    asOf: retrievedAt,
    publicationGateApplied: false,
    preview: false,
    source: {
      endpoint: CURRENT_NAV_PATH,
      provider: '01Resolved',
      retrievedAt,
      scope: 'current-nav',
    },
    tokens,
  };
}

export const _test = Object.freeze({
  projectRows,
  tokenFromProject,
});
