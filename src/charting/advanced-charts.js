const OFFICIAL_PLAYGROUND_LIBRARY_PATH = '/__tradingview/charting_library/';

const SUPPORTED_RESOLUTIONS = Object.freeze([
  '1',
  '5',
  '15',
  '60',
  '240',
  '1D',
  '1W',
]);

const RESOLUTION_TO_TIMEFRAME = Object.freeze({
  1: '1m',
  5: '5m',
  15: '15m',
  60: '1H',
  240: '4H',
  '1D': '1D',
  '1W': '1W',
});

const TIMEFRAME_TO_RESOLUTION = Object.freeze(
  Object.entries(RESOLUTION_TO_TIMEFRAME).reduce((result, [resolution, timeframe]) => {
    result[timeframe] = resolution;
    return result;
  }, {}),
);

const TIMEFRAME_SECONDS = Object.freeze({
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1H': 60 * 60,
  '4H': 4 * 60 * 60,
  '1D': 24 * 60 * 60,
  '1W': 7 * 24 * 60 * 60,
});

const SYMBOL_KINDS = new Set(['price', 'nav', 'projected-nav']);
const SCRIPT_LOAD_TIMEOUT_MS = 15_000;
const REALTIME_POLL_MS = 30_000;

function buildConfiguredLibraryPath() {
  try {
    return String(import.meta.env?.VITE_TRADINGVIEW_LIBRARY_PATH || '').trim();
  } catch (_) {
    return '';
  }
}

function nextTask(runtime, callback) {
  if (typeof runtime?.setTimeout === 'function') {
    runtime.setTimeout(callback, 0);
    return;
  }
  setTimeout(callback, 0);
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeTokenKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function normalizeTicker(value, tokenKey) {
  const ticker = String(value || tokenKey || 'TOKEN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
  return ticker || 'TOKEN';
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeLibraryPath(value, runtime) {
  const path = String(value || '').trim();
  if (!path) return '';
  try {
    const parsed = new runtime.URL(path, runtime.location.href);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname);
    if (
      parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
    ) {
      return '';
    }
    return `${stripTrailingSlash(parsed.href)}/`;
  } catch (_) {
    return '';
  }
}

function configuredLibraryPath(runtime) {
  return firstText(
    runtime.NAVGATOR_CONFIG?.tradingViewLibraryPath,
    runtime.NAVGATOR_CONFIG?.advancedChartsLibraryPath,
    runtime.NAVGATOR?.config?.tradingViewLibraryPath,
    runtime.NAVGATOR?.config?.advancedChartsLibraryPath,
    buildConfiguredLibraryPath(),
  );
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function tradingViewResolutionForTimeframe(timeframe) {
  return TIMEFRAME_TO_RESOLUTION[String(timeframe || '')] || '1D';
}

export function timeframeForTradingViewResolution(resolution) {
  return RESOLUTION_TO_TIMEFRAME[String(resolution || '')] || '';
}

export function tradingViewSymbol(tokenKey, kind = 'price', ticker = '') {
  const token = normalizeTokenKey(tokenKey);
  const symbolTicker = normalizeTicker(ticker, token);
  const normalizedKind = SYMBOL_KINDS.has(kind) ? kind : 'price';
  if (normalizedKind === 'nav') return `01RX:${symbolTicker}.NAV`;
  if (normalizedKind === 'projected-nav') return `01RX:${symbolTicker}.PNAV`;
  return `01RX:${symbolTicker}`;
}

export function parseTradingViewSymbol(value, fallbackToken = '') {
  const raw = String(value || '').trim().toUpperCase();
  const withoutExchange = raw.startsWith('01RX:') ? raw.slice(5) : raw;
  let kind = 'price';
  let ticker = withoutExchange;
  if (ticker.endsWith('.PNAV')) {
    kind = 'projected-nav';
    ticker = ticker.slice(0, -5);
  } else if (ticker.endsWith('.NAV')) {
    kind = 'nav';
    ticker = ticker.slice(0, -4);
  }
  ticker = normalizeTicker(ticker, fallbackToken);
  return {
    kind,
    ticker,
    tokenKey: normalizeTokenKey(fallbackToken || ticker),
  };
}

export function resolveAdvancedChartsConfiguration(runtime) {
  const params = new runtime.URLSearchParams(runtime.location.search || '');
  const requestedEngine = String(params.get('chartEngine') || '').trim().toLowerCase();
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(
    runtime.location.hostname || '',
  );
  const is01rxFrame = params.get('frame') === '01rx'
    || runtime.document?.documentElement?.dataset?.['01rxChartFrame'] === 'true';
  const configured = normalizeLibraryPath(configuredLibraryPath(runtime), runtime);

  if (requestedEngine === 'lightweight') {
    return {
      enabled: false,
      libraryPath: '',
      productionReady: false,
      source: 'disabled-by-query',
    };
  }

  if (configured) {
    return {
      enabled: is01rxFrame || requestedEngine === 'advanced',
      libraryPath: configured,
      productionReady: true,
      source: 'configured',
    };
  }

  if (isLocalHost && is01rxFrame) {
    return {
      enabled: true,
      libraryPath: OFFICIAL_PLAYGROUND_LIBRARY_PATH,
      productionReady: false,
      source: 'official-playground',
    };
  }

  return {
    enabled: false,
    libraryPath: '',
    productionReady: false,
    source: 'library-unavailable',
  };
}

export function loadAdvancedChartsLibrary(runtime, configuration) {
  if (runtime.TradingView?.widget) return Promise.resolve(runtime.TradingView);
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  if (runtime.NAVGATOR.advancedChartsLibraryPromise) {
    return runtime.NAVGATOR.advancedChartsLibraryPromise;
  }
  if (!configuration?.enabled || !configuration.libraryPath) {
    return Promise.reject(new Error('TradingView Advanced Charts is not configured'));
  }

  const scriptUrl = `${configuration.libraryPath}charting_library.standalone.js`;
  runtime.NAVGATOR.advancedChartsLibraryPromise = new Promise((resolve, reject) => {
    const existing = runtime.document.querySelector(
      'script[data-navgator-advanced-charts="true"]',
    );
    const script = existing || runtime.document.createElement('script');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      runtime.clearTimeout?.(timeout);
      if (error) {
        runtime.NAVGATOR.advancedChartsLibraryPromise = null;
        reject(error);
        return;
      }
      if (!runtime.TradingView?.widget) {
        runtime.NAVGATOR.advancedChartsLibraryPromise = null;
        reject(new Error('TradingView library loaded without the widget constructor'));
        return;
      }
      resolve(runtime.TradingView);
    };
    const timeout = runtime.setTimeout?.(
      () => finish(new Error('TradingView library load timed out')),
      SCRIPT_LOAD_TIMEOUT_MS,
    );
    script.addEventListener('load', () => finish(), { once: true });
    script.addEventListener(
      'error',
      () => finish(new Error(`Unable to load TradingView library from ${scriptUrl}`)),
      { once: true },
    );
    if (!existing) {
      script.src = scriptUrl;
      script.async = true;
      script.dataset.navgatorAdvancedCharts = 'true';
      runtime.document.head.appendChild(script);
    } else if (runtime.TradingView?.widget) {
      finish();
    }
  });
  return runtime.NAVGATOR.advancedChartsLibraryPromise;
}

function milliseconds(value) {
  const time = Number(value);
  if (!Number.isFinite(time)) return null;
  return time > 10_000_000_000 ? Math.round(time) : Math.round(time * 1_000);
}

function normalizeBar(item) {
  if (!item || typeof item !== 'object') return null;
  const time = milliseconds(
    item.time
      ?? item.unixTime
      ?? item.unix_time
      ?? item.ts
      ?? item.timestamp,
  );
  const close = finiteNumber(item.close, item.c, item.price, item.value, item.nav, item.spot);
  if (!Number.isFinite(time) || !Number.isFinite(close) || close < 0) return null;
  const open = finiteNumber(item.open, item.o, close);
  const high = finiteNumber(item.high, item.h, open, close);
  const low = finiteNumber(item.low, item.l, open, close);
  const volume = finiteNumber(item.volume, item.v, item.volumeUsd, item.volume_usd, 0);
  return {
    time,
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close,
    ...(Number.isFinite(volume) ? { volume } : {}),
  };
}

export function normalizeTradingViewBars(items) {
  const byTime = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const bar = normalizeBar(item);
    if (bar) byTime.set(bar.time, bar);
  });
  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
}

export function normalizeOhlcvResponse(payload) {
  const body = payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload;
  const items = body?.items
    || body?.data?.items
    || body?.data?.data?.items
    || [];
  return normalizeTradingViewBars(items);
}

export function normalizeNavResponse(payload, field = 'nav') {
  const body = payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload;
  const items = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.points)
        ? body.points
        : [];
  return normalizeTradingViewBars(items.map((item) => ({
    time: item?.time ?? item?.ts ?? item?.timestamp,
    value: finiteNumber(item?.[field], item?.value),
  })));
}

function filterBarsForPeriod(bars, periodParams) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const from = Number(periodParams?.from) * 1_000;
  const to = Number(periodParams?.to) * 1_000;
  let result = bars.filter(bar => (
    (!Number.isFinite(from) || bar.time >= from)
    && (!Number.isFinite(to) || bar.time < to)
  ));
  const countBack = Math.max(0, Number(periodParams?.countBack) || 0);
  if (countBack && result.length < countBack) {
    const before = bars.filter(bar => !Number.isFinite(to) || bar.time < to);
    result = before.slice(Math.max(0, before.length - countBack));
  }
  return result;
}

function symbolKindFromInfo(symbolInfo, fallbackToken) {
  const parsed = parseTradingViewSymbol(
    symbolInfo?.ticker || symbolInfo?.name,
    symbolInfo?.tokenKey || fallbackToken,
  );
  return {
    ...parsed,
    kind: SYMBOL_KINDS.has(symbolInfo?.seriesKind)
      ? symbolInfo.seriesKind
      : parsed.kind,
    tokenKey: normalizeTokenKey(symbolInfo?.tokenKey || parsed.tokenKey || fallbackToken),
  };
}

function resolutionSeconds(resolution) {
  return TIMEFRAME_SECONDS[timeframeForTradingViewResolution(resolution)] || 86_400;
}

function syntheticKey(symbol, resolution) {
  return `${String(symbol || '').toUpperCase()}|${String(resolution || '')}`;
}

function priceScaleForBars(bars) {
  const values = bars.slice(-50).flatMap(bar => [bar.open, bar.high, bar.low, bar.close]);
  const smallest = values.filter(value => Number.isFinite(value) && value > 0)
    .reduce((minimum, value) => Math.min(minimum, value), Infinity);
  if (smallest < 0.001) return 100_000_000;
  if (smallest < 0.1) return 1_000_000;
  if (smallest < 100) return 100_000;
  return 100;
}

export function create01rxAdvancedChartsDatafeed({
  runtime,
  tokenKey,
  ticker,
  pollIntervalMs = REALTIME_POLL_MS,
} = {}) {
  const normalizedToken = normalizeTokenKey(tokenKey);
  const normalizedTicker = normalizeTicker(ticker, normalizedToken);
  const api = runtime?.NAVGATOR?.api;
  const syntheticSeries = new Map();
  const subscriptions = new Map();

  async function loadRemoteBars(symbolInfo, resolution, periodParams = {}) {
    const identity = symbolKindFromInfo(symbolInfo, normalizedToken);
    const timeframe = timeframeForTradingViewResolution(resolution);
    if (!timeframe || !api?.json || !api.baseUrl) return [];
    const seconds = resolutionSeconds(resolution);
    const to = Number(periodParams.to) || Math.floor(Date.now() / 1_000) + seconds;
    const countBack = Math.max(2, Number(periodParams.countBack) || 300);
    const requestedFrom = Number(periodParams.from) || (to - countBack * seconds);
    const from = Math.min(requestedFrom, to - countBack * seconds);

    if (identity.kind === 'price') {
      const url = new runtime.URL('/api/ohlcv', api.baseUrl);
      url.searchParams.set('token', identity.tokenKey);
      url.searchParams.set('tf', timeframe);
      url.searchParams.set('time_from', String(Math.max(0, Math.floor(from))));
      url.searchParams.set('time_to', String(Math.ceil(to)));
      return normalizeOhlcvResponse(await api.json(url.href, { timeoutMs: 12_000 }));
    }

    if (identity.kind === 'nav') {
      const days = Math.min(
        3_650,
        Math.max(7, Math.ceil((to - from) / 86_400) + 2),
      );
      const url = new runtime.URL('/api/historic-nav', api.baseUrl);
      url.searchParams.set('token', identity.tokenKey);
      url.searchParams.set('days', String(days));
      url.searchParams.set('resolution', timeframe);
      return normalizeNavResponse(await api.json(url.href, { timeoutMs: 12_000 }), 'nav');
    }

    return [];
  }

  async function barsFor(symbolInfo, resolution, periodParams = {}) {
    const symbol = symbolInfo?.ticker || symbolInfo?.name;
    const stored = syntheticSeries.get(syntheticKey(symbol, resolution));
    if (stored?.length) return filterBarsForPeriod(stored, periodParams);
    const remote = await loadRemoteBars(symbolInfo, resolution, periodParams);
    return filterBarsForPeriod(remote, periodParams);
  }

  function resolveSymbol(symbolName, onResolve, onError) {
    try {
      const parsed = parseTradingViewSymbol(symbolName, normalizedToken);
      const kind = parsed.kind;
      const displayTicker = parsed.ticker || normalizedTicker;
      const canonical = tradingViewSymbol(parsed.tokenKey, kind, displayTicker);
      const sampleBars = syntheticSeries.get(
        syntheticKey(canonical, tradingViewResolutionForTimeframe('1D')),
      ) || [];
      const suffix = kind === 'nav'
        ? ' NAV'
        : kind === 'projected-nav'
          ? ' Projected NAV'
          : ' / USD';
      nextTask(runtime, () => onResolve({
        name: canonical,
        ticker: canonical,
        description: `${displayTicker}${suffix}`,
        type: 'crypto',
        session: '24x7',
        timezone: 'Etc/UTC',
        exchange: '01RX',
        listed_exchange: '01RX',
        format: 'price',
        minmov: 1,
        pricescale: priceScaleForBars(sampleBars),
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
        intraday_multipliers: ['1', '5', '15', '60', '240'],
        supported_resolutions: [...SUPPORTED_RESOLUTIONS],
        volume_precision: 2,
        data_status: kind === 'projected-nav' ? 'endofday' : 'streaming',
        seriesKind: kind,
        tokenKey: parsed.tokenKey,
      }));
    } catch (error) {
      nextTask(runtime, () => onError(error?.message || 'Unable to resolve 01RX symbol'));
    }
  }

  const datafeed = {
    onReady(callback) {
      nextTask(runtime, () => callback({
        supports_search: false,
        supports_group_request: false,
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
        supported_resolutions: [...SUPPORTED_RESOLUTIONS],
        exchanges: [{ value: '01RX', name: '01RX', desc: '01RX markets' }],
        symbols_types: [{ name: 'Ownership token', value: 'crypto' }],
      }));
    },

    searchSymbols(userInput, exchange, symbolType, onResult) {
      const query = String(userInput || '').trim().toUpperCase();
      const symbols = ['price', 'nav', 'projected-nav'].map(kind => ({
        symbol: tradingViewSymbol(normalizedToken, kind, normalizedTicker),
        ticker: tradingViewSymbol(normalizedToken, kind, normalizedTicker),
        description: `${normalizedTicker} ${
          kind === 'price' ? 'Price' : kind === 'nav' ? 'NAV' : 'Projected NAV'
        }`,
        exchange: '01RX',
        type: 'crypto',
      })).filter(item => !query || `${item.symbol} ${item.description}`.includes(query));
      nextTask(runtime, () => onResult(symbols));
    },

    resolveSymbol,

    async getBars(symbolInfo, resolution, periodParams, onHistory, onError) {
      try {
        const bars = await barsFor(symbolInfo, resolution, periodParams);
        nextTask(runtime, () => onHistory(bars, { noData: bars.length === 0 }));
      } catch (error) {
        nextTask(runtime, () => onError(error?.message || 'Unable to load 01RX bars'));
      }
    },

    subscribeBars(symbolInfo, resolution, onTick, listenerGuid) {
      const subscription = {
        lastTime: 0,
        listenerGuid,
        onTick,
        resolution,
        symbolInfo,
        timer: null,
      };
      const poll = async () => {
        try {
          const now = Math.floor(Date.now() / 1_000);
          const seconds = resolutionSeconds(resolution);
          const bars = await barsFor(symbolInfo, resolution, {
            countBack: 2,
            from: now - seconds * 3,
            to: now + seconds,
          });
          const latest = bars[bars.length - 1];
          if (latest && latest.time >= subscription.lastTime) {
            subscription.lastTime = latest.time;
            onTick(latest);
          }
        } catch (_) {
          // A transient poll failure should not tear down the active chart.
        }
      };
      subscription.timer = runtime.setInterval?.(poll, pollIntervalMs);
      subscriptions.set(listenerGuid, subscription);
      poll();
    },

    unsubscribeBars(listenerGuid) {
      const subscription = subscriptions.get(listenerGuid);
      if (subscription?.timer) runtime.clearInterval?.(subscription.timer);
      subscriptions.delete(listenerGuid);
    },

    getServerTime(callback) {
      nextTask(runtime, () => callback(Math.floor(Date.now() / 1_000)));
    },
  };

  function setSeries(symbol, resolution, bars) {
    const normalized = normalizeTradingViewBars(bars);
    syntheticSeries.set(syntheticKey(symbol, resolution), normalized);
    const latest = normalized[normalized.length - 1];
    if (!latest) return;
    subscriptions.forEach((subscription) => {
      const subscriptionSymbol = String(
        subscription.symbolInfo?.ticker || subscription.symbolInfo?.name || '',
      ).toUpperCase();
      if (
        subscriptionSymbol !== String(symbol || '').toUpperCase()
        || String(subscription.resolution) !== String(resolution)
        || latest.time < subscription.lastTime
      ) return;
      subscription.lastTime = latest.time;
      subscription.onTick(latest);
    });
  }

  function destroy() {
    subscriptions.forEach((subscription) => {
      if (subscription.timer) runtime.clearInterval?.(subscription.timer);
    });
    subscriptions.clear();
    syntheticSeries.clear();
  }

  return {
    datafeed,
    destroy,
    setSeries,
  };
}

function chartSnapshotVisibility(snapshot) {
  return {
    currentPrice: snapshot?.visibility?.currentPrice !== false,
    historicPrice: snapshot?.visibility?.historicPrice !== false,
    currentNav: snapshot?.visibility?.currentNav !== false,
    historicNav: snapshot?.visibility?.historicNav !== false,
    projectedNav: snapshot?.visibility?.projectedNav === true,
    gradient: snapshot?.visibility?.gradient === true,
  };
}

function invokeLegacyChartAction(runtime, action) {
  if (action === 'current-price') runtime.toggleChartCurrentSeries?.('price');
  else if (action === 'historic-price') runtime.toggleChartHistoricalSeries?.('price');
  else if (action === 'current-nav') runtime.toggleChartCurrentSeries?.('nav');
  else if (action === 'historic-nav') runtime.toggleChartHistoricalSeries?.('nav');
  else if (action === 'projected-nav') runtime.toggleChartFeature?.('projected-nav');
  else if (action === 'gradient') runtime.toggleChartFeature?.('gradient');
}

function chartLineDropdownIcon() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19l6-7 4 4 8-9"/></svg>';
}

function chevronDropdownIcon() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 5 5 5-5"/></svg>';
}

async function removeEntity(chart, entityId) {
  if (!entityId) return;
  try {
    chart.removeEntity(await Promise.resolve(entityId));
  } catch (_) {
    // Entity may already have been removed by a chart reset.
  }
}

function chartPointValue(item) {
  return finiteNumber(
    item?.close,
    item?.value,
    item?.price,
    item?.nav,
    item?.spot,
  );
}

function chartValueAtTime(items, time, interpolate = false) {
  const target = milliseconds(time);
  if (!Number.isFinite(target)) return null;
  const points = (Array.isArray(items) ? items : [])
    .map(item => ({
      time: milliseconds(item?.time ?? item?.ts ?? item?.timestamp),
      value: chartPointValue(item),
    }))
    .filter(point => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((left, right) => left.time - right.time);
  if (!points.length || target < points[0].time || target > points.at(-1).time) {
    return null;
  }
  let previous = points[0];
  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    if (target === next.time) return next.value;
    if (target < next.time) {
      if (!interpolate || next.time === previous.time) return previous.value;
      const progress = (target - previous.time) / (next.time - previous.time);
      return previous.value + (next.value - previous.value) * progress;
    }
    previous = next;
  }
  return previous.value;
}

function chartFundamentalsAtTime(items, time) {
  const target = milliseconds(time);
  if (!Number.isFinite(target)) return { supply: null, treasury: null };
  const points = (Array.isArray(items) ? items : [])
    .map(item => ({
      supply: finiteNumber(
        item?.effectiveSupply,
        item?.effSupply,
        item?.effective_supply,
        item?.supply,
      ),
      time: milliseconds(item?.time ?? item?.ts ?? item?.timestamp),
      treasury: finiteNumber(
        item?.treasury,
        item?.treasuryUSDC,
        item?.treasury_usdc,
      ),
    }))
    .filter(point => Number.isFinite(point.time)
      && (Number.isFinite(point.treasury) || Number.isFinite(point.supply)))
    .sort((left, right) => left.time - right.time);
  if (!points.length || target < points[0].time || target > points.at(-1).time) {
    return { supply: null, treasury: null };
  }
  let selected = points[0];
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].time > target) break;
    selected = points[index];
  }
  return { supply: selected.supply, treasury: selected.treasury };
}

export function advancedChartStatusValues(snapshot, time = null) {
  const hovered = time !== null
    && time !== undefined
    && Number.isFinite(Number(time));
  const price = hovered
    ? chartValueAtTime(snapshot?.priceBars, time)
    : finiteNumber(snapshot?.currentPrice, chartPointValue(snapshot?.priceBars?.at(-1)));
  const nav = hovered
    ? chartValueAtTime(snapshot?.navBars, time, true)
    : finiteNumber(snapshot?.currentNav, chartPointValue(snapshot?.navBars?.at(-1)));
  const discount = Number.isFinite(price) && Number.isFinite(nav) && nav > 0
    ? ((nav - price) / nav) * 100
    : null;
  const fundamentals = hovered
    ? chartFundamentalsAtTime(snapshot?.fundamentalBars, time)
    : {
        supply: finiteNumber(snapshot?.effectiveSupply),
        treasury: finiteNumber(snapshot?.treasury),
      };
  return {
    discount,
    nav,
    price,
    supply: fundamentals.supply,
    treasury: fundamentals.treasury,
  };
}

function formatStatusPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const absolute = Math.abs(number);
  const decimals = absolute >= 1_000
    ? 2
    : absolute >= 1
      ? 4
      : absolute >= 0.01
        ? 5
        : 8;
  return number.toFixed(decimals);
}

function formatStatusDiscount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const sign = number < 0 ? '−' : '';
  return `${sign}${Math.abs(number).toFixed(2)}%`;
}

function formatStatusCompact(value, money = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const absolute = Math.abs(number);
  const prefix = money ? '$' : '';
  if (absolute >= 1_000_000_000) {
    return `${prefix}${(number / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`;
  }
  if (absolute >= 1_000_000) {
    return `${prefix}${(number / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
  }
  if (absolute >= 1_000) {
    return `${prefix}${(number / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return `${prefix}${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function moveChartStatsIntoFrame(mountState) {
  const frame = mountState?.container?.querySelector?.('iframe');
  const stats = mountState?.stats;
  if (!frame || !stats) return false;
  try {
    const frameDocument = frame.contentDocument;
    if (!frameDocument?.body) return false;
    if (!frameDocument.querySelector('style[data-01rx-chart-stats]')) {
      const style = frameDocument.createElement('style');
      style.setAttribute('data-01rx-chart-stats', '');
      style.textContent = `
        .advanced-chart-stats {
          position: fixed;
          z-index: 2;
          top: 46px;
          left: 8px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          max-width: calc(100% - 24px);
          color: #d1d4dc;
          font-family: -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
          font-weight: 400;
          line-height: 18px;
          white-space: nowrap;
          pointer-events: none;
        }
        .advanced-chart-status-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .advanced-chart-stats span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .advanced-chart-stats small {
          color: #787b86;
          font: inherit;
        }
        .advanced-chart-stats strong {
          color: #d1d4dc;
          font: inherit;
        }
        .advanced-chart-stats .nav {
          color: #f0b90b;
        }
        .advanced-chart-stats .discount.positive {
          color: #26a69a;
        }
        .advanced-chart-stats .discount.negative {
          color: #ef5350;
        }
      `;
      frameDocument.head?.appendChild(style);
    }
    frameDocument.body.appendChild(stats);
    return true;
  } catch (_) {
    // Approved production artifacts are same-origin; retain the parent overlay as a fallback.
    return false;
  }
}

function updateChartStats(mountState, snapshot, time = null) {
  if (!mountState?.stats) return;
  const values = advancedChartStatusValues(snapshot, time);
  const discountTone = !Number.isFinite(values.discount)
    ? 'neutral'
    : values.discount > 0
      ? 'positive'
      : values.discount < 0
        ? 'negative'
        : 'neutral';
  mountState.stats.innerHTML = `
    <div class="advanced-chart-status-row">
      <span><small>PRICE</small><strong class="price">${formatStatusPrice(values.price)}</strong></span>
      <span><small>NAV</small><strong class="nav">${formatStatusPrice(values.nav)}</strong></span>
      <span><small>DISCOUNT</small><strong class="discount ${discountTone}">${formatStatusDiscount(values.discount)}</strong></span>
    </div>
    <div class="advanced-chart-status-row advanced-chart-status-fundamentals">
      <span><small>TREASURY</small><strong>${formatStatusCompact(values.treasury, true)}</strong></span>
    </div>
    <div class="advanced-chart-status-row advanced-chart-status-fundamentals">
      <span><small>SUPPLY</small><strong>${formatStatusCompact(values.supply)}</strong></span>
    </div>
  `;
  mountState.stats.hidden = !Number.isFinite(values.price)
    && !Number.isFinite(values.nav)
    && !Number.isFinite(values.treasury)
    && !Number.isFinite(values.supply);
}

function latestSnapshotTime(snapshot) {
  const candidates = [
    ...(snapshot?.priceBars || []),
    ...(snapshot?.navBars || []),
  ].map(item => milliseconds(item?.time)).filter(Number.isFinite);
  return candidates.length ? Math.max(...candidates) : Date.now();
}

export function installBrowserAdvancedCharts(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const configuration = resolveAdvancedChartsConfiguration(runtime);
  const mounts = new WeakMap();
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.chartEngines = runtime.NAVGATOR.chartEngines || {};

  async function mount(snapshot) {
    const host = snapshot?.container;
    if (!host || !configuration.enabled) return null;
    const existing = mounts.get(host);
    if (existing) return existing;

    const mountState = {
      configuration,
      currentLineEntities: { nav: null, price: null },
      datafeed: null,
      destroyed: false,
      latestSnapshot: snapshot,
      mountPromise: null,
      overlayStudies: { nav: null, projectedNav: null },
      resetFrame: null,
      studySync: Promise.resolve(),
      widget: null,
    };
    mounts.set(host, mountState);

    mountState.mountPromise = loadAdvancedChartsLibrary(runtime, configuration)
      .then(() => {
        if (mountState.destroyed) return null;
        const token = normalizeTokenKey(snapshot.tokenKey);
        const ticker = normalizeTicker(snapshot.ticker, token);
        const resolution = tradingViewResolutionForTimeframe(snapshot.timeframe);
        const priceSymbol = tradingViewSymbol(token, 'price', ticker);
        const navSymbol = tradingViewSymbol(token, 'nav', ticker);
        const projectedNavSymbol = tradingViewSymbol(token, 'projected-nav', ticker);
        const feed = create01rxAdvancedChartsDatafeed({
          runtime,
          tokenKey: token,
          ticker,
        });
        mountState.datafeed = feed;
        feed.setSeries(priceSymbol, resolution, snapshot.priceBars);
        feed.setSeries(navSymbol, resolution, snapshot.navBars);
        feed.setSeries(projectedNavSymbol, resolution, snapshot.projectedNavBars);

        const container = runtime.document.createElement('div');
        container.className = 'advanced-charts-surface';
        container.dataset.navgatorChartEngine = 'advanced';
        host.appendChild(container);
        mountState.container = container;
        const stats = runtime.document.createElement('div');
        stats.className = 'advanced-chart-stats';
        stats.setAttribute(
          'aria-label',
          'Chart price, NAV, discount, treasury, and effective supply',
        );
        host.appendChild(stats);
        mountState.stats = stats;
        updateChartStats(mountState, snapshot);

        const widget = new runtime.TradingView.widget({
          autosize: true,
          container,
          datafeed: feed.datafeed,
          disabled_features: [
            'create_volume_indicator_by_default',
            'create_volume_indicator_by_default_once',
            'display_market_status',
            'header_compare',
            'header_quick_search',
            'header_saveload',
            'header_symbol_search',
            'left_toolbar',
            'legend_widget',
            'save_chart_properties_to_local_storage',
            'symbol_info',
            'symbol_search_hot_key',
            'timeframes_toolbar',
            'use_localstorage_for_settings',
          ],
          enabled_features: [
            'accessible_keyboard_shortcuts',
            'header_chart_type',
            'header_fullscreen_button',
            'header_indicators',
            'header_resolutions',
            'header_screenshot',
            'header_settings',
            'header_undo_redo',
            'move_logo_to_main_pane',
            'remove_library_container_border',
          ],
          header_widget_buttons_mode: 'compact',
          interval: resolution,
          library_path: configuration.libraryPath,
          locale: 'en',
          loading_screen: {
            backgroundColor: '#101010',
            foregroundColor: '#777770',
          },
          overrides: {
            'mainSeriesProperties.candleStyle.borderDownColor': '#ff5f6d',
            'mainSeriesProperties.candleStyle.borderUpColor': '#35d093',
            'mainSeriesProperties.candleStyle.downColor': '#ff5f6d',
            'mainSeriesProperties.candleStyle.upColor': '#35d093',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ff5f6d',
            'mainSeriesProperties.candleStyle.wickUpColor': '#35d093',
            'paneProperties.background': '#101010',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.horzGridProperties.color': '#20201f',
            'paneProperties.legendProperties.showBarChange': false,
            'paneProperties.legendProperties.showSeriesOHLC': false,
            'paneProperties.legendProperties.showSeriesTitle': false,
            'paneProperties.legendProperties.showStudyArguments': false,
            'paneProperties.legendProperties.showStudyTitles': false,
            'paneProperties.legendProperties.showStudyValues': false,
            'paneProperties.vertGridProperties.color': '#1a1a19',
            'scalesProperties.lineColor': '#292929',
            'scalesProperties.textColor': '#8e8e88',
          },
          symbol: priceSymbol,
          theme: 'dark',
          timezone: 'Etc/UTC',
        });
        mountState.widget = widget;

        return widget.chartReady().then(async () => {
          if (mountState.destroyed) return null;
          runtime.document.documentElement.dataset.chartEngine = 'advanced';
          container.classList.add('is-ready');
          moveChartStatsIntoFrame(mountState);
          const chart = widget.activeChart();
          mountState.crosshairSubscription = chart.crossHairMoved?.();
          mountState.crosshairHandler = ({ time } = {}) => {
            if (!Number.isFinite(Number(time))) return;
            updateChartStats(mountState, mountState.latestSnapshot, time);
          };
          mountState.crosshairSubscription?.subscribe?.(null, mountState.crosshairHandler);
          mountState.pointerLeaveHandler = () => {
            updateChartStats(mountState, mountState.latestSnapshot);
          };
          container.addEventListener('mouseleave', mountState.pointerLeaveHandler);
          mountState.intervalSubscription = chart.onIntervalChanged();
          mountState.intervalSubscription.subscribe(null, (nextResolution) => {
            const timeframe = timeframeForTradingViewResolution(nextResolution);
            if (!timeframe || timeframe === mountState.latestSnapshot?.timeframe) return;
            const option = runtime.document.querySelector(
              `.chart-timeframe-option[data-tf="${timeframe}"]:not([disabled])`,
            );
            option?.click();
          });

          await widget.headerReady();
          await widget.createDropdown({
            icon: chartLineDropdownIcon(),
            items: [
              { title: 'Current Price', onSelect: () => invokeLegacyChartAction(runtime, 'current-price') },
              { title: 'Historic Price', onSelect: () => invokeLegacyChartAction(runtime, 'historic-price') },
              { title: 'Current NAV', onSelect: () => invokeLegacyChartAction(runtime, 'current-nav') },
              { title: 'Historic NAV', onSelect: () => invokeLegacyChartAction(runtime, 'historic-nav') },
            ],
            title: '',
            tooltip: 'Price and NAV lines',
          });
          await widget.createDropdown({
            icon: chevronDropdownIcon(),
            items: [
              { title: 'Projected NAV', onSelect: () => invokeLegacyChartAction(runtime, 'projected-nav') },
              { title: 'Gradient', onSelect: () => invokeLegacyChartAction(runtime, 'gradient') },
            ],
            title: '',
            tooltip: 'More chart features',
          });
          return mountState;
        });
      })
      .catch((error) => {
        mountState.error = error;
        mountState.container?.remove();
        runtime.document.documentElement.dataset.chartEngine = 'lightweight';
        console.warn('[01RX] Advanced Charts unavailable; keeping Lightweight Charts.', error);
        return null;
      });

    return mountState;
  }

  function scheduleReset(mountState) {
    if (
      !mountState?.widget
      || mountState.destroyed
      || mountState.resetFrame != null
    ) return;
    const reset = () => {
      mountState.resetFrame = null;
      try {
        mountState.widget.resetCache();
        mountState.widget.activeChart().resetData();
      } catch (_) {
        // Chart may still be completing its first data request.
      }
    };
    mountState.resetFrame = runtime.requestAnimationFrame
      ? runtime.requestAnimationFrame(reset)
      : runtime.setTimeout(reset, 0);
  }

  async function syncStudies(mountState, snapshot) {
    const widget = mountState?.widget;
    if (!widget || mountState.destroyed) return;
    const chart = widget.activeChart();
    const visibility = chartSnapshotVisibility(snapshot);
    const token = normalizeTokenKey(snapshot.tokenKey);
    const ticker = normalizeTicker(snapshot.ticker, token);
    const navSymbol = tradingViewSymbol(token, 'nav', ticker);
    const projectedNavSymbol = tradingViewSymbol(token, 'projected-nav', ticker);

    if (visibility.historicNav && !mountState.overlayStudies.nav) {
      try {
        mountState.overlayStudies.nav = await chart.createStudy(
          'Overlay',
          true,
          true,
          { symbol: navSymbol },
          {
            'lineStyle.color': '#ffcc00',
            'lineStyle.linewidth': 2,
            style: 2,
          },
          { checkLimit: false, priceScale: 'as-series' },
        );
      } catch (error) {
        console.warn('[01RX] Unable to add NAV overlay to Advanced Charts.', error);
      }
    } else if (!visibility.historicNav && mountState.overlayStudies.nav) {
      await removeEntity(chart, mountState.overlayStudies.nav);
      mountState.overlayStudies.nav = null;
    }

    if (visibility.projectedNav && !mountState.overlayStudies.projectedNav) {
      try {
        mountState.overlayStudies.projectedNav = await chart.createStudy(
          'Overlay',
          true,
          true,
          { symbol: projectedNavSymbol },
          {
            'lineStyle.color': '#ffcc00',
            'lineStyle.linestyle': 2,
            'lineStyle.linewidth': 1,
            style: 2,
          },
          { checkLimit: false, priceScale: 'as-series' },
        );
      } catch (error) {
        console.warn('[01RX] Unable to add projected NAV to Advanced Charts.', error);
      }
    } else if (!visibility.projectedNav && mountState.overlayStudies.projectedNav) {
      await removeEntity(chart, mountState.overlayStudies.projectedNav);
      mountState.overlayStudies.projectedNav = null;
    }

    try {
      chart.applyOverrides({
        'mainSeriesProperties.visible': visibility.historicPrice,
      });
    } catch (_) {
      // Older approved library builds can omit per-chart applyOverrides.
    }
  }

  async function syncReferenceLines(mountState, snapshot) {
    const widget = mountState?.widget;
    if (!widget || mountState.destroyed) return;
    const chart = widget.activeChart();
    const visibility = chartSnapshotVisibility(snapshot);
    await removeEntity(chart, mountState.currentLineEntities.price);
    await removeEntity(chart, mountState.currentLineEntities.nav);
    mountState.currentLineEntities.price = null;
    mountState.currentLineEntities.nav = null;
    const time = Math.floor(latestSnapshotTime(snapshot) / 1_000);

    if (visibility.currentPrice && Number(snapshot.currentPrice) > 0) {
      try {
        mountState.currentLineEntities.price = await chart.createShape(
          { time, price: Number(snapshot.currentPrice) },
          {
            disableSave: true,
            disableSelection: true,
            lock: true,
            overrides: {
              linecolor: '#f4f4f1',
              linestyle: 2,
              linewidth: 1,
              showLabel: true,
            },
            shape: 'horizontal_line',
          },
        );
      } catch (_) {
        // The native last-price line remains available on older library builds.
      }
    }

    if (visibility.currentNav && Number(snapshot.currentNav) > 0) {
      try {
        mountState.currentLineEntities.nav = await chart.createShape(
          { time, price: Number(snapshot.currentNav) },
          {
            disableSave: true,
            disableSelection: true,
            lock: true,
            overrides: {
              linecolor: '#ffcc00',
              linestyle: 2,
              linewidth: 1,
              showLabel: true,
            },
            shape: 'horizontal_line',
          },
        );
      } catch (_) {
        // NAV history remains visible if the reference drawing API is unavailable.
      }
    }
  }

  async function updateTokenChart(snapshot) {
    if (!snapshot?.container) return false;
    const mountState = await mount(snapshot);
    if (!mountState) return false;
    mountState.latestSnapshot = snapshot;
    const readyState = await mountState.mountPromise;
    if (!readyState || mountState.destroyed) return false;

    const token = normalizeTokenKey(snapshot.tokenKey);
    const ticker = normalizeTicker(snapshot.ticker, token);
    const resolution = tradingViewResolutionForTimeframe(snapshot.timeframe);
    mountState.datafeed.setSeries(
      tradingViewSymbol(token, 'price', ticker),
      resolution,
      snapshot.priceBars,
    );
    mountState.datafeed.setSeries(
      tradingViewSymbol(token, 'nav', ticker),
      resolution,
      snapshot.navBars,
    );
    mountState.datafeed.setSeries(
      tradingViewSymbol(token, 'projected-nav', ticker),
      resolution,
      snapshot.projectedNavBars,
    );
    updateChartStats(mountState, snapshot);

    const chart = mountState.widget.activeChart();
    if (String(chart.resolution?.() || '') !== String(resolution)) {
      try {
        await chart.setResolution(resolution);
      } catch (_) {
        // The datafeed still serves the requested resolution after the next UI change.
      }
    }
    scheduleReset(mountState);
    mountState.studySync = mountState.studySync.then(async () => {
      await syncStudies(mountState, snapshot);
      await syncReferenceLines(mountState, snapshot);
    });
    await mountState.studySync;
    return true;
  }

  function destroyTokenChart(container) {
    const mountState = mounts.get(container);
    if (!mountState) return;
    mountState.destroyed = true;
    if (mountState.resetFrame != null) {
      if (runtime.cancelAnimationFrame) runtime.cancelAnimationFrame(mountState.resetFrame);
      else runtime.clearTimeout?.(mountState.resetFrame);
    }
    try {
      mountState.intervalSubscription?.unsubscribe?.(null);
    } catch (_) {}
    try {
      mountState.crosshairSubscription?.unsubscribe?.(
        null,
        mountState.crosshairHandler,
      );
    } catch (_) {}
    if (mountState.pointerLeaveHandler) {
      mountState.container?.removeEventListener?.(
        'mouseleave',
        mountState.pointerLeaveHandler,
      );
    }
    try {
      mountState.widget?.remove?.();
    } catch (_) {}
    mountState.datafeed?.destroy?.();
    mountState.container?.remove();
    mountState.stats?.remove();
    mounts.delete(container);
  }

  const bridge = {
    configuration,
    destroyTokenChart,
    enabled: configuration.enabled,
    updateTokenChart,
  };
  runtime.NAVGATOR.chartEngines.advanced = bridge;
  return bridge;
}
