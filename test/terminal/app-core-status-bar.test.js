const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const appCoreSource = fs.readFileSync('src/legacy/app-core.js', 'utf8');

function extractStatusBarInitializer() {
  const start = appCoreSource.indexOf('(function initSharedStatusBar()');
  assert.notEqual(start, -1, 'shared status-bar initializer exists');
  const braceStart = appCoreSource.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < appCoreSource.length; index += 1) {
    if (appCoreSource[index] === '{') depth += 1;
    if (appCoreSource[index] === '}') depth -= 1;
    if (depth !== 0) continue;
    const end = appCoreSource.indexOf(');', index);
    assert.notEqual(end, -1, 'shared status-bar initializer closes');
    return appCoreSource.slice(start, end + 2);
  }
  throw new Error('Could not extract shared status-bar initializer');
}

function createStatusBarSandbox(elements = new Map()) {
  const discoveryCalls = [];
  const intervalCalls = [];
  const tickerCalls = [];
  const storageWrites = [];
  const sandbox = {
    API_BASE: 'https://01r.test',
    Date,
    TOKENS: {},
    _hasToken: true,
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      },
    },
    discoverTokens() {
      discoveryCalls.push(true);
      return Promise.resolve({ preview: { preview: true }, solo: { preview: false } });
    },
    getHomeBootstrap() {
      throw new Error('token routes do not request the home bootstrap');
    },
    isFinite,
    localStorage: {
      getItem() {
        return null;
      },
      setItem(key, value) {
        storageWrites.push([key, value]);
      },
    },
    setInterval(callback, delay) {
      intervalCalls.push([callback, delay]);
      return intervalCalls.length;
    },
    window: {},
    _apiJson(url) {
      tickerCalls.push(url);
      return Promise.resolve({ btc: 100, sol: 50, zec: 25 });
    },
  };
  return {
    discoveryCalls,
    intervalCalls,
    sandbox,
    storageWrites,
    tickerCalls,
  };
}

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
}

test('shared status bar does no work when the page has no visible consumers', async () => {
  const context = createStatusBarSandbox();

  vm.runInNewContext(extractStatusBarInitializer(), context.sandbox);
  await settlePromises();

  assert.equal(context.sandbox.window._statusBarReady, undefined);
  assert.equal(context.discoveryCalls.length, 0);
  assert.deepEqual(context.tickerCalls, []);
  assert.deepEqual(context.intervalCalls, []);
  assert.deepEqual(context.storageWrites, []);
});

test('shared status bar retains clocks, discovery, and ticker polling when targets exist', async () => {
  const elements = new Map([
    ['bb-clock', { textContent: '' }],
    ['bb-token-count', { textContent: '—' }],
    ['bb-btc-price', { textContent: '—' }],
    ['bb-sol-price', { textContent: '—' }],
    ['bb-zec-price', { textContent: '—' }],
  ]);
  const context = createStatusBarSandbox(elements);

  vm.runInNewContext(extractStatusBarInitializer(), context.sandbox);
  await settlePromises();

  assert.equal(context.sandbox.window._statusBarReady, true);
  assert.equal(context.discoveryCalls.length, 1);
  assert.deepEqual(context.tickerCalls, ['https://01r.test/api/market-tickers']);
  assert.deepEqual(context.intervalCalls.map(([, delay]) => delay), [1_000, 60_000]);
  assert.match(elements.get('bb-clock').textContent, /^\d{2}:\d{2}:\d{2} UTC$/);
  assert.equal(elements.get('bb-token-count').textContent, '1');
  assert.equal(elements.get('bb-btc-price').textContent, '$100.00');
  assert.equal(elements.get('bb-sol-price').textContent, '$50.00');
  assert.equal(elements.get('bb-zec-price').textContent, '$25.00');
  assert.equal(context.storageWrites.length, 1);
});
