import {
  aggregateCandles,
  aggregateNavRows,
  normalizeCandles,
  normalizeNavRows,
} from './model.js';

function cleanBaseUrl(value) {
  return String(value || 'https://navgator.xyz').replace(/\/+$/, '');
}

async function fetchJson(fetchImpl, url, signal) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`Market data request failed (${response.status})`);
  const payload = await response.json();
  if (payload?.ok === false) throw new Error(payload.error || 'Market data request failed');
  return payload?.ok === true ? payload.data : payload;
}

function ohlcvItems(payload) {
  return payload?.data?.items
    || payload?.items
    || payload?.data?.data?.items
    || [];
}

function navItems(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export function createMarketDataClient({
  baseUrl = 'https://navgator.xyz',
  fetchImpl = globalThis.fetch,
} = {}) {
  const root = cleanBaseUrl(baseUrl);

  async function loadMarket(token, timeframe, { signal } = {}) {
    const tokenKey = String(token || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(tokenKey)) throw new Error('Enter a valid token key');
    const configUrl = new URL('/api/tokens-config', root);
    configUrl.searchParams.set('token', tokenKey);
    const priceUrl = new URL('/api/ohlcv', root);
    priceUrl.searchParams.set('token', tokenKey);
    const requestedPriceTimeframe = timeframe === '4H'
      ? '1H'
      : timeframe === '1W'
        ? '1D'
        : timeframe;
    priceUrl.searchParams.set('tf', requestedPriceTimeframe);
    const navUrl = new URL('/api/historic-nav', root);
    navUrl.searchParams.set('token', tokenKey);
    navUrl.searchParams.set('days', timeframe === '15m' ? '45' : '3650');
    navUrl.searchParams.set('resolution', timeframe);

    const [config, pricePayload, navPayload] = await Promise.all([
      fetchJson(fetchImpl, configUrl, signal),
      fetchJson(fetchImpl, priceUrl, signal),
      fetchJson(fetchImpl, navUrl, signal),
    ]);

    const normalizedCandles = normalizeCandles(ohlcvItems(pricePayload));
    const normalizedNav = normalizeNavRows(navItems(navPayload));
    const actualPriceTimeframe = pricePayload?.actualTf || requestedPriceTimeframe;
    const actualNavTimeframe = navPayload?.meta?.actualResolution || timeframe;
    return {
      token: tokenKey,
      timeframe,
      config,
      candles: aggregateCandles(normalizedCandles, timeframe),
      navRows: actualNavTimeframe === timeframe
        ? normalizedNav
        : aggregateNavRows(normalizedNav, timeframe),
      actualPriceTimeframe: timeframe,
      actualNavTimeframe: timeframe === '1W' ? '1W' : actualNavTimeframe,
    };
  }

  return {
    baseUrl: root,
    loadMarket,
  };
}
