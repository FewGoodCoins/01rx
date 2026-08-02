import assert from 'node:assert/strict';
import test from 'node:test';
import { create01ResolvedClient } from '@01resolved/api-client';
import { buildEndpointPath, getEndpoint } from '@01resolved/contracts';
import { createCurrentNavHandler } from '../api/_lib/current-nav-handler.js';
import {
  loadZeroOneCurrentNav,
  normalizeZeroOneCurrentNavRow,
} from '../api/_lib/zero-one-current-nav.js';

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

function project(overrides = {}) {
  return {
    organizationImageUrl: 'https://cdn.01resolved.com/solo.png',
    organizationName: 'Solomon',
    organizationSlug: 'solomon-labs',
    tokenSymbol: 'SOLO',
    tokenUsdPrice: '0.628927',
    tokenPriceChangePercentage1h: '-0.5',
    tokenPriceChangePercentage24h: '2.25',
    tokenPriceChangePercentage7d: '8.5',
    marketCap: '5196588.31',
    fdv: '16227509.52',
    netAssetValue: '0.697689',
    premDisc: '-9.856',
    mNAV: '0.90144',
    treasuryValue: '5766232.78',
    tokenCirculatingSupply: '8264757',
    tokenTotalSupply: '25799968',
    spendingLimit: '100000',
    runway: '57.66',
    proposalCount: 6,
    updatedAt: '2026-08-01T17:59:00.000Z',
    ...overrides,
  };
}

test('current NAV is a stable typed client contract with compatibility query flags', async () => {
  assert.equal(getEndpoint('core.currentNav').contract, 'core.current-nav.v1');
  assert.equal(
    buildEndpointPath('core.currentNav', {
      token: 'solo',
      compact: true,
      includeDaoBreakdown: false,
    }),
    '/api/current-nav?token=solo&compact=1&includeDaoBreakdown=0',
  );
  const calls = [];
  const client = create01ResolvedClient({
    baseUrl: 'https://01rx.example',
    transport: {
      async json(url, options) {
        calls.push({ options, url });
        return { ok: true, data: { token: 'solo', nav: 1 } };
      },
    },
  });
  assert.deepEqual(
    await client.core.currentNav({ token: 'solo' }),
    { token: 'solo', nav: 1 },
  );
  assert.equal(calls[0].url, 'https://01rx.example/api/current-nav?token=solo');
});

test('01Resolved current NAV normalization preserves published values and source boundaries', () => {
  const row = normalizeZeroOneCurrentNavRow(project(), {
    retrievedAt: '2026-08-01T18:00:00.000Z',
  });

  assert.equal(row.token, 'solo');
  assert.equal(row.ticker, 'SOLO');
  assert.equal(row.name, 'Solomon Labs');
  assert.equal(row.spot, 0.628927);
  assert.equal(row.nav, 0.697689);
  assert.equal(row.treasuryUSDC, 5766232.78);
  assert.equal(row.effectiveSupply, 8264757);
  assert.equal(row.onChainSupply, 25799968);
  assert.equal(row.lockedTokens, 17535211);
  assert.equal(row.change24h, 2.25);
  assert.equal(row.marketCap, 5196588.31);
  assert.equal(row.fdv, 16227509.52);
  assert.equal(row.monthlyAllowance, 100000);
  assert.equal(row.hasCurrentNav, true);
  assert.equal(row.hasHistoricNav, false);
  assert.equal(row.navSource, '01resolved');
  assert.equal(row.navSnapshot.navPerToken, 0.697689);
  assert.equal(row.navSnapshot.source.provider, '01Resolved');
  assert.equal(row.navSnapshot.source.scope, 'current-nav');
  assert.equal(row.navSnapshot.sources.currentNav.provider, '01Resolved');
  assert.equal(row.navSnapshot.treasury.components.length, 1);
  assert.equal(row.snapshotTime, '2026-08-01T17:59:00.000Z');
});

test('01Resolved current NAV maps known project slugs without synthesizing missing NAV', () => {
  const row = normalizeZeroOneCurrentNavRow(project({
    organizationSlug: 'futardio-cult',
    tokenSymbol: '',
    netAssetValue: null,
  }), {
    retrievedAt: '2026-08-01T18:00:00.000Z',
  });

  assert.equal(row.token, 'futardio');
  assert.equal(row.nav, null);
  assert.equal(row.hasCurrentNav, false);
  assert.equal(row.currentNavStatus, 'unavailable');
  assert.equal(row.navSnapshot.status, 'unverified');
  assert.equal(row.navSnapshot.issues[0].code, 'ZERO_ONE_CURRENT_NAV_UNAVAILABLE');
});

test('01Resolved current NAV loader uses only the official server-authenticated endpoint', async () => {
  const calls = [];
  const data = await loadZeroOneCurrentNav({
    env: {
      NAVGATOR_API_ORIGIN: 'https://must-not-be-used.invalid',
      ZERO_ONE_RESOLVED_API_KEY: 'server-secret',
    },
    now: () => Date.parse('2026-08-01T18:00:00.000Z'),
    async fetchImpl(url, options) {
      calls.push({ options, url: String(url) });
      return new Response(JSON.stringify({ data: [project()] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://api.01resolved.com/v1/global-dashboard/projects?limit=100&page=1',
  );
  assert.equal(calls[0].options.headers['x-api-key'], 'server-secret');
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[0].options.headers.cookie, undefined);
  assert.equal(data.tokens.length, 1);
  assert.equal(data.source.provider, '01Resolved');
  assert.equal(JSON.stringify(data).includes('server-secret'), false);
});

test('current NAV handler preserves the all-token and single-token wire formats', async () => {
  const data = {
    asOf: '2026-08-01T18:00:00.000Z',
    source: { provider: '01Resolved', scope: 'current-nav' },
    tokens: [normalizeZeroOneCurrentNavRow(project(), {
      retrievedAt: '2026-08-01T18:00:00.000Z',
    })],
  };
  const handler = createCurrentNavHandler({
    loadCurrentNav: async () => data,
    logger: { error() {} },
    now: () => Date.parse('2026-08-01T18:00:01.000Z'),
  });

  const allResponse = responseRecorder();
  await handler({
    method: 'GET',
    url: '/api/current-nav?includeInactive=1',
  }, allResponse);
  assert.equal(allResponse.statusCode, 200);
  assert.equal(allResponse.body.ok, true);
  assert.equal(allResponse.body.data.tokens[0].token, 'solo');
  assert.equal(allResponse.headers['x-01r-contract'], 'core.current-nav.v1');
  assert.equal(allResponse.headers['x-01r-surface'], 'stable');
  assert.match(allResponse.headers['cache-control'], /s-maxage=10/);

  const singleResponse = responseRecorder();
  await handler({
    method: 'GET',
    url: '/api/current-nav?token=solo&compact=1&includeDaoBreakdown=0&cache=0',
  }, singleResponse);
  assert.equal(singleResponse.statusCode, 200);
  assert.equal(singleResponse.body.data.token, 'solo');
  assert.equal(singleResponse.body.data.nav, 0.697689);
  assert.equal(Array.isArray(singleResponse.body.data.tokens), false);
  assert.equal(singleResponse.headers['cache-control'], 'private, no-store');
});

test('current NAV handler rejects unsafe requests and fails closed without 01Resolved', async () => {
  const handler = createCurrentNavHandler({
    env: {},
    logger: { error() {} },
    now: () => Date.parse('2026-08-01T18:00:00.000Z'),
  });
  const cases = [
    {
      request: { method: 'POST', url: '/api/current-nav' },
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
    },
    {
      request: { method: 'GET', url: '/api/current-nav?unknown=1' },
      status: 400,
      code: 'BAD_REQUEST',
    },
    {
      request: { method: 'GET', url: '/api/current-nav?token=../admin' },
      status: 400,
      code: 'BAD_REQUEST',
    },
    {
      request: { method: 'GET', url: '/api/current-nav?cache=sometimes' },
      status: 400,
      code: 'BAD_REQUEST',
    },
    {
      request: { method: 'GET', url: '/api/current-nav' },
      status: 503,
      code: 'MISSING_API_KEY',
    },
  ];

  for (const item of cases) {
    const response = responseRecorder();
    await handler(item.request, response);
    assert.equal(response.statusCode, item.status);
    assert.equal(response.body.code, item.code);
    assert.equal(response.headers['cache-control'], 'private, no-store');
  }
});

test('current NAV handler reports unknown 01Resolved tokens without legacy fallback', async () => {
  const handler = createCurrentNavHandler({
    loadCurrentNav: async () => ({
      tokens: [normalizeZeroOneCurrentNavRow(project(), {
        retrievedAt: '2026-08-01T18:00:00.000Z',
      })],
    }),
    now: () => Date.parse('2026-08-01T18:00:00.000Z'),
  });
  const response = responseRecorder();
  await handler({ method: 'GET', url: '/api/current-nav?token=umbra' }, response);
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.code, 'NOT_FOUND');
  assert.equal(response.headers['cache-control'], 'private, no-store');
});
