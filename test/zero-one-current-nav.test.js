import assert from 'node:assert/strict';
import test from 'node:test';
import { create01ResolvedClient } from '@01resolved/api-client';
import { buildEndpointPath, getEndpoint } from '@01resolved/contracts';
import { createCurrentNavHandler } from '../api/_lib/current-nav-handler.js';
import {
  _test as zeroOneCurrentNavTest,
  loadZeroOneCurrentNav,
  normalizeZeroOneCurrentNavRow,
} from '../api/_lib/zero-one-current-nav.js';

const SOLO_MINT = 'SoLo9oxzLDpcq1dpqAgMwgce5WqkRDtNXK7EPnbmeta';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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

function daoOverview(overrides = {}) {
  return {
    data: {
      imageUrl: 'https://cdn.01resolved.com/solo-dao.png',
      name: 'Solomon',
      slug: 'solomon-labs',
      updatedAt: '2026-08-01T17:58:00.000Z',
      baseMint: SOLO_MINT,
      network: { network: 'mainnet' },
      baseToken: {
        circulatingSupply: '8264757',
        name: 'Solomon',
        priceChangePercentage1h: '-0.5',
        priceChangePercentage24h: '2.25',
        priceChangePercentage7d: '8.5',
        symbol: 'SOLO',
        totalSupply: '25799968',
        updatedAt: '2026-08-01T17:59:00.000Z',
        usdPrice: '0.628927',
        url: 'https://cdn.01resolved.com/solo-token.png',
        publicKey: SOLO_MINT,
      },
      ...overrides,
    },
  };
}

function treasuryOverview(overrides = {}) {
  return {
    data: {
      baseMintCurrentPrice: '0.628927',
      monthOfRunway: '57.66',
      netAssetValue: '0.697689',
      spendingLimit: '100000',
      totalBalance: '5766232.78',
      updatedAt: '2026-08-01T17:59:30.000Z',
      ...overrides,
    },
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
  assert.equal(row.change1h, -0.5);
  assert.equal(row.change24h, 2.25);
  assert.equal(row.change7d, 8.5);
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

test('01Resolved DAO mint identity requires matching canonical mainnet addresses', () => {
  assert.equal(
    zeroOneCurrentNavTest.validatedDaoMint(daoOverview().data),
    SOLO_MINT,
  );
  [
    daoOverview({ baseMint: USDC_MINT }).data,
    daoOverview({ network: { network: 'devnet' } }).data,
    daoOverview({ baseMint: 'not-a-solana-address' }).data,
    daoOverview({ baseToken: { publicKey: '' } }).data,
  ].forEach(payload => {
    assert.equal(zeroOneCurrentNavTest.validatedDaoMint(payload), '');
  });
});

test('01Resolved current NAV loader enriches the project index from official DAO contracts', async () => {
  const calls = [];
  const data = await loadZeroOneCurrentNav({
    env: {
      NAVGATOR_API_ORIGIN: 'https://must-not-be-used.invalid',
      ZERO_ONE_RESOLVED_API_KEY: 'server-secret',
    },
    now: () => Date.parse('2026-08-01T18:00:00.000Z'),
    async fetchImpl(url, options) {
      const value = String(url);
      calls.push({ options, url: value });
      let body;
      if (value.includes('/v1/global-dashboard/projects?')) {
        body = { data: [project({
          netAssetValue: '999',
          tokenUsdPrice: '999',
          treasuryValue: '999',
        })] };
      } else if (value.includes('/v1/dao/overview?slug=solomon-labs')) {
        body = daoOverview();
      } else if (value.includes('/v1/dao/treasury/overview?slug=solomon-labs')) {
        body = treasuryOverview();
      } else {
        throw new Error(`Unexpected 01Resolved URL: ${value}`);
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(calls.length, 3);
  assert.equal(
    calls[0].url,
    'https://api.01resolved.com/v1/global-dashboard/projects?limit=100&page=1',
  );
  assert.deepEqual(
    new Set(calls.slice(1).map(call => call.url)),
    new Set([
      'https://api.01resolved.com/v1/dao/overview?slug=solomon-labs',
      'https://api.01resolved.com/v1/dao/treasury/overview?slug=solomon-labs',
    ]),
  );
  for (const call of calls) {
    assert.equal(call.options.headers['x-api-key'], 'server-secret');
    assert.equal(call.options.headers.authorization, undefined);
    assert.equal(call.options.headers.cookie, undefined);
  }
  assert.equal(data.tokens.length, 1);
  assert.equal(data.tokens[0].spot, 0.628927);
  assert.equal(data.tokens[0].nav, 0.697689);
  assert.equal(data.tokens[0].treasuryUSDC, 5766232.78);
  assert.equal(data.tokens[0].circulatingSupply, 8264757);
  assert.equal(data.tokens[0].marketCap, 5196588.31);
  assert.equal(data.tokens[0].fdv, 16227509.52);
  assert.equal(data.tokens[0].mint, SOLO_MINT);
  assert.equal(data.tokens[0].source.endpoint, '/v1/global-dashboard/projects');
  assert.equal(
    data.tokens[0].navSnapshot.sources.currentPrice.endpoint,
    '/v1/dao/overview',
  );
  assert.equal(
    data.tokens[0].navSnapshot.sources.currentNav.endpoint,
    '/v1/dao/treasury/overview',
  );
  assert.equal(data.source.provider, '01Resolved');
  assert.equal(JSON.stringify(data).includes('server-secret'), false);
});

test('01Resolved DAO enrichment fails closed per contract without retaining global values', async () => {
  const laso = project({
    organizationName: 'Laso Finance',
    organizationSlug: 'laso-finance',
    tokenSymbol: 'LASO',
  });
  const data = await loadZeroOneCurrentNav({
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-secret' },
    now: () => Date.parse('2026-08-01T18:00:00.000Z'),
    async fetchImpl(url) {
      const value = String(url);
      if (value.includes('/v1/global-dashboard/projects?')) {
        return Response.json({ data: [project(), laso] });
      }
      if (value.includes('/v1/dao/overview?slug=solomon-labs')) {
        return Response.json({ error: 'unavailable' }, { status: 503 });
      }
      if (value.includes('/v1/dao/treasury/overview?slug=solomon-labs')) {
        return Response.json(treasuryOverview({ baseMintCurrentPrice: '0.5' }));
      }
      if (value.includes('/v1/dao/overview?slug=laso-finance')) {
        return Response.json(daoOverview({
          name: 'Laso Finance',
          baseToken: {
            circulatingSupply: '12899945.827518001',
            symbol: 'LASO',
            totalSupply: '29999945.827518',
            updatedAt: '2026-08-01T17:59:00.000Z',
            usdPrice: '0.1350507756592917',
          },
        }));
      }
      if (value.includes('/v1/dao/treasury/overview?slug=laso-finance')) {
        return Response.json({ error: 'unavailable' }, { status: 503 });
      }
      throw new Error(`Unexpected 01Resolved URL: ${value}`);
    },
  });

  const solo = data.tokens.find(row => row.token === 'solo');
  assert.equal(solo.spot, 0.5);
  assert.equal(solo.nav, 0.697689);
  assert.equal(solo.circulatingSupply, null);
  assert.equal(solo.navSnapshot.sources.currentPrice.endpoint, '/v1/dao/treasury/overview');

  const lasoRow = data.tokens.find(row => row.token === 'laso');
  assert.equal(lasoRow.spot, 0.1350507756592917);
  assert.equal(lasoRow.nav, null);
  assert.equal(lasoRow.treasuryUSDC, null);
  assert.equal(lasoRow.currentNavStatus, 'unavailable');
  assert.equal(lasoRow.navSnapshot.sources.currentNav.endpoint, '/v1/global-dashboard/projects');
});

test('current NAV rejects a systemic DAO enrichment outage instead of returning empty 200 data', async () => {
  await assert.rejects(
    loadZeroOneCurrentNav({
      env: { ZERO_ONE_RESOLVED_API_KEY: 'server-secret' },
      async fetchImpl(url) {
        if (String(url).includes('/v1/global-dashboard/projects?')) {
          return Response.json({ data: [project()] });
        }
        return Response.json({ error: 'unavailable' }, { status: 503 });
      },
    }),
    error => error.code === 'UPSTREAM_ENRICHMENT_UNAVAILABLE' && error.statusCode === 503,
  );
});

test('single-token current NAV reads enrich only the matching project', async () => {
  const calls = [];
  const data = await loadZeroOneCurrentNav({
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-secret' },
    token: 'laso',
    async fetchImpl(url) {
      const value = String(url);
      calls.push(value);
      if (value.includes('/v1/global-dashboard/projects?')) {
        return Response.json({ data: [
          project(),
          project({
            organizationName: 'Laso Finance',
            organizationSlug: 'laso-finance',
            tokenSymbol: 'LASO',
          }),
        ] });
      }
      if (value.includes('/v1/dao/overview?slug=laso-finance')) {
        return Response.json(daoOverview({
          baseToken: { symbol: 'LASO', usdPrice: '0.13' },
        }));
      }
      if (value.includes('/v1/dao/treasury/overview?slug=laso-finance')) {
        return Response.json(treasuryOverview({ netAssetValue: '0.09' }));
      }
      throw new Error(`Unexpected 01Resolved URL: ${value}`);
    },
  });

  assert.equal(calls.length, 3);
  assert.equal(calls.some(url => url.includes('slug=solomon-labs')), false);
  assert.equal(data.tokens.length, 1);
  assert.equal(data.tokens[0].token, 'laso');
  assert.equal(data.tokens[0].spot, 0.13);
  assert.equal(data.tokens[0].nav, 0.09);
});

test('unknown single-token reads return an empty index result for the handler to map to 404', async () => {
  const calls = [];
  const data = await loadZeroOneCurrentNav({
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-secret' },
    token: 'umbra',
    async fetchImpl(url) {
      calls.push(String(url));
      return Response.json({ data: [project()] });
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(data.tokens, []);
});

test('DAO enrichment bounds concurrent upstream work by project', async () => {
  let active = 0;
  let maximumActive = 0;
  const data = await loadZeroOneCurrentNav({
    enrichmentConcurrency: 1,
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-secret' },
    async fetchImpl(url) {
      const value = String(url);
      if (value.includes('/v1/global-dashboard/projects?')) {
        return Response.json({ data: [
          project({ organizationSlug: 'one', tokenSymbol: 'ONE' }),
          project({ organizationSlug: 'two', tokenSymbol: 'TWO' }),
          project({ organizationSlug: 'three', tokenSymbol: 'THREE' }),
        ] });
      }
      const slug = new URL(value).searchParams.get('slug');
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      if (value.includes('/v1/dao/treasury/overview?')) {
        return Response.json(treasuryOverview());
      }
      return Response.json(daoOverview({
        baseToken: { symbol: slug.toUpperCase(), usdPrice: '1' },
      }));
    },
  });

  assert.equal(data.tokens.length, 3);
  assert.equal(maximumActive, 2);
});

test('current NAV handler preserves the all-token and single-token wire formats', async () => {
  const data = {
    asOf: '2026-08-01T18:00:00.000Z',
    source: { provider: '01Resolved', scope: 'current-nav' },
    tokens: [normalizeZeroOneCurrentNavRow(project({ mint: SOLO_MINT }), {
      retrievedAt: '2026-08-01T18:00:00.000Z',
    })],
  };
  const loadInputs = [];
  const handler = createCurrentNavHandler({
    loadCurrentNav: async (input) => {
      loadInputs.push(input);
      return data;
    },
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
  assert.equal(
    allResponse.body.data.tokens[0].mint,
    SOLO_MINT,
  );
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
  assert.equal(
    singleResponse.body.data.mint,
    SOLO_MINT,
  );
  assert.equal(Array.isArray(singleResponse.body.data.tokens), false);
  assert.equal(singleResponse.headers['cache-control'], 'private, no-store');
  assert.deepEqual(loadInputs, [{ token: '' }, { token: 'solo' }]);
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
