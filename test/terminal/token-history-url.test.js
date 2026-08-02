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

function loadNavHistoryUrl() {
  const sandbox = {
    API_BASE: '',
    tokenKey: 'rngr',
    _normalizeHistoryResolution: value => value,
    _navHistoryNeedsDetailedRows: () => false,
  };
  vm.runInNewContext(extractLegacyFunction('_navHistoryUrl'), sandbox);
  return sandbox._navHistoryUrl;
}

test('historic NAV URL remains disabled for Ranger', () => {
  const navHistoryUrl = loadNavHistoryUrl();

  const url = navHistoryUrl('1D', 'rngr');

  assert.equal(url, '');
});

test('historic NAV URL remains disabled for the Ranger alias', () => {
  const navHistoryUrl = loadNavHistoryUrl();

  assert.equal(navHistoryUrl('1D', 'ranger'), '');
});
