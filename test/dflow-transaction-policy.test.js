import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  DFLOW_POLICY_PROGRAM_ID,
  decodeAndValidateDflowSwap,
  loadAndValidateDflowProgramIntegrity,
  loadAndValidateTradeAccountState,
  validateComputeBudgetPolicy,
  validateDflowProgramIntegrityAccounts,
  validateDflowSwapAccounts,
  validateSimulatedTradeEffects,
} from '../api/_lib/dflow-transaction-policy.js';

const BPF_UPGRADEABLE_LOADER_ID = new PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111',
);
const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
const METEORA_DAMM_V2_PROGRAM_ID = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';
const METEORA_DLMM_PROGRAM_ID = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
const SWAP_DISCRIMINATOR = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);
const SWAP2_DISCRIMINATOR = Buffer.from([65, 75, 63, 76, 235, 91, 91, 136]);
const IDL_ACCOUNT_DISCRIMINATOR = Buffer.from('184662bf3a907b9e', 'hex');

function randomAddress() {
  return Keypair.generate().publicKey.toBase58();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function anchorDiscriminator(name) {
  return crypto
    .createHash('sha256')
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

function assertPolicyRejection(operation, pattern) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, 'INVALID_DFLOW_TRANSACTION');
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

function tradeAction({
  amount = 1_000_000n,
  flags = 0x80,
  tag = 20,
} = {}) {
  const data = Buffer.alloc(10);
  data.writeUInt8(tag, 0);
  data.writeBigUInt64LE(amount, 1);
  data.writeUInt8(flags, 9);
  return data;
}

function dlmmTradeAction({
  amount = 1_000_000n,
  flags = 0x01,
  numBinArrays = 1,
} = {}) {
  const data = Buffer.alloc(11);
  data.writeUInt8(4, 0);
  data.writeBigUInt64LE(amount, 1);
  data.writeUInt8(numBinArrays, 9);
  data.writeUInt8(flags, 10);
  return data;
}

function guardAction({
  count = 1,
  minimumOutput = 1_980_000n,
} = {}) {
  const data = Buffer.alloc(13);
  data.writeUInt8(48, 0);
  data.writeUInt32LE(count, 1);
  data.writeBigUInt64LE(minimumOutput, 5);
  return data;
}

function metadataAction() {
  return Buffer.concat([Buffer.from([37]), Buffer.alloc(76, 7)]);
}

function setupAction() {
  return Buffer.from([60]);
}

function buildSwapData({
  actions = [tradeAction()],
  discriminator = SWAP_DISCRIMINATOR,
  outAmount = 2_000_000n,
  platformFeeBps = 0,
  positiveSlippageFeeLimitPercent = 0,
  slippageBps = 100,
  trailing = Buffer.alloc(0),
} = {}) {
  const header = Buffer.alloc(12);
  Buffer.from(discriminator).copy(header, 0);
  header.writeUInt32LE(actions.length, 8);
  const tail = Buffer.alloc(
    Buffer.from(discriminator).equals(SWAP2_DISCRIMINATOR) ? 13 : 12,
  );
  tail.writeBigUInt64LE(outAmount, 0);
  tail.writeUInt16LE(slippageBps, 8);
  tail.writeUInt16LE(platformFeeBps, 10);
  if (tail.length === 13) {
    tail.writeUInt8(positiveSlippageFeeLimitPercent, 12);
  }
  return Buffer.concat([header, ...actions, tail, trailing]);
}

function economicQuote(overrides = {}) {
  return {
    computeUnitLimit: 200_000,
    computeUnitPriceMicroLamports: 5_000,
    inAmount: '1000000',
    minimumAmountOut: '1980000',
    outAmount: '2000000',
    prioritizationFeeLamports: 1_000,
    route: [{ venue: 'Meteora DAMM v2' }],
    slippageBps: 100,
    ...overrides,
  };
}

test('strict DFlow swap decoder binds the reviewed economics and route action', () => {
  assert.deepEqual(
    decodeAndValidateDflowSwap(buildSwapData(), economicQuote()),
    {
      actionNames: ['MeteoraDammV2Swap'],
      initializesOutputAta: false,
      requiredProgram: METEORA_DAMM_V2_PROGRAM_ID,
      tradeAction: 'MeteoraDammV2Swap',
    },
  );

  assert.deepEqual(
    decodeAndValidateDflowSwap(
      buildSwapData({
        actions: [
          setupAction(),
          metadataAction(),
          guardAction(),
          tradeAction(),
        ],
      }),
      economicQuote(),
    ),
    {
      actionNames: [
        'InitAtaIdempotent',
        'RecordId',
        'SetMinimumLegOutputs',
        'MeteoraDammV2Swap',
      ],
      initializesOutputAta: true,
      requiredProgram: METEORA_DAMM_V2_PROGRAM_ID,
      tradeAction: 'MeteoraDammV2Swap',
    },
  );

  assert.equal(
    decodeAndValidateDflowSwap(
      buildSwapData({ discriminator: SWAP2_DISCRIMINATOR }),
      economicQuote(),
    ).tradeAction,
    'MeteoraDammV2Swap',
  );
});

test('strict DFlow swap decoder accepts only the observed direct Meteora DLMM profile', () => {
  assert.deepEqual(
    decodeAndValidateDflowSwap(
      buildSwapData({
        actions: [metadataAction(), dlmmTradeAction()],
      }),
      economicQuote({ route: [{ venue: 'Meteora DLMM' }] }),
    ),
    {
      actionNames: ['RecordId', 'MeteoraDlmmSwap'],
      initializesOutputAta: true,
      requiredProgram: METEORA_DLMM_PROGRAM_ID,
      tradeAction: 'MeteoraDlmmSwap',
    },
  );

  for (const action of [
    dlmmTradeAction({ amount: 999_999n }),
    dlmmTradeAction({ flags: 0 }),
    dlmmTradeAction({ flags: 0x80 }),
    dlmmTradeAction({ numBinArrays: 0 }),
    dlmmTradeAction({ numBinArrays: 2 }),
  ]) {
    assertPolicyRejection(
      () => decodeAndValidateDflowSwap(
        buildSwapData({ actions: [metadataAction(), action] }),
        economicQuote({ route: [{ venue: 'Meteora DLMM' }] }),
      ),
      /economics/,
    );
  }
});

test('DFlow swap decoder rejects unknown and destination-bearing instructions', () => {
  for (const discriminator of [
    Buffer.alloc(8, 0xff),
    anchorDiscriminator('swap_with_destination'),
    anchorDiscriminator('swap2_with_destination'),
  ]) {
    assertPolicyRejection(
      () => decodeAndValidateDflowSwap(
        buildSwapData({ discriminator }),
        economicQuote(),
      ),
      /wallet-bound swap/,
    );
  }
});

test('DFlow swap decoder rejects every altered economic field', () => {
  const mutations = [
    { actions: [tradeAction({ amount: 999_999n })] },
    { outAmount: 1_999_999n },
    { slippageBps: 99 },
    { platformFeeBps: 1 },
    {
      discriminator: SWAP2_DISCRIMINATOR,
      positiveSlippageFeeLimitPercent: 1,
    },
  ];
  for (const mutation of mutations) {
    assertPolicyRejection(
      () => decodeAndValidateDflowSwap(buildSwapData(mutation), economicQuote()),
      /economics/,
    );
  }
});

test('DFlow swap decoder rejects unknown, ambiguous, malformed, or extended actions', () => {
  const invalidData = [
    buildSwapData({ actions: [Buffer.from([255])] }),
    buildSwapData({ actions: [tradeAction({ tag: 39 })] }),
    buildSwapData({ actions: [tradeAction({ tag: 55 })] }),
    buildSwapData({ actions: [tradeAction({ tag: 56 })] }),
    buildSwapData({ trailing: Buffer.from([0]) }),
    buildSwapData({
      actions: [
        tradeAction(),
        tradeAction({ tag: 39 }),
      ],
    }),
    buildSwapData({ actions: [tradeAction({ flags: 0 })] }),
    buildSwapData({
      actions: [
        tradeAction(),
        guardAction({ minimumOutput: 1_979_999n }),
      ],
    }),
    buildSwapData({
      actions: [
        tradeAction(),
        guardAction({ count: 2 }),
      ],
    }),
    buildSwapData({
      actions: [
        tradeAction(),
        guardAction(),
        guardAction(),
      ],
    }),
    buildSwapData({
      actions: [
        tradeAction(),
        metadataAction(),
        metadataAction(),
      ],
    }),
    buildSwapData({
      actions: [
        tradeAction(),
        setupAction(),
        setupAction(),
      ],
    }),
    buildSwapData({ actions: [] }),
    buildSwapData({ actions: Array.from({ length: 17 }, () => setupAction()) }),
    buildSwapData().subarray(0, 15),
  ];
  for (const data of invalidData) {
    assertPolicyRejection(
      () => decodeAndValidateDflowSwap(data, economicQuote()),
    );
  }
});

function computeInstruction(tag, value, length) {
  const data = Buffer.alloc(length);
  data.writeUInt8(tag, 0);
  if (tag === 2 && length >= 5) data.writeUInt32LE(Number(value), 1);
  if (tag === 3 && length >= 9) data.writeBigUInt64LE(BigInt(value), 1);
  return { accountKeyIndexes: [], data };
}

function computeFixture(overrides = {}) {
  return {
    instructions: [
      computeInstruction(2, 200_000, 5),
      computeInstruction(3, 5_000, 9),
      { accountKeyIndexes: [], data: Buffer.alloc(0) },
    ],
    programIds: [
      COMPUTE_BUDGET_PROGRAM_ID,
      COMPUTE_BUDGET_PROGRAM_ID,
      DFLOW_POLICY_PROGRAM_ID,
    ],
    quote: economicQuote(),
    ...overrides,
  };
}

test('compute-budget policy accepts the exact signed fee fields', () => {
  assert.equal(validateComputeBudgetPolicy(computeFixture()), undefined);
});

test('compute-budget policy rejects instruction count, order, tags, lengths, and accounts', () => {
  const mutations = [
    (fixture) => fixture.instructions.pop(),
    (fixture) => fixture.instructions.push({ accountKeyIndexes: [], data: Buffer.alloc(0) }),
    (fixture) => fixture.programIds.reverse(),
    (fixture) => { fixture.programIds[1] = DFLOW_POLICY_PROGRAM_ID; },
    (fixture) => { fixture.instructions[0] = computeInstruction(3, 5_000, 9); },
    (fixture) => { fixture.instructions[1] = computeInstruction(2, 200_000, 5); },
    (fixture) => { fixture.instructions[0] = computeInstruction(2, 200_000, 6); },
    (fixture) => { fixture.instructions[1] = computeInstruction(3, 5_000, 10); },
    (fixture) => { fixture.instructions[0].accountKeyIndexes = [1]; },
    (fixture) => { fixture.instructions[1].accountKeyIndexes = [1]; },
  ];
  for (const mutate of mutations) {
    const fixture = computeFixture();
    mutate(fixture);
    assertPolicyRejection(
      () => validateComputeBudgetPolicy(fixture),
    );
  }
});

test('compute-budget policy rejects altered limits, prices, fees, and caps', () => {
  const mutations = [
    (fixture) => { fixture.instructions[0] = computeInstruction(2, 199_999, 5); },
    (fixture) => { fixture.instructions[0] = computeInstruction(2, 1_400_001, 5); },
    (fixture) => { fixture.instructions[1] = computeInstruction(3, 4_999, 9); },
    (fixture) => { fixture.quote.prioritizationFeeLamports = 999; },
    (fixture) => {
      fixture.instructions[0] = computeInstruction(2, 1_400_000, 5);
      fixture.instructions[1] = computeInstruction(3, 1_000_001, 9);
      fixture.quote.computeUnitLimit = 1_400_000;
      fixture.quote.computeUnitPriceMicroLamports = 1_000_001;
      fixture.quote.prioritizationFeeLamports = 1_400_002;
    },
    (fixture) => { fixture.quote.computeUnitLimit = 0; },
    (fixture) => { fixture.quote.computeUnitPriceMicroLamports = 0; },
  ];
  for (const mutate of mutations) {
    const fixture = computeFixture();
    mutate(fixture);
    assertPolicyRejection(
      () => validateComputeBudgetPolicy(fixture),
      /reviewed fee/,
    );
  }
});

function swapAccountFixture() {
  const owner = Keypair.generate().publicKey;
  const inputMint = Keypair.generate().publicKey;
  const outputMint = Keypair.generate().publicKey;
  const market = Keypair.generate().publicKey;
  const dflowProgram = new PublicKey(DFLOW_POLICY_PROGRAM_ID);
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    dflowProgram,
  );
  const inputTokenAccount = getAssociatedTokenAddressSync(inputMint, owner);
  const outputTokenAccount = getAssociatedTokenAddressSync(outputMint, owner);
  const keys = [
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    SystemProgram.programId,
    owner,
    eventAuthority,
    dflowProgram,
    inputTokenAccount,
    outputTokenAccount,
    inputMint,
    outputMint,
    market,
    new PublicKey(METEORA_DAMM_V2_PROGRAM_ID),
  ];
  const signerIndexes = new Set([3]);
  const writableIndexes = new Set([3, 6, 7, 10]);
  return {
    accountKeys: {
      get(index) {
        return keys[index] || null;
      },
    },
    keys,
    message: {
      isAccountSigner(index) {
        return signerIndexes.has(index);
      },
      isAccountWritable(index) {
        return writableIndexes.has(index);
      },
    },
    owner: owner.toBase58(),
    quote: {
      inputMint: inputMint.toBase58(),
      outputMint: outputMint.toBase58(),
      route: [{ marketKey: market.toBase58() }],
    },
    signerIndexes,
    swapInstruction: {
      accountKeyIndexes: keys.map((_, index) => index),
    },
    swapPolicy: {
      initializesOutputAta: false,
      requiredProgram: METEORA_DAMM_V2_PROGRAM_ID,
    },
    writableIndexes,
  };
}

test('swap-account policy accepts the exact fixed accounts, wallet ATAs, mints, and route', () => {
  const fixture = swapAccountFixture();
  const result = validateDflowSwapAccounts(fixture);
  assert.equal(
    result.inputTokenAccount.toBase58(),
    fixture.keys[6].toBase58(),
  );
  assert.equal(
    result.outputTokenAccount.toBase58(),
    fixture.keys[7].toBase58(),
  );
  assert.deepEqual(
    result.instructionAddresses,
    fixture.keys.map(key => key.toBase58()),
  );

  fixture.swapInstruction.accountKeyIndexes.push(3);
  assert.equal(
    validateDflowSwapAccounts(fixture).instructionAddresses.at(-1),
    fixture.owner,
  );
});

test('swap-account policy allows one read-only Token-2022 compatibility program only', () => {
  const fixture = swapAccountFixture();
  fixture.keys.push(TOKEN_2022_PROGRAM_ID);
  fixture.swapInstruction.accountKeyIndexes.push(fixture.keys.length - 1);
  const result = validateDflowSwapAccounts(fixture);
  assert.ok(result.allowedExecutablePrograms.includes(TOKEN_2022_PROGRAM_ID.toBase58()));

  for (const mutate of [
    value => value.writableIndexes.add(value.keys.length - 1),
    value => value.signerIndexes.add(value.keys.length - 1),
    value => {
      value.keys.push(TOKEN_2022_PROGRAM_ID);
      value.swapInstruction.accountKeyIndexes.push(value.keys.length - 1);
    },
  ]) {
    const invalid = swapAccountFixture();
    invalid.keys.push(TOKEN_2022_PROGRAM_ID);
    invalid.swapInstruction.accountKeyIndexes.push(invalid.keys.length - 1);
    mutate(invalid);
    assertPolicyRejection(
      () => validateDflowSwapAccounts(invalid),
      /Token-2022|ambiguous/,
    );
  }
});

test('swap-account policy allows one read-only instructions sysvar only', () => {
  const fixture = swapAccountFixture();
  const sysvarInstructions = new PublicKey(
    'Sysvar1nstructions1111111111111111111111111',
  );
  fixture.keys.push(sysvarInstructions);
  fixture.swapInstruction.accountKeyIndexes.push(fixture.keys.length - 1);
  const result = validateDflowSwapAccounts(fixture);
  assert.deepEqual(result.allowedVirtualAccounts, [sysvarInstructions.toBase58()]);

  for (const mutate of [
    value => value.writableIndexes.add(value.keys.length - 1),
    value => value.signerIndexes.add(value.keys.length - 1),
    value => {
      value.keys.push(sysvarInstructions);
      value.swapInstruction.accountKeyIndexes.push(value.keys.length - 1);
    },
  ]) {
    const invalid = swapAccountFixture();
    invalid.keys.push(sysvarInstructions);
    invalid.swapInstruction.accountKeyIndexes.push(invalid.keys.length - 1);
    mutate(invalid);
    assertPolicyRejection(
      () => validateDflowSwapAccounts(invalid),
      /sysvar|ambiguous/,
    );
  }
});

test('swap-account policy rejects altered fixed, owner, ATA, mint, market, and venue accounts', () => {
  const mutations = [
    (fixture) => { fixture.keys[0] = Keypair.generate().publicKey; },
    (fixture) => { fixture.keys[4] = Keypair.generate().publicKey; },
    (fixture) => { fixture.keys[5] = Keypair.generate().publicKey; },
    (fixture) => { fixture.keys[6] = Keypair.generate().publicKey; },
    (fixture) => { fixture.keys[7] = Keypair.generate().publicKey; },
    (fixture) => { fixture.keys[8] = Keypair.generate().publicKey; },
    (fixture) => { fixture.keys[9] = Keypair.generate().publicKey; },
    (fixture) => { fixture.keys[10] = Keypair.generate().publicKey; },
    (fixture) => { fixture.keys[11] = Keypair.generate().publicKey; },
    (fixture) => { fixture.owner = randomAddress(); },
    (fixture) => { fixture.quote.route = []; },
    (fixture) => { fixture.swapPolicy.requiredProgram = randomAddress(); },
    (fixture) => { fixture.swapInstruction.accountKeyIndexes = fixture.keys.slice(0, 10).map((_, index) => index); },
    (fixture) => { fixture.keys[11] = null; },
  ];
  for (const mutate of mutations) {
    const fixture = swapAccountFixture();
    mutate(fixture);
    assertPolicyRejection(
      () => validateDflowSwapAccounts(fixture),
    );
  }
});

test('swap-account policy rejects elevated or missing signer/writable privileges', () => {
  const mutations = [
    (fixture) => { fixture.signerIndexes.delete(3); },
    (fixture) => { fixture.writableIndexes.delete(3); },
    (fixture) => { fixture.signerIndexes.add(0); },
    (fixture) => { fixture.signerIndexes.add(10); },
    (fixture) => { fixture.writableIndexes.add(0); },
    (fixture) => { fixture.writableIndexes.add(4); },
    (fixture) => { fixture.writableIndexes.delete(6); },
    (fixture) => { fixture.writableIndexes.delete(7); },
    (fixture) => { fixture.writableIndexes.add(8); },
    (fixture) => { fixture.writableIndexes.add(9); },
  ];
  for (const mutate of mutations) {
    const fixture = swapAccountFixture();
    mutate(fixture);
    assertPolicyRejection(
      () => validateDflowSwapAccounts(fixture),
      /privileges|sign/,
    );
  }
});

function encodeTokenAccount(mint, owner, amount, {
  closeAuthority = null,
  delegate = null,
  delegatedAmount = 0n,
  isNative = 0n,
  isNativeOption = 0,
  state = 1,
} = {}) {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({
    amount: BigInt(amount),
    closeAuthority: closeAuthority ? new PublicKey(closeAuthority) : PublicKey.default,
    closeAuthorityOption: closeAuthority ? 1 : 0,
    delegate: delegate ? new PublicKey(delegate) : PublicKey.default,
    delegatedAmount,
    delegateOption: delegate ? 1 : 0,
    isNative,
    isNativeOption,
    mint: new PublicKey(mint),
    owner: new PublicKey(owner),
    state,
  }, data);
  return data;
}

function simulatedTokenAccount(mint, owner, amount, overrides = {}, controls) {
  return {
    data: [encodeTokenAccount(mint, owner, amount, controls).toString('base64'), 'base64'],
    executable: false,
    lamports: 2_039_280,
    owner: TOKEN_PROGRAM_ID.toBase58(),
    rentEpoch: 0,
    ...overrides,
  };
}

const NETWORK_FEE_LAMPORTS = 5_000;
const OWNER_LAMPORTS = 1_000_000_000;

function simulatedSystemAccount(lamports = OWNER_LAMPORTS - NETWORK_FEE_LAMPORTS) {
  return {
    data: ['', 'base64'],
    executable: false,
    lamports,
    owner: SystemProgram.programId.toBase58(),
    rentEpoch: 0,
  };
}

function simulationFixture() {
  const owner = randomAddress();
  const inputMint = randomAddress();
  const outputMint = randomAddress();
  const inputTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(inputMint),
    new PublicKey(owner),
  ).toBase58();
  const outputTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(outputMint),
    new PublicKey(owner),
  ).toBase58();
  return {
    owner,
    quote: {
      inAmount: '1000000',
      inputMint,
      minimumAmountOut: '1980000',
      outputMint,
    },
    simulationValue: {
      accounts: [
        simulatedTokenAccount(inputMint, owner, 9_000_000n),
        simulatedTokenAccount(outputMint, owner, 9_000_000n),
        simulatedSystemAccount(),
      ],
    },
    tradeState: {
      inputAccountLamports: 2_039_280,
      inputAmount: 10_000_000n,
      inputControlState: {
        closeAuthority: null,
        delegate: null,
        delegatedAmount: 0n,
      },
      inputTokenAccount,
      ownerAddress: owner,
      ownerLamports: OWNER_LAMPORTS,
      outputAmount: 7_000_000n,
      outputAccountExists: true,
      outputAccountLamports: 2_039_280,
      outputControlState: {
        closeAuthority: null,
        delegate: null,
        delegatedAmount: 0n,
      },
      outputTokenAccount,
    },
  };
}

test('simulated trade effects require exact spend and at least the reviewed output', () => {
  const fixture = simulationFixture();
  assert.deepEqual(
    validateSimulatedTradeEffects(
      fixture.simulationValue,
      fixture.tradeState,
      fixture.quote,
      fixture.owner,
      NETWORK_FEE_LAMPORTS,
    ),
    {
      inputAmountSpent: '1000000',
      minimumAmountReceived: '2000000',
      outputAtaRentLamports: 0,
      ownerDebitLamports: NETWORK_FEE_LAMPORTS,
    },
  );

  fixture.tradeState.inputAmount = 1_000_000n;
  fixture.simulationValue.accounts[0] = null;
  assertPolicyRejection(
    () => validateSimulatedTradeEffects(
      fixture.simulationValue,
      fixture.tradeState,
      fixture.quote,
      fixture.owner,
      NETWORK_FEE_LAMPORTS,
    ),
    /closed/,
  );
});

test('simulated trade effects reject input under-spend, over-spend, and insufficient output', () => {
  for (const mutate of [
    (fixture) => {
      fixture.simulationValue.accounts[0] = simulatedTokenAccount(
        fixture.quote.inputMint,
        fixture.owner,
        9_500_000n,
      );
    },
    (fixture) => {
      fixture.simulationValue.accounts[0] = simulatedTokenAccount(
        fixture.quote.inputMint,
        fixture.owner,
        8_500_000n,
      );
    },
    (fixture) => {
      fixture.simulationValue.accounts[1] = simulatedTokenAccount(
        fixture.quote.outputMint,
        fixture.owner,
        8_979_999n,
      );
    },
    (fixture) => {
      fixture.simulationValue.accounts[1] = simulatedTokenAccount(
        fixture.quote.outputMint,
        fixture.owner,
        6_999_999n,
      );
    },
  ]) {
    const fixture = simulationFixture();
    mutate(fixture);
    assertPolicyRejection(() => validateSimulatedTradeEffects(
      fixture.simulationValue,
      fixture.tradeState,
      fixture.quote,
      fixture.owner,
      NETWORK_FEE_LAMPORTS,
    ));
  }
});

test('simulated trade effects reject wrong mint, owner, token program, null, and malformed state', () => {
  const mutations = [
    (fixture) => {
      fixture.simulationValue.accounts[0] = simulatedTokenAccount(
        randomAddress(),
        fixture.owner,
        9_000_000n,
      );
    },
    (fixture) => {
      fixture.simulationValue.accounts[0] = simulatedTokenAccount(
        fixture.quote.inputMint,
        randomAddress(),
        9_000_000n,
      );
    },
    (fixture) => {
      fixture.simulationValue.accounts[1] = simulatedTokenAccount(
        randomAddress(),
        fixture.owner,
        9_000_000n,
      );
    },
    (fixture) => {
      fixture.simulationValue.accounts[1] = simulatedTokenAccount(
        fixture.quote.outputMint,
        randomAddress(),
        9_000_000n,
      );
    },
    (fixture) => {
      fixture.simulationValue.accounts[0].owner = SystemProgram.programId.toBase58();
    },
    (fixture) => { fixture.simulationValue.accounts[1] = null; },
    (fixture) => { fixture.simulationValue.accounts = [fixture.simulationValue.accounts[0]]; },
    (fixture) => { fixture.simulationValue.accounts[0].data = ['not base64']; },
    (fixture) => { fixture.simulationValue.accounts[0].owner = 'invalid'; },
    (fixture) => {
      fixture.simulationValue.accounts[0].data = [
        Buffer.alloc(8).toString('base64'),
        'base64',
      ];
    },
  ];
  for (const mutate of mutations) {
    const fixture = simulationFixture();
    mutate(fixture);
    assertPolicyRejection(() => validateSimulatedTradeEffects(
      fixture.simulationValue,
      fixture.tradeState,
      fixture.quote,
      fixture.owner,
      NETWORK_FEE_LAMPORTS,
    ));
  }
});

test('simulated trade effects reject changed token delegates and close authorities', () => {
  const mutations = [
    (fixture) => {
      fixture.simulationValue.accounts[0] = simulatedTokenAccount(
        fixture.quote.inputMint,
        fixture.owner,
        9_000_000n,
        {},
        { delegate: randomAddress(), delegatedAmount: 1n },
      );
    },
    (fixture) => {
      fixture.simulationValue.accounts[1] = simulatedTokenAccount(
        fixture.quote.outputMint,
        fixture.owner,
        9_000_000n,
        {},
        { closeAuthority: randomAddress() },
      );
    },
    (fixture) => {
      fixture.tradeState.inputControlState = {
        closeAuthority: null,
        delegate: randomAddress(),
        delegatedAmount: 2n,
      };
      fixture.simulationValue.accounts[0] = simulatedTokenAccount(
        fixture.quote.inputMint,
        fixture.owner,
        9_000_000n,
        {},
        {
          delegate: fixture.tradeState.inputControlState.delegate,
          delegatedAmount: 3n,
        },
      );
    },
  ];
  for (const mutate of mutations) {
    const fixture = simulationFixture();
    mutate(fixture);
    assertPolicyRejection(() => validateSimulatedTradeEffects(
      fixture.simulationValue,
      fixture.tradeState,
      fixture.quote,
      fixture.owner,
      NETWORK_FEE_LAMPORTS,
    ), /changed the reviewed .* token account/);
  }
});

test('simulated trade effects bind wallet SOL debit to the fee and bounded ATA rent', () => {
  const excessiveDebit = simulationFixture();
  excessiveDebit.simulationValue.accounts[2] = simulatedSystemAccount(
    OWNER_LAMPORTS - NETWORK_FEE_LAMPORTS - 1,
  );
  assertPolicyRejection(() => validateSimulatedTradeEffects(
    excessiveDebit.simulationValue,
    excessiveDebit.tradeState,
    excessiveDebit.quote,
    excessiveDebit.owner,
    NETWORK_FEE_LAMPORTS,
  ), /SOL changes/);

  const ataCreation = simulationFixture();
  ataCreation.tradeState.outputAccountExists = false;
  ataCreation.tradeState.outputAmount = 0n;
  const ataRent = ataCreation.simulationValue.accounts[1].lamports;
  ataCreation.simulationValue.accounts[1] = simulatedTokenAccount(
    ataCreation.quote.outputMint,
    ataCreation.owner,
    2_000_000n,
  );
  ataCreation.simulationValue.accounts[2] = simulatedSystemAccount(
    OWNER_LAMPORTS - NETWORK_FEE_LAMPORTS - ataRent,
  );
  assert.equal(
    validateSimulatedTradeEffects(
      ataCreation.simulationValue,
      ataCreation.tradeState,
      ataCreation.quote,
      ataCreation.owner,
      NETWORK_FEE_LAMPORTS,
    ).minimumAmountReceived,
    '2000000',
  );

  const excessiveRent = simulationFixture();
  excessiveRent.tradeState.outputAccountExists = false;
  excessiveRent.tradeState.outputAmount = 0n;
  excessiveRent.simulationValue.accounts[1] = simulatedTokenAccount(
    excessiveRent.quote.outputMint,
    excessiveRent.owner,
    2_000_000n,
    { lamports: 10_000_001 },
  );
  assertPolicyRejection(() => validateSimulatedTradeEffects(
    excessiveRent.simulationValue,
    excessiveRent.tradeState,
    excessiveRent.quote,
    excessiveRent.owner,
    NETWORK_FEE_LAMPORTS,
  ), /token changes|SOL changes/);
});

test('simulated trade effects reject malformed fee-payer state and unverifiable fees', () => {
  const mutations = [
    (fixture) => { fixture.simulationValue.accounts[2] = null; },
    (fixture) => { fixture.simulationValue.accounts[2].owner = TOKEN_PROGRAM_ID.toBase58(); },
    (fixture) => { fixture.simulationValue.accounts[2].executable = true; },
    (fixture) => {
      fixture.simulationValue.accounts[2].data = [
        Buffer.from([1]).toString('base64'),
        'base64',
      ];
    },
    (fixture) => { fixture.simulationValue.accounts[2].lamports = -1; },
    (fixture) => { fixture.tradeState.ownerAddress = randomAddress(); },
    (fixture) => { fixture.tradeState.ownerLamports = Number.MAX_SAFE_INTEGER + 1; },
  ];
  for (const mutate of mutations) {
    const fixture = simulationFixture();
    mutate(fixture);
    assertPolicyRejection(() => validateSimulatedTradeEffects(
      fixture.simulationValue,
      fixture.tradeState,
      fixture.quote,
      fixture.owner,
      NETWORK_FEE_LAMPORTS,
    ));
  }

  const fixture = simulationFixture();
  assertPolicyRejection(() => validateSimulatedTradeEffects(
    fixture.simulationValue,
    fixture.tradeState,
    fixture.quote,
    fixture.owner,
    null,
  ));
});

function programIntegrityFixture() {
  const programDataAddress = Keypair.generate().publicKey;
  const upgradeAuthority = Keypair.generate().publicKey;
  const idlAuthority = Keypair.generate().publicKey;
  const deploymentSlot = 432_100_000n;
  const decodedIdl = Buffer.from(JSON.stringify({
    instructions: [{ name: 'swap' }],
    name: 'synthetic-dflow-policy',
    version: '1.0.0',
  }));
  const compressedIdl = deflateSync(decodedIdl);

  const programData = Buffer.alloc(36);
  programData.writeUInt32LE(2, 0);
  programDataAddress.toBuffer().copy(programData, 4);

  const deployedData = Buffer.alloc(45);
  deployedData.writeUInt32LE(3, 0);
  deployedData.writeBigUInt64LE(deploymentSlot, 4);
  deployedData.writeUInt8(1, 12);
  upgradeAuthority.toBuffer().copy(deployedData, 13);

  const idlData = Buffer.alloc(44 + compressedIdl.length);
  IDL_ACCOUNT_DISCRIMINATOR.copy(idlData, 0);
  idlAuthority.toBuffer().copy(idlData, 8);
  idlData.writeUInt32LE(compressedIdl.length, 40);
  compressedIdl.copy(idlData, 44);

  const accounts = [
    {
      data: programData,
      executable: true,
      owner: BPF_UPGRADEABLE_LOADER_ID,
    },
    {
      data: deployedData,
      executable: false,
      owner: BPF_UPGRADEABLE_LOADER_ID,
    },
    {
      data: idlData,
      executable: false,
      owner: new PublicKey(DFLOW_POLICY_PROGRAM_ID),
    },
  ];
  const expected = {
    decodedIdlHash: sha256(decodedIdl),
    deploymentSlot,
    idlAccountHash: sha256(idlData),
    idlAuthority: idlAuthority.toBase58(),
    programDataAddress: programDataAddress.toBase58(),
    upgradeAuthority: upgradeAuthority.toBase58(),
  };
  return {
    accounts,
    expected,
  };
}

test('program-integrity policy accepts an exact synthetic program and compressed IDL pin', () => {
  const fixture = programIntegrityFixture();
  assert.deepEqual(
    validateDflowProgramIntegrityAccounts(fixture.accounts, fixture.expected),
    {
      deploymentSlot: Number(fixture.expected.deploymentSlot),
      idlHash: fixture.expected.decodedIdlHash,
    },
  );
});

test('program-integrity loader binds both reads to one minimum slot and slices ProgramData', async () => {
  const fixture = programIntegrityFixture();
  const calls = [];
  const connection = {
    async getMultipleAccountsInfoAndContext(addresses, options) {
      calls.push(['program-and-idl', addresses.map(address => address.toBase58()), options]);
      return {
        context: { slot: 500_000_001 },
        value: [fixture.accounts[0], fixture.accounts[2]],
      };
    },
    async getAccountInfoAndContext(address, options) {
      calls.push(['program-data', address.toBase58(), options]);
      return {
        context: { slot: 500_000_002 },
        value: fixture.accounts[1],
      };
    },
  };
  assert.deepEqual(
    await loadAndValidateDflowProgramIntegrity(connection, {
      expected: fixture.expected,
      minContextSlot: 500_000_000,
    }),
    {
      deploymentSlot: Number(fixture.expected.deploymentSlot),
      idlHash: fixture.expected.decodedIdlHash,
    },
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][2], {
    commitment: 'confirmed',
    minContextSlot: 500_000_000,
  });
  assert.deepEqual(calls[1][2], {
    commitment: 'confirmed',
    dataSlice: { length: 45, offset: 0 },
    minContextSlot: 500_000_000,
  });
});

test('program-integrity loader rejects stale, incomplete, failed, and invalid-context reads', async () => {
  const fixture = programIntegrityFixture();
  const connection = {
    async getMultipleAccountsInfoAndContext() {
      return {
        context: { slot: 499_999_999 },
        value: [fixture.accounts[0], fixture.accounts[2]],
      };
    },
    async getAccountInfoAndContext() {
      return {
        context: { slot: 500_000_000 },
        value: fixture.accounts[1],
      };
    },
  };
  await assert.rejects(
    loadAndValidateDflowProgramIntegrity(connection, {
      expected: fixture.expected,
      minContextSlot: 500_000_000,
    }),
    error => error.code === 'DFLOW_PROGRAM_INTEGRITY_UNAVAILABLE',
  );
  await assert.rejects(
    loadAndValidateDflowProgramIntegrity(connection, { minContextSlot: -1 }),
    error => error.code === 'DFLOW_PROGRAM_INTEGRITY_UNAVAILABLE',
  );
  await assert.rejects(
    loadAndValidateDflowProgramIntegrity({
      async getMultipleAccountsInfoAndContext() {
        throw new Error('synthetic RPC failure');
      },
      async getAccountInfoAndContext() {
        return null;
      },
    }, { minContextSlot: 500_000_000 }),
    error => error.code === 'DFLOW_PROGRAM_INTEGRITY_UNAVAILABLE',
  );
});

test('program-integrity policy rejects loader, executable, ProgramData, slot, and authority changes', () => {
  const mutations = [
    (fixture) => { fixture.accounts[0].owner = Keypair.generate().publicKey; },
    (fixture) => { fixture.accounts[0].executable = false; },
    (fixture) => { fixture.accounts[0].data.writeUInt32LE(1, 0); },
    (fixture) => { Keypair.generate().publicKey.toBuffer().copy(fixture.accounts[0].data, 4); },
    (fixture) => { fixture.accounts[1].owner = Keypair.generate().publicKey; },
    (fixture) => { fixture.accounts[1].executable = true; },
    (fixture) => { fixture.accounts[1].data.writeUInt32LE(2, 0); },
    (fixture) => { fixture.accounts[1].data.writeBigUInt64LE(1n, 4); },
    (fixture) => { fixture.accounts[1].data.writeUInt8(0, 12); },
    (fixture) => { Keypair.generate().publicKey.toBuffer().copy(fixture.accounts[1].data, 13); },
  ];
  for (const mutate of mutations) {
    const fixture = programIntegrityFixture();
    mutate(fixture);
    assert.throws(
      () => validateDflowProgramIntegrityAccounts(fixture.accounts, fixture.expected),
      error => error.code === 'DFLOW_PROGRAM_INTEGRITY_CHANGED',
    );
  }
});

test('program-integrity policy rejects IDL owner, authority, discriminator, payload, and hashes', () => {
  const mutations = [
    (fixture) => { fixture.accounts[2].owner = TOKEN_PROGRAM_ID; },
    (fixture) => { fixture.accounts[2].executable = true; },
    (fixture) => { fixture.accounts[2].data[0] ^= 0xff; },
    (fixture) => { Keypair.generate().publicKey.toBuffer().copy(fixture.accounts[2].data, 8); },
    (fixture) => { fixture.accounts[2].data.writeUInt32LE(0, 40); },
    (fixture) => { fixture.accounts[2].data[44] ^= 0xff; },
    (fixture) => { fixture.expected.idlAccountHash = '00'.repeat(32); },
    (fixture) => { fixture.expected.decodedIdlHash = '00'.repeat(32); },
  ];
  for (const mutate of mutations) {
    const fixture = programIntegrityFixture();
    mutate(fixture);
    assert.throws(
      () => validateDflowProgramIntegrityAccounts(fixture.accounts, fixture.expected),
      error => error.code === 'DFLOW_PROGRAM_INTEGRITY_CHANGED',
    );
  }
});

function encodeMint(decimals, { isInitialized = true } = {}) {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode({
    decimals,
    freezeAuthority: PublicKey.default,
    freezeAuthorityOption: 0,
    isInitialized,
    mintAuthority: PublicKey.default,
    mintAuthorityOption: 0,
    supply: 1_000_000_000n,
  }, data);
  return data;
}

function rpcAccount(data, owner = TOKEN_PROGRAM_ID, overrides = {}) {
  return {
    data,
    executable: false,
    lamports: 2_039_280,
    owner,
    rentEpoch: 0,
    ...overrides,
  };
}

function tradeAccountStateFixture() {
  const swapFixture = swapAccountFixture();
  swapFixture.quote = {
    ...swapFixture.quote,
    contextSlot: 500_000_000,
    inputDecimals: 6,
    outputDecimals: 9,
  };
  const swapAccounts = validateDflowSwapAccounts(swapFixture);
  const inputAddress = swapAccounts.inputTokenAccount.toBase58();
  const outputAddress = swapAccounts.outputTokenAccount.toBase58();
  const accounts = new Map([
    [
      swapFixture.quote.inputMint,
      rpcAccount(encodeMint(swapFixture.quote.inputDecimals)),
    ],
    [
      swapFixture.quote.outputMint,
      rpcAccount(encodeMint(swapFixture.quote.outputDecimals)),
    ],
    [
      inputAddress,
      rpcAccount(encodeTokenAccount(
        swapFixture.quote.inputMint,
        swapFixture.owner,
        10_000_000n,
      )),
    ],
    [
      outputAddress,
      rpcAccount(encodeTokenAccount(
        swapFixture.quote.outputMint,
        swapFixture.owner,
        7_000_000n,
      )),
    ],
  ]);
  const executablePrograms = new Set(swapAccounts.allowedExecutablePrograms);
  for (const address of swapAccounts.instructionAddresses) {
    if (!accounts.has(address)) {
      accounts.set(
        address,
        rpcAccount(
          Buffer.alloc(0),
          SystemProgram.programId,
          { executable: executablePrograms.has(address) },
        ),
      );
    }
  }
  accounts.set(
    swapFixture.owner,
    rpcAccount(
      Buffer.alloc(0),
      SystemProgram.programId,
      { lamports: OWNER_LAMPORTS },
    ),
  );

  const fixture = {
    accounts,
    inputAddress,
    outputAddress,
    rpcCalls: [],
    rpcError: null,
    rpcResponse: null,
    swapAccounts,
    swapFixture,
  };
  fixture.connection = {
    async getMultipleAccountsInfoAndContext(addresses, options) {
      fixture.rpcCalls.push({
        addresses: addresses.map(address => address.toBase58()),
        options,
      });
      if (fixture.rpcError) throw fixture.rpcError;
      if (fixture.rpcResponse) return fixture.rpcResponse;
      return {
        context: { slot: 500_000_123 },
        value: addresses.map(address => (
          fixture.accounts.get(address.toBase58()) ?? null
        )),
      };
    },
  };
  return fixture;
}

function loadTradeAccountState(fixture) {
  return loadAndValidateTradeAccountState(fixture.connection, {
    accountKeys: fixture.swapFixture.accountKeys,
    message: fixture.swapFixture.message,
    owner: fixture.swapFixture.owner,
    quote: fixture.swapFixture.quote,
    swapAccounts: fixture.swapAccounts,
  });
}

async function assertAccountStateRejection(operation, {
  code = 'INVALID_DFLOW_TRANSACTION',
  pattern,
} = {}) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, code);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

test('trade account-state loader independently validates packed mints and wallet ATAs', async () => {
  const fixture = tradeAccountStateFixture();
  assert.deepEqual(
    await loadTradeAccountState(fixture),
    {
      contextSlot: 500_000_123,
      inputAccountLamports: 2_039_280,
      inputAmount: 10_000_000n,
      inputControlState: {
        closeAuthority: null,
        delegate: null,
        delegatedAmount: 0n,
      },
      inputTokenAccount: fixture.inputAddress,
      ownerAddress: fixture.swapFixture.owner,
      ownerLamports: OWNER_LAMPORTS,
      outputAmount: 7_000_000n,
      outputAccountExists: true,
      outputAccountLamports: 2_039_280,
      outputControlState: {
        closeAuthority: null,
        delegate: null,
        delegatedAmount: 0n,
      },
      outputTokenAccount: fixture.outputAddress,
    },
  );
  assert.equal(fixture.rpcCalls.length, 1);
  assert.deepEqual(fixture.rpcCalls[0].options, {
    commitment: 'confirmed',
    minContextSlot: fixture.swapFixture.quote.contextSlot,
  });
  assert.equal(
    fixture.rpcCalls[0].addresses.length,
    new Set(fixture.rpcCalls[0].addresses).size,
  );
  assert.ok(fixture.rpcCalls[0].addresses.includes(fixture.swapFixture.quote.inputMint));
  assert.ok(fixture.rpcCalls[0].addresses.includes(fixture.swapFixture.quote.outputMint));
  assert.ok(fixture.rpcCalls[0].addresses.includes(fixture.inputAddress));
  assert.ok(fixture.rpcCalls[0].addresses.includes(fixture.outputAddress));
});

test('trade account-state loader allows an uninitialized destination ATA before simulation', async () => {
  const fixture = tradeAccountStateFixture();
  fixture.swapAccounts = {
    ...fixture.swapAccounts,
    initializesOutputAta: true,
  };
  fixture.accounts.set(fixture.outputAddress, null);
  assert.deepEqual(
    await loadTradeAccountState(fixture),
    {
      contextSlot: 500_000_123,
      inputAccountLamports: 2_039_280,
      inputAmount: 10_000_000n,
      inputControlState: {
        closeAuthority: null,
        delegate: null,
        delegatedAmount: 0n,
      },
      inputTokenAccount: fixture.inputAddress,
      ownerAddress: fixture.swapFixture.owner,
      ownerLamports: OWNER_LAMPORTS,
      outputAmount: 0n,
      outputAccountExists: false,
      outputAccountLamports: 0,
      outputControlState: null,
      outputTokenAccount: fixture.outputAddress,
    },
  );
});

test('trade account-state loader allows only an explicitly reviewed virtual sysvar', async () => {
  const fixture = tradeAccountStateFixture();
  const sysvar = 'Sysvar1nstructions1111111111111111111111111';
  fixture.swapAccounts = {
    ...fixture.swapAccounts,
    allowedVirtualAccounts: [sysvar],
    instructionAddresses: [...fixture.swapAccounts.instructionAddresses, sysvar],
    instructionIndexes: [...fixture.swapAccounts.instructionIndexes, 99],
  };
  fixture.accounts.set(sysvar, null);
  assert.equal((await loadTradeAccountState(fixture)).contextSlot, 500_000_123);

  fixture.swapAccounts = {
    ...fixture.swapAccounts,
    allowedVirtualAccounts: [],
  };
  await assertAccountStateRejection(
    () => loadTradeAccountState(fixture),
    { pattern: /unexpected uninitialized account/ },
  );
});

test('trade account-state loader binds destination creation to InitAtaIdempotent', async () => {
  const fixture = tradeAccountStateFixture();
  fixture.accounts.set(fixture.outputAddress, null);
  await assertAccountStateRejection(
    () => loadTradeAccountState(fixture),
    { pattern: /unexpected uninitialized account/ },
  );
});

test('trade account-state loader requires pinned executable programs and rejects executable decoys', async () => {
  const nonExecutableVenue = tradeAccountStateFixture();
  nonExecutableVenue.accounts.get(METEORA_DAMM_V2_PROGRAM_ID).executable = false;
  await assertAccountStateRejection(
    () => loadTradeAccountState(nonExecutableVenue),
    { pattern: /non-executable reviewed program/ },
  );

  const executableMarket = tradeAccountStateFixture();
  executableMarket.accounts.get(
    executableMarket.swapFixture.quote.route[0].marketKey,
  ).executable = true;
  await assertAccountStateRejection(
    () => loadTradeAccountState(executableMarket),
    { pattern: /unexpected executable program/ },
  );
});

test('trade account-state loader validates the fee payer and response context', async () => {
  const wrongOwner = tradeAccountStateFixture();
  wrongOwner.accounts.get(wrongOwner.swapFixture.owner).owner = TOKEN_PROGRAM_ID;
  await assertAccountStateRejection(
    () => loadTradeAccountState(wrongOwner),
    { pattern: /Wallet system account/ },
  );

  const executableOwner = tradeAccountStateFixture();
  executableOwner.accounts.get(executableOwner.swapFixture.owner).executable = true;
  await assertAccountStateRejection(
    () => loadTradeAccountState(executableOwner),
    { pattern: /executable program|Wallet system account/ },
  );

  const stale = tradeAccountStateFixture();
  stale.connection = {
    async getMultipleAccountsInfoAndContext(addresses) {
      return {
        context: { slot: stale.swapFixture.quote.contextSlot - 1 },
        value: addresses.map(address => (
          stale.accounts.get(address.toBase58()) ?? null
        )),
      };
    },
  };
  await assertAccountStateRejection(
    () => loadTradeAccountState(stale),
    {
      code: 'SOLANA_ACCOUNT_STATE_UNAVAILABLE',
      pattern: /stale/,
    },
  );
});

test('trade account-state loader rejects wrong mint programs and on-chain decimals', async () => {
  const mutations = [
    (fixture) => {
      fixture.accounts.get(fixture.swapFixture.quote.inputMint).owner =
        SystemProgram.programId;
    },
    (fixture) => {
      fixture.accounts.get(fixture.swapFixture.quote.outputMint).owner =
        SystemProgram.programId;
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.swapFixture.quote.inputMint,
        rpcAccount(encodeMint(5)),
      );
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.swapFixture.quote.outputMint,
        rpcAccount(encodeMint(8)),
      );
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.swapFixture.quote.inputMint,
        rpcAccount(encodeMint(6, { isInitialized: false })),
      );
    },
  ];
  for (const mutate of mutations) {
    const fixture = tradeAccountStateFixture();
    mutate(fixture);
    await assertAccountStateRejection(
      () => loadTradeAccountState(fixture),
      { pattern: /mint|decimals/ },
    );
  }
});

test('trade account-state loader rejects ATAs with the wrong mint, authority, or token program', async () => {
  const mutations = [
    (fixture) => {
      fixture.accounts.set(
        fixture.inputAddress,
        rpcAccount(encodeTokenAccount(
          randomAddress(),
          fixture.swapFixture.owner,
          10_000_000n,
        )),
      );
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.inputAddress,
        rpcAccount(encodeTokenAccount(
          fixture.swapFixture.quote.inputMint,
          randomAddress(),
          10_000_000n,
        )),
      );
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.outputAddress,
        rpcAccount(encodeTokenAccount(
          randomAddress(),
          fixture.swapFixture.owner,
          7_000_000n,
        )),
      );
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.outputAddress,
        rpcAccount(encodeTokenAccount(
          fixture.swapFixture.quote.outputMint,
          randomAddress(),
          7_000_000n,
        )),
      );
    },
    (fixture) => {
      fixture.accounts.get(fixture.inputAddress).owner = SystemProgram.programId;
    },
    (fixture) => {
      fixture.accounts.get(fixture.outputAddress).owner = SystemProgram.programId;
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.inputAddress,
        rpcAccount(encodeTokenAccount(
          fixture.swapFixture.quote.inputMint,
          fixture.swapFixture.owner,
          10_000_000n,
          { state: 0 },
        )),
      );
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.outputAddress,
        rpcAccount(encodeTokenAccount(
          fixture.swapFixture.quote.outputMint,
          fixture.swapFixture.owner,
          7_000_000n,
          { state: 2 },
        )),
      );
    },
    (fixture) => {
      fixture.accounts.set(
        fixture.inputAddress,
        rpcAccount(encodeTokenAccount(
          fixture.swapFixture.quote.inputMint,
          fixture.swapFixture.owner,
          10_000_000n,
          { isNative: 2_039_280n, isNativeOption: 1 },
        )),
      );
    },
  ];
  for (const mutate of mutations) {
    const fixture = tradeAccountStateFixture();
    mutate(fixture);
    await assertAccountStateRejection(
      () => loadTradeAccountState(fixture),
      { pattern: /token account|reviewed trade/ },
    );
  }
});

test('trade account-state loader rejects a missing source or any unexpected uninitialized instruction account', async () => {
  const missingInput = tradeAccountStateFixture();
  missingInput.accounts.set(missingInput.inputAddress, null);
  await assertAccountStateRejection(
    () => loadTradeAccountState(missingInput),
    { pattern: /unexpected uninitialized account/ },
  );

  const missingMarket = tradeAccountStateFixture();
  const market = missingMarket.swapFixture.quote.route[0].marketKey;
  missingMarket.accounts.set(market, null);
  await assertAccountStateRejection(
    () => loadTradeAccountState(missingMarket),
    { pattern: /unexpected uninitialized account/ },
  );
});

test('trade account-state loader rejects extra token accounts controlled by the wallet', async () => {
  for (const control of ['owner', 'delegate', 'closeAuthority']) {
    const fixture = tradeAccountStateFixture();
    const marketAddress = fixture.swapFixture.quote.route[0].marketKey;
    const marketIndex = fixture.swapAccounts.instructionAddresses.indexOf(
      marketAddress,
    );
    assert.ok(marketIndex >= 0);
    const globalIndex = fixture.swapAccounts.instructionIndexes[marketIndex];
    fixture.swapFixture.writableIndexes.add(globalIndex);
    const controls = control === 'owner'
      ? {}
      : { [control]: fixture.swapFixture.owner };
    fixture.accounts.set(
      marketAddress,
      rpcAccount(encodeTokenAccount(
        fixture.swapFixture.quote.inputMint,
        control === 'owner' ? fixture.swapFixture.owner : randomAddress(),
        123n,
        controls,
      )),
    );
    await assertAccountStateRejection(
      () => loadTradeAccountState(fixture),
      { pattern: /unexpected writable wallet token account/ },
    );
  }
});

test('trade account-state loader rejects incomplete and failed RPC responses', async () => {
  const incomplete = tradeAccountStateFixture();
  incomplete.rpcResponse = {
    context: { slot: 500_000_123 },
    value: [incomplete.accounts.get(incomplete.swapFixture.quote.inputMint)],
  };
  await assertAccountStateRejection(
    () => loadTradeAccountState(incomplete),
    {
      code: 'SOLANA_ACCOUNT_STATE_UNAVAILABLE',
      pattern: /response is incomplete/,
    },
  );

  const malformed = tradeAccountStateFixture();
  malformed.rpcResponse = {
    context: { slot: 500_000_123 },
    value: null,
  };
  await assertAccountStateRejection(
    () => loadTradeAccountState(malformed),
    {
      code: 'SOLANA_ACCOUNT_STATE_UNAVAILABLE',
      pattern: /response is incomplete/,
    },
  );

  const failed = tradeAccountStateFixture();
  failed.rpcError = new Error('synthetic RPC failure');
  await assertAccountStateRejection(
    () => loadTradeAccountState(failed),
    {
      code: 'SOLANA_ACCOUNT_STATE_UNAVAILABLE',
      pattern: /could not be loaded/,
    },
  );
});
