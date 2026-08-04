const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const coreRoot = path.resolve('src/core');

function importCore(name) {
  return import(pathToFileURL(path.join(coreRoot, name)).href);
}

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values,
  };
}

function createRuntime(href, storage = createStorage()) {
  return {
    URL,
    URLSearchParams,
    location: new URL(href),
    localStorage: storage,
  };
}

function createHealthDom() {
  const classes = new Set();
  const banner = {
    classList: {
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); },
      remove(name) { classes.delete(name); },
    },
    title: '',
  };
  const text = { textContent: '' };
  return {
    banner,
    classes,
    document: {
      getElementById(id) {
        if (id === 'backend-health-banner') return banner;
        if (id === 'backend-health-text') return text;
        return null;
      },
    },
    text,
  };
}

test('API base resolution preserves production, local, and explicit override precedence', async () => {
  const { resolveApiBase } = await importCore('api-client.js');

  const productionStorage = createStorage({ navgator_api_base: 'https://ignored.example' });
  assert.equal(
    resolveApiBase(createRuntime('https://example.com/token?api=https://ignored.example', productionStorage)),
    'https://example.com',
  );

  assert.equal(
    resolveApiBase(createRuntime('http://127.0.0.1:3000/')),
    'http://127.0.0.1:3001',
  );

  const explicitStorage = createStorage();
  assert.equal(
    resolveApiBase(createRuntime('http://localhost:4173/?dev&api=https://api.example/path', explicitStorage)),
    'http://localhost:4173',
  );
  assert.equal(explicitStorage.getItem('navgator_api_base'), null);
  assert.equal(explicitStorage.getItem('navgatorApiBase'), null);
});

test('API base resolution removes a stale same-origin local override', async () => {
  const { resolveApiBase } = await importCore('api-client.js');
  const storage = createStorage({
    navgator_api_base: 'http://localhost:4173',
    navgatorApiBase: 'http://localhost:4173',
  });

  assert.equal(resolveApiBase(createRuntime('http://localhost:4173/', storage)), 'http://localhost:4173');
  assert.equal(storage.getItem('navgator_api_base'), null);
  assert.equal(storage.getItem('navgatorApiBase'), null);
});

test('Vite preview keeps public reads and guarded trading on its same-origin handlers', async () => {
  const { resolveApiBase, resolveFutarchyApiBases } = await importCore('api-client.js');
  const runtime = createRuntime('http://127.0.0.1:4173/?view=markets');
  const baseUrl = resolveApiBase(runtime);

  assert.equal(baseUrl, 'http://127.0.0.1:4173');
  assert.deepEqual(resolveFutarchyApiBases(runtime, baseUrl), {
    readBaseUrl: 'http://127.0.0.1:4173',
    executionBaseUrl: 'http://127.0.0.1:4173',
  });

  const productionOverrideStorage = createStorage({
    navgator_api_base: 'https://navgator.xyz',
    navgatorApiBase: 'https://navgator.xyz',
  });
  assert.equal(
    resolveApiBase(createRuntime('http://127.0.0.1:4173/', productionOverrideStorage)),
    'http://127.0.0.1:4173',
  );
  assert.equal(productionOverrideStorage.getItem('navgator_api_base'), null);
  assert.equal(productionOverrideStorage.getItem('navgatorApiBase'), null);
});

test('futarchy API origins reject direct upstream and retired-provider configuration', async () => {
  const { resolveFutarchyApiBases } = await importCore('api-client.js');
  const runtime = createRuntime('https://navgator.xyz/terminal');

  assert.deepEqual(resolveFutarchyApiBases(runtime, 'https://navgator.xyz'), {
    readBaseUrl: 'https://01rx.vercel.app',
    executionBaseUrl: 'https://01rx.vercel.app',
  });

  runtime.NAVGATOR_CONFIG = {
    futarchyReadApiBase: 'https://api.01resolved.com/',
    futarchyExecutionApiBase: 'https://execution.01resolved.com',
  };
  assert.deepEqual(resolveFutarchyApiBases(runtime, 'https://navgator.xyz'), {
    readBaseUrl: 'https://01rx.vercel.app',
    executionBaseUrl: 'https://01rx.vercel.app',
  });

  runtime.NAVGATOR_CONFIG = {
    futarchyReadApiBase: 'http://insecure.example',
    futarchyExecutionApiBase: 'https://user:secret@example.com',
  };
  assert.deepEqual(resolveFutarchyApiBases(runtime, 'https://navgator.xyz'), {
    readBaseUrl: 'https://01rx.vercel.app',
    executionBaseUrl: 'https://01rx.vercel.app',
  });
});

test('local preview uses production governance reads while execution stays local', async () => {
  const { resolveApiBase, resolveFutarchyApiBases } = await importCore('api-client.js');
  const runtime = createRuntime('http://127.0.0.1:3000/?view=markets');
  const baseUrl = resolveApiBase(runtime);

  assert.equal(baseUrl, 'http://127.0.0.1:3001');
  assert.deepEqual(resolveFutarchyApiBases(runtime, baseUrl), {
    readBaseUrl: 'https://01rx.vercel.app',
    executionBaseUrl: 'http://127.0.0.1:3001',
  });

  runtime.NAVGATOR_CONFIG = {
    futarchyReadApiBase: 'http://127.0.0.1:3001',
  };
  assert.deepEqual(resolveFutarchyApiBases(runtime, baseUrl), {
    readBaseUrl: 'http://127.0.0.1:3001',
    executionBaseUrl: 'http://127.0.0.1:3001',
  });
});

test('response normalization unwraps only successful data envelopes', async () => {
  const { normalizeDegradedServices, unwrapApiEnvelope } = await importCore('api-normalization.js');
  const data = { nav: 0.42 };

  assert.equal(unwrapApiEnvelope({ ok: true, data }), data);
  assert.deepEqual(unwrapApiEnvelope({ ok: false, data }), { ok: false, data });
  assert.deepEqual(unwrapApiEnvelope({ ok: true }), { ok: true });
  assert.equal(unwrapApiEnvelope(null), null);
  assert.deepEqual(normalizeDegradedServices(' RPC, Cache, rpc '), ['rpc', 'cache', 'rpc']);
});

test('API fetch preserves request options, timeout handling, health capture, and HTTP errors', async () => {
  const { createApiClient } = await importCore('api-client.js');
  const calls = [];
  const cleared = [];
  const captured = [];
  const okResponse = { ok: true, status: 200, statusText: 'OK' };
  const client = createApiClient({
    AbortController,
    captureBackendHealth(response) { captured.push(response); },
    clearTimeout(id) { cleared.push(id); },
    fetch(url, options) {
      calls.push({ options, url });
      return Promise.resolve(okResponse);
    },
    setTimeout(callback, ms) {
      calls.push({ callback, ms });
      return 42;
    },
  });

  const oldSignal = new AbortController().signal;
  assert.equal(await client.fetch('/api/current-nav', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: oldSignal,
    timeoutMs: 2500,
  }), okResponse);
  const requestCall = calls.find((call) => call.url);
  const timerCall = calls.find((call) => call.callback);
  assert.equal(requestCall.url, '/api/current-nav');
  assert.equal(requestCall.options.cache, 'no-store');
  assert.deepEqual(requestCall.options.headers, { Accept: 'application/json' });
  assert.notEqual(requestCall.options.signal, oldSignal);
  assert.equal(requestCall.options.timeoutMs, undefined);
  assert.equal(timerCall.ms, 2500);
  assert.deepEqual(captured, [okResponse]);
  assert.deepEqual(cleared, [42]);

  const failing = createApiClient({
    AbortController: undefined,
    clearTimeout() {},
    fetch: async () => ({ ok: false, status: 503, statusText: 'Unavailable' }),
    setTimeout() {},
  });
  await assert.rejects(
    failing.fetch('/api/health'),
    (error) => error.status === 503 && error.message === 'API 503: Unavailable',
  );
});

test('API fetch converts AbortError into the legacy timeout contract', async () => {
  const { createApiClient } = await importCore('api-client.js');
  let timeoutCallback = null;
  const client = createApiClient({
    AbortController,
    clearTimeout() {},
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
    setTimeout(callback) {
      timeoutCallback = callback;
      return 9;
    },
  });

  const request = client.fetch('/api/slow', { timeoutMs: 25 });
  timeoutCallback();
  await assert.rejects(request, (error) => (
    error.status === 0
      && error.timeout === true
      && error.message === 'API timeout after 25ms: /api/slow'
  ));
});

test('API fetch forwards controller cancellation without changing timeout errors', async () => {
  const { createApiClient } = await importCore('api-client.js');
  const cancellation = new AbortController();
  let receivedOptions = null;
  const client = createApiClient({
    AbortController,
    clearTimeout() {},
    fetch(url, options) {
      receivedOptions = options;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
    setTimeout() { return 11; },
  });

  const request = client.fetch('/api/current-nav?token=solo', {
    cache: 'no-store',
    cancelSignal: cancellation.signal,
  });
  assert.equal(receivedOptions.cache, 'no-store');
  assert.equal(receivedOptions.cancelSignal, undefined);
  cancellation.abort();
  await assert.rejects(request, (error) => (
    error.name === 'AbortError'
      && error.cancelled === true
      && error.status === 0
      && error.message === 'API request cancelled: /api/current-nav?token=solo'
  ));
});

test('API JSON cancellation remains active while a response body is parsing', async () => {
  const { createApiClient } = await importCore('api-client.js');
  const cancellation = new AbortController();
  let resolveBody;
  const body = new Promise((resolve) => { resolveBody = resolve; });
  const client = createApiClient({
    AbortController,
    clearTimeout() {},
    fetch: async () => ({
      json: () => body,
      ok: true,
      status: 200,
      statusText: 'OK',
    }),
    setTimeout() { return 12; },
  });

  const request = client.json('/api/token-bootstrap?token=solo', {
    cancelSignal: cancellation.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  cancellation.abort();
  resolveBody({ ok: true, data: { token: 'solo' } });

  await assert.rejects(request, (error) => (
    error.name === 'AbortError'
      && error.cancelled === true
      && error.message === 'API request cancelled: /api/token-bootstrap?token=solo'
  ));
});

test('API JSON parses responses and preserves envelope compatibility', async () => {
  const { createApiClient } = await importCore('api-client.js');
  const client = createApiClient({
    AbortController: undefined,
    clearTimeout() {},
    fetch: async () => ({
      json: async () => ({ ok: true, data: { token: 'meta' } }),
      ok: true,
      status: 200,
      statusText: 'OK',
    }),
    setTimeout() {},
  });

  assert.deepEqual(await client.json('/api/list-tokens'), { token: 'meta' });
});

test('degraded response headers drive the same dev-only banner and five-minute expiry', async () => {
  const { createBackendHealthMonitor } = await importCore('api-client.js');
  const dom = createHealthDom();
  let now = 1_000_000;
  const monitor = createBackendHealthMonitor({
    document: dom.document,
    location: { search: '?dev' },
    now: () => now,
  });
  const response = {
    headers: new Headers({
      'X-NAVGATOR-Degraded': 'true',
      'X-NAVGATOR-Degraded-Services': 'RPC, Cache',
    }),
  };

  assert.equal(monitor.captureBackendHealth(response), response);
  assert.equal(dom.text.textContent, 'Backend degraded');
  assert.equal(dom.banner.title, 'Degraded services: cache, rpc');
  assert.equal(dom.classes.has('on'), true);
  assert.deepEqual(Object.keys(monitor.degradedServices).sort(), ['cache', 'rpc']);

  now += 5 * 60 * 1000;
  monitor.renderBackendHealth();
  assert.equal(dom.classes.has('on'), false);
  assert.equal(dom.banner.title, '');
  assert.deepEqual(monitor.degradedServices, {});
});

test('backend degradation banner remains hidden outside dev mode', async () => {
  const { createBackendHealthMonitor } = await importCore('api-client.js');
  const dom = createHealthDom();
  dom.classes.add('on');
  const monitor = createBackendHealthMonitor({
    degradedServices: { rpc: Date.now() },
    document: dom.document,
    location: { search: '' },
  });

  monitor.renderBackendHealth();
  assert.equal(dom.classes.has('on'), false);
});

test('default degraded-service clock remains dynamic after monitor construction', async () => {
  const { createBackendHealthMonitor } = await importCore('api-client.js');
  const dom = createHealthDom();
  const originalDateNow = Date.now;
  const monitor = createBackendHealthMonitor({
    document: dom.document,
    location: { search: '?dev' },
  });

  try {
    Date.now = () => 20_000;
    monitor.captureBackendHealth({
      headers: new Headers({
        'X-NAVGATOR-Degraded': 'true',
        'X-NAVGATOR-Degraded-Services': 'rpc',
      }),
    });
    assert.equal(monitor.degradedServices.rpc, 20_000);

    Date.now = () => 20_000 + (5 * 60 * 1000);
    monitor.renderBackendHealth();
    assert.deepEqual(monitor.degradedServices, {});
    assert.equal(dom.classes.has('on'), false);
  } finally {
    Date.now = originalDateNow;
  }
});

test('browser installation exposes the module client and legacy facade delegates to it', async () => {
  const { installBrowserApi } = await importCore('api-client.js');
  const runtime = createRuntime('https://navgator.xyz/');
  runtime.AbortController = AbortController;
  runtime.clearTimeout = () => {};
  runtime.document = { getElementById: () => null };
  runtime.fetch = async () => ({ ok: true, status: 200, statusText: 'OK' });
  runtime.setTimeout = () => 1;

  const bridge = installBrowserApi(runtime);
  assert.equal(runtime.NAVGATOR.api, bridge);
  assert.equal(bridge.baseUrl, 'https://01rx.vercel.app');
  assert.equal(bridge.futarchyReadBaseUrl, 'https://01rx.vercel.app');
  assert.equal(bridge.futarchyExecutionBaseUrl, 'https://01rx.vercel.app');
  assert.equal(bridge.defaultTimeoutMs, 12000);
  assert.equal(typeof bridge.fetch, 'function');
  assert.equal(typeof bridge.json, 'function');
  assert.equal(typeof bridge.unwrapEnvelope, 'function');
  assert.equal(runtime.NAVGATOR.client.contractRelease, '2026-08-04');
  assert.equal(typeof runtime.NAVGATOR.client.trading.decisionAttest, 'function');
  assert.equal(
    runtime.NAVGATOR.client.futarchy.solanaRpcUrl(),
    'https://01rx.vercel.app/api/beta/futarchy?view=solana-rpc',
  );

  const facade = fs.readFileSync('src/legacy/app-core.js', 'utf8');
  const main = fs.readFileSync('src/main.js', 'utf8');
  assert.match(facade, /var API_BASE = _navgatorApi\.baseUrl;/);
  assert.match(facade, /function _apiFetch\(url, options\) \{ return _navgatorApi\.fetch\(url, options\); \}/);
  assert.match(facade, /function _apiJson\(url, options\) \{ return _navgatorApi\.json\(url, options\); \}/);
  assert.equal(facade.includes('return fetch(url, fetchOptions)'), false);
  assert.ok(main.indexOf('installBrowserApi(window);') < main.indexOf('bootLegacyApplication();'));
});
