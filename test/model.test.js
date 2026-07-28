import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addUtcMonths,
  aggregateCandles,
  aggregateNavRows,
  alignPriceAndNav,
  buildGradientRegions,
  buildProjectedNav,
  interpolateSeriesValue,
  marketSnapshot,
  normalizeCandles,
  normalizeNavRows,
} from '../src/chart/model.js';

test('normalizes and sorts public OHLCV rows', () => {
  assert.deepEqual(normalizeCandles([
    { unixTime: 20, o: 2, h: 3, l: 1, c: 2.5 },
    { unixTime: 10, price: 1.5 },
  ]), [
    { time: 10, open: 1.5, high: 1.5, low: 1.5, close: 1.5 },
    { time: 20, open: 2, high: 3, low: 1, close: 2.5 },
  ]);
});

test('aggregates hourly candles into canonical four-hour OHLC buckets', () => {
  assert.deepEqual(aggregateCandles([
    { time: 3_600, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 7_200, open: 1.5, high: 3, low: 1.25, close: 2.5 },
    { time: 14_400, open: 2.5, high: 2.75, low: 2, close: 2.25 },
  ], '4H'), [
    { time: 0, open: 1, high: 3, low: 0.5, close: 2.5 },
    { time: 14_400, open: 2.5, high: 2.75, low: 2, close: 2.25 },
  ]);
});

test('aggregates daily NAV rows into Monday-based weekly observations', () => {
  const monday = Date.UTC(2026, 6, 27) / 1_000;
  assert.deepEqual(aggregateNavRows([
    { time: monday, value: 1, treasury: 100 },
    { time: monday + 86_400, value: 0.9, treasury: 90 },
  ], '1W'), [
    { time: monday, value: 0.9, treasury: 90 },
  ]);
});

test('normalizes NAV rows while preserving projection inputs', () => {
  assert.deepEqual(normalizeNavRows([
    {
      ts: 10,
      nav: 0.8,
      spot: 0.7,
      treasury_usdc: 8_000_000,
      effective_supply: 10_000_000,
    },
  ]), [{
    time: 10,
    value: 0.8,
    nav: 0.8,
    spot: 0.7,
    treasury: 8_000_000,
    effectiveSupply: 10_000_000,
    estimated: false,
  }]);
});

test('calendar month projection clamps end-of-month anchors', () => {
  const january31 = Date.UTC(2026, 0, 31) / 1_000;
  assert.equal(
    addUtcMonths(january31, 1),
    Date.UTC(2026, 1, 28) / 1_000,
  );
});

test('projected NAV deducts configured monthly spend at constant supply', () => {
  const projected = buildProjectedNav([
    {
      time: Date.UTC(2026, 0, 1) / 1_000,
      treasury: 1_200_000,
      effectiveSupply: 1_000_000,
    },
  ], {
    horizonMonths: 2,
    monthlySpend: 100_000,
  });

  assert.deepEqual(projected.map(point => point.value), [1.2, 1.1, 1]);
  assert.equal(projected[0].projected, false);
  assert.equal(projected[1].projected, true);
});

test('aligns price and NAV with interpolation across shared history', () => {
  assert.deepEqual(alignPriceAndNav(
    [{ time: 0, value: 1 }, { time: 10, value: 3 }],
    [{ time: 5, value: 2 }, { time: 10, value: 2 }],
  ), [
    { time: 5, price: 2, nav: 2, delta: 0 },
    { time: 10, price: 3, nav: 2, delta: 1 },
  ]);
});

test('interpolates a series value at an unmatched timestamp', () => {
  assert.equal(interpolateSeriesValue(
    [{ time: 0, value: 1 }, { time: 3_600, value: 2 }],
    900,
  ), 1.25);
  assert.equal(interpolateSeriesValue(
    [{ time: 0, value: 1 }, { time: 3_600, value: 2 }],
    7_200,
  ), null);
});

test('gradient regions split exactly where price crosses NAV', () => {
  const regions = buildGradientRegions(
    [{ time: 0, value: 1 }, { time: 10, value: 3 }],
    [{ time: 0, value: 2 }, { time: 10, value: 2 }],
  );

  assert.equal(regions.length, 2);
  assert.equal(regions[0].kind, 'discount');
  assert.equal(regions[1].kind, 'premium');
  assert.equal(regions[0].points.at(-1).time, 5);
  assert.equal(regions[1].points[0].price, 2);
  assert.equal(regions[1].points[0].nav, 2);
});

test('market snapshot reports price-to-NAV premium or discount', () => {
  assert.deepEqual(marketSnapshot(
    [{ close: 0.75 }],
    [{ value: 1, treasury: 5_000_000, effectiveSupply: 5_000_000 }],
  ), {
    price: 0.75,
    nav: 1,
    spread: -25,
    treasury: 5_000_000,
    effectiveSupply: 5_000_000,
  });
});
