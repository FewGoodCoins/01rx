import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFutarchyRpcRelay,
  validateRpcCall,
  validateRpcPayload,
} from '../api/_lib/futarchy-rpc-relay.js';

const ADDRESS = '11111111111111111111111111111111';

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
