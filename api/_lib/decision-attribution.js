import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Keypair,
  PACKET_DATA_SIZE,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import base58Module from 'bs58';
import { FutarchyIDL as FUTARCHY_V0_6_IDL } from '@metadaoproject/programs/futarchy/v0.6';
import { ConditionalVaultIDL as CONDITIONAL_VAULT_V0_4_IDL } from '@metadaoproject/programs/conditional_vault/v0.4';
import {
  SwapStruct as MANIFEST_SWAP_STRUCT,
  swapInstructionDiscriminator as MANIFEST_SWAP_DISCRIMINATOR,
} from '@cks-systems/manifest-sdk';
import {
  DECISION_ATTRIBUTION,
} from '@01resolved/contracts';
import { tradingError } from './dflow-spot-order.js';

const base58 = base58Module.default || base58Module;
const FUTARCHY_V0_6_PROGRAM_ID = new PublicKey(
  'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq',
);
const CONDITIONAL_VAULT_V0_4_PROGRAM_ID = new PublicKey(
  'VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg',
);
const MANIFEST_PROGRAM_ID = new PublicKey(
  'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
);
const MEMO_PROGRAM_ID = new PublicKey(DECISION_ATTRIBUTION.memoProgramId);
const MARKER_BYTES = Buffer.from(DECISION_ATTRIBUTION.marker, 'utf8');
const instructionCoder = new BorshInstructionCoder(FUTARCHY_V0_6_IDL);
const vaultInstructionCoder = new BorshInstructionCoder(CONDITIONAL_VAULT_V0_4_IDL);
const ALLOWED_CORE_PROGRAMS = new Set([
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
  ComputeBudgetProgram.programId.toBase58(),
  CONDITIONAL_VAULT_V0_4_PROGRAM_ID.toBase58(),
  FUTARCHY_V0_6_PROGRAM_ID.toBase58(),
  MANIFEST_PROGRAM_ID.toBase58(),
]);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw tradingError(`${label} must be a JSON object`, 'INVALID_ATTRIBUTION_REQUEST', 400);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw tradingError(
      `${label} has unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
      'INVALID_ATTRIBUTION_REQUEST',
      400,
    );
  }
}

function decodeUnsignedTransaction(value) {
  const encoded = String(value || '').trim();
  let bytes;
  let transaction;
  try {
    bytes = Buffer.from(encoded, 'base64');
    if (
      !bytes.length
      || bytes.length > PACKET_DATA_SIZE
      || bytes.toString('base64') !== encoded
    ) {
      throw new Error('invalid transaction bytes');
    }
    transaction = Transaction.from(bytes);
  } catch {
    throw tradingError(
      'Decision attribution requires a valid legacy Solana transaction',
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }
  if (
    !transaction.feePayer
    || !transaction.recentBlockhash
    || transaction.signatures.length !== 1
    || transaction.signatures.some(entry => (
      entry.signature
      && !Buffer.from(entry.signature).every(byte => byte === 0)
    ))
  ) {
    throw tradingError(
      'Decision attribution requires one unsigned wallet fee payer',
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }
  return transaction;
}

function enumKey(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw tradingError(
      `MetaDAO ${label} is invalid`,
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }
  const [key] = Object.keys(value);
  if (!key) {
    throw tradingError(
      `MetaDAO ${label} is invalid`,
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }
  return key;
}

function u64String(value, label) {
  let amount;
  try {
    amount = BigInt(value?.toString?.() || value);
  } catch {
    amount = 0n;
  }
  if (amount <= 0n || amount > ((1n << 64n) - 1n)) {
    throw tradingError(
      `MetaDAO ${label} is invalid`,
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }
  return amount.toString();
}

function inspectDecisionSwap(transaction, authority, proposalHint = '') {
  const authorityAddress = authority.toBase58();
  for (const instruction of transaction.instructions) {
    const programId = instruction.programId.toBase58();
    if (!ALLOWED_CORE_PROGRAMS.has(programId)) {
      throw tradingError(
        'Decision attribution rejected an unexpected program',
        'UNSAFE_ATTRIBUTION_TRANSACTION',
        400,
      );
    }
    if (
      programId === authorityAddress
      || instruction.keys.some(meta => meta.pubkey.toBase58() === authorityAddress)
    ) {
      throw tradingError(
        'The attribution authority may only appear in the signed marker',
        'UNSAFE_ATTRIBUTION_TRANSACTION',
        400,
      );
    }
  }

  const vaultInstructions = transaction.instructions.filter(instruction => (
    instruction.programId.equals(CONDITIONAL_VAULT_V0_4_PROGRAM_ID)
  ));
  const swapInstructions = transaction.instructions.filter(instruction => (
    instruction.programId.equals(FUTARCHY_V0_6_PROGRAM_ID)
  ));
  const manifestInstructions = transaction.instructions.filter(instruction => (
    instruction.programId.equals(MANIFEST_PROGRAM_ID)
  ));
  if (
    vaultInstructions.length !== 1
    || swapInstructions.length + manifestInstructions.length !== 1
  ) {
    throw tradingError(
      'Decision attribution requires one conditional split and one reviewed venue swap',
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }

  const split = vaultInstructions[0];
  let decodedSplit;
  try {
    decodedSplit = vaultInstructionCoder.decode(split.data);
  } catch {
    decodedSplit = null;
  }
  const splitAmount = decodedSplit?.name === 'splitTokens'
    ? u64String(decodedSplit.data?.amount, 'split amount')
    : '';
  if (
    !splitAmount
    || split.keys.length < 12
    || !split.keys[3]?.isSigner
    || split.keys[3].pubkey.toBase58() !== transaction.feePayer.toBase58()
  ) {
    throw tradingError(
      'Decision attribution requires an exact wallet-funded conditional split',
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }

  if (swapInstructions.length === 1) {
    const swap = swapInstructions[0];
    const decoded = instructionCoder.decode(swap.data);
    const params = decoded?.name === 'conditionalSwap'
      ? decoded.data?.params
      : null;
    if (!params || swap.keys.length < 9) {
      throw tradingError(
        'Decision attribution requires a MetaDAO conditional swap',
        'INVALID_ATTRIBUTION_TRANSACTION',
        400,
      );
    }
    const trader = swap.keys[8];
    if (
      !trader?.isSigner
      || trader.pubkey.toBase58() !== transaction.feePayer.toBase58()
    ) {
      throw tradingError(
        'MetaDAO trader must match the transaction fee payer',
        'INVALID_ATTRIBUTION_TRANSACTION',
        400,
      );
    }
    const outcome = enumKey(params.market, 'market');
    const side = enumKey(params.swapType, 'swap type');
    const inputAmountRaw = u64String(params.inputAmount, 'input amount');
    if (
      !['pass', 'fail'].includes(outcome)
      || !['buy', 'sell'].includes(side)
      || inputAmountRaw !== splitAmount
    ) {
      throw tradingError(
        'MetaDAO decision direction or split amount is invalid',
        'INVALID_ATTRIBUTION_TRANSACTION',
        400,
      );
    }
    return {
      inputAmountRaw,
      minimumOutputAmountRaw: u64String(params.minOutputAmount, 'minimum output'),
      outcome,
      proposal: swap.keys[3].pubkey.toBase58(),
      side,
      trader: trader.pubkey.toBase58(),
      venue: 'futarchy_amm',
    };
  }

  const manifestSwap = manifestInstructions[0];
  let decodedManifest;
  try {
    [decodedManifest] = MANIFEST_SWAP_STRUCT.deserialize(manifestSwap.data);
  } catch {
    decodedManifest = null;
  }
  const manifestParams = decodedManifest?.instructionDiscriminator
    === MANIFEST_SWAP_DISCRIMINATOR
    ? decodedManifest.params
    : null;
  const trader = manifestSwap.keys[0];
  if (
    !manifestParams
    || manifestParams.isExactIn !== true
    || manifestSwap.keys.length < 11
    || !trader?.isSigner
    || trader.pubkey.toBase58() !== transaction.feePayer.toBase58()
  ) {
    throw tradingError(
      'Decision attribution requires an exact-in Manifest swap funded by the wallet',
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }
  const side = manifestParams.isBaseIn ? 'sell' : 'buy';
  const inputMint = manifestSwap.keys[side === 'sell' ? 8 : 10]?.pubkey;
  const inputAccount = manifestSwap.keys[side === 'sell' ? 3 : 4]?.pubkey;
  const outcomeIndex = [8, 9].findIndex(index => (
    inputMint && split.keys[index]?.pubkey.equals(inputMint)
  ));
  if (
    outcomeIndex < 0
    || !inputAccount?.equals(split.keys[10 + outcomeIndex]?.pubkey)
    || u64String(manifestParams.inAtoms, 'input amount') !== splitAmount
  ) {
    throw tradingError(
      'Manifest input must consume one branch of the exact conditional split',
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }
  let proposal;
  try {
    proposal = new PublicKey(String(proposalHint || '').trim()).toBase58();
  } catch {
    throw tradingError(
      'Manifest decision attribution requires a valid proposal identity',
      'INVALID_ATTRIBUTION_REQUEST',
      400,
    );
  }
  return {
    inputAmountRaw: splitAmount,
    minimumOutputAmountRaw: u64String(manifestParams.outAtoms, 'minimum output'),
    outcome: outcomeIndex === 0 ? 'fail' : 'pass',
    proposal,
    side,
    trader: trader.pubkey.toBase58(),
    venue: 'manifest',
  };
}

function decodeSigningKey(value, expectedPublicKey) {
  const encoded = String(value || '').trim();
  let bytes;
  try {
    bytes = Buffer.from(base58.decode(encoded));
  } catch {
    bytes = Buffer.alloc(0);
  }
  if (bytes.length !== 64 || base58.encode(bytes) !== encoded) {
    throw tradingError(
      'Decision-market attribution is awaiting its server signing key',
      'ATTRIBUTION_NOT_CONFIGURED',
      503,
    );
  }
  try {
    const keypair = Keypair.fromSecretKey(bytes);
    let expected = '';
    try {
      expected = new PublicKey(String(expectedPublicKey || '').trim()).toBase58();
    } catch {
      expected = '';
    }
    if (!expected || keypair.publicKey.toBase58() !== expected) {
      throw new Error('public key mismatch');
    }
    return keypair;
  } catch {
    throw tradingError(
      'Decision-market attribution signing key does not match its pinned public key',
      'ATTRIBUTION_NOT_CONFIGURED',
      503,
    );
  }
}

export function createDecisionAttributionService(dependencies = {}) {
  const env = dependencies.env || process.env;
  const signingKey = dependencies.signingKey;

  async function decisionAttest(body) {
    const request = requireObject(body, 'Decision attribution request');
    rejectUnknownKeys(
      request,
      new Set(['proposal', 'transaction']),
      'Decision attribution request',
    );
    const authority = signingKey || decodeSigningKey(
      env.O1RX_ATTRIBUTION_SIGNING_KEY,
      env.O1RX_ATTRIBUTION_PUBLIC_KEY,
    );
    const transaction = decodeUnsignedTransaction(request.transaction);
    const swap = inspectDecisionSwap(
      transaction,
      authority.publicKey,
      request.proposal,
    );
    transaction.add(new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{
        pubkey: authority.publicKey,
        isSigner: true,
        isWritable: false,
      }],
      data: MARKER_BYTES,
    }));
    transaction.partialSign(authority);
    if (!transaction.verifySignatures(false)) {
      throw tradingError(
        '01RX attribution signature could not be verified',
        'ATTRIBUTION_SIGNING_FAILED',
        500,
      );
    }
    const attributedWireSize = 1
      + (transaction.signatures.length * 64)
      + transaction.serializeMessage().length;
    if (attributedWireSize > PACKET_DATA_SIZE) {
      throw tradingError(
        `The attributed transaction is ${attributedWireSize} bytes; Solana permits ${PACKET_DATA_SIZE}`,
        'ATTRIBUTION_TRANSACTION_TOO_LARGE',
        422,
      );
    }
    let encoded;
    try {
      const wireBytes = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      if (wireBytes.length > PACKET_DATA_SIZE) throw new Error('transaction too large');
      encoded = Buffer.from(wireBytes).toString('base64');
    } catch {
      throw tradingError(
        'The attributed transaction could not be serialized safely',
        'ATTRIBUTION_TRANSACTION_TOO_LARGE',
        422,
      );
    }
    return {
      ...swap,
      authority: authority.publicKey.toBase58(),
      cluster: 'solana:mainnet',
      feeBps: DECISION_ATTRIBUTION.feeBps,
      marker: DECISION_ATTRIBUTION.marker,
      transaction: encoded,
      version: DECISION_ATTRIBUTION.version,
    };
  }

  return Object.freeze({
    decisionAttest,
  });
}

export {
  CONDITIONAL_VAULT_V0_4_PROGRAM_ID,
  FUTARCHY_V0_6_PROGRAM_ID,
  MANIFEST_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  inspectDecisionSwap,
};
