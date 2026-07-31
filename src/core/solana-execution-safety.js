import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

export const BPF_UPGRADEABLE_LOADER_ID = 'BPFLoaderUpgradeab1e11111111111111111111111';
export const LAST_RESTART_SLOT_SYSVAR_ID = 'SysvarLastRestartS1ot1111111111111111111111';
export const SYSVAR_OWNER_ID = 'Sysvar1111111111111111111111111111111111111';
export const POST_RESTART_COOLDOWN_SLOTS = 1_500;

const BPF_UPGRADEABLE_LOADER = new PublicKey(BPF_UPGRADEABLE_LOADER_ID);
const LAST_RESTART_SLOT_SYSVAR = new PublicKey(LAST_RESTART_SLOT_SYSVAR_ID);

function safetyError(message, code, cause) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
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

function accountData(account) {
  return Buffer.isBuffer(account?.data) ? account.data : null;
}

function validSlot(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizePolicy(policy) {
  const programId = addressOf(policy?.programId);
  const programDataAddress = addressOf(policy?.programDataAddress);
  const upgradeAuthority = policy?.upgradeAuthority == null
    ? null
    : addressOf(policy.upgradeAuthority);
  let deploymentSlot;
  try {
    deploymentSlot = BigInt(policy?.deploymentSlot);
  } catch {
    deploymentSlot = -1n;
  }
  if (
    !programId
    || !programDataAddress
    || (policy?.upgradeAuthority != null && !upgradeAuthority)
    || deploymentSlot < 0n
    || deploymentSlot > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw safetyError(
      'Solana execution policy is invalid',
      'SOLANA_EXECUTION_POLICY_INVALID',
    );
  }
  return Object.freeze({
    deploymentSlot,
    key: String(policy?.key || programId),
    label: String(policy?.label || policy?.key || programId),
    programDataAddress,
    programId,
    upgradeAuthority,
  });
}

/**
 * Validate one upgradeable program against code-owned ProgramData pins.
 */
export function validateUpgradeableProgramAccounts(
  programAccount,
  programDataAccount,
  expectedPolicy,
) {
  const policy = normalizePolicy(expectedPolicy);
  const programData = accountData(programAccount);
  if (
    addressOf(programAccount?.owner) !== BPF_UPGRADEABLE_LOADER_ID
    || programAccount?.executable !== true
    || programData?.length !== 36
    || programData.readUInt32LE(0) !== 2
    || addressOf(programData.subarray(4, 36)) !== policy.programDataAddress
  ) {
    throw safetyError(
      `${policy.label} deployment no longer matches the reviewed policy`,
      'SOLANA_PROGRAM_INTEGRITY_CHANGED',
    );
  }

  const deployedData = accountData(programDataAccount);
  const authorityTag = deployedData?.length >= 13 ? deployedData[12] : -1;
  const observedAuthority = authorityTag === 1 && deployedData.length >= 45
    ? addressOf(deployedData.subarray(13, 45))
    : null;
  if (
    addressOf(programDataAccount?.owner) !== BPF_UPGRADEABLE_LOADER_ID
    || programDataAccount?.executable !== false
    || !deployedData
    || deployedData.length < (policy.upgradeAuthority ? 45 : 13)
    || deployedData.readUInt32LE(0) !== 3
    || deployedData.readBigUInt64LE(4) !== policy.deploymentSlot
    || authorityTag !== (policy.upgradeAuthority ? 1 : 0)
    || observedAuthority !== policy.upgradeAuthority
  ) {
    throw safetyError(
      `${policy.label} was upgraded or its authority changed`,
      'SOLANA_PROGRAM_INTEGRITY_CHANGED',
    );
  }
  return Object.freeze({
    deploymentSlot: Number(policy.deploymentSlot),
    key: policy.key,
    programDataAddress: policy.programDataAddress,
    programId: policy.programId,
    upgradeAuthority: policy.upgradeAuthority,
  });
}

/**
 * Load upgradeable programs and their ProgramData headers from one confirmed
 * minimum context. Every network response is untrusted until validated.
 */
export async function loadAndValidateUpgradeablePrograms(
  connection,
  expectedPolicies,
  { minContextSlot = 0 } = {},
) {
  if (
    !connection
    || typeof connection.getMultipleAccountsInfoAndContext !== 'function'
    || !validSlot(minContextSlot)
    || !Array.isArray(expectedPolicies)
    || expectedPolicies.length < 1
  ) {
    throw safetyError(
      'Solana program integrity check is unavailable',
      'SOLANA_PROGRAM_INTEGRITY_UNAVAILABLE',
    );
  }
  const policies = expectedPolicies.map(normalizePolicy);
  let programResponse;
  let programDataResponse;
  try {
    [programResponse, programDataResponse] = await Promise.all([
      connection.getMultipleAccountsInfoAndContext(
        policies.map(policy => new PublicKey(policy.programId)),
        { commitment: 'confirmed', minContextSlot },
      ),
      connection.getMultipleAccountsInfoAndContext(
        policies.map(policy => new PublicKey(policy.programDataAddress)),
        {
          commitment: 'confirmed',
          dataSlice: { length: 45, offset: 0 },
          minContextSlot,
        },
      ),
    ]);
  } catch (cause) {
    throw safetyError(
      'Solana program integrity could not be checked',
      'SOLANA_PROGRAM_INTEGRITY_UNAVAILABLE',
      cause,
    );
  }
  const programSlot = programResponse?.context?.slot;
  const programDataSlot = programDataResponse?.context?.slot;
  if (
    !validSlot(programSlot)
    || !validSlot(programDataSlot)
    || programSlot < minContextSlot
    || programDataSlot < minContextSlot
    || !Array.isArray(programResponse?.value)
    || !Array.isArray(programDataResponse?.value)
    || programResponse.value.length !== policies.length
    || programDataResponse.value.length !== policies.length
  ) {
    throw safetyError(
      'Solana program integrity response is stale or incomplete',
      'SOLANA_PROGRAM_INTEGRITY_UNAVAILABLE',
    );
  }
  return Object.freeze({
    contextSlot: Math.min(programSlot, programDataSlot),
    programs: Object.freeze(policies.map((policy, index) => (
      validateUpgradeableProgramAccounts(
        programResponse.value[index],
        programDataResponse.value[index],
        policy,
      )
    ))),
  });
}

/**
 * Validate the canonical LastRestartSlot sysvar and apply a code-owned cooldown.
 */
export function validateLastRestartSlotAccount(
  account,
  contextSlot,
  {
    cooldownSlots = POST_RESTART_COOLDOWN_SLOTS,
    minContextSlot = 0,
  } = {},
) {
  if (
    !validSlot(contextSlot)
    || !validSlot(minContextSlot)
    || !Number.isSafeInteger(cooldownSlots)
    || cooldownSlots < 1
    || contextSlot < minContextSlot
  ) {
    throw safetyError(
      'Solana restart state is stale or invalid',
      'SOLANA_RESTART_STATE_UNAVAILABLE',
    );
  }
  const data = accountData(account);
  if (
    addressOf(account?.owner) !== SYSVAR_OWNER_ID
    || account?.executable !== false
    || data?.length !== 8
  ) {
    throw safetyError(
      'Solana restart state could not be verified',
      'SOLANA_RESTART_STATE_UNAVAILABLE',
    );
  }
  const restartSlotValue = data.readBigUInt64LE(0);
  if (restartSlotValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw safetyError(
      'Solana restart slot is outside the supported range',
      'SOLANA_RESTART_STATE_UNAVAILABLE',
    );
  }
  const lastRestartSlot = Number(restartSlotValue);
  if (lastRestartSlot > contextSlot) {
    throw safetyError(
      'Solana restart state is inconsistent with the RPC context',
      'SOLANA_RESTART_STATE_UNAVAILABLE',
    );
  }
  const resumeSlot = lastRestartSlot + cooldownSlots;
  if (lastRestartSlot > 0 && contextSlot < resumeSlot) {
    const error = safetyError(
      'Trading is paused while Solana stabilizes after a restart',
      'SOLANA_RESTART_COOLDOWN',
    );
    error.contextSlot = contextSlot;
    error.lastRestartSlot = lastRestartSlot;
    error.resumeSlot = resumeSlot;
    throw error;
  }
  return Object.freeze({
    contextSlot,
    cooldownSlots,
    lastRestartSlot,
    resumeSlot,
  });
}

export async function loadAndValidateSolanaRestartSafety(
  connection,
  {
    cooldownSlots = POST_RESTART_COOLDOWN_SLOTS,
    minContextSlot = 0,
  } = {},
) {
  if (
    !connection
    || typeof connection.getAccountInfoAndContext !== 'function'
    || !validSlot(minContextSlot)
  ) {
    throw safetyError(
      'Solana restart state is unavailable',
      'SOLANA_RESTART_STATE_UNAVAILABLE',
    );
  }
  let response;
  try {
    response = await connection.getAccountInfoAndContext(
      LAST_RESTART_SLOT_SYSVAR,
      {
        commitment: 'confirmed',
        dataSlice: { length: 8, offset: 0 },
        minContextSlot,
      },
    );
  } catch (cause) {
    throw safetyError(
      'Solana restart state could not be loaded',
      'SOLANA_RESTART_STATE_UNAVAILABLE',
      cause,
    );
  }
  return validateLastRestartSlotAccount(
    response?.value,
    response?.context?.slot,
    { cooldownSlots, minContextSlot },
  );
}

export async function loadAndValidateSolanaExecutionSafety(
  connection,
  expectedPolicies,
  options = {},
) {
  const [integrity, restart] = await Promise.all([
    loadAndValidateUpgradeablePrograms(connection, expectedPolicies, options),
    loadAndValidateSolanaRestartSafety(connection, options),
  ]);
  return Object.freeze({
    contextSlot: Math.min(integrity.contextSlot, restart.contextSlot),
    programs: integrity.programs,
    restart,
  });
}

export const _test = Object.freeze({
  BPF_UPGRADEABLE_LOADER,
  LAST_RESTART_SLOT_SYSVAR,
  addressOf,
  normalizePolicy,
});
