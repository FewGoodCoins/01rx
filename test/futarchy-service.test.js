import assert from 'node:assert/strict';
import test from 'node:test';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import {
  _test,
  createFutarchyService,
  resolveFutarchyRpcUrl,
} from '../api/_lib/futarchy-service.js';

const PROPOSAL = 'BbGa5nx6owLwJ9Wt9Pr3FHccpove9uSvNX4C59Andxf3';
const DAO = 'CkEUCAooQi64UFhPFS5MWpZw6LQqjsDQBj3Z5uiXS1eN';
const BASE = 'Cbjr1Nvcay3QWDriyRKtokJ7V4PMknesGxeK8z7Zmeta';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function snapshot() {
  return {
    slot: 123,
    asOf: '2026-07-31T22:00:00.000Z',
    daoAddress: DAO,
    baseMint: BASE,
    quoteMint: USDC,
    baseDecimals: 6,
    quoteDecimals: 6,
    proposal: {
      number: 6,
      proposer: 'Ec9ZMbUyGbejqjMThZHGGFZBvScwpAQRtvQvVmwvRNKP',
      isTeamSponsored: true,
      baseVault: '5b5RC4sntqyb61S463CunusWRmrqZvwyGmmHUf37CEn2',
      quoteVault: 'CC62973Y9AtqoNjA2CffGojHVUsiNBoQpiyoSFpFH3RL',
      passBaseMint: '6GKrtrFCgSGTbwcjdMXdwoD4JHG9a2sazbBvfTLPwREV',
      passQuoteMint: '6Wjn6VruLozZ811AcVM9bSvED8tM5q1iV6nX5UQ9Rt7Z',
      failBaseMint: 't2h4yz9hKzapLmbBnkekqsCLLLFPDCaYuaCeT7mxPyw',
      failQuoteMint: 'GqWZUByELbdXJ13S4b9w6FrZjLgjJcL2gK42Bg1wDDPG',
    },
    thresholdBps: -300,
    decision: { passing: true, marginPct: 2, targetPassTwap: 1 },
    spot: { price: 1, twapPrice: 1, liquidityUsd: 2 },
    pass: { price: 1.1, twapPrice: 1.1, liquidityUsd: 2 },
    fail: { price: 0.9, twapPrice: 0.9, liquidityUsd: 2 },
    liquidityUsd: 6,
    source: { slot: 123, asOf: '2026-07-31T22:00:00.000Z' },
    createdAt: '2026-07-30T22:00:00.000Z',
    endsAt: '2026-08-02T22:00:00.000Z',
  };
}

test('futarchy service prefers HELIUS_URL and rejects unsafe RPC origins', () => {
  assert.equal(
    resolveFutarchyRpcUrl({
      HELIUS_URL: 'https://mainnet.helius-rpc.com/?api-key=server-secret',
      SOLANA_RPC_URL: 'https://ignored.invalid',
    }),
    'https://mainnet.helius-rpc.com/?api-key=server-secret',
  );
  assert.equal(resolveFutarchyRpcUrl({ HELIUS_URL: 'http://remote.invalid' }), '');
  assert.equal(resolveFutarchyRpcUrl({ HELIUS_URL: 'https://user:secret@rpc.invalid' }), '');
  assert.equal(resolveFutarchyRpcUrl({ HELIUS_URL: 'https://rpc.invalid/#secret' }), '');
});

test('futarchy source normalizers bind known project aliases and lifecycle states', () => {
  assert.equal(_test.tokenFromProjectSlug('futardio-cult'), 'futardio');
  assert.equal(_test.tokenFromProjectSlug('umbra'), 'umbra');
  assert.equal(_test.normalizeArchiveStatus({ status: 'resolved', result: 'approved' }), 'passed');
  assert.equal(_test.normalizeArchiveStatus({ status: 'resolved', result: 'rejected' }), 'failed');
  assert.equal(_test.normalizeArchiveRow({ publicKey: 'invalid', projectSlug: 'umbra' }), null);
});

test('active markets join 01Resolved identity, NAV configuration, and validated chain state', async () => {
  const calls = [];
  const service = createFutarchyService({
    env: {
      ZERO_ONE_RESOLVED_API_KEY: 'server-key',
      NAVGATOR_API_ORIGIN: 'https://nav.example',
    },
    connection: {},
    now: () => Date.parse('2026-07-31T22:00:00Z'),
    async fetchImpl(url) {
      calls.push(String(url));
      if (String(url).startsWith('https://api.01resolved.com/')) {
        return jsonResponse({ data: [{
          organizationName: 'Futardio Cult',
          organizationSlug: 'futardio-cult',
          proposalPublicKey: PROPOSAL,
          proposalTitle: 'Active proposal',
        }] });
      }
      return jsonResponse({ ok: true, data: {
        name: 'Futardio Cult',
        ticker: 'FUTARDIO',
        config: { futAmm: DAO, mint: BASE, logo: '/logo.png' },
      } });
    },
    async loadMarketSnapshot(_connection, input) {
      assert.deepEqual(input, {
        daoAddress: DAO,
        proposalAddress: PROPOSAL,
        baseMint: BASE,
        quoteMint: USDC,
      });
      return snapshot();
    },
  });

  const first = await service.activeMarkets();
  const second = await service.activeMarkets();
  assert.equal(first.markets.length, 1);
  assert.equal(first.markets[0].token, 'futardio');
  assert.equal(first.markets[0].tradable, true);
  assert.equal(first.markets[0].proposal.passBaseMint, snapshot().proposal.passBaseMint);
  assert.equal(second, first);
  assert.equal(calls.length, 2);
  assert.ok(calls.includes('https://nav.example/api/tokens-config?token=futardio'));
  assert.equal(calls.some(url => url.includes('/api/current-nav')), false);
});

test('active markets fail closed when every indexed market fails account validation', async () => {
  const service = createFutarchyService({
    env: {
      ZERO_ONE_RESOLVED_API_KEY: 'server-key',
      NAVGATOR_API_ORIGIN: 'https://nav.example',
    },
    connection: {},
    async fetchImpl(url) {
      if (String(url).startsWith('https://api.01resolved.com/')) {
        return jsonResponse({ data: [{ organizationSlug: 'futardio-cult', proposalPublicKey: PROPOSAL }] });
      }
      return jsonResponse({ data: { config: { futAmm: DAO, mint: BASE } } });
    },
    async loadMarketSnapshot() {
      throw new Error('owner mismatch');
    },
  });
  await assert.rejects(
    service.activeMarkets(),
    error => error?.code === 'LIVE_MARKET_VALIDATION_FAILED' && error.statusCode === 503,
  );
});

test('proposal history aggregates official 15-minute chart observations', async () => {
  const service = createFutarchyService({
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-key' },
    connection: {},
    async fetchImpl() {
      return jsonResponse({ data: { preTwap: '2026-07-31T21:00:00Z', prices: [{
        timestamp: '2026-07-31T21:07:00Z',
        spotPrice: '1',
        approvedPrice: '1.1',
        rejectedPrice: '0.9',
      }] } });
    },
  });
  const result = await service.proposalHistory({ proposal: PROPOSAL, interval: '15m' });
  assert.equal(result.availability, 'complete');
  assert.equal(result.series[0].timestamp, '2026-07-31T21:00:00.000Z');
  assert.deepEqual(result.summary.coverage, {
    underlying: 1,
    pass: 1,
    fail: 1,
    passTwap: 0,
    failTwap: 0,
  });
});

test('proposal history fills missing post-open TWAPs from exact on-chain events', async () => {
  const backfillCalls = [];
  const service = createFutarchyService({
    env: {
      ZERO_ONE_RESOLVED_API_KEY: 'server-key',
      NAVGATOR_API_ORIGIN: 'https://nav.example',
      HELIUS_RPC_URL: 'https://mainnet.helius-rpc.com/?api-key=server-secret',
    },
    connection: {},
    now: () => Date.parse('2026-07-31T22:00:00Z'),
    async fetchImpl(url) {
      const value = String(url);
      if (value.includes(`/v1/proposal/${PROPOSAL}/price-chart`)) {
        return jsonResponse({ data: {
          preTwap: '2026-07-31T21:00:00Z',
          prices: [{
            timestamp: '2026-07-31T21:00:00Z',
            spotPrice: '1',
            approvedPrice: '1.1',
            rejectedPrice: '0.9',
          }, {
            timestamp: '2026-07-31T21:15:00Z',
            spotPrice: '1.01',
            approvedPrice: '1.2',
            rejectedPrice: '0.8',
          }],
        } });
      }
      if (value.startsWith('https://api.01resolved.com/')) {
        return jsonResponse({ data: [{
          organizationName: 'Futardio Cult',
          organizationSlug: 'futardio-cult',
          proposalPublicKey: PROPOSAL,
          proposalTitle: 'Active proposal',
        }] });
      }
      return jsonResponse({ ok: true, data: {
        name: 'Futardio Cult',
        ticker: 'FUTARDIO',
        config: { futAmm: DAO, mint: BASE, logo: '/logo.png' },
      } });
    },
    async loadMarketSnapshot() { return snapshot(); },
    async loadTwapHistory(options) {
      backfillCalls.push(options);
      return [{
        timestamp: '2026-07-31T21:00:00.000Z',
        observedAt: '2026-07-31T21:14:00.000Z',
        passTwap: 1.04,
        failTwap: 0.96,
      }, {
        timestamp: '2026-07-31T21:15:00.000Z',
        observedAt: '2026-07-31T21:29:00.000Z',
        passTwap: 1.05,
        failTwap: 0.95,
      }];
    },
  });

  const result = await service.proposalHistory({ proposal: PROPOSAL, interval: '15m' });
  assert.equal(backfillCalls.length, 1);
  assert.equal(backfillCalls[0].daoAddress, DAO);
  assert.equal(backfillCalls[0].rpcUrl.includes('server-secret'), true);
  assert.deepEqual(result.series.map(row => [row.passTwap, row.failTwap]), [
    [1.04, 0.96],
    [1.05, 0.95],
  ]);
  assert.equal(result.summary.coverage.passTwap, 2);
  assert.equal(result.source.provider, '01Resolved');
  assert.equal(result.source.twapProvider, 'Solana Futarchy SpotSwapEvent history');
  assert.equal(result.degraded.active, false);
});

test('positions preserve exact atomic balances and ignore unrelated parsed accounts', async () => {
  const active = snapshot();
  const market = {
    ...active,
    token: 'futardio',
    proposal: { id: PROPOSAL, ...active.proposal },
  };
  const owner = new PublicKey('11111111111111111111111111111111');
  const connection = {
    async getParsedTokenAccountsByOwner() {
      return {
        context: { slot: 222 },
        value: [{
          account: {
            owner: TOKEN_PROGRAM_ID,
            data: { parsed: { info: { mint: BASE, tokenAmount: { amount: '1234567' } } } },
          },
        }, {
          account: {
            owner: TOKEN_PROGRAM_ID,
            data: { parsed: { info: { mint: USDC, tokenAmount: { amount: '7654321' } } } },
          },
        }],
      };
    },
  };
  const backed = createFutarchyService({
    env: { ZERO_ONE_RESOLVED_API_KEY: 'server-key', NAVGATOR_API_ORIGIN: 'https://nav.example' },
    connection,
    async fetchImpl(url) {
      if (String(url).startsWith('https://api.01resolved.com/')) {
        return jsonResponse({ data: [{ organizationSlug: 'futardio-cult', proposalPublicKey: PROPOSAL }] });
      }
      return jsonResponse({ data: { ticker: 'FUTARDIO', config: { futAmm: DAO, mint: BASE } } });
    },
    async loadMarketSnapshot() { return active; },
  });
  const result = await backed.positions({ owner: owner.toBase58(), proposal: PROPOSAL });
  assert.equal(result.slot, 222);
  assert.equal(result.balances.find(row => row.label === 'base').amountString, '1.234567');
  assert.equal(result.balances.find(row => row.label === 'quote').rawAmount, '7654321');
});
