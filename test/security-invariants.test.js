import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  runSecurityInvariants,
} from '../scripts/security-invariants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the current repository satisfies every declared security invariant', async () => {
  const report = await runSecurityInvariants({ root: ROOT });
  assert.equal(
    report.ok,
    true,
    report.checks.filter(item => !item.ok).map(item => item.id).join(', '),
  );
  assert.equal(new Set(report.checks.map(item => item.id)).size, report.checks.length);
  assert.ok(report.checks.length >= 15);
});

test('the invariant gate rejects an opaque wallet sign-and-send path', async () => {
  const relativePath = 'src/markets/solana-trading.js';
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  const report = await runSecurityInvariants({
    root: ROOT,
    sourceOverrides: {
      [relativePath]: `${source}\n// signAndSendTransaction is intentionally forbidden here.\n`,
    },
  });
  assert.equal(report.ok, false);
  assert.equal(
    report.checks.find(item => item.id === 'wallet-capability')?.ok,
    false,
  );
});
