import { AnchorProvider } from '@coral-xyz/anchor';
import { DECISION_ATTRIBUTION } from '@01resolved/contracts';
import {
  loadAndValidateSolanaRestartSafety,
} from '../core/solana-execution-safety.js';
import {
  DECISION_EXECUTION_PROGRAMS,
  loadAndValidateDecisionExecutionSafety,
} from './solana-program-policy.js';

// Loaded lazily by the shared decision-market controller after explicit intent.
import {
  ManifestClient,
  OrderType,
} from '@cks-systems/manifest-sdk';
import {
  FutarchyClient,
} from '@metadaoproject/programs/futarchy/v0.6';
import {
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Connection,
  PACKET_DATA_SIZE,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  SolanaSignAndSendTransaction,
  SolanaSignTransaction,
} from '@solana/wallet-standard-features';
import { getWallets } from '@wallet-standard/app';
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
} from '@wallet-standard/features';
import base58Module from 'bs58';
import BN from 'bn.js';
import { Buffer } from 'buffer';

export const MAINNET_CHAIN = 'solana:mainnet';
export const MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com';
export const MAX_U64 = (1n << 64n) - 1n;
export const TRANSACTION_REVIEW_MAX_AGE_MS = 90_000;
export const METADAO_FUTARCHY_AMM_FEES = Object.freeze({
  protocolFeeBps: 50,
  lpFeeBps: 0,
});
export {
  DECISION_EXECUTION_PROGRAMS,
  loadAndValidateDecisionExecutionSafety,
  loadAndValidateSolanaRestartSafety,
};

const base58 = base58Module.default || base58Module;
const DECISION_PROGRAM_BY_KEY = new Map(
  DECISION_EXECUTION_PROGRAMS.map(policy => [policy.key, policy]),
);
const MANIFEST_PROGRAM_ID = new PublicKey(
  DECISION_PROGRAM_BY_KEY.get('manifest-core').programId,
);
const MANIFEST_WRAPPER_PROGRAM_ID = new PublicKey(
  DECISION_PROGRAM_BY_KEY.get('manifest-wrapper').programId,
);
const FUTARCHY_V0_6_PROGRAM_ID = new PublicKey(
  DECISION_PROGRAM_BY_KEY.get('metadao-futarchy').programId,
);
const CONDITIONAL_VAULT_PROGRAM_ID = new PublicKey(
  DECISION_PROGRAM_BY_KEY.get('metadao-conditional-vault').programId,
);
const MEMO_PROGRAM_ID = new PublicKey(DECISION_ATTRIBUTION.memoProgramId);
const RECURRING_SCHEDULE_SEED = Buffer.from('schedule');
const RECURRING_SCHEDULE_SPACE = 356;
const RECURRING_INITIALIZE_DISCRIMINATOR = Buffer.from([
  125, 98, 225, 117, 123, 13, 3, 188,
]);
const RECURRING_CANCEL_DISCRIMINATOR = Buffer.from([
  78, 206, 80, 108, 51, 28, 40, 140,
]);
const RECURRING_CLAIM_DISCRIMINATOR = Buffer.from([
  150, 201, 54, 233, 4, 59, 65, 32,
]);
const RECURRING_ACCOUNT_DISCRIMINATOR = Buffer.from([
  46, 46, 9, 80, 131, 138, 250, 135,
]);
const MIN_RECURRING_INTERVAL_SECONDS = 3_600;
const MAX_RECURRING_CYCLES = 365;
const DEFAULT_KEEPER_FEE_LAMPORTS = 50_000n;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const LEGACY_WALLET_CANDIDATES = Object.freeze([
  ['Phantom', runtime => runtime.phantom?.solana],
  ['Solflare', runtime => runtime.solflare],
  ['Backpack', runtime => runtime.backpack?.solana],
  ['Solana wallet', runtime => runtime.solana],
]);

function safeAddress(value) {
  const address = String(value || '').trim();
  if (!ADDRESS_RE.test(address)) return '';
  try {
    const publicKey = new PublicKey(address);
    return publicKey.toBase58() === address ? address : '';
  } catch (_) {
    return '';
  }
}

function safeSignature(value) {
  const signature = String(value || '').trim();
  if (!SIGNATURE_RE.test(signature)) return '';
  try {
    const decoded = base58.decode(signature);
    return decoded.length === 64 && base58.encode(decoded) === signature
      ? signature
      : '';
  } catch (_) {
    return '';
  }
}

function publicKeyAddress(value) {
  if (!value) return '';
  const address = typeof value.toBase58 === 'function' ? value.toBase58() : String(value);
  return safeAddress(address);
}

function transactionInstructionEquals(left, right) {
  return (
    left?.programId?.equals?.(right?.programId)
    && Buffer.from(left?.data || []).equals(Buffer.from(right?.data || []))
    && left.keys?.length === right.keys?.length
    && left.keys.every((meta, index) => {
      const candidate = right.keys[index];
      return (
        meta.pubkey.equals(candidate?.pubkey)
        && meta.isSigner === candidate.isSigner
        && meta.isWritable === candidate.isWritable
      );
    })
  );
}

function walletSupportsMainnet(wallet) {
  return Array.isArray(wallet?.chains)
    && wallet.chains.some(chain => chain === MAINNET_CHAIN);
}

function walletCanConnect(wallet) {
  return typeof wallet?.features?.[StandardConnect]?.connect === 'function';
}

function walletCanSign(wallet, account = null) {
  const accountFeatures = Array.isArray(account?.features) ? account.features : null;
  const supportsSignAndSend = (
    typeof wallet?.features?.[SolanaSignAndSendTransaction]?.signAndSendTransaction
      === 'function'
    && (!accountFeatures || accountFeatures.includes(SolanaSignAndSendTransaction))
  );
  const supportsSign = (
    typeof wallet?.features?.[SolanaSignTransaction]?.signTransaction === 'function'
    && (!accountFeatures || accountFeatures.includes(SolanaSignTransaction))
  );
  return supportsSignAndSend || supportsSign;
}

function walletCanSignTransaction(wallet, account = null) {
  const accountFeatures = Array.isArray(account?.features) ? account.features : null;
  return (
    typeof wallet?.features?.[SolanaSignTransaction]?.signTransaction === 'function'
    && (!accountFeatures || accountFeatures.includes(SolanaSignTransaction))
  );
}

function legacyWalletName(provider, fallback) {
  if (provider?.isPhantom) return 'Phantom';
  if (provider?.isSolflare) return 'Solflare';
  if (provider?.isBackpack) return 'Backpack';
  return String(provider?.name || fallback || 'Solana wallet');
}

export function discoverWalletOptions(
  runtime = globalThis.window,
  registry = null,
) {
  const options = [];
  const names = new Set();
  let wallets = [];
  try {
    wallets = (registry || getWallets()).get();
  } catch (_) {
    wallets = [];
  }
  for (const wallet of wallets) {
    if (!walletSupportsMainnet(wallet) || !walletCanConnect(wallet)) continue;
    const name = String(wallet.name || 'Solana wallet');
    const key = name.toLowerCase();
    if (names.has(key)) continue;
    names.add(key);
    options.push({
      id: `standard:${key.replace(/[^a-z0-9]+/g, '-')}`,
      kind: 'standard',
      name,
      icon: typeof wallet.icon === 'string' ? wallet.icon : '',
      canTransact: walletCanSign(wallet),
      canSignTransaction: walletCanSignTransaction(wallet),
      wallet,
    });
  }

  for (const [fallbackName, readProvider] of LEGACY_WALLET_CANDIDATES) {
    const provider = readProvider(runtime || {});
    if (!provider || typeof provider.connect !== 'function') continue;
    const name = legacyWalletName(provider, fallbackName);
    const key = name.toLowerCase();
    if (names.has(key)) continue;
    names.add(key);
    options.push({
      id: `legacy:${key.replace(/[^a-z0-9]+/g, '-')}`,
      kind: 'legacy',
      name,
      icon: '',
      canTransact: typeof provider.signAndSendTransaction === 'function'
        || typeof provider.signTransaction === 'function',
      canSignTransaction: typeof provider.signTransaction === 'function',
      provider,
    });
  }
  return options;
}

function selectMainnetAccount(accounts = []) {
  return accounts.find(account => (
    safeAddress(account?.address)
    && Array.isArray(account?.chains)
    && account.chains.includes(MAINNET_CHAIN)
  )) || null;
}

export async function connectWalletOption(option) {
  if (option?.kind === 'standard') {
    const wallet = option.wallet;
    const feature = wallet?.features?.[StandardConnect];
    if (typeof feature?.connect !== 'function') {
      throw new Error('Wallet does not implement Wallet Standard connection');
    }
    const result = await feature.connect();
    const account = selectMainnetAccount(result?.accounts || wallet.accounts);
    if (!account) throw new Error('Wallet did not authorize a Solana mainnet account');
    const adapter = {
      kind: 'standard',
      name: String(wallet.name || option.name || 'Solana wallet'),
      address: account.address,
      account,
      wallet,
      canTransact: walletCanSign(wallet, account),
      canSignTransaction: walletCanSignTransaction(wallet, account),
      unsubscribe: null,
      async disconnect() {
        const disconnect = wallet.features?.[StandardDisconnect]?.disconnect;
        if (typeof disconnect === 'function') await disconnect();
      },
      subscribe(listener) {
        const on = wallet.features?.[StandardEvents]?.on;
        if (typeof on !== 'function') return () => {};
        const off = on('change', ({ accounts }) => {
          if (!accounts) return;
          const next = selectMainnetAccount(accounts);
          listener(next?.address || '');
        });
        adapter.unsubscribe = off;
        return off;
      },
    };
    return adapter;
  }

  const provider = option?.provider;
  if (!provider || typeof provider.connect !== 'function') {
    throw new Error('Legacy wallet provider is unavailable');
  }
  const response = await provider.connect();
  const address = publicKeyAddress(response?.publicKey || provider.publicKey);
  if (!address) throw new Error('Wallet returned an invalid Solana public key');
  const account = {
    address,
    publicKey: new PublicKey(address).toBytes(),
    chains: [MAINNET_CHAIN],
    features: [],
  };
  const adapter = {
    kind: 'legacy',
    name: legacyWalletName(provider, option.name),
    address,
    account,
    provider,
    canTransact: typeof provider.signAndSendTransaction === 'function'
      || typeof provider.signTransaction === 'function',
    canSignTransaction: typeof provider.signTransaction === 'function',
    unsubscribe: null,
    async disconnect() {
      if (typeof provider.disconnect === 'function') await provider.disconnect();
    },
    subscribe(listener) {
      if (typeof provider.on !== 'function') return () => {};
      const handle = (publicKey) => listener(publicKeyAddress(publicKey));
      provider.on('accountChanged', handle);
      const off = () => {
        if (typeof provider.off === 'function') provider.off('accountChanged', handle);
        else if (typeof provider.removeListener === 'function') {
          provider.removeListener('accountChanged', handle);
        }
      };
      adapter.unsubscribe = off;
      return off;
    },
  };
  return adapter;
}

export function parseUiAmount(value, decimals) {
  const text = String(value ?? '').trim();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    throw new Error('Token decimals are unsupported');
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw new Error('Enter a positive decimal amount');
  }
  const [whole, rawFraction = ''] = text.split('.');
  const excess = rawFraction.slice(decimals);
  if (excess && /[1-9]/.test(excess)) {
    throw new Error(`Amount supports at most ${decimals} decimal places`);
  }
  const fraction = rawFraction.slice(0, decimals).padEnd(decimals, '0');
  const raw = BigInt(`${whole}${fraction}` || '0');
  if (raw <= 0n) throw new Error('Amount must be greater than zero');
  if (raw > MAX_U64) throw new Error('Amount exceeds the program limit');
  return raw;
}

export function formatRawAmount(rawValue, decimals, maximumFractionDigits = 6) {
  const raw = BigInt(rawValue);
  const digits = raw.toString().padStart(decimals + 1, '0');
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals
    ? digits.slice(-decimals).slice(0, maximumFractionDigits).replace(/0+$/, '')
    : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

function encodeU64(value, label) {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > MAX_U64) throw new Error(`${label} is outside the u64 range`);
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(parsed);
  return bytes;
}

function encodeI64(value, label) {
  const parsed = BigInt(value);
  const minimum = -(1n << 63n);
  const maximum = (1n << 63n) - 1n;
  if (parsed < minimum || parsed > maximum) throw new Error(`${label} is outside the i64 range`);
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(parsed);
  return bytes;
}

function recurringCycleCount(value) {
  const cycles = Number(value);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > MAX_RECURRING_CYCLES) {
    throw new Error(`Recurring schedules support 1–${MAX_RECURRING_CYCLES} executions`);
  }
  return cycles;
}

function recurringInterval(value) {
  const interval = Number(value);
  if (!Number.isInteger(interval) || interval < MIN_RECURRING_INTERVAL_SECONDS) {
    throw new Error('Recurring schedules must run no more often than hourly');
  }
  return interval;
}

function scaledPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error('A positive order-book reference price is required');
  }
  return parseUiAmount(number.toFixed(12), 12);
}

export function calculateRecurringMinimumOutput({
  amountRaw,
  baseDecimals,
  quoteDecimals,
  tokenPrice,
  side,
  slippageBps,
}) {
  const input = BigInt(amountRaw);
  if (input <= 0n || input > MAX_U64) throw new Error('Recurring input amount is invalid');
  if (!Number.isInteger(baseDecimals) || !Number.isInteger(quoteDecimals)) {
    throw new Error('Recurring market decimals are invalid');
  }
  if (side !== 'buy' && side !== 'sell') throw new Error('Select buy or sell');
  const slippage = Number(slippageBps);
  if (!Number.isInteger(slippage) || slippage < 1 || slippage > 5_000) {
    throw new Error('Slippage must be between 0.01% and 50%');
  }

  const priceScale = 1_000_000_000_000n;
  const reference = scaledPrice(tokenPrice);
  const baseScale = 10n ** BigInt(baseDecimals);
  const quoteScale = 10n ** BigInt(quoteDecimals);
  let minimumOutput;
  if (side === 'buy') {
    const maximumPrice = (
      reference * BigInt(10_000 + slippage) + 9_999n
    ) / 10_000n;
    minimumOutput = input * baseScale * priceScale
      / (quoteScale * maximumPrice);
  } else {
    const minimumPrice = reference * BigInt(10_000 - slippage) / 10_000n;
    minimumOutput = input * minimumPrice * quoteScale
      / (baseScale * priceScale);
  }
  if (minimumOutput <= 0n || minimumOutput > MAX_U64) {
    throw new Error('Recurring amount is too small or too large for this market');
  }
  return minimumOutput;
}

export function deriveRecurringScheduleAddresses({
  programId,
  owner,
  proposal,
  scheduleId,
  inputMint,
  outputMint,
}) {
  const recurringProgram = requireAddress(programId, 'Recurring program');
  const ownerPublicKey = requireAddress(owner, 'Wallet');
  const proposalPublicKey = requireAddress(proposal, 'Proposal');
  const inputMintPublicKey = requireAddress(inputMint, 'Recurring input mint');
  const outputMintPublicKey = requireAddress(outputMint, 'Recurring output mint');
  const scheduleIdBytes = encodeU64(scheduleId, 'Schedule identifier');
  const [schedule, bump] = PublicKey.findProgramAddressSync([
    RECURRING_SCHEDULE_SEED,
    ownerPublicKey.toBuffer(),
    proposalPublicKey.toBuffer(),
    scheduleIdBytes,
  ], recurringProgram);
  return {
    programId: recurringProgram,
    schedule,
    bump,
    inputVault: getAssociatedTokenAddressSync(
      inputMintPublicKey,
      schedule,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    outputVault: getAssociatedTokenAddressSync(
      outputMintPublicKey,
      schedule,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  };
}

export function createRecurringInitializeInstruction({
  programId,
  owner,
  schedule,
  proposal,
  market,
  inputMint,
  outputMint,
  ownerInput,
  inputVault,
  outputVault,
  scheduleId,
  amountPerCycle,
  minimumOutputPerCycle,
  intervalSeconds,
  startAt,
  expiresAt,
  totalCycles,
  isBaseIn,
  keeperFeeLamports = DEFAULT_KEEPER_FEE_LAMPORTS,
}) {
  const cycles = recurringCycleCount(totalCycles);
  const interval = recurringInterval(intervalSeconds);
  const cycleBytes = Buffer.alloc(4);
  cycleBytes.writeUInt32LE(cycles);
  const data = Buffer.concat([
    RECURRING_INITIALIZE_DISCRIMINATOR,
    encodeU64(scheduleId, 'Schedule identifier'),
    encodeU64(amountPerCycle, 'Per-cycle amount'),
    encodeU64(minimumOutputPerCycle, 'Minimum per-cycle output'),
    encodeI64(interval, 'Schedule interval'),
    encodeI64(startAt, 'Schedule start'),
    encodeI64(expiresAt, 'Schedule expiry'),
    cycleBytes,
    Buffer.from([isBaseIn ? 1 : 0]),
    encodeU64(keeperFeeLamports, 'Keeper reimbursement'),
  ]);

  return new TransactionInstruction({
    programId: requireAddress(programId, 'Recurring program'),
    keys: [
      { pubkey: requireAddress(owner, 'Wallet'), isSigner: true, isWritable: true },
      { pubkey: requireAddress(schedule, 'Schedule'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(proposal, 'Proposal'), isSigner: false, isWritable: false },
      { pubkey: requireAddress(market, 'Manifest market'), isSigner: false, isWritable: false },
      { pubkey: requireAddress(inputMint, 'Recurring input mint'), isSigner: false, isWritable: false },
      { pubkey: requireAddress(outputMint, 'Recurring output mint'), isSigner: false, isWritable: false },
      { pubkey: requireAddress(ownerInput, 'Conditional funding account'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(inputVault, 'Schedule input vault'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(outputVault, 'Schedule output vault'), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function decodeRecurringScheduleAccount(address, accountInfo) {
  const scheduleAddress = requireAddress(address, 'Schedule');
  const data = Buffer.from(accountInfo?.data || []);
  if (data.length !== RECURRING_SCHEDULE_SPACE) {
    throw new Error('Recurring schedule data size is invalid');
  }
  if (!data.subarray(0, 8).equals(RECURRING_ACCOUNT_DISCRIMINATOR)) {
    throw new Error('Recurring schedule discriminator is invalid');
  }
  let offset = 8;
  const readU8 = () => data[offset++];
  const readPublicKey = () => {
    const value = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    return value;
  };
  const readU64 = () => {
    const value = data.readBigUInt64LE(offset);
    offset += 8;
    return value;
  };
  const readI64 = () => {
    const value = data.readBigInt64LE(offset);
    offset += 8;
    return value;
  };
  const readU32 = () => {
    const value = data.readUInt32LE(offset);
    offset += 4;
    return value;
  };

  const version = readU8();
  const bump = readU8();
  const activeValue = readU8();
  const isBaseInValue = readU8();
  if (version !== 1) {
    throw new Error('Recurring schedule version is unsupported');
  }
  if (activeValue > 1 || isBaseInValue > 1) {
    throw new Error('Recurring schedule flags are invalid');
  }
  const active = activeValue === 1;
  const isBaseIn = isBaseInValue === 1;
  const owner = readPublicKey();
  const proposal = readPublicKey();
  const market = readPublicKey();
  const baseMint = readPublicKey();
  const quoteMint = readPublicKey();
  const inputVault = readPublicKey();
  const outputVault = readPublicKey();
  const scheduleId = readU64();
  const amountPerCycle = readU64();
  const minimumOutputPerCycle = readU64();
  const intervalSeconds = readI64();
  const nextExecutionAt = readI64();
  const expiresAt = readI64();
  const createdAt = readI64();
  const lastExecutionAt = readI64();
  const totalCycles = readU32();
  const cyclesExecuted = readU32();
  const totalInputSpent = readU64();
  const totalOutputReceived = readU64();
  const keeperFeeLamports = readU64();
  const reserved = data.subarray(offset, offset + 24);
  if (reserved.length !== 24 || reserved.some(value => value !== 0)) {
    throw new Error('Recurring schedule reserved bytes are invalid');
  }
  if (
    owner.equals(SystemProgram.programId)
    || proposal.equals(SystemProgram.programId)
    || market.equals(SystemProgram.programId)
    || baseMint.equals(SystemProgram.programId)
    || quoteMint.equals(SystemProgram.programId)
    || baseMint.equals(quoteMint)
  ) {
    throw new Error('Recurring schedule contains an invalid account identity');
  }
  if (
    amountPerCycle === 0n
    || minimumOutputPerCycle === 0n
    || intervalSeconds < BigInt(MIN_RECURRING_INTERVAL_SECONDS)
    || intervalSeconds > 30n * 24n * 60n * 60n
    || totalCycles < 1
    || totalCycles > MAX_RECURRING_CYCLES
    || cyclesExecuted > totalCycles
    || keeperFeeLamports < 10_000n
    || keeperFeeLamports > 1_000_000n
  ) {
    throw new Error('Recurring schedule limits are invalid');
  }
  const timestamps = [
    intervalSeconds,
    nextExecutionAt,
    expiresAt,
    createdAt,
    lastExecutionAt,
  ].map(Number);
  if (timestamps.some(value => !Number.isSafeInteger(value))) {
    throw new Error('Recurring schedule timestamps are invalid');
  }
  const inputMint = isBaseIn ? baseMint : quoteMint;
  const outputMint = isBaseIn ? quoteMint : baseMint;
  return {
    address: scheduleAddress.toBase58(),
    version,
    bump,
    active,
    isBaseIn,
    side: isBaseIn ? 'sell' : 'buy',
    owner: owner.toBase58(),
    proposal: proposal.toBase58(),
    market: market.toBase58(),
    baseMint: baseMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    inputVault: inputVault.toBase58(),
    outputVault: outputVault.toBase58(),
    scheduleId: scheduleId.toString(),
    amountPerCycleRaw: amountPerCycle.toString(),
    minimumOutputPerCycleRaw: minimumOutputPerCycle.toString(),
    intervalSeconds: timestamps[0],
    nextExecutionAt: timestamps[1],
    expiresAt: timestamps[2],
    createdAt: timestamps[3],
    lastExecutionAt: timestamps[4],
    totalCycles,
    cyclesExecuted,
    totalInputSpentRaw: totalInputSpent.toString(),
    totalOutputReceivedRaw: totalOutputReceived.toString(),
    keeperFeeLamports: keeperFeeLamports.toString(),
  };
}

export async function loadRecurringSchedules({
  connection,
  recurringProgramId,
  owner,
  proposal,
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  const program = requireAddress(recurringProgramId, 'Recurring program');
  const ownerPublicKey = requireAddress(owner, 'Wallet');
  const proposalPublicKey = requireAddress(proposal, 'Proposal');
  const accounts = await connection.getProgramAccounts(program, {
    commitment: 'confirmed',
    filters: [
      { memcmp: { offset: 12, bytes: ownerPublicKey.toBase58() } },
      { memcmp: { offset: 44, bytes: proposalPublicKey.toBase58() } },
    ],
  });
  const schedules = accounts.map(({ pubkey, account }) => {
    if (!account.owner.equals(program)) {
      throw new Error('Recurring schedule has an unexpected program owner');
    }
    const schedule = decodeRecurringScheduleAccount(pubkey, account);
    const derived = deriveRecurringScheduleAddresses({
      programId: program.toBase58(),
      owner: schedule.owner,
      proposal: schedule.proposal,
      scheduleId: schedule.scheduleId,
      inputMint: schedule.inputMint,
      outputMint: schedule.outputMint,
    });
    if (
      !derived.schedule.equals(pubkey)
      || schedule.bump !== derived.bump
      || schedule.inputVault !== derived.inputVault.toBase58()
      || schedule.outputVault !== derived.outputVault.toBase58()
    ) {
      throw new Error('Recurring schedule vault derivation is invalid');
    }
    return schedule;
  });
  const vaultAddresses = schedules.flatMap(schedule => ([
    new PublicKey(schedule.inputVault),
    new PublicKey(schedule.outputVault),
  ]));
  const vaultInfos = [];
  for (let index = 0; index < vaultAddresses.length; index += 20) {
    const batch = await connection.getMultipleAccountsInfo(
      vaultAddresses.slice(index, index + 20),
      'confirmed',
    );
    vaultInfos.push(...batch);
  }
  return schedules.map((schedule, index) => {
    const inputVault = new PublicKey(schedule.inputVault);
    const outputVault = new PublicKey(schedule.outputVault);
    const inputMint = new PublicKey(schedule.inputMint);
    const outputMint = new PublicKey(schedule.outputMint);
    const scheduleAddress = new PublicKey(schedule.address);
    const inputVaultInfo = vaultInfos[index * 2];
    const outputVaultInfo = vaultInfos[index * 2 + 1];
    assertAssociatedTokenAccount(
      inputVault,
      inputVaultInfo,
      inputMint,
      scheduleAddress,
      'Recurring input vault',
    );
    assertAssociatedTokenAccount(
      outputVault,
      outputVaultInfo,
      outputMint,
      scheduleAddress,
      'Recurring output vault',
    );
    if (!inputVaultInfo || !outputVaultInfo) {
      throw new Error('Recurring schedule vault balances are unavailable');
    }
    return {
      ...schedule,
      unspentInputRaw: unpackAccount(
        inputVault,
        inputVaultInfo,
        TOKEN_PROGRAM_ID,
      ).amount.toString(),
      unclaimedOutputRaw: unpackAccount(
        outputVault,
        outputVaultInfo,
        TOKEN_PROGRAM_ID,
      ).amount.toString(),
    };
  }).sort((left, right) => right.createdAt - left.createdAt);
}

export function createRecurringClaimInstruction({
  programId,
  owner,
  schedule,
  outputMint,
  outputVault,
  ownerOutput,
}) {
  return new TransactionInstruction({
    programId: requireAddress(programId, 'Recurring program'),
    keys: [
      { pubkey: requireAddress(owner, 'Wallet'), isSigner: true, isWritable: true },
      { pubkey: requireAddress(schedule, 'Schedule'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(outputMint, 'Recurring output mint'), isSigner: false, isWritable: false },
      { pubkey: requireAddress(outputVault, 'Schedule output vault'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(ownerOutput, 'Owner output account'), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: RECURRING_CLAIM_DISCRIMINATOR,
  });
}

export function createRecurringCancelInstruction({
  programId,
  owner,
  schedule,
  inputMint,
  outputMint,
  inputVault,
  outputVault,
  ownerInput,
  ownerOutput,
}) {
  return new TransactionInstruction({
    programId: requireAddress(programId, 'Recurring program'),
    keys: [
      { pubkey: requireAddress(owner, 'Wallet'), isSigner: true, isWritable: true },
      { pubkey: requireAddress(schedule, 'Schedule'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(inputMint, 'Recurring input mint'), isSigner: false, isWritable: false },
      { pubkey: requireAddress(outputMint, 'Recurring output mint'), isSigner: false, isWritable: false },
      { pubkey: requireAddress(inputVault, 'Schedule input vault'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(outputVault, 'Schedule output vault'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(ownerInput, 'Owner input account'), isSigner: false, isWritable: true },
      { pubkey: requireAddress(ownerOutput, 'Owner output account'), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: RECURRING_CANCEL_DISCRIMINATOR,
  });
}

export function quoteConditionalAmm({
  amount,
  inputDecimals,
  outputDecimals,
  inputReserves,
  outputReserves,
  slippageBps,
}) {
  const inputRaw = parseUiAmount(amount, inputDecimals);
  const inputReserveRaw = parseUiAmount(String(inputReserves), inputDecimals);
  const outputReserveRaw = parseUiAmount(String(outputReserves), outputDecimals);
  const boundedSlippage = Number(slippageBps);
  if (!Number.isInteger(boundedSlippage)
      || boundedSlippage < 1
      || boundedSlippage > 5_000) {
    throw new Error('Slippage must be between 0.01% and 50%');
  }

  // The current MetaDAO v0.6.1 program takes 50 bps as protocol revenue and
  // applies no LP fee. Keep the fee model explicit so quote presentation stays
  // aligned with the deployed program's integer arithmetic.
  const protocolFeeBps = BigInt(METADAO_FUTARCHY_AMM_FEES.protocolFeeBps);
  const lpFeeBps = BigInt(METADAO_FUTARCHY_AMM_FEES.lpFeeBps);
  const inputAfterProtocolFee = inputRaw * (10_000n - protocolFeeBps) / 10_000n;
  const effectiveInputRaw = inputAfterProtocolFee * (10_000n - lpFeeBps) / 10_000n;
  const outputRaw = effectiveInputRaw * outputReserveRaw
    / (inputReserveRaw + effectiveInputRaw);
  const minimumOutputRaw = outputRaw * BigInt(10_000 - boundedSlippage) / 10_000n;
  if (outputRaw <= 0n || minimumOutputRaw <= 0n) {
    throw new Error('Trade amount is too small for this market');
  }
  return {
    inputRaw,
    outputRaw,
    minimumOutputRaw,
    outputAmount: formatRawAmount(outputRaw, outputDecimals),
    minimumOutputAmount: formatRawAmount(minimumOutputRaw, outputDecimals),
    protocolFeeBps: METADAO_FUTARCHY_AMM_FEES.protocolFeeBps,
    lpFeeBps: METADAO_FUTARCHY_AMM_FEES.lpFeeBps,
    nominalTotalFeeBps: METADAO_FUTARCHY_AMM_FEES.protocolFeeBps
      + METADAO_FUTARCHY_AMM_FEES.lpFeeBps,
    effectiveFeeRaw: inputRaw - effectiveInputRaw,
    conservative: true,
  };
}

function ceilDivide(numerator, denominator) {
  if (denominator <= 0n) throw new Error('Quote denominator is invalid');
  return (numerator + denominator - 1n) / denominator;
}

function tokenNumberToRawFloor(value, decimals, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0n;
  const scale = 10 ** decimals;
  const scaled = number * scale;
  if (!Number.isSafeInteger(Math.floor(scaled))) {
    throw new Error(`${label} exceeds the safe order-book quote range`);
  }
  return BigInt(Math.floor(scaled));
}

function priceNumberToScaledRaw(value, scaleDecimals = 12, roundUp = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0n;
  const scale = 10 ** scaleDecimals;
  const scaled = number * scale;
  const rounded = roundUp ? Math.ceil(scaled) : Math.floor(scaled);
  if (!Number.isSafeInteger(rounded)) return 0n;
  return BigInt(rounded);
}

export function quoteManifestOrderbook({
  amount,
  amountRaw,
  inputDecimals,
  outputDecimals,
  side,
  bids = [],
  asks = [],
  slippageBps,
}) {
  if (side !== 'buy' && side !== 'sell') throw new Error('Select buy or sell');
  if (!Number.isInteger(inputDecimals) || !Number.isInteger(outputDecimals)) {
    throw new Error('Order-book decimals are invalid');
  }
  const boundedSlippage = Number(slippageBps);
  if (!Number.isInteger(boundedSlippage)
      || boundedSlippage < 1
      || boundedSlippage > 5_000) {
    throw new Error('Slippage must be between 0.01% and 50%');
  }
  const requestedInputRaw = amountRaw == null
    ? parseUiAmount(amount, inputDecimals)
    : BigInt(amountRaw);
  if (requestedInputRaw <= 0n || requestedInputRaw > MAX_U64) {
    throw new Error('Order-book input amount is invalid');
  }

  const priceScaleDecimals = 12;
  const priceScale = 10n ** BigInt(priceScaleDecimals);
  const baseDecimals = side === 'buy' ? outputDecimals : inputDecimals;
  const quoteDecimals = side === 'buy' ? inputDecimals : outputDecimals;
  const baseScale = 10n ** BigInt(baseDecimals);
  const quoteScale = 10n ** BigInt(quoteDecimals);
  const levels = (side === 'buy' ? asks : bids)
    .map((order) => {
      const price = Number(order?.tokenPrice ?? order?.price);
      const baseAmount = Number(order?.numBaseTokens ?? order?.amount);
      return {
        price,
        priceRaw: priceNumberToScaledRaw(
          price,
          priceScaleDecimals,
          side === 'buy',
        ),
        baseRaw: tokenNumberToRawFloor(
          baseAmount,
          baseDecimals,
          'Manifest order size',
        ),
      };
    })
    .filter(level => level.priceRaw > 0n && level.baseRaw > 0n)
    .sort((left, right) => (
      side === 'buy'
        ? left.price - right.price
        : right.price - left.price
    ));

  let remainingInputRaw = requestedInputRaw;
  let outputRaw = 0n;
  let inputConsumedRaw = 0n;
  let levelsUsed = 0;
  for (const level of levels) {
    if (remainingInputRaw <= 0n) break;
    if (side === 'buy') {
      const quoteForFullLevel = ceilDivide(
        level.baseRaw * level.priceRaw * quoteScale,
        baseScale * priceScale,
      );
      if (quoteForFullLevel <= remainingInputRaw) {
        outputRaw += level.baseRaw;
        inputConsumedRaw += quoteForFullLevel;
        remainingInputRaw -= quoteForFullLevel;
        levelsUsed += 1;
        continue;
      }
      const partialBaseRaw = remainingInputRaw * baseScale * priceScale
        / (level.priceRaw * quoteScale);
      if (partialBaseRaw > 0n) {
        outputRaw += partialBaseRaw;
        inputConsumedRaw += remainingInputRaw;
        remainingInputRaw = 0n;
        levelsUsed += 1;
      }
      break;
    }

    const baseFillRaw = remainingInputRaw < level.baseRaw
      ? remainingInputRaw
      : level.baseRaw;
    const quoteOutputRaw = baseFillRaw * level.priceRaw * quoteScale
      / (baseScale * priceScale);
    if (quoteOutputRaw <= 0n) continue;
    outputRaw += quoteOutputRaw;
    inputConsumedRaw += baseFillRaw;
    remainingInputRaw -= baseFillRaw;
    levelsUsed += 1;
  }

  if (outputRaw <= 0n) {
    return {
      inputRaw: requestedInputRaw,
      inputConsumedRaw,
      outputRaw: 0n,
      minimumOutputRaw: 0n,
      outputAmount: '0',
      minimumOutputAmount: '0',
      fullFill: false,
      levelsUsed,
      conservative: true,
    };
  }
  const minimumOutputRaw = outputRaw
    * BigInt(10_000 - boundedSlippage)
    / 10_000n;
  return {
    inputRaw: requestedInputRaw,
    inputConsumedRaw,
    outputRaw,
    minimumOutputRaw,
    outputAmount: formatRawAmount(outputRaw, outputDecimals),
    minimumOutputAmount: formatRawAmount(minimumOutputRaw, outputDecimals),
    fullFill: remainingInputRaw === 0n,
    levelsUsed,
    conservative: true,
  };
}

export function selectBestDecisionRoute({ ammQuote, manifestQuote = null }) {
  if (!ammQuote || BigInt(ammQuote.outputRaw || 0) <= 0n) {
    throw new Error('A verified MetaDAO AMM quote is required');
  }
  const manifestEligible = !!manifestQuote
    && manifestQuote.fullFill === true
    && BigInt(manifestQuote.outputRaw || 0) > 0n
    && BigInt(manifestQuote.minimumOutputRaw || 0) > 0n;
  const useManifest = manifestEligible
    && BigInt(manifestQuote.outputRaw) > BigInt(ammQuote.outputRaw);
  return {
    route: useManifest ? 'manifest' : 'futarchy_amm',
    quote: useManifest ? manifestQuote : ammQuote,
    candidates: [
      {
        route: 'futarchy_amm',
        eligible: true,
        outputRaw: BigInt(ammQuote.outputRaw),
      },
      ...(manifestQuote ? [{
        route: 'manifest',
        eligible: manifestEligible,
        outputRaw: BigInt(manifestQuote.outputRaw || 0),
      }] : []),
    ],
  };
}

function requireAddress(value, label) {
  const address = safeAddress(value);
  if (!address) throw new Error(`${label} is not a valid Solana address`);
  return new PublicKey(address);
}

function createReadOnlyAnchorProvider(connection, publicKey) {
  const unsupported = async () => {
    throw new Error('Read-only transaction builder cannot sign');
  };
  return new AnchorProvider(connection, {
    publicKey,
    signTransaction: unsupported,
    signAllTransactions: unsupported,
  }, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

async function finalizeTransaction(transaction, connection, feePayer, additionalSigners = []) {
  const latest = await connection.getLatestBlockhash('confirmed');
  transaction.feePayer = feePayer;
  transaction.recentBlockhash = latest.blockhash;
  if (additionalSigners.length) transaction.partialSign(...additionalSigners);
  const feeResponse = await connection.getFeeForMessage(
    transaction.compileMessage(),
    'confirmed',
  );
  const networkFeeLamports = Number.isFinite(feeResponse?.value)
    ? feeResponse.value
    : null;
  return {
    transaction,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    builtAt: Date.now(),
    networkFeeLamports,
    networkFeeSol: networkFeeLamports == null ? null : networkFeeLamports / 1_000_000_000,
  };
}

function assertDerivedMint(actual, expected, label) {
  if (actual.toBase58() !== expected.toBase58()) {
    throw new Error(`${label} does not match the proposal-derived mint`);
  }
}

function assertAssociatedTokenAccount(account, accountInfo, mint, owner, label) {
  if (!accountInfo) return;
  if (!accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error(`${label} has an unexpected program owner`);
  }
  const decoded = unpackAccount(account, accountInfo, TOKEN_PROGRAM_ID);
  if (!decoded.mint.equals(mint) || !decoded.owner.equals(owner)) {
    throw new Error(`${label} does not match the reviewed mint and wallet`);
  }
}

function assertProgramAccount(accountInfo, expectedOwner, label) {
  if (!accountInfo) throw new Error(`${label} was not found on Solana mainnet`);
  if (!accountInfo.owner?.equals?.(expectedOwner)) {
    throw new Error(`${label} has an unexpected program owner`);
  }
  if (!accountInfo.data || accountInfo.data.length < 8) {
    throw new Error(`${label} data is invalid`);
  }
}

function assertPublicKeyField(actual, expected, label) {
  if (!actual?.equals?.(expected)) {
    throw new Error(`${label} does not match the proposal-derived account`);
  }
}

function boundedU32(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 0xffff_ffff) {
    throw new Error(`${label} is invalid`);
  }
  return number;
}

function proposalStateKey(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return '';
  return Object.keys(state).find(key => ['pending', 'passed', 'failed'].includes(key)) || '';
}

function assertOptionalAddress(value, expected, label) {
  const address = safeAddress(value);
  if (address && address !== expected.toBase58()) {
    throw new Error(`${label} conflicts with the verified on-chain account`);
  }
}

function formatPositionLabel(branch, asset, ticker) {
  return `${branch.toUpperCase()} ${asset === 'base' ? ticker : 'USDC'}`;
}

async function loadOpenConditionalMarketContext({
  connection,
  trader,
  market,
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  const dao = requireAddress(market?.daoAddress, 'DAO');
  const proposal = requireAddress(market?.proposal?.id, 'Proposal');
  const baseMint = requireAddress(market?.baseMint, 'Base mint');
  const quoteMint = requireAddress(market?.quoteMint, 'Quote mint');
  const baseDecimals = Number(market?.baseDecimals);
  const quoteDecimals = Number(market?.quoteDecimals);
  if (
    !Number.isInteger(baseDecimals)
    || baseDecimals < 0
    || baseDecimals > 30
    || !Number.isInteger(quoteDecimals)
    || quoteDecimals < 0
    || quoteDecimals > 30
  ) {
    throw new Error('Prediction market decimals are invalid');
  }

  const provider = createReadOnlyAnchorProvider(connection, trader);
  const client = FutarchyClient.createClient({ provider });
  if (!client.getProgramId().equals(FUTARCHY_V0_6_PROGRAM_ID)) {
    throw new Error('Unexpected MetaDAO futarchy program');
  }
  const derived = client.getProposalPdas(proposal, baseMint, quoteMint, dao);
  const indexedMints = [
    ['passBaseMint', derived.passBaseMint, 'PASS base mint'],
    ['passQuoteMint', derived.passQuoteMint, 'PASS quote mint'],
    ['failBaseMint', derived.failBaseMint, 'FAIL base mint'],
    ['failQuoteMint', derived.failQuoteMint, 'FAIL quote mint'],
  ];
  for (const [field, expected, label] of indexedMints) {
    assertOptionalAddress(market?.proposal?.[field], expected, `Indexed ${label}`);
  }
  assertOptionalAddress(market?.proposal?.baseVault, derived.baseVault, 'Indexed base vault');
  assertOptionalAddress(market?.proposal?.quoteVault, derived.quoteVault, 'Indexed quote vault');

  const vaultProgramId = client.vaultClient.vaultProgram.programId;
  if (!vaultProgramId.equals(CONDITIONAL_VAULT_PROGRAM_ID)) {
    throw new Error('Unexpected MetaDAO conditional vault program');
  }
  const [
    proposalInfo,
    daoInfo,
    questionInfo,
    baseVaultInfo,
    quoteVaultInfo,
    baseMintInfo,
    quoteMintInfo,
  ] = await connection.getMultipleAccountsInfo([
    proposal,
    dao,
    derived.question,
    derived.baseVault,
    derived.quoteVault,
    baseMint,
    quoteMint,
  ], 'confirmed');
  assertProgramAccount(proposalInfo, FUTARCHY_V0_6_PROGRAM_ID, 'Proposal');
  assertProgramAccount(daoInfo, FUTARCHY_V0_6_PROGRAM_ID, 'DAO');
  assertProgramAccount(questionInfo, vaultProgramId, 'Conditional question');
  assertProgramAccount(baseVaultInfo, vaultProgramId, 'Base conditional vault');
  assertProgramAccount(quoteVaultInfo, vaultProgramId, 'Quote conditional vault');
  if (!baseMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)
      || !quoteMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)) {
    throw new Error('Prediction market uses an unsupported token program');
  }
  const [storedProposal, storedDao] = await Promise.all([
    client.deserializeProposal(proposalInfo),
    client.deserializeDao(daoInfo),
  ]);
  assertPublicKeyField(storedProposal.dao, dao, 'Proposal DAO');
  assertPublicKeyField(storedDao.baseMint, baseMint, 'DAO base mint');
  assertPublicKeyField(storedDao.quoteMint, quoteMint, 'DAO quote mint');
  if (proposalStateKey(storedProposal.state) !== 'pending') {
    throw new Error('Proposal is no longer open for prediction trading');
  }
  const baseMintState = unpackMint(baseMint, baseMintInfo, TOKEN_PROGRAM_ID);
  const quoteMintState = unpackMint(quoteMint, quoteMintInfo, TOKEN_PROGRAM_ID);
  if (
    baseMintState.decimals !== baseDecimals
    || quoteMintState.decimals !== quoteDecimals
  ) {
    throw new Error('Prediction market decimals conflict with the verified DAO mints');
  }
  return {
    trader,
    dao,
    proposal,
    baseMint,
    quoteMint,
    baseDecimals,
    quoteDecimals,
    client,
    derived,
    vaultProgramId,
    baseMintState,
    quoteMintState,
  };
}

async function inspectConditionalSettlement({
  connection,
  walletAddress,
  market,
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  const trader = requireAddress(walletAddress, 'Wallet');
  const proposal = requireAddress(market?.proposal?.id, 'Proposal');
  const dao = requireAddress(market?.daoAddress, 'DAO');
  const provider = createReadOnlyAnchorProvider(connection, trader);
  const client = FutarchyClient.createClient({ provider });
  if (!client.getProgramId().equals(FUTARCHY_V0_6_PROGRAM_ID)) {
    throw new Error('Unexpected MetaDAO futarchy program');
  }

  const [proposalInfo, daoInfo] = await Promise.all([
    connection.getAccountInfo(proposal, 'confirmed'),
    connection.getAccountInfo(dao, 'confirmed'),
  ]);
  assertProgramAccount(proposalInfo, FUTARCHY_V0_6_PROGRAM_ID, 'Proposal');
  assertProgramAccount(daoInfo, FUTARCHY_V0_6_PROGRAM_ID, 'DAO');
  const [storedProposal, storedDao] = await Promise.all([
    client.deserializeProposal(proposalInfo),
    client.deserializeDao(daoInfo),
  ]);
  assertPublicKeyField(storedProposal.dao, dao, 'Proposal DAO');

  const baseMint = storedDao.baseMint;
  const quoteMint = storedDao.quoteMint;
  if (!(baseMint instanceof PublicKey) || !(quoteMint instanceof PublicKey)) {
    throw new Error('DAO mint identities are invalid');
  }
  assertOptionalAddress(market?.baseMint, baseMint, 'Indexed base mint');
  assertOptionalAddress(market?.quoteMint, quoteMint, 'Indexed quote mint');

  const derived = client.getProposalPdas(proposal, baseMint, quoteMint, dao);
  assertOptionalAddress(market?.proposal?.baseVault, derived.baseVault, 'Indexed base vault');
  assertOptionalAddress(market?.proposal?.quoteVault, derived.quoteVault, 'Indexed quote vault');
  assertOptionalAddress(
    market?.proposal?.passBaseMint,
    derived.passBaseMint,
    'Indexed PASS base mint',
  );
  assertOptionalAddress(
    market?.proposal?.passQuoteMint,
    derived.passQuoteMint,
    'Indexed PASS quote mint',
  );
  assertOptionalAddress(
    market?.proposal?.failBaseMint,
    derived.failBaseMint,
    'Indexed FAIL base mint',
  );
  assertOptionalAddress(
    market?.proposal?.failQuoteMint,
    derived.failQuoteMint,
    'Indexed FAIL quote mint',
  );

  const vaultProgramId = client.vaultClient.vaultProgram.programId;
  if (!vaultProgramId.equals(CONDITIONAL_VAULT_PROGRAM_ID)) {
    throw new Error('Unexpected MetaDAO conditional vault program');
  }
  const [
    questionInfo,
    baseVaultInfo,
    quoteVaultInfo,
    baseMintInfo,
    quoteMintInfo,
  ] = await Promise.all([
    connection.getAccountInfo(derived.question, 'confirmed'),
    connection.getAccountInfo(derived.baseVault, 'confirmed'),
    connection.getAccountInfo(derived.quoteVault, 'confirmed'),
    connection.getAccountInfo(baseMint, 'confirmed'),
    connection.getAccountInfo(quoteMint, 'confirmed'),
  ]);
  assertProgramAccount(questionInfo, vaultProgramId, 'Conditional question');
  assertProgramAccount(baseVaultInfo, vaultProgramId, 'Base conditional vault');
  assertProgramAccount(quoteVaultInfo, vaultProgramId, 'Quote conditional vault');
  if (!baseMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)
      || !quoteMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)) {
    throw new Error('Resolved market uses an unsupported token program');
  }
  const baseMintState = unpackMint(baseMint, baseMintInfo, TOKEN_PROGRAM_ID);
  const quoteMintState = unpackMint(quoteMint, quoteMintInfo, TOKEN_PROGRAM_ID);
  const [question, baseVault, quoteVault] = await Promise.all([
    client.vaultClient.deserializeQuestion(questionInfo),
    client.vaultClient.deserializeVault(baseVaultInfo),
    client.vaultClient.deserializeVault(quoteVaultInfo),
  ]);

  const payoutNumerators = Array.isArray(question.payoutNumerators)
    ? question.payoutNumerators.map((value, index) => (
      boundedU32(value, `Payout numerator ${index + 1}`)
    ))
    : [];
  const payoutDenominator = boundedU32(
    question.payoutDenominator,
    'Payout denominator',
  );
  if (
    payoutNumerators.length !== 2
    || payoutDenominator <= 0
    || payoutNumerators[0] + payoutNumerators[1] !== payoutDenominator
  ) {
    throw new Error('Conditional question is not resolved to a valid binary payout');
  }
  const resolvedOutcome = payoutNumerators[1] === payoutDenominator
    && payoutNumerators[0] === 0
    ? 'pass'
    : payoutNumerators[0] === payoutDenominator
      && payoutNumerators[1] === 0
      ? 'fail'
      : '';
  if (!resolvedOutcome) {
    throw new Error('Conditional question has an unsupported scalar payout');
  }
  const expectedOutcome = market?.proposal?.statusGroup === 'passed'
    ? 'pass'
    : market?.proposal?.statusGroup === 'failed'
      ? 'fail'
      : '';
  if (expectedOutcome && expectedOutcome !== resolvedOutcome) {
    throw new Error('Indexed proposal outcome conflicts with the on-chain payout');
  }
  const storedState = proposalStateKey(storedProposal.state);
  if (
    (storedState === 'passed' && resolvedOutcome !== 'pass')
    || (storedState === 'failed' && resolvedOutcome !== 'fail')
    || !['passed', 'failed'].includes(storedState)
  ) {
    throw new Error('Proposal state conflicts with the resolved conditional payout');
  }

  const validateVault = ({
    vault,
    vaultAddress,
    underlyingMint,
    conditionalMints,
    decimals,
    label,
  }) => {
    assertPublicKeyField(vault.question, derived.question, `${label} question`);
    assertPublicKeyField(
      vault.underlyingTokenMint,
      underlyingMint,
      `${label} underlying mint`,
    );
    assertPublicKeyField(
      vault.underlyingTokenAccount,
      getAssociatedTokenAddressSync(underlyingMint, vaultAddress, true),
      `${label} underlying vault account`,
    );
    if (
      !Array.isArray(vault.conditionalTokenMints)
      || vault.conditionalTokenMints.length !== 2
    ) {
      throw new Error(`${label} conditional mints are invalid`);
    }
    vault.conditionalTokenMints.forEach((mint, index) => {
      assertPublicKeyField(mint, conditionalMints[index], `${label} conditional mint`);
    });
    if (Number(vault.decimals) !== decimals) {
      throw new Error(`${label} decimals do not match the underlying mint`);
    }
  };
  validateVault({
    vault: baseVault,
    vaultAddress: derived.baseVault,
    underlyingMint: baseMint,
    conditionalMints: [derived.failBaseMint, derived.passBaseMint],
    decimals: baseMintState.decimals,
    label: 'Base vault',
  });
  validateVault({
    vault: quoteVault,
    vaultAddress: derived.quoteVault,
    underlyingMint: quoteMint,
    conditionalMints: [derived.failQuoteMint, derived.passQuoteMint],
    decimals: quoteMintState.decimals,
    label: 'Quote vault',
  });

  const ticker = String(market?.ticker || market?.token || 'TOKEN')
    .trim()
    .slice(0, 24)
    .toUpperCase();
  const positionSpecs = [
    {
      branch: 'fail',
      asset: 'base',
      mint: derived.failBaseMint,
      decimals: baseMintState.decimals,
    },
    {
      branch: 'pass',
      asset: 'base',
      mint: derived.passBaseMint,
      decimals: baseMintState.decimals,
    },
    {
      branch: 'fail',
      asset: 'quote',
      mint: derived.failQuoteMint,
      decimals: quoteMintState.decimals,
    },
    {
      branch: 'pass',
      asset: 'quote',
      mint: derived.passQuoteMint,
      decimals: quoteMintState.decimals,
    },
  ].map(spec => ({
    ...spec,
    account: getAssociatedTokenAddressSync(spec.mint, trader),
  }));
  const underlyingAccounts = [
    {
      asset: 'base',
      mint: baseMint,
      account: getAssociatedTokenAddressSync(baseMint, trader),
    },
    {
      asset: 'quote',
      mint: quoteMint,
      account: getAssociatedTokenAddressSync(quoteMint, trader),
    },
  ];
  const accountInfos = await connection.getMultipleAccountsInfo([
    ...positionSpecs.map(spec => spec.account),
    ...underlyingAccounts.map(spec => spec.account),
  ], 'confirmed');
  const positionInfos = accountInfos.slice(0, positionSpecs.length);
  const underlyingInfos = accountInfos.slice(positionSpecs.length);
  const positions = positionSpecs.map((spec, index) => {
    const accountInfo = positionInfos[index];
    assertAssociatedTokenAccount(
      spec.account,
      accountInfo,
      spec.mint,
      trader,
      `${spec.branch.toUpperCase()} ${spec.asset} token account`,
    );
    const rawAmount = accountInfo
      ? unpackAccount(spec.account, accountInfo, TOKEN_PROGRAM_ID).amount
      : 0n;
    return {
      label: formatPositionLabel(spec.branch, spec.asset, ticker),
      branch: spec.branch,
      asset: spec.asset,
      mint: spec.mint.toBase58(),
      account: spec.account.toBase58(),
      decimals: spec.decimals,
      available: true,
      rawAmount: rawAmount.toString(),
      amountString: formatRawAmount(rawAmount, spec.decimals, spec.decimals),
      amount: Number(formatRawAmount(rawAmount, spec.decimals, 12)),
      accountExists: Boolean(accountInfo),
    };
  });
  underlyingAccounts.forEach((spec, index) => {
    assertAssociatedTokenAccount(
      spec.account,
      underlyingInfos[index],
      spec.mint,
      trader,
      `${spec.asset} underlying token account`,
    );
    spec.accountExists = Boolean(underlyingInfos[index]);
  });

  const claims = [
    {
      asset: 'base',
      symbol: ticker,
      vault: derived.baseVault,
      underlyingMint: baseMint,
      underlyingAccount: underlyingAccounts[0],
      decimals: baseMintState.decimals,
      positions: positions.filter(position => position.asset === 'base'),
    },
    {
      asset: 'quote',
      symbol: 'USDC',
      vault: derived.quoteVault,
      underlyingMint: quoteMint,
      underlyingAccount: underlyingAccounts[1],
      decimals: quoteMintState.decimals,
      positions: positions.filter(position => position.asset === 'quote'),
    },
  ].map((claim) => {
    const rawByBranch = new Map(
      claim.positions.map(position => [position.branch, BigInt(position.rawAmount)]),
    );
    const estimatedRaw = (
      (rawByBranch.get('fail') || 0n) * BigInt(payoutNumerators[0])
      + (rawByBranch.get('pass') || 0n) * BigInt(payoutNumerators[1])
    ) / BigInt(payoutDenominator);
    return {
      ...claim,
      vault: claim.vault.toBase58(),
      underlyingMint: claim.underlyingMint.toBase58(),
      underlyingAccount: {
        ...claim.underlyingAccount,
        mint: claim.underlyingAccount.mint.toBase58(),
        account: claim.underlyingAccount.account.toBase58(),
      },
      estimatedRaw: estimatedRaw.toString(),
      estimatedAmount: formatRawAmount(estimatedRaw, claim.decimals, claim.decimals),
    };
  });

  return {
    cluster: MAINNET_CHAIN,
    proposal: proposal.toBase58(),
    dao: dao.toBase58(),
    outcome: resolvedOutcome,
    payoutNumerators,
    payoutDenominator,
    baseMint: baseMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
    question: derived.question.toBase58(),
    vaultProgramId: vaultProgramId.toBase58(),
    positions,
    claims,
    hasRedeemableBalance: claims.some(claim => BigInt(claim.estimatedRaw) > 0n),
    derived: Object.fromEntries(
      Object.entries(derived).map(([key, value]) => [key, value.toBase58()]),
    ),
  };
}

export async function inspectConditionalRedemption(input) {
  return inspectConditionalSettlement(input);
}

export async function buildConditionalRedeemPlan({
  connection,
  walletAddress,
  market,
}) {
  const trader = requireAddress(walletAddress, 'Wallet');
  const settlement = await inspectConditionalSettlement({
    connection,
    walletAddress,
    market,
  });
  const provider = createReadOnlyAnchorProvider(connection, trader);
  const client = FutarchyClient.createClient({ provider });
  const question = new PublicKey(settlement.question);
  const selectedClaims = settlement.claims
    .filter(claim => BigInt(claim.estimatedRaw) > 0n);
  if (!selectedClaims.length) {
    throw new Error('This wallet has no winning conditional tokens to redeem');
  }

  const setupInstructions = [];
  const redeemInstructions = [];
  let missingAccountCount = 0;
  for (const claim of selectedClaims) {
    const underlyingMint = new PublicKey(claim.underlyingMint);
    const vault = new PublicKey(claim.vault);
    const requiredAccounts = [
      {
        mint: underlyingMint,
        account: new PublicKey(claim.underlyingAccount.account),
        exists: claim.underlyingAccount.accountExists,
      },
      ...claim.positions.map(position => ({
        mint: new PublicKey(position.mint),
        account: new PublicKey(position.account),
        exists: position.accountExists,
      })),
    ];
    for (const required of requiredAccounts) {
      if (!required.exists) missingAccountCount += 1;
      setupInstructions.push(createAssociatedTokenAccountIdempotentInstruction(
        trader,
        required.account,
        trader,
        required.mint,
      ));
    }
    redeemInstructions.push(await client.vaultClient.redeemTokensIx(
      question,
      vault,
      underlyingMint,
      2,
      trader,
      trader,
    ).instruction());
  }
  const rentPerAccount = missingAccountCount
    ? await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, 'confirmed')
    : 0;
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
    ...setupInstructions,
    ...redeemInstructions,
  );
  const finalized = await finalizeTransaction(transaction, connection, trader);
  const accountRentLamports = rentPerAccount * missingAccountCount;
  return {
    kind: 'redeem',
    ...finalized,
    additionalSigners: [],
    settlement,
    summary: {
      cluster: MAINNET_CHAIN,
      venue: 'MetaDAO conditional vault v0.4',
      action: `REDEEM RESOLVED ${settlement.outcome.toUpperCase()} CLAIMS`,
      amountIn: 'All winning conditional balances',
      inputMint: selectedClaims
        .flatMap(claim => claim.positions.map(position => position.mint))
        .join(', '),
      inputAccount: trader.toBase58(),
      minimumAmountOut: selectedClaims
        .map(claim => `${claim.estimatedAmount} ${claim.symbol}`)
        .join(' + '),
      estimatedAmountOut: selectedClaims
        .map(claim => `${claim.estimatedAmount} ${claim.symbol}`)
        .join(' + '),
      outputMint: selectedClaims.map(claim => claim.underlyingMint).join(', '),
      recipient: selectedClaims
        .map(claim => claim.underlyingAccount.account)
        .join(', '),
      feePayer: trader.toBase58(),
      programIds: [settlement.vaultProgramId],
      setupRequired: missingAccountCount > 0,
      networkFeeSol: finalized.networkFeeSol,
      accountRentSol: accountRentLamports / 1_000_000_000,
      redemptions: selectedClaims.map(claim => ({
        symbol: claim.symbol,
        amount: claim.estimatedAmount,
        mint: claim.underlyingMint,
        recipient: claim.underlyingAccount.account,
      })),
      note: 'Burns all winning conditional balances for this proposal and returns the resolved underlying assets.',
    },
  };
}

export function createMainnetConnection(rpcUrl = MAINNET_RPC_URL) {
  const url = new URL(rpcUrl);
  const localHttp = url.protocol === 'http:'
    && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('Solana RPC must use HTTPS');
  }
  return new Connection(url.href, 'confirmed');
}

export async function buildConditionalSwapPlan({
  connection,
  walletAddress,
  market,
  manifestBook = null,
  outcome,
  side,
  amount,
  slippageBps,
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  if (outcome !== 'pass' && outcome !== 'fail') throw new Error('Select PASS or FAIL');
  if (side !== 'buy' && side !== 'sell') throw new Error('Select buy or sell');
  const trader = requireAddress(walletAddress, 'Wallet');
  const {
    dao,
    proposal,
    baseMint,
    quoteMint,
    baseDecimals,
    quoteDecimals,
    client,
    derived,
    vaultProgramId,
    baseMintState,
    quoteMintState,
  } = await loadOpenConditionalMarketContext({
    connection,
    trader,
    market,
  });
  const branch = outcome === 'pass' ? market.pass : market.fail;
  const inputDecimals = side === 'buy' ? quoteDecimals : baseDecimals;
  const outputDecimals = side === 'buy' ? baseDecimals : quoteDecimals;
  const inputReserves = side === 'buy' ? branch.quoteReserves : branch.baseReserves;
  const outputReserves = side === 'buy' ? branch.baseReserves : branch.quoteReserves;
  const ammQuote = quoteConditionalAmm({
    amount,
    inputDecimals,
    outputDecimals,
    inputReserves,
    outputReserves,
    slippageBps,
  });
  assertDerivedMint(
    outcome === 'pass' ? derived.passBaseMint : derived.failBaseMint,
    requireAddress(
      outcome === 'pass'
        ? market.proposal.passBaseMint
        : market.proposal.failBaseMint,
      `${outcome.toUpperCase()} base mint`,
    ),
    `${outcome.toUpperCase()} base mint`,
  );
  assertDerivedMint(
    outcome === 'pass' ? derived.passQuoteMint : derived.failQuoteMint,
    requireAddress(
      outcome === 'pass'
        ? market.proposal.passQuoteMint
        : market.proposal.failQuoteMint,
      `${outcome.toUpperCase()} quote mint`,
    ),
    `${outcome.toUpperCase()} quote mint`,
  );

  let manifestRoute = null;
  if (manifestBook?.canonical === true && manifestBook.address) {
    const manifestMarket = requireAddress(
      manifestBook.address,
      'Manifest market',
    );
    const expectedManifestBaseMint = requireAddress(
      manifestBook.baseMint,
      'Manifest base mint',
    );
    const expectedManifestQuoteMint = requireAddress(
      manifestBook.quoteMint,
      'Manifest quote mint',
    );
    const selectedBaseMint = outcome === 'pass'
      ? derived.passBaseMint
      : derived.failBaseMint;
    const selectedQuoteMint = outcome === 'pass'
      ? derived.passQuoteMint
      : derived.failQuoteMint;
    assertDerivedMint(selectedBaseMint, expectedManifestBaseMint, 'Manifest base mint');
    assertDerivedMint(selectedQuoteMint, expectedManifestQuoteMint, 'Manifest quote mint');
    const manifestAccountInfo = await connection.getAccountInfo(
      manifestMarket,
      'confirmed',
    );
    assertProgramAccount(
      manifestAccountInfo,
      MANIFEST_PROGRAM_ID,
      'Manifest market',
    );
    const manifestClient = await ManifestClient.getClientReadOnly(
      connection,
      manifestMarket,
    );
    if (
      !manifestClient.market.baseMint().equals(selectedBaseMint)
      || !manifestClient.market.quoteMint().equals(selectedQuoteMint)
      || manifestClient.market.baseDecimals() !== baseDecimals
      || manifestClient.market.quoteDecimals() !== quoteDecimals
    ) {
      throw new Error('Manifest market mint pair does not match the selected proposal');
    }
    const manifestQuote = quoteManifestOrderbook({
      amount,
      inputDecimals,
      outputDecimals,
      side,
      bids: typeof manifestClient.market.bidsL2 === 'function'
        ? manifestClient.market.bidsL2()
        : manifestClient.market.bids(),
      asks: typeof manifestClient.market.asksL2 === 'function'
        ? manifestClient.market.asksL2()
        : manifestClient.market.asks(),
      slippageBps,
    });
    manifestRoute = {
      client: manifestClient,
      market: manifestMarket,
      quote: manifestQuote,
    };
  }
  const routeSelection = selectBestDecisionRoute({
    ammQuote,
    manifestQuote: manifestRoute?.quote,
  });

  const outputMint = side === 'buy'
    ? (outcome === 'pass' ? derived.passBaseMint : derived.failBaseMint)
    : (outcome === 'pass' ? derived.passQuoteMint : derived.failQuoteMint);
  const underlyingInputMint = side === 'buy' ? quoteMint : baseMint;
  const underlyingVault = side === 'buy' ? derived.quoteVault : derived.baseVault;
  const conditionalInputMints = side === 'buy'
    ? [derived.failQuoteMint, derived.passQuoteMint]
    : [derived.failBaseMint, derived.passBaseMint];
  const underlyingInputAccount = getAssociatedTokenAddressSync(
    underlyingInputMint,
    trader,
  );
  const conditionalInputAccounts = conditionalInputMints.map(mint => (
    getAssociatedTokenAddressSync(mint, trader)
  ));
  const outputAccount = getAssociatedTokenAddressSync(outputMint, trader);
  const setupAccounts = [
    ...conditionalInputMints.map((mint, index) => ({
      mint,
      account: conditionalInputAccounts[index],
      label: 'Conditional input account',
    })),
    {
      mint: outputMint,
      account: outputAccount,
      label: 'Conditional output account',
    },
  ].filter((spec, index, specs) => (
    specs.findIndex(candidate => candidate.account.equals(spec.account)) === index
  ));
  const [
    underlyingInputAccountInfo,
    ...setupAccountInfos
  ] = await connection.getMultipleAccountsInfo([
    underlyingInputAccount,
    ...setupAccounts.map(spec => spec.account),
  ], 'confirmed');
  const underlyingMintState = side === 'buy' ? quoteMintState : baseMintState;
  if (underlyingMintState.decimals !== inputDecimals) {
    throw new Error('Prediction input decimals conflict with the verified market');
  }
  assertAssociatedTokenAccount(
    underlyingInputAccount,
    underlyingInputAccountInfo,
    underlyingInputMint,
    trader,
    'Underlying prediction input account',
  );
  if (!underlyingInputAccountInfo) {
    throw new Error(
      `Wallet has no ${side === 'buy' ? 'USDC' : 'base-token'} account to fund this prediction`,
    );
  }
  const underlyingInputState = unpackAccount(
    underlyingInputAccount,
    underlyingInputAccountInfo,
    TOKEN_PROGRAM_ID,
  );
  if (underlyingInputState.amount < ammQuote.inputRaw) {
    throw new Error(
      `Insufficient ${side === 'buy' ? 'USDC' : 'base-token'} balance for this prediction`,
    );
  }
  setupAccounts.forEach((spec, index) => {
    assertAssociatedTokenAccount(
      spec.account,
      setupAccountInfos[index],
      spec.mint,
      trader,
      spec.label,
    );
  });
  const missingAccountCount = setupAccountInfos
    .filter(accountInfo => !accountInfo)
    .length;
  const accountRentPerAccount = missingAccountCount
    ? await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, 'confirmed')
    : 0;
  const accountRentLamports = accountRentPerAccount * missingAccountCount;
  if (missingAccountCount > 0) {
    const setupTransaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ...setupAccounts
        .filter((spec, index) => !setupAccountInfos[index])
        .map(spec => createAssociatedTokenAccountIdempotentInstruction(
          trader,
          spec.account,
          trader,
          spec.mint,
        )),
    );
    const setupFinalized = await finalizeTransaction(
      setupTransaction,
      connection,
      trader,
    );
    return {
      kind: 'conditional-setup',
      ...setupFinalized,
      additionalSigners: [],
      resume: Object.freeze({
        amount,
        manifestBook,
        market,
        outcome,
        side,
        slippageBps,
        walletAddress,
      }),
      summary: {
        cluster: MAINNET_CHAIN,
        venue: 'MetaDAO conditional vault',
        action: 'SET UP PASS/FAIL TOKEN ACCOUNTS',
        amountIn: 'No trade in this transaction',
        inputMint: underlyingInputMint.toBase58(),
        inputAccount: underlyingInputAccount.toBase58(),
        minimumAmountOut: null,
        estimatedAmountOut: `${missingAccountCount} token account${missingAccountCount === 1 ? '' : 's'} created`,
        outputMint: setupAccounts
          .filter((spec, index) => !setupAccountInfos[index])
          .map(spec => spec.mint.toBase58())
          .join(','),
        recipient: trader.toBase58(),
        feePayer: trader.toBase58(),
        programIds: [ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()],
        setupRequired: true,
        networkFeeSol: setupFinalized.networkFeeSol,
        accountRentSol: accountRentLamports / 1_000_000_000,
        note: 'Creates only the missing conditional token accounts. After confirmation, 01RX prepares the zero-fee attributed MetaDAO swap for a separate review.',
      },
    };
  }

  const quote = routeSelection.quote;
  const splitInstruction = await client.vaultClient.splitTokensIx(
    derived.question,
    underlyingVault,
    underlyingInputMint,
    new BN(ammQuote.inputRaw.toString()),
    2,
    trader,
    trader,
  ).instruction();
  const swapInstruction = routeSelection.route === 'manifest'
    ? manifestRoute.client.swapIx(trader, {
      inAtoms: new BN(quote.inputRaw.toString()),
      outAtoms: new BN(quote.minimumOutputRaw.toString()),
      isBaseIn: side === 'sell',
      isExactIn: true,
    })
    : await client.conditionalSwapIx({
      dao,
      trader,
      payer: trader,
      baseMint,
      quoteMint,
      proposal,
      market: outcome,
      swapType: side,
      inputAmount: new BN(ammQuote.inputRaw.toString()),
      minOutputAmount: new BN(quote.minimumOutputRaw.toString()),
    }).instruction();
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 650_000 }),
    splitInstruction,
    swapInstruction,
  );
  const finalized = await finalizeTransaction(transaction, connection, trader);
  const inputSymbol = side === 'buy'
    ? 'USDC'
    : String(market?.ticker || market?.token || 'TOKEN').toUpperCase();
  const outputSymbol = side === 'buy'
    ? `${outcome.toUpperCase()} ${String(market?.ticker || market?.token || 'TOKEN').toUpperCase()}`
    : `${outcome.toUpperCase()} USDC`;
  return {
    kind: 'swap',
    ...finalized,
    additionalSigners: [],
    attributionIntent: Object.freeze({
      inputAmountRaw: ammQuote.inputRaw.toString(),
      minimumOutputAmountRaw: quote.minimumOutputRaw.toString(),
      outcome,
      proposal: proposal.toBase58(),
      side,
      trader: trader.toBase58(),
      venue: routeSelection.route,
    }),
    quote,
    summary: {
      cluster: MAINNET_CHAIN,
      venue: routeSelection.route === 'manifest'
        ? 'Manifest order book'
        : 'MetaDAO v0.6 AMM',
      action: `${side.toUpperCase()} ${outcome.toUpperCase()}`,
      amountIn: `${String(amount)} ${inputSymbol}`,
      inputMint: underlyingInputMint.toBase58(),
      inputAccount: underlyingInputAccount.toBase58(),
      minimumAmountOut: `${quote.minimumOutputAmount} ${outputSymbol}`,
      estimatedAmountOut: `${quote.outputAmount} ${outputSymbol}`,
      outputMint: outputMint.toBase58(),
      recipient: outputAccount.toBase58(),
      feePayer: trader.toBase58(),
      programIds: [
        vaultProgramId.toBase58(),
        routeSelection.route === 'manifest'
          ? MANIFEST_PROGRAM_ID.toBase58()
          : FUTARCHY_V0_6_PROGRAM_ID.toBase58(),
      ],
      comparedRouteCount: routeSelection.candidates.length,
      selectedRoute: routeSelection.route,
      slippageBps: Number(slippageBps),
      setupRequired: missingAccountCount > 0,
      networkFeeSol: finalized.networkFeeSol,
      accountRentSol: accountRentLamports / 1_000_000_000,
      note: `Compared ${routeSelection.candidates.length} verified route${routeSelection.candidates.length === 1 ? '' : 's'}, selected ${routeSelection.route === 'manifest' ? 'Manifest' : 'the MetaDAO Futarchy AMM'} for the highest estimated output. Splits ${inputSymbol} into PASS/FAIL claims and leaves the complementary claim in your wallet.`,
    },
  };
}

export async function buildRecurringSchedulePlan({
  connection,
  walletAddress,
  recurringProgramId,
  market,
  marketAddress,
  expectedBaseMint,
  expectedQuoteMint,
  outcome,
  side,
  amountPerCycle,
  totalCycles,
  intervalSeconds,
  slippageBps,
  referencePrice,
  scheduleId = BigInt(Date.now()),
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  if (outcome !== 'pass' && outcome !== 'fail') throw new Error('Select PASS or FAIL');
  if (side !== 'buy' && side !== 'sell') throw new Error('Select buy or sell');
  const cycles = recurringCycleCount(totalCycles);
  const interval = recurringInterval(intervalSeconds);
  const trader = requireAddress(walletAddress, 'Wallet');
  const recurringProgram = requireAddress(recurringProgramId, 'Recurring program');
  const proposal = requireAddress(market?.proposal?.id, 'Proposal');
  const dao = requireAddress(market?.daoAddress, 'DAO');
  const baseMint = requireAddress(market?.baseMint, 'Base mint');
  const quoteMint = requireAddress(market?.quoteMint, 'Quote mint');
  const manifestMarket = requireAddress(marketAddress, 'Manifest market');
  const manifestBaseMint = requireAddress(expectedBaseMint, 'Order-book base mint');
  const manifestQuoteMint = requireAddress(expectedQuoteMint, 'Order-book quote mint');
  const baseDecimals = Number(market?.baseDecimals);
  const quoteDecimals = Number(market?.quoteDecimals);
  const inputDecimals = side === 'buy' ? quoteDecimals : baseDecimals;
  const outputDecimals = side === 'buy' ? baseDecimals : quoteDecimals;
  const amountRaw = parseUiAmount(amountPerCycle, inputDecimals);
  const totalFundingRaw = amountRaw * BigInt(cycles);
  if (totalFundingRaw > MAX_U64) {
    throw new Error('The total recurring funding exceeds the program limit');
  }
  const minimumOutputRaw = calculateRecurringMinimumOutput({
    amountRaw,
    baseDecimals,
    quoteDecimals,
    tokenPrice: referencePrice,
    side,
    slippageBps,
  });

  const now = Math.floor(Date.now() / 1_000);
  const startAt = now + 120;
  const proposalEndsAt = Math.floor(new Date(market?.proposal?.endsAt || '').getTime() / 1_000);
  if (!Number.isFinite(proposalEndsAt) || proposalEndsAt <= startAt + 60) {
    throw new Error('This proposal does not have enough verified time remaining');
  }
  const finalCycleAt = startAt + interval * (cycles - 1);
  const expiresAt = proposalEndsAt - 30;
  if (finalCycleAt >= expiresAt) {
    throw new Error('This cadence would continue after the proposal market closes');
  }

  const provider = createReadOnlyAnchorProvider(connection, trader);
  const futarchyClient = FutarchyClient.createClient({ provider });
  if (!futarchyClient.getProgramId().equals(FUTARCHY_V0_6_PROGRAM_ID)) {
    throw new Error('Unexpected MetaDAO futarchy program');
  }
  const derived = futarchyClient.getProposalPdas(
    proposal,
    baseMint,
    quoteMint,
    dao,
  );
  const branchBaseMint = outcome === 'pass'
    ? derived.passBaseMint
    : derived.failBaseMint;
  const branchQuoteMint = outcome === 'pass'
    ? derived.passQuoteMint
    : derived.failQuoteMint;
  assertDerivedMint(branchBaseMint, manifestBaseMint, `${outcome.toUpperCase()} base mint`);
  assertDerivedMint(branchQuoteMint, manifestQuoteMint, `${outcome.toUpperCase()} quote mint`);

  const vaultProgramId = futarchyClient.vaultClient.vaultProgram.programId;
  if (!vaultProgramId.equals(CONDITIONAL_VAULT_PROGRAM_ID)) {
    throw new Error('Unexpected MetaDAO conditional vault program');
  }
  const underlyingInputMint = side === 'buy' ? quoteMint : baseMint;
  const underlyingVault = side === 'buy' ? derived.quoteVault : derived.baseVault;
  const conditionalInputMints = side === 'buy'
    ? [derived.failQuoteMint, derived.passQuoteMint]
    : [derived.failBaseMint, derived.passBaseMint];
  const inputMint = side === 'buy' ? branchQuoteMint : branchBaseMint;
  const outputMint = side === 'buy' ? branchBaseMint : branchQuoteMint;
  const ownerUnderlyingInput = getAssociatedTokenAddressSync(
    underlyingInputMint,
    trader,
  );
  const ownerConditionalAccounts = conditionalInputMints.map(mint => (
    getAssociatedTokenAddressSync(mint, trader)
  ));
  const ownerInput = getAssociatedTokenAddressSync(inputMint, trader);
  const addresses = deriveRecurringScheduleAddresses({
    programId: recurringProgram.toBase58(),
    owner: trader.toBase58(),
    proposal: proposal.toBase58(),
    scheduleId,
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
  });

  const [
    recurringProgramInfo,
    proposalInfo,
    daoInfo,
    questionInfo,
    baseVaultInfo,
    quoteVaultInfo,
    baseMintInfo,
    quoteMintInfo,
    manifestMarketInfo,
    inputMintInfo,
    outputMintInfo,
    ownerUnderlyingInputInfo,
    scheduleInfo,
    scheduleInputVaultInfo,
    scheduleOutputVaultInfo,
    ...ownerConditionalInfos
  ] = await connection.getMultipleAccountsInfo([
    recurringProgram,
    proposal,
    dao,
    derived.question,
    derived.baseVault,
    derived.quoteVault,
    baseMint,
    quoteMint,
    manifestMarket,
    inputMint,
    outputMint,
    ownerUnderlyingInput,
    addresses.schedule,
    addresses.inputVault,
    addresses.outputVault,
    ...ownerConditionalAccounts,
  ], 'confirmed');

  if (!recurringProgramInfo?.executable) {
    throw new Error('Automatic recurring execution is not deployed on Solana mainnet');
  }
  assertProgramAccount(proposalInfo, FUTARCHY_V0_6_PROGRAM_ID, 'Proposal');
  assertProgramAccount(daoInfo, FUTARCHY_V0_6_PROGRAM_ID, 'DAO');
  assertProgramAccount(questionInfo, vaultProgramId, 'Conditional question');
  assertProgramAccount(baseVaultInfo, vaultProgramId, 'Base conditional vault');
  assertProgramAccount(quoteVaultInfo, vaultProgramId, 'Quote conditional vault');
  assertProgramAccount(manifestMarketInfo, MANIFEST_PROGRAM_ID, 'Manifest market');
  if (
    !baseMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)
    || !quoteMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)
    || !inputMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)
    || !outputMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)
  ) {
    throw new Error('Recurring execution currently supports classic SPL tokens only');
  }
  if (scheduleInfo || scheduleInputVaultInfo || scheduleOutputVaultInfo) {
    throw new Error('This recurring schedule identifier is already in use');
  }

  const [storedProposal, storedDao] = await Promise.all([
    futarchyClient.deserializeProposal(proposalInfo),
    futarchyClient.deserializeDao(daoInfo),
  ]);
  assertPublicKeyField(storedProposal.dao, dao, 'Proposal DAO');
  assertPublicKeyField(storedDao.baseMint, baseMint, 'DAO base mint');
  assertPublicKeyField(storedDao.quoteMint, quoteMint, 'DAO quote mint');
  if (proposalStateKey(storedProposal.state) !== 'pending') {
    throw new Error('Proposal is no longer open for recurring execution');
  }
  const baseMintState = unpackMint(baseMint, baseMintInfo, TOKEN_PROGRAM_ID);
  const quoteMintState = unpackMint(quoteMint, quoteMintInfo, TOKEN_PROGRAM_ID);
  if (
    baseMintState.decimals !== baseDecimals
    || quoteMintState.decimals !== quoteDecimals
  ) {
    throw new Error('Prediction market decimals conflict with the verified DAO mints');
  }

  const manifestClient = await ManifestClient.getClientForMarketNoPrivateKey(
    connection,
    manifestMarket,
    trader,
  );
  if (
    !manifestClient.market.baseMint().equals(manifestBaseMint)
    || !manifestClient.market.quoteMint().equals(manifestQuoteMint)
  ) {
    throw new Error('Manifest market mint pair does not match the selected proposal');
  }

  assertAssociatedTokenAccount(
    ownerUnderlyingInput,
    ownerUnderlyingInputInfo,
    underlyingInputMint,
    trader,
    'Underlying recurring funding account',
  );
  if (!ownerUnderlyingInputInfo) {
    throw new Error(
      `Wallet has no ${side === 'buy' ? 'USDC' : 'base-token'} account to fund this schedule`,
    );
  }
  const underlyingInputState = unpackAccount(
    ownerUnderlyingInput,
    ownerUnderlyingInputInfo,
    TOKEN_PROGRAM_ID,
  );
  if (underlyingInputState.amount < totalFundingRaw) {
    throw new Error(
      `Insufficient ${side === 'buy' ? 'USDC' : 'base-token'} balance for the full schedule`,
    );
  }
  ownerConditionalAccounts.forEach((account, index) => {
    assertAssociatedTokenAccount(
      account,
      ownerConditionalInfos[index],
      conditionalInputMints[index],
      trader,
      'Conditional schedule funding account',
    );
  });

  const splitInstruction = await futarchyClient.vaultClient.splitTokensIx(
    derived.question,
    underlyingVault,
    underlyingInputMint,
    new BN(totalFundingRaw.toString()),
    2,
    trader,
    trader,
  ).instruction();
  const initializeInstruction = createRecurringInitializeInstruction({
    programId: recurringProgram.toBase58(),
    owner: trader.toBase58(),
    schedule: addresses.schedule.toBase58(),
    proposal: proposal.toBase58(),
    market: manifestMarket.toBase58(),
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    ownerInput: ownerInput.toBase58(),
    inputVault: addresses.inputVault.toBase58(),
    outputVault: addresses.outputVault.toBase58(),
    scheduleId,
    amountPerCycle: amountRaw,
    minimumOutputPerCycle: minimumOutputRaw,
    intervalSeconds: interval,
    startAt,
    expiresAt,
    totalCycles: cycles,
    isBaseIn: side === 'sell',
    keeperFeeLamports: DEFAULT_KEEPER_FEE_LAMPORTS,
  });
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 850_000 }),
    ...conditionalInputMints.map((mint, index) => (
      createAssociatedTokenAccountIdempotentInstruction(
        trader,
        ownerConditionalAccounts[index],
        trader,
        mint,
      )
    )),
    splitInstruction,
    initializeInstruction,
  );
  const finalized = await finalizeTransaction(transaction, connection, trader);
  const missingOwnerAccounts = ownerConditionalInfos.filter(info => !info).length;
  const [scheduleRent, tokenAccountRent] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(
      RECURRING_SCHEDULE_SPACE,
      'confirmed',
    ),
    connection.getMinimumBalanceForRentExemption(
      ACCOUNT_SIZE,
      'confirmed',
    ),
  ]);
  const accountRentLamports = scheduleRent
    + tokenAccountRent * (2 + missingOwnerAccounts);
  const inputSymbol = side === 'buy'
    ? 'USDC'
    : String(market?.ticker || market?.token || 'TOKEN').toUpperCase();
  const outputSymbol = side === 'buy'
    ? `${outcome.toUpperCase()} ${String(market?.ticker || market?.token || 'TOKEN').toUpperCase()}`
    : `${outcome.toUpperCase()} USDC`;

  return {
    kind: 'recurring-create',
    ...finalized,
    additionalSigners: [],
    recurring: {
      schedule: addresses.schedule.toBase58(),
      scheduleId: scheduleId.toString(),
      amountPerCycleRaw: amountRaw.toString(),
      minimumOutputPerCycleRaw: minimumOutputRaw.toString(),
      intervalSeconds: interval,
      totalCycles: cycles,
      startAt,
      expiresAt,
      inputMint: inputMint.toBase58(),
      outputMint: outputMint.toBase58(),
      inputVault: addresses.inputVault.toBase58(),
      outputVault: addresses.outputVault.toBase58(),
    },
    summary: {
      cluster: MAINNET_CHAIN,
      venue: 'Manifest · 01RX recurring vault',
      action: `${side.toUpperCase()} ${outcome.toUpperCase()} · ${cycles} AUTOMATIC RUNS`,
      amountIn: `${formatRawAmount(totalFundingRaw, inputDecimals)} ${inputSymbol} total`,
      inputMint: underlyingInputMint.toBase58(),
      inputAccount: ownerUnderlyingInput.toBase58(),
      minimumAmountOut: `${formatRawAmount(minimumOutputRaw, outputDecimals)} ${outputSymbol} per run`,
      estimatedAmountOut: `${cycles} runs · ${formatRawAmount(amountRaw, inputDecimals)} ${inputSymbol} each`,
      outputMint: outputMint.toBase58(),
      recipient: addresses.schedule.toBase58(),
      feePayer: trader.toBase58(),
      programIds: [
        vaultProgramId.toBase58(),
        recurringProgram.toBase58(),
        MANIFEST_PROGRAM_ID.toBase58(),
      ],
      setupRequired: true,
      networkFeeSol: finalized.networkFeeSol,
      accountRentSol: accountRentLamports / 1_000_000_000,
      keeperBudgetSol: Number(
        DEFAULT_KEEPER_FEE_LAMPORTS * BigInt(cycles),
      ) / 1_000_000_000,
      note: `One approval splits and caps the full funding amount. A permissionless keeper may execute only one due slice at a time before proposal expiry; you can cancel and withdraw at any time. The complementary conditional claims remain in your wallet.`,
    },
  };
}

export async function buildRecurringCancelPlan({
  connection,
  walletAddress,
  recurringProgramId,
  scheduleAddress,
  ticker = 'TOKEN',
  baseDecimals,
  quoteDecimals,
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  const trader = requireAddress(walletAddress, 'Wallet');
  const recurringProgram = requireAddress(recurringProgramId, 'Recurring program');
  const schedulePublicKey = requireAddress(scheduleAddress, 'Schedule');
  const [programInfo, scheduleInfo] = await connection.getMultipleAccountsInfo([
    recurringProgram,
    schedulePublicKey,
  ], 'confirmed');
  if (!programInfo?.executable) {
    throw new Error('Automatic recurring execution is not deployed on Solana mainnet');
  }
  assertProgramAccount(scheduleInfo, recurringProgram, 'Recurring schedule');
  const schedule = decodeRecurringScheduleAccount(schedulePublicKey, scheduleInfo);
  if (schedule.owner !== trader.toBase58()) {
    throw new Error('Only the schedule owner can cancel and withdraw');
  }
  const derived = deriveRecurringScheduleAddresses({
    programId: recurringProgram.toBase58(),
    owner: schedule.owner,
    proposal: schedule.proposal,
    scheduleId: schedule.scheduleId,
    inputMint: schedule.inputMint,
    outputMint: schedule.outputMint,
  });
  if (
    !derived.schedule.equals(schedulePublicKey)
    || derived.inputVault.toBase58() !== schedule.inputVault
    || derived.outputVault.toBase58() !== schedule.outputVault
  ) {
    throw new Error('Recurring schedule vault derivation is invalid');
  }

  const inputMint = new PublicKey(schedule.inputMint);
  const outputMint = new PublicKey(schedule.outputMint);
  const inputVault = new PublicKey(schedule.inputVault);
  const outputVault = new PublicKey(schedule.outputVault);
  const ownerInput = getAssociatedTokenAddressSync(inputMint, trader);
  const ownerOutput = getAssociatedTokenAddressSync(outputMint, trader);
  const [
    inputMintInfo,
    outputMintInfo,
    inputVaultInfo,
    outputVaultInfo,
    ownerInputInfo,
    ownerOutputInfo,
  ] = await connection.getMultipleAccountsInfo([
    inputMint,
    outputMint,
    inputVault,
    outputVault,
    ownerInput,
    ownerOutput,
  ], 'confirmed');
  if (
    !inputMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)
    || !outputMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)
  ) {
    throw new Error('Recurring schedule uses an unsupported token program');
  }
  assertAssociatedTokenAccount(
    inputVault,
    inputVaultInfo,
    inputMint,
    schedulePublicKey,
    'Schedule input vault',
  );
  assertAssociatedTokenAccount(
    outputVault,
    outputVaultInfo,
    outputMint,
    schedulePublicKey,
    'Schedule output vault',
  );
  if (!inputVaultInfo || !outputVaultInfo) {
    throw new Error('Recurring schedule vaults are unavailable');
  }
  assertAssociatedTokenAccount(
    ownerInput,
    ownerInputInfo,
    inputMint,
    trader,
    'Owner input account',
  );
  assertAssociatedTokenAccount(
    ownerOutput,
    ownerOutputInfo,
    outputMint,
    trader,
    'Owner output account',
  );
  const inputBalance = unpackAccount(
    inputVault,
    inputVaultInfo,
    TOKEN_PROGRAM_ID,
  ).amount;
  const outputBalance = unpackAccount(
    outputVault,
    outputVaultInfo,
    TOKEN_PROGRAM_ID,
  ).amount;
  const cancelInstruction = createRecurringCancelInstruction({
    programId: recurringProgram.toBase58(),
    owner: trader.toBase58(),
    schedule: schedule.address,
    inputMint: schedule.inputMint,
    outputMint: schedule.outputMint,
    inputVault: schedule.inputVault,
    outputVault: schedule.outputVault,
    ownerInput: ownerInput.toBase58(),
    ownerOutput: ownerOutput.toBase58(),
  });
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      trader,
      ownerInput,
      trader,
      inputMint,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      trader,
      ownerOutput,
      trader,
      outputMint,
    ),
    cancelInstruction,
  );
  const finalized = await finalizeTransaction(transaction, connection, trader);
  const inputDecimals = schedule.isBaseIn ? Number(baseDecimals) : Number(quoteDecimals);
  const outputDecimals = schedule.isBaseIn ? Number(quoteDecimals) : Number(baseDecimals);
  const normalizedTicker = String(ticker || 'TOKEN').trim().toUpperCase();
  const inputSymbol = schedule.isBaseIn ? normalizedTicker : 'USDC';
  const outputSymbol = schedule.isBaseIn ? 'USDC' : normalizedTicker;
  const [scheduleRent, tokenAccountRent] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(
      RECURRING_SCHEDULE_SPACE,
      'confirmed',
    ),
    connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, 'confirmed'),
  ]);
  const accountRentRefundLamports = Math.min(
    scheduleInfo.lamports,
    scheduleRent,
  ) + inputVaultInfo.lamports + outputVaultInfo.lamports;
  const keeperBudgetRefundLamports = Math.max(
    0,
    scheduleInfo.lamports - scheduleRent,
  );

  return {
    kind: 'recurring-cancel',
    ...finalized,
    additionalSigners: [],
    recurring: schedule,
    summary: {
      cluster: MAINNET_CHAIN,
      venue: '01RX recurring vault',
      action: 'CANCEL RECURRING SCHEDULE',
      amountIn: 'No trade',
      inputMint: schedule.inputMint,
      inputAccount: schedule.inputVault,
      minimumAmountOut: null,
      estimatedAmountOut: [
        `${formatRawAmount(inputBalance, inputDecimals)} ${inputSymbol} unspent`,
        `${formatRawAmount(outputBalance, outputDecimals)} ${outputSymbol} proceeds`,
      ].join(' + '),
      outputMint: schedule.outputMint,
      recipient: trader.toBase58(),
      feePayer: trader.toBase58(),
      programIds: [recurringProgram.toBase58(), TOKEN_PROGRAM_ID.toBase58()],
      setupRequired: !ownerInputInfo || !ownerOutputInfo,
      networkFeeSol: finalized.networkFeeSol,
      accountRentSol: 0,
      accountRentRefundSol: accountRentRefundLamports / 1_000_000_000,
      keeperBudgetRefundSol: keeperBudgetRefundLamports / 1_000_000_000,
      note: 'Returns all unspent funding and accumulated output, closes both vaults, and permanently closes this schedule.',
    },
  };
}

export async function buildRecurringClaimPlan({
  connection,
  walletAddress,
  recurringProgramId,
  scheduleAddress,
  ticker = 'TOKEN',
  outcome = 'PROP',
  baseDecimals,
  quoteDecimals,
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  const trader = requireAddress(walletAddress, 'Wallet');
  const recurringProgram = requireAddress(recurringProgramId, 'Recurring program');
  const schedulePublicKey = requireAddress(scheduleAddress, 'Schedule');
  const [programInfo, scheduleInfo] = await connection.getMultipleAccountsInfo([
    recurringProgram,
    schedulePublicKey,
  ], 'confirmed');
  if (!programInfo?.executable) {
    throw new Error('Automatic recurring execution is not deployed on Solana mainnet');
  }
  assertProgramAccount(scheduleInfo, recurringProgram, 'Recurring schedule');
  const schedule = decodeRecurringScheduleAccount(schedulePublicKey, scheduleInfo);
  if (schedule.owner !== trader.toBase58()) {
    throw new Error('Only the schedule owner can claim its output');
  }
  const derived = deriveRecurringScheduleAddresses({
    programId: recurringProgram.toBase58(),
    owner: schedule.owner,
    proposal: schedule.proposal,
    scheduleId: schedule.scheduleId,
    inputMint: schedule.inputMint,
    outputMint: schedule.outputMint,
  });
  if (
    !derived.schedule.equals(schedulePublicKey)
    || derived.bump !== schedule.bump
    || derived.outputVault.toBase58() !== schedule.outputVault
  ) {
    throw new Error('Recurring schedule vault derivation is invalid');
  }

  const outputMint = new PublicKey(schedule.outputMint);
  const outputVault = new PublicKey(schedule.outputVault);
  const ownerOutput = getAssociatedTokenAddressSync(outputMint, trader);
  const [
    outputMintInfo,
    outputVaultInfo,
    ownerOutputInfo,
  ] = await connection.getMultipleAccountsInfo([
    outputMint,
    outputVault,
    ownerOutput,
  ], 'confirmed');
  if (!outputMintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)) {
    throw new Error('Recurring schedule uses an unsupported output token program');
  }
  assertAssociatedTokenAccount(
    outputVault,
    outputVaultInfo,
    outputMint,
    schedulePublicKey,
    'Schedule output vault',
  );
  if (!outputVaultInfo) {
    throw new Error('Recurring schedule output vault is unavailable');
  }
  assertAssociatedTokenAccount(
    ownerOutput,
    ownerOutputInfo,
    outputMint,
    trader,
    'Owner output account',
  );
  const outputBalance = unpackAccount(
    outputVault,
    outputVaultInfo,
    TOKEN_PROGRAM_ID,
  ).amount;
  if (outputBalance <= 0n) {
    throw new Error('This recurring schedule has no unclaimed output');
  }

  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 180_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      trader,
      ownerOutput,
      trader,
      outputMint,
    ),
    createRecurringClaimInstruction({
      programId: recurringProgram.toBase58(),
      owner: trader.toBase58(),
      schedule: schedule.address,
      outputMint: schedule.outputMint,
      outputVault: schedule.outputVault,
      ownerOutput: ownerOutput.toBase58(),
    }),
  );
  const finalized = await finalizeTransaction(transaction, connection, trader);
  const outputDecimals = schedule.isBaseIn
    ? Number(quoteDecimals)
    : Number(baseDecimals);
  const normalizedTicker = String(ticker || 'TOKEN').trim().toUpperCase();
  const normalizedOutcome = String(outcome || 'PROP').trim().toUpperCase();
  const outputSymbol = schedule.isBaseIn
    ? `${normalizedOutcome} USDC`
    : `${normalizedOutcome} ${normalizedTicker}`;
  const tokenAccountRent = ownerOutputInfo
    ? 0
    : await connection.getMinimumBalanceForRentExemption(
      ACCOUNT_SIZE,
      'confirmed',
    );

  return {
    kind: 'recurring-claim',
    ...finalized,
    additionalSigners: [],
    recurring: schedule,
    summary: {
      cluster: MAINNET_CHAIN,
      venue: '01RX recurring vault',
      action: `CLAIM ${normalizedOutcome} PROCEEDS`,
      amountIn: 'No trade',
      inputMint: schedule.outputMint,
      inputAccount: schedule.outputVault,
      minimumAmountOut: null,
      estimatedAmountOut: `${formatRawAmount(
        outputBalance,
        outputDecimals,
      )} ${outputSymbol}`,
      outputMint: schedule.outputMint,
      recipient: ownerOutput.toBase58(),
      feePayer: trader.toBase58(),
      programIds: [recurringProgram.toBase58(), TOKEN_PROGRAM_ID.toBase58()],
      setupRequired: !ownerOutputInfo,
      networkFeeSol: finalized.networkFeeSol,
      accountRentSol: tokenAccountRent / 1_000_000_000,
      note: 'Moves all accumulated output to your wallet while leaving future recurring runs active.',
    },
  };
}

export async function buildManifestLimitPlan({
  connection,
  walletAddress,
  market,
  marketAddress,
  expectedBaseMint,
  expectedQuoteMint,
  outcome,
  side,
  amount,
  price,
  clientOrderId = BigInt(Date.now()),
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  if (outcome !== 'pass' && outcome !== 'fail') throw new Error('Select PASS or FAIL');
  if (side !== 'buy' && side !== 'sell') throw new Error('Select buy or sell');
  const trader = requireAddress(walletAddress, 'Wallet');
  const marketPublicKey = requireAddress(marketAddress, 'Manifest market');
  const baseMint = requireAddress(expectedBaseMint, 'Order-book base mint');
  const quoteMint = requireAddress(expectedQuoteMint, 'Order-book quote mint');
  const baseAmount = Number(amount);
  const tokenPrice = Number(price);
  if (!(baseAmount > 0) || !Number.isFinite(baseAmount)) {
    throw new Error('Enter a positive order amount');
  }
  if (!(tokenPrice > 0) || !Number.isFinite(tokenPrice)) {
    throw new Error('Enter a positive limit price');
  }

  const conditionalContext = await loadOpenConditionalMarketContext({
    connection,
    trader,
    market,
  });
  const selectedBaseMint = outcome === 'pass'
    ? conditionalContext.derived.passBaseMint
    : conditionalContext.derived.failBaseMint;
  const selectedQuoteMint = outcome === 'pass'
    ? conditionalContext.derived.passQuoteMint
    : conditionalContext.derived.failQuoteMint;
  assertDerivedMint(selectedBaseMint, baseMint, 'Order-book base mint');
  assertDerivedMint(selectedQuoteMint, quoteMint, 'Order-book quote mint');
  const manifestAccountInfo = await connection.getAccountInfo(
    marketPublicKey,
    'confirmed',
  );
  assertProgramAccount(manifestAccountInfo, MANIFEST_PROGRAM_ID, 'Manifest market');
  const readClient = await ManifestClient.getClientReadOnly(
    connection,
    marketPublicKey,
  );
  if (
    !readClient.market.baseMint().equals(baseMint)
    || !readClient.market.quoteMint().equals(quoteMint)
    || readClient.market.baseDecimals() !== conditionalContext.baseDecimals
    || readClient.market.quoteDecimals() !== conditionalContext.quoteDecimals
  ) {
    throw new Error('Manifest market mint pair does not match the selected proposal');
  }

  const setup = await ManifestClient.getSetupIxs(
    connection,
    marketPublicKey,
    trader,
  );
  if (setup.setupNeeded) {
    const setupTransaction = new Transaction().add(...setup.instructions);
    const additionalSigners = setup.wrapperKeypair ? [setup.wrapperKeypair] : [];
    const finalized = await finalizeTransaction(
      setupTransaction,
      connection,
      trader,
      additionalSigners,
    );
    const rentLamports = setup.instructions.reduce((total, instruction) => {
      try {
        return total + Number(SystemInstruction.decodeCreateAccount(instruction).lamports);
      } catch (_) {
        return total;
      }
    }, 0);
    return {
      kind: 'manifest-setup',
      ...finalized,
      additionalSigners,
      resume: {
        walletAddress,
        market,
        marketAddress,
        expectedBaseMint,
        expectedQuoteMint,
        outcome,
        side,
        amount,
        price,
        clientOrderId,
      },
      summary: {
        cluster: MAINNET_CHAIN,
        venue: 'Manifest',
        action: `PREPARE ${outcome.toUpperCase()} LIMIT MARKET`,
        amountIn: rentLamports > 0
          ? `${rentLamports / 1_000_000_000} SOL rent`
          : 'Network fee only',
        inputMint: 'SOL',
        inputAccount: trader.toBase58(),
        minimumAmountOut: null,
        estimatedAmountOut: null,
        outputMint: null,
        recipient: marketPublicKey.toBase58(),
        feePayer: trader.toBase58(),
        programIds: [
          MANIFEST_PROGRAM_ID.toBase58(),
          MANIFEST_WRAPPER_PROGRAM_ID.toBase58(),
        ],
        setupRequired: true,
        networkFeeSol: finalized.networkFeeSol,
        accountRentSol: rentLamports / 1_000_000_000,
        note: 'Creates a Manifest wrapper and/or claims a seat. The order follows in a second wallet prompt.',
      },
    };
  }

  const client = await ManifestClient.getClientForMarketNoPrivateKey(
    connection,
    marketPublicKey,
    trader,
  );
  if (!client.market.baseMint().equals(baseMint)
      || !client.market.quoteMint().equals(quoteMint)) {
    throw new Error('Manifest market mint pair does not match the selected proposal');
  }
  const isBid = side === 'buy';
  const inputMint = isBid ? quoteMint : baseMint;
  const inputDecimals = isBid
    ? conditionalContext.quoteDecimals
    : conditionalContext.baseDecimals;
  const currentManifestBalance = client.market.getWithdrawableBalanceTokens(
    trader,
    !isBid,
  );
  const requestedDepositTokens = Math.max(
    0,
    (isBid ? baseAmount * tokenPrice : baseAmount) - currentManifestBalance,
  );
  const requestedDepositAtomsNumber = Math.round(
    requestedDepositTokens * 10 ** inputDecimals,
  );
  if (
    !Number.isSafeInteger(requestedDepositAtomsNumber)
    || requestedDepositAtomsNumber < 0
  ) {
    throw new Error('Limit order exceeds the safe Manifest amount range');
  }
  const requestedDepositRaw = BigInt(requestedDepositAtomsNumber);
  const underlyingInputMint = isBid
    ? conditionalContext.quoteMint
    : conditionalContext.baseMint;
  const underlyingVault = isBid
    ? conditionalContext.derived.quoteVault
    : conditionalContext.derived.baseVault;
  const conditionalPair = isBid
    ? [
      conditionalContext.derived.failQuoteMint,
      conditionalContext.derived.passQuoteMint,
    ]
    : [
      conditionalContext.derived.failBaseMint,
      conditionalContext.derived.passBaseMint,
    ];
  const underlyingInputAccount = getAssociatedTokenAddressSync(
    underlyingInputMint,
    trader,
  );
  const conditionalAccounts = conditionalPair.map(mint => ({
    mint,
    account: getAssociatedTokenAddressSync(mint, trader),
  }));
  const [
    underlyingInputInfo,
    ...conditionalAccountInfos
  ] = await connection.getMultipleAccountsInfo([
    underlyingInputAccount,
    ...conditionalAccounts.map(spec => spec.account),
  ], 'confirmed');
  assertAssociatedTokenAccount(
    underlyingInputAccount,
    underlyingInputInfo,
    underlyingInputMint,
    trader,
    'Underlying limit-order funding account',
  );
  conditionalAccounts.forEach((spec, index) => {
    assertAssociatedTokenAccount(
      spec.account,
      conditionalAccountInfos[index],
      spec.mint,
      trader,
      'Conditional limit-order funding account',
    );
  });
  const selectedInputIndex = conditionalAccounts.findIndex(spec => (
    spec.mint.equals(inputMint)
  ));
  if (selectedInputIndex < 0) {
    throw new Error('Limit-order input mint does not match the selected proposal');
  }
  const selectedInputInfo = conditionalAccountInfos[selectedInputIndex];
  const selectedInputRaw = selectedInputInfo
    ? unpackAccount(
      conditionalAccounts[selectedInputIndex].account,
      selectedInputInfo,
      TOKEN_PROGRAM_ID,
    ).amount
    : 0n;
  const splitShortfallRaw = requestedDepositRaw > selectedInputRaw
    ? requestedDepositRaw - selectedInputRaw
    : 0n;
  if (splitShortfallRaw > 0n) {
    if (!underlyingInputInfo) {
      throw new Error(
        `Wallet has no ${isBid ? 'USDC' : 'base-token'} account to fund this limit order`,
      );
    }
    const underlyingInputState = unpackAccount(
      underlyingInputAccount,
      underlyingInputInfo,
      TOKEN_PROGRAM_ID,
    );
    if (underlyingInputState.amount < splitShortfallRaw) {
      throw new Error(
        `Insufficient ${isBid ? 'USDC' : 'base-token'} balance for this limit order`,
      );
    }
  }
  const missingConditionalAccountCount = splitShortfallRaw > 0n
    ? conditionalAccountInfos.filter(accountInfo => !accountInfo).length
    : 0;
  const accountRentPerAccount = missingConditionalAccountCount
    ? await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, 'confirmed')
    : 0;
  const accountRentLamports = accountRentPerAccount
    * missingConditionalAccountCount;
  const splitSetupInstructions = splitShortfallRaw > 0n
    ? conditionalAccounts.map(spec => (
      createAssociatedTokenAccountIdempotentInstruction(
        trader,
        spec.account,
        trader,
        spec.mint,
      )
    ))
    : [];
  const splitInstructions = splitShortfallRaw > 0n
    ? [await conditionalContext.client.vaultClient.splitTokensIx(
      conditionalContext.derived.question,
      underlyingVault,
      underlyingInputMint,
      new BN(splitShortfallRaw.toString()),
      2,
      trader,
      trader,
    ).instruction()]
    : [];
  const instructions = await client.placeOrderWithRequiredDepositIxs(trader, {
    numBaseTokens: baseAmount,
    tokenPrice,
    isBid,
    lastValidSlot: 0,
    orderType: OrderType.Limit,
    clientOrderId,
  });
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: splitShortfallRaw > 0n ? 650_000 : 350_000,
    }),
    ...splitSetupInstructions,
    ...splitInstructions,
    ...instructions,
  );
  const finalized = await finalizeTransaction(transaction, connection, trader);
  const inputAmount = side === 'buy'
    ? (baseAmount * tokenPrice).toString()
    : baseAmount.toString();
  return {
    kind: 'limit',
    ...finalized,
    additionalSigners: [],
    summary: {
      cluster: MAINNET_CHAIN,
      venue: 'Manifest',
      action: `${side.toUpperCase()} ${outcome.toUpperCase()} LIMIT`,
      amountIn: inputAmount,
      inputMint: inputMint.toBase58(),
      inputAccount: getAssociatedTokenAddressSync(inputMint, trader).toBase58(),
      minimumAmountOut: null,
      estimatedAmountOut: side === 'buy'
        ? `${baseAmount} base tokens at ${tokenPrice}`
        : `${baseAmount * tokenPrice} quote tokens at ${tokenPrice}`,
      outputMint: side === 'buy' ? baseMint.toBase58() : quoteMint.toBase58(),
      recipient: marketPublicKey.toBase58(),
      feePayer: trader.toBase58(),
      programIds: [
        ...(splitShortfallRaw > 0n
          ? [conditionalContext.vaultProgramId.toBase58()]
          : []),
        MANIFEST_PROGRAM_ID.toBase58(),
      ],
      setupRequired: missingConditionalAccountCount > 0,
      networkFeeSol: finalized.networkFeeSol,
      accountRentSol: accountRentLamports / 1_000_000_000,
      clientOrderId: clientOrderId.toString(),
      conditionalSplitAmount: formatRawAmount(
        splitShortfallRaw,
        inputDecimals,
        inputDecimals,
      ),
      note: splitShortfallRaw > 0n
        ? `Splits only the missing ${formatRawAmount(splitShortfallRaw, inputDecimals)} ${isBid ? 'USDC' : String(market?.ticker || 'TOKEN').toUpperCase()} into PASS/FAIL claims before funding the Manifest order.`
        : 'Uses existing conditional wallet and Manifest balances without an additional split.',
    },
  };
}

export async function buildManifestCancelPlan({
  connection,
  walletAddress,
  marketAddress,
  expectedBaseMint,
  expectedQuoteMint,
  outcome,
  clientOrderId,
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  if (outcome !== 'pass' && outcome !== 'fail') throw new Error('Select PASS or FAIL');
  if (!/^\d+$/.test(String(clientOrderId || ''))) {
    throw new Error('Open order identifier is invalid');
  }
  const trader = requireAddress(walletAddress, 'Wallet');
  const marketPublicKey = requireAddress(marketAddress, 'Manifest market');
  const baseMint = requireAddress(expectedBaseMint, 'Order-book base mint');
  const quoteMint = requireAddress(expectedQuoteMint, 'Order-book quote mint');
  const setup = await ManifestClient.getSetupIxs(connection, marketPublicKey, trader);
  if (setup.setupNeeded) {
    throw new Error('Manifest account state changed; refresh open orders before cancelling');
  }
  const client = await ManifestClient.getClientForMarketNoPrivateKey(
    connection,
    marketPublicKey,
    trader,
  );
  if (!client.market.baseMint().equals(baseMint)
      || !client.market.quoteMint().equals(quoteMint)) {
    throw new Error('Manifest market mint pair does not match the selected proposal');
  }
  const transaction = new Transaction().add(client.cancelOrderIx({
    clientOrderId: BigInt(clientOrderId),
  }));
  const finalized = await finalizeTransaction(transaction, connection, trader);
  return {
    kind: 'cancel',
    ...finalized,
    additionalSigners: [],
    summary: {
      cluster: MAINNET_CHAIN,
      venue: 'Manifest',
      action: `CANCEL ${outcome.toUpperCase()} LIMIT ORDER`,
      amountIn: 'No token transfer',
      inputMint: baseMint.toBase58(),
      inputAccount: trader.toBase58(),
      minimumAmountOut: null,
      estimatedAmountOut: 'Deposited funds become withdrawable on Manifest',
      outputMint: quoteMint.toBase58(),
      recipient: marketPublicKey.toBase58(),
      feePayer: trader.toBase58(),
      programIds: [MANIFEST_PROGRAM_ID.toBase58()],
      setupRequired: false,
      networkFeeSol: finalized.networkFeeSol,
      clientOrderId: String(clientOrderId),
    },
  };
}

export async function buildManifestWithdrawPlan({
  connection,
  walletAddress,
  marketAddress,
  expectedBaseMint,
  expectedQuoteMint,
  outcome,
  ticker,
}) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  if (outcome !== 'pass' && outcome !== 'fail') throw new Error('Select PASS or FAIL');
  const trader = requireAddress(walletAddress, 'Wallet');
  const marketPublicKey = requireAddress(marketAddress, 'Manifest market');
  const baseMint = requireAddress(expectedBaseMint, 'Order-book base mint');
  const quoteMint = requireAddress(expectedQuoteMint, 'Order-book quote mint');
  const setup = await ManifestClient.getSetupIxs(connection, marketPublicKey, trader);
  if (setup.setupNeeded) {
    throw new Error('No initialized Manifest balance account exists for this market');
  }
  const client = await ManifestClient.getClientForMarketNoPrivateKey(
    connection,
    marketPublicKey,
    trader,
  );
  if (!client.market.baseMint().equals(baseMint)
      || !client.market.quoteMint().equals(quoteMint)) {
    throw new Error('Manifest market mint pair does not match the selected proposal');
  }
  const balances = [
    {
      asset: 'base',
      mint: baseMint,
      decimals: client.market.baseDecimals(),
      amount: client.market.getWithdrawableBalanceTokens(trader, true),
      symbol: `${outcome.toUpperCase()} ${String(ticker || 'TOKEN').toUpperCase()}`,
    },
    {
      asset: 'quote',
      mint: quoteMint,
      decimals: client.market.quoteDecimals(),
      amount: client.market.getWithdrawableBalanceTokens(trader, false),
      symbol: `${outcome.toUpperCase()} USDC`,
    },
  ].filter(balance => Number.isFinite(balance.amount) && balance.amount > 0);
  if (!balances.length) {
    throw new Error('This Manifest market has no withdrawable balance');
  }
  const accountSpecs = balances.map(balance => ({
    ...balance,
    account: getAssociatedTokenAddressSync(balance.mint, trader),
  }));
  const accountInfos = await connection.getMultipleAccountsInfo([
    ...accountSpecs.map(spec => spec.mint),
    ...accountSpecs.map(spec => spec.account),
  ], 'confirmed');
  const mintInfos = accountInfos.slice(0, accountSpecs.length);
  const tokenAccountInfos = accountInfos.slice(accountSpecs.length);
  accountSpecs.forEach((spec, index) => {
    const mintInfo = mintInfos[index];
    if (!mintInfo?.owner?.equals?.(TOKEN_PROGRAM_ID)) {
      throw new Error('Manifest balance uses an unsupported token program');
    }
    const mintState = unpackMint(spec.mint, mintInfo, TOKEN_PROGRAM_ID);
    if (mintState.decimals !== spec.decimals) {
      throw new Error('Manifest balance decimals conflict with the verified market');
    }
    assertAssociatedTokenAccount(
      spec.account,
      tokenAccountInfos[index],
      spec.mint,
      trader,
      'Manifest withdrawal recipient',
    );
  });
  const missingAccountCount = tokenAccountInfos.filter(accountInfo => !accountInfo).length;
  const accountRentPerAccount = missingAccountCount
    ? await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, 'confirmed')
    : 0;
  const accountRentLamports = accountRentPerAccount * missingAccountCount;
  const withdrawInstructions = client.withdrawAllIx();
  if (!withdrawInstructions.length) {
    throw new Error('Manifest reported no withdrawable balance instructions');
  }
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
    ...accountSpecs.map(spec => createAssociatedTokenAccountIdempotentInstruction(
      trader,
      spec.account,
      trader,
      spec.mint,
    )),
    ...withdrawInstructions,
  );
  const finalized = await finalizeTransaction(transaction, connection, trader);
  const redemptions = accountSpecs.map(spec => ({
    amount: formatRawAmount(
      parseUiAmount(String(spec.amount), spec.decimals),
      spec.decimals,
      spec.decimals,
    ),
    symbol: spec.symbol,
    mint: spec.mint.toBase58(),
    recipient: spec.account.toBase58(),
  }));
  return {
    kind: 'withdraw',
    ...finalized,
    additionalSigners: [],
    summary: {
      cluster: MAINNET_CHAIN,
      venue: 'Manifest',
      action: `WITHDRAW ${outcome.toUpperCase()} MARKET BALANCES`,
      amountIn: 'No new token deposit',
      inputMint: marketPublicKey.toBase58(),
      inputAccount: trader.toBase58(),
      minimumAmountOut: null,
      estimatedAmountOut: redemptions
        .map(row => `${row.amount} ${row.symbol}`)
        .join(' + '),
      outputMint: redemptions.map(row => row.mint).join(','),
      recipient: trader.toBase58(),
      feePayer: trader.toBase58(),
      programIds: [MANIFEST_PROGRAM_ID.toBase58()],
      setupRequired: missingAccountCount > 0,
      networkFeeSol: finalized.networkFeeSol,
      accountRentSol: accountRentLamports / 1_000_000_000,
      redemptions,
      note: 'Withdraws only currently available Manifest balances. Resting-order deposits remain locked until filled or cancelled.',
    },
  };
}

function simulationErrorText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

export function describeSolanaError(error) {
  const message = String(error?.message || error || '').trim();
  const code = String(error?.code || '').trim();
  const normalized = `${code} ${message}`.toLowerCase();
  if (/solana_restart_cooldown/.test(normalized)) {
    return {
      category: 'network_recovery',
      message: 'Trading is temporarily paused while Solana stabilizes after a restart. Market data remains available.',
      retryable: true,
    };
  }
  if (/solana_program_integrity_changed/.test(normalized)) {
    return {
      category: 'program_integrity',
      message: 'Trading is paused because a reviewed Solana program changed.',
      retryable: false,
    };
  }
  if (/solana_program_integrity_unavailable|solana_restart_state_unavailable/.test(normalized)) {
    return {
      category: 'rpc_unavailable',
      message: 'Trading is paused because Solana execution safety could not be confirmed. Market data remains available.',
      retryable: true,
    };
  }
  if (
    /plan_not_reviewed|plan_changed_after_review|signed_transaction_changed|simulation_transaction_changed|transaction_review_unavailable/
      .test(normalized)
  ) {
    return {
      category: 'transaction_review_changed',
      message: 'The transaction no longer matches its simulation. Rebuild the review before signing.',
      retryable: true,
    };
  }
  if (/reject|declin|cancelled|canceled|4001|user denied/.test(normalized)) {
    return {
      category: 'wallet_rejected',
      message: 'Wallet approval was rejected.',
      retryable: true,
    };
  }
  if (/insufficient|not enough.*(?:sol|fund|balance)/.test(normalized)) {
    return {
      category: 'insufficient_balance',
      message: 'The wallet does not have enough tokens or SOL for this transaction.',
      retryable: false,
    };
  }
  if (/blockhash|expired|block height exceeded|plan_expired/.test(normalized)) {
    return {
      category: 'blockhash_expired',
      message: 'The transaction review expired. Rebuild and simulate it again.',
      retryable: true,
    };
  }
  if (/account.*(?:in use|already initialized)|already in use/.test(normalized)) {
    return {
      category: 'account_state_changed',
      message: 'An on-chain account changed while this transaction was pending. Refresh and retry.',
      retryable: true,
    };
  }
  if (/confirmation.*timed out|confirmation_timeout/.test(normalized)) {
    return {
      category: 'confirmation_timeout',
      message: 'The transaction was submitted but confirmation is still pending.',
      retryable: true,
    };
  }
  if (/rpc|fetch|network|timeout|503|502/.test(normalized)) {
    return {
      category: 'rpc_unavailable',
      message: 'Solana RPC is temporarily unavailable. The transaction was not automatically retried.',
      retryable: true,
    };
  }
  if (/custom program error|anchorerror|transaction failed|simulation failed/.test(normalized)) {
    return {
      category: 'program_error',
      message: 'The on-chain program rejected the transaction. Refresh the market before retrying.',
      retryable: true,
    };
  }
  return {
    category: 'unknown',
    message: message || 'The wallet request failed.',
    retryable: true,
  };
}

export function decisionAttributionRequest(plan) {
  if (
    plan?.kind !== 'swap'
    || !(plan.transaction instanceof Transaction)
    || !['futarchy_amm', 'manifest'].includes(plan.attributionIntent?.venue)
  ) {
    throw new Error('A reviewed decision swap is required for 01RX attribution');
  }
  const transaction = plan.transaction;
  if (
    transaction.signatures.length > 1
    || transaction.signatures.some(entry => (
      entry.signature
      && !Buffer.from(entry.signature).every(byte => byte === 0)
    ))
  ) {
    throw new Error('Decision attribution requires one unsigned wallet fee payer');
  }
  const wireBytes = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  if (wireBytes.length > PACKET_DATA_SIZE) {
    throw new Error('Decision transaction exceeds Solana transaction size limits');
  }
  return {
    proposal: plan.attributionIntent.proposal,
    transaction: Buffer.from(wireBytes).toString('base64'),
  };
}

export async function applyDecisionAttribution(connection, plan, payload) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  const request = decisionAttributionRequest(plan);
  const authorityAddress = safeAddress(payload?.authority);
  const intent = plan.attributionIntent || {};
  if (
    !authorityAddress
    || payload?.cluster !== MAINNET_CHAIN
    || payload?.marker !== DECISION_ATTRIBUTION.marker
    || payload?.version !== DECISION_ATTRIBUTION.version
    || payload?.feeBps !== DECISION_ATTRIBUTION.feeBps
    || payload?.proposal !== intent.proposal
    || payload?.trader !== intent.trader
    || payload?.outcome !== intent.outcome
    || payload?.side !== intent.side
    || payload?.inputAmountRaw !== intent.inputAmountRaw
    || payload?.minimumOutputAmountRaw !== intent.minimumOutputAmountRaw
    || payload?.venue !== intent.venue
  ) {
    throw new Error('01RX attribution does not match the reviewed decision swap');
  }
  const encoded = String(payload?.transaction || '').trim();
  let attributed;
  try {
    const wireBytes = Buffer.from(encoded, 'base64');
    if (
      !wireBytes.length
      || wireBytes.length > PACKET_DATA_SIZE
      || wireBytes.toString('base64') !== encoded
    ) {
      throw new Error('invalid wire bytes');
    }
    attributed = Transaction.from(wireBytes);
  } catch (_) {
    throw new Error('01RX returned an invalid attributed transaction');
  }
  const original = Transaction.from(Buffer.from(request.transaction, 'base64'));
  const authority = new PublicKey(authorityAddress);
  const memo = attributed.instructions.at(-1);
  if (
    attributed.feePayer?.toBase58() !== original.feePayer?.toBase58()
    || attributed.recentBlockhash !== original.recentBlockhash
    || attributed.instructions.length !== original.instructions.length + 1
    || !original.instructions.every((instruction, index) => (
      transactionInstructionEquals(instruction, attributed.instructions[index])
    ))
    || !memo?.programId.equals(MEMO_PROGRAM_ID)
    || memo.keys.length !== 1
    || !memo.keys[0].pubkey.equals(authority)
    || memo.keys[0].isSigner !== true
    || memo.keys[0].isWritable !== false
    || Buffer.from(memo.data).toString('utf8') !== DECISION_ATTRIBUTION.marker
    || attributed.signatures.length !== 2
    || attributed.signatures[0].publicKey.toBase58() !== intent.trader
    || attributed.signatures[0].signature != null
    || !attributed.signatures[1].publicKey.equals(authority)
    || !attributed.signatures[1].signature
    || !attributed.verifySignatures(false)
  ) {
    throw new Error('01RX attribution signature or transaction binding is invalid');
  }
  const feeResponse = await connection.getFeeForMessage(
    attributed.compileMessage(),
    'confirmed',
  );
  const networkFeeLamports = Number.isFinite(feeResponse?.value)
    ? feeResponse.value
    : null;
  plan.transaction = attributed;
  plan.networkFeeLamports = networkFeeLamports;
  plan.networkFeeSol = networkFeeLamports == null
    ? null
    : networkFeeLamports / 1_000_000_000;
  plan.attribution = Object.freeze({
    authority: authorityAddress,
    feeBps: DECISION_ATTRIBUTION.feeBps,
    marker: DECISION_ATTRIBUTION.marker,
    version: DECISION_ATTRIBUTION.version,
  });
  plan.summary = {
    ...plan.summary,
    attributionAuthority: authorityAddress,
    attributionMarker: DECISION_ATTRIBUTION.marker,
    platformFeeBps: DECISION_ATTRIBUTION.feeBps,
    networkFeeSol: plan.networkFeeSol,
    programIds: [
      ...(plan.summary?.programIds || []),
      MEMO_PROGRAM_ID.toBase58(),
    ],
    note: `${plan.summary?.note || ''} 01RX co-signs a zero-fee on-chain attribution marker so this volume can be independently indexed.`,
  };
  return plan;
}

export async function simulatePlan(connection, plan, {
  minContextSlot = 0,
  safetyCheck = loadAndValidateDecisionExecutionSafety,
} = {}) {
  if (!(connection instanceof Connection) || !plan?.transaction) {
    throw new Error('A built transaction plan is required');
  }
  const executionSafety = await safetyCheck(connection, { minContextSlot });
  const transactionFingerprint = await transactionReviewFingerprint(plan.transaction);
  const response = await connection.simulateTransaction(plan.transaction);
  const fingerprintAfterSimulation = await transactionReviewFingerprint(plan.transaction);
  if (fingerprintAfterSimulation !== transactionFingerprint) {
    const error = new Error('Transaction changed during simulation');
    error.code = 'SIMULATION_TRANSACTION_CHANGED';
    throw error;
  }
  const value = response?.value || {};
  const logs = Array.isArray(value.logs) ? value.logs.slice(-40) : [];
  const anchorMessage = logs
    .map(line => /Error Message:\s*([^.]*(?:\.)?)/.exec(line)?.[1] || '')
    .find(Boolean);
  return {
    ok: value.err == null,
    error: anchorMessage || simulationErrorText(value.err),
    logs,
    unitsConsumed: Number.isFinite(value.unitsConsumed) ? value.unitsConsumed : null,
    replacementBlockhash: value.replacementBlockhash || null,
    transactionFingerprint,
    executionSafety,
  };
}

function serializeForWallet(transaction) {
  if (transaction instanceof VersionedTransaction) {
    return new Uint8Array(transaction.serialize());
  }
  return new Uint8Array(transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }));
}

export function reviewedSignedWireBytes(signedTransaction, reviewedTransaction) {
  let wireBytes;
  let decoded;
  try {
    wireBytes = signedTransaction instanceof Uint8Array
      ? Buffer.from(signedTransaction)
      : Buffer.from(signedTransaction?.serialize?.() || []);
    decoded = reviewedTransaction instanceof VersionedTransaction
      ? VersionedTransaction.deserialize(wireBytes)
      : Transaction.from(wireBytes);
  } catch (_) {
    const error = new Error('Wallet returned an invalid signed transaction');
    error.code = 'SIGNED_TRANSACTION_INVALID';
    throw error;
  }
  const reviewedMessage = Buffer.from(
    reviewedTransaction instanceof VersionedTransaction
      ? reviewedTransaction.message.serialize()
      : reviewedTransaction?.serializeMessage?.() || [],
  );
  const signedMessage = Buffer.from(
    decoded instanceof VersionedTransaction
      ? decoded.message.serialize()
      : decoded.serializeMessage(),
  );
  if (!reviewedMessage.length || !signedMessage.equals(reviewedMessage)) {
    const error = new Error('Wallet changed the transaction after review');
    error.code = 'SIGNED_TRANSACTION_CHANGED';
    throw error;
  }
  if (
    reviewedTransaction instanceof Transaction
    && decoded instanceof Transaction
    && reviewedTransaction.signatures.some((entry, index) => (
      entry.signature
      && !Buffer.from(entry.signature).equals(
        Buffer.from(decoded.signatures[index]?.signature || []),
      )
    ))
  ) {
    const error = new Error('Wallet removed a required transaction co-signature');
    error.code = 'SIGNED_TRANSACTION_CHANGED';
    throw error;
  }
  return new Uint8Array(wireBytes);
}

function hasReviewedCosignature(transaction) {
  return transaction instanceof Transaction
    && transaction.signatures.some(entry => entry.signature);
}

export function buildDflowSpotPlan(payload, walletAddress) {
  const owner = safeAddress(walletAddress);
  const responseOwner = safeAddress(payload?.owner);
  const encoded = String(payload?.transaction || '').trim();
  const reviewToken = String(payload?.reviewToken || '').trim();
  const quote = payload?.quote;
  if (
    !owner
    || responseOwner !== owner
    || !encoded
    || !reviewToken
    || !quote
    || payload?.cluster !== MAINNET_CHAIN
  ) {
    throw new Error('A wallet-bound DFlow review is required');
  }
  let wireBytes;
  let transaction;
  try {
    wireBytes = Buffer.from(encoded, 'base64');
    if (!wireBytes.length || wireBytes.toString('base64') !== encoded) {
      throw new Error('invalid wire bytes');
    }
    transaction = VersionedTransaction.deserialize(wireBytes);
  } catch (_) {
    throw new Error('DFlow returned an invalid versioned transaction');
  }
  if (
    transaction.version !== 0
    || transaction.message.header.numRequiredSignatures !== 1
    || transaction.signatures.length !== 1
    || publicKeyAddress(transaction.message.staticAccountKeys[0]) !== owner
    || !transaction.signatures.every(signature => Buffer.from(signature).every(byte => byte === 0))
    || payload.review?.feePayer !== owner
  ) {
    throw new Error('DFlow transaction signer does not match the connected wallet');
  }
  const inputMint = safeAddress(quote.inputMint);
  const outputMint = safeAddress(quote.outputMint);
  const route = Array.isArray(quote.route) ? quote.route : [];
  if (
    !inputMint
    || !outputMint
    || !/^[a-f0-9]{64}$/.test(String(payload.review?.transactionFingerprint || ''))
    || payload.review?.simulation?.ok !== true
  ) {
    throw new Error('DFlow review is incomplete');
  }
  const inputSymbol = payload.side === 'buy' ? 'USDC' : String(payload.ticker || 'TOKEN');
  const outputSymbol = payload.side === 'buy' ? String(payload.ticker || 'TOKEN') : 'USDC';
  return {
    builtAt: Date.now(),
    safetyMinContextSlot: Number.isSafeInteger(quote.contextSlot) ? quote.contextSlot : 0,
    kind: 'spot',
    reviewToken,
    serverFingerprint: payload.review.transactionFingerprint,
    transaction,
    summary: {
      action: `${String(payload.side || 'buy').toUpperCase()} ${String(payload.ticker || 'TOKEN')}`,
      venue: route.map(leg => String(leg.venue || '')).filter(Boolean).join(' → ') || 'DFlow',
      note: 'DFlow signed this route response; 01RX verified and simulated the exact transaction.',
      feePayer: owner,
      amountIn: `${quote.amountIn} ${inputSymbol}`,
      inputMint,
      estimatedAmountOut: `${quote.estimatedAmountOut} ${outputSymbol}`,
      minimumAmountOut: `${quote.minimumAmountOut} ${outputSymbol}`,
      outputMint,
      recipient: owner,
      programIds: Array.isArray(payload.review.programIds)
        ? payload.review.programIds.map(String)
        : [],
      networkFeeSol: Number.isSafeInteger(payload.review.networkFeeLamports)
        ? payload.review.networkFeeLamports / 1_000_000_000
        : null,
      priceImpactPercent: Number(quote.priceImpactPercent),
      slippageBps: Number(quote.slippageBps),
      platformFeeBps: Number(quote.platformFeeBps),
    },
  };
}

export async function signReviewedPlan(connection, adapter, plan, {
  safetyCheck = loadAndValidateSolanaRestartSafety,
} = {}) {
  if (!(connection instanceof Connection)) {
    throw new Error('Solana connection is required');
  }
  if (!(plan?.transaction instanceof VersionedTransaction)) {
    throw new Error('A reviewed versioned transaction is required');
  }
  if (!adapter?.canSignTransaction) {
    throw new Error('Connected wallet cannot return a signed transaction for server validation');
  }
  if (adapter.address !== plan.summary?.feePayer) {
    throw new Error('Connected wallet changed after transaction review');
  }
  if (
    Number.isFinite(plan.builtAt)
    && Date.now() - plan.builtAt > TRANSACTION_REVIEW_MAX_AGE_MS
  ) {
    const error = new Error('Transaction plan expired before wallet approval');
    error.code = 'PLAN_EXPIRED';
    throw error;
  }
  if (!/^[a-f0-9]{64}$/.test(String(plan.reviewFingerprint || ''))) {
    const error = new Error('Transaction was not bound to a successful review');
    error.code = 'PLAN_NOT_REVIEWED';
    throw error;
  }
  const currentFingerprint = await transactionReviewFingerprint(plan.transaction);
  if (currentFingerprint !== plan.reviewFingerprint) {
    const error = new Error('Transaction changed after simulation; rebuild the review');
    error.code = 'PLAN_CHANGED_AFTER_REVIEW';
    throw error;
  }
  await safetyCheck(connection, {
    minContextSlot: Number.isSafeInteger(plan.safetyMinContextSlot)
      ? plan.safetyMinContextSlot
      : 0,
  });

  let signedWireBytes;
  if (adapter.kind === 'standard') {
    const sign = adapter.wallet.features?.[SolanaSignTransaction]?.signTransaction;
    if (typeof sign !== 'function') {
      throw new Error('Wallet cannot return a signed Solana transaction');
    }
    const [output] = await sign({
      account: adapter.account,
      chain: MAINNET_CHAIN,
      transaction: serializeForWallet(plan.transaction),
      options: { preflightCommitment: 'confirmed' },
    });
    if (!output?.signedTransaction) throw new Error('Wallet returned no signed transaction');
    signedWireBytes = reviewedSignedWireBytes(
      output.signedTransaction,
      plan.transaction,
    );
  } else {
    const provider = adapter.provider;
    if (typeof provider?.signTransaction !== 'function') {
      throw new Error('Wallet cannot return a signed Solana transaction');
    }
    const signed = await provider.signTransaction(plan.transaction);
    signedWireBytes = reviewedSignedWireBytes(signed, plan.transaction);
  }
  return {
    signedTransaction: Buffer.from(signedWireBytes).toString('base64'),
  };
}

export async function transactionReviewFingerprint(transaction) {
  if (!transaction || typeof transaction.serialize !== 'function') {
    throw new Error('A built transaction is required');
  }
  if (!globalThis.crypto?.subtle?.digest) {
    const error = new Error('Secure transaction review is unavailable in this browser');
    error.code = 'TRANSACTION_REVIEW_UNAVAILABLE';
    throw error;
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    serializeForWallet(transaction),
  );
  return Buffer.from(digest).toString('hex');
}

export async function getSignatureStates(connection, signatures) {
  if (!(connection instanceof Connection)) throw new Error('Solana connection is required');
  const safeSignatures = (Array.isArray(signatures) ? signatures : [])
    .map(safeSignature)
    .filter(Boolean)
    .slice(0, 10);
  if (!safeSignatures.length) return [];
  const response = await connection.getSignatureStatuses(
    safeSignatures,
    { searchTransactionHistory: true },
  );
  return safeSignatures.map((signature, index) => {
    const status = response?.value?.[index] || null;
    return {
      signature,
      found: Boolean(status),
      status: status?.err
        ? 'failed'
        : status?.confirmationStatus === 'finalized'
          ? 'finalized'
          : status?.confirmationStatus === 'confirmed'
            ? 'confirmed'
            : status
              ? 'processed'
              : 'submitted',
      slot: Number.isSafeInteger(status?.slot) ? status.slot : null,
      error: status?.err ? simulationErrorText(status.err) : '',
    };
  });
}

export async function confirmSignature(
  connection,
  signature,
  {
    timeoutMs = 45_000,
    pollIntervalMs = 1_200,
    onStatus = null,
  } = {},
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const [state] = await getSignatureStates(connection, [signature]);
    if (typeof onStatus === 'function') onStatus(state);
    if (state?.status === 'failed') {
      const error = new Error(`Transaction failed: ${state.error}`);
      error.code = 'TRANSACTION_FAILED';
      error.signature = signature;
      error.status = state;
      throw error;
    }
    if (state?.status === 'confirmed' || state?.status === 'finalized') {
      return state;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  const error = new Error(
    'Transaction was submitted but confirmation timed out. Check the signature before retrying.',
  );
  error.code = 'CONFIRMATION_TIMEOUT';
  error.signature = signature;
  throw error;
}

export async function sendPlan(connection, adapter, plan, {
  minContextSlot = 0,
  safetyCheck = loadAndValidateDecisionExecutionSafety,
} = {}) {
  if (!(connection instanceof Connection) || !plan?.transaction) {
    throw new Error('A built transaction plan is required');
  }
  if (!adapter?.canTransact) {
    throw new Error('Connected wallet does not support transaction signing');
  }
  if (adapter.address !== plan.summary?.feePayer) {
    throw new Error('Connected wallet changed after transaction review');
  }
  if (
    Number.isFinite(plan.builtAt)
    && Date.now() - plan.builtAt > TRANSACTION_REVIEW_MAX_AGE_MS
  ) {
    const error = new Error('Transaction plan expired before wallet approval');
    error.code = 'PLAN_EXPIRED';
    throw error;
  }
  if (!/^[a-f0-9]{64}$/.test(String(plan.reviewFingerprint || ''))) {
    const error = new Error('Transaction was not bound to a successful review');
    error.code = 'PLAN_NOT_REVIEWED';
    throw error;
  }
  const currentFingerprint = await transactionReviewFingerprint(plan.transaction);
  if (currentFingerprint !== plan.reviewFingerprint) {
    const error = new Error('Transaction changed after simulation; rebuild the review');
    error.code = 'PLAN_CHANGED_AFTER_REVIEW';
    throw error;
  }
  await safetyCheck(connection, { minContextSlot });

  let signature = '';
  if (adapter.kind === 'standard') {
    const sign = adapter.wallet.features?.[SolanaSignTransaction]?.signTransaction;
    const signAndSend = adapter.wallet.features?.[SolanaSignAndSendTransaction]
      ?.signAndSendTransaction;
    if (typeof sign === 'function') {
      const [output] = await sign({
        account: adapter.account,
        chain: MAINNET_CHAIN,
        transaction: serializeForWallet(plan.transaction),
        options: { preflightCommitment: 'confirmed' },
      });
      if (!output?.signedTransaction) throw new Error('Wallet returned no signed transaction');
      const signedWireBytes = reviewedSignedWireBytes(
        output.signedTransaction,
        plan.transaction,
      );
      signature = await connection.sendRawTransaction(signedWireBytes, {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        maxRetries: 3,
      });
    } else if (typeof signAndSend === 'function') {
      if (hasReviewedCosignature(plan.transaction)) {
        const error = new Error(
          'This attributed transaction requires a wallet that returns the signed transaction',
        );
        error.code = 'WALLET_CANNOT_PRESERVE_COSIGNATURE';
        throw error;
      }
      const [output] = await signAndSend({
        account: adapter.account,
        chain: MAINNET_CHAIN,
        transaction: serializeForWallet(plan.transaction),
        options: {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
          skipPreflight: false,
          maxRetries: 3,
        },
      });
      signature = output?.signature ? base58.encode(output.signature) : '';
    } else {
      throw new Error('Wallet cannot sign Solana transactions');
    }
  } else {
    const provider = adapter.provider;
    if (typeof provider?.signTransaction === 'function') {
      const signed = await provider.signTransaction(plan.transaction);
      const signedWireBytes = reviewedSignedWireBytes(signed, plan.transaction);
      signature = await connection.sendRawTransaction(signedWireBytes, {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        maxRetries: 3,
      });
    } else if (typeof provider?.signAndSendTransaction === 'function') {
      if (hasReviewedCosignature(plan.transaction)) {
        const error = new Error(
          'This attributed transaction requires a wallet that returns the signed transaction',
        );
        error.code = 'WALLET_CANNOT_PRESERVE_COSIGNATURE';
        throw error;
      }
      const result = await provider.signAndSendTransaction(plan.transaction, {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        maxRetries: 3,
      });
      const resultSignature = result?.signature || result;
      signature = resultSignature instanceof Uint8Array
        ? base58.encode(resultSignature)
        : String(resultSignature || '');
    }
  }
  const normalizedSignature = safeSignature(signature);
  if (!normalizedSignature) throw new Error('Wallet returned an invalid transaction signature');
  return { signature: normalizedSignature };
}
