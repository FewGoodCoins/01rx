import assert from 'node:assert/strict';
import test from 'node:test';
import { MintLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import {
  DAO_ACCOUNT_DISCRIMINATOR,
  DAO_ACCOUNT_LENGTH,
  FUTARCHY_PROGRAM_ID,
  PROPOSAL_ACCOUNT_DISCRIMINATOR,
  loadValidatedMarketSnapshot,
  loadValidatedMarketSnapshotFromProposal,
} from '../api/_lib/futarchy-accounts.js';

const DAO = new PublicKey('CkEUCAooQi64UFhPFS5MWpZw6LQqjsDQBj3Z5uiXS1eN');
const PROPOSAL = new PublicKey('BbGa5nx6owLwJ9Wt9Pr3FHccpove9uSvNX4C59Andxf3');
const BASE = new PublicKey('Cbjr1Nvcay3QWDriyRKtokJ7V4PMknesGxeK8z7Zmeta');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const FUTARCHY = new PublicKey(FUTARCHY_PROGRAM_ID);
const KEYS = [
  '5b5RC4sntqyb61S463CunusWRmrqZvwyGmmHUf37CEn2',
  'CC62973Y9AtqoNjA2CffGojHVUsiNBoQpiyoSFpFH3RL',
  'APFtVpfjK1KxCdQkgR1K8NzPbK6bPVt2vyhGZrWzfobq',
  'EprsUi5bbNvB6MR3PQCPzoYQf3mfb8TfoSqSfVc2gfZb',
  '6GKrtrFCgSGTbwcjdMXdwoD4JHG9a2sazbBvfTLPwREV',
  '6Wjn6VruLozZ811AcVM9bSvED8tM5q1iV6nX5UQ9Rt7Z',
  't2h4yz9hKzapLmbBnkekqsCLLLFPDCaYuaCeT7mxPyw',
  'GqWZUByELbdXJ13S4b9w6FrZjLgjJcL2gK42Bg1wDDPG',
].map(value => new PublicKey(value));

function writeU128(buffer, offset, value) {
  buffer.writeBigUInt64LE(BigInt(value), offset);
  buffer.writeBigUInt64LE(0n, offset + 8);
}

function writePool(buffer, offset, nowSeconds, priceRaw) {
  writeU128(buffer, offset, BigInt(priceRaw) * 1_000n);
  buffer.writeBigInt64LE(BigInt(nowSeconds - 1), offset + 16);
  buffer.writeBigInt64LE(BigInt(nowSeconds - 1_001), offset + 24);
  writeU128(buffer, offset + 32, priceRaw);
  writeU128(buffer, offset + 48, priceRaw);
  writeU128(buffer, offset + 64, 1n);
  writeU128(buffer, offset + 80, priceRaw);
  buffer.writeUInt32LE(0, offset + 96);
  buffer.writeBigUInt64LE(1_000_000n, offset + 100);
  buffer.writeBigUInt64LE(1_000_000n, offset + 108);
}

function daoAccount(nowSeconds) {
  const data = Buffer.alloc(DAO_ACCOUNT_LENGTH);
  DAO_ACCOUNT_DISCRIMINATOR.copy(data, 0);
  data.writeUInt8(1, 8);
  writePool(data, 9, nowSeconds, 1_000_000_000_000n);
  writePool(data, 141, nowSeconds, 1_100_000_000_000n);
  writePool(data, 273, nowSeconds, 900_000_000_000n);
  const ammFieldsOffset = 405;
  BASE.toBuffer().copy(data, ammFieldsOffset + 16);
  USDC.toBuffer().copy(data, ammFieldsOffset + 48);
  KEYS[0].toBuffer().copy(data, ammFieldsOffset + 80);
  KEYS[1].toBuffer().copy(data, ammFieldsOffset + 112);
  const daoOffset = 549;
  BASE.toBuffer().copy(data, daoOffset + 105);
  USDC.toBuffer().copy(data, daoOffset + 137);
  data.writeUInt32LE(6, daoOffset + 169);
  data.writeUInt16LE(300, daoOffset + 173);
  data.writeUInt32LE(259_200, daoOffset + 175);
  data.writeUInt8(0, daoOffset + 247);
  data.writeInt16LE(-300, daoOffset + 248);
  return { owner: FUTARCHY, executable: false, lamports: 1, data };
}

function proposalAccount(nowSeconds) {
  const data = Buffer.alloc(355);
  PROPOSAL_ACCOUNT_DISCRIMINATOR.copy(data, 0);
  data.writeUInt32LE(6, 8);
  KEYS[2].toBuffer().copy(data, 12);
  data.writeBigInt64LE(BigInt(nowSeconds - 1_000), 44);
  data.writeUInt8(1, 52);
  let offset = 53;
  for (const key of [KEYS[0], KEYS[1], DAO]) {
    key.toBuffer().copy(data, offset);
    offset += 32;
  }
  data.writeUInt8(255, offset);
  offset += 1;
  KEYS[2].toBuffer().copy(data, offset);
  offset += 32;
  data.writeUInt32LE(259_200, offset);
  offset += 4;
  for (const key of [KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7]]) {
    key.toBuffer().copy(data, offset);
    offset += 32;
  }
  data.writeUInt8(1, offset);
  return { owner: FUTARCHY, executable: false, lamports: 1, data };
}

function mintAccount(decimals = 6) {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode({
    mintAuthorityOption: 0,
    mintAuthority: PublicKey.default,
    supply: 0n,
    decimals,
    isInitialized: true,
    freezeAuthorityOption: 0,
    freezeAuthority: PublicKey.default,
  }, data);
  return { owner: TOKEN_PROGRAM_ID, executable: false, lamports: 1, data };
}

function connectionFixture(accounts) {
  return {
    async getMultipleAccountsInfoAndContext(addresses, config) {
      assert.deepEqual(addresses.map(value => value.toBase58()), [
        DAO.toBase58(),
        PROPOSAL.toBase58(),
        BASE.toBase58(),
        USDC.toBase58(),
      ]);
      assert.equal(config.commitment, 'confirmed');
      return { context: { slot: 444 }, value: accounts };
    },
  };
}

test('validated market snapshot binds index identity to exact on-chain owners and mints', async () => {
  const nowMs = Date.parse('2026-07-31T22:00:00Z');
  const result = await loadValidatedMarketSnapshot(connectionFixture([
    daoAccount(nowMs / 1_000),
    proposalAccount(nowMs / 1_000),
    mintAccount(),
    mintAccount(),
  ]), {
    daoAddress: DAO.toBase58(),
    proposalAddress: PROPOSAL.toBase58(),
    baseMint: BASE.toBase58(),
    quoteMint: USDC.toBase58(),
  }, { nowMs });

  assert.equal(result.slot, 444);
  assert.equal(result.proposal.state, 'pending');
  assert.equal(result.proposal.daoAddress, DAO.toBase58());
  assert.equal(result.baseDecimals, 6);
  assert.equal(result.twapStartedAt, '2026-07-31T21:43:19.000Z');
  assert.equal(result.thresholdBps, -300);
  assert.equal(result.pass.oraclePrice, 1.1);
  assert.equal(result.fail.oraclePrice, 0.9);
});

test('validated market snapshot rejects a spoofed DAO owner', async () => {
  const nowMs = Date.parse('2026-07-31T22:00:00Z');
  const spoofed = daoAccount(nowMs / 1_000);
  spoofed.owner = PublicKey.default;
  await assert.rejects(
    loadValidatedMarketSnapshot(connectionFixture([
      spoofed,
      proposalAccount(nowMs / 1_000),
      mintAccount(),
      mintAccount(),
    ]), {
      daoAddress: DAO.toBase58(),
      proposalAddress: PROPOSAL.toBase58(),
      baseMint: BASE.toBase58(),
      quoteMint: USDC.toBase58(),
    }, { nowMs }),
    error => error?.code === 'SOURCE_MISMATCH' && /owner, size, or discriminator/.test(error.message),
  );
});

test('proposal discovery derives DAO and mints without an external token registry', async () => {
  const nowMs = Date.parse('2026-07-31T22:00:00Z');
  let discoveryCall = 0;
  const connection = {
    async getAccountInfoAndContext(address, config) {
      discoveryCall += 1;
      if (discoveryCall === 1) {
        assert.equal(address.toBase58(), PROPOSAL.toBase58());
        assert.deepEqual(config, { commitment: 'confirmed' });
        return { context: { slot: 443 }, value: proposalAccount(nowMs / 1_000) };
      }
      assert.equal(address.toBase58(), DAO.toBase58());
      assert.deepEqual(config, { commitment: 'confirmed', minContextSlot: 443 });
      return { context: { slot: 444 }, value: daoAccount(nowMs / 1_000) };
    },
    async getMultipleAccountsInfoAndContext(addresses, config) {
      assert.deepEqual(addresses.map(value => value.toBase58()), [
        DAO.toBase58(),
        PROPOSAL.toBase58(),
        BASE.toBase58(),
        USDC.toBase58(),
      ]);
      assert.deepEqual(config, { commitment: 'confirmed', minContextSlot: 444 });
      return {
        context: { slot: 445 },
        value: [
          daoAccount(nowMs / 1_000),
          proposalAccount(nowMs / 1_000),
          mintAccount(),
          mintAccount(),
        ],
      };
    },
  };

  const result = await loadValidatedMarketSnapshotFromProposal(connection, {
    proposalAddress: PROPOSAL.toBase58(),
  }, { nowMs });

  assert.equal(result.slot, 445);
  assert.equal(result.daoAddress, DAO.toBase58());
  assert.equal(result.baseMint, BASE.toBase58());
  assert.equal(result.quoteMint, USDC.toBase58());
});
