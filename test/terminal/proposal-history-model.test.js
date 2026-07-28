const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function loadModel() {
  return import(pathToFileURL(path.resolve(
    'src/markets/proposal-history-model.js',
  )).href);
}

test('proposal chart adds a shared spot launch anchor without rewriting observations', async () => {
  const { proposalChartPointTime, proposalChartPoints } = await loadModel();
  const history = {
    series: [
      {
        timestamp: '2026-07-23T00:00:00.000Z',
        observedAt: '2026-07-23T00:45:00.000Z',
        underlyingPrice: 0.13,
        passPrice: 0.134,
        failPrice: 0.127,
      },
      {
        timestamp: '2026-07-23T01:00:00.000Z',
        observedAt: '2026-07-23T01:45:00.000Z',
        underlyingPrice: 0.131,
        passPrice: 0.135,
        failPrice: 0.126,
      },
    ],
  };

  const points = proposalChartPoints(history, {
    launchedAt: '2026-07-23T00:20:00.000Z',
  });

  assert.equal(points.length, 3);
  assert.equal(points[0].protocolLaunchAnchor, true);
  assert.equal(points[0].chartTimestamp, '2026-07-23T00:20:00.000Z');
  assert.equal(points[0].underlyingPrice, 0.13);
  assert.equal(points[0].passPrice, 0.13);
  assert.equal(points[0].failPrice, 0.13);
  assert.equal(points[1].chartTimestamp, '2026-07-23T00:45:00.000Z');
  assert.equal(points[1].passPrice, 0.134);
  assert.equal(points[1].failPrice, 0.127);
  assert.equal(history.series[0].passPrice, 0.134);
  assert.equal(history.series[0].failPrice, 0.127);
  assert.equal(
    proposalChartPointTime(points[1]),
    Date.parse('2026-07-23T00:45:00.000Z'),
  );
});

test('proposal chart omits a launch anchor when the first spot price is unavailable', async () => {
  const { proposalChartPoints } = await loadModel();
  const history = {
    series: [{
      timestamp: '2026-07-23T00:00:00.000Z',
      observedAt: '2026-07-23T00:45:00.000Z',
      underlyingPrice: null,
      passPrice: 0.134,
      failPrice: 0.127,
    }],
  };

  const points = proposalChartPoints(history);

  assert.equal(points.length, 1);
  assert.equal(points[0].protocolLaunchAnchor, undefined);
  assert.equal(points[0].passPrice, 0.134);
  assert.equal(points[0].failPrice, 0.127);
});
