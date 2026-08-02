import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FUTARCHY_LIKELIHOOD_DATASET_SCHEMA,
  buildFutarchyLikelihoodDataset,
  buildProposalLikelihoodDatasetEntry,
} from '../api/_lib/futarchy-likelihood-dataset.js';

const PROPOSAL = 'BbGa5nx6owLwJ9Wt9Pr3FHccpove9uSvNX4C59Andxf3';
const START = Date.parse('2026-01-01T00:00:00Z');

function at(minutes) {
  return new Date(START + (minutes * 60_000)).toISOString();
}

function historyRows() {
  return Array.from({ length: 11 }, (_, index) => ({
    timestamp: at(index * 10),
    observedAt: at(index * 10),
    underlyingPrice: 1,
    passPrice: 1 + (index / 100),
    failPrice: 1 - (index / 200),
    passTwap: 1 + (index / 200),
    failTwap: 1 - (index / 400),
  }));
}

function record(overrides = {}) {
  return {
    market: {
      token: 'umbra',
      proposal: {
        id: PROPOSAL,
        status: 'passed',
        createdAt: at(0),
        endsAt: at(100),
        thresholdBps: 300,
        version: 'v0.6',
      },
      source: { provider: '01Resolved decision-market index' },
    },
    history: {
      preTwap: at(0),
      series: historyRows(),
      source: { provider: '01Resolved' },
    },
    orders: {
      trades: [{
        branch: 'pass',
        side: 'buy',
        blockTime: at(10),
        volumeUsd: 100,
      }, {
        branch: 'pass',
        side: 'sell',
        blockTime: at(30),
        volumeUsd: 40,
      }, {
        branch: 'fail',
        side: 'buy',
        blockTime: at(80),
        volumeUsd: 1_000,
      }],
      pagination: { complete: true },
      source: { provider: '01Resolved observed proposal trades' },
    },
    chainMetadata: {
      proposalAddress: PROPOSAL,
      createdAt: at(0),
      endsAt: at(100),
      proposal: { isTeamSponsored: false },
      source: { provider: 'solana.rpc.getAccountInfo' },
    },
    ...overrides,
  };
}

test('dataset checkpoints exclude every price and trade observed in the future', () => {
  const entry = buildProposalLikelihoodDatasetEntry(record(), {
    checkpoints: [0.25, 0.5],
  });
  assert.equal(entry.quality.eligible, true);
  assert.equal(entry.observations.length, 2);
  assert.equal(entry.observations[0].sourceObservationAt, at(20));
  assert.equal(entry.observations[0].tradeCount, 1);
  assert.equal(entry.observations[0].quoteVolumeUsd, 100);
  assert.equal(entry.observations[1].tradeCount, 2);
  assert.equal(entry.observations[1].passSupportVolumeUsd, 100);
  assert.equal(entry.observations[1].failSupportVolumeUsd, 40);
  assert.equal('target' in entry.observations[0], false);

  const changedFuture = record();
  changedFuture.history.series.at(-1).passPrice = 999;
  changedFuture.orders.trades.at(-1).volumeUsd = 999_999;
  const changed = buildProposalLikelihoodDatasetEntry(changedFuture, {
    checkpoints: [0.25, 0.5],
  });
  assert.deepEqual(changed.observations, entry.observations);
});

test('missing historical threshold is disclosed and excludes a proposal from training', () => {
  const missingThreshold = record();
  missingThreshold.market.proposal.thresholdBps = null;
  const entry = buildProposalLikelihoodDatasetEntry(missingThreshold);
  assert.equal(entry.quality.eligible, false);
  assert.equal(entry.observations.every(row => row.decisionMarginPct === null), true);
  assert.ok(entry.quality.issues.some(row => row.code === 'MISSING_HISTORICAL_THRESHOLD'));
});

test('archive totals expose incomplete or inconsistent indexed trade history', () => {
  const inconsistent = record();
  inconsistent.market.metrics = {
    tradeCount: 100,
    volumeUsd: 10_000,
  };
  const entry = buildProposalLikelihoodDatasetEntry(inconsistent);
  assert.equal(entry.quality.eligible, false);
  assert.equal(entry.quality.reconciliation.archiveTradeCount, 100);
  assert.equal(entry.quality.reconciliation.indexedTradeCount, 3);
  assert.equal(entry.quality.reconciliation.tradeCountRatio, 0.03);
  assert.ok(entry.quality.issues.some(row => row.code === 'METRIC_RECONCILIATION_FAILED'));
});

test('dataset summary exposes class balance and source quality', () => {
  const failed = record();
  failed.market.proposal = {
    ...failed.market.proposal,
    id: 'CkEUCAooQi64UFhPFS5MWpZw6LQqjsDQBj3Z5uiXS1eN',
    status: 'failed',
    thresholdBps: null,
  };
  failed.chainMetadata = {
    ...failed.chainMetadata,
    proposalAddress: failed.market.proposal.id,
  };
  const dataset = buildFutarchyLikelihoodDataset({
    generatedAt: '2026-08-02T12:00:00Z',
    records: [record(), failed],
  });
  assert.equal(dataset.schemaVersion, FUTARCHY_LIKELIHOOD_DATASET_SCHEMA);
  assert.deepEqual(dataset.summary, {
    totalProposals: 2,
    passed: 1,
    failed: 1,
    eligible: 1,
    eligiblePassed: 1,
    eligibleFailed: 0,
    totalObservations: 8,
    eligibleObservations: 4,
    issueCounts: {
      MISSING_HISTORICAL_THRESHOLD: 1,
      INSUFFICIENT_CHECKPOINTS: 1,
    },
  });
  assert.ok(dataset.disclosures.some(value => value.includes('not itself constitute')));
});
