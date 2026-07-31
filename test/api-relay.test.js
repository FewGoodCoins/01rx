import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeUpstreamOrigin,
  relayedApiRequestUrl,
  relayApiRequest,
  upstreamApiUrl,
} from '../api/[...path].js';

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

test('API relay forwards NAVgator POST payloads without browser credentials', async () => {
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
});

test('API relay upgrades empty proposal history server-side without retaining the upstream ETag', async () => {
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
          source: { provider: 'NAVgator checked-in legacy history' },
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
    async zeroOneFetchImpl() {
      return new Response(JSON.stringify({
        data: {
          prices: [{
            timestamp: '2026-07-31T19:17:00.000Z',
            spotPrice: '0.041',
            approvedPrice: '0.044',
            rejectedPrice: '0.038',
          }],
        },
      }), { status: 200 });
    },
  });

  const payload = JSON.parse(response.body.toString());
  assert.equal(payload.data.source.provider, '01Resolved');
  assert.equal(payload.data.series.length, 1);
  assert.equal(response.headers.etag, undefined);
});

test('API relay rejects methods outside the public read and execution contract', async () => {
  const response = responseRecorder();
  await relayApiRequest({ method: 'DELETE', url: '/api/token' }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET, HEAD, OPTIONS, POST');
});
