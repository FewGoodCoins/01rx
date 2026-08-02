const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const legacySource = fs.readFileSync('src/legacy/token-page.js', 'utf8');
const navModelModulePromise = import('../../src/token/nav-model.js');

function extractLegacyFunction(name) {
  const start = legacySource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} remains available as a compatibility facade`);
  const braceStart = legacySource.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < legacySource.length; i += 1) {
    if (legacySource[i] === '{') depth += 1;
    if (legacySource[i] === '}') depth -= 1;
    if (depth === 0) return legacySource.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function loadLegacyNavFacades(navModel, overrides = {}) {
  const sandbox = {
    _futAmmDisplayLabel(cfg) { return cfg && (cfg.futAmmLabel || cfg.fut_amm_label) || 'FUT1'; },
    _globalSnapshotInfo: null,
    _meteoraDefaultDisplayLabel(cfg) { return cfg && (cfg.meteoraLabel || cfg.meteora_label) || 'MET'; },
    tokenKey: 'fixture-token',
    window: { NAVGATOR: { token: { navModel } } },
    ...overrides,
  };
  const facades = [
    '_ambassadorLockedTokensForNav',
    '_buildNavSnapshot',
    '_cfgVal',
    '_circulatingSupplyForNav',
    '_daoTokensForNav',
    '_deriveNavSnapshot',
    '_effectiveMarketCapFromCfg',
    '_effectiveSupplyForNav',
    '_fdvFromCfg',
    '_fdvSupplyForCfg',
    '_investorLockedTokensForNav',
    '_lockedTokensForNav',
    '_marketCapFromCfg',
    '_metadaoFeeTokensForNav',
    '_meteoraProtocolFeeUSDCForCfg',
    '_navModelContext',
    '_navPerTokenFromCfg',
    '_navSnapshotBlocksNav',
    '_navSnapshotIssueLabel',
    '_navSnapshotStatusLabel',
    '_navSnapshotTimeMs',
    '_navTreasuryComponentsForCfg',
    '_normalizeNavSnapshot',
    '_parseSnapshotCadenceSec',
    '_parseSnapshotMs',
    '_projectLpFeeTokensForCfg',
    '_projectLpFeeUSDCForCfg',
    '_snapshotCadenceSecFromCfg',
    '_snapshotIsPastSchedule',
    '_snapshotScheduleForCfg',
  ].map(extractLegacyFunction).join('\n');
  vm.runInNewContext(facades, sandbox);
  return sandbox;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function options(extra = {}) {
  return {
    globalSnapshotInfo: null,
    labels: { futAmmLabel: 'FUT1', meteoraLabel: 'MET' },
    tokenKey: 'fixture-token',
    ...extra,
  };
}

test('NAV model installs under the token bridge before classic scripts', async () => {
  const { installBrowserNavModel, navModel } = await navModelModulePromise;
  const runtime = { NAVGATOR: { token: { chartData: {} } } };

  assert.equal(installBrowserNavModel(runtime), navModel);
  assert.equal(runtime.NAVGATOR.token.navModel, navModel);
  assert.deepEqual(runtime.NAVGATOR.token.chartData, {});

  const tokenRuntimeSource = fs.readFileSync('src/token/runtime.js', 'utf8');
  assert.ok(tokenRuntimeSource.indexOf('installBrowserNavModel(browserWindow);') < tokenRuntimeSource.indexOf('installBrowserTokenController(browserWindow);'));
});

test('valid NAV accounting and receipt trust remain deeply legacy-equivalent', async () => {
  const { navModel } = await navModelModulePromise;
  const legacy = loadLegacyNavFacades(navModel, { tokenKey: 'solo' });
  const nowMs = Date.parse('2026-04-07T12:20:00Z');
  const cfg = {
    key: 'solo',
    ticker: 'SOLO',
    spot: 3,
    treasuryUSDC: 1000,
    effectiveSupply: 500,
    onChainSupply: 1000,
    lockedTokens: 100,
    daoTokens: 50,
    futAmmUSDC: 200,
    meteoraLpUSDC: 100,
    daoUsdvValue: 25,
    buybackRemainingUSDC: 75,
    nav: 2,
    navVerified: true,
    snapshotTime: '2026-04-07T12:00:00Z',
  };
  const moduleSnapshot = navModel.buildNavSnapshot(cfg, options({ nowMs, tokenKey: 'solo' }));
  const legacySnapshot = legacy._buildNavSnapshot(cfg, { nowMs });

  assert.deepEqual(plain(moduleSnapshot), plain(legacySnapshot));
  assert.equal(moduleSnapshot.status, 'verified');
  assert.equal(moduleSnapshot.navPerToken, 2);
  assert.equal(moduleSnapshot.supply.circulating, 850);
  assert.equal(moduleSnapshot.treasury.componentTotalUSDC, 1000);
  assert.equal(navModel.navSnapshotBlocksNav(moduleSnapshot), false);
});

test('missing core NAV inputs fail closed and preserve issue labels', async () => {
  const { navModel } = await navModelModulePromise;
  const legacy = loadLegacyNavFacades(navModel);
  const nowMs = Date.parse('2026-04-07T12:20:00Z');
  const cfg = { key: 'bad', navVerified: true };
  const moduleSnapshot = navModel.buildNavSnapshot(cfg, options({ nowMs }));
  const legacySnapshot = legacy._buildNavSnapshot(cfg, { nowMs });

  assert.deepEqual(plain(moduleSnapshot), plain(legacySnapshot));
  assert.equal(moduleSnapshot.status, 'unverified');
  assert.equal(navModel.navSnapshotBlocksNav(moduleSnapshot), true);
  assert.equal(navModel.effectiveSupplyForNav(cfg), 0);
  assert.equal(moduleSnapshot.supply.effective, 0);
  assert.equal(moduleSnapshot.supply.onChain, 0);
  assert.equal(moduleSnapshot.supply.circulating, 0);
  assert.deepEqual(moduleSnapshot.issues, [
    'missing_treasury_usdc',
    'missing_effective_supply',
    'missing_snapshot_time',
  ]);
  assert.deepEqual(moduleSnapshot.issues.map(navModel.navSnapshotIssueLabel), [
    'missing treasury total',
    'missing effective supply',
    'missing snapshot time',
  ]);
});

test('stale and inconsistent receipts preserve trust and displayability rules', async () => {
  const { navModel } = await navModelModulePromise;
  const legacy = loadLegacyNavFacades(navModel);
  const nowMs = Date.parse('2026-04-07T12:30:00Z');
  const fixtures = [
    {
      expectedIssue: null,
      expectedStatus: 'stale',
      cfg: {
        key: 'old',
        treasuryUSDC: 1000,
        effectiveSupply: 500,
        navVerified: true,
        snapshotTime: '2026-04-07T10:00:00Z',
      },
      opts: { maxAgeMs: 60 * 60 * 1000, nowMs },
    },
    {
      expectedIssue: 'reported_nav_mismatch',
      expectedStatus: 'partial',
      cfg: {
        key: 'mismatch',
        treasuryUSDC: 1000,
        effectiveSupply: 500,
        nav: 3,
        navVerified: true,
        snapshotTime: '2026-04-07T12:00:00Z',
      },
      opts: { nowMs },
    },
  ];

  fixtures.forEach(({ cfg, opts, expectedIssue, expectedStatus }) => {
    const moduleSnapshot = navModel.buildNavSnapshot(cfg, options(opts));
    const legacySnapshot = legacy._buildNavSnapshot(cfg, opts);
    assert.deepEqual(plain(moduleSnapshot), plain(legacySnapshot));
    assert.equal(moduleSnapshot.status, expectedStatus);
    assert.equal(navModel.navSnapshotBlocksNav(moduleSnapshot), false, `${expectedStatus} NAV remains displayable`);
    if (expectedIssue) assert.ok(moduleSnapshot.issues.includes(expectedIssue));
  });
});

test('scheduled daily freshness uses explicit global schedule context', async () => {
  const { navModel } = await navModelModulePromise;
  const globalSnapshotInfo = { snapshot_interval_sec: 'daily' };
  const legacy = loadLegacyNavFacades(navModel, { _globalSnapshotInfo: globalSnapshotInfo });
  const cfg = { snapshot_time: '2026-04-07T00:10:00Z' };
  const beforeNext = Date.parse('2026-04-07T23:59:00Z');
  const afterNext = Date.parse('2026-04-08T00:11:00Z');

  assert.deepEqual(
    plain(navModel.snapshotScheduleForCfg(cfg, beforeNext, globalSnapshotInfo)),
    plain(legacy._snapshotScheduleForCfg(cfg, beforeNext)),
  );
  assert.equal(navModel.snapshotIsPastSchedule(cfg, beforeNext, globalSnapshotInfo), false);
  assert.equal(navModel.snapshotIsPastSchedule(cfg, afterNext, globalSnapshotInfo), true);
  assert.equal(legacy._snapshotIsPastSchedule(cfg, afterNext), true);
  assert.equal(navModel.parseSnapshotCadenceSec('daily'), 86400);
});

test('MetaDAO legacy supply aliases and claimed fee exclusions remain equivalent', async () => {
  const { navModel } = await navModelModulePromise;
  const legacy = loadLegacyNavFacades(navModel, { tokenKey: 'meta' });
  const cfg = {
    key: 'meta',
    spot: 0.08,
    treasury_usdc: 600000,
    effective_supply: 10000000,
    on_chain_supply: 12000000,
    locked_tokens: 1000000,
    dao_tokens: 16,
    investor_locked: 200000,
    ambassador_locked: 100000,
    metadao_fee_tokens: 10,
    fut_amm_unclaimed_fee_tokens: 500,
    meteora_mdao_lp_fee_tokens: 250,
    snapshot_time: '2026-04-07T12:00:00Z',
  };
  const moduleValues = {
    circulating: navModel.circulatingSupplyForNav(cfg),
    dao: navModel.daoTokensForNav(cfg),
    feeTokens: navModel.metadaoFeeTokensForNav(cfg),
    snapshot: navModel.buildNavSnapshot(cfg, options({ nowMs: Date.parse('2026-04-07T12:20:00Z'), tokenKey: 'meta' })),
  };
  const legacyValues = {
    circulating: legacy._circulatingSupplyForNav(cfg),
    dao: legacy._daoTokensForNav(cfg),
    feeTokens: legacy._metadaoFeeTokensForNav(cfg),
    snapshot: legacy._buildNavSnapshot(cfg, { nowMs: Date.parse('2026-04-07T12:20:00Z') }),
  };

  assert.deepEqual(plain(moduleValues), plain(legacyValues));
  assert.equal(moduleValues.dao, 0);
  assert.equal(moduleValues.feeTokens, 10);
  assert.equal(moduleValues.circulating, 10699990);
});

test('investor and ambassador lock deductions preserve camel, snake, and zero values', async () => {
  const { navModel } = await navModelModulePromise;
  const legacy = loadLegacyNavFacades(navModel);
  const camel = {
    spot: 2,
    treasuryUSDC: 1000,
    effectiveSupply: 500,
    onChainSupply: 1000,
    lockedTokens: 100,
    daoTokens: 50,
    investorLocked: 200,
    ambassadorLocked: 25,
    metadaoFeeTokens: 10,
  };
  const snake = {
    spot: 2,
    treasury_usdc: 1000,
    effective_supply: 500,
    on_chain_supply: 1000,
    locked_tokens: 100,
    dao_tokens: 50,
    investor_locked: 200,
    ambassador_locked: 25,
    metadao_fee_tokens: 10,
  };
  const rawZeroReceipt = {
    treasury_usdc: 0,
    nav_per_token: 0,
    supply: {
      effective_supply: 0,
      on_chain_supply: 1000,
      investor_locked: 0,
      ambassador_locked: 0,
    },
  };

  assert.equal(navModel.circulatingSupplyForNav(camel), 615);
  assert.equal(navModel.circulatingSupplyForNav(snake), 615);
  assert.equal(navModel.circulatingSupplyForNav(camel), legacy._circulatingSupplyForNav(camel));
  assert.equal(navModel.circulatingSupplyForNav(snake), legacy._circulatingSupplyForNav(snake));

  const moduleNormalized = navModel.normalizeNavSnapshot(rawZeroReceipt, camel, options());
  const legacyNormalized = legacy._normalizeNavSnapshot(rawZeroReceipt, camel);
  assert.deepEqual(plain(moduleNormalized), plain(legacyNormalized));
  assert.equal(moduleNormalized.treasuryUSDC, 0);
  assert.equal(moduleNormalized.navPerToken, 0);
  assert.equal(moduleNormalized.supply.effective, 0);
});

test('project LP fee telemetry stays separate from treasury principal', async () => {
  const { navModel } = await navModelModulePromise;
  const legacy = loadLegacyNavFacades(navModel);
  const cfg = {
    treasuryUSDC: 1000,
    futAmmUSDC: 100,
    meteoraLpUSDC: 200,
    project_lp_fee_usdc: 50,
    project_lp_fee_tokens: 75,
    meteora_protocol_fee_usdc: 25,
    meteoraMdaoLpFeeUSDC: 125,
  };
  const moduleValues = {
    components: navModel.navTreasuryComponentsForCfg(cfg, options().labels),
    projectFeeTokens: navModel.projectLpFeeTokensForCfg(cfg),
    projectFeeUSDC: navModel.projectLpFeeUSDCForCfg(cfg),
    protocolFeeUSDC: navModel.meteoraProtocolFeeUSDCForCfg(cfg),
  };
  const legacyValues = {
    components: legacy._navTreasuryComponentsForCfg(cfg),
    projectFeeTokens: legacy._projectLpFeeTokensForCfg(cfg),
    projectFeeUSDC: legacy._projectLpFeeUSDCForCfg(cfg),
    protocolFeeUSDC: legacy._meteoraProtocolFeeUSDCForCfg(cfg),
  };

  assert.deepEqual(plain(moduleValues), plain(legacyValues));
  assert.equal(moduleValues.components.impliedDaoUSDC, 700);
  assert.equal(moduleValues.components.components.find((row) => row.key === 'meteoraLpUSDC').usd, 200);
  assert.equal(moduleValues.components.components.some((row) => row.key === 'projectLpFeeUSDC'), false);
  assert.equal(moduleValues.projectFeeUSDC, 50);
  assert.equal(moduleValues.projectFeeTokens, 75);
});

test('project-owned separated DLMM fees remain claimable evidence outside treasury', async () => {
  const { navModel } = await navModelModulePromise;
  const cfg = {
    treasuryUSDC: 1000,
    futAmmUSDC: 100,
    meteoraLpUSDC: 200,
    project_lp_fee_usdc: 50,
    daoMeteoraPools: [{
      poolAddress: 'project-dlmm',
      poolType: 'dlmm',
      meteoraLpOwnership: 'project',
      projectLpFeeUsdcShare: 1,
    }],
  };

  const components = navModel.navTreasuryComponentsForCfg(cfg, options().labels);

  assert.equal(components.impliedDaoUSDC, 700);
  assert.equal(components.components.some((row) => row.key === 'projectLpFeeUSDC'), false);
});

test('MetaDAO current fee assets remain an explicit non-DAO treasury component', async () => {
  const { navModel } = await navModelModulePromise;
  const legacy = loadLegacyNavFacades(navModel, { tokenKey: 'meta' });
  const cfg = {
    treasuryUSDC: 1200,
    daoUSDC: 700,
    futAmmUSDC: 300,
    metadaoFeeAssetsUSD: 200,
    // Gross generated revenue is a metric and must never become treasury.
    metadaoFeeGeneratedGrossUSD: 4000,
  };

  const moduleTreasury = navModel.navTreasuryComponentsForCfg(cfg, options().labels);
  const legacyTreasury = legacy._navTreasuryComponentsForCfg(cfg);

  assert.deepEqual(plain(moduleTreasury), plain(legacyTreasury));
  assert.equal(moduleTreasury.impliedDaoUSDC, 700);
  assert.equal(moduleTreasury.knownNonDaoUSDC, 500);
  assert.equal(moduleTreasury.componentTotalUSDC, 1200);
  assert.deepEqual(
    plain(moduleTreasury.components.map(component => [component.key, component.label, component.usd])),
    [
      ['daoUSDC', 'DAO Treasury', 700],
      ['futAmmUSDC', 'FUT1', 300],
      ['metadaoFeeAssetsUSD', 'Fee assets', 200],
    ],
  );
  assert.equal(
    moduleTreasury.components.some(component => component.usd === cfg.metadaoFeeGeneratedGrossUSD),
    false,
  );
});

test('backend receipt normalization preserves provenance and snake/camel fallbacks', async () => {
  const { navModel } = await navModelModulePromise;
  const legacy = loadLegacyNavFacades(navModel, { tokenKey: 'solo' });
  const cfg = { key: 'solo', spot: 3, treasuryUSDC: 1000, effectiveSupply: 500 };
  const raw = {
    formula_version: 'nav-v2',
    token: 'solo',
    ticker: 'SOLO',
    status: 'verified',
    timestamp_ms: Date.parse('2026-04-07T12:00:00Z'),
    block_slot: 321,
    block_time: '2026-04-07T11:59:58.000Z',
    treasury_usdc: 1200,
    nav_per_token: 4,
    supply: {
      effective_supply: 300,
      on_chain_supply: 400,
      circulating_supply: 250,
      locked_tokens: 50,
      dao_tokens: 100,
      metadao_fee_tokens: 0,
    },
    treasury: {
      reported_usdc: 1200,
      componentTotalUSDC: 1200,
      components: [{ key: 'daoUSDC', label: 'DAO Treasury', usd: 1200, address: 'Dao111' }],
    },
    market: { spot: 3, market_cap: 750, effective_market_cap: 900, fdv: 1200 },
    provenance: { rpc: { provider: 'Helius' } },
    addresses: { daoWallet: 'Dao111' },
  };
  const moduleSnapshot = navModel.normalizeNavSnapshot(raw, cfg, options({ tokenKey: 'solo' }));
  const legacySnapshot = legacy._normalizeNavSnapshot(raw, cfg);

  assert.deepEqual(plain(moduleSnapshot), plain(legacySnapshot));
  assert.equal(moduleSnapshot.formulaVersion, 'nav-v2');
  assert.equal(moduleSnapshot.slot, 321);
  assert.deepEqual(moduleSnapshot.sources, { rpc: { provider: 'Helius' } });
  assert.equal(moduleSnapshot.supply.circulating, 250);
});
