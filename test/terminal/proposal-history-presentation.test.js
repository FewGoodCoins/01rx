const assert = require('node:assert/strict');
const test = require('node:test');

const presentationModulePromise = import(
  '../../src/markets/proposal-history-presentation.js'
);

test('proposal chart presentation stays semantic and renderer-independent', async () => {
  const {
    PROPOSAL_CHART_PRESENTATION,
    PROPOSAL_CHART_SERIES_PRESENTATION,
    proposalChartPresentationCssVariables,
  } = await presentationModulePromise;

  assert.deepEqual(
    PROPOSAL_CHART_SERIES_PRESENTATION.map(series => series.field),
    [
      'underlyingPrice',
      'passPrice',
      'failPrice',
      'decisionEdge',
      'passTwap',
      'failTwap',
    ],
  );
  assert.deepEqual(PROPOSAL_CHART_PRESENTATION.interaction, {
    dragPan: true,
    kineticScroll: true,
    pinchZoom: true,
    scaleDrag: true,
    wheelZoom: true,
  });
  assert.deepEqual(PROPOSAL_CHART_PRESENTATION.liveEndpoint, {
    diameterPx: 5,
    motionDurationMs: 360,
    motionEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    pulseDurationMs: 3_000,
    pulseScale: 3,
    staggerMs: 1_000,
  });
  assert.deepEqual(proposalChartPresentationCssVariables(), {
    '--ft-proposal-live-dot-size': '5px',
    '--ft-proposal-live-pulse-duration': '3000ms',
    '--ft-proposal-live-pulse-scale': '3',
    '--ft-proposal-live-pulse-stagger': '1000ms',
  });
  assert.equal(Object.isFrozen(PROPOSAL_CHART_PRESENTATION), true);
  assert.equal(Object.isFrozen(PROPOSAL_CHART_PRESENTATION.interaction), true);
  PROPOSAL_CHART_SERIES_PRESENTATION.forEach((series) => {
    assert.equal(Object.isFrozen(series), true);
    assert.equal(typeof series.stroke, 'string');
    assert.equal(typeof series.curve, 'string');
    assert.equal('lineStyle' in series, false);
  });
});
