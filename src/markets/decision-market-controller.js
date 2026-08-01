import { create01ResolvedClient } from '@01resolved/api-client';
import base58Module from 'bs58';
import { DEFAULT_MARKET_SELECTION } from '../core/default-route.js';
// Shared by the homepage discovery and token-scoped Markets renderers.
const THEME_STORAGE_KEY = 'navgator-terminal-theme';
const TRANSACTION_STORAGE_KEY = 'navgator-futarchy-transactions-v1';
const MAX_STORED_TRANSACTIONS = 30;
const TRANSACTION_STATUS_INTERVAL_MS = 5_000;
const LIVE_PRICE_INTERVAL_MS = 5_000;
const POLL_INTERVAL_MS = 30_000;
const MAX_PROPOSAL_HISTORY_POINTS = 1_000;
const REVIEWED_PROGRAM_COUNT = 4;
const DEFAULT_HISTORY_INTERVAL = '15m';
const HISTORY_INTERVAL_MS = Object.freeze({
  '15m': 15 * 60 * 1_000,
  '1h': 60 * 60 * 1_000,
});
const RETAINED_PROPOSAL_HISTORY_IDS = new Set([
  '98zXsz1RtvYw4zHrxaZDdGBU3BgqfsX9XJbXBLSJUBST',
]);
const activeMounts = new WeakMap();
let instanceCount = 0;
let solanaTradingModulePromise = null;
const base58 = base58Module.default || base58Module;

function loadSolanaTrading(runtime) {
  const injected = runtime?.NAVGATOR?.solanaTrading;
  if (injected) return Promise.resolve(injected);
  if (!solanaTradingModulePromise) {
    solanaTradingModulePromise = Promise.all([
      import('buffer'),
      import('process/browser'),
    ]).then(([bufferModule, processModule]) => {
      const target = runtime || globalThis;
      const BufferClass = bufferModule.Buffer || bufferModule.default?.Buffer;
      const browserProcess = processModule.default || processModule;
      if (BufferClass && typeof target.Buffer === 'undefined') {
        target.Buffer = BufferClass;
      }
      if (browserProcess && typeof target.process === 'undefined') {
        target.process = browserProcess;
      }
      return import('./solana-trading.js');
    }).catch((error) => {
      solanaTradingModulePromise = null;
      throw error;
    });
  }
  return solanaTradingModulePromise;
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function unwrapEnvelope(value) {
  return isObject(value) && value.ok === true && Object.prototype.hasOwnProperty.call(value, 'data')
    ? value.data
    : value;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function firstNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const normalized = typeof value === 'string'
      ? value.replace(/[$,%\s]/g, '').replace(/,/g, '')
      : value;
    const number = Number(normalized);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function boundedText(value, maxLength = 180) {
  const text = firstText(value);
  return text ? text.slice(0, maxLength) : '';
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function safeAssetUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(?:https?:\/\/|\/|\.\/|\.\.\/|logos\/)/i.test(url)) return url;
  return '';
}

function safeExternalUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch (_) {
    return '';
  }
}

function safeExecutionUrl(value) {
  const url = safeExternalUrl(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const officialHost = hostname === 'metadao.fi' || hostname === 'www.metadao.fi';
    return parsed.protocol === 'https:'
      && officialHost
      && /\/proposal\/[1-9A-HJ-NP-Za-km-z]{32,44}\/?$/.test(parsed.pathname)
      ? parsed.href
      : '';
  } catch (_) {
    return '';
  }
}

function safeProposalSourceUrl(value) {
  const url = safeExternalUrl(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:'
      && (hostname === 'metadao.fi' || hostname.endsWith('.metadao.fi'))
      ? parsed.href
      : '';
  } catch (_) {
    return '';
  }
}

function safeBase58Bytes(value, expectedBytes, maxLength) {
  const normalized = String(value || '').trim();
  if (
    !normalized
    || normalized.length > maxLength
    || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(normalized)
  ) return '';
  try {
    const decoded = base58.decode(normalized);
    return decoded.length === expectedBytes && base58.encode(decoded) === normalized
      ? normalized
      : '';
  } catch (_) {
    return '';
  }
}

function safeBase58(value) {
  return safeBase58Bytes(value, 32, 44);
}

function safeSignature(value) {
  return safeBase58Bytes(value, 64, 88);
}

const TRANSACTION_STATUSES = new Set([
  'submitted',
  'processed',
  'confirmed',
  'finalized',
  'failed',
]);

export function normalizeTerminalTransaction(value) {
  if (!isObject(value)) return null;
  const signature = safeSignature(value.signature);
  const owner = safeBase58(value.owner);
  const proposalId = safeBase58(value.proposalId);
  const status = TRANSACTION_STATUSES.has(value.status)
    ? value.status
    : 'submitted';
  const createdAt = isoTimestamp(value.createdAt) || new Date().toISOString();
  const updatedAt = isoTimestamp(value.updatedAt) || createdAt;
  if (!signature || !owner || !proposalId) return null;
  return {
    signature,
    owner,
    proposalId,
    status,
    kind: normalizeKey(value.kind).slice(0, 32),
    action: boundedText(value.action, 96),
    venue: boundedText(value.venue, 64),
    createdAt,
    updatedAt,
    slot: Number.isSafeInteger(Number(value.slot)) ? Number(value.slot) : null,
    errorCategory: normalizeKey(value.errorCategory).slice(0, 48),
    errorMessage: boundedText(value.errorMessage, 180),
  };
}

function readStoredTransactions(runtime) {
  try {
    const parsed = JSON.parse(runtime.localStorage?.getItem(TRANSACTION_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeTerminalTransaction)
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_STORED_TRANSACTIONS);
  } catch (_) {
    return [];
  }
}

function writeStoredTransactions(runtime, transactions) {
  try {
    runtime.localStorage?.setItem(
      TRANSACTION_STORAGE_KEY,
      JSON.stringify(
        transactions
          .map(normalizeTerminalTransaction)
          .filter(Boolean)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, MAX_STORED_TRANSACTIONS),
      ),
    );
  } catch (_) {
    // Transaction status remains available for this session when storage is blocked.
  }
}

function transactionStatusLabel(status) {
  if (status === 'finalized') return 'Finalized';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'processed') return 'Processing';
  if (status === 'failed') return 'Failed';
  return 'Submitted';
}

function captureTerminalEvent(runtime, name, properties = {}) {
  try {
    runtime.NAVGATOR?.telemetry?.capture?.(name, properties);
  } catch (_) {
    // Product telemetry must never block trading or public market reads.
  }
}

function shortenAddress(value, edge = 4) {
  const address = String(value || '');
  if (address.length <= edge * 2 + 2) return address || '—';
  return `${address.slice(0, edge)}…${address.slice(-edge)}`;
}

function formatPrice(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1_000) {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  if (value >= 1) return `$${value.toFixed(3)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value > 0) return `$${value.toFixed(6)}`;
  return '$0.00';
}

function formatTokenAmount(value, maximumFractionDigits = 4) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: value > 0 && value < 0.01 ? Math.min(6, maximumFractionDigits) : 0,
  });
}

function formatRawTokenAmount(rawValue, decimals, maximumFractionDigits = 6) {
  if (!/^\d+$/.test(String(rawValue ?? '')) || !Number.isInteger(decimals)) return '—';
  const raw = BigInt(rawValue);
  const digits = raw.toString().padStart(decimals + 1, '0');
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals
    ? digits.slice(-decimals)
      .slice(0, maximumFractionDigits)
      .replace(/0+$/, '')
    : '';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function safeRawTokenAmount(rawValue) {
  try {
    const value = BigInt(rawValue || 0);
    return value > 0n ? value : 0n;
  } catch (_) {
    return 0n;
  }
}

function formatIntervalDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value % 604_800 === 0) return `${value / 604_800}w`;
  if (value % 86_400 === 0) return `${value / 86_400}d`;
  if (value % 3_600 === 0) return `${value / 3_600}h`;
  return `${Math.round(value / 60)}m`;
}

function formatCompactMoney(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  const absolute = Math.abs(value);
  if (absolute >= 1e9) return `$${(value / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
  if (absolute >= 1e6) return `$${(value / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
  if (absolute >= 1e3) return `$${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function decisionTradeVolumeUsd(transaction) {
  const indexedVolume = nonNegativeNumber(transaction?.volumeUsd);
  if (Number.isFinite(indexedVolume)) return indexedVolume;

  const quoteAmount = nonNegativeNumber(transaction?.quoteAmount);
  if (Number.isFinite(quoteAmount)) return quoteAmount;

  const price = nonNegativeNumber(transaction?.price);
  const baseAmount = nonNegativeNumber(transaction?.baseAmount);
  if (!Number.isFinite(price) || !Number.isFinite(baseAmount)) return null;
  const calculatedVolume = price * baseAmount;
  return Number.isFinite(calculatedVolume) ? calculatedVolume : null;
}

function decisionTradeSupport(transaction) {
  if (
    (transaction?.branch === 'pass' && transaction?.side === 'buy')
    || (transaction?.branch === 'fail' && transaction?.side === 'sell')
  ) {
    return 'pass';
  }
  if (
    (transaction?.branch === 'fail' && transaction?.side === 'buy')
    || (transaction?.branch === 'pass' && transaction?.side === 'sell')
  ) {
    return 'fail';
  }
  return '';
}

function ownershipTradeVolumeUsd(transaction) {
  const indexedVolume = nonNegativeNumber(transaction?.valueUsd);
  if (Number.isFinite(indexedVolume)) return indexedVolume;

  const price = nonNegativeNumber(transaction?.price);
  const size = nonNegativeNumber(transaction?.size);
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
  const calculatedVolume = price * size;
  return Number.isFinite(calculatedVolume) ? calculatedVolume : null;
}

function formatTransactionSizeUsd(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1_000) return formatCompactMoney(value);
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: value < 1 ? 4 : 2,
  })}`;
}

function formatTradeVolume(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1_000) return formatCompactMoney(value);
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value === 0 ? 0 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  })}`;
}

function formatPercent(value, options = {}) {
  if (!Number.isFinite(value)) return '—';
  const sign = options.sign !== false && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(options.digits == null ? 2 : options.digits)}%`;
}

function formatThresholdPercent(value) {
  return formatPercent(value).replace(/\.00%$/, '%').replace(/(\.\d)0%$/, '$1%');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(value, now = Date.now()) {
  if (!value) return 'never';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'unknown';
  const elapsed = Math.max(0, now - time);
  if (elapsed < 5_000) return 'just now';
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1_000)}s ago`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  return `${Math.floor(elapsed / 3_600_000)}h ago`;
}

function formatCountdown(value, now = Date.now()) {
  if (!value) return 'Open-ended';
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) return 'End time unavailable';
  const remaining = end - now;
  if (remaining <= 0) return 'Window ended';
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.max(1, Math.floor((remaining % 3_600_000) / 60_000));
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function normalizeProposalOutcome(...values) {
  for (const value of values) {
    if (value === true) return 'passed';
    if (value === false) return 'failed';
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (['pass', 'passed', 'approve', 'approved', 'success', 'succeeded', 'yes'].includes(normalized)) {
      return 'passed';
    }
    if (['fail', 'failed', 'reject', 'rejected', 'defeat', 'defeated', 'no'].includes(normalized)) {
      return 'failed';
    }
  }
  return '';
}

function normalizeProposalStatus(status, outcome = '', options = {}) {
  if (options.forceLive) {
    return { key: 'live', label: 'Live', raw: firstText(status, 'pending').toLowerCase() };
  }
  const raw = firstText(status, outcome, 'unknown').toLowerCase();
  const compact = raw.replace(/[\s_-]+/g, '');
  if ([
    'pending',
    'active',
    'live',
    'open',
    'initialized',
    'inprogress',
    'trading',
  ].includes(compact)) {
    return { key: 'live', label: 'Live', raw };
  }
  if ([
    'pass',
    'passed',
    'approved',
    'executed',
    'success',
    'succeeded',
    'finalizedpassed',
  ].includes(compact) || (['resolved', 'finalized', 'closed', 'complete', 'completed'].includes(compact)
    && outcome === 'passed')) {
    return { key: 'passed', label: 'Passed', raw };
  }
  if ([
    'fail',
    'failed',
    'rejected',
    'defeated',
    'declined',
    'finalizedfailed',
  ].includes(compact) || (['resolved', 'finalized', 'closed', 'complete', 'completed'].includes(compact)
    && outcome === 'failed')) {
    return { key: 'failed', label: 'Failed', raw };
  }
  const label = raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
  return { key: 'other', label: label || 'Other', raw };
}

function proposalDisplayStatus(proposal) {
  const status = proposal?.statusGroup;
  if (status === 'live') {
    return { key: 'live', label: 'Live' };
  }
  if (status === 'passed' || status === 'failed') {
    return { key: 'resolved', label: 'Resolved' };
  }
  return {
    key: 'indexed',
    label: 'Indexed',
  };
}

const INDEXED_PROPOSAL_RECENCY_MS = 7 * 24 * 60 * 60 * 1000;

function proposalTimestamp(value) {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Unknown lifecycle records are useful briefly while an index catches up, but
 * undated drafts and proposals whose trading window has already ended only add
 * archive noise. Keep those records in the API response, not in the product UI.
 */
function shouldDisplayProposal(market, now = Date.now()) {
  const proposal = market?.proposal;
  if (!proposal || proposal.statusGroup !== 'other') return true;

  const resolvedAt = proposalTimestamp(proposal.resolvedAt);
  if (resolvedAt != null && resolvedAt <= now) return false;

  const endsAt = proposalTimestamp(proposal.endsAt);
  if (endsAt != null) return endsAt > now;

  const createdAt = proposalTimestamp(proposal.createdAt);
  return createdAt != null
    && createdAt <= now
    && (now - createdAt) <= INDEXED_PROPOSAL_RECENCY_MS;
}

function hasFutarchyRpcDegradation(degraded) {
  return (degraded?.services || []).some(service => (
    service === 'futarchy-solana-rpc-unavailable'
    || service === 'futarchy-manifest-rpc-unavailable'
  ));
}

function hasCriticalTerminalDegradation(degraded) {
  const criticalServices = new Set([
    'futarchy-active-markets-unavailable',
    'futarchy-live-market-unavailable',
    'futarchy-live-source-mismatch',
    'futarchy-manifest-rpc-unavailable',
    'futarchy-proposals-db-unavailable',
    'futarchy-solana-rpc-unavailable',
    'futarchy-token-config-unavailable',
  ]);
  return (degraded?.services || []).some(service => criticalServices.has(service));
}

function normalizeProgramIntegrity(raw) {
  const data = unwrapEnvelope(raw);
  const payload = isObject(data) ? data : {};
  const status = ['verified', 'blocked', 'unavailable'].includes(payload.status)
    ? payload.status
    : 'unavailable';
  const programs = (Array.isArray(payload.programs) ? payload.programs : [])
    .filter(program => isObject(program))
    .map(program => ({
      key: firstText(program.key),
      label: firstText(program.label),
      programId: safeBase58(program.programId),
      programDataAddress: safeBase58(program.programDataAddress),
      expectedDeploymentSlot: firstText(program.expectedDeploymentSlot),
      observedDeploymentSlot: firstText(program.observedDeploymentSlot),
      upgradeAuthority: safeBase58(program.upgradeAuthority),
      observedUpgradeAuthority: safeBase58(program.observedUpgradeAuthority),
      status: ['verified', 'mismatch', 'unchecked'].includes(program.status)
        ? program.status
        : 'unchecked',
    }));
  const complete = programs.length === REVIEWED_PROGRAM_COUNT
    && programs.every(program => (
      program.programId
      && program.programDataAddress
      && program.status === 'verified'
    ));
  return {
    status: status === 'verified' && !complete ? 'unavailable' : status,
    canTransact: payload.canTransact === true
      && status === 'verified'
      && complete,
    checkedAt: firstText(payload.checkedAt),
    rpcSlot: firstNumber(payload.rpcSlot),
    programs,
  };
}

function programIntegrityPauseMessage(integrity) {
  return integrity?.status === 'blocked'
    ? 'Trading paused: a reviewed Solana program changed and requires review.'
    : 'Trading paused: program integrity could not be confirmed.';
}

function preferredTheme(runtime) {
  try {
    const stored = runtime.localStorage?.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {
    // Storage is optional in private or embedded contexts.
  }
  try {
    if (runtime.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  } catch (_) {
    // Dark is the terminal default when system preferences are unavailable.
  }
  return 'dark';
}

function collectionToArray(raw, keys = []) {
  const value = unwrapEnvelope(raw);
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return [];
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function nonNegativeNumber(...values) {
  for (const value of values) {
    const number = firstNumber(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

function isoTimestamp(value) {
  const milliseconds = new Date(value || '').getTime();
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : '';
}

function normalizeHistoryInterval(value, fallback = DEFAULT_HISTORY_INTERVAL) {
  const interval = firstText(value).toLowerCase();
  return HISTORY_INTERVAL_MS[interval] ? interval : fallback;
}

function historyCadenceLabel(value) {
  return normalizeHistoryInterval(value) === '15m' ? '15-minute' : 'hourly';
}

export function normalizeProposalHistoryPayload(raw) {
  const data = unwrapEnvelope(raw);
  const payload = isObject(data) ? data : {};
  const rawSeries = collectionToArray(payload, ['series', 'points', 'history'])
    .slice(0, MAX_PROPOSAL_HISTORY_POINTS);
  const deduped = new Map();

  for (const point of rawSeries) {
    if (!isObject(point)) continue;
    const timestamp = isoTimestamp(point.timestamp || point.time || point.bucket);
    if (!timestamp) continue;
    deduped.set(timestamp, {
      timestamp,
      observedAt: isoTimestamp(point.observedAt) || timestamp,
      underlyingPrice: nonNegativeNumber(
        point.underlyingPrice,
        point.spotPrice,
        point.tokenPrice,
      ),
      passPrice: nonNegativeNumber(point.passPrice, point.approvedPrice),
      failPrice: nonNegativeNumber(point.failPrice, point.rejectedPrice),
      passTwap: nonNegativeNumber(point.passTwap, point.passTwapPrice),
      failTwap: nonNegativeNumber(point.failTwap, point.failTwapPrice),
      sampleCount: Math.max(1, Math.round(nonNegativeNumber(point.sampleCount) || 1)),
    });
  }

  const series = [...deduped.values()]
    .sort((left, right) => (
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
    ))
    .filter(point => (
      Number.isFinite(point.underlyingPrice)
      || Number.isFinite(point.passPrice)
      || Number.isFinite(point.failPrice)
      || Number.isFinite(point.passTwap)
      || Number.isFinite(point.failTwap)
    ));
  const source = isObject(payload.source) ? payload.source : {};
  const summary = isObject(payload.summary) ? payload.summary : {};
  const coverage = isObject(summary.coverage) ? summary.coverage : {};

  return {
    proposalId: safeBase58(payload.proposalId || payload.proposal?.id),
    interval: normalizeHistoryInterval(payload.interval),
    requestedInterval: normalizeHistoryInterval(
      payload.requestedInterval,
      normalizeHistoryInterval(payload.interval),
    ),
    availability: firstText(
      payload.availability,
      series.length ? 'partial' : 'unavailable',
    ),
    preTwap: isoTimestamp(payload.preTwap),
    series,
    source: {
      provider: boundedText(source.provider, 80),
      sourceInterval: boundedText(source.sourceInterval, 16),
      interval: boundedText(source.interval, 16),
      requestedInterval: boundedText(source.requestedInterval, 16),
      aggregation: boundedText(source.aggregation, 120),
    },
    summary: {
      pointCount: series.length,
      from: isoTimestamp(summary.from) || series[0]?.timestamp || '',
      to: isoTimestamp(summary.to) || series[series.length - 1]?.timestamp || '',
      coverage: {
        underlying: nonNegativeNumber(coverage.underlying)
          ?? series.filter(point => Number.isFinite(point.underlyingPrice)).length,
        pass: nonNegativeNumber(coverage.pass)
          ?? series.filter(point => Number.isFinite(point.passPrice)).length,
        fail: nonNegativeNumber(coverage.fail)
          ?? series.filter(point => Number.isFinite(point.failPrice)).length,
      },
    },
    degraded: isObject(payload.degraded)
      ? payload.degraded
      : { active: false, services: [], issues: [] },
  };
}

function formatChartPrice(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (Math.abs(value) >= 1) return value.toFixed(3);
  if (Math.abs(value) >= 0.01) return value.toFixed(4);
  return value.toFixed(6);
}

function formatChartCurrency(value) {
  const formatted = formatChartPrice(value);
  return formatted === '—' ? formatted : `$${formatted}`;
}

function formatHistoryDate(value, options = {}) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(options.time === false
      ? {}
      : { hour: 'numeric', minute: '2-digit' }),
  });
}

function formatHistoryOverlayTimestamp(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '—';
  const dateLabel = `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${String(
    date.getUTCFullYear(),
  ).slice(-2)}`;
  const timeLabel = `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')} UTC`;
  return `${dateLabel} · ${timeLabel}`;
}

function formatHistoryClock(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

export function proposalHistoryPhase(point, preTwap, interval = '1h') {
  const intervalStart = new Date(point?.timestamp || '').getTime();
  const twapStart = new Date(preTwap || '').getTime();
  if (!Number.isFinite(intervalStart) || !Number.isFinite(twapStart)) return null;
  const normalizedInterval = normalizeHistoryInterval(interval, '1h');
  if (intervalStart + HISTORY_INTERVAL_MS[normalizedInterval] <= twapStart) {
    return { key: 'pre', label: 'PRE-TWAP' };
  }
  if (intervalStart >= twapStart) {
    return { key: 'window', label: 'TWAP WINDOW' };
  }
  return {
    key: 'start',
    label: normalizedInterval === '1h' ? 'TWAP START HOUR' : 'TWAP START INTERVAL',
  };
}

function historyOverlayMetric({
  className,
  field,
  label,
  value,
  count,
  visible,
}) {
  const available = count > 0;
  return `
    <button
      class="ft-hourly-overlay-metric ${className}${visible && available ? ' ft-is-active' : ''}"
      type="button"
      data-ft-action="toggle-hourly-series"
      data-ft-series-field="${escapeHtml(field)}"
      aria-pressed="${visible && available}"
      aria-label="Toggle ${escapeHtml(label)} chart series"
      ${available ? '' : 'disabled'}
    >
      <span>${escapeHtml(label)}</span>
      <strong data-ft-readout-value="${escapeHtml(field)}">${formatChartCurrency(value)}</strong>
    </button>
  `;
}

function historySeriesMenuOption({
  field,
  label,
  count,
  visible,
}) {
  const available = count > 0;
  const active = visible && available;
  return `
    <button
      class="ft-hourly-series-option${active ? ' ft-is-active' : ''}"
      type="button"
      role="menuitemcheckbox"
      data-ft-action="toggle-hourly-series"
      data-ft-series-field="${escapeHtml(field)}"
      aria-checked="${active}"
      ${available ? '' : 'disabled'}
    >
      <span>${escapeHtml(label)}</span>
      <span class="ft-hourly-series-check" aria-hidden="true">✓</span>
    </button>
  `;
}

function renderTradingViewToolbarPreview() {
  return `
    <div
      class="chart-tv-placeholder-controls chart-tv-placeholder-controls-primary"
      aria-label="TradingView premium toolbar preview"
    >
      <button class="chart-tv-placeholder-button chart-tv-placeholder-timeframe chart-tv-placeholder-divider" type="button" disabled aria-label="TradingView weekly timeframe placeholder" title="TradingView weekly timeframe">
        <span>W</span>
      </button>
    </div>
    <div class="ft-hourly-growth-control" aria-label="Growth chart control">
      <button
        class="ft-hourly-style-cell ft-hourly-growth-button"
        type="button"
        disabled
        aria-label="Growth data coming soon"
        title="Growth data coming soon"
      >
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2.5 14.5h13"/>
          <path d="m3.5 11 3-3 2.5 2 5-6"/>
          <path d="M11.5 4h2.5v2.5"/>
        </svg>
      </button>
    </div>
    <div
      class="chart-tv-placeholder-controls chart-tv-placeholder-controls-secondary"
      aria-label="TradingView premium view toolbar preview"
    >
      <button
        class="chart-tv-placeholder-button"
        type="button"
        data-ft-action="toggle-chart-expansion"
        aria-label="Expand chart"
        title="Expand chart"
      >
        <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" aria-hidden="true">
          <path d="M10 4.5H4.5V10M18 4.5h5.5V10M10 23.5H4.5V18M18 23.5h5.5V18"/>
        </svg>
      </button>
    </div>
  `;
}

function renderProposalChartStatusShell({
  state = 'loading',
  title = 'Loading public market history',
  detail = 'Reading underlying, PROP PASS, and PROP FAIL prices. No wallet is required.',
} = {}) {
  const failed = state === 'error';
  return `
    <div
      class="ft-hourly-chart ft-hourly-chart-pending ft-hourly-chart-status-shell${failed ? ' ft-hourly-chart-failed' : ''}"
      data-ft-role="proposal-history-chart"
      data-ft-chart-state="${failed ? 'error' : 'loading'}"
      aria-busy="${failed ? 'false' : 'true'}"
    >
      <div class="ft-hourly-toolbar" aria-hidden="true">
        <div class="ft-hourly-series-control">
          <button class="ft-hourly-style-cell" type="button" disabled tabindex="-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 17L9 11L13 14L20 6"/>
            </svg>
          </button>
        </div>
        ${renderTradingViewToolbarPreview()}
      </div>
      <div class="ft-hourly-plot-shell">
        <div class="ft-chart-crosshair-rail" aria-hidden="true">
          <button class="ft-chart-crosshair-tool" type="button" disabled tabindex="-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>
              <circle cx="12" cy="12" r="2.25"/>
            </svg>
          </button>
        </div>
        <div
          class="ft-hourly-chart-mount-status${failed ? ' ft-hourly-chart-mount-error' : ''}"
          data-ft-role="proposal-chart-mount-status"
          role="status"
        >
          <span class="${failed ? '' : 'ft-loader'}" aria-hidden="true">${failed ? '!' : ''}</span>
          <div>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(detail)}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderHourlyPriceChart(history, ticker = 'TOKEN', options = {}) {
  const observations = Array.isArray(history?.series) ? history.series : [];
  const interval = normalizeHistoryInterval(history?.interval);
  const intervalLabel = interval === '15m' ? '15M' : '1H';
  const cadenceLabel = historyCadenceLabel(interval);
  const values = observations.flatMap(point => [
    point.underlyingPrice,
    point.passPrice,
    point.failPrice,
  ]).filter(Number.isFinite);
  if (!observations.length || !values.length) return '';

  const preTwapTime = new Date(history?.preTwap || '').getTime();
  const hasPreTwap = Number.isFinite(preTwapTime);
  const twapEndTime = new Date(options.windowEndedAt || '').getTime();
  const hasTwapEnd = Number.isFinite(twapEndTime);
  const latestPoint = observations[observations.length - 1] || {};
  const latestTime = firstText(
    latestPoint.chartTimestamp,
    latestPoint.observedAt,
    latestPoint.timestamp,
  );
  const latestValue = field => (
    Number.isFinite(latestPoint[field]) ? latestPoint[field] : null
  );
  const coverage = history.summary?.coverage || {};
  const visibility = isObject(options.visibility) ? options.visibility : {};
  const latestPass = latestValue('passPrice');
  const latestFail = latestValue('failPrice');
  const pairLabel = ticker.includes('/') ? ticker : `${ticker}/USD`;
  return `
    <div
      class="ft-hourly-chart ft-hourly-chart-pending"
      data-ft-role="proposal-history-chart"
      data-ft-chart-state="mounting"
      aria-busy="true"
    >
      <div class="ft-hourly-toolbar">
        <div class="ft-hourly-series-control" data-ft-role="hourly-series-control">
          <button
            class="ft-hourly-style-cell"
            type="button"
            data-ft-action="toggle-hourly-series-menu"
            data-ft-role="hourly-series-trigger"
            aria-label="Choose historical chart series"
            aria-haspopup="menu"
            aria-expanded="false"
            title="Historical chart series"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 17L9 11L13 14L20 6"/>
            </svg>
          </button>
          <div
            class="ft-hourly-series-menu"
            data-ft-role="hourly-series-menu"
            role="menu"
            aria-label="Historical chart series"
            hidden
          >
            <div class="ft-hourly-series-menu-label">Historical series</div>
            ${historySeriesMenuOption({
              field: 'underlyingPrice',
              label: 'Spot price',
              count: coverage.underlying || 0,
              visible: visibility.underlyingPrice !== false,
            })}
            ${historySeriesMenuOption({
              field: 'passPrice',
              label: 'Pass price',
              count: coverage.pass || 0,
              visible: visibility.passPrice !== false,
            })}
            ${historySeriesMenuOption({
              field: 'failPrice',
              label: 'Fail price',
              count: coverage.fail || 0,
              visible: visibility.failPrice !== false,
            })}
          </div>
        </div>
        ${renderTradingViewToolbarPreview()}
      </div>
      <div class="ft-hourly-plot-shell">
        <div class="ft-chart-crosshair-rail" role="toolbar" aria-label="Chart cursor tools">
          <button class="ft-chart-crosshair-tool" type="button" aria-label="Crosshair cursor" aria-pressed="true" title="Crosshair cursor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>
              <circle cx="12" cy="12" r="2.25"/>
            </svg>
          </button>
        </div>
        <div class="ft-hourly-readout" aria-live="off">
          <div class="ft-hourly-readout-header">
            <span>${escapeHtml(pairLabel)}</span>
            <i aria-hidden="true">·</i>
            <span>${intervalLabel}</span>
            <i aria-hidden="true">·</i>
            <span data-ft-role="hourly-readout-time">${escapeHtml(
              formatHistoryOverlayTimestamp(latestTime),
            )}</span>
          </div>
          <div class="ft-hourly-overlay-values" role="group" aria-label="Toggle chart series">
            ${historyOverlayMetric({
              className: 'ft-hourly-overlay-price',
              field: 'underlyingPrice',
              label: 'Price',
              value: latestValue('underlyingPrice'),
              count: coverage.underlying || 0,
              visible: visibility.underlyingPrice !== false,
            })}
            ${historyOverlayMetric({
              className: 'ft-hourly-overlay-pass',
              field: 'passPrice',
              label: 'Pass',
              value: latestPass,
              count: coverage.pass || 0,
              visible: visibility.passPrice !== false,
            })}
            ${historyOverlayMetric({
              className: 'ft-hourly-overlay-fail',
              field: 'failPrice',
              label: 'Fail',
              value: latestFail,
              count: coverage.fail || 0,
              visible: visibility.failPrice !== false,
            })}
          </div>
        </div>
        <div
          class="ft-hourly-chart-mount-status"
          data-ft-role="proposal-chart-mount-status"
          role="status"
        >
          <span class="ft-loader" aria-hidden="true"></span>
          <div>
            <strong>Preparing proposal chart</strong>
            <p>Applying the indexed price series and market boundaries.</p>
          </div>
        </div>
        <div
          class="ft-hourly-live"
          data-ft-role="proposal-history-tradingview"
          data-ft-chart-engine="tradingview-lightweight"
          role="img"
          aria-label="Interactive TradingView chart of ${cadenceLabel} ${escapeHtml(ticker)}, PROP PASS, and PROP FAIL spot prices.${hasPreTwap ? ' The TWAP start boundary separates PRE-TWAP context from the decision observation window.' : ''}${hasTwapEnd ? ' The TWAP end boundary closes that window.' : ''} Drag to pan, use the mouse wheel or pinch to zoom, and hover to inspect exact values."
        ></div>
      </div>
    </div>
  `;
}

function buildNavMap(payload) {
  const data = unwrapEnvelope(payload);
  if (!isObject(data)) return new Map();
  const rows = collectionToArray(data.currentNav, ['tokens', 'items', 'rows']);
  const tokenRows = collectionToArray(data.tokens, ['tokens', 'items', 'rows']);
  const map = new Map();

  tokenRows.forEach((row) => {
    if (!isObject(row)) return;
    const key = normalizeKey(row.token || row.key || row.slug || row.ticker);
    if (key) map.set(key, { ...row });
  });
  rows.forEach((row) => {
    if (!isObject(row)) return;
    const key = normalizeKey(row.token || row.key || row.slug || row.ticker);
    if (key) map.set(key, { ...(map.get(key) || {}), ...row });
  });

  return map;
}

function normalizeBranch(raw, fallbackPrice = null) {
  const branch = isObject(raw) ? raw : {};
  return {
    price: firstNumber(branch.price, branch.spotPrice, branch.oraclePrice, fallbackPrice),
    oraclePrice: firstNumber(branch.oraclePrice, branch.price, fallbackPrice),
    twapPrice: firstNumber(branch.twapPrice, branch.twap, branch.timeWeightedPrice),
    baseReserves: firstNumber(branch.baseReserves, branch.baseReserve, branch.reserves?.base),
    quoteReserves: firstNumber(branch.quoteReserves, branch.quoteReserve, branch.reserves?.quote),
    liquidityUsd: firstNumber(branch.liquidityUsd, branch.liquidity, branch.tvlUsd),
  };
}

function officialProposalUrl(token, proposalId) {
  const project = normalizeKey(token);
  const id = safeBase58(proposalId);
  if (!project || !id) return '';
  return `https://www.metadao.fi/projects/${encodeURIComponent(project)}/proposal/${encodeURIComponent(id)}`;
}

function normalizeMarket(raw, navMap, index, options = {}) {
  if (!isObject(raw)) return null;
  const proposal = isObject(raw.proposal) ? raw.proposal : {};
  const marketSnapshot = isObject(raw.market) ? raw.market : raw;
  const observedSnapshot = isObject(raw.final)
    ? raw.final
    : isObject(raw.finalMarket)
      ? raw.finalMarket
      : isObject(raw.finalSnapshot)
        ? raw.finalSnapshot
        : marketSnapshot;
  const decision = isObject(marketSnapshot.decision)
    ? marketSnapshot.decision
    : isObject(raw.decision)
      ? raw.decision
      : {};
  const proposalAccounts = isObject(marketSnapshot.proposalAccounts)
    ? marketSnapshot.proposalAccounts
    : {};
  const outcomeMetadata = isObject(raw.outcome)
    ? raw.outcome
    : isObject(raw.outcomeConfig)
      ? raw.outcomeConfig
      : isObject(proposal.outcome)
        ? proposal.outcome
        : isObject(proposal.outcomeConfig)
          ? proposal.outcomeConfig
          : {};
  const token = normalizeKey(raw.token || raw.tokenKey || raw.slug || raw.dao?.token);
  const nav = navMap.get(token) || {};
  const proposalId = safeBase58(
    proposal.id || proposal.address || raw.proposalId || raw.proposalAddress || raw.id,
  );
  if (!proposalId) return null;

  const ticker = firstText(raw.ticker, nav.ticker, token.toUpperCase()).toUpperCase();
  const name = firstText(raw.name, nav.name, nav.config?.name, ticker);
  const thresholdBps = firstNumber(
    marketSnapshot.thresholdBps,
    raw.thresholdBps,
    proposal.thresholdBps,
  );
  const thresholdPct = firstNumber(
    marketSnapshot.thresholdPct,
    raw.thresholdPct,
    decision.thresholdPct,
    thresholdBps == null ? null : thresholdBps / 100,
  );
  const outcome = normalizeProposalOutcome(
    typeof proposal.outcome === 'string' ? proposal.outcome : '',
    proposal.result,
    typeof raw.outcome === 'string' ? raw.outcome : '',
    raw.result,
    raw.resolution?.outcome,
    outcomeMetadata.result,
    outcomeMetadata.status,
    proposal.passed,
    raw.passed,
  );
  const status = normalizeProposalStatus(
    proposal.rawStatus
      || proposal.status
      || proposal.state
      || raw.rawStatus
      || raw.status
      || raw.state,
    outcome,
    options,
  );
  const isLive = status.key === 'live';
  const tradable = raw.tradable === true
    || (options.forceLive === true && raw.tradable !== false);
  const spot = normalizeBranch(
    observedSnapshot.spot || raw.spot,
    isLive
      ? firstNumber(marketSnapshot.spotPrice, raw.spotPrice, nav.spot, nav.price)
      : firstNumber(marketSnapshot.spotPrice, raw.spotPrice),
  );
  const pass = normalizeBranch(
    observedSnapshot.pass || raw.pass,
    firstNumber(marketSnapshot.passPrice, raw.passPrice, raw.passSpotPrice),
  );
  const fail = normalizeBranch(
    observedSnapshot.fail || raw.fail,
    firstNumber(marketSnapshot.failPrice, raw.failPrice, raw.failSpotPrice),
  );
  const derivedMargin = Number.isFinite(pass.twapPrice)
    && Number.isFinite(fail.twapPrice)
    && fail.twapPrice > 0
    && Number.isFinite(thresholdPct)
    && isLive
    ? ((pass.twapPrice - fail.twapPrice) / fail.twapPrice) * 100 - thresholdPct
    : null;
  const marginPct = firstNumber(decision.marginPct, raw.marginPct, derivedMargin);
  const passing = typeof decision.passing === 'boolean'
    ? decision.passing
    : Number.isFinite(marginPct)
      ? marginPct >= 0
      : null;
  const rawProposalUrl = firstText(proposal.url, raw.url, raw.proposalUrl);
  const projectSlug = normalizeKey(proposal.projectSlug || raw.projectSlug);
  const generatedProposalUrl = options.forceLive
    ? officialProposalUrl(projectSlug || token, proposalId)
    : '';
  const sourceUrl = safeProposalSourceUrl(rawProposalUrl) || generatedProposalUrl;
  const executionUrl = isLive
    ? safeExecutionUrl(rawProposalUrl) || generatedProposalUrl
    : '';
  const proposalTitle = boundedText(
    firstText(proposal.title, raw.title, `${ticker} proposal`),
    2_000,
  );
  const proposalDescription = boundedText(
    firstText(proposal.description, raw.description),
    8_000,
  );

  return {
    id: proposalId,
    key: `${token || 'market'}-${proposalId}-${index}`,
    token,
    ticker,
    name,
    logo: safeAssetUrl(firstText(raw.logo, nav.logo, nav.config?.logo)),
    daoAddress: safeBase58(raw.daoAddress || raw.dao || proposal.daoAddress),
    baseMint: safeBase58(raw.baseMint || proposal.baseMint),
    quoteMint: safeBase58(raw.quoteMint || proposal.quoteMint),
    baseDecimals: firstNumber(raw.baseDecimals, proposal.baseDecimals),
    quoteDecimals: firstNumber(raw.quoteDecimals, proposal.quoteDecimals),
    proposal: {
      id: proposalId,
      number: firstNumber(proposal.number, raw.number, raw.proposalNumber),
      title: proposalTitle,
      description: proposalDescription,
      status: status.raw,
      statusGroup: status.key,
      statusLabel: status.label,
      outcome,
      isLive,
      tradable,
      url: sourceUrl,
      sourceUrl,
      executionUrl,
      createdAt: firstText(proposal.createdAt, raw.createdAt),
      endsAt: firstText(proposal.endsAt, proposal.endAt, raw.endsAt),
      resolvedAt: firstText(
        proposal.resolvedAt,
        proposal.finalizedAt,
        proposal.completedAt,
        raw.resolvedAt,
        raw.finalizedAt,
        raw.completedAt,
      ),
      isTeamSponsored: proposal.isTeamSponsored === true || raw.isTeamSponsored === true,
      proposer: safeBase58(
        proposal.proposer
        || proposal.proposerAddress
        || proposal.creator
        || raw.proposer
        || raw.proposerAddress
        || raw.creator,
      ),
      baseVault: safeBase58(
        proposal.baseVault || proposalAccounts.baseVault || raw.vaults?.base,
      ),
      quoteVault: safeBase58(
        proposal.quoteVault || proposalAccounts.quoteVault || raw.vaults?.quote,
      ),
      passBaseMint: safeBase58(proposal.passBaseMint || proposalAccounts.passBaseMint),
      passQuoteMint: safeBase58(proposal.passQuoteMint || proposalAccounts.passQuoteMint),
      failBaseMint: safeBase58(proposal.failBaseMint || proposalAccounts.failBaseMint),
      failQuoteMint: safeBase58(proposal.failQuoteMint || proposalAccounts.failQuoteMint),
      terms: {
        type: firstText(
          outcomeMetadata.type,
          outcomeMetadata.category,
          outcomeMetadata.kind,
        ),
        category: firstText(outcomeMetadata.category),
        usdcAmount: firstNumber(
          outcomeMetadata.usdcAmount,
          outcomeMetadata.usdc_amount,
          outcomeMetadata.amountUsdc,
        ),
        tokenAmount: firstNumber(
          outcomeMetadata.tokenAmount,
          outcomeMetadata.token_amount,
          outcomeMetadata.amountTokens,
        ),
        maxPrice: firstNumber(outcomeMetadata.maxPrice, outcomeMetadata.max_price),
        burnAmount: firstNumber(
          outcomeMetadata.burnAmount,
          outcomeMetadata.burn_amount,
        ),
        implementation: boundedText(
          outcomeMetadata.implementation,
          180,
        ),
        roadmapApproved: typeof outcomeMetadata.roadmapApproved === 'boolean'
          ? outcomeMetadata.roadmapApproved
          : typeof outcomeMetadata.roadmap_approved === 'boolean'
            ? outcomeMetadata.roadmap_approved
            : null,
        startedAt: firstText(
          outcomeMetadata.startedAt,
          outcomeMetadata.startAt,
          outcomeMetadata.started_at,
        ),
        completedAt: firstText(
          outcomeMetadata.completedAt,
          outcomeMetadata.completed_at,
        ),
        executionAt: firstText(
          outcomeMetadata.executionAt,
          outcomeMetadata.executedAt,
          outcomeMetadata.execution_timestamp,
          raw.executionAt,
          raw.executedAt,
        ),
        signature: safeSignature(firstText(
          outcomeMetadata.signature,
          outcomeMetadata.executionSignature,
          outcomeMetadata.transactionSignature,
          outcomeMetadata.txSignature,
          raw.executionSignature,
          raw.transactionSignature,
        )),
      },
    },
    thresholdBps,
    thresholdPct,
    decision: {
      passing,
      marginPct,
      targetPassTwap: firstNumber(
        decision.targetPassTwap,
        isLive && Number.isFinite(fail.twapPrice) && Number.isFinite(thresholdPct)
          ? fail.twapPrice * (1 + thresholdPct / 100)
          : null,
      ),
    },
    spot,
    pass,
    fail,
    liquidityUsd: firstNumber(
      marketSnapshot.liquidityUsd,
      raw.liquidityUsd,
      pass.liquidityUsd,
      fail.liquidityUsd,
    ),
    marketKind: firstText(marketSnapshot.kind, isLive ? 'live' : ''),
    marketAsOf: firstText(marketSnapshot.asOf, raw.marketAsOf),
    marketSlot: firstNumber(marketSnapshot.slot, raw.marketSlot),
    source: isObject(raw.source) ? raw.source : {},
    nav: {
      spot: firstNumber(nav.spot, nav.price, nav.currentPrice),
      nav: firstNumber(nav.nav, nav.currentNav, nav.navPerToken),
      treasury: firstNumber(
        nav.treasuryUSDC,
        nav.treasuryUsd,
        nav.treasury,
        nav.navSnapshot?.treasuryUSDC,
      ),
      marketCap: firstNumber(nav.marketCap, nav.marketCapUsd, nav.mcap),
      monthlySpend: firstNumber(
        nav.monthlyAllowance,
        nav.monthlySpendingLimitUsdc,
        nav.monthlySpend,
        nav.config?.monthlyAllowance,
      ),
    },
    searchText: [
      ticker,
      name,
      proposalTitle,
      proposalDescription,
      proposalId,
      raw.daoAddress,
      raw.baseMint,
    ].join(' ').toLowerCase(),
  };
}

function normalizeMarketPayload(raw, navMap, options = {}) {
  const data = unwrapEnvelope(raw);
  const payload = isObject(data) ? data : {};
  const markets = collectionToArray(payload, ['markets', 'proposals', 'items', 'archive', 'history'])
    .map((market, index) => normalizeMarket(market, navMap, index, options))
    .filter(Boolean);

  return {
    markets,
    asOf: firstText(payload.asOf, payload.updatedAt),
    slot: firstNumber(payload.slot),
    source: isObject(payload.source) ? payload.source : {},
    summary: isObject(payload.summary) ? payload.summary : {},
    pagination: isObject(payload.pagination)
      ? {
        nextCursor: firstText(payload.pagination.nextCursor),
        total: firstNumber(payload.pagination.total, payload.summary?.total),
      }
      : {
        nextCursor: firstText(payload.nextCursor),
        total: firstNumber(payload.total, payload.summary?.total),
      },
    degraded: isObject(payload.degraded)
      ? payload.degraded
      : { active: payload.degraded === true, services: [], issues: [] },
    pendingProposalCount: firstNumber(payload.pendingProposalCount, markets.length),
  };
}

function mergeProposalLists(indexedProposals, liveMarkets) {
  const byId = new Map();
  indexedProposals.forEach((proposal) => {
    byId.set(proposal.id, proposal);
  });
  liveMarkets.forEach((market) => {
    const indexed = byId.get(market.id);
    if (!indexed) {
      byId.set(market.id, market);
      return;
    }
    byId.set(market.id, {
      ...indexed,
      ...market,
      proposal: {
        ...indexed.proposal,
        ...market.proposal,
        title: market.proposal.title || indexed.proposal.title,
        description: market.proposal.description || indexed.proposal.description,
        url: market.proposal.url || indexed.proposal.url,
        isLive: true,
        statusGroup: 'live',
        statusLabel: 'Live',
      },
      nav: { ...indexed.nav, ...market.nav },
      source: { ...indexed.source, ...market.source },
      searchText: `${indexed.searchText} ${market.searchText}`,
    });
  });
  return [...byId.values()].filter(shouldDisplayProposal).sort((left, right) => {
    if (left.proposal.isLive !== right.proposal.isLive) return left.proposal.isLive ? -1 : 1;
    const leftTime = new Date(
      left.proposal.resolvedAt || left.proposal.endsAt || left.proposal.createdAt || 0,
    ).getTime();
    const rightTime = new Date(
      right.proposal.resolvedAt || right.proposal.endsAt || right.proposal.createdAt || 0,
    ).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

function mergeIndexedProposalPages(...pages) {
  const byId = new Map();
  pages.flat().forEach((proposal) => {
    if (proposal?.id) byId.set(proposal.id, proposal);
  });
  return mergeProposalLists([...byId.values()], []);
}

function mergeDegradedStates(...states) {
  const services = new Set();
  const issues = [];
  states.forEach((state) => {
    if (!isObject(state)) return;
    (Array.isArray(state.services) ? state.services : []).forEach(service => services.add(service));
    if (Array.isArray(state.issues)) issues.push(...state.issues);
  });
  return {
    active: services.size > 0 || states.some(state => state?.active === true),
    services: [...services],
    issues,
  };
}

function normalizePositionRows(raw, market) {
  const data = unwrapEnvelope(raw);
  const payload = isObject(data) ? data : {};
  const source = Array.isArray(payload.positions)
    ? payload.positions
    : Array.isArray(payload.balances)
      ? payload.balances
      : [];
  const mintLabels = new Map([
    [market?.baseMint, market?.ticker || 'Base'],
    [market?.quoteMint, 'USDC'],
    [market?.proposal.passBaseMint, `PASS ${market?.ticker || 'base'}`],
    [market?.proposal.passQuoteMint, 'PASS USDC'],
    [market?.proposal.failBaseMint, `FAIL ${market?.ticker || 'base'}`],
    [market?.proposal.failQuoteMint, 'FAIL USDC'],
  ].filter(([mint]) => mint));
  const semanticLabels = {
    base: market?.ticker || 'Base',
    quote: 'USDC',
    passBase: `PASS ${market?.ticker || 'base'}`,
    passQuote: 'PASS USDC',
    failBase: `FAIL ${market?.ticker || 'base'}`,
    failQuote: 'FAIL USDC',
  };

  return {
    positions: source
      .map((row) => {
        if (!isObject(row)) return null;
        const mint = safeBase58(row.mint || row.tokenMint);
        const amount = firstNumber(row.amount, row.uiAmount, row.uiBalance);
        const rawAmount = firstText(row.rawAmount, row.amountRaw);
        const amountString = firstText(row.amountString);
        const available = row.available !== false && (Number.isFinite(amount) || !!amountString);
        if (!mint) return null;
        return {
          mint,
          label: firstText(
            semanticLabels[row.label],
            row.symbol,
            mintLabels.get(mint),
            row.label,
            'Token',
          ),
          available,
          amount: Number.isFinite(amount) ? amount : null,
          amountString,
          rawAmount,
          decimals: firstNumber(row.decimals),
        };
      })
      .filter(Boolean),
    asOf: firstText(payload.asOf, payload.updatedAt),
    slot: firstNumber(payload.slot),
    degraded: payload.degraded === true || payload.degraded?.active === true,
  };
}

function normalizeProposalMarketData(raw) {
  const data = unwrapEnvelope(raw);
  const payload = isObject(data) ? data : {};
  const normalizeBook = (value, branch) => {
    const book = isObject(value) ? value : {};
    const normalizeLevels = (rows, side) => (
      (Array.isArray(rows) ? rows : [])
        .map((row) => {
          if (!isObject(row)) return null;
          const price = nonNegativeNumber(row.price);
          const amount = nonNegativeNumber(row.amount);
          const cumulativeAmount = nonNegativeNumber(row.cumulativeAmount, amount);
          if (!(price > 0) || !(amount > 0)) return null;
          return {
            side,
            price,
            amount,
            cumulativeAmount,
            orderCount: Math.max(1, Math.round(nonNegativeNumber(row.orderCount) || 1)),
          };
        })
        .filter(Boolean)
        .slice(0, 20)
    );
    return {
      branch,
      address: safeBase58(book.address),
      baseMint: safeBase58(book.baseMint),
      quoteMint: safeBase58(book.quoteMint),
      baseDecimals: firstNumber(book.baseDecimals),
      quoteDecimals: firstNumber(book.quoteDecimals),
      canonical: book.canonical === true,
      bestBid: nonNegativeNumber(book.bestBid),
      bestAsk: nonNegativeNumber(book.bestAsk),
      bids: normalizeLevels(book.bids, 'bid'),
      asks: normalizeLevels(book.asks, 'ask'),
      depositedBalances: (Array.isArray(book.depositedBalances)
        ? book.depositedBalances
        : [])
        .map((row) => {
          if (!isObject(row) || (row.asset !== 'base' && row.asset !== 'quote')) {
            return null;
          }
          const mint = safeBase58(row.mint);
          const amount = nonNegativeNumber(row.amount);
          if (!mint || !Number.isFinite(amount)) return null;
          return {
            asset: row.asset,
            mint,
            amount,
            decimals: firstNumber(row.decimals),
          };
        })
        .filter(Boolean),
    };
  };
  const books = isObject(payload.books) ? payload.books : {};
  const recentTrades = (Array.isArray(payload.recentTrades) ? payload.recentTrades : [])
    .map((row) => {
      if (!isObject(row)) return null;
      const branch = row.branch === 'pass' || row.branch === 'fail' ? row.branch : '';
      const side = row.side === 'buy' || row.side === 'sell' ? row.side : '';
      const venue = row.venue === 'manifest' || row.venue === 'futarchy_amm'
        ? row.venue
        : '';
      const price = nonNegativeNumber(row.price);
      const signature = safeSignature(row.signature);
      if (!branch || !side || !venue || !(price > 0) || !signature) return null;
      return {
        branch,
        side,
        venue,
        price,
        baseAmount: nonNegativeNumber(row.baseAmount),
        quoteAmount: nonNegativeNumber(row.quoteAmount),
        volumeUsd: nonNegativeNumber(row.volumeUsd),
        blockTime: isoTimestamp(row.blockTime),
        signature,
      };
    })
    .filter(Boolean)
    .slice(0, 40);
  const openOrders = (Array.isArray(payload.openOrders) ? payload.openOrders : [])
    .map((row) => {
      if (!isObject(row)) return null;
      const branch = row.branch === 'pass' || row.branch === 'fail' ? row.branch : '';
      const side = row.side === 'bid' || row.side === 'ask' ? row.side : '';
      const market = safeBase58(row.market);
      const price = nonNegativeNumber(row.price);
      const amount = nonNegativeNumber(row.amount);
      if (!branch || !side || !market || !(price > 0) || !(amount > 0)) return null;
      return {
        branch,
        side,
        market,
        price,
        amount,
        clientOrderId: firstText(row.clientOrderId),
        lastValidSlot: firstText(row.lastValidSlot),
      };
    })
    .filter(Boolean);
  return {
    proposalId: safeBase58(payload.proposalId),
    asOf: isoTimestamp(payload.asOf),
    slot: firstNumber(payload.slot),
    cluster: firstText(payload.cluster),
    books: {
      pass: normalizeBook(books.pass, 'pass'),
      fail: normalizeBook(books.fail, 'fail'),
    },
    recentTrades,
    openOrders,
    source: isObject(payload.source) ? payload.source : {},
    degraded: isObject(payload.degraded)
      ? payload.degraded
      : { active: false, services: [], issues: [] },
  };
}

function findWalletProvider(runtime) {
  const candidates = [
    runtime.phantom?.solana,
    runtime.solflare,
    runtime.backpack?.solana,
    runtime.solana,
  ];
  return candidates.find(provider => (
    provider
    && typeof provider.connect === 'function'
    && (provider.isPhantom || provider.isSolflare || provider.isBackpack || provider.publicKey)
  )) || candidates.find(provider => provider && typeof provider.connect === 'function') || null;
}

function walletName(provider) {
  if (!provider) return '';
  if (provider.isPhantom) return 'Phantom';
  if (provider.isSolflare) return 'Solflare';
  if (provider.isBackpack) return 'Backpack';
  return firstText(provider.name, 'Solana wallet');
}

function providerAddress(provider, response) {
  const publicKey = response?.publicKey || provider?.publicKey;
  if (!publicKey) return '';
  const value = typeof publicKey.toBase58 === 'function'
    ? publicKey.toBase58()
    : String(publicKey);
  return safeBase58(value);
}

function marketStatusLabel(market) {
  if (market.decision.passing === true) return 'Passing';
  if (market.decision.passing === false) return 'Failing';
  return 'Awaiting signal';
}

function renderLogo(market, size = 'normal') {
  if (market.logo) {
    return `<img class="ft-token-logo ft-token-logo-${size}" src="${escapeHtml(market.logo)}" alt="">`;
  }
  const fallback = escapeHtml((market.ticker || '?').slice(0, 2));
  return `<span class="ft-token-logo ft-token-logo-${size} ft-token-logo-fallback" aria-hidden="true">${fallback}</span>`;
}

function reserveDepth(branch, ticker) {
  return `
    <div class="ft-depth-row">
      <span>${escapeHtml(ticker)} reserves</span>
      <strong>${formatTokenAmount(branch.baseReserves, 2)}</strong>
    </div>
    <div class="ft-depth-row">
      <span>Quote reserves</span>
      <strong>${Number.isFinite(branch.quoteReserves) ? formatCompactMoney(branch.quoteReserves) : '—'}</strong>
    </div>
    <div class="ft-depth-row">
      <span>Pool liquidity</span>
      <strong>${formatCompactMoney(branch.liquidityUsd)}</strong>
    </div>
  `;
}

function convergenceGeometry(market) {
  const values = [
    market.pass.price,
    market.pass.twapPrice,
    market.fail.price,
    market.fail.twapPrice,
    market.decision.targetPassTwap,
  ].filter(Number.isFinite);
  if (!values.length) return null;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max((maxValue - minValue) * 0.3, maxValue * 0.015, 0.000001);
  const min = Math.max(0, minValue - padding);
  const max = maxValue + padding;
  const range = max - min || 1;
  const position = value => (
    Number.isFinite(value)
      ? Math.max(1, Math.min(99, ((value - min) / range) * 100))
      : null
  );
  return {
    min,
    max,
    passSpot: position(market.pass.price),
    passTwap: position(market.pass.twapPrice),
    failSpot: position(market.fail.price),
    failTwap: position(market.fail.twapPrice),
    target: position(market.decision.targetPassTwap),
  };
}

function addressRow(label, address, actionLabel) {
  if (!address) return '';
  return `
    <div class="ft-address-row">
      <span>${escapeHtml(label)}</span>
      <button
        class="ft-address-button"
        type="button"
        data-ft-action="copy-address"
        data-ft-address="${escapeHtml(address)}"
        aria-label="Copy ${escapeHtml(actionLabel || label)} address"
      >${escapeHtml(shortenAddress(address, 5))}<span aria-hidden="true">⌁</span></button>
    </div>
  `;
}

function executionEstimate(market, outcome, side, amount, slippageBps) {
  const branch = outcome === 'fail' ? market?.fail : market?.pass;
  const price = branch?.price;
  if (!market || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) {
    return null;
  }
  const output = side === 'buy' ? amount / price : amount * price;
  const protectedReference = output * (1 - slippageBps / 10_000);
  return {
    output,
    protectedReference,
    price,
    inputSymbol: side === 'buy' ? 'USDC' : market.ticker,
    outputSymbol: side === 'buy'
      ? `${outcome.toUpperCase()} ${market.ticker}`
      : `${outcome.toUpperCase()} USDC`,
  };
}

/**
 * Mount NAVgator's shared decision-market workspace.
 *
 * Proposal browsing and market data remain public. Wallet connection is only
 * required when a user chooses to review and submit an on-chain action.
 */
export function shouldHandleSidebarProposalClick(event, anchor, hostMode = 'token') {
  if (
    hostMode !== 'token'
    || !event
    || !anchor
    || event.defaultPrevented
    || Number(event.button || 0) !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || anchor.hasAttribute?.('download')
  ) return false;
  const target = String(anchor.getAttribute?.('target') || '').toLowerCase();
  return !target || target === '_self';
}

export function mountFutardTerminal({
  window: runtime = globalThis.window,
  root,
  createProposalHistoryChart = null,
  mode = 'standalone',
  token = '',
} = {}) {
  if (!runtime || !root || typeof root.addEventListener !== 'function') {
    throw new TypeError('mountFutardTerminal requires a browser window and DOM root');
  }

  const previous = activeMounts.get(root);
  if (previous) previous.destroy();

  const uid = `ft-terminal-${++instanceCount}`;
  const api = runtime.NAVGATOR?.api || {};
  const baseUrl = api.baseUrl || '';
  const client = runtime.NAVGATOR?.client || create01ResolvedClient({
    baseUrl,
    transport: {
      json: api.json?.bind(api),
    },
  });
  const routes = runtime.NAVGATOR?.shell?.routes || {};
  const hostMode = ['discovery', 'token'].includes(mode) ? mode : 'standalone';
  const initialToken = routes.normalizeTokenKey?.(token)
    || normalizeKey(token);
  const initialParams = new runtime.URLSearchParams(runtime.location?.search || '');
  const initialProposalId = safeBase58(initialParams.get('proposal'));
  const initialWorkspaceTab = hostMode === 'token' && initialParams.get('tab') === 'tokens'
    ? 'tokens'
    : 'decisions';
  const preferInitialLiveDecision = hostMode === 'token'
    && runtime.document.documentElement.dataset.defaultMarketSelection
      === DEFAULT_MARKET_SELECTION;
  const requestedFilter = String(initialParams.get('filter') || '').toLowerCase();
  const initialFilter = requestedFilter === 'live'
    ? 'live'
    : ['indexed', 'other'].includes(requestedFilter)
      ? 'indexed'
      : [
        'resolved',
        // Preserve old shared archive URLs while presenting one clear closed state.
        'history',
        'passed',
        'failed',
      ].includes(requestedFilter) || initialParams.get('history') === '1'
        ? 'resolved'
        : 'all';
  const state = {
    hostMode,
    workspaceTab: initialWorkspaceTab,
    preferInitialLiveDecision,
    tokenFilter: hostMode === 'token' ? initialToken : '',
    destroyed: false,
    requestId: 0,
    paginationRequestId: 0,
    positionRequestId: 0,
    marketDataRequestId: 0,
    historyRequestId: 0,
    recurringRequestId: 0,
    abortController: null,
    paginationAbortController: null,
    positionAbortController: null,
    marketDataAbortController: null,
    historyAbortController: null,
    historyActiveId: '',
    historyChart: null,
    historyRange: 'all',
    historySeriesVisibility: {
      underlyingPrice: true,
      passPrice: true,
      failPrice: true,
    },
    pollTimer: null,
    pricePollTimer: null,
    clockTimer: null,
    transactionTimer: null,
    priceRequestId: 0,
    priceAbortController: null,
    priceRefreshing: false,
    transactionStatusLoading: false,
    noticeTimer: null,
    theme: hostMode === 'standalone' ? preferredTheme(runtime) : 'dark',
    loading: true,
    refreshing: false,
    error: '',
    liveError: '',
    archiveError: '',
    navigationPending: false,
    notice: '',
    routeNotice: '',
    markets: [],
    sidebarMarkets: [],
    sidebarHistoryOpen: false,
    activeMarkets: [],
    indexedProposals: [],
    selectedId: initialProposalId,
    requestedProposalId: initialProposalId,
    proposalFocus: Boolean(initialProposalId),
    query: '',
    filter: initialFilter,
    asOf: '',
    slot: null,
    source: {},
    degraded: { active: false, services: [], issues: [] },
    pendingProposalCount: 0,
    proposalSummary: {},
    proposalPagination: {
      nextCursor: '',
      total: null,
      loadingMore: false,
    },
    historyByProposal: new Map(),
    marketDataByProposal: new Map(),
    transactions: [],
    navMap: new Map(),
    order: {
      outcome: 'pass',
      side: 'buy',
      type: 'swap',
      amount: '',
      price: '',
      slippageBps: 100,
      intervalSeconds: 3_600,
      totalCycles: 4,
    },
    ownershipOrder: {
      side: 'buy',
      type: 'market',
      amount: '',
      slippageBps: 100,
      quote: null,
      quoteLoading: false,
      quoteError: '',
      quoteRequestId: 0,
      quoteAbortController: null,
      quoteTimer: null,
    },
    activityTab: 'balances',
    ownershipActivityTab: 'balances',
    transactionSizeUnit: 'usd',
    decisionTradeSupportFilter: 'all',
    bookTab: 'pass',
    recurring: {
      enabled: false,
      keeperReady: false,
      programId: '',
      minimumIntervalSeconds: 3_600,
      maximumCycles: 365,
      schedules: [],
      loading: false,
      error: '',
    },
    programIntegrity: {
      status: 'checking',
      canTransact: false,
      checkedAt: '',
      rpcSlot: null,
      programs: [],
    },
    execution: {
      connection: null,
      plan: null,
      simulation: null,
      reviewOpen: false,
      building: false,
      submitting: false,
      error: '',
      signature: '',
      resume: null,
    },
    wallet: {
      adapter: null,
      provider: null,
      name: '',
      address: '',
      connecting: false,
      pickerOpen: false,
      options: [],
      canTransact: false,
      canSignTransaction: false,
      error: '',
      positions: [],
      positionsLoading: false,
      positionsError: '',
      positionsAsOf: '',
      positionsSlot: null,
      positionsDegraded: false,
      redemption: null,
    },
  };

  let workspaceTransitionId = 0;
  let activeWorkspaceTransitionPromise = null;

  function concealWorkspaceShell() {
    const shell = root.querySelector?.('[data-ft-role="terminal"]');
    if (!shell) return;
    shell.style.visibility = 'hidden';
    shell.setAttribute('aria-hidden', 'true');
  }

  function revealWorkspaceShell() {
    const shell = root.querySelector?.('[data-ft-role="terminal"]');
    if (!shell) return;
    shell.style.removeProperty('visibility');
    shell.removeAttribute('aria-hidden');
  }

  function beginWorkspaceTransition() {
    const transitionId = ++workspaceTransitionId;
    root.dataset.ftTransition = 'pending';
    root.setAttribute('aria-busy', 'true');
    concealWorkspaceShell();
    return transitionId;
  }

  function endWorkspaceTransition(transitionId) {
    if (state.destroyed || transitionId !== workspaceTransitionId) return;
    // Never expose the controller's generic governance-loading scaffold. It is
    // structurally useful while data is assembled, but it is not a user-facing
    // state in the token workspace. Keeping the shell concealed at the DOM
    // level also protects against a late stylesheet or a transition-cover race.
    if (state.loading || state.navigationPending) return;
    revealWorkspaceShell();
    root.removeAttribute('data-ft-transition');
    root.removeAttribute('aria-busy');
    renderDecisionSidebar();
  }

  function runWorkspaceTransitionRefresh(transitionId, options = {}) {
    const task = refresh({
      ...options,
      workspaceTransitionId: transitionId,
    });
    activeWorkspaceTransitionPromise = task;
    return task.finally(() => {
      if (activeWorkspaceTransitionPromise === task) {
        activeWorkspaceTransitionPromise = null;
      }
      endWorkspaceTransition(transitionId);
    });
  }

  function handoffMarketNavigation(destination, options = {}) {
    const method = options.replace === true ? 'replace' : 'assign';
    if (!destination || typeof runtime.location?.[method] !== 'function') return false;
    const transitionId = beginWorkspaceTransition();
    state.navigationPending = true;
    const navigate = () => {
      if (
        state.destroyed
        || transitionId !== workspaceTransitionId
        || !state.navigationPending
      ) return;
      try {
        runtime.location[method](destination);
      } catch (error) {
        if (transitionId === workspaceTransitionId) {
          state.navigationPending = false;
          endWorkspaceTransition(transitionId);
        }
        throw error;
      }
    };
    if (
      options.afterPaint === true
      && typeof runtime.requestAnimationFrame === 'function'
    ) {
      runtime.requestAnimationFrame(() => {
        runtime.setTimeout(navigate, 0);
      });
    } else {
      navigate();
    }
    return true;
  }

  root.dataset.theme = state.theme;
  root.dataset.ftMode = hostMode;
  root.setAttribute('data-01r-theme-scope', '');
  root.setAttribute('data-navgator-app', 'decision-markets');
  const initialTransitionId = beginWorkspaceTransition();
  root.innerHTML = `
    <div
      class="ft-shell"
      data-ft-role="terminal"
      style="visibility: hidden"
      aria-hidden="true"
    >
      <header class="ft-header">
        <div class="ft-header-inner">
          <a class="ft-brand" href="/?token=solo&view=markets&tab=tokens" aria-label="01RX market home">
            <span class="ft-brand-mark" aria-hidden="true"><img src="/logos/01rx.png?v=5" alt=""></span>
            <span class="ft-brand-copy">
              <strong>01RX</strong>
              <span>Ownership + decision markets</span>
            </span>
          </a>

          <div class="ft-header-network" title="Onchain proposal data is read from Solana mainnet">
            <span class="ft-live-dot" aria-hidden="true"></span>
            <span>Solana mainnet</span>
            <strong>LIVE</strong>
          </div>

          <div class="ft-header-actions">
            <span class="ft-header-updated" data-ft-region="header-updated">Connecting…</span>
            <button class="ft-icon-button" type="button" data-ft-action="toggle-theme" aria-label="Toggle color theme" title="Toggle color theme">
              <span aria-hidden="true">◐</span>
            </button>
            <div class="ft-wallet-control" data-ft-role="wallet-status">
              <button class="ft-wallet-button" type="button" data-ft-action="connect-wallet">Connect wallet</button>
            </div>
          </div>
        </div>
      </header>

      <div class="ft-system-bar">
        <div class="ft-system-message" data-ft-role="status" role="status" aria-live="polite">Loading validated proposal markets…</div>
        <div class="ft-system-meta">
          <span>RPC <strong data-ft-region="rpc-status">CONNECTING</strong></span>
          <span>PROGRAMS <strong data-ft-region="program-status">CHECKING</strong></span>
          <span>SLOT <strong data-ft-region="slot">—</strong></span>
        </div>
      </div>

      <main class="ft-main">
        <section class="ft-terminal-grid">
          <aside class="ft-market-rail" aria-labelledby="${uid}-market-list-title">
            <div class="ft-rail-header">
              <div>
                <span class="ft-kicker">Futarchy governance</span>
                <h1 id="${uid}-market-list-title" data-ft-region="market-list-title">Decision markets</h1>
              </div>
              <span class="ft-count" data-ft-role="market-count">0</span>
            </div>

            <label class="ft-search">
              <span class="ft-search-icon" aria-hidden="true">⌕</span>
              <span class="ft-sr-only">Search governance proposals</span>
              <input
                type="search"
                data-ft-role="search"
                placeholder="Title, token, or address"
                autocomplete="off"
                spellcheck="false"
              >
              <kbd>⌘K</kbd>
            </label>

            <div
              class="ft-filter-row"
              data-ft-role="status-filters"
              role="group"
              aria-label="Filter proposals by status"
            ></div>

            <div class="ft-market-list" data-ft-role="market-list" aria-live="polite"></div>
            <div class="ft-pagination" data-ft-role="proposal-pagination"></div>

            <div class="ft-rail-source">
              <span>Proposal index + validated live and resolved observations</span>
              <a href="/methodology.html">Methodology</a>
            </div>
          </aside>

          <section
            class="ft-market-chart-header-region"
            data-ft-region="market-chart-header"
            aria-live="polite"
          ></section>

          <section class="ft-market-chart" data-ft-region="market-chart" aria-live="polite"></section>

          <section
            class="ft-account-row"
            data-ft-region="ownership-account"
            aria-live="polite"
          ></section>

          <section class="ft-market-stage" data-ft-region="market-stage" aria-live="polite"></section>

          <aside class="ft-ticket-column" data-ft-role="trade-ticket" aria-label="Trade intent and positions">
            <div data-ft-region="trade-ticket"></div>
          </aside>
          <section class="ft-activity-row" data-ft-role="positions" aria-label="Orders and recent trades"></section>
        </section>
      </main>

      <footer class="ft-footer">
        <span>Decision-market execution is experimental. Verify every wallet transaction.</span>
        <nav aria-label="Terminal links">
          <a href="/?token=solo&view=markets&tab=tokens">Market home</a>
        </nav>
      </footer>
      <div class="ft-modal-region" data-ft-region="modal"></div>
    </div>
  `;

  const regions = {
    headerUpdated: root.querySelector('[data-ft-region="header-updated"]'),
    status: root.querySelector('[data-ft-role="status"]'),
    rpcStatus: root.querySelector('[data-ft-region="rpc-status"]'),
    programStatus: root.querySelector('[data-ft-region="program-status"]'),
    slot: root.querySelector('[data-ft-region="slot"]'),
    marketListTitle: root.querySelector('[data-ft-region="market-list-title"]'),
    marketCount: root.querySelector('[data-ft-role="market-count"]'),
    statusFilters: root.querySelector('[data-ft-role="status-filters"]'),
    marketList: root.querySelector('[data-ft-role="market-list"]'),
    pagination: root.querySelector('[data-ft-role="proposal-pagination"]'),
    marketChartHeader: root.querySelector('[data-ft-region="market-chart-header"]'),
    marketChart: root.querySelector('[data-ft-region="market-chart"]'),
    ownershipAccount: root.querySelector('[data-ft-region="ownership-account"]'),
    marketStage: root.querySelector('[data-ft-region="market-stage"]'),
    tradeTicket: root.querySelector('[data-ft-region="trade-ticket"]'),
    positions: root.querySelector('[data-ft-role="positions"]'),
    modal: root.querySelector('[data-ft-region="modal"]'),
    walletStatus: root.querySelector('[data-ft-role="wallet-status"]'),
    search: root.querySelector('[data-ft-role="search"]'),
  };
  const walletHeaderSlot = hostMode === 'token'
    ? runtime.document.querySelector?.('[data-01rx-market-wallet-slot]')
    : null;
  const walletStatusPortaled = Boolean(walletHeaderSlot && regions.walletStatus);
  if (walletStatusPortaled) {
    walletHeaderSlot.dataset.theme = state.theme;
    walletHeaderSlot.replaceChildren(regions.walletStatus);
  }

  function globalMarketsUrl(options = {}) {
    if (typeof routes.marketDiscoveryUrl === 'function') {
      return routes.marketDiscoveryUrl(options);
    }
    const params = new runtime.URLSearchParams({ view: 'markets' });
    if (options.filter) params.set('filter', options.filter);
    if (options.proposal) params.set('proposal', options.proposal);
    return `/?${params.toString()}`;
  }

  function tokenMarketsUrl(tokenKey, proposalId = '') {
    if (typeof routes.tokenMarketUrl === 'function') {
      return routes.tokenMarketUrl(tokenKey, proposalId);
    }
    const params = new runtime.URLSearchParams({
      token: normalizeKey(tokenKey),
      view: 'markets',
    });
    if (safeBase58(proposalId)) params.set('proposal', proposalId);
    return `/?${params.toString()}`;
  }

  function ownershipChartFrameUrl(tokenKey) {
    const params = new runtime.URLSearchParams({
      token: normalizeKey(tokenKey),
      frame: '01rx',
    });
    return `/?${params.toString()}`;
  }

  function isOwnershipWorkspace() {
    return state.hostMode === 'token'
      && state.workspaceTab === 'tokens'
      && Boolean(state.tokenFilter);
  }

  function normalizeOwnershipRecentTransactions(nav) {
    const source = [
      nav.recentTrades,
      nav.recentTransactions,
      nav.trades,
      nav.transactions,
      nav.dexTrades,
    ].find(Array.isArray) || [];
    return source
      .map((row) => {
        if (!isObject(row)) return null;
        const direction = firstText(
          row.side,
          row.direction,
          row.tradeSide,
          row.type,
        ).toLowerCase();
        const rawTime = row.blockTime
          ?? row.timestamp
          ?? row.time
          ?? row.createdAt
          ?? row.observedAt;
        const numericTime = Number(rawTime);
        const time = Number.isFinite(numericTime) && numericTime > 0
          ? isoTimestamp(numericTime < 1_000_000_000_000 ? numericTime * 1_000 : numericTime)
          : isoTimestamp(rawTime);
        return {
          side: direction.includes('sell')
            ? 'sell'
            : direction.includes('buy')
              ? 'buy'
              : 'neutral',
          price: firstNumber(row.price, row.priceUsd, row.usdPrice, row.spot),
          size: firstNumber(
            row.size,
            row.baseAmount,
            row.tokenAmount,
            row.amount,
            row.amountOut,
          ),
          valueUsd: firstNumber(
            row.valueUsd,
            row.volumeUsd,
            row.quoteAmount,
            row.usdAmount,
          ),
          trader: firstText(row.trader, row.wallet, row.owner, row.taker),
          signature: safeSignature(
            row.signature || row.txSignature || row.transactionSignature,
          ),
          time,
        };
      })
      .filter(row => (
        row
        && (
          Number.isFinite(row.price)
          || Number.isFinite(row.size)
          || Number.isFinite(row.valueUsd)
        )
      ))
      .sort((left, right) => right.time.localeCompare(left.time))
      .slice(0, 40);
  }

  function ownershipTokenSnapshot() {
    const tokenKey = state.tokenFilter;
    const nav = state.navMap.get(tokenKey) || {};
    const relatedMarket = state.sidebarMarkets.find(market => market.token === tokenKey)
      || state.markets.find(market => market.token === tokenKey)
      || {};
    const ticker = firstText(
      nav.ticker,
      nav.config?.ticker,
      relatedMarket.ticker,
      tokenKey.toUpperCase(),
    ).toUpperCase();
    const name = firstText(
      nav.name,
      nav.config?.name,
      relatedMarket.name,
      ticker,
    );
    const spot = firstNumber(
      nav.spot,
      nav.price,
      nav.currentPrice,
      nav.navSnapshot?.market?.spot,
      relatedMarket.nav?.spot,
    );
    const effectiveSupply = firstNumber(
      nav.effectiveSupply,
      nav.effective_supply,
      nav.navSnapshot?.supply?.effective,
    );
    const treasury = firstNumber(
      nav.treasuryUSDC,
      nav.treasuryUsd,
      nav.treasury,
      nav.navSnapshot?.treasuryUSDC,
      relatedMarket.nav?.treasury,
    );
    const navPerToken = firstNumber(
      nav.nav,
      nav.strike,
      nav.currentNav,
      nav.navPerToken,
      nav.navSnapshot?.navPerToken,
      Number.isFinite(treasury) && Number.isFinite(effectiveSupply) && effectiveSupply > 0
        ? treasury / effectiveSupply
        : null,
      relatedMarket.nav?.nav,
    );
    const premiumPct = Number.isFinite(spot)
      && Number.isFinite(navPerToken)
      && navPerToken > 0
      ? ((spot - navPerToken) / navPerToken) * 100
      : null;
    const marketCap = firstNumber(
      nav.marketCap,
      nav.marketCapUsd,
      nav.mcap,
      nav.navSnapshot?.market?.marketCap,
      Number.isFinite(spot) && Number.isFinite(effectiveSupply)
        ? spot * effectiveSupply
        : null,
    );
    const mint = firstText(
      nav.mint,
      nav.tokenMint,
      nav.token_mint,
      nav.mintAddress,
      nav.mint_address,
      nav.contractAddress,
      nav.contract_address,
      nav.config?.mint,
      nav.config?.mintAddress,
      relatedMarket.mint,
    );
    return {
      token: tokenKey,
      ticker,
      name,
      logo: firstText(nav.logo, nav.config?.logo, relatedMarket.logo),
      mint,
      spot,
      nav: navPerToken,
      premiumPct,
      change24h: firstNumber(nav.change24h, nav.change_24h),
      marketCap,
      treasury,
      volume24h: firstNumber(
        nav.volume24hUsd,
        nav.volume24h,
        nav.daoVolume24h,
      ),
      liquidityUsd: firstNumber(nav.liquidityUsd, relatedMarket.liquidityUsd),
      recentTransactions: normalizeOwnershipRecentTransactions(nav),
    };
  }

  function ownershipOrderOutput(asset = ownershipTokenSnapshot()) {
    const routedOutput = firstNumber(
      state.ownershipOrder.quote?.quote?.estimatedAmountOut,
    );
    if (Number.isFinite(routedOutput) && routedOutput > 0) return routedOutput;
    const amount = firstNumber(state.ownershipOrder.amount);
    const spot = firstNumber(asset?.spot);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(spot) || spot <= 0) {
      return null;
    }
    return state.ownershipOrder.side === 'sell'
      ? amount * spot
      : amount / spot;
  }

  function invalidateOwnershipQuote() {
    state.ownershipOrder.quoteRequestId += 1;
    state.ownershipOrder.quoteAbortController?.abort();
    state.ownershipOrder.quoteAbortController = null;
    if (state.ownershipOrder.quoteTimer) {
      runtime.clearTimeout(state.ownershipOrder.quoteTimer);
      state.ownershipOrder.quoteTimer = null;
    }
    state.ownershipOrder.quote = null;
    state.ownershipOrder.quoteLoading = false;
    state.ownershipOrder.quoteError = '';
  }

  async function loadOwnershipQuote() {
    if (
      state.destroyed
      || !isOwnershipWorkspace()
      || state.ownershipOrder.type !== 'market'
      || !(firstNumber(state.ownershipOrder.amount) > 0)
    ) {
      invalidateOwnershipQuote();
      return null;
    }
    const requestId = ++state.ownershipOrder.quoteRequestId;
    state.ownershipOrder.quoteAbortController?.abort();
    state.ownershipOrder.quoteAbortController = typeof runtime.AbortController === 'function'
      ? new runtime.AbortController()
      : null;
    state.ownershipOrder.quoteLoading = true;
    state.ownershipOrder.quoteError = '';
    const request = {
      token: state.tokenFilter,
      side: state.ownershipOrder.side,
      amount: state.ownershipOrder.amount,
      slippageBps: state.ownershipOrder.slippageBps,
      ...(state.wallet.address ? { owner: state.wallet.address } : {}),
    };
    try {
      const payload = await client.trading.spotOrder(request, {
        signal: state.ownershipOrder.quoteAbortController?.signal,
        timeoutMs: 20_000,
      });
      if (state.destroyed || requestId !== state.ownershipOrder.quoteRequestId) return null;
      if (
        payload?.token !== request.token
        || payload?.side !== request.side
        || (request.owner && payload?.owner !== request.owner)
      ) {
        throw new Error('Ownership route did not match the current order');
      }
      state.ownershipOrder.quote = payload;
      state.ownershipOrder.quoteError = '';
      return payload;
    } catch (error) {
      if (
        state.destroyed
        || requestId !== state.ownershipOrder.quoteRequestId
        || error?.name === 'AbortError'
      ) return null;
      state.ownershipOrder.quote = null;
      state.ownershipOrder.quoteError = error?.status === 422
        ? 'No executable route is available for this amount.'
        : error?.status === 503
          ? 'Spot routing is temporarily unavailable.'
          : error?.message || 'Could not prepare a spot route.';
      return null;
    } finally {
      if (!state.destroyed && requestId === state.ownershipOrder.quoteRequestId) {
        state.ownershipOrder.quoteLoading = false;
        state.ownershipOrder.quoteAbortController = null;
        renderTradeTicket();
      }
    }
  }

  function scheduleOwnershipQuote(delayMs = 300) {
    state.ownershipOrder.quoteRequestId += 1;
    state.ownershipOrder.quoteAbortController?.abort();
    state.ownershipOrder.quoteAbortController = null;
    if (state.ownershipOrder.quoteTimer) {
      runtime.clearTimeout(state.ownershipOrder.quoteTimer);
      state.ownershipOrder.quoteTimer = null;
    }
    state.ownershipOrder.quote = null;
    state.ownershipOrder.quoteError = '';
    state.ownershipOrder.quoteLoading = (
      isOwnershipWorkspace()
      && state.ownershipOrder.type === 'market'
      && firstNumber(state.ownershipOrder.amount) > 0
    );
    if (!state.ownershipOrder.quoteLoading) return;
    state.ownershipOrder.quoteTimer = runtime.setTimeout(() => {
      state.ownershipOrder.quoteTimer = null;
      loadOwnershipQuote();
    }, Math.max(0, delayMs));
  }

  function syncCanonicalUrl(destination) {
    if (state.hostMode !== 'token' || !destination) return;
    const canonical = runtime.document.querySelector('link[rel="canonical"]');
    if (!canonical) return;
    try {
      canonical.setAttribute('href', new runtime.URL(destination, runtime.location.origin).href);
    } catch (_) {
      // A restricted document can still navigate without mutable metadata.
    }
  }

  function marketMatchesToken(market) {
    return !state.tokenFilter || market?.token === state.tokenFilter;
  }

  function selectedMarket() {
    return state.markets.find(market => market.id === state.selectedId) || state.markets[0] || null;
  }

  function statusCounts() {
    const loaded = state.markets.reduce((counts, market) => {
      const status = market.proposal.statusGroup || 'other';
      counts.all += 1;
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {
      all: 0,
      live: 0,
      resolved: 0,
      history: 0,
      passed: 0,
      failed: 0,
      other: 0,
      indexed: 0,
    });
    loaded.history = Math.max(0, loaded.all - loaded.live);
    loaded.resolved = loaded.passed + loaded.failed;
    loaded.indexed = loaded.other;
    return loaded;
  }

  function filteredMarkets() {
    const query = state.query.trim().toLowerCase();
    return state.markets.filter((market) => {
      if (!marketMatchesToken(market)) return false;
      if (query && !market.searchText.includes(query)) return false;
      if (state.filter === 'resolved') {
        return market.proposal.statusGroup === 'passed'
          || market.proposal.statusGroup === 'failed';
      }
      if (state.filter === 'indexed') return market.proposal.statusGroup === 'other';
      if (state.filter !== 'all' && market.proposal.statusGroup !== state.filter) return false;
      return true;
    });
  }

  function destroyHourlyChart() {
    if (!state.historyChart) return;
    try {
      state.historyChart.destroy?.();
    } catch (_) {
      // Navigation should remain usable if the canvas was already detached.
    }
    state.historyChart = null;
  }

  function showHourlyChartMountError(chartRoot) {
    if (!chartRoot) return;
    chartRoot.classList.remove('ft-hourly-chart-pending', 'ft-hourly-chart-enhanced');
    chartRoot.classList.add('ft-hourly-chart-failed');
    chartRoot.dataset.ftChartState = 'error';
    chartRoot.setAttribute('aria-busy', 'false');
    const status = chartRoot.querySelector(
      '[data-ft-role="proposal-chart-mount-status"]',
    );
    if (!status) return;
    status.classList.add('ft-hourly-chart-mount-error');
    status.innerHTML = `
      <span aria-hidden="true">!</span>
      <div>
        <strong>Proposal chart unavailable</strong>
        <p>The indexed history remains available, but the interactive chart could not be initialized.</p>
      </div>
    `;
  }

  function mountHourlyChart(market = selectedMarket()) {
    const chartRoot = regions.marketChart.querySelector(
      '[data-ft-role="proposal-history-chart"]',
    );
    if (!market?.id || state.destroyed) return;
    const history = state.historyByProposal.get(market.id)?.data;
    const container = regions.marketChart.querySelector(
      '[data-ft-role="proposal-history-tradingview"]',
    );
    if (!history?.series?.length) {
      return;
    }
    if (typeof createProposalHistoryChart !== 'function') {
      showHourlyChartMountError(chartRoot);
      return;
    }
    if (!container) {
      showHourlyChartMountError(chartRoot);
      return;
    }
    try {
      state.historyChart = createProposalHistoryChart({
        runtime,
        themeRoot: root,
        container,
        history,
        ticker: market.ticker,
        theme: state.theme,
        visibility: state.historySeriesVisibility,
        range: state.historyRange,
        launchedAt: market.proposal.createdAt,
        windowEndedAt: market.proposal.endsAt,
        isLive: market.proposal.statusGroup === 'live',
      }) || null;
      if (!state.historyChart) {
        showHourlyChartMountError(chartRoot);
        return;
      }
      updateProposalChartLivePoint(market);
      chartRoot?.classList.remove('ft-hourly-chart-pending', 'ft-hourly-chart-failed');
      if (chartRoot) {
        chartRoot.dataset.ftChartState = 'ready';
        chartRoot.setAttribute('aria-busy', 'false');
      }
    } catch (_) {
      state.historyChart = null;
      showHourlyChartMountError(chartRoot);
    }
  }

  function renderOwnershipChartHeader(asset) {
    const metric = ({
      key,
      label,
      value,
      tone = 'neutral',
      featured = false,
    }) => `
      <div
        class="ft-chart-market-metric${featured ? ' ft-chart-market-metric-featured' : ''}"
        data-ft-chart-header-metric="${escapeHtml(key)}"
        data-tone="${escapeHtml(tone)}"
      >
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
    const spreadLabel = Number(asset.premiumPct) > 0 ? 'Premium' : 'Discount';
    const spreadTone = Number.isFinite(asset.premiumPct)
      ? asset.premiumPct > 0
        ? 'negative'
        : asset.premiumPct < 0
          ? 'positive'
          : 'neutral'
      : 'muted';
    const identityMeta = asset.mint
      ? asset.mint.length > 14
        ? `${asset.mint.slice(0, 6)}…${asset.mint.slice(-4)}`
        : asset.mint
      : '';
    const watchlist = runtime.NAVGATOR?.shell?.watchlist;
    const watched = watchlist?.has?.(asset.token) === true;

    return `
      <header class="ft-chart-market-header ft-ownership-chart-header" data-ft-role="ownership-chart-header">
        <div class="ft-chart-market-identity">
          <button
            class="ft-chart-market-watchlist"
            type="button"
            data-ft-action="toggle-ownership-watchlist"
            data-ft-token="${escapeHtml(asset.token)}"
            aria-label="${watched ? 'Remove' : 'Add'} ${escapeHtml(asset.ticker)} ${watched ? 'from' : 'to'} watchlist"
            aria-pressed="${String(watched)}"
            title="${watched ? 'Remove from watchlist' : 'Add to watchlist'}"
          >
            <svg viewBox="0 0 20 19" aria-hidden="true">
              <path d="m10 1.5 2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.77 4.8 17.5l.99-5.79-4.21-4.1 5.82-.85L10 1.5Z"/>
            </svg>
          </button>
          ${renderLogo(asset, 'large')}
          <div>
            <p><strong>${escapeHtml(asset.ticker)}</strong></p>
            ${identityMeta
              ? `<small title="${escapeHtml(asset.mint)}">${escapeHtml(identityMeta)}</small>`
              : ''}
          </div>
        </div>
        ${metric({
          key: 'price',
          label: 'Price',
          value: formatChartCurrency(asset.spot),
          featured: true,
        })}
        ${metric({
          key: 'nav',
          label: 'NAV',
          value: formatChartCurrency(asset.nav),
          tone: 'warning',
        })}
        ${metric({
          key: 'premium',
          label: spreadLabel,
          value: Number.isFinite(asset.premiumPct)
            ? formatPercent(Math.abs(asset.premiumPct), { sign: false })
            : '—',
          tone: spreadTone,
        })}
        ${metric({
          key: 'market-cap',
          label: 'Market cap',
          value: formatCompactMoney(asset.marketCap),
        })}
        ${metric({
          key: 'treasury',
          label: 'Treasury',
          value: formatCompactMoney(asset.treasury),
        })}
        ${metric({
          key: 'liquidity',
          label: 'Liquidity',
          value: formatCompactMoney(asset.liquidityUsd),
        })}
      </header>
    `;
  }

  function renderProposalChartHeader(market, history = null) {
    const latest = Array.isArray(history?.series) && history.series.length
      ? history.series[history.series.length - 1]
      : {};
    const live = market.proposal.statusGroup === 'live';
    const price = live
      ? firstNumber(market.spot.price, market.nav.spot, latest.underlyingPrice)
      : firstNumber(latest.underlyingPrice, market.spot.price, market.nav.spot);
    const passPrice = live
      ? firstNumber(market.pass.price, latest.passPrice)
      : firstNumber(latest.passPrice, market.pass.price);
    const failPrice = live
      ? firstNumber(market.fail.price, latest.failPrice)
      : firstNumber(latest.failPrice, market.fail.price);
    const displayStatus = proposalDisplayStatus(market.proposal);
    const result = market.proposal.statusGroup === 'passed'
      ? { label: 'Passed', tone: 'positive' }
      : market.proposal.statusGroup === 'failed'
        ? { label: 'Failed', tone: 'negative' }
        : market.decision.passing === true
          ? { label: 'Passing', tone: 'positive' }
          : market.decision.passing === false
            ? { label: 'Failing', tone: 'negative' }
            : { label: 'Pending', tone: 'muted' };
    const proposalNumber = market.proposal.number == null
      ? 'Proposal'
      : `Proposal #${Math.round(market.proposal.number)}`;
    const metric = ({
      key,
      label,
      value,
      tone = 'neutral',
      featured = false,
    }) => `
      <div
        class="ft-chart-market-metric${featured ? ' ft-chart-market-metric-featured' : ''}"
        data-ft-chart-header-metric="${escapeHtml(key)}"
        data-tone="${escapeHtml(tone)}"
      >
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;

    return `
      <header class="ft-chart-market-header" data-ft-role="proposal-chart-header">
        <div class="ft-chart-market-identity">
          ${market.token ? `
            <button
              class="ft-chart-market-watchlist"
              type="button"
              data-ft-action="toggle-ownership-watchlist"
              data-ft-token="${escapeHtml(market.token)}"
              aria-label="Toggle ${escapeHtml(market.ticker)} watchlist"
              aria-pressed="${String(runtime.NAVGATOR?.shell?.watchlist?.has?.(market.token) === true)}"
              title="Toggle watchlist"
            >
              <svg viewBox="0 0 20 19" aria-hidden="true">
                <path d="m10 1.5 2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.77 4.8 17.5l.99-5.79-4.21-4.1 5.82-.85L10 1.5Z"/>
              </svg>
            </button>
          ` : ''}
          ${renderLogo(market, 'large')}
          <div>
            <p><strong>${escapeHtml(market.ticker)}</strong></p>
            <small>${escapeHtml(proposalNumber)}</small>
          </div>
        </div>
        ${metric({
          key: 'price',
          label: 'Price',
          value: formatChartCurrency(price),
          featured: true,
        })}
        ${metric({
          key: 'pass',
          label: 'Pass',
          value: formatChartCurrency(passPrice),
          tone: 'positive',
        })}
        ${metric({
          key: 'fail',
          label: 'Fail',
          value: formatChartCurrency(failPrice),
          tone: 'negative',
        })}
        ${metric({
          key: 'threshold',
          label: 'Threshold',
          value: formatThresholdPercent(market.thresholdPct),
          tone: 'warning',
        })}
        ${metric({
          key: 'status',
          label: 'Status',
          value: displayStatus.label,
        })}
        ${metric({
          key: 'result',
          label: 'Result',
          value: result.label,
          tone: result.tone,
        })}
      </header>
    `;
  }

  function renderHourlyHistoryPanel(market, options = {}) {
    const entry = state.historyByProposal.get(market.id);
    const chartHeader = history => (
      options.includeHeader === false
        ? ''
        : renderProposalChartHeader(market, history)
    );
    if (!entry || (entry.loading && !entry.data?.series?.length)) {
      return `
        <section class="ft-hourly-panel ft-terminal-chart-panel" data-ft-role="proposal-history" aria-label="Proposal market chart" aria-live="polite">
          ${chartHeader()}
          ${renderProposalChartStatusShell()}
        </section>
      `;
    }

    if (entry.error) {
      return `
        <section class="ft-hourly-panel ft-terminal-chart-panel" data-ft-role="proposal-history" aria-label="Proposal market chart" aria-live="polite">
          ${chartHeader()}
          <div class="ft-hourly-empty ft-hourly-error" role="status">
            <span aria-hidden="true">↻</span>
            <div>
              <strong>Market history could not be loaded</strong>
              <p>${escapeHtml(entry.error)}</p>
              <button type="button" data-ft-action="retry-hourly-history">Try again</button>
            </div>
          </div>
        </section>
      `;
    }

    const history = entry.data;
    if (!history?.series?.length) {
      return `
        <section class="ft-hourly-panel ft-terminal-chart-panel" data-ft-role="proposal-history" aria-label="Proposal market chart" aria-live="polite">
          ${chartHeader()}
          <div class="ft-hourly-empty">
            <span aria-hidden="true">∅</span>
            <div>
              <strong>No market history is indexed for this proposal</strong>
              <p>The governance record remains available. No underlying, PROP PASS, or PROP FAIL values are synthesized.</p>
            </div>
          </div>
        </section>
      `;
    }

    const pointCount = history.series.length;
    const coverage = history.summary?.coverage || {};
    const partialCoverage = [
      [`${market.ticker} price`, coverage.underlying || 0],
      ['PROP PASS', coverage.pass || 0],
      ['PROP FAIL', coverage.fail || 0],
    ].filter(([, count]) => count < pointCount);
    const interval = normalizeHistoryInterval(history.interval);
    const cadenceLabel = historyCadenceLabel(interval);

    return `
      <section class="ft-hourly-panel ft-terminal-chart-panel" data-ft-role="proposal-history" aria-label="Proposal market chart">
        ${chartHeader(history)}
        ${renderHourlyPriceChart(history, market.ticker, {
          range: state.historyRange,
          visibility: state.historySeriesVisibility,
          launchedAt: market.proposal.createdAt,
          windowEndedAt: market.proposal.endsAt,
        })}
        ${partialCoverage.length ? `
          <p class="ft-hourly-coverage-note">
            Partial coverage: ${partialCoverage.map(([label, count]) => (
              `${escapeHtml(label)} ${Number(count).toLocaleString('en-US')} / ${pointCount.toLocaleString('en-US')} observations`
            )).join(' · ')}. Missing values remain gaps.
          </p>
        ` : ''}
        ${pointCount === 1 ? `<p class="ft-hourly-coverage-note">One retained ${escapeHtml(cadenceLabel)} observation is shown as a point, not a trend.</p>` : ''}
      </section>
    `;
  }

  function renderHeader() {
    root.dataset.theme = state.theme;
    if (walletHeaderSlot) walletHeaderSlot.dataset.theme = state.theme;
    state.historyChart?.applyTheme?.(state.theme);
    const ownershipWorkspace = isOwnershipWorkspace();
    const market = ownershipWorkspace ? null : selectedMarket();
    const isArchive = market && market.proposal.statusGroup !== 'live';
    root.classList.toggle(
      'ft-header-collapsed',
      state.hostMode === 'token' && Boolean(isArchive || ownershipWorkspace),
    );

    if (state.hostMode === 'discovery') {
      regions.walletStatus.innerHTML = '';
    } else if (state.wallet.connecting) {
      regions.walletStatus.innerHTML = `
        <button class="ft-wallet-button" type="button" disabled aria-busy="true">Connecting…</button>
      `;
    } else if (state.wallet.address) {
      regions.walletStatus.innerHTML = `
        <button
          class="ft-wallet-button ft-wallet-button-connected"
          type="button"
          data-ft-action="disconnect-wallet"
          title="Disconnect ${escapeHtml(state.wallet.name || 'wallet')}"
        >
          <span class="ft-wallet-dot" aria-hidden="true"></span>
          ${escapeHtml(shortenAddress(state.wallet.address, 4))}
        </button>
      `;
    } else {
      regions.walletStatus.innerHTML = `
        <button
          class="ft-wallet-button"
          type="button"
          data-ft-action="connect-wallet"
          title="Proposal data is public. Connect only to view balances or trade."
        >Connect wallet</button>
      `;
    }
  }

  function renderSystemStatus() {
    const counts = statusCounts();
    const resolvedCount = counts.resolved;
    const indexedCopy = counts.indexed
      ? ` · ${counts.indexed} indexed record${counts.indexed === 1 ? '' : 's'}`
      : '';
    const coverageCopy = `${counts.live} live · ${resolvedCount} resolved${indexedCopy}`;
    let message = '';
    let kind = 'live';
    if (state.error && !state.markets.length) {
      kind = 'error';
      message = state.error;
    } else if (state.loading && !state.markets.length) {
      kind = 'loading';
      message = 'Loading validated proposal markets…';
    } else if (state.routeNotice) {
      kind = 'notice';
      message = state.routeNotice;
    } else if (state.notice) {
      kind = 'notice';
      message = state.notice;
    } else if (state.liveError || state.archiveError) {
      kind = 'warning';
      if (state.liveError && state.archiveError) {
        message = 'Live market reads and proposal history are temporarily degraded.';
      } else if (state.liveError) {
        message = `${resolvedCount} resolved proposal${resolvedCount === 1 ? '' : 's'} available · live market reads are temporarily unavailable.`;
      } else {
        message = `${counts.live} live proposal${counts.live === 1 ? '' : 's'} available · proposal history is temporarily unavailable.`;
      }
    } else if (
      state.hostMode !== 'discovery'
      && !state.loading
      && state.programIntegrity.status !== 'verified'
    ) {
      kind = 'warning';
      message = `${programIntegrityPauseMessage(state.programIntegrity)} Proposal data remains available.`;
    } else if (state.degraded?.active) {
      const critical = hasCriticalTerminalDegradation(state.degraded);
      kind = critical ? 'warning' : 'notice';
      message = critical
        ? `${coverageCopy}. Some validated market or proposal data is unavailable.`
        : `${coverageCopy}. Archive coverage is partial because some lifecycle or snapshot metadata is incomplete; live RPC remains confirmed.`;
    } else if (state.markets.length) {
      message = `${coverageCopy} · 15-minute prices load per proposal · refreshed ${formatRelativeTime(state.asOf)}`;
    } else {
      kind = 'empty';
      message = 'No indexed governance proposals are available right now.';
    }
    regions.status.className = `ft-system-message ft-system-message-${kind}`;
    regions.status.textContent = message;
    const rpcOffline = (state.error && !state.markets.length) || state.liveError;
    const rpcDegraded = hasFutarchyRpcDegradation(state.degraded);
    regions.rpcStatus.textContent = state.hostMode === 'discovery'
      ? state.loading
        ? 'CONNECTING'
        : rpcOffline
          ? 'OFFLINE'
          : 'CONFIRMED'
      : rpcOffline
      ? 'OFFLINE'
      : state.loading
        ? 'CONNECTING'
        : rpcDegraded
          ? 'DEGRADED'
          : 'CONFIRMED';
    regions.rpcStatus.dataset.state = rpcOffline
      ? 'error'
      : rpcDegraded
        ? 'warning'
        : state.loading
          ? 'loading'
          : 'live';
    const programState = state.programIntegrity.status;
    regions.programStatus.textContent = state.loading || programState === 'checking'
      ? 'CHECKING'
      : state.hostMode === 'discovery'
        ? 'READ ONLY'
      : programState === 'verified' && state.programIntegrity.canTransact
        ? 'VERIFIED'
        : programState === 'blocked'
          ? 'BLOCKED'
          : 'UNCHECKED';
    regions.programStatus.dataset.state = state.loading || programState === 'checking'
      ? 'loading'
      : programState === 'verified' && state.programIntegrity.canTransact
        ? 'live'
        : programState === 'blocked'
          ? 'error'
          : 'warning';
    regions.programStatus.title = state.programIntegrity.checkedAt
      ? `ProgramData checked ${formatDateTime(state.programIntegrity.checkedAt)}`
      : 'ProgramData has not been verified for transaction execution';
    regions.slot.textContent = Number.isFinite(state.slot)
      ? Math.round(state.slot).toLocaleString('en-US')
      : '—';
    regions.headerUpdated.textContent = state.asOf
      ? `Updated ${formatRelativeTime(state.asOf)}`
      : state.loading
        ? 'Connecting…'
        : 'Awaiting data';
  }

  function renderDecisionSidebar() {
    const list = runtime.document.getElementById('tlp-decisions-list');
    if (!list) return;
    const section = runtime.document.getElementById('tlp-decisions-panel');
    const count = runtime.document.getElementById('tp-live-decision-count');
    const pastSection = runtime.document.getElementById('tlp-past-decisions-panel');
    const pastList = runtime.document.getElementById('tlp-past-decisions-list');
    const pastCount = runtime.document.getElementById('tp-past-decision-count');
    const pastTitle = runtime.document.getElementById('tp-past-decisions-title');
    const historyToggleSlot = runtime.document.getElementById(
      'tlp-decision-history-toggle-slot',
    );
    const liveMarkets = state.sidebarMarkets.filter(
      market => market.proposal.statusGroup === 'live',
    );
    const priorMarkets = state.sidebarMarkets
      .filter(market => (
        market.proposal.statusGroup === 'passed'
        || market.proposal.statusGroup === 'failed'
      ))
      .sort((left, right) => {
        const leftTime = Date.parse(
          left.proposal.resolvedAt || left.proposal.endsAt || left.proposal.createdAt || '',
        ) || 0;
        const rightTime = Date.parse(
          right.proposal.resolvedAt || right.proposal.endsAt || right.proposal.createdAt || '',
        ) || 0;
        return rightTime - leftTime;
      });
    const visiblePriorMarkets = state.tokenFilter
      ? priorMarkets.filter(market => market.token === state.tokenFilter)
      : priorMarkets;

    function renderSidebarMarket(market, isPrior = false) {
      const ticker = market.ticker || String(market.token || '').toUpperCase() || 'DAO';
      const proposalNumber = market.proposal.number == null
        ? (isPrior ? 'Proposal' : '')
        : isPrior
          ? `Proposal #${Math.round(market.proposal.number)}`
          : ` #${Math.round(market.proposal.number)}`;
      const destination = tokenMarketsUrl(market.token, market.id);
      const statusGroup = market.proposal.statusGroup;
      const trailingValue = isPrior
        ? (statusGroup === 'passed' ? 'Passed' : 'Failed')
        : formatThresholdPercent(market.thresholdPct);
      const trailingState = isPrior
        ? trailingValue.toLowerCase().replace(/\s+/g, '-')
        : 'threshold';
      const status = isPrior
        ? 'Closed'
        : `
          <span class="tp-decision-live-dot" aria-hidden="true"></span>
          <span>Live</span>
        `;
      return `
        <a
          class="tp-decision-item${isPrior ? ' tp-decision-prior tp-past-proposal-item' : ''}"
          href="${escapeHtml(destination)}"
          title="${escapeHtml(market.proposal.title)}"
          data-ft-proposal-id="${escapeHtml(market.id)}"
          data-ft-token="${escapeHtml(market.token || '')}"
          data-market-search-primary="${escapeHtml(ticker)}"
          data-market-search="${escapeHtml(`${ticker} ${market.token || ''} ${market.proposal.title || ''}`)}"
          ${isPrior ? 'data-decision-history-item="true"' : ''}
          ${market.id === selectedMarket()?.id ? 'aria-current="page"' : ''}
        >
          <span class="tp-decision-project">
            ${renderLogo(market, 'small')}
            <span class="tp-decision-copy">
              <strong>${escapeHtml(isPrior ? proposalNumber : `${ticker}${proposalNumber}`)}</strong>
              ${isPrior ? `<small>${escapeHtml(market.proposal.title)}</small>` : ''}
            </span>
          </span>
          <span class="tp-decision-state" data-state="${isPrior ? 'closed' : 'live'}">${status}</span>
          <span
            class="tp-decision-result${isPrior ? '' : ' tp-decision-threshold'}"
            data-result="${escapeHtml(trailingState)}"
          >${escapeHtml(trailingValue)}</span>
        </a>
      `;
    }

    if (count) count.textContent = `${liveMarkets.length} active`;
    if (section) section.hidden = false;
    runtime.document.documentElement.dataset.decisionHistory = state.sidebarHistoryOpen
      ? 'open'
      : 'closed';

    const activeHtml = liveMarkets.length
      ? liveMarkets.map(market => renderSidebarMarket(market)).join('')
      : `
        <div class="tp-decisions-empty">
          <strong>No active decision markets</strong>
          <span>There are no proposals currently trading.</span>
        </div>
      `;
    const historyToggle = visiblePriorMarkets.length
      ? `
        <button
          class="tp-decision-history-toggle"
          type="button"
          data-decision-sidebar-action="toggle-history"
          aria-expanded="${state.sidebarHistoryOpen}"
        >
          <span>${state.sidebarHistoryOpen ? 'Hide' : 'View'} prior decision markets</span>
          <span class="tp-decision-history-meta">
            <span>${visiblePriorMarkets.length}</span>
            <svg viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="m1 1 4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </button>
      `
      : '';
    const priorHtml = visiblePriorMarkets
      .map(market => renderSidebarMarket(market, true))
      .join('');

    if (historyToggleSlot) {
      list.innerHTML = activeHtml;
      historyToggleSlot.innerHTML = historyToggle;
    } else {
      list.innerHTML = activeHtml + historyToggle;
    }
    if (pastSection) pastSection.hidden = !state.sidebarHistoryOpen || !visiblePriorMarkets.length;
    if (pastList) {
      pastList.innerHTML = priorHtml || '<div class="tp-decisions-empty">0 past proposals</div>';
    }
    if (pastCount) pastCount.textContent = String(visiblePriorMarkets.length);
    if (pastTitle) {
      const ticker = firstText(
        state.navMap.get(state.tokenFilter)?.ticker,
        state.sidebarMarkets.find(market => market.token === state.tokenFilter)?.ticker,
        state.tokenFilter,
      ).toUpperCase();
      pastTitle.textContent = ticker ? `Past Proposals · ${ticker}` : 'Past Proposals';
    }
    runtime.applyMarketSidebarSearch?.();
  }

  function renderMarketList() {
    if (!root.hasAttribute('data-ft-transition')) renderDecisionSidebar();
    const counts = statusCounts();
    const filterDefinitions = [
      ['all', 'All'],
      ['live', 'Live'],
      ['resolved', 'Resolved'],
    ];
    if (counts.indexed > 0) {
      filterDefinitions.push(['indexed', 'Indexed']);
    }
    if (!filterDefinitions.some(([key]) => key === state.filter)) state.filter = 'all';
    const activeFilterLabel = filterDefinitions.find(([key]) => key === state.filter)?.[1] || 'All';
    regions.marketListTitle.textContent = state.filter === 'all'
      ? 'Decision markets'
      : state.filter === 'indexed'
        ? 'Indexed records'
        : `${activeFilterLabel} markets`;
    regions.statusFilters.innerHTML = filterDefinitions.map(([key, label]) => `
      <button
        class="ft-filter-button${state.filter === key ? ' ft-filter-active' : ''}"
        type="button"
        data-ft-action="filter"
        data-ft-filter="${key}"
        aria-pressed="${state.filter === key}"
      ><span>${label}</span><strong>${counts[key] || 0}</strong></button>
    `).join('');

    const visible = filteredMarkets();
    const total = firstNumber(state.proposalPagination.total, state.proposalSummary.total);
    const hasMorePages = Boolean(state.proposalPagination.nextCursor);
    regions.marketCount.textContent = String(visible.length);
    regions.marketCount.title = `${visible.length} proposals shown`;
    regions.pagination.innerHTML = hasMorePages
      ? `
        <div class="ft-pagination-status">
          <span>${state.markets.length}${Number.isFinite(total) ? ` of ${Math.round(total)}` : ''} current proposals loaded</span>
          <button
            type="button"
            data-ft-action="load-more-proposals"
            ${state.proposalPagination.loadingMore ? 'disabled aria-busy="true"' : ''}
          >${state.proposalPagination.loadingMore ? 'Loading…' : 'Load more'}</button>
        </div>
      `
      : '';

    if (!visible.length) {
      const copy = state.markets.length
        ? 'No proposals match this search and status.'
        : state.loading
          ? 'Reading indexed governance history and live markets…'
          : 'No indexed governance proposals.';
      regions.marketList.innerHTML = `
        <div class="ft-list-empty">
          <span aria-hidden="true">${state.loading ? '◌' : '◇'}</span>
          <strong>${escapeHtml(copy)}</strong>
          ${state.markets.length ? '<button type="button" data-ft-action="clear-search">Clear filters</button>' : ''}
        </div>
      `;
      return;
    }

    regions.marketList.innerHTML = visible.map((market) => {
      const active = market.id === selectedMarket()?.id;
      const isLive = market.proposal.statusGroup === 'live';
      const displayStatus = proposalDisplayStatus(market.proposal);
      const rowTag = state.hostMode === 'discovery' ? 'a' : 'button';
      const rowDestination = tokenMarketsUrl(market.token, market.id);
      const timing = isLive
        ? formatCountdown(market.proposal.endsAt)
        : market.proposal.resolvedAt
          ? `Closed ${formatRelativeTime(market.proposal.resolvedAt)}`
          : market.proposal.endsAt
            ? `Ended ${formatRelativeTime(market.proposal.endsAt)}`
            : market.proposal.createdAt
              ? `Indexed ${formatRelativeTime(market.proposal.createdAt)}`
              : 'Timing unavailable';
      return `
        <${rowTag}
          class="ft-market-row${active ? ' ft-market-row-active' : ''}${isLive ? ' ft-market-row-live' : ' ft-market-row-archived'}"
          ${state.hostMode === 'discovery'
            ? `href="${escapeHtml(rowDestination)}"`
            : 'type="button"'}
          data-ft-role="proposal-row"
          data-ft-action="select-proposal"
          data-ft-proposal-id="${escapeHtml(market.id)}"
          data-ft-proposal-state="${escapeHtml(displayStatus.key)}"
          data-ft-proposal-outcome="${escapeHtml(market.proposal.statusGroup)}"
          ${state.hostMode === 'discovery'
            ? active ? 'aria-current="true"' : ''
            : `aria-pressed="${active}"`}
        >
          <span class="ft-market-row-main">
            ${renderLogo(market, 'small')}
            <span class="ft-market-row-copy">
              <strong class="ft-market-row-title" title="${escapeHtml(market.proposal.title)}">${escapeHtml(market.proposal.title)}</strong>
              <small class="ft-market-row-meta">${escapeHtml(market.name)} · ${escapeHtml(market.ticker)} · Proposal ${market.proposal.number == null ? '—' : `#${Math.round(market.proposal.number)}`}</small>
            </span>
          </span>
          <span class="ft-market-row-state">
            <span
              class="ft-market-signal ft-market-signal-${escapeHtml(displayStatus.key)}"
              data-ft-role="proposal-status"
              data-ft-status="${escapeHtml(displayStatus.key)}"
              data-ft-outcome="${escapeHtml(market.proposal.statusGroup)}"
            ><i aria-hidden="true"></i>${escapeHtml(displayStatus.label)}</span>
            <small>${escapeHtml(timing)}</small>
          </span>
        </${rowTag}>
      `;
    }).join('');
  }

  function renderEmptyStage() {
    const issues = Array.isArray(state.degraded?.issues) ? state.degraded.issues : [];
    regions.marketStage.innerHTML = `
      <div class="ft-stage-empty">
        <span class="ft-stage-empty-mark" aria-hidden="true">◇</span>
        <span class="ft-kicker">Governance browser</span>
        <h2>${state.loading ? 'Loading governance history' : 'No proposal to select'}</h2>
        <p>${state.error
          ? escapeHtml(state.error)
          : 'NAVgator combines indexed proposals with validated onchain data for markets that remain live.'}</p>
        ${issues.length ? `
          <details class="ft-issue-details">
            <summary>${issues.length} incomplete market join${issues.length === 1 ? '' : 's'}</summary>
            <ul>${issues.slice(0, 5).map(issue => `
              <li><strong>${escapeHtml(issue.token || 'Proposal')}</strong> ${escapeHtml(issue.message || issue.code || 'Source unavailable')}</li>
            `).join('')}</ul>
          </details>
        ` : ''}
        <button class="ft-primary-button ft-primary-button-inline" type="button" data-ft-action="refresh">Try refresh</button>
      </div>
    `;
  }

  function renderArchivedStage(market) {
    const status = market.proposal.statusGroup;
    const displayStatus = proposalDisplayStatus(market.proposal);
    const isResolvedOutcome = status === 'passed' || status === 'failed';
    const resolutionTitle = status === 'passed'
      ? 'Proposal passed'
      : status === 'failed'
        ? 'Proposal failed'
        : 'Indexed proposal record';

    regions.marketStage.innerHTML = `
      <article class="ft-proposal ft-proposal-archived" data-ft-role="proposal-archive">
        <header class="ft-proposal-header">
          <div class="ft-proposal-breadcrumb">
            ${renderLogo(market, 'large')}
            <div>
              <span>${escapeHtml(market.name)} · ${escapeHtml(market.ticker)}</span>
              <span>Proposal ${market.proposal.number == null ? '' : `#${Math.round(market.proposal.number)}`} · Governance archive</span>
            </div>
          </div>
          ${market.proposal.sourceUrl ? `
            <div class="ft-proposal-actions">
              <a href="${escapeHtml(market.proposal.sourceUrl)}" target="_blank" rel="noreferrer">Proposal source ↗</a>
            </div>
          ` : ''}
          <div class="ft-archive-badges">
            <span
              class="ft-archive-status ft-archive-status-${escapeHtml(displayStatus.key)}"
              data-ft-role="proposal-status"
              data-ft-status="${escapeHtml(displayStatus.key)}"
              data-ft-outcome="${escapeHtml(status)}"
            >${escapeHtml(displayStatus.label)}</span>
            <span class="ft-market-data-badge">Public 15-minute history · no wallet</span>
          </div>
          <h2 data-ft-role="proposal-title">${escapeHtml(market.proposal.title)}</h2>
          ${market.proposal.description
            ? `<p class="ft-proposal-description">${escapeHtml(market.proposal.description)}</p>`
            : '<p class="ft-proposal-description ft-muted">No indexed proposal description is available. Open the proposal source for the original record.</p>'}
          <div class="ft-proposal-meta">
            <span>Created ${escapeHtml(formatDateTime(market.proposal.createdAt))}</span>
            <span>Window ended ${escapeHtml(formatDateTime(market.proposal.endsAt))}</span>
            ${market.proposal.resolvedAt
              ? `<span>Resolved ${escapeHtml(formatDateTime(market.proposal.resolvedAt))}</span>`
              : ''}
            ${market.proposal.isTeamSponsored ? '<span class="ft-team-badge">Team sponsored</span>' : ''}
          </div>
        </header>

        <section class="ft-resolution ft-resolution-${escapeHtml(status)}" aria-label="Proposal resolution">
          <span class="ft-resolution-mark" aria-hidden="true">${status === 'passed' ? '✓' : status === 'failed' ? '×' : '◇'}</span>
          <div>
            <span class="ft-kicker">${isResolvedOutcome ? 'Recorded resolution' : 'Indexed lifecycle state'}</span>
            <h3>${escapeHtml(resolutionTitle)}</h3>
            <p>${isResolvedOutcome
              ? 'This decision is resolved and its conditional market is no longer tradable.'
              : 'This indexed record is not an open validated market and is non-tradable.'}</p>
          </div>
          <strong>${isResolvedOutcome ? `Outcome · ${escapeHtml(market.proposal.statusLabel)}` : 'Closed record'}</strong>
        </section>

      </article>
    `;
  }

  function bookPriceIncrement(book, referencePrice) {
    const prices = [
      ...(Array.isArray(book?.asks) ? book.asks : []),
      ...(Array.isArray(book?.bids) ? book.bids : []),
    ]
      .map(level => firstNumber(level?.price))
      .filter(price => Number.isFinite(price) && price > 0)
      .sort((left, right) => left - right);
    const increments = [];
    for (let index = 1; index < prices.length; index += 1) {
      const increment = prices[index] - prices[index - 1];
      if (increment > Number.EPSILON) increments.push(increment);
    }
    const reference = firstNumber(referencePrice, book?.bestBid, book?.bestAsk);
    const displayIncrement = !Number.isFinite(reference)
      ? 0.001
      : reference >= 100
        ? 0.1
        : reference >= 1
          ? 0.01
          : reference >= 0.01
            ? 0.001
            : 0.0001;
    return increments.length
      ? Math.min(displayIncrement, ...increments)
      : displayIncrement;
  }

  function formatBookIncrement(value) {
    if (!Number.isFinite(value) || value <= 0) return '0.001';
    return value.toLocaleString('en-US', {
      maximumFractionDigits: 8,
      useGrouping: false,
    });
  }

  function renderBookRows(rows, branch, side) {
    const levels = Array.isArray(rows) ? rows : [];
    if (!levels.length) {
      return '<div class="ft-book-empty">No resting liquidity</div>';
    }
    const maximum = Math.max(...levels.map(level => level.cumulativeAmount || level.amount), 1);
    return levels.map((level) => {
      const depth = Math.max(
        2,
        Math.min(100, ((level.cumulativeAmount || level.amount) / maximum) * 100),
      );
      return `
        <button
          class="ft-book-row ft-book-row-${side}"
          type="button"
          data-ft-action="use-book-price"
          data-ft-outcome="${escapeHtml(branch)}"
          data-ft-price="${escapeHtml(level.price)}"
          title="Use ${branch.toUpperCase()} ${side === 'ask' ? 'ask' : 'bid'} ${formatPrice(level.price)}"
        >
          <span class="ft-book-depth" style="--ft-book-depth:${depth.toFixed(2)}%" aria-hidden="true"></span>
          ${branch === 'fail'
            ? `<strong class="ft-book-price">${formatChartPrice(level.price)}</strong><span class="ft-book-amount">${formatTokenAmount(level.amount, 2)}</span>`
            : `<span class="ft-book-amount">${formatTokenAmount(level.amount, 2)}</span><strong class="ft-book-price">${formatChartPrice(level.price)}</strong>`}
        </button>
      `;
    }).join('');
  }

  function renderOrderBook(market, branchName, book) {
    const branch = branchName === 'fail' ? market.fail : market.pass;
    const spreadBps = Number.isFinite(book?.bestBid)
      && Number.isFinite(book?.bestAsk)
      && book.bestBid > 0
      ? ((book.bestAsk - book.bestBid) / book.bestBid) * 10_000
      : null;
    const asks = Array.isArray(book?.asks) ? [...book.asks].reverse() : [];
    const bids = Array.isArray(book?.bids) ? book.bids : [];
    const branchLabel = branchName.toUpperCase();
    const tickSize = bookPriceIncrement(book, branch.price);
    return `
      <section class="ft-book ft-book-${escapeHtml(branchName)}${state.bookTab === branchName ? ' ft-book-mobile-active' : ''}" data-ft-role="${escapeHtml(branchName)}-card">
        <header>
          <span class="ft-book-branch">${escapeHtml(branchLabel)}</span>
          <span class="ft-book-tick" title="Displayed price increment">
            ${escapeHtml(formatBookIncrement(tickSize))}
            <i aria-hidden="true">⌄</i>
          </span>
        </header>
        <div class="ft-book-columns" aria-hidden="true">${branchName === 'fail'
          ? '<span>Price</span><span>Amount</span>'
          : '<span>Amount</span><span>Price</span>'}</div>
        <div class="ft-book-side ft-book-asks">
          ${renderBookRows(asks, branchName, 'ask')}
        </div>
        <div class="ft-book-reference">
          <div class="ft-book-amm">
            <span><i></i>AMM</span>
            <strong>${formatChartPrice(branch.price)}</strong>
          </div>
          <div class="ft-book-spread-row">
            <span>Spread</span>
            <strong>${Number.isFinite(spreadBps) ? `${spreadBps.toFixed(1)} bps` : '—'}</strong>
          </div>
        </div>
        <div class="ft-book-side ft-book-bids">
          ${renderBookRows(bids, branchName, 'bid')}
        </div>
      </section>
    `;
  }

  function renderLiveMarketStage(market) {
    const entry = state.marketDataByProposal.get(market.id);
    const marketData = entry?.data;
    const decisionClass = market.decision.passing === true
      ? 'passing'
      : market.decision.passing === false
        ? 'failing'
        : 'unknown';
    const twapState = Number.isFinite(market.pass.twapPrice)
      && Number.isFinite(market.fail.twapPrice)
      ? 'TWAP active'
      : 'TWAP pending';
    const navPremium = Number.isFinite(market.nav.spot)
      && Number.isFinite(market.nav.nav)
      && market.nav.nav > 0
      ? ((market.nav.spot - market.nav.nav) / market.nav.nav) * 100
      : null;
    let books = '';
    if (entry?.loading && !marketData) {
      books = `
        <div class="ft-books-loading">
          <span class="ft-loader" aria-hidden="true"></span>
          <strong>Loading PASS / FAIL books</strong>
          <small>Reading Manifest on Solana mainnet</small>
        </div>
      `;
    } else if (entry?.error && !marketData) {
      books = `
        <div class="ft-books-loading ft-books-error">
          <strong>Order books unavailable</strong>
          <small>${escapeHtml(entry.error)}</small>
          <button type="button" data-ft-action="retry-market-data">Try again</button>
        </div>
      `;
    } else {
      books = `
        ${renderOrderBook(market, 'pass', marketData?.books?.pass)}
        ${renderOrderBook(market, 'fail', marketData?.books?.fail)}
      `;
    }

    regions.marketStage.innerHTML = `
      <article class="ft-proposal ft-proposal-execution">
        <header class="ft-execution-header">
          <div class="ft-execution-identity">
            ${renderLogo(market, 'large')}
            <div>
              <span>${escapeHtml(market.ticker)} · Proposal ${market.proposal.number == null ? '' : `#${Math.round(market.proposal.number)}`}</span>
              <h2 data-ft-role="proposal-title">${escapeHtml(market.proposal.title)}</h2>
            </div>
          </div>
          ${market.proposal.sourceUrl ? `
            <div class="ft-execution-links">
              <a href="${escapeHtml(market.proposal.sourceUrl)}" target="_blank" rel="noreferrer" data-ft-action="open-execution">Proposal ↗</a>
            </div>
          ` : ''}
        </header>

        <section class="ft-execution-status ft-execution-status-${decisionClass}" data-ft-role="decision" aria-label="Current proposal status">
          <strong>${escapeHtml(marketStatusLabel(market))}${Number.isFinite(market.decision.marginPct)
            ? ` by ${Math.abs(market.decision.marginPct).toFixed(2)}%`
            : ''}</strong>
          <span>Threshold ${formatThresholdPercent(market.thresholdPct)}</span>
          <span>${escapeHtml(twapState)}</span>
          <span data-ft-region="countdown">${escapeHtml(formatCountdown(market.proposal.endsAt))}</span>
          <span>Spot ${formatPrice(market.nav.spot)}</span>
          <span>NAV ${formatPrice(market.nav.nav)}</span>
          <span class="${Number.isFinite(navPremium) && navPremium < 0 ? 'ft-negative' : 'ft-positive'}">${Number.isFinite(navPremium) ? `${formatPercent(navPremium)} vs NAV` : 'NAV spread —'}</span>
          <span class="ft-public-market-badge">Public market data · no wallet</span>
        </section>

        <div class="ft-execution-market-grid">
          <div class="ft-orderbooks" aria-label="PASS and FAIL limit order books">
            <div class="ft-orderbooks-grid">${books}</div>
          </div>
        </div>
      </article>
    `;
  }

  function updateProposalChartLivePoint(market) {
    if (!market || market.proposal.statusGroup !== 'live') return false;
    return state.historyChart?.updateLivePoint?.({
      timestamp: firstText(market.source?.asOf, market.marketAsOf, state.asOf),
      underlyingPrice: firstNumber(market.spot.price, market.nav.spot),
      passPrice: market.pass.price,
      failPrice: market.fail.price,
    }) === true;
  }

  function renderLivePriceSurfaces(market, options = {}) {
    if (
      state.destroyed
      || !market
      || selectedMarket()?.id !== market.id
    ) return;

    const metricValues = {
      price: formatChartCurrency(firstNumber(market.spot.price, market.nav.spot)),
      pass: formatChartCurrency(market.pass.price),
      fail: formatChartCurrency(market.fail.price),
    };
    Object.entries(metricValues).forEach(([key, value]) => {
      const metric = root.querySelector(
        `[data-ft-chart-header-metric="${key}"] strong`,
      );
      if (metric) metric.textContent = value;
    });
    updateProposalChartLivePoint(market);

    if (options.renderBooks !== false) renderLiveMarketStage(market);
    renderTradeTicket();
  }

  function clearOwnershipChartExpansion() {
    runtime.document.body.classList.remove('chart-frame-expanded');
    regions.marketChart
      ?.querySelector('.ft-terminal-chart-panel.is-expanded')
      ?.classList.remove('is-expanded');
  }

  function toggleChartExpansion(button = null) {
    const panel = regions.marketChart?.querySelector('.ft-terminal-chart-panel');
    if (!panel) return;
    const expanded = panel.classList.toggle('is-expanded');
    runtime.document.body.classList.toggle('chart-frame-expanded', expanded);
    if (button) {
      button.classList.toggle('active', expanded);
      button.setAttribute('aria-label', expanded ? 'Restore chart size' : 'Expand chart');
      button.title = expanded ? 'Restore chart size' : 'Expand chart';
    }
    runtime.setTimeout(() => {
      state.historyChart?.resize?.();
      state.historyChart?.resetView?.();
    }, 100);
  }

  function renderMarketStage() {
    if (isOwnershipWorkspace()) {
      destroyHourlyChart();
      const asset = ownershipTokenSnapshot();
      root.classList.remove('ft-live-market', 'ft-archive-market');
      root.classList.add('ft-proposal-focus', 'ft-ownership-market');
      regions.marketChartHeader.innerHTML = renderOwnershipChartHeader(asset);
      const currentFrame = regions.marketChart.querySelector(
        '[data-ft-role="ownership-token-chart"]',
      );
      if (!currentFrame || currentFrame.dataset.ftToken !== asset.token) {
        clearOwnershipChartExpansion();
        regions.marketChart.innerHTML = `
          <section
            class="ft-ownership-chart-panel ft-terminal-chart-panel"
            data-ft-role="ownership-token-chart"
            data-ft-token="${escapeHtml(asset.token)}"
          >
            <iframe
              class="ft-ownership-chart-frame"
              src="${escapeHtml(ownershipChartFrameUrl(asset.token))}"
              title="${escapeHtml(`${asset.name} Price and NAV chart`)}"
              loading="eager"
            ></iframe>
          </section>
        `;
      }
      regions.marketStage.innerHTML = '';
      return;
    }

    clearOwnershipChartExpansion();
    destroyHourlyChart();
    const market = selectedMarket();
    regions.marketChartHeader.innerHTML = '';
    regions.marketChart.innerHTML = '';
    root.classList.remove('ft-ownership-market');
    root.classList.toggle(
      'ft-live-market',
      Boolean(market && market.proposal.statusGroup === 'live'),
    );
    root.classList.toggle(
      'ft-archive-market',
      Boolean(market && market.proposal.statusGroup !== 'live'),
    );
    root.classList.toggle(
      'ft-proposal-focus',
      state.hostMode === 'token' || Boolean(market && state.proposalFocus),
    );
    if (!market) {
      renderEmptyStage();
      return;
    }
    const separateChartHeader = state.hostMode === 'token';
    const history = state.historyByProposal.get(market.id)?.data;
    regions.marketChartHeader.innerHTML = separateChartHeader
      ? renderProposalChartHeader(market, history)
      : '';
    regions.marketChart.innerHTML = renderHourlyHistoryPanel(market, {
      includeHeader: !separateChartHeader,
    });
    if (market.proposal.statusGroup !== 'live') {
      renderArchivedStage(market);
      mountHourlyChart(market);
      return;
    }

    renderLiveMarketStage(market);
    mountHourlyChart(market);
    return;

    const geometry = convergenceGeometry(market);
    const decisionClass = market.decision.passing === true
      ? 'passing'
      : market.decision.passing === false
        ? 'failing'
        : 'unknown';
    const navPremium = Number.isFinite(market.nav.spot)
      && Number.isFinite(market.nav.nav)
      && market.nav.nav > 0
      ? ((market.nav.spot - market.nav.nav) / market.nav.nav) * 100
      : null;
    const runway = Number.isFinite(market.nav.treasury)
      && Number.isFinite(market.nav.monthlySpend)
      && market.nav.monthlySpend > 0
      ? market.nav.treasury / market.nav.monthlySpend
      : null;

    regions.marketStage.innerHTML = `
      <article class="ft-proposal">
        <header class="ft-proposal-header">
          <div class="ft-proposal-breadcrumb">
            ${renderLogo(market, 'large')}
            <div>
              <span>${escapeHtml(market.name)} · ${escapeHtml(market.ticker)}</span>
              <span>Proposal ${market.proposal.number == null ? '' : `#${Math.round(market.proposal.number)}`} · ${escapeHtml(market.proposal.status.toUpperCase())}</span>
            </div>
          </div>
          <div class="ft-proposal-actions">
            ${market.token ? `<a href="/?token=${encodeURIComponent(market.token)}">NAV research</a>` : ''}
            ${market.proposal.sourceUrl ? `<a href="${escapeHtml(market.proposal.sourceUrl)}" target="_blank" rel="noreferrer">Source ↗</a>` : ''}
          </div>
          <h2 data-ft-role="proposal-title">${escapeHtml(market.proposal.title)}</h2>
          ${market.proposal.description
            ? `<p class="ft-proposal-description">${escapeHtml(market.proposal.description)}</p>`
            : '<p class="ft-proposal-description ft-muted">No offchain proposal description is available. Verify the source before trading.</p>'}
          <div class="ft-proposal-meta">
            <span class="ft-proposal-deadline">
              <span class="ft-live-dot" aria-hidden="true"></span>
              <strong data-ft-region="countdown">${escapeHtml(formatCountdown(market.proposal.endsAt))}</strong>
            </span>
            <span>Created ${escapeHtml(formatDateTime(market.proposal.createdAt))}</span>
            ${market.proposal.isTeamSponsored ? '<span class="ft-team-badge">Team sponsored</span>' : ''}
          </div>
        </header>

        <section class="ft-decision ft-decision-${decisionClass}" data-ft-role="decision" aria-label="Current decision signal">
          <div class="ft-decision-state">
            <span>Current decision</span>
            <strong>${escapeHtml(marketStatusLabel(market))}</strong>
          </div>
          <div class="ft-decision-metric">
            <span>Margin after threshold</span>
            <strong>${formatPercent(market.decision.marginPct)}</strong>
          </div>
          <div class="ft-decision-metric">
            <span>Required uplift</span>
            <strong>${formatThresholdPercent(market.thresholdPct)}</strong>
          </div>
          <div class="ft-decision-metric">
            <span>PASS target TWAP</span>
            <strong>${formatPrice(market.decision.targetPassTwap)}</strong>
          </div>
        </section>

        <section class="ft-outcome-grid" aria-label="PASS and FAIL market comparison">
          <button
            class="ft-outcome-card ft-outcome-card-pass${state.order.outcome === 'pass' ? ' ft-outcome-card-selected' : ''}"
            type="button"
            data-ft-role="pass-card"
            data-ft-action="select-outcome"
            data-ft-outcome="pass"
            aria-pressed="${state.order.outcome === 'pass'}"
          >
            <span class="ft-outcome-card-head"><strong>PASS</strong><span>Proposal approved</span></span>
            <span class="ft-outcome-price">${formatPrice(market.pass.price)}</span>
            <span class="ft-outcome-stats">
              <span><small>TWAP</small><strong>${formatPrice(market.pass.twapPrice)}</strong></span>
              <span><small>LIQUIDITY</small><strong>${formatCompactMoney(market.pass.liquidityUsd)}</strong></span>
            </span>
          </button>
          <button
            class="ft-outcome-card ft-outcome-card-fail${state.order.outcome === 'fail' ? ' ft-outcome-card-selected' : ''}"
            type="button"
            data-ft-role="fail-card"
            data-ft-action="select-outcome"
            data-ft-outcome="fail"
            aria-pressed="${state.order.outcome === 'fail'}"
          >
            <span class="ft-outcome-card-head"><strong>FAIL</strong><span>Proposal rejected</span></span>
            <span class="ft-outcome-price">${formatPrice(market.fail.price)}</span>
            <span class="ft-outcome-stats">
              <span><small>TWAP</small><strong>${formatPrice(market.fail.twapPrice)}</strong></span>
              <span><small>LIQUIDITY</small><strong>${formatCompactMoney(market.fail.liquidityUsd)}</strong></span>
            </span>
          </button>
        </section>

        ${renderHourlyHistoryPanel(market)}

        <section class="ft-convergence-panel">
          <div class="ft-section-heading">
            <div><span class="ft-kicker">Decision mechanics</span><h3>Spot and TWAP convergence</h3></div>
            <span>Threshold ${formatThresholdPercent(market.thresholdPct)}</span>
          </div>
          ${geometry ? `
            <div class="ft-convergence">
              <div class="ft-convergence-scale">
                <span>${formatPrice(geometry.min)}</span>
                <span>${formatPrice(geometry.max)}</span>
              </div>
              <div class="ft-convergence-track">
                ${geometry.target == null ? '' : `<span class="ft-target-line" style="left:${geometry.target.toFixed(2)}%"><small>PASS target</small></span>`}
                ${geometry.passSpot == null ? '' : `<span class="ft-price-marker ft-price-marker-pass" style="left:${geometry.passSpot.toFixed(2)}%"><i></i><small>PASS spot</small></span>`}
                ${geometry.passTwap == null ? '' : `<span class="ft-twap-marker ft-twap-marker-pass" style="left:${geometry.passTwap.toFixed(2)}%" title="PASS TWAP"></span>`}
                ${geometry.failSpot == null ? '' : `<span class="ft-price-marker ft-price-marker-fail" style="left:${geometry.failSpot.toFixed(2)}%"><i></i><small>FAIL spot</small></span>`}
                ${geometry.failTwap == null ? '' : `<span class="ft-twap-marker ft-twap-marker-fail" style="left:${geometry.failTwap.toFixed(2)}%" title="FAIL TWAP"></span>`}
              </div>
              <div class="ft-convergence-legend">
                <span><i class="ft-legend-spot"></i>Spot oracle</span>
                <span><i class="ft-legend-twap"></i>Time-weighted price</span>
              </div>
            </div>
          ` : '<p class="ft-panel-empty">Oracle values are not available for this market.</p>'}
        </section>

        <div class="ft-detail-grid">
          <section class="ft-detail-panel">
            <div class="ft-section-heading">
              <div><span class="ft-kicker">Pool depth</span><h3>Conditional reserves</h3></div>
              <strong>${formatCompactMoney(market.liquidityUsd)}</strong>
            </div>
            <div class="ft-depth-columns">
              <div><span class="ft-depth-label ft-depth-label-pass">PASS pool</span>${reserveDepth(market.pass, market.ticker)}</div>
              <div><span class="ft-depth-label ft-depth-label-fail">FAIL pool</span>${reserveDepth(market.fail, market.ticker)}</div>
            </div>
          </section>

          <section class="ft-detail-panel">
            <div class="ft-section-heading">
              <div><span class="ft-kicker">Treasury context</span><h3>01Resolved fundamentals</h3></div>
              ${market.token ? `<a href="/?token=${encodeURIComponent(market.token)}">Open report →</a>` : ''}
            </div>
            <div class="ft-fundamentals-grid">
              <div><span>Treasury</span><strong>${formatCompactMoney(market.nav.treasury)}</strong></div>
              <div><span>NAV / token</span><strong>${formatPrice(market.nav.nav)}</strong></div>
              <div><span>Spot vs NAV</span><strong class="${Number.isFinite(navPremium) && navPremium < 0 ? 'ft-negative' : 'ft-positive'}">${formatPercent(navPremium)}</strong></div>
              <div><span>Runway</span><strong>${Number.isFinite(runway) ? `${runway.toFixed(runway < 10 ? 1 : 0)} mo` : '—'}</strong></div>
            </div>
          </section>
        </div>

        <section class="ft-detail-panel ft-address-panel">
          <div class="ft-section-heading">
            <div><span class="ft-kicker">Verify</span><h3>Onchain identities</h3></div>
            <span>Solana mainnet</span>
          </div>
          <div class="ft-address-grid">
            ${addressRow('Proposal', market.proposal.id, 'proposal')}
            ${addressRow('DAO', market.daoAddress, 'DAO')}
            ${addressRow('PASS base mint', market.proposal.passBaseMint, 'PASS base mint')}
            ${addressRow('FAIL base mint', market.proposal.failBaseMint, 'FAIL base mint')}
          </div>
        </section>
      </article>
    `;
    mountHourlyChart(market);
  }

  function positionForMint(mint) {
    return state.wallet.positions.find(position => position.mint === mint) || null;
  }

  function hydrateTransactions() {
    state.transactions = state.wallet.address
      ? readStoredTransactions(runtime)
        .filter(transaction => transaction.owner === state.wallet.address)
      : [];
  }

  function upsertTransaction(value) {
    const normalized = normalizeTerminalTransaction(value);
    if (!normalized) return null;
    const stored = readStoredTransactions(runtime);
    const sessionRows = state.transactions.filter(transaction => (
      !stored.some(row => (
        row.signature === transaction.signature
        && row.owner === transaction.owner
      ))
    ));
    const transactions = [...stored, ...sessionRows];
    const index = transactions.findIndex(transaction => (
      transaction.signature === normalized.signature
      && transaction.owner === normalized.owner
    ));
    if (index >= 0) {
      transactions[index] = normalizeTerminalTransaction({
        ...transactions[index],
        ...normalized,
        createdAt: transactions[index].createdAt,
      });
    } else {
      transactions.push(normalized);
    }
    writeStoredTransactions(runtime, transactions);
    state.transactions = transactions
      .filter(transaction => transaction.owner === state.wallet.address)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_STORED_TRANSACTIONS);
    return normalized;
  }

  function transactionsForMarket(market) {
    if (!market) return [];
    return state.transactions
      .filter(transaction => transaction.proposalId === market.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function renderTicketTransactionStatus(market) {
    const transaction = transactionsForMarket(market)[0];
    if (!transaction) return '';
    const status = transactionStatusLabel(transaction.status);
    return `
      <div
        class="ft-transaction-state ft-transaction-state-${escapeHtml(transaction.status)}"
        data-ft-role="transaction-state"
        data-ft-transaction-status="${escapeHtml(transaction.status)}"
      >
        <span aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(status)} · ${escapeHtml(transaction.action || 'On-chain action')}</strong>
          <small>${escapeHtml(formatRelativeTime(transaction.updatedAt))}${transaction.errorMessage
            ? ` · ${escapeHtml(transaction.errorMessage)}`
            : ''}</small>
        </div>
        <a
          href="https://solscan.io/tx/${escapeHtml(transaction.signature)}"
          target="_blank"
          rel="noreferrer"
        >${escapeHtml(shortenAddress(transaction.signature, 5))} ↗</a>
      </div>
    `;
  }

  function renderTransactionActivity(market) {
    const transactions = transactionsForMarket(market);
    if (!state.wallet.address || !transactions.length) return '';
    return `
      <div class="ft-transaction-activity" data-ft-role="transaction-activity">
        <div class="ft-transaction-activity-heading">
          <span>Transaction activity</span>
          <button type="button" data-ft-action="refresh-transactions">Refresh</button>
        </div>
        ${transactions.slice(0, 6).map(transaction => `
          <a
            class="ft-transaction-row ft-transaction-row-${escapeHtml(transaction.status)}"
            href="https://solscan.io/tx/${escapeHtml(transaction.signature)}"
            target="_blank"
            rel="noreferrer"
          >
            <span aria-hidden="true"></span>
            <div>
              <strong>${escapeHtml(transaction.action || transaction.kind || 'On-chain action')}</strong>
              <small>${escapeHtml(transaction.venue || 'Solana')} · ${escapeHtml(formatDateTime(transaction.createdAt))}</small>
              ${transaction.errorMessage ? `<em>${escapeHtml(transaction.errorMessage)}</em>` : ''}
            </div>
            <b>${escapeHtml(transactionStatusLabel(transaction.status))} ↗</b>
          </a>
        `).join('')}
      </div>
    `;
  }

  function selectedOrderBook(market) {
    const entry = state.marketDataByProposal.get(market?.id);
    return entry?.data?.books?.[state.order.outcome] || null;
  }

  function suggestedLimitPrice(market) {
    const book = selectedOrderBook(market);
    if (state.order.side === 'buy') {
      return firstNumber(book?.bestAsk, book?.bestBid, market?.[state.order.outcome]?.price);
    }
    return firstNumber(book?.bestBid, book?.bestAsk, market?.[state.order.outcome]?.price);
  }

  function decisionTicketPreview(market) {
    const outcome = state.order.outcome === 'fail' ? 'fail' : 'pass';
    const side = state.order.side === 'sell' ? 'sell' : 'buy';
    const branch = market?.[outcome] || {};
    const book = selectedOrderBook(market);
    const amount = firstNumber(state.order.amount);
    const amountValid = Number.isFinite(amount) && amount > 0;
    const selectedMint = outcome === 'pass'
      ? market?.proposal?.passBaseMint
      : market?.proposal?.failBaseMint;
    const passPosition = positionForMint(market?.proposal?.passBaseMint);
    const failPosition = positionForMint(market?.proposal?.failBaseMint);
    const selectedPosition = outcome === 'pass' ? passPosition : failPosition;
    const currentPosition = selectedPosition?.available
      ? firstNumber(selectedPosition.amountString, selectedPosition.amount)
      : null;
    const passAmount = passPosition?.available
      ? firstNumber(passPosition.amountString, passPosition.amount)
      : null;
    const failAmount = failPosition?.available
      ? firstNumber(failPosition.amountString, failPosition.amount)
      : null;
    const estimate = executionEstimate(
      market,
      outcome,
      side,
      amount,
      state.order.slippageBps,
    );
    const limitPrice = firstNumber(
      state.order.price,
      suggestedLimitPrice(market),
      branch.price,
    );
    const tokenDelta = !amountValid
      ? 0
      : side === 'buy'
        ? state.order.type === 'limit'
          ? amount
          : firstNumber(estimate?.output, 0)
        : -amount;
    const positionAfter = Number.isFinite(currentPosition)
      ? currentPosition + tokenDelta
      : tokenDelta;
    const quoteOutput = !amountValid
      ? 0
      : side === 'sell'
        ? state.order.type === 'limit'
          ? amount * firstNumber(limitPrice, 0)
          : firstNumber(estimate?.output, 0)
        : 0;
    const passAfter = outcome === 'pass'
      ? positionAfter
      : firstNumber(passAmount, 0);
    const failAfter = outcome === 'fail'
      ? positionAfter
      : firstNumber(failAmount, 0);
    const formatPosition = (value) => {
      if (!Number.isFinite(value)) return '—';
      const absolute = Math.abs(value);
      const sign = value < 0 ? '−' : '';
      if (absolute >= 1_000_000) {
        return `${sign}${(absolute / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
      }
      if (absolute >= 1_000) {
        return `${sign}${(absolute / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
      }
      return `${sign}${absolute.toLocaleString('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })}`;
    };
    const selectedBranchValue = side === 'sell'
      ? formatPrice(quoteOutput)
      : `${formatPosition(positionAfter)} ${market?.ticker || 'TOKEN'}`;
    const passValue = outcome === 'pass'
      ? selectedBranchValue
      : `${formatPosition(passAfter)} ${market?.ticker || 'TOKEN'}`;
    const failValue = outcome === 'fail'
      ? selectedBranchValue
      : `${formatPosition(failAfter)} ${market?.ticker || 'TOKEN'}`;
    const inputMint = state.order.type === 'limit'
      ? side === 'buy'
        ? outcome === 'pass'
          ? market?.proposal?.passQuoteMint
          : market?.proposal?.failQuoteMint
        : selectedMint
      : side === 'buy'
        ? market?.quoteMint
        : market?.baseMint;
    const inputPosition = positionForMint(inputMint);
    const held = inputPosition?.available
      ? firstNumber(inputPosition.amountString, inputPosition.amount)
      : null;

    return {
      amountValid,
      averagePrice: formatPrice(limitPrice),
      buyPrice: formatPrice(firstNumber(book?.bestAsk, branch.price)),
      failValue,
      held: Number.isFinite(held) ? formatTokenAmount(held, 4) : '0.0000',
      heldSymbol: side === 'buy' ? 'USDC' : market?.ticker || 'TOKEN',
      instruction: `If ${outcome}, I would like to…`,
      passValue,
      positionAfter: formatPosition(positionAfter),
      positionBefore: Number.isFinite(currentPosition)
        ? formatPosition(currentPosition)
        : '0.00',
      sellPrice: formatPrice(firstNumber(book?.bestBid, branch.price)),
      ticker: market?.ticker || 'TOKEN',
    };
  }

  function renderExecutionTicket(market) {
    const automaticReady = state.recurring.enabled
      && state.recurring.keeperReady
      && Boolean(state.recurring.programId);
    if (state.order.type === 'recurring' && !automaticReady) {
      state.order.type = 'swap';
    }
    const outcome = state.order.outcome.toUpperCase();
    const side = state.order.side === 'buy' ? 'Buy' : 'Sell';
    const isLimit = state.order.type === 'limit';
    const isRecurring = state.order.type === 'recurring';
    const book = selectedOrderBook(market);
    const inputSymbol = isLimit
      ? state.order.side === 'buy'
        ? `${outcome} USDC`
        : `${outcome} ${market.ticker}`
      : state.order.side === 'buy'
        ? 'USDC'
        : market.ticker;
    const amountSymbol = isLimit
      ? `${outcome} ${market.ticker}`
      : inputSymbol;
    const referencePrice = firstNumber(
      state.order.price,
      suggestedLimitPrice(market),
      market[state.order.outcome]?.price,
    );
    const limitPriceStep = bookPriceIncrement(book, referencePrice);
    const amount = firstNumber(state.order.amount);
    const marketDataEntry = state.marketDataByProposal.get(market.id);
    const limitReady = !!book?.address && book.canonical;
    const recurringTotal = Number.isFinite(amount)
      ? amount * state.order.totalCycles
      : null;
    const recurringFinalRun = Math.floor(Date.now() / 1_000)
      + 120
      + state.order.intervalSeconds * Math.max(0, state.order.totalCycles - 1);
    const proposalEndsAtSeconds = Math.floor(
      new Date(market.proposal.endsAt || '').getTime() / 1_000,
    );
    const recurringFits = Number.isFinite(proposalEndsAtSeconds)
      && recurringFinalRun < proposalEndsAtSeconds - 30;
    const preview = decisionTicketPreview(market);
    let cta = '';
    if (isRecurring && (!state.recurring.enabled || !state.recurring.programId)) {
      cta = '<button class="ft-primary-button" type="button" disabled>Automatic vault deployment pending</button>';
    } else if (isRecurring && !state.recurring.keeperReady) {
      cta = '<button class="ft-primary-button" type="button" disabled>Automatic keeper is not ready</button>';
    } else if (!state.programIntegrity.canTransact) {
      cta = `<button class="ft-primary-button" type="button" disabled>${state.programIntegrity.status === 'checking'
        ? 'Checking reviewed programs…'
        : 'Trading paused · program review required'}</button>`;
    } else if (!state.wallet.address) {
      cta = '<button class="ft-primary-button" type="button" data-ft-action="connect-wallet">Connect wallet to trade</button>';
    } else if (!state.wallet.canTransact) {
      cta = '<button class="ft-primary-button" type="button" disabled>Wallet cannot sign transactions</button>';
    } else if ((isLimit || isRecurring) && !limitReady) {
      cta = `<button class="ft-primary-button" type="button" disabled>${marketDataEntry?.loading
        ? 'Loading verified book…'
        : 'Verified Manifest market unavailable'}</button>`;
    } else if (isRecurring && !recurringFits) {
      cta = '<button class="ft-primary-button" type="button" disabled>Schedule exceeds proposal window</button>';
    } else {
      cta = `
        <button
          class="ft-primary-button"
          type="button"
          data-ft-action="execute-trade"
          data-ft-role="trade-submit"
          data-ft-amount-gated="true"
          ${state.execution.building || state.execution.submitting || !preview.amountValid
            ? `disabled${state.execution.building || state.execution.submitting ? ' aria-busy="true"' : ''}`
            : ''}
        >${state.execution.building
          ? 'Building & simulating…'
          : state.execution.submitting
            ? 'Approve in wallet…'
          : !preview.amountValid
            ? 'Enter amount'
          : isRecurring
            ? `Review automatic ${escapeHtml(side)}`
            : `Execute ${escapeHtml(side)} ${escapeHtml(outcome)}`}</button>
      `;
    }

    regions.tradeTicket.innerHTML = `
      <section class="ft-ticket ft-execution-ticket ft-decision-ticket ft-order-outcome-${escapeHtml(state.order.outcome)}">
        <div class="ft-decision-ticket-scroll" data-ft-role="decision-ticket-scroll">
        <div class="ft-segmented ft-outcome-tabs" role="group" aria-label="Select outcome">
          <button
            type="button"
            data-ft-action="select-outcome"
            data-ft-outcome="pass"
            aria-pressed="${state.order.outcome === 'pass'}"
            class="${state.order.outcome === 'pass' ? 'ft-segment-active ft-segment-pass' : ''}"
          >If "Pass"</button>
          <button
            type="button"
            data-ft-action="select-outcome"
            data-ft-outcome="fail"
            aria-pressed="${state.order.outcome === 'fail'}"
            class="${state.order.outcome === 'fail' ? 'ft-segment-active ft-segment-fail' : ''}"
          >If "Fail"</button>
        </div>

        <p class="ft-decision-intent" data-ft-role="decision-intent">${escapeHtml(preview.instruction)}</p>

        <div class="ft-decision-side-quotes" role="group" aria-label="Select trade direction">
          <button
            type="button"
            data-ft-action="select-side"
            data-ft-side="buy"
            aria-pressed="${state.order.side === 'buy'}"
            class="ft-decision-side-quote ft-decision-buy${state.order.side === 'buy' ? ' ft-is-selected' : ''}"
          ><strong>Buy</strong><span data-ft-role="buy-price">${escapeHtml(preview.buyPrice)}</span></button>
          <button
            type="button"
            data-ft-action="select-side"
            data-ft-side="sell"
            aria-pressed="${state.order.side === 'sell'}"
            class="ft-decision-side-quote ft-decision-sell${state.order.side === 'sell' ? ' ft-is-selected' : ''}"
          ><strong>Sell</strong><span data-ft-role="sell-price">${escapeHtml(preview.sellPrice)}</span></button>
        </div>

        ${isLimit ? `
          <label class="ft-amount-field ft-decision-limit-price">
            <span class="ft-ticket-label">Limit price</span>
            <span class="ft-amount-input-wrap">
              <input
                type="number"
                min="0"
                step="${escapeHtml(limitPriceStep)}"
                inputmode="decimal"
                placeholder="0.000"
                value="${escapeHtml(state.order.price)}"
                data-ft-role="limit-price"
                aria-label="Limit price in conditional USDC"
              >
            </span>
          </label>
        ` : ''}

        <label class="ft-amount-field ft-decision-amount-field">
          <span class="ft-amount-input-wrap">
            <input
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              placeholder="0.00"
              value="${escapeHtml(state.order.amount)}"
              data-ft-role="amount"
              aria-label="Trade amount in ${escapeHtml(amountSymbol)}"
            >
            <span class="ft-decision-held">
              <small><span data-ft-role="held-symbol">${escapeHtml(preview.heldSymbol)}</span> held</small>
              <strong data-ft-role="held-balance">${escapeHtml(preview.held)}</strong>
            </span>
          </span>
        </label>

        <div class="ft-decision-presets" aria-label="Quick trade amounts">
          ${[
            ['500', '500'],
            ['1000', '1K'],
            ['2500', '2.5K'],
          ].map(([value, label]) => `
            <button
              type="button"
              data-ft-action="decision-amount-preset"
              data-ft-amount="${value}"
            >${label}</button>
          `).join('')}
          <button
            class="ft-decision-max"
            type="button"
            data-ft-action="decision-amount-preset"
            data-ft-amount="max"
          >Max</button>
        </div>

        <div class="ft-decision-average">
          <span>Average price</span>
          <strong data-ft-role="average-price">${escapeHtml(preview.averagePrice)}</strong>
        </div>

        <div class="ft-decision-position">
          <span>Your "${escapeHtml(state.order.outcome)}" position</span>
          <strong>
            <span data-ft-role="position-before">${escapeHtml(preview.positionBefore)}</span>
            ${escapeHtml(preview.ticker)}
            <i aria-hidden="true">→</i>
            <span data-ft-role="position-after">${escapeHtml(preview.positionAfter)}</span>
            ${escapeHtml(preview.ticker)}
          </strong>
        </div>

        <div class="ft-decision-payoff" aria-label="Estimated post-trade conditional positions">
          <div class="ft-decision-payoff-fail">
            <span>FAIL</span>
            <strong data-ft-role="fail-payoff">${escapeHtml(preview.failValue)}</strong>
          </div>
          <div class="ft-decision-payoff-pass">
            <span>PASS</span>
            <strong data-ft-role="pass-payoff">${escapeHtml(preview.passValue)}</strong>
          </div>
        </div>

        ${state.execution.error ? `<p class="ft-ticket-error">${escapeHtml(state.execution.error)}</p>` : ''}
        ${renderTicketTransactionStatus(market)}

        <details class="ft-decision-advanced"${isLimit || isRecurring ? ' open' : ''}>
          <summary>${isRecurring
            ? 'Automatic order settings'
            : isLimit
              ? 'Limit order settings'
              : `Market order · ${(state.order.slippageBps / 100).toFixed(1)}% max slippage`}</summary>
          <div class="ft-segmented ft-order-type-tabs" role="group" aria-label="Select order type">
            <button
              type="button"
              data-ft-action="select-order-type"
              data-ft-order-type="swap"
              aria-pressed="${!isLimit && !isRecurring}"
              class="${!isLimit && !isRecurring ? 'ft-segment-active' : ''}"
            >MARKET</button>
            <button
              type="button"
              data-ft-action="select-order-type"
              data-ft-order-type="limit"
              aria-pressed="${isLimit}"
              class="${isLimit ? 'ft-segment-active' : ''}"
            >LIMIT</button>
            ${automaticReady ? `
              <button
                type="button"
                data-ft-action="select-order-type"
                data-ft-order-type="recurring"
                aria-pressed="${isRecurring}"
                class="${isRecurring ? 'ft-segment-active' : ''}"
              >AUTOMATIC</button>
            ` : ''}
          </div>

          ${isRecurring ? `
            <div class="ft-recurring-controls">
              <label>
                <span class="ft-ticket-label">Cadence</span>
                <select data-ft-role="recurring-interval" aria-label="Recurring execution cadence">
                  <option value="3600"${state.order.intervalSeconds === 3_600 ? ' selected' : ''}>Hourly</option>
                  <option value="21600"${state.order.intervalSeconds === 21_600 ? ' selected' : ''}>Every 6 hours</option>
                  <option value="86400"${state.order.intervalSeconds === 86_400 ? ' selected' : ''}>Daily</option>
                  <option value="604800"${state.order.intervalSeconds === 604_800 ? ' selected' : ''}>Weekly</option>
                </select>
              </label>
              <label>
                <span class="ft-ticket-label">Runs</span>
                <input
                  type="number"
                  min="1"
                  max="${Math.round(state.recurring.maximumCycles || 365)}"
                  step="1"
                  value="${Math.round(state.order.totalCycles)}"
                  data-ft-role="recurring-cycles"
                  aria-label="Number of automatic executions"
                >
              </label>
            </div>
          ` : ''}

          ${!isLimit ? `
            <label class="ft-slippage-field">
              <span>
                <span class="ft-ticket-label">${isRecurring ? 'Worst-price guard' : 'Max slippage'}</span>
                <small>Minimum output enforced onchain</small>
              </span>
              <select data-ft-role="slippage" aria-label="${isRecurring ? 'Recurring worst-price guard' : 'Maximum slippage'}">
                <option value="50"${state.order.slippageBps === 50 ? ' selected' : ''}>0.5%</option>
                <option value="100"${state.order.slippageBps === 100 ? ' selected' : ''}>1.0%</option>
                <option value="200"${state.order.slippageBps === 200 ? ' selected' : ''}>2.0%</option>
              </select>
            </label>
          ` : ''}

          <p>${isRecurring
            ? `One wallet approval locks <strong data-ft-role="recurring-total">${Number.isFinite(recurringTotal)
              ? `${formatTokenAmount(recurringTotal, 6)} ${escapeHtml(inputSymbol)}`
              : 'the capped total'}</strong> for scheduled execution.`
            : isLimit
              ? 'Limit orders require a unique verified Manifest market and split only the conditional funding shortfall.'
              : '01RX compares verified routes, enforces minimum output, and simulates the exact transaction before wallet approval.'}</p>
        </details>
        </div>
        <div class="ft-decision-action" data-ft-role="trade-action">
          ${cta}
        </div>
      </section>
    `;
  }

  function updateDecisionTicketPreview(market) {
    if (!market) return;
    const preview = decisionTicketPreview(market);
    const textByRole = {
      'average-price': preview.averagePrice,
      'buy-price': preview.buyPrice,
      'decision-intent': preview.instruction,
      'fail-payoff': preview.failValue,
      'held-balance': preview.held,
      'held-symbol': preview.heldSymbol,
      'pass-payoff': preview.passValue,
      'position-after': preview.positionAfter,
      'position-before': preview.positionBefore,
      'sell-price': preview.sellPrice,
    };
    Object.entries(textByRole).forEach(([role, value]) => {
      const element = root.querySelector(`[data-ft-role="${role}"]`);
      if (element) element.textContent = value;
    });
    const submit = root.querySelector(
      '[data-ft-role="trade-submit"][data-ft-amount-gated="true"]',
    );
    if (
      submit
      && !state.execution.building
      && !state.execution.submitting
    ) {
      submit.disabled = !preview.amountValid;
      submit.textContent = preview.amountValid
        ? state.order.type === 'recurring'
          ? `Review automatic ${state.order.side === 'buy' ? 'Buy' : 'Sell'}`
          : `Execute ${state.order.side === 'buy' ? 'Buy' : 'Sell'} ${state.order.outcome.toUpperCase()}`
        : 'Enter amount';
    }
  }

  function renderHistoricalTradePreview(market) {
    const resolvedOutcome = market.proposal.statusGroup === 'failed' ? 'fail' : 'pass';
    const outcome = resolvedOutcome.toUpperCase();
    const referencePrice = firstNumber(market[resolvedOutcome]?.price);
    return `
      <div
        class="ft-historical-trade-preview"
        data-ft-role="historical-trade-preview"
        aria-label="Read-only historical trading interface"
      >
        <div class="ft-historical-trade-heading">
          <div>
            <span class="ft-kicker">Historical trading layout</span>
            <h3>${escapeHtml(market.ticker)} decision market</h3>
          </div>
          <span class="ft-read-only-badge">Read only</span>
        </div>

        <div class="ft-segmented ft-outcome-tabs" role="group" aria-label="Historical outcome">
          <button
            type="button"
            disabled
            aria-pressed="${resolvedOutcome === 'pass'}"
            class="${resolvedOutcome === 'pass' ? 'ft-segment-active ft-segment-pass' : ''}"
          >PASS</button>
          <button
            type="button"
            disabled
            aria-pressed="${resolvedOutcome === 'fail'}"
            class="${resolvedOutcome === 'fail' ? 'ft-segment-active ft-segment-fail' : ''}"
          >FAIL</button>
        </div>

        <div class="ft-segmented ft-order-type-tabs" role="group" aria-label="Historical order type">
          <button type="button" disabled aria-pressed="true" class="ft-segment-active">LIMIT</button>
          <button type="button" disabled aria-pressed="false">SWAP</button>
        </div>

        <div class="ft-segmented ft-side-tabs" role="group" aria-label="Historical trade direction">
          <button type="button" disabled aria-pressed="true" class="ft-segment-active">BUY</button>
          <button type="button" disabled aria-pressed="false">SELL</button>
        </div>

        <label class="ft-amount-field">
          <span class="ft-ticket-label">Price</span>
          <span class="ft-amount-input-wrap">
            <input
              type="number"
              disabled
              value="${Number.isFinite(referencePrice) ? escapeHtml(referencePrice) : ''}"
              placeholder="—"
              data-ft-role="historical-limit-price"
              aria-label="Final recorded ${escapeHtml(outcome)} price"
            >
          </span>
        </label>

        <label class="ft-amount-field">
          <span class="ft-ticket-label">Amount</span>
          <span class="ft-amount-input-wrap">
            <input
              type="number"
              disabled
              placeholder="0.00"
              data-ft-role="historical-amount"
              aria-label="Historical trade amount"
            >
            <strong>Bal: —</strong>
          </span>
        </label>

        <div class="ft-estimate">
          <div><span>PASS reference</span><strong>${formatPrice(market.pass?.price)}</strong></div>
          <div><span>FAIL reference</span><strong>${formatPrice(market.fail?.price)}</strong></div>
          <div><span>Market state</span><strong>${escapeHtml(outcome)} resolved</strong></div>
          <p>These are final recorded observations from the closed market, not executable quotes.</p>
        </div>

        <button
          class="ft-primary-button"
          type="button"
          data-ft-role="archived-trade-cta"
          disabled
        >Trading closed · read-only</button>
      </div>
    `;
  }

  function syncExecutionLock() {
    root.classList.toggle(
      'ft-execution-locked',
      state.execution.building || state.execution.submitting,
    );
  }

  function renderTradeTicket() {
    syncExecutionLock();
    if (isOwnershipWorkspace()) {
      const asset = ownershipTokenSnapshot();
      const isBuy = state.ownershipOrder.side !== 'sell';
      const orderType = ['market', 'smart-fill', 'limit', 'pro'].includes(
        state.ownershipOrder.type,
      )
        ? state.ownershipOrder.type
        : 'market';
      const inputSymbol = isBuy ? 'USDC' : asset.ticker;
      const outputSymbol = isBuy ? asset.ticker : 'USDC';
      const output = ownershipOrderOutput(asset);
      const routedQuote = state.ownershipOrder.quote?.quote || null;
      const assetLogo = renderLogo(asset, 'small');
      const usdcLogo = '<span class="ft-ownership-usdc-logo" aria-hidden="true">$</span>';
      const inputLogo = isBuy ? usdcLogo : assetLogo;
      const outputLogo = isBuy ? assetLogo : usdcLogo;
      const typeLabel = {
        'smart-fill': 'Smart Fill',
        limit: 'Limit',
        pro: 'Pro',
      }[orderType] || '';
      let connectCta = '';
      if (orderType !== 'market') {
        connectCta = `<button class="ft-ownership-connect" type="button" disabled>${escapeHtml(typeLabel)} coming soon</button>`;
      } else if (!state.wallet.address) {
        connectCta = '<button class="ft-ownership-connect" type="button" data-ft-action="connect-wallet">Connect Wallet</button>';
      } else if (!state.wallet.canSignTransaction) {
        connectCta = '<button class="ft-ownership-connect" type="button" disabled>Wallet cannot return a reviewed signature</button>';
      } else if (!(firstNumber(state.ownershipOrder.amount) > 0)) {
        connectCta = '<button class="ft-ownership-connect" type="button" disabled>Enter an amount</button>';
      } else if (state.ownershipOrder.quoteLoading) {
        connectCta = '<button class="ft-ownership-connect" type="button" disabled aria-busy="true">Finding best route…</button>';
      } else if (!state.ownershipOrder.quote?.transaction) {
        connectCta = '<button class="ft-ownership-connect" type="button" disabled>Route unavailable</button>';
      } else {
        connectCta = `
          <button
            class="ft-ownership-connect"
            type="button"
            data-ft-action="review-ownership-trade"
            ${state.execution.building || state.execution.submitting ? 'disabled' : ''}
          >${state.execution.building ? 'Preparing review…' : `Review ${isBuy ? 'Buy' : 'Sell'}`}</button>
        `;
      }
      regions.tradeTicket.innerHTML = `
        <section
          class="ft-ticket ft-ownership-ticket"
          data-ft-role="ownership-trade-ticket"
          data-ft-order-side="${isBuy ? 'buy' : 'sell'}"
          data-ft-order-type="${escapeHtml(orderType)}"
        >
          <div class="ft-ownership-side-tabs" role="tablist" aria-label="Ownership order side">
            <button
              type="button"
              role="tab"
              data-ft-action="select-ownership-side"
              data-ft-side="buy"
              aria-selected="${isBuy}"
              class="${isBuy ? 'ft-is-active' : ''}"
            >Buy</button>
            <button
              type="button"
              role="tab"
              data-ft-action="select-ownership-side"
              data-ft-side="sell"
              aria-selected="${!isBuy}"
              class="${!isBuy ? 'ft-is-active' : ''}"
            >Sell</button>
          </div>

          <div class="ft-ownership-order-tabs" role="tablist" aria-label="Ownership order type">
            <button
              type="button"
              role="tab"
              data-ft-action="select-ownership-order-type"
              data-ft-order-type="market"
              aria-selected="${orderType === 'market'}"
              class="${orderType === 'market' ? 'ft-is-active' : ''}"
            >Market</button>
            <button
              type="button"
              role="tab"
              data-ft-action="select-ownership-order-type"
              data-ft-order-type="smart-fill"
              aria-selected="${orderType === 'smart-fill'}"
              class="${orderType === 'smart-fill' ? 'ft-is-active' : ''}"
            >Smart Fill</button>
            <button
              type="button"
              role="tab"
              data-ft-action="select-ownership-order-type"
              data-ft-order-type="limit"
              aria-selected="${orderType === 'limit'}"
              class="${orderType === 'limit' ? 'ft-is-active' : ''}"
            >Limit</button>
            <button
              type="button"
              role="tab"
              data-ft-action="select-ownership-order-type"
              data-ft-order-type="pro"
              aria-selected="${orderType === 'pro'}"
              class="${orderType === 'pro' ? 'ft-is-active' : ''}"
            >Pro <span class="ft-ownership-chevron" aria-hidden="true"></span></button>
          </div>

          <div class="ft-ownership-order-body">
            <label class="ft-ownership-swap-field">
              <span class="ft-ownership-field-label">Pay with</span>
              <input
                type="number"
                min="0"
                step="any"
                inputmode="decimal"
                value="${escapeHtml(state.ownershipOrder.amount)}"
                placeholder="0"
                data-ft-role="ownership-amount"
                aria-label="Amount of ${escapeHtml(inputSymbol)} to pay"
              >
              <span class="ft-ownership-asset">
                ${inputLogo}
                <strong>${escapeHtml(inputSymbol)}</strong>
                <span class="ft-ownership-chevron" aria-hidden="true"></span>
              </span>
            </label>
            <div class="ft-ownership-balance">
              <span class="ft-ownership-wallet-icon" aria-hidden="true"></span>
              <span>0 ${escapeHtml(inputSymbol)}</span>
            </div>

            <div class="ft-ownership-presets" aria-label="Quick order amounts">
              ${[100, 500, 1_000].map(amount => `
                <button
                  type="button"
                  data-ft-action="ownership-amount-preset"
                  data-ft-amount="${amount}"
                >${amount.toLocaleString('en-US')}</button>
              `).join('')}
              <button type="button" data-ft-action="ownership-amount-preset" data-ft-amount="max">Max</button>
              <button
                class="ft-ownership-settings"
                type="button"
                aria-label="Order settings"
                title="Order settings"
              >
                <span aria-hidden="true"></span>
              </button>
            </div>

            <div class="ft-ownership-swap-field ft-ownership-receive-field">
              <span class="ft-ownership-field-label">Receive</span>
              <output data-ft-role="ownership-receive-amount">${output
                ? `${routedQuote ? '' : '≈ '}${formatTokenAmount(output, 6)}`
                : '≈ 0'}</output>
              <span class="ft-ownership-asset">
                ${outputLogo}
                <strong>${escapeHtml(outputSymbol)}</strong>
                <span class="ft-ownership-chevron" aria-hidden="true"></span>
              </span>
            </div>
            <div class="ft-ownership-balance">
              <span class="ft-ownership-wallet-icon" aria-hidden="true"></span>
              <span>0 ${escapeHtml(outputSymbol)}</span>
            </div>
          </div>

          ${connectCta}
          ${state.ownershipOrder.quoteError
            ? `<p class="ft-ticket-error">${escapeHtml(state.ownershipOrder.quoteError)}</p>`
            : ''}

          <dl class="ft-ownership-order-details">
            <div><dt>Est. Price Impact</dt><dd>${Number.isFinite(routedQuote?.priceImpactPercent)
              ? `${routedQuote.priceImpactPercent.toFixed(2)}%`
              : '—'}</dd></div>
            <div><dt>Max slippage</dt><dd><span>${(state.ownershipOrder.slippageBps / 100).toFixed(2)}%</span></dd></div>
            <div><dt>Platform fee</dt><dd>${Number.isFinite(routedQuote?.platformFeeBps)
              ? `${(routedQuote.platformFeeBps / 100).toFixed(2)}%`
              : '0.00%'}</dd></div>
            <div><dt>Route</dt><dd>${routedQuote?.route?.length
              ? escapeHtml(routedQuote.route.map(leg => leg.venue).join(' → '))
              : 'via DFlow'}</dd></div>
          </dl>
        </section>
      `;
      return;
    }

    const market = selectedMarket();
    if (!market) {
      regions.tradeTicket.innerHTML = `
        <section class="ft-ticket ft-ticket-empty">
          <span class="ft-kicker">Trade intent</span>
          <h2>Select an open market</h2>
          <p>Compare PASS and FAIL outcomes before opening the official execution venue.</p>
        </section>
      `;
      return;
    }
    if (market.proposal.statusGroup !== 'live') {
      const isResolvedOutcome = market.proposal.statusGroup === 'passed'
        || market.proposal.statusGroup === 'failed';
      const displayStatus = proposalDisplayStatus(market.proposal);
      const redemption = state.wallet.redemption;
      const claimAmounts = redemption?.claims
        ?.filter(claim => /^\d+$/.test(String(claim.estimatedRaw || ''))
          && BigInt(claim.estimatedRaw) > 0n)
        .map(claim => `${claim.estimatedAmount} ${claim.symbol}`)
        .join(' + ');
      let settlementAction = '';
      if (isResolvedOutcome && !state.wallet.address) {
        settlementAction = `
          <button class="ft-primary-button" type="button" data-ft-action="connect-wallet">
            Connect wallet to check claims
          </button>
        `;
      } else if (isResolvedOutcome && state.wallet.positionsLoading) {
        settlementAction = '<button class="ft-primary-button" type="button" disabled aria-busy="true">Verifying settlement…</button>';
      } else if (isResolvedOutcome && state.wallet.positionsError) {
        settlementAction = `
          <p class="ft-ticket-error">${escapeHtml(state.wallet.positionsError)}</p>
          <button class="ft-primary-button" type="button" data-ft-action="refresh-positions">Retry verification</button>
        `;
      } else if (isResolvedOutcome && redemption?.hasRedeemableBalance) {
        settlementAction = `
          <div class="ft-claim-estimate">
            <span>Verified redeemable value</span>
            <strong>${escapeHtml(claimAmounts || 'Winning conditional balance')}</strong>
            <small>Resolved ${escapeHtml(redemption.outcome?.toUpperCase() || '')} payout · MetaDAO conditional vault v0.4</small>
          </div>
          <button
            class="ft-primary-button"
            type="button"
            ${state.programIntegrity.canTransact ? 'data-ft-action="review-redeem"' : ''}
            ${!state.programIntegrity.canTransact || state.execution.building || state.execution.submitting ? 'disabled' : ''}
            ${state.execution.building || state.execution.submitting ? 'aria-busy="true"' : ''}
          >${!state.programIntegrity.canTransact
            ? 'Redemption paused · program review required'
            : state.execution.building
              ? 'Building & simulating…'
              : 'Review redemption'}</button>
        `;
      } else if (isResolvedOutcome && state.wallet.address && redemption) {
        settlementAction = '<button class="ft-primary-button" type="button" disabled>No winning balance to redeem</button>';
      }
      regions.tradeTicket.innerHTML = `
        <section
          class="ft-ticket ft-archive-ticket${isResolvedOutcome
            ? ` ft-execution-ticket ft-order-outcome-${market.proposal.statusGroup === 'failed' ? 'fail' : 'pass'}`
            : ''}"
          data-ft-role="proposal-archive"
        >
          <div class="ft-ticket-heading">
            <div><span class="ft-kicker">${isResolvedOutcome ? 'Resolved decision' : 'Indexed record'}</span><h2>${escapeHtml(market.ticker)} proposal archive</h2></div>
            <span
              class="ft-archive-status ft-archive-status-${escapeHtml(displayStatus.key)}"
              data-ft-role="proposal-status"
              data-ft-status="${escapeHtml(displayStatus.key)}"
              data-ft-outcome="${escapeHtml(market.proposal.statusGroup)}"
            >${escapeHtml(displayStatus.label)}</span>
          </div>
          ${isResolvedOutcome ? renderHistoricalTradePreview(market) : `
            <div class="ft-archive-ticket-state">
              <span aria-hidden="true">⌁</span>
              <h3>Trading is unavailable</h3>
              <p>This indexed proposal record is not an open validated market and cannot accept a trade intent.</p>
            </div>
            <button
              class="ft-primary-button"
              type="button"
              data-ft-role="archived-trade-cta"
              disabled
            >Not tradable</button>
          `}
          ${isResolvedOutcome ? `
            <div class="ft-archive-settlement">
              <span class="ft-kicker">Settlement</span>
              <h3>Redeem resolved positions</h3>
              <p>Settlement is available only after the proposal, DAO, vaults, mints, and binary payout independently match on-chain.</p>
              ${settlementAction}
            </div>
          ` : ''}
          ${renderTicketTransactionStatus(market)}
          ${market.proposal.sourceUrl ? `
            <a
              class="ft-archive-source-link"
              href="${escapeHtml(market.proposal.sourceUrl)}"
              target="_blank"
              rel="noreferrer"
            >Open governance record <span aria-hidden="true">↗</span></a>
          ` : ''}
          <div class="ft-execution-boundary">
            <span aria-hidden="true">◇</span>
            <p>Any displayed market values are labeled by their observation time and are not executable quotes.</p>
          </div>
        </section>
      `;
      return;
    }
    if (!market.proposal.tradable) {
      regions.tradeTicket.innerHTML = `
        <section class="ft-ticket ft-ticket-empty">
          <span class="ft-kicker">Live proposal</span>
          <h2>Validated market unavailable</h2>
          <p>This proposal remains pending, but NAVgator does not have a validated tradable FutAMM market state. No execution action is shown.</p>
          ${market.proposal.sourceUrl ? `
            <a class="ft-archive-source-link" href="${escapeHtml(market.proposal.sourceUrl)}" target="_blank" rel="noreferrer">Open proposal source ↗</a>
          ` : ''}
        </section>
      `;
      return;
    }

    renderExecutionTicket(market);
    return;

    const amount = firstNumber(state.order.amount);
    const estimate = executionEstimate(
      market,
      state.order.outcome,
      state.order.side,
      amount,
      state.order.slippageBps,
    );
    const outcome = state.order.outcome.toUpperCase();
    const side = state.order.side === 'buy' ? 'Buy' : 'Sell';
    const inputSymbol = state.order.side === 'buy' ? 'USDC' : `${outcome} ${market.ticker}`;

    regions.tradeTicket.innerHTML = `
      <section class="ft-ticket">
        <div class="ft-ticket-heading">
          <div><span class="ft-kicker">Trade intent</span><h2>${escapeHtml(market.ticker)} decision market</h2></div>
          <span class="ft-external-badge">External execution</span>
        </div>

        <div class="ft-ticket-field">
          <span class="ft-ticket-label">Outcome</span>
          <div class="ft-segmented" role="group" aria-label="Select outcome">
            <button
              type="button"
              data-ft-action="select-outcome"
              data-ft-outcome="pass"
              aria-pressed="${state.order.outcome === 'pass'}"
              class="${state.order.outcome === 'pass' ? 'ft-segment-active ft-segment-pass' : ''}"
            >PASS</button>
            <button
              type="button"
              data-ft-action="select-outcome"
              data-ft-outcome="fail"
              aria-pressed="${state.order.outcome === 'fail'}"
              class="${state.order.outcome === 'fail' ? 'ft-segment-active ft-segment-fail' : ''}"
            >FAIL</button>
          </div>
        </div>

        <div class="ft-ticket-field">
          <span class="ft-ticket-label">Direction</span>
          <div class="ft-segmented" role="group" aria-label="Select trade direction">
            <button
              type="button"
              data-ft-action="select-side"
              data-ft-side="buy"
              aria-pressed="${state.order.side === 'buy'}"
              class="${state.order.side === 'buy' ? 'ft-segment-active' : ''}"
            >Buy</button>
            <button
              type="button"
              data-ft-action="select-side"
              data-ft-side="sell"
              aria-pressed="${state.order.side === 'sell'}"
              class="${state.order.side === 'sell' ? 'ft-segment-active' : ''}"
            >Sell</button>
          </div>
        </div>

        <label class="ft-amount-field">
          <span class="ft-ticket-label">Amount</span>
          <span class="ft-amount-input-wrap">
            <input
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              placeholder="0.00"
              value="${escapeHtml(state.order.amount)}"
              data-ft-role="amount"
              aria-label="Trade amount in ${escapeHtml(inputSymbol)}"
            >
            <strong>${escapeHtml(inputSymbol)}</strong>
          </span>
        </label>

        <label class="ft-slippage-field">
          <span>
            <span class="ft-ticket-label">Slippage reference</span>
            <small>Final venue requotes</small>
          </span>
          <select data-ft-role="slippage" aria-label="Slippage reference">
            <option value="50"${state.order.slippageBps === 50 ? ' selected' : ''}>0.5%</option>
            <option value="100"${state.order.slippageBps === 100 ? ' selected' : ''}>1.0%</option>
            <option value="200"${state.order.slippageBps === 200 ? ' selected' : ''}>2.0%</option>
          </select>
        </label>

        <div class="ft-estimate" data-ft-role="estimate">
          <div><span>Reference spot</span><strong>${formatPrice(estimate?.price || (state.order.outcome === 'pass' ? market.pass.price : market.fail.price))}</strong></div>
          <div><span>Indicative output</span><strong>${estimate ? `${formatTokenAmount(estimate.output, 6)} ${escapeHtml(estimate.outputSymbol)}` : 'Enter an amount'}</strong></div>
          <p>This is a spot reference, not a route quote. Fees, pool movement, and the opposite conditional leg are resolved by the execution venue.</p>
        </div>

        ${market.proposal.executionUrl ? `
          <a
            class="ft-primary-button"
            href="${escapeHtml(market.proposal.executionUrl)}"
            target="_blank"
            rel="noreferrer"
            data-ft-action="open-execution"
          >Open proposal on MetaDAO <span aria-hidden="true">↗</span></a>
        ` : '<button class="ft-primary-button" type="button" disabled>Execution venue unavailable</button>'}

        <div class="ft-execution-boundary">
          <span aria-hidden="true">⌁</span>
          <p><strong>NAVgator will not request a signature.</strong> Re-enter and verify the intent on MetaDAO. The wallet preview is the source of truth.</p>
        </div>
      </section>
    `;
  }

  function recurringScheduleBranch(schedule, market, data) {
    return ['pass', 'fail'].find((candidate) => {
      const candidateBook = data?.books?.[candidate];
      const candidateBaseMint = candidate === 'pass'
        ? market?.proposal?.passBaseMint
        : market?.proposal?.failBaseMint;
      const candidateQuoteMint = candidate === 'pass'
        ? market?.proposal?.passQuoteMint
        : market?.proposal?.failQuoteMint;
      return (
        candidateBook?.baseMint === schedule.baseMint
        && candidateBook?.quoteMint === schedule.quoteMint
      ) || (
        candidateBaseMint === schedule.baseMint
        && candidateQuoteMint === schedule.quoteMint
      );
    }) || '';
  }

  function renderRecurringVaults(market, data) {
    if (!state.recurring.programId) return '';
    const recurringSchedules = state.recurring.schedules;
    let recurringBody = '';
    if (!state.wallet.address) {
      recurringBody = '<div class="ft-activity-empty"><p>Connect a wallet to view automatic schedules.</p></div>';
    } else if (state.recurring.loading) {
      recurringBody = '<div class="ft-activity-empty"><span class="ft-loader"></span><p>Reading recurring vaults…</p></div>';
    } else if (state.recurring.error) {
      recurringBody = `<div class="ft-activity-empty"><p>${escapeHtml(state.recurring.error)}</p><button type="button" data-ft-action="refresh-recurring">Retry</button></div>`;
    } else if (!recurringSchedules.length) {
      recurringBody = '<div class="ft-activity-empty"><p>No recurring schedules for this proposal.</p></div>';
    } else {
      recurringBody = `
        <div class="ft-recurring-list">
          ${recurringSchedules.map((schedule) => {
            const branch = recurringScheduleBranch(schedule, market, data);
            const inputDecimals = schedule.isBaseIn
              ? market.baseDecimals
              : market.quoteDecimals;
            const inputSymbol = schedule.isBaseIn
              ? market.ticker
              : 'USDC';
            const outputDecimals = schedule.isBaseIn
              ? market.quoteDecimals
              : market.baseDecimals;
            const outputSymbol = schedule.isBaseIn
              ? `${branch ? branch.toUpperCase() : 'PROP'} USDC`
              : `${branch ? branch.toUpperCase() : 'PROP'} ${market.ticker}`;
            const unspentInput = safeRawTokenAmount(schedule.unspentInputRaw);
            const unclaimedOutput = safeRawTokenAmount(schedule.unclaimedOutputRaw);
            const now = Math.floor(Date.now() / 1_000);
            const status = !schedule.active
              ? 'Complete'
              : now >= schedule.expiresAt
                ? 'Expired'
                : 'Active';
            return `
              <div class="ft-recurring-row">
                <span class="ft-recurring-state ft-recurring-state-${status.toLowerCase()}">${escapeHtml(status)}</span>
                <div>
                  <strong>${escapeHtml(schedule.side.toUpperCase())} ${escapeHtml(branch ? branch.toUpperCase() : 'PROP')}</strong>
                  <small>${escapeHtml(formatRawTokenAmount(schedule.amountPerCycleRaw, inputDecimals))} ${escapeHtml(inputSymbol)} · every ${escapeHtml(formatIntervalDuration(schedule.intervalSeconds))}</small>
                  <small>${escapeHtml(formatRawTokenAmount(unspentInput, inputDecimals))} ${escapeHtml(inputSymbol)} unspent</small>
                </div>
                <div>
                  <strong>${schedule.cyclesExecuted}/${schedule.totalCycles}</strong>
                  <small>${schedule.active && now < schedule.expiresAt
                    ? `Next ${escapeHtml(formatRelativeTime(new Date(schedule.nextExecutionAt * 1_000).toISOString()))}`
                    : 'No more runs'}</small>
                  ${unclaimedOutput > 0n
                    ? `<small>${escapeHtml(formatRawTokenAmount(unclaimedOutput, outputDecimals))} ${escapeHtml(outputSymbol)} ready</small>`
                    : ''}
                </div>
                <div class="ft-recurring-actions">
                  ${unclaimedOutput > 0n ? `
                    <button
                      class="ft-recurring-claim"
                      type="button"
                      data-ft-action="claim-recurring"
                      data-ft-schedule="${escapeHtml(schedule.address)}"
                      data-ft-outcome="${escapeHtml(branch || 'prop')}"
                    >Claim</button>
                  ` : ''}
                  <button
                    type="button"
                    data-ft-action="cancel-recurring"
                    data-ft-schedule="${escapeHtml(schedule.address)}"
                  >Cancel & withdraw</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="ft-recurring-schedules">
        <div class="ft-recurring-schedules-heading">
          <span>
            <small>Automatic vaults${state.recurring.enabled ? '' : ' · new schedules paused'}</small>
            <strong>Recurring orders</strong>
          </span>
          ${state.wallet.address ? '<button type="button" data-ft-action="refresh-recurring">Refresh</button>' : ''}
        </div>
        ${recurringBody}
      </div>
    `;
  }

  function renderExecutionActivity(market) {
    const entry = state.marketDataByProposal.get(market.id);
    const data = entry?.data;
    const openOrders = data?.openOrders || [];
    const recentTrades = data?.recentTrades || [];
    const positions = state.wallet.positions;
    const withdrawableBooks = ['pass', 'fail']
      .map((branch) => {
        const book = data?.books?.[branch];
        const balances = (book?.depositedBalances || [])
          .filter(balance => balance.amount > 0);
        return book?.canonical && book.address && balances.length
          ? { branch, book, balances }
          : null;
      })
      .filter(Boolean);
    let orderBody = '';
    if (!state.wallet.address) {
      orderBody = `
        <div class="ft-activity-empty">
          <p>Connect a wallet to view your resting limit orders.</p>
          <button type="button" data-ft-action="connect-wallet">Connect wallet</button>
        </div>
      `;
    } else if (entry?.loading && entry.owner === state.wallet.address && !data) {
      orderBody = '<div class="ft-activity-empty"><span class="ft-loader"></span><p>Reading open orders…</p></div>';
    } else if (!openOrders.length) {
      orderBody = '<div class="ft-activity-empty"><p>No open PASS or FAIL limit orders for this wallet.</p></div>';
    } else {
      orderBody = `
        <div class="ft-orders-table-wrap">
          <table class="ft-orders-table">
            <thead><tr><th>Market</th><th>Side</th><th>Price</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              ${openOrders.map(order => `
                <tr>
                  <td><span class="ft-trade-branch ft-trade-branch-${escapeHtml(order.branch)}">${escapeHtml(order.branch.toUpperCase())}</span></td>
                  <td>${order.side === 'bid' ? 'BUY' : 'SELL'}</td>
                  <td>${formatChartPrice(order.price)}</td>
                  <td>${formatTokenAmount(order.amount, 4)}</td>
                  <td>
                    <button
                      class="ft-order-cancel"
                      type="button"
                      data-ft-action="cancel-order"
                      data-ft-market="${escapeHtml(order.market)}"
                      data-ft-client-order-id="${escapeHtml(order.clientOrderId)}"
                      data-ft-outcome="${escapeHtml(order.branch)}"
                    >Cancel</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    const tradeBody = recentTrades.length ? `
      <div class="ft-trades-table-wrap">
        <table class="ft-trades-table">
          <thead><tr><th>Time</th><th>Mkt</th><th>Side</th><th>Price</th><th>Value</th><th>Venue</th></tr></thead>
          <tbody>
            ${recentTrades.map((trade) => {
              const time = trade.blockTime
                ? new Date(trade.blockTime).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
                : '—';
              return `
                <tr>
                  <td>${escapeHtml(time)}</td>
                  <td><span class="ft-trade-branch ft-trade-branch-${escapeHtml(trade.branch)}">${escapeHtml(trade.branch.toUpperCase())}</span></td>
                  <td class="${trade.side === 'buy' ? 'ft-positive' : 'ft-negative'}">${trade.side === 'buy' ? 'B' : 'S'}</td>
                  <td>${formatChartPrice(trade.price)}</td>
                  <td>${Number.isFinite(trade.volumeUsd) ? formatCompactMoney(trade.volumeUsd) : '—'}</td>
                  <td><a href="https://solscan.io/tx/${escapeHtml(trade.signature)}" target="_blank" rel="noreferrer">${trade.venue === 'manifest' ? 'BOOK' : 'AMM'} ↗</a></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div class="ft-activity-empty">
        <p>${entry?.loading ? 'Loading recent executions…' : entry?.error || 'No recent indexed executions.'}</p>
      </div>
    `;

    const showAutomatic = Boolean(
      state.recurring.programId
      || state.recurring.schedules.length,
    );
    if (state.activityTab === 'automatic' && !showAutomatic) {
      state.activityTab = 'balances';
    }
    const balanceBody = !state.wallet.address
      ? `
        <div class="ft-activity-empty">
          <p>Connect a wallet to read conditional and Manifest balances. Connection never requests a signature.</p>
          <button type="button" data-ft-action="connect-wallet">Connect wallet</button>
        </div>
      `
      : `
        ${positions.length ? `
          <div class="ft-conditional-balances">
            ${positions.map(position => `
              <span><small>${escapeHtml(position.label)}</small><strong>${position.available
                ? escapeHtml(position.amountString || formatTokenAmount(position.amount, 6))
                : 'Unavailable'}</strong></span>
            `).join('')}
          </div>
        ` : '<div class="ft-activity-empty"><p>No conditional balances found for this proposal.</p></div>'}
        ${withdrawableBooks.length ? `
          <div class="ft-manifest-withdrawable" data-ft-role="manifest-withdrawable">
            ${withdrawableBooks.map(({ branch, book, balances }) => `
              <div>
                <span>
                  <small>${escapeHtml(branch.toUpperCase())} market balance</small>
                  <strong>${balances.map(balance => escapeHtml(
                    `${formatTokenAmount(balance.amount, 6)} ${balance.asset === 'base'
                      ? `${branch.toUpperCase()} ${market.ticker}`
                      : `${branch.toUpperCase()} USDC`}`,
                  )).join(' · ')}</strong>
                </span>
                <button
                  type="button"
                  data-ft-action="withdraw-manifest"
                  data-ft-market="${escapeHtml(book.address)}"
                  data-ft-outcome="${escapeHtml(branch)}"
                >Withdraw</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;

    regions.positions.innerHTML = `
      <section class="ft-account-activity">
        <header class="ft-account-activity-header">
          <div><span class="ft-kicker">Account activity</span><h2>Positions and orders</h2></div>
          ${state.wallet.address ? `<button class="ft-text-button" type="button" data-ft-action="refresh-positions">Refresh</button>` : ''}
        </header>
        <div class="ft-activity-tabs" role="tablist" aria-label="Account activity">
          ${[
            ['balances', 'Balances'],
            ['orders', 'Open orders'],
            ['trades', 'Trade history'],
            ...(showAutomatic ? [['automatic', 'Automatic']] : []),
          ].map(([key, label]) => `
            <button
              type="button"
              role="tab"
              data-ft-action="select-activity"
              data-ft-activity="${key}"
              aria-selected="${state.activityTab === key}"
              class="${state.activityTab === key ? 'ft-activity-tab-active' : ''}"
            >${label}${key === 'orders' && openOrders.length ? ` <small>${openOrders.length}</small>` : ''}${key === 'trades' && recentTrades.length ? ` <small>${recentTrades.length}</small>` : ''}</button>
          `).join('')}
        </div>
        <div class="ft-activity-panel" data-ft-activity-panel="balances"${state.activityTab === 'balances' ? '' : ' hidden'}>
          ${balanceBody}
        </div>
        <div class="ft-activity-panel" data-ft-activity-panel="orders"${state.activityTab === 'orders' ? '' : ' hidden'}>
          ${orderBody}
        </div>
        <div class="ft-activity-panel" data-ft-activity-panel="trades"${state.activityTab === 'trades' ? '' : ' hidden'}>
          ${tradeBody}
          ${renderTransactionActivity(market)}
          <p class="ft-activity-source">Public AMM and Manifest execution index · wallet not required</p>
        </div>
        ${showAutomatic ? `
          <div class="ft-activity-panel" data-ft-activity-panel="automatic"${state.activityTab === 'automatic' ? '' : ' hidden'}>
            ${renderRecurringVaults(market, data)}
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderTokenAccountActivity({
    label,
    body,
  }) {
    const activityTab = ['balances', 'orders', 'trades'].includes(
      state.ownershipActivityTab,
    )
      ? state.ownershipActivityTab
      : 'balances';
    state.ownershipActivityTab = activityTab;
    regions.ownershipAccount.innerHTML = `
      <section
        class="ft-ownership-account"
        data-ft-role="ownership-account-activity"
        aria-label="${escapeHtml(label)} account activity"
      >
        <div class="ft-ownership-account-tabs" role="tablist" aria-label="Trading account views">
          ${[
            ['balances', 'Balances'],
            ['orders', 'Open Orders'],
            ['trades', 'Trade History'],
          ].map(([key, tabLabel]) => `
            <button
              type="button"
              role="tab"
              data-ft-action="select-ownership-activity"
              data-ft-ownership-activity="${key}"
              aria-selected="${activityTab === key}"
              class="${activityTab === key ? 'ft-is-active' : ''}"
            >${tabLabel}</button>
          `).join('')}
        </div>
        <div
          class="ft-ownership-account-panel"
          role="tabpanel"
          data-ft-ownership-activity-panel="${escapeHtml(activityTab)}"
        >${body}</div>
      </section>
    `;
  }

  function renderOwnershipAccountActivity(asset, transactions) {
    const activityTab = ['balances', 'orders', 'trades'].includes(
      state.ownershipActivityTab,
    )
      ? state.ownershipActivityTab
      : 'balances';
    state.ownershipActivityTab = activityTab;
    const walletTransactions = state.wallet.address
      ? transactions.filter(transaction => (
        transaction.trader
        && transaction.trader.toLowerCase() === state.wallet.address.toLowerCase()
      ))
      : [];
    let accountBody = '';
    if (!state.wallet.address) {
      accountBody = `Connect wallet to view ${activityTab === 'orders'
        ? 'open orders'
        : activityTab === 'trades'
          ? 'trade history'
          : 'balances'}`;
    } else if (activityTab === 'orders') {
      accountBody = 'No open spot orders for this wallet';
    } else if (activityTab === 'trades') {
      accountBody = walletTransactions.length
        ? `
          <div class="ft-ownership-account-trades">
            ${walletTransactions.map(transaction => `
              <span class="ft-ownership-account-trade">
                <strong data-side="${escapeHtml(transaction.side)}">${escapeHtml(transaction.side.toUpperCase())}</strong>
                <span>${Number.isFinite(transaction.price)
                  ? formatChartCurrency(transaction.price)
                  : '—'}</span>
                <span>${Number.isFinite(transaction.size)
                  ? formatTokenAmount(transaction.size, 4)
                  : Number.isFinite(transaction.valueUsd)
                    ? formatCompactMoney(transaction.valueUsd)
                    : '—'}</span>
                <span>${transaction.time
                  ? escapeHtml(formatRelativeTime(transaction.time))
                  : '—'}</span>
              </span>
            `).join('')}
          </div>
        `
        : 'No indexed spot trades for this wallet';
    } else {
      accountBody = 'No indexed spot balances for this wallet';
    }

    renderTokenAccountActivity({
      label: asset.ticker,
      body: accountBody,
    });
  }

  function renderDecisionAccountActivity(market, transactions) {
    const activityTab = ['balances', 'orders', 'trades'].includes(
      state.ownershipActivityTab,
    )
      ? state.ownershipActivityTab
      : 'balances';
    const entry = state.marketDataByProposal.get(market.id);
    const openOrders = entry?.data?.openOrders || [];
    let accountBody = '';
    if (!state.wallet.address) {
      accountBody = `Connect wallet to view ${activityTab === 'orders'
        ? 'open orders'
        : activityTab === 'trades'
          ? 'trade history'
          : 'balances'}`;
    } else if (activityTab === 'orders') {
      accountBody = openOrders.length
        ? `
          <div class="ft-ownership-account-trades">
            ${openOrders.map(order => `
              <span class="ft-ownership-account-trade">
                <strong data-side="${order.side === 'ask' ? 'sell' : 'buy'}">${escapeHtml(order.branch.toUpperCase())}</strong>
                <span>${order.side === 'ask' ? 'SELL' : 'BUY'}</span>
                <span>${formatChartPrice(order.price)}</span>
                <span>${formatTokenAmount(order.amount, 4)}</span>
              </span>
            `).join('')}
          </div>
        `
        : 'No open decision-market orders for this wallet';
    } else if (activityTab === 'trades') {
      accountBody = transactions.length
        ? `
          <div class="ft-ownership-account-trades">
            ${transactions.map(transaction => `
              <span class="ft-ownership-account-trade">
                <strong data-side="${escapeHtml(transaction.side)}">${escapeHtml(transaction.branch.toUpperCase())}</strong>
                <span>${formatChartPrice(transaction.price)}</span>
                <span>${Number.isFinite(transaction.baseAmount)
                  ? formatTokenAmount(transaction.baseAmount, 4)
                  : Number.isFinite(transaction.volumeUsd)
                    ? formatCompactMoney(transaction.volumeUsd)
                    : '—'}</span>
                <span>${transaction.blockTime
                  ? escapeHtml(formatRelativeTime(transaction.blockTime))
                  : '—'}</span>
              </span>
            `).join('')}
          </div>
        `
        : 'No indexed decision-market trades for this wallet';
    } else {
      accountBody = state.wallet.positions.length
        ? `
          <div class="ft-ownership-account-trades">
            ${state.wallet.positions.map(position => `
              <span class="ft-ownership-account-trade">
                <strong>${escapeHtml(position.label)}</strong>
                <span>${position.available ? 'Available' : 'Unavailable'}</span>
                <span>${position.available
                  ? escapeHtml(position.amountString || formatTokenAmount(position.amount, 6))
                  : '—'}</span>
                <span>${escapeHtml(market.ticker)}</span>
              </span>
            `).join('')}
          </div>
        `
        : 'No indexed decision-market balances for this wallet';
    }

    renderTokenAccountActivity({
      label: `${market.ticker} proposal`,
      body: accountBody,
    });
  }

  function renderPositions() {
    if (isOwnershipWorkspace()) {
      const asset = ownershipTokenSnapshot();
      const transactions = asset.recentTransactions || [];
      const showTransactionSizesInUsd = state.transactionSizeUnit === 'usd';
      const sizeUnit = showTransactionSizesInUsd ? 'USD' : asset.ticker;
      renderOwnershipAccountActivity(asset, transactions);
      regions.positions.innerHTML = `
        <section
          class="ft-ownership-transactions"
          data-ft-role="ownership-recent-transactions"
          aria-label="Recent ${escapeHtml(asset.ticker)} transactions"
        >
          <header class="ft-ownership-transactions-header">
            <strong>Trades</strong>
            <span>${transactions.length}</span>
          </header>
          <div class="ft-ownership-transactions-columns" aria-label="Transaction columns">
            <span>Price</span>
            <span class="ft-transaction-size-heading">
              <span>Size</span>
              <button
                type="button"
                data-ft-action="toggle-transaction-size-unit"
                data-ft-role="transaction-size-unit"
                data-ft-size-unit="${escapeHtml(state.transactionSizeUnit)}"
                aria-label="Show transaction sizes in ${escapeHtml(showTransactionSizesInUsd ? asset.ticker : 'USD')}"
                title="Show sizes in ${escapeHtml(showTransactionSizesInUsd ? asset.ticker : 'USD')}"
              >${escapeHtml(sizeUnit)}</button>
            </span>
            <span>Trader</span>
            <span>Age</span>
          </div>
          <div class="ft-ownership-transactions-list">
            ${transactions.length ? transactions.map((transaction) => {
              const rowContent = `
                <span class="ft-ownership-transaction-price" data-side="${escapeHtml(transaction.side)}">${Number.isFinite(transaction.price)
                  ? formatChartCurrency(transaction.price)
                  : '—'}</span>
                <span class="ft-ownership-transaction-size" data-ft-role="transaction-size">${showTransactionSizesInUsd
                  ? formatTransactionSizeUsd(ownershipTradeVolumeUsd(transaction))
                  : Number.isFinite(transaction.size)
                    ? formatTokenAmount(transaction.size, 4)
                    : '—'}</span>
                <span title="${escapeHtml(transaction.trader)}">${transaction.trader
                  ? escapeHtml(shortenAddress(transaction.trader, 3))
                  : '—'}</span>
                <span>${transaction.time
                  ? escapeHtml(formatRelativeTime(transaction.time).replace(/\s+ago$/i, ''))
                  : '—'}</span>
              `;
              return transaction.signature
                ? `
                  <a
                    class="ft-ownership-transaction-row"
                    href="https://solscan.io/tx/${escapeHtml(transaction.signature)}"
                    target="_blank"
                    rel="noreferrer"
                    title="Open transaction on Solscan"
                  >${rowContent}</a>
                `
                : `<div class="ft-ownership-transaction-row">${rowContent}</div>`;
            }).join('') : `
              <div class="ft-ownership-transactions-empty">
                No recent indexed transactions
              </div>
            `}
          </div>
          <p class="ft-ownership-transactions-source">Public indexed spot activity</p>
        </section>
      `;
      return;
    }

    regions.ownershipAccount.innerHTML = '';
    const market = selectedMarket();
    if (state.hostMode === 'token' && market) {
      const entry = state.marketDataByProposal.get(market.id);
      const transactions = entry?.data?.recentTrades || [];
      const showTransactionSizesInUsd = state.transactionSizeUnit === 'usd';
      const sizeUnit = showTransactionSizesInUsd ? 'USD' : market.ticker;
      const transactionVolumes = transactions
        .map(decisionTradeVolumeUsd)
        .filter(Number.isFinite);
      const recentVolumeUsd = transactionVolumes.length
        ? transactionVolumes.reduce((total, volume) => total + volume, 0)
        : null;
      const recentVolumeLabel = formatTradeVolume(recentVolumeUsd);
      const supportSummary = ['pass', 'fail'].reduce((summary, support) => {
        const supportTransactions = transactions.filter(transaction => (
          decisionTradeSupport(transaction) === support
        ));
        const volumes = supportTransactions
          .map(decisionTradeVolumeUsd)
          .filter(Number.isFinite);
        summary[support] = {
          count: supportTransactions.length,
          transactions: supportTransactions,
          volumeLabel: formatTradeVolume(
            volumes.length
              ? volumes.reduce((total, volume) => total + volume, 0)
              : null,
          ),
        };
        return summary;
      }, {});
      const supportFilter = ['pass', 'fail'].includes(state.decisionTradeSupportFilter)
        ? state.decisionTradeSupportFilter
        : 'all';
      const visibleTransactions = supportFilter === 'all'
        ? transactions
        : supportSummary[supportFilter].transactions;
      renderDecisionAccountActivity(market, transactions);
      regions.positions.innerHTML = `
        <section
          class="ft-ownership-transactions ft-decision-transactions"
          data-ft-role="proposal-recent-transactions"
          aria-label="Recent ${escapeHtml(market.ticker)} proposal transactions"
        >
          <header class="ft-ownership-transactions-header">
            <button
              class="ft-decision-trades-reset${supportFilter === 'all' ? ' ft-is-active' : ''}"
              type="button"
              data-ft-action="filter-decision-trades"
              data-ft-support="all"
              aria-pressed="${supportFilter === 'all'}"
              title="Show all loaded trades"
            >Trades</button>
            <div
              class="ft-decision-transaction-summary"
              role="group"
              aria-label="Filter loaded trades by the outcome they support"
              title="BUY PASS and SELL FAIL support PASS. BUY FAIL and SELL PASS support FAIL."
            >
              ${['pass', 'fail'].map(support => `
                <button
                  class="ft-decision-support-filter ft-decision-support-${support}${supportFilter === support ? ' ft-is-active' : ''}"
                  type="button"
                  data-ft-action="filter-decision-trades"
                  data-ft-support="${support}"
                  data-ft-role="decision-support-${support}"
                  aria-pressed="${supportFilter === support}"
                  aria-label="Show ${supportSummary[support].count} trades supporting ${support.toUpperCase()}, ${supportSummary[support].volumeLabel} loaded volume"
                  title="${support === 'pass'
                    ? 'Volume supporting PASS: BUY PASS and SELL FAIL'
                    : 'Volume supporting FAIL: BUY FAIL and SELL PASS'}"
                >
                  <b>${support.toUpperCase()}</b>
                </button>
              `).join('')}
              <span class="ft-sr-only" data-ft-role="proposal-recent-volume">${escapeHtml(recentVolumeLabel)}</span>
              <span class="ft-sr-only" data-ft-role="proposal-recent-count">${transactions.length}</span>
            </div>
          </header>
          <div class="ft-ownership-transactions-columns" aria-label="Transaction columns">
            <span>Price</span>
            <span class="ft-transaction-size-heading">
              <span>Size</span>
              <button
                type="button"
                data-ft-action="toggle-transaction-size-unit"
                data-ft-role="transaction-size-unit"
                data-ft-size-unit="${escapeHtml(state.transactionSizeUnit)}"
                aria-label="Show transaction sizes in ${escapeHtml(showTransactionSizesInUsd ? market.ticker : 'USD')}"
                title="Show sizes in ${escapeHtml(showTransactionSizesInUsd ? market.ticker : 'USD')}"
              >${escapeHtml(sizeUnit)}</button>
            </span>
            <span>Trade</span>
            <span>Age</span>
          </div>
          <div class="ft-ownership-transactions-list">
            ${visibleTransactions.length ? visibleTransactions.map((transaction) => `
              <a
                class="ft-ownership-transaction-row"
                href="https://solscan.io/tx/${escapeHtml(transaction.signature)}"
                target="_blank"
                rel="noreferrer"
                title="Open transaction on Solscan"
              >
                <span class="ft-ownership-transaction-price" data-side="${escapeHtml(transaction.side)}">${formatChartPrice(transaction.price)}</span>
                <span class="ft-ownership-transaction-size" data-ft-role="transaction-size">${showTransactionSizesInUsd
                  ? formatTransactionSizeUsd(decisionTradeVolumeUsd(transaction))
                  : Number.isFinite(transaction.baseAmount)
                    ? formatTokenAmount(transaction.baseAmount, 4)
                    : '—'}</span>
                <span
                  class="ft-decision-transaction-trade"
                  title="${transaction.side === 'buy' ? 'Bought' : 'Sold'} ${escapeHtml(transaction.branch.toUpperCase())}"
                >
                  <strong
                    class="ft-decision-transaction-side"
                    data-side="${escapeHtml(transaction.side)}"
                  >${transaction.side === 'buy' ? 'BUY' : 'SELL'}</strong>
                  <span
                    class="ft-decision-transaction-branch"
                    data-branch="${escapeHtml(transaction.branch)}"
                  >${escapeHtml(transaction.branch.toUpperCase())}</span>
                </span>
                <span>${transaction.blockTime
                  ? escapeHtml(formatRelativeTime(transaction.blockTime).replace(/\s+ago$/i, ''))
                  : '—'}</span>
              </a>
            `).join('') : `
              <div class="ft-ownership-transactions-empty">
                ${transactions.length && supportFilter !== 'all'
                  ? `No loaded trades supporting ${supportFilter.toUpperCase()}`
                  : entry?.loading
                  ? 'Loading recent indexed transactions'
                  : entry?.error || 'No recent indexed transactions'}
              </div>
            `}
          </div>
        </section>
      `;
      return;
    }

    if (market && market.proposal.statusGroup !== 'live') {
      const isResolved = market.proposal.statusGroup === 'passed'
        || market.proposal.statusGroup === 'failed';
      regions.positions.innerHTML = isResolved && state.recurring.programId
        ? `
          <section class="ft-orders-panel ft-resolved-recurring">
            ${renderRecurringVaults(
              market,
              state.marketDataByProposal.get(market.id)?.data,
            )}
          </section>
        `
        : '';
      return;
    }
    if (market && !market.proposal.tradable) {
      regions.positions.innerHTML = `
        <section class="ft-positions">
          <div class="ft-section-heading">
            <div><span class="ft-kicker">Portfolio</span><h2>Market unavailable</h2></div>
          </div>
          <div class="ft-positions-empty">
            <span aria-hidden="true">◇</span>
            <p>Conditional-balance reads require a validated open FutAMM market.</p>
          </div>
        </section>
      `;
      return;
    }
    if (market?.proposal.statusGroup === 'live') {
      renderExecutionActivity(market);
      return;
    }
    if (!state.wallet.address) {
      regions.positions.innerHTML = `
        <section class="ft-positions">
          <div class="ft-section-heading">
            <div><span class="ft-kicker">Portfolio</span><h2>Your positions</h2></div>
          </div>
          <div class="ft-positions-empty">
            <span aria-hidden="true">◎</span>
            <p>Connect a Solana wallet to read conditional balances. No signature is requested.</p>
            <button type="button" data-ft-action="connect-wallet">Connect to view</button>
          </div>
        </section>
      `;
      return;
    }

    let body = '';
    if (!market) {
      body = '<div class="ft-positions-empty"><p>Select a market to inspect its conditional token balances.</p></div>';
    } else if (state.wallet.positionsLoading) {
      body = '<div class="ft-positions-empty"><span class="ft-loader" aria-hidden="true"></span><p>Reading token accounts…</p></div>';
    } else if (state.wallet.positionsError) {
      body = `
        <div class="ft-positions-empty ft-positions-error">
          <p>${escapeHtml(state.wallet.positionsError)}</p>
          <button type="button" data-ft-action="refresh-positions">Try again</button>
        </div>
      `;
    } else if (!state.wallet.positions.length) {
      body = `
        <div class="ft-positions-empty">
          <span aria-hidden="true">0</span>
          <p>No balances found for this proposal’s tracked core or conditional mints.</p>
        </div>
      `;
    } else {
      body = `
        <div class="ft-position-list">
          ${state.wallet.positions.map(position => `
            <div class="ft-position-row">
              <span><strong>${escapeHtml(position.label)}</strong><small>${escapeHtml(shortenAddress(position.mint, 3))}</small></span>
              <strong>${position.available
                ? escapeHtml(position.amountString || formatTokenAmount(position.amount, 6))
                : '<span class="ft-position-unavailable">Unavailable</span>'}</strong>
            </div>
          `).join('')}
        </div>
        ${state.wallet.positionsDegraded ? '<p class="ft-position-warning">Some balance reads were unavailable and are not shown as zero.</p>' : ''}
      `;
    }

    regions.positions.innerHTML = `
      <section class="ft-positions">
        <div class="ft-section-heading">
          <div><span class="ft-kicker">Portfolio</span><h2>Your positions</h2></div>
          <button class="ft-text-button" type="button" data-ft-action="refresh-positions"${state.wallet.positionsLoading ? ' disabled' : ''}>Refresh</button>
        </div>
        <div class="ft-position-wallet">
          <span>${escapeHtml(state.wallet.name || 'Wallet')}</span>
          <strong>${escapeHtml(shortenAddress(state.wallet.address, 5))}</strong>
        </div>
        ${body}
        ${state.wallet.positionsAsOf ? `<p class="ft-position-freshness">Read at ${escapeHtml(formatDateTime(state.wallet.positionsAsOf))}${Number.isFinite(state.wallet.positionsSlot) ? ` · slot ${Math.round(state.wallet.positionsSlot).toLocaleString('en-US')}` : ''}</p>` : ''}
      </section>
    `;
  }

  function renderModal() {
    if (state.wallet.pickerOpen) {
      regions.modal.innerHTML = `
        <div class="ft-modal-backdrop" data-ft-action="close-modal">
          <section class="ft-modal ft-wallet-picker" role="dialog" aria-modal="true" aria-labelledby="${uid}-wallet-title">
            <header>
              <div><span class="ft-kicker">Wallet Standard</span><h2 id="${uid}-wallet-title">Connect a Solana wallet</h2></div>
              <button type="button" data-ft-action="close-modal" aria-label="Close">×</button>
            </header>
            <p>Connection reveals your public address and balances. It does not request a signature.</p>
            <div class="ft-wallet-options">
              ${state.wallet.options.map(option => `
                <button type="button" data-ft-action="choose-wallet" data-ft-wallet-id="${escapeHtml(option.id)}">
                  ${option.icon ? `<img src="${escapeHtml(option.icon)}" alt="">` : '<span aria-hidden="true">◎</span>'}
                  <strong>${escapeHtml(option.name)}</strong>
                  <small>${option.canTransact ? 'Trading supported' : 'Read-only connection'}</small>
                </button>
              `).join('')}
            </div>
          </section>
        </div>
      `;
      return;
    }

    if (!state.execution.reviewOpen || !state.execution.plan) {
      regions.modal.innerHTML = '';
      return;
    }
    const plan = state.execution.plan;
    const summary = plan.summary || {};
    const isSpotPlan = plan.kind === 'spot';
    const simulation = state.execution.simulation;
    const simulationClass = simulation?.ok ? 'success' : simulation ? 'error' : 'pending';
    const transactionLabel = isSpotPlan
      ? 'Spot market order'
      : plan.kind === 'conditional-setup'
        ? 'Conditional token account setup'
        : plan.kind === 'manifest-setup'
          ? 'Manifest account setup'
          : plan.kind === 'limit'
            ? 'Limit order'
            : plan.kind === 'recurring-create'
              ? 'Automatic recurring schedule'
              : plan.kind === 'recurring-cancel'
                ? 'Cancel recurring schedule'
                : plan.kind === 'recurring-claim'
                  ? 'Claim recurring proceeds'
                  : plan.kind === 'cancel'
                    ? 'Cancel limit order'
                    : plan.kind === 'withdraw'
                      ? 'Withdraw Manifest balance'
                      : plan.kind === 'redeem'
                        ? 'Redeem resolved positions'
                        : 'Conditional swap';
    regions.modal.innerHTML = `
      <div class="ft-modal-backdrop" data-ft-action="close-modal">
        <section class="ft-modal ft-review-modal" role="dialog" aria-modal="true" aria-labelledby="${uid}-review-title">
          <header>
            <div><span class="ft-kicker">Transaction review</span><h2 id="${uid}-review-title">${escapeHtml(transactionLabel)}</h2></div>
            <button type="button" data-ft-action="close-modal" aria-label="Close">×</button>
          </header>

          <div class="ft-review-action">
            <span>${escapeHtml(summary.venue || 'Solana')}</span>
            <strong>${escapeHtml(summary.action || 'ONCHAIN ACTION')}</strong>
            ${summary.note ? `<p>${escapeHtml(summary.note)}</p>` : ''}
          </div>

          <dl class="ft-review-grid">
            <div><dt>Cluster</dt><dd>Solana mainnet</dd></div>
            <div><dt>Fee payer</dt><dd title="${escapeHtml(summary.feePayer)}">${escapeHtml(shortenAddress(summary.feePayer, 6))}</dd></div>
            <div><dt>Input</dt><dd>${escapeHtml(summary.amountIn || '—')}</dd></div>
            <div><dt>${plan.kind === 'withdraw' ? 'Market' : `Input mint${plan.kind === 'redeem' ? 's' : ''}`}</dt><dd title="${escapeHtml(summary.inputMint)}">${plan.kind === 'redeem'
              ? `${summary.redemptions?.length || 0} verified claim group${summary.redemptions?.length === 1 ? '' : 's'}`
              : escapeHtml(shortenAddress(summary.inputMint, 6))}</dd></div>
            <div><dt>${plan.kind === 'limit' ? 'Order result' : 'Estimated output'}</dt><dd>${escapeHtml(summary.estimatedAmountOut || '—')}</dd></div>
            <div><dt>Minimum output</dt><dd>${escapeHtml(summary.minimumAmountOut || 'Not applicable')}</dd></div>
            <div><dt>Recipient / market</dt><dd title="${escapeHtml(summary.recipient)}">${plan.kind === 'redeem'
              ? 'Your underlying token accounts'
              : escapeHtml(shortenAddress(summary.recipient, 6))}</dd></div>
            <div><dt>Estimated network fee</dt><dd>${Number.isFinite(summary.networkFeeSol) ? `${summary.networkFeeSol} SOL` : 'Wallet will quote'}</dd></div>
            ${Number.isFinite(summary.accountRentSol)
              ? `<div><dt>${summary.accountRentSol > 0 ? 'Refundable account rent' : 'Account rent'}</dt><dd>${summary.accountRentSol > 0 ? `${summary.accountRentSol} SOL` : 'None'}</dd></div>`
              : ''}
            ${Number.isFinite(summary.keeperBudgetSol)
              ? `<div><dt>Capped keeper budget</dt><dd>${summary.keeperBudgetSol} SOL</dd></div>`
              : ''}
            ${Number.isFinite(summary.accountRentRefundSol)
              ? `<div><dt>Estimated rent returned</dt><dd>${summary.accountRentRefundSol} SOL</dd></div>`
              : ''}
            ${Number.isFinite(summary.keeperBudgetRefundSol)
              ? `<div><dt>Unused keeper budget returned</dt><dd>${summary.keeperBudgetRefundSol} SOL</dd></div>`
              : ''}
            ${plan.kind === 'swap'
              ? `<div><dt>01RX fee</dt><dd>${Number.isFinite(summary.platformFeeBps)
                ? `${(summary.platformFeeBps / 100).toFixed(2)}%`
                : 'Unavailable'}</dd></div>`
              : ''}
            ${plan.kind === 'swap'
              ? `<div><dt>On-chain attribution</dt><dd>${summary.attributionAuthority
                ? `01RX co-signed · ${escapeHtml(shortenAddress(summary.attributionAuthority, 5))}`
                : 'Unavailable'}</dd></div>`
              : ''}
            <div><dt>${isSpotPlan ? 'Route authenticity' : 'Program revisions'}</dt><dd>${isSpotPlan
              ? 'DFlow signature verified'
              : state.programIntegrity.canTransact
                ? 'Verified'
                : 'Review required'}</dd></div>
            <div><dt>Wallet prompts</dt><dd>${plan.kind === 'manifest-setup' || plan.kind === 'conditional-setup' ? '2 total (setup, then trade)' : '1'}</dd></div>
          </dl>

          ${Array.isArray(summary.redemptions) ? `
            <div class="ft-review-redemptions">
              ${summary.redemptions.map(redemption => `
                <div>
                  <span>Receive</span>
                  <strong>${escapeHtml(redemption.amount)} ${escapeHtml(redemption.symbol)}</strong>
                  <small title="${escapeHtml(redemption.mint)}">${escapeHtml(shortenAddress(redemption.mint, 5))} → ${escapeHtml(shortenAddress(redemption.recipient, 5))}</small>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <details class="ft-review-programs">
            <summary>Programs and account details</summary>
            <div>
              ${(summary.programIds || []).map(programId => `
                <p><span>Program</span><code>${escapeHtml(programId)}</code></p>
              `).join('')}
              ${summary.inputAccount ? `<p><span>Input account</span><code>${escapeHtml(summary.inputAccount)}</code></p>` : ''}
              ${summary.outputMint ? `<p><span>Output mint</span><code>${escapeHtml(summary.outputMint)}</code></p>` : ''}
              ${summary.attributionAuthority ? `<p><span>01RX attribution authority</span><code>${escapeHtml(summary.attributionAuthority)}</code></p>` : ''}
              ${summary.attributionMarker ? `<p><span>Attribution marker</span><code>${escapeHtml(summary.attributionMarker)}</code></p>` : ''}
              ${simulation?.transactionFingerprint ? `<p><span>Review fingerprint</span><code title="${escapeHtml(simulation.transactionFingerprint)}">${escapeHtml(`${simulation.transactionFingerprint.slice(0, 16)}…${simulation.transactionFingerprint.slice(-8)}`)}</code></p>` : ''}
            </div>
          </details>

          <div class="ft-simulation ft-simulation-${simulationClass}">
            <span aria-hidden="true">${simulation?.ok ? '✓' : simulation ? '!' : '…'}</span>
            <div>
              <strong>${simulation?.ok
                ? 'Simulation passed'
                : simulation
                  ? 'Simulation failed'
                  : 'Simulation running'}</strong>
              <p>${simulation?.ok
                ? `${Number.isFinite(simulation.unitsConsumed) ? `${simulation.unitsConsumed.toLocaleString('en-US')} compute units · ` : ''}The exact unsigned transaction completed successfully.`
                : simulation?.error || 'Waiting for the Solana RPC result.'}</p>
            </div>
          </div>

          <p class="ft-review-warning">Your wallet preview is the final source of truth. Reject the request if its accounts or amounts differ from this review.</p>
          <div class="ft-modal-actions">
            <button type="button" data-ft-action="close-modal">Back</button>
            <button
              class="ft-primary-button"
              type="button"
              data-ft-action="approve-transaction"
              ${!simulation?.ok || (!isSpotPlan && !state.programIntegrity.canTransact) || state.execution.submitting ? 'disabled' : ''}
            >${state.execution.submitting ? 'Waiting for wallet…' : 'Approve in wallet'}</button>
          </div>
        </section>
      </div>
    `;
  }

  function render() {
    syncExecutionLock();
    renderHeader();
    renderSystemStatus();
    renderMarketList();
    if (state.hostMode === 'discovery') {
      regions.marketChartHeader.innerHTML = '';
      regions.marketChart.innerHTML = '';
      regions.marketStage.innerHTML = '';
      regions.tradeTicket.innerHTML = '';
      regions.positions.innerHTML = '';
      regions.modal.innerHTML = '';
      return;
    }
    renderMarketStage();
    renderTradeTicket();
    renderPositions();
    renderModal();
  }

  function renderClock() {
    if (state.destroyed) return;
    const market = selectedMarket();
    const countdown = root.querySelector('[data-ft-region="countdown"]');
    if (countdown && market) countdown.textContent = formatCountdown(market.proposal.endsAt);
    if (state.asOf && regions.headerUpdated) {
      regions.headerUpdated.textContent = `Updated ${formatRelativeTime(state.asOf)}`;
    }
  }

  function setNotice(message) {
    state.notice = message;
    if (state.noticeTimer) runtime.clearTimeout(state.noticeTimer);
    renderSystemStatus();
    state.noticeTimer = runtime.setTimeout(() => {
      state.notice = '';
      renderSystemStatus();
    }, 3_000);
  }

  async function loadRetainedProposalHistory(proposalId, requestOptions = {}) {
    const safeProposalId = safeBase58(proposalId);
    if (!safeProposalId || typeof api.json !== 'function') return null;
    try {
      const retained = await api.json(
        `/data/proposal-history/${encodeURIComponent(safeProposalId)}.json`,
        {
          cancelSignal: requestOptions.signal,
        },
      );
      const compactSeries = Array.isArray(retained?.series) ? retained.series : [];
      const payload = {
        ...retained,
        requestedInterval: '15m',
        series: compactSeries.map(row => ({
          timestamp: row?.[0],
          observedAt: row?.[0],
          underlyingPrice: row?.[1],
          passPrice: row?.[2],
          failPrice: row?.[3],
          passTwap: row?.[4],
          failTwap: row?.[5],
          sampleCount: 1,
        })),
        source: {
          ...(isObject(retained?.source) ? retained.source : {}),
          requestedInterval: '15m',
        },
      };
      const normalized = normalizeProposalHistoryPayload(payload);
      return normalized.series.length ? normalized : null;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return null;
    }
  }

  async function loadProposalHistory(market = selectedMarket(), options = {}) {
    if (state.destroyed || !market?.id) return null;
    const existing = state.historyByProposal.get(market.id);
    if (!options.force && (existing?.loading || existing?.data)) {
      return existing.data || null;
    }

    const previousId = state.historyActiveId;
    if (previousId) {
      const previous = state.historyByProposal.get(previousId);
      if (previous?.loading) {
        state.historyByProposal.set(previousId, {
          ...previous,
          loading: false,
        });
      }
    }
    state.historyAbortController?.abort();
    state.historyAbortController = typeof runtime.AbortController === 'function'
      ? new runtime.AbortController()
      : null;
    state.historyActiveId = market.id;
    const requestId = ++state.historyRequestId;
    state.historyByProposal.set(market.id, {
      loading: true,
      error: '',
      data: existing?.data || null,
    });
    if (selectedMarket()?.id === market.id) {
      renderMarketStage();
      renderPositions();
    }

    let retainedPreview = null;
    try {
      const requestOptions = {
        signal: state.historyAbortController?.signal,
      };
      const livePayloadPromise = (async () => {
        try {
          return await client.futarchy.proposalHistory({
            proposal: market.id,
            interval: '15m',
          }, requestOptions);
        } catch (error) {
          // During a rolling deployment, the frontend can reach an older public
          // API that only accepts 1h. Keep history available until the native
          // 15-minute backend is live, without masking other upstream failures.
          if (error?.status !== 400) throw error;
          return client.futarchy.proposalHistory({
            proposal: market.id,
            interval: '1h',
          }, requestOptions);
        }
      })().then(
        payload => ({ payload, error: null }),
        error => ({ payload: null, error }),
      );

      if (RETAINED_PROPOSAL_HISTORY_IDS.has(market.id)) {
        retainedPreview = await loadRetainedProposalHistory(market.id, requestOptions);
        if (
          retainedPreview
          && !state.destroyed
          && requestId === state.historyRequestId
        ) {
          state.historyByProposal.set(market.id, {
            loading: true,
            error: '',
            data: retainedPreview,
          });
          if (selectedMarket()?.id === market.id) {
            renderMarketStage();
            renderPositions();
          }
        }
      }
      const liveResult = await livePayloadPromise;
      if (liveResult.error) throw liveResult.error;
      if (state.destroyed || requestId !== state.historyRequestId) return null;
      let data = normalizeProposalHistoryPayload(liveResult.payload);
      if (!data.series.length) {
        data = retainedPreview
          || await loadRetainedProposalHistory(market.id, requestOptions)
          || data;
      }
      if (state.destroyed || requestId !== state.historyRequestId) return null;
      state.historyByProposal.set(market.id, {
        loading: false,
        error: '',
        data,
      });
      return data;
    } catch (error) {
      if (
        state.destroyed
        || requestId !== state.historyRequestId
        || error?.name === 'AbortError'
      ) return null;
      const retained = retainedPreview || await loadRetainedProposalHistory(
        market.id,
        { signal: state.historyAbortController?.signal },
      );
      if (state.destroyed || requestId !== state.historyRequestId) return null;
      if (retained) {
        state.historyByProposal.set(market.id, {
          loading: false,
          error: '',
          data: retained,
        });
        return retained;
      }
      state.historyByProposal.set(market.id, {
        loading: false,
        error: error?.status === 404
          ? 'This proposal is not available in the public market-history index.'
          : 'The public price-history feed is temporarily unavailable.',
        data: null,
      });
      return null;
    } finally {
      if (!state.destroyed && requestId === state.historyRequestId) {
        state.historyActiveId = '';
        if (selectedMarket()?.id === market.id) {
          renderMarketStage();
          renderPositions();
        }
      }
    }
  }

  async function loadProposalMarketData(market = selectedMarket(), options = {}) {
    if (
      state.destroyed
      || !market
      || market.proposal.statusGroup !== 'live'
      || !market.proposal.tradable
    ) return null;
    const owner = state.wallet.address || '';
    const existing = state.marketDataByProposal.get(market.id);
    if (
      !options.force
      && existing?.data
      && existing.owner === owner
      && Date.now() - new Date(existing.data.asOf || 0).getTime() < 5_000
    ) return existing.data;

    state.marketDataAbortController?.abort();
    state.marketDataAbortController = typeof runtime.AbortController === 'function'
      ? new runtime.AbortController()
      : null;
    const requestId = ++state.marketDataRequestId;
    state.marketDataByProposal.set(market.id, {
      loading: true,
      error: '',
      data: existing?.data || null,
      owner,
    });
    if (selectedMarket()?.id === market.id) {
      if (options.preserveChart) {
        renderLivePriceSurfaces(market, { renderBooks: false });
      } else {
        renderMarketStage();
        renderTradeTicket();
        renderPositions();
      }
    }

    try {
      const query = {
        proposal: market.id,
        limit: 30,
      };
      if (owner) query.owner = owner;
      const payload = await client.futarchy.marketData(query, {
        signal: state.marketDataAbortController?.signal,
      });
      if (state.destroyed || requestId !== state.marketDataRequestId) return null;
      const data = normalizeProposalMarketData(payload);
      state.marketDataByProposal.set(market.id, {
        loading: false,
        error: '',
        data,
        owner,
      });
      return data;
    } catch (error) {
      if (
        state.destroyed
        || requestId !== state.marketDataRequestId
        || error?.name === 'AbortError'
      ) return null;
      state.marketDataByProposal.set(market.id, {
        loading: false,
        error: error?.status === 404
          ? 'No verified PASS/FAIL order books were found for this proposal.'
          : 'Live order books are temporarily unavailable.',
        data: existing?.data || null,
        owner,
      });
      return null;
    } finally {
      if (!state.destroyed && requestId === state.marketDataRequestId) {
        const entry = state.marketDataByProposal.get(market.id);
        if (entry) entry.loading = false;
        if (selectedMarket()?.id === market.id) {
          if (options.preserveChart) {
            renderLivePriceSurfaces(selectedMarket());
          } else {
            renderMarketStage();
            renderTradeTicket();
            renderPositions();
          }
        }
      }
    }
  }

  async function refreshLivePrices() {
    const market = selectedMarket();
    if (
      state.destroyed
      || state.hostMode === 'discovery'
      || isOwnershipWorkspace()
      || state.refreshing
      || state.priceRefreshing
      || !market
      || market.proposal.statusGroup !== 'live'
    ) return null;

    const requestId = ++state.priceRequestId;
    state.priceAbortController?.abort();
    state.priceAbortController = typeof runtime.AbortController === 'function'
      ? new runtime.AbortController()
      : null;
    state.priceRefreshing = true;

    try {
      const payload = await client.futarchy.activeMarkets({
        signal: state.priceAbortController?.signal,
      });
      if (state.destroyed || requestId !== state.priceRequestId) return null;

      const snapshot = normalizeMarketPayload(
        payload,
        state.navMap,
        { forceLive: true },
      );
      const liveMarkets = snapshot.markets.filter(marketMatchesToken);
      if (!liveMarkets.some(candidate => candidate.id === market.id)) return null;

      state.activeMarkets = liveMarkets;
      state.markets = mergeProposalLists(state.indexedProposals, liveMarkets);
      state.sidebarMarkets = mergeProposalLists(
        state.sidebarMarkets.filter(candidate => (
          candidate.proposal.statusGroup !== 'live'
        )),
        liveMarkets,
      );
      state.asOf = snapshot.asOf || state.asOf;
      state.slot = snapshot.slot ?? state.slot;
      state.source = snapshot.source;
      state.liveError = '';

      const refreshedMarket = selectedMarket();
      if (!refreshedMarket || refreshedMarket.id !== market.id) return null;
      await loadProposalMarketData(refreshedMarket, {
        force: true,
        preserveChart: true,
      });
      if (state.destroyed || requestId !== state.priceRequestId) return null;
      renderLivePriceSurfaces(selectedMarket());
      return selectedMarket();
    } catch (error) {
      if (
        state.destroyed
        || requestId !== state.priceRequestId
        || error?.name === 'AbortError'
      ) return null;
      return null;
    } finally {
      if (requestId === state.priceRequestId) state.priceRefreshing = false;
    }
  }

  function selectProposal(proposalId, options = {}) {
    const next = state.markets.find(market => market.id === proposalId);
    if (!next) return;
    if (state.hostMode === 'discovery') {
      if (!next.token) {
        state.routeNotice = 'This indexed proposal is missing a NAVgator token identity, so its trading workspace cannot be opened.';
        renderSystemStatus();
        return;
      }
      handoffMarketNavigation(
        tokenMarketsUrl(next.token, next.id),
        { afterPaint: true },
      );
      return;
    }
    state.workspaceTab = 'decisions';
    if (options.focus === true) state.proposalFocus = true;
    state.routeNotice = '';
    state.requestedProposalId = '';
    state.positionRequestId += 1;
    state.recurringRequestId += 1;
    state.positionAbortController?.abort();
    state.marketDataRequestId += 1;
    state.marketDataAbortController?.abort();
    state.selectedId = next.id;
    state.wallet.positions = [];
    state.wallet.positionsError = '';
    state.wallet.redemption = null;
    state.recurring.schedules = [];
    state.recurring.error = '';
    renderHeader();
    renderMarketList();
    renderMarketStage();
    renderTradeTicket();
    renderPositions();
    loadProposalHistory(next);
    loadProposalMarketData(next, { force: true });

    if (options.updateUrl !== false && runtime.history) {
      try {
        const destination = state.hostMode === 'token'
          ? tokenMarketsUrl(state.tokenFilter || next.token, next.id)
          : (() => {
            const url = new runtime.URL(runtime.location.href);
            url.searchParams.set('proposal', next.id);
            return `${url.pathname}${url.search}${url.hash}`;
          })();
        const historyMethod = options.replaceUrl === true ? 'replaceState' : 'pushState';
        runtime.history[historyMethod]?.(null, '', destination);
        syncCanonicalUrl(destination);
      } catch (_) {
        // Selection remains functional when history access is restricted.
      }
    }
    if (
      options.reveal !== false
      && runtime.matchMedia?.('(max-width: 720px)').matches
      && typeof regions.marketChart?.scrollIntoView === 'function'
    ) {
      const reduceMotion = runtime.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      runtime.setTimeout(() => {
        regions.marketChart.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }, 0);
    }
    if (
      state.wallet.address
      && (
        (next.proposal.statusGroup === 'live' && next.proposal.tradable)
        || next.proposal.statusGroup === 'passed'
        || next.proposal.statusGroup === 'failed'
      )
    ) {
      loadPositions();
      loadRecurringSchedulesForMarket();
    }
  }

  function persistFilterInUrl() {
    if (!runtime.history?.replaceState) return;
    try {
      const url = new runtime.URL(runtime.location.href);
      if (state.filter === 'all') url.searchParams.delete('filter');
      else url.searchParams.set('filter', state.filter);
      url.searchParams.delete('history');
      runtime.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {
      // Filtering remains functional when history access is restricted.
    }
  }

  async function loadRecurringSchedulesForMarket() {
    const market = selectedMarket();
    if (
      state.destroyed
      || !state.wallet.address
      || !state.recurring.programId
      || !market
    ) {
      state.recurring.schedules = [];
      state.recurring.loading = false;
      state.recurring.error = '';
      return [];
    }
    const requestId = ++state.recurringRequestId;
    state.recurring.loading = true;
    state.recurring.error = '';
    renderPositions();
    try {
      const trading = await loadSolanaTrading(runtime);
      const connection = await executionConnection(trading);
      const schedules = await trading.loadRecurringSchedules({
        connection,
        recurringProgramId: state.recurring.programId,
        owner: state.wallet.address,
        proposal: market.id,
      });
      if (state.destroyed || requestId !== state.recurringRequestId) return [];
      state.recurring.schedules = schedules;
      return schedules;
    } catch (error) {
      if (state.destroyed || requestId !== state.recurringRequestId) return [];
      state.recurring.schedules = [];
      state.recurring.error = error?.message || 'Could not read recurring schedules.';
      return [];
    } finally {
      if (!state.destroyed && requestId === state.recurringRequestId) {
        state.recurring.loading = false;
        renderPositions();
      }
    }
  }

  async function loadPositions() {
    const market = selectedMarket();
    const isLive = market?.proposal?.statusGroup === 'live' && market?.proposal?.tradable;
    const isResolved = market?.proposal?.statusGroup === 'passed'
      || market?.proposal?.statusGroup === 'failed';
    if (
      state.destroyed
      || !state.wallet.address
      || !market
      || (!isLive && !isResolved)
    ) return [];
    const requestId = ++state.positionRequestId;
    state.positionAbortController?.abort();
    state.positionAbortController = typeof runtime.AbortController === 'function'
      ? new runtime.AbortController()
      : null;
    state.wallet.positionsLoading = true;
    state.wallet.positionsError = '';
    state.wallet.redemption = null;
    renderPositions();
    renderTradeTicket();

    try {
      if (isResolved) {
        if (!market.daoAddress) {
          throw new Error('Archived proposal DAO identity is unavailable');
        }
        const trading = await loadSolanaTrading(runtime);
        const connection = await executionConnection(trading);
        const redemption = await trading.inspectConditionalRedemption({
          connection,
          walletAddress: state.wallet.address,
          market,
        });
        if (state.destroyed || requestId !== state.positionRequestId) return [];
        state.wallet.redemption = redemption;
        state.wallet.positions = redemption.positions;
        state.wallet.positionsAsOf = new Date().toISOString();
        state.wallet.positionsSlot = null;
        state.wallet.positionsDegraded = false;
        captureTerminalEvent(runtime, 'settlement_verified', {
          proposal_id: market.id,
          outcome: redemption.outcome,
          has_redeemable_balance: redemption.hasRedeemableBalance === true,
        });
        return redemption.positions;
      }

      const payload = await client.futarchy.positions({
        owner: state.wallet.address,
        proposal: market.id,
      }, {
        signal: state.positionAbortController?.signal,
      });
      if (state.destroyed || requestId !== state.positionRequestId) return [];
      const normalized = normalizePositionRows(payload, market);
      state.wallet.positions = normalized.positions;
      state.wallet.positionsAsOf = normalized.asOf;
      state.wallet.positionsSlot = normalized.slot;
      state.wallet.positionsDegraded = normalized.degraded;
      return normalized.positions;
    } catch (error) {
      if (state.destroyed || requestId !== state.positionRequestId || error?.name === 'AbortError') return [];
      state.wallet.positions = [];
      state.wallet.redemption = null;
      state.wallet.positionsError = isResolved
        ? 'Could not independently verify this proposal’s v0.6 settlement and wallet balances.'
        : error?.status === 404
          ? 'Position reads are not available on this deployment yet.'
          : 'Could not read this wallet’s conditional token accounts.';
      captureTerminalEvent(runtime, isResolved ? 'settlement_verification_failed' : 'position_read_failed', {
        proposal_id: market.id,
        error_category: /rpc|fetch|network|timeout/i.test(error?.message || '')
          ? 'rpc_unavailable'
          : 'validation_failed',
      });
      return [];
    } finally {
      if (!state.destroyed && requestId === state.positionRequestId) {
        state.wallet.positionsLoading = false;
        renderPositions();
        renderTradeTicket();
      }
    }
  }

  function handleWalletAccountChanged(value) {
    const address = safeBase58(
      value && typeof value.toBase58 === 'function' ? value.toBase58() : value,
    );
    state.wallet.address = address;
    state.wallet.positions = [];
    state.wallet.positionsError = '';
    state.wallet.redemption = null;
    hydrateTransactions();
    state.execution.plan = null;
    state.execution.simulation = null;
    state.execution.reviewOpen = false;
    renderHeader();
    renderTradeTicket();
    renderPositions();
    renderModal();
    if (isOwnershipWorkspace() && firstNumber(state.ownershipOrder.amount) > 0) {
      scheduleOwnershipQuote(0);
    }
    if (address) {
      loadPositions();
      loadRecurringSchedulesForMarket();
      loadProposalMarketData(selectedMarket(), { force: true });
      refreshTransactionStatuses();
    }
  }

  async function connectWalletOptionById(optionId) {
    if (state.wallet.connecting || state.wallet.address) return;
    const option = state.wallet.options.find(candidate => candidate.id === optionId);
    if (!option) {
      setNotice('That wallet is no longer available.');
      return;
    }
    state.wallet.connecting = true;
    state.wallet.pickerOpen = false;
    state.wallet.error = '';
    renderHeader();
    renderModal();

    try {
      const trading = await loadSolanaTrading(runtime);
      const adapter = await trading.connectWalletOption(option);
      if (!safeBase58(adapter?.address)) throw new Error('Wallet returned an invalid public key');
      state.wallet.adapter?.unsubscribe?.();
      state.wallet.adapter = adapter;
      state.wallet.provider = adapter.provider || null;
      state.wallet.name = adapter.name;
      state.wallet.address = adapter.address;
      state.wallet.canTransact = adapter.canTransact === true;
      state.wallet.canSignTransaction = adapter.canSignTransaction === true;
      state.wallet.redemption = null;
      hydrateTransactions();
      adapter.subscribe(handleWalletAccountChanged);
      captureTerminalEvent(runtime, 'wallet_connected', {
        wallet_name: boundedText(adapter.name, 48),
        can_transact: adapter.canTransact === true,
      });
      setNotice(`${state.wallet.name} connected. Proposal data remains public; signatures only occur after review.`);
      await Promise.all([
        loadPositions(),
        loadRecurringSchedulesForMarket(),
        loadProposalMarketData(selectedMarket(), { force: true }),
        refreshTransactionStatuses(),
      ]);
      if (isOwnershipWorkspace() && firstNumber(state.ownershipOrder.amount) > 0) {
        scheduleOwnershipQuote(0);
      }
    } catch (error) {
      state.wallet.error = error?.message || 'Wallet connection was cancelled.';
      setNotice('Wallet connection was cancelled or unavailable.');
    } finally {
      state.wallet.connecting = false;
      renderHeader();
      renderTradeTicket();
      renderPositions();
      renderModal();
    }
  }

  async function connectWallet() {
    if (state.wallet.connecting || state.wallet.address) return;
    try {
      const trading = await loadSolanaTrading(runtime);
      const options = trading.discoverWalletOptions(
        runtime,
        runtime.NAVGATOR?.walletRegistry || null,
      );
      state.wallet.options = options;
      if (!options.length) {
        state.wallet.error = 'No supported Solana wallet was found.';
        setNotice('No Solana wallet found. Install or unlock a Wallet Standard-compatible wallet.');
        return;
      }
      if (options.length === 1) {
        await connectWalletOptionById(options[0].id);
        return;
      }
      state.wallet.pickerOpen = true;
      renderModal();
    } catch (error) {
      state.wallet.error = error?.message || 'Wallet discovery failed.';
      setNotice('Could not discover installed Solana wallets.');
    }
  }

  async function disconnectWallet() {
    const adapter = state.wallet.adapter;
    adapter?.unsubscribe?.();
    try {
      await adapter?.disconnect?.();
    } catch (_) {
      // Clear only this terminal's local wallet state even if provider cleanup fails.
    }
    state.positionAbortController?.abort();
    state.marketDataAbortController?.abort();
    state.wallet = {
      adapter: null,
      provider: null,
      name: '',
      address: '',
      connecting: false,
      pickerOpen: false,
      options: [],
      canTransact: false,
      canSignTransaction: false,
      error: '',
      positions: [],
      positionsLoading: false,
      positionsError: '',
      positionsAsOf: '',
      positionsSlot: null,
      positionsDegraded: false,
      redemption: null,
    };
    state.transactions = [];
    state.recurringRequestId += 1;
    state.recurring.schedules = [];
    state.recurring.loading = false;
    state.recurring.error = '';
    state.execution = {
      connection: state.execution.connection,
      plan: null,
      simulation: null,
      reviewOpen: false,
      building: false,
      submitting: false,
      error: '',
      signature: '',
      resume: null,
    };
    invalidateOwnershipQuote();
    render();
    if (isOwnershipWorkspace() && firstNumber(state.ownershipOrder.amount) > 0) {
      scheduleOwnershipQuote(0);
    }
    loadProposalMarketData(selectedMarket(), { force: true });
    setNotice('Wallet disconnected from this terminal.');
  }

  async function executionConnection(trading) {
    if (state.execution.connection) return state.execution.connection;
    const configured = firstText(runtime.NAVGATOR?.solanaRpcUrl);
    const relayUrl = client.futarchy.solanaRpcUrl();
    state.execution.connection = trading.createMainnetConnection(
      configured || relayUrl,
    );
    return state.execution.connection;
  }

  async function refreshProgramIntegrity(options = {}) {
    state.programIntegrity = {
      ...state.programIntegrity,
      status: 'checking',
      canTransact: false,
    };
    if (options.render !== false) {
      renderSystemStatus();
      renderTradeTicket();
      renderPositions();
      renderModal();
    }
    try {
      const payload = await client.futarchy.programIntegrity({
        signal: options.signal,
      });
      state.programIntegrity = normalizeProgramIntegrity(payload);
    } catch (_) {
      state.programIntegrity = normalizeProgramIntegrity({
        status: 'unavailable',
        canTransact: false,
        programs: [],
      });
    }
    if (options.render !== false) {
      renderSystemStatus();
      renderTradeTicket();
      renderPositions();
      renderModal();
    }
    return state.programIntegrity;
  }

  async function buildAndSimulatePlan(buildPlan, options = {}) {
    // Routine decision trades use the populated ticket as their explicit review
    // surface. The same click may request wallet approval only after the exact
    // transaction has been built, simulated, and fingerprint-bound.
    const requestWalletApproval = options.requestWalletApproval === true;
    let trading = null;
    const integrity = await refreshProgramIntegrity();
    if (!integrity.canTransact) {
      state.execution.error = programIntegrityPauseMessage(integrity);
      renderTradeTicket();
      renderPositions();
      return null;
    }
    state.execution.building = true;
    state.execution.error = '';
    state.execution.signature = '';
    state.execution.plan = null;
    state.execution.simulation = null;
    state.execution.reviewOpen = false;
    renderTradeTicket();
    renderModal();
    try {
      trading = await loadSolanaTrading(runtime);
      const connection = await executionConnection(trading);
      let plan = await buildPlan(trading, connection);
      if (plan?.kind === 'swap') {
        const attribution = await client.trading.decisionAttest(
          trading.decisionAttributionRequest(plan),
          { timeoutMs: 12_000 },
        );
        plan = await trading.applyDecisionAttribution(
          connection,
          plan,
          attribution,
        );
      }
      if (state.destroyed) return null;
      plan.requestWalletApproval = requestWalletApproval;
      state.execution.plan = plan;
      state.execution.reviewOpen = !requestWalletApproval;
      state.execution.simulation = null;
      renderModal();
      const simulation = await trading.simulatePlan(connection, plan, {
        minContextSlot: Number.isSafeInteger(integrity.rpcSlot)
          ? integrity.rpcSlot
          : 0,
      });
      if (state.destroyed || state.execution.plan !== plan) return null;
      if (!/^[a-f0-9]{64}$/.test(String(simulation.transactionFingerprint || ''))) {
        throw new Error('Simulation did not bind the reviewed transaction bytes');
      }
      plan.reviewFingerprint = simulation.transactionFingerprint;
      state.execution.simulation = simulation;
      captureTerminalEvent(runtime, simulation.ok ? 'simulation_passed' : 'simulation_failed', {
        proposal_id: selectedMarket()?.id || '',
        transaction_kind: plan.kind,
        venue: normalizeKey(plan.summary?.venue),
        units_consumed: simulation.unitsConsumed,
        error_category: simulation.ok ? null : 'program_error',
      });
      if (requestWalletApproval && !simulation.ok) {
        state.execution.error = simulation.error
          || 'The transaction simulation failed before wallet approval.';
        state.execution.plan = null;
      }
      renderModal();
      if (requestWalletApproval && simulation.ok) {
        state.execution.building = false;
        renderTradeTicket();
        renderModal();
        await approveTransaction();
      }
      return plan;
    } catch (error) {
      const described = trading?.describeSolanaError?.(error);
      state.execution.error = described?.message
        || error?.message
        || 'Could not build this transaction.';
      state.execution.plan = null;
      state.execution.simulation = null;
      state.execution.reviewOpen = false;
      captureTerminalEvent(runtime, 'review_build_failed', {
        proposal_id: selectedMarket()?.id || '',
        error_category: described?.category || 'validation_failed',
      });
      setNotice('Transaction could not be prepared.');
      return null;
    } finally {
      state.execution.building = false;
      renderTradeTicket();
      renderModal();
    }
  }

  async function executeTrade() {
    const market = selectedMarket();
    if (!market || !state.wallet.address || !state.wallet.canTransact) {
      connectWallet();
      return;
    }
    const outcome = state.order.outcome;
    const side = state.order.side;
    const amount = state.order.amount;
    if (state.order.type === 'recurring') {
      const book = selectedOrderBook(market);
      const referencePrice = suggestedLimitPrice(market);
      if (
        !state.recurring.enabled
        || !state.recurring.keeperReady
        || !state.recurring.programId
      ) {
        state.execution.error = 'Automatic recurring execution is not fully deployed yet.';
        renderTradeTicket();
        return;
      }
      if (!book?.canonical || !book.address || !Number.isFinite(referencePrice)) {
        state.execution.error = 'A unique verified Manifest market is required for recurring orders.';
        renderTradeTicket();
        return;
      }
      await buildAndSimulatePlan((trading, connection) => trading.buildRecurringSchedulePlan({
        connection,
        walletAddress: state.wallet.address,
        recurringProgramId: state.recurring.programId,
        market,
        marketAddress: book.address,
        expectedBaseMint: book.baseMint,
        expectedQuoteMint: book.quoteMint,
        outcome,
        side,
        amountPerCycle: amount,
        totalCycles: state.order.totalCycles,
        intervalSeconds: state.order.intervalSeconds,
        slippageBps: state.order.slippageBps,
        referencePrice,
      }));
      return;
    }
    if (state.order.type === 'limit') {
      const book = selectedOrderBook(market);
      const price = state.order.price || String(suggestedLimitPrice(market) || '');
      if (!book?.canonical || !book.address) {
        state.execution.error = 'A unique verified Manifest market is required for limit orders.';
        renderTradeTicket();
        return;
      }
      await buildAndSimulatePlan(
        (trading, connection) => trading.buildManifestLimitPlan({
          connection,
          walletAddress: state.wallet.address,
          market,
          marketAddress: book.address,
          expectedBaseMint: book.baseMint,
          expectedQuoteMint: book.quoteMint,
          outcome,
          side,
          amount,
          price,
        }),
        { requestWalletApproval: true },
      );
      return;
    }
    await buildAndSimulatePlan(
      (trading, connection) => trading.buildConditionalSwapPlan({
        connection,
        walletAddress: state.wallet.address,
        market,
        outcome,
        side,
        amount,
        slippageBps: state.order.slippageBps,
      }),
      { requestWalletApproval: true },
    );
  }

  async function reviewOwnershipTrade() {
    if (!isOwnershipWorkspace()) return;
    if (!state.wallet.address) {
      connectWallet();
      return;
    }
    if (!state.wallet.canSignTransaction) {
      state.ownershipOrder.quoteError = 'This wallet cannot return a signed transaction for 01RX validation.';
      renderTradeTicket();
      return;
    }
    if (
      state.ownershipOrder.type !== 'market'
      || !(firstNumber(state.ownershipOrder.amount) > 0)
    ) return;

    let payload = state.ownershipOrder.quote;
    if (
      !payload?.transaction
      || payload.owner !== state.wallet.address
      || payload.token !== state.tokenFilter
      || payload.side !== state.ownershipOrder.side
    ) {
      payload = await loadOwnershipQuote();
    }
    if (!payload?.transaction || state.destroyed) return;

    state.execution.building = true;
    state.execution.error = '';
    state.execution.signature = '';
    state.execution.plan = null;
    state.execution.simulation = null;
    state.execution.reviewOpen = false;
    renderTradeTicket();
    try {
      const trading = await loadSolanaTrading(runtime);
      const plan = trading.buildDflowSpotPlan(payload, state.wallet.address);
      const fingerprint = await trading.transactionReviewFingerprint(plan.transaction);
      if (fingerprint !== plan.serverFingerprint) {
        throw new Error('Browser transaction bytes did not match the server review');
      }
      plan.reviewFingerprint = fingerprint;
      state.execution.plan = plan;
      state.execution.simulation = {
        ...payload.review.simulation,
        transactionFingerprint: fingerprint,
      };
      state.execution.reviewOpen = true;
      captureTerminalEvent(runtime, 'simulation_passed', {
        token: state.tokenFilter,
        transaction_kind: plan.kind,
        venue: normalizeKey(plan.summary?.venue),
        units_consumed: state.execution.simulation.unitsConsumed,
      });
      renderModal();
    } catch (error) {
      state.execution.error = error?.message || 'Could not prepare the DFlow transaction review.';
      state.execution.plan = null;
      state.execution.simulation = null;
      state.execution.reviewOpen = false;
      state.ownershipOrder.quoteError = state.execution.error;
      setNotice('Spot transaction review could not be prepared.');
    } finally {
      state.execution.building = false;
      renderTradeTicket();
      renderModal();
    }
  }

  async function reviewCancelOrder({
    marketAddress,
    clientOrderId,
    outcome,
  }) {
    const market = selectedMarket();
    const book = state.marketDataByProposal.get(market?.id)?.data?.books?.[outcome];
    if (
      !market
      || !state.wallet.address
      || !book?.canonical
      || book.address !== marketAddress
    ) {
      setNotice('Refresh the verified order book before cancelling this order.');
      return;
    }
    await buildAndSimulatePlan((trading, connection) => trading.buildManifestCancelPlan({
      connection,
      walletAddress: state.wallet.address,
      marketAddress,
      expectedBaseMint: book.baseMint,
      expectedQuoteMint: book.quoteMint,
      outcome,
      clientOrderId,
    }));
  }

  async function reviewRecurringCancel(scheduleAddress) {
    const market = selectedMarket();
    const schedule = state.recurring.schedules.find(candidate => (
      candidate.address === scheduleAddress
    ));
    if (
      !market
      || !schedule
      || !state.wallet.address
      || !state.recurring.programId
    ) {
      setNotice('Refresh recurring schedules before cancelling this vault.');
      return;
    }
    await buildAndSimulatePlan((trading, connection) => (
      trading.buildRecurringCancelPlan({
        connection,
        walletAddress: state.wallet.address,
        recurringProgramId: state.recurring.programId,
        scheduleAddress,
        ticker: market.ticker,
        baseDecimals: market.baseDecimals,
        quoteDecimals: market.quoteDecimals,
      })
    ));
  }

  async function reviewRecurringClaim(scheduleAddress, outcome) {
    const market = selectedMarket();
    const schedule = state.recurring.schedules.find(candidate => (
      candidate.address === scheduleAddress
    ));
    if (
      !market
      || !schedule
      || !state.wallet.address
      || !state.recurring.programId
    ) {
      setNotice('Refresh recurring schedules before claiming from this vault.');
      return;
    }
    await buildAndSimulatePlan((trading, connection) => (
      trading.buildRecurringClaimPlan({
        connection,
        walletAddress: state.wallet.address,
        recurringProgramId: state.recurring.programId,
        scheduleAddress,
        ticker: market.ticker,
        outcome,
        baseDecimals: market.baseDecimals,
        quoteDecimals: market.quoteDecimals,
      })
    ));
  }

  async function reviewManifestWithdraw({
    marketAddress,
    outcome,
  }) {
    const market = selectedMarket();
    const book = state.marketDataByProposal.get(market?.id)?.data?.books?.[outcome];
    if (
      !market
      || !state.wallet.address
      || !book?.canonical
      || book.address !== marketAddress
      || !book.depositedBalances?.some(balance => balance.amount > 0)
    ) {
      setNotice('Refresh Manifest balances before withdrawing.');
      return;
    }
    await buildAndSimulatePlan((trading, connection) => (
      trading.buildManifestWithdrawPlan({
        connection,
        walletAddress: state.wallet.address,
        marketAddress,
        expectedBaseMint: book.baseMint,
        expectedQuoteMint: book.quoteMint,
        outcome,
        ticker: market.ticker,
      })
    ));
  }

  async function reviewRedemption() {
    const market = selectedMarket();
    if (!market || !state.wallet.address || !state.wallet.canTransact) {
      connectWallet();
      return;
    }
    if (
      market.proposal.statusGroup !== 'passed'
      && market.proposal.statusGroup !== 'failed'
    ) {
      setNotice('Only resolved proposal positions can be redeemed.');
      return;
    }
    await buildAndSimulatePlan((trading, connection) => (
      trading.buildConditionalRedeemPlan({
        connection,
        walletAddress: state.wallet.address,
        market,
      })
    ));
  }

  function updateTransactionStatus(signature, status, options = {}) {
    const existing = state.transactions.find(transaction => (
      transaction.signature === signature
      && transaction.owner === state.wallet.address
    ));
    if (!existing) return null;
    const next = upsertTransaction({
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
      slot: options.slot ?? existing.slot,
      errorCategory: options.errorCategory ?? existing.errorCategory,
      errorMessage: options.errorMessage ?? existing.errorMessage,
    });
    renderTradeTicket();
    renderPositions();
    return next;
  }

  async function refreshTransactionStatuses() {
    if (
      state.destroyed
      || !state.wallet.address
      || state.transactionStatusLoading
    ) return [];
    const pending = state.transactions.filter(transaction => (
      transaction.status === 'submitted'
      || transaction.status === 'processed'
    ));
    if (!pending.length) return [];
    state.transactionStatusLoading = true;
    try {
      const trading = await loadSolanaTrading(runtime);
      if (typeof trading.getSignatureStates !== 'function') return [];
      const connection = await executionConnection(trading);
      const statuses = await trading.getSignatureStates(
        connection,
        pending.map(transaction => transaction.signature),
      );
      let confirmed = false;
      for (const status of statuses) {
        const existing = pending.find(transaction => (
          transaction.signature === status.signature
        ));
        if (!existing || status.status === existing.status) continue;
        const described = status.status === 'failed'
          ? trading.describeSolanaError?.(new Error(status.error || 'Transaction failed'))
          : null;
        updateTransactionStatus(status.signature, status.status, {
          slot: status.slot,
          errorCategory: described?.category || '',
          errorMessage: described?.message || '',
        });
        if (status.status === 'confirmed' || status.status === 'finalized') {
          confirmed = true;
          captureTerminalEvent(runtime, 'transaction_confirmed', {
            proposal_id: existing.proposalId,
            transaction_kind: existing.kind,
            confirmation_status: status.status,
          });
        } else if (status.status === 'failed') {
          captureTerminalEvent(runtime, 'transaction_failed', {
            proposal_id: existing.proposalId,
            transaction_kind: existing.kind,
            error_category: described?.category || 'program_error',
          });
        }
      }
      if (confirmed) {
        await Promise.all([
          loadPositions(),
          loadProposalMarketData(selectedMarket(), { force: true }),
        ]);
      }
      return statuses;
    } catch (error) {
      const trading = await loadSolanaTrading(runtime).catch(() => null);
      const described = trading?.describeSolanaError?.(error);
      captureTerminalEvent(runtime, 'status_poll_failed', {
        error_category: described?.category || 'rpc_unavailable',
      });
      return [];
    } finally {
      state.transactionStatusLoading = false;
    }
  }

  async function approveTransaction() {
    const plan = state.execution.plan;
    if (
      state.execution.submitting
      || !plan
      || !state.execution.simulation?.ok
      || !state.wallet.adapter
    ) return;
    state.execution.submitting = true;
    state.execution.error = '';
    renderTradeTicket();
    renderModal();
    if (plan.kind === 'spot') {
      try {
        const trading = await loadSolanaTrading(runtime);
        const connection = await executionConnection(trading);
        const signed = await trading.signReviewedPlan(
          connection,
          state.wallet.adapter,
          plan,
        );
        const result = await client.trading.spotSubmit({
          signedTransaction: signed.signedTransaction,
          reviewToken: plan.reviewToken,
        }, {
          timeoutMs: 30_000,
        });
        const signature = safeSignature(result?.signature);
        if (!signature) throw new Error('Trading service returned an invalid signature');
        state.execution.signature = signature;
        state.execution.reviewOpen = false;
        state.execution.plan = null;
        state.execution.simulation = null;
        state.ownershipOrder.quote = null;
        captureTerminalEvent(runtime, 'transaction_submitted', {
          token: state.tokenFilter,
          transaction_kind: plan.kind,
          venue: normalizeKey(plan.summary?.venue),
        });
        setNotice(`Spot trade submitted on Solana mainnet · ${shortenAddress(signature, 6)}`);
        scheduleOwnershipQuote(0);
      } catch (error) {
        const trading = await loadSolanaTrading(runtime).catch(() => null);
        const described = trading?.describeSolanaError?.(error);
        state.execution.error = described?.message
          || error?.message
          || 'The wallet request failed.';
        state.ownershipOrder.quoteError = state.execution.error;
        captureTerminalEvent(runtime, 'wallet_request_failed', {
          token: state.tokenFilter,
          transaction_kind: plan.kind,
          error_category: described?.category || 'validation_failed',
        });
        setNotice('Spot transaction was rejected or failed before submission.');
      } finally {
        state.execution.submitting = false;
        renderTradeTicket();
        renderModal();
      }
      return;
    }
    const integrity = await refreshProgramIntegrity();
    if (!integrity.canTransact) {
      state.execution.submitting = false;
      state.execution.error = programIntegrityPauseMessage(integrity);
      state.execution.plan = null;
      state.execution.simulation = null;
      state.execution.reviewOpen = false;
      renderTradeTicket();
      renderPositions();
      renderModal();
      return;
    }
    let signature = '';
    const market = selectedMarket();
    try {
      const trading = await loadSolanaTrading(runtime);
      const connection = await executionConnection(trading);
      const result = await trading.sendPlan(
        connection,
        state.wallet.adapter,
        plan,
        {
          minContextSlot: Math.max(
            Number.isSafeInteger(integrity.rpcSlot) ? integrity.rpcSlot : 0,
            Number.isSafeInteger(state.execution.simulation?.executionSafety?.contextSlot)
              ? state.execution.simulation.executionSafety.contextSlot
              : 0,
          ),
        },
      );
      if (state.destroyed) return;
      signature = safeSignature(result.signature);
      if (!signature) throw new Error('Wallet returned an invalid transaction signature');
      const submittedAt = new Date().toISOString();
      upsertTransaction({
        signature,
        owner: state.wallet.address,
        proposalId: market?.id,
        status: 'submitted',
        kind: plan.kind,
        action: plan.summary?.action,
        venue: plan.summary?.venue,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });
      state.execution.signature = signature;
      state.execution.reviewOpen = false;
      state.execution.plan = null;
      state.execution.simulation = null;
      state.execution.submitting = false;
      captureTerminalEvent(runtime, 'transaction_submitted', {
        proposal_id: market?.id || '',
        transaction_kind: plan.kind,
        venue: normalizeKey(plan.summary?.venue),
      });
      setNotice('Transaction submitted. Confirmation is tracked below and survives refresh.');
      renderTradeTicket();
      renderPositions();
      renderModal();

      const confirmation = await trading.confirmSignature(
        connection,
        signature,
        {
          onStatus(status) {
            if (
              status?.status === 'processed'
              && state.transactions.some(transaction => (
                transaction.signature === signature
                && transaction.status === 'submitted'
              ))
            ) {
              updateTransactionStatus(signature, 'processed', { slot: status.slot });
            }
          },
        },
      );
      if (state.destroyed) return;
      updateTransactionStatus(signature, confirmation.status, {
        slot: confirmation.slot,
        errorCategory: '',
        errorMessage: '',
      });
      captureTerminalEvent(runtime, 'transaction_confirmed', {
        proposal_id: market?.id || '',
        transaction_kind: plan.kind,
        confirmation_status: confirmation.status,
      });
      setNotice(
        plan.kind === 'conditional-setup'
          ? 'Conditional token accounts confirmed. Approve the attributed swap in your wallet next.'
          : plan.kind === 'manifest-setup'
            ? 'Manifest account setup confirmed. Approve the limit order in your wallet next.'
          : plan.kind === 'recurring-create'
            ? 'Automatic schedule funded and confirmed on Solana mainnet.'
            : plan.kind === 'recurring-cancel'
              ? 'Schedule closed and vault balances returned.'
            : plan.kind === 'recurring-claim'
              ? 'Accumulated recurring proceeds moved to your wallet.'
              : 'Transaction confirmed on Solana mainnet.',
      );
      await Promise.all([
        loadPositions(),
        loadRecurringSchedulesForMarket(),
        loadProposalMarketData(selectedMarket(), { force: true }),
      ]);
      if (plan.kind === 'manifest-setup' && plan.resume) {
        await buildAndSimulatePlan(
          (module, nextConnection) => (
            module.buildManifestLimitPlan({
              connection: nextConnection,
              ...plan.resume,
            })
          ),
          { requestWalletApproval: plan.requestWalletApproval === true },
        );
      } else if (plan.kind === 'conditional-setup' && plan.resume) {
        await buildAndSimulatePlan(
          (module, nextConnection) => (
            module.buildConditionalSwapPlan({
              connection: nextConnection,
              ...plan.resume,
            })
          ),
          { requestWalletApproval: plan.requestWalletApproval === true },
        );
      }
    } catch (error) {
      const trading = await loadSolanaTrading(runtime).catch(() => null);
      const described = trading?.describeSolanaError?.(error) || {
        category: 'unknown',
        message: error?.message || 'The wallet request failed.',
      };
      if (signature && error?.code === 'TRANSACTION_FAILED') {
        updateTransactionStatus(signature, 'failed', {
          errorCategory: described.category,
          errorMessage: described.message,
          slot: error?.status?.slot,
        });
      }
      state.execution.error = described.message;
      captureTerminalEvent(runtime, signature ? 'transaction_tracking_error' : 'wallet_request_failed', {
        proposal_id: market?.id || '',
        transaction_kind: plan.kind,
        error_category: described.category,
        signature_received: Boolean(signature),
      });
      setNotice(
        signature
          ? described.message
          : 'Transaction was rejected or failed before submission.',
      );
    } finally {
      state.execution.submitting = false;
      renderTradeTicket();
      renderPositions();
      renderModal();
    }
  }

  async function refresh(options = {}) {
    if (state.destroyed) return [];
    if (
      root.hasAttribute('data-ft-transition')
      && options.workspaceTransitionId !== workspaceTransitionId
    ) {
      return activeWorkspaceTransitionPromise || state.markets;
    }
    state.priceAbortController?.abort();
    state.priceRequestId += 1;
    state.priceRefreshing = false;
    const requestId = ++state.requestId;
    state.abortController?.abort();
    state.abortController = typeof runtime.AbortController === 'function'
      ? new runtime.AbortController()
      : null;
    state.loading = state.markets.length === 0;
    state.refreshing = !state.loading;
    state.error = '';
    state.liveError = '';
    state.archiveError = '';
    renderHeader();
    renderSystemStatus();
    if (state.loading) {
      renderMarketList();
      if (state.hostMode !== 'discovery') {
        renderMarketStage();
        renderTradeTicket();
      }
    }

    const signal = state.abortController?.signal;
    if (state.hostMode === 'discovery') {
      try {
        const payload = await client.futarchy.proposals({}, { signal });
        if (state.destroyed || requestId !== state.requestId) return state.markets;
        const snapshot = normalizeMarketPayload(payload, new Map());
        state.indexedProposals = snapshot.markets;
        state.activeMarkets = [];
        state.markets = mergeProposalLists(snapshot.markets, []);
        state.sidebarMarkets = state.markets;
        state.proposalSummary = snapshot.summary;
        state.proposalPagination = {
          nextCursor: snapshot.pagination.nextCursor,
          total: firstNumber(
            snapshot.pagination.total,
            snapshot.summary.total,
            snapshot.markets.length,
          ),
          loadingMore: false,
        };
        state.asOf = snapshot.asOf || new Date().toISOString();
        state.slot = snapshot.slot;
        state.source = snapshot.source;
        state.degraded = snapshot.degraded;
        state.selectedId = state.markets.some(market => market.id === state.selectedId)
          ? state.selectedId
          : state.markets[0]?.id || '';
        state.loading = false;
        state.refreshing = false;

        if (state.requestedProposalId) {
          const requestedMarket = state.markets.find(
            market => market.id === state.requestedProposalId,
          );
          if (requestedMarket?.token) {
            const destination = tokenMarketsUrl(requestedMarket.token, requestedMarket.id);
            handoffMarketNavigation(destination, { replace: true });
            return state.markets;
          }
          state.routeNotice = 'That proposal link is not in the current index. Showing all decision markets instead.';
          state.requestedProposalId = '';
          state.selectedId = state.markets[0]?.id || '';
          runtime.history?.replaceState?.(null, '', globalMarketsUrl());
        }
        render();
        return state.markets;
      } catch (error) {
        if (state.destroyed || requestId !== state.requestId || error?.name === 'AbortError') {
          return state.markets;
        }
        state.archiveError = error?.timeout
          ? 'Proposal discovery timed out.'
          : 'Proposal discovery is temporarily unavailable.';
        state.error = 'Governance proposals are temporarily unavailable.';
        state.degraded = {
          active: true,
          services: ['futarchy-proposals'],
          issues: [],
        };
        state.loading = false;
        state.refreshing = false;
        render();
        return state.markets;
      }
    }

    const [
      marketResult,
      proposalResult,
      homeResult,
      recurringResult,
      integrityResult,
    ] = await Promise.allSettled([
      client.futarchy.activeMarkets({ signal }),
      client.futarchy.proposals({}, { signal }),
      client.core.homeBootstrap({ cacheOnly: true }, { signal }),
      client.futarchy.recurringConfig({ signal }),
      client.futarchy.programIntegrity({ signal }),
    ]);

    if (state.destroyed || requestId !== state.requestId) return state.markets;

    if (homeResult.status === 'fulfilled') {
      state.navMap = buildNavMap(homeResult.value);
    }
    if (recurringResult.status === 'fulfilled') {
      const config = recurringResult.value || {};
      state.recurring.enabled = config.enabled === true;
      state.recurring.keeperReady = config.keeperReady === true;
      state.recurring.programId = safeBase58(config.programId);
      state.recurring.minimumIntervalSeconds = firstNumber(
        config.minimumIntervalSeconds,
        3_600,
      );
      state.recurring.maximumCycles = firstNumber(config.maximumCycles, 365);
    } else {
      state.recurring.enabled = false;
      state.recurring.keeperReady = false;
      state.recurring.programId = '';
    }
    state.programIntegrity = integrityResult.status === 'fulfilled'
      ? normalizeProgramIntegrity(integrityResult.value)
      : normalizeProgramIntegrity({
        status: 'unavailable',
        canTransact: false,
        programs: [],
      });

    let activeSnapshot = null;
    let proposalSnapshot = null;
    if (marketResult.status === 'fulfilled') {
      activeSnapshot = normalizeMarketPayload(
        marketResult.value,
        state.navMap,
        { forceLive: true },
      );
      state.activeMarkets = activeSnapshot.markets.filter(marketMatchesToken);
      state.slot = activeSnapshot.slot;
      state.source = activeSnapshot.source;
      state.degraded = activeSnapshot.degraded;
      state.pendingProposalCount = activeSnapshot.pendingProposalCount;
    } else {
      const error = marketResult.reason;
      state.liveError = error?.timeout
        ? 'Live proposal market data timed out.'
        : 'Live proposal market data is temporarily unavailable.';
      state.degraded = { active: true, services: ['futarchy'], issues: [] };
    }

    if (proposalResult.status === 'fulfilled') {
      proposalSnapshot = normalizeMarketPayload(proposalResult.value, state.navMap);
      const preserveLoadedPages = state.indexedProposals.length > proposalSnapshot.markets.length;
      const tokenProposals = proposalSnapshot.markets.filter(marketMatchesToken);
      state.indexedProposals = preserveLoadedPages
        ? mergeIndexedProposalPages(state.indexedProposals, tokenProposals)
        : tokenProposals;
      state.proposalSummary = proposalSnapshot.summary;
      state.proposalPagination = {
        nextCursor: preserveLoadedPages
          ? state.proposalPagination.nextCursor
          : proposalSnapshot.pagination.nextCursor,
        total: firstNumber(
          proposalSnapshot.pagination.total,
          proposalSnapshot.summary.total,
          state.indexedProposals.length,
        ),
        loadingMore: false,
      };
    } else {
      state.archiveError = proposalResult.reason?.timeout
        ? 'Proposal history timed out.'
        : 'Proposal history is temporarily unavailable.';
    }

    state.degraded = mergeDegradedStates(
      marketResult.status === 'fulfilled'
        ? activeSnapshot?.degraded
        : { active: true, services: ['futarchy'], issues: [] },
      proposalResult.status === 'fulfilled'
        ? proposalSnapshot?.degraded
        : { active: true, services: ['futarchy-proposals'], issues: [] },
    );
    state.markets = mergeProposalLists(state.indexedProposals, state.activeMarkets);
    state.sidebarMarkets = mergeProposalLists(
      proposalSnapshot?.markets || [],
      activeSnapshot?.markets || [],
    );
    state.asOf = activeSnapshot?.asOf
      || proposalSnapshot?.asOf
      || state.asOf
      || new Date().toISOString();
    if (state.preferInitialLiveDecision) {
      state.preferInitialLiveDecision = false;
      delete runtime.document.documentElement.dataset.defaultMarketSelection;
      const liveMarket = state.sidebarMarkets.find(market => (
        market?.proposal?.statusGroup === 'live'
        && Boolean(market.token)
      ));
      if (liveMarket) {
        state.workspaceTab = 'decisions';
        state.proposalFocus = true;
        state.selectedId = liveMarket.id;
        state.requestedProposalId = liveMarket.id;
        const destination = tokenMarketsUrl(liveMarket.token, liveMarket.id);
        runtime.history?.replaceState?.(null, '', destination);
        syncCanonicalUrl(destination);
        if (liveMarket.token !== state.tokenFilter) {
          return setToken(liveMarket.token, { proposalId: liveMarket.id });
        }
      }
    }
    if (
      state.requestedProposalId
      && !state.markets.some(market => market.id === state.requestedProposalId)
    ) {
      state.routeNotice = 'That proposal does not belong to this token or is no longer indexed. Showing this token’s available markets.';
      state.requestedProposalId = '';
      const fallbackUrl = tokenMarketsUrl(state.tokenFilter);
      runtime.history?.replaceState?.(
        null,
        '',
        fallbackUrl,
      );
      syncCanonicalUrl(fallbackUrl);
    }
    if (!state.markets.some(market => market.id === state.selectedId)) {
      state.selectedId = filteredMarkets()[0]?.id || state.markets[0]?.id || '';
    }
    if (!state.markets.length && marketResult.status === 'rejected' && proposalResult.status === 'rejected') {
      state.error = 'Governance proposals are temporarily unavailable.';
    }
    state.loading = false;
    state.refreshing = false;
    render();
    const currentMarket = isOwnershipWorkspace() ? null : selectedMarket();
    if (currentMarket) {
      loadProposalHistory(currentMarket, {
        force: currentMarket.proposal.statusGroup === 'live',
      });
      loadProposalMarketData(currentMarket, {
        force: currentMarket.proposal.statusGroup === 'live',
      });
    }
    if (state.wallet.address && options.refreshPositions !== false) loadPositions();
    if (state.wallet.address) loadRecurringSchedulesForMarket();
    return state.markets;
  }

  async function loadMoreProposals() {
    const cursor = state.proposalPagination.nextCursor;
    if (state.destroyed || state.proposalPagination.loadingMore || !cursor) return state.markets;
    const requestId = ++state.paginationRequestId;
    state.paginationAbortController?.abort();
    state.paginationAbortController = typeof runtime.AbortController === 'function'
      ? new runtime.AbortController()
      : null;
    state.proposalPagination.loadingMore = true;
    renderMarketList();

    try {
      const payload = await client.futarchy.proposals({
        cursor,
        ...(state.tokenFilter ? { token: state.tokenFilter } : {}),
      }, {
        signal: state.paginationAbortController?.signal,
      });
      if (state.destroyed || requestId !== state.paginationRequestId) return state.markets;
      const normalized = normalizeMarketPayload(payload, state.navMap);
      const before = state.indexedProposals.length;
      state.indexedProposals = mergeIndexedProposalPages(
        state.indexedProposals,
        normalized.markets.filter(marketMatchesToken),
      );
      state.proposalSummary = {
        ...state.proposalSummary,
        ...normalized.summary,
      };
      state.degraded = mergeDegradedStates(state.degraded, normalized.degraded);
      state.proposalPagination.nextCursor = normalized.pagination.nextCursor;
      state.proposalPagination.total = firstNumber(
        normalized.pagination.total,
        normalized.summary.total,
        state.proposalPagination.total,
        state.indexedProposals.length,
      );
      if (state.indexedProposals.length === before
        && normalized.pagination.nextCursor === cursor) {
        state.proposalPagination.nextCursor = '';
      }
      state.markets = mergeProposalLists(state.indexedProposals, state.activeMarkets);
      if (!state.tokenFilter) state.sidebarMarkets = state.markets;
      state.asOf = normalized.asOf || state.asOf;
      render();
      return state.markets;
    } catch (error) {
      if (state.destroyed || requestId !== state.paginationRequestId || error?.name === 'AbortError') {
        return state.markets;
      }
      setNotice('Could not load the next proposal archive page.');
      return state.markets;
    } finally {
      if (!state.destroyed && requestId === state.paginationRequestId) {
        state.proposalPagination.loadingMore = false;
        renderMarketList();
      }
    }
  }

  function setHourlySeriesMenuOpen(open, options = {}) {
    const menu = root.querySelector('[data-ft-role="hourly-series-menu"]');
    const trigger = root.querySelector('[data-ft-role="hourly-series-trigger"]');
    if (!menu || !trigger) return;
    const shouldOpen = Boolean(open);
    menu.hidden = !shouldOpen;
    trigger.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen && options.focusSelection) {
      const selected = menu.querySelector(
        '[role="menuitemcheckbox"][aria-checked="true"]:not([disabled])',
      ) || menu.querySelector('[role="menuitemcheckbox"]:not([disabled])');
      selected?.focus();
    } else if (!shouldOpen && options.restoreFocus) {
      trigger.focus();
    }
  }

  async function selectSidebarProposal(anchor) {
    const proposalId = safeBase58(anchor?.dataset?.ftProposalId);
    const market = state.sidebarMarkets.find(candidate => candidate.id === proposalId);
    if (!market) return;
    const token = routes.normalizeTokenKey?.(anchor.dataset.ftToken)
      || normalizeKey(anchor.dataset.ftToken);
    if (!token || token === state.tokenFilter) {
      selectProposal(proposalId, { focus: true });
      return;
    }

    const destination = tokenMarketsUrl(token, proposalId);
    state.workspaceTab = 'decisions';
    state.proposalFocus = true;
    try {
      runtime.history?.pushState?.(null, '', destination);
      syncCanonicalUrl(destination);
    } catch (_) {
      // In-app selection remains functional when history access is restricted.
    }
    await setToken(token, { proposalId });
    if (
      !state.destroyed
      && state.markets.some(candidate => candidate.id === proposalId)
    ) {
      selectProposal(proposalId, {
        focus: true,
        updateUrl: false,
        reveal: false,
      });
    }
  }

  function handleDocumentClick(event) {
    if (state.execution.building || state.execution.submitting) return;
    const decisionSidebarAction = event.target?.closest?.('[data-decision-sidebar-action]');
    if (decisionSidebarAction) {
      const decisionSection = runtime.document.getElementById('tlp-decisions-panel');
      const historyToggleSlot = runtime.document.getElementById(
        'tlp-decision-history-toggle-slot',
      );
      if (
        decisionSection?.contains(decisionSidebarAction)
        || historyToggleSlot?.contains(decisionSidebarAction)
      ) {
        event.preventDefault();
        if (decisionSidebarAction.dataset.decisionSidebarAction === 'toggle-history') {
          state.sidebarHistoryOpen = !state.sidebarHistoryOpen;
          renderDecisionSidebar();
        }
        return;
      }
    }
    const sidebarProposal = event.target?.closest?.(
      '.tp-decision-item[data-ft-proposal-id]',
    );
    if (
      sidebarProposal
      && shouldHandleSidebarProposalClick(event, sidebarProposal, state.hostMode)
      && state.sidebarMarkets.some(
        market => market.id === safeBase58(sidebarProposal.dataset.ftProposalId),
      )
    ) {
      event.preventDefault();
      void selectSidebarProposal(sidebarProposal);
      return;
    }
    const rangeSelector = root.querySelector('[data-ft-role="hourly-range-select"]');
    const rangeMenu = root.querySelector('[data-ft-role="hourly-range-menu"]');
    if (rangeSelector && rangeMenu && !rangeMenu.hidden && !rangeSelector.contains(event.target)) {
      setHourlyRangeMenuOpen(false);
    }
    const seriesSelector = root.querySelector('[data-ft-role="hourly-series-control"]');
    const seriesMenu = root.querySelector('[data-ft-role="hourly-series-menu"]');
    if (seriesSelector && seriesMenu && !seriesMenu.hidden && !seriesSelector.contains(event.target)) {
      setHourlySeriesMenuOpen(false);
    }
  }

  function handleClick(event) {
    const target = event.target.closest('[data-ft-action]');
    if (
      !target
      || (
        !root.contains(target)
        && !regions.walletStatus?.contains(target)
      )
    ) return;
    const action = target.dataset.ftAction;
    if (
      (state.execution.building || state.execution.submitting)
      && action !== 'copy-signature'
    ) return;

    if (action === 'refresh') {
      event.preventDefault();
      refresh();
    } else if (action === 'toggle-ownership-watchlist') {
      event.preventDefault();
      const watchlist = runtime.NAVGATOR?.shell?.watchlist;
      if (!watchlist?.toggle) return;
      watchlist.toggle(target.dataset.ftToken || state.tokenFilter);
      if (isOwnershipWorkspace()) {
        regions.marketChartHeader.innerHTML = renderOwnershipChartHeader(
          ownershipTokenSnapshot(),
        );
      } else {
        const market = selectedMarket();
        const history = market
          ? state.historyByProposal.get(market.id)?.data
          : null;
        regions.marketChartHeader.innerHTML = market
          ? renderProposalChartHeader(market, history)
          : '';
      }
    } else if (action === 'toggle-chart-expansion') {
      event.preventDefault();
      toggleChartExpansion(target);
    } else if (action === 'select-proposal') {
      if (state.hostMode === 'discovery') event.preventDefault();
      selectProposal(target.dataset.ftProposalId, { focus: true });
    } else if (action === 'filter') {
      state.filter = ['all', 'live', 'resolved', 'indexed'].includes(target.dataset.ftFilter)
        ? target.dataset.ftFilter
        : 'all';
      persistFilterInUrl();
      const visible = filteredMarkets();
      if (state.hostMode === 'discovery') {
        renderMarketList();
      } else if (visible.length && !visible.some(market => market.id === state.selectedId)) {
        selectProposal(visible[0].id, { reveal: false, replaceUrl: true });
      } else {
        renderMarketList();
      }
    } else if (action === 'retry-hourly-history') {
      loadProposalHistory(selectedMarket(), { force: true });
    } else if (action === 'toggle-hourly-series') {
      const field = target.dataset.ftSeriesField;
      if (!['underlyingPrice', 'passPrice', 'failPrice'].includes(field)) return;
      const nextVisible = state.historySeriesVisibility[field] === false;
      if (!nextVisible) {
        const history = state.historyByProposal.get(selectedMarket()?.id)?.data;
        const coverage = history?.summary?.coverage || {};
        const available = {
          underlyingPrice: coverage.underlying > 0,
          passPrice: coverage.pass > 0,
          failPrice: coverage.fail > 0,
        };
        const remaining = Object.keys(available).filter(candidate => (
          candidate !== field
          && available[candidate]
          && state.historySeriesVisibility[candidate] !== false
        ));
        if (!remaining.length) {
          setNotice('Keep at least one available price series visible.');
          return;
        }
      }
      state.historySeriesVisibility[field] = nextVisible;
      state.historyChart?.setSeriesVisible?.(field, nextVisible);
      root.querySelectorAll(
        `[data-ft-action="toggle-hourly-series"][data-ft-series-field="${field}"]`,
      ).forEach((control) => {
        if (control.getAttribute('role') === 'menuitemcheckbox') {
          control.setAttribute('aria-checked', String(nextVisible));
        } else {
          control.setAttribute('aria-pressed', String(nextVisible));
        }
        control.classList.toggle('ft-is-active', nextVisible);
      });
      root.querySelectorAll(`[data-ft-series="${field}"]`).forEach((series) => {
        series.classList.toggle('ft-is-hidden', !nextVisible);
      });
    } else if (action === 'toggle-hourly-series-menu') {
      event.preventDefault();
      const menu = root.querySelector('[data-ft-role="hourly-series-menu"]');
      setHourlySeriesMenuOpen(menu?.hidden !== false, { focusSelection: true });
    } else if (action === 'hourly-chart-tool') {
      const tool = target.dataset.ftChartTool;
      if (tool === 'zoom-in') {
        state.historyChart?.zoomIn?.();
      } else if (tool === 'zoom-out') {
        state.historyChart?.zoomOut?.();
      } else if (tool === 'reset') {
        state.historyChart?.resetView?.();
        return;
      } else {
        return;
      }
    } else if (action === 'load-more-proposals') {
      loadMoreProposals();
    } else if (action === 'clear-search') {
      state.query = '';
      state.filter = 'all';
      persistFilterInUrl();
      if (regions.search) regions.search.value = '';
      renderMarketList();
      regions.search?.focus();
    } else if (action === 'toggle-theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      try {
        runtime.localStorage?.setItem(THEME_STORAGE_KEY, state.theme);
      } catch (_) {
        // Theme still applies for this session when storage is blocked.
      }
      renderHeader();
    } else if (action === 'select-activity') {
      const tab = target.dataset.ftActivity;
      if (['balances', 'orders', 'trades', 'automatic'].includes(tab)) {
        state.activityTab = tab;
        renderPositions();
      }
    } else if (action === 'select-ownership-activity') {
      const tab = target.dataset.ftOwnershipActivity;
      if (['balances', 'orders', 'trades'].includes(tab)) {
        state.ownershipActivityTab = tab;
        renderPositions();
      }
    } else if (action === 'toggle-transaction-size-unit') {
      state.transactionSizeUnit = state.transactionSizeUnit === 'usd' ? 'token' : 'usd';
      renderPositions();
    } else if (action === 'filter-decision-trades') {
      const support = target.dataset.ftSupport;
      if (['all', 'pass', 'fail'].includes(support)) {
        state.decisionTradeSupportFilter = support;
        renderPositions();
      }
    } else if (action === 'select-book') {
      const book = target.dataset.ftBook;
      if (book === 'pass' || book === 'fail') {
        state.bookTab = book;
        renderMarketStage();
      }
    } else if (action === 'select-outcome') {
      const outcome = target.dataset.ftOutcome;
      if (outcome === 'pass' || outcome === 'fail') {
        state.order.outcome = outcome;
        state.order.price = '';
        state.execution.error = '';
        renderMarketStage();
        renderTradeTicket();
      }
    } else if (action === 'select-side') {
      const side = target.dataset.ftSide;
      if (side === 'buy' || side === 'sell') {
        state.order.side = side;
        state.order.amount = '';
        state.order.price = '';
        state.execution.error = '';
        renderTradeTicket();
      }
    } else if (action === 'select-ownership-side') {
      const side = target.dataset.ftSide;
      if (side === 'buy' || side === 'sell') {
        state.ownershipOrder.side = side;
        state.ownershipOrder.amount = '';
        invalidateOwnershipQuote();
        renderTradeTicket();
      }
    } else if (action === 'select-ownership-order-type') {
      const type = target.dataset.ftOrderType;
      if (['market', 'smart-fill', 'limit', 'pro'].includes(type)) {
        state.ownershipOrder.type = type;
        invalidateOwnershipQuote();
        if (type === 'market' && firstNumber(state.ownershipOrder.amount) > 0) {
          scheduleOwnershipQuote(0);
        }
        renderTradeTicket();
      }
    } else if (action === 'ownership-amount-preset') {
      const preset = target.dataset.ftAmount;
      state.ownershipOrder.amount = preset === 'max' ? '0' : String(firstNumber(preset) || '');
      scheduleOwnershipQuote(0);
      renderTradeTicket();
    } else if (action === 'decision-amount-preset') {
      const preset = target.dataset.ftAmount;
      const market = selectedMarket();
      const outcomeMint = state.order.outcome === 'pass'
        ? market?.proposal?.passBaseMint
        : market?.proposal?.failBaseMint;
      const inputMint = state.order.type === 'limit'
        ? state.order.side === 'buy'
          ? state.order.outcome === 'pass'
            ? market?.proposal?.passQuoteMint
            : market?.proposal?.failQuoteMint
          : outcomeMint
        : state.order.side === 'buy'
          ? market?.quoteMint
          : market?.baseMint;
      const balance = positionForMint(inputMint);
      const maximum = balance?.available
        ? firstNumber(balance.amountString, balance.amount)
        : null;
      state.order.amount = preset === 'max'
        ? Number.isFinite(maximum) && maximum > 0
          ? String(maximum)
          : ''
        : String(firstNumber(preset) || '');
      state.execution.error = '';
      renderTradeTicket();
    } else if (action === 'select-order-type') {
      const type = target.dataset.ftOrderType;
      const automaticReady = state.recurring.enabled
        && state.recurring.keeperReady
        && Boolean(state.recurring.programId);
      if (
        type === 'limit'
        || type === 'swap'
        || (type === 'recurring' && automaticReady)
      ) {
        state.order.type = type;
        state.order.amount = '';
        state.order.price = '';
        state.execution.error = '';
        renderTradeTicket();
      }
    } else if (action === 'use-book-price') {
      const outcome = target.dataset.ftOutcome;
      const price = firstNumber(target.dataset.ftPrice);
      if ((outcome === 'pass' || outcome === 'fail') && Number.isFinite(price)) {
        state.order.outcome = outcome;
        state.order.type = 'limit';
        state.order.price = String(price);
        state.execution.error = '';
        renderMarketStage();
        renderTradeTicket();
        root.querySelector('[data-ft-role="amount"]')?.focus();
      }
    } else if (action === 'retry-market-data') {
      loadProposalMarketData(selectedMarket(), { force: true });
    } else if (action === 'execute-trade') {
      executeTrade();
    } else if (action === 'review-ownership-trade') {
      reviewOwnershipTrade();
    } else if (action === 'review-redeem') {
      reviewRedemption();
    } else if (action === 'cancel-order') {
      reviewCancelOrder({
        marketAddress: safeBase58(target.dataset.ftMarket),
        clientOrderId: firstText(target.dataset.ftClientOrderId),
        outcome: target.dataset.ftOutcome,
      });
    } else if (action === 'cancel-recurring') {
      reviewRecurringCancel(safeBase58(target.dataset.ftSchedule));
    } else if (action === 'claim-recurring') {
      reviewRecurringClaim(
        safeBase58(target.dataset.ftSchedule),
        target.dataset.ftOutcome,
      );
    } else if (action === 'withdraw-manifest') {
      reviewManifestWithdraw({
        marketAddress: safeBase58(target.dataset.ftMarket),
        outcome: target.dataset.ftOutcome,
      });
    } else if (action === 'approve-transaction') {
      approveTransaction();
    } else if (action === 'connect-wallet') {
      connectWallet();
    } else if (action === 'choose-wallet') {
      connectWalletOptionById(target.dataset.ftWalletId);
    } else if (action === 'disconnect-wallet') {
      disconnectWallet();
    } else if (action === 'close-modal') {
      if (target.classList.contains('ft-modal-backdrop') && event.target !== target) return;
      state.wallet.pickerOpen = false;
      state.execution.reviewOpen = false;
      state.execution.plan = null;
      state.execution.simulation = null;
      renderModal();
    } else if (action === 'refresh-positions') {
      loadPositions();
    } else if (action === 'refresh-recurring') {
      loadRecurringSchedulesForMarket();
    } else if (action === 'refresh-transactions') {
      refreshTransactionStatuses();
    } else if (action === 'copy-address') {
      const address = safeBase58(target.dataset.ftAddress);
      if (!address) return;
      if (runtime.navigator?.clipboard?.writeText) {
        runtime.navigator.clipboard.writeText(address)
          .then(() => setNotice('Address copied to clipboard.'))
          .catch(() => setNotice('Clipboard access was blocked.'));
      } else {
        setNotice(address);
      }
    } else if (action === 'copy-signature') {
      const signature = safeSignature(target.dataset.ftSignature);
      if (!signature) return;
      if (runtime.navigator?.clipboard?.writeText) {
        runtime.navigator.clipboard.writeText(signature)
          .then(() => setNotice('Transaction signature copied to clipboard.'))
          .catch(() => setNotice('Clipboard access was blocked.'));
      } else {
        setNotice(signature);
      }
    }
  }

  function handleInput(event) {
    if (
      (state.execution.building || state.execution.submitting)
      && event.target.matches(
        '[data-ft-role="amount"], [data-ft-role="limit-price"], [data-ft-role="recurring-cycles"]',
      )
    ) return;
    if (event.target.matches('[data-ft-role="search"]')) {
      state.query = event.target.value || '';
      renderMarketList();
    } else if (event.target.matches('[data-ft-role="ownership-amount"]')) {
      state.ownershipOrder.amount = event.target.value || '';
      scheduleOwnershipQuote();
      const outputRegion = root.querySelector('[data-ft-role="ownership-receive-amount"]');
      const output = ownershipOrderOutput();
      if (outputRegion) {
        outputRegion.textContent = output ? `≈ ${formatTokenAmount(output, 6)}` : '≈ 0';
      }
    } else if (event.target.matches('[data-ft-role="amount"]')) {
      state.order.amount = event.target.value || '';
      const market = selectedMarket();
      updateDecisionTicketPreview(market);
      if (state.order.type === 'recurring') {
        const totalRegion = root.querySelector('[data-ft-role="recurring-total"]');
        const amount = firstNumber(state.order.amount);
        const recurringTotal = Number.isFinite(amount)
          ? amount * state.order.totalCycles
          : null;
        const inputSymbol = state.order.side === 'buy'
          ? 'USDC'
          : market?.ticker || 'TOKEN';
        if (totalRegion) {
          totalRegion.textContent = Number.isFinite(recurringTotal)
            ? `${formatTokenAmount(recurringTotal, 6)} ${inputSymbol}`
            : 'Enter an amount';
        }
        return;
      }
      if (state.order.type === 'limit') return;
    } else if (event.target.matches('[data-ft-role="limit-price"]')) {
      state.order.price = event.target.value || '';
      updateDecisionTicketPreview(selectedMarket());
    } else if (event.target.matches('[data-ft-role="recurring-cycles"]')) {
      const cycles = Number(event.target.value);
      if (
        Number.isInteger(cycles)
        && cycles >= 1
        && cycles <= state.recurring.maximumCycles
      ) {
        state.order.totalCycles = cycles;
      }
    }
  }

  function handleChange(event) {
    if (
      (state.execution.building || state.execution.submitting)
      && event.target.matches(
        '[data-ft-role="slippage"], [data-ft-role="recurring-interval"], [data-ft-role="recurring-cycles"]',
      )
    ) return;
    if (event.target.matches('[data-ft-role="slippage"]')) {
      const next = firstNumber(event.target.value);
      if ([50, 100, 200].includes(next)) {
        state.order.slippageBps = next;
        renderTradeTicket();
      }
    } else if (event.target.matches('[data-ft-role="recurring-interval"]')) {
      const interval = Number(event.target.value);
      if ([3_600, 21_600, 86_400, 604_800].includes(interval)) {
        state.order.intervalSeconds = interval;
        renderTradeTicket();
      }
    } else if (event.target.matches('[data-ft-role="recurring-cycles"]')) {
      const cycles = Number(event.target.value);
      if (
        Number.isInteger(cycles)
        && cycles >= 1
        && cycles <= state.recurring.maximumCycles
      ) {
        state.order.totalCycles = cycles;
        renderTradeTicket();
      }
    }
  }

  function handleKeydown(event) {
    const seriesMenu = root.querySelector('[data-ft-role="hourly-series-menu"]');
    const activeMenu = seriesMenu && !seriesMenu.hidden ? seriesMenu : null;
    if (activeMenu) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setHourlySeriesMenuOpen(false, { restoreFocus: true });
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const options = Array.from(
          activeMenu.querySelectorAll(
            '[role="menuitemcheckbox"]:not([disabled])',
          ),
        );
        if (options.length) {
          event.preventDefault();
          const currentIndex = options.indexOf(runtime.document.activeElement);
          let nextIndex = 0;
          if (event.key === 'Home') nextIndex = 0;
          else if (event.key === 'End') nextIndex = options.length - 1;
          else if (event.key === 'ArrowDown') {
            nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length;
          } else {
            nextIndex = currentIndex < 0
              ? options.length - 1
              : (currentIndex - 1 + options.length) % options.length;
          }
          options[nextIndex].focus();
          return;
        }
      }
    }
    const commandSearch = (event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k';
    const slashSearch = event.key === '/' && !/input|textarea|select/i.test(event.target?.tagName || '');
    if (event.key === 'Escape' && (state.wallet.pickerOpen || state.execution.reviewOpen)) {
      state.wallet.pickerOpen = false;
      state.execution.reviewOpen = false;
      state.execution.plan = null;
      state.execution.simulation = null;
      renderModal();
    } else if (commandSearch || slashSearch) {
      event.preventDefault();
      regions.search?.focus();
      regions.search?.select();
    } else if (event.key === 'Escape' && runtime.document.activeElement === regions.search) {
      state.query = '';
      regions.search.value = '';
      regions.search.blur();
      renderMarketList();
    }
  }

  function handleVisibilityChange() {
    if (runtime.document.visibilityState === 'visible' && !state.destroyed) {
      refresh({ refreshPositions: false });
      refreshTransactionStatuses();
    }
  }

  function handlePageShow(event) {
    if (
      !event?.persisted
      || !state.navigationPending
      || state.destroyed
    ) return;
    state.navigationPending = false;
    endWorkspaceTransition(workspaceTransitionId);
    render();
  }

  async function setToken(nextToken, options = {}) {
    const normalized = routes.normalizeTokenKey?.(nextToken) || normalizeKey(nextToken);
    const requestedProposalId = safeBase58(options.proposalId);
    if (
      state.destroyed
      || state.hostMode !== 'token'
      || !normalized
      || normalized === state.tokenFilter
    ) return state.markets;

    const transitionId = beginWorkspaceTransition();
    state.abortController?.abort();
    state.paginationAbortController?.abort();
    state.positionAbortController?.abort();
    state.marketDataAbortController?.abort();
    state.priceAbortController?.abort();
    state.historyAbortController?.abort();
    state.requestId += 1;
    state.paginationRequestId += 1;
    state.positionRequestId += 1;
    state.marketDataRequestId += 1;
    state.priceRequestId += 1;
    state.priceRefreshing = false;
    state.historyRequestId += 1;
    state.recurringRequestId += 1;
    invalidateOwnershipQuote();
    state.tokenFilter = normalized;
    state.selectedId = requestedProposalId;
    state.requestedProposalId = requestedProposalId;
    if (requestedProposalId) {
      state.proposalFocus = true;
      state.workspaceTab = 'decisions';
    }
    state.routeNotice = '';
    state.markets = [];
    state.activeMarkets = [];
    state.indexedProposals = [];
    state.proposalSummary = {};
    state.proposalPagination = {
      nextCursor: '',
      total: null,
      loadingMore: false,
    };
    state.historyByProposal.clear();
    state.marketDataByProposal.clear();
    state.wallet.positions = [];
    state.wallet.positionsError = '';
    state.wallet.redemption = null;
    state.recurring.schedules = [];
    state.recurring.error = '';
    state.execution.plan = null;
    state.execution.simulation = null;
    state.execution.reviewOpen = false;
    destroyHourlyChart();
    return runWorkspaceTransitionRefresh(transitionId);
  }

  function handlePopState() {
    if (state.destroyed) return;
    const params = new runtime.URLSearchParams(runtime.location?.search || '');
    const nextFilter = String(params.get('filter') || '').toLowerCase();
    state.filter = ['live', 'resolved', 'indexed'].includes(nextFilter)
      ? nextFilter
      : 'all';
    if (state.hostMode === 'token') {
      const nextWorkspaceTab = params.get('tab') === 'tokens' ? 'tokens' : 'decisions';
      state.workspaceTab = nextWorkspaceTab;
      const nextToken = routes.normalizeTokenKey?.(params.get('token'))
        || normalizeKey(params.get('token'));
      if (nextToken && nextToken !== state.tokenFilter) {
        setToken(nextToken);
        return;
      }
      const proposalId = safeBase58(params.get('proposal'));
      if (proposalId && state.markets.some(market => market.id === proposalId)) {
        selectProposal(proposalId, {
          focus: true,
          updateUrl: false,
          reveal: false,
        });
      } else {
        state.selectedId = filteredMarkets()[0]?.id || state.markets[0]?.id || '';
        render();
      }
      return;
    }
    renderMarketList();
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    clearOwnershipChartExpansion();
    destroyHourlyChart();
    state.abortController?.abort();
    state.paginationAbortController?.abort();
    state.positionAbortController?.abort();
    state.marketDataAbortController?.abort();
    state.priceAbortController?.abort();
    state.historyAbortController?.abort();
    state.ownershipOrder.quoteAbortController?.abort();
    if (state.ownershipOrder.quoteTimer) {
      runtime.clearTimeout(state.ownershipOrder.quoteTimer);
      state.ownershipOrder.quoteTimer = null;
    }
    state.wallet.adapter?.unsubscribe?.();
    if (state.pollTimer) runtime.clearInterval(state.pollTimer);
    if (state.pricePollTimer) runtime.clearInterval(state.pricePollTimer);
    if (state.clockTimer) runtime.clearInterval(state.clockTimer);
    if (state.transactionTimer) runtime.clearInterval(state.transactionTimer);
    if (state.noticeTimer) runtime.clearTimeout(state.noticeTimer);
    if (walletStatusPortaled) {
      regions.walletStatus.removeEventListener('click', handleClick);
      regions.walletStatus.remove();
    }
    root.removeEventListener('click', handleClick);
    root.removeEventListener('input', handleInput);
    root.removeEventListener('change', handleChange);
    runtime.document.removeEventListener('click', handleDocumentClick);
    runtime.document.removeEventListener('keydown', handleKeydown);
    runtime.document.removeEventListener('visibilitychange', handleVisibilityChange);
    runtime.removeEventListener?.('popstate', handlePopState);
    runtime.removeEventListener?.('pageshow', handlePageShow);
    workspaceTransitionId += 1;
    activeWorkspaceTransitionPromise = null;
    root.removeAttribute('data-ft-transition');
    root.removeAttribute('aria-busy');
    root.innerHTML = '';
    root.classList.remove('ft-proposal-focus');
    activeMounts.delete(root);
  }

  root.addEventListener('click', handleClick);
  if (walletStatusPortaled) {
    regions.walletStatus.addEventListener('click', handleClick);
  }
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleChange);
  runtime.document.addEventListener('click', handleDocumentClick);
  runtime.document.addEventListener('keydown', handleKeydown);
  runtime.document.addEventListener('visibilitychange', handleVisibilityChange);
  runtime.addEventListener?.('popstate', handlePopState);
  runtime.addEventListener?.('pageshow', handlePageShow);

  if (requestedFilter === 'observed' && runtime.history?.replaceState) {
    try {
      const url = new runtime.URL(runtime.location.href);
      url.searchParams.delete('filter');
      runtime.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {
      // Obsolete filter cleanup is optional when history access is restricted.
    }
  }

  const ready = runWorkspaceTransitionRefresh(initialTransitionId);
  state.pollTimer = runtime.setInterval(() => {
    if (runtime.document.visibilityState !== 'hidden') refresh();
  }, POLL_INTERVAL_MS);
  state.pricePollTimer = runtime.setInterval(() => {
    if (runtime.document.visibilityState !== 'hidden') refreshLivePrices();
  }, LIVE_PRICE_INTERVAL_MS);
  state.clockTimer = runtime.setInterval(renderClock, 1_000);
  state.transactionTimer = runtime.setInterval(() => {
    if (runtime.document.visibilityState !== 'hidden') refreshTransactionStatuses();
  }, TRANSACTION_STATUS_INTERVAL_MS);

  const controller = {
    destroy,
    refresh,
    refreshLivePrices,
    loadMoreProposals,
    loadProposalMarketData,
    loadProposalHistory,
    loadPositions,
    setToken,
    ready,
    getState() {
      return {
        mode: state.hostMode,
        workspaceTab: state.workspaceTab,
        token: state.tokenFilter,
        theme: state.theme,
        marketCount: state.markets.length,
        selectedId: state.selectedId,
        walletAddress: state.wallet.address,
        navigationPending: state.navigationPending,
        degraded: state.degraded?.active === true,
        programIntegrity: state.programIntegrity.status,
        canTransact: state.programIntegrity.canTransact,
      };
    },
  };
  activeMounts.set(root, controller);
  return controller;
}

export const mountFutarchyTerminal = mountFutardTerminal;
