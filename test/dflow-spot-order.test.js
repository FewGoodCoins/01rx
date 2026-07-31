import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  DFLOW_DEVELOPMENT_URL,
  DFLOW_PROGRAM_ID,
  DFLOW_PRODUCTION_URL,
  createDflowSpotOrderService,
  decodeReviewToken,
  encodeReviewToken,
  loadAndValidateDflowLookupTables,
  parseUiAmount,
  resolveDflowUrl,
  resolveRpcUrl,
  validateDflowTransaction,
  validateOrderResponse,
  verifySignedDflowResponse,
} from '../api/_lib/dflow-spot-order.js';
import {
  MAINNET_USDC_MINT,
  getTradableOwnershipTokens,
} from '../api/_lib/ownership-token-registry.js';

function encodeTokenAccount(mint, owner, amount, {
  closeAuthority = null,
  delegate = null,
  delegatedAmount = 0n,
} = {}) {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({
    amount: BigInt(amount),
    closeAuthority: closeAuthority ? new PublicKey(closeAuthority) : PublicKey.default,
    closeAuthorityOption: closeAuthority ? 1 : 0,
    delegate: delegate ? new PublicKey(delegate) : PublicKey.default,
    delegatedAmount,
    delegateOption: delegate ? 1 : 0,
    isNative: 0n,
    isNativeOption: 0,
    mint: new PublicKey(mint),
    owner: new PublicKey(owner),
    state: 1,
  }, data);
  return data;
}

function simulatedTokenAccount(mint, owner, amount, controls) {
  return {
    data: [encodeTokenAccount(mint, owner, amount, controls).toString('base64'), 'base64'],
    executable: false,
    lamports: 2_039_280,
    owner: TOKEN_PROGRAM_ID.toBase58(),
    rentEpoch: 0,
  };
}

const OWNER_LAMPORTS = 1_000_000_000;

function simulatedSystemAccount(lamports = OWNER_LAMPORTS - 5_000) {
  return {
    data: ['', 'base64'],
    executable: false,
    lamports,
    owner: SystemProgram.programId.toBase58(),
    rentEpoch: 0,
  };
}

function encodeLookupTable(addresses, { active = true } = {}) {
  const data = Buffer.alloc(56 + addresses.length * 32);
  data.writeUInt32LE(1, 0);
  data.writeBigUInt64LE(active ? ((1n << 64n) - 1n) : 1n, 4);
  data.writeBigUInt64LE(1n, 12);
  data.writeUInt8(0, 20);
  data.writeUInt8(0, 21);
  addresses.forEach((address, index) => {
    new PublicKey(address).toBuffer().copy(data, 56 + index * 32);
  });
  return data;
}

function buildFixture() {
  const owner = Keypair.generate();
  const outputMint = Keypair.generate().publicKey;
  const market = Keypair.generate().publicKey;
  const inputMint = new PublicKey(MAINNET_USDC_MINT);
  const dflowProgram = new PublicKey(DFLOW_PROGRAM_ID);
  const inputTokenAccount = getAssociatedTokenAddressSync(inputMint, owner.publicKey);
  const outputTokenAccount = getAssociatedTokenAddressSync(outputMint, owner.publicKey);
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    dflowProgram,
  );
  const swapData = Buffer.alloc(34);
  Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]).copy(swapData, 0);
  swapData.writeUInt32LE(1, 8);
  swapData.writeUInt8(20, 12); // MeteoraDammV2Swap
  swapData.writeBigUInt64LE(1_000_000n, 13);
  swapData.writeUInt8(0x80, 21);
  swapData.writeBigUInt64LE(2_000_000n, 22);
  swapData.writeUInt16LE(100, 30);
  swapData.writeUInt16LE(0, 32);
  const dflowInstruction = new TransactionInstruction({
    programId: dflowProgram,
    keys: [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: owner.publicKey, isSigner: true, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: dflowProgram, isSigner: false, isWritable: false },
      { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
      { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
      { pubkey: inputMint, isSigner: false, isWritable: false },
      { pubkey: outputMint, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
      {
        pubkey: new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'),
        isSigner: false,
        isWritable: false,
      },
    ],
    data: swapData,
  });
  const message = new TransactionMessage({
    payerKey: owner.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
      dflowInstruction,
    ],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  const payload = {
    addressLookupTables: [],
    computeUnitLimit: 200_000,
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
    prioritizationFeeLamports: 1_000,
    prioritizationType: {
      computeBudget: {
        estimatedMicroLamports: 5_000,
        microLamports: 5_000,
      },
    },
    routePlan: [{
      inAmount: '1000000',
      inputMint: MAINNET_USDC_MINT,
      inputMintDecimals: 6,
      marketKey: market.toBase58(),
      outAmount: '2000000',
      outputMint: outputMint.toBase58(),
      outputMintDecimals: 6,
      venue: 'Meteora DAMM v2',
    }],
    slippageBps: 100,
    transaction: Buffer.from(transaction.serialize()).toString('base64'),
  };
  return {
    inputTokenAccount,
    market,
    outputMint,
    outputTokenAccount,
    owner,
    payload,
    transaction,
  };
}

function createRpc(fixture, signature = bs58.encode(Buffer.alloc(64, 7))) {
  const calls = [];
  const owner = fixture.owner.publicKey.toBase58();
  return {
    calls,
    async getBlockHeight() {
      calls.push(['getBlockHeight']);
      return 389_999_999;
    },
    async getFeeForMessage() {
      calls.push(['getFeeForMessage']);
      return {
        context: { slot: fixture.payload.contextSlot },
        value: 5_000,
      };
    },
    async sendRawTransaction(bytes, options) {
      calls.push(['sendRawTransaction', Buffer.from(bytes), options]);
      return signature;
    },
    async simulateTransaction(transaction, options) {
      calls.push(['simulateTransaction', transaction, options]);
      return {
        context: { slot: fixture.payload.contextSlot },
        value: {
          err: null,
          logs: ['Program log: fixture'],
          accounts: [
            simulatedTokenAccount(MAINNET_USDC_MINT, owner, 9_000_000n),
            simulatedTokenAccount(fixture.outputMint, owner, 9_000_000n),
            simulatedSystemAccount(),
          ],
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
    loadMintDecimals: async () => 6,
    loadDflowExecutionSafety: async () => ({
      contextSlot: fixture.payload.contextSlot,
    }),
    loadDflowProgramIntegrity: async () => ({ deploymentSlot: 436_232_368 }),
    loadTradeAccountState: async () => ({
      contextSlot: fixture.payload.contextSlot,
      inputAccountLamports: 2_039_280,
      inputAmount: 10_000_000n,
      inputControlState: {
        closeAuthority: null,
        delegate: null,
        delegatedAmount: 0n,
      },
      inputTokenAccount: fixture.inputTokenAccount.toBase58(),
      ownerAddress: fixture.owner.publicKey.toBase58(),
      ownerLamports: OWNER_LAMPORTS,
      outputAmount: 7_000_000n,
      outputAccountExists: true,
      outputAccountLamports: 2_039_280,
      outputControlState: {
        closeAuthority: null,
        delegate: null,
        delegatedAmount: 0n,
      },
      outputTokenAccount: fixture.outputTokenAccount.toBase58(),
    }),
    loadTokens: async () => tokens,
    ...overrides,
  });
}

function fixtureIntent(fixture, overrides = {}) {
  return {
    atomicAmount: '1000000',
    inputDecimals: 6,
    inputMint: MAINNET_USDC_MINT,
    outputDecimals: 6,
    outputMint: fixture.outputMint.toBase58(),
    slippageBps: 100,
    ...overrides,
  };
}

function unsignedQuotePayload(fixture, overrides = {}) {
  const payload = {
    ...fixture.payload,
    ...overrides,
  };
  delete payload.transaction;
  delete payload.computeUnitLimit;
  delete payload.lastValidBlockHeight;
  delete payload.prioritizationFeeLamports;
  delete payload.prioritizationType;
  return payload;
}

function signFixtureTransaction(fixture) {
  const signed = new VersionedTransaction(fixture.transaction.message);
  signed.sign([fixture.owner]);
  return Buffer.from(signed.serialize()).toString('base64');
}

async function assertTradingRejection(operation, {
  code,
  pattern,
  statusCode,
} = {}) {
  await assert.rejects(operation, (error) => {
    if (code) assert.equal(error.code, code);
    if (statusCode) assert.equal(error.statusCode, statusCode);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

function assertNeverBroadcast(rpc) {
  assert.equal(
    rpc.calls.some(call => call[0] === 'sendRawTransaction'),
    false,
  );
}

function officialSignedQuoteFixture() {
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
  return {
    body,
    headers,
    now: 1_785_197_338_000,
    payload: JSON.parse(body.toString('utf8')),
    requestId,
  };
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

test('lookup-table loader validates owner, active state, and quote context', async () => {
  const tableAddress = Keypair.generate().publicKey;
  const loadedAddress = Keypair.generate().publicKey;
  const fixture = {
    context: { slot: 500_000_001 },
    value: {
      data: encodeLookupTable([loadedAddress]),
      executable: false,
      lamports: 1,
      owner: AddressLookupTableProgram.programId,
      rentEpoch: 0,
    },
  };
  const calls = [];
  const connection = {
    async getAccountInfoAndContext(address, options) {
      calls.push([address.toBase58(), options]);
      return fixture;
    },
  };
  const [table] = await loadAndValidateDflowLookupTables(
    connection,
    [{ accountKey: tableAddress }],
    { minContextSlot: 500_000_000 },
  );
  assert.equal(table.key.toBase58(), tableAddress.toBase58());
  assert.equal(table.state.addresses[0].toBase58(), loadedAddress.toBase58());
  assert.deepEqual(calls[0][1], {
    commitment: 'confirmed',
    minContextSlot: 500_000_000,
  });

  for (const mutate of [
    value => { value.context.slot = 499_999_999; },
    value => { value.value.owner = SystemProgram.programId; },
    value => { value.value.executable = true; },
    value => { value.value.data = encodeLookupTable([loadedAddress], { active: false }); },
    value => { value.value.data = Buffer.alloc(8); },
  ]) {
    const response = {
      context: { ...fixture.context },
      value: {
        ...fixture.value,
        data: Buffer.from(fixture.value.data),
      },
    };
    mutate(response);
    await assert.rejects(
      loadAndValidateDflowLookupTables({
        async getAccountInfoAndContext() {
          return response;
        },
      }, [{ accountKey: tableAddress }], { minContextSlot: 500_000_000 }),
      error => (
        error.code === 'DFLOW_LOOKUP_TABLE_UNAVAILABLE'
        && /^alt-/.test(error.diagnostic)
      ),
    );
  }

  const retryDelays = [];
  let attempts = 0;
  const [retried] = await loadAndValidateDflowLookupTables({
    async getAccountInfoAndContext() {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('Min context slot not reached');
        error.code = -32603;
        throw error;
      }
      return fixture;
    },
  }, [{ accountKey: tableAddress }], {
    minContextSlot: 500_000_000,
    async waitForRetry(delay) {
      retryDelays.push(delay);
    },
  });
  assert.equal(retried.key.toBase58(), tableAddress.toBase58());
  assert.deepEqual(retryDelays, [100, 200]);

  attempts = 0;
  await assert.rejects(
    loadAndValidateDflowLookupTables({
      async getAccountInfoAndContext() {
        attempts += 1;
        const error = new Error('synthetic RPC failure');
        error.code = -32603;
        throw error;
      },
    }, [{ accountKey: tableAddress }], {
      minContextSlot: 500_000_000,
      async waitForRetry() {
        throw new Error('unexpected retry');
      },
    }),
    error => (
      error.code === 'DFLOW_LOOKUP_TABLE_UNAVAILABLE'
      && error.diagnostic === 'alt-rpc-read-failed'
      && attempts === 1
    ),
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
    inputDecimals: 6,
    inputMint: MAINNET_USDC_MINT,
    outputDecimals: 6,
    outputMint: fixture.outputMint.toBase58(),
    slippageBps: 100,
  };
  const quote = validateOrderResponse(fixture.payload, intent, {
    transactionRequired: true,
  });
  assert.equal(quote.priceImpactPercent, 0.1);
  assert.equal(quote.platformFeeBps, 0);
  assert.equal(quote.route[0].venue, 'Meteora DAMM v2');
  const withoutPlatformFee = { ...fixture.payload };
  delete withoutPlatformFee.platformFee;
  assert.equal(
    validateOrderResponse(withoutPlatformFee, intent, {
      transactionRequired: true,
    }).platformFeeBps,
    0,
  );

  assert.throws(
    () => validateOrderResponse({
      ...fixture.payload,
      platformFee: { amount: '0', feeBps: 0, mode: 'outputMint' },
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
  assert.throws(
    () => validateOrderResponse({
      ...fixture.payload,
      minOutAmount: '1',
      otherAmountThreshold: '1',
    }, intent, { transactionRequired: true }),
    /does not match/,
  );
  assert.throws(
    () => validateOrderResponse({
      ...fixture.payload,
      computeUnitLimit: 199_000,
    }, intent, { transactionRequired: true }),
    /prioritization fee does not match/,
  );
  assert.throws(
    () => validateOrderResponse({
      ...fixture.payload,
      routePlan: [{
        ...fixture.payload.routePlan[0],
        outputMintDecimals: 5,
      }],
    }, intent, { transactionRequired: true }),
    /decimals do not match/,
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
  const rpc = createRpc(fixture);
  let request;
  let integrityOptions;
  let lookupOptions;
  const service = createService(fixture, rpc, {
    captureRequest(value) {
      request = value;
    },
    async loadDflowProgramIntegrity(_connection, options) {
      integrityOptions = options;
      return { deploymentSlot: 436_232_368 };
    },
    async loadLookupTables(_connection, _lookups, options) {
      lookupOptions = options;
      return [];
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
  assert.deepEqual(rpc.calls[0][2].accounts.addresses, [
    fixture.inputTokenAccount.toBase58(),
    fixture.outputTokenAccount.toBase58(),
    fixture.owner.publicKey.toBase58(),
  ]);
  assert.deepEqual(integrityOptions, {
    minContextSlot: fixture.payload.contextSlot,
  });
  assert.deepEqual(lookupOptions, {
    minContextSlot: fixture.payload.contextSlot,
  });
});

test('spot submission revalidates the reviewed message and signature before broadcast', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
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

test('spot submission never broadcasts when final token effects differ from review', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  const owner = fixture.owner.publicKey.toBase58();
  rpc.simulateTransaction = async (transaction, options) => {
    rpc.calls.push(['simulateTransaction', transaction, options]);
    return {
      context: { slot: fixture.payload.contextSlot },
      value: {
        accounts: [
          simulatedTokenAccount(MAINNET_USDC_MINT, owner, 9_000_000n),
          simulatedTokenAccount(fixture.outputMint, owner, 8_979_999n),
          simulatedSystemAccount(),
        ],
        err: null,
        logs: ['Program log: altered output'],
        unitsConsumed: 42_000,
      },
    };
  };
  const service = createService(fixture, rpc);
  const signed = new VersionedTransaction(fixture.transaction.message);
  signed.sign([fixture.owner]);

  await assert.rejects(
    service.spotSubmit({
      reviewToken: 'fixture-review',
      signedTransaction: Buffer.from(signed.serialize()).toString('base64'),
    }),
    /token changes do not match/,
  );
  assert.equal(
    rpc.calls.some(call => call[0] === 'sendRawTransaction'),
    false,
  );
});

test('spot submission never broadcasts when final token controls gain a delegate', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  const owner = fixture.owner.publicKey.toBase58();
  rpc.simulateTransaction = async (transaction, options) => {
    rpc.calls.push(['simulateTransaction', transaction, options]);
    return {
      context: { slot: fixture.payload.contextSlot },
      value: {
        accounts: [
          simulatedTokenAccount(MAINNET_USDC_MINT, owner, 9_000_000n),
          simulatedTokenAccount(
            fixture.outputMint,
            owner,
            9_000_000n,
            { delegate: Keypair.generate().publicKey, delegatedAmount: 1n },
          ),
          simulatedSystemAccount(),
        ],
        err: null,
        logs: ['Program log: altered token delegate'],
        unitsConsumed: 42_000,
      },
    };
  };
  const service = createService(fixture, rpc);

  await assert.rejects(
    service.spotSubmit({
      reviewToken: 'fixture-review',
      signedTransaction: signFixtureTransaction(fixture),
    }),
    /changed the reviewed output token account/,
  );
  assertNeverBroadcast(rpc);
});

test('spot submission never broadcasts when final SOL effects exceed the exact fee', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  const owner = fixture.owner.publicKey.toBase58();
  rpc.simulateTransaction = async (transaction, options) => {
    rpc.calls.push(['simulateTransaction', transaction, options]);
    return {
      context: { slot: fixture.payload.contextSlot },
      value: {
        accounts: [
          simulatedTokenAccount(MAINNET_USDC_MINT, owner, 9_000_000n),
          simulatedTokenAccount(fixture.outputMint, owner, 9_000_000n),
          simulatedSystemAccount(OWNER_LAMPORTS - 5_001),
        ],
        err: null,
        logs: ['Program log: altered SOL debit'],
        unitsConsumed: 42_000,
      },
    };
  };
  const service = createService(fixture, rpc);
  const signed = new VersionedTransaction(fixture.transaction.message);
  signed.sign([fixture.owner]);

  await assert.rejects(
    service.spotSubmit({
      reviewToken: 'fixture-review',
      signedTransaction: Buffer.from(signed.serialize()).toString('base64'),
    }),
    /SOL changes do not match/,
  );
  assert.equal(
    rpc.calls.some(call => call[0] === 'sendRawTransaction'),
    false,
  );
});

test('spot order fails closed on stale simulation and fee contexts', async () => {
  for (const staleCall of ['simulateTransaction', 'getFeeForMessage']) {
    const fixture = buildFixture();
    const rpc = createRpc(fixture);
    const original = rpc[staleCall].bind(rpc);
    rpc[staleCall] = async (...args) => {
      const response = await original(...args);
      response.context.slot = fixture.payload.contextSlot - 1;
      return response;
    };
    const service = createService(fixture, rpc);
    await assert.rejects(
      service.spotOrder({
        amount: '1',
        owner: fixture.owner.publicKey.toBase58(),
        side: 'buy',
        slippageBps: 100,
        token: 'solo',
      }),
      /reviewed slot/,
    );
  }
});

test('DFlow quote validation rejects altered economics and prediction-market semantics', () => {
  const mutations = [
    payload => { payload.inputMint = Keypair.generate().publicKey.toBase58(); },
    payload => { payload.inAmount = '999999'; },
    payload => { payload.outAmount = '0'; },
    payload => { payload.minOutAmount = '1979999'; },
    payload => { payload.otherAmountThreshold = '1979999'; },
    payload => { payload.slippageBps = 99; },
    payload => { payload.contextSlot = -1; },
    payload => { payload.executionMode = 'async'; },
    payload => { payload.priceImpactPct = 'not-a-number'; },
    payload => { payload.priceImpactPct = '-0.01'; },
    payload => { payload.priceImpactPct = '1.01'; },
    payload => { payload.predictionMarketSlippageBps = 99; },
    payload => { payload.isNativePredictionMarketOutput = true; },
  ];
  for (const mutate of mutations) {
    const fixture = buildFixture();
    const payload = structuredClone(fixture.payload);
    mutate(payload);
    assert.throws(
      () => validateOrderResponse(
        payload,
        fixtureIntent(fixture),
        { transactionRequired: true },
      ),
      error => (
        error.code === 'INVALID_DFLOW_RESPONSE'
        && error.statusCode === 502
      ),
    );
  }

  const fixture = buildFixture();
  const nativePredictionMarket = {
    ...fixture.payload,
    isNativePredictionMarketOutput: true,
    predictionMarketSlippageBps: 100,
  };
  assert.equal(
    validateOrderResponse(
      nativePredictionMarket,
      fixtureIntent(fixture),
      { transactionRequired: true },
    ).slippageBps,
    100,
  );
});

test('DFlow quote validation rejects altered route amounts, decimals, market, and venue', () => {
  const mutations = [
    payload => { payload.routePlan = []; },
    payload => { payload.routePlan.push({ ...payload.routePlan[0] }); },
    payload => { payload.routePlan = [null]; },
    payload => { payload.routePlan[0].inputMint = randomPublicKey(); },
    payload => { payload.routePlan[0].outputMint = randomPublicKey(); },
    payload => { payload.routePlan[0].inAmount = '999999'; },
    payload => { payload.routePlan[0].outAmount = '1999999'; },
    payload => { payload.routePlan[0].inputMintDecimals = 19; },
    payload => { payload.routePlan[0].outputMintDecimals = 1.5; },
    payload => { payload.routePlan[0].marketKey = 'invalid'; },
    payload => { payload.routePlan[0].venue = ''; },
    payload => { payload.routePlan[0].venue = 'x'.repeat(81); },
  ];
  for (const mutate of mutations) {
    const fixture = buildFixture();
    const payload = structuredClone(fixture.payload);
    mutate(payload);
    assert.throws(
      () => validateOrderResponse(
        payload,
        fixtureIntent(fixture),
        { transactionRequired: true },
      ),
      error => (
        ['INVALID_DFLOW_RESPONSE', 'INVALID_TRADING_REQUEST'].includes(error.code)
      ),
    );
  }
});

test('DFlow quote validation rejects malformed or excessive transaction fee fields', () => {
  const mutations = [
    payload => { payload.computeUnitLimit = 0; },
    payload => { payload.computeUnitLimit = 1_400_001; },
    payload => { payload.prioritizationFeeLamports = -1; },
    payload => { payload.prioritizationFeeLamports = 1_000_001; },
    payload => { payload.prioritizationType = null; },
    payload => { payload.prioritizationType.computeBudget = null; },
    payload => { payload.prioritizationType.computeBudget.microLamports = -1; },
    payload => { payload.prioritizationType.computeBudget.microLamports = 5_001; },
    payload => { payload.lastValidBlockHeight = -1; },
  ];
  for (const mutate of mutations) {
    const fixture = buildFixture();
    const payload = structuredClone(fixture.payload);
    mutate(payload);
    assert.throws(
      () => validateOrderResponse(
        payload,
        fixtureIntent(fixture),
        { transactionRequired: true },
      ),
    );
  }
});

test('DFlow quote validation binds whether executable transaction bytes were requested', () => {
  const fixture = buildFixture();
  assert.throws(
    () => validateOrderResponse(
      fixture.payload,
      fixtureIntent(fixture),
      { transactionRequired: false },
    ),
    /unexpected transaction/,
  );
  assert.throws(
    () => validateOrderResponse(
      unsignedQuotePayload(fixture),
      fixtureIntent(fixture),
      { transactionRequired: true },
    ),
    /did not return a transaction/,
  );
  const quote = validateOrderResponse(
    unsignedQuotePayload(fixture),
    fixtureIntent(fixture),
    { transactionRequired: false },
  );
  assert.equal(quote.lastValidBlockHeight, null);
  assert.equal(quote.computeUnitLimit, null);
  assert.equal(quote.prioritizationFeeLamports, null);
});

function randomPublicKey() {
  return Keypair.generate().publicKey.toBase58();
}

function spotOrderRequest(fixture, overrides = {}) {
  return {
    amount: '1',
    owner: fixture.owner.publicKey.toBase58(),
    side: 'buy',
    slippageBps: 100,
    token: 'solo',
    ...overrides,
  };
}

function fixtureTradeState(fixture, overrides = {}) {
  return {
    contextSlot: fixture.payload.contextSlot,
    inputAccountLamports: 2_039_280,
    inputAmount: 10_000_000n,
    inputControlState: {
      closeAuthority: null,
      delegate: null,
      delegatedAmount: 0n,
    },
    inputTokenAccount: fixture.inputTokenAccount.toBase58(),
    ownerAddress: fixture.owner.publicKey.toBase58(),
    ownerLamports: OWNER_LAMPORTS,
    outputAmount: 7_000_000n,
    outputAccountExists: true,
    outputAccountLamports: 2_039_280,
    outputControlState: {
      closeAuthority: null,
      delegate: null,
      delegatedAmount: 0n,
    },
    outputTokenAccount: fixture.outputTokenAccount.toBase58(),
    ...overrides,
  };
}

test('spot order rejects malformed, pre-signed, or mismatched DFlow transactions before simulation', async () => {
  const cases = [
    {
      mutate(fixture) {
        fixture.payload.transaction = 'not-base64';
      },
      pattern: /DFlow transaction is invalid/,
    },
    {
      mutate(fixture) {
        fixture.payload.transaction = signFixtureTransaction(fixture);
      },
      pattern: /signer does not match/,
    },
    {
      mutate(fixture) {
        fixture.payload.addressLookupTables = [{
          address: randomPublicKey(),
          addresses: {},
        }];
      },
      pattern: /lookup table proof is incomplete/,
    },
    {
      request(fixture) {
        return spotOrderRequest(fixture, { owner: randomPublicKey() });
      },
      pattern: /signer does not match/,
    },
  ];
  for (const testCase of cases) {
    const fixture = buildFixture();
    testCase.mutate?.(fixture);
    const rpc = createRpc(fixture);
    const service = createService(fixture, rpc);
    await assertTradingRejection(
      () => service.spotOrder(
        testCase.request?.(fixture) || spotOrderRequest(fixture),
      ),
      {
        code: 'INVALID_DFLOW_TRANSACTION',
        pattern: testCase.pattern,
      },
    );
    assert.equal(
      rpc.calls.some(call => call[0] === 'simulateTransaction'),
      false,
    );
    assertNeverBroadcast(rpc);
  }
});

test('spot order fails closed on restart or route-program safety before simulation', async () => {
  for (const code of [
    'SOLANA_RESTART_COOLDOWN',
    'SOLANA_PROGRAM_INTEGRITY_CHANGED',
    'SOLANA_PROGRAM_INTEGRITY_UNAVAILABLE',
  ]) {
    const fixture = buildFixture();
    const rpc = createRpc(fixture);
    const service = createService(fixture, rpc, {
      async loadDflowExecutionSafety() {
        const error = new Error('execution safety fixture');
        error.code = code;
        error.statusCode = 503;
        throw error;
      },
    });
    await assertTradingRejection(
      () => service.spotOrder(spotOrderRequest(fixture)),
      { code, statusCode: 503 },
    );
    assert.equal(
      rpc.calls.some(call => call[0] === 'simulateTransaction'),
      false,
    );
    assertNeverBroadcast(rpc);
  }
});

test('spot order rejects failed initial simulation and exposes only bounded diagnostics', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  rpc.simulateTransaction = async (transaction, options) => {
    rpc.calls.push(['simulateTransaction', transaction, options]);
    return {
      context: { slot: fixture.payload.contextSlot },
      value: {
        accounts: [],
        err: { InstructionError: [2, 'Custom'] },
        logs: Array.from({ length: 40 }, (_, index) => `log ${index}`),
        unitsConsumed: 50_000,
      },
    };
  };
  const service = createService(fixture, rpc);
  await assert.rejects(
    () => service.spotOrder(spotOrderRequest(fixture)),
    (error) => {
      assert.equal(error.code, 'DFLOW_SIMULATION_FAILED');
      assert.equal(error.statusCode, 422);
      assert.equal(error.simulation.ok, false);
      assert.equal(error.simulation.logs.length, 30);
      assert.equal(error.simulation.unitsConsumed, 50_000);
      assert.match(error.simulation.error, /InstructionError/);
      return true;
    },
  );
  assertNeverBroadcast(rpc);
});

test('spot order rejects malformed simulation and fee RPC contexts', async () => {
  const cases = [
    {
      method: 'simulateTransaction',
      mutate(response) {
        response.context = null;
      },
      code: 'SOLANA_SIMULATION_UNAVAILABLE',
    },
    {
      method: 'simulateTransaction',
      mutate(response) {
        response.value = null;
      },
      code: 'SOLANA_SIMULATION_UNAVAILABLE',
    },
    {
      method: 'getFeeForMessage',
      mutate(response) {
        response.context = null;
      },
      code: 'SOLANA_FEE_UNAVAILABLE',
    },
    {
      method: 'getFeeForMessage',
      mutate(response) {
        response.value = -1;
      },
      code: 'SOLANA_FEE_UNAVAILABLE',
    },
    {
      method: 'getFeeForMessage',
      mutate(response) {
        response.value = 1.5;
      },
      code: 'SOLANA_FEE_UNAVAILABLE',
    },
  ];
  for (const testCase of cases) {
    const fixture = buildFixture();
    const rpc = createRpc(fixture);
    const original = rpc[testCase.method].bind(rpc);
    rpc[testCase.method] = async (...args) => {
      const response = await original(...args);
      testCase.mutate(response);
      return response;
    };
    const service = createService(fixture, rpc);
    await assertTradingRejection(
      () => service.spotOrder(spotOrderRequest(fixture)),
      {
        code: testCase.code,
        pattern: /reviewed slot/,
        statusCode: 503,
      },
    );
    assertNeverBroadcast(rpc);
  }

  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  const service = createService(fixture, rpc, {
    loadTradeAccountState: async () => fixtureTradeState(fixture, {
      contextSlot: fixture.payload.contextSlot + 1,
    }),
  });
  await assertTradingRejection(
    () => service.spotOrder(spotOrderRequest(fixture)),
    {
      code: 'SOLANA_SIMULATION_UNAVAILABLE',
      pattern: /reviewed slot/,
    },
  );
  assertNeverBroadcast(rpc);
});

test('spot submission rejects malformed or invalid wallet signatures without broadcasting', async () => {
  const cases = [
    {
      signedTransaction: 'not-base64',
      code: 'INVALID_SIGNED_TRANSACTION',
      pattern: /Signed transaction is invalid/,
    },
    {
      signedTransaction(fixture) {
        return fixture.payload.transaction;
      },
      code: 'SIGNED_TRANSACTION_CHANGED',
      pattern: /signature does not match/,
    },
    {
      signedTransaction(fixture) {
        const signed = VersionedTransaction.deserialize(
          Buffer.from(signFixtureTransaction(fixture), 'base64'),
        );
        signed.signatures[0][0] ^= 0xff;
        return Buffer.from(signed.serialize()).toString('base64');
      },
      code: 'SIGNED_TRANSACTION_CHANGED',
      pattern: /signature does not match/,
    },
  ];
  for (const testCase of cases) {
    const fixture = buildFixture();
    const rpc = createRpc(fixture);
    const service = createService(fixture, rpc);
    await assertTradingRejection(
      () => service.spotSubmit({
        reviewToken: 'fixture-review',
        signedTransaction: typeof testCase.signedTransaction === 'function'
          ? testCase.signedTransaction(fixture)
          : testCase.signedTransaction,
      }),
      {
        code: testCase.code,
        pattern: testCase.pattern,
      },
    );
    assertNeverBroadcast(rpc);
  }
});

test('spot submission rechecks that the reviewed ownership token remains active', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  const service = createService(fixture, rpc, {
    loadTokens: async () => ({}),
  });
  await assertTradingRejection(
    () => service.spotSubmit({
      reviewToken: 'fixture-review',
      signedTransaction: signFixtureTransaction(fixture),
    }),
    {
      code: 'TOKEN_NOT_TRADABLE',
      pattern: /no longer active/,
      statusCode: 409,
    },
  );
  assertNeverBroadcast(rpc);
});

test('spot submission rejects an expired route before final simulation or broadcast', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  rpc.getBlockHeight = async () => {
    rpc.calls.push(['getBlockHeight']);
    return fixture.payload.lastValidBlockHeight + 1;
  };
  const service = createService(fixture, rpc);
  await assertTradingRejection(
    () => service.spotSubmit({
      reviewToken: 'fixture-review',
      signedTransaction: signFixtureTransaction(fixture),
    }),
    {
      code: 'TRADE_REVIEW_EXPIRED',
      pattern: /expired before submission/,
      statusCode: 409,
    },
  );
  assert.equal(
    rpc.calls.some(call => call[0] === 'simulateTransaction'),
    false,
  );
  assertNeverBroadcast(rpc);
});

test('spot submission rejects final simulation errors without broadcasting', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  rpc.simulateTransaction = async (transaction, options) => {
    rpc.calls.push(['simulateTransaction', transaction, options]);
    return {
      context: { slot: fixture.payload.contextSlot },
      value: {
        accounts: [],
        err: { InstructionError: [2, 'Custom'] },
        logs: ['final failure'],
        unitsConsumed: 42_000,
      },
    };
  };
  const service = createService(fixture, rpc);
  await assertTradingRejection(
    () => service.spotSubmit({
      reviewToken: 'fixture-review',
      signedTransaction: signFixtureTransaction(fixture),
    }),
    {
      code: 'SIGNED_TRANSACTION_SIMULATION_FAILED',
      pattern: /failed final mainnet simulation/,
      statusCode: 422,
    },
  );
  assertNeverBroadcast(rpc);
});

test('spot submission rejects stale or malformed final RPC contexts without broadcasting', async () => {
  const cases = [
    {
      method: 'simulateTransaction',
      mutate(response, fixture) {
        response.context.slot = fixture.payload.contextSlot - 1;
      },
      code: 'SOLANA_SIMULATION_UNAVAILABLE',
    },
    {
      method: 'simulateTransaction',
      mutate(response) {
        response.context = null;
      },
      code: 'SOLANA_SIMULATION_UNAVAILABLE',
    },
    {
      method: 'simulateTransaction',
      mutate(response) {
        response.value = null;
      },
      code: 'SOLANA_SIMULATION_UNAVAILABLE',
    },
    {
      method: 'getFeeForMessage',
      mutate(response, fixture) {
        response.context.slot = fixture.payload.contextSlot - 1;
      },
      code: 'SOLANA_FEE_UNAVAILABLE',
    },
    {
      method: 'getFeeForMessage',
      mutate(response) {
        response.context = null;
      },
      code: 'SOLANA_FEE_UNAVAILABLE',
    },
    {
      method: 'getFeeForMessage',
      mutate(response) {
        response.value = -1;
      },
      code: 'SOLANA_FEE_UNAVAILABLE',
    },
  ];
  for (const testCase of cases) {
    const fixture = buildFixture();
    const rpc = createRpc(fixture);
    const original = rpc[testCase.method].bind(rpc);
    rpc[testCase.method] = async (...args) => {
      const response = await original(...args);
      testCase.mutate(response, fixture);
      return response;
    };
    const service = createService(fixture, rpc);
    await assertTradingRejection(
      () => service.spotSubmit({
        reviewToken: 'fixture-review',
        signedTransaction: signFixtureTransaction(fixture),
      }),
      {
        code: testCase.code,
        pattern: /reviewed slot/,
        statusCode: 503,
      },
    );
    assertNeverBroadcast(rpc);
  }
});

test('spot submission rejects an invalid signature returned by the RPC', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture, 'invalid-signature');
  const service = createService(fixture, rpc);
  await assertTradingRejection(
    () => service.spotSubmit({
      reviewToken: 'fixture-review',
      signedTransaction: signFixtureTransaction(fixture),
    }),
    {
      code: 'SOLANA_SUBMISSION_FAILED',
      pattern: /invalid signature/,
      statusCode: 502,
    },
  );
  assert.equal(
    rpc.calls.filter(call => call[0] === 'sendRawTransaction').length,
    1,
  );
});

test('review tokens preserve the exact signed DFlow body and expire closed', () => {
  const fixture = officialSignedQuoteFixture();
  const proof = verifySignedDflowResponse({
    body: fixture.body,
    expectedRequestId: fixture.requestId,
    headers: fixture.headers,
    now: () => fixture.now,
    status: 200,
  });
  const token = encodeReviewToken(proof);
  const decoded = decodeReviewToken(token, () => fixture.now);
  assert.deepEqual(decoded.payload, fixture.payload);
  assert.equal(decoded.proof.body, fixture.body.toString('base64'));

  assert.throws(
    () => decodeReviewToken(token, () => fixture.now + 121_000),
    error => error.code === 'DFLOW_RESPONSE_EXPIRED',
  );
  for (const invalid of [
    '',
    'x'.repeat(96_001),
    Buffer.from('not-json').toString('base64url'),
    Buffer.from(JSON.stringify({ version: 2 })).toString('base64url'),
    Buffer.from(JSON.stringify({
      body: 1,
      status: 200,
      version: 1,
    })).toString('base64url'),
  ]) {
    assert.throws(
      () => decodeReviewToken(invalid, () => fixture.now),
      error => error.code === 'INVALID_TRADE_REVIEW',
    );
  }
});

test('DFlow response signature verification rejects malformed, mismatched, stale, and forged proofs', () => {
  const cases = [
    {
      mutate({ headers }) {
        headers.delete('signature-input');
      },
      code: 'DFLOW_RESPONSE_SIGNATURE_INVALID',
    },
    {
      expectedRequestId: '00000000-0000-4000-8000-000000000000',
      code: 'DFLOW_RESPONSE_SIGNATURE_INVALID',
    },
    {
      mutate({ headers }) {
        headers.set(
          'signature',
          `sig1=:${Buffer.alloc(63).toString('base64')}:`,
        );
      },
      code: 'DFLOW_RESPONSE_SIGNATURE_INVALID',
    },
    {
      nowDelta: 121_000,
      code: 'DFLOW_RESPONSE_EXPIRED',
    },
    {
      nowDelta: -31_000,
      code: 'DFLOW_RESPONSE_EXPIRED',
    },
    {
      mutate({ headers }) {
        headers.set(
          'signature',
          `sig1=:${Buffer.alloc(64).toString('base64')}:`,
        );
      },
      code: 'DFLOW_RESPONSE_SIGNATURE_INVALID',
    },
  ];
  for (const testCase of cases) {
    const fixture = officialSignedQuoteFixture();
    testCase.mutate?.(fixture);
    assert.throws(
      () => verifySignedDflowResponse({
        body: fixture.body,
        expectedRequestId: testCase.expectedRequestId || fixture.requestId,
        headers: fixture.headers,
        now: () => fixture.now + (testCase.nowDelta || 0),
        status: 200,
      }),
      error => error.code === testCase.code,
    );
  }
});

function createDefaultFetchOrderService(fetchImpl, overrides = {}) {
  const signed = officialSignedQuoteFixture();
  return {
    service: createDflowSpotOrderService({
      apiUrl: DFLOW_DEVELOPMENT_URL,
      connection: () => ({}),
      fetchImpl,
      loadMintDecimals: async () => 6,
      loadTokens: async () => ({
        solo: {
          mint: signed.payload.outputMint,
          name: 'Solomon',
          ticker: 'SOLO',
          usdcMint: MAINNET_USDC_MINT,
        },
      }),
      now: () => signed.now,
      randomUuid: () => signed.requestId,
      ...overrides,
    }),
    signed,
  };
}

test('default DFlow fetch path requests a signed, direct, capped ownerless quote', async () => {
  const calls = [];
  const { service, signed } = createDefaultFetchOrderService(async (url, options) => {
    calls.push({ options, url: new URL(url) });
    return new Response(signed.body, {
      headers: signed.headers,
      status: 200,
    });
  });
  const result = await service.spotOrder({
    amount: '1',
    side: 'buy',
    slippageBps: 100,
    token: 'solo',
  });
  assert.equal(result.owner, null);
  assert.equal(result.review, null);
  assert.equal(result.reviewToken, null);
  assert.equal(result.transaction, null);
  assert.equal(result.quote.inAmountRaw, '1000000');
  assert.equal(result.quote.outAmountRaw, '1596773');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['x-sign-request'], 'true');
  assert.equal(calls[0].options.headers['x-request-id'], signed.requestId);
  assert.equal(calls[0].options.headers['x-api-key'], undefined);
  assert.equal(calls[0].url.pathname, '/order');
  assert.equal(calls[0].url.searchParams.get('allowAsyncExec'), 'false');
  assert.equal(calls[0].url.searchParams.get('allowSyncExec'), 'true');
  assert.equal(calls[0].url.searchParams.get('onlyDirectRoutes'), 'true');
  assert.equal(calls[0].url.searchParams.get('maxTransactionSize'), '1232');
  assert.equal(
    calls[0].url.searchParams.get('prioritizationFeeMaxLamports'),
    '1000000',
  );
  assert.equal(calls[0].url.searchParams.has('userPublicKey'), false);
});

test('default DFlow fetch path maps no-route, upstream, timeout, and oversized failures', async () => {
  const cases = [
    {
      fetchImpl: async () => new Response(JSON.stringify({
        code: 'route_not_found',
      }), { status: 400 }),
      code: 'DFLOW_ROUTE_NOT_FOUND',
      pattern: /No executable route/,
      statusCode: 422,
    },
    {
      fetchImpl: async () => new Response('<untrusted>', { status: 502 }),
      code: 'DFLOW_UNAVAILABLE',
      pattern: /temporarily unavailable/,
      statusCode: 503,
    },
    {
      fetchImpl: async () => {
        throw new Error('synthetic network failure');
      },
      code: 'DFLOW_UNAVAILABLE',
      pattern: /temporarily unavailable/,
      statusCode: 503,
    },
    {
      fetchImpl: async () => {
        const error = new Error('synthetic abort');
        error.name = 'AbortError';
        throw error;
      },
      code: 'DFLOW_UNAVAILABLE',
      pattern: /timed out/,
      statusCode: 503,
    },
    {
      fetchImpl: async () => new Response('', {
        headers: { 'content-length': '64001' },
        status: 200,
      }),
      code: 'INVALID_DFLOW_RESPONSE',
      pattern: /too large/,
      statusCode: 502,
    },
    {
      fetchImpl: async () => new Response(Buffer.alloc(64_001), {
        status: 200,
      }),
      code: 'INVALID_DFLOW_RESPONSE',
      pattern: /too large/,
      statusCode: 502,
    },
  ];
  for (const testCase of cases) {
    const { service } = createDefaultFetchOrderService(testCase.fetchImpl);
    await assertTradingRejection(
      () => service.spotOrder({
        amount: '1',
        side: 'buy',
        token: 'solo',
      }),
      testCase,
    );
  }
});

test('production spot ordering fails closed before routing when the DFlow key is absent', async () => {
  const fixture = buildFixture();
  const rpc = createRpc(fixture);
  const service = createService(fixture, rpc, {
    apiKey: '',
    apiUrl: DFLOW_PRODUCTION_URL,
  });
  await assertTradingRejection(
    () => service.spotOrder(spotOrderRequest(fixture)),
    {
      code: 'TRADING_NOT_CONFIGURED',
      pattern: /DFlow API key/,
      statusCode: 503,
    },
  );
  assert.equal(rpc.calls.length, 0);
});
