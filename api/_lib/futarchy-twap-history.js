import { BorshCoder } from '@coral-xyz/anchor';
import { FutarchyIDL } from '@metadaoproject/programs';
import bs58 from 'bs58';

import { FUTARCHY_PROGRAM_ID } from './futarchy-accounts.js';

const EVENT_CPI_PREFIX_BYTES = 8;
const ORACLE_PRICE_SCALE = 1_000_000_000_000;
// This public keeper is used only as a sparse transaction index. Every decoded
// value is still bound to the reviewed Futarchy program and requested DAO.
const FUTARCHY_OBSERVATION_CRANK = 'CRANkLNAUCPFapK5zpc1BvXA1WjfZpo6wEmssyECxuxf';
const SIGNATURE_PAGE_LIMIT = 1_000;
const MAX_SIGNATURE_PAGES = 6;
const MAX_OBSERVATIONS = 400;
const TRANSACTION_BATCH_SIZE = 50;
const MAX_RPC_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const INTERVAL_SECONDS = Object.freeze({
  '15m': 15 * 60,
  '1h': 60 * 60,
});

const eventCoder = new BorshCoder(FutarchyIDL).events;

function integer(value) {
  if (typeof value === 'bigint') return value;
  const text = value?.toString?.(10) ?? String(value ?? '');
  return /^-?\d+$/.test(text) ? BigInt(text) : null;
}

function timestampSeconds(value) {
  const milliseconds = new Date(value || '').getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1_000) : null;
}

function combineSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function parseBoundedJson(response) {
  if (!response.ok || response.status >= 300) {
    throw new Error(`Solana RPC returned HTTP ${response.status}`);
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RPC_RESPONSE_BYTES) {
    throw new Error('Solana RPC response exceeded the safe size limit');
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_RPC_RESPONSE_BYTES) {
    throw new Error('Solana RPC response exceeded the safe size limit');
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('Solana RPC returned invalid JSON');
  }
}

async function rpcRequest(rpcUrl, payload, options = {}) {
  const response = await (options.fetchImpl || fetch)(rpcUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': '01rx-twap-history/1.0',
    },
    body: JSON.stringify(payload),
    redirect: 'manual',
    signal: combineSignal(options.signal, options.timeoutMs || DEFAULT_TIMEOUT_MS),
  });
  return parseBoundedJson(response);
}

export function calculateOracleTwapRaw(oracle, observedAtSeconds) {
  const aggregator = integer(oracle?.aggregator);
  const lastUpdated = integer(oracle?.lastUpdatedTimestamp);
  const createdAt = integer(oracle?.createdAtTimestamp);
  const lastObservation = integer(oracle?.lastObservation);
  const startDelay = integer(oracle?.startDelaySeconds);
  const observedAt = integer(observedAtSeconds);
  if ([
    aggregator,
    lastUpdated,
    createdAt,
    lastObservation,
    startDelay,
    observedAt,
  ].some(value => value == null)) return null;
  const start = createdAt + startDelay;
  if (
    aggregator === 0n
    || lastUpdated <= start
    || observedAt <= start
    || observedAt < lastUpdated
  ) return null;
  const elapsed = observedAt - start;
  return (aggregator + (lastObservation * (observedAt - lastUpdated))) / elapsed;
}

function rawPriceToUi(raw, baseDecimals, quoteDecimals) {
  if (raw == null) return null;
  const price = (Number(raw) / ORACLE_PRICE_SCALE)
    * (10 ** (baseDecimals - quoteDecimals));
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function twapSnapshotFromEvent(event, options = {}) {
  if (
    event?.name !== 'SpotSwapEvent'
    || String(event.data?.dao || '') !== options.daoAddress
  ) return null;
  const futarchy = event.data?.postAmmState?.state?.futarchy;
  const observedAt = Number(options.observedAtSeconds);
  if (!futarchy || !Number.isSafeInteger(observedAt)) return null;
  const underlyingTwap = rawPriceToUi(
    calculateOracleTwapRaw(futarchy.spot?.oracle, observedAt),
    options.baseDecimals,
    options.quoteDecimals,
  );
  const passTwap = rawPriceToUi(
    calculateOracleTwapRaw(futarchy.pass?.oracle, observedAt),
    options.baseDecimals,
    options.quoteDecimals,
  );
  const failTwap = rawPriceToUi(
    calculateOracleTwapRaw(futarchy.fail?.oracle, observedAt),
    options.baseDecimals,
    options.quoteDecimals,
  );
  if (
    !Number.isFinite(underlyingTwap)
    && !Number.isFinite(passTwap)
    && !Number.isFinite(failTwap)
  ) return null;
  return { underlyingTwap, passTwap, failTwap };
}

function decodeTwapSnapshot(transaction, options) {
  const observedAtSeconds = Number(transaction?.blockTime);
  if (!Number.isSafeInteger(observedAtSeconds)) return null;
  let latest = null;
  for (const group of transaction?.meta?.innerInstructions || []) {
    for (const instruction of group?.instructions || []) {
      if (instruction?.programId !== FUTARCHY_PROGRAM_ID || !instruction.data) continue;
      try {
        const bytes = bs58.decode(instruction.data);
        if (bytes.length <= EVENT_CPI_PREFIX_BYTES) continue;
        const event = eventCoder.decode(
          Buffer.from(bytes.slice(EVENT_CPI_PREFIX_BYTES)).toString('base64'),
        );
        const snapshot = twapSnapshotFromEvent(event, {
          ...options,
          observedAtSeconds,
        });
        if (snapshot) latest = snapshot;
      } catch {
        // Other self-CPIs are expected and are not event payloads.
      }
    }
  }
  return latest ? { observedAtSeconds, ...latest } : null;
}

export function selectBucketSignatures(rows, options = {}) {
  const intervalSeconds = INTERVAL_SECONDS[options.interval];
  const fromSeconds = timestampSeconds(options.from);
  const toSeconds = timestampSeconds(options.to);
  if (!intervalSeconds || !Number.isSafeInteger(fromSeconds)) return [];
  const buckets = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const blockTime = Number(row?.blockTime);
    if (
      row?.err
      || !Number.isSafeInteger(blockTime)
      || blockTime < fromSeconds
      || (Number.isSafeInteger(toSeconds) && blockTime > toSeconds)
      || typeof row.signature !== 'string'
    ) continue;
    const bucket = Math.floor(blockTime / intervalSeconds) * intervalSeconds;
    const current = buckets.get(bucket);
    if (!current || blockTime > current.blockTime) buckets.set(bucket, row);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucket, row]) => ({ bucket, ...row }))
    .slice(0, MAX_OBSERVATIONS);
}

async function loadSignatures(rpcUrl, daoAddress, fromSeconds, options) {
  const rows = [];
  let before;
  for (let page = 0; page < MAX_SIGNATURE_PAGES; page += 1) {
    const configuration = {
      limit: SIGNATURE_PAGE_LIMIT,
      commitment: 'confirmed',
      ...(before ? { before } : {}),
    };
    const payload = await rpcRequest(rpcUrl, {
      jsonrpc: '2.0',
      id: `signatures-${page}`,
      method: 'getSignaturesForAddress',
      params: [daoAddress, configuration],
    }, options);
    if (payload?.error) throw new Error('Solana RPC rejected signature history');
    const pageRows = Array.isArray(payload?.result) ? payload.result : [];
    rows.push(...pageRows);
    const oldest = pageRows.at(-1);
    if (
      pageRows.length < SIGNATURE_PAGE_LIMIT
      || !oldest?.signature
      || (Number.isSafeInteger(oldest.blockTime) && oldest.blockTime < fromSeconds)
    ) break;
    before = oldest.signature;
  }
  return rows;
}

async function loadTransactions(rpcUrl, signatures, options) {
  const transactions = new Map();
  const batches = [];
  for (let offset = 0; offset < signatures.length; offset += TRANSACTION_BATCH_SIZE) {
    const batch = signatures.slice(offset, offset + TRANSACTION_BATCH_SIZE);
    const payload = batch.map((row, index) => ({
      jsonrpc: '2.0',
      id: `transaction-${offset + index}`,
      method: 'getTransaction',
      params: [row.signature, {
        commitment: 'confirmed',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
      }],
    }));
    batches.push(rpcRequest(rpcUrl, payload, options));
  }
  const responses = await Promise.all(batches);
  responses.forEach((response) => {
    if (!Array.isArray(response)) throw new Error('Solana RPC rejected transaction batch');
    response.forEach((item) => {
      if (item?.error || !item?.result) return;
      const index = Number(String(item.id || '').split('-').at(-1));
      const signature = signatures[index]?.signature;
      if (signature) transactions.set(signature, item.result);
    });
  });
  return transactions;
}

/**
 * Read exact protocol TWAP observations from on-chain SpotSwapEvent payloads.
 * This is a server-only fallback for gaps in 01Resolved proposal history.
 */
export async function loadFutarchyTwapHistory(options = {}) {
  const intervalSeconds = INTERVAL_SECONDS[options.interval];
  const fromSeconds = timestampSeconds(options.from);
  const toSeconds = timestampSeconds(options.to || new Date());
  if (
    !options.rpcUrl
    || !options.daoAddress
    || !intervalSeconds
    || !Number.isSafeInteger(fromSeconds)
    || !Number.isSafeInteger(toSeconds)
    || toSeconds < fromSeconds
  ) return [];

  const shared = {
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  };
  const signatureRows = await loadSignatures(
    options.rpcUrl,
    options.observationAddress || FUTARCHY_OBSERVATION_CRANK,
    fromSeconds,
    shared,
  );
  const selected = selectBucketSignatures(signatureRows, options);
  if (!selected.length) return [];
  if (selected.length >= MAX_OBSERVATIONS) {
    throw new Error('Requested TWAP history exceeds the observation limit');
  }
  const transactions = await loadTransactions(options.rpcUrl, selected, shared);
  return selected.map((row) => {
    const snapshot = decodeTwapSnapshot(transactions.get(row.signature), options);
    if (!snapshot) return null;
    return {
      timestamp: new Date(row.bucket * 1_000).toISOString(),
      observedAt: new Date(snapshot.observedAtSeconds * 1_000).toISOString(),
      underlyingTwap: snapshot.underlyingTwap,
      passTwap: snapshot.passTwap,
      failTwap: snapshot.failTwap,
    };
  }).filter(Boolean);
}

export const _test = Object.freeze({
  decodeTwapSnapshot,
  integer,
  rawPriceToUi,
  timestampSeconds,
});
