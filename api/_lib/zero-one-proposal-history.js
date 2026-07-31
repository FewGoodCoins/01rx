const ZERO_ONE_RESOLVED_ORIGIN = 'https://api.01resolved.com';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_UPSTREAM_POINTS = 20_000;
const ORDER_PAGE_LIMIT = 500;
const INTERVAL_MS = Object.freeze({
  '15m': 15 * 60 * 1_000,
  '1h': 60 * 60 * 1_000,
});
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function resolveZeroOneResolvedApiKey(env = process.env) {
  return String(
    env.ZERO_ONE_RESOLVED_API_KEY
    || env.ONE_RESOLVED_API_KEY
    || env.RESOLVED_01_API_KEY
    || '',
  ).trim();
}

function finitePrice(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function timestampMs(value) {
  const milliseconds = new Date(value || '').getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function proposalHistoryRequest(requestUrl) {
  const url = requestUrl instanceof URL
    ? requestUrl
    : new URL(String(requestUrl || '/'), 'https://01rx.invalid');
  const proposal = String(url.searchParams.get('proposal') || '').trim();
  const interval = String(url.searchParams.get('interval') || '15m').trim().toLowerCase();
  if (
    url.pathname !== '/api/v1/futarchy'
    || url.searchParams.get('view') !== 'proposal-history'
    || !SOLANA_ADDRESS_PATTERN.test(proposal)
    || !INTERVAL_MS[interval]
  ) {
    return null;
  }
  return { interval, proposal };
}

function parseJsonBuffer(body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
  if (!buffer.length || buffer.length > MAX_RESPONSE_BYTES) return null;
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
}

function existingProposalHistory(body, proposal) {
  const envelope = parseJsonBuffer(body);
  const history = envelope?.ok === true && envelope.data && typeof envelope.data === 'object'
    ? envelope.data
    : null;
  if (!history || history.proposalId !== proposal) return null;
  return { envelope, history };
}

function normalizePriceChartRows(payload) {
  const rows = payload?.data?.prices ?? payload?.prices;
  return (Array.isArray(rows) ? rows : [])
    .slice(0, MAX_UPSTREAM_POINTS)
    .map((row) => {
      const observedMs = timestampMs(row?.timestamp);
      if (observedMs == null) return null;
      return {
        observedMs,
        underlyingPrice: finitePrice(row.spotPrice),
        passPrice: finitePrice(row.approvedPrice),
        failPrice: finitePrice(row.rejectedPrice),
        passTwap: finitePrice(row.approvedTwap),
        failTwap: finitePrice(row.rejectedTwap),
      };
    })
    .filter(Boolean);
}

function normalizeOrderRows(payload) {
  const rows = payload?.data;
  return (Array.isArray(rows) ? rows : [])
    .slice(0, MAX_UPSTREAM_POINTS)
    .map((row) => {
      const observedMs = timestampMs(row?.timeStamp ?? row?.timestamp);
      const price = finitePrice(row?.price);
      const market = String(row?.marketType || '').trim().toLowerCase();
      if (observedMs == null || price == null || !['pass', 'fail'].includes(market)) {
        return null;
      }
      return {
        observedMs,
        underlyingPrice: null,
        passPrice: market === 'pass' ? price : null,
        failPrice: market === 'fail' ? price : null,
        passTwap: null,
        failTwap: null,
      };
    })
    .filter(Boolean);
}

function aggregateRows(rows, interval) {
  const bucketWidth = INTERVAL_MS[interval];
  const buckets = new Map();
  const ordered = rows
    .filter(row => Number.isFinite(row?.observedMs))
    .sort((left, right) => left.observedMs - right.observedMs);

  for (const row of ordered) {
    const bucketMs = Math.floor(row.observedMs / bucketWidth) * bucketWidth;
    const current = buckets.get(bucketMs) || {
      bucketMs,
      lastObservedMs: row.observedMs,
      underlyingPrice: null,
      passPrice: null,
      failPrice: null,
      passTwap: null,
      failTwap: null,
      sampleCount: 0,
    };
    current.lastObservedMs = Math.max(current.lastObservedMs, row.observedMs);
    current.sampleCount += 1;
    for (const field of [
      'underlyingPrice',
      'passPrice',
      'failPrice',
      'passTwap',
      'failTwap',
    ]) {
      if (Number.isFinite(row[field])) current[field] = row[field];
    }
    buckets.set(bucketMs, current);
  }

  return [...buckets.values()]
    .sort((left, right) => left.bucketMs - right.bucketMs)
    .map(row => ({
      timestamp: new Date(row.bucketMs).toISOString(),
      observedAt: new Date(row.lastObservedMs).toISOString(),
      underlyingPrice: row.underlyingPrice,
      passPrice: row.passPrice,
      failPrice: row.failPrice,
      passTwap: row.passTwap,
      failTwap: row.failTwap,
      sampleCount: row.sampleCount,
    }))
    .filter(row => (
      Number.isFinite(row.underlyingPrice)
      || Number.isFinite(row.passPrice)
      || Number.isFinite(row.failPrice)
      || Number.isFinite(row.passTwap)
      || Number.isFinite(row.failTwap)
    ));
}

function coverageForSeries(series) {
  const coverage = {
    underlying: 0,
    pass: 0,
    fail: 0,
    passTwap: 0,
    failTwap: 0,
  };
  for (const point of series) {
    if (Number.isFinite(point.underlyingPrice)) coverage.underlying += 1;
    if (Number.isFinite(point.passPrice)) coverage.pass += 1;
    if (Number.isFinite(point.failPrice)) coverage.fail += 1;
    if (Number.isFinite(point.passTwap)) coverage.passTwap += 1;
    if (Number.isFinite(point.failTwap)) coverage.failTwap += 1;
  }
  return coverage;
}

function prunedDegradedState(degraded = {}) {
  const services = (Array.isArray(degraded.services) ? degraded.services : [])
    .filter(service => service !== '01resolved-proposal-price-history-unavailable');
  const issues = (Array.isArray(degraded.issues) ? degraded.issues : [])
    .filter(issue => !String(issue?.code || '').startsWith('ZERO_ONE_PRICE_HISTORY_'));
  return {
    active: services.length > 0 || issues.length > 0,
    services,
    issues,
  };
}

function historyEnvelope(existing, source, series, interval, preTwap) {
  const coverage = coverageForSeries(series);
  const complete = coverage.underlying > 0 && coverage.pass > 0 && coverage.fail > 0;
  const degraded = prunedDegradedState(existing.history.degraded);
  if (source === 'orders') {
    degraded.active = true;
    degraded.services.push('01resolved-proposal-price-chart-empty');
    degraded.issues.push({
      code: 'ZERO_ONE_ORDER_PRICE_HISTORY_USED',
      message: '01Resolved price-chart data was empty; observed proposal trade prices are shown instead.',
    });
  }
  const first = series[0];
  const last = series[series.length - 1];
  return {
    ...existing.envelope,
    data: {
      ...existing.history,
      interval,
      requestedInterval: interval,
      preTwap: timestampMs(preTwap) == null ? null : new Date(preTwap).toISOString(),
      availability: complete ? 'complete' : 'partial',
      series,
      summary: {
        pointCount: series.length,
        from: first?.timestamp || null,
        to: last?.timestamp || null,
        coverage,
      },
      source: source === 'price-chart'
        ? {
          provider: '01Resolved',
          endpoint: '/v1/proposal/{publicKey}/price-chart',
          sourceInterval: '15m',
          interval,
          requestedInterval: interval,
          aggregation: interval === '1h'
            ? 'last_non_null_observation_per_utc_hour'
            : 'last_non_null_observation_per_utc_15_minute_bucket',
          quoteCurrency: null,
        }
        : {
          provider: '01Resolved observed proposal trades',
          endpoint: '/v1/proposal/{publicKey}/orders',
          sourceInterval: 'event',
          interval,
          requestedInterval: interval,
          aggregation: interval === '1h'
            ? 'last_observed_trade_per_market_per_utc_hour'
            : 'last_observed_trade_per_market_per_utc_15_minute_bucket',
          quoteCurrency: null,
        },
      degraded,
    },
    ts: new Date().toISOString(),
  };
}

async function fetchJson(path, options) {
  const response = await options.fetchImpl(new URL(path, ZERO_ONE_RESOLVED_ORIGIN), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-api-key': options.apiKey,
      'user-agent': '01rx-proposal-history/1.0',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok || response.status >= 300) {
    throw new Error(`01Resolved HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('01Resolved response exceeded the safe size limit');
  }
  const body = Buffer.from(await response.arrayBuffer());
  const payload = parseJsonBuffer(body);
  if (!payload) throw new Error('01Resolved returned an invalid JSON response');
  return payload;
}

/**
 * Upgrade a validated NAVgator proposal-history response with the canonical
 * 01Resolved price series. The original response is retained on every failure.
 */
export async function enhanceProposalHistoryResponse(options = {}) {
  const input = proposalHistoryRequest(options.requestUrl);
  const apiKey = resolveZeroOneResolvedApiKey(options.env);
  if (!input || !apiKey) return null;

  const existing = existingProposalHistory(options.body, input.proposal);
  if (!existing) return null;
  if (
    existing.history.source?.provider === '01Resolved'
    && Array.isArray(existing.history.series)
    && existing.history.series.length > 0
  ) {
    return null;
  }

  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 5_000;
  const shared = { apiKey, fetchImpl, timeoutMs };
  try {
    const chart = await fetchJson(
      `/v1/proposal/${encodeURIComponent(input.proposal)}/price-chart`,
      shared,
    );
    const chartSeries = aggregateRows(normalizePriceChartRows(chart), input.interval);
    if (chartSeries.length > 0) {
      return Buffer.from(JSON.stringify(historyEnvelope(
        existing,
        'price-chart',
        chartSeries,
        input.interval,
        chart?.data?.preTwap ?? chart?.preTwap ?? null,
      )));
    }

    const orders = await fetchJson(
      `/v1/proposal/${encodeURIComponent(input.proposal)}/orders?limit=${ORDER_PAGE_LIMIT}&page=1`,
      shared,
    );
    const orderSeries = aggregateRows(normalizeOrderRows(orders), input.interval);
    if (orderSeries.length > 0) {
      return Buffer.from(JSON.stringify(historyEnvelope(
        existing,
        'orders',
        orderSeries,
        input.interval,
        existing.history.preTwap,
      )));
    }
  } catch (error) {
    options.logger?.warn?.(
      '[01rx/proposal-history] 01Resolved history enhancement unavailable:',
      error?.message || error,
    );
  }
  return null;
}

export const _test = Object.freeze({
  aggregateRows,
  coverageForSeries,
  existingProposalHistory,
  normalizeOrderRows,
  normalizePriceChartRows,
  proposalHistoryRequest,
});
