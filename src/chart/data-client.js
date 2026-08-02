function cleanBaseUrl(value) {
  return String(value || globalThis.location?.origin || '').replace(/\/+$/, '');
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

export function createMarketDataClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
} = {}) {
  const root = cleanBaseUrl(baseUrl);

  async function loadMarket(token, timeframe, { signal } = {}) {
    const tokenKey = String(token || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(tokenKey)) throw new Error('Enter a valid token key');
    if (!root) throw new Error('Market data client requires a same-origin API base');
    const currentUrl = new URL('/api/current-nav', root);
    currentUrl.searchParams.set('token', tokenKey);
    currentUrl.searchParams.set('compact', '1');
    const snapshot = await fetchJson(fetchImpl, currentUrl, signal);
    return {
      token: tokenKey,
      timeframe,
      config: snapshot,
      current: snapshot,
      candles: [],
      navRows: [],
      actualPriceTimeframe: null,
      actualNavTimeframe: null,
      availability: 'current-only',
      missing: ['ownership-token-ohlcv', 'historic-nav'],
    };
  }

  return {
    baseUrl: root,
    loadMarket,
  };
}
