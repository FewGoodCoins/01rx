const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function loadModel() {
  return import(pathToFileURL(path.resolve(
    'src/markets/proposal-history-model.js',
  )).href);
}

test('proposal chart uses only indexed observations without a synthetic launch anchor', async () => {
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

  assert.equal(points.length, 2);
  assert.equal(points[0].protocolLaunchAnchor, undefined);
  assert.equal(points[0].chartTimestamp, '2026-07-23T00:45:00.000Z');
  assert.equal(points[0].underlyingPrice, 0.13);
  assert.equal(points[0].passPrice, 0.134);
  assert.equal(points[0].failPrice, 0.127);
  assert.equal(history.series[0].passPrice, 0.134);
  assert.equal(history.series[0].failPrice, 0.127);
  assert.equal(
    proposalChartPointTime(points[0]),
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

test('proposal TWAP and decision-edge observations begin at TWAP Open without mutating indexed history', async () => {
  const {
    proposalDecisionEdge,
    proposalHistoryChartObservations,
  } = await loadModel();
  const history = {
    preTwap: '2026-07-23T01:00:00.000Z',
    series: [
      {
        observedAt: '2026-07-23T00:59:59.000Z',
        passTwap: 0.134,
        failTwap: 0.127,
      },
      {
        observedAt: '2026-07-23T01:00:00.000Z',
        passTwap: 0.135,
        failTwap: 0.126,
      },
      {
        observedAt: '2026-07-23T01:15:00.000Z',
        passTwap: 0.136,
        failTwap: 0.125,
      },
    ],
  };

  const observations = proposalHistoryChartObservations(history);

  assert.equal(observations[0].passTwap, null);
  assert.equal(observations[0].failTwap, null);
  assert.equal(observations[0].decisionEdge, null);
  assert.equal(observations[1].passTwap, 0.135);
  assert.equal(observations[1].failTwap, 0.126);
  assert.equal(
    observations[1].decisionEdge,
    proposalDecisionEdge(0.135, 0.126),
  );
  assert.equal(observations[2].passTwap, 0.136);
  assert.equal(observations[2].failTwap, 0.125);
  assert.equal(
    observations[2].decisionEdge,
    proposalDecisionEdge(0.136, 0.125),
  );
  assert.equal(history.series[0].passTwap, 0.134);
  assert.equal(history.series[0].failTwap, 0.127);
  assert.equal(history.series[0].decisionEdge, undefined);
  assert.equal(proposalDecisionEdge(1.03, 1), 3.0000000000000027);
  assert.equal(proposalDecisionEdge(0.97, 1), -3.0000000000000027);
  assert.equal(proposalDecisionEdge(null, 1), null);
  assert.equal(proposalDecisionEdge(1, 0), null);
});
