import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeUpstreamOrigin,
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

test('API relay forwards reviewed transaction payloads without browser credentials', async () => {
  const calls = [];
  const request = {
    method: 'POST',
    url: '/api/beta/trading?view=spot-submit',
    headers: {
      accept: 'application/json',
      authorization: 'Bearer must-not-forward',
      cookie: 'session=must-not-forward',
      'content-type': 'application/json',
    },
    body: {
      reviewToken: 'verified-proof',
      signedTransaction: 'signed-wire-bytes',
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
          'x-01r-contract': 'trading.spot-submit.beta1',
        },
      });
    },
  });

  assert.equal(calls[0].url, 'https://api.navgator.xyz/api/beta/trading?view=spot-submit');
  assert.equal(calls[0].options.headers.get('authorization'), null);
  assert.equal(calls[0].options.headers.get('cookie'), null);
  assert.deepEqual(JSON.parse(calls[0].options.body), request.body);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.equal(response.headers['x-01r-contract'], 'trading.spot-submit.beta1');
  assert.deepEqual(JSON.parse(response.body.toString()), { ok: true });
});

test('API relay rejects methods outside the public read and execution contract', async () => {
  const response = responseRecorder();
  await relayApiRequest({ method: 'DELETE', url: '/api/token' }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET, HEAD, OPTIONS, POST');
});
