const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function loadViewportModel() {
  return import(pathToFileURL(path.resolve(
    'src/chart/stable-chart-viewport.js',
  )).href);
}

test('stable chart projection keeps the renderer window fixed through zoom', async () => {
  const {
    STABLE_CHART_RENDER_WINDOW_SECONDS,
    stableChartViewportProjection,
  } = await loadViewportModel();
  const wide = stableChartViewportProjection(
    { from: 100, to: 500 },
    { nowSeconds: 1_000 },
  );
  const zoomed = stableChartViewportProjection(
    { from: 250, to: 350 },
    { nowSeconds: 1_000 },
  );

  assert.equal(wide.renderWindowSeconds, STABLE_CHART_RENDER_WINDOW_SECONDS);
  assert.equal(zoomed.renderWindowSeconds, STABLE_CHART_RENDER_WINDOW_SECONDS);
  assert.equal(wide.toRenderTime(wide.sourceTo), wide.renderNow);
  assert.equal(zoomed.toRenderTime(zoomed.sourceTo), zoomed.renderNow);
  assert.equal(wide.toSourceTime(wide.toRenderTime(321)), 321);
  assert.equal(zoomed.toSourceTime(zoomed.toRenderTime(321)), 321);
});

test('wheel zoom normalizes to small reversible steps', async () => {
  const { chartWheelZoomFactor } = await loadViewportModel();
  const zoomOut = chartWheelZoomFactor(100);
  const zoomIn = chartWheelZoomFactor(-100);
  const trackpadStep = chartWheelZoomFactor(2);

  assert.ok(zoomOut > 1 && zoomOut < 1.2);
  assert.ok(zoomIn < 1 && zoomIn > 0.8);
  assert.ok(Math.abs(zoomOut * zoomIn - 1) < 1e-12);
  assert.ok(trackpadStep > 1 && trackpadStep < 1.01);
});
