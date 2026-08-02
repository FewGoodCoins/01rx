const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function loadModel() {
  return import(pathToFileURL(path.resolve(
    'src/markets/decision-analysis-model.js',
  )).href);
}

test('remaining spread carries the observed TWAP deficit into the future window', async () => {
  const { proposalRemainingSpreadProjection } = await loadModel();
  const projection = proposalRemainingSpreadProjection({
    passTwap: 100,
    failTwap: 100,
    thresholdPct: 5,
    failFutureAverage: 100,
    twapStartedAt: '2026-08-02T10:00:00.000Z',
    observedAt: '2026-08-02T11:00:00.000Z',
    endsAt: '2026-08-02T12:00:00.000Z',
  });

  assert.equal(projection.minimumPassAverage, 110);
  assert.equal(projection.requiredSpreadPct, 10.000000000000009);
  assert.equal(projection.elapsedMs, 60 * 60 * 1_000);
  assert.equal(projection.remainingMs, 60 * 60 * 1_000);
});

test('remaining spread gives credit for a lead accumulated earlier in the TWAP window', async () => {
  const { proposalRemainingSpreadProjection } = await loadModel();
  const projection = proposalRemainingSpreadProjection({
    passTwap: 110,
    failTwap: 100,
    thresholdPct: 5,
    failFutureAverage: 100,
    twapStartedAt: '2026-08-02T10:00:00.000Z',
    observedAt: '2026-08-02T11:00:00.000Z',
    endsAt: '2026-08-02T12:00:00.000Z',
  });

  assert.equal(projection.minimumPassAverage, 100);
  assert.equal(projection.requiredSpreadPct, 0);
});

test('remaining spread supports the signed team-sponsored threshold', async () => {
  const { proposalRemainingSpreadProjection } = await loadModel();
  const projection = proposalRemainingSpreadProjection({
    passTwap: 100,
    failTwap: 100,
    thresholdPct: -3,
    failFutureAverage: 100,
    twapStartedAt: '2026-08-02T10:00:00.000Z',
    observedAt: '2026-08-02T11:00:00.000Z',
    endsAt: '2026-08-02T12:00:00.000Z',
  });

  assert.equal(projection.minimumPassAverage, 94);
  assert.equal(projection.requiredSpreadPct, -6.000000000000005);
});

test('remaining spread fails closed without a live averaging window and assumption', async () => {
  const { proposalRemainingSpreadProjection } = await loadModel();
  const base = {
    passTwap: 100,
    failTwap: 100,
    thresholdPct: 5,
    failFutureAverage: 100,
    twapStartedAt: '2026-08-02T10:00:00.000Z',
    observedAt: '2026-08-02T11:00:00.000Z',
    endsAt: '2026-08-02T12:00:00.000Z',
  };

  assert.equal(proposalRemainingSpreadProjection({
    ...base,
    failFutureAverage: null,
  }), null);
  assert.equal(proposalRemainingSpreadProjection({
    ...base,
    observedAt: base.endsAt,
  }), null);
  assert.equal(proposalRemainingSpreadProjection({
    ...base,
    twapStartedAt: null,
  }), null);
});
