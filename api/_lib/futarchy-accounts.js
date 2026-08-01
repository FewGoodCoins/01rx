import { TOKEN_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

export const FUTARCHY_PROGRAM_ID = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DAO_ACCOUNT_DISCRIMINATOR = Buffer.from('a3092f1f3455c531', 'hex');
export const PROPOSAL_ACCOUNT_DISCRIMINATOR = Buffer.from('1a5ebdbb74883521', 'hex');
export const DAO_ACCOUNT_LENGTH = 1_205;
export const PROPOSAL_ACCOUNT_MIN_LENGTH = 347;
const PRICE_SCALE = 1_000_000_000_000n;
const U128_BITS = 128;
const PROPOSAL_STATES = Object.freeze(['draft', 'pending', 'passed', 'failed', 'removed']);

function serviceError(message, code = 'SOURCE_MISMATCH', statusCode = 503, cause) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

export function normalizeAddress(value) {
  const input = value instanceof PublicKey ? value.toBase58() : String(value || '').trim();
  try {
    const address = new PublicKey(input).toBase58();
    return address === input ? address : '';
  } catch {
    return '';
  }
}

function requireAddress(value, label) {
  const address = normalizeAddress(value);
  if (!address) throw serviceError(`${label} is invalid`, 'INVALID_SOURCE_DATA');
  return new PublicKey(address);
}

function accountOwner(account) {
  return normalizeAddress(account?.owner);
}

function requireProgramAccount(account, label, minimumLength, discriminator) {
  if (
    !account
    || accountOwner(account) !== FUTARCHY_PROGRAM_ID
    || account.executable === true
    || !Buffer.isBuffer(account.data)
    || account.data.length < minimumLength
    || !account.data.subarray(0, discriminator.length).equals(discriminator)
  ) {
    throw serviceError(`${label} failed its owner, size, or discriminator check`);
  }
  return account.data;
}

function readUInt128LE(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || buffer.length < offset + 16) {
    throw serviceError('Futarchy account ended before a u128 field');
  }
  return buffer.readBigUInt64LE(offset)
    + (buffer.readBigUInt64LE(offset + 8) << 64n);
}

function calculateOracleTwapRaw(oracle, currentTimestampSeconds) {
  const currentTimestamp = BigInt(Math.trunc(Number(currentTimestampSeconds)));
  const startTimestamp = oracle.createdAtTimestamp + BigInt(oracle.startDelaySeconds);
  if (
    oracle.lastUpdatedTimestamp <= startTimestamp
    || currentTimestamp <= startTimestamp
    || currentTimestamp < oracle.lastUpdatedTimestamp
    || oracle.aggregatorRaw === 0n
  ) return null;

  const secondsPassed = currentTimestamp - startTimestamp;
  const finalInterval = currentTimestamp - oracle.lastUpdatedTimestamp;
  const finalContribution = BigInt.asUintN(
    U128_BITS,
    oracle.lastObservationRaw * finalInterval,
  );
  return BigInt.asUintN(U128_BITS, oracle.aggregatorRaw + finalContribution)
    / secondsPassed;
}

function decodeOracle(buffer, offset, nowSeconds) {
  const oracle = {
    aggregatorRaw: readUInt128LE(buffer, offset),
    lastUpdatedTimestamp: buffer.readBigInt64LE(offset + 16),
    createdAtTimestamp: buffer.readBigInt64LE(offset + 24),
    lastPriceRaw: readUInt128LE(buffer, offset + 32),
    lastObservationRaw: readUInt128LE(buffer, offset + 48),
    startDelaySeconds: buffer.readUInt32LE(offset + 96),
  };
  return {
    lastPriceRaw: oracle.lastPriceRaw,
    twapRaw: calculateOracleTwapRaw(oracle, nowSeconds),
  };
}

function decodePool(buffer, offset, nowSeconds) {
  if (buffer.length < offset + 132) throw serviceError('Futarchy pool is truncated');
  return {
    oracle: decodeOracle(buffer, offset, nowSeconds),
    quoteReservesRaw: buffer.readBigUInt64LE(offset + 100),
    baseReservesRaw: buffer.readBigUInt64LE(offset + 108),
  };
}

function readTeamSponsoredThreshold(buffer, initialSpendingLimitOffset) {
  if (buffer.length <= initialSpendingLimitOffset) {
    throw serviceError('DAO account ended before its spending-limit configuration');
  }
  const optionTag = buffer.readUInt8(initialSpendingLimitOffset);
  let offset = initialSpendingLimitOffset + 1;
  if (optionTag === 1) {
    if (buffer.length < offset + 12) throw serviceError('DAO spending limit is truncated');
    offset += 8;
    const memberCount = buffer.readUInt32LE(offset);
    offset += 4;
    if (memberCount > 10 || buffer.length < offset + memberCount * 32) {
      throw serviceError('DAO spending-limit member list is invalid');
    }
    offset += memberCount * 32;
  } else if (optionTag !== 0) {
    throw serviceError('DAO spending-limit option is invalid');
  }
  if (buffer.length < offset + 2) throw serviceError('DAO threshold is truncated');
  return buffer.readInt16LE(offset);
}

function decodeDaoAccount(buffer, nowSeconds) {
  if (buffer.length !== DAO_ACCOUNT_LENGTH) {
    throw serviceError(`DAO account has unsupported length ${buffer.length}`);
  }
  const poolState = buffer.readUInt8(8);
  if (poolState !== 1) throw serviceError('DAO does not expose active PASS and FAIL pools');
  const ammFieldsOffset = 405;
  const daoOffset = ammFieldsOffset + 16 + (4 * 32);
  const proposalCountOffset = daoOffset + 169;
  const initialSpendingLimitOffset = daoOffset + 247;
  const addressAt = offset => new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
  return {
    poolState,
    spot: decodePool(buffer, 9, nowSeconds),
    pass: decodePool(buffer, 141, nowSeconds),
    fail: decodePool(buffer, 273, nowSeconds),
    ammBaseMint: addressAt(ammFieldsOffset + 16),
    ammQuoteMint: addressAt(ammFieldsOffset + 48),
    baseMint: addressAt(daoOffset + 105),
    quoteMint: addressAt(daoOffset + 137),
    proposalCount: buffer.readUInt32LE(proposalCountOffset),
    passThresholdBps: buffer.readUInt16LE(proposalCountOffset + 4),
    secondsPerProposal: buffer.readUInt32LE(proposalCountOffset + 6),
    teamSponsoredPassThresholdBps: readTeamSponsoredThreshold(
      buffer,
      initialSpendingLimitOffset,
    ),
  };
}

function decodeProposalAccount(buffer) {
  const stateTag = buffer.readUInt8(52);
  if (stateTag >= PROPOSAL_STATES.length) {
    throw serviceError(`Proposal has unsupported state ${stateTag}`);
  }
  const stateSize = stateTag === 0 ? 9 : 1;
  let offset = 52 + stateSize;
  const readAddress = () => {
    if (buffer.length < offset + 32) throw serviceError('Proposal account is truncated');
    const value = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
    offset += 32;
    return value;
  };
  const baseVault = readAddress();
  const quoteVault = readAddress();
  const daoAddress = readAddress();
  offset += 1;
  const question = readAddress();
  if (buffer.length < offset + 4) throw serviceError('Proposal duration is truncated');
  const durationInSeconds = buffer.readUInt32LE(offset);
  offset += 4;
  const squadsProposal = readAddress();
  const passBaseMint = readAddress();
  const passQuoteMint = readAddress();
  const failBaseMint = readAddress();
  const failQuoteMint = readAddress();
  if (buffer.length < offset + 1) throw serviceError('Proposal sponsorship flag is truncated');
  return {
    number: buffer.readUInt32LE(8),
    proposer: new PublicKey(buffer.subarray(12, 44)).toBase58(),
    timestampEnqueued: Number(buffer.readBigInt64LE(44)),
    state: PROPOSAL_STATES[stateTag],
    baseVault,
    quoteVault,
    daoAddress,
    question,
    durationInSeconds,
    squadsProposal,
    passBaseMint,
    passQuoteMint,
    failBaseMint,
    failQuoteMint,
    isTeamSponsored: buffer.readUInt8(offset) === 1,
  };
}

function rawAmountToUi(value, decimals) {
  const result = Number(value) / (10 ** decimals);
  return Number.isFinite(result) ? result : null;
}

function rawPriceToUi(value, baseDecimals, quoteDecimals) {
  if (value == null) return null;
  const result = (Number(value) / Number(PRICE_SCALE))
    * (10 ** (baseDecimals - quoteDecimals));
  return Number.isFinite(result) ? result : null;
}

function presentPool(pool, baseDecimals, quoteDecimals) {
  const baseReserves = rawAmountToUi(pool.baseReservesRaw, baseDecimals);
  const quoteReserves = rawAmountToUi(pool.quoteReservesRaw, quoteDecimals);
  return {
    price: baseReserves > 0 ? quoteReserves / baseReserves : null,
    oraclePrice: rawPriceToUi(pool.oracle.lastPriceRaw, baseDecimals, quoteDecimals),
    twapPrice: rawPriceToUi(pool.oracle.twapRaw, baseDecimals, quoteDecimals),
    baseReserves,
    quoteReserves,
    liquidityUsd: Number.isFinite(quoteReserves) ? quoteReserves * 2 : null,
  };
}

function buildDecision(passPool, failPool, thresholdBps, baseDecimals, quoteDecimals) {
  const passRaw = passPool?.oracle?.twapRaw;
  const failRaw = failPool?.oracle?.twapRaw;
  const thresholdNumerator = 10_000 + thresholdBps;
  if (passRaw == null || failRaw == null || failRaw <= 0n || thresholdNumerator <= 0) {
    return { passing: null, marginPct: null, targetPassTwap: null };
  }
  // Match the on-chain finalization rule: integer multiplication and division
  // occur before the strict greater-than comparison.
  const targetRaw = failRaw * BigInt(thresholdNumerator) / 10_000n;
  return {
    passing: passRaw > targetRaw,
    marginPct: (((Number(passRaw) / Number(failRaw)) - 1) * 100) - (thresholdBps / 100),
    targetPassTwap: rawPriceToUi(targetRaw, baseDecimals, quoteDecimals),
  };
}

function isoFromSeconds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? new Date(number * 1_000).toISOString()
    : null;
}

export async function loadValidatedMarketSnapshot(connection, input, options = {}) {
  const dao = requireAddress(input.daoAddress, 'DAO address');
  const proposal = requireAddress(input.proposalAddress, 'Proposal address');
  const expectedBaseMint = requireAddress(input.baseMint, 'Configured base mint');
  const expectedQuoteMint = requireAddress(input.quoteMint || USDC_MINT, 'Configured quote mint');
  const response = await connection.getMultipleAccountsInfoAndContext(
    [dao, proposal, expectedBaseMint, expectedQuoteMint],
    { commitment: 'confirmed' },
  );
  const slot = response?.context?.slot;
  if (!Number.isSafeInteger(slot) || slot < 1 || response?.value?.length !== 4) {
    throw serviceError('Solana returned an incomplete market snapshot', 'RPC_UNAVAILABLE');
  }
  const [daoAccount, proposalAccount, baseMintAccount, quoteMintAccount] = response.value;
  const daoBuffer = requireProgramAccount(
    daoAccount,
    'DAO account',
    DAO_ACCOUNT_LENGTH,
    DAO_ACCOUNT_DISCRIMINATOR,
  );
  const proposalBuffer = requireProgramAccount(
    proposalAccount,
    'Proposal account',
    PROPOSAL_ACCOUNT_MIN_LENGTH,
    PROPOSAL_ACCOUNT_DISCRIMINATOR,
  );
  if (
    accountOwner(baseMintAccount) !== TOKEN_PROGRAM_ID.toBase58()
    || accountOwner(quoteMintAccount) !== TOKEN_PROGRAM_ID.toBase58()
  ) throw serviceError('Decision market uses an unsupported token program');

  let baseMintState;
  let quoteMintState;
  try {
    baseMintState = unpackMint(expectedBaseMint, baseMintAccount, TOKEN_PROGRAM_ID);
    quoteMintState = unpackMint(expectedQuoteMint, quoteMintAccount, TOKEN_PROGRAM_ID);
  } catch (cause) {
    throw serviceError('Decision-market mint metadata is invalid', 'SOURCE_MISMATCH', 503, cause);
  }
  const nowMs = options.nowMs || Date.now();
  const daoState = decodeDaoAccount(daoBuffer, Math.floor(nowMs / 1_000));
  const proposalState = decodeProposalAccount(proposalBuffer);
  if (
    proposalState.state !== 'pending'
    || proposalState.daoAddress !== dao.toBase58()
    || daoState.baseMint !== expectedBaseMint.toBase58()
    || daoState.quoteMint !== expectedQuoteMint.toBase58()
    || daoState.ammBaseMint !== expectedBaseMint.toBase58()
    || daoState.ammQuoteMint !== expectedQuoteMint.toBase58()
  ) throw serviceError('Live proposal identity does not match the configured DAO and mints');

  const baseDecimals = baseMintState.decimals;
  const quoteDecimals = quoteMintState.decimals;
  const spot = presentPool(daoState.spot, baseDecimals, quoteDecimals);
  const pass = presentPool(daoState.pass, baseDecimals, quoteDecimals);
  const fail = presentPool(daoState.fail, baseDecimals, quoteDecimals);
  const thresholdBps = proposalState.isTeamSponsored
    ? daoState.teamSponsoredPassThresholdBps
    : daoState.passThresholdBps;
  return {
    slot,
    asOf: new Date(nowMs).toISOString(),
    daoAddress: dao.toBase58(),
    baseMint: expectedBaseMint.toBase58(),
    quoteMint: expectedQuoteMint.toBase58(),
    baseDecimals,
    quoteDecimals,
    proposal: proposalState,
    thresholdBps,
    decision: buildDecision(
      daoState.pass,
      daoState.fail,
      thresholdBps,
      baseDecimals,
      quoteDecimals,
    ),
    spot,
    pass,
    fail,
    liquidityUsd: [spot, pass, fail].every(pool => Number.isFinite(pool.liquidityUsd))
      ? spot.liquidityUsd + pass.liquidityUsd + fail.liquidityUsd
      : null,
    source: {
      provider: 'solana.rpc.getMultipleAccounts',
      slot,
      asOf: new Date(nowMs).toISOString(),
    },
    createdAt: isoFromSeconds(proposalState.timestampEnqueued),
    endsAt: isoFromSeconds(
      proposalState.timestampEnqueued + proposalState.durationInSeconds,
    ),
  };
}

export { serviceError as futarchyAccountError };
