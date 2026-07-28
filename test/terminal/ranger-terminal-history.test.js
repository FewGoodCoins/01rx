const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const legacySource = fs.readFileSync('src/legacy/token-page.js', 'utf8');

function extractLegacyFunction(name) {
  const start = legacySource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} remains available as a compatibility facade`);
  const braceStart = legacySource.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < legacySource.length; i += 1) {
    if (legacySource[i] === '{') depth += 1;
    if (legacySource[i] === '}') depth -= 1;
    if (depth === 0) return legacySource.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function loadSnapshotPruning(tokenKey, snapshotTime) {
  const sandbox = {
    CFG: { snapshotTime },
    tokenKey,
  };
  vm.runInNewContext([
    extractLegacyFunction('_getSnapshotCutoffSec'),
    extractLegacyFunction('_historyRowTime'),
    extractLegacyFunction('_pruneRowsToSnapshot'),
  ].join('\n'), sandbox);
  return sandbox;
}

test('Ranger keeps a finalized liquidation point after its last ordinary snapshot', () => {
  const march4 = Date.UTC(2026, 2, 4) / 1000;
  const march6 = Date.UTC(2026, 2, 6) / 1000;
  const runtime = loadSnapshotPruning('rngr', '2026-03-04T23:00:00Z');

  const rows = runtime._pruneRowsToSnapshot([
    { ts: march4, nav: 0.742227, spot: 0.731083 },
    { ts: march6, nav: 0.822318, spot: 0.822318 },
  ]);

  assert.equal(runtime._getSnapshotCutoffSec(), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { ts: march4, nav: 0.742227, spot: 0.731083 },
    { ts: march6, nav: 0.822318, spot: 0.822318 },
  ]);
});

test('active token histories retain the ordinary current-snapshot cutoff', () => {
  const march4 = Date.UTC(2026, 2, 4) / 1000;
  const march6 = Date.UTC(2026, 2, 6) / 1000;
  const runtime = loadSnapshotPruning('cred', '2026-03-04T23:00:00Z');

  const rows = runtime._pruneRowsToSnapshot([
    { ts: march4, nav: 0.4 },
    { ts: march6, nav: 0.41 },
  ]);

  assert.ok(runtime._getSnapshotCutoffSec() > march4);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{ ts: march4, nav: 0.4 }]);
});

test('a downgraded history response refreshes the active actual resolution', () => {
  const sandbox = {
    _chartTF: '1D',
    _fallbackTF: value => value,
    _getRecommendedNavResolution: () => '1D',
  };
  vm.runInNewContext(extractLegacyFunction('_navHistoryResponseCanActivate'), sandbox);

  assert.equal(sandbox._navHistoryResponseCanActivate('1W', '1D', '1D'), true);
  assert.equal(sandbox._navHistoryResponseCanActivate('1H', '1H', '1D'), false);
  assert.equal(sandbox._navHistoryResponseCanActivate('1D', '1D', '1D'), true);
});
