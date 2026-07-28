const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const legacySource = fs.readFileSync('src/legacy/token-page.js', 'utf8');
const chartDataModulePromise = import('../../src/token/chart-data.js');

function extractLegacyFunction(name) {
  const start = legacySource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} remains available as a compatibility facade`);
  const braceStart = legacySource.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < legacySource.length; i += 1) {
    if (legacySource[i] === '{') depth += 1;
    if (legacySource[i] === '}') depth -= 1;
    if (depth === 0) return legacySource.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function loadLegacyChartFacades(chartData, overrides = {}) {
  const sandbox = {
    CFG: { icoPrice: 0.8, launchDate: '2025-11-18' },
    _chartTF: '1D',
    _icoLaunchTs() { return Date.UTC(2025, 10, 18) / 1000; },
    _usesOwnershipLaunchIco() { return true; },
    window: { NAVGATOR: { token: { chartData } } },
    ...overrides,
  };
  const facades = [
    '_aggregateCandles',
    '_bucketStartForTf',
    '_candleVolumeUsd',
    '_collapseCurrentBucketCandles',
    '_collapseCurrentBucketLinePoints',
    '_collapseCurrentBucketVolumePoints',
    '_foldIcoIntoLaunchBucket',
    '_insertLineGapBreaks',
    '_monthBucketStart',
    '_navLineGapLimitSeconds',
    '_nextBucketStartForTf',
    '_previousBucketStartForTf',
    '_processRawCandles',
    '_tfSeconds',
    '_weekBucketStart',
  ].map(extractLegacyFunction).join('\n');
  vm.runInNewContext(facades, sandbox);
  return sandbox;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('chart data installs under the temporary token bridge without browser side effects', async () => {
  const { chartData, installBrowserChartData } = await chartDataModulePromise;
  const runtime = { NAVGATOR: { actions: {} } };

  assert.equal(installBrowserChartData(runtime), chartData);
  assert.equal(runtime.NAVGATOR.token.chartData, chartData);
  assert.deepEqual(runtime.NAVGATOR.actions, {});

  const tokenRuntimeSource = fs.readFileSync('src/token/runtime.js', 'utf8');
  assert.ok(tokenRuntimeSource.indexOf('installBrowserChartData(browserWindow);') < tokenRuntimeSource.indexOf('installBrowserTokenController(browserWindow);'));
});

test('raw candle normalization and USD volume match the legacy facades', async () => {
  const { chartData } = await chartDataModulePromise;
  const legacy = loadLegacyChartFacades(chartData);
  const raw = [
    { unixTime: 100, o: 1, h: 1, l: 1, c: 1, v: 10 },
    { unixTime: 200, o: 1.2, h: 1.25, l: 1.19, c: 1.22, v: 5, vUsd: 7 },
  ];

  const moduleCandles = chartData.processRawCandles(raw);
  const legacyCandles = legacy._processRawCandles(raw);
  assert.deepEqual(plain(moduleCandles), plain(legacyCandles));
  assert.deepEqual(plain(moduleCandles), [
    {
      date: '1970-01-01T00:01:40.000Z',
      time: 100,
      open: 0.997,
      high: 1.003,
      low: 0.997,
      close: 1,
      price: 1,
      volumeTokens: 10,
      volumeUsd: 10,
      volume: 10,
    },
    {
      date: '1970-01-01T00:03:20.000Z',
      time: 200,
      open: 1,
      high: 1.25,
      low: 1,
      close: 1.22,
      price: 1.22,
      volumeTokens: 5,
      volumeUsd: 7,
      volume: 5,
    },
  ]);
  assert.equal(chartData.candleVolumeUsd({ volumeTokens: 4 }, 2.5), legacy._candleVolumeUsd({ volumeTokens: 4 }, 2.5));
});

test('daily price history ends with the latest paired NAV snapshot, not an intraday live tail', async () => {
  const { chartData } = await chartDataModulePromise;
  const jul14 = Date.UTC(2026, 6, 14) / 1000;
  const jul15 = Date.UTC(2026, 6, 15) / 1000;
  const jul16 = Date.UTC(2026, 6, 16) / 1000;
  const result = chartData.alignDailyPriceSnapshots(
    [
      { time: jul14, value: 0.12 },
      { time: jul15, value: 0.13 },
      { time: jul16, value: 0.14 },
    ],
    [
      { time: jul14, open: 0.11, high: 0.13, low: 0.1, close: 0.12 },
      { time: jul15, open: 0.12, high: 0.14, low: 0.11, close: 0.13 },
      { time: jul16, open: 0.14, high: 0.14, low: 0.14, close: 0.14, live_tail: true },
    ],
    [
      { time: jul14, value: 100 },
      { time: jul15, value: 200 },
      { time: jul16, value: 5, live_tail: true },
    ],
    [
      { time: jul14, nav: 0.1, spot: 0.121 },
      { time: jul15, nav: 0.11, spot: 0.131 },
    ],
  );

  assert.equal(result.aligned, true);
  assert.equal(result.lastSnapshotTime, jul15);
  assert.deepEqual(result.pricePoints, [
    { time: jul14, value: 0.121 },
    { time: jul15, value: 0.131 },
  ]);
  assert.deepEqual(result.candles.map((row) => row.time), [jul14, jul15]);
  assert.deepEqual(result.volumePoints.map((row) => row.time), [jul14, jul15]);
});

test('a new daily NAV snapshot contributes its exact stored spot as the same-day price point', async () => {
  const { chartData } = await chartDataModulePromise;
  const jul15 = Date.UTC(2026, 6, 15) / 1000;
  const jul16 = Date.UTC(2026, 6, 16) / 1000;
  const result = chartData.alignDailyPriceSnapshots(
    [
      { time: jul15, value: 0.13 },
      { time: jul16 + 14 * 3600, value: 0.14 },
    ],
    [
      { time: jul15, open: 0.12, high: 0.14, low: 0.11, close: 0.13 },
      { time: jul16 + 14 * 3600, open: 0.14, high: 0.14, low: 0.14, close: 0.14, live_tail: true },
    ],
    [{ time: jul16 + 14 * 3600, value: 5, live_tail: true }],
    [
      { time: jul15, nav: 0.11, spot: 0.131 },
      { time: jul16, nav: 0.115, spot: 0.135 },
    ],
  );

  assert.deepEqual(result.pricePoints, [
    { time: jul15, value: 0.131 },
    { time: jul16, value: 0.135 },
  ]);
  assert.deepEqual(result.candles.map((row) => ({ time: row.time, open: row.open, close: row.close })), [
    { time: jul15, open: 0.12, close: 0.13 },
    { time: jul16, open: 0.135, close: 0.135 },
  ]);
  assert.deepEqual(result.volumePoints, []);
});

test('a current live NAV tail cannot become a canonical paired daily observation', async () => {
  const { chartData } = await chartDataModulePromise;
  const jul15 = Date.UTC(2026, 6, 15) / 1000;
  const jul16 = Date.UTC(2026, 6, 16) / 1000;
  const pricePoints = [
    { time: jul15, value: 0.13 },
    { time: jul16, value: 0.14 },
  ];
  const result = chartData.alignDailyPriceSnapshots(pricePoints, [], [], [
    { time: jul16, nav: 0.115, spot: 0.14, live_tail: true },
  ]);

  assert.equal(result.aligned, false);
  assert.deepEqual(result.pricePoints, pricePoints);
});

test('exact launch-day price and NAV pairs retain both point-time observations', async () => {
  const { chartData } = await chartDataModulePromise;
  const anchor = Date.parse('2026-07-17T18:59:58.000Z') / 1000;
  const activation = Date.parse('2026-07-17T19:00:27.000Z') / 1000;
  const candles = chartData.processRawCandles([
    { unixTime: anchor, o: 0.4, h: 0.4, l: 0.4, c: 0.4, v: 0, point_time_price: true, synthetic_ico: true },
    { unixTime: activation, o: 0.42, h: 0.42, l: 0.42, c: 0.42, v: 0, point_time_price: true, launch_initial_observation: true },
  ]);
  assert.deepEqual(candles.map(candle => [candle.time, candle.open, candle.close]), [
    [anchor, 0.4, 0.4],
    [activation, 0.42, 0.42],
  ]);
  assert.equal(candles[0].synthetic_ico, true);
  assert.equal(candles[1].launch_initial_observation, true);

  const pricePoints = candles.map(candle => ({ time: candle.time, value: candle.close }));
  const aligned = chartData.alignDailyPriceSnapshots(pricePoints, candles, [], [
    { time: anchor, nav: 0.4, spot: 0.4, synthetic_ico: true },
    { time: activation, nav: 0.405, spot: 0.42 },
  ]);
  assert.equal(aligned.preservedExactLaunchDay, true);
  assert.deepEqual(aligned.pricePoints, pricePoints);
  assert.deepEqual(aligned.candles.map(candle => candle.time), [anchor, activation]);
  assert.deepEqual(
    chartData.collapseCurrentBucketCandles(candles, '1D', activation),
    candles,
  );
  const exactPriceLine = candles.map(candle => ({
    time: candle.time,
    value: candle.close,
    point_time_price: candle.point_time_price,
    synthetic_ico: candle.synthetic_ico,
    launch_initial_observation: candle.launch_initial_observation,
  }));
  assert.deepEqual(
    chartData.collapseCurrentBucketLinePoints(exactPriceLine, '1D', activation),
    exactPriceLine,
  );
  const exactNavLine = [
    { time: anchor, value: 0.4, syntheticIco: true },
    { time: activation, value: 0.405 },
  ];
  assert.deepEqual(
    chartData.collapseCurrentBucketLinePoints(exactNavLine, '1D', activation),
    exactNavLine,
  );

  const priorDay = Date.UTC(2026, 6, 16) / 1000;
  assert.deepEqual(
    chartData.projectExactLaunchPairForDisplay(exactPriceLine, '1D', anchor, activation),
    [
      {
        ...exactPriceLine[0],
        time: priorDay,
        canonicalTime: anchor,
        canonical_time: anchor,
        syntheticPreTgeDisplay: true,
        synthetic_pre_tge_display: true,
      },
      exactPriceLine[1],
    ],
  );
  assert.deepEqual(
    chartData.projectExactLaunchPairForDisplay(exactNavLine, '1D', anchor, activation),
    [
      {
        ...exactNavLine[0],
        time: priorDay,
        canonicalTime: anchor,
        canonical_time: anchor,
        syntheticPreTgeDisplay: true,
        synthetic_pre_tge_display: true,
      },
      exactNavLine[1],
    ],
  );
  assert.deepEqual(exactPriceLine.map(point => point.time), [anchor, activation]);
  assert.deepEqual(
    chartData.projectExactLaunchPairForDisplay(exactPriceLine, '1H', anchor, activation),
    exactPriceLine,
  );
  assert.deepEqual(
    chartData.projectExactLaunchPairForDisplay([exactPriceLine[0]], '1D', anchor, activation),
    [exactPriceLine[0]],
  );

  const nextDay = Date.UTC(2026, 6, 18) / 1000;
  const later = chartData.alignDailyPriceSnapshots(
    pricePoints.concat([{ time: nextDay, value: 0.43 }]),
    candles.concat([{ time: nextDay, open: 0.43, high: 0.43, low: 0.43, close: 0.43 }]),
    [],
    [
      { time: anchor, nav: 0.4, spot: 0.4, synthetic_ico: true },
      { time: activation, nav: 0.405, spot: 0.42 },
      { time: nextDay, nav: 0.406, spot: 0.431 },
    ],
  );
  assert.equal(later.preservedExactLaunchDay, true);
  assert.deepEqual(later.pricePoints, [
    { time: anchor, value: 0.4 },
    { time: activation, value: 0.42 },
    { time: nextDay, value: 0.431 },
  ]);
});

test('hourly, daily, weekly, and monthly aggregation remain deeply legacy-equivalent', async () => {
  const { chartData } = await chartDataModulePromise;
  const legacy = loadLegacyChartFacades(chartData);
  const fixtures = [
    {
      tf: '1H',
      sec: 3600,
      times: [Date.UTC(2026, 3, 8, 1, 5) / 1000, Date.UTC(2026, 3, 8, 1, 55) / 1000, Date.UTC(2026, 3, 8, 2, 10) / 1000],
      bucketTimes: [Date.UTC(2026, 3, 8, 1) / 1000, Date.UTC(2026, 3, 8, 2) / 1000],
    },
    {
      tf: '1D',
      sec: 86400,
      times: [Date.UTC(2026, 3, 8, 1) / 1000, Date.UTC(2026, 3, 8, 22) / 1000, Date.UTC(2026, 3, 9, 2) / 1000],
      bucketTimes: [Date.UTC(2026, 3, 8) / 1000, Date.UTC(2026, 3, 9) / 1000],
    },
    {
      tf: '1W',
      sec: 604800,
      times: [Date.UTC(2026, 3, 8) / 1000, Date.UTC(2026, 3, 10) / 1000, Date.UTC(2026, 3, 14) / 1000],
      bucketTimes: [Date.UTC(2026, 3, 6) / 1000, Date.UTC(2026, 3, 13) / 1000],
    },
    {
      tf: '1MO',
      sec: 2592000,
      times: [Date.UTC(2026, 2, 8) / 1000, Date.UTC(2026, 2, 29) / 1000, Date.UTC(2026, 3, 14) / 1000],
      bucketTimes: [Date.UTC(2026, 2, 1) / 1000, Date.UTC(2026, 3, 1) / 1000],
    },
  ];

  fixtures.forEach(({ tf, sec, times, bucketTimes }) => {
    const sourceCandles = [
      { time: times[0], open: 1, high: 2, low: 0.8, close: 1.5, volume: 10 },
      { time: times[1], open: 1.5, high: 3, low: 1.2, close: 2.5, volume: 5, volumeUsd: 20 },
      { time: times[2], open: 2.5, high: 4, low: 2, close: 3.5, volume: 8 },
    ];
    const moduleResult = chartData.aggregateCandles(sourceCandles, sec, tf);
    const legacyResult = legacy._aggregateCandles(sourceCandles, sec, tf);

    assert.deepEqual(plain(moduleResult), plain(legacyResult), `${tf} aggregation`);
    assert.deepEqual(moduleResult.map((row) => row.time), bucketTimes, `${tf} UTC bucket boundaries`);
    assert.deepEqual(moduleResult.map((row) => row.close), [2.5, 3.5], `${tf} closing prices`);
    assert.deepEqual(moduleResult.map((row) => row.volume), [15, 8], `${tf} volumes`);
  });
});

test('calendar bucket traversal remains equivalent across week and month boundaries', async () => {
  const { chartData } = await chartDataModulePromise;
  const legacy = loadLegacyChartFacades(chartData, { _chartTF: '1MO' });
  const march = Date.UTC(2026, 2, 15) / 1000;
  const monday = Date.UTC(2026, 3, 8) / 1000;

  assert.deepEqual({
    month: chartData.bucketStartForTf(march, '1MO'),
    monthNext: chartData.nextBucketStartForTf(march, '1MO'),
    monthPrevious: chartData.previousBucketStartForTf(march, '1MO'),
    week: chartData.bucketStartForTf(monday, '1W'),
    weekNext: chartData.nextBucketStartForTf(monday, '1W'),
    weekPrevious: chartData.previousBucketStartForTf(monday, '1W'),
  }, {
    month: legacy._bucketStartForTf(march, '1MO'),
    monthNext: legacy._nextBucketStartForTf(march, '1MO'),
    monthPrevious: legacy._previousBucketStartForTf(march, '1MO'),
    week: legacy._bucketStartForTf(monday, '1W'),
    weekNext: legacy._nextBucketStartForTf(monday, '1W'),
    weekPrevious: legacy._previousBucketStartForTf(monday, '1W'),
  });
});

test('ICO folding preserves daily and weekly launch-bucket semantics', async () => {
  const { chartData } = await chartDataModulePromise;
  const icoPrice = 0.8;
  const icoLaunchTs = Date.UTC(2025, 10, 18) / 1000;
  const options = {
    usesOwnershipLaunchIco: true,
    launchDate: '2025-11-18',
    icoLaunchTs,
    icoPrice,
  };
  const legacy = loadLegacyChartFacades(chartData, {
    CFG: { icoPrice, launchDate: options.launchDate },
    _icoLaunchTs() { return icoLaunchTs; },
  });
  const fixtures = [
    {
      tf: '1D',
      sec: 86400,
      candles: [{ time: Date.UTC(2025, 10, 18) / 1000, open: 0.9, high: 0.95, low: 0.85, close: 0.92 }],
    },
    {
      tf: '1W',
      sec: 604800,
      candles: [{ time: Date.UTC(2025, 10, 17) / 1000, open: 0.9, high: 0.95, low: 0.85, close: 0.92 }],
    },
  ];

  fixtures.forEach(({ tf, sec, candles }) => {
    const moduleResult = chartData.foldIcoIntoLaunchBucket(plain(candles), tf, sec, options);
    const legacyResult = legacy._foldIcoIntoLaunchBucket(plain(candles), tf, sec);
    assert.deepEqual(plain(moduleResult), plain(legacyResult), `${tf} ICO folding`);
    assert.equal(moduleResult[0].open, icoPrice);
    assert.equal(moduleResult[0].low, icoPrice);
  });
});

test('current bucket collapse matches legacy for hourly, daily, weekly, and monthly data', async () => {
  const { chartData } = await chartDataModulePromise;
  const legacy = loadLegacyChartFacades(chartData);
  const fixtures = [
    { tf: '1H', now: Date.UTC(2026, 3, 8, 1, 50) / 1000, start: Date.UTC(2026, 3, 8, 1) / 1000, inside: Date.UTC(2026, 3, 8, 1, 30) / 1000 },
    { tf: '1D', now: Date.UTC(2026, 3, 8, 20) / 1000, start: Date.UTC(2026, 3, 8) / 1000, inside: Date.UTC(2026, 3, 8, 12) / 1000 },
    { tf: '1W', now: Date.UTC(2026, 3, 8, 20) / 1000, start: Date.UTC(2026, 3, 6) / 1000, inside: Date.UTC(2026, 3, 8, 12) / 1000 },
    { tf: '1MO', now: Date.UTC(2026, 3, 20) / 1000, start: Date.UTC(2026, 3, 1) / 1000, inside: Date.UTC(2026, 3, 12) / 1000 },
  ];

  fixtures.forEach(({ tf, now, start, inside }) => {
    const prior = chartData.previousBucketStartForTf(start, tf);
    const candles = [
      { time: prior, open: 0.8, high: 0.9, low: 0.7, close: 0.85, volume: 2, volumeUsd: 1.7 },
      { time: start, open: 0.85, high: 1, low: 0.8, close: 0.95, volume: 3, volumeUsd: 2.85 },
      { time: inside, open: 0.95, high: 1.1, low: 0.75, close: 0.9, volume: 4, volumeUsd: 3.6 },
    ];
    const lines = candles.map((row) => ({ time: row.time, value: row.close }));
    const volumes = candles.map((row) => ({ time: row.time, value: row.volume, color: '#abc' }));
    const moduleResult = {
      candles: chartData.collapseCurrentBucketCandles(candles, tf, now),
      lines: chartData.collapseCurrentBucketLinePoints(lines, tf, now),
      volumes: chartData.collapseCurrentBucketVolumePoints(volumes, tf, now),
    };
    const legacyResult = {
      candles: legacy._collapseCurrentBucketCandles(candles, tf, now),
      lines: legacy._collapseCurrentBucketLinePoints(lines, tf, now),
      volumes: legacy._collapseCurrentBucketVolumePoints(volumes, tf, now),
    };

    assert.deepEqual(plain(moduleResult), plain(legacyResult), `${tf} current bucket`);
    assert.equal(moduleResult.candles.at(-1).time, start);
    assert.equal(moduleResult.candles.at(-1).volume, 7);
    assert.equal(moduleResult.lines.at(-1).time, start);
    assert.equal(moduleResult.volumes.at(-1).value, 7);
  });
});

test('line gap insertion is directly testable and preserves legacy hourly semantics', async () => {
  const { chartData } = await chartDataModulePromise;
  const legacy = loadLegacyChartFacades(chartData, { _chartTF: '1H' });
  const points = [
    { time: 0, value: 0.8 },
    { time: 3600, value: 0.81 },
    { time: 18000, value: 0.7 },
  ];

  const moduleResult = chartData.insertLineGapBreaks(points, '1H');
  assert.deepEqual(plain(moduleResult), plain(legacy._insertLineGapBreaks(points, '1H')));
  assert.deepEqual(moduleResult, [
    { time: 0, value: 0.8 },
    { time: 3600, value: 0.81 },
    { time: 7200 },
    { time: 14400 },
    { time: 18000, value: 0.7 },
  ]);
});
