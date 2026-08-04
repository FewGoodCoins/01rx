import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CONTRACT_HEADERS,
  EXECUTION_RELEASE,
} from '@01resolved/contracts';

test('mainnet execution defaults to a frozen code-owned audit pause', () => {
  assert.equal(Object.isFrozen(EXECUTION_RELEASE), true);
  assert.deepEqual(EXECUTION_RELEASE, {
    code: 'AUDIT_REVIEW_REQUIRED',
    enabled: false,
    message: 'Trading is paused while 01R.Trade completes independent security review.',
    phase: 'audit-readiness-v1',
  });
  assert.equal(CONTRACT_HEADERS.execution, 'X-01R-Execution');
});

test('Vercel applies compatible baseline browser security headers', () => {
  const configuration = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const wildcard = configuration.headers.find(rule => rule.source === '/(.*)');
  assert.ok(wildcard);
  const headers = new Map(wildcard.headers.map(header => [header.key, header.value]));

  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(
    headers.get('Permissions-Policy'),
    'camera=(), geolocation=(), microphone=()',
  );
  assert.equal(headers.get('X-Permitted-Cross-Domain-Policies'), 'none');
  assert.match(headers.get('Content-Security-Policy'), /base-uri 'self'/);
  assert.match(headers.get('Content-Security-Policy'), /object-src 'none'/);

  // The product intentionally supports /embed and wallet popups. Add these
  // controls only after those boundaries have dedicated compatibility tests.
  assert.equal(headers.has('X-Frame-Options'), false);
  assert.equal(headers.has('Cross-Origin-Opener-Policy'), false);
  assert.doesNotMatch(headers.get('Content-Security-Policy'), /frame-ancestors/);
});

test('security automation is pinned, least privilege, and reviewable', () => {
  const codeql = fs.readFileSync('.github/workflows/codeql.yml', 'utf8');
  const dependabot = fs.readFileSync('.github/dependabot.yml', 'utf8');
  const pullRequestTemplate = fs.readFileSync(
    '.github/pull_request_template.md',
    'utf8',
  );

  assert.match(codeql, /^\s*pull_request:\s*$/m);
  assert.match(codeql, /^\s*schedule:\s*$/m);
  assert.doesNotMatch(codeql, /pull_request_target|secrets\./);
  assert.match(codeql, /security-events: write/);
  assert.match(
    codeql,
    /github\/codeql-action\/init@[a-f0-9]{40}\s+# v4/,
  );
  assert.match(
    codeql,
    /github\/codeql-action\/analyze@[a-f0-9]{40}\s+# v4/,
  );
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(pullRequestTemplate, /User-funds impact/);
  assert.match(pullRequestTemplate, /AI-assisted change/);
  assert.match(pullRequestTemplate, /Independent review/);
});

test('the readiness record does not claim that the current execution build is audited', () => {
  const readiness = fs.readFileSync(
    'docs/audits/audit-readiness-v1.md',
    'utf8',
  );
  assert.match(readiness, /NOT AUDIT READY FOR MAINNET EXECUTION/);
  assert.match(readiness, /All items are required; an AI agent cannot self-approve them/);
  assert.match(readiness, /independent security firm/);
  assert.match(readiness, /Re-enabling execution requires/);
});

test('the control matrix and frozen-candidate workflow preserve independent approval', () => {
  const matrix = fs.readFileSync(
    'docs/audits/control-matrix-v1.md',
    'utf8',
  );
  const workflow = fs.readFileSync(
    '.github/workflows/audit-candidate.yml',
    'utf8',
  );

  assert.match(matrix, /NOT AN AUDIT OR MAINNET EXECUTION APPROVAL/);
  assert.match(matrix, /single-RPC|One configured RPC|configured Solana RPC/i);
  assert.match(matrix, /AUD-01/);
  assert.match(matrix, /independent Solana\/application security firm/);
  assert.match(workflow, /npm run check:ci/);
  assert.match(workflow, /--require-clean/);
  assert.match(workflow, /audit-candidate-evidence\.mjs/);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\./);
  assert.match(
    workflow,
    /actions\/upload-artifact@[a-f0-9]{40}\s+# v7\.0\.1/,
  );
});
