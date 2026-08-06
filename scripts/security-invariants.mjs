import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const MANIFEST_PATH = 'security/execution-boundaries.json';
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.d.ts',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.ts',
]);

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function sameMembers(left, right) {
  return JSON.stringify(uniqueSorted(left)) === JSON.stringify(uniqueSorted(right));
}

function check(id, ok, summary, details = {}) {
  return Object.freeze({
    id,
    ok: ok === true,
    summary,
    ...(Object.keys(details).length ? { details } : {}),
  });
}

function stringsIn(value) {
  const values = [];
  const expression = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  for (const match of value.matchAll(expression)) {
    values.push(match[1] ?? match[2]);
  }
  return values;
}

function delimitedSource(source, marker, openCharacter, closeCharacter) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return '';
  const openIndex = source.indexOf(openCharacter, markerIndex + marker.length);
  if (openIndex < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
  }
  return '';
}

function namedStringArray(source, marker) {
  return stringsIn(delimitedSource(source, marker, '[', ']'));
}

function exportedFunctionSource(source, name) {
  const expression = new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = expression.exec(source);
  if (!match) return '';
  const tail = source.slice(match.index + match[0].length);
  const next = /\nexport\s+(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.exec(tail);
  return source.slice(match.index, next ? match.index + match[0].length + next.index : source.length);
}

function releaseFields(source) {
  return {
    code: /\bcode:\s*['"]([^'"]+)['"]/.exec(source)?.[1] || '',
    enabled: /\benabled:\s*(true|false)\b/.exec(source)?.[1] || '',
    phase: /\bphase:\s*['"]?([a-z0-9-]+)['"]?/.exec(source)?.[1] || '',
  };
}

function pathIsSafe(relativePath) {
  return typeof relativePath === 'string'
    && relativePath.length > 0
    && !path.isAbsolute(relativePath)
    && !relativePath.split('/').includes('..');
}

async function readSource(root, relativePath, overrides) {
  if (Object.prototype.hasOwnProperty.call(overrides, relativePath)) {
    return String(overrides[relativePath]);
  }
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

async function collectTextSources(root, relativeRoot, overrides) {
  const values = [];
  const absoluteRoot = path.join(root, relativeRoot);
  async function visit(absoluteDirectory) {
    const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      const extension = entry.name.endsWith('.d.ts') ? '.d.ts' : path.extname(entry.name);
      if (!TEXT_EXTENSIONS.has(extension)) continue;
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      values.push({
        path: relativePath,
        source: await readSource(root, relativePath, overrides),
      });
    }
  }
  await visit(absoluteRoot);
  return values;
}

function formatMissing(values) {
  return uniqueSorted(values).join(', ');
}

export function evaluateSecurityInvariants({ manifest, sources }) {
  const checks = [];
  const allManifestPaths = [
    ...manifest.releaseGate.sources,
    manifest.browser.controller,
    ...manifest.browser.productionEntrypoints,
    manifest.browser.transactionModule,
    manifest.server.tradingRoute,
    manifest.server.rpcRelay,
    ...manifest.reviewedPolicySources.map(policy => policy.path),
    ...manifest.browserSourceRoots,
    ...manifest.evidenceTests,
    ...manifest.criticalFiles,
  ];
  const duplicateActions = manifest.browser.executionActions.filter(
    (value, index, values) => values.indexOf(value) !== index,
  );
  const duplicateBuilders = manifest.transactionFamilies
    .map(family => family.builder)
    .filter((value, index, values) => values.indexOf(value) !== index);
  checks.push(check(
    'manifest-valid',
    manifest.version === 1
      && manifest.scope === 'mainnet-execution-release'
      && allManifestPaths.every(pathIsSafe)
      && duplicateActions.length === 0
      && duplicateBuilders.length === 0,
    'The funds-sensitive boundary manifest is versioned, unique, and workspace-relative.',
    {
      duplicateActions,
      duplicateBuilders,
    },
  ));

  const releaseObservations = manifest.releaseGate.sources.map(relativePath => ({
    path: relativePath,
    ...releaseFields(
      delimitedSource(sources[relativePath] || '', 'EXECUTION_RELEASE', '{', '}')
      || sources[relativePath]
      || '',
    ),
  }));
  checks.push(check(
    'release-gate',
    releaseObservations.every(observation => (
      observation.code === manifest.releaseGate.code
      && observation.enabled === String(manifest.releaseGate.enabled)
      && observation.phase === manifest.releaseGate.phase
    )),
    'Every published contract representation matches the code-owned execution release.',
    { observations: releaseObservations },
  ));

  const controller = sources[manifest.browser.controller] || '';
  const observedActions = namedStringArray(controller, 'const EXECUTION_ACTIONS = new Set(');
  const missingHandlers = manifest.browser.executionActions.filter(action => (
    !controller.includes(`action === '${action}'`)
    && !controller.includes(`action === "${action}"`)
  ));
  const actionGuardIndex = controller.indexOf(
    'if (!executionEnabled && EXECUTION_ACTIONS.has(action))',
  );
  const firstHandlerIndex = Math.min(
    ...manifest.browser.executionActions
      .map(action => controller.indexOf(`action === '${action}'`))
      .filter(index => index >= 0),
  );
  checks.push(check(
    'execution-actions',
    sameMembers(observedActions, manifest.browser.executionActions)
      && missingHandlers.length === 0
      && actionGuardIndex >= 0
      && Number.isFinite(firstHandlerIndex)
      && actionGuardIndex < firstHandlerIndex,
    'Every browser execution action is inventoried and intercepted when the shared release is disabled.',
    {
      expected: uniqueSorted(manifest.browser.executionActions),
      missingHandlers,
      observed: uniqueSorted(observedActions),
    },
  ));

  const entrypointOverrides = manifest.browser.productionEntrypoints.filter(relativePath => (
    /\bexecutionRelease\b/.test(sources[relativePath] || '')
  ));
  checks.push(check(
    'browser-release-default',
    controller.includes('executionRelease = EXECUTION_RELEASE')
      && controller.includes('const executionEnabled = executionRelease?.enabled === true')
      && entrypointOverrides.length === 0,
    'Production browser entrypoints cannot replace the shared execution release object.',
    { entrypointOverrides },
  ));

  const transactionSource = sources[manifest.browser.transactionModule] || '';
  const observedBuilders = [
    ...transactionSource.matchAll(
      /export\s+(?:async\s+)?function\s+(build[A-Za-z0-9_]+Plan)\s*\(/g,
    ),
  ].map(match => match[1]);
  const expectedBuilders = manifest.transactionFamilies.map(family => family.builder);
  const familyObservations = manifest.transactionFamilies.map((family) => {
    const functionSource = exportedFunctionSource(transactionSource, family.builder);
    const observedKinds = uniqueSorted([
      ...functionSource.matchAll(/\bkind:\s*['"]([^'"]+)['"]/g),
    ].map(match => match[1]));
    return {
      builder: family.builder,
      expectedKinds: uniqueSorted(family.kinds),
      observedKinds,
      ok: Boolean(functionSource) && sameMembers(observedKinds, family.kinds),
    };
  });
  const finalBoundariesMissing = manifest.browser.finalBoundaries.filter(name => (
    !exportedFunctionSource(transactionSource, name)
  ));
  checks.push(check(
    'transaction-inventory',
    sameMembers(observedBuilders, expectedBuilders)
      && familyObservations.every(family => family.ok)
      && finalBoundariesMissing.length === 0,
    'Every exported transaction-plan builder, plan kind, and final boundary is inventoried.',
    {
      expectedBuilders: uniqueSorted(expectedBuilders),
      families: familyObservations,
      finalBoundariesMissing,
      observedBuilders: uniqueSorted(observedBuilders),
    },
  ));

  const forbiddenWalletCapabilities = manifest.browser.forbiddenSubmissionCapabilities.filter(
    capability => transactionSource.includes(capability),
  );
  checks.push(check(
    'wallet-capability',
    transactionSource.includes('SolanaSignTransaction')
      && transactionSource.includes('canSignTransaction')
      && transactionSource.includes('WALLET_DETACHED_SIGNING_REQUIRED')
      && forbiddenWalletCapabilities.length === 0,
    'Wallet execution requires detached signing and excludes opaque sign-and-send paths.',
    {
      forbiddenWalletCapabilities,
      requiredCapability: manifest.browser.requiredWalletCapability,
    },
  ));

  const simulateSource = exportedFunctionSource(transactionSource, 'simulatePlan');
  const signSource = exportedFunctionSource(transactionSource, 'signReviewedPlan');
  const sendSource = exportedFunctionSource(transactionSource, 'sendPlan');
  const rawSendCount = [...sendSource.matchAll(/sendRawTransaction\s*\(/g)].length;
  const reviewedRawSendCount = [
    ...sendSource.matchAll(/sendRawTransaction\s*\(\s*signedWireBytes\b/g),
  ].length;
  const reviewedBindingCount = [
    ...sendSource.matchAll(/const\s+signedWireBytes\s*=\s*reviewedSignedWireBytes\s*\(/g),
  ].length;
  checks.push(check(
    'exact-message-binding',
    simulateSource.includes('fingerprintAfterSimulation')
      && simulateSource.includes('SIMULATION_TRANSACTION_CHANGED')
      && signSource.includes('currentFingerprint !== plan.reviewFingerprint')
      && signSource.includes('reviewedSignedWireBytes')
      && sendSource.includes('currentFingerprint !== plan.reviewFingerprint')
      && rawSendCount === 2
      && rawSendCount === reviewedRawSendCount
      && rawSendCount === reviewedBindingCount,
    'Simulation, signing, and raw submission remain bound to the exact reviewed message.',
    {
      rawSendCount,
      reviewedBindingCount,
      reviewedRawSendCount,
    },
  ));

  const entrypointSource = manifest.browser.productionEntrypoints
    .map(relativePath => sources[relativePath] || '')
    .join('\n');
  checks.push(check(
    'same-origin-client-boundary',
    controller.includes("import { create01ResolvedClient } from '@01resolved/api-client'")
      && controller.includes('client.futarchy.solanaRpcUrl()')
      && controller.includes('trading.createMainnetConnection(relayUrl)')
      && !controller.includes('NAVGATOR?.solanaRpcUrl')
      && !/\bfetch\s*\(/.test(controller)
      && !/\bfetch\s*\(/.test(entrypointSource),
    'Browser execution uses the API client and its same-origin Solana RPC contract.',
  ));

  const tradingRoute = sources[manifest.server.tradingRoute] || '';
  const rateLimitStart = tradingRoute.indexOf('const RATE_LIMITS = Object.freeze({');
  const endpointStart = tradingRoute.indexOf('const ENDPOINTS = Object.freeze({');
  const observedViews = rateLimitStart >= 0 && endpointStart > rateLimitStart
    ? [...tradingRoute.slice(rateLimitStart, endpointStart).matchAll(/^\s*'([^']+)'\s*:/gm)]
      .map(match => match[1])
    : [];
  const tradingReleaseGuardIndex = tradingRoute.indexOf("'EXECUTION_PAUSED'");
  const tradingRateLimitIndex = tradingRoute.indexOf('const rateLimit = takeRateLimit');
  const tradingBodyIndex = tradingRoute.indexOf('const body = await parseRequestBody');
  checks.push(check(
    'trading-api-release-guard',
    sameMembers(observedViews, manifest.server.tradingViews)
      && tradingRoute.includes('EXECUTION_RELEASE')
      && tradingReleaseGuardIndex >= 0
      && tradingReleaseGuardIndex < tradingRateLimitIndex
      && tradingReleaseGuardIndex < tradingBodyIndex,
    'Every server trading view retains a fail-closed release guard before request processing.',
    {
      expectedViews: uniqueSorted(manifest.server.tradingViews),
      observedViews: uniqueSorted(observedViews),
    },
  ));

  const rpcRelay = sources[manifest.server.rpcRelay] || '';
  const observedRpcMethods = namedStringArray(
    rpcRelay,
    'export const ALLOWED_RPC_METHODS = Object.freeze(new Set(',
  );
  const rpcReleaseGuardIndex = rpcRelay.indexOf('if (includesSubmission(forwarded)');
  const rpcTransactionIndex = rpcRelay.indexOf('if (includesTransaction(forwarded)');
  checks.push(check(
    'rpc-relay-policy',
    sameMembers(observedRpcMethods, manifest.server.allowedRpcMethods)
      && sameMembers(manifest.server.submissionRpcMethods, ['sendTransaction'])
      && sameMembers(manifest.server.simulationRpcMethods, ['simulateTransaction'])
      && rpcRelay.includes("call.method === 'sendTransaction'")
      && rpcRelay.includes("'EXECUTION_PAUSED'")
      && rpcReleaseGuardIndex >= 0
      && rpcReleaseGuardIndex < rpcTransactionIndex,
    'The RPC allowlist is inventoried and submission remains protected by the release gate.',
    {
      expected: uniqueSorted(manifest.server.allowedRpcMethods),
      observed: uniqueSorted(observedRpcMethods),
    },
  ));

  const browserSources = Object.entries(sources)
    .filter(([, source]) => typeof source === 'string')
    .filter(([relativePath]) => manifest.browserSourceRoots.some(root => (
      relativePath === root || relativePath.startsWith(`${root}/`)
    )));
  const exposedIdentifiers = [];
  const exposedUrls = [];
  const secretLikeViteVariables = [];
  for (const [relativePath, source] of browserSources) {
    for (const identifier of manifest.serverOnlyIdentifiers) {
      if (source.includes(identifier)) exposedIdentifiers.push(`${relativePath}:${identifier}`);
    }
    for (const fragment of manifest.serverOnlyUrlFragments) {
      if (source.includes(fragment)) exposedUrls.push(`${relativePath}:${fragment}`);
    }
    for (const match of source.matchAll(/\bVITE_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|RPC)[A-Z0-9_]*\b/g)) {
      secretLikeViteVariables.push(`${relativePath}:${match[0]}`);
    }
  }
  checks.push(check(
    'browser-secret-boundary',
    exposedIdentifiers.length === 0
      && exposedUrls.length === 0
      && secretLikeViteVariables.length === 0,
    'Browser source contains no server credential names, private upstream URLs, or secret-like VITE variables.',
    {
      exposedIdentifiers: uniqueSorted(exposedIdentifiers),
      exposedUrls: uniqueSorted(exposedUrls),
      secretLikeViteVariables: uniqueSorted(secretLikeViteVariables),
    },
  ));

  const missingPolicySymbols = [];
  for (const policy of manifest.reviewedPolicySources) {
    const source = sources[policy.path] || '';
    for (const symbol of policy.requiredSymbols) {
      if (!source.includes(symbol)) missingPolicySymbols.push(`${policy.path}:${symbol}`);
    }
  }
  const decisionPolicy = sources['src/markets/solana-program-policy.js'] || '';
  const decisionProgramCount = [
    ...decisionPolicy.matchAll(/\bprogramDataAddress:\s*['"][1-9A-HJ-NP-Za-km-z]+['"]/g),
  ].length;
  checks.push(check(
    'reviewed-program-policies',
    missingPolicySymbols.length === 0 && decisionProgramCount === 4,
    'Program deployments, upgrade authorities, route policies, and token allowlists remain code-owned.',
    {
      decisionProgramCount,
      missingPolicySymbols,
    },
  ));

  const dflowPolicy = sources['api/_lib/dflow-transaction-policy.js'] || '';
  checks.push(check(
    'token-program-policy',
    transactionSource.includes('classic SPL tokens only')
      && dflowPolicy.includes('Token-2022 compatibility program')
      && dflowPolicy.includes("{ signer: false, writable: false }")
      && dflowPolicy.includes('is not a classic SPL Token account')
      && dflowPolicy.includes('is not a classic SPL Token mint'),
    'Decision execution remains classic-SPL-only; DFlow Token-2022 compatibility is read-only and narrowly scoped.',
  ));

  const missingEvidence = [...manifest.evidenceTests, ...manifest.criticalFiles]
    .filter(relativePath => !Object.prototype.hasOwnProperty.call(sources, relativePath));
  checks.push(check(
    'evidence-surface',
    missingEvidence.length === 0,
    'Every declared evidence test and frozen-candidate critical file exists.',
    { missing: uniqueSorted(missingEvidence) },
  ));

  const packageSource = sources['package.json'] || '';
  const ciWorkflow = sources['.github/workflows/ci.yml'] || '';
  let packageConfiguration = {};
  try {
    packageConfiguration = JSON.parse(packageSource);
  } catch {
    packageConfiguration = {};
  }
  checks.push(check(
    'ci-wiring',
    packageConfiguration.scripts?.['check:security'] === 'node scripts/security-invariants.mjs'
      && String(packageConfiguration.scripts?.['check:ci'] || '').includes('npm run check:security')
      && ciWorkflow.includes('npm run check:ci'),
    'The invariant gate is part of the required CI release command.',
  ));

  return Object.freeze({
    generatedAt: new Date().toISOString(),
    ok: checks.every(item => item.ok),
    scope: manifest.scope,
    version: manifest.version,
    checks: Object.freeze(checks),
  });
}

export async function runSecurityInvariants({
  root = DEFAULT_ROOT,
  sourceOverrides = {},
} = {}) {
  const absoluteRoot = path.resolve(root);
  const manifestSource = await readSource(absoluteRoot, MANIFEST_PATH, sourceOverrides);
  const manifest = JSON.parse(manifestSource);
  const requiredFiles = uniqueSorted([
    MANIFEST_PATH,
    'package.json',
    '.github/workflows/ci.yml',
    ...manifest.releaseGate.sources,
    manifest.browser.controller,
    ...manifest.browser.productionEntrypoints,
    manifest.browser.transactionModule,
    manifest.server.tradingRoute,
    manifest.server.rpcRelay,
    ...manifest.reviewedPolicySources.map(policy => policy.path),
    ...manifest.evidenceTests,
    ...manifest.criticalFiles,
  ]);
  const sources = {};
  await Promise.all(requiredFiles.map(async (relativePath) => {
    try {
      sources[relativePath] = await readSource(absoluteRoot, relativePath, sourceOverrides);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }));
  const browserSources = await Promise.all(
    manifest.browserSourceRoots.map(relativeRoot => (
      collectTextSources(absoluteRoot, relativeRoot, sourceOverrides)
    )),
  );
  browserSources.flat().forEach(({ path: relativePath, source }) => {
    sources[relativePath] = source;
  });
  return evaluateSecurityInvariants({ manifest, sources });
}

function printHumanReport(report) {
  const passing = report.checks.filter(item => item.ok).length;
  process.stdout.write(
    `Trivium security invariants: ${report.ok ? 'PASS' : 'FAIL'} (${passing}/${report.checks.length})\n`,
  );
  report.checks.forEach((item) => {
    process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'} ${item.id}: ${item.summary}\n`);
    if (!item.ok && item.details) {
      process.stdout.write(`${JSON.stringify(item.details, null, 2)}\n`);
    }
  });
}

async function main(argv) {
  const unknown = argv.filter(argument => argument !== '--json');
  if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
  const report = await runSecurityInvariants();
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printHumanReport(report);
  if (!report.ok) process.exitCode = 1;
}

const isCli = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`Security invariant check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export const _test = Object.freeze({
  delimitedSource,
  exportedFunctionSource,
  releaseFields,
  sameMembers,
  stringsIn,
});
