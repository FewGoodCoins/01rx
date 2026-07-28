import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChartLayerModel,
  layerValuesAtTime,
  normalizeLayerVisibility,
} from '../src/chart/layer-model.js';

const hour = 3_600;
const anchorTime = Date.UTC(2026, 0, 1) / 1_000;

function fixture() {
  return {
    candles: [
      { time: anchorTime, open: 0.8, high: 0.85, low: 0.75, close: 0.8 },
      { time: anchorTime + hour, open: 0.8, high: 1.05, low: 0.8, close: 1 },
    ],
    navRows: [
      {
        time: anchorTime,
        value: 1,
        treasury: 1_000_000,
        effectiveSupply: 1_000_000,
      },
      {
        time: anchorTime + hour,
        value: 0.9,
        treasury: 900_000,
        effectiveSupply: 1_000_000,
      },
    ],
  };
}

test('gradient visibility always keeps both boundary histories visible', () => {
  assert.deepEqual(normalizeLayerVisibility({
    gradient: true,
    historicNav: false,
    historicPrice: false,
  }), {
    currentNav: true,
    currentPrice: true,
    gradient: true,
    historicNav: true,
    historicPrice: true,
    projectedNav: false,
  });
});

test('builds a renderer-neutral contract for every custom chart layer', () => {
  const model = buildChartLayerModel({
    ...fixture(),
    horizonMonths: 2,
    monthlySpend: 100_000,
  });

  assert.equal(model.version, 1);
  assert.equal(model.references.currentPrice, 1);
  assert.equal(model.references.currentNav, 0.9);
  assert.equal(model.series.projectedNav.length, 3);
  assert.equal(model.gradient.aligned.length, 2);
  assert.equal(model.gradient.regions[0].kind, 'discount');
  assert.deepEqual(model.projection, {
    available: true,
    anchorTime: anchorTime + hour,
    horizonMonths: 2,
    monthlySpend: 100_000,
    monthlySpendConfigured: true,
    startingTreasury: 900_000,
    effectiveSupply: 1_000_000,
    supplyPolicy: 'constant',
  });
});

test('hover values interpolate NAV between observations', () => {
  const model = buildChartLayerModel(fixture());
  const values = layerValuesAtTime(model, anchorTime + (hour / 2));

  assert.equal(values.price, 0.9);
  assert.equal(values.nav, 0.95);
  assert.equal(values.navKind, 'historic');
  assert.ok(Math.abs(values.spread - (-5.263157894736836)) < 1e-10);
});

test('hover values switch to projected NAV after the projection anchor', () => {
  const model = buildChartLayerModel({
    ...fixture(),
    horizonMonths: 2,
    monthlySpend: 100_000,
    visibility: { projectedNav: true },
  });
  const futureTime = model.series.projectedNav[1].time;
  const values = layerValuesAtTime(model, futureTime);

  assert.equal(values.nav, 0.8);
  assert.equal(values.navKind, 'projected');
  assert.equal(values.price, null);
  assert.equal(values.spread, null);
});
