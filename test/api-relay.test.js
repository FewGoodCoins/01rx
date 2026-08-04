import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeUpstreamOrigin,
  readBoundedResponse,
  relayedApiRequestUrl,
  relayApiRequest,
  upstreamApiUrl,
} from '../api/[...path].js';
import {
  MAX_CHART_RESPONSE_BYTES,
  MAX_PRIVATE_RESPONSE_BYTES,
  PRIVATE_NO_STORE,
  PUBLIC_CONFIG_CACHE,
  PUBLIC_HISTORY_CACHE,
  PUBLIC_LIVE_CACHE,
  methodAllowed,
  relayRoutePolicy,
} from '../api/_lib/relay-policy.js';

function responseRecorder() {
  return {
    body: null,
    headers: {},
    statusCode: null,
    end(value = null) {
      this.body = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    removeHeader(name) {
      delete this.headers[String(name).toLowerCase()];
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
  };
}

test('API relay accepts only a credential-free HTTPS upstream origin', () => {
  assert.equal(
    normalizeUpstreamOrigin('https://api.navgator.xyz/'),
    'https://api.navgator.xyz',
  );
  assert.equal(normalizeUpstreamOrigin('http://api.navgator.xyz'), '');
  assert.equal(normalizeUpstreamOrigin('https://user:pass@api.navgator.xyz'), '');
  assert.equal(normalizeUpstreamOrigin('https://api.navgator.xyz/private'), '');
});

test('API relay preserves only the incoming API path and query', () => {
  assert.equal(
    upstreamApiUrl(
      '/api/beta/trading?view=spot-order',
      'https://api.navgator.xyz',
    ).href,
    'https://api.navgator.xyz/api/beta/trading?view=spot-order',
  );
  assert.throws(
    () => upstreamApiUrl('/admin', 'https://api.navgator.xyz'),
    /Only \/api routes/,
  );
});

test('API relay restores a wildcard path rewritten through the fixed Vercel function', () => {
  assert.equal(
    relayedApiRequestUrl({
      url: '/api/relay?relayPath=v1%2Ffutarchy&view=proposals',
      query: {
        relayPath: 'v1/futarchy',
        view: 'proposals',
      },
    }),
    '/api/v1/futarchy?view=proposals',
  );
  assert.equal(
    relayedApiRequestUrl({
      url: '/api/relay?relayPath=beta%2Ftrading&view=spot-order',
      query: {
        relayPath: 'beta/trading',
        view: 'spot-order',
      },
    }),
    '/api/beta/trading?view=spot-order',
  );
});

test('API relay policy allowlists shipped paths, methods, and cache classes', () => {
  assert.equal(relayRoutePolicy('/api/current-nav').cacheControl, PUBLIC_LIVE_CACHE);
  assert.equal(relayRoutePolicy('/api/current').cacheControl, PUBLIC_LIVE_CACHE);
  assert.equal(relayRoutePolicy('/api/historic-nav').cacheControl, PUBLIC_HISTORY_CACHE);
  assert.equal(relayRoutePolicy('/api/home-bootstrap').cacheControl, PUBLIC_LIVE_CACHE);
  assert.equal(
    relayRoutePolicy('/api/beta/futarchy?view=positions&owner=wallet').cacheControl,
    PRIVATE_NO_STORE,
  );
  assert.equal(
    relayRoutePolicy('/api/beta/futarchy?view=solana-rpc').maxResponseBytes,
    MAX_PRIVATE_RESPONSE_BYTES,
  );
  assert.equal(
    relayRoutePolicy('/api/v1/futarchy?view=proposal-history&proposal=valid')
      .maxResponseBytes,
    MAX_CHART_RESPONSE_BYTES,
  );
  assert.equal(
    relayRoutePolicy('/api/projects/umbra/treasury').cacheControl,
    PUBLIC_LIVE_CACHE,
  );
  assert.equal(
    relayRoutePolicy('/api/projects/umbra').cacheControl,
    PUBLIC_CONFIG_CACHE,
  );
  assert.equal(relayRoutePolicy('/api/tokens-list').cacheControl, PUBLIC_CONFIG_CACHE);
  assert.equal(relayRoutePolicy('/api/projects/../admin'), null);
  assert.equal(relayRoutePolicy('/api/unknown-future-route'), null);
  assert.equal(relayRoutePolicy('/api/v1/futarchy?view=unknown'), null);
  assert.equal(relayRoutePolicy('/api/v1/futarchy?view=proposals&view=active-markets'), null);
  assert.equal(methodAllowed(relayRoutePolicy('/api/current-nav'), 'GET'), true);
  assert.equal(methodAllowed(relayRoutePolicy('/api/current-nav'), 'POST'), false);
  assert.equal(
    methodAllowed(relayRoutePolicy('/api/beta/futarchy?view=solana-rpc'), 'POST'),
    true,
  );
});

test('API relay forwards configured-upstream POST payloads without browser credentials', async () => {
  const calls = [];
  const request = {
    method: 'POST',
    url: '/api/beta/futarchy?view=solana-rpc',
    headers: {
      accept: 'application/json',
      authorization: 'Bearer must-not-forward',
      cookie: 'session=must-not-forward',
      'content-type': 'application/json',
    },
    body: {
      id: 1,
      jsonrpc: '2.0',
      method: 'getBalance',
      params: ['11111111111111111111111111111111'],
    },
  };
  const response = responseRecorder();

  await relayApiRequest(request, response, {
    upstreamOrigin: 'https://api.navgator.xyz',
    async fetchImpl(url, options) {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'cache-control': 'private, no-store',
          'content-type': 'application/json',
          'x-01r-contract': 'futarchy.solana-rpc.beta1',
        },
      });
    },
  });

  assert.equal(calls[0].url, 'https://api.navgator.xyz/api/beta/futarchy?view=solana-rpc');
  assert.equal(calls[0].options.headers.get('authorization'), null);
  assert.equal(calls[0].options.headers.get('cookie'), null);
  assert.deepEqual(JSON.parse(calls[0].options.body), request.body);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.equal(response.headers['x-01r-contract'], 'futarchy.solana-rpc.beta1');
  assert.deepEqual(JSON.parse(response.body.toString()), { ok: true });
});

test('API relay forwards the restored wildcard path without its internal routing query', async () => {
  const calls = [];
  const response = responseRecorder();
  await relayApiRequest({
    method: 'GET',
    url: '/api/relay?relayPath=v1%2Ffutarchy&view=proposals',
    query: {
      relayPath: 'v1/futarchy',
      view: 'proposals',
    },
    headers: {
      accept: 'application/json',
    },
  }, response, {
    upstreamOrigin: 'https://api.navgator.xyz',
    async fetchImpl(url) {
      calls.push(String(url));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  });

  assert.deepEqual(calls, [
    'https://api.navgator.xyz/api/v1/futarchy?view=proposals',
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], PUBLIC_LIVE_CACHE);
});

test('API relay never replaces an explicit upstream response with a second data provider', async () => {
  const proposal = '8sysa3XPrvKPmUA4qoZCn9h4vp7Mb45Ynezg542nui8Q';
  const response = responseRecorder();
  await relayApiRequest({
    method: 'GET',
    url: `/api/v1/futarchy?view=proposal-history&proposal=${proposal}&interval=15m`,
    headers: { accept: 'application/json' },
  }, response, {
    env: { ONE_RESOLVED_API_KEY: 'server-secret' },
    upstreamOrigin: 'https://api.navgator.xyz',
    async fetchImpl() {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          proposalId: proposal,
          source: { provider: 'configured upstream history' },
          degraded: { active: false, services: [], issues: [] },
          series: [],
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          etag: 'upstream-empty-history',
        },
      });
    },
  });

  const payload = JSON.parse(response.body.toString());
  assert.equal(payload.data.source.provider, 'configured upstream history');
  assert.equal(payload.data.series.length, 0);
  assert.equal(response.headers.etag, 'upstream-empty-history');
  assert.equal(response.headers['cache-control'], PUBLIC_HISTORY_CACHE);
});

test('API relay denies unknown paths, unknown views, and route-method mismatches before fetch', async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response('{}');
  };
  const cases = [
    {
      request: { method: 'GET', url: '/api/admin' },
      status: 404,
      error: 'API route not available',
    },
    {
      request: { method: 'GET', url: '/api/beta/futarchy?view=unknown' },
      status: 404,
      error: 'API route not available',
    },
    {
      request: { method: 'POST', url: '/api/current-nav' },
      status: 405,
      error: 'Method not allowed',
      allow: 'GET, HEAD',
    },
    {
      request: { method: 'GET', url: '/api/snapshot-refresh?token=solo' },
      status: 405,
      error: 'Method not allowed',
      allow: 'POST',
    },
  ];

  for (const item of cases) {
    const response = responseRecorder();
    await relayApiRequest(item.request, response, {
      fetchImpl,
      upstreamOrigin: 'https://api.navgator.xyz',
    });
    assert.equal(response.statusCode, item.status);
    assert.equal(response.body.error, item.error);
    assert.equal(response.headers['cache-control'], PRIVATE_NO_STORE);
    if (item.allow) assert.equal(response.headers.allow, item.allow);
  }
  assert.equal(fetchCalls, 0);
});

test('API relay overrides upstream cache policy for public, private, and failed reads', async () => {
  const cases = [
    {
      url: '/api/current-nav?token=solo',
      expected: PUBLIC_LIVE_CACHE,
    },
    {
      url: '/api/home-bootstrap?cacheOnly=1',
      expected: PUBLIC_LIVE_CACHE,
    },
    {
      url: '/api/beta/futarchy?view=positions&owner=wallet&proposal=proposal',
      expected: PRIVATE_NO_STORE,
    },
    {
      url: '/api/current-nav?token=solo',
      expected: PRIVATE_NO_STORE,
      status: 503,
    },
  ];

  for (const item of cases) {
    const response = responseRecorder();
    await relayApiRequest({ method: 'GET', url: item.url }, response, {
      upstreamOrigin: 'https://api.navgator.xyz',
      async fetchImpl() {
        return new Response('{}', {
          status: item.status || 200,
          headers: {
            'cache-control': 'public, max-age=86400',
            etag: 'upstream-tag',
            ...item.headers,
          },
        });
      },
    });
    assert.equal(response.headers['cache-control'], item.expected);
    if (item.expected === PRIVATE_NO_STORE) {
      assert.equal(response.headers.etag, undefined);
    }
    if ((item.status || 200) >= 500) {
      assert.deepEqual(JSON.parse(response.body.toString()), {
        ok: false,
        code: 'UPSTREAM_UNAVAILABLE',
        error: 'Upstream service is temporarily unavailable',
      });
      assert.doesNotMatch(response.body.toString(), /upstream-tag/);
    }
  }
});

test('bounded response reader rejects declared and streamed overflows', async () => {
  await assert.rejects(
    readBoundedResponse(new Response('small', {
      headers: { 'content-length': '100' },
    }), 10),
    error => error?.code === 'UPSTREAM_RESPONSE_TOO_LARGE',
  );
  await assert.rejects(
    readBoundedResponse(new Response('sixsix'), 5),
    error => error?.code === 'UPSTREAM_RESPONSE_TOO_LARGE',
  );
  assert.equal(
    (await readBoundedResponse(new Response('exact'), 5)).toString(),
    'exact',
  );
});

test('API relay rejects oversized request and response bodies before forwarding them', async () => {
  let fetchCalls = 0;
  const oversizedRequestResponse = responseRecorder();
  await relayApiRequest({
    method: 'POST',
    url: '/api/snapshot-refresh?token=solo',
    body: Buffer.alloc(2 * 1024 * 1024 + 1),
  }, oversizedRequestResponse, {
    upstreamOrigin: 'https://api.navgator.xyz',
    async fetchImpl() {
      fetchCalls += 1;
      return new Response('{}');
    },
  });
  assert.equal(oversizedRequestResponse.statusCode, 413);
  assert.equal(oversizedRequestResponse.body.error, 'Request body is too large');
  assert.equal(fetchCalls, 0);

  const oversizedResponse = responseRecorder();
  await relayApiRequest({
    method: 'GET',
    url: '/api/current-nav?token=solo',
  }, oversizedResponse, {
    upstreamOrigin: 'https://api.navgator.xyz',
    async fetchImpl() {
      fetchCalls += 1;
      return new Response('{}', {
        headers: { 'content-length': String(8 * 1024 * 1024 + 1) },
      });
    },
  });
  assert.equal(oversizedResponse.statusCode, 502);
  assert.equal(oversizedResponse.body.error, 'Upstream response is too large');
  assert.equal(oversizedResponse.headers['cache-control'], PRIVATE_NO_STORE);
  assert.equal(fetchCalls, 1);
});

test('API relay HEAD responses apply policy headers without reading a body', async () => {
  const response = responseRecorder();
  await relayApiRequest({ method: 'HEAD', url: '/api/current-nav' }, response, {
    upstreamOrigin: 'https://api.navgator.xyz',
    async fetchImpl(_url, options) {
      assert.equal(options.method, 'HEAD');
      return new Response(null, {
        status: 200,
        headers: { 'cache-control': 'private, no-store' },
      });
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers['cache-control'], PUBLIC_LIVE_CACHE);
});

test('API relay rejects redirects and timeouts without exposing upstream details', async () => {
  const redirectResponse = responseRecorder();
  await relayApiRequest({ method: 'GET', url: '/api/current-nav' }, redirectResponse, {
    upstreamOrigin: 'https://api.navgator.xyz',
    async fetchImpl() {
      return new Response('redirect', {
        status: 302,
        headers: { location: 'https://attacker.invalid/private' },
      });
    },
  });
  assert.equal(redirectResponse.statusCode, 502);
  assert.equal(redirectResponse.body.error, 'Upstream service is temporarily unavailable');
  assert.equal(redirectResponse.headers.location, undefined);

  const timeoutResponse = responseRecorder();
  await relayApiRequest({ method: 'GET', url: '/api/current-nav' }, timeoutResponse, {
    upstreamOrigin: 'https://api.navgator.xyz',
    timeoutMs: 5,
    fetchImpl(_url, { signal }) {
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
  });
  assert.equal(timeoutResponse.statusCode, 504);
  assert.equal(timeoutResponse.body.error, 'Upstream service timed out');
  assert.equal(timeoutResponse.headers['cache-control'], PRIVATE_NO_STORE);
});

test('API relay rejects methods outside the public read and execution contract', async () => {
  const response = responseRecorder();
  await relayApiRequest({ method: 'DELETE', url: '/api/token' }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET, HEAD, OPTIONS, POST');
});

test('API relay exposes an explicit 01Resolved coverage gap without an upstream origin', async () => {
  const response = responseRecorder();
  await relayApiRequest({ method: 'GET', url: '/api/historic-nav?token=solo' }, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    ok: false,
    code: 'DATA_NOT_AVAILABLE_FROM_01RESOLVED',
    error: 'This data is not available from 01Resolved yet',
    missingPath: '/api/historic-nav',
  });
  assert.equal(response.headers['cache-control'], PRIVATE_NO_STORE);
});
