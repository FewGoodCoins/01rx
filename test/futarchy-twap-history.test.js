import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateOracleTwapRaw,
  selectBucketSignatures,
  twapSnapshotFromEvent,
} from '../api/_lib/futarchy-twap-history.js';

const DAO = 'CkEUCAooQi64UFhPFS5MWpZw6LQqjsDQBj3Z5uiXS1eN';

function oracle(aggregator, lastObservation) {
  return {
    aggregator: String(aggregator),
    lastUpdatedTimestamp: '140',
    createdAtTimestamp: '100',
    lastObservation: String(lastObservation),
    startDelaySeconds: 20,
  };
}

test('protocol TWAP calculation preserves the oracle start delay and final observation', () => {
  assert.equal(
    calculateOracleTwapRaw(oracle(20_000_000_000_000n, 2_000_000_000_000n), 150),
    1_333_333_333_333n,
  );
  assert.equal(calculateOracleTwapRaw(oracle(0n, 2n), 150), null);
  assert.equal(calculateOracleTwapRaw(oracle(20n, 2n), 120), null);
});

test('spot-swap events produce distinct PASS and FAIL protocol TWAP observations', () => {
  const event = {
    name: 'SpotSwapEvent',
    data: {
      dao: { toString: () => DAO },
      postAmmState: {
        state: {
          futarchy: {
            spot: { oracle: oracle(30_000_000_000_000n, 1_500_000_000_000n) },
            pass: { oracle: oracle(20_000_000_000_000n, 2_000_000_000_000n) },
            fail: { oracle: oracle(40_000_000_000_000n, 1_000_000_000_000n) },
          },
        },
      },
    },
  };
  const snapshot = twapSnapshotFromEvent(event, {
    daoAddress: DAO,
    observedAtSeconds: 150,
    baseDecimals: 6,
    quoteDecimals: 6,
  });
  assert.ok(Math.abs(snapshot.passTwap - 1.333333333333) < 1e-12);
  assert.ok(Math.abs(snapshot.failTwap - 1.666666666666) < 1e-12);
  assert.equal(twapSnapshotFromEvent(event, {
    daoAddress: '11111111111111111111111111111111',
    observedAtSeconds: 150,
    baseDecimals: 6,
    quoteDecimals: 6,
  }), null);
});

test('signature sampling keeps the latest exact observation in each chart bucket', () => {
  const rows = [{ signature: 'older', blockTime: 130, err: null }, {
    signature: 'latest', blockTime: 149, err: null,
  }, {
    signature: 'next', blockTime: 151, err: null,
  }, {
    signature: 'failed', blockTime: 160, err: { InstructionError: [0, 'Custom'] },
  }];
  assert.deepEqual(selectBucketSignatures(rows, {
    interval: '15m',
    from: '1970-01-01T00:02:00.000Z',
    to: '1970-01-01T00:20:00.000Z',
  }).map(row => row.signature), ['next']);
});
