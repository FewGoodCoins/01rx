import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertCleanCandidate,
  collectAuditCandidateEvidence,
  digestRecords,
  hashArtifact,
  parseArguments,
  sha256,
} from '../scripts/audit-candidate-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('audit evidence helpers hash canonical bytes and reject ambiguous arguments', async () => {
  assert.equal(
    sha256('01rx'),
    '496111fd210653c2a9b304377aeaba78161131bebf83bc2d12d9fa4430bfe587',
  );
  assert.equal(
    digestRecords([
      { path: 'b', bytes: 2, sha256: 'bb' },
      { path: 'a', bytes: 1, sha256: 'aa' },
    ]),
    digestRecords([
      { path: 'a', bytes: 1, sha256: 'aa' },
      { path: 'b', bytes: 2, sha256: 'bb' },
    ]),
  );
  assert.deepEqual(
    parseArguments(['--require-clean', '--artifact', 'dist', '--output', 'proof.json']),
    {
      artifacts: ['dist'],
      output: 'proof.json',
      requireClean: true,
    },
  );
  assert.throws(() => parseArguments(['--output']), /requires a path/);
  assert.throws(() => parseArguments(['--unknown']), /Unknown argument/);

  const packageArtifact = await hashArtifact(path.join(ROOT, 'package.json'));
  assert.equal(packageArtifact.type, 'file');
  assert.match(packageArtifact.sha256, /^[a-f0-9]{64}$/);
});

test('candidate evidence binds git identity, critical files, and dirty state', async () => {
  const responses = new Map([
    ['rev-parse --show-toplevel', ROOT],
    ['rev-parse HEAD', 'a'.repeat(40)],
    ['rev-parse HEAD^{tree}', 'b'.repeat(40)],
    ['rev-parse --abbrev-ref HEAD', 'review/candidate'],
    ['status --porcelain=v1 --untracked-files=all', ' M src/example.js'],
  ]);
  const evidence = await collectAuditCandidateEvidence({
    root: ROOT,
    gitRunner: async args => responses.get(args.join(' ')) ?? '',
    now: () => '2026-08-04T18:00:00.000Z',
  });

  assert.equal(evidence.schema, '01rx.audit-candidate.v1');
  assert.equal(evidence.candidate.clean, false);
  assert.equal(evidence.candidate.commit, 'a'.repeat(40));
  assert.equal(evidence.candidate.tree, 'b'.repeat(40));
  assert.ok(evidence.sourceEvidence.criticalFileCount >= 20);
  assert.match(evidence.sourceEvidence.sha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.buildEvidence.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.sourceEvidence.workingTreeStatus, [' M src/example.js']);
  assert.throws(() => assertCleanCandidate(evidence), {
    code: 'DIRTY_AUDIT_CANDIDATE',
  });
});
