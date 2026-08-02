import assert from 'node:assert/strict';
import test from 'node:test';
import { createFutarchyHandler } from '../api/_lib/futarchy-handler.js';

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

function serviceFixture(overrides = {}) {
  return {
    async activeMarkets() {
      return { markets: [{ proposal: { id: 'proposal' } }] };
    },
    async proposals(query) {
      return { proposals: [], query };
    },
    async proposalHistory(query) {
      return { proposalId: query.proposal, series: [] };
    },
    async marketData(query) {
      return { proposalId: query.proposal, books: {} };
    },
    async positions(query) {
      return { owner: query.owner, balances: [] };
    },
    async programIntegrity() {
      return { status: 'verified', canTransact: true, rpcSlot: 42 };
    },
    recurringConfig() {
      return { enabled: false, keeperReady: false, programId: null };
    },
    ...overrides,
  };
}

test('01RX futarchy handler serves stable reads locally with contract headers', async () => {
  const response = responseRecorder();
  const handler = createFutarchyHandler({
    service: serviceFixture(),
    now: () => Date.parse('2026-07-31T22:00:00Z'),
    rpcRelay: async payload => payload,
  });
  await handler({
    method: 'GET',
    url: '/api/v1/futarchy?view=active-markets',
    headers: {},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.data.markets.length, 1);
  assert.equal(response.headers['x-01r-contract'], 'futarchy.markets.v1');
  assert.equal(response.headers['x-01r-surface'], 'stable');
  assert.match(response.headers['cache-control'], /s-maxage=5/);
});

test('01RX futarchy handler validates methods, query fields, and required inputs', async () => {
  const handler = createFutarchyHandler({
    service: serviceFixture(),
    now: () => 1,
    rpcRelay: async payload => payload,
  });
  const cases = [
    {
      request: { method: 'POST', url: '/api/v1/futarchy?view=active-markets' },
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
    },
    {
      request: { method: 'GET', url: '/api/v1/futarchy?view=active-markets&secret=x' },
      status: 400,
      code: 'BAD_REQUEST',
    },
    {
      request: { method: 'GET', url: '/api/v1/futarchy?view=proposal-history' },
      status: 400,
      code: 'BAD_REQUEST',
    },
    {
      request: { method: 'GET', url: '/api/v1/futarchy?view=missing' },
      status: 404,
      code: 'NOT_FOUND',
    },
  ];
  for (const item of cases) {
    const response = responseRecorder();
    await handler({ headers: {}, ...item.request }, response);
    assert.equal(response.statusCode, item.status);
    assert.equal(response.body.code, item.code);
    assert.equal(response.headers['cache-control'], 'private, no-store');
  }
});

test('01RX futarchy handler forwards the reviewed market-data cursor', async () => {
  const calls = [];
  const handler = createFutarchyHandler({
    service: serviceFixture({
      async marketData(query) {
        calls.push(query);
        return { proposalId: query.proposal, recentTrades: [], pagination: {} };
      },
    }),
    now: () => 1,
    rpcRelay: async payload => payload,
  });
  const response = responseRecorder();
  await handler({
    method: 'GET',
    url: '/api/beta/futarchy?view=market-data&proposal=proposal&limit=100&cursor=next-page',
    headers: {},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    view: 'market-data',
    proposal: 'proposal',
    limit: '100',
    cursor: 'next-page',
  }]);
});

test('01RX futarchy handler keeps RPC POST bodies local and private', async () => {
  const calls = [];
  const handler = createFutarchyHandler({
    service: serviceFixture(),
    now: () => 2,
    async rpcRelay(payload) {
      calls.push(payload);
      return { jsonrpc: '2.0', id: payload.id, result: 99 };
    },
  });
  const response = responseRecorder();
  await handler({
    method: 'POST',
    url: '/api/beta/futarchy?view=solana-rpc',
    headers: { 'content-type': 'application/json' },
    body: { jsonrpc: '2.0', id: 7, method: 'getSlot', params: [] },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.deepEqual(calls, [{ jsonrpc: '2.0', id: 7, method: 'getSlot', params: [] }]);
  assert.equal(response.body.data.result, 99);
});

test('01RX futarchy handler redacts unexpected server failures', async () => {
  const logs = [];
  const handler = createFutarchyHandler({
    service: serviceFixture({
      async activeMarkets() {
        throw new Error('fetch https://secret.invalid/?api-key=do-not-leak failed');
      },
    }),
    logger: { error(value) { logs.push(value); } },
    now: () => 3,
    rpcRelay: async payload => payload,
  });
  const response = responseRecorder();
  await handler({
    method: 'GET',
    url: '/api/v1/futarchy?view=active-markets',
    headers: {},
  }, response);

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, 'Decision-market data is temporarily unavailable');
  assert.doesNotMatch(JSON.stringify(response.body), /do-not-leak|secret\.invalid/);
  assert.doesNotMatch(logs.join('\n'), /do-not-leak|secret\.invalid/);
});
