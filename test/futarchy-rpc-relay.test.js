import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createFutarchyRpcRelay,
  validateRpcCall,
  validateRpcPayload,
} from '../api/_lib/futarchy-rpc-relay.js';

const ADDRESS = '11111111111111111111111111111111';
const FUTARCHY_PROGRAM = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq';
const PAUSED_EXECUTION_RELEASE = Object.freeze({
  enabled: false,
  message: 'Trading is paused by test fixture',
});

function reviewedTransaction() {
  const transaction = new Transaction({
    feePayer: new PublicKey(ADDRESS),
    recentBlockhash: ADDRESS,
  });
  transaction.add(new TransactionInstruction({
    data: Buffer.from([1]),
    keys: [],
    programId: new PublicKey(FUTARCHY_PROGRAM),
  }));
  return transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }).toString('base64');
}

test('futarchy RPC validation allowlists bounded read calls', () => {
  assert.equal(validateRpcCall({
    jsonrpc: '2.0',
    id: 1,
    method: 'getBalance',
    params: [ADDRESS],
  }).method, 'getBalance');
  assert.throws(
    () => validateRpcCall({ jsonrpc: '2.0', id: 1, method: 'getBlock', params: [1] }),
    error => error?.code === 'RPC_METHOD_RESTRICTED' && error.statusCode === 403,
  );
  assert.throws(
    () => validateRpcCall({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: ['bad'] }),
    error => error?.code === 'INVALID_RPC_PARAMS',
  );
  assert.throws(
    () => validateRpcPayload(Array.from({ length: 11 }, (_, id) => ({
      jsonrpc: '2.0', id, method: 'getSlot', params: [],
    }))),
    error => error?.code === 'INVALID_RPC_REQUEST',
  );
});

test('futarchy RPC relay forwards only validated payloads without browser credentials', async () => {
  const calls = [];
  const relay = createFutarchyRpcRelay({
    env: { HELIUS_URL: 'https://rpc.example' },
    async fetchImpl(url, options) {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 7, result: 123 }), {
        status: 200,
      });
    },
    async programIntegrity() {
      throw new Error('should not be called for reads');
    },
  });
  const payload = { jsonrpc: '2.0', id: 7, method: 'getSlot', params: [] };
  const result = await relay(payload);

  assert.equal(calls[0].url, 'https://rpc.example/');
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(result.result, 123);
});

test('futarchy RPC relay rejects unsafe upstream configuration before fetch', async () => {
  let calls = 0;
  const relay = createFutarchyRpcRelay({
    env: { HELIUS_URL: 'http://rpc.example' },
    async fetchImpl() { calls += 1; },
  });
  await assert.rejects(
    relay({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [] }),
    error => error?.code === 'SOLANA_RPC_UNAVAILABLE' && error.statusCode === 503,
  );
  assert.equal(calls, 0);
});

test('futarchy RPC relay blocks submission under a paused release while preserving reviewed simulation', async () => {
  const calls = [];
  let integrityCalls = 0;
  const relay = createFutarchyRpcRelay({
    env: { HELIUS_URL: 'https://rpc.example' },
    executionRelease: PAUSED_EXECUTION_RELEASE,
    async fetchImpl(url, options) {
      calls.push({ url: String(url), payload: JSON.parse(options.body) });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), {
        status: 200,
      });
    },
    async programIntegrity() {
      integrityCalls += 1;
      return { status: 'verified', canTransact: true, rpcSlot: 42 };
    },
  });
  const transaction = reviewedTransaction();

  await assert.rejects(
    relay({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [transaction, { encoding: 'base64' }],
    }),
    error => error?.code === 'EXECUTION_PAUSED' && error.statusCode === 503,
  );
  assert.equal(calls.length, 0);
  assert.equal(integrityCalls, 0);

  await relay({
    jsonrpc: '2.0',
    id: 2,
    method: 'simulateTransaction',
    params: [transaction, { encoding: 'base64' }],
  });
  assert.equal(calls.length, 1);
  assert.equal(integrityCalls, 1);
  assert.equal(calls[0].payload.method, 'simulateTransaction');
  assert.equal(calls[0].payload.params[1].minContextSlot, 42);
});

test('enabled release forwards only integrity-verified submissions with a minimum slot', async () => {
  const calls = [];
  const relay = createFutarchyRpcRelay({
    env: { HELIUS_URL: 'https://rpc.example' },
    async fetchImpl(url, options) {
      calls.push({ url: String(url), payload: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: 'submitted-signature',
      }), { status: 200 });
    },
    async programIntegrity() {
      return { status: 'verified', canTransact: true, rpcSlot: 77 };
    },
  });

  const result = await relay({
    jsonrpc: '2.0',
    id: 3,
    method: 'sendTransaction',
    params: [reviewedTransaction(), { encoding: 'base64' }],
  });

  assert.equal(result.result, 'submitted-signature');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.method, 'sendTransaction');
  assert.equal(calls[0].payload.params[1].minContextSlot, 77);
});
