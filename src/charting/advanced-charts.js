import { PRODUCT_BRAND } from '../shell/brand.js';

const OFFICIAL_PLAYGROUND_LIBRARY_PATH = '/__tradingview/charting_library/';

export const ADVANCED_CUSTOM_SERIES_STYLE = Object.freeze({
  nativeColor: 'rgba(0,0,0,0)',
  strokeWidth: 2,
});

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

const SYMBOL_KINDS = new Set(['price', 'nav', 'projected-nav', 'growth']);
const SCRIPT_LOAD_TIMEOUT_MS = 15_000;
const REALTIME_POLL_MS = 30_000;
const CHART_CONTROL_SYNC_DEBOUNCE_MS = 80;
const PROJECTED_NAV_MIN_CONTEXT_SECONDS = 30 * 24 * 60 * 60;
const PROJECTED_NAV_MAX_CONTEXT_SECONDS = 90 * 24 * 60 * 60;
const GROWTH_INDICATOR_LABELS = Object.freeze([
  'Growth',
  'TVL',
  'AUM',
  'Revenue',
  'Volume',
  'Active Users',
  'Transactions',
]);
const NAV_DROPDOWN_OPTIONS = Object.freeze([
  {
    action: 'current-nav',
    key: 'currentNav',
    selector: '.chart-series-option[data-chart-series="current-nav"]',
    title: 'Current NAV',
  },
  {
    action: 'historic-nav',
    key: 'historicNav',
    selector: '.chart-series-option[data-chart-series="nav"]',
    title: 'Historic NAV',
  },
  {
    action: 'projected-nav',
    key: 'projectedNav',
    selector: '.chart-feature-option[data-chart-feature="projected-nav"]',
    title: 'Projected NAV',
  },
]);

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
  if (normalizedKind === 'growth') return `01RX:${symbolTicker}.GROWTH`;
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
  } else if (ticker.endsWith('.GROWTH')) {
    kind = 'growth';
    ticker = ticker.slice(0, -7);
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

  if (isLocalHost && is01rxFrame && requestedEngine === 'advanced') {
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
    source: isLocalHost && is01rxFrame
      ? 'local-opt-in-required'
      : 'library-unavailable',
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
  const syntheticSeries = new Map();
  const subscriptions = new Map();

  async function loadRemoteBars() {
    // The current 01Resolved contract is a point-in-time snapshot. Advanced
    // Charts must report noData until 01Resolved publishes historic bars.
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
          : kind === 'growth'
            ? ' Growth'
            : ' / USD';
      nextTask(runtime, () => onResolve({
        name: canonical,
        ticker: canonical,
        description: `${displayTicker}${suffix}`,
        type: 'crypto',
        session: '24x7',
        timezone: 'Etc/UTC',
        exchange: PRODUCT_BRAND.displayName,
        listed_exchange: PRODUCT_BRAND.displayName,
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
      nextTask(runtime, () => onError(error?.message || `Unable to resolve ${PRODUCT_BRAND.displayName} symbol`));
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
        exchanges: [{
          value: PRODUCT_BRAND.displayName,
          name: PRODUCT_BRAND.displayName,
          desc: `${PRODUCT_BRAND.displayName} markets`,
        }],
        symbols_types: [{ name: 'Ownership token', value: 'crypto' }],
      }));
    },

    searchSymbols(userInput, exchange, symbolType, onResult) {
      const query = String(userInput || '').trim().toUpperCase();
      const symbols = ['price', 'nav', 'projected-nav', 'growth'].map(kind => ({
        symbol: tradingViewSymbol(normalizedToken, kind, normalizedTicker),
        ticker: tradingViewSymbol(normalizedToken, kind, normalizedTicker),
        description: `${normalizedTicker} ${
          kind === 'price'
            ? 'Price'
            : kind === 'nav'
              ? 'NAV'
              : kind === 'projected-nav'
                ? 'Projected NAV'
                : 'Growth'
        }`,
        exchange: PRODUCT_BRAND.displayName,
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
        nextTask(runtime, () => onError(error?.message || `Unable to load ${PRODUCT_BRAND.displayName} bars`));
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
    growth: snapshot?.visibility?.growth === true,
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

function checkboxIcon(checked) {
  const check = checked
    ? '<path d="m5.25 9 2.35 2.4 5.15-5.1"/>'
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="13" height="13" rx="2"/>${check}</svg>`;
}

export function growthStudyLabel(meta) {
  const identity = `${meta?.key || ''} ${meta?.label || ''}`.toLowerCase();
  if (identity.includes('tvl')) return 'TVL';
  if (identity.includes('aum')) return 'AUM';
  if (identity.includes('revenue')) return 'Revenue';
  if (identity.includes('volume')) return 'Volume';
  if (identity.includes('user')) return 'Active Users';
  if (identity.includes('transaction')) return 'Transactions';
  return 'Growth';
}

function growthIndicatorName(meta) {
  return `${PRODUCT_BRAND.displayName} ${growthStudyLabel(meta)}`;
}

function growthIndicatorDefinition(PineJS, symbol, label) {
  const name = `${PRODUCT_BRAND.displayName} ${label}`;
  const id = `RXGrowth${label.replace(/[^A-Za-z0-9]/g, '')}@tv-basicstudies-1`;
  return {
    name,
    metainfo: {
      _metainfoVersion: 53,
      id,
      name,
      description: name,
      shortDescription: label,
      is_price_study: false,
      isCustomIndicator: true,
      format: {
        type: 'price',
        precision: 2,
      },
      plots: [{ id: 'plot_0', type: 'line' }],
      defaults: {
        styles: {
          plot_0: {
            color: '#27d980',
            linestyle: 0,
            linewidth: 2,
            plottype: 0,
            trackPrice: false,
            transparency: 0,
            visible: true,
          },
        },
        inputs: {},
      },
      styles: {
        plot_0: {
          title: label,
          histogramBase: 0,
        },
      },
      inputs: [],
    },
    constructor: function growthIndicator() {
      this.init = function init(context, inputCallback) {
        this._context = context;
        this._input = inputCallback;
        this._context.new_sym(symbol, PineJS.Std.period(this._context));
      };
      this.main = function main(context, inputCallback) {
        this._context = context;
        this._input = inputCallback;
        this._context.select_sym(0);
        const mainTime = this._context.new_var(this._context.symbol.time);
        this._context.select_sym(1);
        const growthTime = this._context.new_var(this._context.symbol.time);
        const growthValue = this._context.new_var(PineJS.Std.close(this._context));
        const alignedValue = growthValue.adopt(growthTime, mainTime, 1);
        this._context.select_sym(0);
        return [alignedValue];
      };
    },
  };
}

function legacyNavVisibility(runtime, snapshot) {
  const fallback = chartSnapshotVisibility(snapshot);
  return NAV_DROPDOWN_OPTIONS.reduce((visibility, option) => {
    const control = runtime.document?.querySelector?.(option.selector);
    visibility[option.key] = control
      ? control.getAttribute('aria-checked') === 'true'
      : fallback[option.key];
    return visibility;
  }, {});
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
    mountState.frameDocument = frameDocument;
    let style = frameDocument.querySelector('style[data-01rx-chart-stats]');
    if (!style) {
      style = frameDocument.createElement('style');
      style.setAttribute('data-01rx-chart-stats', '');
      frameDocument.head?.appendChild(style);
    }
    style.textContent = `
        .advanced-chart-stats {
          position: fixed;
          z-index: 2;
          top: 46px;
          left: 60px;
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
        button[aria-label="NAV variants"],
        button[aria-label="NAV variants"]:hover,
        button[aria-label="NAV variants"]:focus,
        button[aria-label="NAV variants"]:active,
        button[aria-label="NAV variants"] > [data-role="button"] {
          background: transparent !important;
          box-shadow: none !important;
        }
        .rx-growth-button,
        .rx-growth-button:hover,
        .rx-growth-button:focus,
        .rx-growth-button:active {
          box-sizing: border-box !important;
          display: flex !important;
          width: 38px !important;
          min-width: 38px !important;
          max-width: 38px !important;
          height: 38px !important;
          padding: 0 !important;
          align-items: center !important;
          justify-content: center !important;
          background: transparent !important;
          box-shadow: none !important;
          outline: none !important;
          color: #787b86 !important;
        }
        .rx-growth-button > *,
        .rx-growth-button svg {
          color: #787b86 !important;
        }
        .rx-growth-button:hover,
        .rx-growth-button:focus,
        .rx-growth-button:active,
        .rx-growth-button:hover > *,
        .rx-growth-button:focus > *,
        .rx-growth-button:active > *,
        .rx-growth-button:hover svg,
        .rx-growth-button:focus svg,
        .rx-growth-button:active svg {
          color: #fff !important;
        }
        .rx-growth-button.rx-growth-active,
        .rx-growth-button.rx-growth-active > *,
        .rx-growth-button.rx-growth-active svg {
          color: #fff !important;
        }
        .rx-growth-button.rx-growth-disabled {
          cursor: default !important;
          opacity: 0.42 !important;
        }
        div:has(> button[aria-label="NAV variants"]) {
          background: #0f0f0f !important;
        }
        button[aria-label="NAV variants"]:hover .js-button-text,
        button[aria-label="NAV variants"]:focus .js-button-text,
        button[aria-label="NAV variants"]:active .js-button-text,
        button[aria-label="NAV variants"][class*="isOpened"] .js-button-text {
          color: #fff !important;
        }
        .layout__area--top button::before {
          background: transparent !important;
        }
        .layout__area--top button:hover,
        .layout__area--top button:focus,
        .layout__area--top button:active,
        .layout__area--top button[class*="isOpened"] {
          color: #fff !important;
        }
        .layout__area--top button {
          box-sizing: border-box !important;
          flex: 0 0 38px !important;
          width: 38px !important;
          min-width: 38px !important;
          max-width: 38px !important;
          height: 38px !important;
          padding: 0 !important;
          align-items: center !important;
          justify-content: center !important;
          color: #787b86 !important;
        }
        .layout__area--top button > *,
        .layout__area--top button svg {
          color: #787b86 !important;
        }
        .layout__area--top button:hover > *,
        .layout__area--top button:focus > *,
        .layout__area--top button:active > *,
        .layout__area--top button[class*="isOpened"] > *,
        .layout__area--top button:hover svg,
        .layout__area--top button:focus svg,
        .layout__area--top button:active svg,
        .layout__area--top button[class*="isOpened"] svg {
          color: #fff !important;
        }
        .layout__area--top button > div,
        .layout__area--top button > span {
          box-sizing: border-box !important;
          width: 38px !important;
          height: 38px !important;
          padding: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .layout__area--top button .js-button-text {
          width: auto !important;
          height: auto !important;
          text-align: center !important;
        }
        [data-name="indicators-dialog"] [data-role="list-item"] {
          position: relative !important;
        }
        [data-name="indicators-dialog"] [data-role="list-item"] > div {
          padding-left: 42px !important;
        }
        .rx-indicator-check {
          position: absolute;
          z-index: 1;
          top: 50%;
          left: 14px;
          box-sizing: border-box;
          display: inline-flex;
          width: 16px;
          height: 16px;
          align-items: center;
          justify-content: center;
          border: 1px solid #787b86;
          border-radius: 3px;
          color: #f0f3fa;
          pointer-events: none;
          transform: translateY(-50%);
        }
        .rx-indicator-check[data-checked="true"] {
          border-color: #d1d4dc;
        }
        .rx-indicator-check svg {
          width: 13px;
          height: 13px;
        }
        .rx-secondary-pane .chart-gui-wrapper__paneControls {
          top: 4px !important;
          right: 4px !important;
          width: auto !important;
          height: 24px !important;
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }
        .rx-secondary-pane .chart-gui-wrapper__paneControls > div {
          display: flex !important;
          width: auto !important;
          height: 24px !important;
          align-items: center !important;
          flex-direction: row !important;
          flex-wrap: nowrap !important;
        }
        .rx-secondary-pane [data-qa-id^="pane-button"] {
          width: 24px !important;
          height: 24px !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .rx-secondary-pane .chart-gui-wrapper__paneControls
          > div > [data-qa-id="pane-button-more"] {
          display: none !important;
        }
        .rx-secondary-pane [data-qa-id="pane-button-maximize"],
        .rx-secondary-pane [data-qa-id="pane-button-minimize"] {
          order: 1;
        }
        .rx-secondary-pane [data-qa-id="pane-button-collapse"],
        .rx-secondary-pane [data-qa-id="pane-button-restore"] {
          order: 2;
        }
        .rx-secondary-pane [data-qa-id="pane-button-up"] {
          order: 3;
        }
        .rx-secondary-pane [data-qa-id="pane-button-close"] {
          order: 4;
        }
      `;
    frameDocument.body.appendChild(stats);
    return true;
  } catch (_) {
    // Approved production artifacts are same-origin; retain the parent overlay as a fallback.
    return false;
  }
}

function removeProjectedNavOverlay(mountState) {
  mountState?.projectedNavOverlay?.remove?.();
  mountState?.projectedNavAxisLabel?.remove?.();
  if (mountState) {
    mountState.projectedNavOverlay = null;
    mountState.projectedNavAxisLabel = null;
  }
}

function removePriceGradientOverlay(mountState) {
  mountState?.priceGradientOverlay?.remove?.();
  if (mountState) mountState.priceGradientOverlay = null;
}

function removeNavGradientOverlay(mountState) {
  mountState?.navGradientOverlay?.remove?.();
  if (mountState) mountState.navGradientOverlay = null;
}

export function advancedChartSurfaceReady(mountState) {
  return mountState?.baseChartReady === true;
}

export function advancedPriceGradientPoints(snapshot) {
  return (snapshot?.priceBars || []).map(item => ({
    price: chartPointValue(item),
    time: Math.floor(milliseconds(item?.time ?? item?.ts ?? item?.timestamp) / 1_000),
  })).filter(point => (
    Number.isFinite(point.price)
    && point.price >= 0
    && Number.isFinite(point.time)
  )).sort((left, right) => left.time - right.time);
}

export function advancedNavGradientPoints(snapshot) {
  return (snapshot?.navBars || []).map(item => ({
    price: chartPointValue(item),
    time: Math.floor(milliseconds(item?.time ?? item?.ts ?? item?.timestamp) / 1_000),
  })).filter(point => (
    Number.isFinite(point.price)
    && point.price >= 0
    && Number.isFinite(point.time)
  )).sort((left, right) => left.time - right.time);
}

export function isAdvancedLineChartType(value) {
  if (Number(value) === 2) return true;
  const normalized = String(value?.value ?? value ?? '').trim().toLowerCase();
  return normalized === 'line' || normalized === '2';
}

function advancedGradientColorAtPoint(points, y, colors) {
  const ys = (points || []).map(point => Number(point?.y)).filter(Number.isFinite);
  if (ys.length < 2 || !Number.isFinite(y)) return colors.at(-1);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  if (!(bottom > top)) return colors.at(-1);
  const ratio = Math.max(0, Math.min(1, (y - top) / (bottom - top)));
  const scaled = ratio * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const sectionRatio = scaled - index;
  const from = colors[index];
  const to = colors[index + 1];
  const channels = from.map((channel, channelIndex) => (
    Math.round(channel + (to[channelIndex] - channel) * sectionRatio)
  ));
  return `rgb(${channels.join(',')})`;
}

function renderPriceGradientOverlay(mountState) {
  if (
    !mountState?.widget
    || !advancedChartSurfaceReady(mountState)
    || !mountState.frameDocument
    || !chartSnapshotVisibility(mountState.latestSnapshot).historicPrice
    || !isAdvancedLineChartType(
      mountState.chartType ?? mountState.widget.activeChart()?.chartType?.(),
    )
  ) {
    removePriceGradientOverlay(mountState);
    return;
  }
  const chart = mountState.widget.activeChart();
  const frameDocument = mountState.frameDocument;
  const canvas = [...frameDocument.querySelectorAll('canvas')].find((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 300 && rect.height > 200 && rect.left < 200;
  });
  const visibleRange = chart.getVisibleRange?.();
  const priceRange = chart.getPanes?.()
    ?.find(pane => pane.hasMainSeries())
    ?.getMainSourcePriceScale()
    ?.getVisiblePriceRange();
  const points = advancedPriceGradientPoints(mountState.latestSnapshot);
  if (
    !canvas
    || points.length < 2
    || !Number.isFinite(visibleRange?.from)
    || !Number.isFinite(visibleRange?.to)
    || visibleRange.to <= visibleRange.from
    || !Number.isFinite(priceRange?.from)
    || !Number.isFinite(priceRange?.to)
    || priceRange.to <= priceRange.from
  ) {
    removePriceGradientOverlay(mountState);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const drawable = points.map(point => ({
    ...point,
    x: ((point.time - visibleRange.from) / (visibleRange.to - visibleRange.from))
      * rect.width,
    y: ((priceRange.to - point.price) / (priceRange.to - priceRange.from))
      * rect.height,
  })).filter(point => (
    point.x >= -2
    && point.x <= rect.width + 2
    && point.y >= -2
    && point.y <= rect.height + 2
  ));
  if (drawable.length < 2) {
    removePriceGradientOverlay(mountState);
    return;
  }

  const svgNamespace = 'http://www.w3.org/2000/svg';
  let svg = mountState.priceGradientOverlay;
  if (!svg?.isConnected) {
    svg = frameDocument.createElementNS(svgNamespace, 'svg');
    svg.classList.add('rx-price-gradient-overlay');
    Object.assign(svg.style, {
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
      position: 'fixed',
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      zIndex: '2',
    });
    const defs = frameDocument.createElementNS(svgNamespace, 'defs');
    const gradient = frameDocument.createElementNS(svgNamespace, 'linearGradient');
    gradient.id = 'rx-price-line-gradient';
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('x2', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('y2', '100%');
    [
      ['0%', '#a855f7'],
      ['48%', '#6366f1'],
      ['100%', '#2f8fff'],
    ].forEach(([offset, color]) => {
      const stop = frameDocument.createElementNS(svgNamespace, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      gradient.appendChild(stop);
    });
    defs.appendChild(gradient);
    svg.appendChild(defs);
    const path = frameDocument.createElementNS(svgNamespace, 'path');
    path.setAttribute('data-rx-price-gradient-path', '');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'url(#rx-price-line-gradient)');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute(
      'stroke-width',
      String(ADVANCED_CUSTOM_SERIES_STYLE.strokeWidth),
    );
    svg.appendChild(path);
    const endpoint = frameDocument.createElementNS(svgNamespace, 'circle');
    endpoint.setAttribute('data-rx-price-gradient-endpoint', '');
    endpoint.setAttribute('fill', '#2f8fff');
    endpoint.setAttribute('r', '3.5');
    svg.appendChild(endpoint);
    frameDocument.body.appendChild(svg);
    mountState.priceGradientOverlay = svg;
  }
  Object.assign(svg.style, {
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
  });
  const pathData = drawable.map((point, index) => (
    `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(' ');
  svg.querySelector('[data-rx-price-gradient-path]')?.setAttribute('d', pathData);
  const lastPoint = drawable.at(-1);
  const endpoint = svg.querySelector('[data-rx-price-gradient-endpoint]');
  endpoint?.setAttribute('cx', lastPoint.x.toFixed(2));
  endpoint?.setAttribute('cy', lastPoint.y.toFixed(2));
  endpoint?.setAttribute('fill', advancedGradientColorAtPoint(
    drawable,
    lastPoint.y,
    [[168, 85, 247], [99, 102, 241], [47, 143, 255]],
  ));
}

function renderNavGradientOverlay(mountState) {
  if (
    !mountState?.widget
    || !advancedChartSurfaceReady(mountState)
    || !mountState.frameDocument
    || !chartSnapshotVisibility(mountState.latestSnapshot).historicNav
  ) {
    removeNavGradientOverlay(mountState);
    return;
  }
  const chart = mountState.widget.activeChart();
  const frameDocument = mountState.frameDocument;
  const canvas = [...frameDocument.querySelectorAll('canvas')].find((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 300 && rect.height > 200 && rect.left < 200;
  });
  const visibleRange = chart.getVisibleRange?.();
  const priceRange = chart.getPanes?.()
    ?.find(pane => pane.hasMainSeries())
    ?.getMainSourcePriceScale()
    ?.getVisiblePriceRange();
  const points = advancedNavGradientPoints(mountState.latestSnapshot);
  if (
    !canvas
    || points.length < 2
    || !Number.isFinite(visibleRange?.from)
    || !Number.isFinite(visibleRange?.to)
    || visibleRange.to <= visibleRange.from
    || !Number.isFinite(priceRange?.from)
    || !Number.isFinite(priceRange?.to)
    || priceRange.to <= priceRange.from
  ) {
    removeNavGradientOverlay(mountState);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const drawable = points.map(point => ({
    ...point,
    x: ((point.time - visibleRange.from) / (visibleRange.to - visibleRange.from))
      * rect.width,
    y: ((priceRange.to - point.price) / (priceRange.to - priceRange.from))
      * rect.height,
  })).filter(point => (
    point.x >= -2
    && point.x <= rect.width + 2
    && point.y >= -2
    && point.y <= rect.height + 2
  ));
  if (drawable.length < 2) {
    removeNavGradientOverlay(mountState);
    return;
  }

  const svgNamespace = 'http://www.w3.org/2000/svg';
  let svg = mountState.navGradientOverlay;
  if (!svg?.isConnected) {
    svg = frameDocument.createElementNS(svgNamespace, 'svg');
    svg.classList.add('rx-nav-gradient-overlay');
    Object.assign(svg.style, {
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
      position: 'fixed',
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      zIndex: '2',
    });
    const defs = frameDocument.createElementNS(svgNamespace, 'defs');
    const gradient = frameDocument.createElementNS(svgNamespace, 'linearGradient');
    gradient.id = 'rx-nav-line-gradient';
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('x2', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('y2', '100%');
    [
      ['0%', '#ffe45c'],
      ['50%', '#ffbf1f'],
      ['100%', '#ff8a00'],
    ].forEach(([offset, color]) => {
      const stop = frameDocument.createElementNS(svgNamespace, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      gradient.appendChild(stop);
    });
    defs.appendChild(gradient);
    svg.appendChild(defs);
    const path = frameDocument.createElementNS(svgNamespace, 'path');
    path.setAttribute('data-rx-nav-gradient-path', '');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'url(#rx-nav-line-gradient)');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute(
      'stroke-width',
      String(ADVANCED_CUSTOM_SERIES_STYLE.strokeWidth),
    );
    svg.appendChild(path);
    const endpoint = frameDocument.createElementNS(svgNamespace, 'circle');
    endpoint.setAttribute('data-rx-nav-gradient-endpoint', '');
    endpoint.setAttribute('fill', '#ff9f0a');
    endpoint.setAttribute('r', '3.5');
    svg.appendChild(endpoint);
    frameDocument.body.appendChild(svg);
    mountState.navGradientOverlay = svg;
  }
  Object.assign(svg.style, {
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
  });
  svg.querySelector('[data-rx-nav-gradient-path]')?.setAttribute(
    'd',
    drawable.map((point, index) => (
      `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )).join(' '),
  );
  const lastPoint = drawable.at(-1);
  const endpoint = svg.querySelector('[data-rx-nav-gradient-endpoint]');
  endpoint?.setAttribute('cx', lastPoint.x.toFixed(2));
  endpoint?.setAttribute('cy', lastPoint.y.toFixed(2));
  endpoint?.setAttribute('fill', advancedGradientColorAtPoint(
    drawable,
    lastPoint.y,
    [[255, 228, 92], [255, 191, 31], [255, 138, 0]],
  ));
}

function removeCurrentReferenceFallback(mountState) {
  mountState?.currentReferenceOverlay?.remove?.();
  Object.values(mountState?.currentReferenceAxisLabels || {}).forEach(
    label => label?.remove?.(),
  );
  if (mountState) {
    mountState.currentReferenceOverlay = null;
    mountState.currentReferenceAxisLabels = {};
  }
}

function renderCurrentReferenceFallback(mountState) {
  if (
    !mountState?.widget
    || !advancedChartSurfaceReady(mountState)
    || !mountState.frameDocument
  ) {
    removeCurrentReferenceFallback(mountState);
    return;
  }
  const chart = mountState.widget.activeChart();
  const frameDocument = mountState.frameDocument;
  const canvas = [...frameDocument.querySelectorAll('canvas')].find((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 300 && rect.height > 200 && rect.left < 200;
  });
  const priceRange = chart.getPanes?.()
    ?.find(pane => pane.hasMainSeries())
    ?.getMainSourcePriceScale()
    ?.getVisiblePriceRange();
  if (
    !canvas
    || !Number.isFinite(priceRange?.from)
    || !Number.isFinite(priceRange?.to)
    || priceRange.to <= priceRange.from
  ) {
    removeCurrentReferenceFallback(mountState);
    return;
  }

  const snapshot = mountState.latestSnapshot;
  const visibility = chartSnapshotVisibility(snapshot);
  const activeReferences = [
    {
      color: '#ffcc00',
      key: 'nav',
      nativeEntity: mountState.currentLineEntities.nav,
      value: finiteNumber(
        snapshot?.currentNav,
        chartPointValue(snapshot?.navBars?.at(-1)),
      ),
      visible: visibility.currentNav,
    },
    {
      color: '#f4f4f1',
      key: 'price',
      nativeEntity: mountState.currentLineEntities.price,
      value: finiteNumber(
        snapshot?.currentPrice,
        chartPointValue(snapshot?.priceBars?.at(-1)),
      ),
      visible: visibility.currentPrice,
    },
  ].filter(reference => (
    reference.visible
    && Number(reference.value) > 0
  ));
  const references = activeReferences.filter(reference => (
    mountState.currentReferenceFallbackHold || !reference.nativeEntity
  ));
  if (!references.length) {
    removeCurrentReferenceFallback(mountState);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const drawable = references.map(reference => ({
    ...reference,
    y: rect.top
      + ((priceRange.to - reference.value) / (priceRange.to - priceRange.from))
        * rect.height,
  })).filter(reference => reference.y >= rect.top && reference.y <= rect.bottom);
  if (!drawable.length) {
    removeCurrentReferenceFallback(mountState);
    return;
  }

  const svgNamespace = 'http://www.w3.org/2000/svg';
  let svg = mountState.currentReferenceOverlay;
  if (!svg?.isConnected) {
    svg = frameDocument.createElementNS(svgNamespace, 'svg');
    svg.classList.add('rx-current-reference-fallback');
    Object.assign(svg.style, {
      height: '100%',
      inset: '0',
      overflow: 'visible',
      pointerEvents: 'none',
      position: 'fixed',
      width: '100%',
      zIndex: '2',
    });
    frameDocument.body.appendChild(svg);
    mountState.currentReferenceOverlay = svg;
  }

  const drawableKeys = new Set(drawable.map(reference => reference.key));
  svg.querySelectorAll('[data-rx-current-reference]').forEach((line) => {
    if (!drawableKeys.has(line.dataset.rxCurrentReference)) line.remove();
  });
  mountState.currentReferenceAxisLabels ||= {};
  Object.entries(mountState.currentReferenceAxisLabels).forEach(([key, label]) => {
    if (drawableKeys.has(key)) return;
    label?.remove?.();
    delete mountState.currentReferenceAxisLabels[key];
  });

  drawable.forEach((reference) => {
    let line = svg.querySelector(
      `[data-rx-current-reference="${reference.key}"]`,
    );
    if (!line) {
      line = frameDocument.createElementNS(svgNamespace, 'line');
      line.dataset.rxCurrentReference = reference.key;
      line.setAttribute('stroke-dasharray', '1 3');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }
    line.setAttribute('stroke', reference.color);
    line.setAttribute('x1', rect.left.toFixed(2));
    line.setAttribute('x2', rect.right.toFixed(2));
    line.setAttribute('y1', reference.y.toFixed(2));
    line.setAttribute('y2', reference.y.toFixed(2));

    let label = mountState.currentReferenceAxisLabels[reference.key];
    if (!label?.isConnected) {
      label = frameDocument.createElement('div');
      label.className = `rx-current-reference-axis-label rx-current-reference-${reference.key}`;
      Object.assign(label.style, {
        color: '#111',
        font: '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif',
        fontVariantNumeric: 'tabular-nums',
        height: '22px',
        lineHeight: '22px',
        padding: '0 5px',
        pointerEvents: 'none',
        position: 'fixed',
        zIndex: '3',
      });
      frameDocument.body.appendChild(label);
      mountState.currentReferenceAxisLabels[reference.key] = label;
    }
    label.textContent = formatStatusPrice(reference.value);
    label.style.background = reference.color;
    label.style.left = `${rect.right}px`;
    label.style.top = `${Math.max(
      rect.top,
      Math.min(rect.bottom - 22, reference.y - 11),
    )}px`;
  });

  if (
    mountState.currentReferenceFallbackHold
    && activeReferences.length > 0
    && activeReferences.every(reference => reference.nativeEntity)
  ) {
    mountState.currentReferenceFallbackHold = false;
    frameDocument.defaultView?.requestAnimationFrame?.(() => {
      renderCurrentReferenceFallback(mountState);
    });
  }
}

function renderProjectedNavOverlay(mountState) {
  if (
    !mountState?.projectedNavVisible
    || !mountState.widget
    || !advancedChartSurfaceReady(mountState)
    || !mountState.frameDocument
  ) {
    removeProjectedNavOverlay(mountState);
    return;
  }
  const chart = mountState.widget.activeChart();
  const frameDocument = mountState.frameDocument;
  const canvas = [...frameDocument.querySelectorAll('canvas')].find((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 300 && rect.height > 200 && rect.left < 200;
  });
  const visibleRange = chart.getVisibleRange?.();
  const priceRange = chart.getPanes?.()
    ?.find(pane => pane.hasMainSeries())
    ?.getMainSourcePriceScale()
    ?.getVisiblePriceRange();
  const points = projectedNavOverlayPoints(mountState.latestSnapshot);
  if (
    !canvas
    || points.length < 2
    || !Number.isFinite(visibleRange?.from)
    || !Number.isFinite(visibleRange?.to)
    || visibleRange.to <= visibleRange.from
    || !Number.isFinite(priceRange?.from)
    || !Number.isFinite(priceRange?.to)
    || priceRange.to <= priceRange.from
  ) {
    removeProjectedNavOverlay(mountState);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const visiblePoints = points.map(point => ({
    ...point,
    x: rect.left
      + ((point.time - visibleRange.from) / (visibleRange.to - visibleRange.from)) * rect.width,
    y: rect.top
      + ((priceRange.to - point.price) / (priceRange.to - priceRange.from)) * rect.height,
  })).filter(point => (
    point.x >= rect.left - 2
    && point.x <= rect.right + 2
    && point.y >= rect.top - 2
    && point.y <= rect.bottom + 2
  ));
  if (visiblePoints.length < 2) {
    removeProjectedNavOverlay(mountState);
    return;
  }

  const svgNamespace = 'http://www.w3.org/2000/svg';
  let svg = mountState.projectedNavOverlay;
  if (!svg?.isConnected) {
    svg = frameDocument.createElementNS(svgNamespace, 'svg');
    svg.classList.add('rx-projected-nav-overlay');
    Object.assign(svg.style, {
      height: '100%',
      inset: '0',
      overflow: 'visible',
      pointerEvents: 'none',
      position: 'fixed',
      width: '100%',
      zIndex: '2',
    });
    const path = frameDocument.createElementNS(svgNamespace, 'path');
    path.setAttribute('data-rx-projected-nav-path', '');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#ffcc00');
    path.setAttribute('stroke-dasharray', '6 4');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    frameDocument.body.appendChild(svg);
    mountState.projectedNavOverlay = svg;
  }
  svg.querySelector('[data-rx-projected-nav-path]')?.setAttribute(
    'd',
    visiblePoints.map((point, index) => (
      `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )).join(' '),
  );

  const lastPoint = visiblePoints.at(-1);
  let label = mountState.projectedNavAxisLabel;
  if (!label?.isConnected) {
    label = frameDocument.createElement('div');
    label.className = 'rx-projected-nav-axis-label';
    Object.assign(label.style, {
      background: '#ffcc00',
      color: '#111',
      font: '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif',
      fontVariantNumeric: 'tabular-nums',
      height: '22px',
      lineHeight: '22px',
      padding: '0 5px',
      pointerEvents: 'none',
      position: 'fixed',
      zIndex: '3',
    });
    frameDocument.body.appendChild(label);
    mountState.projectedNavAxisLabel = label;
  }
  label.textContent = formatStatusPrice(lastPoint.price);
  label.style.left = `${rect.right}px`;
  label.style.top = `${Math.max(rect.top, Math.min(rect.bottom - 22, lastPoint.y - 11))}px`;
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
  mountState.stats.hidden = !advancedChartSurfaceReady(mountState)
    || !Number.isFinite(values.price)
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

export function projectedNavOverlayPoints(snapshot) {
  const projected = (snapshot?.projectedNavBars || []).map(item => ({
    price: chartPointValue(item),
    time: Math.floor(milliseconds(item?.time ?? item?.ts ?? item?.timestamp) / 1_000),
  })).filter(point => (
    Number.isFinite(point.price) && Number.isFinite(point.time)
  )).sort((left, right) => left.time - right.time);
  const currentNav = finiteNumber(
    snapshot?.currentNav,
    chartPointValue(snapshot?.navBars?.at(-1)),
  );
  const anchorTime = Math.floor(latestSnapshotTime(snapshot) / 1_000);
  if (!Number.isFinite(currentNav) || !(currentNav > 0)) return projected;
  return [
    { price: currentNav, time: anchorTime },
    ...projected.filter(point => point.time > anchorTime),
  ];
}

export function projectedNavVisibleRange(snapshot) {
  const times = projectedNavOverlayPoints(snapshot).map(point => point.time * 1_000);
  if (times.length < 2) return null;
  const projectionStart = Math.floor(times[0] / 1_000);
  const projectionEnd = Math.ceil(times.at(-1) / 1_000);
  const projectionSpan = projectionEnd - projectionStart;
  if (!(projectionSpan > 0)) return null;
  const context = Math.min(
    PROJECTED_NAV_MAX_CONTEXT_SECONDS,
    Math.max(PROJECTED_NAV_MIN_CONTEXT_SECONDS, Math.round(projectionSpan * 0.2)),
  );
  return {
    from: projectionStart - context,
    to: projectionEnd,
  };
}

export function waitForAdvancedChartData(runtime, chart, timeoutMs = 1_500) {
  if (typeof chart?.dataReady !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) runtime.clearTimeout?.(timer);
      resolve();
    };
    try {
      if (chart.dataReady(finish) === true) {
        finish();
        return;
      }
    } catch (_) {
      finish();
      return;
    }
    timer = runtime.setTimeout?.(finish, timeoutMs) ?? null;
  });
}

export function installBrowserAdvancedCharts(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const configuration = resolveAdvancedChartsConfiguration(runtime);
  const mounts = new WeakMap();
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.chartEngines = runtime.NAVGATOR.chartEngines || {};
  if (configuration.enabled) {
    runtime.document.documentElement.dataset.chartEngine = 'advanced-loading';
  } else if (runtime.document.documentElement.dataset.chartEngine === 'advanced-loading') {
    runtime.document.documentElement.dataset.chartEngine = 'lightweight';
  }

  function navDropdownItems(mountState) {
    const visibility = mountState.navVisibilityDesired
      || legacyNavVisibility(runtime, mountState.latestSnapshot);
    return NAV_DROPDOWN_OPTIONS.map(option => ({
      icon: checkboxIcon(visibility[option.key]),
      onSelect: () => toggleNavDropdownItem(mountState, option),
      title: option.title,
    }));
  }

  function refreshNavDropdown(mountState) {
    if (!mountState?.navDropdown || mountState.destroyed) return;
    mountState.navDropdown.applyOptions?.({
      items: navDropdownItems(mountState),
    });
  }

  function scheduleControlSync(
    mountState,
    { growth = false, references = false, studies = false } = {},
  ) {
    if (!mountState || mountState.destroyed) return;
    mountState.controlSyncNeedsGrowth ||= growth;
    mountState.controlSyncNeedsReferences ||= references;
    mountState.controlSyncNeedsStudies ||= studies;
    if (mountState.controlSyncTimer != null) {
      runtime.clearTimeout?.(mountState.controlSyncTimer);
    }
    mountState.controlSyncTimer = runtime.setTimeout(async () => {
      mountState.controlSyncTimer = null;
      if (mountState.destroyed) return;
      const syncGrowth = mountState.controlSyncNeedsGrowth;
      const syncReferences = mountState.controlSyncNeedsReferences;
      const syncStudiesRequested = mountState.controlSyncNeedsStudies;
      mountState.controlSyncNeedsGrowth = false;
      mountState.controlSyncNeedsReferences = false;
      mountState.controlSyncNeedsStudies = false;
      mountState.studySync = mountState.studySync.then(async () => {
        if (mountState.destroyed) return;
        const snapshot = mountState.latestSnapshot;
        if (syncStudiesRequested) await syncStudies(mountState, snapshot);
        else if (syncGrowth) await syncGrowthStudy(mountState, snapshot);
        if (syncReferences) await syncReferenceLines(mountState, snapshot);
      });
      await mountState.studySync;
    }, CHART_CONTROL_SYNC_DEBOUNCE_MS);
  }

  function toggleNavDropdownItem(mountState, option) {
    if (mountState.destroyed) return;
    const currentVisibility = mountState.navVisibilityDesired
      || legacyNavVisibility(runtime, mountState.latestSnapshot);
    const visibility = {
      ...currentVisibility,
      [option.key]: !currentVisibility[option.key],
    };
    mountState.navVisibilityDesired = visibility;
    mountState.latestSnapshot = {
      ...mountState.latestSnapshot,
      visibility: {
        ...mountState.latestSnapshot?.visibility,
        ...visibility,
      },
    };
    refreshNavDropdown(mountState);

    const legacyVisibility = legacyNavVisibility(runtime, mountState.latestSnapshot);
    if (legacyVisibility[option.key] !== visibility[option.key]) {
      invokeLegacyChartAction(runtime, option.action);
    }
    scheduleControlSync(mountState, {
      references: true,
      studies: true,
    });
  }

  function growthAvailable(snapshot) {
    return Array.isArray(snapshot?.growthBars) && snapshot.growthBars.length > 0;
  }

  function growthStudyIsActive(mountState) {
    if (!mountState?.growthStudy || !mountState.widget) return false;
    return mountState.widget.activeChart().getAllStudies().some(
      study => study.id === mountState.growthStudy,
    );
  }

  function refreshGrowthButton(mountState) {
    const button = mountState?.growthButton;
    if (!button || mountState.destroyed) return;
    const available = growthAvailable(mountState.latestSnapshot);
    const active = available && (
      typeof mountState.growthVisibleDesired === 'boolean'
        ? mountState.growthVisibleDesired
        : growthStudyIsActive(mountState)
    );
    button.classList.toggle('rx-growth-active', active);
    button.classList.toggle('rx-growth-disabled', !available);
    button.setAttribute('aria-disabled', String(!available));
    button.setAttribute('aria-pressed', String(active));
    button.title = available
      ? active ? 'Hide growth pane' : 'Show growth pane'
      : 'Growth data unavailable';
  }

  function installGrowthButton(mountState) {
    const button = mountState.widget.createButton({
      align: 'left',
      useTradingViewStyle: false,
    });
    button.classList.add('rx-growth-button');
    button.setAttribute('aria-label', 'Growth');
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 14.5h13"/><path d="m3.5 11 3-3 2.5 2 5-6"/><path d="M11.5 4h2.5v2.5"/></svg>';
    const toggle = () => {
      if (!growthAvailable(mountState.latestSnapshot)) return;
      const currentlyVisible = typeof mountState.growthVisibleDesired === 'boolean'
        ? mountState.growthVisibleDesired
        : growthStudyIsActive(mountState);
      const nextVisible = !currentlyVisible;
      mountState.growthVisibleDesired = nextVisible;
      mountState.latestSnapshot = {
        ...mountState.latestSnapshot,
        visibility: {
          ...mountState.latestSnapshot?.visibility,
          growth: nextVisible,
        },
      };
      refreshGrowthButton(mountState);

      const legacyButton = runtime.document.getElementById('btn-growth-chart');
      const legacyVisible = legacyButton?.getAttribute('aria-expanded') === 'true';
      if (legacyVisible !== nextVisible) runtime.toggleGrowthChart?.();
      scheduleControlSync(mountState, { growth: true });
    };
    button.addEventListener('click', toggle);
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle();
    });
    mountState.growthButton = button;
    mountState.growthButtonToggle = toggle;
    refreshGrowthButton(mountState);
  }

  function normalizeStudyName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function indicatorRowName(row) {
    if (row.dataset.rxIndicatorName) return row.dataset.rxIndicatorName;
    const name = String(
      row.querySelector?.(':scope > div span')?.textContent
      || row.textContent
      || '',
    ).trim();
    row.dataset.rxIndicatorName = name;
    return name;
  }

  function userStudies(mountState) {
    const internalIds = new Set(
      [
        ...Object.values(mountState.overlayStudies || {}),
        mountState.growthStudy,
      ].filter(Boolean),
    );
    try {
      return mountState.widget.activeChart().getAllStudies()
        .filter(study => !internalIds.has(study.id));
    } catch (_) {
      return [];
    }
  }

  function refreshIndicatorChecks(mountState) {
    const frameDocument = mountState?.frameDocument;
    if (!frameDocument || mountState.destroyed) return;
    frameDocument.querySelectorAll('[data-qa-id="pane"]').forEach((pane, index) => {
      pane.classList.toggle('rx-secondary-pane', index > 0);
      const menuButton = pane.querySelector('[data-qa-id="pane-button-more"]');
      if (index > 0) menuButton?.style.setProperty('display', 'none', 'important');
      else menuButton?.style.removeProperty('display');
    });
    const activeNames = new Set(
      userStudies(mountState).map(study => normalizeStudyName(study.name)),
    );
    frameDocument.querySelectorAll(
      '[data-name="indicators-dialog"] [data-role="list-item"]',
    ).forEach((row) => {
      const checked = activeNames.has(normalizeStudyName(indicatorRowName(row)));
      let checkbox = row.querySelector(':scope > .rx-indicator-check');
      if (!checkbox) {
        checkbox = frameDocument.createElement('span');
        checkbox.className = 'rx-indicator-check';
        checkbox.setAttribute('aria-hidden', 'true');
        row.prepend(checkbox);
      }
      const nextState = String(checked);
      if (checkbox.dataset.checked === nextState) return;
      checkbox.dataset.checked = nextState;
      checkbox.innerHTML = checked
        ? '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m4.8 9 2.6 2.7 5.8-6"/></svg>'
        : '';
      row.setAttribute('aria-checked', nextState);
    });
  }

  function scheduleIndicatorCheckRefresh(mountState) {
    if (
      !mountState?.frameDocument
      || mountState.destroyed
      || mountState.indicatorRefreshFrame != null
    ) return;
    const frameWindow = mountState.frameDocument.defaultView;
    const refresh = () => {
      mountState.indicatorRefreshFrame = null;
      mountState.cancelIndicatorRefresh = null;
      refreshIndicatorChecks(mountState);
    };
    if (typeof frameWindow?.requestAnimationFrame === 'function') {
      mountState.indicatorRefreshFrame = frameWindow.requestAnimationFrame(refresh);
      mountState.cancelIndicatorRefresh = () => {
        frameWindow.cancelAnimationFrame?.(mountState.indicatorRefreshFrame);
      };
    } else {
      mountState.indicatorRefreshFrame = runtime.setTimeout(refresh, 0);
      mountState.cancelIndicatorRefresh = () => {
        runtime.clearTimeout?.(mountState.indicatorRefreshFrame);
      };
    }
  }

  function installIndicatorToggleChecks(mountState) {
    const frameDocument = mountState?.frameDocument;
    const frameWindow = frameDocument?.defaultView;
    if (!frameDocument?.body || !frameWindow?.MutationObserver) return;

    mountState.indicatorClickHandler = (event) => {
      const row = event.target?.closest?.(
        '[data-name="indicators-dialog"] [data-role="list-item"]',
      );
      if (!row) return;
      const selectedName = normalizeStudyName(indicatorRowName(row));
      const matches = userStudies(mountState)
        .filter(study => normalizeStudyName(study.name) === selectedName);
      if (!matches.length) {
        scheduleIndicatorCheckRefresh(mountState);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const chart = mountState.widget.activeChart();
      matches.forEach((study) => {
        try {
          chart.removeEntity(study.id);
        } catch (_) {}
      });
      scheduleIndicatorCheckRefresh(mountState);
    };
    frameDocument.addEventListener('click', mountState.indicatorClickHandler, true);

    mountState.indicatorObserver = new frameWindow.MutationObserver(() => {
      scheduleIndicatorCheckRefresh(mountState);
    });
    mountState.indicatorObserver.observe(frameDocument.body, {
      childList: true,
      subtree: true,
    });

    mountState.studyEventHandler = () => {
      if (
        !mountState.growthSyncInProgress
        && mountState.growthStudy
        && !growthStudyIsActive(mountState)
      ) {
        mountState.growthStudy = null;
        mountState.growthStudyName = '';
        mountState.growthVisibleDesired = false;
        mountState.latestSnapshot = {
          ...mountState.latestSnapshot,
          visibility: {
            ...mountState.latestSnapshot?.visibility,
            growth: false,
          },
        };
        const legacyButton = runtime.document.getElementById('btn-growth-chart');
        if (legacyButton?.getAttribute('aria-expanded') === 'true') {
          runtime.toggleGrowthChart?.();
        }
      }
      refreshGrowthButton(mountState);
      scheduleIndicatorCheckRefresh(mountState);
    };
    mountState.widget.subscribe?.('study_event', mountState.studyEventHandler);
    scheduleIndicatorCheckRefresh(mountState);
  }

  async function mount(snapshot) {
    const host = snapshot?.container;
    if (!host || !configuration.enabled) return null;
    const existing = mounts.get(host);
    if (existing) return existing;

    const mountState = {
      baseChartReady: false,
      configuration,
      currentReferenceAxisLabels: {},
      currentReferenceFallbackHold: true,
      currentReferenceOverlay: null,
      currentReferenceRenderFrame: null,
      currentLineEntities: { nav: null, price: null },
      controlSyncNeedsGrowth: false,
      controlSyncNeedsReferences: false,
      controlSyncNeedsStudies: false,
      controlSyncTimer: null,
      datafeed: null,
      destroyed: false,
      growthButton: null,
      growthStudy: null,
      growthStudyName: '',
      growthSyncInProgress: false,
      growthVisibleDesired: chartSnapshotVisibility(snapshot).growth,
      latestSnapshot: snapshot,
      mountPromise: null,
      navVisibilityDesired: legacyNavVisibility(runtime, snapshot),
      overlayStudies: { nav: null, projectedNav: null },
      projectedNavAxisLabel: null,
      projectedNavOverlay: null,
      projectedNavRenderFrame: null,
      projectedNavRestoreRange: null,
      projectedNavVisible: false,
      presentedChartKey: '',
      priceGradientOverlay: null,
      priceGradientRenderFrame: null,
      navGradientOverlay: null,
      chartType: null,
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
        const growthSymbol = tradingViewSymbol(token, 'growth', ticker);
        const feed = create01rxAdvancedChartsDatafeed({
          runtime,
          tokenKey: token,
          ticker,
        });
        mountState.datafeed = feed;
        feed.setSeries(priceSymbol, resolution, snapshot.priceBars);
        feed.setSeries(navSymbol, resolution, snapshot.navBars);
        feed.setSeries(projectedNavSymbol, resolution, snapshot.projectedNavBars);
        feed.setSeries(growthSymbol, resolution, snapshot.growthBars);

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
        stats.hidden = true;

        const widget = new runtime.TradingView.widget({
          autosize: true,
          container,
          custom_indicators_getter: PineJS => Promise.resolve(
            GROWTH_INDICATOR_LABELS.map(
              label => growthIndicatorDefinition(PineJS, growthSymbol, label),
            ),
          ),
          datafeed: feed.datafeed,
          disabled_features: [
            'auto_enable_symbol_labels',
            'create_volume_indicator_by_default',
            'create_volume_indicator_by_default_once',
            'display_market_status',
            'header_compare',
            'header_quick_search',
            'header_saveload',
            'header_symbol_search',
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
            'mainSeriesProperties.lineStyle.color':
              ADVANCED_CUSTOM_SERIES_STYLE.nativeColor,
            'mainSeriesProperties.priceLineColor': '#f4f4f1',
            'mainSeriesProperties.priceLineWidth': 1,
            'mainSeriesProperties.showPriceLine': false,
            'paneProperties.background': '#101010',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.horzGridProperties.color': '#20201f',
            'paneProperties.legendProperties.showBarChange': false,
            'paneProperties.legendProperties.showLegend': true,
            'paneProperties.legendProperties.showSeriesOHLC': false,
            'paneProperties.legendProperties.showSeriesTitle': false,
            'paneProperties.legendProperties.showStudyArguments': false,
            'paneProperties.legendProperties.showStudyTitles': true,
            'paneProperties.legendProperties.showStudyValues': true,
            'paneProperties.vertGridProperties.color': '#1a1a19',
            'scalesProperties.lineColor': '#292929',
            'scalesProperties.showSeriesLastValue': false,
            'scalesProperties.showSymbolLabels': false,
            'scalesProperties.textColor': '#8e8e88',
          },
          symbol: priceSymbol,
          theme: 'dark',
          timezone: 'Etc/UTC',
          workers: {
            enabled: false,
          },
        });
        mountState.widget = widget;

        return widget.chartReady().then(async () => {
          if (mountState.destroyed) return null;
          moveChartStatsIntoFrame(mountState);
          updateChartStats(mountState, mountState.latestSnapshot);
          mountState.currentReferenceFallbackHold = true;
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
          mountState.visibleRangeSubscription = chart.onVisibleRangeChanged?.();
          mountState.visibleRangeHandler = () => {
            scheduleCurrentReferenceRender(mountState);
            scheduleProjectedNavRender(mountState);
            schedulePriceGradientRender(mountState);
          };
          mountState.visibleRangeSubscription?.subscribe?.(
            null,
            mountState.visibleRangeHandler,
          );
          mountState.projectedNavInteractionHandler = () => {
            scheduleCurrentReferenceRender(mountState);
            scheduleProjectedNavRender(mountState);
            schedulePriceGradientRender(mountState);
          };
          mountState.frameDocument?.addEventListener?.(
            'pointerup',
            mountState.projectedNavInteractionHandler,
            true,
          );
          mountState.frameDocument?.addEventListener?.(
            'wheel',
            mountState.projectedNavInteractionHandler,
            { capture: true, passive: true },
          );
          mountState.frameDocument?.defaultView?.addEventListener?.(
            'resize',
            mountState.projectedNavInteractionHandler,
          );
          const ResizeObserverImpl = mountState.frameDocument?.defaultView?.ResizeObserver;
          if (typeof ResizeObserverImpl === 'function') {
            mountState.projectedNavResizeObserver = new ResizeObserverImpl(
              mountState.projectedNavInteractionHandler,
            );
            mountState.projectedNavResizeObserver.observe(
              mountState.frameDocument.body,
            );
            [...mountState.frameDocument.querySelectorAll('canvas')]
              .filter((item) => {
                const rect = item.getBoundingClientRect();
                return rect.width > 300 && rect.height > 200;
              })
              .forEach(item => mountState.projectedNavResizeObserver.observe(item));
          }
          mountState.chartTypeSubscription = chart.onChartTypeChanged?.();
          mountState.chartType = chart.chartType?.();
          mountState.chartTypeHandler = (nextType) => {
            mountState.chartType = nextType ?? chart.chartType?.();
            scheduleCurrentReferenceRender(mountState);
            scheduleProjectedNavRender(mountState);
            schedulePriceGradientRender(mountState);
            mountState.studySync = mountState.studySync.then(
              () => syncReferenceLines(mountState, mountState.latestSnapshot),
            );
          };
          mountState.chartTypeSubscription?.subscribe?.(
            null,
            mountState.chartTypeHandler,
          );

          await widget.headerReady();
          mountState.navDropdown = await widget.createDropdown({
            items: navDropdownItems(mountState),
            title: 'NAV',
            tooltip: 'NAV variants',
          });
          installGrowthButton(mountState);
          installIndicatorToggleChecks(mountState);
          return mountState;
        });
      })
      .catch((error) => {
        mountState.error = error;
        mountState.container?.remove();
        runtime.document.documentElement.dataset.chartEngine = 'lightweight';
        console.warn('[01R.Trade] Advanced Charts unavailable; keeping Lightweight Charts.', error);
        return null;
      });

    return mountState;
  }

  function scheduleReset(mountState) {
    if (
      !mountState?.widget
      || mountState.destroyed
    ) return Promise.resolve(false);
    if (mountState.resetFrame != null) {
      return mountState.resetPromise || Promise.resolve(false);
    }
    let resolveReset;
    mountState.resetPromise = new Promise((resolve) => {
      resolveReset = resolve;
    });
    mountState.resetResolve = resolveReset;
    const reset = () => {
      mountState.resetFrame = null;
      try {
        mountState.widget.resetCache();
        mountState.widget.activeChart().resetData();
      } catch (_) {
        // Chart may still be completing its first data request.
      }
      mountState.resetResolve?.(true);
      mountState.resetResolve = null;
      mountState.resetPromise = null;
    };
    mountState.resetFrame = runtime.requestAnimationFrame
      ? runtime.requestAnimationFrame(reset)
      : runtime.setTimeout(reset, 0);
    return mountState.resetPromise;
  }

  function scheduleProjectedNavRender(mountState) {
    if (
      !mountState
      || !advancedChartSurfaceReady(mountState)
      || mountState.destroyed
      || mountState.projectedNavRenderFrame != null
    ) return;
    const render = () => {
      mountState.projectedNavRenderFrame = null;
      renderProjectedNavOverlay(mountState);
    };
    mountState.projectedNavRenderFrame = runtime.requestAnimationFrame
      ? runtime.requestAnimationFrame(render)
      : runtime.setTimeout(render, 0);
  }

  function schedulePriceGradientRender(mountState) {
    if (
      !mountState
      || !advancedChartSurfaceReady(mountState)
      || mountState.destroyed
      || mountState.priceGradientRenderFrame != null
    ) return;
    const render = () => {
      mountState.priceGradientRenderFrame = null;
      renderPriceGradientOverlay(mountState);
      renderNavGradientOverlay(mountState);
    };
    mountState.priceGradientRenderFrame = runtime.requestAnimationFrame
      ? runtime.requestAnimationFrame(render)
      : runtime.setTimeout(render, 0);
  }

  function scheduleCurrentReferenceRender(mountState) {
    if (
      !mountState
      || !advancedChartSurfaceReady(mountState)
      || mountState.destroyed
      || mountState.currentReferenceRenderFrame != null
    ) return;
    const render = () => {
      mountState.currentReferenceRenderFrame = null;
      renderCurrentReferenceFallback(mountState);
    };
    mountState.currentReferenceRenderFrame = runtime.requestAnimationFrame
      ? runtime.requestAnimationFrame(render)
      : runtime.setTimeout(render, 0);
  }

  async function syncGrowthStudy(mountState, snapshot) {
    const widget = mountState?.widget;
    if (!widget || mountState.destroyed) return;
    const chart = widget.activeChart();
    mountState.growthSyncInProgress = true;
    try {
      if (mountState.growthStudy && !growthStudyIsActive(mountState)) {
        mountState.growthStudy = null;
        mountState.growthStudyName = '';
      }
      const visible = chartSnapshotVisibility(snapshot).growth
        && growthAvailable(snapshot);
      const studyName = growthIndicatorName(snapshot.growthMeta);
      if (
        visible
        && mountState.growthStudy
        && mountState.growthStudyName !== studyName
      ) {
        await removeEntity(chart, mountState.growthStudy);
        mountState.growthStudy = null;
        mountState.growthStudyName = '';
      }
      if (visible && !mountState.growthStudy) {
        try {
          mountState.growthStudy = await chart.createStudy(
            studyName,
            false,
            false,
            {},
            {},
            {
              checkLimit: false,
              disableUndo: true,
              priceScale: 'new-right',
            },
          );
          mountState.growthStudyName = mountState.growthStudy ? studyName : '';
        } catch (error) {
          console.warn('[01R.Trade] Unable to add Growth pane to Advanced Charts.', error);
        }
      } else if (!visible && mountState.growthStudy) {
        await removeEntity(chart, mountState.growthStudy);
        mountState.growthStudy = null;
        mountState.growthStudyName = '';
      }
    } finally {
      mountState.growthSyncInProgress = false;
    }
    refreshGrowthButton(mountState);
    scheduleIndicatorCheckRefresh(mountState);
  }

  async function syncStudies(mountState, snapshot) {
    const widget = mountState?.widget;
    if (!widget || mountState.destroyed) return;
    const chart = widget.activeChart();
    const visibility = chartSnapshotVisibility(snapshot);
    const token = normalizeTokenKey(snapshot.tokenKey);
    const ticker = normalizeTicker(snapshot.ticker, token);
    const navSymbol = tradingViewSymbol(token, 'nav', ticker);

    if (visibility.historicNav && !mountState.overlayStudies.nav) {
      try {
        mountState.overlayStudies.nav = await chart.createStudy(
          'Overlay',
          true,
          true,
          { symbol: navSymbol },
          {
            'lineStyle.color': ADVANCED_CUSTOM_SERIES_STYLE.nativeColor,
            'lineStyle.linewidth': 1,
            showLabelsOnPriceScale: false,
            showPriceLine: false,
            style: 2,
          },
          {
            checkLimit: false,
            disableUndo: true,
            priceScale: 'as-series',
          },
        );
      } catch (error) {
        console.warn('[01R.Trade] Unable to add NAV overlay to Advanced Charts.', error);
      }
    } else if (!visibility.historicNav && mountState.overlayStudies.nav) {
      await removeEntity(chart, mountState.overlayStudies.nav);
      mountState.overlayStudies.nav = null;
    }

    const projectedNavTurningOn = visibility.projectedNav
      && !mountState.projectedNavVisible;
    if (projectedNavTurningOn) {
      try {
        mountState.projectedNavRestoreRange = chart.getVisibleRange();
      } catch (_) {
        mountState.projectedNavRestoreRange = null;
      }
    }

    if (projectedNavTurningOn) {
      const range = projectedNavVisibleRange(snapshot);
      if (range) {
        try {
          await chart.setVisibleRange(range, { rejectByTimeout: 3_000 });
        } catch (_) {
          // The path can still render in the portion of the forecast already visible.
        }
      }
      mountState.projectedNavVisible = true;
      scheduleProjectedNavRender(mountState);
    } else if (!visibility.projectedNav && mountState.projectedNavVisible) {
      const restoreRange = mountState.projectedNavRestoreRange;
      mountState.projectedNavVisible = false;
      mountState.projectedNavRestoreRange = null;
      removeProjectedNavOverlay(mountState);
      if (
        Number.isFinite(restoreRange?.from)
        && Number.isFinite(restoreRange?.to)
        && restoreRange.to > restoreRange.from
      ) {
        try {
          await chart.setVisibleRange(restoreRange, { rejectByTimeout: 3_000 });
        } catch (_) {
          // Preserve the current view if restoring is unsupported.
        }
      }
    } else if (visibility.projectedNav) {
      scheduleProjectedNavRender(mountState);
    }

    try {
      chart.applyOverrides({
        'mainSeriesProperties.visible': visibility.historicPrice,
      });
    } catch (_) {
      // Older approved library builds can omit per-chart applyOverrides.
    }
    await syncGrowthStudy(mountState, snapshot);
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
    mountState.currentReferenceFallbackHold = true;
    scheduleCurrentReferenceRender(mountState);
    schedulePriceGradientRender(mountState);
    const time = Math.floor(latestSnapshotTime(snapshot) / 1_000);

    try {
      chart.applyOverrides({
        'mainSeriesProperties.showPriceLine': false,
        'scalesProperties.showSeriesLastValue': false,
      });
    } catch (_) {}

    async function createCurrentLine(price, color) {
      if (!(Number(price) > 0)) return null;
      try {
        return await chart.createShape(
          { time, price: Number(price) },
          {
            disableSave: true,
            disableSelection: true,
            disableUndo: true,
            lock: true,
            overrides: {
              linecolor: color,
              linestyle: 1,
              linewidth: 1,
              showLabel: false,
              showPrice: true,
            },
            shape: 'horizontal_line',
          },
        );
      } catch (_) {
        return null;
      }
    }

    if (visibility.currentNav) {
      const currentNav = finiteNumber(
        snapshot.currentNav,
        chartPointValue(snapshot.navBars?.at(-1)),
      );
      mountState.currentLineEntities.nav = await createCurrentLine(
        currentNav,
        '#ffcc00',
      );
    }
    if (visibility.currentPrice) {
      const currentPrice = finiteNumber(
        snapshot.currentPrice,
        chartPointValue(snapshot.priceBars?.at(-1)),
      );
      mountState.currentLineEntities.price = await createCurrentLine(
        currentPrice,
        '#f4f4f1',
      );
    }
    scheduleCurrentReferenceRender(mountState);
  }

  function suspendAdvancedChartSurface(mountState) {
    if (!mountState) return;
    mountState.baseChartReady = false;
    mountState.container?.classList.remove('is-ready');
    if (mountState.stats) mountState.stats.hidden = true;
    removeCurrentReferenceFallback(mountState);
    removeProjectedNavOverlay(mountState);
    removePriceGradientOverlay(mountState);
    removeNavGradientOverlay(mountState);
    runtime.document.documentElement.dataset.chartEngine = 'advanced-loading';
  }

  function revealAdvancedChartSurface(mountState, chartKey) {
    if (!mountState || mountState.destroyed) return;
    mountState.baseChartReady = true;
    mountState.presentedChartKey = chartKey;
    updateChartStats(mountState, mountState.latestSnapshot);
    renderCurrentReferenceFallback(mountState);
    renderProjectedNavOverlay(mountState);
    renderPriceGradientOverlay(mountState);
    renderNavGradientOverlay(mountState);
    runtime.document.documentElement.dataset.chartEngine = 'advanced';
    mountState.container?.classList.add('is-ready');
  }

  async function updateTokenChart(snapshot) {
    if (!snapshot?.container) return false;
    const mountState = await mount(snapshot);
    if (!mountState) return false;
    mountState.latestSnapshot = snapshot;
    mountState.navVisibilityDesired = legacyNavVisibility(runtime, snapshot);
    mountState.growthVisibleDesired = chartSnapshotVisibility(snapshot).growth;
    const readyState = await mountState.mountPromise;
    if (!readyState || mountState.destroyed) return false;

    const token = normalizeTokenKey(snapshot.tokenKey);
    const ticker = normalizeTicker(snapshot.ticker, token);
    const resolution = tradingViewResolutionForTimeframe(snapshot.timeframe);
    const chartKey = `${token}:${resolution}`;
    const needsColdReveal = !advancedChartSurfaceReady(mountState)
      || mountState.presentedChartKey !== chartKey;
    if (needsColdReveal) suspendAdvancedChartSurface(mountState);
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
    mountState.datafeed.setSeries(
      tradingViewSymbol(token, 'growth', ticker),
      resolution,
      snapshot.growthBars,
    );
    updateChartStats(mountState, snapshot);
    refreshNavDropdown(mountState);
    refreshGrowthButton(mountState);
    mountState.currentReferenceFallbackHold = true;
    scheduleCurrentReferenceRender(mountState);

    const chart = mountState.widget.activeChart();
    if (String(chart.resolution?.() || '') !== String(resolution)) {
      try {
        await chart.setResolution(resolution);
      } catch (_) {
        // The datafeed still serves the requested resolution after the next UI change.
      }
    }
    const resetPromise = scheduleReset(mountState);
    mountState.studySync = mountState.studySync.then(async () => {
      await resetPromise;
      await waitForAdvancedChartData(runtime, chart);
      await syncStudies(mountState, snapshot);
      await syncReferenceLines(mountState, snapshot);
      schedulePriceGradientRender(mountState);
    });
    await mountState.studySync;
    if (needsColdReveal) revealAdvancedChartSurface(mountState, chartKey);
    return true;
  }

  async function updateGrowthChart({
    container,
    tokenKey,
    ticker,
    timeframe,
    bars,
    meta,
    visible,
  } = {}) {
    const mountState = mounts.get(container);
    if (!mountState || mountState.destroyed) return false;
    const readyState = await mountState.mountPromise;
    if (!readyState || mountState.destroyed) return false;
    const token = normalizeTokenKey(tokenKey || mountState.latestSnapshot?.tokenKey);
    const symbolTicker = normalizeTicker(
      ticker || mountState.latestSnapshot?.ticker,
      token,
    );
    const resolution = tradingViewResolutionForTimeframe(
      timeframe || mountState.latestSnapshot?.timeframe,
    );
    const growthBars = Array.isArray(bars) ? bars : [];
    mountState.latestSnapshot = {
      ...mountState.latestSnapshot,
      growthBars,
      growthMeta: meta || null,
      visibility: {
        ...mountState.latestSnapshot?.visibility,
        growth: visible === true && growthBars.length > 0,
      },
    };
    mountState.growthVisibleDesired = visible === true && growthBars.length > 0;
    mountState.datafeed.setSeries(
      tradingViewSymbol(token, 'growth', symbolTicker),
      resolution,
      growthBars,
    );
    if (!mountState.growthVisibleDesired && !growthStudyIsActive(mountState)) {
      refreshGrowthButton(mountState);
      return true;
    }
    scheduleReset(mountState);
    mountState.studySync = mountState.studySync.then(
      () => syncGrowthStudy(mountState, mountState.latestSnapshot),
    );
    await mountState.studySync;
    return true;
  }

  function destroyTokenChart(container) {
    const mountState = mounts.get(container);
    if (!mountState) return;
    mountState.destroyed = true;
    if (mountState.controlSyncTimer != null) {
      runtime.clearTimeout?.(mountState.controlSyncTimer);
      mountState.controlSyncTimer = null;
    }
    if (mountState.resetFrame != null) {
      if (runtime.cancelAnimationFrame) runtime.cancelAnimationFrame(mountState.resetFrame);
      else runtime.clearTimeout?.(mountState.resetFrame);
      mountState.resetFrame = null;
    }
    mountState.resetResolve?.(false);
    mountState.resetResolve = null;
    mountState.resetPromise = null;
    if (mountState.projectedNavRenderFrame != null) {
      if (runtime.cancelAnimationFrame) {
        runtime.cancelAnimationFrame(mountState.projectedNavRenderFrame);
      } else {
        runtime.clearTimeout?.(mountState.projectedNavRenderFrame);
      }
    }
    if (mountState.priceGradientRenderFrame != null) {
      if (runtime.cancelAnimationFrame) {
        runtime.cancelAnimationFrame(mountState.priceGradientRenderFrame);
      } else {
        runtime.clearTimeout?.(mountState.priceGradientRenderFrame);
      }
    }
    if (mountState.currentReferenceRenderFrame != null) {
      if (runtime.cancelAnimationFrame) {
        runtime.cancelAnimationFrame(mountState.currentReferenceRenderFrame);
      } else {
        runtime.clearTimeout?.(mountState.currentReferenceRenderFrame);
      }
    }
    try {
      mountState.intervalSubscription?.unsubscribe?.(null);
    } catch (_) {}
    try {
      mountState.chartTypeSubscription?.unsubscribe?.(
        null,
        mountState.chartTypeHandler,
      );
    } catch (_) {}
    try {
      mountState.visibleRangeSubscription?.unsubscribe?.(
        null,
        mountState.visibleRangeHandler,
      );
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
    if (mountState.projectedNavInteractionHandler && mountState.frameDocument) {
      mountState.frameDocument.removeEventListener(
        'pointerup',
        mountState.projectedNavInteractionHandler,
        true,
      );
      mountState.frameDocument.removeEventListener(
        'wheel',
        mountState.projectedNavInteractionHandler,
        true,
      );
      mountState.frameDocument.defaultView?.removeEventListener?.(
        'resize',
        mountState.projectedNavInteractionHandler,
      );
    }
    mountState.cancelIndicatorRefresh?.();
    mountState.indicatorObserver?.disconnect?.();
    mountState.projectedNavResizeObserver?.disconnect?.();
    if (mountState.indicatorClickHandler && mountState.frameDocument) {
      mountState.frameDocument.removeEventListener(
        'click',
        mountState.indicatorClickHandler,
        true,
      );
    }
    try {
      mountState.widget?.unsubscribe?.('study_event', mountState.studyEventHandler);
    } catch (_) {}
    try {
      mountState.widget?.remove?.();
    } catch (_) {}
    mountState.datafeed?.destroy?.();
    removeCurrentReferenceFallback(mountState);
    removeProjectedNavOverlay(mountState);
    removePriceGradientOverlay(mountState);
    removeNavGradientOverlay(mountState);
    mountState.container?.remove();
    mountState.stats?.remove();
    mounts.delete(container);
  }

  const bridge = {
    configuration,
    destroyTokenChart,
    enabled: configuration.enabled,
    updateGrowthChart,
    updateTokenChart,
  };
  runtime.NAVGATOR.chartEngines.advanced = bridge;
  return bridge;
}
