import assert from 'node:assert/strict';
import test from 'node:test';
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { FutarchyIDL } from '@metadaoproject/programs/futarchy/v0.6';
import { ConditionalVaultIDL } from '@metadaoproject/programs/conditional_vault/v0.4';
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import {
  DECISION_ATTRIBUTION,
} from '@01resolved/contracts';
import {
  CONDITIONAL_VAULT_V0_4_PROGRAM_ID,
  FUTARCHY_V0_6_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  createDecisionAttributionService,
} from '../api/_lib/decision-attribution.js';

const coder = new BorshInstructionCoder(FutarchyIDL);
const vaultCoder = new BorshInstructionCoder(ConditionalVaultIDL);
const RECENT_BLOCKHASH = '11111111111111111111111111111111';

function unsignedDecisionTransaction({
  authority = null,
  includeUnexpectedProgram = false,
} = {}) {
  const trader = Keypair.generate();
  const proposal = Keypair.generate().publicKey;
  const placeholder = Keypair.generate().publicKey;
  const transaction = new Transaction({
    feePayer: trader.publicKey,
    recentBlockhash: RECENT_BLOCKHASH,
  }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 650_000 }),
    new TransactionInstruction({
      programId: CONDITIONAL_VAULT_V0_4_PROGRAM_ID,
      keys: [
        placeholder,
        placeholder,
        placeholder,
        trader.publicKey,
        placeholder,
        placeholder,
        authority || placeholder,
        placeholder,
        placeholder,
        placeholder,
        placeholder,
        placeholder,
      ].map((pubkey, index) => ({
        pubkey,
        isSigner: index === 3,
        isWritable: index !== 0 && index !== 3 && index !== 5,
      })),
      data: vaultCoder.encode('splitTokens', {
        amount: new BN(1_000_000),
      }),
    }),
    new TransactionInstruction({
      programId: FUTARCHY_V0_6_PROGRAM_ID,
      keys: [
        placeholder,
        placeholder,
        placeholder,
        proposal,
        placeholder,
        placeholder,
        placeholder,
        placeholder,
        trader.publicKey,
      ].map((pubkey, index) => ({
        pubkey,
        isSigner: index === 8,
        isWritable: index !== 3 && index !== 8,
      })),
      data: coder.encode('conditionalSwap', {
        params: {
          inputAmount: new BN(1_000_000),
          market: { pass: {} },
          minOutputAmount: new BN(9_000_000),
          swapType: { buy: {} },
        },
      }),
    }),
  );
  if (includeUnexpectedProgram) {
    transaction.add(new TransactionInstruction({
      programId: Keypair.generate().publicKey,
      keys: [],
      data: Buffer.from([9]),
    }));
  }
  return {
    proposal,
    trader,
    transaction,
    wire: transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64'),
  };
}

test('decision attribution co-signs an exact zero-fee on-chain marker', async () => {
  const authority = Keypair.generate();
  const core = unsignedDecisionTransaction();
  const service = createDecisionAttributionService({ signingKey: authority });

  const result = await service.decisionAttest({ transaction: core.wire });
  const attributed = Transaction.from(Buffer.from(result.transaction, 'base64'));
  const memo = attributed.instructions.at(-1);

  assert.equal(result.authority, authority.publicKey.toBase58());
  assert.equal(result.proposal, core.proposal.toBase58());
  assert.equal(result.trader, core.trader.publicKey.toBase58());
  assert.equal(result.outcome, 'pass');
  assert.equal(result.side, 'buy');
  assert.equal(result.venue, 'futarchy_amm');
  assert.equal(result.inputAmountRaw, '1000000');
  assert.equal(result.minimumOutputAmountRaw, '9000000');
  assert.equal(result.feeBps, 0);
  assert.equal(result.marker, DECISION_ATTRIBUTION.marker);
  assert.equal(attributed.signatures.length, 2);
  assert.equal(attributed.signatures[0].signature, null);
  assert.equal(attributed.signatures[1].publicKey.toBase58(), result.authority);
  assert.ok(attributed.signatures[1].signature);
  assert.equal(attributed.verifySignatures(false), true);
  assert.equal(memo.programId.toBase58(), MEMO_PROGRAM_ID.toBase58());
  assert.equal(memo.keys.length, 1);
  assert.equal(memo.keys[0].pubkey.toBase58(), result.authority);
  assert.equal(memo.keys[0].isSigner, true);
  assert.equal(memo.keys[0].isWritable, false);
  assert.equal(memo.data.toString('utf8'), DECISION_ATTRIBUTION.marker);
});

test('decision attribution rejects unsafe programs and any prior authority access', async () => {
  const authority = Keypair.generate();
  const service = createDecisionAttributionService({ signingKey: authority });
  const unexpected = unsignedDecisionTransaction({ includeUnexpectedProgram: true });
  await assert.rejects(
    service.decisionAttest({ transaction: unexpected.wire }),
    error => error?.code === 'UNSAFE_ATTRIBUTION_TRANSACTION',
  );

  const authorityAccess = unsignedDecisionTransaction({
    authority: authority.publicKey,
  });
  await assert.rejects(
    service.decisionAttest({ transaction: authorityAccess.wire }),
    error => error?.code === 'UNSAFE_ATTRIBUTION_TRANSACTION',
  );
});

test('decision attribution fails closed without a server-only signing key', async () => {
  const core = unsignedDecisionTransaction();
  const service = createDecisionAttributionService({ env: {} });
  await assert.rejects(
    service.decisionAttest({ transaction: core.wire }),
    error => (
      error?.code === 'ATTRIBUTION_NOT_CONFIGURED'
      && error?.statusCode === 503
    ),
  );
});
