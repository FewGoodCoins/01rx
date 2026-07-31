import * as crypto from 'node:crypto';
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Connection,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  unpackMint,
} from '@solana/spl-token';
import bs58 from 'bs58';
import {
  getTradableOwnershipTokens,
  MAINNET_USDC_MINT,
  normalizeOwnershipTokenKey,
} from './ownership-token-registry.js';
import {
  DFLOW_MAX_COMPUTE_UNIT_LIMIT,
  DFLOW_MAX_PRIORITY_FEE_LAMPORTS,
  DFLOW_POLICY_PROGRAM_ID,
  decodeAndValidateDflowSwap,
  loadAndValidateDflowProgramIntegrity,
  loadAndValidateTradeAccountState,
  simulationAccountRequest,
  validateComputeBudgetPolicy,
  validateDflowSwapAccounts,
  validateSimulatedTradeEffects,
} from './dflow-transaction-policy.js';

export const MAINNET_CLUSTER = 'solana:mainnet';
export const DFLOW_PRODUCTION_URL = 'https://quote-api.dflow.net';
export const DFLOW_DEVELOPMENT_URL = 'https://dev-quote-api.dflow.net';
export const DFLOW_PROGRAM_ID = DFLOW_POLICY_PROGRAM_ID;
export const DFLOW_SIGNING_KEY = 'EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF';
export const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
export const MAX_REVIEW_AGE_SECONDS = 120;

const MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com';
const MAX_U64 = (1n << 64n) - 1n;
const MAX_TRANSACTION_BYTES = 1_232;
const MAX_RESPONSE_BYTES = 64_000;
const MAX_REVIEW_TOKEN_BYTES = 96_000;
const MAX_CLOCK_SKEW_SECONDS = 30;
const REQUEST_TIMEOUT_MS = 12_000;
const ALLOWED_DFLOW_URLS = new Set([
  DFLOW_DEVELOPMENT_URL,
  DFLOW_PRODUCTION_URL,
]);
const SIGNATURE_INPUT_RE = new RegExp(
  '^sig1=\\("@status" "content-type" "content-digest" "x-request-id";req\\);'
  + `created=(\\d{10});keyid="${DFLOW_SIGNING_KEY}";alg="ed25519"$`,
);
const SIGNATURE_RE = /^sig1=:([A-Za-z0-9+/]+={0,2}):$/;
const INTEGER_RE = /^(?:0|[1-9]\d*)$/;
const DECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function tradingError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function runtimeEnvironment(env) {
  const vercelEnvironment = String(env.VERCEL_ENV || '').trim().toLowerCase();
  if (vercelEnvironment) return vercelEnvironment;
  return String(env.NODE_ENV || '').trim().toLowerCase() || 'development';
}

export function resolveDflowUrl(env = process.env) {
  const explicit = String(env.DFLOW_TRADE_API_URL || '').trim().replace(/\/+$/, '');
  if (explicit && !ALLOWED_DFLOW_URLS.has(explicit)) {
    throw tradingError(
      'DFlow API URL must be an approved DFlow quote endpoint',
      'TRADING_CONFIGURATION_ERROR',
      503,
    );
  }
  if (explicit) return explicit;
  return ['production', 'preview'].includes(runtimeEnvironment(env))
    ? DFLOW_PRODUCTION_URL
    : DFLOW_DEVELOPMENT_URL;
}

export function resolveRpcUrl(env = process.env) {
  const configured = String(env.SOLANA_RPC_URL || env.HELIUS_RPC_URL || '').trim();
  if (configured) {
    let url;
    try {
      url = new URL(configured);
    } catch {
      throw tradingError('Solana RPC URL is invalid', 'TRADING_CONFIGURATION_ERROR', 503);
    }
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.hash
    ) {
      throw tradingError(
        'Solana RPC URL must be an HTTPS URL',
        'TRADING_CONFIGURATION_ERROR',
        503,
      );
    }
    return url.href;
  }
  if (String(env.VERCEL_ENV || '').trim()) {
    throw tradingError(
      'Ownership trading is awaiting a configured Solana RPC',
      'TRADING_NOT_CONFIGURED',
      503,
    );
  }
  return MAINNET_RPC_URL;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw tradingError(`${label} must be an object`, 'INVALID_TRADING_REQUEST');
  }
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw tradingError(
      `${label} contains unsupported field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
      'INVALID_TRADING_REQUEST',
    );
  }
}

function normalizeSolanaAddress(value) {
  const text = String(value || '').trim();
  try {
    const normalized = new PublicKey(text).toBase58();
    return normalized === text ? normalized : '';
  } catch {
    return '';
  }
}

function requireAddress(value, label) {
  const address = normalizeSolanaAddress(value);
  if (!address) {
    throw tradingError(`${label} must be a valid Solana address`, 'INVALID_TRADING_REQUEST');
  }
  return address;
}

function normalizeSolanaSignature(value) {
  const text = String(value || '').trim();
  try {
    const bytes = bs58.decode(text);
    return bytes.length === 64 && bs58.encode(bytes) === text ? text : '';
  } catch {
    return '';
  }
}

function requireIntegerString(value, label, { positive = false } = {}) {
  const text = String(value ?? '').trim();
  if (
    !INTEGER_RE.test(text)
    || text.length > 20
    || (positive && BigInt(text) <= 0n)
    || BigInt(text) > MAX_U64
  ) {
    throw tradingError(`${label} is invalid`, 'INVALID_DFLOW_RESPONSE', 502);
  }
  return text;
}

function requireSafeInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw tradingError(`${label} is invalid`, 'INVALID_DFLOW_RESPONSE', 502);
  }
  return value;
}

function requireContextBoundFee(response, minimumSlot) {
  if (
    !Number.isSafeInteger(response?.context?.slot)
    || response.context.slot < minimumSlot
    || !Number.isSafeInteger(response.value)
    || response.value < 0
  ) {
    throw tradingError(
      'The Solana network fee could not be verified at the reviewed slot',
      'SOLANA_FEE_UNAVAILABLE',
      503,
    );
  }
  return response.value;
}

function requireContextBoundSimulation(response, minimumSlot) {
  if (
    !Number.isSafeInteger(response?.context?.slot)
    || response.context.slot < minimumSlot
    || !response.value
    || typeof response.value !== 'object'
  ) {
    throw tradingError(
      'The Solana simulation could not be verified at the reviewed slot',
      'SOLANA_SIMULATION_UNAVAILABLE',
      503,
    );
  }
  return response.value;
}

export function formatRawAmount(value, decimals) {
  const raw = BigInt(requireIntegerString(value, 'Token amount'));
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseUiAmount(value, decimals) {
  const text = String(value ?? '').trim();
  if (
    !Number.isInteger(decimals)
    || decimals < 0
    || decimals > 18
    || !DECIMAL_RE.test(text)
    || text.length > 48
  ) {
    throw tradingError('Enter a valid decimal amount', 'INVALID_TRADING_AMOUNT');
  }
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) {
    throw tradingError(
      `Amount supports at most ${decimals} decimal places`,
      'INVALID_TRADING_AMOUNT',
    );
  }
  const atomic = BigInt(whole) * (10n ** BigInt(decimals))
    + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (atomic <= 0n || atomic > MAX_U64) {
    throw tradingError('Trade amount is outside the supported range', 'INVALID_TRADING_AMOUNT');
  }
  return {
    atomic: atomic.toString(),
    ui: formatRawAmount(atomic.toString(), decimals),
  };
}

function boundedSlippage(value) {
  const slippage = value == null ? 100 : Number(value);
  if (!Number.isInteger(slippage) || slippage < 1 || slippage > 500) {
    throw tradingError('Slippage must be between 0.01% and 5%', 'INVALID_TRADING_SLIPPAGE');
  }
  return slippage;
}

function createEd25519PublicKey(address) {
  const raw = new PublicKey(address).toBuffer();
  return crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      raw,
    ]),
    format: 'der',
    type: 'spki',
  });
}

function parseSignedResponseHeaders(headers) {
  const signatureInput = String(headers.get('signature-input') || '');
  const signature = String(headers.get('signature') || '');
  const contentDigest = String(headers.get('content-digest') || '');
  const contentType = String(headers.get('content-type') || '');
  const requestId = String(headers.get('x-request-id') || '');
  const inputMatch = SIGNATURE_INPUT_RE.exec(signatureInput);
  const signatureMatch = SIGNATURE_RE.exec(signature);
  if (
    !inputMatch
    || !signatureMatch
    || contentType !== 'application/json'
    || !/^[0-9a-f-]{36}$/i.test(requestId)
  ) {
    throw tradingError(
      'DFlow response authenticity could not be verified',
      'DFLOW_RESPONSE_SIGNATURE_INVALID',
      502,
    );
  }
  return {
    contentDigest,
    contentType,
    created: Number(inputMatch[1]),
    requestId,
    signature,
    signatureBytes: Buffer.from(signatureMatch[1], 'base64'),
    signatureInput,
  };
}

export function verifySignedDflowResponse({
  body,
  headers,
  status,
  expectedRequestId,
  now = () => Date.now(),
  maxAgeSeconds = MAX_REVIEW_AGE_SECONDS,
}) {
  const proof = parseSignedResponseHeaders(headers);
  if (proof.signatureBytes.length !== 64 || proof.requestId !== expectedRequestId) {
    throw tradingError(
      'DFlow response authenticity could not be verified',
      'DFLOW_RESPONSE_SIGNATURE_INVALID',
      502,
    );
  }
  const expectedDigest = `sha-256=:${crypto.createHash('sha256').update(body).digest('base64')}:`;
  if (proof.contentDigest !== expectedDigest) {
    throw tradingError(
      'DFlow response content digest did not match',
      'DFLOW_RESPONSE_SIGNATURE_INVALID',
      502,
    );
  }
  const currentSeconds = Math.floor(now() / 1_000);
  if (
    proof.created > currentSeconds + MAX_CLOCK_SKEW_SECONDS
    || currentSeconds - proof.created > maxAgeSeconds
  ) {
    throw tradingError(
      'DFlow response signature has expired',
      'DFLOW_RESPONSE_EXPIRED',
      409,
    );
  }
  const signatureParameters = proof.signatureInput.slice(
    proof.signatureInput.indexOf('=') + 1,
  );
  const signatureBase = [
    `"@status": ${status}`,
    `"content-type": ${proof.contentType}`,
    `"content-digest": ${proof.contentDigest}`,
    `"x-request-id";req: ${proof.requestId}`,
    `"@signature-params": ${signatureParameters}`,
  ].join('\n');
  if (!crypto.verify(
    null,
    Buffer.from(signatureBase),
    createEd25519PublicKey(DFLOW_SIGNING_KEY),
    proof.signatureBytes,
  )) {
    throw tradingError(
      'DFlow response signature did not match',
      'DFLOW_RESPONSE_SIGNATURE_INVALID',
      502,
    );
  }
  return {
    body: body.toString('base64'),
    contentDigest: proof.contentDigest,
    contentType: proof.contentType,
    created: proof.created,
    requestId: proof.requestId,
    signature: proof.signature,
    signatureInput: proof.signatureInput,
    status,
  };
}

export function encodeReviewToken(proof) {
  return Buffer.from(JSON.stringify({
    version: 1,
    ...proof,
  })).toString('base64url');
}

export function decodeReviewToken(value, now = () => Date.now()) {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_REVIEW_TOKEN_BYTES) {
    throw tradingError('Trade review token is invalid', 'INVALID_TRADE_REVIEW');
  }
  let proof;
  let body;
  try {
    proof = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
    if (
      proof.version !== 1
      || proof.status !== 200
      || typeof proof.body !== 'string'
      || Buffer.byteLength(proof.body, 'base64') > MAX_RESPONSE_BYTES
    ) {
      throw new Error('invalid token');
    }
    body = Buffer.from(proof.body, 'base64');
  } catch {
    throw tradingError('Trade review token is invalid', 'INVALID_TRADE_REVIEW');
  }
  verifySignedDflowResponse({
    body,
    headers: new Headers({
      'content-digest': proof.contentDigest,
      'content-type': proof.contentType,
      signature: proof.signature,
      'signature-input': proof.signatureInput,
      'x-request-id': proof.requestId,
    }),
    status: proof.status,
    expectedRequestId: proof.requestId,
    now,
  });
  try {
    return {
      payload: JSON.parse(body.toString('utf8')),
      proof,
    };
  } catch {
    throw tradingError('Trade review payload is invalid', 'INVALID_TRADE_REVIEW');
  }
}

async function readBoundedResponse(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw tradingError('DFlow response was too large', 'INVALID_DFLOW_RESPONSE', 502);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_RESPONSE_BYTES) {
    throw tradingError('DFlow response was too large', 'INVALID_DFLOW_RESPONSE', 502);
  }
  return body;
}

async function fetchDflowOrder({
  fetchImpl,
  apiUrl,
  apiKey,
  intent,
  owner,
  now,
  randomUuid,
}) {
  const requestId = randomUuid();
  const url = new URL('/order', apiUrl);
  const query = {
    allowAsyncExec: 'false',
    allowSyncExec: 'true',
    amount: intent.atomicAmount,
    dynamicComputeUnitLimit: 'true',
    includeAddressLookupTables: 'true',
    inputMint: intent.inputMint,
    maxTransactionSize: String(MAX_TRANSACTION_BYTES),
    onlyDirectRoutes: 'true',
    outputMint: intent.outputMint,
    perLegSlippage: 'true',
    predictionMarketSlippageBps: String(intent.slippageBps),
    prioritizationFeeLamports: 'medium',
    prioritizationFeeMaxLamports: '1000000',
    slippageBps: String(intent.slippageBps),
  };
  if (owner) query.userPublicKey = owner;
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    const headers = {
      accept: 'application/json',
      'x-dflow-caller': 'human',
      'x-request-id': requestId,
      'x-sign-request': 'true',
    };
    if (apiKey) headers['x-api-key'] = apiKey;
    response = await fetchImpl(url, {
      headers,
      method: 'GET',
      signal: controller.signal,
    });
  } catch (error) {
    const unavailable = tradingError(
      error?.name === 'AbortError'
        ? 'DFlow route request timed out'
        : 'DFlow routing is temporarily unavailable',
      'DFLOW_UNAVAILABLE',
      503,
    );
    unavailable.cause = error;
    throw unavailable;
  } finally {
    clearTimeout(timeout);
  }

  const body = await readBoundedResponse(response);
  if (!response.ok) {
    let upstream = {};
    try {
      upstream = JSON.parse(body.toString('utf8'));
    } catch {
      // Do not reflect untrusted upstream response bodies.
    }
    const noRoute = response.status === 400 && upstream.code === 'route_not_found';
    throw tradingError(
      noRoute
        ? 'No executable route is currently available for this amount'
        : 'DFlow routing is temporarily unavailable',
      noRoute ? 'DFLOW_ROUTE_NOT_FOUND' : 'DFLOW_UNAVAILABLE',
      noRoute ? 422 : 503,
    );
  }
  const proof = verifySignedDflowResponse({
    body,
    headers: response.headers,
    status: response.status,
    expectedRequestId: requestId,
    now,
  });
  try {
    return {
      payload: JSON.parse(body.toString('utf8')),
      proof,
    };
  } catch {
    throw tradingError('DFlow returned invalid JSON', 'INVALID_DFLOW_RESPONSE', 502);
  }
}

function validateRoutePlan(value, intent, outAmount) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw tradingError('DFlow did not return a direct route', 'INVALID_DFLOW_RESPONSE', 502);
  }
  const leg = requireObject(value[0], 'DFlow route leg');
  const inputMint = requireAddress(leg.inputMint, 'DFlow route input mint');
  const outputMint = requireAddress(leg.outputMint, 'DFlow route output mint');
  const inputDecimals = requireSafeInteger(
    leg.inputMintDecimals,
    'DFlow input mint decimals',
    { maximum: 18 },
  );
  const outputDecimals = requireSafeInteger(
    leg.outputMintDecimals,
    'DFlow output mint decimals',
    { maximum: 18 },
  );
  if (
    inputMint !== intent.inputMint
    || outputMint !== intent.outputMint
    || requireIntegerString(leg.inAmount, 'DFlow route input amount', { positive: true })
      !== intent.atomicAmount
    || requireIntegerString(leg.outAmount, 'DFlow route output amount', { positive: true })
      !== outAmount
  ) {
    throw tradingError(
      'DFlow route does not match the requested trade',
      'INVALID_DFLOW_RESPONSE',
      502,
    );
  }
  const venue = String(leg.venue || '').trim();
  const marketKey = requireAddress(leg.marketKey, 'DFlow route market');
  if (!venue || venue.length > 80) {
    throw tradingError('DFlow route venue is invalid', 'INVALID_DFLOW_RESPONSE', 502);
  }
  return {
    inputDecimals,
    outputDecimals,
    route: [{ venue, marketKey }],
  };
}

export function validateOrderResponse(payload, intent, { transactionRequired = false } = {}) {
  requireObject(payload, 'DFlow response');
  const inputMint = requireAddress(payload.inputMint, 'DFlow input mint');
  const outputMint = requireAddress(payload.outputMint, 'DFlow output mint');
  const inAmount = requireIntegerString(payload.inAmount, 'DFlow input amount', {
    positive: true,
  });
  const outAmount = requireIntegerString(payload.outAmount, 'DFlow output amount', {
    positive: true,
  });
  const minimumAmountOut = requireIntegerString(
    payload.minOutAmount,
    'DFlow minimum output',
    { positive: true },
  );
  const otherAmountThreshold = requireIntegerString(
    payload.otherAmountThreshold,
    'DFlow output threshold',
    { positive: true },
  );
  const slippageBps = requireSafeInteger(
    payload.slippageBps,
    'DFlow slippage',
    { maximum: 65_535 },
  );
  const contextSlot = requireSafeInteger(payload.contextSlot, 'DFlow context slot');
  const priceImpactFraction = Number(payload.priceImpactPct);
  const predictionMarketSlippageBps = payload.predictionMarketSlippageBps == null
    ? null
    : requireSafeInteger(
      payload.predictionMarketSlippageBps,
      'DFlow prediction-market slippage',
      { maximum: 65_535 },
    );
  const expectedMinimumAmountOut = (
    BigInt(outAmount) * BigInt(10_000 - slippageBps) + 9_999n
  ) / 10_000n;
  if (
    inputMint !== intent.inputMint
    || outputMint !== intent.outputMint
    || inAmount !== intent.atomicAmount
    || slippageBps !== intent.slippageBps
    || minimumAmountOut !== otherAmountThreshold
    || BigInt(minimumAmountOut) !== expectedMinimumAmountOut
    || (
      predictionMarketSlippageBps != null
      && predictionMarketSlippageBps !== intent.slippageBps
    )
    || (payload.isNativePredictionMarketOutput === true && predictionMarketSlippageBps == null)
    || payload.executionMode !== 'sync'
    || !Number.isFinite(priceImpactFraction)
    || priceImpactFraction < 0
    || priceImpactFraction > 1
  ) {
    throw tradingError(
      'DFlow response does not match the requested trade',
      'INVALID_DFLOW_RESPONSE',
      502,
    );
  }
  if (payload.platformFee != null) {
    throw tradingError('Unexpected platform fee in DFlow response', 'INVALID_DFLOW_RESPONSE', 502);
  }
  const platformFeeBps = 0;
  const routeData = validateRoutePlan(payload.routePlan, intent, outAmount);
  if (
    (intent.inputDecimals != null && routeData.inputDecimals !== intent.inputDecimals)
    || (intent.outputDecimals != null && routeData.outputDecimals !== intent.outputDecimals)
  ) {
    throw tradingError(
      'DFlow route decimals do not match the reviewed assets',
      'INVALID_DFLOW_RESPONSE',
      502,
    );
  }
  const hasTransaction = typeof payload.transaction === 'string' && payload.transaction.length > 0;
  if (transactionRequired !== hasTransaction) {
    throw tradingError(
      transactionRequired
        ? 'DFlow did not return a transaction'
        : 'DFlow returned an unexpected transaction',
      'INVALID_DFLOW_RESPONSE',
      502,
    );
  }
  let computeUnitLimit = null;
  let computeUnitPriceMicroLamports = null;
  let prioritizationFeeLamports = null;
  if (hasTransaction) {
    computeUnitLimit = requireSafeInteger(
      payload.computeUnitLimit,
      'DFlow compute unit limit',
      { minimum: 1, maximum: DFLOW_MAX_COMPUTE_UNIT_LIMIT },
    );
    prioritizationFeeLamports = requireSafeInteger(
      payload.prioritizationFeeLamports,
      'DFlow prioritization fee',
      { maximum: DFLOW_MAX_PRIORITY_FEE_LAMPORTS },
    );
    const prioritizationType = requireObject(
      payload.prioritizationType,
      'DFlow prioritization type',
    );
    const computeBudget = requireObject(
      prioritizationType.computeBudget,
      'DFlow compute budget',
    );
    computeUnitPriceMicroLamports = requireSafeInteger(
      computeBudget.microLamports,
      'DFlow compute unit price',
    );
    const calculatedPriorityFee = (
      BigInt(computeUnitLimit) * BigInt(computeUnitPriceMicroLamports) + 999_999n
    ) / 1_000_000n;
    if (calculatedPriorityFee !== BigInt(prioritizationFeeLamports)) {
      throw tradingError(
        'DFlow prioritization fee does not match its compute budget',
        'INVALID_DFLOW_RESPONSE',
        502,
      );
    }
  }
  return {
    computeUnitLimit,
    computeUnitPriceMicroLamports,
    contextSlot,
    inAmount,
    inputDecimals: routeData.inputDecimals,
    inputMint,
    lastValidBlockHeight: hasTransaction
      ? requireSafeInteger(payload.lastValidBlockHeight, 'DFlow last valid block height')
      : null,
    minimumAmountOut,
    outAmount,
    outputDecimals: routeData.outputDecimals,
    outputMint,
    platformFeeBps,
    priceImpactPercent: priceImpactFraction * 100,
    prioritizationFeeLamports,
    route: routeData.route,
    slippageBps,
  };
}

function validateLookupProof(payloadTables, transaction, lookupTables) {
  const sourceTables = Array.isArray(payloadTables) ? payloadTables : [];
  const responseTables = new Map(sourceTables.map((table) => {
    const address = requireAddress(table?.address, 'DFlow lookup table');
    requireObject(table?.addresses, 'DFlow lookup table addresses');
    return [address, table.addresses];
  }));
  if (
    responseTables.size !== sourceTables.length
    || responseTables.size !== transaction.message.addressTableLookups.length
    || lookupTables.length !== transaction.message.addressTableLookups.length
  ) {
    throw tradingError(
      'DFlow lookup table proof is incomplete',
      'INVALID_DFLOW_TRANSACTION',
      502,
    );
  }
  transaction.message.addressTableLookups.forEach((lookup, tableIndex) => {
    const address = lookup.accountKey.toBase58();
    const supplied = responseTables.get(address);
    const loaded = lookupTables[tableIndex];
    if (!supplied || !loaded || loaded.key.toBase58() !== address) {
      throw tradingError(
        'DFlow lookup table does not match mainnet',
        'INVALID_DFLOW_TRANSACTION',
        502,
      );
    }
    const indexes = [...lookup.writableIndexes, ...lookup.readonlyIndexes];
    indexes.forEach((index) => {
      const expected = normalizeSolanaAddress(supplied[String(index)]);
      const observed = loaded.state.addresses[index]?.toBase58();
      if (!expected || expected !== observed) {
        throw tradingError(
          'DFlow lookup table entry does not match mainnet',
          'INVALID_DFLOW_TRANSACTION',
          502,
        );
      }
    });
  });
}

export async function loadAndValidateDflowLookupTables(
  connection,
  lookups,
  { minContextSlot = 0 } = {},
) {
  return Promise.all(lookups.map(async (lookup) => {
    try {
      const response = await connection.getAccountInfoAndContext(lookup.accountKey, {
        commitment: 'confirmed',
        minContextSlot,
      });
      const account = response?.value;
      if (
        !account
        || !Number.isSafeInteger(response.context?.slot)
        || response.context.slot < minContextSlot
        || !account.owner?.equals?.(AddressLookupTableProgram.programId)
        || account.executable === true
        || !Buffer.isBuffer(account.data)
      ) {
        throw new Error('lookup table account mismatch');
      }
      const table = new AddressLookupTableAccount({
        key: lookup.accountKey,
        state: AddressLookupTableAccount.deserialize(account.data),
      });
      if (!table.isActive()) throw new Error('lookup table is inactive');
      return table;
    } catch (cause) {
      const error = tradingError(
        'A DFlow address lookup table is unavailable',
        'DFLOW_LOOKUP_TABLE_UNAVAILABLE',
        503,
      );
      error.cause = cause;
      throw error;
    }
  }));
}

function decodeVersionedTransaction(value, label, code = 'INVALID_DFLOW_TRANSACTION') {
  const encoded = String(value || '').trim();
  let bytes;
  let transaction;
  try {
    bytes = Buffer.from(encoded, 'base64');
    if (
      !encoded
      || bytes.length > MAX_TRANSACTION_BYTES
      || bytes.toString('base64') !== encoded
    ) {
      throw new Error('invalid wire bytes');
    }
    transaction = VersionedTransaction.deserialize(bytes);
  } catch {
    throw tradingError(`${label} is invalid`, code, 400);
  }
  if (transaction.version !== 0) {
    throw tradingError(`${label} must use a v0 message`, code, 400);
  }
  return { bytes, transaction };
}

export async function validateDflowTransaction({
  connection,
  payload,
  quote,
  owner,
  loadLookupTables = loadAndValidateDflowLookupTables,
  loadProgramIntegrity = loadAndValidateDflowProgramIntegrity,
  loadTradeAccountState = loadAndValidateTradeAccountState,
  simulate = true,
}) {
  const decoded = decodeVersionedTransaction(payload.transaction, 'DFlow transaction');
  const { bytes, transaction } = decoded;
  const message = transaction.message;
  const { header } = message;
  const feePayer = message.staticAccountKeys[0]?.toBase58();
  if (
    header.numRequiredSignatures !== 1
    || header.numReadonlySignedAccounts !== 0
    || transaction.signatures.length !== 1
    || feePayer !== owner
    || !transaction.signatures.every(signature => (
      Buffer.from(signature).every(byte => byte === 0)
    ))
  ) {
    throw tradingError(
      'DFlow transaction signer does not match the connected wallet',
      'INVALID_DFLOW_TRANSACTION',
      502,
    );
  }
  if (
    message.compiledInstructions.length < 2
    || message.compiledInstructions.length > 8
    || message.addressTableLookups.length > 4
  ) {
    throw tradingError('DFlow transaction shape is unsupported', 'INVALID_DFLOW_TRANSACTION', 502);
  }
  const staticKeys = message.staticAccountKeys.map(key => key.toBase58());
  const instructionPrograms = message.compiledInstructions.map((instruction) => {
    if (instruction.programIdIndex >= staticKeys.length) {
      throw tradingError(
        'DFlow instruction program must be a static account',
        'INVALID_DFLOW_TRANSACTION',
        502,
      );
    }
    return staticKeys[instruction.programIdIndex];
  });
  const unsupportedPrograms = instructionPrograms.filter(programId => (
    programId !== COMPUTE_BUDGET_PROGRAM_ID && programId !== DFLOW_PROGRAM_ID
  ));
  if (
    unsupportedPrograms.length
    || instructionPrograms.filter(programId => programId === DFLOW_PROGRAM_ID).length !== 1
  ) {
    throw tradingError(
      'DFlow transaction includes an unsupported top-level program',
      'INVALID_DFLOW_TRANSACTION',
      502,
    );
  }

  const swapInstruction = message.compiledInstructions.find(instruction => (
    staticKeys[instruction.programIdIndex] === DFLOW_PROGRAM_ID
  ));
  validateComputeBudgetPolicy({
    instructions: message.compiledInstructions,
    programIds: instructionPrograms,
    quote,
  });
  const swapPolicy = decodeAndValidateDflowSwap(swapInstruction.data, quote);
  const lookupTables = await loadLookupTables(
    connection,
    message.addressTableLookups,
    { minContextSlot: quote.contextSlot },
  );
  validateLookupProof(payload.addressLookupTables, transaction, lookupTables);
  const accountKeys = message.getAccountKeys({
    addressLookupTableAccounts: lookupTables,
  });
  const swapAccounts = validateDflowSwapAccounts({
    accountKeys,
    message,
    owner,
    quote,
    swapInstruction,
    swapPolicy,
  });
  const [, tradeState] = await Promise.all([
    loadProgramIntegrity(connection, { minContextSlot: quote.contextSlot }),
    loadTradeAccountState(connection, {
      accountKeys,
      message,
      owner,
      quote,
      swapAccounts,
    }),
  ]);

  let simulation = {
    error: '',
    logs: [],
    ok: true,
    unitsConsumed: null,
  };
  let networkFeeLamports = null;
  if (simulate) {
    const minimumSlot = Math.max(quote.contextSlot, tradeState.contextSlot);
    const [simulationResponse, feeResponse] = await Promise.all([
      connection.simulateTransaction(transaction, {
        accounts: simulationAccountRequest(tradeState),
        commitment: 'confirmed',
        minContextSlot: minimumSlot,
        sigVerify: false,
      }),
      connection.getFeeForMessage(message, 'confirmed'),
    ]);
    const value = requireContextBoundSimulation(simulationResponse, minimumSlot);
    simulation = {
      error: value.err == null ? '' : JSON.stringify(value.err).slice(0, 500),
      logs: Array.isArray(value.logs) ? value.logs.slice(-30) : [],
      ok: value.err == null,
      unitsConsumed: Number.isSafeInteger(value.unitsConsumed) ? value.unitsConsumed : null,
    };
    networkFeeLamports = requireContextBoundFee(feeResponse, minimumSlot);
    if (!simulation.ok) {
      const error = tradingError(
        'The exact DFlow transaction did not pass mainnet simulation',
        'DFLOW_SIMULATION_FAILED',
        422,
      );
      error.simulation = simulation;
      throw error;
    }
    validateSimulatedTradeEffects(
      value,
      tradeState,
      quote,
      owner,
      networkFeeLamports,
    );
  }
  return {
    actionNames: swapPolicy.actionNames,
    feePayer,
    networkFeeLamports,
    programIds: [...new Set(instructionPrograms)],
    simulation,
    tradeState,
    transaction,
    transactionFingerprint: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

async function defaultLoadMintDecimals(connection, mintAddress) {
  const mint = new PublicKey(mintAddress);
  const account = await connection.getAccountInfo(mint, 'confirmed');
  if (!account || !account.owner.equals(TOKEN_PROGRAM_ID)) {
    throw tradingError(
      'This ownership coin does not use the supported SPL Token program',
      'UNSUPPORTED_TOKEN_PROGRAM',
      422,
    );
  }
  return unpackMint(mint, account, TOKEN_PROGRAM_ID).decimals;
}

function createConnectionFactory(env) {
  let connection;
  return () => {
    if (!connection) connection = new Connection(resolveRpcUrl(env), 'confirmed');
    return connection;
  };
}

async function resolveTokenIntent({
  body,
  connection,
  loadMintDecimals,
  loadTokens,
}) {
  const request = requireObject(body, 'Trading request');
  rejectUnknownKeys(
    request,
    new Set(['amount', 'owner', 'side', 'slippageBps', 'token']),
    'Trading request',
  );
  const tokenKey = normalizeOwnershipTokenKey(request.token);
  const side = request.side === 'sell' ? 'sell' : request.side === 'buy' ? 'buy' : '';
  if (!tokenKey || !side) {
    throw tradingError('Token and side are required', 'INVALID_TRADING_REQUEST');
  }
  const tokens = await loadTokens();
  const config = tokens?.[tokenKey];
  if (!config) {
    throw tradingError('Ownership coin is not active', 'TOKEN_NOT_TRADABLE', 404);
  }
  const tokenMint = requireAddress(config.mint, 'Ownership coin mint');
  const usdcMint = requireAddress(config.usdcMint || MAINNET_USDC_MINT, 'USDC mint');
  if (usdcMint !== MAINNET_USDC_MINT || tokenMint === usdcMint) {
    throw tradingError('Ownership coin pair is unsupported', 'TOKEN_NOT_TRADABLE', 422);
  }
  const inputMint = side === 'buy' ? usdcMint : tokenMint;
  const outputMint = side === 'buy' ? tokenMint : usdcMint;
  const tokenDecimals = await loadMintDecimals(connection(), tokenMint);
  const inputDecimals = side === 'buy' ? 6 : tokenDecimals;
  const outputDecimals = side === 'buy' ? tokenDecimals : 6;
  const amount = parseUiAmount(request.amount, inputDecimals);
  const owner = request.owner == null || request.owner === ''
    ? ''
    : requireAddress(request.owner, 'Wallet');
  return {
    amount: amount.ui,
    atomicAmount: amount.atomic,
    inputDecimals,
    inputMint,
    name: String(config.name || config.ticker || tokenKey.toUpperCase()).slice(0, 80),
    outputMint,
    outputDecimals,
    owner,
    side,
    slippageBps: boundedSlippage(request.slippageBps),
    ticker: String(config.ticker || tokenKey).toUpperCase().slice(0, 16),
    token: tokenKey,
  };
}

function quotePresenter(quote) {
  return {
    amountIn: formatRawAmount(quote.inAmount, quote.inputDecimals),
    contextSlot: quote.contextSlot,
    estimatedAmountOut: formatRawAmount(quote.outAmount, quote.outputDecimals),
    inAmountRaw: quote.inAmount,
    inputDecimals: quote.inputDecimals,
    inputMint: quote.inputMint,
    lastValidBlockHeight: quote.lastValidBlockHeight,
    minimumAmountOut: formatRawAmount(quote.minimumAmountOut, quote.outputDecimals),
    minimumAmountOutRaw: quote.minimumAmountOut,
    outAmountRaw: quote.outAmount,
    outputDecimals: quote.outputDecimals,
    outputMint: quote.outputMint,
    platformFeeBps: quote.platformFeeBps,
    priceImpactPercent: quote.priceImpactPercent,
    route: quote.route,
    slippageBps: quote.slippageBps,
  };
}

function signedMessageIsValid(transaction, owner) {
  const signature = Buffer.from(transaction.signatures[0] || []);
  const message = Buffer.from(transaction.message.serialize());
  if (signature.length !== 64 || signature.every(byte => byte === 0)) return false;
  return crypto.verify(null, message, createEd25519PublicKey(owner), signature);
}

export function createDflowSpotOrderService(dependencies = {}) {
  const env = dependencies.env || process.env;
  const now = dependencies.now || (() => Date.now());
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const randomUuid = dependencies.randomUuid || crypto.randomUUID;
  const loadTokens = dependencies.loadTokens || (() => getTradableOwnershipTokens({
    env,
    fetchImpl,
  }));
  const connection = dependencies.connection || createConnectionFactory(env);
  const loadLookupTables = dependencies.loadLookupTables || loadAndValidateDflowLookupTables;
  const loadMintDecimals = dependencies.loadMintDecimals || defaultLoadMintDecimals;
  const loadDflowOrder = dependencies.fetchDflowOrder || fetchDflowOrder;
  const loadProgramIntegrity = dependencies.loadDflowProgramIntegrity
    || loadAndValidateDflowProgramIntegrity;
  const loadTradeAccountState = dependencies.loadTradeAccountState
    || loadAndValidateTradeAccountState;
  const decodeToken = dependencies.decodeReviewToken || decodeReviewToken;
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('DFlow spot order service requires fetch');
  }

  async function spotOrder(body) {
    const apiUrl = dependencies.apiUrl || resolveDflowUrl(env);
    const apiKey = dependencies.apiKey ?? String(env.DFLOW_API_KEY || '').trim();
    if (apiUrl === DFLOW_PRODUCTION_URL && !apiKey) {
      throw tradingError(
        'Ownership trading is awaiting a DFlow API key',
        'TRADING_NOT_CONFIGURED',
        503,
      );
    }
    if (!dependencies.connection) resolveRpcUrl(env);
    const intent = await resolveTokenIntent({
      body,
      connection,
      loadMintDecimals,
      loadTokens,
    });
    const { payload, proof } = await loadDflowOrder({
      apiKey,
      apiUrl,
      fetchImpl,
      intent,
      now,
      owner: intent.owner,
      randomUuid,
    });
    const quote = validateOrderResponse(payload, intent, {
      transactionRequired: Boolean(intent.owner),
    });
    let review = null;
    let reviewToken = null;
    if (intent.owner) {
      review = await validateDflowTransaction({
        connection: connection(),
        loadLookupTables,
        loadProgramIntegrity,
        loadTradeAccountState,
        owner: intent.owner,
        payload,
        quote,
      });
      reviewToken = encodeReviewToken(proof);
    }
    return {
      amount: intent.amount,
      cluster: MAINNET_CLUSTER,
      name: intent.name,
      owner: intent.owner || null,
      quote: quotePresenter(quote),
      review: review
        ? {
          feePayer: review.feePayer,
          networkFeeLamports: review.networkFeeLamports,
          programIds: review.programIds,
          simulation: review.simulation,
          transactionFingerprint: review.transactionFingerprint,
        }
        : null,
      reviewToken,
      side: intent.side,
      ticker: intent.ticker,
      token: intent.token,
      transaction: intent.owner ? payload.transaction : null,
    };
  }

  async function spotSubmit(body) {
    const request = requireObject(body, 'Trading submission');
    rejectUnknownKeys(
      request,
      new Set(['reviewToken', 'signedTransaction']),
      'Trading submission',
    );
    const { payload } = decodeToken(request.reviewToken, now);
    const unsignedDecoded = decodeVersionedTransaction(
      payload.transaction,
      'Reviewed DFlow transaction',
      'INVALID_TRADE_REVIEW',
    );
    const owner = unsignedDecoded.transaction.message.staticAccountKeys[0]?.toBase58();
    requireAddress(owner, 'Reviewed fee payer');

    const tokens = await loadTokens();
    const match = Object.entries(tokens || {}).find(([, config]) => {
      const tokenMint = normalizeSolanaAddress(config?.mint);
      const usdcMint = normalizeSolanaAddress(config?.usdcMint || MAINNET_USDC_MINT);
      return (
        tokenMint
        && usdcMint === MAINNET_USDC_MINT
        && (
          (payload.inputMint === usdcMint && payload.outputMint === tokenMint)
          || (payload.inputMint === tokenMint && payload.outputMint === usdcMint)
        )
      );
    });
    if (!match) {
      throw tradingError(
        'Reviewed ownership coin is no longer active',
        'TOKEN_NOT_TRADABLE',
        409,
      );
    }
    const intent = {
      atomicAmount: requireIntegerString(payload.inAmount, 'Reviewed input amount', {
        positive: true,
      }),
      inputMint: requireAddress(payload.inputMint, 'Reviewed input mint'),
      outputMint: requireAddress(payload.outputMint, 'Reviewed output mint'),
      slippageBps: boundedSlippage(payload.slippageBps),
    };
    const quote = validateOrderResponse(payload, intent, { transactionRequired: true });
    const validatedReview = await validateDflowTransaction({
      connection: connection(),
      loadLookupTables,
      loadProgramIntegrity,
      loadTradeAccountState,
      owner,
      payload,
      quote,
      simulate: false,
    });

    const signed = decodeVersionedTransaction(
      request.signedTransaction,
      'Signed transaction',
      'INVALID_SIGNED_TRANSACTION',
    );
    if (
      signed.transaction.message.header.numRequiredSignatures !== 1
      || signed.transaction.signatures.length !== 1
      || signed.transaction.message.staticAccountKeys[0]?.toBase58() !== owner
      || !Buffer.from(signed.transaction.message.serialize()).equals(
        Buffer.from(unsignedDecoded.transaction.message.serialize()),
      )
      || !signedMessageIsValid(signed.transaction, owner)
    ) {
      throw tradingError(
        'Wallet signature does not match the reviewed transaction',
        'SIGNED_TRANSACTION_CHANGED',
        400,
      );
    }

    const rpc = connection();
    const blockHeight = await rpc.getBlockHeight('confirmed');
    if (blockHeight > quote.lastValidBlockHeight) {
      throw tradingError(
        'Trade review expired before submission; request a new route',
        'TRADE_REVIEW_EXPIRED',
        409,
      );
    }
    const minimumSlot = Math.max(quote.contextSlot, validatedReview.tradeState.contextSlot);
    const [simulationResponse, feeResponse] = await Promise.all([
      rpc.simulateTransaction(signed.transaction, {
        accounts: simulationAccountRequest(validatedReview.tradeState),
        commitment: 'confirmed',
        minContextSlot: minimumSlot,
        sigVerify: true,
      }),
      rpc.getFeeForMessage(signed.transaction.message, 'confirmed'),
    ]);
    const simulationValue = requireContextBoundSimulation(simulationResponse, minimumSlot);
    const networkFeeLamports = requireContextBoundFee(feeResponse, minimumSlot);
    if (simulationValue.err != null) {
      throw tradingError(
        'Signed transaction failed final mainnet simulation',
        'SIGNED_TRANSACTION_SIMULATION_FAILED',
        422,
      );
    }
    validateSimulatedTradeEffects(
      simulationValue,
      validatedReview.tradeState,
      quote,
      owner,
      networkFeeLamports,
    );
    const signature = normalizeSolanaSignature(await rpc.sendRawTransaction(
      signed.bytes,
      {
        maxRetries: 3,
        minContextSlot: minimumSlot,
        preflightCommitment: 'confirmed',
        skipPreflight: false,
      },
    ));
    if (!signature) {
      throw tradingError(
        'Solana RPC returned an invalid signature',
        'SOLANA_SUBMISSION_FAILED',
        502,
      );
    }
    return {
      cluster: MAINNET_CLUSTER,
      signature,
      status: 'submitted',
    };
  }

  return Object.freeze({
    spotOrder,
    spotSubmit,
  });
}
