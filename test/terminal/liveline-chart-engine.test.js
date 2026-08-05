const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function loadLivelineEngine() {
  return import(pathToFileURL(path.resolve(
    'src/chart/liveline-chart-engine.js',
  )).href);
}

test('Liveline snapshot projects source time without losing gaps or semantic starts', async () => {
  const { livelineChartSnapshot } = await loadLivelineEngine();
  const source = [
    {
      id: 'price',
      kind: 'area',
      options: {
        livelineColor: '#5b8cff',
        livelineLabel: 'Price',
        visible: true,
      },
      data: [
        { time: 100, value: 1 },
        { time: 160 },
        { time: 220, value: 1.2 },
        { time: 340, value: 1.3 },
      ],
    },
    {
      id: 'projected-nav',
      kind: 'line',
      options: {
        livelineColor: '#ff9f43',
        livelineLabel: 'Projected NAV',
        visible: true,
      },
      data: [
        { time: 220, value: 1.1 },
        { time: 340, value: 0.9 },
      ],
    },
  ];
  const untouched = JSON.parse(JSON.stringify(source));
  const snapshot = livelineChartSnapshot(source, {
    nowSeconds: 1_000,
    viewport: { from: 90, to: 250 },
  });

  assert.deepEqual(snapshot.timeline, [100, 220, 340]);
  assert.equal(snapshot.offset, 750);
  assert.equal(snapshot.isLive, false);
  assert.ok(snapshot.gaps.some(gap => gap.from <= 160 && gap.to >= 160));
  assert.deepEqual(
    snapshot.markers.map(marker => `${marker.id}:${marker.edge}`).sort(),
    [
      'price-start:start',
      'projected-nav-start:start',
    ],
  );
  assert.deepEqual(snapshot.markers.map(marker => marker.sourceTime), [100, 220]);
  assert.equal(snapshot.rendererWindowSeconds, 24 * 60 * 60);
  assert.equal(snapshot.projection.dataPlotRatio, 0.985);

  const projected = snapshot.series.find(series => series.id === 'projected-nav');
  assert.equal(projected.label, 'Projected NAV');
  assert.equal(projected.color, '#ff9f43');
  assert.equal(projected.value, 1.1);
  assert.equal(snapshot.projection.toSourceTime(projected.data[1].time), 340);
  assert.equal(snapshot.projection.toRenderTime(250), 1_000);
  assert.deepEqual(source, untouched);
});

test('semantic starting markers stay attached to the true series origin during zoom', async () => {
  const { livelineChartSnapshot } = await loadLivelineEngine();
  const source = [{
    id: 'price',
    kind: 'line',
    options: { visible: true },
    data: [
      { time: 100, value: 1 },
      { time: 200, value: 1.1 },
      { time: 300, value: 1.2 },
    ],
  }];

  const fitted = livelineChartSnapshot(source, { nowSeconds: 1_000 });
  const zoomed = livelineChartSnapshot(source, {
    nowSeconds: 1_000,
    viewport: { from: 180, to: 300 },
  });

  assert.equal(fitted.markers.find(marker => marker.edge === 'start')?.sourceTime, 100);
  assert.equal(zoomed.markers.some(marker => marker.edge === 'start'), false);
  assert.equal(fitted.rendererWindowSeconds, zoomed.rendererWindowSeconds);
});

test('visible candles remain authoritative while the line model stays available', async () => {
  const { livelineChartSnapshot } = await loadLivelineEngine();
  const priceLine = {
    id: 'price-line',
    kind: 'area',
    options: { visible: true },
    data: [
      { time: 100, value: 1 },
      { time: 160, value: 1.1 },
    ],
  };
  const candles = {
    id: 'candles',
    kind: 'candlestick',
    options: { visible: true },
    data: [
      { time: 100, open: 1, high: 1.2, low: 0.9, close: 1.1 },
      { time: 160, open: 1.1, high: 1.3, low: 1, close: 1.2 },
    ],
  };

  const candleSnapshot = livelineChartSnapshot([priceLine, candles], {
    nowSeconds: 200,
  });
  assert.equal(candleSnapshot.useCandles, true);
  assert.equal(candleSnapshot.candles.length, 2);

  const lineSnapshot = livelineChartSnapshot([
    priceLine,
    { ...candles, options: { visible: false } },
  ], { nowSeconds: 200 });
  assert.equal(lineSnapshot.useCandles, false);
  assert.equal(lineSnapshot.series[0].id, 'price-line');
});
