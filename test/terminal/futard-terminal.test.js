const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const base58Module = require('bs58');
const { JSDOM } = require('jsdom');

const base58 = base58Module.default || base58Module;
const testAddress = byte => base58.encode(Buffer.alloc(32, byte));
const PROPOSAL_ID = '98zXsz1RtvYw4zHrxaZDdGBU3BgqfsX9XJbXBLSJUBST';
const PROPOSAL_URL = `https://www.metadao.fi/projects/loyal/proposal/${PROPOSAL_ID}`;
const PASSED_PROPOSAL_ID = 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK';
const PASSED_PROPOSAL_URL = `https://www.metadao.fi/projects/meta/proposal/${PASSED_PROPOSAL_ID}`;
const FAILED_PROPOSAL_ID = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq';
const FAILED_PROPOSAL_URL = `https://www.metadao.fi/projects/solo/proposal/${FAILED_PROPOSAL_ID}`;
const WALLET_ADDRESS = '9xQeWvG816bUx9EPfEZVyQVPvpkEU4NJTNJmV9fU6vq';
const TRANSACTION_SIGNATURE = base58.encode(Buffer.alloc(64, 4));
const ACTIVE_EXECUTION_RELEASE = Object.freeze({
  code: 'TEST_EXECUTION_ENABLED',
  enabled: true,
  message: 'Execution enabled by this test fixture.',
  phase: 'test',
});
const MOCK_BASE_MINT = testAddress(21);
const SOLO_MINT = 'SoLo9oxzLDpcq1dpqAgMwgce5WqkRDtNXK7EPnbmeta';
const MOCK_BASE_VAULT = testAddress(22);
const MOCK_QUOTE_VAULT = testAddress(23);
const MOCK_PASS_BASE_MINT = testAddress(24);
const MOCK_PASS_QUOTE_MINT = testAddress(25);
const MOCK_FAIL_BASE_MINT = testAddress(26);
const MOCK_FAIL_QUOTE_MINT = testAddress(27);
const mountedTerminals = new Set();

const ACTIVE_MARKETS = {
  asOf: '2026-07-24T12:00:00.000Z',
  slot: 355000000,
  source: {
    proposalIndex: 'supabase.proposals',
    marketState: 'solana.rpc.getMultipleAccounts',
    commitment: 'confirmed',
    cache: 'fresh',
  },
  pendingProposalCount: 1,
  degraded: {
    active: false,
    services: [],
    issues: [],
  },
  markets: [
    {
      token: 'loyal',
      ticker: 'LOYAL',
      name: 'Loyal',
      logo: null,
      daoAddress: 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK',
      baseMint: MOCK_BASE_MINT,
      quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      baseDecimals: 6,
      quoteDecimals: 6,
      proposal: {
        id: PROPOSAL_ID,
        number: 7,
        title: 'Fund Loyal contributor growth for Q3',
        description: 'Authorize a contributor budget tied to verified customer and revenue milestones.',
        status: 'pending',
        url: PROPOSAL_URL,
        createdAt: '2026-07-23T12:00:00.000Z',
        endsAt: '2026-07-27T12:00:00.000Z',
        isTeamSponsored: true,
        baseVault: MOCK_BASE_VAULT,
        quoteVault: MOCK_QUOTE_VAULT,
        passBaseMint: MOCK_PASS_BASE_MINT,
        passQuoteMint: MOCK_PASS_QUOTE_MINT,
        failBaseMint: MOCK_FAIL_BASE_MINT,
        failQuoteMint: MOCK_FAIL_QUOTE_MINT,
      },
      twapStartedAt: '2026-07-24T10:00:00.000Z',
      thresholdBps: 150,
      decision: {
        passing: true,
        marginPct: 1.63,
        passLikelihood: 0.64,
        targetPassTwap: 0.1298185,
      },
      spot: {
        price: 0.1291,
        oraclePrice: 0.1289,
        twapPrice: 0.1284,
        baseReserves: 520000,
        quoteReserves: 67132,
        liquidityUsd: 134264,
      },
      pass: {
        price: 0.1337,
        oraclePrice: 0.1335,
        twapPrice: 0.1319,
        baseReserves: 180000,
        quoteReserves: 24066,
        liquidityUsd: 48132,
      },
      fail: {
        price: 0.1279,
        oraclePrice: 0.128,
        twapPrice: 0.1279,
        baseReserves: 187000,
        quoteReserves: 23917,
        liquidityUsd: 47834,
      },
      liquidityUsd: 230230,
      source: {
        slot: 355000000,
        asOf: '2026-07-24T12:00:00.000Z',
      },
    },
  ],
};

const PROPOSAL_INDEX = {
  asOf: '2026-07-24T12:00:00.000Z',
  source: {
    proposalIndex: 'supabase.proposals',
    liveMarkets: 'solana_confirmed',
    historicMarkets: {
      primary: 'supabase.proposal_markets',
      supplemental: 'metadao_history',
    },
  },
  degraded: {
    active: false,
    services: [],
    issues: [],
  },
  filters: {
    token: null,
    status: null,
  },
  summary: {
    total: 3,
    pending: 1,
    passed: 1,
    failed: 1,
    removed: 0,
    unknown: 0,
    tradable: 1,
    filtered: 3,
  },
  pagination: {
    limit: 50,
    returned: 3,
    total: 3,
    nextCursor: null,
  },
  proposals: [
    {
      token: 'loyal',
      ticker: 'LOYAL',
      name: 'Loyal',
      projectSlug: 'loyal',
      logo: null,
      daoAddress: 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK',
      id: PROPOSAL_ID,
      number: 7,
      title: 'Fund Loyal contributor growth for Q3',
      description: 'Authorize a contributor budget tied to verified customer and revenue milestones.',
      status: 'pending',
      rawStatus: 'pending',
      tradable: true,
      tradabilityReason: 'validated_live_market',
      url: PROPOSAL_URL,
      createdAt: '2026-07-23T12:00:00.000Z',
      endsAt: '2026-07-27T12:00:00.000Z',
      resolvedAt: null,
      isTeamSponsored: true,
      outcome: null,
      market: {
        kind: 'live',
        asOf: '2026-07-24T12:00:00.000Z',
        slot: 355000000,
        thresholdBps: 150,
        decision: {
          passing: true,
          marginPct: 1.63,
          targetPassTwap: 0.1298185,
        },
        spot: {
          price: 0.1291,
          twapPrice: 0.1284,
          baseReserves: 520000,
          quoteReserves: 67132,
        },
        pass: {
          price: 0.1337,
          twapPrice: 0.1319,
          baseReserves: 180000,
          quoteReserves: 24066,
        },
        fail: {
          price: 0.1279,
          twapPrice: 0.1279,
          baseReserves: 187000,
          quoteReserves: 23917,
        },
        liquidityUsd: 96000,
        source: 'solana_confirmed',
      },
      source: {
        proposal: 'supabase.proposals',
        market: 'solana_confirmed',
      },
    },
    {
      token: 'meta',
      ticker: 'META',
      name: 'MetaDAO',
      projectSlug: 'meta',
      logo: null,
      daoAddress: 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK',
      id: PASSED_PROPOSAL_ID,
      number: 41,
      title: 'Renew the META liquidity mandate',
      description: 'Renew a six-month liquidity mandate with a capped treasury allocation.',
      status: 'passed',
      rawStatus: 'passed',
      tradable: false,
      tradabilityReason: 'proposal_resolved',
      url: PASSED_PROPOSAL_URL,
      createdAt: '2026-06-10T14:00:00.000Z',
      endsAt: '2026-06-16T18:00:00.000Z',
      resolvedAt: null,
      isTeamSponsored: true,
      outcome: {
        type: 'liquidity_mandate',
        usdcAmount: 200000,
        tokenAmount: null,
        burnAmount: null,
        maxPrice: 5,
        implementation: 'Renew the treasury liquidity mandate for six months.',
        executedAt: null,
        startedAt: null,
        completedAt: null,
        executionSignature: null,
        roadmapApproved: null,
      },
      market: {
        kind: 'last_observed',
        asOf: '2026-06-16T17:58:00.000Z',
        slot: 350000041,
        thresholdBps: 300,
        decision: {
          passing: true,
          marginPct: 4.2,
          targetPassTwap: 4.635,
        },
        spot: {
          price: 4.53,
          twapPrice: 4.49,
          baseReserves: 88000,
          quoteReserves: 398640,
        },
        pass: {
          price: 4.86,
          twapPrice: 4.82,
          baseReserves: 41000,
          quoteReserves: 199260,
        },
        fail: {
          price: 4.45,
          twapPrice: 4.5,
          baseReserves: 43000,
          quoteReserves: 191350,
        },
        liquidityUsd: 390610,
        source: 'historic_snapshot',
      },
      source: {
        proposal: 'supabase.proposals',
        market: 'historic_snapshot',
      },
    },
    {
      token: 'solo',
      ticker: 'SOLO',
      name: 'Solomon',
      projectSlug: 'solo',
      logo: null,
      daoAddress: 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK',
      id: FAILED_PROPOSAL_ID,
      number: 12,
      title: 'Acquire the Atlas analytics business',
      description: 'Acquire Atlas using a milestone-based mix of cash and governance tokens.',
      status: 'failed',
      rawStatus: 'failed',
      tradable: false,
      tradabilityReason: 'proposal_resolved',
      url: FAILED_PROPOSAL_URL,
      createdAt: '2026-05-03T09:00:00.000Z',
      endsAt: '2026-05-09T21:00:00.000Z',
      resolvedAt: null,
      isTeamSponsored: false,
      outcome: {
        type: 'acquisition',
        usdcAmount: 480000,
        tokenAmount: 750000,
        burnAmount: null,
        maxPrice: 0.6,
        implementation: 'Acquire Atlas subject to revenue milestones.',
        executedAt: null,
        startedAt: null,
        completedAt: null,
        executionSignature: null,
        roadmapApproved: null,
      },
      market: {
        kind: 'last_observed',
        asOf: '2026-05-09T20:57:00.000Z',
        slot: 345000012,
        thresholdBps: 300,
        decision: {
          passing: false,
          marginPct: -5.75,
          targetPassTwap: 0.5768,
        },
        spot: {
          price: 0.552,
          twapPrice: 0.55,
          baseReserves: 220000,
          quoteReserves: 121440,
        },
        pass: {
          price: 0.548,
          twapPrice: 0.545,
          baseReserves: 101000,
          quoteReserves: 55348,
        },
        fail: {
          price: 0.563,
          twapPrice: 0.56,
          baseReserves: 103000,
          quoteReserves: 57989,
        },
        liquidityUsd: 113337,
        source: 'historic_snapshot',
      },
      source: {
        proposal: 'supabase.proposals',
        market: 'historic_snapshot',
      },
    },
  ],
};

const HOME_BOOTSTRAP = {
  builtAt: '2026-07-24T12:00:00.000Z',
  tokens: [
    {
      key: 'loyal',
      live: true,
      name: 'Loyal',
      ticker: 'LOYAL',
      launchpad: 'Permissionless',
      monthlyAllowance: 50000,
    },
  ],
  currentNav: {
    tokens: [
      {
        token: 'loyal',
        ticker: 'LOYAL',
        spot: 0.1291,
        nav: 0.142,
        change24h: -1.4,
        marketCap: 1600000,
        treasuryUSDC: 360000,
      },
      {
        token: 'meta',
        ticker: 'META',
        name: 'MetaDAO',
        spot: 4.53,
        nav: 4.82,
        change24h: 0.8,
        marketCap: 45000000,
        treasuryUSDC: 4200000,
      },
      {
        token: 'solo',
        ticker: 'SOLO',
        name: 'Solomon',
        spot: 0.552,
        nav: 0.61,
        change24h: -0.4,
        marketCap: 9000000,
        treasuryUSDC: 780000,
      },
    ],
  },
  marketTickers: {},
};

function hourlyHistory(proposalId, ticker, base, options = {}) {
  const series = options.empty ? [] : Array.from({ length: 16 }, (_, offset) => ({
    timestamp: new Date(Date.parse('2026-06-16T14:00:00.000Z') + offset * 15 * 60_000).toISOString(),
    observedAt: new Date(Date.parse('2026-06-16T14:00:00.000Z') + offset * 15 * 60_000).toISOString(),
    underlyingPrice: options.missingUnderlying ? null : base + offset * 0.01,
    passPrice: base + 0.2 + offset * 0.015,
    failPrice: base - 0.1 + offset * 0.005,
    passTwap: base + 0.18 + offset * 0.01,
    failTwap: base - 0.08 + offset * 0.004,
    sampleCount: 1,
  }));
  const coverage = {
    underlying: series.filter(point => Number.isFinite(point.underlyingPrice)).length,
    pass: series.filter(point => Number.isFinite(point.passPrice)).length,
    passTwap: series.filter(point => Number.isFinite(point.passTwap)).length,
    fail: series.filter(point => Number.isFinite(point.failPrice)).length,
    failTwap: series.filter(point => Number.isFinite(point.failTwap)).length,
  };
  return {
    proposalId,
    interval: '15m',
    requestedInterval: '15m',
    availability: series.length
      ? coverage.underlying ? 'complete' : 'partial'
      : 'unavailable',
    preTwap: series[1]
      ? new Date(new Date(series[1].timestamp).getTime() + 10 * 60_000).toISOString()
      : null,
    series,
    summary: {
      pointCount: series.length,
      from: series[0]?.timestamp || null,
      to: series[series.length - 1]?.timestamp || null,
      coverage,
    },
    source: {
      provider: '01Resolved',
      sourceInterval: '15m',
      interval: '15m',
      requestedInterval: '15m',
      aggregation: 'last_non_null_observation_per_utc_15_minute_bucket',
    },
    degraded: { active: false, services: [], issues: [] },
    ticker,
  };
}

const PROPOSAL_HISTORIES = {
  [PROPOSAL_ID]: hourlyHistory(PROPOSAL_ID, 'LOYAL', 0.13),
  [PASSED_PROPOSAL_ID]: hourlyHistory(PASSED_PROPOSAL_ID, 'META', 4.5),
  [FAILED_PROPOSAL_ID]: hourlyHistory(FAILED_PROPOSAL_ID, 'SOLO', 0.55, { empty: true }),
};

const PROPOSAL_MARKET_DATA = {
  proposalId: PROPOSAL_ID,
  asOf: '2026-07-24T12:00:02.000Z',
  slot: 355000002,
  cluster: 'solana:mainnet',
  books: {
    pass: {
      branch: 'pass',
      address: '9v4GNDfcH8mgkRqtxppvX2J18cgeV9jfsx9MZMAgf1KE',
      baseMint: ACTIVE_MARKETS.markets[0].proposal.passBaseMint,
      quoteMint: ACTIVE_MARKETS.markets[0].proposal.passQuoteMint,
      baseDecimals: 6,
      quoteDecimals: 6,
      canonical: true,
      bestBid: 0.13,
      bestAsk: 0.14,
      bids: [{ price: 0.13, amount: 20, cumulativeAmount: 20, orderCount: 1 }],
      asks: [{ price: 0.14, amount: 10, cumulativeAmount: 10, orderCount: 1 }],
      depositedBalances: [{
        asset: 'base',
        mint: ACTIVE_MARKETS.markets[0].proposal.passBaseMint,
        amount: 4.125,
        decimals: 6,
      }],
    },
    fail: {
      branch: 'fail',
      address: 'BgyWph6JmdQBdwXyhovKSidmC9Yn84oB6bsGnYeSYCZU',
      baseMint: ACTIVE_MARKETS.markets[0].proposal.failBaseMint,
      quoteMint: ACTIVE_MARKETS.markets[0].proposal.failQuoteMint,
      baseDecimals: 6,
      quoteDecimals: 6,
      canonical: true,
      bestBid: 0.12,
      bestAsk: 0.13,
      bids: [{ price: 0.12, amount: 20, cumulativeAmount: 20, orderCount: 1 }],
      asks: [{ price: 0.13, amount: 10, cumulativeAmount: 10, orderCount: 1 }],
    },
  },
  recentTrades: [],
  openOrders: [],
  source: {
    orderbooks: 'solana.manifest',
    recentTrades: 'public-index',
  },
  degraded: { active: false, services: [], issues: [] },
};

const RECURRING_CONFIG = {
  enabled: false,
  keeperReady: false,
  programId: null,
  minimumIntervalSeconds: 3_600,
  maximumCycles: 365,
};

const PROGRAM_INTEGRITY = {
  status: 'verified',
  canTransact: true,
  cluster: 'solana:mainnet',
  checkedAt: '2026-07-25T22:00:00.000Z',
  rpcSlot: 435000000,
  programs: [
    ['metadao-futarchy', testAddress(31), testAddress(41)],
    ['metadao-conditional-vault', testAddress(32), testAddress(42)],
    ['manifest-core', testAddress(33), testAddress(43)],
    ['manifest-wrapper', testAddress(34), testAddress(44)],
  ].map(([key, programId, programDataAddress], index) => ({
    key,
    label: key,
    programId,
    programDataAddress,
    expectedDeploymentSlot: String(400000000 + index),
    observedDeploymentSlot: String(400000000 + index),
    upgradeAuthority: testAddress(51 + index),
    observedUpgradeAuthority: testAddress(51 + index),
    status: 'verified',
  })),
  issues: [],
};

async function loadTerminalModule() {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, '../../src/markets/decision-market-controller.js'),
  );
  const loaded = await import(moduleUrl.href);
  return {
    ...loaded,
    mountFutardTerminal(options = {}) {
      return loaded.mountFutardTerminal({
        executionRelease: ACTIVE_EXECUTION_RELEASE,
        ...options,
      });
    },
  };
}

async function loadProposalChartModule() {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, '../../src/markets/proposal-history-chart.js'),
  );
  return import(moduleUrl.href);
}

function makeWindow(options = {}) {
  const marketWalletSlot = options.marketWalletSlot
    ? `
      <header class="site-header">
        <span data-test-brand>01r.trade</span>
        <div
          data-01rx-market-wallet-slot
          data-01r-theme-scope
          data-theme="dark"
        ></div>
      </header>
    `
    : '';
  const sidebar = options.sidebar
    ? `
      <section id="tlp-decisions-panel" hidden>
        <span id="tp-decision-markets-title">
          <span data-market-sidebar-section-title="all">Decisions</span>
          <span data-market-sidebar-section-title="markets">Decisions</span>
        </span>
        <div id="tlp-decisions-list">
          <div class="tp-decisions-empty tp-live-decisions-empty" id="tp-live-decisions-empty" role="status" aria-live="polite"><strong>0 decisions live</strong></div>
        </div>
        <div id="tlp-past-decisions-list"></div>
      </section>
    `
    : '';
  const dom = new JSDOM(`<!doctype html>${marketWalletSlot}${sidebar}<div id="root"></div>`, {
    url: options.url || 'https://navgator.xyz/',
  });
  const { window } = dom;
  const requests = [];
  const responses = {
    activeMarkets: options.activeMarkets || ACTIVE_MARKETS,
    proposalIndex: options.proposalIndex || PROPOSAL_INDEX,
    homeBootstrap: options.homeBootstrap || HOME_BOOTSTRAP,
    currentNav: options.currentNav || HOME_BOOTSTRAP.currentNav,
    proposalHistories: options.proposalHistories || PROPOSAL_HISTORIES,
    proposalMarketData: options.proposalMarketData || PROPOSAL_MARKET_DATA,
    recurringConfig: options.recurringConfig || RECURRING_CONFIG,
    programIntegrity: options.programIntegrity || PROGRAM_INTEGRITY,
  };

  window.matchMedia = query => ({
    matches: query.includes('light'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  window.open = () => null;
  if (options.provider) {
    window.solana = options.provider;
    window.phantom = { solana: options.provider };
  }
  window.NAVGATOR = {
    api: {
      baseUrl: 'https://navgator.xyz',
      async json(url, requestOptions = {}) {
        requests.push(url);
        if (/\/api\/v1\/futarchy\?view=active-markets$/.test(url)) {
          if (options.activeMarketsError) throw options.activeMarketsError;
          if (typeof options.activeMarketsResponder === 'function') {
            return options.activeMarketsResponder(url, requestOptions, responses);
          }
          return { ok: true, data: responses.activeMarkets };
        }
        if (/\/api\/v1\/futarchy\?view=proposals(?:&|$)/.test(url)) {
          if (options.proposalIndexError) throw options.proposalIndexError;
          if (typeof options.proposalIndexResponder === 'function') {
            return options.proposalIndexResponder(url, requestOptions, responses);
          }
          return { ok: true, data: responses.proposalIndex };
        }
        if (/\/api\/beta\/futarchy\?view=recurring-config$/.test(url)) {
          return { ok: true, data: responses.recurringConfig };
        }
        if (/\/api\/beta\/futarchy\?view=integrity$/.test(url)) {
          if (options.programIntegrityError) throw options.programIntegrityError;
          return { ok: true, data: responses.programIntegrity };
        }
        if (/\/api\/home-bootstrap\?cacheOnly=1$/.test(url)) {
          return { ok: true, data: responses.homeBootstrap };
        }
        if (/\/api\/current-nav\?includeInactive=1$/.test(url)) {
          if (options.currentNavError) throw options.currentNavError;
          return { ok: true, data: responses.currentNav };
        }
        if (/\/api\/v1\/futarchy\?view=proposal-history/.test(url)) {
          if (typeof options.proposalHistoryResponder === 'function') {
            return options.proposalHistoryResponder(url, requestOptions);
          }
          if (options.proposalHistoryError) throw options.proposalHistoryError;
          const proposalId = new URL(url).searchParams.get('proposal');
          return {
            ok: true,
            data: responses.proposalHistories[proposalId]
              || hourlyHistory(proposalId, 'TOKEN', 1, { empty: true }),
          };
        }
        if (/\/api\/beta\/futarchy\?view=positions/.test(url)) {
          return {
            ok: true,
            data: {
              owner: WALLET_ADDRESS,
              proposalId: PROPOSAL_ID,
              asOf: '2026-07-24T12:00:01.000Z',
              slot: 355000001,
              degraded: {
                active: true,
                services: ['solana-token-balance-unavailable'],
              },
              balances: [
                {
                  label: 'base',
                  mint: ACTIVE_MARKETS.markets[0].baseMint,
                  available: true,
                  amount: 8,
                  amountString: '8',
                  rawAmount: '8000000',
                  decimals: 6,
                },
                {
                  label: 'quote',
                  mint: ACTIVE_MARKETS.markets[0].quoteMint,
                  available: true,
                  amount: 50,
                  amountString: '50',
                  rawAmount: '50000000',
                  decimals: 6,
                },
                {
                  label: 'passBase',
                  mint: PROPOSAL_ID,
                  available: true,
                  amount: 125.25,
                  amountString: '125.250000000000000001',
                  rawAmount: '125250000000000000001',
                  decimals: 18,
                },
                {
                  label: 'failQuote',
                  mint: 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK',
                  available: false,
                  amount: null,
                  amountString: null,
                  rawAmount: null,
                  decimals: 6,
                },
              ],
            },
          };
        }
        if (/\/api\/beta\/futarchy\?view=market-data/.test(url)) {
          if (typeof options.proposalMarketDataResponder === 'function') {
            return options.proposalMarketDataResponder(url, requestOptions, responses);
          }
          return {
            ok: true,
            data: responses.proposalMarketData,
          };
        }
        if (/\/api\/beta\/trading\?view=decision-attest$/.test(url)) {
          if (typeof options.decisionAttestResponder === 'function') {
            return {
              ok: true,
              data: await options.decisionAttestResponder(
                JSON.parse(requestOptions.body || '{}'),
                requestOptions,
              ),
            };
          }
        }
        if (/\/api\/beta\/trading\?view=spot-order$/.test(url)) {
          if (typeof options.spotOrderResponder === 'function') {
            return {
              ok: true,
              data: await options.spotOrderResponder(
                JSON.parse(requestOptions.body || '{}'),
                requestOptions,
              ),
            };
          }
        }
        if (/\/api\/beta\/trading\?view=spot-submit$/.test(url)) {
          if (typeof options.spotSubmitResponder === 'function') {
            return {
              ok: true,
              data: await options.spotSubmitResponder(
                JSON.parse(requestOptions.body || '{}'),
                requestOptions,
              ),
            };
          }
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    },
    projectMetadata: options.projectMetadata || {},
  };
  if (options.provider) {
    window.NAVGATOR.solanaTrading = {
      discoverWalletOptions() {
        return [{
          id: 'legacy:test-wallet',
          kind: 'legacy',
          name: 'Test wallet',
          canTransact: typeof options.provider.signTransaction === 'function',
          canSignTransaction: typeof options.provider.signTransaction === 'function',
          provider: options.provider,
        }];
      },
      async connectWalletOption(option) {
        const result = await option.provider.connect();
        const address = String(result?.publicKey || option.provider.publicKey || '');
        return {
          kind: 'legacy',
          name: option.name,
          address,
          canTransact: option.canTransact,
          canSignTransaction: option.canSignTransaction,
          provider: option.provider,
          subscribe() {
            return () => {};
          },
          async disconnect() {
            await option.provider.disconnect?.();
          },
        };
      },
      ...options.solanaTradingOverrides,
    };
  }

  return {
    requests,
    root: window.document.getElementById('root'),
    window,
  };
}

function byAction(root, action) {
  return root.querySelector(`[data-ft-action="${action}"]`);
}

function byRole(root, role) {
  return root.querySelector(`[data-ft-role="${role}"]`);
}

function byRegion(root, region) {
  return root.querySelector(`[data-ft-region="${region}"]`);
}

function proposalRows(root) {
  return Array.from(root.querySelectorAll('[data-ft-role="proposal-row"]'));
}

function proposalRowByState(root, state) {
  return root.querySelector(
    `[data-ft-role="proposal-row"][data-ft-proposal-state="${state}"]`,
  );
}

function proposalRowByOutcome(root, outcome) {
  return root.querySelector(
    `[data-ft-role="proposal-row"][data-ft-proposal-outcome="${outcome}"]`,
  );
}

function filterButton(root, status) {
  return root.querySelector(
    `[data-ft-action="filter"][data-ft-filter="${status}"]`,
  );
}

function actionWithText(root, action, pattern) {
  return Array.from(root.querySelectorAll(`[data-ft-action="${action}"]`))
    .find(element => pattern.test(element.textContent || ''));
}

async function settle(window) {
  await new Promise(resolve => window.setTimeout(resolve, 0));
  await Promise.resolve();
}

async function settleUntil(window, predicate, attempts = 100) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return true;
    await new Promise(resolve => window.setTimeout(resolve, 10));
  }
  return predicate();
}

function trackMount(controller, window) {
  const entry = { controller, window };
  mountedTerminals.add(entry);
  return entry;
}

function cleanupMount(entry) {
  if (!entry) return;
  mountedTerminals.delete(entry);
  entry.controller.destroy();
  entry.window.close();
}

test.afterEach(() => {
  for (const entry of mountedTerminals) cleanupMount(entry);
});

test('15-minute history normalization preserves missing series and chart gaps', async () => {
  const {
    normalizeProposalHistoryPayload,
    proposalTwapWindowInitialScrollLeft,
    proposalTwapWindowProgress,
    proposalHistoryPhase,
    renderHourlyPriceChart,
  } = await loadTerminalModule();
  const history = normalizeProposalHistoryPayload({
    proposalId: PASSED_PROPOSAL_ID,
    preTwap: '2026-06-16T11:00:00.000Z',
    thresholdBps: '275',
    series: [
      {
        timestamp: '2026-06-16T10:00:00.000Z',
        underlyingPrice: '4.5',
        passTwap: '4.7',
        failPrice: '4.4',
      },
      {
        timestamp: 'invalid',
        underlyingPrice: 999,
        passPrice: 999,
        failPrice: 999,
      },
      {
        timestamp: '2026-06-16T10:00:00.000Z',
        underlyingPrice: '4.6',
        passPrice: null,
        passTwap: '4.8',
        failPrice: '4.45',
      },
      {
        timestamp: '2026-06-16T12:00:00.000Z',
        underlyingPrice: '4.7',
        passPrice: '4.9',
        failPrice: '-1',
      },
    ],
    source: {
      provider: '01Resolved',
      sourceInterval: '15m',
      thresholdEndpoint: '/v1/proposal/{publicKey}/threshold-chart?timeInterval=max',
    },
  });

  assert.equal(history.series.length, 2);
  assert.equal(history.series[0].underlyingPrice, 4.6);
  assert.equal(history.series[0].passPrice, null);
  assert.equal(history.series[0].passTwap, 4.8);
  assert.equal(history.series[1].failPrice, null);
  assert.equal(history.summary.coverage.passTwap, 1);
  assert.equal(history.summary.coverage.failTwap, 0);
  assert.equal(history.preTwap, '2026-06-16T11:00:00.000Z');
  assert.equal(history.thresholdBps, 275);
  assert.equal(history.thresholdPct, 2.75);
  assert.equal(
    history.source.thresholdEndpoint,
    '/v1/proposal/{publicKey}/threshold-chart?timeInterval=max',
  );

  const dom = new JSDOM(renderHourlyPriceChart(history, 'META', {
    windowEndedAt: '2026-06-16T11:30:00.000Z',
    now: Date.parse('2026-06-16T11:15:00.000Z'),
    proposal: {
      id: PASSED_PROPOSAL_ID,
      number: 12,
      title: 'Acquire protocol-owned liquidity',
      description: 'Authorize the DAO to acquire protocol-owned liquidity.',
      statusLabel: 'Live',
      createdAt: '2026-06-15T10:00:00.000Z',
      endsAt: '2026-06-16T11:30:00.000Z',
      proposer: PASSED_PROPOSAL_ID,
      sourceUrl: `https://www.metadao.fi/projects/meta/proposal/${PASSED_PROPOSAL_ID}`,
      isTeamSponsored: true,
    },
    proposalDetailsOpen: true,
  }));
  const chart = dom.window.document;
  assert.equal(chart.querySelectorAll('[data-ft-series]').length, 0);
  assert.deepEqual(
    [...chart.querySelectorAll('[data-ft-action="toggle-hourly-series"]')]
      .map(control => control.dataset.ftSeriesField),
    ['underlyingPrice', 'passPrice', 'failPrice'],
  );
  assert.equal(chart.querySelectorAll('[data-ft-action="hourly-range"]').length, 0);
  assert.equal(chart.querySelector('[data-ft-role="hourly-range-trigger"]'), null);
  assert.equal(chart.querySelector('[data-ft-role="hourly-range-menu"]'), null);
  assert.equal(chart.querySelectorAll('[data-ft-role="hourly-series-trigger"]').length, 0);
  assert.equal(chart.querySelectorAll('[data-ft-role="hourly-series-menu"]').length, 0);
  assert.equal(chart.querySelector('[data-ft-readout-value="passTwap"]'), null);
  assert.equal(chart.querySelector('[data-ft-readout-value="failTwap"]'), null);
  assert.equal(chart.querySelector('[data-ft-series-field="decisionEdge"]'), null);
  assert.equal(chart.querySelector('[data-ft-readout-value="decisionEdge"]'), null);
  assert.equal(chart.querySelector('[aria-label="Hide annotations placeholder"]'), null);
  assert.equal(chart.querySelector('[aria-label="TradingView undo placeholder"]'), null);
  assert.equal(chart.querySelector('[aria-label="TradingView redo placeholder"]'), null);
  assert.equal(chart.querySelector('[aria-label="TradingView snapshot placeholder"]'), null);
  assert.equal(chart.querySelector('[aria-label="TradingView chart type placeholder"]'), null);
  assert.equal(chart.querySelector('[aria-label="TradingView indicators placeholder"]'), null);
  assert.equal(chart.querySelector('[aria-label="TradingView toolbar menu placeholder"]'), null);
  assert.equal(chart.querySelector('[aria-label="TradingView quick search placeholder"]'), null);
  assert.equal(chart.querySelector('[aria-label="TradingView settings placeholder"]'), null);
  assert.equal(chart.querySelectorAll('[data-ft-action="hourly-chart-tool"]').length, 0);
  assert.equal(chart.querySelector('.ft-chart-crosshair-rail'), null);
  assert.equal(chart.querySelector('.ft-hourly-toolbar'), null);
  assert.equal(chart.querySelector('.ft-proposal-details-trigger'), null);
  assert.equal(chart.querySelector('[data-ft-role="proposal-details"]'), null);
  assert.equal(chart.querySelector('[data-ft-action="toggle-chart-expansion"]'), null);
  assert.equal(
    chart.querySelector('[data-ft-role="proposal-history-liveline"]')
      .dataset.ftChartEngine,
    'liveline',
  );
  assert.match(
    chart.querySelector('[data-ft-role="proposal-history-liveline"]')
      .getAttribute('aria-label'),
    /indexed PASS and FAIL TWAP series/,
  );
  assert.equal(chart.querySelector('[data-ft-role="tradingview-attribution"]'), null);
  assert.equal(chart.querySelector('[data-ft-role="proposal-history-fallback"]'), null);
  assert.equal(chart.querySelector('.ft-hourly-plot-shell svg[viewBox="0 0 1000 1000"]'), null);
  assert.equal(chart.querySelector('[data-ft-chart-anchor="shared-launch-reserve"]'), null);
  assert.equal(chart.querySelector('.ft-hourly-chart-foot'), null);
  const twapProgress = chart.querySelector('[data-ft-role="twap-window-progress"]');
  assert.ok(twapProgress);
  assert.equal(twapProgress.dataset.ftTwapState, 'active');
  assert.ok(twapProgress.querySelector('[data-ft-role="twap-window-scroll"]'));
  assert.equal(
    twapProgress.querySelector('[data-ft-role="twap-window-scroll"]').tabIndex,
    0,
  );
  assert.ok(twapProgress.querySelector('.ft-twap-window-timeline'));
  assert.ok(twapProgress.querySelector('.ft-twap-window-now'));
  assert.equal(
    twapProgress.querySelector('[data-ft-role="twap-window-percent"]').textContent,
    '50%',
  );
  assert.equal(
    twapProgress.querySelector('[data-ft-role="twap-window-track"]')
      .getAttribute('aria-valuenow'),
    '50',
  );
  assert.equal(
    chart.querySelector('.ft-hourly-plot-shell').classList.contains('ft-has-twap-progress'),
    true,
  );
  assert.deepEqual(
    proposalTwapWindowProgress(
      '2026-06-16T11:00:00.000Z',
      '2026-06-16T12:00:00.000Z',
      Date.parse('2026-06-16T11:39:00.000Z'),
    ),
    {
      openedAt: Date.parse('2026-06-16T11:00:00.000Z'),
      closedAt: Date.parse('2026-06-16T12:00:00.000Z'),
      progress: 0.65,
      percent: 65,
      state: 'active',
    },
  );
  assert.equal(
    proposalTwapWindowProgress(
      '2026-06-16T11:00:00.000Z',
      '2026-06-16T11:00:00.000Z',
      Date.parse('2026-06-16T11:00:00.000Z'),
    ),
    null,
  );
  assert.equal(
    proposalTwapWindowInitialScrollLeft(1, 'complete', 1_727, 339),
    0,
  );
  assert.equal(
    proposalTwapWindowInitialScrollLeft(0.5, 'active', 1_727, 339),
    694,
  );
  assert.equal(chart.querySelector('.ft-hourly-values'), null);
  assert.equal(chart.querySelector('[data-ft-role="pre-twap-definition"]'), null);
  assert.equal(chart.querySelectorAll('[data-ft-chart-boundary]').length, 0);
  assert.deepEqual(
    proposalHistoryPhase(
      { timestamp: '2026-06-16T10:00:00.000Z' },
      '2026-06-16T10:45:00.000Z',
    ),
    { key: 'start', label: 'TWAP START HOUR' },
  );
  assert.deepEqual(
    proposalHistoryPhase(
      { timestamp: '2026-06-16T09:00:00.000Z' },
      '2026-06-16T10:00:00.000Z',
    ),
    { key: 'pre', label: 'PRE-TWAP' },
  );
  assert.deepEqual(
    proposalHistoryPhase(
      { timestamp: '2026-06-16T10:00:00.000Z' },
      '2026-06-16T10:00:00.000Z',
    ),
    { key: 'window', label: 'TWAP WINDOW' },
  );
  assert.equal(
    proposalHistoryPhase({ timestamp: 'invalid' }, '2026-06-16T10:00:00.000Z'),
    null,
  );
  dom.window.close();
});

test('Liveline chart adapter splits null values and missing hours into honest segments', async () => {
  const {
    PROPOSAL_HISTORY_CROSSHAIR_MARKERS_VISIBLE,
    PROPOSAL_HISTORY_GUIDE_LINE_STYLE,
    PROPOSAL_HISTORY_MIN_BAR_SPACING,
    PROPOSAL_HISTORY_SERIES,
    interpolateChartTimeCoordinate,
    proposalChartBoundaryEvents,
    proposalChartBoundaryEndpoints,
    proposalChartBoundaryTimeline,
    proposalChartData,
    proposalChartDisplayRange,
    proposalChartEndpoint,
    proposalChartLiveEndpoints,
    proposalChartLineType,
    proposalChartMaximumLogicalWidth,
    proposalChartObservedRange,
    proposalLaunchSeriesMarker,
    normalizeProposalChartLivePoint,
    splitProposalChartSeries,
  } = await loadProposalChartModule();
  const points = [
    { timestamp: '2026-06-16T10:00:00.000Z', passPrice: 4.5 },
    { timestamp: '2026-06-16T11:00:00.000Z', passPrice: 4.6 },
    { timestamp: '2026-06-16T12:00:00.000Z', passPrice: null },
    { timestamp: '2026-06-16T13:00:00.000Z', passPrice: 4.7 },
    { timestamp: '2026-06-16T15:00:00.000Z', passPrice: 4.8 },
  ];

  const segments = splitProposalChartSeries(points, 'passPrice');
  assert.deepEqual(segments.map(segment => segment.map(point => point.value)), [
    [4.5, 4.6],
    [4.7],
    [4.8],
  ]);
  assert.deepEqual(
    proposalChartData(points, 'passPrice').map(point => (
      Number.isFinite(point.value) ? point.value : null
    )),
    [4.5, 4.6, null, 4.7, null, 4.8],
  );
  assert.deepEqual(
    proposalChartData([{
      timestamp: '2026-06-16T10:00:00.000Z',
      decisionEdge: -2.5,
    }, {
      timestamp: '2026-06-16T11:00:00.000Z',
      decisionEdge: 3.25,
    }], 'decisionEdge').map(point => point.value),
    [-2.5, 3.25],
  );

  const ten = Date.parse('2026-06-16T10:00:00.000Z') / 1_000;
  const eleven = ten + 3_600;
  assert.equal(
    interpolateChartTimeCoordinate(
      ten + 1_800,
      [ten, eleven],
      time => new Map([[ten, 100], [eleven, 200]]).get(time) ?? null,
    ),
    150,
  );
  assert.equal(
    PROPOSAL_HISTORY_SERIES.find(series => series.field === 'failPrice').lineStyle,
    PROPOSAL_HISTORY_SERIES.find(series => series.field === 'passPrice').lineStyle,
  );
  assert.equal(
    PROPOSAL_HISTORY_SERIES.find(series => series.field === 'underlyingPrice').lineStyle,
    PROPOSAL_HISTORY_SERIES.find(series => series.field === 'passPrice').lineStyle,
  );
  assert.equal(
    PROPOSAL_HISTORY_SERIES.find(series => series.field === 'underlyingPrice').lineWidth,
    2,
  );
  assert.deepEqual(
    ['underlyingPrice', 'passPrice', 'failPrice'].map(field => (
      proposalChartLineType(
        PROPOSAL_HISTORY_SERIES.find(series => series.field === field),
      )
    )),
    [2, 2, 2],
  );
  assert.equal(
    proposalChartLineType(
      PROPOSAL_HISTORY_SERIES.find(series => series.field === 'passTwap'),
    ),
    0,
  );
  assert.equal(
    PROPOSAL_HISTORY_SERIES.find(series => series.field === 'passTwap').lineStyle,
    2,
  );
  assert.equal(
    PROPOSAL_HISTORY_SERIES.find(series => series.field === 'failTwap').lineWidth,
    1,
  );
  assert.deepEqual(
    {
      percent: PROPOSAL_HISTORY_SERIES.find(
        series => series.field === 'decisionEdge',
      ).percent,
      priceScaleId: PROPOSAL_HISTORY_SERIES.find(
        series => series.field === 'decisionEdge',
      ).priceScaleId,
      seriesType: PROPOSAL_HISTORY_SERIES.find(
        series => series.field === 'decisionEdge',
      ).seriesType,
      signed: PROPOSAL_HISTORY_SERIES.find(
        series => series.field === 'decisionEdge',
      ).signed,
    },
    {
      percent: true,
      priceScaleId: 'left',
      seriesType: 'baseline',
      signed: true,
    },
  );
  assert.deepEqual(
    PROPOSAL_HISTORY_SERIES.map(series => series.label),
    ['Price', 'Pass', 'Fail', 'Pass edge', 'Pass TWAP', 'Fail TWAP'],
  );
  assert.equal(PROPOSAL_HISTORY_CROSSHAIR_MARKERS_VISIBLE, false);
  assert.equal(PROPOSAL_HISTORY_GUIDE_LINE_STYLE, 4);
  assert.equal(PROPOSAL_HISTORY_MIN_BAR_SPACING, 0.5);
  assert.equal(proposalChartMaximumLogicalWidth(2), 24);
  assert.equal(proposalChartMaximumLogicalWidth(16), 48);
  assert.equal(proposalChartMaximumLogicalWidth(5, 20), 60);
  assert.deepEqual(
    proposalChartBoundaryEvents(
      '2026-06-17T10:00:00.000Z',
      '2026-06-18T10:00:00.000Z',
    ),
    [
      {
        kind: 'twap-start',
        time: Date.parse('2026-06-17T10:00:00.000Z') / 1_000,
      },
      {
        kind: 'twap-end',
        time: Date.parse('2026-06-18T10:00:00.000Z') / 1_000,
      },
    ],
  );
  assert.deepEqual(
    proposalChartBoundaryTimeline(
      [
        { time: Date.parse('2026-06-16T11:00:00.000Z') / 1_000 },
        { time: Date.parse('2026-06-16T13:00:00.000Z') / 1_000 },
      ],
      [Date.parse('2026-06-16T10:00:00.000Z') / 1_000],
      '1h',
    ),
    [10, 11, 12, 13].map(hour => (
      Date.parse(`2026-06-16T${hour}:00:00.000Z`) / 1_000
    )),
  );
  assert.deepEqual(
    proposalChartObservedRange(
      [
        Date.parse('2026-06-16T10:00:00.000Z') / 1_000,
        Date.parse('2026-06-16T15:00:00.000Z') / 1_000,
      ],
      '1h',
    ),
    {
      from: Date.parse('2026-06-16T10:00:00.000Z') / 1_000,
      to: Date.parse('2026-06-16T15:00:00.000Z') / 1_000,
    },
  );
  assert.deepEqual(
    proposalChartDisplayRange(
      [Date.parse('2026-06-16T10:00:00.000Z') / 1_000],
      proposalChartBoundaryEvents(
        '2026-06-16T11:00:00.000Z',
        '2026-06-16T15:00:00.000Z',
      ),
      '1h',
    ),
    {
      from: Date.parse('2026-06-16T10:00:00.000Z') / 1_000,
      to: Date.parse('2026-06-16T17:00:00.000Z') / 1_000,
    },
  );
  assert.deepEqual(
    proposalChartObservedRange(
      [Date.parse('2026-06-16T10:00:00.000Z') / 1_000],
      '1h',
    ),
    {
      from: Date.parse('2026-06-16T09:00:00.000Z') / 1_000,
      to: Date.parse('2026-06-16T11:00:00.000Z') / 1_000,
    },
  );
  assert.deepEqual(
    proposalChartBoundaryEndpoints(points, 'passPrice'),
    {
      start: {
        time: Date.parse('2026-06-16T10:00:00.000Z') / 1_000,
        value: 4.5,
      },
      end: {
        time: Date.parse('2026-06-16T15:00:00.000Z') / 1_000,
        value: 4.8,
      },
    },
  );
  assert.deepEqual(
    proposalChartEndpoint(points, 'passPrice'),
    {
      time: Date.parse('2026-06-16T15:00:00.000Z') / 1_000,
      value: 4.8,
    },
  );
  assert.equal(proposalChartEndpoint(points, 'failPrice'), null);
  assert.deepEqual(
    proposalChartLiveEndpoints([{
      timestamp: '2026-06-16T15:00:00.000Z',
      underlyingPrice: 4.75,
      passPrice: 4.8,
      failPrice: 4.7,
    }]).map(({ field, key, endpoint }) => ({ field, key, endpoint })),
    [
      {
        field: 'underlyingPrice',
        key: 'price',
        endpoint: {
          time: Date.parse('2026-06-16T15:00:00.000Z') / 1_000,
          value: 4.75,
        },
      },
      {
        field: 'passPrice',
        key: 'pass',
        endpoint: {
          time: Date.parse('2026-06-16T15:00:00.000Z') / 1_000,
          value: 4.8,
        },
      },
      {
        field: 'failPrice',
        key: 'fail',
        endpoint: {
          time: Date.parse('2026-06-16T15:00:00.000Z') / 1_000,
          value: 4.7,
        },
      },
    ],
  );
  assert.deepEqual(
    normalizeProposalChartLivePoint({
      timestamp: '2026-06-16T14:59:30.000Z',
      underlyingPrice: 4.72,
      passPrice: 4.81,
      failPrice: 4.61,
    }, Date.parse('2026-06-16T15:00:00.000Z') / 1_000),
    {
      time: Date.parse('2026-06-16T15:00:00.000Z') / 1_000,
      values: {
        underlyingPrice: 4.72,
        decisionEdge: null,
        passPrice: 4.81,
        passTwap: null,
        failPrice: 4.61,
        failTwap: null,
      },
    },
  );
  assert.equal(normalizeProposalChartLivePoint({ timestamp: 'invalid' }), null);
  assert.deepEqual(
    proposalLaunchSeriesMarker({
      chartTimestamp: '2026-06-16T09:30:00.000Z',
      underlyingPrice: 4.4,
    }),
    {
      id: 'shared-launch-reserve',
      time: Date.parse('2026-06-16T09:30:00.000Z') / 1_000,
      position: 'atPriceMiddle',
      price: 4.4,
      shape: 'circle',
      color: '#ffffff',
      size: 0.5,
    },
  );
});

test('chart default readout never mixes prices from different observations', async () => {
  const { renderHourlyPriceChart } = await loadTerminalModule();
  const history = {
    series: [
      {
        timestamp: '2026-06-16T10:00:00.000Z',
        underlyingPrice: 9,
        passPrice: 10,
        failPrice: 8,
      },
      {
        timestamp: '2026-06-16T11:00:00.000Z',
        underlyingPrice: 8.5,
        passPrice: null,
        failPrice: 8,
      },
    ],
    summary: {
      coverage: { underlying: 2, pass: 1, fail: 2 },
    },
    source: { provider: '01Resolved' },
  };

  const dom = new JSDOM(renderHourlyPriceChart(history, 'META'));
  const chart = dom.window.document;
  assert.equal(chart.querySelector('[data-ft-readout-value="passPrice"]').textContent, '—');
  assert.equal(chart.querySelector('[data-ft-readout-value="failPrice"]').textContent, '$8.000');
  assert.equal(chart.querySelector('[data-ft-readout-spot-change="passPrice"]').textContent, '—');
  assert.equal(chart.querySelector('[data-ft-readout-spot-change="failPrice"]').textContent, '-5.88%');
  assert.equal(
    chart.querySelector('[data-ft-readout-spot-change="failPrice"]')
      .classList.contains('ft-is-negative'),
    true,
  );
  assert.equal(chart.querySelector('[data-ft-role="hourly-spread"]'), null);
  assert.match(chart.querySelector('[data-ft-role="hourly-readout-time"]').textContent, /6\/16\/26 · 11:00 UTC/);
  assert.equal(chart.querySelector('.ft-hourly-phase-definition'), null);
  assert.equal(chart.querySelector('[data-ft-role="pre-twap-definition"]'), null);
  assert.equal(chart.querySelector('.ft-hourly-phase-cell'), null);
  dom.window.close();
});

test('proposal readout compares each conditional price with same-time spot', async () => {
  const { renderHourlyPriceChart } = await loadTerminalModule();
  const history = {
    series: [{
      timestamp: '2026-08-02T16:30:00.000Z',
      underlyingPrice: 0.27929,
      passPrice: 0.2336,
      failPrice: 0.27973,
    }],
    summary: { coverage: { underlying: 1, pass: 1, fail: 1 } },
    source: { provider: '01Resolved' },
  };

  const dom = new JSDOM(renderHourlyPriceChart(history, 'UMBRA'));
  const chart = dom.window.document;
  const passChange = chart.querySelector('[data-ft-readout-spot-change="passPrice"]');
  const failChange = chart.querySelector('[data-ft-readout-spot-change="failPrice"]');
  assert.match(passChange.parentElement.textContent, /vs spot/);
  assert.match(failChange.parentElement.textContent, /vs spot/);
  assert.equal(passChange.textContent.trim(), '-16.36%');
  assert.equal(passChange.classList.contains('ft-is-negative'), true);
  assert.equal(failChange.textContent.trim(), '+0.16%');
  assert.equal(failChange.classList.contains('ft-is-positive'), true);
  dom.window.close();
});

test('proposal-first terminal renders validated market state and a safe trade intent', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { requests, root, window } = makeWindow();
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();
  await settle(window);

  assert.ok(byRole(root, 'terminal'));
  assert.equal(
    root.querySelector('.product-wordmark')?.textContent.replace(/\s+/g, ''),
    '01r.trade',
  );
  assert.equal(root.getAttribute('data-navgator-app'), 'decision-markets');
  assert.ok(byRole(root, 'market-list'));
  assert.equal(proposalRows(root).length, 3);
  assert.equal(proposalRowByState(root, 'live')?.getAttribute('aria-pressed'), 'true');
  assert.equal(byRole(root, 'proposal-title').textContent.trim(), 'Fund Loyal contributor growth for Q3');
  assert.match(byRole(root, 'pass-card').textContent, /0\.1337/);
  assert.match(byRole(root, 'decision').textContent, /passing/i);
  assert.match(byRole(root, 'decision').textContent, /1\.50%|1\.5%/);
  assert.match(byRole(root, 'decision').textContent, /1\.63/);
  const decisionPressure = byRole(root, 'decision-pressure');
  const tradeTicket = byRole(root, 'trade-ticket');
  assert.ok(decisionPressure);
  assert.ok(tradeTicket);
  assert.ok(decisionPressure.closest('[data-ft-role="proposal-history"], .ft-market-chart-header-region'));
  assert.equal(tradeTicket.contains(decisionPressure), false);
  assert.equal(decisionPressure.dataset.ftAvailable, 'true');
  assert.match(byRole(root, 'remaining-spread').textContent, /PASS avg ≥ \$0\.1298/i);
  assert.match(byRole(root, 'pressure-equivalent-pass').textContent, /If FAIL averages \$0\.1279 through expiry/i);
  assert.match(byRole(root, 'pressure-inputs').textContent, /PASS TWAP/i);
  assert.match(byRole(root, 'pressure-inputs').textContent, /FAIL TWAP/i);
  assert.match(byRole(root, 'pressure-inputs').textContent, /Threshold/i);
  assert.match(decisionPressure.textContent, /Scenario · not forecast/i);
  const currentPressureAssumption = root.querySelector(
    '[data-ft-action="select-pressure-assumption"][data-ft-pressure-assumption="spot"]',
  );
  assert.equal(currentPressureAssumption.getAttribute('aria-pressed'), 'true');
  root.querySelector(
    '[data-ft-action="select-pressure-assumption"][data-ft-pressure-assumption="custom"]',
  ).click();
  const customFailAverage = byRole(root, 'pressure-custom-fail-average');
  assert.equal(customFailAverage.value, '0.1279');
  customFailAverage.value = '0.14';
  customFailAverage.dispatchEvent(new window.Event('input', { bubbles: true }));
  customFailAverage.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.match(byRole(root, 'pressure-equivalent-pass').textContent, /If FAIL averages \$0\.1400 through expiry/i);
  assert.doesNotMatch(tradeTicket.textContent, /Required remaining spread/i);
  assert.ok(byRole(root, 'wallet-status'));
  assert.ok(byRole(root, 'positions'));
  assert.ok(byAction(root, 'connect-wallet'));
  assert.equal(byAction(root, 'refresh'), null);
  assert.equal(root.querySelector('.ft-execution-ticket .ft-ticket-heading'), null);
  assert.match(byRole(root, 'trade-ticket').textContent, /If "Pass"/);
  assert.match(byRole(root, 'trade-ticket').textContent, /If "Fail"/);
  assert.match(byRole(root, 'trade-ticket').textContent, /If pass, I would like to/);
  assert.match(byRole(root, 'trade-ticket').textContent, /LIMIT/);
  assert.match(byRole(root, 'trade-ticket').textContent, /MARKET/);
  assert.match(byRole(root, 'trade-ticket').textContent, /Buy\$0\.1400/);
  assert.match(byRole(root, 'trade-ticket').textContent, /Sell\$0\.1300/);
  assert.equal(byRole(root, 'limit-price'), null);
  assert.equal(
    root.querySelector(
      '[data-ft-action="select-order-type"][data-ft-order-type="swap"]',
    ).getAttribute('aria-pressed'),
    'true',
  );
  assert.match(
    byRole(root, 'amount').closest('.ft-amount-field').textContent,
    /USDC held\s*—/,
  );
  assert.equal(byRole(root, 'average-price').textContent, '$0.1400');
  assert.equal(byRole(root, 'position-before').textContent, '—');
  assert.equal(byRole(root, 'position-after').textContent, '—');
  assert.equal(byRole(root, 'fail-payoff').textContent, '— USDC');
  assert.equal(byRole(root, 'fail-payoff-detail').textContent, '— LOYAL');
  assert.equal(byRole(root, 'pass-payoff').textContent, '— LOYAL');
  assert.equal(byRole(root, 'pass-payoff-detail').textContent, '— USDC');
  assert.deepEqual(
    Array.from(root.querySelectorAll('[data-ft-action="decision-amount-preset"]'))
      .map(element => element.textContent.trim()),
    ['500', '1K', '2.5K', 'Max'],
  );
  root.querySelector(
    '[data-ft-action="decision-amount-preset"][data-ft-amount="500"]',
  ).click();
  assert.equal(byRole(root, 'amount').value, '500');
  assert.notEqual(byRole(root, 'position-after').textContent, '—');
  assert.equal(byRole(root, 'fail-payoff').textContent, '+$500.00 USDC');
  assert.equal(byRole(root, 'fail-payoff-detail').textContent, '0.00 LOYAL');
  assert.match(byRole(root, 'pass-payoff').textContent, /^\+.* LOYAL$/);
  assert.equal(byRole(root, 'pass-payoff-detail').textContent, '−$500.00 USDC');
  assert.deepEqual(
    Array.from(byRole(root, 'pass-card').querySelectorAll('.ft-book-columns span'))
      .map(element => element.textContent.trim()),
    ['Amount', 'Price'],
  );
  assert.deepEqual(
    Array.from(byRole(root, 'fail-card').querySelectorAll('.ft-book-columns span'))
      .map(element => element.textContent.trim()),
    ['Price', 'Amount'],
  );
  assert.match(byRole(root, 'pass-card').querySelector('.ft-book-reference').textContent, /AMM/);
  assert.match(byRole(root, 'pass-card').querySelector('.ft-book-reference').textContent, /Spread/);
  assert.doesNotMatch(byRole(root, 'pass-card').querySelector('.ft-book-reference').textContent, /TWAP/);
  assert.ok(byRole(root, 'proposal-history-chart'));
  const chartHeader = byRole(root, 'proposal-chart-header');
  assert.ok(chartHeader);
  assert.match(chartHeader.textContent, /LOYAL/);
  assert.match(chartHeader.textContent, /Decision #7/);
  assert.equal(
    chartHeader.querySelector('.ft-chart-market-identity small').textContent.trim(),
    'Decision #7',
  );
  assert.equal(chartHeader.querySelector('.ft-decision-market-switcher-chevron'), null);
  assert.doesNotMatch(chartHeader.textContent, /Fund Loyal contributor growth for Q3/);
  assert.equal(chartHeader.querySelector('.ft-chart-market-identity a'), null);
  for (const label of ['If Pass', 'Spot', 'If Fail', 'Threshold', 'Current TWAP']) {
    assert.match(chartHeader.textContent, new RegExp(label));
  }
  assert.equal(
    chartHeader.querySelector('[data-ft-chart-header-metric="pass-price"] strong').textContent,
    '$0.1337',
  );
  assert.equal(
    chartHeader.querySelector('[data-ft-chart-header-metric="spot-price"] strong').textContent,
    '$0.1291',
  );
  assert.equal(
    chartHeader.querySelector('[data-ft-chart-header-metric="fail-price"] strong').textContent,
    '$0.1279',
  );
  assert.equal(chartHeader.querySelector('[data-ft-chart-header-metric="status"]'), null);
  assert.equal(
    chartHeader.querySelector('[data-ft-chart-header-metric="threshold"] strong').textContent,
    '+1.5%',
  );
  const thresholdMetric = chartHeader.querySelector(
    '[data-ft-chart-header-metric="threshold"]',
  );
  const passSignal = chartHeader.querySelector(
    '[data-ft-chart-header-metric="pass-signal"]',
  );
  assert.equal(thresholdMetric.nextElementSibling, passSignal);
  assert.equal(passSignal.querySelector('strong').textContent, '+3.13%');
  assert.equal(passSignal.dataset.tone, 'positive');
  assert.match(passSignal.title, /decision signal, not a probability/);
  assert.doesNotMatch(chartHeader.textContent, /Liquidity/);
  assert.equal(
    byRole(root, 'proposal-history-chart')
      .querySelector('[data-ft-chart-anchor="shared-launch-reserve"]'),
    null,
  );
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelector('.ft-hourly-chart-foot'),
    null,
  );
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelector('.ft-hourly-values'),
    null,
  );
  assert.equal(byRole(root, 'proposal-history').querySelector('.ft-hourly-source-note'), null);
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelectorAll('[data-ft-series]').length,
    0,
  );
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelector('.ft-hourly-toolbar'),
    null,
  );
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelector('.ft-chart-crosshair-rail'),
    null,
  );
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelector('.ft-hourly-growth-control'),
    null,
  );
  assert.ok(requests.some(url => (
    /view=proposal-history/.test(url)
    && new URL(url).searchParams.get('interval') === '15m'
  )));
  assert.equal(requests.some(url => /view=positions/.test(url)), false);

  const execution = byAction(root, 'open-execution');
  assert.ok(execution);
  assert.equal(execution.getAttribute('href'), PROPOSAL_URL);
  assert.equal(execution.getAttribute('target'), '_blank');

  assert.equal(root.querySelector('[data-ft-action="toggle-chat"]'), null);
  assert.equal(root.querySelector('[data-ft-role="chat-form"]'), null);
  assert.doesNotMatch(root.textContent, /proposal count/i);

  const search = byRole(root, 'search');
  search.value = 'not-a-live-market';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(proposalRows(root).length, 0);
  search.value = 'loyal';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(proposalRows(root).length, 1);

  const passButton = actionWithText(root, 'select-outcome', /pass/i);
  const buyButton = actionWithText(root, 'select-side', /buy/i);
  assert.ok(passButton);
  assert.ok(buyButton);
  assert.equal(
    byRole(root, 'trade-ticket').querySelector('[data-ft-action="connect-wallet"]')
      .classList.contains('ft-connect-trade-button'),
    true,
  );
  passButton.click();
  buyButton.click();
  const amount = byRole(root, 'amount');
  amount.value = '100';
  amount.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(byRole(root, 'estimate'), null);
  actionWithText(root, 'select-outcome', /fail/i).click();
  assert.equal(byRole(root, 'pass-payoff').textContent, '+$100.00 USDC');
  assert.equal(byRole(root, 'pass-payoff-detail').textContent, '0.00 LOYAL');
  assert.match(byRole(root, 'fail-payoff').textContent, /^\+.* LOYAL$/);
  assert.equal(byRole(root, 'fail-payoff-detail').textContent, '−$100.00 USDC');
  assert.match(
    byRole(root, 'trade-ticket').querySelector('.ft-execution-ticket').className,
    /ft-order-outcome-fail/,
  );
  assert.equal(
    byRole(root, 'trade-ticket').querySelector('[data-ft-action="connect-wallet"]')
      .classList.contains('ft-connect-trade-button'),
    true,
  );
  actionWithText(root, 'select-activity', /trade history/i).click();
  assert.equal(
    root.querySelector('[data-ft-activity-panel="trades"]').hasAttribute('hidden'),
    false,
  );
  assert.equal(
    root.querySelector('[data-ft-activity-panel="balances"]').hasAttribute('hidden'),
    true,
  );

  const activeRequestsBefore = requests.filter(url => (
    /\/api\/v1\/futarchy\?view=active-markets$/.test(url)
  )).length;
  await controller.refresh();
  await settle(window);
  const activeRequestsAfter = requests.filter(url => (
    /\/api\/v1\/futarchy\?view=active-markets$/.test(url)
  )).length;
  assert.ok(activeRequestsAfter > activeRequestsBefore);
  assert.ok(requests.some(url => /\/api\/v1\/futarchy\?view=proposals$/.test(url)));

  byAction(root, 'toggle-theme').click();
  assert.equal(window.localStorage.getItem('navgator-terminal-theme'), 'dark');

  controller.destroy();
  assert.equal(root.childElementCount, 0);
  cleanupMount(mounted);
});

test('chart market switcher keeps active and prior decisions available without the explorer', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);

  await controller.ready;

  const trigger = byAction(root, 'toggle-decision-market-switcher');
  assert.ok(trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.match(trigger.textContent, /LOYAL/);
  assert.match(trigger.textContent, /Loyal/);
  assert.match(trigger.textContent, /Decision #7/);

  trigger.click();
  const menu = byRole(root, 'decision-market-switcher-menu');
  assert.ok(menu);
  assert.equal(menu.hidden, false);
  assert.deepEqual(
    Array.from(menu.querySelectorAll('.ft-decision-market-switcher-group-label'))
      .map(label => label.firstElementChild.textContent.trim()),
    ['Active markets', 'Prior markets'],
  );
  const options = Array.from(menu.querySelectorAll(
    '[data-ft-action="select-decision-market"]',
  ));
  assert.equal(options.length, 3);
  assert.equal(
    options.find(option => option.dataset.ftProposalId === PROPOSAL_ID)
      .getAttribute('aria-checked'),
    'true',
  );

  const priorMetaMarket = options.find(option => (
    option.dataset.ftProposalId === PASSED_PROPOSAL_ID
  ));
  assert.ok(priorMetaMarket);
  priorMetaMarket.click();
  await settleUntil(window, () => (
    controller.getState().token === 'meta'
    && controller.getState().selectedId === PASSED_PROPOSAL_ID
    && byRole(root, 'market-title')?.textContent === 'META'
  ));

  assert.equal(byRole(root, 'market-title').textContent, 'META');
  assert.equal(byRole(root, 'decision-market-switcher-menu').hidden, true);
  assert.equal(
    new window.URL(window.location.href).searchParams.get('proposal'),
    PASSED_PROPOSAL_ID,
  );

  cleanupMount(mounted);
});

test('proposal transaction feed labels every outcome side and totals recent volume', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const proposalMarketData = JSON.parse(JSON.stringify(PROPOSAL_MARKET_DATA));
  proposalMarketData.recentTrades = [
    {
      branch: 'pass',
      side: 'buy',
      venue: 'manifest',
      price: 0.125,
      baseAmount: 100,
      quoteAmount: 99,
      volumeUsd: 12.5,
      blockTime: '2026-07-24T11:59:30.000Z',
      signature: base58.encode(Buffer.alloc(64, 5)),
    },
    {
      branch: 'pass',
      side: 'sell',
      venue: 'futarchy_amm',
      price: 0.15,
      baseAmount: 50,
      quoteAmount: 7.5,
      blockTime: '2026-07-24T11:58:30.000Z',
      signature: base58.encode(Buffer.alloc(64, 6)),
    },
    {
      branch: 'fail',
      side: 'buy',
      venue: 'manifest',
      price: 0.25,
      baseAmount: 10,
      blockTime: '2026-07-24T11:57:30.000Z',
      signature: base58.encode(Buffer.alloc(64, 7)),
    },
    {
      branch: 'fail',
      side: 'sell',
      venue: 'futarchy_amm',
      price: 0.2,
      baseAmount: 125,
      volumeUsd: 27.5,
      blockTime: '2026-07-24T11:56:30.000Z',
      signature: base58.encode(Buffer.alloc(64, 8)),
    },
  ];
  const { root, window } = makeWindow({
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
    marketWalletSlot: true,
    proposalMarketData,
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settleUntil(window, () => (
    byRole(root, 'proposal-recent-transactions')
      ?.querySelectorAll('.ft-ownership-transaction-row').length === 4
  ));

  const recentTransactions = byRole(root, 'proposal-recent-transactions');
  assert.equal(
    recentTransactions.querySelector('[data-ft-market-information="trades"]')
      .textContent.trim().replace(/\s+/g, ' '),
    'Trades 4',
  );
  assert.deepEqual(
    [...recentTransactions.querySelectorAll('.ft-market-information-tab')]
      .map(tab => tab.textContent.trim().replace(/\s+/g, ' ').replace(/ \d+$/, '')),
    ['Trades', 'Holders', 'Discussion', 'Decisions'],
  );
  const decisionsTab = recentTransactions.querySelector(
    '[data-ft-market-information="decisions"]',
  );
  assert.equal(decisionsTab.textContent.trim(), 'Decisions');
  assert.equal(decisionsTab.querySelector('small'), null);
  assert.equal(recentTransactions.querySelector('.ft-ownership-transactions-source'), null);
  assert.deepEqual(
    Array.from(recentTransactions.querySelectorAll('.ft-decision-transaction-trade'))
      .map(element => element.textContent.trim().replace(/\s+/g, ' ')),
    ['BUY PASS', 'SELL PASS', 'BUY FAIL', 'SELL FAIL'],
  );
  assert.equal(byRole(root, 'proposal-recent-volume').textContent, '$50.00');
  assert.equal(byRole(root, 'proposal-recent-count').textContent, '4');
  assert.equal(recentTransactions.querySelector('.ft-decision-transaction-filters'), null);
  assert.equal(root.querySelector('[data-ft-action="filter-decision-trades"]'), null);
  assert.equal(root.querySelector('[data-ft-region="market-context"]'), null);
  byRole(root, 'proposal-recent-transactions')
    .querySelector('[data-ft-market-information="decisions"]')
    .click();
  const decisionsPanel = byRole(root, 'proposal-recent-transactions');
  assert.equal(decisionsPanel.dataset.ftMarketInformationPanel, 'decisions');
  assert.match(decisionsPanel.textContent, /Fund Loyal contributor growth for Q3/i);

  byRole(root, 'proposal-recent-transactions')
    .querySelector('[data-ft-market-information="trades"]')
    .click();
  assert.equal(
    byRole(root, 'proposal-recent-transactions')
      .querySelectorAll('.ft-decision-transaction-trade').length,
    4,
  );
  const sizeUnit = byRole(root, 'transaction-size-unit');
  assert.equal(sizeUnit.textContent, 'USD');
  assert.deepEqual(
    Array.from(recentTransactions.querySelectorAll('[data-ft-role="transaction-size"]'))
      .map(element => element.textContent),
    ['$12.5', '$7.5', '$2.5', '$27.5'],
  );
  sizeUnit.click();
  assert.equal(byRole(root, 'transaction-size-unit').textContent, 'LOYAL');
  assert.deepEqual(
    Array.from(
      byRole(root, 'proposal-recent-transactions')
        .querySelectorAll('[data-ft-role="transaction-size"]'),
    ).map(element => element.textContent),
    ['100', '50', '10', '125'],
  );

  cleanupMount(mounted);
});

test('proposal transaction feed loads every page, deduplicates boundaries, and keeps unsigned rows visible', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const unsignedTrade = {
    branch: 'pass',
    side: 'buy',
    venue: 'futarchy_amm',
    price: 0.125,
    baseAmount: 100,
    volumeUsd: 12.5,
    blockTime: '2026-07-24T11:59:30.000Z',
    signature: null,
  };
  const signedTrade = {
    branch: 'fail',
    side: 'sell',
    venue: 'futarchy_amm',
    price: 0.2,
    baseAmount: 125,
    volumeUsd: 27.5,
    blockTime: '2026-07-24T11:56:30.000Z',
    signature: base58.encode(Buffer.alloc(64, 18)),
  };
  const { requests, root, window } = makeWindow({
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
    marketWalletSlot: true,
    proposalMarketDataResponder(url) {
      const cursor = new URL(url).searchParams.get('cursor');
      return {
        ok: true,
        data: {
          ...PROPOSAL_MARKET_DATA,
          recentTrades: cursor
            ? [unsignedTrade, signedTrade]
            : [unsignedTrade],
          pagination: cursor
            ? {
              page: 2,
              limit: 100,
              returned: 2,
              indexed: 2,
              total: 2,
              nextCursor: null,
              complete: true,
            }
            : {
              page: 1,
              limit: 100,
              returned: 1,
              indexed: 1,
              total: 2,
              nextCursor: 'page-two',
              complete: false,
            },
        },
      };
    },
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settleUntil(window, () => (
    byRole(root, 'proposal-recent-transactions')
      ?.querySelectorAll('.ft-ownership-transaction-row').length === 2
  ));

  const marketDataRequests = requests.filter(url => /view=market-data/.test(url));
  assert.equal(marketDataRequests.length, 2);
  assert.match(marketDataRequests[0], /limit=100/);
  assert.match(marketDataRequests[1], /cursor=page-two/);
  assert.equal(byRole(root, 'proposal-recent-count').textContent, '2');
  assert.equal(byRole(root, 'trade-history-status'), null);
  const rows = byRole(root, 'proposal-recent-transactions')
    .querySelectorAll('.ft-ownership-transaction-row');
  assert.equal(rows[0].tagName, 'DIV');
  assert.match(rows[0].title, /did not publish a transaction signature/);
  assert.equal(rows[1].tagName, 'A');
  assert.match(rows[1].href, /solscan\.io\/tx\//);

  cleanupMount(mounted);
});

test('proposal transaction feed identifies an interrupted history as incomplete', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
    proposalMarketDataResponder(url) {
      if (new URL(url).searchParams.has('cursor')) {
        throw new Error('second page unavailable');
      }
      return {
        ok: true,
        data: {
          ...PROPOSAL_MARKET_DATA,
          recentTrades: [{
            branch: 'pass',
            side: 'buy',
            venue: 'futarchy_amm',
            price: 0.125,
            baseAmount: 100,
            volumeUsd: 12.5,
            blockTime: '2026-07-24T11:59:30.000Z',
            signature: base58.encode(Buffer.alloc(64, 19)),
          }],
          pagination: {
            page: 1,
            limit: 100,
            returned: 1,
            indexed: 1,
            total: 2,
            nextCursor: 'page-two',
            complete: false,
          },
        },
      };
    },
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settleUntil(window, () => (
    byRole(root, 'trade-history-status')?.textContent.includes('History incomplete')
  ));

  assert.equal(
    byRole(root, 'proposal-recent-transactions')
      .querySelectorAll('.ft-ownership-transaction-row').length,
    1,
  );
  assert.equal(byRole(root, 'trade-history-status').dataset.ftAction, 'retry-market-data');

  cleanupMount(mounted);
});

test('live trade surfaces append the latest 01Resolved snapshot without refetching indexed history', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  let activeMarkets = JSON.parse(JSON.stringify(ACTIVE_MARKETS));
  let marketData = JSON.parse(JSON.stringify(PROPOSAL_MARKET_DATA));
  const livePoints = [];
  const { requests, root, window } = makeWindow({
    activeMarketsResponder() {
      return { ok: true, data: activeMarkets };
    },
    proposalMarketDataResponder() {
      return { ok: true, data: marketData };
    },
  });
  const controller = mountFutardTerminal({
    window,
    root,
    createProposalHistoryChart() {
      return {
        destroy() {},
        updateLivePoint(point) {
          livePoints.push(point);
          return true;
        },
      };
    },
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settleUntil(window, () => (
    byRole(root, 'trade-ticket')?.textContent.includes('$0.1400')
  ));

  const chart = byRole(root, 'proposal-history-chart');
  const historyRequestsBefore = requests.filter(url => (
    /view=proposal-history/.test(url)
  )).length;
  const marketDataRequestsBefore = requests.filter(url => (
    /view=market-data/.test(url)
  )).length;
  assert.deepEqual(livePoints, []);
  const indexedPassPrice = chart
    .querySelector('[data-ft-readout-value="passPrice"]').textContent;
  const indexedFailPrice = chart
    .querySelector('[data-ft-readout-value="failPrice"]').textContent;

  activeMarkets = JSON.parse(JSON.stringify(ACTIVE_MARKETS));
  activeMarkets.asOf = '2026-07-24T12:00:07.000Z';
  activeMarkets.slot = 355000007;
  activeMarkets.markets[0].source.asOf = '2026-07-24T12:00:07.000Z';
  activeMarkets.markets[0].source.slot = 355000007;
  activeMarkets.markets[0].spot.price = 0.1305;
  activeMarkets.markets[0].decision.passing = false;
  activeMarkets.markets[0].decision.marginPct = -0.4;
  activeMarkets.markets[0].pass.price = 0.1555;
  activeMarkets.markets[0].pass.twapPrice = 0.1455;
  activeMarkets.markets[0].fail.price = 0.1111;
  activeMarkets.markets[0].fail.twapPrice = 0.1211;
  marketData = JSON.parse(JSON.stringify(PROPOSAL_MARKET_DATA));
  marketData.asOf = '2026-07-24T12:00:07.000Z';
  marketData.slot = 355000007;
  marketData.books.pass.bestBid = 0.15;
  marketData.books.pass.bestAsk = 0.16;
  marketData.books.pass.bids[0].price = 0.15;
  marketData.books.pass.asks[0].price = 0.16;

  await controller.refreshLivePrices();
  await settle(window);

  assert.equal(byRole(root, 'proposal-history-chart'), chart);
  assert.equal(
    requests.filter(url => /view=proposal-history/.test(url)).length,
    historyRequestsBefore,
  );
  assert.ok(
    requests.filter(url => /view=market-data/.test(url)).length
      > marketDataRequestsBefore,
  );
  assert.equal(byRole(root, 'buy-price').textContent, '$0.1600');
  assert.equal(byRole(root, 'sell-price').textContent, '$0.1500');
  assert.match(
    byRole(root, 'pass-card').querySelector('.ft-book-reference').textContent,
    /0\.1555/,
  );
  assert.equal(
    chart.querySelector('[data-ft-readout-value="passPrice"]').textContent,
    indexedPassPrice,
  );
  assert.equal(
    chart.querySelector('[data-ft-readout-value="failPrice"]').textContent,
    indexedFailPrice,
  );
  const passSignal = byRole(root, 'proposal-chart-header')
    .querySelector('[data-ft-chart-header-metric="pass-signal"]');
  assert.equal(passSignal.querySelector('strong').textContent, '+1.1%');
  assert.equal(passSignal.dataset.tone, 'negative');
  assert.match(passSignal.title, /Current PASS-versus-FAIL TWAP spread/);
  assert.deepEqual(livePoints, [{
    asOf: '2026-07-24T12:00:07.000Z',
    underlyingPrice: 0.1305,
    passPrice: 0.1555,
    failPrice: 0.1111,
    passTwap: 0.1455,
    failTwap: 0.1211,
  }]);
  cleanupMount(mounted);
});

test('standalone decision-market discovery mode has been removed', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { requests, root, window } = makeWindow();
  assert.throws(
    () => mountFutardTerminal({ window, root, mode: 'discovery' }),
    /discovery surface has been removed/,
  );
  assert.deepEqual(requests, []);
  assert.equal(root.hasAttribute('data-ft-mode'), false);
});

test('decision sidebar keeps a clean zero-live state beside available proposal history', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const priorProposalIndex = {
    ...PROPOSAL_INDEX,
    summary: {
      ...PROPOSAL_INDEX.summary,
      total: 2,
      pending: 0,
      tradable: 0,
      filtered: 2,
    },
    pagination: {
      ...PROPOSAL_INDEX.pagination,
      returned: 2,
      total: 2,
    },
    proposals: PROPOSAL_INDEX.proposals.filter(proposal => (
      proposal.status === 'passed' || proposal.status === 'failed'
    )),
  };
  const { root, window } = makeWindow({
    activeMarketsError: new Error('Live validation transport is unavailable'),
    proposalIndex: priorProposalIndex,
    sidebar: true,
  });
  window.applyMarketSidebarSearch = () => {};
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settle(window);

  const liveSection = window.document.getElementById('tlp-decisions-panel');
  assert.equal(liveSection.hidden, false);
  assert.equal(
    window.document.querySelector('[data-market-sidebar-section-title="all"]').textContent,
    'Decisions',
  );
  const liveList = window.document.getElementById('tlp-decisions-list');
  assert.equal(liveList.querySelectorAll('.tp-decision-item').length, 0);
  const liveEmpty = liveList.querySelector('#tp-live-decisions-empty');
  assert.ok(liveEmpty);
  assert.equal(liveEmpty.hidden, false);
  assert.equal(liveEmpty.textContent.trim(), '0 decisions live');
  assert.equal(liveEmpty.getAttribute('role'), 'status');
  assert.doesNotMatch(
    window.document.getElementById('tlp-decisions-panel').textContent,
    /Live decisions unavailable|indexed market service could not be reached/i,
  );
  assert.doesNotMatch(byRole(root, 'status').textContent, /unavailable|degraded/i);
  assert.equal(byRegion(root, 'rpc-status').textContent, 'CONFIRMED');
  const rows = [...window.document.querySelectorAll(
    '#tlp-past-decisions-list .tp-decision-item',
  )];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.dataset.marketState), ['passed', 'failed']);
  assert.match(rows[0].textContent, /META #41[\s\S]+Resolved/);
  assert.match(rows[1].textContent, /SOLO #12[\s\S]+Resolved/);
  assert.equal(
    rows[0].querySelector('.tp-decision-live-dot').getAttribute('aria-label'),
    'Resolved decision',
  );
  assert.equal(rows[0].querySelector('.tp-decision-result'), null);
  assert.equal(
    rows[1].querySelector('.tp-decision-live-dot').getAttribute('aria-label'),
    'Resolved decision',
  );
  assert.equal(window.document.querySelector('[data-decision-sidebar-action="toggle-history"]'), null);

  cleanupMount(mounted);
});

test('decision sidebar derives missing per-token sequence numbers from indexed history', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const firstId = testAddress(91);
  const secondId = testAddress(92);
  const umbraProposals = [
    {
      ...PROPOSAL_INDEX.proposals[1],
      token: 'umbra',
      ticker: 'UMBRA',
      name: 'Umbra',
      id: firstId,
      number: null,
      title: 'Fund Umbra security work',
      createdAt: '2026-01-10T12:00:00.000Z',
      endsAt: '2026-01-13T12:00:00.000Z',
      resolvedAt: '2026-01-13T12:00:00.000Z',
      url: `https://www.metadao.fi/projects/umbra/proposal/${firstId}`,
    },
    {
      ...PROPOSAL_INDEX.proposals[2],
      token: 'umbra',
      ticker: 'UMBRA',
      name: 'Umbra',
      id: secondId,
      number: null,
      title: 'Expand Umbra operations',
      createdAt: '2026-02-10T12:00:00.000Z',
      endsAt: '2026-02-13T12:00:00.000Z',
      resolvedAt: '2026-02-13T12:00:00.000Z',
      url: `https://www.metadao.fi/projects/umbra/proposal/${secondId}`,
    },
  ];
  const { root, window } = makeWindow({
    activeMarkets: {
      ...ACTIVE_MARKETS,
      pendingProposalCount: 0,
      markets: [],
    },
    currentNav: {
      tokens: [{
        token: 'umbra',
        ticker: 'UMBRA',
        name: 'Umbra',
        logo: 'https://assets.01resolved.test/umbra.png',
      }],
    },
    proposalIndex: {
      ...PROPOSAL_INDEX,
      proposals: umbraProposals,
      pagination: {
        ...PROPOSAL_INDEX.pagination,
        returned: 2,
        total: 2,
      },
      summary: {
        ...PROPOSAL_INDEX.summary,
        total: 2,
        pending: 0,
        passed: 1,
        failed: 1,
        filtered: 2,
      },
    },
    sidebar: true,
  });
  window.applyMarketSidebarSearch = () => {};
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settle(window);

  const rows = [...window.document.querySelectorAll(
    '#tlp-past-decisions-list .tp-decision-item',
  )];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /UMBRA #2[\s\S]+Resolved/);
  assert.match(rows[1].textContent, /UMBRA #1[\s\S]+Resolved/);

  cleanupMount(mounted);
});

test('decision sidebar uses the same curated project logo as listed token rows', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const p2pProposal = {
    ...PROPOSAL_INDEX.proposals[1],
    token: 'p2p-protocol',
    ticker: 'P2P-PROTOCOL',
    name: 'P2P Protocol',
    logo: 'https://proposal-art.invalid/p2p.png',
    proposal: {
      ...PROPOSAL_INDEX.proposals[1].proposal,
      projectSlug: 'p2p-protocol',
    },
  };
  const { root, window } = makeWindow({
    activeMarkets: {
      ...ACTIVE_MARKETS,
      pendingProposalCount: 0,
      markets: [],
    },
    currentNav: {
      tokens: [{
        token: 'p2p',
        ticker: 'P2P',
        name: 'P2P Protocol',
        logo: 'https://current-nav.01resolved.test/p2p.png',
      }],
    },
    projectMetadata: {
      p2p: {
        ticker: 'P2P',
        name: 'P2P Protocol',
        logo: 'logos/p2p.jpg',
      },
    },
    proposalIndex: {
      ...PROPOSAL_INDEX,
      pagination: {
        ...PROPOSAL_INDEX.pagination,
        returned: 1,
        total: 1,
      },
      proposals: [p2pProposal],
      summary: {
        ...PROPOSAL_INDEX.summary,
        total: 1,
        pending: 0,
        passed: 1,
        failed: 0,
        tradable: 0,
        filtered: 1,
      },
    },
    sidebar: true,
  });
  window.applyMarketSidebarSearch = () => {};
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settle(window);

  const row = window.document.querySelector('#tlp-past-decisions-list .tp-decision-item');
  assert.equal(row.dataset.ftToken, 'p2p');
  assert.match(row.href, /[?&]token=p2p(?:&|$)/);
  assert.equal(
    row.querySelector('.ft-token-logo').src,
    'https://navgator.xyz/logos/p2p.jpg',
  );
  assert.doesNotMatch(row.innerHTML, /proposal-art\.invalid|current-nav\.01resolved\.test/);

  cleanupMount(mounted);
});

test('decision sidebar only shows markets for tokens in the 01Resolved listed-token registry', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const unlistedProposal = {
    ...PROPOSAL_INDEX.proposals[2],
    token: 'unlisted-project',
    ticker: 'UNLISTED',
    name: 'Unlisted project',
    logo: 'https://proposal-art.invalid/unlisted.png',
    proposal: {
      ...PROPOSAL_INDEX.proposals[2].proposal,
      projectSlug: 'unlisted-project',
    },
  };
  const listedProposal = {
    ...PROPOSAL_INDEX.proposals[1],
    logo: 'https://proposal-art.invalid/meta.png',
  };
  const { root, window } = makeWindow({
    activeMarkets: {
      ...ACTIVE_MARKETS,
      pendingProposalCount: 0,
      markets: [],
    },
    currentNav: {
      tokens: [{
        token: 'meta',
        ticker: 'META',
        name: 'MetaDAO',
        logo: 'https://assets.01resolved.test/meta.png',
      }],
    },
    proposalIndex: {
      ...PROPOSAL_INDEX,
      pagination: {
        ...PROPOSAL_INDEX.pagination,
        returned: 2,
        total: 2,
      },
      proposals: [listedProposal, unlistedProposal],
      summary: {
        ...PROPOSAL_INDEX.summary,
        total: 2,
        pending: 0,
        passed: 1,
        failed: 1,
        tradable: 0,
        filtered: 2,
      },
    },
    sidebar: true,
  });
  window.applyMarketSidebarSearch = () => {};
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settle(window);

  const rows = [...window.document.querySelectorAll(
    '#tlp-past-decisions-list .tp-decision-item',
  )];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.ftToken, 'meta');
  assert.equal(
    rows[0].querySelector('.ft-token-logo').src,
    'https://assets.01resolved.test/meta.png',
  );
  assert.doesNotMatch(
    window.document.getElementById('tlp-past-decisions-list').innerHTML,
    /UNLISTED|proposal-art\.invalid/,
  );

  cleanupMount(mounted);
});

test('decision sidebar follows every proposal archive page across tokens', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  let resolveSecondPage;
  const secondPageGate = new Promise((resolve) => {
    resolveSecondPage = resolve;
  });
  const firstPage = {
    ...PROPOSAL_INDEX,
    pagination: {
      ...PROPOSAL_INDEX.pagination,
      limit: 2,
      returned: 2,
      total: 3,
      nextCursor: 'archive-page-2',
    },
    proposals: PROPOSAL_INDEX.proposals.slice(0, 2),
  };
  const secondPage = {
    ...PROPOSAL_INDEX,
    pagination: {
      ...PROPOSAL_INDEX.pagination,
      limit: 100,
      returned: 1,
      total: 3,
      nextCursor: null,
    },
    proposals: PROPOSAL_INDEX.proposals.slice(2),
  };
  const { requests, root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&view=markets',
    sidebar: true,
    proposalIndexResponder(url) {
      return new URL(url).searchParams.get('cursor') === 'archive-page-2'
        ? secondPageGate
        : { ok: true, data: firstPage };
    },
  });
  window.applyMarketSidebarSearch = () => {};
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  const readyOutcome = await Promise.race([
    controller.ready.then(() => 'ready'),
    new Promise(resolve => window.setTimeout(() => resolve('blocked'), 100)),
  ]);
  assert.equal(
    readyOutcome,
    'ready',
    'the first data-backed render must not wait for the deferred archive page',
  );

  let proposalRequests = requests.filter(url => /view=proposals(?:&|$)/.test(url));
  assert.equal(proposalRequests.length, 2);
  assert.equal(new URL(proposalRequests[1]).searchParams.get('cursor'), 'archive-page-2');
  assert.equal(new URL(proposalRequests[1]).searchParams.get('limit'), '100');
  assert.deepEqual(
    [...window.document.querySelectorAll('#tlp-past-decisions-list .tp-decision-item')]
      .map(row => `${row.dataset.ftToken}:${row.dataset.marketState}`),
    ['meta:passed'],
  );

  resolveSecondPage({ ok: true, data: secondPage });
  assert.equal(await settleUntil(window, () => (
    window.document.querySelectorAll(
      '#tlp-past-decisions-list .tp-decision-item',
    ).length === 2
  )), true);
  proposalRequests = requests.filter(url => /view=proposals(?:&|$)/.test(url));
  assert.equal(proposalRequests.length, 2);
  assert.deepEqual(
    [...window.document.querySelectorAll('#tlp-decisions-list .tp-decision-item')]
      .map(row => `${row.dataset.ftToken}:${row.dataset.marketState}`),
    ['loyal:live'],
  );
  assert.deepEqual(
    [...window.document.querySelectorAll('#tlp-past-decisions-list .tp-decision-item')]
      .map(row => `${row.dataset.ftToken}:${row.dataset.marketState}`),
    ['meta:passed', 'solo:failed'],
  );
  assert.equal(
    window.document.querySelector('[data-market-sidebar-section-title="all"]').textContent,
    'Decisions',
  );
  assert.equal(window.document.getElementById('tp-live-decisions-empty').hidden, true);
  assert.equal(proposalRows(root).length, 1);
  assert.match(proposalRows(root)[0].textContent, /Loyal · LOYAL/);

  cleanupMount(mounted);
});

test('proposal archive continuation failure preserves page one and exposes retry', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const firstPage = {
    ...PROPOSAL_INDEX,
    pagination: {
      ...PROPOSAL_INDEX.pagination,
      limit: 2,
      returned: 2,
      total: 3,
      nextCursor: 'archive-page-2',
    },
    proposals: PROPOSAL_INDEX.proposals.slice(0, 2),
  };
  const { requests, root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&view=markets',
    sidebar: true,
    proposalIndexResponder(url) {
      if (new URL(url).searchParams.has('cursor')) {
        throw new Error('archive continuation unavailable');
      }
      return { ok: true, data: firstPage };
    },
  });
  window.applyMarketSidebarSearch = () => {};
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  assert.equal(await settleUntil(window, () => (
    byAction(root, 'load-more-proposals')?.disabled === false
  )), true);

  assert.equal(
    requests.filter(url => /view=proposals(?:&|$)/.test(url)).length,
    2,
  );
  assert.deepEqual(
    [...window.document.querySelectorAll('#tlp-past-decisions-list .tp-decision-item')]
      .map(row => `${row.dataset.ftToken}:${row.dataset.marketState}`),
    ['meta:passed'],
  );
  assert.match(
    byRole(root, 'status').textContent,
    /proposal history is temporarily unavailable/i,
  );
  assert.equal(byAction(root, 'load-more-proposals').textContent, 'Load more');

  cleanupMount(mounted);
});

test('token switches abort a stale background proposal archive continuation', async () => {
  let archiveSignal = null;
  let archiveAborted = false;
  let firstPageRead = false;
  const { mountFutardTerminal } = await loadTerminalModule();
  const firstPage = {
    ...PROPOSAL_INDEX,
    pagination: {
      ...PROPOSAL_INDEX.pagination,
      limit: 2,
      returned: 2,
      total: 3,
      nextCursor: 'archive-page-2',
    },
    proposals: PROPOSAL_INDEX.proposals.slice(0, 2),
  };
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&view=markets',
    proposalIndexResponder(url, requestOptions, responses) {
      const cursor = new URL(url).searchParams.get('cursor');
      if (cursor === 'archive-page-2') {
        archiveSignal = requestOptions.cancelSignal;
        return new Promise((resolve, reject) => {
          archiveSignal.addEventListener('abort', () => {
            archiveAborted = true;
            const error = new Error('superseded proposal archive');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        });
      }
      if (!firstPageRead) {
        firstPageRead = true;
        return { ok: true, data: firstPage };
      }
      return { ok: true, data: responses.proposalIndex };
    },
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  assert.ok(archiveSignal);

  await controller.setToken('meta');

  assert.equal(archiveAborted, true);
  assert.equal(archiveSignal.aborted, true);
  assert.equal(controller.getState().token, 'meta');
  assert.equal(controller.getState().selectedId, PASSED_PROPOSAL_ID);

  cleanupMount(mounted);
});

test('token Markets shares one canonical current-NAV snapshot with the token sidebar', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const currentNav = {
    tokens: [{
      ...HOME_BOOTSTRAP.currentNav.tokens[0],
      spot: 0.2345,
      nav: 0.1987,
      source: {
        currentPrice: { endpoint: '/v1/dao/overview' },
        currentNav: { endpoint: '/v1/dao/treasury/overview' },
      },
    }],
  };
  const { requests, root, window } = makeWindow({
    currentNav,
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
  });
  const hydratedSnapshots = [];
  window.NAVGATOR.marketTokenSidebar = {
    async hydrateCurrentNav(payload) {
      hydratedSnapshots.push(payload);
      return true;
    },
  };

  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  assert.deepEqual(hydratedSnapshots, [currentNav]);
  assert.equal(
    requests.filter(url => /\/api\/current-nav\?includeInactive=1$/.test(url)).length,
    1,
  );

  cleanupMount(mounted);
});

test('token Markets leaves the last sidebar snapshot untouched when current NAV fails', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    currentNavError: new Error('current NAV unavailable'),
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
  });
  let hydrationCount = 0;
  window.NAVGATOR.marketTokenSidebar = {
    hydrateCurrentNav() {
      hydrationCount += 1;
      return true;
    },
  };

  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  assert.equal(hydrationCount, 0);

  cleanupMount(mounted);
});

test('token Markets replaces an unknown token with the canonical SOLO spot workspace', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=notreal&view=markets&tab=tokens',
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'notreal',
  });
  const mounted = trackMount(controller, window);

  await controller.ready;

  assert.equal(controller.getState().token, 'solo');
  assert.equal(controller.getState().workspaceTab, 'tokens');
  assert.equal(window.location.search, '?token=solo&view=markets&tab=tokens');
  assert.equal(byRole(root, 'market-title').textContent, 'SOLO');
  assert.match(byRole(root, 'status').textContent, /NOTREAL is not an indexed 01r\.trade asset/i);
  assert.equal(root.classList.contains('ft-has-system-message'), true);

  cleanupMount(mounted);
});

test('known ownership tokens expose a safe curated shell while live data hydrates', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  let resolveActiveMarkets;
  const activeMarketsGate = new Promise((resolve) => {
    resolveActiveMarkets = resolve;
  });
  const { root, window } = makeWindow({
    activeMarketsResponder() {
      return activeMarketsGate;
    },
    url: 'https://navgator.xyz/?token=loyal&view=markets&tab=tokens',
  });
  window.NAVGATOR.projectMetadata = {
    loyal: {
      launchpad: 'Permissionless',
      live: true,
      logo: 'logos/loyal.jpg',
      name: 'Loyal',
      ticker: 'LOYAL',
    },
  };
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);

  const shell = byRole(root, 'terminal');
  const loadingTicket = byRole(root, 'ownership-trade-loading');
  assert.equal(root.dataset.ftTransition, 'partial');
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(shell.style.visibility, '');
  assert.equal(shell.hasAttribute('aria-hidden'), false);
  assert.equal(byRole(root, 'market-title').textContent, 'LOYAL');
  assert.equal(byRole(root, 'market-subtitle').textContent, 'Loyal');
  assert.match(
    root.querySelector('[data-ft-role="ownership-chart-header"] img')?.getAttribute('src') || '',
    /logos\/loyal\.jpg$/,
  );
  assert.ok(byRole(root, 'ownership-token-chart'));
  assert.ok(loadingTicket);
  assert.equal(loadingTicket.getAttribute('aria-busy'), 'true');
  assert.equal(loadingTicket.querySelectorAll('button:not([disabled])').length, 0);
  assert.equal(loadingTicket.querySelector('[data-ft-action]'), null);
  assert.equal(controller.getState().programIntegrity, 'checking');
  assert.equal(controller.getState().canTransact, false);

  const readyOutcome = await Promise.race([
    controller.ready.then(() => 'ready'),
    new Promise(resolve => window.setTimeout(() => resolve('pending'), 20)),
  ]);
  assert.equal(readyOutcome, 'pending');

  resolveActiveMarkets({ ok: true, data: ACTIVE_MARKETS });
  await controller.ready;
  assert.equal(root.hasAttribute('data-ft-transition'), false);
  assert.equal(root.hasAttribute('aria-busy'), false);
  assert.equal(byRole(root, 'ownership-trade-loading'), null);
  assert.ok(byRole(root, 'ownership-trade-ticket'));

  cleanupMount(mounted);
});

test('token Markets keeps its workspace scoped while refreshing the global proposal index', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { requests, root, window } = makeWindow({
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  assert.equal(root.dataset.ftTransition, 'pending');
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(root.classList.contains('ft-proposal-focus'), true);
  assert.equal(
    root.querySelector('[data-ft-role="terminal"]').style.visibility,
    'hidden',
  );
  assert.equal(
    root.querySelector('[data-ft-role="terminal"]').getAttribute('aria-hidden'),
    'true',
  );
  await controller.ready;
  await settle(window);

  assert.equal(root.hasAttribute('data-ft-transition'), false);
  assert.equal(root.hasAttribute('aria-busy'), false);
  assert.equal(
    root.querySelector('[data-ft-role="terminal"]').style.visibility,
    '',
  );
  assert.equal(
    root.querySelector('[data-ft-role="terminal"]').hasAttribute('aria-hidden'),
    false,
  );
  assert.equal(controller.getState().token, 'loyal');
  assert.equal(proposalRows(root).length, 1);
  assert.equal(byRole(root, 'proposal-title').textContent.trim(), 'Fund Loyal contributor growth for Q3');
  assert.equal(byRole(root, 'proposal-history-fallback'), null);
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelector('.ft-hourly-fallback'),
    null,
  );
  assert.equal(byRole(root, 'ownership-account-activity'), null);
  assert.equal(root.classList.contains('ft-wallet-connected'), false);
  const proposalRequestsBefore = requests.filter(url => /view=proposals(?:&|$)/.test(url)).length;
  assert.ok(proposalRequestsBefore > 0);
  assert.equal(
    requests.some(url => new URL(url, 'https://navgator.xyz').searchParams.has('token')),
    false,
  );

  const tokenSwitch = controller.setToken('meta');
  assert.equal(root.dataset.ftTransition, 'pending');
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(
    root.querySelector('[data-ft-role="terminal"]').style.visibility,
    'hidden',
  );
  await tokenSwitch;
  await settle(window);

  assert.equal(root.hasAttribute('data-ft-transition'), false);
  assert.equal(root.hasAttribute('aria-busy'), false);
  assert.equal(
    root.querySelector('[data-ft-role="terminal"]').style.visibility,
    '',
  );
  assert.equal(controller.getState().token, 'meta');
  assert.equal(proposalRows(root).length, 1);
  assert.equal(proposalRows(root)[0].dataset.ftProposalOutcome, 'passed');
  assert.ok(
    requests.filter(url => /view=proposals(?:&|$)/.test(url)).length
      > proposalRequestsBefore,
  );
  assert.equal(
    requests.some(url => new URL(url, 'https://navgator.xyz').searchParams.has('token')),
    false,
  );
  assert.equal(byAction(root, 'execute-trade'), null);

  cleanupMount(mounted);
});

test('token Markets ignores the retired implicit-live marker and preserves the requested spot workspace', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=solo&view=markets&tab=tokens',
  });
  window.document.documentElement.dataset.defaultMarketSelection =
    'live-decision-if-available';
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'solo',
  });
  const mounted = trackMount(controller, window);

  await controller.ready;

  assert.deepEqual(
    {
      token: controller.getState().token,
      workspaceTab: controller.getState().workspaceTab,
    },
    {
      token: 'solo',
      workspaceTab: 'tokens',
    },
  );
  assert.equal(
    window.location.search,
    '?token=solo&view=markets&tab=tokens',
  );
  assert.equal(
    window.document.documentElement.dataset.defaultMarketSelection,
    'live-decision-if-available',
  );
  assert.equal(root.hasAttribute('data-ft-transition'), false);

  cleanupMount(mounted);
});

test('token Markets places the live wallet control alongside the global 01r.trade brand', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const provider = {
    publicKey: WALLET_ADDRESS,
    async connect() {
      return { publicKey: WALLET_ADDRESS };
    },
    async disconnect() {},
  };
  const { root, window } = makeWindow({
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
    marketWalletSlot: true,
    provider,
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  const headerSlot = window.document.querySelector('[data-01rx-market-wallet-slot]');
  const walletStatus = headerSlot.querySelector('[data-ft-role="wallet-status"]');
  assert.ok(walletStatus);
  assert.equal(root.querySelector('[data-ft-role="wallet-status"]'), null);
  assert.match(headerSlot.parentElement.textContent, /01r\.trade[\s\S]+Connect wallet/);

  walletStatus.querySelector('[data-ft-action="connect-wallet"]').click();
  await settleUntil(window, () => controller.getState().walletAddress === WALLET_ADDRESS);

  assert.equal(controller.getState().walletAddress, WALLET_ADDRESS);
  assert.match(walletStatus.textContent, /9xQe[\s\S]+6vq/i);

  mountedTerminals.delete(mounted);
  controller.destroy();
  assert.equal(headerSlot.childElementCount, 0);
  window.close();
});

test('market sidebar lists persistent live and past decisions under one section', async () => {
  const {
    mountFutardTerminal,
    shouldHandleSidebarProposalClick,
  } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=meta&view=markets&tab=tokens',
  });
  const sidebar = window.document.createElement('aside');
  sidebar.innerHTML = `
    <section id="tlp-decisions-panel">
      <div id="tlp-decisions-list"></div>
      <div id="tlp-past-decisions-list"></div>
    </section>
    <section id="tlp-all-panel"></section>
  `;
  window.document.body.prepend(sidebar);

  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'meta',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  const liveDecisions = [...window.document.querySelectorAll(
    '#tlp-decisions-list .tp-decision-item',
  )];
  const pastDecisions = [...window.document.querySelectorAll(
    '#tlp-past-decisions-list .tp-decision-item',
  )];
  assert.equal(liveDecisions.length, 1);
  assert.equal(pastDecisions.length, 2);
  assert.equal(window.document.getElementById('tp-live-decisions-empty').hidden, true);
  assert.deepEqual(liveDecisions.map(row => row.dataset.marketState), ['live']);
  assert.deepEqual(pastDecisions.map(row => row.dataset.marketState), ['passed', 'failed']);
  const [liveDecision] = liveDecisions;
  const [passedDecision, failedDecision] = pastDecisions;
  const liveDot = liveDecision.querySelector('.tp-decision-live-dot');
  const decisionList = window.document.getElementById('tlp-decisions-list');
  assert.equal(liveDecision.firstElementChild, liveDot);
  assert.equal(liveDecision.dataset.marketLive, '1');
  assert.equal(liveDot.getAttribute('aria-label'), 'Live decision');
  assert.equal(
    decisionList.style.getPropertyValue('--tp-live-pulse-duration'),
    '1000ms',
  );
  assert.match(
    decisionList.style.getPropertyValue('--tp-live-pulse-delay'),
    /^-\d{1,3}ms$/,
  );
  assert.equal(liveDot.style.animationDelay, '');
  assert.match(liveDecision.textContent, /LOYAL #7[\s\S]+Fund Loyal contributor growth for Q3/);
  assert.equal(Number(liveDecision.dataset.sortLikelihood), 64);
  assert.ok(Number.isFinite(Number(liveDecision.dataset.sortSignal)));
  assert.equal(liveDecision.querySelector('.tp-decision-result'), null);
  assert.doesNotMatch(liveDecision.textContent, /Live|Awaiting/);
  assert.equal(passedDecision.dataset.marketLive, '0');
  assert.match(passedDecision.textContent, /META #41[\s\S]+Resolved/);
  assert.equal(
    passedDecision.querySelector('.tp-decision-live-dot').getAttribute('aria-label'),
    'Resolved decision',
  );
  assert.match(failedDecision.textContent, /SOLO #12[\s\S]+Resolved/);
  assert.equal(
    failedDecision.querySelector('.tp-decision-live-dot').getAttribute('aria-label'),
    'Resolved decision',
  );
  assert.equal(window.document.querySelector('.tp-decision-state'), null);
  assert.equal(window.document.querySelector('[data-decision-sidebar-action="toggle-history"]'), null);
  assert.equal(
    shouldHandleSidebarProposalClick({
      button: 0,
      defaultPrevented: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }, liveDecision, 'token'),
    true,
  );
  assert.equal(
    shouldHandleSidebarProposalClick({
      button: 0,
      defaultPrevented: false,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }, liveDecision, 'token'),
    false,
  );

  cleanupMount(mounted);
});

test('live proposal sidebar navigation switches tokens without reloading the document', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=meta&view=markets&tab=tokens',
  });
  const sidebar = window.document.createElement('aside');
  sidebar.innerHTML = `
    <section id="tlp-decisions-panel">
      <div id="tlp-decisions-list"></div>
      <div id="tlp-past-decisions-list"></div>
    </section>
    <section id="tlp-all-panel"></section>
  `;
  window.document.body.prepend(sidebar);
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'meta',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  const liveProposal = window.document.querySelector(
    '#tlp-decisions-list .tp-decision-item',
  );
  const sidebarBeforeTransition = window.document
    .getElementById('tlp-decisions-list')
    .innerHTML;
  const selectionClick = new window.MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  assert.equal(liveProposal.dispatchEvent(selectionClick), false);
  assert.equal(selectionClick.defaultPrevented, true);
  assert.equal(
    window.location.search,
    `?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
  );
  assert.equal(root.dataset.ftTransition, 'pending');
  assert.equal(
    window.document.getElementById('tlp-decisions-list').innerHTML,
    sidebarBeforeTransition,
  );
  await settleUntil(window, () => (
    controller.getState().token === 'loyal'
    && controller.getState().selectedId === PROPOSAL_ID
    && !root.hasAttribute('data-ft-transition')
  ));
  assert.equal(root.hasAttribute('data-ft-transition'), false);
  assert.equal(controller.getState().token, 'loyal');
  assert.equal(controller.getState().selectedId, PROPOSAL_ID);

  cleanupMount(mounted);
});

test('token sidebar navigation keeps the shell mounted while token data refreshes', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&view=markets&tab=tokens',
  });
  const sidebar = window.document.createElement('aside');
  sidebar.innerHTML = `
    <a
      class="tp-item"
      data-key="meta"
      href="/?token=meta&view=markets&tab=tokens"
    >META</a>
  `;
  window.document.body.prepend(sidebar);
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  const shell = byRole(root, 'terminal');
  const tokenLink = sidebar.querySelector('.tp-item');
  const selectionClick = new window.MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  assert.equal(tokenLink.dispatchEvent(selectionClick), false);
  assert.equal(selectionClick.defaultPrevented, true);
  assert.equal(
    window.location.search,
    '?token=meta&view=markets&tab=tokens',
  );
  assert.equal(root.dataset.ftTransition, 'partial');
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(shell.style.visibility, '');
  assert.equal(shell.hasAttribute('aria-hidden'), false);
  assert.ok(tokenLink.classList.contains('active'));
  assert.equal(tokenLink.getAttribute('aria-current'), 'page');

  await settleUntil(window, () => (
    controller.getState().token === 'meta'
    && controller.getState().workspaceTab === 'tokens'
    && !root.hasAttribute('data-ft-transition')
  ));
  assert.equal(root.querySelector('[data-ft-role="terminal"]'), shell);
  assert.equal(root.hasAttribute('aria-busy'), false);
  assert.equal(controller.getState().token, 'meta');
  assert.equal(controller.getState().workspaceTab, 'tokens');

  cleanupMount(mounted);
});

test('past proposal navigation keeps the final chart shell mounted until delayed history is ready', async () => {
  let resolveHistory;
  const historyGate = new Promise((resolve) => {
    resolveHistory = resolve;
  });
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: `https://navgator.xyz/?token=meta&view=markets&proposal=${PASSED_PROPOSAL_ID}`,
    proposalHistoryResponder(url) {
      const proposalId = new URL(url).searchParams.get('proposal');
      if (proposalId === PASSED_PROPOSAL_ID) return historyGate;
      return {
        ok: true,
        data: PROPOSAL_HISTORIES[proposalId]
          || hourlyHistory(proposalId, 'TOKEN', 1, { empty: true }),
      };
    },
  });
  const chartMounts = [];
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'meta',
    createProposalHistoryChart(options) {
      chartMounts.push(options);
      options.container.closest('.ft-hourly-chart')
        ?.classList.add('ft-hourly-chart-enhanced');
      return { destroy() {} };
    },
  });
  const mounted = trackMount(controller, window);
  await settleUntil(window, () => (
    byRole(root, 'proposal-history-chart')?.dataset.ftChartState === 'loading'
  ));

  const pendingChart = byRole(root, 'proposal-history-chart');
  assert.ok(pendingChart.classList.contains('ft-hourly-chart-status-shell'));
  assert.equal(pendingChart.dataset.ftChartState, 'loading');
  assert.equal(pendingChart.getAttribute('aria-busy'), 'true');
  assert.match(
    byRole(root, 'proposal-chart-mount-status').textContent,
    /Loading public market history/,
  );
  assert.equal(root.querySelector('.ft-hourly-loading'), null);
  assert.equal(root.querySelector('.ft-hourly-fallback'), null);
  assert.equal(root.querySelector('svg[viewBox="0 0 1000 1000"]'), null);
  assert.equal(chartMounts.length, 0);

  resolveHistory({
    ok: true,
    data: {
      ...PROPOSAL_HISTORIES[PASSED_PROPOSAL_ID],
      thresholdBps: 275,
      thresholdPct: 2.75,
    },
  });
  await controller.ready;
  await settleUntil(window, () => chartMounts.length === 1);

  const readyChart = byRole(root, 'proposal-history-chart');
  assert.equal(readyChart.dataset.ftChartState, 'ready');
  assert.equal(readyChart.getAttribute('aria-busy'), 'false');
  assert.ok(readyChart.classList.contains('ft-hourly-chart-enhanced'));
  assert.ok(
    readyChart.querySelector('[data-ft-role="proposal-history-liveline"]'),
  );
  assert.equal(chartMounts[0].isLive, false);
  const resultMetric = byRole(root, 'proposal-chart-header')
    .querySelector('[data-ft-chart-header-metric="result"]');
  assert.equal(resultMetric.querySelector('span').textContent, 'Result');
  assert.equal(resultMetric.querySelector('strong').textContent, 'Resolved');
  assert.equal(
    byRole(root, 'proposal-chart-header')
      .querySelector('[data-ft-chart-header-metric="threshold"] strong').textContent,
    '+2.75%',
  );
  assert.equal(
    byRole(root, 'proposal-chart-header')
      .querySelector('[data-ft-chart-header-metric="pass-signal"]'),
    null,
  );

  cleanupMount(mounted);
});

test('proposal chart mount failures replace the pending surface with an explicit error', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: `https://navgator.xyz/?token=meta&view=markets&proposal=${PASSED_PROPOSAL_ID}`,
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'meta',
    createProposalHistoryChart() {
      return null;
    },
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settleUntil(window, () => (
    byRole(root, 'proposal-history-chart')?.dataset.ftChartState === 'error'
  ));

  const chart = byRole(root, 'proposal-history-chart');
  assert.equal(chart.dataset.ftChartState, 'error');
  assert.equal(chart.getAttribute('aria-busy'), 'false');
  assert.ok(chart.classList.contains('ft-hourly-chart-failed'));
  assert.match(
    byRole(root, 'proposal-chart-mount-status').textContent,
    /Proposal chart unavailable/,
  );
  assert.equal(chart.querySelector('.ft-hourly-fallback'), null);

  cleanupMount(mounted);
});

test('ownership workspace mounts the installed empty Liveline directly and cleans it up', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&view=markets&tab=tokens',
  });
  const chartMounts = [];
  let chartRemovals = 0;
  window.LivelineCharts = {
    createChart(container, options) {
      chartMounts.push({ container, options });
      return {
        remove() {
          chartRemovals += 1;
        },
      };
    },
  };
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  const panel = byRole(root, 'ownership-token-chart');
  const liveline = byRole(root, 'ownership-token-chart-liveline');
  assert.ok(panel);
  assert.ok(liveline);
  assert.equal(panel.querySelector('iframe'), null);
  assert.equal(liveline.tagName, 'DIV');
  assert.equal(liveline.dataset.ftChartEngine, 'liveline');
  assert.equal(liveline.getAttribute('role'), 'img');
  assert.match(liveline.getAttribute('aria-label'), /LOYAL Price and NAV chart/);
  assert.equal(chartMounts.length, 1);
  assert.equal(chartMounts[0].container, liveline);
  assert.equal(chartMounts[0].container.ownerDocument, window.document);
  assert.deepEqual(chartMounts[0].options, {});

  await controller.refresh();
  assert.equal(chartMounts.length, 1);
  controller.destroy();
  assert.equal(chartRemovals, 1);

  cleanupMount(mounted);
});

test('ownership workspace renders indexed spot transactions in its dedicated column', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&tab=tokens',
    marketWalletSlot: true,
    homeBootstrap: {
      ...HOME_BOOTSTRAP,
      currentNav: {
        tokens: [{
          ...HOME_BOOTSTRAP.currentNav.tokens[0],
          recentTrades: [{
            side: 'buy',
            price: 0.1291,
            baseAmount: 1250,
            trader: WALLET_ADDRESS,
            blockTime: '2026-07-24T11:59:30.000Z',
            signature: TRANSACTION_SIGNATURE,
          }],
        }],
      },
    },
    currentNav: {
      tokens: [{
        ...HOME_BOOTSTRAP.currentNav.tokens[0],
        launchpad: 'Permissionless',
        mint: MOCK_BASE_MINT,
        nav: 0.222,
        navSource: '01resolved',
        spot: 0.2,
      }],
    },
  });
  const watchedTokens = new Set();
  const copiedAddresses = [];
  window.NAVGATOR.shell = {
    watchlist: {
      has(token) {
        return watchedTokens.has(token);
      },
      toggle(token) {
        if (watchedTokens.has(token)) watchedTokens.delete(token);
        else watchedTokens.add(token);
      },
    },
  };
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      async writeText(value) {
        copiedAddresses.push(value);
      },
    },
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  const headerWallet = window.document.querySelector(
    '[data-01rx-market-wallet-slot] [data-ft-role="wallet-status"]',
  );
  assert.ok(headerWallet);
  assert.match(headerWallet.textContent, /Connect wallet/i);
  assert.equal(root.querySelector('[data-ft-role="wallet-status"]'), null);
  let ownershipHeader = byRole(root, 'ownership-chart-header');
  const identityMarks = ownershipHeader.querySelector('.ft-chart-market-identity-marks');
  const launchpad = byRole(root, 'token-launchpad');
  assert.equal(identityMarks.querySelectorAll('[data-ft-role="token-launchpad"]').length, 1);
  assert.equal(identityMarks.contains(launchpad), true);
  assert.equal(launchpad.getAttribute('aria-label'), 'Launched on MetaDAO');
  assert.equal(launchpad.getAttribute('title'), 'Launched on MetaDAO');
  const launchpadArtwork = launchpad.querySelector('img');
  assert.equal(launchpadArtwork.getAttribute('src'), 'logos/meta.jpg');
  assert.equal(launchpadArtwork.getAttribute('alt'), '');
  assert.equal(launchpadArtwork.getAttribute('aria-hidden'), 'true');
  const chain = byRole(root, 'token-chain');
  assert.equal(identityMarks.querySelectorAll('[data-ft-role="token-chain"]').length, 1);
  assert.equal(identityMarks.contains(chain), true);
  assert.equal(chain.getAttribute('aria-label'), 'Solana mainnet');
  assert.equal(chain.getAttribute('title'), 'Solana mainnet');
  const chainArtwork = chain.querySelector('img');
  assert.equal(chainArtwork.getAttribute('src'), 'logos/solana-mark.svg');
  assert.equal(chainArtwork.getAttribute('alt'), '');
  assert.equal(chainArtwork.getAttribute('aria-hidden'), 'true');
  assert.equal(chain.querySelector('svg'), null);
  let watchlistButton = byAction(root, 'toggle-ownership-watchlist');
  assert.equal(identityMarks.querySelectorAll('[data-ft-action="toggle-ownership-watchlist"]').length, 1);
  assert.equal(identityMarks.contains(watchlistButton), true);
  assert.equal(watchlistButton.dataset.ftToken, 'loyal');
  assert.equal(watchlistButton.getAttribute('aria-pressed'), 'false');
  assert.equal(watchlistButton.getAttribute('aria-label'), 'Add LOYAL to watchlist');
  watchlistButton.click();
  ownershipHeader = byRole(root, 'ownership-chart-header');
  watchlistButton = byAction(root, 'toggle-ownership-watchlist');
  assert.equal(watchedTokens.has('loyal'), true);
  assert.equal(watchlistButton.getAttribute('aria-pressed'), 'true');
  assert.equal(watchlistButton.getAttribute('aria-label'), 'Remove LOYAL from watchlist');
  const contractAddress = byRole(root, 'token-contract-address');
  assert.doesNotMatch(contractAddress.textContent, /\bCA\b/);
  assert.equal(contractAddress.dataset.ftAddress, MOCK_BASE_MINT);
  assert.equal(contractAddress.dataset.ftCopyState, undefined);
  assert.equal(contractAddress.getAttribute('aria-label'), 'Copy LOYAL contract address');
  assert.ok(contractAddress.querySelector('.ft-chart-market-ca-copy-icon'));
  assert.ok(contractAddress.querySelector('.ft-chart-market-ca-check-icon'));
  const originalSetTimeout = window.setTimeout;
  let resetCopyFeedback = null;
  window.setTimeout = function captureCopyFeedbackTimer(callback, delay, ...args) {
    if (delay === 1_800) {
      resetCopyFeedback = () => callback(...args);
      return 18_000;
    }
    return originalSetTimeout.call(this, callback, delay, ...args);
  };
  try {
    contractAddress.click();
    await settle(window);
    assert.deepEqual(copiedAddresses, [MOCK_BASE_MINT]);
    assert.equal(contractAddress.dataset.ftCopyState, 'copied');
    assert.equal(contractAddress.getAttribute('aria-label'), 'LOYAL contract address copied');
    assert.doesNotMatch(root.textContent, /Address copied to clipboard/i);
    assert.equal(typeof resetCopyFeedback, 'function');
    resetCopyFeedback();
    assert.equal(contractAddress.dataset.ftCopyState, undefined);
    assert.equal(contractAddress.getAttribute('aria-label'), 'Copy LOYAL contract address');
  } finally {
    window.setTimeout = originalSetTimeout;
  }
  assert.equal(
    ownershipHeader
      .querySelector('[data-ft-chart-header-metric="price"] strong')
      .textContent,
    '$0.2000',
  );
  assert.equal(
    ownershipHeader
      .querySelector('[data-ft-chart-header-metric="nav"] strong')
      .textContent,
    '$0.2220',
  );
  assert.equal(
    ownershipHeader
      .querySelector('[data-ft-chart-header-metric="treasury"] strong')
      .textContent,
    '$360K',
  );
  assert.equal(
    ownershipHeader
      .querySelector('[data-ft-chart-header-metric="volume-24h"]'),
    null,
  );
  assert.equal(
    ownershipHeader
      .querySelector('[data-ft-chart-header-metric="liquidity"]'),
    null,
  );
  assert.equal(byRole(root, 'market-title').textContent, 'LOYAL');
  assert.equal(byRole(root, 'market-subtitle').textContent, 'Loyal');
  assert.equal(root.querySelector('.ft-token-identity-meta'), null);
  const currentStrip = byRole(root, 'ownership-current-strip');
  assert.ok(currentStrip);
  assert.doesNotMatch(currentStrip.textContent, /Current 01Resolved snapshot/i);
  assert.doesNotMatch(currentStrip.textContent, /Price\s+\$0\.2000|NAV\s+\$0\.2220/);
  assert.match(currentStrip.textContent, /Source\s+01Resolved/);
  const ownershipTicket = byRole(root, 'ownership-trade-ticket');
  assert.equal(ownershipTicket.dataset.ftOrderType, 'market');
  assert.equal(byAction(root, 'select-ownership-order-type'), null);
  assert.deepEqual(
    [...ownershipTicket.querySelectorAll('[data-ft-action="ownership-amount-preset"]')]
      .map(control => control.dataset.ftAmount),
    ['100', '500', '1000'],
  );
  assert.equal(ownershipTicket.querySelector('[data-ft-amount="max"]'), null);
  assert.equal(ownershipTicket.querySelector('.ft-ownership-settings'), null);
  assert.equal(ownershipTicket.querySelector('.ft-ownership-balance'), null);
  assert.equal(ownershipTicket.querySelector('.ft-ownership-chevron'), null);

  const recentTransactions = byRole(root, 'ownership-recent-transactions');
  assert.equal(
    recentTransactions.querySelector('.ft-ownership-transactions-header strong').textContent,
    'Trades',
  );
  const rows = recentTransactions.querySelectorAll('.ft-ownership-transaction-row');
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /\$0\.1291[\s\S]+\$161\.38/);
  assert.equal(byRole(root, 'transaction-size-unit').textContent, 'USD');
  byRole(root, 'transaction-size-unit').click();
  assert.equal(byRole(root, 'transaction-size-unit').textContent, 'LOYAL');
  assert.match(
    byRole(root, 'ownership-recent-transactions').textContent,
    /\$0\.1291[\s\S]+1,250/,
  );
  assert.equal(
    rows[0].getAttribute('href'),
    `https://solscan.io/tx/${TRANSACTION_SIGNATURE}`,
  );
  assert.equal(
    recentTransactions.querySelector('.ft-ownership-transactions-list').hasAttribute('tabindex'),
    false,
  );
  assert.equal(
    recentTransactions.querySelector('.ft-ownership-transactions-list').getAttribute('aria-label'),
    'Recent transactions',
  );
  assert.equal(root.querySelector('[data-ft-region="market-context"]'), null);
  byRole(root, 'ownership-recent-transactions')
    .querySelector('[data-ft-market-information="holders"]')
    .click();
  assert.equal(
    byRole(root, 'ownership-recent-transactions').dataset.ftMarketInformationPanel,
    'holders',
  );
  assert.match(
    byRole(root, 'ownership-recent-transactions').textContent,
    /not included in 01r\.trade’s reviewed current-token contract/i,
  );
  assert.equal(byRole(root, 'ownership-account-activity'), null);
  assert.equal(root.classList.contains('ft-wallet-connected'), false);

  cleanupMount(mounted);
});

test('SOLO header shows its reviewed contract address before current NAV returns a mint', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const currentToken = {
    ...HOME_BOOTSTRAP.currentNav.tokens[0],
    key: 'solo',
    mint: undefined,
    name: 'Solomon Labs',
    ticker: 'SOLO',
    token: 'solo',
  };
  const { root, window } = makeWindow({
    currentNav: { tokens: [currentToken] },
    homeBootstrap: {
      ...HOME_BOOTSTRAP,
      currentNav: { tokens: [currentToken] },
    },
    projectMetadata: {
      solo: {
        launchpad: 'Curated',
        logo: 'logos/solo.jpg',
        mint: SOLO_MINT,
        name: 'Solomon Labs',
        ticker: 'SOLO',
      },
    },
    url: 'https://navgator.xyz/?token=solo&tab=tokens',
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'solo',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  const contractAddress = byRole(root, 'token-contract-address');
  assert.equal(contractAddress.tagName, 'BUTTON');
  assert.equal(contractAddress.classList.contains('ft-chart-market-ca-unavailable'), false);
  assert.equal(contractAddress.dataset.ftAction, 'copy-address');
  assert.equal(contractAddress.dataset.ftAddress, SOLO_MINT);
  assert.equal(contractAddress.getAttribute('aria-label'), 'Copy SOLO contract address');
  assert.match(contractAddress.textContent, /SoLo9…bmeta/);
  assert.doesNotMatch(contractAddress.textContent, /\bCA\b/);

  cleanupMount(mounted);
});

test('ownership market orders quote through DFlow and submit only after explicit review', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const fingerprint = 'a'.repeat(64);
  const submitted = [];
  const provider = {
    publicKey: WALLET_ADDRESS,
    async connect() {
      return { publicKey: WALLET_ADDRESS };
    },
    async disconnect() {},
    async signTransaction(transaction) {
      return transaction;
    },
  };
  const terminal = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&tab=tokens',
    provider,
    async spotOrderResponder(body) {
      assert.equal(body.token, 'loyal');
      assert.equal(body.side, 'buy');
      assert.equal(body.amount, '1');
      return {
        cluster: 'solana:mainnet',
        token: 'loyal',
        ticker: 'LOYAL',
        name: 'Loyal',
        side: 'buy',
        owner: body.owner || null,
        amount: '1',
        quote: {
          inputMint: ACTIVE_MARKETS.markets[0].quoteMint,
          outputMint: ACTIVE_MARKETS.markets[0].baseMint,
          inputDecimals: 6,
          outputDecimals: 6,
          inAmountRaw: '1000000',
          outAmountRaw: '8000000',
          minimumAmountOutRaw: '7920000',
          amountIn: '1',
          estimatedAmountOut: '8',
          minimumAmountOut: '7.92',
          priceImpactPercent: 0.12,
          slippageBps: 100,
          platformFeeBps: 0,
          contextSlot: 355000000,
          lastValidBlockHeight: 390000000,
          route: [{
            venue: 'MetaDAO',
            marketKey: PROPOSAL_ID,
          }],
        },
        transaction: body.owner ? 'reviewed-wire' : null,
        reviewToken: body.owner ? 'signed-dflow-proof' : null,
        review: body.owner ? {
          transactionFingerprint: fingerprint,
          feePayer: body.owner,
          programIds: ['DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH'],
          simulation: {
            ok: true,
            error: '',
            logs: [],
            unitsConsumed: 90000,
          },
          networkFeeLamports: 5000,
        } : null,
      };
    },
    async spotSubmitResponder(body) {
      submitted.push(body);
      return {
        cluster: 'solana:mainnet',
        signature: TRANSACTION_SIGNATURE,
        status: 'submitted',
      };
    },
    solanaTradingOverrides: {
      createMainnetConnection() {
        return {};
      },
      buildDflowSpotPlan(payload, walletAddress) {
        assert.equal(payload.owner, walletAddress);
        return {
          builtAt: Date.now(),
          kind: 'spot',
          reviewToken: payload.reviewToken,
          serverFingerprint: fingerprint,
          transaction: {},
          summary: {
            action: 'BUY LOYAL',
            venue: 'MetaDAO',
            feePayer: walletAddress,
            amountIn: '1 USDC',
            inputMint: payload.quote.inputMint,
            estimatedAmountOut: '8 LOYAL',
            minimumAmountOut: '7.92 LOYAL',
            outputMint: payload.quote.outputMint,
            recipient: walletAddress,
            programIds: payload.review.programIds,
          },
        };
      },
      async transactionReviewFingerprint() {
        return fingerprint;
      },
      async signReviewedPlan(_connection, _adapter, plan) {
        assert.equal(plan.reviewFingerprint, fingerprint);
        return { signedTransaction: 'wallet-signed-wire' };
      },
    },
  });
  const controller = mountFutardTerminal({
    window: terminal.window,
    root: terminal.root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, terminal.window);
  await controller.ready;

  const recentTransactions = byRole(terminal.root, 'ownership-recent-transactions');
  assert.ok(recentTransactions);
  assert.match(recentTransactions.textContent, /No recent indexed transactions/i);
  const ownershipChartPanel = byRole(terminal.root, 'ownership-token-chart');
  const ownershipChartMount = byRole(
    terminal.root,
    'ownership-token-chart-liveline',
  );
  assert.ok(ownershipChartPanel);
  assert.ok(ownershipChartMount);
  assert.equal(ownershipChartPanel.querySelector('iframe'), null);
  assert.equal(ownershipChartMount.dataset.ftChartEngine, 'liveline');

  byAction(terminal.root, 'connect-wallet').click();
  await settleUntil(terminal.window, () => controller.getState().walletAddress === WALLET_ADDRESS);
  assert.equal(terminal.root.classList.contains('ft-wallet-connected'), true);
  assert.ok(byRole(terminal.root, 'ownership-account-activity'));
  const amount = byRole(terminal.root, 'ownership-amount');
  amount.value = '1';
  amount.dispatchEvent(new terminal.window.Event('input', { bubbles: true }));
  await settleUntil(terminal.window, () => Boolean(
    byAction(terminal.root, 'review-ownership-trade'),
  ));

  assert.match(terminal.root.textContent, /0\.12%/);
  assert.match(terminal.root.textContent, /0\.00%/);
  assert.match(terminal.root.textContent, /MetaDAO/);
  byAction(terminal.root, 'review-ownership-trade').click();
  await settleUntil(terminal.window, () => Boolean(
    byAction(terminal.root, 'approve-transaction'),
  ));
  assert.match(terminal.root.textContent, /DFlow signature verified/);
  byAction(terminal.root, 'approve-transaction').click();
  await settleUntil(terminal.window, () => submitted.length === 1);

  assert.deepEqual(submitted, [{
    signedTransaction: 'wallet-signed-wire',
    reviewToken: 'signed-dflow-proof',
  }]);
  assert.equal(byAction(terminal.root, 'approve-transaction'), null);

  cleanupMount(mounted);
});

test('proposal pages expose spot trading through the existing reviewed spot route', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const quoteRequests = [];
  const terminal = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&view=markets',
    async spotOrderResponder(body) {
      quoteRequests.push(body);
      return {
        cluster: 'solana:mainnet',
        token: body.token,
        ticker: 'LOYAL',
        name: 'Loyal',
        side: body.side,
        owner: body.owner || null,
        amount: body.amount,
        quote: {
          inputMint: ACTIVE_MARKETS.markets[0].quoteMint,
          outputMint: ACTIVE_MARKETS.markets[0].baseMint,
          inputDecimals: 6,
          outputDecimals: 6,
          inAmountRaw: '25000000',
          outAmountRaw: '200000000',
          minimumAmountOutRaw: '198000000',
          amountIn: '25',
          estimatedAmountOut: '200',
          minimumAmountOut: '198',
          priceImpactPercent: 0.08,
          slippageBps: 100,
          platformFeeBps: 0,
          contextSlot: 355000000,
          lastValidBlockHeight: 390000000,
          route: [{ venue: 'MetaDAO', marketKey: PROPOSAL_ID }],
        },
        transaction: null,
        reviewToken: null,
        review: null,
      };
    },
  });
  const controller = mountFutardTerminal({
    window: terminal.window,
    root: terminal.root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, terminal.window);
  await controller.ready;

  const spotTab = terminal.root.querySelector(
    '[data-ft-action="select-proposal-trade-market"][data-ft-trade-market="spot"]',
  );
  assert.ok(spotTab);
  assert.deepEqual(
    [...terminal.root.querySelectorAll('.ft-proposal-trade-tabs > button')]
      .map(button => button.textContent.trim()),
    ['If "Pass"', 'Spot', 'If "Fail"'],
  );
  spotTab.click();
  const spotTicket = terminal.root.querySelector('.ft-proposal-spot-ticket');
  assert.ok(spotTicket);
  assert.ok(spotTicket.classList.contains('ft-decision-ticket'));
  [
    '.ft-decision-ticket-scroll',
    '.ft-decision-side-quotes',
    '.ft-decision-amount-field',
    '.ft-decision-presets',
    '.ft-decision-average',
    '.ft-decision-position',
    '.ft-decision-payoff',
    '.ft-decision-advanced',
    '.ft-decision-action',
  ].forEach(selector => assert.ok(spotTicket.querySelector(selector), selector));

  const amount = byRole(terminal.root, 'ownership-amount');
  amount.value = '25';
  amount.dispatchEvent(new terminal.window.Event('input', { bubbles: true }));
  await settleUntil(terminal.window, () => quoteRequests.length === 1);

  assert.deepEqual(quoteRequests, [{
    token: 'loyal',
    side: 'buy',
    amount: '25',
    slippageBps: 100,
  }]);
  assert.match(terminal.root.textContent, /200/);
  assert.equal(
    terminal.root.querySelector(
      '[data-ft-action="select-proposal-trade-market"][data-ft-trade-market="spot"]',
    )?.getAttribute('aria-selected'),
    'true',
  );

  actionWithText(terminal.root, 'select-outcome', /pass/i).click();
  assert.equal(terminal.root.querySelector('.ft-proposal-spot-ticket'), null);
  assert.ok(terminal.root.querySelector('.ft-decision-ticket'));
  assert.ok(byAction(terminal.root, 'connect-wallet'));

  cleanupMount(mounted);
});

test('invalid token proposal deep links fall back with a visible notice', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: `https://navgator.xyz/?token=loyal&view=markets&proposal=${PASSED_PROPOSAL_ID}`,
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settle(window);

  assert.equal(controller.getState().selectedId, PROPOSAL_ID);
  assert.match(
    byRole(root, 'status').textContent,
    /does not belong to this token|no longer indexed/i,
  );
  assert.equal(new URL(window.location.href).searchParams.has('proposal'), false);

  cleanupMount(mounted);
});

test('token Markets aborts stale global proposal reads before committing a token switch', async () => {
  let proposalSignal = null;
  let proposalAborted = false;
  let proposalRequestCount = 0;
  const { mountFutardTerminal } = await loadTerminalModule();
  const { requests, root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&view=markets',
    proposalIndexResponder(url, requestOptions, responses) {
      proposalRequestCount += 1;
      if (proposalRequestCount > 1) {
        return { ok: true, data: responses.proposalIndex };
      }
      proposalSignal = requestOptions.cancelSignal;
      return new Promise((resolve, reject) => {
        proposalSignal.addEventListener('abort', () => {
          proposalAborted = true;
          const error = new Error('superseded token');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await settleUntil(window, () => Boolean(proposalSignal));

  await controller.setToken('meta');
  await controller.ready;

  assert.equal(proposalAborted, true);
  assert.equal(proposalSignal.aborted, true);
  assert.equal(controller.getState().token, 'meta');
  assert.equal(proposalRows(root).length, 1);
  assert.equal(proposalRows(root)[0].dataset.ftProposalOutcome, 'passed');
  assert.ok(proposalRequestCount > 1);
  assert.equal(
    requests.some(url => new URL(url).searchParams.has('token')),
    false,
  );

  cleanupMount(mounted);
});

test('proposal switches abort stale history reads before rendering the next market', async () => {
  let liveHistorySignal = null;
  let liveHistoryAborted = false;
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    proposalHistoryResponder(url, requestOptions) {
      const proposalId = new URL(url).searchParams.get('proposal');
      if (proposalId !== PROPOSAL_ID) {
        return {
          ok: true,
          data: PROPOSAL_HISTORIES[proposalId]
            || hourlyHistory(proposalId, 'TOKEN', 1, { empty: true }),
        };
      }
      liveHistorySignal = requestOptions.cancelSignal;
      return new Promise((resolve, reject) => {
        liveHistorySignal.addEventListener('abort', () => {
          liveHistoryAborted = true;
          const error = new Error('superseded proposal');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settleUntil(window, () => Boolean(liveHistorySignal));

  proposalRowByOutcome(root, 'passed').click();
  await settleUntil(window, () => (
    byRole(root, 'proposal-title')?.textContent.trim() === 'Renew the META liquidity mandate'
  ));

  assert.equal(liveHistoryAborted, true);
  assert.equal(liveHistorySignal.aborted, true);
  assert.equal(byRole(root, 'proposal-title').textContent.trim(), 'Renew the META liquidity mandate');
  assert.equal(byAction(root, 'execute-trade'), null);

  cleanupMount(mounted);
});

test('proposal history retries hourly while an older public API rejects 15-minute reads', async () => {
  const intervals = [];
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    proposalHistoryResponder(url) {
      const params = new URL(url).searchParams;
      const proposalId = params.get('proposal');
      const interval = params.get('interval');
      intervals.push(interval);
      if (interval === '15m') {
        throw Object.assign(new Error('interval must be 1h'), { status: 400 });
      }
      const history = PROPOSAL_HISTORIES[proposalId]
        || hourlyHistory(proposalId, 'TOKEN', 1, { empty: true });
      return {
        ok: true,
        data: {
          ...history,
          interval: '1h',
          requestedInterval: '1h',
          source: {
            ...history.source,
            sourceInterval: '1h',
            interval: '1h',
            requestedInterval: '1h',
          },
        },
      };
    },
  });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settleUntil(window, () => (
    intervals.includes('1h')
    && Boolean(
      byRole(root, 'proposal-history-chart')
        ?.querySelector('.ft-hourly-readout-header'),
    )
  ));

  assert.deepEqual(intervals.slice(0, 2), ['15m', '1h']);
  assert.match(
    byRole(root, 'proposal-history-chart')
      .querySelector('.ft-hourly-readout-header').textContent,
    /1H/,
  );
  assert.doesNotMatch(
    byRole(root, 'proposal-history').textContent,
    /temporarily unavailable/i,
  );

  cleanupMount(mounted);
});

test('proposal history remains empty when 01Resolved live and hourly feeds are empty', async () => {
  const retainedRequests = [];
  const { mountFutardTerminal } = await loadTerminalModule();
  const terminal = makeWindow({
    proposalHistoryResponder(url) {
      const params = new URL(url).searchParams;
      if (params.get('interval') === '15m') {
        throw Object.assign(new Error('interval must be 1h'), { status: 400 });
      }
      return {
        ok: true,
        data: {
          ...hourlyHistory(PROPOSAL_ID, 'LOYAL', 0.13, { empty: true }),
          interval: '1h',
          requestedInterval: '1h',
        },
      };
    },
  });
  const sharedJson = terminal.window.NAVGATOR.api.json;
  terminal.window.NAVGATOR.api.json = async (url, requestOptions) => {
    if (!String(url).startsWith('/data/proposal-history/')) {
      return sharedJson(url, requestOptions);
    }
    retainedRequests.push(String(url));
    throw new Error('Retained history must not be requested');
  };
  const controller = mountFutardTerminal({
    window: terminal.window,
    root: terminal.root,
  });
  const mounted = trackMount(controller, terminal.window);
  await controller.ready;
  await settleUntil(terminal.window, () => (
    /No 01Resolved market history is indexed/i.test(
      byRole(terminal.root, 'proposal-history')?.textContent || '',
    )
  ));

  assert.deepEqual(retainedRequests, []);
  assert.match(
    byRole(terminal.root, 'proposal-history').textContent,
    /No 01Resolved market history is indexed/i,
  );

  cleanupMount(mounted);
});

test('automatic order creation stays hidden until deployment and keeper readiness', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const disabledWindow = makeWindow();
  const disabledController = mountFutardTerminal({
    window: disabledWindow.window,
    root: disabledWindow.root,
  });
  const disabledMount = trackMount(disabledController, disabledWindow.window);
  await disabledController.ready;

  assert.equal(disabledWindow.root.querySelector(
    '[data-ft-action="select-order-type"][data-ft-order-type="recurring"]',
  ), null);
  assert.doesNotMatch(disabledWindow.root.textContent, /Amount per run/);
  assert.doesNotMatch(disabledWindow.root.textContent, /Automatic vault deployment pending/);
  assert.match(disabledWindow.root.textContent, /LIMIT/);
  assert.equal(byAction(disabledWindow.root, 'execute-trade'), null);
  cleanupMount(disabledMount);

  const enabledWindow = makeWindow({
    recurringConfig: {
      enabled: true,
      keeperReady: true,
      programId: '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh',
      minimumIntervalSeconds: 3_600,
      maximumCycles: 365,
    },
  });
  const enabledController = mountFutardTerminal({
    window: enabledWindow.window,
    root: enabledWindow.root,
  });
  const enabledMount = trackMount(enabledController, enabledWindow.window);
  await enabledController.ready;
  await settle(enabledWindow.window);

  enabledWindow.root.querySelector(
    '[data-ft-action="select-order-type"][data-ft-order-type="recurring"]',
  ).click();
  assert.match(enabledWindow.root.textContent, /Connect wallet to trade/);
  assert.doesNotMatch(enabledWindow.root.textContent, /deployment pending/);
  assert.equal(
    byRole(enabledWindow.root, 'recurring-interval').value,
    '3600',
  );
  assert.equal(
    byRole(enabledWindow.root, 'recurring-cycles').value,
    '4',
  );
  const recurringAmount = byRole(enabledWindow.root, 'amount');
  recurringAmount.value = '10';
  recurringAmount.dispatchEvent(new enabledWindow.window.Event('input', {
    bubbles: true,
  }));
  assert.match(
    byRole(enabledWindow.root, 'recurring-total').textContent,
    /40(?:\.0+)? USDC/,
  );
  cleanupMount(enabledMount);
});

test('automatic vault owner controls remain available while new schedules are paused', async () => {
  const walletCalls = [];
  const claimBuilds = [];
  const provider = {
    isPhantom: true,
    publicKey: null,
    async connect() {
      walletCalls.push('connect');
      this.publicKey = { toString: () => WALLET_ADDRESS };
      return { publicKey: this.publicKey };
    },
    async signTransaction() {
      walletCalls.push('signTransaction');
      throw new Error('Claim should not sign before explicit approval');
    },
  };
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    provider,
    recurringConfig: {
      enabled: false,
      keeperReady: false,
      programId: '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh',
      minimumIntervalSeconds: 3_600,
      maximumCycles: 365,
    },
    solanaTradingOverrides: {
      createMainnetConnection() {
        return { kind: 'test-connection' };
      },
      async loadRecurringSchedules() {
        return [{
          address: '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh',
          active: true,
          isBaseIn: false,
          side: 'buy',
          baseMint: ACTIVE_MARKETS.markets[0].proposal.passBaseMint,
          quoteMint: ACTIVE_MARKETS.markets[0].proposal.passQuoteMint,
          amountPerCycleRaw: '10000000',
          intervalSeconds: 3_600,
          nextExecutionAt: Math.floor(Date.now() / 1_000) + 3_600,
          expiresAt: Math.floor(Date.now() / 1_000) + 86_400,
          cyclesExecuted: 1,
          totalCycles: 4,
          totalOutputReceivedRaw: '2500000',
          unclaimedOutputRaw: '1500000',
        }];
      },
      async buildRecurringClaimPlan(input) {
        claimBuilds.push(input);
        return {
          kind: 'recurring-claim',
          transaction: {},
          additionalSigners: [],
          summary: {
            cluster: 'solana:mainnet',
            venue: 'NAVgator recurring vault',
            action: 'CLAIM PASS PROCEEDS',
            amountIn: 'No trade',
            inputMint: ACTIVE_MARKETS.markets[0].proposal.passBaseMint,
            inputAccount: '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh',
            minimumAmountOut: null,
            estimatedAmountOut: '1.5 PASS LOYAL',
            outputMint: ACTIVE_MARKETS.markets[0].proposal.passBaseMint,
            recipient: WALLET_ADDRESS,
            feePayer: WALLET_ADDRESS,
            programIds: [
              '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh',
            ],
            networkFeeSol: 0.000005,
            accountRentSol: 0,
            note: 'Moves accumulated output while future runs stay active.',
          },
        };
      },
      async simulatePlan() {
        return {
          ok: true,
          unitsConsumed: 50_000,
          error: null,
          transactionFingerprint: 'a'.repeat(64),
        };
      },
    },
  });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.ready;

  byAction(root, 'connect-wallet').click();
  await settleUntil(window, () => !!byAction(root, 'claim-recurring'));
  assert.match(root.textContent, /new schedules paused/i);
  assert.match(root.textContent, /1\.5 PASS LOYAL ready/);
  assert.ok(byAction(root, 'cancel-recurring'));

  byAction(root, 'claim-recurring').click();
  await settleUntil(window, () => claimBuilds.length === 1);
  await settle(window);

  assert.equal(claimBuilds[0].outcome, 'pass');
  assert.equal(claimBuilds[0].scheduleAddress,
    '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh');
  assert.match(byRegion(root, 'modal').textContent, /Claim recurring proceeds/i);
  assert.match(byRegion(root, 'modal').textContent, /Simulation passed/i);
  assert.deepEqual(walletCalls, ['connect']);

  byAction(root, 'close-modal').click();
  proposalRowByOutcome(root, 'passed').click();
  await settleUntil(window, () => Boolean(
    root.querySelector('.ft-resolved-recurring [data-ft-action="cancel-recurring"]'),
  ));
  assert.match(
    root.querySelector('.ft-resolved-recurring').textContent,
    /Recurring orders/i,
  );
  cleanupMount(mounted);
});

test('interactive history chart controls update and clean up an injected chart adapter', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow();
  const charts = [];
  const createProposalHistoryChart = (options) => {
    const record = {
      options,
      destroyed: false,
      themes: [],
      ranges: [],
      visibility: [],
      tools: [],
    };
    charts.push(record);
    return {
      applyTheme(theme) {
        record.themes.push(theme);
      },
      setRange(range) {
        record.ranges.push(range);
      },
      setSeriesVisible(field, visible) {
        record.visibility.push([field, visible]);
      },
      zoomIn() {
        record.tools.push('zoom-in');
      },
      zoomOut() {
        record.tools.push('zoom-out');
      },
      resetView() {
        record.tools.push('reset');
      },
      destroy() {
        record.destroyed = true;
      },
    };
  };
  const controller = mountFutardTerminal({
    window,
    root,
    createProposalHistoryChart,
  });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settle(window);
  await settle(window);

  assert.ok(charts.length >= 1);
  const activeChart = charts[charts.length - 1];
  assert.equal(activeChart.options.ticker, 'LOYAL');
  assert.equal(activeChart.options.history.series.length, 16);
  assert.equal(activeChart.options.isLive, true);
  assert.equal(activeChart.options.thresholdPct, undefined);
  assert.equal(activeChart.options.visibility.passTwap, false);
  assert.equal(activeChart.options.visibility.failTwap, false);
  assert.equal(
    byRole(root, 'proposal-history-chart')
      .classList.contains('ft-hourly-chart-pending'),
    false,
  );

  const failToggle = root.querySelector(
    '.ft-hourly-overlay-fail',
  );
  failToggle.click();
  assert.equal(failToggle.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(activeChart.visibility.at(-1), ['failPrice', false]);
  failToggle.click();
  assert.equal(failToggle.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(activeChart.visibility.at(-1), ['failPrice', true]);

  assert.equal(root.querySelector('.ft-hourly-overlay-pass-twap'), null);
  assert.equal(root.querySelector('.ft-hourly-overlay-fail-twap'), null);

  assert.equal(root.querySelector('[data-ft-role="hourly-series-trigger"]'), null);
  assert.equal(root.querySelector('[data-ft-role="hourly-series-menu"]'), null);

  assert.equal(root.querySelector('[data-ft-role="hourly-range-trigger"]'), null);
  assert.equal(root.querySelector('[data-ft-role="hourly-range-menu"]'), null);

  assert.equal(root.querySelectorAll('[data-ft-chart-tool]').length, 0);
  assert.equal(root.querySelector('.ft-chart-crosshair-rail'), null);
  assert.equal(root.querySelector('.ft-hourly-toolbar'), null);

  const twapScroll = root.querySelector('[data-ft-role="twap-window-scroll"]');
  assert.ok(twapScroll);
  Object.defineProperties(twapScroll, {
    clientWidth: { configurable: true, value: 300 },
    scrollWidth: { configurable: true, value: 900 },
  });
  twapScroll.scrollLeft = 0;
  const wheelForward = new window.WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  });
  twapScroll.dispatchEvent(wheelForward);
  assert.equal(twapScroll.scrollLeft, 120);
  assert.equal(wheelForward.defaultPrevented, true);
  twapScroll.scrollLeft = 600;
  const wheelAtEnd = new window.WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  });
  twapScroll.dispatchEvent(wheelAtEnd);
  assert.equal(twapScroll.scrollLeft, 600);
  assert.equal(wheelAtEnd.defaultPrevented, false);
  const keyboardBack = new window.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'ArrowLeft',
  });
  twapScroll.dispatchEvent(keyboardBack);
  assert.ok(twapScroll.scrollLeft < 600);
  assert.equal(keyboardBack.defaultPrevented, true);

  const chartPanel = byRole(root, 'proposal-history');
  assert.equal(byAction(root, 'toggle-chart-expansion'), null);
  assert.equal(chartPanel.classList.contains('is-expanded'), false);
  assert.equal(window.document.body.classList.contains('chart-frame-expanded'), false);

  byAction(root, 'toggle-theme').click();
  assert.equal(activeChart.themes.at(-1), 'dark');

  controller.destroy();
  assert.equal(activeChart.destroyed, true);
  cleanupMount(mounted);
});

test('proposal browser keeps resolved trade controls explorable while execution stays disabled', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow();
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();

  assert.equal(proposalRows(root).length, 3);
  assert.equal(filterButton(root, 'all')?.getAttribute('aria-pressed'), 'true');
  assert.ok(filterButton(root, 'live'));
  assert.ok(filterButton(root, 'resolved'));
  assert.equal(filterButton(root, 'history'), null);
  assert.equal(filterButton(root, 'observed'), null);
  assert.equal(filterButton(root, 'passed'), null);
  assert.equal(filterButton(root, 'failed'), null);
  assert.equal(byAction(root, 'show-observed'), null);
  assert.doesNotMatch(root.textContent, /Snapshots/);

  filterButton(root, 'resolved').click();
  assert.equal(filterButton(root, 'resolved').getAttribute('aria-pressed'), 'true');
  assert.equal(proposalRows(root).length, 2);
  assert.equal(proposalRowByState(root, 'live'), null);

  const passedRow = proposalRowByOutcome(root, 'passed');
  assert.ok(passedRow);
  assert.match(passedRow.textContent, /Renew the META liquidity mandate/);
  assert.equal(
    passedRow.querySelector('[data-ft-role="proposal-status"]')?.dataset.ftStatus,
    'resolved',
  );
  assert.equal(
    passedRow.querySelector('[data-ft-role="proposal-status"]')?.dataset.ftOutcome,
    'passed',
  );
  assert.match(passedRow.textContent, /Resolved/);
  passedRow.click();
  await settle(window);

  assert.equal(
    byRole(root, 'proposal-title').textContent.trim(),
    'Renew the META liquidity mandate',
  );
  const passedArchive = byRole(root, 'trade-ticket').querySelector('.ft-archive-ticket');
  assert.ok(passedArchive);
  assert.ok(passedArchive.classList.contains('ft-ownership-ticket'));
  assert.equal(passedArchive.querySelectorAll('.ft-proposal-trade-tabs button').length, 3);
  assert.equal(passedArchive.querySelectorAll('.ft-ownership-side-tabs button').length, 2);
  assert.equal(
    [...passedArchive.querySelectorAll('.ft-proposal-trade-tabs button')]
      .every(button => button.disabled === false),
    true,
  );
  assert.equal(
    [...passedArchive.querySelectorAll('.ft-ownership-side-tabs button')]
      .every(button => button.disabled === false),
    true,
  );
  assert.equal(passedArchive.querySelectorAll('.ft-ownership-swap-field').length, 2);
  assert.equal(passedArchive.querySelector('input').disabled, true);
  const passedTradeCta = passedArchive.querySelector('[data-ft-role="archived-trade-cta"]');
  assert.ok(passedTradeCta);
  assert.equal(passedTradeCta.disabled, true);
  assert.match(passedTradeCta.textContent, /trading closed/i);
  assert.match(passedArchive.textContent, /PASS close\$4\.860/);
  assert.match(passedArchive.textContent, /Spot close\$4\.530/);
  assert.match(passedArchive.textContent, /FAIL close\$4\.450/);
  assert.match(passedArchive.textContent, /ResultResolved/);
  assert.equal(passedArchive.querySelector('.ft-archive-settlement'), null);
  assert.doesNotMatch(passedArchive.textContent, /Redeem resolved positions/i);
  assert.equal(byAction(root, 'review-redeem'), null);
  assert.doesNotMatch(passedArchive.textContent, /Open governance record/i);
  assert.equal(passedArchive.querySelector('.ft-archive-source-link'), null);
  assert.equal(byAction(root, 'execute-trade'), null);
  assert.equal(byAction(root, 'open-execution'), null);
  assert.equal(byRole(root, 'amount'), null);
  const marketChart = byRegion(root, 'market-chart');
  assert.ok(marketChart);
  assert.equal(byRegion(root, 'market-stage').querySelector('[data-ft-role="proposal-history"]'), null);
  assert.match(marketChart.textContent, /\bPass\b/i);
  assert.match(marketChart.textContent, /\bFail\b/i);
  assert.doesNotMatch(marketChart.textContent, /01Resolved/i);
  assert.equal(marketChart.querySelector('.ft-hourly-chart-foot'), null);
  assert.equal(marketChart.querySelector('.ft-hourly-values'), null);
  assert.equal(marketChart.querySelector('.ft-hourly-source-note'), null);
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelectorAll('[data-ft-series]').length,
    0,
  );
  assert.match(byRegion(root, 'market-stage').textContent, /Decision resolved/i);
  assert.doesNotMatch(byRegion(root, 'market-stage').textContent, /Proposal timeline/i);

  passedArchive.querySelector('[data-ft-trade-market="spot"]').click();
  let interactiveArchive = byRole(root, 'trade-ticket').querySelector('.ft-archive-ticket');
  assert.equal(
    interactiveArchive.querySelector('[data-ft-trade-market="spot"]').getAttribute('aria-selected'),
    'true',
  );
  assert.match(interactiveArchive.querySelector('.ft-ownership-receive-field').textContent, /META/);
  assert.doesNotMatch(interactiveArchive.querySelector('.ft-ownership-receive-field').textContent, /PASS META/);

  interactiveArchive.querySelector('[data-ft-outcome="fail"]').click();
  interactiveArchive = byRole(root, 'trade-ticket').querySelector('.ft-archive-ticket');
  assert.equal(
    interactiveArchive.querySelector('[data-ft-outcome="fail"]').getAttribute('aria-selected'),
    'true',
  );
  assert.match(interactiveArchive.querySelector('.ft-ownership-receive-field').textContent, /FAIL META/);

  interactiveArchive.querySelector('[data-ft-side="sell"]').click();
  interactiveArchive = byRole(root, 'trade-ticket').querySelector('.ft-archive-ticket');
  assert.equal(
    interactiveArchive.querySelector('[data-ft-side="sell"]').getAttribute('aria-selected'),
    'true',
  );
  assert.equal(interactiveArchive.querySelector('[data-ft-role="archived-trade-cta"]').disabled, true);

  filterButton(root, 'all').click();
  assert.equal(proposalRows(root).length, 3);
  filterButton(root, 'resolved').click();
  assert.equal(filterButton(root, 'resolved').getAttribute('aria-pressed'), 'true');
  assert.equal(proposalRows(root).length, 2);
  const search = byRole(root, 'search');
  search.value = 'Atlas analytics';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(proposalRows(root).length, 1);
  const failedRow = proposalRowByOutcome(root, 'failed');
  assert.ok(failedRow);
  assert.match(failedRow.textContent, /Acquire the Atlas analytics business/);
  failedRow.click();
  await settle(window);
  assert.equal(
    byRole(root, 'proposal-title').textContent.trim(),
    'Acquire the Atlas analytics business',
  );
  assert.equal(
    byRole(root, 'trade-ticket')
      .querySelector('[data-ft-role="proposal-status"]')?.dataset.ftStatus,
    'resolved',
  );
  assert.equal(
    byRole(root, 'trade-ticket')
      .querySelector('[data-ft-role="proposal-status"]')?.dataset.ftOutcome,
    'failed',
  );
  const failedTradeCta = byRole(root, 'trade-ticket')
    .querySelector('[data-ft-role="archived-trade-cta"]');
  assert.ok(failedTradeCta);
  assert.equal(failedTradeCta.disabled, true);
  assert.match(failedTradeCta.textContent, /trading closed/i);
  assert.equal(byAction(root, 'open-execution'), null);
  assert.equal(byRole(root, 'proposal-history-chart'), null);
  assert.match(
    byRole(root, 'proposal-history').textContent,
    /No 01Resolved market history is indexed/i,
  );

  search.value = '';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  filterButton(root, 'live').click();
  assert.equal(proposalRows(root).length, 1);
  const liveRow = proposalRowByState(root, 'live');
  assert.ok(liveRow);
  liveRow.click();

  assert.equal(
    byRole(root, 'proposal-title').textContent.trim(),
    'Fund Loyal contributor growth for Q3',
  );
  assert.ok(byAction(root, 'open-execution'));
  assert.ok(byRole(root, 'amount'));
  assert.equal(
    byRole(root, 'trade-ticket').querySelector('[data-ft-role="archived-trade-cta"]'),
    null,
  );

  cleanupMount(mounted);
});

test('stale indexed rows stay hidden while current incomplete lifecycle rows remain read-only', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const staleIndexedProposal = {
    ...PROPOSAL_INDEX.proposals[1],
    id: testAddress(41),
    number: 9,
    title: 'Legacy draft index record',
    status: null,
    rawStatus: 'draft',
    tradable: false,
    tradabilityReason: 'proposal_status_unknown',
    createdAt: null,
    endsAt: null,
    resolvedAt: null,
    outcome: null,
    market: null,
  };
  const currentIndexedProposal = {
    ...staleIndexedProposal,
    id: testAddress(42),
    number: 10,
    title: 'Current proposal awaiting lifecycle confirmation',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
  const proposalIndex = {
    ...PROPOSAL_INDEX,
    summary: {
      ...PROPOSAL_INDEX.summary,
      total: 5,
      unknown: 2,
      filtered: 5,
    },
    pagination: {
      ...PROPOSAL_INDEX.pagination,
      returned: 5,
      total: 5,
    },
    proposals: [
      ...PROPOSAL_INDEX.proposals,
      staleIndexedProposal,
      currentIndexedProposal,
    ],
  };
  const { root, window } = makeWindow({ proposalIndex });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();

  assert.match(byRole(root, 'status').textContent, /1 live · 2 resolved · 1 indexed record/i);
  assert.equal(filterButton(root, 'resolved').querySelector('strong').textContent, '2');
  assert.equal(filterButton(root, 'indexed').querySelector('strong').textContent, '1');

  filterButton(root, 'indexed').click();
  assert.equal(proposalRows(root).length, 1);
  const indexedRow = proposalRowByState(root, 'indexed');
  assert.ok(indexedRow);
  assert.match(indexedRow.textContent, /Current proposal awaiting lifecycle confirmation/);
  assert.doesNotMatch(root.textContent, /Legacy draft index record/);
  assert.match(indexedRow.textContent, /Indexed/);
  assert.doesNotMatch(indexedRow.textContent, /Resolved/);
  indexedRow.click();
  await settle(window);
  assert.match(byRole(root, 'trade-ticket').textContent, /Indexed record/i);
  assert.match(byRole(root, 'trade-ticket').textContent, /Trading unavailable/i);

  cleanupMount(mounted);
});

test('RPC health ignores archive index warnings but reports actual Solana RPC degradation', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const indexWarning = {
    ...PROPOSAL_INDEX,
    degraded: {
      active: true,
      services: [
        'futarchy-historic-markets-db-unavailable',
        'futarchy-proposal-config-mismatch',
      ],
      issues: [{ proposalId: PASSED_PROPOSAL_ID, reason: 'historic_market_not_retained' }],
    },
  };
  const indexWindow = makeWindow({ proposalIndex: indexWarning });
  const indexController = mountFutardTerminal({
    window: indexWindow.window,
    root: indexWindow.root,
  });
  const indexMount = trackMount(indexController, indexWindow.window);
  await indexController.refresh();

  assert.equal(byRegion(indexWindow.root, 'rpc-status').textContent, 'CONFIRMED');
  assert.equal(byRegion(indexWindow.root, 'rpc-status').dataset.state, 'live');
  assert.match(
    byRole(indexWindow.root, 'status').textContent,
    /Archive coverage is partial.*live RPC remains confirmed/i,
  );
  cleanupMount(indexMount);

  const rpcWarning = {
    ...ACTIVE_MARKETS,
    degraded: {
      active: true,
      services: ['futarchy-solana-rpc-unavailable'],
      issues: [],
    },
  };
  const rpcWindow = makeWindow({ activeMarkets: rpcWarning });
  const rpcController = mountFutardTerminal({
    window: rpcWindow.window,
    root: rpcWindow.root,
  });
  const rpcMount = trackMount(rpcController, rpcWindow.window);
  await rpcController.refresh();

  assert.equal(byRegion(rpcWindow.root, 'rpc-status').textContent, 'DEGRADED');
  assert.equal(byRegion(rpcWindow.root, 'rpc-status').dataset.state, 'warning');
  cleanupMount(rpcMount);
});

test('ownership workspace keeps decision-feed outages scoped to decision markets', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const liveMarketError = Object.assign(
    new Error('Live decision account validation failed'),
    { code: 'LIVE_MARKET_VALIDATION_FAILED' },
  );
  const ownershipWindow = makeWindow({
    activeMarketsError: liveMarketError,
    url: 'https://navgator.xyz/?token=loyal&view=markets&tab=tokens',
  });
  const ownershipController = mountFutardTerminal({
    window: ownershipWindow.window,
    root: ownershipWindow.root,
    mode: 'token',
    token: 'loyal',
  });
  const ownershipMount = trackMount(ownershipController, ownershipWindow.window);
  await ownershipController.ready;

  assert.ok(byRole(ownershipWindow.root, 'ownership-token-chart'));
  assert.equal(
    ownershipWindow.root.classList.contains('ft-has-system-message'),
    false,
    'a decision-feed outage must not expose the decision RPC status strip over spot Tokens',
  );
  cleanupMount(ownershipMount);

  const decisionWindow = makeWindow({
    activeMarketsError: liveMarketError,
    url: 'https://navgator.xyz/?token=loyal&view=markets',
  });
  const decisionController = mountFutardTerminal({
    window: decisionWindow.window,
    root: decisionWindow.root,
    mode: 'token',
    token: 'loyal',
  });
  const decisionMount = trackMount(decisionController, decisionWindow.window);
  await decisionController.ready;

  assert.equal(byRegion(decisionWindow.root, 'rpc-status').textContent, 'OFFLINE');
  assert.equal(byRegion(decisionWindow.root, 'rpc-status').dataset.state, 'error');
  assert.equal(decisionWindow.root.classList.contains('ft-has-system-message'), true);
  assert.match(
    byRole(decisionWindow.root, 'status').textContent,
    /live market reads are temporarily unavailable/i,
  );
  cleanupMount(decisionMount);
});

test('audit release stays read-only without hiding public market data', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const terminal = makeWindow();
  const controller = mountFutardTerminal({
    executionRelease: {
      code: 'AUDIT_REVIEW_REQUIRED',
      enabled: false,
      message: 'Trading is paused while 01r.trade completes independent security review.',
      phase: 'audit-readiness-v1',
    },
    window: terminal.window,
    root: terminal.root,
  });
  const mounted = trackMount(controller, terminal.window);
  await controller.ready;

  assert.equal(proposalRows(terminal.root).length, 3);
  assert.ok(byRole(terminal.root, 'proposal-history-chart'));
  assert.match(
    byRole(terminal.root, 'execution-paused').textContent,
    /Trading is temporarily paused.*independent security review.*data, charts, and wallet balance reads remain available/is,
  );
  assert.equal(byAction(terminal.root, 'execute-trade'), null);
  assert.equal(byAction(terminal.root, 'review-ownership-trade'), null);
  assert.equal(
    terminal.requests.some(url => /\/api\/beta\/trading/.test(url)),
    false,
  );

  cleanupMount(mounted);
});

test('program revision mismatch pauses execution without hiding public proposals', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const programIntegrity = {
    ...PROGRAM_INTEGRITY,
    status: 'blocked',
    canTransact: false,
    programs: PROGRAM_INTEGRITY.programs.map((program, index) => ({
      ...program,
      observedDeploymentSlot: index === 0
        ? String(Number(program.observedDeploymentSlot) + 1)
        : program.observedDeploymentSlot,
      status: index === 0 ? 'mismatch' : 'verified',
    })),
    issues: [{
      code: 'PROGRAM_DEPLOYMENT_CHANGED',
      program: 'metadao-futarchy',
      message: 'MetaDAO Futarchy was upgraded after review.',
    }],
  };
  const terminal = makeWindow({ programIntegrity });
  const controller = mountFutardTerminal({
    window: terminal.window,
    root: terminal.root,
  });
  const mounted = trackMount(controller, terminal.window);
  await controller.refresh();

  assert.equal(byRegion(terminal.root, 'program-status').textContent, 'BLOCKED');
  assert.equal(byRegion(terminal.root, 'program-status').dataset.state, 'error');
  assert.match(
    byRole(terminal.root, 'status').textContent,
    /Trading paused.*program changed.*Proposal data remains available/i,
  );
  assert.equal(proposalRows(terminal.root).length, 3);
  assert.match(
    byRole(terminal.root, 'trade-ticket').textContent,
    /Trading paused · program review required/i,
  );
  assert.equal(byAction(terminal.root, 'execute-trade'), null);
  assert.equal(controller.getState().canTransact, false);

  cleanupMount(mounted);
});

test('wallet connection never invokes a signing method before explicit review', async () => {
  const calls = [];
  const provider = {
    isPhantom: true,
    publicKey: null,
    async connect() {
      calls.push('connect');
      this.publicKey = { toString: () => WALLET_ADDRESS };
      return { publicKey: this.publicKey };
    },
    async disconnect() {
      calls.push('disconnect');
      this.publicKey = null;
    },
    async signTransaction() {
      calls.push('signTransaction');
      throw new Error('The terminal must not sign in read-only mode');
    },
    async signAllTransactions() {
      calls.push('signAllTransactions');
      throw new Error('The terminal must not sign in read-only mode');
    },
    async sendTransaction() {
      calls.push('sendTransaction');
      throw new Error('The terminal must not send in read-only mode');
    },
  };
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({ provider });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();

  byAction(root, 'connect-wallet').click();
  await settleUntil(window, () => calls.includes('connect'));

  assert.deepEqual(calls, ['connect']);
  assert.match(byRole(root, 'wallet-status').textContent, /9xQe|6vq|connected/i);
  assert.ok(byRole(root, 'positions'));
  assert.match(byRole(root, 'positions').textContent, /PASS LOYAL/);
  assert.match(byRole(root, 'positions').textContent, /125\.250000000000000001/);
  assert.match(byRole(root, 'positions').textContent, /FAIL USDC/);
  assert.match(byRole(root, 'positions').textContent, /Unavailable/);
  const unavailableRow = Array.from(root.querySelectorAll('.ft-conditional-balances > span'))
    .find(row => /FAIL USDC/.test(row.textContent));
  assert.ok(unavailableRow);
  assert.match(unavailableRow.textContent, /Unavailable/);
  assert.doesNotMatch(unavailableRow.textContent, /\b0(?:\.0+)?\b/);
  assert.equal(calls.includes('signTransaction'), false);
  assert.equal(calls.includes('signAllTransactions'), false);
  assert.equal(calls.includes('sendTransaction'), false);

  root.querySelector(
    '[data-ft-action="select-order-type"][data-ft-order-type="swap"]',
  ).click();
  const spotAmount = byRole(root, 'amount');
  assert.equal(spotAmount.getAttribute('aria-label'), 'Trade amount in USDC');
  assert.match(spotAmount.closest('.ft-amount-field').textContent, /USDC held\s*50/);
  const executeTrade = byAction(root, 'execute-trade');
  assert.equal(executeTrade.disabled, true);
  spotAmount.value = '1';
  spotAmount.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(byAction(root, 'execute-trade').disabled, false);
  assert.deepEqual(calls, ['connect']);
  root.querySelector(
    '[data-ft-action="select-side"][data-ft-side="sell"]',
  ).click();
  assert.equal(
    byRole(root, 'amount').getAttribute('aria-label'),
    'Trade amount in LOYAL',
  );
  assert.match(
    byRole(root, 'amount').closest('.ft-amount-field').textContent,
    /LOYAL held\s*8/,
  );

  const disconnect = byAction(root, 'disconnect-wallet');
  assert.ok(disconnect);
  disconnect.click();
  await settle(window);
  assert.deepEqual(calls, ['connect', 'disconnect']);

  cleanupMount(mounted);
});

test('decision trades simulate and open the wallet from one explicit execute click', async () => {
  const calls = [];
  const fingerprint = 'c'.repeat(64);
  const provider = {
    isPhantom: true,
    publicKey: null,
    async connect() {
      calls.push('connect');
      this.publicKey = { toString: () => WALLET_ADDRESS };
      return { publicKey: this.publicKey };
    },
    async signTransaction(transaction) {
      calls.push('signTransaction');
      return transaction;
    },
  };
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    provider,
    decisionAttestResponder(body) {
      calls.push('attest');
      assert.equal(body.transaction, 'unsigned-decision-transaction');
      return { transaction: 'attributed-decision-transaction' };
    },
    solanaTradingOverrides: {
      createMainnetConnection() {
        return {};
      },
      async buildConditionalSwapPlan(input) {
        calls.push('build');
        assert.equal(input.outcome, 'pass');
        assert.equal(input.side, 'buy');
        assert.equal(input.amount, '1');
        assert.equal(input.manifestBook.canonical, true);
        assert.equal(
          input.manifestBook.address,
          PROPOSAL_MARKET_DATA.books.pass.address,
        );
        return {
          kind: 'swap',
          transaction: {},
          builtAt: Date.now(),
          summary: {
            action: 'BUY PASS',
            venue: 'MetaDAO v0.6 AMM',
            feePayer: WALLET_ADDRESS,
            amountIn: '1 USDC',
            inputMint: ACTIVE_MARKETS.markets[0].quoteMint,
            estimatedAmountOut: '7.4 PASS LOYAL',
            minimumAmountOut: '7.326 PASS LOYAL',
            outputMint: ACTIVE_MARKETS.markets[0].proposal.passBaseMint,
            recipient: WALLET_ADDRESS,
            programIds: [PROPOSAL_ID],
          },
        };
      },
      decisionAttributionRequest(plan) {
        calls.push('attributionRequest');
        assert.equal(plan.kind, 'swap');
        return { transaction: 'unsigned-decision-transaction' };
      },
      async applyDecisionAttribution(_connection, plan, payload) {
        calls.push('applyAttribution');
        assert.equal(payload.transaction, 'attributed-decision-transaction');
        return {
          ...plan,
          transaction: { attributed: true },
          summary: {
            ...plan.summary,
            attributionAuthority: WALLET_ADDRESS,
            attributionMarker: '01RX:D1:0',
            platformFeeBps: 0,
          },
        };
      },
      async simulatePlan() {
        calls.push('simulate');
        return {
          ok: true,
          unitsConsumed: 42_000,
          error: null,
          transactionFingerprint: fingerprint,
        };
      },
      async sendPlan(_connection, adapter, plan) {
        calls.push('sendPlan');
        assert.equal(plan.reviewFingerprint, fingerprint);
        await adapter.provider.signTransaction(plan.transaction);
        return { signature: TRANSACTION_SIGNATURE };
      },
      async confirmSignature() {
        calls.push('confirm');
        return {
          signature: TRANSACTION_SIGNATURE,
          status: 'confirmed',
          slot: 355000123,
        };
      },
    },
  });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();

  byAction(root, 'connect-wallet').click();
  await settleUntil(window, () => calls.includes('connect'));
  root.querySelector(
    '[data-ft-action="select-order-type"][data-ft-order-type="swap"]',
  ).click();
  const amount = byRole(root, 'amount');
  amount.value = '1';
  amount.dispatchEvent(new window.Event('input', { bubbles: true }));

  const execute = byAction(root, 'execute-trade');
  assert.match(execute.textContent, /Execute Buy PASS/i);
  assert.equal(execute.disabled, false);
  assert.deepEqual(calls, ['connect']);
  assert.equal(byAction(root, 'approve-transaction'), null);

  execute.click();
  await settleUntil(window, () => calls.includes('signTransaction'));
  await settleUntil(window, () => calls.includes('confirm'));

  assert.deepEqual(calls, [
    'connect',
    'build',
    'attributionRequest',
    'attest',
    'applyAttribution',
    'simulate',
    'sendPlan',
    'signTransaction',
    'confirm',
  ]);
  assert.equal(byAction(root, 'approve-transaction'), null);
  assert.equal(root.querySelector('.ft-review-modal'), null);
  assert.equal(root.classList.contains('ft-execution-locked'), false);

  cleanupMount(mounted);
});

test('resolved proposals keep redemption controls out of the archived trading UI', async () => {
  const calls = [];
  const provider = {
    isPhantom: true,
    publicKey: null,
    async connect() {
      calls.push('connect');
      this.publicKey = { toString: () => WALLET_ADDRESS };
      return { publicKey: this.publicKey };
    },
    async signTransaction() {
      calls.push('signTransaction');
      throw new Error('Signing requires a separate reviewed action');
    },
  };
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    provider,
    solanaTradingOverrides: {
      createMainnetConnection() {
        return {};
      },
      async inspectConditionalRedemption({ market }) {
        calls.push('inspectConditionalRedemption');
        assert.equal(market.id, PASSED_PROPOSAL_ID);
        return {
          outcome: 'pass',
          hasRedeemableBalance: true,
          positions: [
            {
              label: 'PASS META',
              mint: PROPOSAL_ID,
              available: true,
              amount: 12.5,
              amountString: '12.5',
              rawAmount: '12500000',
              decimals: 6,
            },
            {
              label: 'PASS USDC',
              mint: PASSED_PROPOSAL_ID,
              available: true,
              amount: 3,
              amountString: '3',
              rawAmount: '3000000',
              decimals: 6,
            },
          ],
          claims: [
            {
              symbol: 'META',
              estimatedRaw: '12500000',
              estimatedAmount: '12.5',
            },
            {
              symbol: 'USDC',
              estimatedRaw: '3000000',
              estimatedAmount: '3',
            },
          ],
        };
      },
    },
  });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();

  byAction(root, 'connect-wallet').click();
  await settleUntil(window, () => calls.includes('connect'));
  proposalRowByOutcome(root, 'passed').click();
  await settleUntil(window, () => calls.includes('inspectConditionalRedemption'));

  assert.doesNotMatch(byRole(root, 'trade-ticket').textContent, /Verified redeemable value/i);
  assert.doesNotMatch(byRole(root, 'trade-ticket').textContent, /Redeem resolved positions/i);
  assert.equal(byRole(root, 'trade-ticket').querySelector('.ft-archive-settlement'), null);
  assert.equal(byRole(root, 'settlement-positions'), null);
  assert.equal(byAction(root, 'review-redeem'), null);
  assert.equal(calls.includes('signTransaction'), false);

  cleanupMount(mounted);
});

test('submitted transaction state survives refresh and reconciles to confirmed', async () => {
  const provider = {
    isPhantom: true,
    publicKey: null,
    async connect() {
      this.publicKey = { toString: () => WALLET_ADDRESS };
      return { publicKey: this.publicKey };
    },
    async signTransaction() {
      throw new Error('No signature should be requested');
    },
  };
  let statusReads = 0;
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    provider,
    solanaTradingOverrides: {
      createMainnetConnection() {
        return {};
      },
      async getSignatureStates(_connection, signatures) {
        statusReads += 1;
        assert.deepEqual(signatures, [TRANSACTION_SIGNATURE]);
        return [{
          signature: TRANSACTION_SIGNATURE,
          status: 'confirmed',
          slot: 355000123,
          error: '',
        }];
      },
    },
  });
  window.localStorage.setItem('navgator-futarchy-transactions-v1', JSON.stringify([{
    signature: TRANSACTION_SIGNATURE,
    owner: WALLET_ADDRESS,
    proposalId: PROPOSAL_ID,
    status: 'submitted',
    kind: 'limit',
    action: 'BUY PASS LIMIT',
    venue: 'Manifest',
    createdAt: '2026-07-24T12:00:00.000Z',
    updatedAt: '2026-07-24T12:00:00.000Z',
  }]));
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();

  byAction(root, 'connect-wallet').click();
  await settleUntil(window, () => (
    byRole(root, 'transaction-state')?.dataset.ftTransactionStatus === 'confirmed'
  ));

  assert.equal(statusReads, 1);
  assert.match(byRole(root, 'transaction-state').textContent, /Confirmed/);
  assert.ok(byRole(root, 'trade-submit'));
  assert.equal(
    byRole(root, 'trade-submit').closest('[data-ft-role="trade-action"]'),
    byRole(root, 'trade-action'),
  );
  assert.equal(
    byRole(root, 'transaction-state').closest('[data-ft-role="decision-ticket-scroll"]'),
    byRole(root, 'decision-ticket-scroll'),
  );
  assert.match(byRole(root, 'transaction-activity').textContent, /BUY PASS LIMIT/);
  const persisted = JSON.parse(
    window.localStorage.getItem('navgator-futarchy-transactions-v1'),
  );
  assert.equal(persisted[0].status, 'confirmed');
  assert.equal(persisted[0].slot, 355000123);

  cleanupMount(mounted);
});

test('withdrawable Manifest balances open a simulated review without signing', async () => {
  const calls = [];
  const provider = {
    isPhantom: true,
    publicKey: null,
    async connect() {
      calls.push('connect');
      this.publicKey = { toString: () => WALLET_ADDRESS };
      return { publicKey: this.publicKey };
    },
    async signTransaction() {
      calls.push('signTransaction');
      throw new Error('Signing requires explicit approval');
    },
  };
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    provider,
    solanaTradingOverrides: {
      createMainnetConnection() {
        return {};
      },
      async buildManifestWithdrawPlan(input) {
        calls.push('buildWithdraw');
        assert.equal(input.outcome, 'pass');
        assert.equal(input.marketAddress, PROPOSAL_MARKET_DATA.books.pass.address);
        return {
          kind: 'withdraw',
          transaction: {},
          builtAt: Date.now(),
          summary: {
            cluster: 'solana:mainnet',
            venue: 'Manifest',
            action: 'WITHDRAW PASS MARKET BALANCES',
            amountIn: 'No new token deposit',
            inputMint: PROPOSAL_MARKET_DATA.books.pass.address,
            inputAccount: WALLET_ADDRESS,
            estimatedAmountOut: '4.125 PASS LOYAL',
            minimumAmountOut: null,
            outputMint: PROPOSAL_ID,
            recipient: WALLET_ADDRESS,
            feePayer: WALLET_ADDRESS,
            programIds: [PROPOSAL_ID],
            networkFeeSol: 0.000005,
          },
        };
      },
      async simulatePlan() {
        calls.push('simulate');
        return {
          ok: true,
          unitsConsumed: 42_000,
          transactionFingerprint: 'b'.repeat(64),
        };
      },
    },
  });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();

  byAction(root, 'connect-wallet').click();
  await settleUntil(window, () => Boolean(byAction(root, 'withdraw-manifest')));
  byAction(root, 'withdraw-manifest').click();
  await settleUntil(window, () => calls.includes('simulate'));

  assert.deepEqual(calls, ['connect', 'buildWithdraw', 'simulate']);
  assert.match(root.querySelector('[role="dialog"]').textContent, /Withdraw Manifest balance/);
  assert.match(root.querySelector('[role="dialog"]').textContent, /Simulation passed/);
  assert.match(root.querySelector('[role="dialog"]').textContent, /bbbbbbbbbbbbbbbb…bbbbbbbb/);
  assert.equal(calls.includes('signTransaction'), false);

  cleanupMount(mounted);
});

test('terminal exposes an honest empty state without synthesizing markets', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const empty = {
    ...ACTIVE_MARKETS,
    pendingProposalCount: 0,
    markets: [],
  };
  const emptyIndex = {
    ...PROPOSAL_INDEX,
    summary: {
      total: 0,
      pending: 0,
      passed: 0,
      failed: 0,
      removed: 0,
      tradable: 0,
    },
    proposals: [],
  };
  const { root, window } = makeWindow({
    activeMarkets: empty,
    proposalIndex: emptyIndex,
  });
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.refresh();

  assert.ok(byRole(root, 'terminal'));
  assert.equal(proposalRows(root).length, 0);
  assert.match(byRole(root, 'market-count').textContent, /0/);
  assert.match(byRole(root, 'status').textContent, /no indexed|0 live|empty|no governance/i);
  assert.equal(byRole(root, 'proposal-title'), null);
  assert.equal(root.querySelector('[data-ft-action="toggle-chat"]'), null);

  cleanupMount(mounted);
});
