const assert = require('node:assert/strict');
const test = require('node:test');

const advancedChartsModulePromise = import(
  '../../src/charting/advanced-charts.js'
);

function createRuntime({
  hostname = '127.0.0.1',
  search = '?token=solo&frame=01rx',
  config = {},
} = {}) {
  return {
    URL,
    URLSearchParams,
    NAVGATOR_CONFIG: config,
    document: {
      documentElement: { dataset: {} },
    },
    location: {
      href: `http://${hostname}:3000/${search}`,
      hostname,
      search,
    },
    setTimeout,
  };
}

function getBars(datafeed, symbolInfo, resolution, periodParams) {
  return new Promise((resolve, reject) => {
    datafeed.getBars(symbolInfo, resolution, periodParams, (bars, meta) => {
      resolve({ bars, meta });
    }, reject);
  });
}

test('Advanced Charts maps native resolutions to 01RX timeframes', async () => {
  const {
    timeframeForTradingViewResolution,
    tradingViewResolutionForTimeframe,
  } = await advancedChartsModulePromise;

  assert.equal(tradingViewResolutionForTimeframe('15m'), '15');
  assert.equal(tradingViewResolutionForTimeframe('4H'), '240');
  assert.equal(tradingViewResolutionForTimeframe('unknown'), '1D');
  assert.equal(timeframeForTradingViewResolution('60'), '1H');
  assert.equal(timeframeForTradingViewResolution('1W'), '1W');
  assert.equal(timeframeForTradingViewResolution('unknown'), '');
});

test('Advanced Charts generates and parses 01RX price and NAV symbols', async () => {
  const {
    parseTradingViewSymbol,
    tradingViewSymbol,
  } = await advancedChartsModulePromise;

  assert.equal(tradingViewSymbol('solo', 'price', 'SOLO'), '01RX:SOLO');
  assert.equal(tradingViewSymbol('solo', 'nav', 'SOLO'), '01RX:SOLO.NAV');
  assert.equal(
    tradingViewSymbol('solo', 'projected-nav', 'SOLO'),
    '01RX:SOLO.PNAV',
  );
  assert.deepEqual(parseTradingViewSymbol('01RX:SOLO.NAV', 'solo'), {
    kind: 'nav',
    ticker: 'SOLO',
    tokenKey: 'solo',
  });
  assert.deepEqual(parseTradingViewSymbol('01RX:SOLO.PNAV'), {
    kind: 'projected-nav',
    ticker: 'SOLO',
    tokenKey: 'solo',
  });
});

test('Advanced Charts normalizes API bars to sorted millisecond OHLCV data', async () => {
  const {
    normalizeNavResponse,
    normalizeOhlcvResponse,
    normalizeTradingViewBars,
  } = await advancedChartsModulePromise;

  assert.deepEqual(normalizeOhlcvResponse({
    data: {
      data: {
        items: [
          { unixTime: 20, o: 2, h: 3, l: 1, c: 2.5, v: 8 },
          { unixTime: 10, price: 1.5 },
        ],
      },
    },
  }), [
    { time: 10_000, open: 1.5, high: 1.5, low: 1.5, close: 1.5, volume: 0 },
    { time: 20_000, open: 2, high: 3, low: 1, close: 2.5, volume: 8 },
  ]);
  assert.deepEqual(normalizeNavResponse({
    data: [
      { time: 30, nav: 0.4 },
      { time: 10, nav: 0.2 },
    ],
  }), [
    { time: 10_000, open: 0.2, high: 0.2, low: 0.2, close: 0.2, volume: 0 },
    { time: 30_000, open: 0.4, high: 0.4, low: 0.4, close: 0.4, volume: 0 },
  ]);
  assert.deepEqual(normalizeTradingViewBars([
    { time: 1_000, close: 1 },
    { time: 1_000, close: 2 },
  ]), [
    { time: 1_000_000, open: 2, high: 2, low: 2, close: 2, volume: 0 },
  ]);
});

test('Advanced Charts status reports price, interpolated NAV, and discount', async () => {
  const { advancedChartStatusValues } = await advancedChartsModulePromise;
  const snapshot = {
    currentPrice: 0.8,
    currentNav: 1,
    treasury: 1_200_000,
    effectiveSupply: 2_400_000,
    priceBars: [
      { time: 100, close: 0.6 },
      { time: 200, close: 0.8 },
    ],
    navBars: [
      { time: 100, value: 0.9 },
      { time: 200, value: 1.1 },
    ],
    fundamentalBars: [
      { time: 100, treasury: 900_000, effectiveSupply: 1_800_000 },
      { time: 200, treasury: 1_100_000, effectiveSupply: 2_200_000 },
    ],
  };

  const current = advancedChartStatusValues(snapshot);
  assert.equal(current.price, 0.8);
  assert.equal(current.nav, 1);
  assert.equal(current.treasury, 1_200_000);
  assert.equal(current.supply, 2_400_000);
  assert.ok(Math.abs(current.discount - 20) < 1e-9);
  assert.deepEqual(advancedChartStatusValues(snapshot, 150), {
    discount: 40,
    nav: 1,
    price: 0.6,
    supply: 1_800_000,
    treasury: 900_000,
  });
});

test('Advanced Charts only uses the official playground locally and approved paths in production', async () => {
  const { resolveAdvancedChartsConfiguration } = await advancedChartsModulePromise;

  assert.deepEqual(resolveAdvancedChartsConfiguration(createRuntime()), {
    enabled: true,
    libraryPath: '/__tradingview/charting_library/',
    productionReady: false,
    source: 'official-playground',
  });
  assert.deepEqual(resolveAdvancedChartsConfiguration(createRuntime({
    hostname: 'navgator.xyz',
    search: '?token=solo&frame=01rx',
  })), {
    enabled: false,
    libraryPath: '',
    productionReady: false,
    source: 'library-unavailable',
  });
  assert.deepEqual(resolveAdvancedChartsConfiguration(createRuntime({
    hostname: 'navgator.xyz',
    search: '?token=solo&frame=01rx',
    config: {
      tradingViewLibraryPath: 'https://assets.navgator.xyz/charting_library',
    },
  })), {
    enabled: true,
    libraryPath: 'https://assets.navgator.xyz/charting_library/',
    productionReady: true,
    source: 'configured',
  });
  assert.equal(resolveAdvancedChartsConfiguration(createRuntime({
    search: '?token=solo&frame=01rx&chartEngine=lightweight',
  })).enabled, false);
});

test('Advanced Charts datafeed serves exact in-memory series to the widget', async () => {
  const {
    create01rxAdvancedChartsDatafeed,
    tradingViewSymbol,
  } = await advancedChartsModulePromise;
  const runtime = createRuntime();
  runtime.NAVGATOR = {};
  runtime.setInterval = () => null;
  runtime.clearInterval = () => {};
  const bridge = create01rxAdvancedChartsDatafeed({
    runtime,
    tokenKey: 'solo',
    ticker: 'SOLO',
  });
  const symbol = tradingViewSymbol('solo', 'price', 'SOLO');
  bridge.setSeries(symbol, '15', [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { time: 200, open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 },
  ]);

  const { bars, meta } = await getBars(
    bridge.datafeed,
    { ticker: symbol, tokenKey: 'solo', seriesKind: 'price' },
    '15',
    { from: 0, to: 300, countBack: 2 },
  );

  assert.deepEqual(bars, [
    { time: 100_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { time: 200_000, open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 },
  ]);
  assert.deepEqual(meta, { noData: false });
  bridge.destroy();
});
