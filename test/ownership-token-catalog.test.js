import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_OWNERSHIP_TOKENS } from '../api/_lib/ownership-token-registry.js';
import projectMetadata from '../src/generated/project-metadata.js';

const EXPECTED_DISPLAY_TOKENS = Object.freeze({
  basket: Object.freeze({
    mint: '2rNBaMg5VAr1aMNCwAPdDZVgzzdTaNDebUnNqPFNmeta',
    name: 'Basket',
    ticker: 'BASKET',
  }),
  gsim: Object.freeze({
    mint: 'DwCBrWrAGokHmysLL2XbY7TCZpbRH9QUAZxHnyWxmeta',
    name: 'GeSIM',
    ticker: 'GSIM',
  }),
  kimia: Object.freeze({
    mint: 'BGLJaGukwopAFUaVC9iJNqMYEeKwRf3LK65NttPVmeta',
    name: 'Kimia',
    ticker: 'KIMIA',
  }),
  rawr: Object.freeze({
    mint: '4K1m7gAMDKzrxQn68yuZAd767w57Fw7Ykw69dG3umeta',
    name: 'Jurassic Finance',
    ticker: 'RAWR',
  }),
});

test('shipped ownership catalog includes the four reviewed display additions', () => {
  Object.entries(EXPECTED_DISPLAY_TOKENS).forEach(([key, expected]) => {
    const project = projectMetadata[key];
    assert.ok(project, `${key} must be present in shipped project metadata`);
    assert.equal(project.live, true);
    assert.notEqual(project.graveyard, true);
    assert.equal(project.name, expected.name);
    assert.equal(project.ticker, expected.ticker);
    assert.equal(project.mint, expected.mint);
    assert.match(String(project.logo || ''), /^(?:https:\/\/|logos\/)/);
    assert.equal(project.launchpad, 'Permissionless');
  });
});

test('display inclusion remains separate from ownership-token execution approval', () => {
  Object.entries(ACTIVE_OWNERSHIP_TOKENS).forEach(([key, identity]) => {
    assert.equal(
      projectMetadata[key]?.mint,
      identity.mint,
      `${key} display identity must match its reviewed execution identity`,
    );
  });

  assert.ok(ACTIVE_OWNERSHIP_TOKENS.rawr);
  assert.ok(ACTIVE_OWNERSHIP_TOKENS.gsim);
  assert.equal(ACTIVE_OWNERSHIP_TOKENS.basket, undefined);
  assert.equal(ACTIVE_OWNERSHIP_TOKENS.kimia, undefined);
});
