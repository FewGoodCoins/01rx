import { resolveZeroOneResolvedApiKey } from './zero-one-api-key.js';

const ZERO_ONE_RESOLVED_ORIGIN = 'https://api.01resolved.com';
const PROJECT_INDEX_PATH = '/v1/global-dashboard/projects';
const DAO_OVERVIEW_PATH = '/v1/dao/overview';
const DAO_TREASURY_OVERVIEW_PATH = '/v1/dao/treasury/overview';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ENRICHMENT_CONCURRENCY = 8;
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
  futuredao: 'future',
  gesim: 'gsim',
  'island-dao': 'island',
  'jito-dao': 'jto',
  'jurassic-finance': 'rawr',
  jurassicfi: 'rawr',
  kyros: 'kykyros',
  'laso-finance': 'laso',
  marinade: 'mnde',
  metadao: 'meta',
  mtncapital: 'mtn',
  omnipair: 'omfg',
  'ordr-trade': 'ordr',
  paystream: 'pays',
  'p2p-protocol': 'p2p',
  ranger: 'rngr',
  'rip-cars': 'cars',
  ripcars: 'cars',
  sanctum: 'scloud',
  'save-dao': 'save',
  solomon: 'solo',
  'solomon-labs': 'solo',
  superclaw: 'super',
  'turbine-cash': 'zkfg',
  zklsol: 'zkfg',
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

function payloadObject(payload) {
  const data = unwrapPayload(payload);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
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

async function boundedJson(response, label = 'current NAV') {
  if (!response.ok || response.status >= 300) {
    throw currentNavServiceError(
      `01Resolved ${label} returned HTTP ${response.status}`,
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

function sourceRecord(endpoint, retrievedAt, observedAt = null) {
  return Object.freeze({
    endpoint,
    observedAt: isoTimestamp(observedAt),
    provider: '01Resolved',
    retrievedAt,
    scope: 'current-nav',
  });
}

function clearDaoSnapshotFields(row) {
  return {
    ...row,
    netAssetValue: null,
    runway: null,
    spendingLimit: null,
    tokenCirculatingSupply: null,
    tokenPriceChangePercentage1h: null,
    tokenPriceChangePercentage24h: null,
    tokenPriceChangePercentage7d: null,
    tokenTotalSupply: null,
    tokenUsdPrice: null,
    treasuryValue: null,
  };
}

function enrichProjectRow(row, daoOverview, treasuryOverview) {
  const enriched = clearDaoSnapshotFields(row);
  const baseToken = daoOverview?.baseToken;

  if (baseToken && typeof baseToken === 'object') {
    enriched.organizationImageUrl = baseToken.url || daoOverview.imageUrl || row.organizationImageUrl;
    enriched.organizationName = daoOverview.name || baseToken.name || row.organizationName;
    enriched.tokenSymbol = baseToken.symbol || row.tokenSymbol;
    enriched.tokenUsdPrice = baseToken.usdPrice;
    enriched.tokenPriceChangePercentage1h = baseToken.priceChangePercentage1h;
    enriched.tokenPriceChangePercentage24h = baseToken.priceChangePercentage24h;
    enriched.tokenPriceChangePercentage7d = baseToken.priceChangePercentage7d;
    enriched.tokenCirculatingSupply = baseToken.circulatingSupply;
    enriched.tokenTotalSupply = baseToken.totalSupply;
    enriched.updatedAt = baseToken.updatedAt || daoOverview.updatedAt || row.updatedAt;
  }

  if (treasuryOverview) {
    enriched.netAssetValue = treasuryOverview.netAssetValue;
    enriched.treasuryValue = treasuryOverview.totalBalance;
    enriched.spendingLimit = treasuryOverview.spendingLimit;
    enriched.runway = treasuryOverview.monthOfRunway;
    if (enriched.tokenUsdPrice == null || enriched.tokenUsdPrice === '') {
      enriched.tokenUsdPrice = treasuryOverview.baseMintCurrentPrice;
    }
  }

  return enriched;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(items.length, Math.max(1, concurrency));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
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
  const projectObservedAt = options.projectObservedAt
    ? isoTimestamp(options.projectObservedAt)
    : observedAt;
  const navObservedAt = options.navSource
    ? isoTimestamp(options.navSource.observedAt)
    : observedAt;
  const snapshotTime = navObservedAt || retrievedAt;
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
  const change1h = finiteNumber(row.tokenPriceChangePercentage1h);
  const change24h = finiteNumber(row.tokenPriceChangePercentage24h);
  const change7d = finiteNumber(row.tokenPriceChangePercentage7d);
  const spendingLimit = finiteNumber(row.spendingLimit, { nonNegative: true });
  const runway = finiteNumber(row.runway, { nonNegative: true });
  const proposalCount = finiteNumber(row.proposalCount, { nonNegative: true });
  const lockedTokens = totalSupply != null && circulatingSupply != null
    ? Math.max(0, totalSupply - circulatingSupply)
    : null;
  const navAvailable = nav != null && nav > 0;
  const projectIndexSource = sourceRecord(PROJECT_INDEX_PATH, retrievedAt, projectObservedAt);
  const priceSource = options.priceSource
    ? sourceRecord(options.priceSource.endpoint, retrievedAt, options.priceSource.observedAt)
    : projectIndexSource;
  const navSource = options.navSource
    ? sourceRecord(options.navSource.endpoint, retrievedAt, options.navSource.observedAt)
    : projectIndexSource;
  const endpoints = [...new Set([
    PROJECT_INDEX_PATH,
    priceSource.endpoint,
    navSource.endpoint,
  ])];
  const source = Object.freeze({
    ...projectIndexSource,
    endpoints: Object.freeze(endpoints),
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
    source: navSource,
    sources: {
      currentNav: navSource,
      currentPrice: priceSource,
      projectIndex: projectIndexSource,
    },
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
    change1h,
    change24h,
    change7d,
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
    priceChange1h: change1h,
    priceChange7d: change7d,
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
  const totalTimeoutMs = Number(options.timeoutMs) > 0
    ? Math.floor(Number(options.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const deadlineAt = Date.now() + totalTimeoutMs;
  const url = new URL(PROJECT_INDEX_PATH, ZERO_ONE_RESOLVED_ORIGIN);
  url.searchParams.set('limit', '100');
  url.searchParams.set('page', '1');

  const requestJson = async (requestUrl, label) => {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw currentNavServiceError(
        `01Resolved ${label} exceeded the current NAV deadline`,
        'UPSTREAM_TIMEOUT',
        504,
      );
    }
    let response;
    try {
      response = await fetchImpl(requestUrl, {
        headers: {
          Accept: 'application/json',
          'user-agent': '01rx-current-nav/1.0',
          'x-api-key': apiKey,
        },
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.max(1, remainingMs)),
      });
    } catch (cause) {
      throw currentNavServiceError(
        `01Resolved ${label} did not respond`,
        'UPSTREAM_TIMEOUT',
        504,
        cause,
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw currentNavServiceError(
        `01Resolved ${label} redirect was rejected`,
        'UPSTREAM_REDIRECT_REJECTED',
      );
    }
    return boundedJson(response, label);
  };

  const payload = await requestJson(url, 'project index');
  const requestedToken = safeToken(options.token);
  const indexedRows = projectRows(payload)
    .slice(0, MAX_PROJECT_ROWS)
    .filter(row => !requestedToken || tokenFromProject(row) === requestedToken);
  const concurrency = Number.isInteger(options.enrichmentConcurrency)
    ? options.enrichmentConcurrency
    : DEFAULT_ENRICHMENT_CONCURRENCY;
  const enrichedRows = await mapWithConcurrency(indexedRows, concurrency, async (row) => {
    const slug = safeToken(row?.organizationSlug || row?.projectSlug || row?.slug);
    if (!slug) return normalizeZeroOneCurrentNavRow(clearDaoSnapshotFields(row), { retrievedAt });

    const overviewUrl = new URL(DAO_OVERVIEW_PATH, ZERO_ONE_RESOLVED_ORIGIN);
    overviewUrl.searchParams.set('slug', slug);
    const treasuryUrl = new URL(DAO_TREASURY_OVERVIEW_PATH, ZERO_ONE_RESOLVED_ORIGIN);
    treasuryUrl.searchParams.set('slug', slug);
    const [overviewResult, treasuryResult] = await Promise.allSettled([
      requestJson(overviewUrl, 'DAO overview'),
      requestJson(treasuryUrl, 'DAO treasury overview'),
    ]);
    const daoOverview = overviewResult.status === 'fulfilled'
      ? payloadObject(overviewResult.value)
      : null;
    const treasuryOverview = treasuryResult.status === 'fulfilled'
      ? payloadObject(treasuryResult.value)
      : null;
    const baseToken = daoOverview?.baseToken;
    const priceSource = baseToken
      ? {
        endpoint: DAO_OVERVIEW_PATH,
        observedAt: baseToken.updatedAt || daoOverview.updatedAt,
      }
      : (treasuryOverview?.baseMintCurrentPrice != null ? {
        endpoint: DAO_TREASURY_OVERVIEW_PATH,
        observedAt: treasuryOverview.updatedAt
          || treasuryOverview.asOf
          || treasuryOverview.timestamp,
      } : null);
    return normalizeZeroOneCurrentNavRow(
      enrichProjectRow(row, daoOverview, treasuryOverview),
      {
        projectObservedAt: row.updatedAt
          || row.lastUpdatedAt
          || row.asOf
          || row.timestamp,
        retrievedAt,
        ...(priceSource ? { priceSource } : {}),
        ...(treasuryOverview ? {
          navSource: {
            endpoint: DAO_TREASURY_OVERVIEW_PATH,
            observedAt: treasuryOverview.updatedAt
              || treasuryOverview.asOf
              || treasuryOverview.timestamp,
          },
        } : {}),
      },
    );
  });
  const tokens = enrichedRows
    .filter(Boolean)
    .sort((left, right) => left.token.localeCompare(right.token));
  if (!tokens.length && !requestedToken) {
    throw currentNavServiceError(
      '01Resolved returned no current NAV projects',
      'UPSTREAM_EMPTY',
    );
  }
  const pricedTokenCount = tokens.filter(row => row.currentPriceTracked).length;
  const currentNavTokenCount = tokens.filter(row => row.hasCurrentNav).length;
  if (indexedRows.length && pricedTokenCount === 0 && currentNavTokenCount === 0) {
    throw currentNavServiceError(
      '01Resolved DAO price and treasury enrichment returned no usable snapshots',
      'UPSTREAM_ENRICHMENT_UNAVAILABLE',
    );
  }
  const degradedServices = [];
  if (tokens.length && pricedTokenCount < tokens.length) degradedServices.push('01resolved-current-price');
  if (tokens.length && currentNavTokenCount < tokens.length) degradedServices.push('01resolved-current-nav');

  return {
    asOf: retrievedAt,
    degraded: {
      active: degradedServices.length > 0,
      issues: [],
      services: degradedServices,
    },
    publicationGateApplied: false,
    preview: false,
    source: {
      endpoint: PROJECT_INDEX_PATH,
      endpoints: [
        PROJECT_INDEX_PATH,
        DAO_OVERVIEW_PATH,
        DAO_TREASURY_OVERVIEW_PATH,
      ],
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
