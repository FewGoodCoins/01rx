import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  DECISION_EXECUTION_PROGRAMS,
  loadAndValidateDecisionExecutionSafety,
} from '../../src/markets/solana-program-policy.js';
import {
  loadValidatedMarketSnapshotFromProposal,
  normalizeAddress,
} from './futarchy-accounts.js';
import { resolveZeroOneResolvedApiKey } from './zero-one-api-key.js';

const ZERO_ONE_ORIGIN = 'https://api.01resolved.com';
const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 10_000;
const ACTIVE_CACHE_MS = 7_500;
const DATASET_ORDER_PAGE_SIZE = 500;
const DATASET_MAX_ORDER_PAGES = 100;
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const INTERVAL_MS = Object.freeze({
  '15m': 15 * 60 * 1_000,
  '1h': 60 * 60 * 1_000,
});
const PROJECT_TOKEN_ALIASES = Object.freeze({
  'areal-finance': 'arl',
  arealfinance: 'arl',
  'credible-finance': 'cred',
  credible: 'cred',
  'flash-trade': 'faf',
  'futardio-cult': 'futardio',
  futario: 'futardio',
  futuredao: 'future',
  gesim: 'gsim',
  'island-dao': 'island',
  'jito-dao': 'jto',
  'jurassic-finance': 'rawr',
  jurassicfi: 'rawr',
  kyros: 'kykyros',
  'laso-finance': 'laso',
  marinade: 'mnde',
  metadao: 'meta',
  mtncapital: 'mtn',
  omnipair: 'omfg',
  'ordr-trade': 'ordr',
  paystream: 'pays',
  'p2p-protocol': 'p2p',
  ranger: 'rngr',
  'rip-cars': 'cars',
  ripcars: 'cars',
  sanctum: 'scloud',
  'save-dao': 'save',
  solomon: 'solo',
  'solomon-labs': 'solo',
  superclaw: 'super',
  'turbine-cash': 'zkfg',
  zklsol: 'zkfg',
});

export function futarchyServiceError(
  message,
  code = 'UPSTREAM_UNAVAILABLE',
  statusCode = 503,
  cause,
) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

export function resolveFutarchyRpcUrl(env = process.env) {
  const raw = String(
    env.HELIUS_URL
      || env.HELIUS_RPC_URL
      || env.SOLANA_RPC_URL
      || DEFAULT_RPC_URL,
  ).trim();
  try {
    const url = new URL(raw);
    const local = /^(?:127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname);
    if (
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
      || url.username
      || url.password
      || url.hash
    ) return '';
    // RPC providers commonly authenticate with a query parameter. Preserve the
    // full server-only URL while keeping it out of browser code and logs.
    return url.href;
  } catch {
    return '';
  }
}

function safeToken(value) {
  const token = String(value || '').trim().toLowerCase();
  return TOKEN_PATTERN.test(token) ? token : '';
}

function tokenFromProjectSlug(value) {
  const slug = safeToken(value);
  return PROJECT_TOKEN_ALIASES[slug] || slug;
}

function safeAddress(value) {
  const address = String(value || '').trim();
  return ADDRESS_PATTERN.test(address) ? normalizeAddress(address) : '';
}

function safeSignature(value) {
  const signature = String(value || '').trim();
  if (!SIGNATURE_PATTERN.test(signature)) return '';
  return signature;
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFiniteNumber(...values) {
  return values.map(finiteNumber).find(Number.isFinite) ?? null;
}

function optionalBoolean(...values) {
  const value = values.find(candidate => typeof candidate === 'boolean');
  return typeof value === 'boolean' ? value : null;
}

function boundedVersion(...values) {
  const value = values.find(candidate => (
    typeof candidate === 'string' && candidate.trim()
  ));
  return value ? value.trim().slice(0, 64) : null;
}

function explicitLikelihoodPercent(row) {
  const percent = [
    row?.passLikelihoodPct,
    row?.proposalPassLikelihoodPct,
    row?.likelihoodPct,
    row?.probabilityPct,
  ].map(finiteNumber).find(value => Number.isFinite(value) && value >= 0 && value <= 100);
  if (Number.isFinite(percent)) return percent;
  const likelihood = [
    row?.passLikelihood,
    row?.proposalPassLikelihood,
    row?.likelihood,
    row?.passProbability,
    row?.probability,
  ].map(finiteNumber).find(value => Number.isFinite(value) && value >= 0 && value <= 100);
  if (!Number.isFinite(likelihood)) return null;
  return likelihood <= 1 ? likelihood * 100 : likelihood;
}

function isoTimestamp(value) {
  const time = new Date(value || '').getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

async function boundedJson(response, label) {
  if (!response.ok || response.status >= 300) {
    const error = futarchyServiceError(
      `${label} returned HTTP ${response.status}`,
      response.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_UNAVAILABLE',
      response.status === 404 ? 404 : 503,
    );
    error.upstreamStatus = response.status;
    throw error;
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_UPSTREAM_BYTES) {
    throw futarchyServiceError(`${label} response is too large`, 'UPSTREAM_RESPONSE_TOO_LARGE');
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_UPSTREAM_BYTES) {
    throw futarchyServiceError(`${label} response is too large`, 'UPSTREAM_RESPONSE_TOO_LARGE');
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (cause) {
    throw futarchyServiceError(`${label} returned invalid JSON`, 'UPSTREAM_INVALID', 503, cause);
  }
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}),
        'user-agent': '01rx-futarchy-read/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs || SOURCE_TIMEOUT_MS),
    });
  } catch (cause) {
    throw futarchyServiceError(`${options.label || 'Upstream'} did not respond`, 'UPSTREAM_TIMEOUT', 504, cause);
  }
  if (response.status >= 300 && response.status < 400) {
    throw futarchyServiceError(`${options.label || 'Upstream'} redirect was rejected`);
  }
  return boundedJson(response, options.label || 'Upstream');
}

function zeroOneOptions(dependencies) {
  const apiKey = resolveZeroOneResolvedApiKey(dependencies.env);
  if (!apiKey) {
    throw futarchyServiceError(
      '01Resolved decision-market indexing is not configured',
      'MISSING_API_KEY',
    );
  }
  return {
    apiKey,
    fetchImpl: dependencies.fetchImpl,
    label: '01Resolved',
  };
}

async function fetchZeroOne(path, dependencies) {
  return fetchJson(new URL(path, ZERO_ONE_ORIGIN), zeroOneOptions(dependencies));
}

function unwrapData(payload) {
  return payload?.ok === true && payload.data != null ? payload.data : payload?.data ?? payload;
}

function activeIndexRows(payload) {
  const rows = unwrapData(payload);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const proposalId = safeAddress(row?.proposalPublicKey || row?.publicKey);
      const projectSlug = safeToken(row?.organizationSlug || row?.projectSlug);
      const token = tokenFromProjectSlug(projectSlug);
      if (!proposalId || !token) return null;
      return {
        token,
        projectSlug,
        projectName: String(row?.organizationName || row?.project || token).slice(0, 160),
        ticker: String(row?.tokenSymbol || row?.ticker || token).toUpperCase().slice(0, 32),
        logo: String(row?.organizationImageUrl || row?.proposalImageUrl || '').slice(0, 2_048),
        proposalId,
        title: String(row?.proposalTitle || row?.proposal || `${token.toUpperCase()} proposal`).slice(0, 2_000),
        likelihoodPct: explicitLikelihoodPercent(row),
        createdAt: isoTimestamp(row?.proposalCreationDate || row?.startDate),
        endsAt: isoTimestamp(row?.proposalEndDate || row?.endDate),
      };
    })
    .filter(Boolean);
}

function presentActiveMarket(indexed, snapshot) {
  return {
    asOf: snapshot.asOf,
    token: indexed.token,
    ticker: indexed.ticker,
    name: indexed.projectName,
    logo: indexed.logo,
    daoAddress: snapshot.daoAddress,
    baseMint: snapshot.baseMint,
    quoteMint: snapshot.quoteMint,
    baseDecimals: snapshot.baseDecimals,
    quoteDecimals: snapshot.quoteDecimals,
    proposal: {
      id: indexed.proposalId,
      number: snapshot.proposal.number,
      title: indexed.title,
      description: null,
      status: 'pending',
      url: `https://www.metadao.fi/projects/${encodeURIComponent(indexed.projectSlug)}/proposal/${encodeURIComponent(indexed.proposalId)}`,
      projectSlug: indexed.projectSlug,
      createdAt: snapshot.createdAt || indexed.createdAt,
      endsAt: snapshot.endsAt || indexed.endsAt,
      isTeamSponsored: snapshot.proposal.isTeamSponsored,
      proposer: snapshot.proposal.proposer,
      baseVault: snapshot.proposal.baseVault,
      quoteVault: snapshot.proposal.quoteVault,
      passBaseMint: snapshot.proposal.passBaseMint,
      passQuoteMint: snapshot.proposal.passQuoteMint,
      failBaseMint: snapshot.proposal.failBaseMint,
      failQuoteMint: snapshot.proposal.failQuoteMint,
    },
    tradable: true,
    likelihoodPct: indexed.likelihoodPct,
    twapStartedAt: snapshot.twapStartedAt,
    thresholdBps: snapshot.thresholdBps,
    decision: snapshot.decision,
    spot: snapshot.spot,
    pass: snapshot.pass,
    fail: snapshot.fail,
    liquidityUsd: snapshot.liquidityUsd,
    source: snapshot.source,
  };
}

function normalizeArchiveStatus(row) {
  const raw = String(row?.status || row?.state || '').toLowerCase();
  const result = String(row?.result || '').toLowerCase();
  if (['live', 'active', 'pending', 'open'].includes(raw)) return 'pending';
  if (['approved', 'passed', 'succeeded'].includes(result)
      || ['passed', 'succeeded'].includes(raw)) return 'passed';
  if (['rejected', 'failed', 'defeated'].includes(result)
      || ['failed', 'defeated'].includes(raw)) return 'failed';
  return 'removed';
}

function normalizeArchiveRow(row) {
  const proposalId = safeAddress(row?.publicKey || row?.proposalPublicKey);
  const projectSlug = safeToken(row?.projectSlug || row?.organizationSlug);
  const token = tokenFromProjectSlug(projectSlug);
  if (!proposalId || !token) return null;
  const status = normalizeArchiveStatus(row);
  const isTeamSponsored = optionalBoolean(
    row?.isTeamSponsored,
    row?.teamSponsored,
    row?.proposalIsTeamSponsored,
  );
  const standardThresholdBps = firstFiniteNumber(
    row?.passThresholdBps,
    // 01Resolved's current archive schema uses the past-tense field name.
    row?.passedThresholdBps,
    row?.proposalThresholdBps,
    row?.thresholdBps,
    row?.threshold_bps,
  );
  const thresholdBps = isTeamSponsored === true
    ? firstFiniteNumber(
      row?.teamSponsoredPassThresholdBps,
      row?.teamSponsoredThresholdBps,
      standardThresholdBps,
    )
    : standardThresholdBps;
  const thresholdPct = firstFiniteNumber(
    row?.passThresholdPct,
    row?.proposalThresholdPct,
    row?.thresholdPct,
    row?.threshold_percent,
  );
  const normalizedThresholdBps = Number.isFinite(thresholdBps)
    ? thresholdBps
    : Number.isFinite(thresholdPct)
      ? thresholdPct * 100
      : null;
  return {
    token,
    ticker: String(row?.tokenSymbol || token).toUpperCase().slice(0, 32),
    name: String(row?.project || row?.organizationName || token).slice(0, 160),
    // Proposal artwork describes a decision, not the organization. Only expose
    // the organization's mark here; the browser's listed-token registry owns
    // the preferred canonical logo and falls back to initials when unavailable.
    logo: String(row?.organizationImageUrl || '').slice(0, 2_048),
    proposal: {
      id: proposalId,
      title: String(row?.proposal || row?.proposalTitle || `${token.toUpperCase()} proposal`).slice(0, 2_000),
      status,
      result: status === 'passed' ? 'approved' : status === 'failed' ? 'rejected' : '',
      projectSlug,
      createdAt: isoTimestamp(row?.startDate || row?.proposalCreationDate),
      endsAt: isoTimestamp(row?.endDate || row?.proposalEndDate),
      resolvedAt: status === 'pending' ? null : isoTimestamp(row?.endDate || row?.proposalEndDate),
      thresholdBps: Number.isSafeInteger(normalizedThresholdBps)
        && normalizedThresholdBps > -10_000
        && normalizedThresholdBps <= 10_000
        ? normalizedThresholdBps
        : null,
      isTeamSponsored,
      version: boundedVersion(
        row?.version,
        row?.programVersion,
        row?.marketVersion,
        row?.futarchyVersion,
      ),
      url: `https://www.metadao.fi/projects/${encodeURIComponent(projectSlug)}/proposal/${encodeURIComponent(proposalId)}`,
    },
    metrics: {
      volumeUsd: firstFiniteNumber(
        row?.performanceStats?.totalVolume,
        row?.totalVolumeUsd,
        row?.volumeUsd,
        row?.totalVolume,
      ),
      tradeCount: firstFiniteNumber(
        row?.performanceStats?.totalTrades,
        row?.totalTrades,
        row?.tradeCount,
      ),
      liquidityUsd: firstFiniteNumber(
        row?.performanceStats?.liquidityUsd,
        row?.liquidityUsd,
        row?.totalLiquidityUsd,
      ),
    },
    tradable: false,
    source: {
      provider: '01Resolved decision-market index',
      asOf: new Date().toISOString(),
    },
  };
}

function parsePositiveInteger(value, fallback, maximum, label) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) {
    throw futarchyServiceError(`${label} must be an integer`, 'BAD_REQUEST', 400);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw futarchyServiceError(`${label} must be between 1 and ${maximum}`, 'BAD_REQUEST', 400);
  }
  return number;
}

function decodePageCursor(value) {
  if (!value) return 1;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (parsed?.v !== 1 || !Number.isSafeInteger(parsed.page) || parsed.page < 1 || parsed.page > 100) {
      throw new Error('invalid');
    }
    return parsed.page;
  } catch {
    throw futarchyServiceError('cursor is invalid', 'BAD_REQUEST', 400);
  }
}

function encodePageCursor(page) {
  return Buffer.from(JSON.stringify({ v: 1, page }), 'utf8').toString('base64url');
}

function orderPageMeta(payload, page, limit, indexed) {
  const total = finiteNumber(
    payload?.meta?.totalItems
    ?? payload?.meta?.total
    ?? payload?.pagination?.total,
  );
  const totalPages = finiteNumber(
    payload?.meta?.totalPages
    ?? payload?.pagination?.totalPages,
  );
  const hasNextPage = Number.isSafeInteger(totalPages) && totalPages > 0
    ? page < totalPages
    : indexed >= limit;
  return {
    page,
    limit,
    indexed,
    total: Number.isSafeInteger(total) && total >= 0 ? total : null,
    nextCursor: hasNextPage ? encodePageCursor(page + 1) : null,
    complete: !hasNextPage,
  };
}

function normalizeObservedTrade(row) {
  const branch = ['pass', 'fail'].includes(String(row?.marketType).toLowerCase())
    ? String(row.marketType).toLowerCase()
    : '';
  const side = ['buy', 'sell'].includes(String(row?.direction).toLowerCase())
    ? String(row.direction).toLowerCase()
    : '';
  if (!branch || !side) return null;
  const price = finiteNumber(row?.price);
  return {
    branch,
    side,
    venue: 'futarchy_amm',
    price: Number.isFinite(price) && price > 0 ? price : null,
    baseAmount: finiteNumber(row?.size),
    quoteAmount: finiteNumber(row?.value),
    volumeUsd: finiteNumber(row?.value),
    blockTime: isoTimestamp(row?.timeStamp || row?.timestamp),
    signature: safeSignature(row?.txHash) || null,
  };
}

function aggregateHistoryRows(rows, interval) {
  const width = INTERVAL_MS[interval];
  const buckets = new Map();
  for (const row of rows) {
    const observedAt = isoTimestamp(row?.timestamp || row?.timeStamp);
    const observedMs = new Date(observedAt || '').getTime();
    if (!Number.isFinite(observedMs)) continue;
    const bucketMs = Math.floor(observedMs / width) * width;
    const current = buckets.get(bucketMs) || {
      timestamp: new Date(bucketMs).toISOString(),
      observedAt,
      underlyingPrice: null,
      passPrice: null,
      failPrice: null,
      passTwap: null,
      failTwap: null,
      sampleCount: 0,
    };
    const branch = String(row?.marketType || '').toLowerCase();
    current.observedAt = observedAt;
    current.sampleCount += 1;
    const values = {
      underlyingPrice: finiteNumber(row?.spotPrice),
      passPrice: finiteNumber(row?.approvedPrice),
      failPrice: finiteNumber(row?.rejectedPrice),
      passTwap: finiteNumber(row?.approvedTwap),
      failTwap: finiteNumber(row?.rejectedTwap),
    };
    if (branch === 'pass') values.passPrice = finiteNumber(row?.price);
    if (branch === 'fail') values.failPrice = finiteNumber(row?.price);
    for (const [field, value] of Object.entries(values)) {
      if (Number.isFinite(value) && value >= 0) current[field] = value;
    }
    buckets.set(bucketMs, current);
  }
  return [...buckets.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function historyCoverage(series) {
  return {
    underlying: series.filter(row => Number.isFinite(row.underlyingPrice)).length,
    pass: series.filter(row => Number.isFinite(row.passPrice)).length,
    fail: series.filter(row => Number.isFinite(row.failPrice)).length,
    passTwap: series.filter(row => Number.isFinite(row.passTwap)).length,
    failTwap: series.filter(row => Number.isFinite(row.failTwap)).length,
  };
}

function rawToAmountString(raw, decimals) {
  const digits = raw.toString().padStart(decimals + 1, '0');
  if (!decimals) return digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${digits.slice(0, -decimals)}.${fraction}` : digits.slice(0, -decimals);
}

function responsePositions(market, owner, parsedResponse, now) {
  const expected = [
    ['base', market.baseMint, market.baseDecimals],
    ['quote', market.quoteMint, market.quoteDecimals],
    ['passBase', market.proposal.passBaseMint, market.baseDecimals],
    ['passQuote', market.proposal.passQuoteMint, market.quoteDecimals],
    ['failBase', market.proposal.failBaseMint, market.baseDecimals],
    ['failQuote', market.proposal.failQuoteMint, market.quoteDecimals],
  ];
  const totals = new Map(expected.map(([, mint]) => [mint, 0n]));
  for (const row of parsedResponse?.value || []) {
    const info = row?.account?.data?.parsed?.info;
    const mint = safeAddress(info?.mint);
    const rawAmount = String(info?.tokenAmount?.amount || '');
    if (
      row?.account?.owner?.toBase58?.() !== TOKEN_PROGRAM_ID.toBase58()
      || !totals.has(mint)
      || !/^\d+$/.test(rawAmount)
    ) continue;
    totals.set(mint, totals.get(mint) + BigInt(rawAmount));
  }
  return {
    owner,
    proposalId: market.proposal.id,
    asOf: new Date(now()).toISOString(),
    slot: parsedResponse?.context?.slot ?? null,
    balances: expected.map(([label, mint, decimals]) => {
      const rawAmount = totals.get(mint) || 0n;
      return {
        label,
        available: true,
        mint,
        decimals,
        rawAmount: rawAmount.toString(),
        amountString: rawToAmountString(rawAmount, decimals),
        amount: Number(rawAmount) / (10 ** decimals),
      };
    }),
    degraded: { active: false, services: [], issues: [] },
  };
}

export function createFutarchyService(options = {}) {
  const dependencies = {
    env: options.env || process.env,
    fetchImpl: options.fetchImpl || fetch,
    now: options.now || (() => Date.now()),
    connection: options.connection || null,
    loadMarketSnapshot: options.loadMarketSnapshot || loadValidatedMarketSnapshotFromProposal,
    validatePrograms: options.validatePrograms || loadAndValidateDecisionExecutionSafety,
  };
  let connection = dependencies.connection;
  function getConnection() {
    if (connection) return connection;
    const rpcUrl = resolveFutarchyRpcUrl(dependencies.env);
    if (!rpcUrl) {
      throw futarchyServiceError('Solana RPC is not configured', 'SOLANA_RPC_UNAVAILABLE');
    }
    connection = new Connection(rpcUrl, 'confirmed');
    return connection;
  }
  let activeCache = null;
  let activeInFlight = null;

  async function activeMarkets({ force = false } = {}) {
    const nowMs = dependencies.now();
    if (!force && activeCache && nowMs - activeCache.cachedAt < ACTIVE_CACHE_MS) {
      return activeCache.value;
    }
    if (!force && activeInFlight) return activeInFlight;
    const task = (async () => {
      const payload = await fetchZeroOne(
        '/v1/global-dashboard/projects/decision-markets?limit=100&page=1',
        dependencies,
      );
      const indexed = activeIndexRows(payload);
      const settled = await Promise.allSettled(indexed.map(async (row) => {
        const snapshot = await dependencies.loadMarketSnapshot(getConnection(), {
          proposalAddress: row.proposalId,
        }, { nowMs });
        return presentActiveMarket(row, snapshot);
      }));
      const markets = settled
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
      const issues = settled.flatMap((result, index) => result.status === 'rejected'
        ? [{
          code: 'LIVE_MARKET_VALIDATION_FAILED',
          proposalId: indexed[index]?.proposalId || null,
          message: 'A live proposal failed account validation.',
        }]
        : []);
      if (!markets.length && indexed.length) {
        const cause = settled.find(result => result.status === 'rejected')?.reason;
        throw futarchyServiceError(
          'No indexed live proposal passed on-chain validation',
          'LIVE_MARKET_VALIDATION_FAILED',
          503,
          cause,
        );
      }
      const slots = markets.map(market => market.source.slot).filter(Number.isSafeInteger);
      const value = {
        asOf: new Date(nowMs).toISOString(),
        slot: slots.length ? Math.min(...slots) : null,
        pendingProposalCount: indexed.length,
        markets,
        source: {
          proposalIndex: '01Resolved',
          marketIdentity: 'validated Solana proposal and DAO accounts',
          marketState: 'solana.rpc.getMultipleAccounts',
        },
        degraded: {
          active: issues.length > 0,
          services: issues.length ? ['futarchy-live-source-mismatch'] : [],
          issues,
        },
      };
      activeCache = { cachedAt: dependencies.now(), value };
      return value;
    })();
    activeInFlight = task;
    try {
      return await task;
    } finally {
      if (activeInFlight === task) activeInFlight = null;
    }
  }

  async function proposals(input = {}) {
    const limit = parsePositiveInteger(input.limit, 100, 100, 'limit');
    const page = decodePageCursor(input.cursor);
    const token = input.token ? safeToken(input.token) : '';
    if (input.token && !token) throw futarchyServiceError('token is invalid', 'BAD_REQUEST', 400);
    const status = input.status ? String(input.status).toLowerCase() : '';
    if (status && !['all', 'pending', 'passed', 'failed', 'removed'].includes(status)) {
      throw futarchyServiceError('status is invalid', 'BAD_REQUEST', 400);
    }
    const payload = await fetchZeroOne(
      `/v1/global-dashboard/decision-markets?limit=${limit}&page=${page}`,
      dependencies,
    );
    const sourceRows = Array.isArray(payload?.data) ? payload.data : [];
    const allRows = sourceRows.map(normalizeArchiveRow).filter(Boolean);
    const rows = allRows.filter(row => (
      (!token || row.token === token)
      && (!status || status === 'all' || row.proposal.status === status)
    ));
    const totalItems = finiteNumber(payload?.meta?.totalItems) || allRows.length;
    const totalPages = finiteNumber(payload?.meta?.totalPages)
      || Math.max(1, Math.ceil(totalItems / limit));
    const summary = { total: rows.length, pending: 0, passed: 0, failed: 0, removed: 0, tradable: 0 };
    rows.forEach((row) => { summary[row.proposal.status] += 1; });
    return {
      asOf: new Date(dependencies.now()).toISOString(),
      proposals: rows,
      summary,
      pagination: {
        limit,
        returned: rows.length,
        total: totalItems,
        nextCursor: page < totalPages ? encodePageCursor(page + 1) : null,
      },
      source: { provider: '01Resolved decision-market index' },
      degraded: { active: false, services: [], issues: [] },
    };
  }

  async function proposalHistory(input = {}) {
    const proposalId = safeAddress(input.proposal);
    if (!proposalId) throw futarchyServiceError('proposal is invalid', 'BAD_REQUEST', 400);
    const interval = INTERVAL_MS[input.interval] ? input.interval : '15m';
    const chart = await fetchZeroOne(
      `/v1/proposal/${encodeURIComponent(proposalId)}/price-chart`,
      dependencies,
    );
    let rows = Array.isArray(chart?.data?.prices) ? chart.data.prices : [];
    let source = 'price-chart';
    if (!rows.length) {
      const orders = await fetchZeroOne(
        `/v1/proposal/${encodeURIComponent(proposalId)}/orders?limit=500&page=1`,
        dependencies,
      );
      rows = Array.isArray(orders?.data) ? orders.data : [];
      source = 'orders';
    }
    const series = aggregateHistoryRows(rows, interval);
    const preTwap = isoTimestamp(chart?.data?.preTwap);
    const degraded = {
      active: source === 'orders',
      services: source === 'orders' ? ['01resolved-proposal-price-chart-empty'] : [],
      issues: source === 'orders'
        ? [{ code: 'ORDER_PRICE_HISTORY_USED', message: 'Observed trades are shown because the price chart is empty.' }]
        : [],
    };
    const coverage = historyCoverage(series);
    const complete = coverage.underlying > 0 && coverage.pass > 0 && coverage.fail > 0;
    return {
      proposalId,
      interval,
      requestedInterval: interval,
      availability: complete ? 'complete' : series.length ? 'partial' : 'unavailable',
      preTwap,
      series,
      summary: {
        pointCount: series.length,
        from: series[0]?.timestamp || null,
        to: series.at(-1)?.timestamp || null,
        coverage,
      },
      source: {
        provider: source === 'price-chart' ? '01Resolved' : '01Resolved observed proposal trades',
        endpoint: source === 'price-chart'
          ? '/v1/proposal/{publicKey}/price-chart'
          : '/v1/proposal/{publicKey}/orders',
        sourceInterval: source === 'price-chart' ? '15m' : 'event',
        interval,
        requestedInterval: interval,
      },
      degraded,
    };
  }

  async function marketData(input = {}) {
    const proposalId = safeAddress(input.proposal);
    if (!proposalId) throw futarchyServiceError('proposal is invalid', 'BAD_REQUEST', 400);
    const limit = parsePositiveInteger(input.limit, 100, 100, 'limit');
    const page = decodePageCursor(input.cursor);
    const active = await activeMarkets();
    const market = active.markets.find(candidate => candidate.proposal.id === proposalId);
    if (!market) throw futarchyServiceError('Active proposal was not found', 'NOT_FOUND', 404);
    const payload = await fetchZeroOne(
      `/v1/proposal/${encodeURIComponent(proposalId)}/orders?limit=${limit}&page=${page}`,
      dependencies,
    );
    const indexedRows = Array.isArray(payload?.data) ? payload.data : [];
    const recentTrades = indexedRows.map(normalizeObservedTrade).filter(Boolean);
    const pagination = {
      ...orderPageMeta(payload, page, limit, indexedRows.length),
      returned: recentTrades.length,
    };
    return {
      proposalId,
      asOf: new Date(dependencies.now()).toISOString(),
      slot: active.slot,
      cluster: 'solana:mainnet',
      books: {
        pass: {
          address: null,
          baseMint: market.proposal.passBaseMint,
          quoteMint: market.proposal.passQuoteMint,
          baseDecimals: market.baseDecimals,
          quoteDecimals: market.quoteDecimals,
          canonical: false,
          bids: [],
          asks: [],
          depositedBalances: [],
        },
        fail: {
          address: null,
          baseMint: market.proposal.failBaseMint,
          quoteMint: market.proposal.failQuoteMint,
          baseDecimals: market.baseDecimals,
          quoteDecimals: market.quoteDecimals,
          canonical: false,
          bids: [],
          asks: [],
          depositedBalances: [],
        },
      },
      recentTrades,
      pagination,
      openOrders: [],
      source: { provider: '01Resolved observed proposal trades' },
      degraded: { active: false, services: [], issues: [] },
    };
  }

  /**
   * Server-only complete order-history reader used by the offline likelihood
   * dataset builder. It is deliberately not routed through the browser API.
   */
  async function proposalOrders(input = {}) {
    const proposalId = safeAddress(input.proposal);
    if (!proposalId) throw futarchyServiceError('proposal is invalid', 'BAD_REQUEST', 400);
    const pageSize = parsePositiveInteger(
      input.pageSize,
      DATASET_ORDER_PAGE_SIZE,
      DATASET_ORDER_PAGE_SIZE,
      'pageSize',
    );
    const maxPages = parsePositiveInteger(
      input.maxPages,
      DATASET_MAX_ORDER_PAGES,
      DATASET_MAX_ORDER_PAGES,
      'maxPages',
    );
    const trades = [];
    let indexed = 0;
    let total = null;
    let complete = false;
    let pagesLoaded = 0;

    for (let page = 1; page <= maxPages; page += 1) {
      const payload = await fetchZeroOne(
        `/v1/proposal/${encodeURIComponent(proposalId)}/orders?limit=${pageSize}&page=${page}`,
        dependencies,
      );
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      indexed += rows.length;
      pagesLoaded += 1;
      trades.push(...rows.map(normalizeObservedTrade).filter(Boolean));

      const pageMeta = orderPageMeta(payload, page, pageSize, rows.length);
      if (Number.isSafeInteger(pageMeta.total)) total = pageMeta.total;
      if (!pageMeta.nextCursor) {
        complete = true;
        break;
      }
    }

    const seen = new Set();
    const uniqueTrades = trades.filter((trade, index) => {
      // A signature is the only stable upstream identity. Never collapse two
      // unsigned rows merely because their public fields happen to match.
      const key = trade.signature
        ? [
          trade.signature,
          trade.branch,
          trade.side,
          trade.baseAmount ?? '',
          trade.quoteAmount ?? '',
        ].join('|')
        : `unsigned:${index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      proposalId,
      asOf: new Date(dependencies.now()).toISOString(),
      trades: uniqueTrades,
      pagination: {
        pageSize,
        pagesLoaded,
        indexed,
        normalized: trades.length,
        unique: uniqueTrades.length,
        duplicatesRemoved: trades.length - uniqueTrades.length,
        total,
        complete,
      },
      source: { provider: '01Resolved observed proposal trades' },
      degraded: {
        active: !complete,
        services: complete ? [] : ['01resolved-proposal-orders-truncated'],
        issues: complete ? [] : [{
          code: 'ORDER_HISTORY_PAGE_LIMIT_REACHED',
          message: `Order history exceeded ${maxPages} pages.`,
        }],
      },
    };
  }

  async function positions(input = {}) {
    const owner = safeAddress(input.owner);
    const proposalId = safeAddress(input.proposal);
    if (!owner || !proposalId) {
      throw futarchyServiceError('owner and proposal must be valid Solana addresses', 'BAD_REQUEST', 400);
    }
    const active = await activeMarkets();
    const market = active.markets.find(candidate => candidate.proposal.id === proposalId);
    if (!market) throw futarchyServiceError('Active proposal was not found', 'NOT_FOUND', 404);
    const parsed = await getConnection().getParsedTokenAccountsByOwner(
      new PublicKey(owner),
      { programId: TOKEN_PROGRAM_ID },
      'confirmed',
    );
    return responsePositions(market, owner, parsed, dependencies.now);
  }

  async function programIntegrity() {
    const checkedAt = new Date(dependencies.now()).toISOString();
    try {
      const result = await dependencies.validatePrograms(getConnection());
      return {
        status: 'verified',
        canTransact: true,
        cluster: 'solana:mainnet',
        checkedAt,
        rpcSlot: result.contextSlot,
        programs: DECISION_EXECUTION_PROGRAMS.map((policy) => {
          const observed = result.programs.find(program => program.key === policy.key);
          return {
            key: policy.key,
            label: policy.label,
            programId: policy.programId,
            programDataAddress: policy.programDataAddress,
            expectedDeploymentSlot: String(policy.deploymentSlot),
            observedDeploymentSlot: observed ? String(observed.deploymentSlot) : null,
            upgradeAuthority: policy.upgradeAuthority,
            observedUpgradeAuthority: observed?.upgradeAuthority || null,
            status: observed ? 'verified' : 'unchecked',
          };
        }),
        issues: [],
      };
    } catch (cause) {
      const blocked = cause?.code === 'SOLANA_PROGRAM_INTEGRITY_CHANGED';
      return {
        status: blocked ? 'blocked' : 'unavailable',
        canTransact: false,
        cluster: 'solana:mainnet',
        checkedAt,
        rpcSlot: null,
        programs: DECISION_EXECUTION_PROGRAMS.map(policy => ({
          key: policy.key,
          label: policy.label,
          programId: policy.programId,
          programDataAddress: policy.programDataAddress,
          expectedDeploymentSlot: String(policy.deploymentSlot),
          observedDeploymentSlot: null,
          upgradeAuthority: policy.upgradeAuthority,
          observedUpgradeAuthority: null,
          status: blocked ? 'mismatch' : 'unchecked',
        })),
        issues: [{
          code: cause?.code || 'PROGRAM_INTEGRITY_UNAVAILABLE',
          message: blocked
            ? 'A reviewed Solana program changed after approval.'
            : 'Program integrity could not be confirmed.',
        }],
      };
    }
  }

  function recurringConfig() {
    const programId = safeAddress(dependencies.env.RECURRING_FUTARCHY_PROGRAM_ID);
    return {
      enabled: Boolean(programId),
      keeperReady: Boolean(programId && dependencies.env.RECURRING_FUTARCHY_KEEPER_READY === 'true'),
      programId: programId || null,
      minimumIntervalSeconds: 3_600,
      maximumCycles: 365,
    };
  }

  return Object.freeze({
    activeMarkets,
    marketData,
    positions,
    programIntegrity,
    proposalHistory,
    proposalOrders,
    proposals,
    recurringConfig,
    getConnection,
  });
}

export const _test = Object.freeze({
  aggregateHistoryRows,
  normalizeArchiveRow,
  normalizeArchiveStatus,
  normalizeObservedTrade,
  orderPageMeta,
  tokenFromProjectSlug,
});
