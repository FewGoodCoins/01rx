const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const base58Module = require('bs58');
const {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Connection,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = require('@solana/web3.js');
const {
  AccountLayout,
  MintLayout,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const {
  SolanaSignAndSendTransaction,
  SolanaSignTransaction,
} = require('@solana/wallet-standard-features');

const base58 = base58Module.default || base58Module;
const WALLET_ADDRESS = 'A4THR6vJ6LWJ75681gfRrDhgRfxHbxhjdJV9Bz5v97GK';
const SIGNATURE = base58.encode(Buffer.alloc(64, 4));
const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
const FUTARCHY_PROGRAM = new PublicKey(
  'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq',
);
const CONDITIONAL_VAULT_PROGRAM = new PublicKey(
  'VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg',
);
const OPEN_PROPOSAL_DATA = Buffer.from(
  'Gl69u3SINSEEAAAAlxokYkoX9Z53s3KtbcrEm8bJsPwGNwKPUnAgX9SXfAiKZmFqAAAAAAHb+gFewlq83zm3nIW2xSMBxQrIsYfHVxCqALJTRmx1cMK4eaKdYucXxrcG0UXgB5bhRqxV9c0u8J0PSh6WEmuA7Su8yhwQ8EoZhKg5lA0yW6RWbzvlELbPjI+O3/6rSWD+vquRFNMfUAtF4mswQgY7sdwLWyIJ3B1oNKBD8Bw56e6A9AMAif1JlBe73934dXcDNYJXwiMwPktD/qYTDsJ56i+0hF6EGKmLYE7YKHOlm6HlIUmPGE66HCP399fxn9xOELMWQW5Z2HMMwAVX34G2bsPTpzAflyfjksVnIIpukozXnGwg8Gf1QLBg1nll6EnkyET3m6306al0LDXLM5HkGkG7EvxPY0wF8ncMS1W9uJxjPwfLahKjHYnFf35HXUNtPDrhWwBdQ208OuFbAA==',
  'base64',
);
const OPEN_DAO_DATA = Buffer.from(
  'owkvHzRVxTEB2pymWEVZJDoAAAAAAAAAACxfZGoAAAAAEGL5aAAAAABrF1U5HgAAAAAAAAAAAAAAaxdVOR4AAAAAAAAAAAAAAADdDukCAAAAAAAAAAAAAAAARCk1OgAAAAAAAAAAAAAAAAAAAIsCkfEpAAAAEgT9HEMBAACoNy0AAAAAAHG/WgAAAAAAFumDiMoIMwAAAAAAAAAAACxfZGoAAAAAimZhagAAAADHtL4hHwAAAAAAAAAAAAAAx7S+IR8AAAAAAAAAAAAAAADdDukCAAAAAAAAAAAAAAAARCk1OgAAAAAAAAAAAAAAgFEBALPIo5EqAAAAD275XT4BAADhOeUAAAAAAKlxAQAAAAAAPIV4jT45MQAAAAAAAAAAACxfZGoAAAAAimZhagAAAADpvofEHQAAAAAAAAAAAAAA6b6HxB0AAAAAAAAAAAAAAADdDukCAAAAAAAAAAAAAAAARCk1OgAAAAAAAAAAAAAAgFEBAJ0mNqApAAAAq959lEUBAACYOgAAAAAAACLXewIAAAAAAABQ7+LW5BobAAAAAAAAAAUBeLxGeNY6Sx3ziMTv0u63xzewdJz8biKt5z/zzjqTxvp6877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWF77XlxaVm2dgb1hW8pmBjEaYcecUsoJ+J3sYgDtJSlScvvCrP8GPfsw7V68+nw+Cl28Ib/VIsSSGO3v/iD6GTRAAAAAAAAAACO7SLZyD+S/+gJNUuTNSn/I+uHCez4VVuWBOr9ObxWt/rsdFmPByYBJkHfI/OBP5WfHiUZ32HUY6cVTzvedZ5i7Yvd9gudsflLSaztai1FsUBS0X77vW0GJwwYPEg+SfEXBQF4vEZ41jpLHfOIxO/S7rfHN7B0nPxuIq3nP/POOpPG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQQAAACWAID0AwAARCk1OgAAAAAAAAAAAAAAAN0O6QIAAAAAAAAAAAAAAIBRAQAAAAAAAAAAAAAAAAAAAAAAAIhSanQAAABHeAAAAAAAAAEAWEf4DQAAAAIAAAB3XrOzlXo6bMpVYM92f5OqkBcivD7qDyFcWux8QDYq+wleaM21TjgYsPs9CZ/Atpk2M5tHcB7h4/kLHyXCbdoVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  'base64',
);

function mintAccountInfo(decimals = 6) {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode({
    mintAuthorityOption: 0,
    mintAuthority: DEFAULT_PUBLIC_KEY,
    supply: 0n,
    decimals,
    isInitialized: true,
    freezeAuthorityOption: 0,
    freezeAuthority: DEFAULT_PUBLIC_KEY,
  }, data);
  return {
    data,
    executable: false,
    lamports: 1_461_600,
    owner: TOKEN_PROGRAM_ID,
    rentEpoch: 0,
  };
}

function tokenAccountInfo({ mint, owner, amount }) {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({
    mint,
    owner,
    amount: BigInt(amount),
    delegateOption: 0,
    delegate: DEFAULT_PUBLIC_KEY,
    state: 1,
    isNativeOption: 0,
    isNative: 0n,
    delegatedAmount: 0n,
    closeAuthorityOption: 0,
    closeAuthority: DEFAULT_PUBLIC_KEY,
  }, data);
  return {
    data,
    executable: false,
    lamports: 2_039_280,
    owner: TOKEN_PROGRAM_ID,
    rentEpoch: 0,
  };
}

function programAccountInfo(data, owner) {
  return {
    data,
    executable: false,
    lamports: 10_000_000,
    owner,
    rentEpoch: 0,
  };
}

function loyalOpenMarket() {
  return {
    ticker: 'LOYAL',
    daoAddress: 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK',
    baseMint: 'LYLikzBQtpa9ZgVrJsqYGQpR3cC1WMJrBHaXGrQmeta',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    baseDecimals: 6,
    quoteDecimals: 6,
    proposal: {
      id: '98zXsz1RtvYw4zHrxaZDdGBU3BgqfsX9XJbXBLSJUBST',
      passBaseMint: '9tedQ632KVkkHXzrqzdSuGxstGKTWwVErseisz4JfY8p',
      passQuoteMint: '8RmJnKKd7HFNwi5xrVsnqUDWf8Pd5JeBkTxdSaf2ERrF',
      failBaseMint: 'HBSnjPDzPwso2rBMZ329BsSyG62fsy3bU9DXmcwopJXM',
      failQuoteMint: '6Lu2ZNJEwLMA9JTnsWBKzuVtEvP2F6NNSaykopnzToZc',
    },
    pass: {
      baseReserves: 1_367_376.244677,
      quoteReserves: 182_832.054249,
    },
    fail: {
      baseReserves: 1_398_355.648171,
      quoteReserves: 178_781.562525,
    },
  };
}

async function loadTradingModule() {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, '../../src/markets/solana-trading.js'),
  );
  return import(moduleUrl.href);
}

function reviewableTransaction() {
  return new Transaction({
    feePayer: new PublicKey(WALLET_ADDRESS),
    recentBlockhash: DEFAULT_PUBLIC_KEY.toBase58(),
  }).add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
}

function wireWithPlaceholderSignatures(transaction) {
  const clone = Transaction.from(transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }));
  clone.signatures.forEach((entry) => {
    entry.signature = Buffer.alloc(64, 7);
  });
  return clone.serialize({
    requireAllSignatures: true,
    verifySignatures: false,
  });
}

test('Solana error descriptions are fixed, actionable, and privacy-safe', async () => {
  const { describeSolanaError } = await loadTradingModule();

  assert.deepEqual(describeSolanaError({ code: 4001, message: 'User rejected' }), {
    category: 'wallet_rejected',
    message: 'Wallet approval was rejected.',
    retryable: true,
  });
  assert.deepEqual(describeSolanaError(new Error('Blockhash not found')), {
    category: 'blockhash_expired',
    message: 'The transaction review expired. Rebuild and simulate it again.',
    retryable: true,
  });
  assert.equal(
    describeSolanaError(new Error('insufficient funds for fee')).category,
    'insufficient_balance',
  );
  assert.equal(
    describeSolanaError(new Error('custom program error: 0x1771')).category,
    'program_error',
  );
  assert.deepEqual(
    describeSolanaError({
      code: 'PLAN_CHANGED_AFTER_REVIEW',
      message: 'transaction changed',
    }),
    {
      category: 'transaction_review_changed',
      message: 'The transaction no longer matches its simulation. Rebuild the review before signing.',
      retryable: true,
    },
  );
});

test('v0.6.1 conditional quotes apply the current protocol-only fee', async () => {
  const { quoteConditionalAmm } = await loadTradingModule();
  const quote = quoteConditionalAmm({
    amount: '1',
    inputDecimals: 6,
    outputDecimals: 6,
    inputReserves: '1000',
    outputReserves: '2000',
    slippageBps: 100,
  });
  const inputRaw = 1_000_000n;
  const effectiveInput = inputRaw * 9_950n / 10_000n;
  const expectedOutput = effectiveInput * 2_000_000_000n
    / (1_000_000_000n + effectiveInput);

  assert.equal(quote.protocolFeeBps, 50);
  assert.equal(quote.lpFeeBps, 0);
  assert.equal(quote.nominalTotalFeeBps, 50);
  assert.equal(quote.effectiveFeeRaw, 5_000n);
  assert.equal(quote.outputRaw, expectedOutput);
});

test('Manifest exact-in quotes consume the best levels and require a full fill', async () => {
  const {
    quoteManifestOrderbook,
    selectDecisionSwapRoute,
  } = await loadTradingModule();
  const buy = quoteManifestOrderbook({
    amount: '5',
    inputDecimals: 6,
    outputDecimals: 6,
    side: 'buy',
    asks: [
      { tokenPrice: 3, numBaseTokens: 2 },
      { tokenPrice: 2, numBaseTokens: 1 },
    ],
    slippageBps: 100,
  });
  assert.equal(buy.fullFill, true);
  assert.equal(buy.inputConsumedRaw, 5_000_000n);
  assert.equal(buy.outputRaw, 2_000_000n);
  assert.equal(buy.minimumOutputRaw, 1_980_000n);
  assert.equal(buy.levelsUsed, 2);

  const sell = quoteManifestOrderbook({
    amount: '2',
    inputDecimals: 6,
    outputDecimals: 6,
    side: 'sell',
    bids: [
      { tokenPrice: 1.5, numBaseTokens: 2 },
      { tokenPrice: 2, numBaseTokens: 1 },
    ],
    slippageBps: 100,
  });
  assert.equal(sell.fullFill, true);
  assert.equal(sell.outputRaw, 3_500_000n);

  assert.equal(
    selectDecisionSwapRoute({ outputRaw: 1_900_000n }, buy),
    'manifest',
  );
  assert.equal(
    selectDecisionSwapRoute(
      { outputRaw: 1n },
      { ...buy, outputRaw: 10n, fullFill: false },
    ),
    'amm',
  );
});

test('DFlow v0 plans require detached signing and preserve the reviewed message', async () => {
  const {
    buildDflowSpotPlan,
    signReviewedPlan,
    transactionReviewFingerprint,
  } = await loadTradingModule();
  const owner = Keypair.generate();
  const outputMint = Keypair.generate().publicKey;
  const message = new TransactionMessage({
    payerKey: owner.publicKey,
    recentBlockhash: DEFAULT_PUBLIC_KEY.toBase58(),
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  const encoded = Buffer.from(transaction.serialize()).toString('base64');
  const fingerprint = await transactionReviewFingerprint(transaction);
  const payload = {
    cluster: 'solana:mainnet',
    token: 'solo',
    ticker: 'SOLO',
    side: 'buy',
    owner: owner.publicKey.toBase58(),
    transaction: encoded,
    reviewToken: 'verified-dflow-proof',
    quote: {
      inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      outputMint: outputMint.toBase58(),
      amountIn: '1',
      estimatedAmountOut: '2',
      minimumAmountOut: '1.98',
      priceImpactPercent: 0.1,
      slippageBps: 100,
      platformFeeBps: 0,
      route: [{ venue: 'MetaDAO' }],
    },
    review: {
      transactionFingerprint: fingerprint,
      feePayer: owner.publicKey.toBase58(),
      programIds: ['DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH'],
      simulation: { ok: true },
      networkFeeLamports: 5_000,
    },
  };
  const plan = buildDflowSpotPlan(payload, owner.publicKey.toBase58());
  plan.reviewFingerprint = fingerprint;
  const adapter = {
    kind: 'legacy',
    address: owner.publicKey.toBase58(),
    canSignTransaction: true,
    provider: {
      async signTransaction(unsigned) {
        const signed = VersionedTransaction.deserialize(unsigned.serialize());
        signed.sign([owner]);
        return signed;
      },
    },
  };
  const signed = await signReviewedPlan(adapter, plan);
  const decoded = VersionedTransaction.deserialize(
    Buffer.from(signed.signedTransaction, 'base64'),
  );

  assert.deepEqual(
    Buffer.from(decoded.message.serialize()),
    Buffer.from(transaction.message.serialize()),
  );
  assert.equal(Buffer.from(decoded.signatures[0]).every(byte => byte === 0), false);
  await assert.rejects(
    signReviewedPlan({ ...adapter, canSignTransaction: false }, plan),
    /cannot return a signed transaction/,
  );
});

test('signature status polling distinguishes processed, confirmed, and failed states', async () => {
  const { confirmSignature, getSignatureStates } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const responses = [
    {
      value: [{
        slot: 123,
        confirmationStatus: 'processed',
        err: null,
      }],
    },
    {
      value: [{
        slot: 124,
        confirmationStatus: 'confirmed',
        err: null,
      }],
    },
  ];
  connection.getSignatureStatuses = async () => responses.shift();

  const observed = [];
  const confirmation = await confirmSignature(connection, SIGNATURE, {
    pollIntervalMs: 1,
    timeoutMs: 100,
    onStatus(status) {
      observed.push(status.status);
    },
  });
  assert.deepEqual(observed, ['processed', 'confirmed']);
  assert.equal(confirmation.status, 'confirmed');
  assert.equal(confirmation.slot, 124);

  connection.getSignatureStatuses = async () => ({
    value: [{
      slot: 125,
      confirmationStatus: 'confirmed',
      err: { InstructionError: [1, 'Custom'] },
    }],
  });
  const [failed] = await getSignatureStates(connection, [SIGNATURE]);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /InstructionError/);
});

test('an expired review cannot reach a wallet signing method', async () => {
  const {
    sendPlan,
    TRANSACTION_REVIEW_MAX_AGE_MS,
  } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  let signingCalls = 0;
  const adapter = {
    kind: 'legacy',
    address: WALLET_ADDRESS,
    canTransact: true,
    provider: {
      async signTransaction() {
        signingCalls += 1;
      },
    },
  };
  const plan = {
    transaction: new Transaction(),
    builtAt: Date.now() - TRANSACTION_REVIEW_MAX_AGE_MS - 1,
    summary: { feePayer: WALLET_ADDRESS },
  };

  await assert.rejects(
    sendPlan(connection, adapter, plan),
    error => error?.code === 'PLAN_EXPIRED',
  );
  assert.equal(signingCalls, 0);
});

test('wallet signing is bound to the exact transaction bytes that passed simulation', async () => {
  const { sendPlan, simulatePlan } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  connection.simulateTransaction = async () => ({
    value: {
      err: null,
      logs: [],
      unitsConsumed: 12_345,
    },
  });
  let signingCalls = 0;
  const adapter = {
    kind: 'legacy',
    address: WALLET_ADDRESS,
    canTransact: true,
    provider: {
      async signTransaction() {
        signingCalls += 1;
        throw new Error('must not be reached');
      },
    },
  };
  const plan = {
    transaction: reviewableTransaction(),
    builtAt: Date.now(),
    summary: { feePayer: WALLET_ADDRESS },
  };

  const simulation = await simulatePlan(connection, plan);
  assert.equal(simulation.ok, true);
  assert.match(simulation.transactionFingerprint, /^[a-f0-9]{64}$/);
  plan.reviewFingerprint = simulation.transactionFingerprint;
  plan.transaction.add(SystemProgram.transfer({
    fromPubkey: new PublicKey(WALLET_ADDRESS),
    toPubkey: DEFAULT_PUBLIC_KEY,
    lamports: 1,
  }));

  await assert.rejects(
    sendPlan(connection, adapter, plan),
    error => error?.code === 'PLAN_CHANGED_AFTER_REVIEW',
  );
  assert.equal(signingCalls, 0);
});

test('an unreviewed transaction cannot reach a wallet signing method', async () => {
  const { sendPlan } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  let signingCalls = 0;
  const adapter = {
    kind: 'legacy',
    address: WALLET_ADDRESS,
    canTransact: true,
    provider: {
      async signTransaction() {
        signingCalls += 1;
      },
    },
  };
  const plan = {
    transaction: reviewableTransaction(),
    builtAt: Date.now(),
    summary: { feePayer: WALLET_ADDRESS },
  };

  await assert.rejects(
    sendPlan(connection, adapter, plan),
    error => error?.code === 'PLAN_NOT_REVIEWED',
  );
  assert.equal(signingCalls, 0);
});

test('wallet-returned signed bytes must preserve the reviewed transaction message', async () => {
  const { sendPlan, simulatePlan } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  connection.simulateTransaction = async () => ({
    value: { err: null, logs: [], unitsConsumed: 12_345 },
  });
  const plan = {
    transaction: reviewableTransaction(),
    builtAt: Date.now(),
    summary: { feePayer: WALLET_ADDRESS },
  };
  plan.reviewFingerprint = (
    await simulatePlan(connection, plan)
  ).transactionFingerprint;
  const reviewedWire = wireWithPlaceholderSignatures(plan.transaction);
  let sentWire = null;
  connection.sendRawTransaction = async (wire) => {
    sentWire = Buffer.from(wire);
    return SIGNATURE;
  };
  const adapter = {
    kind: 'legacy',
    address: WALLET_ADDRESS,
    canTransact: true,
    provider: {
      async signTransaction() {
        return { serialize: () => reviewedWire };
      },
    },
  };

  const result = await sendPlan(connection, adapter, plan);

  assert.equal(result.signature, SIGNATURE);
  assert.deepEqual(sentWire, reviewedWire);

  const changedTransaction = reviewableTransaction();
  changedTransaction.add(SystemProgram.transfer({
    fromPubkey: new PublicKey(WALLET_ADDRESS),
    toPubkey: DEFAULT_PUBLIC_KEY,
    lamports: 1,
  }));
  const changedWire = wireWithPlaceholderSignatures(changedTransaction);
  adapter.provider.signTransaction = async () => ({
    serialize: () => changedWire,
  });
  sentWire = null;

  await assert.rejects(
    sendPlan(connection, adapter, plan),
    error => error?.code === 'SIGNED_TRANSACTION_CHANGED',
  );
  assert.equal(sentWire, null);
});

test('wallet-standard execution prefers guarded relay submission when signing is available', async () => {
  const { sendPlan, simulatePlan } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  connection.simulateTransaction = async () => ({
    value: { err: null, logs: [], unitsConsumed: 12_345 },
  });
  const plan = {
    transaction: reviewableTransaction(),
    builtAt: Date.now(),
    summary: { feePayer: WALLET_ADDRESS },
  };
  plan.reviewFingerprint = (
    await simulatePlan(connection, plan)
  ).transactionFingerprint;
  const reviewedWire = wireWithPlaceholderSignatures(plan.transaction);
  let signCalls = 0;
  let directSendCalls = 0;
  let relayedWire = null;
  connection.sendRawTransaction = async (wire) => {
    relayedWire = Buffer.from(wire);
    return SIGNATURE;
  };
  const account = {
    address: WALLET_ADDRESS,
    chains: ['solana:mainnet'],
    features: [SolanaSignTransaction, SolanaSignAndSendTransaction],
  };
  const adapter = {
    kind: 'standard',
    address: WALLET_ADDRESS,
    account,
    canTransact: true,
    wallet: {
      features: {
        [SolanaSignTransaction]: {
          async signTransaction() {
            signCalls += 1;
            return [{ signedTransaction: reviewedWire }];
          },
        },
        [SolanaSignAndSendTransaction]: {
          async signAndSendTransaction() {
            directSendCalls += 1;
            return [{ signature: Buffer.alloc(64, 4) }];
          },
        },
      },
    },
  };

  const result = await sendPlan(connection, adapter, plan);

  assert.equal(result.signature, SIGNATURE);
  assert.equal(signCalls, 1);
  assert.equal(directSendCalls, 0);
  assert.deepEqual(relayedWire, reviewedWire);
});

test('spot prediction plan atomically splits underlying USDC before the AMM swap', async () => {
  const { buildConditionalSwapPlan } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const wallet = new PublicKey(WALLET_ADDRESS);
  const quoteMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  let accountRead = 0;
  connection.getMultipleAccountsInfo = async addresses => {
    accountRead += 1;
    if (accountRead === 1) {
      assert.equal(addresses.length, 7);
      return [
        programAccountInfo(OPEN_PROPOSAL_DATA, FUTARCHY_PROGRAM),
        programAccountInfo(OPEN_DAO_DATA, FUTARCHY_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        mintAccountInfo(6),
        mintAccountInfo(6),
      ];
    }
    return [
      tokenAccountInfo({
        mint: quoteMint,
        owner: wallet,
        amount: 1_350_000n,
      }),
      ...addresses.slice(1).map(() => null),
    ];
  };
  connection.getMinimumBalanceForRentExemption = async () => 2_039_280;
  connection.getLatestBlockhash = async () => ({
    blockhash: DEFAULT_PUBLIC_KEY.toBase58(),
    lastValidBlockHeight: 123_456,
  });
  connection.getFeeForMessage = async () => ({ value: 5_000 });

  const plan = await buildConditionalSwapPlan({
    connection,
    walletAddress: WALLET_ADDRESS,
    market: {
      ticker: 'LOYAL',
      daoAddress: 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK',
      baseMint: 'LYLikzBQtpa9ZgVrJsqYGQpR3cC1WMJrBHaXGrQmeta',
      quoteMint: quoteMint.toBase58(),
      baseDecimals: 6,
      quoteDecimals: 6,
      proposal: {
        id: '98zXsz1RtvYw4zHrxaZDdGBU3BgqfsX9XJbXBLSJUBST',
        passBaseMint: '9tedQ632KVkkHXzrqzdSuGxstGKTWwVErseisz4JfY8p',
        passQuoteMint: '8RmJnKKd7HFNwi5xrVsnqUDWf8Pd5JeBkTxdSaf2ERrF',
        failBaseMint: 'HBSnjPDzPwso2rBMZ329BsSyG62fsy3bU9DXmcwopJXM',
        failQuoteMint: '6Lu2ZNJEwLMA9JTnsWBKzuVtEvP2F6NNSaykopnzToZc',
      },
      pass: {
        baseReserves: 1_367_376.244677,
        quoteReserves: 182_832.054249,
      },
      fail: {
        baseReserves: 1_398_355.648171,
        quoteReserves: 178_781.562525,
      },
    },
    outcome: 'pass',
    side: 'buy',
    amount: '0.001',
    slippageBps: 100,
  });

  assert.equal(plan.kind, 'swap');
  assert.equal(plan.summary.amountIn, '0.001 USDC');
  assert.equal(plan.summary.inputMint, quoteMint.toBase58());
  assert.match(plan.summary.estimatedAmountOut, /PASS LOYAL$/);
  assert.equal(plan.summary.accountRentSol, 0.00611784);
  assert.equal(plan.summary.setupRequired, true);
  assert.match(plan.summary.note, /Splits USDC into PASS\/FAIL claims/);
  assert.equal(plan.transaction.instructions.length, 6);
  assert.deepEqual(
    plan.transaction.instructions.slice(-2).map(ix => ix.programId.toBase58()),
    [
      'VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg',
      'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq',
    ],
  );
});

test('spot prediction plans choose a better fully fillable Manifest book', async () => {
  const { buildConditionalSwapPlan } = await loadTradingModule();
  const { ManifestClient } = await import('@cks-systems/manifest-sdk');
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const wallet = new PublicKey(WALLET_ADDRESS);
  const manifestProgram = new PublicKey(
    'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
  );
  const manifestMarket = new PublicKey(
    '9v4GNDfcH8mgkRqtxppvX2J18cgeV9jfsx9MZMAgf1KE',
  );
  const passBaseMint = new PublicKey(
    '9tedQ632KVkkHXzrqzdSuGxstGKTWwVErseisz4JfY8p',
  );
  const passQuoteMint = new PublicKey(
    '8RmJnKKd7HFNwi5xrVsnqUDWf8Pd5JeBkTxdSaf2ERrF',
  );
  const quoteMint = new PublicKey(loyalOpenMarket().quoteMint);
  let accountRead = 0;
  connection.getMultipleAccountsInfo = async addresses => {
    accountRead += 1;
    if (accountRead === 1) {
      return [
        programAccountInfo(OPEN_PROPOSAL_DATA, FUTARCHY_PROGRAM),
        programAccountInfo(OPEN_DAO_DATA, FUTARCHY_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        mintAccountInfo(6),
        mintAccountInfo(6),
      ];
    }
    return [
      tokenAccountInfo({
        mint: quoteMint,
        owner: wallet,
        amount: 1_000_000n,
      }),
      ...addresses.slice(1).map(() => null),
    ];
  };
  connection.getAccountInfo = async address => {
    assert.equal(address.toBase58(), manifestMarket.toBase58());
    return programAccountInfo(Buffer.alloc(80), manifestProgram);
  };
  connection.getMinimumBalanceForRentExemption = async () => 2_039_280;
  connection.getLatestBlockhash = async () => ({
    blockhash: DEFAULT_PUBLIC_KEY.toBase58(),
    lastValidBlockHeight: 123_456,
  });
  connection.getFeeForMessage = async () => ({ value: 5_000 });

  const originalReadClient = ManifestClient.getClientReadOnly;
  ManifestClient.getClientReadOnly = async () => ({
    market: {
      baseMint: () => passBaseMint,
      quoteMint: () => passQuoteMint,
      baseDecimals: () => 6,
      quoteDecimals: () => 6,
      bids: () => [],
      asks: () => [{ tokenPrice: 0.1, numBaseTokens: 100 }],
    },
    swapIx: () => new TransactionInstruction({
      programId: manifestProgram,
      keys: [],
      data: Buffer.from([4]),
    }),
  });
  try {
    const plan = await buildConditionalSwapPlan({
      connection,
      walletAddress: WALLET_ADDRESS,
      market: loyalOpenMarket(),
      marketAddress: manifestMarket.toBase58(),
      expectedBaseMint: passBaseMint.toBase58(),
      expectedQuoteMint: passQuoteMint.toBase58(),
      outcome: 'pass',
      side: 'buy',
      amount: '0.001',
      slippageBps: 100,
    });

    assert.equal(plan.summary.venue, 'Manifest order book');
    assert.equal(plan.quote.fullFill, true);
    assert.equal(plan.quote.outputRaw, 10_000n);
    assert.match(plan.summary.note, /better fully fillable verified Manifest book/);
    assert.equal(
      plan.transaction.instructions.at(-1).programId.toBase58(),
      manifestProgram.toBase58(),
    );
  } finally {
    ManifestClient.getClientReadOnly = originalReadClient;
  }
});

test('Manifest limit orders split only a conditional funding shortfall', async () => {
  const { buildManifestLimitPlan } = await loadTradingModule();
  const { ManifestClient } = await import('@cks-systems/manifest-sdk');
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const wallet = new PublicKey(WALLET_ADDRESS);
  const manifestProgram = new PublicKey(
    'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
  );
  const manifestMarket = new PublicKey(
    '9v4GNDfcH8mgkRqtxppvX2J18cgeV9jfsx9MZMAgf1KE',
  );
  const market = loyalOpenMarket();
  const passBaseMint = new PublicKey(market.proposal.passBaseMint);
  const passQuoteMint = new PublicKey(market.proposal.passQuoteMint);
  const quoteMint = new PublicKey(market.quoteMint);
  let accountRead = 0;
  connection.getMultipleAccountsInfo = async addresses => {
    accountRead += 1;
    if (accountRead === 1) {
      return [
        programAccountInfo(OPEN_PROPOSAL_DATA, FUTARCHY_PROGRAM),
        programAccountInfo(OPEN_DAO_DATA, FUTARCHY_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
        mintAccountInfo(6),
        mintAccountInfo(6),
      ];
    }
    assert.equal(addresses.length, 3);
    return [
      tokenAccountInfo({
        mint: quoteMint,
        owner: wallet,
        amount: 2_000_000n,
      }),
      null,
      null,
    ];
  };
  connection.getAccountInfo = async address => {
    assert.equal(address.toBase58(), manifestMarket.toBase58());
    return programAccountInfo(Buffer.alloc(80), manifestProgram);
  };
  connection.getMinimumBalanceForRentExemption = async () => 2_039_280;
  connection.getLatestBlockhash = async () => ({
    blockhash: DEFAULT_PUBLIC_KEY.toBase58(),
    lastValidBlockHeight: 123_456,
  });
  connection.getFeeForMessage = async () => ({ value: 5_000 });

  const manifestView = {
    baseMint: () => passBaseMint,
    quoteMint: () => passQuoteMint,
    baseDecimals: () => 6,
    quoteDecimals: () => 6,
    getWithdrawableBalanceTokens: () => 0,
  };
  const originals = {
    read: ManifestClient.getClientReadOnly,
    setup: ManifestClient.getSetupIxs,
    client: ManifestClient.getClientForMarketNoPrivateKey,
  };
  ManifestClient.getClientReadOnly = async () => ({ market: manifestView });
  ManifestClient.getSetupIxs = async () => ({
    setupNeeded: false,
    instructions: [],
    wrapperKeypair: null,
  });
  ManifestClient.getClientForMarketNoPrivateKey = async () => ({
    market: manifestView,
    placeOrderWithRequiredDepositIxs: async () => [
      new TransactionInstruction({
        programId: manifestProgram,
        keys: [],
        data: Buffer.from([2]),
      }),
    ],
  });
  try {
    const plan = await buildManifestLimitPlan({
      connection,
      walletAddress: WALLET_ADDRESS,
      market,
      marketAddress: manifestMarket.toBase58(),
      expectedBaseMint: passBaseMint.toBase58(),
      expectedQuoteMint: passQuoteMint.toBase58(),
      outcome: 'pass',
      side: 'buy',
      amount: '2',
      price: '0.25',
      clientOrderId: 42n,
    });

    assert.equal(plan.kind, 'limit');
    assert.equal(plan.summary.conditionalSplitAmount, '0.5');
    assert.equal(plan.summary.accountRentSol, 0.00407856);
    assert.match(plan.summary.note, /Splits only the missing 0.5 USDC/);
    assert.deepEqual(
      plan.transaction.instructions.slice(-2).map(ix => ix.programId.toBase58()),
      [
        CONDITIONAL_VAULT_PROGRAM.toBase58(),
        manifestProgram.toBase58(),
      ],
    );
  } finally {
    ManifestClient.getClientReadOnly = originals.read;
    ManifestClient.getSetupIxs = originals.setup;
    ManifestClient.getClientForMarketNoPrivateKey = originals.client;
  }
});

test('recurring setup plan prices every new account without reading nonexistent vaults', async () => {
  const {
    buildRecurringSchedulePlan,
  } = await loadTradingModule();
  const {
    ManifestClient,
  } = await import('@cks-systems/manifest-sdk');
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const wallet = new PublicKey(WALLET_ADDRESS);
  const recurringProgram = new PublicKey(
    '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh',
  );
  const manifestProgram = new PublicKey(
    'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
  );
  const loaderProgram = new PublicKey(
    'BPFLoaderUpgradeab1e11111111111111111111111',
  );
  const quoteMint = new PublicKey(
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  );
  const passBaseMint = new PublicKey(
    '9tedQ632KVkkHXzrqzdSuGxstGKTWwVErseisz4JfY8p',
  );
  const passQuoteMint = new PublicKey(
    '8RmJnKKd7HFNwi5xrVsnqUDWf8Pd5JeBkTxdSaf2ERrF',
  );
  const manifestMarket = new PublicKey(
    '9v4GNDfcH8mgkRqtxppvX2J18cgeV9jfsx9MZMAgf1KE',
  );
  connection.getMultipleAccountsInfo = async addresses => {
    assert.equal(addresses.length, 17);
    return [
      {
        data: Buffer.alloc(36),
        executable: true,
        lamports: 1_141_440,
        owner: loaderProgram,
        rentEpoch: 0,
      },
      programAccountInfo(OPEN_PROPOSAL_DATA, FUTARCHY_PROGRAM),
      programAccountInfo(OPEN_DAO_DATA, FUTARCHY_PROGRAM),
      programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
      programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
      programAccountInfo(Buffer.alloc(8), CONDITIONAL_VAULT_PROGRAM),
      mintAccountInfo(6),
      mintAccountInfo(6),
      programAccountInfo(Buffer.alloc(80), manifestProgram),
      mintAccountInfo(6),
      mintAccountInfo(6),
      tokenAccountInfo({
        mint: quoteMint,
        owner: wallet,
        amount: 5_000_000n,
      }),
      null,
      null,
      null,
      null,
      null,
    ];
  };
  connection.getMinimumBalanceForRentExemption = async space => (
    space === 356 ? 3_000_000 : 2_000_000
  );
  connection.getLatestBlockhash = async () => ({
    blockhash: DEFAULT_PUBLIC_KEY.toBase58(),
    lastValidBlockHeight: 123_456,
  });
  connection.getFeeForMessage = async () => ({ value: 5_000 });

  const originalManifestLoader =
    ManifestClient.getClientForMarketNoPrivateKey;
  ManifestClient.getClientForMarketNoPrivateKey = async () => ({
    market: {
      baseMint: () => passBaseMint,
      quoteMint: () => passQuoteMint,
    },
  });
  try {
    const plan = await buildRecurringSchedulePlan({
      connection,
      walletAddress: WALLET_ADDRESS,
      recurringProgramId: recurringProgram.toBase58(),
      market: {
        ticker: 'LOYAL',
        daoAddress: 'GxpJkPEsPmuRCCTNnfZaDKg4X3gf4ZPgmqgFqtibaPtK',
        baseMint: 'LYLikzBQtpa9ZgVrJsqYGQpR3cC1WMJrBHaXGrQmeta',
        quoteMint: quoteMint.toBase58(),
        baseDecimals: 6,
        quoteDecimals: 6,
        proposal: {
          id: '98zXsz1RtvYw4zHrxaZDdGBU3BgqfsX9XJbXBLSJUBST',
          endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
      marketAddress: manifestMarket.toBase58(),
      expectedBaseMint: passBaseMint.toBase58(),
      expectedQuoteMint: passQuoteMint.toBase58(),
      outcome: 'pass',
      side: 'buy',
      amountPerCycle: '1',
      totalCycles: 2,
      intervalSeconds: 3_600,
      slippageBps: 100,
      referencePrice: 0.2,
      scheduleId: 92n,
    });

    assert.equal(plan.kind, 'recurring-create');
    assert.equal(plan.summary.accountRentSol, 0.011);
    assert.equal(plan.summary.keeperBudgetSol, 0.0001);
    assert.equal(plan.transaction.instructions.length, 5);
    assert.equal(plan.recurring.totalCycles, 2);
  } finally {
    ManifestClient.getClientForMarketNoPrivateKey = originalManifestLoader;
  }
});

test('recurring price guards use exact integer math for automatic buys and sells', async () => {
  const { calculateRecurringMinimumOutput } = await loadTradingModule();

  assert.equal(calculateRecurringMinimumOutput({
    amountRaw: 100_000_000n,
    baseDecimals: 6,
    quoteDecimals: 6,
    tokenPrice: 2,
    side: 'buy',
    slippageBps: 100,
  }), 49_504_950n);
  assert.equal(calculateRecurringMinimumOutput({
    amountRaw: 10_000_000n,
    baseDecimals: 6,
    quoteDecimals: 6,
    tokenPrice: 2,
    side: 'sell',
    slippageBps: 100,
  }), 19_800_000n);
  assert.throws(
    () => calculateRecurringMinimumOutput({
      amountRaw: 1n,
      baseDecimals: 6,
      quoteDecimals: 6,
      tokenPrice: 2,
      side: 'buy',
      slippageBps: 100,
    }),
    /too small or too large/,
  );
});

test('recurring setup instruction binds schedule PDA, vaults, limits, and keeper budget', async () => {
  const {
    createRecurringClaimInstruction,
    createRecurringInitializeInstruction,
    deriveRecurringScheduleAddresses,
  } = await loadTradingModule();
  const programId = '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh';
  const owner = new PublicKey(WALLET_ADDRESS);
  const proposal = new PublicKey(
    '98zXsz1RtvYw4zHrxaZDdGBU3BgqfsX9XJbXBLSJUBST',
  );
  const market = new PublicKey(
    '9v4GNDfcH8mgkRqtxppvX2J18cgeV9jfsx9MZMAgf1KE',
  );
  const inputMint = new PublicKey(
    '8RmJnKKd7HFNwi5xrVsnqUDWf8Pd5JeBkTxdSaf2ERrF',
  );
  const outputMint = new PublicKey(
    '9tedQ632KVkkHXzrqzdSuGxstGKTWwVErseisz4JfY8p',
  );
  const scheduleId = 77n;
  const derived = deriveRecurringScheduleAddresses({
    programId,
    owner: owner.toBase58(),
    proposal: proposal.toBase58(),
    scheduleId,
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
  });
  const instruction = createRecurringInitializeInstruction({
    programId,
    owner: owner.toBase58(),
    schedule: derived.schedule.toBase58(),
    proposal: proposal.toBase58(),
    market: market.toBase58(),
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    ownerInput: owner.toBase58(),
    inputVault: derived.inputVault.toBase58(),
    outputVault: derived.outputVault.toBase58(),
    scheduleId,
    amountPerCycle: 1_000_000n,
    minimumOutputPerCycle: 900_000n,
    intervalSeconds: 3_600,
    startAt: 100,
    expiresAt: 11_000,
    totalCycles: 4,
    isBaseIn: false,
    keeperFeeLamports: 50_000n,
  });

  assert.equal(instruction.programId.toBase58(), programId);
  assert.equal(instruction.keys.length, 12);
  assert.equal(instruction.keys[0].pubkey.toBase58(), owner.toBase58());
  assert.equal(instruction.keys[0].isSigner, true);
  assert.equal(instruction.keys[1].pubkey.toBase58(), derived.schedule.toBase58());
  assert.equal(instruction.keys[7].pubkey.toBase58(), derived.inputVault.toBase58());
  assert.equal(instruction.keys[8].pubkey.toBase58(), derived.outputVault.toBase58());
  assert.equal(instruction.data.length, 69);
  assert.equal(instruction.data.readBigUInt64LE(8), 77n);
  assert.equal(instruction.data.readBigUInt64LE(16), 1_000_000n);
  assert.equal(instruction.data.readBigUInt64LE(24), 900_000n);
  assert.equal(instruction.data.readBigInt64LE(32), 3_600n);
  assert.equal(instruction.data.readUInt32LE(56), 4);
  assert.equal(instruction.data.readUInt8(60), 0);
  assert.equal(instruction.data.readBigUInt64LE(61), 50_000n);
  assert.ok(Number.isInteger(derived.bump));

  const claimInstruction = createRecurringClaimInstruction({
    programId,
    owner: owner.toBase58(),
    schedule: derived.schedule.toBase58(),
    outputMint: outputMint.toBase58(),
    outputVault: derived.outputVault.toBase58(),
    ownerOutput: owner.toBase58(),
  });
  assert.equal(claimInstruction.keys.length, 6);
  assert.equal(claimInstruction.keys[0].isSigner, true);
  assert.equal(claimInstruction.keys[1].isWritable, true);
  assert.deepEqual([...claimInstruction.data], [
    150, 201, 54, 233, 4, 59, 65, 32,
  ]);
});

test('recurring cancellation review reports vault rent and unused keeper budget refunds', async () => {
  const {
    buildRecurringCancelPlan,
    deriveRecurringScheduleAddresses,
  } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const program = new PublicKey(
    '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh',
  );
  const loaderProgram = new PublicKey(
    'BPFLoaderUpgradeab1e11111111111111111111111',
  );
  const owner = new PublicKey(WALLET_ADDRESS);
  const proposal = new PublicKey(
    '98zXsz1RtvYw4zHrxaZDdGBU3BgqfsX9XJbXBLSJUBST',
  );
  const market = new PublicKey(
    '9v4GNDfcH8mgkRqtxppvX2J18cgeV9jfsx9MZMAgf1KE',
  );
  const baseMint = new PublicKey(
    '9tedQ632KVkkHXzrqzdSuGxstGKTWwVErseisz4JfY8p',
  );
  const quoteMint = new PublicKey(
    '8RmJnKKd7HFNwi5xrVsnqUDWf8Pd5JeBkTxdSaf2ERrF',
  );
  const scheduleId = 93n;
  const derived = deriveRecurringScheduleAddresses({
    programId: program.toBase58(),
    owner: owner.toBase58(),
    proposal: proposal.toBase58(),
    scheduleId,
    inputMint: quoteMint.toBase58(),
    outputMint: baseMint.toBase58(),
  });
  const data = Buffer.alloc(356);
  Buffer.from([46, 46, 9, 80, 131, 138, 250, 135]).copy(data, 0);
  let offset = 8;
  const u8 = value => { data.writeUInt8(value, offset); offset += 1; };
  const key = value => { value.toBuffer().copy(data, offset); offset += 32; };
  const u64 = value => { data.writeBigUInt64LE(BigInt(value), offset); offset += 8; };
  const i64 = value => { data.writeBigInt64LE(BigInt(value), offset); offset += 8; };
  const u32 = value => { data.writeUInt32LE(value, offset); offset += 4; };
  u8(1);
  u8(derived.bump);
  u8(1);
  u8(0);
  key(owner);
  key(proposal);
  key(market);
  key(baseMint);
  key(quoteMint);
  key(derived.inputVault);
  key(derived.outputVault);
  u64(scheduleId);
  u64(1_000_000n);
  u64(900_000n);
  i64(3_600n);
  i64(100n);
  i64(10_000n);
  i64(50n);
  i64(0n);
  u32(4);
  u32(1);
  u64(1_000_000n);
  u64(1_000_000n);
  u64(50_000n);

  let accountRead = 0;
  connection.getMultipleAccountsInfo = async addresses => {
    accountRead += 1;
    if (accountRead === 1) {
      assert.deepEqual(
        addresses.map(address => address.toBase58()),
        [program.toBase58(), derived.schedule.toBase58()],
      );
      return [
        {
          data: Buffer.alloc(36),
          executable: true,
          lamports: 1_141_440,
          owner: loaderProgram,
          rentEpoch: 0,
        },
        {
          ...programAccountInfo(data, program),
          lamports: 3_200_000,
        },
      ];
    }
    return [
      mintAccountInfo(6),
      mintAccountInfo(6),
      {
        ...tokenAccountInfo({
          mint: quoteMint,
          owner: derived.schedule,
          amount: 3_000_000n,
        }),
        lamports: 2_000_000,
      },
      {
        ...tokenAccountInfo({
          mint: baseMint,
          owner: derived.schedule,
          amount: 1_000_000n,
        }),
        lamports: 2_000_000,
      },
      tokenAccountInfo({
        mint: quoteMint,
        owner,
        amount: 0n,
      }),
      tokenAccountInfo({
        mint: baseMint,
        owner,
        amount: 0n,
      }),
    ];
  };
  connection.getMinimumBalanceForRentExemption = async space => (
    space === 356 ? 3_000_000 : 2_000_000
  );
  connection.getLatestBlockhash = async () => ({
    blockhash: DEFAULT_PUBLIC_KEY.toBase58(),
    lastValidBlockHeight: 123_456,
  });
  connection.getFeeForMessage = async () => ({ value: 5_000 });

  const plan = await buildRecurringCancelPlan({
    connection,
    walletAddress: owner.toBase58(),
    recurringProgramId: program.toBase58(),
    scheduleAddress: derived.schedule.toBase58(),
    ticker: 'LOYAL',
    baseDecimals: 6,
    quoteDecimals: 6,
  });

  assert.equal(plan.kind, 'recurring-cancel');
  assert.equal(plan.summary.accountRentRefundSol, 0.007);
  assert.equal(plan.summary.keeperBudgetRefundSol, 0.0002);
  assert.equal(plan.transaction.instructions.length, 4);
});

test('recurring schedule reads verify PDA vaults and return current recoverable balances', async () => {
  const {
    deriveRecurringScheduleAddresses,
    loadRecurringSchedules,
  } = await loadTradingModule();
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const program = new PublicKey(
    '3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh',
  );
  const owner = new PublicKey(WALLET_ADDRESS);
  const proposal = new PublicKey(
    '98zXsz1RtvYw4zHrxaZDdGBU3BgqfsX9XJbXBLSJUBST',
  );
  const market = new PublicKey(
    '9v4GNDfcH8mgkRqtxppvX2J18cgeV9jfsx9MZMAgf1KE',
  );
  const baseMint = new PublicKey(
    '9tedQ632KVkkHXzrqzdSuGxstGKTWwVErseisz4JfY8p',
  );
  const quoteMint = new PublicKey(
    '8RmJnKKd7HFNwi5xrVsnqUDWf8Pd5JeBkTxdSaf2ERrF',
  );
  const scheduleId = 91n;
  const derived = deriveRecurringScheduleAddresses({
    programId: program.toBase58(),
    owner: owner.toBase58(),
    proposal: proposal.toBase58(),
    scheduleId,
    inputMint: quoteMint.toBase58(),
    outputMint: baseMint.toBase58(),
  });
  const data = Buffer.alloc(356);
  Buffer.from([46, 46, 9, 80, 131, 138, 250, 135]).copy(data, 0);
  let offset = 8;
  const u8 = value => { data.writeUInt8(value, offset); offset += 1; };
  const key = value => { value.toBuffer().copy(data, offset); offset += 32; };
  const u64 = value => { data.writeBigUInt64LE(BigInt(value), offset); offset += 8; };
  const i64 = value => { data.writeBigInt64LE(BigInt(value), offset); offset += 8; };
  const u32 = value => { data.writeUInt32LE(value, offset); offset += 4; };
  u8(1);
  u8(derived.bump);
  u8(1);
  u8(0);
  key(owner);
  key(proposal);
  key(market);
  key(baseMint);
  key(quoteMint);
  key(derived.inputVault);
  key(derived.outputVault);
  u64(scheduleId);
  u64(10_000_000n);
  u64(9_000_000n);
  i64(3_600n);
  i64(100n);
  i64(10_000n);
  i64(50n);
  i64(0n);
  u32(4);
  u32(1);
  u64(10_000_000n);
  u64(9_100_000n);
  u64(50_000n);
  assert.equal(offset, 332);

  connection.getProgramAccounts = async (programId, config) => {
    assert.equal(programId.toBase58(), program.toBase58());
    assert.deepEqual(config.filters, [
      { memcmp: { offset: 12, bytes: owner.toBase58() } },
      { memcmp: { offset: 44, bytes: proposal.toBase58() } },
    ]);
    return [{
      pubkey: derived.schedule,
      account: programAccountInfo(data, program),
    }];
  };
  connection.getMultipleAccountsInfo = async (addresses) => {
    assert.deepEqual(
      addresses.map(address => address.toBase58()),
      [derived.inputVault.toBase58(), derived.outputVault.toBase58()],
    );
    return [
      tokenAccountInfo({
        mint: quoteMint,
        owner: derived.schedule,
        amount: 30_000_000n,
      }),
      tokenAccountInfo({
        mint: baseMint,
        owner: derived.schedule,
        amount: 9_100_000n,
      }),
    ];
  };

  const schedules = await loadRecurringSchedules({
    connection,
    recurringProgramId: program.toBase58(),
    owner: owner.toBase58(),
    proposal: proposal.toBase58(),
  });

  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].side, 'buy');
  assert.equal(schedules[0].unspentInputRaw, '30000000');
  assert.equal(schedules[0].unclaimedOutputRaw, '9100000');
});
