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
const MEMO_PROGRAM_ID = new PublicKey(DECISION_ATTRIBUTION.memoProgramId);
const MARKER_BYTES = Buffer.from(DECISION_ATTRIBUTION.marker, 'utf8');
const instructionCoder = new BorshInstructionCoder(FUTARCHY_V0_6_IDL);
const ALLOWED_CORE_PROGRAMS = new Set([
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
  ComputeBudgetProgram.programId.toBase58(),
  CONDITIONAL_VAULT_V0_4_PROGRAM_ID.toBase58(),
  FUTARCHY_V0_6_PROGRAM_ID.toBase58(),
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

function inspectDecisionSwap(transaction, authority) {
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
  if (vaultInstructions.length !== 1 || swapInstructions.length !== 1) {
    throw tradingError(
      'Decision attribution requires one conditional split and one MetaDAO AMM swap',
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }

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
  if (!['pass', 'fail'].includes(outcome) || !['buy', 'sell'].includes(side)) {
    throw tradingError(
      'MetaDAO decision direction is invalid',
      'INVALID_ATTRIBUTION_TRANSACTION',
      400,
    );
  }
  return {
    inputAmountRaw: u64String(params.inputAmount, 'input amount'),
    minimumOutputAmountRaw: u64String(params.minOutputAmount, 'minimum output'),
    outcome,
    proposal: swap.keys[3].pubkey.toBase58(),
    side,
    trader: trader.pubkey.toBase58(),
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
    rejectUnknownKeys(request, new Set(['transaction']), 'Decision attribution request');
    const authority = signingKey || decodeSigningKey(
      env.O1RX_ATTRIBUTION_SIGNING_KEY,
      env.O1RX_ATTRIBUTION_PUBLIC_KEY,
    );
    const transaction = decodeUnsignedTransaction(request.transaction);
    const swap = inspectDecisionSwap(transaction, authority.publicKey);
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
  MEMO_PROGRAM_ID,
  inspectDecisionSwap,
};
