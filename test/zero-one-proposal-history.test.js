import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enhanceProposalHistoryResponse,
  resolveZeroOneResolvedApiKey,
} from '../api/_lib/zero-one-proposal-history.js';

const PROPOSAL = '8sysa3XPrvKPmUA4qoZCn9h4vp7Mb45Ynezg542nui8Q';
const REQUEST_URL = new URL(
  `https://api.navgator.xyz/api/v1/futarchy?view=proposal-history&proposal=${PROPOSAL}&interval=15m`,
);

function upstreamBody(overrides = {}) {
  return Buffer.from(JSON.stringify({
    ok: true,
    data: {
      proposalId: PROPOSAL,
      token: 'umbra',
      proposalNumber: 5,
      title: null,
      status: 'pending',
      interval: '1h',
      requestedInterval: '15m',
      preTwap: null,
      availability: 'unavailable',
      series: [],
      summary: {
        pointCount: 0,
        from: null,
        to: null,
        coverage: {
          underlying: 0,
          pass: 0,
          fail: 0,
          passTwap: 0,
          failTwap: 0,
        },
      },
      source: {
        provider: 'NAVgator checked-in legacy history',
      },
      degraded: {
        active: false,
        services: [],
        issues: [{
          code: 'ZERO_ONE_PRICE_HISTORY_EMPTY',
          message: '01Resolved returned no price observations for this proposal.',
        }],
      },
      ...overrides,
    },
    ts: '2026-07-31T20:09:52.037Z',
  }));
}

test('01Resolved key resolver accepts the canonical name and the existing Vercel alias', () => {
  assert.equal(
    resolveZeroOneResolvedApiKey({ ZERO_ONE_RESOLVED_API_KEY: 'canonical' }),
    'canonical',
  );
  assert.equal(
    resolveZeroOneResolvedApiKey({ ONE_RESOLVED_API_KEY: 'existing-alias' }),
    'existing-alias',
  );
  assert.equal(
    resolveZeroOneResolvedApiKey({
      ZERO_ONE_RESOLVED_API_KEY: 'canonical',
      ONE_RESOLVED_API_KEY: 'alias',
    }),
    'canonical',
  );
});

test('proposal history is filled from the official 01Resolved price-chart contract', async () => {
  const calls = [];
  const result = await enhanceProposalHistoryResponse({
    body: upstreamBody(),
    env: { ONE_RESOLVED_API_KEY: 'server-secret' },
    requestUrl: REQUEST_URL,
    async fetchImpl(url, options) {
      calls.push({ options, url: String(url) });
      return new Response(JSON.stringify({
        data: {
          preTwap: '2026-07-31T19:00:00.000Z',
          prices: [
            {
              timestamp: '2026-07-31T19:17:00.000Z',
              spotPrice: '0.041',
              spotTwap: '0.040',
              approvedPrice: '0.044',
              rejectedPrice: '0.038',
              approvedTwap: '0.043',
              rejectedTwap: '0.039',
            },
          ],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://api.01resolved.com/v1/proposal/${PROPOSAL}/price-chart`,
  );
  assert.equal(calls[0].options.headers['x-api-key'], 'server-secret');
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[0].options.headers.cookie, undefined);

  const payload = JSON.parse(result.toString());
  assert.equal(payload.data.proposalId, PROPOSAL);
  assert.equal(payload.data.token, 'umbra');
  assert.equal(payload.data.interval, '15m');
  assert.equal(payload.data.availability, 'complete');
  assert.equal(payload.data.source.provider, '01Resolved');
  assert.equal(payload.data.source.endpoint, '/v1/proposal/{publicKey}/price-chart');
  assert.equal(payload.data.series[0].timestamp, '2026-07-31T19:15:00.000Z');
  assert.equal(payload.data.series[0].underlyingPrice, 0.041);
  assert.equal(payload.data.series[0].passPrice, 0.044);
  assert.equal(payload.data.series[0].failPrice, 0.038);
  assert.deepEqual(payload.data.degraded, {
    active: false,
    services: [],
    issues: [],
  });
  assert.equal(result.includes('server-secret'), false);
});

test('observed 01Resolved orders provide a disclosed partial fallback when price-chart is empty', async () => {
  const calls = [];
  const responses = [
    { data: { prices: [] } },
    {
      meta: { totalItems: 2 },
      data: [
        {
          timeStamp: '2026-07-31T19:17:00.000Z',
          marketType: 'pass',
          price: '0.044',
        },
        {
          timeStamp: '2026-07-31T19:19:00.000Z',
          marketType: 'fail',
          price: '0.038',
        },
      ],
    },
  ];
  const result = await enhanceProposalHistoryResponse({
    body: upstreamBody(),
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-secret' },
    requestUrl: REQUEST_URL,
    async fetchImpl(url) {
      calls.push(String(url));
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    },
  });

  assert.deepEqual(calls, [
    `https://api.01resolved.com/v1/proposal/${PROPOSAL}/price-chart`,
    `https://api.01resolved.com/v1/proposal/${PROPOSAL}/orders?limit=500&page=1`,
  ]);
  const payload = JSON.parse(result.toString());
  assert.equal(payload.data.availability, 'partial');
  assert.equal(payload.data.source.provider, '01Resolved observed proposal trades');
  assert.equal(payload.data.series[0].underlyingPrice, null);
  assert.equal(payload.data.series[0].passPrice, 0.044);
  assert.equal(payload.data.series[0].failPrice, 0.038);
  assert.equal(payload.data.degraded.active, true);
  assert.deepEqual(payload.data.degraded.services, [
    '01resolved-proposal-price-chart-empty',
  ]);
  assert.equal(
    payload.data.degraded.issues[0].code,
    'ZERO_ONE_ORDER_PRICE_HISTORY_USED',
  );
});

test('proposal history enhancement fails closed without a key or exact NAVgator proposal binding', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error('must not fetch');
  };
  assert.equal(await enhanceProposalHistoryResponse({
    body: upstreamBody(),
    env: {},
    fetchImpl,
    requestUrl: REQUEST_URL,
  }), null);
  assert.equal(await enhanceProposalHistoryResponse({
    body: upstreamBody({ proposalId: 'different-proposal' }),
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-secret' },
    fetchImpl,
    requestUrl: REQUEST_URL,
  }), null);
  assert.equal(calls, 0);
});

test('a healthy NAVgator 01Resolved response is relayed without a duplicate upstream request', async () => {
  let calls = 0;
  const result = await enhanceProposalHistoryResponse({
    body: upstreamBody({
      source: { provider: '01Resolved' },
      series: [{ timestamp: '2026-07-31T19:15:00.000Z', passPrice: 0.044 }],
    }),
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-secret' },
    requestUrl: REQUEST_URL,
    async fetchImpl() {
      calls += 1;
      return new Response('{}');
    },
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});
