import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelayHandler } from '../api/relay.js';
import {
  createTradingHandler,
  safeErrorText,
} from '../api/beta/trading.js';
import { tradingError } from '../api/_lib/dflow-spot-order.js';

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

function request(view, body = {}) {
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.8',
    },
    method: 'POST',
    query: { view },
    url: `/api/beta/trading?view=${view}`,
  };
}

test('trading route returns the existing contract envelope and headers', async () => {
  const calls = [];
  const handler = createTradingHandler({
    service: {
      async spotOrder(body) {
        calls.push(body);
        return { cluster: 'solana:mainnet', token: body.token };
      },
      async spotSubmit() {
        throw new Error('not expected');
      },
    },
  });
  const response = responseRecorder();
  const body = { amount: '1', side: 'buy', token: 'solo' };

  await handler(request('spot-order', body), response);

  assert.deepEqual(calls, [body]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.data.token, 'solo');
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.equal(response.headers['x-01r-contract'], 'trading.spot-order.beta1');
  assert.equal(response.headers['x-01r-surface'], 'beta');
  assert.equal(response.headers['x-ratelimit-limit'], '60');
});

test('trading route exposes zero-fee decision attribution through the typed contract', async () => {
  const calls = [];
  const handler = createTradingHandler({
    service: {
      async decisionAttest(body) {
        calls.push(body);
        return {
          authority: 'authority',
          cluster: 'solana:mainnet',
          feeBps: 0,
          transaction: 'attributed',
        };
      },
    },
  });
  const response = responseRecorder();
  const body = { transaction: 'unsigned' };

  await handler(request('decision-attest', body), response);

  assert.deepEqual(calls, [body]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.feeBps, 0);
  assert.equal(response.headers['x-01r-contract'], 'trading.decision-attest.beta1');
  assert.equal(response.headers['x-01r-surface'], 'beta');
  assert.equal(response.headers['x-ratelimit-limit'], '30');
});

test('trading route rejects unknown query fields and non-JSON content', async () => {
  const handler = createTradingHandler({
    service: {
      async spotOrder() {
        throw new Error('not expected');
      },
    },
  });
  const unknownResponse = responseRecorder();
  await handler({
    ...request('spot-order'),
    query: { debug: '1', view: 'spot-order' },
    url: '/api/beta/trading?view=spot-order&debug=1',
  }, unknownResponse);
  assert.equal(unknownResponse.statusCode, 400);
  assert.equal(unknownResponse.body.code, 'BAD_REQUEST');

  const mediaResponse = responseRecorder();
  await handler({
    ...request('spot-order'),
    headers: { 'content-type': 'text/plain' },
  }, mediaResponse);
  assert.equal(mediaResponse.statusCode, 415);
  assert.equal(mediaResponse.body.code, 'UNSUPPORTED_MEDIA_TYPE');
});

test('trading route preserves guarded service errors and hides unexpected failures', async () => {
  const logs = [];
  const logger = {
    error(...args) {
      logs.push(args);
    },
  };
  const guarded = createTradingHandler({
    logger,
    service: {
      async spotOrder() {
        throw tradingError(
          'Ownership trading is awaiting a DFlow API key',
          'TRADING_NOT_CONFIGURED',
          503,
        );
      },
    },
  });
  const guardedResponse = responseRecorder();
  await guarded(request('spot-order'), guardedResponse);
  assert.equal(guardedResponse.statusCode, 503);
  assert.equal(guardedResponse.body.code, 'TRADING_NOT_CONFIGURED');
  assert.match(guardedResponse.body.error, /DFlow API key/);
  assert.equal(guardedResponse.headers['x-navgator-degraded'], 'true');

  const unexpected = createTradingHandler({
    logger,
    service: {
      async spotOrder() {
        const error = new Error(
          'RPC failed https://mainnet.helius-rpc.com/?api-key=must-not-log',
        );
        error.cause = new Error(
          'nested https://mainnet.helius-rpc.com/?api-key=nested-secret',
        );
        throw error;
      },
    },
  });
  const unexpectedResponse = responseRecorder();
  await unexpected(request('spot-order'), unexpectedResponse);
  assert.equal(unexpectedResponse.statusCode, 500);
  assert.equal(unexpectedResponse.body.error, 'Ownership trading is temporarily unavailable');
  assert.doesNotMatch(JSON.stringify(unexpectedResponse.body), /must-not-log/);
  assert.match(JSON.stringify(logs), /\[redacted-url\]/);
  assert.doesNotMatch(JSON.stringify(logs), /must-not-log/);
  assert.doesNotMatch(JSON.stringify(logs), /nested-secret/);
});

test('server diagnostics redact API keys before logging', () => {
  assert.equal(
    safeErrorText(
      'failed https://mainnet.helius-rpc.com/?api-key=helius-secret&mode=test',
    ),
    'failed [redacted-url]',
  );
});

test('Vercel wildcard relay dispatches trading locally and keeps data on NAVgator', async () => {
  const calls = [];
  const handler = createRelayHandler({
    async tradingHandler(req, res) {
      calls.push(['trading', req.url, req.query]);
      res.status(204).end();
    },
    async relayApiRequest(req, res) {
      calls.push(['relay', req.url]);
      res.status(204).end();
    },
  });

  await handler({
    method: 'POST',
    query: { relayPath: 'beta/trading', view: 'spot-order' },
    url: '/api/relay?relayPath=beta%2Ftrading&view=spot-order',
  }, responseRecorder());
  await handler({
    method: 'GET',
    query: { relayPath: 'current-nav', token: 'solo' },
    url: '/api/relay?relayPath=current-nav&token=solo',
  }, responseRecorder());

  assert.deepEqual(calls, [
    [
      'trading',
      '/api/beta/trading?view=spot-order',
      { view: 'spot-order' },
    ],
    ['relay', '/api/relay?relayPath=current-nav&token=solo'],
  ]);
});
