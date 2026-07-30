import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  DFLOW_DEVELOPMENT_URL,
  DFLOW_PROGRAM_ID,
  DFLOW_PRODUCTION_URL,
  createDflowSpotOrderService,
  parseUiAmount,
  resolveDflowUrl,
  resolveRpcUrl,
  validateOrderResponse,
  verifySignedDflowResponse,
} from '../api/_lib/dflow-spot-order.js';
import {
  MAINNET_USDC_MINT,
  getTradableOwnershipTokens,
} from '../api/_lib/ownership-token-registry.js';

function buildFixture() {
  const owner = Keypair.generate();
  const outputMint = Keypair.generate().publicKey;
  const market = Keypair.generate().publicKey;
  const dflowInstruction = new TransactionInstruction({
    programId: new PublicKey(DFLOW_PROGRAM_ID),
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(MAINNET_USDC_MINT), isSigner: false, isWritable: true },
      { pubkey: outputMint, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([1, 2, 3, 4]),
  });
  const message = new TransactionMessage({
    payerKey: owner.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      dflowInstruction,
    ],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  const payload = {
    addressLookupTables: [],
    contextSlot: 400_000_000,
    executionMode: 'sync',
    inAmount: '1000000',
    inputMint: MAINNET_USDC_MINT,
    lastValidBlockHeight: 390_000_000,
    minOutAmount: '1980000',
    otherAmountThreshold: '1980000',
    outAmount: '2000000',
    outputMint: outputMint.toBase58(),
    platformFee: null,
    priceImpactPct: '0.001',
    routePlan: [{
      inAmount: '1000000',
      inputMint: MAINNET_USDC_MINT,
      inputMintDecimals: 6,
      marketKey: market.toBase58(),
      outAmount: '2000000',
      outputMint: outputMint.toBase58(),
      outputMintDecimals: 6,
      venue: 'MetaDAO',
    }],
    slippageBps: 100,
    transaction: Buffer.from(transaction.serialize()).toString('base64'),
  };
  return {
    outputMint,
    owner,
    payload,
    transaction,
  };
}

function createRpc(signature = bs58.encode(Buffer.alloc(64, 7))) {
  const calls = [];
  return {
    calls,
    async getBlockHeight() {
      calls.push(['getBlockHeight']);
      return 389_999_999;
    },
    async getFeeForMessage() {
      calls.push(['getFeeForMessage']);
      return { value: 5_000 };
    },
    async sendRawTransaction(bytes, options) {
      calls.push(['sendRawTransaction', Buffer.from(bytes), options]);
      return signature;
    },
    async simulateTransaction(transaction, options) {
      calls.push(['simulateTransaction', transaction, options]);
      return {
        value: {
          err: null,
          logs: ['Program log: fixture'],
          unitsConsumed: 42_000,
        },
      };
    },
  };
}

function createService(fixture, rpc, overrides = {}) {
  const tokens = {
    solo: {
      mint: fixture.outputMint.toBase58(),
      name: 'Solomon',
      ticker: 'SOLO',
      usdcMint: MAINNET_USDC_MINT,
    },
  };
  return createDflowSpotOrderService({
    apiUrl: DFLOW_DEVELOPMENT_URL,
    connection: () => rpc,
    decodeReviewToken: () => ({ payload: fixture.payload }),
    fetchDflowOrder: async (request) => {
      overrides.captureRequest?.(request);
      return {
        payload: fixture.payload,
        proof: {
          body: Buffer.from(JSON.stringify(fixture.payload)).toString('base64'),
          contentDigest: 'sha-256=:fixture:',
          contentType: 'application/json',
          created: Math.floor(Date.now() / 1_000),
          requestId: '00000000-0000-4000-8000-000000000000',
          signature: 'sig1=:fixture:',
          signatureInput: 'fixture',
          status: 200,
        },
      };
    },
    loadLookupTables: async () => [],
    loadTokens: async () => tokens,
    ...overrides,
  });
}

test('UI amounts convert to atomic units without floating-point math', () => {
  assert.deepEqual(parseUiAmount('1.000001', 6), {
    atomic: '1000001',
    ui: '1.000001',
  });
  assert.deepEqual(parseUiAmount('0.10', 6), {
    atomic: '100000',
    ui: '0.1',
  });
  assert.throws(() => parseUiAmount('1.0000001', 6), /at most 6 decimal places/);
  assert.throws(() => parseUiAmount('1e3', 6), /valid decimal amount/);
  assert.throws(() => parseUiAmount('0', 6), /outside the supported range/);
});

test('Vercel trading configuration uses production DFlow and fails closed without RPC', () => {
  assert.equal(resolveDflowUrl({ VERCEL_ENV: 'production' }), DFLOW_PRODUCTION_URL);
  assert.equal(resolveDflowUrl({ VERCEL_ENV: 'preview' }), DFLOW_PRODUCTION_URL);
  assert.equal(
    resolveDflowUrl({ NODE_ENV: 'development' }),
    DFLOW_DEVELOPMENT_URL,
  );
  assert.throws(
    () => resolveDflowUrl({
      DFLOW_TRADE_API_URL: 'https://example.com',
      VERCEL_ENV: 'preview',
    }),
    /approved DFlow quote endpoint/,
  );
  assert.throws(
    () => resolveRpcUrl({ VERCEL_ENV: 'preview' }),
    /awaiting a configured Solana RPC/,
  );
});

test('execution allowlist is intersected with current canonical token status', async () => {
  const calls = [];
  const tokens = await getTradableOwnershipTokens({
    env: {
      NAVGATOR_API_ORIGIN: 'https://api.navgator.example',
      VERCEL_ENV: 'preview',
    },
    fresh: true,
    async fetchImpl(url, options) {
      calls.push([String(url), options]);
      return new Response(JSON.stringify({
        data: [
          {
            key: 'solo',
            listed: true,
            live: true,
            retired: false,
            status: 'active',
          },
          {
            key: 'rngr',
            listed: false,
            live: false,
            retired: true,
            status: 'inactive',
          },
          {
            key: 'unknown',
            listed: true,
            live: true,
            retired: false,
            status: 'active',
          },
        ],
        ok: true,
      }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    },
  });

  assert.deepEqual(Object.keys(tokens), ['solo']);
  assert.equal(
    calls[0][0],
    'https://api.navgator.example/api/list-tokens',
  );
  assert.equal(calls[0][1].headers.authorization, undefined);
  await assert.rejects(
    getTradableOwnershipTokens({
      env: { VERCEL_ENV: 'production' },
      fresh: true,
      fetchImpl: async () => {
        throw new Error('must not be called');
      },
    }),
    /temporarily unavailable/,
  );
});

test('DFlow responses bind the exact pair, amount, slippage, and zero platform fee', () => {
  const fixture = buildFixture();
  const intent = {
    atomicAmount: '1000000',
    inputMint: MAINNET_USDC_MINT,
    outputMint: fixture.outputMint.toBase58(),
    slippageBps: 100,
  };
  const quote = validateOrderResponse(fixture.payload, intent, {
    transactionRequired: true,
  });
  assert.equal(quote.priceImpactPercent, 0.1);
  assert.equal(quote.platformFeeBps, 0);
  assert.equal(quote.route[0].venue, 'MetaDAO');

  assert.throws(
    () => validateOrderResponse({
      ...fixture.payload,
      platformFee: { amount: '20', feeBps: 2, mode: 'outputMint' },
    }, intent, { transactionRequired: true }),
    /Unexpected platform fee/,
  );
  assert.throws(
    () => validateOrderResponse({
      ...fixture.payload,
      outputMint: Keypair.generate().publicKey.toBase58(),
    }, intent, { transactionRequired: true }),
    /does not match/,
  );
});

test('official DFlow response signatures verify and bind every response byte', () => {
  const body = Buffer.from(
    'eyJpbnB1dE1pbnQiOiJFUGpGV2RkNUF1ZnFTU3FlTTJxTjF4enliYXBDOEc0d0VHR2tad3lURHQxdiIsImluQW1vdW50IjoiMTAwMDAwMCIsIm91dHB1dE1pbnQiOiJTb0xvOW94ekxEcGNxMWRwcUFnTXdnY2U1V3FrUkR0TlhLN0VQbmJtZXRhIiwib3V0QW1vdW50IjoiMTU5Njc3MyIsIm90aGVyQW1vdW50VGhyZXNob2xkIjoiMTU4MDgwNiIsIm1pbk91dEFtb3VudCI6IjE1ODA4MDYiLCJzbGlwcGFnZUJwcyI6MTAwLCJwbGF0Zm9ybUZlZSI6bnVsbCwicHJpY2VJbXBhY3RQY3QiOiIwIiwicm91dGVQbGFuIjpbeyJ2ZW51ZSI6Ik1ldGFEQU8iLCJtYXJrZXRLZXkiOiJEell0em9OdlBieUZDendaQTZjU205ZURFRW14RUI5ZjhBR2tKWFVYZ25TQSIsImlucHV0TWludCI6IkVQakZXZGQ1QXVmcVNTcWVNMnFOMXh6eWJhcEM4RzR3RUdHa1p3eVREdDF2Iiwib3V0cHV0TWludCI6IlNvTG85b3h6TERwY3ExZHBxQWdNd2djZTVXcWtSRHROWEs3RVBuYm1ldGEiLCJpbkFtb3VudCI6IjEwMDAwMDAiLCJvdXRBbW91bnQiOiIxNTk2NzczIiwiaW5wdXRNaW50RGVjaW1hbHMiOjYsIm91dHB1dE1pbnREZWNpbWFscyI6Nn1dLCJjb250ZXh0U2xvdCI6NDM1NjM3NzkxLCJleGVjdXRpb25Nb2RlIjoic3luYyJ9',
    'base64',
  );
  const requestId = '3f7452d6-bfbf-4081-8714-cb67dbee048b';
  const headers = new Headers({
    'content-digest': 'sha-256=:ihO8lVLS5tIz9ILY4hOWQNDiR0QUa/elCajg/WY1jIQ=:',
    'content-type': 'application/json',
    signature: 'sig1=:PlYIoSjRIAmENq5f0kHd1cbajvJEWDDdd8tAsrTGmwlWKeFh3DzXi3SIrQVnw45bWEOrHSbwEkzOvOu0I+rMCA==:',
    'signature-input': 'sig1=("@status" "content-type" "content-digest" "x-request-id";req);created=1785197338;keyid="EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF";alg="ed25519"',
    'x-request-id': requestId,
  });
  const proof = verifySignedDflowResponse({
    body,
    expectedRequestId: requestId,
    headers,
    now: () => 1_785_197_338_000,
    status: 200,
  });
  assert.equal(proof.requestId, requestId);

  const tampered = Buffer.from(body);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(
    () => verifySignedDflowResponse({
      body: tampered,
      expectedRequestId: requestId,
      headers,
      now: () => 1_785_197_338_000,
      status: 200,
    }),
    /digest did not match/,
  );
});

test('spot order validates and simulates the exact wallet-bound transaction', async () => {
  const fixture = buildFixture();
  const rpc = createRpc();
  let request;
  const service = createService(fixture, rpc, {
    captureRequest(value) {
      request = value;
    },
  });
  const result = await service.spotOrder({
    amount: '1',
    owner: fixture.owner.publicKey.toBase58(),
    side: 'buy',
    slippageBps: 100,
    token: 'solo',
  });

  assert.equal(request.intent.atomicAmount, '1000000');
  assert.equal(request.owner, fixture.owner.publicKey.toBase58());
  assert.equal(result.quote.estimatedAmountOut, '2');
  assert.equal(result.review.feePayer, fixture.owner.publicKey.toBase58());
  assert.equal(result.review.simulation.ok, true);
  assert.match(result.review.transactionFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(rpc.calls[0][0], 'simulateTransaction');
  assert.equal(rpc.calls[0][2].sigVerify, false);
});

test('spot submission revalidates the reviewed message and signature before broadcast', async () => {
  const fixture = buildFixture();
  const rpc = createRpc();
  const service = createService(fixture, rpc);
  const signed = new VersionedTransaction(fixture.transaction.message);
  signed.sign([fixture.owner]);
  const result = await service.spotSubmit({
    reviewToken: 'fixture-review',
    signedTransaction: Buffer.from(signed.serialize()).toString('base64'),
  });

  assert.equal(result.status, 'submitted');
  assert.match(result.signature, /^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
  assert.equal(
    rpc.calls.filter(call => call[0] === 'simulateTransaction').at(-1)[2].sigVerify,
    true,
  );
  assert.equal(rpc.calls.at(-1)[0], 'sendRawTransaction');

  const changedMessage = new TransactionMessage({
    payerKey: fixture.owner.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ],
  }).compileToV0Message();
  const changed = new VersionedTransaction(changedMessage);
  changed.sign([fixture.owner]);
  await assert.rejects(
    service.spotSubmit({
      reviewToken: 'fixture-review',
      signedTransaction: Buffer.from(changed.serialize()).toString('base64'),
    }),
    /does not match the reviewed transaction/,
  );
});
