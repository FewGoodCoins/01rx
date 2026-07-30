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
const MOCK_BASE_MINT = testAddress(21);
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
      thresholdBps: 150,
      decision: {
        passing: true,
        marginPct: 1.63,
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
    fail: series.filter(point => Number.isFinite(point.failPrice)).length,
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
  return import(moduleUrl.href);
}

async function loadProposalChartModule() {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, '../../src/markets/proposal-history-chart.js'),
  );
  return import(moduleUrl.href);
}

function makeWindow(options = {}) {
  const sidebar = options.sidebar
    ? `
      <section id="tlp-decisions-panel" hidden>
        <span id="tp-live-decision-count">0 active</span>
        <div id="tlp-decisions-list"></div>
      </section>
    `
    : '';
  const dom = new JSDOM(`<!doctype html>${sidebar}<div id="root"></div>`, {
    url: options.url || 'https://navgator.xyz/',
  });
  const { window } = dom;
  const requests = [];
  const responses = {
    activeMarkets: options.activeMarkets || ACTIVE_MARKETS,
    proposalIndex: options.proposalIndex || PROPOSAL_INDEX,
    homeBootstrap: options.homeBootstrap || HOME_BOOTSTRAP,
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
          return {
            ok: true,
            data: responses.proposalMarketData,
          };
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
    projectMetadata: {},
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
    proposalHistoryPhase,
    renderHourlyPriceChart,
  } = await loadTerminalModule();
  const history = normalizeProposalHistoryPayload({
    proposalId: PASSED_PROPOSAL_ID,
    preTwap: '2026-06-16T11:00:00.000Z',
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
    source: { provider: '01Resolved', sourceInterval: '15m' },
  });

  assert.equal(history.series.length, 2);
  assert.equal(history.series[0].underlyingPrice, 4.6);
  assert.equal(history.series[0].passPrice, null);
  assert.equal(history.series[0].passTwap, 4.8);
  assert.equal(history.series[1].failPrice, null);
  assert.equal(history.preTwap, '2026-06-16T11:00:00.000Z');

  const dom = new JSDOM(renderHourlyPriceChart(history, 'META', {
    windowEndedAt: '2026-06-16T11:30:00.000Z',
  }));
  const chart = dom.window.document;
  assert.equal(chart.querySelectorAll('[data-ft-series]').length, 0);
  assert.equal(chart.querySelectorAll('[data-ft-action="toggle-hourly-series"]').length, 6);
  assert.equal(chart.querySelectorAll('[data-ft-action="hourly-range"]').length, 0);
  assert.equal(chart.querySelector('[data-ft-role="hourly-range-trigger"]'), null);
  assert.equal(chart.querySelector('[data-ft-role="hourly-range-menu"]'), null);
  assert.equal(chart.querySelectorAll('[data-ft-role="hourly-series-trigger"]').length, 1);
  assert.equal(chart.querySelector('[data-ft-role="hourly-series-menu"]').hidden, true);
  assert.equal(
    chart.querySelectorAll('[data-ft-role="hourly-series-menu"] [role="menuitemcheckbox"]').length,
    3,
  );
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
  assert.equal(chart.querySelectorAll('.ft-chart-crosshair-rail button').length, 1);
  assert.equal(
    chart.querySelector('[data-ft-role="proposal-history-tradingview"]')
      .dataset.ftChartEngine,
    'tradingview-lightweight',
  );
  assert.equal(chart.querySelector('[data-ft-role="tradingview-attribution"]'), null);
  assert.equal(chart.querySelector('[data-ft-role="proposal-history-fallback"]'), null);
  assert.equal(chart.querySelector('.ft-hourly-plot-shell svg[viewBox="0 0 1000 1000"]'), null);
  assert.equal(chart.querySelector('[data-ft-chart-anchor="shared-launch-reserve"]'), null);
  assert.equal(chart.querySelector('.ft-hourly-chart-foot'), null);
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

test('TradingView chart adapter splits null values and missing hours into honest segments', async () => {
  const {
    PROPOSAL_HISTORY_GUIDE_LINE_STYLE,
    PROPOSAL_HISTORY_SERIES,
    interpolateChartTimeCoordinate,
    proposalChartData,
    proposalLaunchSeriesMarker,
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
    PROPOSAL_HISTORY_SERIES.map(series => series.label),
    ['Price', 'Pass', 'Fail'],
  );
  assert.equal(PROPOSAL_HISTORY_GUIDE_LINE_STYLE, 4);
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
      size: 1.3,
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
  assert.equal(chart.querySelector('[data-ft-role="hourly-spread"]'), null);
  assert.match(chart.querySelector('[data-ft-role="hourly-readout-time"]').textContent, /6\/16\/26 · 11:00 UTC/);
  assert.equal(chart.querySelector('.ft-hourly-phase-definition'), null);
  assert.equal(chart.querySelector('[data-ft-role="pre-twap-definition"]'), null);
  assert.equal(chart.querySelector('.ft-hourly-phase-cell'), null);
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
  assert.equal(root.querySelector('.ft-brand-copy strong')?.textContent, '01RX');
  assert.equal(root.getAttribute('data-navgator-app'), 'decision-markets');
  assert.ok(byRole(root, 'market-list'));
  assert.equal(proposalRows(root).length, 3);
  assert.equal(proposalRowByState(root, 'live')?.getAttribute('aria-pressed'), 'true');
  assert.equal(byRole(root, 'proposal-title').textContent.trim(), 'Fund Loyal contributor growth for Q3');
  assert.match(byRole(root, 'pass-card').textContent, /0\.1337/);
  assert.match(byRole(root, 'decision').textContent, /passing/i);
  assert.match(byRole(root, 'decision').textContent, /1\.50%|1\.5%/);
  assert.match(byRole(root, 'decision').textContent, /1\.63/);
  assert.ok(byRole(root, 'trade-ticket'));
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
    /USDC held\s*0\.0000/,
  );
  assert.equal(byRole(root, 'average-price').textContent, '$0.1400');
  assert.equal(byRole(root, 'position-before').textContent, '0.00');
  assert.equal(byRole(root, 'position-after').textContent, '0.00');
  assert.match(byRole(root, 'fail-payoff').textContent, /0\.00 LOYAL/);
  assert.match(byRole(root, 'pass-payoff').textContent, /0\.00 LOYAL/);
  assert.deepEqual(
    Array.from(root.querySelectorAll('[data-ft-action="decision-amount-preset"]'))
      .map(element => element.textContent.trim()),
    ['500', '1K', '2.5K', 'Max'],
  );
  root.querySelector(
    '[data-ft-action="decision-amount-preset"][data-ft-amount="500"]',
  ).click();
  assert.equal(byRole(root, 'amount').value, '500');
  assert.notEqual(byRole(root, 'position-after').textContent, '0.00');
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
  assert.match(chartHeader.textContent, /Proposal #7/);
  assert.equal(
    chartHeader.querySelector('.ft-chart-market-identity small').textContent.trim(),
    'Proposal #7',
  );
  assert.doesNotMatch(chartHeader.textContent, /Fund Loyal contributor growth for Q3/);
  assert.equal(chartHeader.querySelector('.ft-chart-market-identity a'), null);
  for (const label of ['Price', 'Pass', 'Fail', 'Threshold', 'Status', 'Result']) {
    assert.match(chartHeader.textContent, new RegExp(label));
  }
  assert.doesNotMatch(chartHeader.textContent, /Liquidity/);
  assert.match(
    chartHeader.querySelector('[data-ft-chart-header-metric="price"] strong').textContent,
    /^\$/,
  );
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
  const proposalChartPlaceholders = Array.from(
    byRole(root, 'proposal-history-chart')
      .querySelectorAll('.chart-tv-placeholder-button'),
  );
  assert.equal(proposalChartPlaceholders.length, 2);
  assert.equal(proposalChartPlaceholders.every(button => button.disabled), true);
  assert.equal(
    proposalChartPlaceholders.some(button => button.dataset.ftAction),
    false,
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
  passButton.click();
  buyButton.click();
  const amount = byRole(root, 'amount');
  amount.value = '100';
  amount.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(byRole(root, 'estimate'), null);
  actionWithText(root, 'select-outcome', /fail/i).click();
  assert.match(
    byRole(root, 'trade-ticket').querySelector('.ft-execution-ticket').className,
    /ft-order-outcome-fail/,
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

test('homepage discovery uses only public stable proposal reads and canonical token links', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { requests, root, window } = makeWindow();
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'discovery',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  assert.equal(controller.getState().mode, 'discovery');
  assert.equal(root.dataset.ftMode, 'discovery');
  assert.equal(proposalRows(root).length, 3);
  assert.equal(proposalRows(root)[0].dataset.ftProposalState, 'live');
  assert.equal(proposalRows(root)[1].dataset.ftProposalOutcome, 'passed');
  assert.equal(proposalRows(root)[2].dataset.ftProposalOutcome, 'failed');
  assert.equal(
    proposalRows(root)[0].getAttribute('href'),
    `/?token=loyal&view=markets&proposal=${PROPOSAL_ID}`,
  );
  assert.match(proposalRows(root)[0].textContent, /Loyal[\s\S]+LIVE/i);
  assert.equal(filterButton(root, 'indexed'), null);
  assert.equal(byAction(root, 'connect-wallet'), null);
  assert.deepEqual(
    [...new Set(requests.map(url => new URL(url).searchParams.get('view')).filter(Boolean))],
    ['proposals'],
  );
  assert.equal(requests.some(url => /\/api\/beta\//.test(url)), false);

  cleanupMount(mounted);
});

test('decision sidebar shows an honest empty state and reveals prior markets on request', async () => {
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
    activeMarkets: {
      ...ACTIVE_MARKETS,
      pendingProposalCount: 0,
      markets: [],
    },
    proposalIndex: priorProposalIndex,
    sidebar: true,
  });
  window.applyMarketSidebarSearch = () => {};
  const pastSidebar = window.document.createElement('section');
  pastSidebar.id = 'tlp-past-decisions-panel';
  pastSidebar.innerHTML = `
    <span id="tp-past-decisions-title"></span>
    <span id="tp-past-decision-count"></span>
    <div id="tlp-past-decisions-list"></div>
  `;
  window.document.body.append(pastSidebar);
  const controller = mountFutardTerminal({ window, root });
  const mounted = trackMount(controller, window);
  await controller.ready;
  await settle(window);

  const section = window.document.getElementById('tlp-decisions-panel');
  assert.equal(section.hidden, false);
  assert.equal(
    window.document.getElementById('tp-live-decision-count').textContent,
    '0 active',
  );
  assert.match(section.textContent, /No active decision markets/);
  assert.equal(
    window.document.querySelectorAll('#tlp-past-decisions-list .tp-decision-prior').length,
    2,
  );
  assert.equal(window.document.documentElement.dataset.decisionHistory, 'closed');
  assert.equal(window.document.getElementById('tlp-past-decisions-panel').hidden, true);

  section.querySelector('[data-decision-sidebar-action="toggle-history"]').click();

  assert.equal(window.document.documentElement.dataset.decisionHistory, 'open');
  assert.equal(window.document.getElementById('tlp-past-decisions-panel').hidden, false);
  assert.match(
    section.querySelector('[data-decision-sidebar-action="toggle-history"]').textContent,
    /Hide prior decision markets/,
  );

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
  await controller.ready;
  await settle(window);

  assert.equal(controller.getState().token, 'loyal');
  assert.equal(proposalRows(root).length, 1);
  assert.equal(byRole(root, 'proposal-title').textContent.trim(), 'Fund Loyal contributor growth for Q3');
  assert.equal(byRole(root, 'proposal-history-fallback'), null);
  assert.equal(
    byRole(root, 'proposal-history-chart').querySelector('.ft-hourly-fallback'),
    null,
  );
  const proposalRequestsBefore = requests.filter(url => /view=proposals(?:&|$)/.test(url)).length;
  assert.ok(proposalRequestsBefore > 0);
  assert.equal(
    requests.some(url => new URL(url, 'https://navgator.xyz').searchParams.has('token')),
    false,
  );

  await controller.setToken('meta');
  await settle(window);

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
  assert.equal(byAction(root, 'review-trade'), null);

  cleanupMount(mounted);
});

test('market sidebar keeps live decisions above tokens and renders past proposals for the selected token', async () => {
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
      <span id="tp-live-decision-count"></span>
      <div id="tlp-decisions-list"></div>
    </section>
    <section id="tlp-all-panel"></section>
    <section id="tlp-past-decisions-panel">
      <span id="tp-past-decisions-title"></span>
      <span id="tp-past-decision-count"></span>
      <div id="tlp-past-decisions-list"></div>
    </section>
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

  assert.equal(window.document.getElementById('tp-live-decision-count').textContent, '1 active');
  assert.match(
    window.document.getElementById('tlp-decisions-list').textContent,
    /LOYAL[\s\S]+Live/,
  );
  assert.equal(window.document.getElementById('tp-past-decisions-title').textContent, 'Past Proposals · META');
  assert.equal(window.document.getElementById('tp-past-decision-count').textContent, '1');
  window.document
    .querySelector('[data-decision-sidebar-action="toggle-history"]')
    .dispatchEvent(new window.MouseEvent('click', {
      bubbles: true,
      button: 0,
      cancelable: true,
    }));
  const metaArchive = window.document.querySelector('#tlp-past-decisions-list .tp-past-proposal-item');
  assert.ok(metaArchive);
  assert.match(metaArchive.textContent, /Proposal #41[\s\S]+Passed/);
  assert.equal(
    metaArchive.getAttribute('href'),
    `/?token=meta&view=markets&proposal=${PASSED_PROPOSAL_ID}`,
  );
  assert.equal(metaArchive.dataset.ftProposalId, PASSED_PROPOSAL_ID);
  assert.equal(metaArchive.dataset.ftToken, 'meta');
  assert.equal(
    shouldHandleSidebarProposalClick({
      button: 0,
      defaultPrevented: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }, metaArchive, 'token'),
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
    }, metaArchive, 'token'),
    false,
  );

  const selectionClick = new window.MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  assert.equal(metaArchive.dispatchEvent(selectionClick), false);
  assert.equal(selectionClick.defaultPrevented, true);
  assert.equal(controller.getState().selectedId, PASSED_PROPOSAL_ID);
  assert.equal(
    window.location.search,
    `?token=meta&view=markets&proposal=${PASSED_PROPOSAL_ID}`,
  );
  const loadingChart = byRole(root, 'proposal-history-chart');
  assert.ok(loadingChart.classList.contains('ft-hourly-chart-status-shell'));
  assert.equal(loadingChart.dataset.ftChartState, 'loading');
  assert.equal(loadingChart.getAttribute('aria-busy'), 'true');
  assert.ok(loadingChart.querySelector('.ft-hourly-toolbar'));
  assert.ok(loadingChart.querySelector('.ft-hourly-plot-shell'));
  assert.equal(
    loadingChart.querySelector('[data-ft-role="proposal-history-tradingview"]'),
    null,
  );

  await controller.setToken('solo');
  await settle(window);

  assert.equal(window.document.getElementById('tp-past-decisions-title').textContent, 'Past Proposals · SOLO');
  assert.equal(window.document.getElementById('tp-past-decision-count').textContent, '1');
  assert.match(
    window.document.getElementById('tlp-past-decisions-list').textContent,
    /Acquire the Atlas analytics business[\s\S]+Failed/,
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
      <span id="tp-live-decision-count"></span>
      <div id="tlp-decisions-list"></div>
    </section>
    <section id="tlp-all-panel"></section>
    <section id="tlp-past-decisions-panel">
      <span id="tp-past-decisions-title"></span>
      <span id="tp-past-decision-count"></span>
      <div id="tlp-past-decisions-list"></div>
    </section>
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
  await settleUntil(window, () => (
    controller.getState().token === 'loyal'
    && controller.getState().selectedId === PROPOSAL_ID
  ));
  assert.equal(controller.getState().token, 'loyal');
  assert.equal(controller.getState().selectedId, PROPOSAL_ID);

  cleanupMount(mounted);
});

test('past proposal navigation keeps the final chart shell mounted until delayed history is ready', async () => {
  let resolveHistory;
  const historyGate = new Promise((resolve) => {
    resolveHistory = resolve;
  });
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=meta&view=markets&tab=tokens',
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
  const sidebar = window.document.createElement('aside');
  sidebar.innerHTML = `
    <section id="tlp-decisions-panel">
      <span id="tp-live-decision-count"></span>
      <div id="tlp-decisions-list"></div>
    </section>
    <section id="tlp-all-panel"></section>
    <section id="tlp-past-decisions-panel">
      <span id="tp-past-decisions-title"></span>
      <span id="tp-past-decision-count"></span>
      <div id="tlp-past-decisions-list"></div>
    </section>
  `;
  window.document.body.prepend(sidebar);
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
  await controller.ready;

  window.document
    .querySelector('[data-decision-sidebar-action="toggle-history"]')
    .dispatchEvent(new window.MouseEvent('click', {
      bubbles: true,
      button: 0,
      cancelable: true,
    }));
  const proposalLink = window.document.querySelector(
    '#tlp-past-decisions-list .tp-past-proposal-item',
  );
  proposalLink.dispatchEvent(new window.MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
  }));

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
    data: PROPOSAL_HISTORIES[PASSED_PROPOSAL_ID],
  });
  await settleUntil(window, () => chartMounts.length === 1);

  const readyChart = byRole(root, 'proposal-history-chart');
  assert.equal(readyChart.dataset.ftChartState, 'ready');
  assert.equal(readyChart.getAttribute('aria-busy'), 'false');
  assert.ok(readyChart.classList.contains('ft-hourly-chart-enhanced'));
  assert.ok(
    readyChart.querySelector('[data-ft-role="proposal-history-tradingview"]'),
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

test('ownership workspace renders indexed spot transactions in its dedicated column', async () => {
  const { mountFutardTerminal } = await loadTerminalModule();
  const { root, window } = makeWindow({
    url: 'https://navgator.xyz/?token=loyal&tab=tokens',
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
  });
  const controller = mountFutardTerminal({
    window,
    root,
    mode: 'token',
    token: 'loyal',
  });
  const mounted = trackMount(controller, window);
  await controller.ready;

  const recentTransactions = byRole(root, 'ownership-recent-transactions');
  const rows = recentTransactions.querySelectorAll('.ft-ownership-transaction-row');
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /\$0\.1291[\s\S]+1,250/);
  assert.equal(
    rows[0].getAttribute('href'),
    `https://solscan.io/tx/${TRANSACTION_SIGNATURE}`,
  );
  const accountActivity = byRole(root, 'ownership-account-activity');
  assert.deepEqual(
    [...accountActivity.querySelectorAll('[data-ft-action="select-ownership-activity"]')]
      .map(control => control.textContent.trim()),
    ['Balances', 'Open Orders', 'Trade History'],
  );
  assert.match(
    accountActivity.querySelector('[data-ft-ownership-activity-panel="balances"]').textContent,
    /Connect wallet to view balances/,
  );
  accountActivity.querySelector('[data-ft-ownership-activity="orders"]').click();
  assert.equal(
    byRole(root, 'ownership-account-activity')
      .querySelector('[data-ft-ownership-activity="orders"]')
      .getAttribute('aria-selected'),
    'true',
  );
  assert.match(
    byRole(root, 'ownership-account-activity')
      .querySelector('[data-ft-ownership-activity-panel="orders"]')
      .textContent,
    /Connect wallet to view open orders/,
  );

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
      async signReviewedPlan(_adapter, plan) {
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
  const ownershipChartFrame = terminal.root.querySelector(
    '[data-ft-role="ownership-token-chart"] iframe',
  );
  assert.ok(ownershipChartFrame);
  assert.equal(ownershipChartFrame.hasAttribute('allow'), false);
  assert.equal(ownershipChartFrame.hasAttribute('allowfullscreen'), false);

  byAction(terminal.root, 'connect-wallet').click();
  await settleUntil(terminal.window, () => controller.getState().walletAddress === WALLET_ADDRESS);
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
  assert.equal(byAction(root, 'review-trade'), null);

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
  await settleUntil(window, () => intervals.includes('1h'));

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

test('proposal history uses retained verified observations when live and hourly feeds are empty', async () => {
  const retainedRequests = [];
  let resolveHourlyHistory;
  let hourlyHistorySettled = false;
  const { mountFutardTerminal } = await loadTerminalModule();
  const terminal = makeWindow({
    proposalHistoryResponder(url) {
      const params = new URL(url).searchParams;
      if (params.get('interval') === '15m') {
        throw Object.assign(new Error('interval must be 1h'), { status: 400 });
      }
      return new Promise((resolve) => {
        resolveHourlyHistory = () => {
          hourlyHistorySettled = true;
          resolve({
            ok: true,
            data: {
              ...hourlyHistory(PROPOSAL_ID, 'LOYAL', 0.13, { empty: true }),
              interval: '1h',
              requestedInterval: '1h',
            },
          });
        };
      });
    },
  });
  const sharedJson = terminal.window.NAVGATOR.api.json;
  terminal.window.NAVGATOR.api.json = async (url, requestOptions) => {
    if (!String(url).startsWith('/data/proposal-history/')) {
      return sharedJson(url, requestOptions);
    }
    retainedRequests.push(String(url));
    return {
      proposalId: PROPOSAL_ID,
      interval: '1h',
      preTwap: '2026-07-24T01:00:00.000Z',
      availability: 'complete',
      source: {
        provider: 'NAVgator retained 01Resolved history',
        sourceInterval: '15m',
        interval: '1h',
        aggregation: 'last_non_null_observation_per_utc_hour',
      },
      series: [[
        '2026-07-24T01:00:00.000Z',
        0.1293,
        0.132,
        0.1278,
        0.131,
        0.128,
      ]],
    };
  };
  const controller = mountFutardTerminal({
    window: terminal.window,
    root: terminal.root,
  });
  const mounted = trackMount(controller, terminal.window);
  await controller.ready;
  await settleUntil(terminal.window, () => (
    retainedRequests.length > 0
    && typeof resolveHourlyHistory === 'function'
    && byRole(terminal.root, 'proposal-history-chart')
  ));

  assert.deepEqual(retainedRequests, [
    `/data/proposal-history/${PROPOSAL_ID}.json`,
  ]);
  assert.equal(hourlyHistorySettled, false);
  assert.equal(
    byRole(terminal.root, 'proposal-history').querySelector('svg[viewBox="0 0 1000 1000"]'),
    null,
  );
  assert.equal(
    byRole(terminal.root, 'proposal-history-chart').querySelector('.ft-hourly-values'),
    null,
  );
  assert.doesNotMatch(
    byRole(terminal.root, 'proposal-history').textContent,
    /temporarily unavailable|No market history is indexed/i,
  );
  resolveHourlyHistory();
  await settle(terminal.window);

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
  assert.equal(byAction(disabledWindow.root, 'review-trade'), null);
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

  const seriesTrigger = root.querySelector('[data-ft-role="hourly-series-trigger"]');
  const seriesMenu = root.querySelector('[data-ft-role="hourly-series-menu"]');
  const passSeriesOption = seriesMenu.querySelector(
    '[data-ft-series-field="passPrice"]',
  );
  seriesTrigger.click();
  assert.equal(seriesTrigger.getAttribute('aria-expanded'), 'true');
  assert.equal(seriesMenu.hidden, false);
  passSeriesOption.click();
  assert.equal(passSeriesOption.getAttribute('aria-checked'), 'false');
  assert.equal(
    root.querySelector('.ft-hourly-overlay-pass').getAttribute('aria-pressed'),
    'false',
  );
  assert.deepEqual(activeChart.visibility.at(-1), ['passPrice', false]);
  passSeriesOption.click();
  assert.equal(passSeriesOption.getAttribute('aria-checked'), 'true');
  seriesTrigger.click();
  assert.equal(seriesTrigger.getAttribute('aria-expanded'), 'false');
  assert.equal(seriesMenu.hidden, true);

  assert.equal(root.querySelector('[data-ft-role="hourly-range-trigger"]'), null);
  assert.equal(root.querySelector('[data-ft-role="hourly-range-menu"]'), null);

  assert.equal(root.querySelectorAll('[data-ft-chart-tool]').length, 0);
  assert.equal(root.querySelectorAll('.ft-chart-crosshair-rail button').length, 1);
  assert.equal(
    root.querySelector('.ft-chart-crosshair-tool').getAttribute('aria-pressed'),
    'true',
  );

  byAction(root, 'toggle-theme').click();
  assert.equal(activeChart.themes.at(-1), 'dark');

  controller.destroy();
  assert.equal(activeChart.destroyed, true);
  cleanupMount(mounted);
});

test('proposal browser presents compact live and resolved markets without exposing archived execution', async () => {
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
  const historicalPreview = byRole(root, 'historical-trade-preview');
  assert.ok(historicalPreview);
  assert.match(historicalPreview.textContent, /PASS/);
  assert.match(historicalPreview.textContent, /FAIL/);
  assert.match(historicalPreview.textContent, /LIMIT/);
  assert.match(historicalPreview.textContent, /SWAP/);
  assert.match(historicalPreview.textContent, /BUY/);
  assert.match(historicalPreview.textContent, /SELL/);
  assert.match(historicalPreview.textContent, /read only/i);
  assert.ok(byRole(root, 'historical-limit-price').disabled);
  assert.ok(byRole(root, 'historical-amount').disabled);
  const closedCta = passedArchive.querySelector('[data-ft-role="archived-trade-cta"]');
  assert.ok(closedCta);
  assert.equal(closedCta.disabled, true);
  assert.match(closedCta.textContent, /trading closed/i);
  assert.equal(byAction(root, 'review-trade'), null);
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
  assert.match(byRegion(root, 'market-stage').textContent, /Proposal passed/i);
  assert.doesNotMatch(byRegion(root, 'market-stage').textContent, /Proposal timeline/i);

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
  assert.ok(byRole(root, 'trade-ticket')
    .querySelector('[data-ft-role="archived-trade-cta"]')?.disabled);
  assert.equal(byAction(root, 'open-execution'), null);
  assert.equal(byRole(root, 'proposal-history-chart'), null);
  assert.match(
    byRole(root, 'proposal-history').textContent,
    /No market history is indexed/i,
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
  assert.match(byRole(root, 'trade-ticket').textContent, /Trading is unavailable/i);

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
  assert.equal(byAction(terminal.root, 'review-trade'), null);
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
  const reviewTrade = byAction(root, 'review-trade');
  assert.equal(reviewTrade.disabled, true);
  spotAmount.value = '1';
  spotAmount.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(byAction(root, 'review-trade').disabled, false);
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

test('resolved proposals verify conditional balances before offering redemption', async () => {
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
  await settleUntil(window, () => /12\.5 META/.test(byRole(root, 'trade-ticket')?.textContent || ''));

  assert.match(byRole(root, 'trade-ticket').textContent, /Verified redeemable value/i);
  assert.match(byRole(root, 'trade-ticket').textContent, /12\.5 META \+ 3 USDC/);
  assert.equal(byRole(root, 'settlement-positions'), null);
  assert.ok(byAction(root, 'review-redeem'));
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
