import * as crypto from 'node:crypto';
import { inflateSync } from 'node:zlib';
import {
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} from '@solana/spl-token';

export const DFLOW_POLICY_PROGRAM_ID = 'DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH';
export const DFLOW_PROGRAM_DATA_ADDRESS = 'HKHbVGGPJCbEkbY8Lg5kqdda3Mo8BJqUYaXqyPBaxy3m';
export const DFLOW_PROGRAM_DEPLOYMENT_SLOT = 436_232_368n;
export const DFLOW_PROGRAM_UPGRADE_AUTHORITY = '9uo2iJKJkmiYwy5MrkrbGQXbPqwHXqvQaUqxhCkowgsh';
export const DFLOW_IDL_ADDRESS = 'Cp2dCjxCWdktak2JiSrh87X6sz31EnDVKoTGtsHJvhYq';
export const DFLOW_IDL_AUTHORITY = 'DhoSEG7xWMDqPE9G4JSmPtnkKUsNKct6Tv4qHf5goBRW';
export const DFLOW_IDL_ACCOUNT_SHA256 = '65e64f66e376d328c6b69944e8db54b6cff055aa9aabd47f98603148bc0799d4';
export const DFLOW_IDL_JSON_SHA256 = 'bb414adbf6982afc505fe1045a33863e8af6a9dcddd72b91908d471731dd2eca';
export const DFLOW_MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
export const DFLOW_MAX_PRIORITY_FEE_LAMPORTS = 1_000_000;

const BPF_UPGRADEABLE_LOADER_ID = new PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111',
);
const DFLOW_PROGRAM = new PublicKey(DFLOW_POLICY_PROGRAM_ID);
const DFLOW_PROGRAM_DATA = new PublicKey(DFLOW_PROGRAM_DATA_ADDRESS);
const DFLOW_IDL = new PublicKey(DFLOW_IDL_ADDRESS);
const DFLOW_EVENT_AUTHORITY = PublicKey.findProgramAddressSync(
  [Buffer.from('__event_authority')],
  DFLOW_PROGRAM,
)[0];
const MAX_PRIORITY_FEE_LAMPORTS = BigInt(DFLOW_MAX_PRIORITY_FEE_LAMPORTS);
const MAX_OUTPUT_ATA_RENT_LAMPORTS = 10_000_000;
const MAX_ACTIONS = 16;
const IDL_ACCOUNT_DISCRIMINATOR = Buffer.from('184662bf3a907b9e', 'hex');
const SWAP_DISCRIMINATOR = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);
const SWAP2_DISCRIMINATOR = Buffer.from([65, 75, 63, 76, 235, 91, 91, 136]);

const ACTIONS = Object.freeze({
  METEORA_DAMM_V2_SWAP: 20,
  RECORD_ID: 37,
  RECORD_ID_2: 38,
  SET_MINIMUM_LEG_OUTPUTS: 48,
  INIT_ATA_IDEMPOTENT: 60,
});

const TRADE_ACTIONS = new Map([
  [ACTIONS.METEORA_DAMM_V2_SWAP, {
    name: 'MeteoraDammV2Swap',
    requiredProgram: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',
    venues: new Set(['meteoradammv2']),
  }],
]);

function policyError(
  message,
  code = 'INVALID_DFLOW_TRANSACTION',
  statusCode = 502,
  cause,
) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function addressOf(value) {
  try {
    return value instanceof PublicKey ? value.toBase58() : new PublicKey(value).toBase58();
  } catch {
    return '';
  }
}

function accountOwner(account) {
  return addressOf(account?.owner);
}

function requireAccountData(account, label) {
  if (!account || !Buffer.isBuffer(account.data)) {
    throw policyError(`${label} is unavailable`);
  }
  return account.data;
}

function equalBytes(left, right) {
  return Buffer.from(left).equals(Buffer.from(right));
}

function hashHex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeVenue(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Verifies the code-owned DFlow program and Anchor IDL pins against account
 * state loaded from mainnet. Tests may provide a different complete policy;
 * production callers always use the exported defaults.
 */
export function validateDflowProgramIntegrityAccounts(
  accounts,
  expected = {
    decodedIdlHash: DFLOW_IDL_JSON_SHA256,
    deploymentSlot: DFLOW_PROGRAM_DEPLOYMENT_SLOT,
    idlAccountHash: DFLOW_IDL_ACCOUNT_SHA256,
    idlAuthority: DFLOW_IDL_AUTHORITY,
    programDataAddress: DFLOW_PROGRAM_DATA_ADDRESS,
    upgradeAuthority: DFLOW_PROGRAM_UPGRADE_AUTHORITY,
  },
) {
  const [programAccount, programDataAccount, idlAccount] = accounts || [];
  const programData = requireAccountData(programAccount, 'DFlow program account');
  if (
    accountOwner(programAccount) !== BPF_UPGRADEABLE_LOADER_ID.toBase58()
    || programAccount.executable !== true
    || programData.length !== 36
    || programData.readUInt32LE(0) !== 2
    || addressOf(programData.subarray(4, 36)) !== expected.programDataAddress
  ) {
    throw policyError(
      'DFlow program deployment no longer matches the reviewed policy',
      'DFLOW_PROGRAM_INTEGRITY_CHANGED',
      503,
    );
  }

  const deployedData = requireAccountData(programDataAccount, 'DFlow ProgramData account');
  const hasAuthority = deployedData.length >= 45 && deployedData[12] === 1;
  if (
    accountOwner(programDataAccount) !== BPF_UPGRADEABLE_LOADER_ID.toBase58()
    || programDataAccount.executable === true
    || deployedData.length < 45
    || deployedData.readUInt32LE(0) !== 3
    || deployedData.readBigUInt64LE(4) !== BigInt(expected.deploymentSlot)
    || !hasAuthority
    || addressOf(deployedData.subarray(13, 45)) !== expected.upgradeAuthority
  ) {
    throw policyError(
      'DFlow program was upgraded or its authority changed',
      'DFLOW_PROGRAM_INTEGRITY_CHANGED',
      503,
    );
  }

  const idlData = requireAccountData(idlAccount, 'DFlow IDL account');
  let decodedIdl;
  try {
    const compressedLength = idlData.readUInt32LE(40);
    if (
      accountOwner(idlAccount) !== DFLOW_POLICY_PROGRAM_ID
      || idlAccount.executable === true
      || idlData.length < 44
      || !equalBytes(idlData.subarray(0, 8), IDL_ACCOUNT_DISCRIMINATOR)
      || addressOf(idlData.subarray(8, 40)) !== expected.idlAuthority
      || compressedLength <= 0
      || compressedLength > idlData.length - 44
      || hashHex(idlData) !== expected.idlAccountHash
    ) {
      throw new Error('IDL account mismatch');
    }
    decodedIdl = inflateSync(idlData.subarray(44, 44 + compressedLength));
  } catch (cause) {
    throw policyError(
      'DFlow instruction schema no longer matches the reviewed policy',
      'DFLOW_PROGRAM_INTEGRITY_CHANGED',
      503,
      cause,
    );
  }
  if (hashHex(decodedIdl) !== expected.decodedIdlHash) {
    throw policyError(
      'DFlow instruction schema changed after review',
      'DFLOW_PROGRAM_INTEGRITY_CHANGED',
      503,
    );
  }
  return Object.freeze({
    deploymentSlot: Number(expected.deploymentSlot),
    idlHash: expected.decodedIdlHash,
  });
}

export async function loadAndValidateDflowProgramIntegrity(connection, {
  expected,
  minContextSlot = 0,
} = {}) {
  if (!Number.isSafeInteger(minContextSlot) || minContextSlot < 0) {
    throw policyError(
      'DFlow program integrity context is invalid',
      'DFLOW_PROGRAM_INTEGRITY_UNAVAILABLE',
      503,
    );
  }
  let programResponse;
  let programDataResponse;
  try {
    [programResponse, programDataResponse] = await Promise.all([
      connection.getMultipleAccountsInfoAndContext(
        [DFLOW_PROGRAM, DFLOW_IDL],
        { commitment: 'confirmed', minContextSlot },
      ),
      connection.getAccountInfoAndContext(
        DFLOW_PROGRAM_DATA,
        {
          commitment: 'confirmed',
          dataSlice: { length: 45, offset: 0 },
          minContextSlot,
        },
      ),
    ]);
  } catch (cause) {
    throw policyError(
      'DFlow program integrity could not be checked',
      'DFLOW_PROGRAM_INTEGRITY_UNAVAILABLE',
      503,
      cause,
    );
  }
  if (
    !Array.isArray(programResponse?.value)
    || programResponse.value.length !== 2
    || !Number.isSafeInteger(programResponse.context?.slot)
    || programResponse.context.slot < minContextSlot
    || !Number.isSafeInteger(programDataResponse?.context?.slot)
    || programDataResponse.context.slot < minContextSlot
  ) {
    throw policyError(
      'DFlow program integrity response is stale or incomplete',
      'DFLOW_PROGRAM_INTEGRITY_UNAVAILABLE',
      503,
    );
  }
  return validateDflowProgramIntegrityAccounts(
    [
      programResponse.value[0],
      programDataResponse.value,
      programResponse.value[1],
    ],
    expected,
  );
}

class Cursor {
  constructor(value) {
    this.data = Buffer.from(value);
    this.offset = 0;
  }

  bytes(length, label) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.data.length) {
      throw policyError(`DFlow ${label} is truncated`);
    }
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  u8(label) {
    return this.bytes(1, label)[0];
  }

  u16(label) {
    return this.bytes(2, label).readUInt16LE(0);
  }

  u32(label) {
    return this.bytes(4, label).readUInt32LE(0);
  }

  u64(label) {
    return this.bytes(8, label).readBigUInt64LE(0);
  }
}

function decodeAction(cursor) {
  const tag = cursor.u8('action tag');
  if (TRADE_ACTIONS.has(tag)) {
    return {
      ...TRADE_ACTIONS.get(tag),
      amount: cursor.u64('swap amount'),
      flags: cursor.u8('orchestrator flags'),
      tag,
      type: 'trade',
    };
  }
  if (tag === ACTIONS.RECORD_ID) {
    cursor.bytes(76, 'record identifier');
    return { name: 'RecordId', tag, type: 'metadata' };
  }
  if (tag === ACTIONS.RECORD_ID_2) {
    cursor.bytes(4, 'record identifier');
    return { name: 'RecordId2', tag, type: 'metadata' };
  }
  if (tag === ACTIONS.INIT_ATA_IDEMPOTENT) {
    return { name: 'InitAtaIdempotent', tag, type: 'setup' };
  }
  if (tag === ACTIONS.SET_MINIMUM_LEG_OUTPUTS) {
    const count = cursor.u32('minimum leg output count');
    if (count !== 1) {
      throw policyError('DFlow minimum-output policy is not a direct route');
    }
    return {
      minimumOutput: cursor.u64('minimum leg output'),
      name: 'SetMinimumLegOutputs',
      tag,
      type: 'guard',
    };
  }
  throw policyError(`DFlow action ${tag} is not allowed by the reviewed policy`);
}

/**
 * Decodes and binds a complete pinned `swap`/`swap2` instruction. Exact EOF is
 * required so a second, fake quote tail cannot be appended.
 */
export function decodeAndValidateDflowSwap(data, quote) {
  const cursor = new Cursor(data);
  const discriminator = cursor.bytes(8, 'instruction discriminator');
  const isSwap2 = equalBytes(discriminator, SWAP2_DISCRIMINATOR);
  if (!equalBytes(discriminator, SWAP_DISCRIMINATOR) && !isSwap2) {
    throw policyError('DFlow instruction is not an allowed wallet-bound swap');
  }
  const actionCount = cursor.u32('action count');
  if (actionCount < 1 || actionCount > MAX_ACTIONS) {
    throw policyError('DFlow action count is outside the reviewed policy');
  }
  const actions = Array.from({ length: actionCount }, () => decodeAction(cursor));
  const quotedOutAmount = cursor.u64('quoted output amount');
  const slippageBps = cursor.u16('slippage');
  const platformFeeBps = cursor.u16('platform fee');
  const positiveSlippageFeeLimitPercent = isSwap2
    ? cursor.u8('positive-slippage fee')
    : 0;
  if (cursor.offset !== cursor.data.length) {
    throw policyError('DFlow instruction contains unreviewed trailing data');
  }

  const tradeActions = actions.filter(action => action.type === 'trade');
  const outputGuards = actions.filter(action => action.type === 'guard');
  const metadataActions = actions.filter(action => action.type === 'metadata');
  const setupActions = actions.filter(action => action.type === 'setup');
  if (
    tradeActions.length !== 1
    || metadataActions.length > 1
    || setupActions.length > 1
    || outputGuards.length > 1
    || tradeActions[0].amount !== BigInt(quote.inAmount)
    || tradeActions[0].flags !== 0x80
    || !tradeActions[0].venues.has(normalizeVenue(quote.route[0]?.venue))
    || quotedOutAmount !== BigInt(quote.outAmount)
    || slippageBps !== quote.slippageBps
    || platformFeeBps !== 0
    || positiveSlippageFeeLimitPercent !== 0
    || outputGuards.some(guard => guard.minimumOutput < BigInt(quote.minimumAmountOut))
  ) {
    throw policyError('DFlow instruction economics do not match the reviewed trade');
  }
  return Object.freeze({
    actionNames: actions.map(action => action.name),
    initializesOutputAta: setupActions.length === 1,
    requiredProgram: tradeActions[0].requiredProgram,
    tradeAction: tradeActions[0].name,
  });
}

/**
 * Validates the exact two Compute Budget instructions emitted by the guarded
 * order request and binds them to DFlow's signed response.
 */
export function validateComputeBudgetPolicy({
  instructions,
  programIds,
  quote,
}) {
  if (
    instructions.length !== 3
    || programIds.length !== 3
    || programIds[0] !== 'ComputeBudget111111111111111111111111111111'
    || programIds[1] !== 'ComputeBudget111111111111111111111111111111'
    || programIds[2] !== DFLOW_POLICY_PROGRAM_ID
  ) {
    throw policyError('DFlow transaction instruction order is unsupported');
  }
  const [limitInstruction, priceInstruction] = instructions;
  const limitData = Buffer.from(limitInstruction.data);
  const priceData = Buffer.from(priceInstruction.data);
  if (
    limitInstruction.accountKeyIndexes.length !== 0
    || priceInstruction.accountKeyIndexes.length !== 0
    || limitData.length !== 5
    || limitData[0] !== 2
    || priceData.length !== 9
    || priceData[0] !== 3
  ) {
    throw policyError('DFlow compute budget contains an unsupported instruction');
  }
  const computeUnitLimit = limitData.readUInt32LE(1);
  const computeUnitPrice = priceData.readBigUInt64LE(1);
  const priorityFee = (
    BigInt(computeUnitLimit) * computeUnitPrice + 999_999n
  ) / 1_000_000n;
  if (
    computeUnitLimit < 1
    || computeUnitLimit > DFLOW_MAX_COMPUTE_UNIT_LIMIT
    || computeUnitLimit !== quote.computeUnitLimit
    || computeUnitPrice !== BigInt(quote.computeUnitPriceMicroLamports)
    || priorityFee !== BigInt(quote.prioritizationFeeLamports)
    || priorityFee > MAX_PRIORITY_FEE_LAMPORTS
  ) {
    throw policyError('DFlow compute budget does not match the reviewed fee');
  }
}

function assertGlobalRole(message, accountIndex, {
  signer,
  writable,
}, label) {
  if (
    message.isAccountSigner(accountIndex) !== signer
    || message.isAccountWritable(accountIndex) !== writable
  ) {
    throw policyError(`DFlow ${label} privileges are not allowed`);
  }
}

/**
 * Validates fixed Anchor accounts and derives the only permitted wallet token
 * source and destination for the reviewed pair.
 */
export function validateDflowSwapAccounts({
  accountKeys,
  message,
  owner,
  quote,
  swapInstruction,
  swapPolicy,
}) {
  const indexes = [...swapInstruction.accountKeyIndexes];
  if (indexes.length < 11) {
    throw policyError('DFlow swap account list is incomplete');
  }
  const addresses = indexes.map((index) => {
    const key = accountKeys.get(index);
    if (!key) throw policyError('DFlow swap references an unknown account');
    return key.toBase58();
  });
  const fixed = [
    TOKEN_PROGRAM_ID.toBase58(),
    ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    SystemProgram.programId.toBase58(),
    owner,
    DFLOW_EVENT_AUTHORITY.toBase58(),
    DFLOW_POLICY_PROGRAM_ID,
  ];
  if (!fixed.every((address, index) => addresses[index] === address)) {
    throw policyError('DFlow fixed swap accounts do not match the reviewed ABI');
  }
  if (addresses.includes(TOKEN_2022_PROGRAM_ID.toBase58())) {
    throw policyError('DFlow swap includes the unsupported Token-2022 program');
  }
  indexes.forEach((accountIndex, position) => {
    if (position === 3) {
      if (!message.isAccountSigner(accountIndex) || !message.isAccountWritable(accountIndex)) {
        throw policyError('DFlow wallet authority privileges are invalid');
      }
    } else if (message.isAccountSigner(accountIndex)) {
      throw policyError('DFlow swap contains an unexpected signer');
    }
  });
  [0, 1, 2, 4, 5].forEach(position => assertGlobalRole(
    message,
    indexes[position],
    { signer: false, writable: false },
    'fixed account',
  ));

  let inputTokenAccount;
  let outputTokenAccount;
  try {
    inputTokenAccount = getAssociatedTokenAddressSync(
      new PublicKey(quote.inputMint),
      new PublicKey(owner),
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    outputTokenAccount = getAssociatedTokenAddressSync(
      new PublicKey(quote.outputMint),
      new PublicKey(owner),
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  } catch (cause) {
    throw policyError('DFlow wallet token accounts could not be derived', undefined, undefined, cause);
  }
  const required = [
    quote.inputMint,
    quote.outputMint,
    quote.route[0]?.marketKey,
    inputTokenAccount.toBase58(),
    outputTokenAccount.toBase58(),
    swapPolicy.requiredProgram,
  ];
  if (required.some(address => !address || !addresses.includes(address))) {
    throw policyError('DFlow swap accounts do not bind the reviewed route');
  }
  for (const mint of [quote.inputMint, quote.outputMint]) {
    const index = indexes[addresses.indexOf(mint)];
    assertGlobalRole(message, index, { signer: false, writable: false }, 'mint');
  }
  for (const tokenAccount of [inputTokenAccount, outputTokenAccount]) {
    const index = indexes[addresses.indexOf(tokenAccount.toBase58())];
    if (message.isAccountSigner(index) || !message.isAccountWritable(index)) {
      throw policyError('DFlow wallet token account privileges are invalid');
    }
  }
  const marketIndex = indexes[addresses.indexOf(quote.route[0].marketKey)];
  if (message.isAccountSigner(marketIndex)) {
    throw policyError('DFlow route market cannot sign the transaction');
  }

  return Object.freeze({
    allowedExecutablePrograms: Object.freeze([
      TOKEN_PROGRAM_ID.toBase58(),
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
      DFLOW_POLICY_PROGRAM_ID,
      swapPolicy.requiredProgram,
    ]),
    initializesOutputAta: swapPolicy.initializesOutputAta === true,
    inputTokenAccount,
    instructionAddresses: addresses,
    instructionIndexes: indexes,
    outputTokenAccount,
  });
}

function decodeClassicTokenAccount(address, account, label) {
  if (
    !account
    || accountOwner(account) !== TOKEN_PROGRAM_ID.toBase58()
    || account.data?.length !== ACCOUNT_SIZE
  ) {
    throw policyError(`${label} is not a classic SPL Token account`);
  }
  try {
    const decoded = unpackAccount(new PublicKey(address), account, TOKEN_PROGRAM_ID);
    if (!decoded.isInitialized || decoded.isFrozen || decoded.isNative) {
      throw new Error('unsupported token-account state');
    }
    return decoded;
  } catch (cause) {
    throw policyError(`${label} data is invalid`, undefined, undefined, cause);
  }
}

function decodeClassicMint(address, account, label) {
  if (
    !account
    || accountOwner(account) !== TOKEN_PROGRAM_ID.toBase58()
    || account.data?.length !== MINT_SIZE
  ) {
    throw policyError(`${label} is not a classic SPL Token mint`);
  }
  try {
    const decoded = unpackMint(new PublicKey(address), account, TOKEN_PROGRAM_ID);
    if (!decoded.isInitialized) throw new Error('uninitialized mint');
    return decoded;
  } catch (cause) {
    throw policyError(`${label} data is invalid`, undefined, undefined, cause);
  }
}

function tokenControlState(token) {
  return Object.freeze({
    closeAuthority: token.closeAuthority?.toBase58() || null,
    delegate: token.delegate?.toBase58() || null,
    delegatedAmount: token.delegatedAmount,
  });
}

function tokenControlStateMatches(token, expected) {
  return (
    expected
    && (token.closeAuthority?.toBase58() || null) === expected.closeAuthority
    && (token.delegate?.toBase58() || null) === expected.delegate
    && token.delegatedAmount === expected.delegatedAmount
  );
}

/**
 * Loads both mints, the fee payer, the user's source/destination ATAs, and every
 * DFlow instruction account at or after the signed quote slot. The resulting
 * state binds executable programs, token identities, and pre-simulation
 * balances without trusting DFlow's account descriptions.
 */
export async function loadAndValidateTradeAccountState(connection, {
  accountKeys,
  message,
  owner,
  quote,
  swapAccounts,
}) {
  const requestedAddresses = [
    quote.inputMint,
    quote.outputMint,
    owner,
    swapAccounts.inputTokenAccount.toBase58(),
    swapAccounts.outputTokenAccount.toBase58(),
    ...swapAccounts.instructionAddresses,
  ];
  const addresses = [...new Set(requestedAddresses)];
  let response;
  try {
    response = await connection.getMultipleAccountsInfoAndContext(
      addresses.map(address => new PublicKey(address)),
      { commitment: 'confirmed', minContextSlot: quote.contextSlot },
    );
  } catch (cause) {
    throw policyError(
      'Reviewed token accounts could not be loaded',
      'SOLANA_ACCOUNT_STATE_UNAVAILABLE',
      503,
      cause,
    );
  }
  if (!Array.isArray(response?.value) || response.value.length !== addresses.length) {
    throw policyError(
      'Reviewed token account response is incomplete',
      'SOLANA_ACCOUNT_STATE_UNAVAILABLE',
      503,
    );
  }
  if (
    !Number.isSafeInteger(response.context?.slot)
    || response.context.slot < quote.contextSlot
  ) {
    throw policyError(
      'Reviewed token account response is stale',
      'SOLANA_ACCOUNT_STATE_UNAVAILABLE',
      503,
    );
  }
  const accounts = new Map(addresses.map((address, index) => [address, response.value[index]]));
  const inputMint = decodeClassicMint(
    quote.inputMint,
    accounts.get(quote.inputMint),
    'Reviewed input mint',
  );
  const outputMint = decodeClassicMint(
    quote.outputMint,
    accounts.get(quote.outputMint),
    'Reviewed output mint',
  );
  if (
    inputMint.decimals !== quote.inputDecimals
    || outputMint.decimals !== quote.outputDecimals
  ) {
    throw policyError('DFlow mint decimals do not match mainnet');
  }

  const inputAddress = swapAccounts.inputTokenAccount.toBase58();
  const outputAddress = swapAccounts.outputTokenAccount.toBase58();
  const allowedExecutablePrograms = new Set(swapAccounts.allowedExecutablePrograms || []);
  for (const address of allowedExecutablePrograms) {
    if (accounts.get(address)?.executable !== true) {
      throw policyError('DFlow swap references a non-executable reviewed program');
    }
  }
  for (const address of swapAccounts.instructionAddresses) {
    const account = accounts.get(address);
    if (
      !account
      && (
        address !== outputAddress
        || swapAccounts.initializesOutputAta !== true
      )
    ) {
      throw policyError('DFlow swap references an unexpected uninitialized account');
    }
    if (account?.executable === true && !allowedExecutablePrograms.has(address)) {
      throw policyError('DFlow swap references an unexpected executable program');
    }
  }
  const ownerAccount = accounts.get(owner);
  if (
    !ownerAccount
    || accountOwner(ownerAccount) !== SystemProgram.programId.toBase58()
    || ownerAccount.executable === true
    || !Number.isSafeInteger(ownerAccount.lamports)
    || ownerAccount.lamports < 0
    || requireAccountData(ownerAccount, 'Wallet system account').length !== 0
  ) {
    throw policyError('Wallet system account does not match the reviewed fee payer');
  }
  const input = decodeClassicTokenAccount(
    inputAddress,
    accounts.get(inputAddress),
    'Wallet input token account',
  );
  const inputAccountInfo = accounts.get(inputAddress);
  const outputAccountInfo = accounts.get(outputAddress);
  const output = outputAccountInfo
    ? decodeClassicTokenAccount(outputAddress, outputAccountInfo, 'Wallet output token account')
    : null;
  if (
    input.mint.toBase58() !== quote.inputMint
    || input.owner.toBase58() !== owner
    || (output && (
      output.mint.toBase58() !== quote.outputMint
      || output.owner.toBase58() !== owner
    ))
  ) {
    throw policyError('Wallet token accounts do not match the reviewed trade');
  }
  if (
    !Number.isSafeInteger(inputAccountInfo.lamports)
    || inputAccountInfo.lamports < 0
    || (
      outputAccountInfo
      && (
        !Number.isSafeInteger(outputAccountInfo.lamports)
        || outputAccountInfo.lamports < 0
      )
    )
  ) {
    throw policyError('Wallet token-account lamports are invalid');
  }

  for (const [position, address] of swapAccounts.instructionAddresses.entries()) {
    const account = accounts.get(address);
    if (!account || accountOwner(account) !== TOKEN_PROGRAM_ID.toBase58()) continue;
    let token;
    try {
      token = unpackAccount(new PublicKey(address), account, TOKEN_PROGRAM_ID);
    } catch {
      continue;
    }
    const globalIndex = swapAccounts.instructionIndexes[position];
    if (
      (
        token.owner.toBase58() === owner
        || token.delegate?.toBase58() === owner
        || token.closeAuthority?.toBase58() === owner
      )
      && message.isAccountWritable(globalIndex)
      && address !== inputAddress
      && address !== outputAddress
    ) {
      throw policyError('DFlow swap includes an unexpected writable wallet token account');
    }
  }
  return Object.freeze({
    contextSlot: response.context.slot,
    inputAccountLamports: inputAccountInfo.lamports,
    inputAmount: input.amount,
    inputControlState: tokenControlState(input),
    inputTokenAccount: inputAddress,
    ownerAddress: owner,
    ownerLamports: ownerAccount.lamports,
    outputAmount: output?.amount || 0n,
    outputAccountExists: Boolean(output),
    outputAccountLamports: outputAccountInfo?.lamports || 0,
    outputControlState: output ? tokenControlState(output) : null,
    outputTokenAccount: outputAddress,
  });
}

function normalizeSimulatedAccount(address, value, label) {
  if (value == null) return null;
  const data = Array.isArray(value.data) && value.data[1] === 'base64'
    ? Buffer.from(value.data[0], 'base64')
    : null;
  if (!data || addressOf(value.owner) === '') {
    throw policyError(`Solana simulation returned malformed ${label} state`);
  }
  return {
    data,
    executable: value.executable === true,
    lamports: value.lamports,
    owner: new PublicKey(value.owner),
    rentEpoch: value.rentEpoch,
  };
}

export function simulationAccountRequest(tradeState) {
  return {
    encoding: 'base64',
    addresses: [
      tradeState.inputTokenAccount,
      tradeState.outputTokenAccount,
      tradeState.ownerAddress,
    ],
  };
}

/**
 * Proves the simulated transaction spends exactly the reviewed input, sends at
 * least the on-chain minimum to the wallet's derived destination ATA, preserves
 * existing ATA rent, and debits only the exact network fee plus bounded rent
 * for a newly created destination ATA.
 */
export function validateSimulatedTradeEffects(
  simulationValue,
  tradeState,
  quote,
  owner,
  networkFeeLamports,
) {
  if (
    !Array.isArray(simulationValue?.accounts)
    || simulationValue.accounts.length !== 3
    || tradeState.ownerAddress !== owner
    || !Number.isSafeInteger(tradeState.ownerLamports)
    || tradeState.ownerLamports < 0
    || !Number.isSafeInteger(networkFeeLamports)
    || networkFeeLamports < 0
  ) {
    throw policyError('Solana simulation did not return complete reviewed account state');
  }
  const inputInfo = normalizeSimulatedAccount(
    tradeState.inputTokenAccount,
    simulationValue.accounts[0],
    'input token account',
  );
  const outputInfo = normalizeSimulatedAccount(
    tradeState.outputTokenAccount,
    simulationValue.accounts[1],
    'output token account',
  );
  const ownerInfo = normalizeSimulatedAccount(
    tradeState.ownerAddress,
    simulationValue.accounts[2],
    'wallet system account',
  );
  if (!inputInfo) {
    throw policyError('Simulation closed the reviewed input token account');
  }
  const input = decodeClassicTokenAccount(
    tradeState.inputTokenAccount,
    inputInfo,
    'Simulated input token account',
  );
  if (
    input.mint.toBase58() !== quote.inputMint
    || input.owner.toBase58() !== owner
    || inputInfo.lamports !== tradeState.inputAccountLamports
    || !tokenControlStateMatches(input, tradeState.inputControlState)
  ) {
    throw policyError('Simulation changed the reviewed input token account');
  }
  if (!outputInfo) {
    throw policyError('Simulation did not create the reviewed output token account');
  }
  if (
    !ownerInfo
    || accountOwner(ownerInfo) !== SystemProgram.programId.toBase58()
    || ownerInfo.executable === true
    || ownerInfo.data.length !== 0
    || !Number.isSafeInteger(ownerInfo.lamports)
    || ownerInfo.lamports < 0
    || !Number.isSafeInteger(outputInfo.lamports)
    || outputInfo.lamports < 0
  ) {
    throw policyError('Simulation changed the reviewed wallet system account');
  }
  const output = decodeClassicTokenAccount(
    tradeState.outputTokenAccount,
    outputInfo,
    'Simulated output token account',
  );
  if (
    output.mint.toBase58() !== quote.outputMint
    || output.owner.toBase58() !== owner
    || (
      tradeState.outputAccountExists
        ? !tokenControlStateMatches(output, tradeState.outputControlState)
        : !tokenControlStateMatches(output, {
          closeAuthority: null,
          delegate: null,
          delegatedAmount: 0n,
        })
    )
  ) {
    throw policyError('Simulation changed the reviewed output token account');
  }
  const outputAtaRentLamports = tradeState.outputAccountExists
    ? 0
    : outputInfo.lamports;
  if (
    (
      tradeState.outputAccountExists
      && outputInfo.lamports !== tradeState.outputAccountLamports
    )
    || (
      !tradeState.outputAccountExists
      && (
        outputAtaRentLamports < 1
        || outputAtaRentLamports > MAX_OUTPUT_ATA_RENT_LAMPORTS
      )
    )
    || tradeState.inputAmount < input.amount
    || tradeState.inputAmount - input.amount !== BigInt(quote.inAmount)
    || output.amount < tradeState.outputAmount
    || output.amount - tradeState.outputAmount < BigInt(quote.minimumAmountOut)
  ) {
    throw policyError('Simulated token changes do not match the reviewed trade');
  }
  const expectedOwnerDebit = networkFeeLamports + outputAtaRentLamports;
  if (tradeState.ownerLamports - ownerInfo.lamports !== expectedOwnerDebit) {
    throw policyError('Simulated SOL changes do not match the reviewed fee and output-account rent');
  }
  return Object.freeze({
    inputAmountSpent: quote.inAmount,
    minimumAmountReceived: (output.amount - tradeState.outputAmount).toString(),
    outputAtaRentLamports,
    ownerDebitLamports: expectedOwnerDebit,
  });
}
