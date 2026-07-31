import {
  loadAndValidateSolanaExecutionSafety,
} from '../core/solana-execution-safety.js';

export const DECISION_EXECUTION_PROGRAMS = Object.freeze([
  Object.freeze({
    key: 'metadao-futarchy',
    label: 'MetaDAO Futarchy',
    programId: 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq',
    programDataAddress: 'CRg8Tgn3N6StCd7fy8hrWodXVZUX4qNiJkcTRa2CRq1T',
    deploymentSlot: 423_005_106,
    upgradeAuthority: '6awyHMshBGVjJ3ozdSJdyyDE1CTAXUwrpNMaRGMsb4sf',
  }),
  Object.freeze({
    key: 'metadao-conditional-vault',
    label: 'MetaDAO Conditional Vault',
    programId: 'VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg',
    programDataAddress: 'GieLGMFVoCwSN4Mz1Tx3AFFf2kZfUKjyVrxZ7kKh6b9s',
    deploymentSlot: 399_213_625,
    upgradeAuthority: '6awyHMshBGVjJ3ozdSJdyyDE1CTAXUwrpNMaRGMsb4sf',
  }),
  Object.freeze({
    key: 'manifest-core',
    label: 'Manifest Core',
    programId: 'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
    programDataAddress: 'G92J4ZFggKZ9LbsQ2zBpajRvRto7ed7uRuJJqWsX4BhJ',
    deploymentSlot: 434_933_293,
    upgradeAuthority: 'CDFU8tEWsVU2ZMiek57Sgk3Huha2yBNcSHLAts3V3Cbf',
  }),
  Object.freeze({
    key: 'manifest-wrapper',
    label: 'Manifest Wrapper',
    programId: 'wMNFSTkir3HgyZTsB7uqu3i7FA73grFCptPXgrZjksL',
    programDataAddress: '79UUgDqQwgUtVtmLecB75yS552tgtJW12ffhnAiTXAmR',
    deploymentSlot: 408_405_450,
    upgradeAuthority: 'B6dmr2UAn2wgjdm3T4N1Vjd8oPYRRTguByW7AEngkeL6',
  }),
]);

export function loadAndValidateDecisionExecutionSafety(connection, options = {}) {
  return loadAndValidateSolanaExecutionSafety(
    connection,
    DECISION_EXECUTION_PROGRAMS,
    options,
  );
}
