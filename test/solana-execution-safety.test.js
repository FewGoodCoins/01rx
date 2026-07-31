import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  BPF_UPGRADEABLE_LOADER_ID,
  LAST_RESTART_SLOT_SYSVAR_ID,
  POST_RESTART_COOLDOWN_SLOTS,
  SYSVAR_OWNER_ID,
  loadAndValidateSolanaExecutionSafety,
  loadAndValidateSolanaRestartSafety,
  loadAndValidateUpgradeablePrograms,
  validateLastRestartSlotAccount,
  validateUpgradeableProgramAccounts,
} from '../src/core/solana-execution-safety.js';
import {
  DECISION_EXECUTION_PROGRAMS,
  loadAndValidateDecisionExecutionSafety,
} from '../src/markets/solana-program-policy.js';

const LOADER = new PublicKey(BPF_UPGRADEABLE_LOADER_ID);
const SYSVAR_OWNER = new PublicKey(SYSVAR_OWNER_ID);

function address() {
  return Keypair.generate().publicKey.toBase58();
}

function policy(overrides = {}) {
  return {
    key: 'test-program',
    label: 'Test program',
    programId: address(),
    programDataAddress: address(),
    deploymentSlot: 123_456,
    upgradeAuthority: address(),
    ...overrides,
  };
}

function upgradeableAccounts(expected, overrides = {}) {
  const programData = Buffer.alloc(36);
  programData.writeUInt32LE(2, 0);
  new PublicKey(
    overrides.pointer || expected.programDataAddress,
  ).toBuffer().copy(programData, 4);

  const deployedData = Buffer.alloc(45);
  deployedData.writeUInt32LE(3, 0);
  deployedData.writeBigUInt64LE(
    BigInt(overrides.deploymentSlot ?? expected.deploymentSlot),
    4,
  );
  deployedData.writeUInt8(overrides.authorityTag ?? 1, 12);
  new PublicKey(
    overrides.upgradeAuthority || expected.upgradeAuthority,
  ).toBuffer().copy(deployedData, 13);

  return {
    program: {
      data: programData,
      executable: overrides.programExecutable ?? true,
      owner: new PublicKey(overrides.programOwner || BPF_UPGRADEABLE_LOADER_ID),
    },
    programData: {
      data: deployedData,
      executable: overrides.programDataExecutable ?? false,
      owner: new PublicKey(overrides.programDataOwner || BPF_UPGRADEABLE_LOADER_ID),
    },
  };
}

function restartAccount(slot, overrides = {}) {
  const data = overrides.data || Buffer.alloc(8);
  if (!overrides.data) data.writeBigUInt64LE(BigInt(slot), 0);
  return {
    data,
    executable: overrides.executable ?? false,
    owner: new PublicKey(overrides.owner || SYSVAR_OWNER_ID),
  };
}

function assertCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.statusCode, 503);
    return true;
  });
}

async function assertRejectsCode(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.statusCode, 503);
    return true;
  });
}

test('LastRestartSlot policy accepts the canonical account outside the cooldown', () => {
  assert.deepEqual(
    validateLastRestartSlotAccount(restartAccount(100), 2_000, {
      cooldownSlots: 1_500,
      minContextSlot: 1_999,
    }),
    {
      contextSlot: 2_000,
      cooldownSlots: 1_500,
      lastRestartSlot: 100,
      resumeSlot: 1_600,
    },
  );
});

test('LastRestartSlot policy pauses execution during the code-owned cooldown', () => {
  assert.throws(
    () => validateLastRestartSlotAccount(restartAccount(1_000), 2_499),
    (error) => {
      assert.equal(error.code, 'SOLANA_RESTART_COOLDOWN');
      assert.equal(error.contextSlot, 2_499);
      assert.equal(error.lastRestartSlot, 1_000);
      assert.equal(error.resumeSlot, 1_000 + POST_RESTART_COOLDOWN_SLOTS);
      return true;
    },
  );
});

test('LastRestartSlot policy rejects spoofed, malformed, future, and stale state', () => {
  const malformed = [
    restartAccount(100, { owner: address() }),
    restartAccount(100, { executable: true }),
    restartAccount(100, { data: Buffer.alloc(7) }),
  ];
  for (const account of malformed) {
    assertCode(
      () => validateLastRestartSlotAccount(account, 2_000),
      'SOLANA_RESTART_STATE_UNAVAILABLE',
    );
  }
  assertCode(
    () => validateLastRestartSlotAccount(restartAccount(2_001), 2_000),
    'SOLANA_RESTART_STATE_UNAVAILABLE',
  );
  assertCode(
    () => validateLastRestartSlotAccount(restartAccount(100), 1_999, {
      minContextSlot: 2_000,
    }),
    'SOLANA_RESTART_STATE_UNAVAILABLE',
  );
});

test('restart loader binds the canonical sysvar read to a confirmed minimum slot', async () => {
  const calls = [];
  const connection = {
    async getAccountInfoAndContext(key, options) {
      calls.push({ key: key.toBase58(), options });
      return { context: { slot: 5_000 }, value: restartAccount(100) };
    },
  };
  const result = await loadAndValidateSolanaRestartSafety(connection, {
    minContextSlot: 4_999,
  });
  assert.equal(result.contextSlot, 5_000);
  assert.deepEqual(calls, [{
    key: LAST_RESTART_SLOT_SYSVAR_ID,
    options: {
      commitment: 'confirmed',
      dataSlice: { length: 8, offset: 0 },
      minContextSlot: 4_999,
    },
  }]);

  await assertRejectsCode(
    loadAndValidateSolanaRestartSafety({
      async getAccountInfoAndContext() {
        throw new Error('untrusted RPC failed');
      },
    }),
    'SOLANA_RESTART_STATE_UNAVAILABLE',
  );
});

test('upgradeable-program policy accepts only exact loader, ProgramData, slot, and authority pins', () => {
  const expected = policy();
  const exact = upgradeableAccounts(expected);
  assert.deepEqual(
    validateUpgradeableProgramAccounts(exact.program, exact.programData, expected),
    {
      deploymentSlot: expected.deploymentSlot,
      key: expected.key,
      programDataAddress: expected.programDataAddress,
      programId: expected.programId,
      upgradeAuthority: expected.upgradeAuthority,
    },
  );

  const mutations = [
    { programOwner: address() },
    { programExecutable: false },
    { pointer: address() },
    { programDataOwner: address() },
    { programDataExecutable: true },
    { deploymentSlot: expected.deploymentSlot + 1 },
    { upgradeAuthority: address() },
    { authorityTag: 0 },
  ];
  for (const mutation of mutations) {
    const changed = upgradeableAccounts(expected, mutation);
    assertCode(
      () => validateUpgradeableProgramAccounts(
        changed.program,
        changed.programData,
        expected,
      ),
      'SOLANA_PROGRAM_INTEGRITY_CHANGED',
    );
  }
});

test('program loader requires complete responses from one confirmed minimum context', async () => {
  const expected = policy();
  const exact = upgradeableAccounts(expected);
  const calls = [];
  const connection = {
    async getMultipleAccountsInfoAndContext(keys, options) {
      calls.push({ keys: keys.map(key => key.toBase58()), options });
      return options.dataSlice
        ? { context: { slot: 9_002 }, value: [exact.programData] }
        : { context: { slot: 9_001 }, value: [exact.program] };
    },
  };
  const result = await loadAndValidateUpgradeablePrograms(
    connection,
    [expected],
    { minContextSlot: 9_000 },
  );
  assert.equal(result.contextSlot, 9_001);
  assert.deepEqual(calls, [
    {
      keys: [expected.programId],
      options: { commitment: 'confirmed', minContextSlot: 9_000 },
    },
    {
      keys: [expected.programDataAddress],
      options: {
        commitment: 'confirmed',
        dataSlice: { length: 45, offset: 0 },
        minContextSlot: 9_000,
      },
    },
  ]);

  await assertRejectsCode(
    loadAndValidateUpgradeablePrograms({
      async getMultipleAccountsInfoAndContext(_keys, options) {
        return options.dataSlice
          ? { context: { slot: 8_999 }, value: [exact.programData] }
          : { context: { slot: 9_001 }, value: [exact.program] };
      },
    }, [expected], { minContextSlot: 9_000 }),
    'SOLANA_PROGRAM_INTEGRITY_UNAVAILABLE',
  );
  await assertRejectsCode(
    loadAndValidateUpgradeablePrograms({
      async getMultipleAccountsInfoAndContext() {
        throw new Error('untrusted RPC failed');
      },
    }, [expected]),
    'SOLANA_PROGRAM_INTEGRITY_UNAVAILABLE',
  );
  await assertRejectsCode(
    loadAndValidateUpgradeablePrograms(connection, [{
      ...expected,
      programId: 'not-an-address',
    }]),
    'SOLANA_EXECUTION_POLICY_INVALID',
  );
});

test('combined safety returns the oldest validated context and keeps decision pins code-owned', async () => {
  const expected = policy();
  const exact = upgradeableAccounts(expected);
  const connection = {
    async getMultipleAccountsInfoAndContext(_keys, options) {
      return options.dataSlice
        ? { context: { slot: 20_002 }, value: [exact.programData] }
        : { context: { slot: 20_001 }, value: [exact.program] };
    },
    async getAccountInfoAndContext() {
      return { context: { slot: 20_003 }, value: restartAccount(100) };
    },
  };
  const result = await loadAndValidateSolanaExecutionSafety(
    connection,
    [expected],
    { minContextSlot: 20_000 },
  );
  assert.equal(result.contextSlot, 20_001);
  assert.equal(result.restart.contextSlot, 20_003);
  assert.deepEqual(
    DECISION_EXECUTION_PROGRAMS.map(item => item.key),
    [
      'metadao-futarchy',
      'metadao-conditional-vault',
      'manifest-core',
      'manifest-wrapper',
    ],
  );
  assert.ok(DECISION_EXECUTION_PROGRAMS.every(item => (
    item.programId
    && item.programDataAddress
    && Number.isSafeInteger(item.deploymentSlot)
    && item.upgradeAuthority
  )));
  assert.equal(LOADER.toBase58(), BPF_UPGRADEABLE_LOADER_ID);
  assert.equal(SYSVAR_OWNER.toBase58(), SYSVAR_OWNER_ID);
});

test('decision safety validates all four code-owned mainnet deployment pins', async () => {
  const accounts = DECISION_EXECUTION_PROGRAMS.map(expected => (
    upgradeableAccounts(expected)
  ));
  const connection = {
    async getMultipleAccountsInfoAndContext(_keys, options) {
      return options.dataSlice
        ? { context: { slot: 500_000_002 }, value: accounts.map(item => item.programData) }
        : { context: { slot: 500_000_001 }, value: accounts.map(item => item.program) };
    },
    async getAccountInfoAndContext() {
      return { context: { slot: 500_000_003 }, value: restartAccount(100) };
    },
  };
  const result = await loadAndValidateDecisionExecutionSafety(connection, {
    minContextSlot: 500_000_000,
  });
  assert.equal(result.contextSlot, 500_000_001);
  assert.deepEqual(
    result.programs.map(item => item.key),
    DECISION_EXECUTION_PROGRAMS.map(item => item.key),
  );
});
