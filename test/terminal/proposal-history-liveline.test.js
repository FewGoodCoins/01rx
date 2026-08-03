const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function loadLivelineAdapter() {
  return import(pathToFileURL(path.resolve(
    'src/markets/proposal-history-liveline.js',
  )).href);
}

const HISTORY = {
  interval: '1h',
  preTwap: '2026-08-03T10:00:00.000Z',
  series: [
    {
      timestamp: '2026-08-03T09:00:00.000Z',
      underlyingPrice: 1,
      passPrice: 1.1,
      failPrice: 0.9,
      passTwap: null,
      failTwap: null,
    },
    {
      timestamp: '2026-08-03T10:00:00.000Z',
      underlyingPrice: 1.01,
      passPrice: 1.12,
      failPrice: 0.91,
      passTwap: 1.12,
      failTwap: 0.91,
    },
    {
      timestamp: '2026-08-03T11:00:00.000Z',
      underlyingPrice: 1.02,
      passPrice: null,
      failPrice: 0.92,
      passTwap: 1.115,
      failTwap: 0.915,
    },
    {
      timestamp: '2026-08-03T13:00:00.000Z',
      underlyingPrice: 1.03,
      passPrice: 1.14,
      failPrice: 0.93,
      passTwap: 1.12,
      failTwap: 0.92,
    },
  ],
};

test('Liveline decision adapter keeps source timestamps and missing observations explicit', async () => {
  const {
    PROPOSAL_HISTORY_ENGINE,
    proposalLivelineDataset,
  } = await loadLivelineAdapter();
  const nowSeconds = Date.parse('2026-08-03T14:00:00.000Z') / 1_000;
  const dataset = proposalLivelineDataset(HISTORY, {
    nowSeconds,
    visibility: {
      passTwap: false,
      failTwap: false,
    },
  });

  assert.equal(PROPOSAL_HISTORY_ENGINE, 'liveline');
  assert.equal(dataset.lastTime + dataset.timeOffset, nowSeconds);
  assert.deepEqual(dataset.series.map(series => series.id), ['price', 'pass', 'fail']);
  assert.equal(dataset.series.find(series => series.id === 'pass').data.length, 3);
  assert.ok(dataset.gapRanges.some(range => (
    range.from <= Date.parse('2026-08-03T11:00:00.000Z') / 1_000
    && range.to >= Date.parse('2026-08-03T11:00:00.000Z') / 1_000
  )));
  assert.ok(dataset.windowSeconds >= 2 * 60 * 60);
});

test('Liveline gap masks include absent intervals and cadence breaks', async () => {
  const { proposalLivelineGapRanges } = await loadLivelineAdapter();
  const gaps = proposalLivelineGapRanges(
    HISTORY.series,
    ['underlyingPrice', 'passPrice', 'failPrice'],
    '1h',
  );
  assert.ok(gaps.length >= 1);
  assert.ok(gaps.some(range => range.to - range.from >= 60 * 60));
});

test('Liveline ignores missing values from a series too sparse to render', async () => {
  const { proposalLivelineDataset } = await loadLivelineAdapter();
  const sparseTwapHistory = {
    interval: '1h',
    series: HISTORY.series.slice(0, 3).map((point, index) => ({
      ...point,
      passPrice: 1.1 + index * 0.01,
      passTwap: index === 1 ? 1.105 : null,
      failTwap: null,
    })),
  };
  const dataset = proposalLivelineDataset(sparseTwapHistory, {
    nowSeconds: Date.parse('2026-08-03T14:00:00.000Z') / 1_000,
  });

  assert.deepEqual(dataset.series.map(series => series.id), ['price', 'pass', 'fail']);
  assert.deepEqual(dataset.gapRanges, []);
});

test('resolved Liveline playback leaves interpolation headroom', async () => {
  const { proposalLivelinePlaybackOptions } = await loadLivelineAdapter();

  assert.deepEqual(proposalLivelinePlaybackOptions(true), {
    lerpSpeed: 0.08,
    paused: false,
    pulse: true,
  });
  assert.deepEqual(proposalLivelinePlaybackOptions(false), {
    lerpSpeed: 0.75,
    paused: true,
    pulse: false,
  });
  assert.ok(proposalLivelinePlaybackOptions(false).lerpSpeed <= 0.8);
});
