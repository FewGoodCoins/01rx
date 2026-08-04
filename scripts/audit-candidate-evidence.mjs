import crypto from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const MANIFEST_PATH = 'security/execution-boundaries.json';

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function digestRecords(records) {
  const canonical = [...records]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(record => `${record.path}\0${record.bytes}\0${record.sha256}\n`)
    .join('');
  return sha256(canonical);
}

function safeRelativePath(relativePath) {
  return typeof relativePath === 'string'
    && relativePath.length > 0
    && !path.isAbsolute(relativePath)
    && !relativePath.split('/').includes('..');
}

async function fileRecord(absolutePath, displayPath) {
  let handle;
  try {
    handle = await fs.open(
      absolutePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error?.code === 'ELOOP') {
      throw new Error(`Audit source must be a regular file: ${displayPath}`);
    }
    throw error;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error(`Audit source must be a regular file: ${displayPath}`);
    }
    const data = await handle.readFile();
    return Object.freeze({
      bytes: data.byteLength,
      path: displayPath.split(path.sep).join('/'),
      sha256: sha256(data),
    });
  } finally {
    await handle.close();
  }
}

async function directoryRecords(absoluteDirectory) {
  const records = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Audit artifact cannot contain symbolic links: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        records.push(await fileRecord(
          absolutePath,
          path.relative(absoluteDirectory, absolutePath),
        ));
      }
    }
  }
  await visit(absoluteDirectory);
  return records;
}

export async function hashArtifact(artifactPath) {
  const absolutePath = path.resolve(artifactPath);
  const stats = await fs.lstat(absolutePath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Audit artifacts cannot be symbolic links: ${artifactPath}`);
  }
  if (stats.isFile()) {
    const record = await fileRecord(absolutePath, path.basename(absolutePath));
    return Object.freeze({
      bytes: record.bytes,
      files: Object.freeze([record]),
      name: path.basename(absolutePath),
      sha256: record.sha256,
      type: 'file',
    });
  }
  if (!stats.isDirectory()) {
    throw new Error(`Audit artifact must be a regular file or directory: ${artifactPath}`);
  }
  const records = await directoryRecords(absolutePath);
  if (!records.length) throw new Error(`Audit artifact directory is empty: ${artifactPath}`);
  return Object.freeze({
    bytes: records.reduce((total, record) => total + record.bytes, 0),
    files: Object.freeze(records),
    name: path.basename(absolutePath),
    sha256: digestRecords(records),
    type: 'directory',
  });
}

async function defaultGitRunner(root, args) {
  const { stdout } = await execFile('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.trimEnd();
}

function statusLines(status) {
  return String(status || '').split('\n').filter(Boolean);
}

export async function collectAuditCandidateEvidence({
  root = DEFAULT_ROOT,
  artifacts = [],
  gitRunner = null,
  now = () => new Date().toISOString(),
} = {}) {
  const absoluteRoot = path.resolve(root);
  const manifest = JSON.parse(
    await fs.readFile(path.join(absoluteRoot, MANIFEST_PATH), 'utf8'),
  );
  if (
    !Array.isArray(manifest.criticalFiles)
    || !manifest.criticalFiles.length
    || !manifest.criticalFiles.every(safeRelativePath)
  ) {
    throw new Error('Audit critical-file manifest is invalid');
  }
  const runGit = gitRunner || (args => defaultGitRunner(absoluteRoot, args));
  const [repositoryRoot, commit, tree, branch, status] = await Promise.all([
    runGit(['rev-parse', '--show-toplevel']),
    runGit(['rev-parse', 'HEAD']),
    runGit(['rev-parse', 'HEAD^{tree}']),
    runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(['status', '--porcelain=v1', '--untracked-files=all']),
  ]);
  if (path.resolve(String(repositoryRoot).trim()) !== absoluteRoot) {
    throw new Error('Audit evidence must run from the repository root');
  }
  if (
    !/^[a-f0-9]{40,64}$/.test(String(commit).trim())
    || !/^[a-f0-9]{40,64}$/.test(String(tree).trim())
    || !String(branch).trim()
  ) {
    throw new Error('Git candidate identity is invalid');
  }
  const workingTreeStatus = statusLines(status);
  const criticalFiles = await Promise.all(
    uniqueSorted(manifest.criticalFiles).map(relativePath => (
      fileRecord(path.join(absoluteRoot, relativePath), relativePath)
    )),
  );
  const artifactRecords = await Promise.all(artifacts.map(hashArtifact));
  if (new Set(artifactRecords.map(artifact => artifact.name)).size !== artifactRecords.length) {
    throw new Error('Audit artifact names must be unique');
  }
  const clean = workingTreeStatus.length === 0;
  return Object.freeze({
    schema: '01rx.audit-candidate.v1',
    generatedAt: now(),
    candidate: Object.freeze({
      clean,
      commit: String(commit).trim(),
      tree: String(tree).trim(),
      branch: String(branch).trim(),
      scope: manifest.scope,
    }),
    releaseGate: Object.freeze({ ...manifest.releaseGate }),
    sourceEvidence: Object.freeze({
      criticalFileCount: criticalFiles.length,
      criticalFiles: Object.freeze(criticalFiles),
      sha256: digestRecords(criticalFiles),
      workingTreeStatus: Object.freeze(workingTreeStatus),
    }),
    buildEvidence: Object.freeze({
      artifactCount: artifactRecords.length,
      artifacts: Object.freeze(artifactRecords),
      sha256: digestRecords(artifactRecords.map(artifact => ({
        bytes: artifact.bytes,
        path: artifact.name,
        sha256: artifact.sha256,
      }))),
    }),
    runtime: Object.freeze({
      architecture: process.arch,
      ci: process.env.CI === 'true',
      node: process.version,
      platform: process.platform,
    }),
    limitations: Object.freeze([
      'This record proves reproducible source and artifact identity; it is not a security audit or launch approval.',
      'Deployment configuration, secret scope, protection rules, runtime logs, and independent review require separate evidence.',
      'Workflow logs are the evidence that required checks completed before this record was generated.',
    ]),
  });
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function parseArguments(argv) {
  const options = {
    artifacts: [],
    output: '',
    requireClean: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--require-clean') {
      options.requireClean = true;
    } else if (argument === '--artifact' || argument === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a path`);
      }
      index += 1;
      if (argument === '--artifact') options.artifacts.push(value);
      else options.output = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export function assertCleanCandidate(evidence) {
  if (evidence?.candidate?.clean === true) return;
  const error = new Error(
    'Audit candidate is dirty; commit the exact reviewed source before freezing evidence',
  );
  error.code = 'DIRTY_AUDIT_CANDIDATE';
  throw error;
}

async function writeEvidence(output, evidence) {
  const absoluteOutput = path.resolve(output);
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(
    absoluteOutput,
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
}

async function main(argv) {
  const options = parseArguments(argv);
  const evidence = await collectAuditCandidateEvidence({
    artifacts: options.artifacts,
  });
  if (options.output) await writeEvidence(options.output, evidence);
  else process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (options.requireClean) assertCleanCandidate(evidence);
}

const isCli = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`Audit candidate evidence failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
