import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  loadValidatedProposalMetadataFromProposal,
} from '../api/_lib/futarchy-accounts.js';
import {
  buildFutarchyLikelihoodDataset,
} from '../api/_lib/futarchy-likelihood-dataset.js';
import { createFutarchyService } from '../api/_lib/futarchy-service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTEXT_ROOT = path.join(ROOT, '.context');
const DEFAULT_OUTPUT = path.join(CONTEXT_ROOT, 'futarchy-likelihood', 'dataset.json');

function integerArgument(value, fallback, minimum, maximum, label) {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value)) throw new TypeError(`${label} must be an integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--output', '--max-proposals', '--concurrency', '--token'].includes(key)) {
      throw new TypeError(`Unknown argument: ${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new TypeError(`${key} requires a value`);
    values.set(key, value);
    index += 1;
  }
  const output = path.resolve(ROOT, values.get('--output') || DEFAULT_OUTPUT);
  const relativeOutput = path.relative(CONTEXT_ROOT, output);
  if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
    throw new TypeError('Dataset output must remain inside .context/');
  }
  const token = String(values.get('--token') || '').trim().toLowerCase();
  if (token && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(token)) {
    throw new TypeError('--token is invalid');
  }
  return {
    output,
    token,
    maxProposals: integerArgument(values.get('--max-proposals'), 1_000, 1, 1_000, '--max-proposals'),
    concurrency: integerArgument(values.get('--concurrency'), 4, 1, 8, '--concurrency'),
  };
}

async function mapConcurrent(values, concurrency, worker) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    () => run(),
  ));
  return results;
}

function sourceIssue(source, blocking = true) {
  return {
    code: `${source.toUpperCase()}_UNAVAILABLE`,
    message: `${source} could not be collected for this proposal.`,
    blocking,
  };
}

async function collectSource(source, operation, blocking = true) {
  try {
    return { value: await operation(), issue: null };
  } catch {
    return { value: null, issue: sourceIssue(source, blocking) };
  }
}

async function listResolvedProposals(service, options) {
  const proposals = [];
  let cursor = null;
  do {
    const page = await service.proposals({
      limit: 100,
      cursor,
      token: options.token || undefined,
      status: 'all',
    });
    for (const market of page.proposals) {
      if (['passed', 'failed'].includes(market?.proposal?.status)) proposals.push(market);
      if (proposals.length >= options.maxProposals) return proposals;
    }
    cursor = page.pagination.nextCursor;
  } while (cursor);
  return proposals;
}

async function collectProposal(service, market) {
  const proposalId = market.proposal.id;
  const [history, orders, chainMetadata] = await Promise.all([
    collectSource('price_history', () => service.proposalHistory({
      proposal: proposalId,
      interval: '15m',
    })),
    collectSource('order_history', () => service.proposalOrders({ proposal: proposalId })),
    collectSource('chain_metadata', () => loadValidatedProposalMetadataFromProposal(
      service.getConnection(),
      { proposalAddress: proposalId },
    ), false),
  ]);
  return {
    market,
    history: history.value,
    orders: orders.value,
    chainMetadata: chainMetadata.value,
    collectionIssues: [history.issue, orders.issue, chainMetadata.issue].filter(Boolean),
  };
}

async function writeDataset(output, dataset) {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(dataset, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, output);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const service = createFutarchyService();
  const markets = await listResolvedProposals(service, options);
  const records = await mapConcurrent(
    markets,
    options.concurrency,
    market => collectProposal(service, market),
  );
  const dataset = buildFutarchyLikelihoodDataset({ records });
  await writeDataset(options.output, dataset);
  process.stdout.write(`${JSON.stringify({
    output: path.relative(ROOT, options.output),
    summary: dataset.summary,
  }, null, 2)}\n`);
}

await main();
