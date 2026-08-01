import { Transaction } from '@solana/web3.js';
import { DECISION_ATTRIBUTION } from '@01resolved/contracts';
import { resolveFutarchyRpcUrl, futarchyServiceError } from './futarchy-service.js';
import { normalizeAddress } from './futarchy-accounts.js';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const MAX_BATCH_SIZE = 10;
const MAX_REQUEST_BYTES = 32_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_TRANSACTION_TEXT = 4_096;
const MAX_TRANSACTION_BYTES = 1_232;
const MAX_TRANSACTION_INSTRUCTIONS = 32;
const RPC_TIMEOUT_MS = 20_000;

const PROGRAMS = Object.freeze({
  associatedToken: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  computeBudget: 'ComputeBudget111111111111111111111111111111',
  conditionalVault: 'VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg',
  futarchy: 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq',
  manifest: 'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
  manifestWrapper: 'wMNFSTkir3HgyZTsB7uqu3i7FA73grFCptPXgrZjksL',
  memo: DECISION_ATTRIBUTION.memoProgramId,
  system: '11111111111111111111111111111111',
  token: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
});

export const ALLOWED_RPC_METHODS = Object.freeze(new Set([
  'getAccountInfo',
  'getBalance',
  'getFeeForMessage',
  'getLatestBlockhash',
  'getMinimumBalanceForRentExemption',
  'getMultipleAccounts',
  'getProgramAccounts',
  'getSignatureStatuses',
  'getSlot',
  'getTokenAccountBalance',
  'sendTransaction',
  'simulateTransaction',
]));

function rpcError(message, code = 'INVALID_RPC_PARAMS', statusCode = 400) {
  return futarchyServiceError(message, code, statusCode);
}

function requireAddress(value, label) {
  if (!normalizeAddress(value)) throw rpcError(`${label} must be a valid Solana address`);
}

function boundedBase64(value, minimumLength) {
  return typeof value === 'string'
    && value.length >= minimumLength
    && value.length <= MAX_TRANSACTION_TEXT
    && BASE64_PATTERN.test(value);
}

function validateTransaction(encoded) {
  if (!boundedBase64(encoded, 40)) throw rpcError('Transaction is invalid', 'INVALID_RPC_TRANSACTION');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_TRANSACTION_BYTES || bytes.toString('base64') !== encoded) {
    throw rpcError('Transaction wire bytes are invalid', 'INVALID_RPC_TRANSACTION');
  }
  let transaction;
  try {
    transaction = Transaction.from(bytes);
  } catch {
    throw rpcError('Transaction could not be decoded', 'INVALID_RPC_TRANSACTION');
  }
  if (
    transaction.instructions.length < 1
    || transaction.instructions.length > MAX_TRANSACTION_INSTRUCTIONS
  ) throw rpcError('Transaction instruction count is invalid', 'INVALID_RPC_TRANSACTION');

  const recurring = normalizeAddress(process.env.RECURRING_FUTARCHY_PROGRAM_ID);
  const terminalPrograms = new Set([
    PROGRAMS.conditionalVault,
    PROGRAMS.futarchy,
    PROGRAMS.manifest,
    PROGRAMS.manifestWrapper,
    ...(recurring ? [recurring] : []),
  ]);
  const allowed = new Set([
    PROGRAMS.associatedToken,
    PROGRAMS.computeBudget,
    PROGRAMS.memo,
    PROGRAMS.system,
    PROGRAMS.token,
    ...terminalPrograms,
  ]);
  const instructionPrograms = transaction.instructions.map(instruction => (
    instruction.programId.toBase58()
  ));
  if (instructionPrograms.some(programId => !allowed.has(programId))) {
    throw rpcError(
      'Transaction includes a program outside the reviewed terminal set',
      'RPC_TRANSACTION_RESTRICTED',
      403,
    );
  }
  if (!instructionPrograms.some(programId => terminalPrograms.has(programId))) {
    throw rpcError('Transaction is not a reviewed terminal action', 'RPC_TRANSACTION_RESTRICTED', 403);
  }
}

function validateTransactionParams(params, method) {
  const config = params[1];
  if (config != null && (
    typeof config !== 'object'
    || Array.isArray(config)
    || (config.encoding != null && config.encoding !== 'base64')
    || (config.minContextSlot != null
      && (!Number.isSafeInteger(config.minContextSlot) || config.minContextSlot < 1))
  )) throw rpcError(`${method} configuration is invalid`);
  validateTransaction(params[0]);
}

function validateProgramAccountLookup(params, env) {
  const programId = normalizeAddress(params[0]);
  const config = params[1];
  const filters = Array.isArray(config?.filters) ? config.filters : [];
  const recurring = normalizeAddress(env.RECURRING_FUTARCHY_PROGRAM_ID);
  const expectedOffset = programId === PROGRAMS.manifestWrapper ? 8 : 12;
  const ownerFilter = filters.find(filter => (
    filter?.memcmp?.offset === expectedOffset
    && (filter.memcmp.encoding == null || filter.memcmp.encoding === 'base58')
    && normalizeAddress(filter.memcmp.bytes)
  ));
  if (programId === recurring && recurring) {
    const proposalFilter = filters.find(filter => (
      filter?.memcmp?.offset === 44
      && (filter.memcmp.encoding == null || filter.memcmp.encoding === 'base58')
      && normalizeAddress(filter.memcmp.bytes)
    ));
    if (!ownerFilter || !proposalFilter || filters.length !== 2) {
      throw rpcError('Recurring schedule reads require exact owner and proposal filters');
    }
  } else if (programId !== PROGRAMS.manifestWrapper || !ownerFilter || filters.length !== 1) {
    throw rpcError(
      'Program-account reads are restricted to exact reviewed terminal filters',
      'RPC_METHOD_RESTRICTED',
      403,
    );
  }
  if (config?.encoding != null && config.encoding !== 'base64') {
    throw rpcError('Program accounts must use base64 encoding');
  }
}

export function validateRpcCall(call, env = process.env) {
  if (!call || typeof call !== 'object' || Array.isArray(call)) {
    throw rpcError('JSON-RPC request must be an object', 'INVALID_RPC_REQUEST');
  }
  if (call.jsonrpc !== '2.0' || !ALLOWED_RPC_METHODS.has(call.method)) {
    throw rpcError('Solana RPC method is not allowed', 'RPC_METHOD_RESTRICTED', 403);
  }
  const params = call.params == null ? [] : call.params;
  if (!Array.isArray(params)) throw rpcError('JSON-RPC params must be an array');
  switch (call.method) {
    case 'getAccountInfo':
    case 'getBalance':
    case 'getTokenAccountBalance':
      requireAddress(params[0], 'Account');
      break;
    case 'getMultipleAccounts':
      if (
        !Array.isArray(params[0])
        || params[0].length < 1
        || params[0].length > 20
        || params[0].some(address => !normalizeAddress(address))
      ) throw rpcError('Multiple-account request is invalid');
      break;
    case 'getProgramAccounts':
      validateProgramAccountLookup(params, env);
      break;
    case 'getMinimumBalanceForRentExemption': {
      const size = Number(params[0]);
      if (!Number.isInteger(size) || size < 0 || size > 10_000) {
        throw rpcError('Rent-exemption account size is invalid');
      }
      break;
    }
    case 'getSignatureStatuses':
      if (
        !Array.isArray(params[0])
        || params[0].length < 1
        || params[0].length > 10
        || params[0].some(signature => !SIGNATURE_PATTERN.test(String(signature || '')))
      ) throw rpcError('Signature-status request is invalid');
      break;
    case 'getFeeForMessage':
      if (!boundedBase64(params[0], 20)) throw rpcError('Fee message is invalid');
      break;
    case 'sendTransaction':
    case 'simulateTransaction':
      validateTransactionParams(params, call.method);
      break;
    default:
      break;
  }
  return call;
}

export function validateRpcPayload(payload, env = process.env) {
  const calls = Array.isArray(payload) ? payload : [payload];
  if (!calls.length || calls.length > MAX_BATCH_SIZE) {
    throw rpcError('JSON-RPC batch size is invalid', 'INVALID_RPC_REQUEST');
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_REQUEST_BYTES) {
    throw rpcError('JSON-RPC request is too large', 'RPC_REQUEST_TOO_LARGE', 413);
  }
  calls.forEach(call => validateRpcCall(call, env));
  return payload;
}

function includesTransaction(payload) {
  return (Array.isArray(payload) ? payload : [payload]).some(call => (
    call.method === 'simulateTransaction' || call.method === 'sendTransaction'
  ));
}

function bindMinimumSlot(payload, minimumSlot) {
  const calls = Array.isArray(payload) ? payload : [payload];
  const bound = calls.map((call) => {
    if (call.method !== 'simulateTransaction' && call.method !== 'sendTransaction') return call;
    const params = call.params || [];
    const config = params[1] && typeof params[1] === 'object' ? params[1] : {};
    return {
      ...call,
      params: [
        params[0],
        {
          ...config,
          minContextSlot: Math.max(
            minimumSlot,
            Number.isSafeInteger(config.minContextSlot) ? config.minContextSlot : 0,
          ),
        },
      ],
    };
  });
  return Array.isArray(payload) ? bound : bound[0];
}

export function createFutarchyRpcRelay(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const integrity = options.programIntegrity;
  return async function relayRpc(payload) {
    let forwarded = validateRpcPayload(payload, env);
    if (includesTransaction(forwarded)) {
      if (typeof integrity !== 'function') {
        throw rpcError('Program integrity is unavailable', 'PROGRAM_INTEGRITY_UNAVAILABLE', 503);
      }
      const result = await integrity({ force: true });
      if (result?.status !== 'verified' || result?.canTransact !== true
          || !Number.isSafeInteger(result.rpcSlot)) {
        throw rpcError('Program integrity is not verified', 'PROGRAM_INTEGRITY_UNAVAILABLE', 503);
      }
      forwarded = bindMinimumSlot(forwarded, result.rpcSlot);
    }
    const rpcUrl = resolveFutarchyRpcUrl(env);
    if (!rpcUrl) throw rpcError('Solana RPC is not configured', 'SOLANA_RPC_UNAVAILABLE', 503);
    let response;
    try {
      response = await fetchImpl(rpcUrl, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(forwarded),
        redirect: 'manual',
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
    } catch (cause) {
      throw rpcError('Solana RPC did not respond', 'SOLANA_RPC_UPSTREAM', 502, cause);
    }
    if (!response.ok || response.status >= 300) {
      throw rpcError('Solana RPC rejected the request', 'SOLANA_RPC_UPSTREAM', 502);
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_RESPONSE_BYTES) {
      throw rpcError('Solana RPC response is too large', 'SOLANA_RPC_RESPONSE_TOO_LARGE', 502);
    }
    try {
      return JSON.parse(body.toString('utf8'));
    } catch (cause) {
      throw rpcError('Solana RPC returned invalid JSON', 'SOLANA_RPC_UPSTREAM', 502, cause);
    }
  };
}

export const _test = Object.freeze({
  MAX_BATCH_SIZE,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  PROGRAMS,
  bindMinimumSlot,
  includesTransaction,
});
