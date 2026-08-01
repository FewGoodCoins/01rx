const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function readSourceFile(file) {
  if (!fs.existsSync(file)) return '';
  const fileSource = fs.readFileSync(file, 'utf8');
  if (path.basename(file) !== 'styles.css') return fileSource;

  return fileSource.replace(/^@import ['"](.+)['"];$/gm, (_statement, importPath) => {
    return fs.readFileSync(path.resolve(path.dirname(file), importPath), 'utf8');
  });
}

const source = [
  'index.html',
  'styles/styles.css',
  'src/legacy/app-core.js',
  'src/legacy/landing.js',
  'src/legacy/token-page.js',
].map(readSourceFile).join('\n');

const chartDataModuleSource = fs.readFileSync('src/token/chart-data.js', 'utf8')
  .replace(/^export /gm, '');
const navModelModuleSource = fs.readFileSync('src/token/nav-model.js', 'utf8')
  .replace(/^export /gm, '');
const proposalModelModuleSource = fs.readFileSync('src/token/proposal-model.js', 'utf8')
  .replace(/^export /gm, '');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists in index.html`);
  const functionStart = source.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(functionStart, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function extractVarObject(name) {
  const start = source.indexOf(`var ${name} =`);
  assert.notEqual(start, -1, `${name} exists in index.html`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) {
      const semi = source.indexOf(';', i);
      return source.slice(start, semi + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function loadHelpers(extra = '', sandboxOverrides = {}) {
  const sandbox = {
    isFinite,
    Number,
    CFG: { spot: 0.5 },
    tokenKey: '',
    _syntheticIcoTs: 0,
    _navHistory: [],
    _lwTreasuryHistory: [],
    _globalSnapshotInfo: null,
    _tokenConfigHydrated: false,
    _chartTF: '1D',
    _navHistoryByTF: {},
    _treasuryHistoryByTF: {},
    _navHistoryIgnoresSnapshotByTF: {},
    _USE_FEE_HISTORY_FOR_PUBLIC_DISPLAY: false,
    _MET_LP_DUST_USD: 100,
    _BUYBACK_DISPLAY_MIN_USD: 100,
    _VOLUME_DISPLAY_MIN_USD: 100,
    _DEPOSIT_DISPLAY_MIN_USD: 100,
    _DEPOSIT_DISPLAY_MIN_TREASURY_SHARE: 0.0001,
    _overlayDaoOwnedLpFeePools: [],
    _buybackSpendSourceRowsCache: null,
    _buybackSnappedSpendTotalsCache: null,
    _buybackMarkerTimeRunsCache: null,
    _buybackFlowPeriodTotalsCache: null,
    _buybackPriceRowsForRunCache: null,
    _buybackUsdStatsCache: null,
    _buybackTokenStatsCache: null,
    _displayMovements: [],
    _displayBuybackBudgetSeriesCache: null,
    _displayBuybackSpendByTimeCache: null,
    _displayMovementsForTimeCache: {},
    _displayMovementsTimeIndexCache: null,
    _raiseOverlayFlowForTimeCache: {},
    _treasuryComponentDataCache: null,
    _treasuryComponentDataCacheKey: '',
    _treasuryComponentDataCacheVersion: 0,
    _supplyComponentDataCache: null,
    _supplyComponentDataCacheKey: '',
    _supplyComponentDataCacheVersion: 0,
    ...sandboxOverrides
  };
  sandbox.window = sandbox.window || {};
  vm.runInNewContext(`${chartDataModuleSource}\ninstallBrowserChartData(window);`, sandbox);
  vm.runInNewContext(`${navModelModuleSource}\ninstallBrowserNavModel(window);`, sandbox);
  vm.runInNewContext(`${proposalModelModuleSource}\ninstallBrowserProposalModel(window);`, sandbox);
  const helperSource = [
    '_esc',
    '_appRootPath',
    '_homePageUrl',
    '_queryPageUrl',
    '_launchpadPageUrl',
    '_tokenPageUrl',
    '_tfSeconds',
    '_tfDisplayLabel',
    '_monthBucketStart',
    '_weekBucketStart',
    '_bucketStartForTf',
    '_nextBucketStartForTf',
    '_previousBucketStartForTf',
    '_singlePointSeriesAnchorTime',
    '_singlePointSeriesAnchorValue',
    '_launchBucketStartForTf',
    '_navHistoryStartsFromLaunch',
    '_alignTrackedNavLaunchPoint',
    '_padLineSeriesForSinglePoint',
    '_padCandleSeriesForSinglePoint',
    '_padVolumeSeriesForSinglePoint',
    '_normalizeHistoryResolution',
    '_shouldUseHourlyLaunchNavForDailyChart',
    '_getRecommendedNavResolution',
    '_historicNavDisabledForToken',
    '_isHistoricNavOn',
    '_unitNum',
    '_candleVolumeUsd',
    '_aggregateCandles',
    '_collapseCurrentBucketCandles',
    '_collapseCurrentBucketLinePoints',
    '_collapseCurrentBucketVolumePoints',
    '_growthMetricSeriesFromHistory',
    '_growthMetricSeriesFromOfficialWeeklyHistory',
    '_mergeGrowthMetricSeries',
    '_compareGrowthMetricEntries',
    '_growthChartableMetricChoices',
    '_growthDefaultMetricKey',
    '_normalizeGrowthMetricSourceClass',
    '_growthMetricSourceClass',
    '_interpolateGrowthMetricDailySeries',
    '_navLineGapLimitSeconds',
    '_insertLineGapBreaks',
    '_inferIcoAnchorTsFromNavHistory',
    '_icoLaunchTs',
    '_configuredLaunchDateTs',
    '_isMigrationLaunchTokenKey',
    '_usesOwnershipLaunchIco',
    '_usesMigrationPriceStart',
    '_migrationPriceStartTime',
    '_priceStartMarkerValue',
    '_migrationNavStartSeed',
    '_migrationNavStartTime',
    '_migrationNavStartValue',
    '_launchAnchorValue',
    '_launchAnchorTs',
    '_launchMarkerDisplayTime',
    '_foldIcoIntoLaunchBucket',
    '_normalizeFeeRow',
    '_feeSourceIsClaimOnly',
    '_feeObjectHasClaimOnlySource',
    '_displayableFeePool',
    '_feeEntryUsd',
    '_feeEntryComponentUsd',
    '_feeSnapshot',
    '_feeSnapshotBreakdown',
    '_feeSnapshotBreakdownTokens',
    '_latestClaimFeeBreakdown',
    '_volumeUsdDisplayValue',
    '_depositDisplayMinUsd',
    '_depositUsdDisplayValue',
    '_sparkValueAtCutoff',
    '_calcSparkChange',
    '_getSparkPrice',
    '_canonicalPriceChange24h',
    '_fmtSidebarPct',
    '_fmtSignedSidebarPct',
    '_isFlatSidebarChange',
    '_applyCurrentNavLifecycle',
    '_cfgVal',
    '_finiteNumOrNull',
    '_effectiveSupplyForNav',
    '_lockedTokensForNav',
    '_daoTokensForNav',
    '_investorLockedTokensForNav',
    '_ambassadorLockedTokensForNav',
    '_metadaoFeeTokensForNav',
    '_circulatingSupplyForNav',
    '_navPerTokenFromCfg',
    '_marketCapFromCfg',
    '_effectiveMarketCapFromCfg',
    '_fdvSupplyForCfg',
    '_fdvFromCfg',
    '_navSnapshotTimeMs',
    '_projectLpFeeUSDCForCfg',
    '_projectLpFeeTokensForCfg',
    '_lpLabelValue',
    '_futAmmDisplayLabel',
    '_raydiumDisplayLabel',
    '_meteoraPoolDisplayLabel',
    '_meteoraPoolFallbackLabel',
    '_meteoraDefaultDisplayLabel',
    '_meteoraConfiguredPools',
    '_meteoraPoolAddress',
    '_meteoraLivePoolSource',
    '_meteoraLivePoolRowsForCfg',
    '_meteoraPoolSupplyTokens',
    '_meteoraPoolTreasuryUSDC',
    '_meteoraLpShouldSplit',
    '_meteoraLpProjectTreasuryPool',
    '_meteoraLpSupplyRowsForCfg',
    '_meteoraLpTreasuryRowsForCfg',
    '_navTreasuryComponentsForCfg',
    '_navModelContext',
    '_buildNavSnapshot',
    '_deriveNavSnapshot',
    '_normalizeNavSnapshot',
    '_navSnapshotStatusLabel',
    '_navSnapshotBlocksNav',
    '_navSnapshotIssueLabel',
    '_projectTreasuryAfterScheduledWithdrawals',
    '_pnavCheckpointValues',
    'hydrateConfig',
    'fetchFromAPI',
    '_historyRowTime',
    '_historyRowNav',
    '_firstIntradayNavBucket',
    '_parseSnapshotCadenceSec',
    '_parseSnapshotMs',
    '_snapshotCadenceSecFromCfg',
    '_getSnapshotCutoffSec',
    '_navHistoryProcessingContext',
    '_snapshotCutoffTimeForNavContext',
    '_navHistoryIgnoresSnapshotCutoffForTF',
    '_snapshotScheduleForCfg',
    '_meteoraPoolLabelForAddr',
    '_canonicalDisplayLabel',
    '_navHistoryUrl',
    '_navHistoryNeedsDetailedRows',
    '_navHistoryNeedsStoredProposalCorrection',
    '_normalizeMetaDaoLegacySupplyRows',
    '_isMetaDaoHistoryToken',
    '_metadaoHistoricSupplyDisplayDivisor',
    '_historicSupplyDisplayValue',
    '_expandCompactNavHistoryRows',
    '_withStoredProposalVaultNavCorrection',
    '_navFlowTimeMatches',
    '_coalescedNavFlowMarkerRows',
    '_compactShouldUseMillions',
    '_flowMarkerAmountText',
    '_displayMovementMonthKey',
    '_chartFlowLaunchTime',
    '_daysInUtcMonth',
    '_addUtcMonthsClamped',
    '_chartFlowPeriodStartTime',
    '_chartFlowPeriodKeyForTime',
    '_chartFlowPeriodFirstTs',
    '_nullableBool',
    '_frontendHintBool',
    '_utcDateKeyFromSeconds',
    '_normalizeDisplayMovementTimeForToken',
    '_displayMovementIsOperationalWithdrawal',
    '_displayMovementIsBuybackTransferDeposit',
    '_displayMovementIsBuybackSpend',
    '_displayMovementIsBuybackFundingSourceWithdrawal',
    '_displayMovementHasBuybackFundingSource',
    '_topMonthlyOperationalWithdrawalIndexes',
    '_normalizeDisplayMovements',
    '_normalizeAccountingLedgerEvents',
    '_normalizeSummaryMovementEvents',
    '_displayMovementAccountKey',
    '_displayMovementAccountKeys',
    '_addDisplayFlowAmount',
    '_displayMovementAmount',
    '_configuredTotalCommitsUsd',
    '_hasOversubscribedInitialRaise',
    '_displayMovementIsRaiseClassified',
    '_displayMovementIsLaunchRaiseCommitment',
    '_allowanceTransferIsOperationalSpend',
    '_allowanceWithdrawalMonthTotals',
    '_displayMovementIsInitialRaiseLikeDeposit',
    '_displayMovementIsExplicitExternalDeposit',
    '_displayMovementIsTreasuryReturn',
    '_displayMovementIsRaiseDeposit',
    '_displayMovementUsesConfiguredInitialRaiseAmount',
    '_displayMovementRaiseDisplayAmount',
    '_displayMovementIsOperationalDeposit',
    '_hasDisplayMovementContract',
    '_displayBuybackBudgetForTime',
    '_displayBuybackSpendForTime',
    '_displayMovementsForTime',
    '_displayTreasuryFlowForTime',
    '_displaySupplyFlowForTime',
    '_daoOutflowForTime',
    '_treasuryFlowForTime',
    '_supplyFlowForTime',
    '_feeCumAt',
    '_feeChange',
    '_pruneRowsToSnapshot',
    '_sanitizeNavRows',
    '_pruneNavCachesToSnapshot',
    '_navHistoryRowIsPreTgeNavAnchor',
    '_navHistoryHasPreTgeNavAnchor',
    '_allowNavOutsidePriceRange',
    '_chartRangeDataForSeries',
    '_bucketRealNavSnapshots',
    '_alignCurrentBucketPoint',
    '_formatTrendPct',
    '_premiumDiscountLabel',
    '_formatPremiumDiscountDiff',
    '_formatPremiumDiscountPct',
    '_visibleRangeStartTs',
    '_showEntireSeriesInDefaultView',
    '_clampLogicalRangeToActualBounds',
    '_liveDotPlotRect',
    '_nonOverlappingBadgeTops',
    '_liveDotColor',
    '_chartInterpolatedTimeCoordinate',
    '_proposalEventDate',
    '_proposalTypeLabel',
    '_proposalModelContext',
    '_proposalMarkerKind',
    '_proposalStatusOutcome',
    '_timelineDateLabel',
    '_timelineStatusAllowed',
    '_timelineProposalIsoDate',
    '_knownSparseProposalMeta',
    '_proposalDisplayTitle',
    '_proposalEventKey',
    '_proposalTimelineDomId',
    '_raiseTimelineProposalKey',
    '_proposalMarkerTitle',
    '_timelineSparseProposalFallback',
    '_timelineProposalEvent',
    '_overlayHeaderDateLabel',
    '_lwTreasuryLookup',
    '_lwTreasuryLookupAtOrBefore',
    '_treasuryOverlaySnapshotTime',
    '_lwNavLookup',
    '_defaultChartOverlayTime',
    '_meteoraProtocolFeeUSDCForCfg',
    '_daoOwnedUsdFeesForCfg',
    '_overlayDaoOwnedLpPendingFeesForCfg',
    '_overlayDaoOwnedLpPendingFeeUsdForCfg',
    '_overlayDaoOwnedLpFeePoolRows',
    '_overlayDaoOwnedLpFeePoolAllowed',
    '_overlayDaoOwnedLpFeePoolsFromPayload',
    '_overlayDaoOwnedLpFeeAmountsFromHistory',
    '_overlayDaoOwnedLpFeeUsdFromHistory',
    '_overlayDaoOwnedLpFeesEnabled',
    '_overlayDaoFeeAmounts',
    '_overlayFeeTokenAmountText',
    '_overlayDaoUsdFees',
    '_overlayFeesLineHtml',
    '_metLpUsdDisplayValue',
    '_buybackUsdDisplayValue',
    '_buybackBudgetTotalUsd',
    '_buybackBudgetDisplay',
    '_buybackOverlayBudgetText',
    '_invalidateBuybackRenderCaches',
    '_buybackPeriodDate',
    '_applyBuybackSummaryState',
    '_buybackEfficiencyForToken',
    '_buybackHoverText',
    '_buybackCampaignAmount',
    '_buybackCampaignDate',
    '_buybackCampaignWindows',
    '_buybackActivityWindows',
    '_buybackConfiguredEventWindows',
    '_buybackChartEventWindows',
    '_buybackOverlayInWindow',
    '_buybackActivityPeriodDisplay',
    '_buybackTopOverlayHtml',
    '_withdrawTopOverlayHtml',
    '_depositTopOverlayHtml',
    '_configuredInitialRaiseUsd',
    '_configuredInitialRaiseTime',
    '_configuredInitialRaiseSupplyTokens',
    '_raiseOverlayEffectiveSupplyDeltaForTime',
    '_raiseOverlayTimeMatches',
    '_raiseOverlayFlowForTime',
    '_raiseTreasuryOverlayHtml',
    '_raiseSupplyOverlayHtml',
    '_buybackTokenStatsForPriceTime',
    '_buybackSupplyOverlayHtml',
    '_isBuybackCurrentlyActive',
    '_applyBuybackMarkers',
    '_currentNavTailPoint',
    '_appendCurrentNavHistoryTail',
    '_appendCurrentTreasuryHistoryTail',
    '_priceCacheLowerBound',
    '_priceCacheUpperBound',
    '_priceCacheFloorIndex',
    '_snapToPriceTime',
    '_snapToNavTime',
    '_buybackSpendSourceRows',
    '_buybackSnappedSpendTotals',
    '_buybackMarkerTimeRuns',
    '_buybackFlowPeriodTotals',
    '_buybackPriceRowsForRun',
    '_buybackUsdForPriceTime',
    '_buybackUsdStatsForPriceTime',
    '_flowAmountLabel',
    '_flowBurnAmountLabel',
    '_hasDisplayUsd',
    '_hasDisplayTokens',
    '_overlayFlowDetailsVisible',
    '_overlayDaoVaultLabel',
    '_normalizeOverlayDaoBreakdown',
    '_overlayFlowAmountForKeys',
    '_displayMovementIsBuybackAccount',
    '_displayMovementMatchesOverlayVault',
    '_displayMovementMatchesConfiguredDaoVault',
    '_displayMovementCanUseSection',
    '_displayMovementTimeIndexKeys',
    '_getDisplayMovementsTimeIndex',
    '_buildPrefixEntriesFromTotals',
    '_prefixEntryAtOrBefore',
    '_buybackUsdStatsRawForPriceTime',
    '_overlayDerivedDaoVaultsFromMovements',
    '_treasuryHashString',
    '_treasuryUnusedPaletteColor',
    '_treasuryComponentIsWalletDetail',
    '_treasuryKnownWalletColor',
    '_treasuryWalletComponentColor',
    '_treasuryComponentColor',
    '_assignTreasuryComponentColors',
    '_treasuryComponentKey',
    '_treasuryShortWalletLabel',
    '_treasuryComponentSortRank',
    '_sortTreasuryComponentsStable',
    '_treasuryDaoWalletLabel',
    '_treasuryDaoBreakdownValue',
    '_treasuryNormalizeDaoBreakdownForComponents',
    '_treasuryCurrentDaoBreakdownForRow',
    '_treasuryComponentLabelScore',
    '_daoBreakdownRowValue',
    '_daoBreakdownRowIdentity',
    '_copyDaoBreakdownRow',
    '_mergeCurrentDaoBreakdownWithHistoric',
    '_mergeHistoricDaoBreakdownWithCurrentExtras',
    '_daoBreakdownRowsUSDC',
    '_sameUtcDaySeconds',
    '_copyHistoricTailNumber',
    '_latestTreasuryHistoryRowAtOrBefore',
    '_hydrateMetaCurrentTailFromHistory',
    '_pushTreasuryComponent',
    '_treasuryHistoryRowHasExplicitSplit',
    '_treasuryHistoryRowDefaultsToFutAmm',
    '_componentCacheNumber',
    '_metadaoFeeAssetsValue',
    '_hasExplicitMetadaoFeeAssets',
    '_componentCacheBreakdownSignature',
    '_componentCacheMeteoraSignature',
    '_componentCacheRowsSignature',
    '_buildTreasuryComponentDataCacheKey',
    '_buildSupplyComponentDataCacheKey',
    '_treasuryFutComponentUSDC',
    '_treasuryComponentDataFromHistory',
    '_getOverlaySplits',
    '_overlayFmtNum',
    '_overlayPoolLabel',
    '_overlayShowMetLabel',
    '_overlayMetPoolsForDisplay',
    '_overlayMetLpLabel',
    '_overlayTreasurySplitHtml',
    '_overlaySupplySplitHtml',
    '_chartPreLaunchOverlayHtml',
    '_projectedOverlayPointAt',
    '_isMetricChartMode',
    '_chartModeHeaderLabel',
    '_chartModePrimaryLabel',
    '_chartModeValueFormatter',
    '_overlaySupplySummaryHtml',
    '_overlayEffectiveSupplyValue',
    '_fillCandleGaps',
    '_shouldAppendLivePricePoint',
    '_shouldPulseLiveDots',
    '_invalidateTreasuryComponentDataCache',
    'renderAddresses',
  ].map(extractFunction).join('\n');
  vm.runInNewContext(`${helperSource}\n${extra}`, sandbox);
  return sandbox;
}

function loadProposalHelpers(extra = '', sandboxOverrides = {}) {
  const sandbox = {
    URL,
    tokenKey: 'solo',
    ...sandboxOverrides,
  };
  sandbox.window = sandbox.window || {};
  vm.runInNewContext(`${proposalModelModuleSource}\ninstallBrowserProposalModel(window);`, sandbox);
  const helperSource = [
    '_normalizeProposalUrl',
    '_proposalMarkerDateKey',
    '_proposalResolveRelativeUrl',
    '_proposalMarkerDerivedUrl',
    '_proposalFallbackProposalId',
    '_proposalMarkerUrl',
  ].map(extractFunction).join('\n');
  vm.runInNewContext(`${extractVarObject('_proposalFallbackIdByTokenDate')}\n${helperSource}\n${extra}`, sandbox);
  return sandbox;
}

test('sidebar price changes include explicit positive and negative signs', () => {
  const sandbox = loadHelpers(`
    result = [
      _fmtSignedSidebarPct(3),
      _fmtSignedSidebarPct(-1.4),
      _fmtSignedSidebarPct(0)
    ];
  `);
  assert.deepEqual(Array.from(sandbox.result), ['+3.00', '-1.40', '0']);
});

test('sidebar treats displayed zero 24-hour movement as flat', () => {
  const sandbox = loadHelpers(`
    result = [
      _isFlatSidebarChange(0),
      _isFlatSidebarChange(0.009),
      _isFlatSidebarChange(-0.009),
      _isFlatSidebarChange(0.01),
      _isFlatSidebarChange(-0.01)
    ];
  `);
  assert.deepEqual(Array.from(sandbox.result), [true, true, true, false, false]);
  assert.equal((source.match(/tp-token-secondary is-neutral is-flat/g) || []).length, 2);
  assert.equal((source.match(/data-metric="change24h">—<\/div>/g) || []).length, 2);
  assert.match(source, /\.tp-token-secondary\.is-flat\s*\{\s*color: var\(--dim\);/);
});

test('landing filter exposes enabled graveyard button next to permissionless', () => {
  assert.match(source, /class="lp-filter-btn lp-filter-btn-graveyard"[^>]+data-lp="graveyard"[^>]+filterByLaunchpad\('graveyard'\)/);
  assert.match(source, /data-lp="permissionless"[\s\S]*data-lp="graveyard"/);
  assert.match(source, /\.lp-filter-btn\[data-lp="permissionless"\]\s*\{\s*order:\s*3;\s*\}/);
  assert.match(source, /\.lp-filter-btn-graveyard\s*\{\s*order:\s*4;\s*margin-left:\s*0;\s*margin-right:\s*0;\s*\}/);
  assert.doesNotMatch(source, /\.lp-filter-btn-graveyard\s*\{[^}]*margin-left:\s*auto/);
  assert.doesNotMatch(source, /if\s*\(\s*lpKey\s*===\s*['"]graveyard['"]\s*\)\s*return/);
  assert.match(source, /const TOKENS_FALLBACK = window\.NAVGATOR\.projectMetadata;/);
  assert.doesNotMatch(source, /rngr:\s*true/);
  assert.match(source, /function graveyardIconClass\(t\) \{/);
  assert.match(source, /class="tt-icon' \+ squareCls \+ '"/);
  assert.match(source, /\.tt-icon\.graveyard-square-icon,\s*\.tp-icon\.graveyard-square-icon,\s*\.th-icon\.graveyard-square-icon\s*\{\s*border-radius:\s*6px;\s*background:\s*#f4f6f2;/);
  assert.match(source, /\.tt-icon\.graveyard-square-icon img,\s*\.tp-icon\.graveyard-square-icon img,\s*\.th-icon\.graveyard-square-icon img\s*\{\s*object-fit:\s*contain;/);
  assert.match(source, /function _tokenUsesSquareLogo\(cfg, key\) \{/);
  assert.match(source, /if \(el\.dataset\) el\.dataset\.tokenKey = normalizedKey;/);
  assert.match(source, /_setTokenIconShape\(iconEl, CFG, tokenKey\);/);
  assert.match(source, /class="bb-tape-logo' \+ squareCls \+ '"/);
  assert.match(source, /\.bb-tape-logo\.graveyard-square-icon\s*\{\s*border-radius:\s*3px;\s*background:\s*#f4f6f2;/);
  assert.match(source, /includeInactiveParam\s*=\s*\(CFG && \(CFG\.graveyard \|\| CFG\.live === false\)\)\s*\?\s*'&includeInactive=1'\s*:\s*''/);
  assert.match(source, /if\s*\(\s*!CFG\.live\s*&&\s*!CFG\.graveyard\s*\)/);
  assert.match(source, /if\s*\(_activeFilter === 'lp:graveyard'\)\s*\{\s*if\s*\(!_isGraveyardToken\(t\)\)\s*return false;\s*\}\s*else if\s*\(_isGraveyardToken\(t\)\)\s*\{\s*return false;\s*\}/);
});

test('MetaDAO historic NAV stays disabled while other token histories retain their normal state', () => {
  const sandbox = loadHelpers(`
    CFG = { navVerified: true };
    _navHistory = [{ time: 1, nav: 0.5 }];
    _trackedFromLaunch = true;
    _showHistoricNav = true;

    tokenKey = 'meta';
    result = {
      metaDisabled: _historicNavDisabledForToken(),
      metaOn: _isHistoricNavOn()
    };

    tokenKey = 'metadao';
    result.aliasDisabled = _historicNavDisabledForToken();
    result.aliasOn = _isHistoricNavOn();

    tokenKey = 'solo';
    result.soloDisabled = _historicNavDisabledForToken();
    result.soloOn = _isHistoricNavOn();
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    metaDisabled: true,
    metaOn: false,
    aliasDisabled: true,
    aliasOn: false,
    soloDisabled: false,
    soloOn: true,
  });
});

test('MetaDAO historic NAV control is disabled and restored for other tokens', () => {
  function makeClassList() {
    const values = new Set();
    return {
      add: (...names) => names.forEach((name) => values.add(name)),
      contains: (name) => values.has(name),
      remove: (...names) => names.forEach((name) => values.delete(name)),
      toggle(name, force) {
        const enabled = force === undefined ? !values.has(name) : Boolean(force);
        if (enabled) values.add(name);
        else values.delete(name);
        return enabled;
      },
    };
  }

  function makeElement() {
    const attrs = new Map();
    return {
      attrs,
      classList: makeClassList(),
      disabled: false,
      removeAttribute: (name) => attrs.delete(name),
      setAttribute: (name, value) => attrs.set(name, String(value)),
      style: {},
      title: '',
    };
  }

  const button = makeElement();
  const navButton = makeElement();
  const fillButton = makeElement();
  const elements = {
    'nav-hist-toggle': button,
    'btn-layer-nav': navButton,
    'nav-gradient-toggle': fillButton,
  };
  const sandbox = {
    CFG: { navVerified: true },
    document: {
      getElementById: (id) => elements[id] || null,
    },
    tokenKey: 'meta',
    _navHistory: [{ time: 1, nav: 0.5 }],
    _showGradient: true,
    _showHistoricNav: true,
    _trackedFromLaunch: true,
  };

  vm.runInNewContext([
    extractFunction('_historicNavDisabledForToken'),
    extractFunction('_isHistoricNavOn'),
    extractFunction('_updateNavHistToggle'),
    '_updateNavHistToggle();',
  ].join('\n'), sandbox);

  assert.equal(button.disabled, true);
  assert.equal(button.classList.contains('disabled'), true);
  assert.equal(button.classList.contains('on'), false);
  assert.equal(button.attrs.get('aria-disabled'), 'true');
  assert.equal(button.attrs.get('aria-label'), 'Historic NAV temporarily unavailable for META');
  assert.equal(fillButton.style.display, 'none');
  assert.equal(sandbox._showHistoricNav, false);
  assert.equal(sandbox._showGradient, false);

  sandbox.tokenKey = 'solo';
  vm.runInNewContext('_updateNavHistToggle();', sandbox);

  assert.equal(button.disabled, false);
  assert.equal(button.classList.contains('disabled'), false);
  assert.equal(button.attrs.has('aria-disabled'), false);
  assert.equal(button.attrs.get('aria-label'), 'Toggle historic NAV line');
  assert.equal(fillButton.style.display, 'inline-flex');
});

test('token discovery deduplicates MTN aliases and preserves ZKFG retirement', () => {
  const sandbox = {
    console,
    TOKENS: {},
    TOKENS_FALLBACK: {
      mtn: { name: 'mtnCapital', ticker: 'MTN', live: false, graveyard: true, launchpad: 'Curated' },
      zkfg: { name: 'Turbine Cash', ticker: 'ZKFG', live: false, graveyard: true, liquidatedAt: '2026-06-20' },
    },
    _tokensLoaded: false,
    _normalizeTokenKey(value) {
      const key = String(value || '').toLowerCase();
      return { mtndao: 'mtn', mtncapital: 'mtn' }[key] || key;
    },
  };
  vm.runInNewContext(`${extractFunction('_applyDiscoveredTokens')}`, sandbox);

  const result = sandbox._applyDiscoveredTokens([
    { key: 'mtndao', name: 'Old MTN alias', ticker: 'MTN', live: false, status: 'inactive' },
    { key: 'mtncapital', name: 'Duplicate MTN alias', ticker: 'MTN', live: false, status: 'inactive' },
    { key: 'zkfg', name: 'Stale active ZKFG', ticker: 'ZKFG', live: true, status: 'active' },
  ]);

  assert.deepEqual(Object.keys(result), ['mtn', 'zkfg']);
  assert.equal(result.mtn.graveyard, true);
  assert.equal(result.zkfg.graveyard, true);
  assert.equal(result.zkfg.liquidatedAt, '2026-06-20');
});

test('landing hero uses stats instead of marketing copy', () => {
  assert.doesNotMatch(source, /Ownership<\/span><span class="hero-title-main">,/);
  assert.doesNotMatch(source, /Real-time NAV, treasury, supply, and price tracking for ownership tokens\./);
  assert.doesNotMatch(source, /NAVgator tracks[\s\S]*ownership tokens[\s\S]*fundamentally worth/);
  assert.doesNotMatch(source, /class="landing-blurb"/);
  assert.match(source, /<div class="hs-label">Aggregate NAV<\/div>/);
  assert.match(source, /<div class="hs-label">Market Value<\/div>/);
  assert.doesNotMatch(source, /<div class="hs-label">Total Treasury<\/div>/);
  assert.doesNotMatch(source, /<div class="hs-label">Total MCap<\/div>/);
  assert.match(source, /id="landing-avg-discount"/);
  assert.match(source, /id="landing-avg-premium"/);
  assert.doesNotMatch(source, /id="landing-max-discount"/);
  assert.doesNotMatch(source, /id="landing-max-premium"/);
  assert.match(source, /avgDiscountEl\.innerHTML = '<span class="down">' \+ avgDiscount\.toFixed\(1\) \+ '%<\/span> <span style="color:var\(--dim\)">avg<\/span>';/);
  assert.match(source, /avgPremiumEl\.innerHTML = '<span class="up">\+' \+ avgPremium\.toFixed\(1\) \+ '%<\/span> <span style="color:var\(--dim\)">avg<\/span>';/);
  assert.match(source, /id="landing-curated-count"/);
  assert.match(source, /id="landing-permissionless-count"/);
  assert.match(source, /id="landing-discount-count"/);
  assert.match(source, /id="landing-premium-count"/);
  assert.match(source, /function _paintLandingHeroStats\(\) \{/);
  assert.match(source, /var activeTokens = _activeLandingTokens\(\);/);
});

test('document establishes a dark canvas before module CSS loads', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const criticalPaint = html.indexOf('<style id="critical-paint">');
  const moduleEntry = html.indexOf('<script type="module" src="/src/main.js"></script>');

  assert.ok(criticalPaint > 0 && criticalPaint < moduleEntry);
  assert.match(html, /<html lang="en" class="app-css-pending">/);
  assert.match(html, /<meta name="color-scheme" content="dark">/);
  assert.match(html, /<meta name="theme-color" content="#101010">/);
  assert.match(html, /html \{[\s\S]*background: #101010;[\s\S]*color-scheme: dark;/);
  assert.match(html, /body \{[\s\S]*background: #101010;[\s\S]*color: #bbbbbb;/);
  assert.match(
    html,
    /html\.app-css-pending body > \*,\s*html\.app-css-pending body \* \{[\s\S]*visibility: hidden !important;/,
  );
  assert.match(
    html,
    /html\[data-market-boot="pending"\] body > \*,[\s\S]*html\[data-market-navigation="pending"\] body \*,[\s\S]*visibility: hidden !important;/,
  );
  assert.match(
    html,
    /html\[data-market-navigation="pending"\]::before,[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*background: #101010;/,
  );
  assert.match(html, /content: "01RX  ·  LOADING MARKET";/);
  assert.match(
    html,
    /setAttribute\('data-market-boot', 'pending'\)/,
  );
  assert.match(html, /data-embed-theme="light"[\s\S]*background: #ffffff;/);
  assert.match(html, /data-embed-transparent="true"[\s\S]*background: transparent;/);
});

test('landing sidebar populates curated and permissionless sections', () => {
  assert.match(source, /var permList = document\.getElementById\('tlp-perm-list'\);/);
  assert.match(source, /var permTokens = liveTokens\.filter\(function\(e\) \{ return e\[1\]\.launchpad === 'Curated'; \}\);/);
  assert.match(source, /permTokens\.map\(function\(e\) \{ return renderRow\(e\[0\], e\[1\]\); \}\)\.join\(''\)/);
  assert.match(source, /var permlessList = document\.getElementById\('tlp-permless-list'\);/);
  assert.match(source, /var permlessTokens = liveTokens\.filter\(function\(e\) \{ return e\[1\]\.launchpad === 'Permissionless'; \}\);/);
  assert.match(source, /permlessTokens\.map\(function\(e\) \{ return renderRow\(e\[0\], e\[1\]\); \}\)\.join\(''\)/);
});

test('buyback efficiency lookup accepts MTN route aliases', () => {
  const sandbox = loadHelpers(`
    CFG = { ticker: 'MTN' };
    result = {
      routeAlias: _buybackEfficiencyForToken({ tokens: { mtn: { totalUsdcSpent: 2500000.02 } } }, 'mtndao'),
      projectAlias: _buybackEfficiencyForToken({ tokens: { mtn: { totalUsdcSpent: 2500000.02 } } }, 'mtncapital'),
      canonical: _buybackEfficiencyForToken({ tokens: { mtn: { totalUsdcSpent: 2500000.02 } } }, 'mtn'),
      singleTokenFallback: _buybackEfficiencyForToken({ tokens: { mtn: { totalUsdcSpent: 2500000.02 } } }, 'legacy-route'),
      missing: _buybackEfficiencyForToken({ tokens: {} }, 'mtndao')
    };
  `);
  assert.equal(sandbox.result.routeAlias.totalUsdcSpent, 2500000.02);
  assert.equal(sandbox.result.projectAlias.totalUsdcSpent, 2500000.02);
  assert.equal(sandbox.result.canonical.totalUsdcSpent, 2500000.02);
  assert.equal(sandbox.result.singleTokenFallback.totalUsdcSpent, 2500000.02);
  assert.equal(sandbox.result.missing, null);
});

test('price chart does not synthesize flat history across missing ranges', () => {
  const sandbox = loadHelpers(`
    var candles = [{ time: 100, close: 1 }];
    var area = [{ time: 100, value: 1 }];
    var volume = [{ time: 100, value: 10 }];
    result = _fillCandleGaps(candles, area, volume);
  `);

  assert.equal(sandbox.result, undefined);
  assert.doesNotMatch(source, /function _buildLivePriceFallbackSeries/);
  assert.match(source, /_priceEnabled\s*&&\s*_showPriceLine\s*&&\s*_shouldAppendLivePricePoint\(\)/);
  assert.match(source, /if\s*\(\s*time < d\[0\]\.time \|\| time > d\[d\.length-1\]\.time\s*\)\s*return null/);
});

test('terminal graveyard dots stay static instead of rippling', () => {
  const sandbox = loadHelpers(`
    CFG = { live: true };
    var live = _shouldPulseLiveDots();
    CFG = { live: false };
    var inactive = _shouldPulseLiveDots();
    CFG = { live: true, graveyard: true };
    var graveyard = _shouldPulseLiveDots();
    CFG = { live: true, liquidatedAt: '2026-04-01' };
    var liquidated = _shouldPulseLiveDots();
    result = { live: live, inactive: inactive, graveyard: graveyard, liquidated: liquidated };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    live: true,
    inactive: false,
    graveyard: false,
    liquidated: false,
  });
  assert.match(source, /if \(shouldPulse && updateDue && !_isMetricChartMode\(\)\) \{/);
});

test('fresh active current NAV clears stale liquidation lifecycle state', () => {
  const sandbox = loadHelpers(`
    var stale = {
      live: false,
      graveyard: true,
      liquidatedAt: '2026-07-17T18:00:00Z',
      proposalFlag: { type: 'liquidation', state: 'pending' }
    };
    var active = _applyCurrentNavLifecycle(stale, { status: 'active', live: true });
    var retired = _applyCurrentNavLifecycle({}, {
      status: 'inactive',
      live: true,
      liquidatedAt: '2026-07-18T00:00:00Z'
    });
    result = { active: active, retired: retired };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    active: {
      live: true,
      graveyard: false,
      liquidatedAt: null,
      proposalFlag: null,
    },
    retired: {
      graveyard: true,
      liquidatedAt: '2026-07-18T00:00:00Z',
    },
  });
  assert.equal(source.includes('_applyCurrentNavLifecycle(lt, t);'), true);
  assert.equal(source.includes('_applyCurrentNavLifecycle(CFG, data);'), true);
});

test('proposal fetch includes inactive graveyard tokens', () => {
  assert.match(source, /\/api\/proposals\?token=' \+ encodeURIComponent\(_fetchTokenKey\) \+ '&includeInactive=1'/);
});

test('route helpers strip index.html and preserve clean query URLs', async () => {
  const { createRouteHelpers } = await import('../../src/shell/routes.js');
  const routes = createRouteHelpers({
    URLSearchParams,
    location: { pathname: '/index.html' },
  });

  assert.deepEqual({
    rootFromIndex: routes.appRootPath(),
    home: routes.homePageUrl(),
    token: routes.tokenPageUrl('nav'),
    launchpad: routes.launchpadPageUrl('curated'),
    emptyToken: routes.tokenPageUrl(''),
  }, {
    rootFromIndex: '/',
    home: '/',
    token: '/?token=nav&view=markets&tab=tokens',
    launchpad: '/?launchpad=curated',
    emptyToken: '/?token=solo&view=markets&tab=tokens',
  });
});

test('chart volume converts token volume to USD', () => {
  const sandbox = loadHelpers(`
    result = {
      computed: _candleVolumeUsd({ volume: 1000 }, 0.56),
      explicit: _candleVolumeUsd({ volume: 1000, volumeUsd: 42 }, 0.56),
      missingPrice: _candleVolumeUsd({ volume: 1000 }, 0)
    };
  `);

  assert.equal(sandbox.result.computed, 560);
  assert.equal(sandbox.result.explicit, 42);
  assert.equal(sandbox.result.missingPrice, 0);
});

test('monthly timeframe buckets align to calendar month starts', () => {
  const sandbox = loadHelpers(`
    result = {
      marchStart: _bucketStartForTf(Date.UTC(2026, 2, 15) / 1000, '1MO'),
      aprilNext: _nextBucketStartForTf(Date.UTC(2026, 3, 1) / 1000, '1MO'),
      marchPrev: _previousBucketStartForTf(Date.UTC(2026, 3, 1) / 1000, '1MO'),
      candles: _aggregateCandles([
        { time: Date.UTC(2026, 2, 15) / 1000, open: 1, high: 2, low: 1, close: 2, volume: 10 },
        { time: Date.UTC(2026, 2, 28) / 1000, open: 2, high: 3, low: 2, close: 3, volume: 5 },
        { time: Date.UTC(2026, 3, 10) / 1000, open: 4, high: 5, low: 4, close: 5, volume: 8 }
      ], 2592000, '1MO').map(function(c) { return { time: c.time, close: c.close, volume: c.volume }; })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    marchStart: Date.UTC(2026, 2, 1) / 1000,
    aprilNext: Date.UTC(2026, 4, 1) / 1000,
    marchPrev: Date.UTC(2026, 2, 1) / 1000,
    candles: [
      { time: Date.UTC(2026, 2, 1) / 1000, close: 3, volume: 15 },
      { time: Date.UTC(2026, 3, 1) / 1000, close: 5, volume: 8 },
    ],
  });
});

test('weekly timeframe buckets align to calendar week starts', () => {
  const sandbox = loadHelpers(`
    result = {
      weekStart: _bucketStartForTf(Date.UTC(2026, 3, 8) / 1000, '1W'),
      weekNext: _nextBucketStartForTf(Date.UTC(2026, 3, 6) / 1000, '1W'),
      weekPrev: _previousBucketStartForTf(Date.UTC(2026, 3, 6) / 1000, '1W'),
      candles: _aggregateCandles([
        { time: Date.UTC(2026, 3, 8) / 1000, open: 1, high: 2, low: 1, close: 2, volume: 10 },
        { time: Date.UTC(2026, 3, 10) / 1000, open: 2, high: 3, low: 2, close: 3, volume: 5 },
        { time: Date.UTC(2026, 3, 14) / 1000, open: 4, high: 5, low: 4, close: 5, volume: 8 }
      ], 604800, '1W').map(function(c) { return { time: c.time, close: c.close, volume: c.volume }; })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    weekStart: Date.UTC(2026, 3, 6) / 1000,
    weekNext: Date.UTC(2026, 3, 13) / 1000,
    weekPrev: Date.UTC(2026, 2, 30) / 1000,
    candles: [
      { time: Date.UTC(2026, 3, 6) / 1000, close: 3, volume: 15 },
      { time: Date.UTC(2026, 3, 13) / 1000, close: 5, volume: 8 },
    ],
  });
});

test('single-bucket higher timeframes get a flat anchor point for rendering', () => {
  const sandbox = loadHelpers(`
    result = {
      line: _padLineSeriesForSinglePoint([{ time: Date.UTC(2026, 3, 1) / 1000, value: 12.5 }], '1MO'),
      candles: _padCandleSeriesForSinglePoint([{ time: Date.UTC(2026, 3, 1) / 1000, open: 10, high: 13, low: 9, close: 12.5 }], '1MO'),
      volume: _padVolumeSeriesForSinglePoint([{ time: Date.UTC(2026, 3, 1) / 1000, value: 42, color: '#abc' }], '1MO'),
      preferred: _singlePointSeriesAnchorTime(Date.UTC(2026, 3, 1) / 1000, '1MO', Date.UTC(2026, 2, 15) / 1000)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    line: [
      { time: Date.UTC(2026, 2, 1) / 1000, value: 12.5 },
      { time: Date.UTC(2026, 3, 1) / 1000, value: 12.5 },
    ],
    candles: [
      { time: Date.UTC(2026, 2, 1) / 1000, open: 10, high: 13, low: 9, close: 12.5, price: 12.5 },
      { time: Date.UTC(2026, 3, 1) / 1000, open: 10, high: 13, low: 9, close: 12.5 },
    ],
    volume: [
      { time: Date.UTC(2026, 2, 1) / 1000, value: 0, color: '#abc' },
      { time: Date.UTC(2026, 3, 1) / 1000, value: 42, color: '#abc' },
    ],
    preferred: Date.UTC(2026, 2, 15) / 1000,
  });
});

test('single-bucket line anchors can preserve ICO start value', () => {
  const sandbox = loadHelpers(`
    result = {
      explicitValue: _singlePointSeriesAnchorValue(12.5, 10),
      fallbackValue: _singlePointSeriesAnchorValue(12.5, NaN),
      line: _padLineSeriesForSinglePoint([{ time: Date.UTC(2026, 3, 1) / 1000, value: 12.5 }], '1MO', null, 10)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    explicitValue: 10,
    fallbackValue: 12.5,
    line: [
      { time: Date.UTC(2026, 2, 1) / 1000, value: 10 },
      { time: Date.UTC(2026, 3, 1) / 1000, value: 12.5 },
    ],
  });
});

test('launch tracking keeps coarse weekly and monthly NAV in the launch bucket', () => {
  const sandbox = loadHelpers(`
    var launchTs = Date.UTC(2025, 10, 18, 19, 30, 24) / 1000;
    result = {
      weeklyLaunchBucket: _launchBucketStartForTf(launchTs, '1W'),
      monthlyLaunchBucket: _launchBucketStartForTf(launchTs, '1MO'),
      weeklyTracked: _navHistoryStartsFromLaunch([
        { time: Date.UTC(2025, 10, 17) / 1000, value: 0.8 },
        { time: Date.UTC(2025, 10, 24) / 1000, value: 0.82 }
      ], launchTs, '1W'),
      monthlyTracked: _navHistoryStartsFromLaunch([
        { time: Date.UTC(2025, 10, 1) / 1000, value: 0.8 },
        { time: Date.UTC(2025, 11, 1) / 1000, value: 0.82 }
      ], launchTs, '1MO'),
      lateWeekly: _navHistoryStartsFromLaunch([
        { time: Date.UTC(2025, 10, 24) / 1000, value: 0.82 }
      ], launchTs, '1W')
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    weeklyLaunchBucket: Date.UTC(2025, 10, 17) / 1000,
    monthlyLaunchBucket: Date.UTC(2025, 10, 1) / 1000,
    weeklyTracked: true,
    monthlyTracked: true,
    lateWeekly: false,
  });
});

test('tracked NAV launch point snaps to the same first plotted price point', () => {
  const sandbox = loadHelpers(`
    result = {
      sameBucket: _alignTrackedNavLaunchPoint([
        { time: Date.UTC(2025, 10, 17) / 1000, value: 0.80385 },
        { time: Date.UTC(2025, 10, 24) / 1000, value: 0.82 }
      ], [
        { time: Date.UTC(2025, 10, 17) / 1000, value: 0.8 },
        { time: Date.UTC(2025, 10, 24) / 1000, value: 0.91 }
      ], 0.8),
      missingStart: _alignTrackedNavLaunchPoint([
        { time: Date.UTC(2025, 10, 24) / 1000, value: 0.82 }
      ], [
        { time: Date.UTC(2025, 10, 17) / 1000, value: 0.8 },
        { time: Date.UTC(2025, 10, 24) / 1000, value: 0.91 }
      ], 0.8)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    sameBucket: [
      { time: Date.UTC(2025, 10, 17) / 1000, value: 0.8 },
      { time: Date.UTC(2025, 10, 24) / 1000, value: 0.82 },
    ],
    missingStart: [
      { time: Date.UTC(2025, 10, 17) / 1000, value: 0.8 },
      { time: Date.UTC(2025, 10, 24) / 1000, value: 0.82 },
    ],
  });
});

test('documented ARL launch NAV remains distinct from its listing price', () => {
  const preTgeDay = Date.parse('2026-06-23T00:00:00Z') / 1000;
  const launchDay = Date.parse('2026-06-24T00:00:00Z') / 1000;
  const sandbox = loadHelpers(`
    result = _alignTrackedNavLaunchPoint([
      { time: ${preTgeDay}, value: 0.0009174312248734968, syntheticPreTgeNav: true },
      { time: ${launchDay}, value: 0.0010385670467292958 },
      { time: ${launchDay + 86400}, value: 0.0009942026101369932 }
    ], [
      { time: ${preTgeDay}, value: 0.001 },
      { time: ${launchDay}, value: 0.00499 },
      { time: ${launchDay + 86400}, value: 0.00355415785809758 }
    ], 0.001);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: preTgeDay, value: 0.0009174312248734968, syntheticPreTgeNav: true },
    { time: launchDay, value: 0.0010385670467292958 },
    { time: launchDay + 86400, value: 0.0009942026101369932 },
  ]);
});

test('ARL pre-TGE NAV marker defines the price and NAV chart anchor', () => {
  const preTgeDay = Date.parse('2026-06-23T00:00:00Z') / 1000;
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    tokenKey = 'arl';
    CFG = { icoPrice: 0.001, launchDate: '2026-06-24T19:45:35Z' };
    _syntheticIcoTs = 0;
    _navHistory = [
      { time: ${preTgeDay}, nav: 0.0009174312248734968, syntheticPreTgeNav: true },
      { time: ${preTgeDay + 86400}, nav: 0.0010385670467292958 }
    ];
    result = _icoLaunchTs();
  `);

  assert.equal(sandbox.result, preTgeDay);
});

test('visible range starts at the first real candle when history is shorter than the window', () => {
  const sandbox = loadHelpers(`
    result = {
      shortWeekly: _visibleRangeStartTs(1763337600, 1775433600, 104, 604800),
      shortDaily: _visibleRangeStartTs(1775779200, 1775882700, 0, 86400),
      longWindow: _visibleRangeStartTs(1763337600, 1775433600, 4, 604800),
      fullWeekly: _showEntireSeriesInDefaultView(21, 104),
      fullDaily: _showEntireSeriesInDefaultView(3, 0),
      partialHourly: _showEntireSeriesInDefaultView(300, 168)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    shortWeekly: 1763337600,
    shortDaily: 1775779200,
    longWindow: 1773014400,
    fullWeekly: true,
    fullDaily: true,
    partialHourly: false,
  });
});

test('logical range clamp keeps at least one real price bar visible without changing zoom width', () => {
  const sandbox = loadHelpers(`
    result = {
      unchanged: _clampLogicalRangeToActualBounds({ from: 20, to: 40 }, { firstIndex: 30, lastIndex: 90 }),
      leftClamp: _clampLogicalRangeToActualBounds({ from: -12, to: 8 }, { firstIndex: 30, lastIndex: 90 }),
      rightClamp: _clampLogicalRangeToActualBounds({ from: 110, to: 130 }, { firstIndex: 30, lastIndex: 90 }),
      preservesWidth: (function() {
        var src = { from: 105, to: 125 };
        var out = _clampLogicalRangeToActualBounds(src, { firstIndex: 30, lastIndex: 90 });
        return { before: src.to - src.from, after: out.to - out.from };
      })(),
      explicitBounds: _clampLogicalRangeToActualBounds({ from: 55, to: 75 }, { firstIndex: 60, lastIndex: 120 }),
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    unchanged: { from: 20, to: 40 },
    leftClamp: { from: 9, to: 29 },
    rightClamp: { from: 91, to: 111 },
    preservesWidth: { before: 20, after: 20 },
    explicitBounds: { from: 55, to: 75 },
  });
});

test('ICO is folded into the first visible weekly bucket instead of creating a prior week', () => {
  assert.equal(source.includes("areaData.unshift({ time: preTradePrice, value: CFG.icoPrice });"), false);
  assert.equal(source.includes("candleData.unshift({ time: preTradePrice, open: CFG.icoPrice, high: CFG.icoPrice, low: CFG.icoPrice, close: CFG.icoPrice });"), false);
  assert.equal(source.includes('firstCandle.open = CFG.icoPrice;'), true);
});

test('weekly aggregation keeps the ICO price as the launch-week open', () => {
  const sandbox = loadHelpers(`
    CFG = { spot: 0.5, icoPrice: 0.8, launchDate: '2025-11-18' };
    result = _foldIcoIntoLaunchBucket(_aggregateCandles([
      { time: Date.UTC(2025, 10, 18) / 1000, open: 0.912012316314107, high: 1.01, low: 0.74, close: 0.747469975868506, volume: 10 },
      { time: Date.UTC(2025, 10, 19) / 1000, open: 0.75, high: 0.99, low: 0.7, close: 0.83, volume: 5 },
      { time: Date.UTC(2025, 10, 24) / 1000, open: 0.83, high: 1.1, low: 0.82, close: 1.08316220331544, volume: 8 }
    ], 604800, '1W'), '1W', 604800).map(function(c) {
      return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    {
      time: Date.UTC(2025, 10, 17) / 1000,
      open: 0.8,
      high: 1.01,
      low: 0.7,
      close: 0.83,
    },
    {
      time: Date.UTC(2025, 10, 24) / 1000,
      open: 0.83,
      high: 1.1,
      low: 0.82,
      close: 1.08316220331544,
    },
  ]);
});

test('synthetic ICO timestamp wins over date-only launchDate for daily bucketing', () => {
  const sandbox = loadHelpers(`
    CFG = { spot: 0.35, icoPrice: 0.35, launchDate: '2025-10-18' };
    _syntheticIcoTs = Date.UTC(2025, 9, 17, 23, 59, 59) / 1000;
    result = _foldIcoIntoLaunchBucket([
      { time: Date.UTC(2025, 9, 17) / 1000, open: 0.41, high: 0.43, low: 0.34, close: 0.39, volume: 10 },
      { time: Date.UTC(2025, 9, 18) / 1000, open: 0.39, high: 0.44, low: 0.38, close: 0.4, volume: 8 }
    ], '1D', 86400).map(function(c) {
      return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
    });
  `, { _syntheticIcoTs: 0 });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    {
      time: Date.UTC(2025, 9, 17) / 1000,
      open: 0.35,
      high: 0.43,
      low: 0.34,
      close: 0.39,
    },
    {
      time: Date.UTC(2025, 9, 18) / 1000,
      open: 0.39,
      high: 0.44,
      low: 0.38,
      close: 0.4,
    },
  ]);
});

test('launch marker uses exact configured timestamp when hourly data is bucketed', () => {
  const sandbox = loadHelpers(`
    var fallbackBucket = Date.UTC(2025, 10, 18, 19, 0, 0) / 1000;
    CFG = { launchDate: '2025-11-18T19:30:24Z' };
    var exact = _launchMarkerDisplayTime(fallbackBucket);
    var configured = _configuredLaunchDateTs();
    CFG = { launchDate: '2025-11-18' };
    var dateOnly = _launchMarkerDisplayTime(fallbackBucket);
    CFG = { launchDate: 'not-a-date' };
    var invalid = _launchMarkerDisplayTime(fallbackBucket);
    result = { exact: exact, configured: configured, dateOnly: dateOnly, invalid: invalid };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    exact: Date.UTC(2025, 10, 18, 19, 30, 24) / 1000,
    configured: Date.UTC(2025, 10, 18, 19, 30, 24) / 1000,
    dateOnly: Date.UTC(2025, 10, 18, 19, 0, 0) / 1000,
    invalid: Date.UTC(2025, 10, 18, 19, 0, 0) / 1000,
  });
});

test('migration launch tokens do not use ownership ICO anchors', () => {
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    CFG = { icoPrice: 0.003036, launchDate: '2026-02-14T19:15:42Z' };
    tokenKey = 'faf';
    var fafConfigured = Date.parse('2026-02-14T19:15:42Z') / 1000;
    var faf = {
      migration: _isMigrationLaunchTokenKey(),
      ownershipIco: _usesOwnershipLaunchIco(),
      migrationPriceStart: _usesMigrationPriceStart(),
      migrationPriceStartTime: _migrationPriceStartTime(),
      anchorValue: _launchAnchorValue(),
      icoTs: _icoLaunchTs(),
      launchTs: _launchAnchorTs()
    };
    CFG = { icoPrice: 0.02, launchDate: '2026-05-15T12:00:09Z' };
    tokenKey = 'rawr';
    var ownership = {
      migration: _isMigrationLaunchTokenKey(),
      ownershipIco: _usesOwnershipLaunchIco(),
      migrationPriceStart: _usesMigrationPriceStart(),
      migrationPriceStartTime: _migrationPriceStartTime(),
      anchorValue: _launchAnchorValue(),
      icoTs: _icoLaunchTs(),
      launchTs: _launchAnchorTs()
    };
    CFG = { icoPrice: 0.02, launchDate: '2026-05-15' };
    tokenKey = 'rawr';
    var ownershipDateOnly = {
      icoTs: _icoLaunchTs(),
      launchTs: _launchAnchorTs()
    };
    result = { fafConfigured: fafConfigured, faf: faf, ownership: ownership, ownershipDateOnly: ownershipDateOnly };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    fafConfigured: Date.parse('2026-02-14T19:15:42Z') / 1000,
    faf: {
      migration: true,
      ownershipIco: false,
      migrationPriceStart: true,
      migrationPriceStartTime: Date.parse('2026-02-14T19:15:42Z') / 1000,
      anchorValue: 0,
      icoTs: 0,
      launchTs: 0,
    },
    ownership: {
      migration: false,
      ownershipIco: true,
      migrationPriceStart: false,
      migrationPriceStartTime: 0,
      anchorValue: 0.02,
      icoTs: Date.parse('2026-05-15T12:00:09Z') / 1000,
      launchTs: Date.parse('2026-05-15T12:00:09Z') / 1000,
    },
    ownershipDateOnly: {
      icoTs: Date.parse('2026-05-14T00:00:00Z') / 1000,
      launchTs: Date.parse('2026-05-14T00:00:00Z') / 1000,
    },
  });
});

test('migration launch price and NAV markers avoid ownership ICO alignment', () => {
  assert.match(source, /if \(!_usesOwnershipLaunchIco\(\) && areaData\.length > 0\)/);
  assert.match(source, /areaData\[0\]\.value = startMarkerValue/);
  assert.match(source, /var migrationPriceStartTime = _migrationPriceStartTime\(\);/);
  assert.match(source, /areaData\[0\]\.time = migrationPriceStartTime/);
  assert.match(source, /if \(_trackedFromLaunch && _usesOwnershipLaunchIco\(\) && areaData\.length > 0\)/);
  assert.match(source, /if \(!_isMetricChartMode\(\) && _usesOwnershipLaunchIco\(\) && launchMarkerTime > 0 && launchMarkerValue > 0\)/);
  assert.match(source, /if \(!_isMetricChartMode\(\) && !_launchNavMarkerPoint && _usesMigrationPriceStart\(\) && showHistoric && navSolidData\.length > 0\)/);
});

test('migration launch price marker uses configured start price', () => {
  const sandbox = loadHelpers(`
    CFG = { icoPrice: 0.003036 };
    tokenKey = 'faf';
    var migrationValue = _priceStartMarkerValue({ open: 0.0027, close: 0.0027 }, 0.0027);
    tokenKey = 'rawr';
    var ownershipValue = _priceStartMarkerValue({ open: 0.02, close: 0.03 }, 0.03);
    tokenKey = 'meta';
    CFG = { icoPrice: 0 };
    var metaValue = _priceStartMarkerValue({ open: 0.001, close: 0.0012 }, 0.0012);
    result = { migrationValue: migrationValue, ownershipValue: ownershipValue, metaValue: metaValue };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    migrationValue: 0.003036,
    ownershipValue: 0.03,
    metaValue: 0.0012,
  });
});

test('FAF migration NAV start uses first FutAMM funding state', () => {
  const sandbox = loadHelpers(`
    CFG = { icoPrice: 0.003036 };
    tokenKey = 'faf';
    var seed = _migrationNavStartSeed();
    var startTime = _migrationNavStartTime();
    var nav = _migrationNavStartValue();
    tokenKey = 'rawr';
    var nonMigrationTime = _migrationNavStartTime();
    var nonMigrationNav = _migrationNavStartValue();
    result = {
      seed: seed,
      startTime: startTime,
      nonMigrationTime: nonMigrationTime,
      nav: nav,
      nonMigrationNav: nonMigrationNav
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.seed)), {
    fundingUSDC: 50000,
    timestamp: '2026-02-14T19:15:42Z',
    startPrice: 0.003036,
    totalSupply: 999997699,
  });
  assert.equal(sandbox.result.startTime, Date.parse('2026-02-14T19:15:42Z') / 1000);
  assert.equal(sandbox.result.nonMigrationTime, 0);
  assert.equal(Number(sandbox.result.nav.toFixed(15)), 0.000050837359391);
  assert.equal(sandbox.result.nonMigrationNav, 0);
  assert.match(source, /var migrationNavStartValue = _migrationNavStartValue\(\);/);
  assert.match(source, /var migrationNavStartTime = _migrationNavStartTime\(\);/);
  assert.match(source, /navSolidData\[0\] = \{ time: migrationNavStartTime, value: migrationNavStartValue \};/);
});

test('launch marker x coordinate interpolates inside hourly buckets', () => {
  const sandbox = loadHelpers(`
    var bucket = Date.UTC(2025, 10, 18, 19, 0, 0) / 1000;
    var exact = Date.UTC(2025, 10, 18, 19, 30, 24) / 1000;
    _lwPriceCache = [
      { time: bucket, value: 0.8 },
      { time: bucket + 3600, value: 1.1 }
    ];
    _lwChart = {
      timeScale: function() {
        return {
          timeToCoordinate: function(time) {
            if (time === bucket) return 100;
            if (time === bucket + 3600) return 160;
            return null;
          }
        };
      }
    };
    result = {
      interpolated: _chartInterpolatedTimeCoordinate(exact, _lwPriceCache),
      direct: _chartInterpolatedTimeCoordinate(bucket + 3600, _lwPriceCache),
      outside: _chartInterpolatedTimeCoordinate(bucket - 1, _lwPriceCache)
    };
  `, { _lwPriceCache: [], _lwChart: null });

  assert.equal(Number(sandbox.result.interpolated.toFixed(6)), 130.4);
  assert.equal(sandbox.result.direct, 160);
  assert.equal(sandbox.result.outside, null);
  assert.equal(source.includes('var xTime = Number(point.xTime || point.time);'), true);
  assert.equal(source.includes('_launchPriceMarkerPoint = { time: launchMarkerTime, xTime: launchMarkerXTime'), true);
});

test('daily nav sanitization keeps synthetic ICO row when next row is same local day but next UTC bucket', () => {
  const sandbox = loadHelpers(`
    CFG = {
      nav: 0.41,
      historyQuality: { recommendedHistoricalResolution: '1D' }
    };
    result = _sanitizeNavRows([
      { ts: Date.parse('2025-10-18T17:00:17Z') / 1000, nav: 0.35, synthetic_ico: true },
      { ts: Date.parse('2025-10-19T00:00:00Z') / 1000, nav: 0.41 }
    ]).map(function(row) {
      return { ts: row.ts, nav: row.nav, synthetic_ico: row.synthetic_ico === true };
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    {
      ts: Date.parse('2025-10-18T17:00:17Z') / 1000,
      nav: 0.35,
      synthetic_ico: true,
    },
    {
      ts: Date.parse('2025-10-19T00:00:00Z') / 1000,
      nav: 0.41,
      synthetic_ico: false,
    },
  ]);
});

test('daily nav sanitization drops same-day live tail even when recommended history is hourly', () => {
  const sandbox = loadHelpers(`
    CFG = {
      nav: 0.752963,
      historyQuality: { recommendedHistoricalResolution: '1H' }
    };
    result = _sanitizeNavRows([
      { ts: Date.parse('2026-04-15T00:00:00Z') / 1000, nav: 0.752594 },
      { ts: Date.parse('2026-04-15T03:30:00Z') / 1000, nav: 0.752963, live_tail: true }
    ], '1D').map(function(row) {
      return { ts: row.ts, nav: row.nav, live_tail: row.live_tail === true };
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    {
      ts: Date.parse('2026-04-15T03:30:00Z') / 1000,
      nav: 0.752963,
      live_tail: true,
    },
  ]);
});

test('current-nav pruning retains an exact pre-TGE and activation pair in the first daily bucket', () => {
  const anchor = Date.parse('2026-07-17T18:59:58.000Z') / 1000;
  const activation = Date.parse('2026-07-17T19:00:27.000Z') / 1000;
  const sandbox = loadHelpers(`
    CFG = {
      nav: 0.400332,
      snapshotTime: '2026-07-17T19:00:27.000Z',
      historyQuality: { recommendedHistoricalResolution: '1D' }
    };
    _navHistory = [
      { time: ${anchor}, nav: 0.4, spot: 0.4, synthetic_ico: true },
      { time: ${activation}, nav: 0.400332, spot: 0.42389 }
    ];
    _navHistoryByTF = { '1D': _navHistory.slice() };
    _lwTreasuryHistory = [
      { time: ${anchor}, treasury: 4000000, effSupply: 10000000 },
      { time: ${activation}, treasury: 4034583, effSupply: 10078091 }
    ];
    _treasuryHistoryByTF = { '1D': _lwTreasuryHistory.slice() };
    _navHistoryIgnoresSnapshotByTF = {};
    _pruneNavCachesToSnapshot();
    result = {
      active: _navHistory.map(function(row) { return [row.time, row.nav]; }),
      cached: _navHistoryByTF['1D'].map(function(row) { return [row.time, row.nav]; })
    };
  `, {
    _fallbackTF: (tf) => tf,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    active: [[anchor, 0.4], [activation, 0.400332]],
    cached: [[anchor, 0.4], [activation, 0.400332]],
  });
});

test('NAV sanitization uses explicit current-nav context instead of mutable CFG timing', () => {
  const sandbox = loadHelpers(`
    var rows = [
      { ts: Date.parse('2026-04-15T00:00:00Z') / 1000, nav: 0.752594 },
      { ts: Date.parse('2026-04-15T03:30:00Z') / 1000, nav: 0.752963, live_tail: true }
    ];
    var context = {
      liveNav: 0.752963,
      recommendedHistoricalResolution: '1H',
      resolutionTf: '1D'
    };
    CFG = { nav: 0, historyQuality: { recommendedHistoricalResolution: '1D' } };
    result = {
      beforeCurrentNav: _sanitizeNavRows(rows, '1D', context).map(function(row) {
        return { ts: row.ts, nav: row.nav, live_tail: row.live_tail === true };
      })
    };
    CFG = { nav: 9, historyQuality: { recommendedHistoricalResolution: '1D' } };
    result.afterCurrentNavMutation = _sanitizeNavRows(rows, '1D', context).map(function(row) {
      return { ts: row.ts, nav: row.nav, live_tail: row.live_tail === true };
    });
  `);

  const expected = [
    {
      ts: Date.parse('2026-04-15T03:30:00Z') / 1000,
      nav: 0.752963,
      live_tail: true,
    },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    beforeCurrentNav: expected,
    afterCurrentNavMutation: expected,
  });
});

test('sparse history appends current NAV tail from current snapshot', () => {
  const sandbox = loadHelpers(`
    CFG = {
      live: true,
      nav: 0.020699,
      navVerified: true,
      snapshotTime: '2026-05-15T18:00:00.000Z',
      historyQuality: { recommendedHistoricalResolution: '1D' }
    };
    var context = _navHistoryProcessingContext('1D');
    result = _appendCurrentNavHistoryTail([
      { time: Date.parse('2026-05-15T00:00:00Z') / 1000, nav: 0.02 }
    ], '1D', context).map(function(row) {
      return { time: row.time, nav: row.nav, live_tail: row.live_tail === true };
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    {
      time: Date.parse('2026-05-15T18:00:00Z') / 1000,
      nav: 0.020699,
      live_tail: true,
    },
  ]);
});

test('paired daily snapshot is not replaced by a same-day live NAV tail', () => {
  const sandbox = loadHelpers(`
    CFG = {
      live: true,
      nav: 0.115,
      spot: 0.14,
      navVerified: true,
      snapshotTime: '2026-07-15T00:00:00.000Z',
      historyQuality: { recommendedHistoricalResolution: '1D' },
      navSnapshot: {
        status: 'verified',
        timestamp: '2026-07-15T00:10:00.000Z',
        treasuryUSDC: 110000,
        navPerToken: 0.11,
        supply: { effective: 1000000, onChain: 1000000, circulating: 1000000 },
        treasury: { reportedUSDC: 110000, components: [] },
        market: { spot: 0.131 }
      }
    };
    var context = _navHistoryProcessingContext('1D');
    result = _appendCurrentNavHistoryTail([
      { time: Date.parse('2026-07-15T00:00:00Z') / 1000, nav: 0.11, spot: 0.131 }
    ], '1D', context).map(function(row) {
      return { time: row.time, nav: row.nav, spot: row.spot, live_tail: row.live_tail === true };
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    {
      time: Date.parse('2026-07-15T00:00:00Z') / 1000,
      nav: 0.11,
      spot: 0.131,
      live_tail: false,
    },
  ]);
});

test('FutAMM-derived NAV history ignores stale current snapshot cutoff', () => {
  const sandbox = loadHelpers(`
    CFG = {
      live: true,
      nav: 0.00027,
      navVerified: true,
      snapshotTime: '2026-04-05T00:00:00.000Z',
      historyQuality: { recommendedHistoricalResolution: '1D' }
    };
    var context = _navHistoryProcessingContext('1D', { ignoreSnapshotCutoff: true });
    var rows = [
      { time: Date.parse('2026-02-14T19:15:42Z') / 1000, nav: 0.00005083735939097635 },
      { time: Date.parse('2026-04-05T00:00:00Z') / 1000, nav: 0.000270015135905909 },
      { time: Date.parse('2026-06-27T00:00:00Z') / 1000, nav: 0.00042 }
    ];
    var pruned = _pruneRowsToSnapshot(rows, 'time', _snapshotCutoffTimeForNavContext(context));
    var tailed = _appendCurrentNavHistoryTail(_sanitizeNavRows(pruned, '1D', context), '1D', context);
    result = {
      count: tailed.length,
      lastTime: tailed[tailed.length - 1].time,
      hasStaleTail: tailed.some(function(row) { return row.live_tail === true; })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    count: 3,
    lastTime: Date.parse('2026-06-27T00:00:00Z') / 1000,
    hasStaleTail: false,
  });
});

test('FutAMM-derived NAV history appends calculated current NAV tail when current row is derived', () => {
  const sandbox = loadHelpers(`
    CFG = {
      live: true,
      nav: 0.000783,
      navVerified: true,
      snapshotTime: '2026-07-09T00:01:25.000Z',
      snapshotType: 'futamm_derived_current',
      currentNavStatus: 'futamm_derived_current',
      historyQuality: { recommendedHistoricalResolution: '1D' }
    };
    var context = _navHistoryProcessingContext('1D', {
      ignoreSnapshotCutoff: true,
      allowFutAmmCurrentTail: true
    });
    var rows = [
      { time: Date.parse('2026-07-08T00:00:00Z') / 1000, nav: 0.0007840431599001583 },
      { time: Date.parse('2026-07-09T00:00:00Z') / 1000, nav: 0.00078318228378497 }
    ];
    var tailed = _appendCurrentNavHistoryTail(_sanitizeNavRows(rows, '1D', context), '1D', context);
    result = {
      count: tailed.length,
      lastTime: tailed[tailed.length - 1].time,
      lastNav: tailed[tailed.length - 1].nav,
      hasCurrentTail: tailed[tailed.length - 1].live_tail === true
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    count: 2,
    lastTime: Date.parse('2026-07-09T00:01:25Z') / 1000,
    lastNav: 0.000783,
    hasCurrentTail: true,
  });
});

test('chart NAV assembly uses derived-history flag before applying snapshot cutoff', () => {
  const sandbox = loadHelpers(`
    CFG = { historyQuality: { recommendedHistoricalResolution: '1D' } };
    _chartTF = '1D';
    _navHistoryIgnoresSnapshotByTF = { '1D': true };
    result = {
      ignores: _navHistoryIgnoresSnapshotCutoffForTF('1D'),
      sourceUsesFlag: SOURCE_HAS_DERIVED_NAV_CHART_CUTOFF
    };
  `, {
    SOURCE_HAS_DERIVED_NAV_CHART_CUTOFF: source.includes("var navIgnoresSnapshotCutoff = _navHistoryIgnoresSnapshotCutoffForTF(_chartTF);")
      && source.includes("var cutoff = navIgnoresSnapshotCutoff ? 0 : _getSnapshotCutoffSec();")
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    ignores: true,
    sourceUsesFlag: true,
  });
});

test('tracked launch NAV keeps current same-day bucket instead of overwriting it with ICO NAV', () => {
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    CFG = { live: true, nav: 0.020699, icoPrice: 0.02 };
    result = _alignTrackedNavLaunchPoint([
      { time: Date.parse('2026-05-15T00:00:00Z') / 1000, value: 0.020699 }
    ], [
      { time: Date.parse('2026-05-15T00:00:00Z') / 1000, value: 0.041 }
    ], 0.02);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: Date.parse('2026-05-14T00:00:00Z') / 1000, value: 0.02 },
    { time: Date.parse('2026-05-15T00:00:00Z') / 1000, value: 0.020699 },
  ]);
});

test('fee history preserves USD readings instead of repricing tokens at spot', () => {
  const sandbox = loadHelpers(`
    var entry = _normalizeFeeRow({ time: 123, cumFeeTokens: 200000, cumFeeUsdc: 125000 });
    result = {
      entry: entry,
      usd: _feeEntryUsd(entry),
      fallbackUsd: _feeEntryUsd({ time: 124, cumFeeTokens: 1000, cumFeeUsdc: 0 })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.entry)), {
    time: 123,
    cumFeeTokens: 200000,
    cumFeeUsdc: 125000,
  });
  assert.equal(sandbox.result.usd, 125000);
  assert.equal(sandbox.result.fallbackUsd, 500);
});

test('claim-only fee history sources are unavailable for display', () => {
  const sandbox = loadHelpers(`
    var claimPool = _displayableFeePool({
      method: 'claim_window_even',
      data: [{ time: 100, cumFeeTokens: 10 }]
    });
    var mixedPool = _displayableFeePool({
      method: 'exact',
      data: [
        { time: 100, cumFeeTokens: 10, source: 'claim' },
        { time: 200, cumFeeTokens: 15, source: 'volume_accrual' }
      ]
    });
    result = {
      topLevelClaim: _feeObjectHasClaimOnlySource({ method: 'claim_window_even' }),
      claimOnlyFlag: _feeObjectHasClaimOnlySource({ claimOnly: true }),
      spread: _feeObjectHasClaimOnlySource({ source: 'spread' }),
      exact: _feeObjectHasClaimOnlySource({ method: 'exact' }),
      claimPool: claimPool,
      mixedPool: mixedPool
    };
  `);

  assert.equal(sandbox.result.topLevelClaim, true);
  assert.equal(sandbox.result.claimOnlyFlag, true);
  assert.equal(sandbox.result.spread, true);
  assert.equal(sandbox.result.exact, false);
  assert.equal(sandbox.result.claimPool, null);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.mixedPool)), {
    method: 'exact',
    data: [{ time: 200, cumFeeTokens: 15, source: 'volume_accrual' }],
  });
});

test('fee snapshots do not fall back to claimed totals from current nav', () => {
  const sandbox = loadHelpers(`
    var _feeHistory = [];
    CFG = {
      spot: 2,
      fees: {
        futammClaimed: { tokens: 100 },
        meteoraClaimed: [{ totalTokens: 50, totalUsdc: 25 }],
        totalCumConfirmed: { usdc: 999 }
      },
      futAmmUnclaimedFeeTokens: 10,
      meteoraMdaoLpFeeUSDC: 75
    };
    var empty = {
      snapshot: _feeSnapshot(),
      breakdown: _feeSnapshotBreakdown(),
      tokens: _feeSnapshotBreakdownTokens()
    };
    _USE_FEE_HISTORY_FOR_PUBLIC_DISPLAY = true;
    _feeHistory = [{ time: 100, cumFeeTokens: 10, cumFeeUsdc: 25, cumFeeTokensFut1: 4, cumFeeUsdcFut1: 8 }];
    var canonical = {
      snapshot: _feeSnapshot(),
      breakdown: _feeSnapshotBreakdown(),
      tokens: _feeSnapshotBreakdownTokens()
    };
    result = { empty: empty, canonical: canonical };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.empty)), {
    snapshot: 0,
    breakdown: { total: 0, fut1: 0, met1: 0 },
    tokens: null,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.canonical)), {
    snapshot: 25,
    breakdown: { total: 25, fut1: 8, met1: 0 },
    tokens: null,
  });
});

test('fee period changes prefer historical USD deltas', () => {
  const sandbox = loadHelpers(`
    _USE_FEE_HISTORY_FOR_PUBLIC_DISPLAY = true;
    var _feeHistory = [
      { time: 100, cumFeeTokens: 1000, cumFeeUsdc: 1200 },
      { time: 200, cumFeeTokens: 2000, cumFeeUsdc: 2500 }
    ];
    result = _feeChange(50);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), { tokens: 1000, usd: 1300 });
});

test('sparse daily NAV history does not fill missing buckets', () => {
  const sandbox = loadHelpers(`
    var _chartTF = '1D';
    result = _bucketRealNavSnapshots([
      { time: 86400, value: 0.8 },
      { time: 86400 * 4, value: 0.7 }
    ]);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: 86400, value: 0.8 },
    { time: 86400 * 4, value: 0.7 },
  ]);
});

test('daily ARL NAV keeps pre-TGE, launch-day, and next-day points evenly spaced', () => {
  const preTge = 1782172800;
  const launchClose = 1782259200;
  const nextDay = 1782345600;
  const sandbox = loadHelpers(`
    var _chartTF = '1D';
    result = _bucketRealNavSnapshots([
      { time: ${preTge}, value: 0.0009174312248734968, source: 'pre_tge_nav_anchor', syntheticPreTgeNav: true },
      { time: ${launchClose}, value: 0.0010385670467292958, source: 'futamm_price_derived' },
      { time: ${nextDay}, value: 0.0011736160306304835, source: 'futamm_price_derived' }
    ]);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: preTge, value: 0.0009174312248734968, syntheticPreTgeNav: true },
    { time: launchClose, value: 0.0010385670467292958 },
    { time: nextDay, value: 0.0011736160306304835 },
  ]);
});

test('pre-TGE NAV and price anchors extend the chart range together', () => {
  const preTge = 1782172800;
  const launchClose = 1782259200;
  const sandbox = loadHelpers(`
    var _chartTF = '1D';
    tokenKey = 'arl';
    _navHistory = [{ time: ${preTge}, nav: 0.0009174312248734968, source: 'pre_tge_nav_anchor', syntheticPreTgeNav: true }];
    result = {
      allow: _allowNavOutsidePriceRange(),
      range: _chartRangeDataForSeries(
        [
          { time: ${preTge}, value: 0.001 },
          { time: ${launchClose}, value: 0.00499 }
        ],
        [
          { time: ${preTge}, value: 0.0009174312248734968, syntheticPreTgeNav: true },
          { time: ${launchClose}, value: 0.0010385670467292958 }
        ]
      )
    };
  `);

  assert.equal(sandbox.result.allow, true);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.range)), [
    { time: preTge, value: 1 },
    { time: launchClose, value: 1 },
  ]);
});

test('hourly NAV display inserts whitespace over large missing spans', () => {
  const sandbox = loadHelpers(`
    var _chartTF = '1H';
    result = _insertLineGapBreaks([
      { time: 0, value: 0.8 },
      { time: 3600, value: 0.81 },
      { time: 18000, value: 0.7 }
    ], '1H');
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: 0, value: 0.8 },
    { time: 3600, value: 0.81 },
    { time: 7200 },
    { time: 14400 },
    { time: 18000, value: 0.7 },
  ]);
});

test('hourly NAV lookup does not interpolate across stale gaps', () => {
  const sandbox = loadHelpers(`
    var _chartTF = '1H';
    var _chartMode = 'price';
    var _navPerToken = 0;
    var _lwNavHistory = [
      { time: 3600, value: 0.81 },
      { time: 18000, value: 0.7 }
    ];
    var _lwTreasuryHistory = [
      { time: 3600, treasury: 100, effSupply: 1000 },
      { time: 18000, treasury: 90, effSupply: 1000 }
    ];
    CFG = { treasuryUSDC: 999, effectiveSupply: 999 };
    result = {
      exactStart: _lwNavLookup(3600),
      insideGap: _lwNavLookup(7200),
      exactEnd: _lwNavLookup(18000),
      staleTreasury: _lwTreasuryLookup(7200),
      endTreasury: _lwTreasuryLookup(18000)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    exactStart: 0.81,
    insideGap: null,
    exactEnd: 0.7,
    staleTreasury: { time: 3600, treasury: 100, effSupply: 1000 },
    endTreasury: { time: 18000, treasury: 90, effSupply: 1000 },
  });
});

test('monthly NAV history buckets to real month starts', () => {
  const sandbox = loadHelpers(`
    var _chartTF = '1MO';
    result = _bucketRealNavSnapshots([
      { time: Date.UTC(2026, 2, 15) / 1000, value: 0.8 },
      { time: Date.UTC(2026, 3, 10) / 1000, value: 0.7 }
    ]);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: Date.UTC(2026, 2, 1) / 1000, value: 0.8 },
    { time: Date.UTC(2026, 3, 1) / 1000, value: 0.7 },
  ]);
});

test('overlay treasury splits keep historical buyback balances out of DAO', () => {
  const sandbox = loadHelpers(`
    CFG = {
      treasuryUSDC: 6825417.53,
      futAmmUSDC: 1496357.32,
      meteoraLpUSDC: 0.55,
      buybackRemainingUSDC: 579050.93
    };
    result = {
      historical: _getOverlaySplits({
        treasury: 6825417.53,
        futUSDC: 1496357.32,
        metUSDC: 0.55,
        buybackUSDC: 579050.93
      }),
      current: _getOverlaySplits(null)
    };
  `);

  assert.equal(Number(sandbox.result.historical.daoUSDC.toFixed(2)), 4750008.73);
  assert.equal(sandbox.result.historical.buybackUSDC, 579050.93);
  assert.equal(Number(sandbox.result.current.daoUSDC.toFixed(2)), 4750008.73);
  assert.equal(sandbox.result.current.buybackUSDC, 579050.93);
});

test('fully expanded overlay splits backend vault breakdown into VLT rows', () => {
  const sandbox = loadHelpers(`
    _overlaySplitLevel = 2;
    fmtM = function(n) { return '$' + Math.round(n / 1000) + 'K'; };
    var beforeFunding = 1776816000;
    var fundingBucket = 1776902400;
    _lwNavHistory = [{ time: beforeFunding, value: 0.1 }, { time: fundingBucket, value: 0.1 }];
    _lwPriceCache = _lwNavHistory.slice();
    _getRecommendedNavResolution = function() { return '1D'; };
    CFG = {
      futAmm: 'fut1',
      futAmmUSDC: 200000,
      futLpTokens: 20,
      meteoraLpUSDC: 100000,
      meteoraLpTokens: 10,
      daoBreakdown: [
        { label: 'DAO Treasury', address: 'dao-main', usdc: 150000, tokens: 98000 },
        { label: 'SOLOMON Treasury Subcommittee', address: 'dao-sub', usdc: 4500000, tokens: 0 }
      ]
    };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: fundingBucket,
        event_time: fundingBucket + 3600,
        marker_kind: 'transfer',
        transfer_type: 'internal_transfer',
        effect: 'withdrawal',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 4500000,
        address: 'dao-main'
      },
      {
        bucket_time: fundingBucket,
        event_time: fundingBucket + 3600,
        marker_kind: 'transfer',
        transfer_type: 'internal_transfer',
        effect: 'deposit',
        account_label: 'Treasury Subcommittee',
        account_key: 'treasury_subcommittee',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 4500000,
        address: 'dao-sub'
      }
    ]);
    var span = function(color, txt) { return '[' + color + ']' + txt + '[/]'; };
    var treasuryFlow = {
      poolInflows: {},
      poolOutflows: {},
      daoInflows: {},
      daoOutflows: { 'dao-main': 1000 },
      daoInflow: 0,
      daoOutflow: 1000
    };
    var supplyFlow = {
      poolInflows: {},
      poolOutflows: {},
      poolBurns: {},
      daoInflows: { 'dao-main': 500 },
      daoOutflows: {},
      daoInflow: 500,
      daoOutflow: 0
    };
    var beforeSnap = { time: beforeFunding, treasury: 5000000, daoUSDC: 4650000, daoTokens: 98000, futUSDC: 200000, metUSDC: 150000 };
    var afterSnap = { time: fundingBucket, treasury: 5000000, daoUSDC: 4650000, daoTokens: 98000, futUSDC: 200000, metUSDC: 150000 };
    result = {
      splits: _getOverlaySplits(null),
      beforeSplits: _getOverlaySplits(beforeSnap),
      afterSplits: _getOverlaySplits(afterSnap),
      fundingFlow: _displayTreasuryFlowForTime(fundingBucket),
      beforeTreasuryHtml: _overlayTreasurySplitHtml(span, 'M', 'W', beforeSnap, null, 0, _displayTreasuryFlowForTime(beforeFunding)),
      afterTreasuryHtml: _overlayTreasurySplitHtml(span, 'M', 'W', afterSnap, null, 0, _displayTreasuryFlowForTime(fundingBucket)),
      treasuryHtml: _overlayTreasurySplitHtml(span, 'M', 'W', null, null, 0, treasuryFlow),
      supplyHtml: _overlaySupplySplitHtml(span, 'M', 'W', null, supplyFlow)
    };
  `);

  assert.equal(sandbox.result.splits.daoVaults.length, 2);
  assert.equal(sandbox.result.beforeSplits.daoVaults.length, 1);
  assert.equal(sandbox.result.beforeSplits.daoVaults[0].label, 'VLT1');
  assert.equal(sandbox.result.beforeSplits.daoVaults[0].usdc, 4650000);
  assert.equal(sandbox.result.afterSplits.daoVaults.length, 2);
  assert.equal(sandbox.result.afterSplits.daoVaults[0].usdc, 150000);
  assert.equal(sandbox.result.afterSplits.daoVaults[1].label, 'VLT2');
  assert.equal(sandbox.result.afterSplits.daoVaults[1].usdc, 4500000);
  assert.equal(sandbox.result.fundingFlow.daoOutflow, 0);
  assert.equal(sandbox.result.fundingFlow.daoInflow, 0);
  assert.equal(sandbox.result.beforeTreasuryHtml.includes('[#7a8b9c]VLT1 [/]'), true);
  assert.equal(sandbox.result.beforeTreasuryHtml.includes('[#7a8b9c]VLT2 [/]'), false);
  assert.equal(sandbox.result.beforeTreasuryHtml.includes('[#7a8b9c]Vaults [/]'), false);
  assert.equal(sandbox.result.afterTreasuryHtml.includes('[#7a8b9c]VLT1 [/]'), true);
  assert.equal(sandbox.result.afterTreasuryHtml.includes('[#7a8b9c]VLT2 [/]'), true);
  assert.equal(sandbox.result.afterTreasuryHtml.includes('[#f04060]▼ $4500K[/]'), false);
  assert.equal(sandbox.result.afterTreasuryHtml.includes('[#00cc66]▲ $4500K[/]'), false);
  assert.equal(sandbox.result.treasuryHtml.includes('[#7a8b9c]VLT1 [/]'), true);
  assert.equal(sandbox.result.treasuryHtml.includes('[#7a8b9c]VLT2 [/]'), true);
  assert.equal(sandbox.result.treasuryHtml.includes('[#7a8b9c]Vaults [/]'), false);
  assert.equal(sandbox.result.treasuryHtml.includes('[#f04060]▼ $1K[/]'), true);
  assert.equal(sandbox.result.supplyHtml.includes('[#7a8b9c]VLT1 [/]'), true);
  assert.equal(sandbox.result.supplyHtml.includes('[#7a8b9c]VLT2 [/]'), false);
  assert.equal(sandbox.result.supplyHtml.includes('[W]—[/]'), false);
  assert.equal(sandbox.result.supplyHtml.includes('[#00cc66]▲ 500[/]'), false);
});

test('top-left treasury overlay hides empty split titles', () => {
  const sandbox = loadHelpers(`
    _overlaySplitLevel = 2;
    CFG = {};
    _buybackHourly = [];
    _buybackUsdForPriceTimeCache = null;
    fmtM = function(n) { return '$' + Math.round(n); };
    var span = function(color, txt) { return '[' + color + ']' + txt + '[/]'; };
    result = _overlayTreasurySplitHtml(span, 'M', 'W', {
      time: 1776816000,
      treasury: 0,
      daoUSDC: 0,
      futUSDC: 0,
      metUSDC: 0,
      buybackUSDC: 0,
      usdvUSDC: 0
    }, null, 0, {
      poolInflows: {},
      poolOutflows: {},
      daoInflows: {},
      daoOutflows: {},
      daoInflow: 0,
      daoOutflow: 0
    });
  `);

  assert.equal(sandbox.result, '');
});

test('historical treasury splits do not leak current buyback balances into ICO hover', () => {
  const sandbox = loadHelpers(`
    CFG = {
      treasuryUSDC: 4200000,
      futAmmUSDC: 800000,
      meteoraLpUSDC: 100000,
      buybackRemainingUSDC: 600000,
      daoTokenBalance: 3000000,
      futLpTokens: 2000000,
      meteoraLpTokens: 1000000
    };
    result = _getOverlaySplits({
      treasury: 3500000,
      futUSDC: 700000
    });
  `);

  assert.equal(sandbox.result.buybackUSDC, 0);
  assert.equal(sandbox.result.usdvUSDC, 0);
  assert.equal(sandbox.result.metUSDC, 0);
  assert.equal(sandbox.result.daoTokens, 0);
  assert.equal(sandbox.result.futTokens, 0);
  assert.equal(sandbox.result.metTokens, 0);
  assert.equal(sandbox.result.daoUSDC, 2800000);
});

test('OMFG project Meteora LP fee telemetry stays separate from LP principal', () => {
  const sandbox = loadHelpers(`
    tokenKey = 'omfg';
    CFG = {
      treasuryUSDC: 1000,
      futAmmUSDC: 100,
      meteoraLpUSDC: 200,
      project_lp_fee_usdc: 50,
      meteoraMdaoLpFeeUSDC: 75,
      daoTokenBalance: 10,
      futLpTokens: 20,
      meteoraLpTokens: 30,
      project_lp_fee_tokens: 5,
      meteoraMdaoLpFeeTokens: 7
    };
    var current = _getOverlaySplits(null);
    var historical = _getOverlaySplits({
      treasury: 1000,
      futUSDC: 100,
      metUSDC: 200,
      project_lp_fee_usdc: 50,
      metTokens: 30,
      project_lp_fee_tokens: 5
    });
    var treasury = _navTreasuryComponentsForCfg(CFG);
    var meteoraComp = treasury.components.find(function(c) { return c.key === 'meteoraLpUSDC'; });
    result = {
      currentMetUSDC: current.metUSDC,
      currentDaoUSDC: current.daoUSDC,
      currentMetTokens: current.metTokens,
      historicalMetUSDC: historical.metUSDC,
      historicalDaoUSDC: historical.daoUSDC,
      historicalMetTokens: historical.metTokens,
      componentMeteoraUSDC: meteoraComp && meteoraComp.usd,
      componentDaoUSDC: treasury.impliedDaoUSDC,
      projectRow: treasury.components.some(function(c) { return c.key === 'projectLpFeeUSDC'; })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    currentMetUSDC: 200,
    currentDaoUSDC: 700,
    currentMetTokens: 30,
    historicalMetUSDC: 200,
    historicalDaoUSDC: 700,
    historicalMetTokens: 30,
    componentMeteoraUSDC: 200,
    componentDaoUSDC: 700,
    projectRow: false,
  });
});

test('historic NAV rows preserve project fee USD without folding fee tokens into LP principal', () => {
  assert.match(source, /if \(d\.project_lp_fee_usdc != null\) entry\.projectLpFeeUSDC = d\.project_lp_fee_usdc;/);
  assert.doesNotMatch(source, /entry\.projectLpFeeTokens = d\.project_lp_fee_tokens/);
});

test('buyback display floor hides sub-$100 values', () => {
  const sandbox = loadHelpers(`
    result = {
      zero: _buybackUsdDisplayValue(0),
      dust: _buybackUsdDisplayValue(10),
      edge: _buybackUsdDisplayValue(100),
      larger: _buybackUsdDisplayValue(250)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    zero: 0,
    dust: 0,
    edge: 100,
    larger: 250,
  });
});

test('buyback budget display shows remaining over allocated size', () => {
  const sandbox = loadHelpers(`
    fmtM = function(n) { return '$' + Math.round(n / 1000) + 'K'; };
    CFG = { buybackAllocated: 500000, buybackSpent: 100000, buybackRemainingUSDC: 400000 };
    result = {
      allocated: _buybackBudgetDisplay(400000)
    };
    CFG = { buybackSpent: 100000, buybackRemainingUSDC: 400000 };
    result.fallback = _buybackBudgetDisplay(400000);
    CFG = { buybackRemainingUSDC: 400000 };
    result.remainingOnly = _buybackBudgetDisplay(400000);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    allocated: '$400K<span style="color:#566474">/</span>$500K',
    fallback: '$400K<span style="color:#566474">/</span>$500K',
    remainingOnly: '$400K',
  });
});

test('buyback hover amount separates prior total from hovered bucket', () => {
  const dayTs = Math.floor(Date.parse('2026-04-16T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    fmtM = function(n) { return '$' + Math.round(n / 1000) + 'K'; };
    _lwPriceCache = [
      { time: ${dayTs}, value: 1 },
      { time: ${dayTs + 86400}, value: 1.1 }
    ];
    _buybackHourly = [];
    CFG = {
      buybackAllocated: 50000,
      buybackDays: [
        { date: '2026-04-16', usdcAmount: 12000, tokensBought: 20000 },
        { date: '2026-04-16', usdcAmount: 5000, tokensBought: 8000 },
        { date: '2026-04-17', usdcAmount: 9000, tokensBought: 14000 }
      ]
    };
    result = {
      daily: _buybackUsdForPriceTime(${dayTs}),
      nextDay: _buybackUsdForPriceTime(${dayTs + 86400}),
      firstDayStats: _buybackUsdStatsForPriceTime(${dayTs}),
      stats: _buybackUsdStatsForPriceTime(${dayTs + 86400}),
      tokenStats: _buybackTokenStatsForPriceTime(${dayTs + 86400}),
      hoverText: _buybackHoverText(_buybackUsdStatsForPriceTime(${dayTs + 86400})),
      topHtml: _buybackTopOverlayHtml(function(color, txt) { return '[' + color + ']' + txt + '[/]'; }, 'M', 'W', ${dayTs + 86400}),
      supplyHtml: (function() {
        CFG.buybackTokenBalance = 42000;
        return _buybackSupplyOverlayHtml(function(color, txt) { return '[' + color + ']' + txt + '[/]'; }, 'M', 'W', ${dayTs + 86400});
      })()
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    daily: 17000,
    nextDay: 9000,
    firstDayStats: { total: 0, cumulative: 17000, expected: 50000, day: 17000 },
    stats: { total: 17000, cumulative: 26000, expected: 50000, day: 9000 },
    tokenStats: { cumulative: 42000, day: 14000 },
    hoverText: '+$9K ($26K<span style="color:#566474">/</span>$50K)',
    topHtml: '[M]Buyback [/] [#f04060]▼ $9K[/]',
    supplyHtml: '[M]Buyback [/][W]42K[/] [#00cc66]▲ 14K[/]',
  });
});

test('buyback price markers prefer current movement executions over stale hourly rows', () => {
  const staleTs = Math.floor(Date.parse('2026-04-01T00:00:00Z') / 1000);
  const spendTs = Math.floor(Date.parse('2026-04-07T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _chartTF = '1H';
    _lwPriceCache = [
      { time: ${staleTs}, value: 0.1 },
      { time: ${spendTs}, value: 0.12 },
      { time: ${spendTs + 3600}, value: 0.13 }
    ];
    _buybackHourly = [{ time: '2026-04-01T00:00:00Z', usdcSpent: 5000 }];
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${spendTs},
        event_time: ${spendTs} + 1800,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 12000
      }
    ]);
    result = {
      sourceRows: _buybackSpendSourceRows(),
      stale: _buybackUsdForPriceTime(${staleTs}),
      spend: _buybackUsdForPriceTime(${spendTs}),
      stats: _buybackUsdStatsForPriceTime(${spendTs})
    };
  `);

  assert.equal(sandbox.result.sourceRows.length, 1);
  assert.equal(sandbox.result.sourceRows[0].time, spendTs);
  assert.equal(sandbox.result.stale, 0);
  assert.equal(sandbox.result.spend, 12000);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.stats)), {
    total: 0,
    cumulative: 12000,
    expected: 0,
    day: 12000
  });
});

test('buyback marker points follow current movement executions on hourly charts', () => {
  const staleTs = Math.floor(Date.parse('2026-04-01T00:00:00Z') / 1000);
  const spendTs = Math.floor(Date.parse('2026-04-07T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _chartTF = '1H';
    _lwPrice = {};
    _layerPrice = true;
    _layerOhlc = false;
    _showBuybackMarkers = true;
    _lwPriceMarkers = { setMarkers: function() {} };
    _requestOverlayUpdate = function() {};
    _buybackMarkerPoints = [];
    _lwPriceCache = [
      { time: ${staleTs}, value: 0.1 },
      { time: ${spendTs}, value: 0.12 },
      { time: ${spendTs + 3600}, value: 0.13 }
    ];
    _buybackHourly = [{ time: '2026-04-01T00:00:00Z', usdcSpent: 5000 }];
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${spendTs},
        event_time: ${spendTs} + 1800,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 12000
      }
    ]);
    _applyBuybackMarkers();
    result = _buybackMarkerPoints.map(function(point) {
      return { time: point.time, value: point.value };
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: spendTs, value: 0.12 }
  ]);
});

test('buyback marker time runs merge dense hourly points but split separate campaigns', () => {
  const startTs = Math.floor(Date.parse('2026-04-06T18:00:00Z') / 1000);
  const laterTs = Math.floor(Date.parse('2026-05-06T18:00:00Z') / 1000);
  const nextCampaignTs = Math.floor(Date.parse('2026-05-15T18:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _buybackMarkerPoints = [];
    for (var i = 0; i <= 30 * 24; i++) {
      _buybackMarkerPoints.push({ time: ${startTs} + i * 3600, value: 1 });
    }
    _buybackMarkerPoints.push({ time: ${nextCampaignTs}, value: 1 });
    _buybackMarkerPoints.push({ time: ${nextCampaignTs} + 3600, value: 1 });
    result = _buybackMarkerTimeRuns(3 * 86400);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { start: startTs, end: laterTs },
    { start: nextCampaignTs, end: nextCampaignTs + 3600 }
  ]);
});

test('buyback price rows are scoped to the active buyback run', () => {
  const startTs = Math.floor(Date.parse('2026-04-06T18:00:00Z') / 1000);
  const endTs = Math.floor(Date.parse('2026-04-06T21:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _lwPriceCache = [
      { time: ${startTs - 3600}, value: 0.50 },
      { time: ${startTs}, value: 0.51 },
      { time: ${startTs + 3600}, value: 0.52 },
      { time: ${startTs + 7200}, value: 0.53 },
      { time: ${endTs}, value: 0.54 },
      { time: ${endTs + 3600}, value: 0.55 }
    ];
    result = _buybackPriceRowsForRun({ start: ${startTs}, end: ${endTs} }).map(function(row) {
      return { time: row.time, value: row.value };
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: startTs, value: 0.51 },
    { time: startTs + 3600, value: 0.52 },
    { time: startTs + 7200, value: 0.53 },
    { time: endTs, value: 0.54 }
  ]);
});

test('buyback execution rows feed the current daily USD spend overlay', () => {
  const bucket = Math.floor(Date.parse('2026-04-09T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    fmtM = function(n) {
      return n >= 1000 ? '$' + (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'K' : '$' + Math.round(n);
    };
    _chartTF = '1D';
    _lwNavHistory = [{ time: ${bucket}, value: 0.1 }];
    _lwPriceCache = [{ time: ${bucket}, value: 0.1 }];
    _lwTreasuryHistory = [{ time: ${bucket}, treasury: 600000, buybackUSDC: 596000 }];
    CFG = {
      buybackStart: '2026-04-01',
      buybackWallet: 'buyback-wallet-address',
      historyQuality: {}
    };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${bucket},
        event_time: ${bucket} + 7200,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 16666.56,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: ${bucket},
        event_time: ${bucket} + 7600,
        marker_kind: 'transfer',
        transfer_type: 'return',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 57000,
        address: 'buyback-wallet-address'
      }
    ]);
    _getRecommendedNavResolution = function() { return '1D'; };
    var span = function(color, txt) { return '[' + color + ']' + txt + '[/]'; };
    result = {
      spend: _displayBuybackSpendForTime(${bucket}),
      topHtml: _buybackTopOverlayHtml(span, 'M', 'W', ${bucket})
    };
  `);

  assert.equal(Math.round(sandbox.result.spend), 33333);
  assert.equal(sandbox.result.topHtml.includes('[W]$596K[/]'), true);
  assert.equal(sandbox.result.topHtml.includes('[#f04060]\u25BC $16.7K[/]'), true);
  assert.equal(sandbox.result.topHtml.includes('[#f04060]\u25BC $57K[/]'), false);
});

test('pre-buyback hover overlay does not read removed transfer fallback state', () => {
  const dayTs = Math.floor(Date.parse('2026-03-10T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    fmtM = function(n) { return '$' + Math.round(n / 1000) + 'K'; };
    _buybackHourly = [];
    _displayMovements = [];
    CFG = {
      buybackStart: '2026-03-26',
      buybackSpent: 7000,
      buybackAllocated: 7000,
      buybackDays: []
    };
    result = _buybackTopOverlayHtml(function(color, txt) { return '[' + color + ']' + txt + '[/]'; }, 'M', 'W', ${dayTs});
  `);

  assert.equal(sandbox.result, '');
  assert.equal(source.includes('transferredTotal'), false);
});

test('initial raise deposit is excluded from movement deposit display', () => {
  const launchTs = Math.floor(Date.parse('2026-03-04T00:00:00Z') / 1000);
  const laterTs = launchTs + 86400 * 10;
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    _lwPriceCache = [{ time: ${launchTs}, value: 1 }];
    _lwNavHistory = [{ time: ${launchTs}, value: 1 }];
    _lwTreasuryHistory = [{ time: ${launchTs}, treasury: 40000, effSupply: 10000000 }];
    _getRecommendedNavResolution = function() { return '1D'; };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${launchTs},
        event_time: ${launchTs} + 3600,
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 40000
      },
      {
        bucket_time: ${laterTs},
        event_time: ${laterTs} + 3600,
        marker_kind: 'raise',
        transfer_type: 'proposal_otc_sale',
        effect: 'deposit',
        account_label: 'VLT2',
        account_role: 'internal_wallet',
        account_key: 'vlt2',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 315000
      },
      {
        bucket_time: ${laterTs + 86400},
        event_time: ${laterTs + 86400} + 3600,
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 100000
      }
    ]);
    result = {
      raise: _displayMovementIsRaiseDeposit(_displayMovements[0]),
      later: _displayMovementIsRaiseDeposit(_displayMovements[1]),
      newestRaise: _displayMovementIsRaiseDeposit(_displayMovements[2]),
      launchFlow: _displayTreasuryFlowForTime(${launchTs}),
      laterFlow: _displayTreasuryFlowForTime(${laterTs + 86400})
    };
  `);

  assert.equal(sandbox.result.raise, true);
  assert.equal(sandbox.result.later, true);
  assert.equal(sandbox.result.newestRaise, false);
  assert.equal(sandbox.result.launchFlow.daoInflow, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.launchFlow.daoInflows)), {});
  assert.equal(sandbox.result.laterFlow.daoInflow, 100000);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.laterFlow.daoInflows)), {
    dao_treasury: 100000
  });
});

test('RAWR TGE raise deposit hint is classified as raise, not deposit', () => {
  const launchTs = Math.floor(Date.parse('2026-05-15T12:00:09Z') / 1000);
  const sandbox = loadHelpers(`
    tokenKey = 'rawr';
    CFG = {
      key: 'rawr',
      ticker: 'RAWR',
      launchDate: '2026-05-15T12:00:09.000Z',
      fundsAccepted: 200000,
      initialRaiseUsd: 200000
    };
    _chartTF = '1D';
    _lwPriceCache = [{ time: ${launchTs}, value: 0.02 }];
    _lwNavHistory = [{ time: ${launchTs}, value: 0.02 }];
    _lwTreasuryHistory = [{ time: ${launchTs}, treasury: 200000, effSupply: 10000000 }];
    _getRecommendedNavResolution = function() { return '1D'; };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${launchTs},
        event_time: ${launchTs},
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 200000,
        is_external_deposit: true,
        should_show_raise: false,
        should_show_deposit: true
      },
      {
        bucket_time: ${launchTs},
        event_time: ${launchTs},
        marker_kind: 'raise',
        transfer_type: 'raise_collection',
        spend_treatment: 'raise',
        display_kind: 'raise',
        nav_treatment: 'capital_inflow',
        effect: 'withdrawal',
        account_label: 'Initial raise wallet',
        account_role: 'launch_wallet',
        account_key: 'launch_wallet',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 200000,
        is_operational_spend: true,
        should_show_withdrawal: true
      }
    ]);
    var flow = _displayTreasuryFlowForTime(${launchTs});
    var raiseFlow = _raiseOverlayFlowForTime(${launchTs});
    var topWithdrawalIndexes = _topMonthlyOperationalWithdrawalIndexes(_displayMovements, 3);
    result = {
      initialRaiseLike: _displayMovementIsInitialRaiseLikeDeposit(_displayMovements[0]),
      depositRaiseClassified: _displayMovementIsRaiseClassified(_displayMovements[0]),
      spendRaiseClassified: _displayMovementIsRaiseClassified(_displayMovements[1]),
      raise: _displayMovementIsRaiseDeposit(_displayMovements[0]),
      deposit: _displayMovementIsOperationalDeposit(_displayMovements[0]),
      withdrawal: _displayMovementIsOperationalWithdrawal(_displayMovements[1]),
      daoInflow: flow.daoInflow,
      daoOutflow: flow.daoOutflow,
      topWithdrawalCount: Object.keys(topWithdrawalIndexes).length,
      allowanceSpend: _allowanceTransferIsOperationalSpend({
        timestamp: '2026-05-15T12:00:09.000Z',
        marker_kind: 'raise',
        transfer_type: 'raise_collection',
        spend_treatment: 'raise',
        amount_usdc: 200000,
        is_operational_spend: true,
        should_show_withdrawal: true
      }, { monthlyAllowance: 200000 }),
      raiseTreasuryUsd: raiseFlow.treasuryUsd
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    initialRaiseLike: true,
    depositRaiseClassified: false,
    spendRaiseClassified: true,
    raise: true,
    deposit: false,
    withdrawal: false,
    daoInflow: 0,
    daoOutflow: 0,
    topWithdrawalCount: 0,
    allowanceSpend: false,
    raiseTreasuryUsd: 200000
  });
});

test('RAWR oversubscribed launch commitments are not chart deposits and raise is capped to accepted funds', () => {
  const launchTs = Math.floor(Date.parse('2026-05-15T12:00:09Z') / 1000);
  const launchDayStart = Math.floor(Date.parse('2026-05-15T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    tokenKey = 'rawr';
    CFG = {
      key: 'rawr',
      ticker: 'RAWR',
      launchDate: '2026-05-15T12:00:09.000Z',
      fundsAccepted: 200000,
      initialRaiseUsd: 200000,
      totalCommits: 15287173
    };
    _chartTF = '1H';
    _lwPriceCache = [{ time: ${launchTs}, value: 0.02 }];
    _lwNavHistory = [{ time: ${launchTs}, value: 0.02 }];
    _lwTreasuryHistory = [{ time: ${launchTs}, treasury: 200000, effSupply: 10000000 }];
    _getRecommendedNavResolution = function() { return '1H'; };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${launchDayStart},
        event_time: ${launchDayStart},
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 150,
        is_external_deposit: true,
        should_show_deposit: true
      },
      {
        bucket_time: ${launchDayStart},
        event_time: ${launchDayStart},
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 10000,
        is_external_deposit: true,
        should_show_deposit: true
      }
    ]);
    var movementTotals = { raise: {}, deposit: {} };
    for (var i = 0; i < _displayMovements.length; i++) {
      var mv = _displayMovements[i];
      var mvAmount = _displayMovementAmount(mv, 'treasury');
      var mt = Number(mv.bucketTime || mv.eventTime) || 0;
      var mmo = _chartFlowPeriodKeyForTime(mt);
      if (_displayMovementIsRaiseDeposit(mv)) {
        var raiseAmount = _displayMovementRaiseDisplayAmount(mv, mvAmount);
        if (_displayMovementUsesConfiguredInitialRaiseAmount(mv)) movementTotals.raise[mmo] = Math.max(Number(movementTotals.raise[mmo]) || 0, raiseAmount);
        else movementTotals.raise[mmo] = (movementTotals.raise[mmo] || 0) + raiseAmount;
      } else if (_displayMovementIsOperationalDeposit(mv)) {
        movementTotals.deposit[mmo] = (movementTotals.deposit[mmo] || 0) + mvAmount;
      }
    }
    var flow = _displayTreasuryFlowForTime(${launchDayStart});
    var raiseFlow = _raiseOverlayFlowForTime(${launchDayStart});
    result = {
      oversubscribed: _hasOversubscribedInitialRaise(),
      launchCommitment: _displayMovementIsLaunchRaiseCommitment(_displayMovements[0]),
      initialRaiseLike: _displayMovementIsInitialRaiseLikeDeposit(_displayMovements[0], false),
      raise: _displayMovementIsRaiseDeposit(_displayMovements[0]),
      deposit: _displayMovementIsOperationalDeposit(_displayMovements[0]),
      raiseDisplayAmount: _displayMovementRaiseDisplayAmount(_displayMovements[0]),
      daoInflow: flow.daoInflow,
      raiseTreasuryUsd: raiseFlow.treasuryUsd,
      totalRaise: movementTotals.raise[_chartFlowPeriodKeyForTime(${launchDayStart})] || 0,
      totalDeposits: movementTotals.deposit[_chartFlowPeriodKeyForTime(${launchDayStart})] || 0
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    oversubscribed: true,
    launchCommitment: true,
    initialRaiseLike: true,
    raise: true,
    deposit: false,
    raiseDisplayAmount: 200000,
    daoInflow: 0,
    raiseTreasuryUsd: 200000,
    totalRaise: 200000,
    totalDeposits: 0
  });
});

test('FAF summary liquidity deposits stay deposits and do not drive raise adjusted supply', () => {
  const feb14StartTs = Math.floor(Date.parse('2026-02-14T00:00:00Z') / 1000);
  const firstDepositTs = Math.floor(Date.parse('2026-02-14T19:15:42Z') / 1000);
  const secondDepositTs = Math.floor(Date.parse('2026-02-14T19:51:09Z') / 1000);
  const thirdDepositTs = Math.floor(Date.parse('2026-02-15T11:11:44Z') / 1000);
  const feb16Ts = Math.floor(Date.parse('2026-02-16T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    _chartMode = 'price';
    _overlayRowsCollapsed = false;
    _overlaySplitLevel = 0;
    _overlayPctVisible = false;
    _navFlowMarkersVisible = function() { return true; };
    _buybackHourly = [];
    CFG = { ticker: 'FAF', launchDate: '2026-02-14T19:15:42Z', fundsAccepted: 0, totalRaiseUsd: 0, initialRaiseUsd: 0 };
    fmtM = function(n) { return '$' + Math.round(n / 1000) + 'K'; };
    window = {
      NAVGATOR: window.NAVGATOR,
      fmtM: fmtM,
      fmt$: function(v) { return v >= 1 ? '$' + v.toFixed(2) : '$' + v.toFixed(4); }
    };
    _lwPriceCache = [{ time: ${firstDepositTs}, value: 0.003036 }, { time: ${thirdDepositTs}, value: 0.003036 }];
    _lwNavHistory = [{ time: ${firstDepositTs}, value: 0.0000508 }, { time: ${thirdDepositTs}, value: 0.000125 }];
    _lwTreasuryHistory = [
      { time: ${secondDepositTs}, treasury: 100000, effSupply: 967059623 },
      { time: ${thirdDepositTs}, treasury: 123955, effSupply: 959658261 },
      { time: ${feb16Ts}, treasury: 135137.55, effSupply: 1162995717 }
    ];
    _getRecommendedNavResolution = function() { return '1D'; };
    _displayMovements = _normalizeSummaryMovementEvents([
      {
        t: ${firstDepositTs},
        type: 'deposit',
        label: 'FAF FutAMM LP deposit',
        valueUsd: 50000,
        signature: '5LPC3ST',
        sourceId: 'faf-futamm-lp-deposit-1:usdc',
        transferType: 'liquidity_position',
        markerKind: 'liquidity_position',
        spendTreatment: 'liquidity_rebalance',
        valueTreatment: 'treasury_deployment',
        eventTime: ${firstDepositTs},
        poolLabel: 'FUT1'
      },
      {
        t: ${firstDepositTs},
        type: 'deposit',
        label: 'FAF FutAMM LP deposit',
        valueUsd: 50000,
        signature: '5jSqhGZ',
        sourceId: 'faf-futamm-lp-deposit-2:usdc',
        transferType: 'liquidity_position',
        markerKind: 'liquidity_position',
        spendTreatment: 'liquidity_rebalance',
        valueTreatment: 'treasury_deployment',
        eventTime: ${secondDepositTs},
        poolLabel: 'FUT1'
      },
      {
        t: ${thirdDepositTs},
        type: 'deposit',
        label: 'FAF FutAMM LP deposit',
        valueUsd: 23955,
        signature: 'R4wAV3C',
        sourceId: 'faf-futamm-lp-deposit-3:usdc',
        transferType: 'liquidity_position',
        markerKind: 'liquidity_position',
        spendTreatment: 'liquidity_rebalance',
        valueTreatment: 'treasury_deployment',
        eventTime: ${thirdDepositTs},
        poolLabel: 'FUT1'
      }
    ]);
    var firstRaiseFlow = _raiseOverlayFlowForTime(${firstDepositTs});
    var firstTreasuryFlow = _displayTreasuryFlowForTime(${firstDepositTs});
    var thirdTreasuryFlow = _displayTreasuryFlowForTime(${thirdDepositTs});
    var firstOverlayTime = _treasuryOverlaySnapshotTime(${firstDepositTs});
    var thirdOverlayTime = _treasuryOverlaySnapshotTime(${thirdDepositTs});
    var firstOverlayTreasury = _lwTreasuryLookupAtOrBefore(firstOverlayTime);
    var thirdOverlayTreasury = _lwTreasuryLookupAtOrBefore(thirdOverlayTime);
    var prelaunchHtml = _chartPreLaunchOverlayHtml(${feb14StartTs});
    var prelaunchText = prelaunchHtml.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
    var span = function(color, txt) { return '[' + color + ']' + txt + '[/]'; };
    result = {
      firstMovement: _displayMovements[0],
      firstIsRaise: _displayMovementIsRaiseDeposit(_displayMovements[0]),
      firstIsDeposit: _displayMovementIsOperationalDeposit(_displayMovements[0]),
      secondIsRaise: _displayMovementIsRaiseDeposit(_displayMovements[1]),
      thirdIsRaise: _displayMovementIsRaiseDeposit(_displayMovements[2]),
      firstRaiseFlow: firstRaiseFlow,
      firstTreasuryFlow: firstTreasuryFlow,
      thirdTreasuryFlow: thirdTreasuryFlow,
      firstDepositHtml: _depositTopOverlayHtml(span, 'M', 'G', firstTreasuryFlow),
      thirdDepositHtml: _depositTopOverlayHtml(span, 'M', 'G', thirdTreasuryFlow),
      firstOverlayTime: firstOverlayTime,
      thirdOverlayTime: thirdOverlayTime,
      firstOverlayTreasury: firstOverlayTreasury,
      thirdOverlayTreasury: thirdOverlayTreasury,
      lookaheadFirstTreasury: _lwTreasuryLookup(${firstDepositTs}).treasury,
      prelaunchText: prelaunchText
    };
  `);

  assert.equal(sandbox.result.firstMovement.markerKind, 'liquidity_position');
  assert.equal(sandbox.result.firstMovement.transferType, 'liquidity_position');
  assert.equal(sandbox.result.firstMovement.spendTreatment, 'liquidity_rebalance');
  assert.equal(sandbox.result.firstMovement.shouldShowRaise, false);
  assert.equal(sandbox.result.firstMovement.shouldShowDeposit, true);
  assert.equal(sandbox.result.firstMovement.shouldShowLiquidity, true);
  assert.equal(sandbox.result.firstIsRaise, false);
  assert.equal(sandbox.result.firstIsDeposit, true);
  assert.equal(sandbox.result.secondIsRaise, false);
  assert.equal(sandbox.result.thirdIsRaise, false);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.firstRaiseFlow)), { treasuryUsd: 0, supplyTokens: 0 });
  assert.equal(sandbox.result.firstTreasuryFlow.daoInflow, 100000);
  assert.equal(sandbox.result.thirdTreasuryFlow.daoInflow, 23955);
  assert.equal(sandbox.result.firstDepositHtml, '[M]Deposit [/][G]+$100K[/]');
  assert.equal(sandbox.result.thirdDepositHtml, '[M]Deposit [/][G]+$24K[/]');
  assert.equal(sandbox.result.firstOverlayTime, secondDepositTs);
  assert.equal(sandbox.result.thirdOverlayTime, thirdDepositTs);
  assert.equal(sandbox.result.firstOverlayTreasury.treasury, 100000);
  assert.equal(sandbox.result.thirdOverlayTreasury.treasury, 123955);
  assert.equal(sandbox.result.lookaheadFirstTreasury, 123955);
  assert.match(sandbox.result.prelaunchText, /Treasury\s+\$100K\s+Deposit\s+\+\$100K/);
  assert.doesNotMatch(sandbox.result.prelaunchText, /Treasury\s+\$124K/);
});

test('raise days show treasury and effective supply amounts in top overlay', () => {
  const launchTs = Math.floor(Date.parse('2025-11-18T00:00:00Z') / 1000);
  const dayAfterLaunchTs = launchTs + 86400;
  const futureTs = Math.floor(Date.parse('2026-05-04T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    function fmtM(n) { return n >= 1000000 ? '$' + (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n); }
    _chartTF = '1D';
    CFG = { ticker: 'UMBRA', launchDate: '2025-11-18', initialRaiseUsd: 3000000, futureRaiseUsd: 315000, totalRaiseUsd: 3315000 };
    _lwPriceCache = [{ time: ${launchTs}, value: 1 }, { time: ${dayAfterLaunchTs}, value: 1 }, { time: ${futureTs}, value: 1 }];
    _lwNavHistory = [{ time: ${launchTs}, value: 1 }, { time: ${dayAfterLaunchTs}, value: 1 }, { time: ${futureTs}, value: 1 }];
    _lwTreasuryHistory = [{ time: ${launchTs}, treasury: 3000000, effSupply: 10000000 }, { time: ${dayAfterLaunchTs}, treasury: 3000000, effSupply: 10000000 }, { time: ${futureTs}, treasury: 3315000, effSupply: 9302721 }];
    _getRecommendedNavResolution = function() { return '1D'; };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${launchTs},
        marker_kind: 'raise',
        transfer_type: 'raise_collection',
        effect: 'deposit',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 2400000
      },
      {
        bucket_time: ${futureTs},
        marker_kind: 'raise',
        transfer_type: 'proposal_otc_sale',
        spend_treatment: 'raise',
        effect: 'deposit',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 315000
      },
      {
        bucket_time: ${futureTs},
        marker_kind: 'raise',
        transfer_type: 'proposal_otc_sale',
        spend_treatment: 'raise',
        effect: 'withdrawal',
        display_section: 'supply',
        asset: 'UMBRA',
        token_amount: 666667
      },
      {
        bucket_time: ${futureTs},
        marker_kind: 'raise',
        transfer_type: 'proposal_otc_sale',
        spend_treatment: 'raise',
        effect: 'withdrawal',
        display_section: 'supply',
        asset: 'UMBRA',
        token_amount: 30612.24
      }
    ]);
    var launchFlow = _raiseOverlayFlowForTime(${launchTs});
    var dayAfterLaunchFlow = _raiseOverlayFlowForTime(${dayAfterLaunchTs});
    var futureFlow = _raiseOverlayFlowForTime(${futureTs});
    result = {
      launchFlow: launchFlow,
      dayAfterLaunchFlow: dayAfterLaunchFlow,
      futureFlow: futureFlow,
      launchTreasuryHtml: _raiseTreasuryOverlayHtml(function(color, txt) { return '[' + color + ']' + txt + '[/]'; }, 'M', 'G', launchFlow),
      launchSupplyHtml: _raiseSupplyOverlayHtml(function(color, txt) { return '[' + color + ']' + txt + '[/]'; }, 'M', 'G', launchFlow),
      futureTreasuryHtml: _raiseTreasuryOverlayHtml(function(color, txt) { return '[' + color + ']' + txt + '[/]'; }, 'M', 'G', futureFlow),
      futureSupplyHtml: _raiseSupplyOverlayHtml(function(color, txt) { return '[' + color + ']' + txt + '[/]'; }, 'M', 'G', futureFlow)
    };
  `);

  assert.equal(sandbox.result.launchFlow.treasuryUsd, 3000000);
  assert.equal(sandbox.result.launchFlow.supplyTokens, 10000000);
  assert.equal(sandbox.result.dayAfterLaunchFlow.treasuryUsd, 0);
  assert.equal(sandbox.result.dayAfterLaunchFlow.supplyTokens, 0);
  assert.equal(sandbox.result.futureFlow.treasuryUsd, 315000);
  assert.equal(Math.round(sandbox.result.futureFlow.supplyTokens), 697279);
  assert.equal(sandbox.result.launchTreasuryHtml, '[M]Raise [/][G]▲ $3.0M[/]');
  assert.equal(sandbox.result.launchSupplyHtml, '[M]Raise [/][G]▲ 10.00M[/]');
  assert.equal(sandbox.result.futureTreasuryHtml, '[M]Raise [/][G]▲ $315K[/]');
  assert.equal(sandbox.result.futureSupplyHtml, '[M]Raise [/][G]▲ 697K[/]');
});

test('later raise overlays fall back to effective supply delta when supply leg is missing', () => {
  const beforeRaiseTs = Math.floor(Date.parse('2026-05-04T00:00:00Z') / 1000);
  const raiseTs = Math.floor(Date.parse('2026-05-05T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    function fmtM(n) { return n >= 1000000 ? '$' + (n / 1000000).toFixed(2) + 'M' : n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n); }
    _chartTF = '1D';
    CFG = { ticker: 'UMBRA' };
    _lwTreasuryHistory = [
      { time: ${beforeRaiseTs}, treasury: 2820544.12, effSupply: 10965165 },
      { time: ${raiseTs}, treasury: 3204037.8, effSupply: 11796222 }
    ];
    _getRecommendedNavResolution = function() { return '1D'; };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${raiseTs},
        marker_kind: 'raise',
        transfer_type: 'raise',
        spend_treatment: 'raise',
        effect: 'deposit',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 315000
      }
    ]);
    var flow = _raiseOverlayFlowForTime(${raiseTs});
    result = {
      flow: flow,
      supplyHtml: _raiseSupplyOverlayHtml(function(color, txt) { return '[' + color + ']' + txt + '[/]'; }, 'M', 'G', flow)
    };
  `);

  assert.equal(sandbox.result.flow.treasuryUsd, 315000);
  assert.equal(sandbox.result.flow.supplyTokens, 831057);
  assert.equal(sandbox.result.supplyHtml, '[M]Raise [/][G]\u25B2 831K[/]');
});

test('proposal marker kind separates raise buyback restructuring and liquidation', () => {
  const sandbox = loadHelpers(`
    result = {
      raise: _proposalMarkerKind({ title: 'Strategic OTC Sale Raise' }),
      explicitRaise: _proposalMarkerKind({ proposalKind: 'raise', title: 'Increase Allowance To 50k/mo?' }),
      raiseAllowance: _proposalMarkerKind({ title: 'OMFG-001 - Increase Allowance To 50k/mo?', note: "Passed governance proposal to raise Omnipair's recurring operating allowance to $50,000 per month." }),
      buyback: _proposalMarkerKind({ title: 'Buyback P2P up to NAV' }),
      restructuring: _proposalMarkerKind({ title: 'Increase Allowance To 50k/mo?' }),
      spend: _proposalMarkerKind({ title: 'Fund Security Audits', description: 'Authorize 64,000 USDC for audits' }),
      liquidation: _proposalMarkerKind({ title: 'Liquidation and wind down proposal' }),
      liquidationNoun: _proposalMarkerKind({ title: 'Liquidation Proposal for $SUPER' }),
      sparseFutardioBuyback: _proposalMarkerKind({ status: 'passed', resolvedAt: '2026-03-26', title: null }),
      sparseBuyback: _proposalMarkerKind({ status: 'passed', resolvedAt: '2025-11-29', title: null }),
      generic: _proposalMarkerKind({ title: 'Community Temperature Check' })
    };
  `, { tokenKey: 'futardio', CFG: { ticker: 'FUTARDIO', buybackAllocated: 10000 } });

  assert.equal(sandbox.result.raise, 'raise');
  assert.equal(sandbox.result.explicitRaise, 'raise');
  assert.equal(sandbox.result.raiseAllowance, 'restructuring');
  assert.equal(sandbox.result.buyback, 'buyback');
  assert.equal(sandbox.result.restructuring, 'restructuring');
  assert.equal(sandbox.result.spend, 'restructuring');
  assert.equal(sandbox.result.liquidation, 'liquidation');
  assert.equal(sandbox.result.liquidationNoun, 'liquidation');
  assert.equal(sandbox.result.sparseFutardioBuyback, 'buyback');
  assert.equal(sandbox.result.sparseBuyback, 'proposal');
  assert.equal(sandbox.result.generic, 'restructuring');
});

test('chart flow marker rows collapse same-day same-direction arrows', () => {
  const sandbox = loadHelpers(`
    result = {
      empty: _coalescedNavFlowMarkerRows([]),
      single: _coalescedNavFlowMarkerRows([{ amount: 7000, size: 0.5 }]),
      combined: _coalescedNavFlowMarkerRows([
        { amount: 7000, size: 0.5 },
        { amount: 2000, size: 0.7 },
        { amount: 500, size: 0.4 }
      ])
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    empty: [],
    single: [{ amount: 7000, size: 0.5 }],
    combined: [{ amount: 9500, size: 0.7 }]
  });
});

test('chart flow arrows keep deposit and withdrawal amounts in treasury overlay instead of arrow labels', () => {
  const sandbox = loadHelpers(`
    result = {
      oneCent: _flowMarkerAmountText(1.01),
      seven: _flowMarkerAmountText(7.81),
      hundred: _flowMarkerAmountText(100),
      launch: _flowMarkerAmountText(894481.6),
      almostMillion: _flowMarkerAmountText(999999),
      million: _flowMarkerAmountText(1468102.01),
      sourceLabels: source.indexOf("label: ''") !== -1
        && source.indexOf("label: '+' + _flowMarkerAmountText(deposits[di].amount)") === -1
        && source.indexOf("return amount > 0 ? span(M, 'Deposit ') + span(G, '+' + fmtM(amount)) : '';") !== -1
        && source.indexOf("return amount > 0 ? span(M, 'Spend ') + span(R, '\\\\u25BC ' + fmtM(amount)) : '';") !== -1
    };
  `, { source });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    oneCent: '$1.01',
    seven: '$7.81',
    hundred: '$100',
    launch: '$894K',
    almostMillion: '$1M',
    million: '$1.5M',
    sourceLabels: true
  });
});

test('chart withdrawal markers use top three monthly operational withdrawals only', () => {
  const jan1 = Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000);
  const feb1 = Math.floor(Date.parse('2026-02-01T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _displayMovements = _normalizeDisplayMovements([
      { bucket_time: ${jan1}, marker_kind: 'withdrawal', transfer_type: 'withdrawal', effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 1000 },
      { bucket_time: ${jan1 + 86400}, marker_kind: 'withdrawal', transfer_type: 'withdrawal', effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 5000 },
      { bucket_time: ${jan1 + 86400 * 2}, marker_kind: 'transfer', transfer_type: 'internal_transfer', spend_treatment: 'internal_transfer', is_operational_spend: false, effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 9000 },
      { bucket_time: ${jan1 + 86400 * 3}, marker_kind: 'operator_budget', transfer_type: 'operator_budget', effect: 'withdrawal', display_section: 'treasury', account_label: 'DAO Treasury', account_role: 'dao_treasury', account_key: 'dao_treasury', parent_from_label: 'DAO Treasury', parent_to_label: 'P2P monthly operating budget', asset: 'USDC', amount_usdc: 3000 },
      { bucket_time: ${jan1 + 86400 * 4}, marker_kind: 'withdrawal', transfer_type: 'withdrawal', effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 2000 },
      { bucket_time: ${jan1 + 86400 * 5}, marker_kind: 'withdrawal', transfer_type: 'withdrawal', effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 4000 },
      { bucket_time: ${feb1}, marker_kind: 'withdrawal', transfer_type: 'withdrawal', effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 700 },
      { bucket_time: ${feb1 + 86400}, marker_kind: 'buyback', transfer_type: 'buyback_execution', effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 8000 },
      { bucket_time: ${feb1 + 86400 * 2}, marker_kind: 'proposal', transfer_type: 'proposal_liquidity_withdrawal', spend_treatment: 'liquidity_rebalance', is_operational_spend: false, effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 262558.04 },
      { bucket_time: ${feb1 + 86400 * 3}, marker_kind: 'liquidity_position', transfer_type: 'liquidity_position', spend_treatment: 'liquidity_rebalance', is_operational_spend: false, effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 240000 },
      { bucket_time: ${feb1 + 86400 * 4}, marker_kind: 'proposal', transfer_type: 'vendor_payment', spend_treatment: 'external_spend', is_operational_spend: true, effect: 'withdrawal', display_section: 'treasury', asset: 'USDC', amount_usdc: 600 }
    ]);
    var selected = _topMonthlyOperationalWithdrawalIndexes(_displayMovements, 3);
    result = {
      month: _displayMovementMonthKey(_displayMovements[0]),
      operationalFlags: _displayMovements.map(function(row) { return _displayMovementIsOperationalWithdrawal(row); }),
      selected: Object.keys(selected).sort()
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    month: '2026-01',
    operationalFlags: [true, true, false, true, true, true, true, false, false, false, true],
    selected: ['1', '10', '3', '5', '6']
  });
});

test('PAYS launch withdrawals normalize to the October 28 datapoint', () => {
  const launchBucket = Math.floor(Date.parse('2025-10-27T00:00:00Z') / 1000);
  const correctedBucket = Math.floor(Date.parse('2025-10-28T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    var rows = _normalizeDisplayMovements([
      {
        bucket_time: ${launchBucket},
        event_time: ${launchBucket},
        signature: '38cT7kF4yA2ZfnPv5aDL9ZGXDJtJwHtokkyK9NsHu5czdAB1FodnyuvZX2jEbJHtSuh6TCniumzHZL56se8bjZ1y',
        marker_kind: 'operator_budget',
        transfer_type: 'operator_budget',
        effect: 'withdrawal',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 33298
      },
      {
        bucket_time: ${launchBucket},
        event_time: ${launchBucket},
        marker_kind: 'raise',
        transfer_type: 'raise',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 600000
      }
    ]);
    result = rows.map(function(row) {
      return { effect: row.effect, bucketTime: row.bucketTime, eventTime: row.eventTime };
    });
  `, { tokenKey: 'pays' });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { effect: 'withdrawal', bucketTime: correctedBucket, eventTime: correctedBucket },
    { effect: 'deposit', bucketTime: launchBucket, eventTime: launchBucket }
  ]);
});

test('accounting ledger events flatten into frontend-guided display movements', () => {
  const day = Math.floor(Date.parse('2026-05-09T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _displayMovements = _normalizeAccountingLedgerEvents([
      {
        eventId: 'raise:sig',
        bucketTime: ${day},
        eventTime: ${day + 3600},
        signature: 'sig',
        markerKind: 'raise',
        transferType: 'proposal_otc_sale',
        valueTreatment: 'treasury_reallocation',
        spendTreatment: 'raise',
        isOperationalSpend: false,
        isExternalDeposit: false,
        displayKind: 'raise',
        navTreatment: 'capital_inflow',
        parentFromLabel: 'Proposal #3 raise buyer',
        parentToLabel: 'DAO Treasury',
        frontend: {
          shouldShowRaise: true,
          shouldShowWithdrawal: false,
          shouldShowDeposit: false,
          shouldShowTransfer: false,
          shouldShowLiquidity: false,
          shouldShowBuyback: false,
          shouldShowSupplyChange: false
        },
        legs: [
          {
            movementId: 'raise:sig:to:deposit:usdc',
            effect: 'deposit',
            side: 'to',
            accountLabel: 'DAO Treasury',
            accountRole: 'dao_treasury',
            accountKey: 'dao_treasury',
            displaySection: 'treasury',
            asset: 'USDC',
            assetType: 'usdc',
            amountUsdc: 350000.01,
            valueUsdc: 350000.01
          }
        ]
      },
      {
        eventId: 'transfer:sig2',
        bucketTime: ${day},
        eventTime: ${day + 7200},
        signature: 'sig2',
        markerKind: 'transfer',
        transferType: 'internal_transfer',
        spendTreatment: 'internal_transfer',
        isOperationalSpend: false,
        isExternalDeposit: false,
        displayKind: 'internal_transfer',
        frontend: {
          shouldShowRaise: false,
          shouldShowWithdrawal: false,
          shouldShowDeposit: false,
          shouldShowTransfer: true
        },
        legs: [
          {
            movementId: 'transfer:sig2:from:withdrawal:usdc',
            effect: 'withdrawal',
            side: 'from',
            accountLabel: 'DAO Treasury',
            accountRole: 'dao_treasury',
            accountKey: 'dao_treasury',
            displaySection: 'treasury',
            asset: 'USDC',
            assetType: 'usdc',
            amountUsdc: 250000,
            valueUsdc: 250000
          }
        ]
      }
    ]);
    result = {
      count: _displayMovements.length,
      raise: _displayMovementIsRaiseDeposit(_displayMovements[0]),
      raiseAsDeposit: _displayMovementIsOperationalDeposit(_displayMovements[0]),
      transferAsWithdrawal: _displayMovementIsOperationalWithdrawal(_displayMovements[1]),
      eventId: _displayMovements[0].eventId,
      movementId: _displayMovements[0].movementId,
      signature: _displayMovements[0].signature,
      displayKind: _displayMovements[0].displayKind,
      navTreatment: _displayMovements[0].navTreatment
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    count: 2,
    raise: true,
    raiseAsDeposit: false,
    transferAsWithdrawal: false,
    eventId: 'raise:sig',
    movementId: 'raise:sig:to:deposit:usdc',
    signature: 'sig',
    displayKind: 'raise',
    navTreatment: 'capital_inflow'
  });
});

test('chart flow periods are anchored to launch date instead of calendar months', () => {
  const sandbox = loadHelpers(`
    CFG = { launchDate: '2026-01-16T12:00:00Z' };
    var jan20 = Math.floor(Date.parse('2026-01-20T00:00:00Z') / 1000);
    var feb10 = Math.floor(Date.parse('2026-02-10T00:00:00Z') / 1000);
    var feb20 = Math.floor(Date.parse('2026-02-20T00:00:00Z') / 1000);
    result = {
      jan20Start: _chartFlowPeriodStartTime(jan20),
      feb10Start: _chartFlowPeriodStartTime(feb10),
      feb20Start: _chartFlowPeriodStartTime(feb20),
      jan20Key: _displayMovementMonthKey({ bucketTime: jan20 }),
      feb10Key: _displayMovementMonthKey({ bucketTime: feb10 }),
      feb20Key: _displayMovementMonthKey({ bucketTime: feb20 }),
      allowance: _allowanceWithdrawalMonthTotals({
        transfers: [
          { tx_date: '2026-02-10T00:00:00Z', amount: 100 },
          { tx_date: '2026-02-20T00:00:00Z', amount: 200 }
        ]
      }, {})
    };
  `);

  const jan16 = Math.floor(Date.parse('2026-01-16T00:00:00Z') / 1000);
  const feb16 = Math.floor(Date.parse('2026-02-16T00:00:00Z') / 1000);
  assert.equal(sandbox.result.jan20Start, jan16);
  assert.equal(sandbox.result.feb10Start, jan16);
  assert.equal(sandbox.result.feb20Start, feb16);
  assert.equal(sandbox.result.jan20Key, 'p:' + jan16);
  assert.equal(sandbox.result.feb10Key, 'p:' + jan16);
  assert.equal(sandbox.result.feb20Key, 'p:' + feb16);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.allowance.totals)), {
    ['p:' + jan16]: 100,
    ['p:' + feb16]: 200
  });
  assert.equal(source.includes('var sortedMos = Object.keys(monthFirstTs).sort(function(a, b) { return (monthFirstTs[a] || 0) - (monthFirstTs[b] || 0); });'), true);
});

test('chart deposit totals only include real external DAO deposits', () => {
  const day = Math.floor(Date.parse('2026-04-02T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    _lwPriceCache = [{ time: ${day - 86400}, value: 1 }, { time: ${day}, value: 1 }];
    _lwNavHistory = _lwPriceCache.slice();
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${day},
        event_time: ${day} + 3600,
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        parent_to_label: 'DAO Treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 35178.88
      },
      {
        bucket_time: ${day},
        event_time: ${day} + 7200,
        marker_kind: 'transfer',
        transfer_type: 'internal_transfer',
        effect: 'deposit',
        account_label: 'Treasury Subcommittee',
        account_key: 'treasury_subcommittee',
        parent_from_label: 'DAO Treasury',
        parent_to_label: 'Treasury Subcommittee',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 4500000
      },
      {
        bucket_time: ${day},
        event_time: ${day} + 10800,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        parent_from_label: 'Buyback wallet',
        parent_to_label: 'DAO Treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 16666.56
      }
    ]);
    result = _displayMovements.map(function(row) { return _displayMovementIsOperationalDeposit(row); });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [true, false, false]);
  assert.equal(source.includes("else if (_displayMovementIsOperationalDeposit(dm)) dg.deposits.push({ amount: damt, size: dsize });"), true);
});

test('explicit P2P launch-window deposit stays a deposit instead of becoming raise', () => {
  const depositBucketTs = Math.floor(Date.parse('2026-04-02T00:00:00Z') / 1000);
  const depositEventTs = Math.floor(Date.parse('2026-04-02T18:10:56Z') / 1000);
  const sandbox = loadHelpers(`
    tokenKey = 'p2p';
    CFG = {
      key: 'p2p',
      ticker: 'P2P',
      launchDate: '2026-04-01T14:00:00Z',
      fundsAccepted: 6000000,
      initialRaiseUsd: 6000000,
      totalCommits: 7155515
    };
    _chartTF = '1D';
    _lwPriceCache = [{ time: ${depositBucketTs - 86400}, value: 0.6 }, { time: ${depositBucketTs}, value: 0.6 }];
    _lwNavHistory = _lwPriceCache.slice();
    _lwTreasuryHistory = [{ time: ${depositBucketTs - 86400}, treasury: 4800000 }, { time: ${depositBucketTs}, treasury: 4835178.88 }];
    _getRecommendedNavResolution = function() { return '1D'; };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${depositBucketTs},
        event_time: ${depositEventTs},
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        spend_treatment: 'external_deposit',
        display_kind: 'external_deposit',
        nav_treatment: 'external_deposit',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        parent_to_label: 'DAO Treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 35178.88,
        is_external_deposit: true,
        should_show_raise: false,
        should_show_deposit: true
      }
    ]);
    var row = _displayMovements[0];
    var flow = _displayTreasuryFlowForTime(${depositBucketTs});
    result = {
      launchWindowHeuristic: _displayMovementIsInitialRaiseLikeDeposit(row, false),
      explicitExternal: _displayMovementIsExplicitExternalDeposit(row),
      raise: _displayMovementIsRaiseDeposit(row),
      deposit: _displayMovementIsOperationalDeposit(row),
      daoInflow: flow.daoInflow
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    launchWindowHeuristic: true,
    explicitExternal: true,
    raise: false,
    deposit: true,
    daoInflow: 35178.88
  });
});

test('P2P operator budget return is a treasury deposit without external-capital classification', () => {
  const bucket = Math.floor(Date.parse('2026-07-01T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    _lwPriceCache = [{ time: ${bucket}, value: 0.45 }];
    _lwNavHistory = [{ time: ${bucket}, value: 0.54 }];
    _displayMovements = _normalizeDisplayMovements([{
      bucket_time: ${bucket},
      event_time: ${bucket + 29889},
      marker_kind: 'operator_budget_reversal',
      transfer_type: 'operator_budget_reversal',
      spend_treatment: 'treasury_return',
      value_treatment: 'treasury_return',
      display_kind: 'treasury_return',
      nav_treatment: 'treasury_return',
      effect: 'deposit',
      account_label: 'DAO Treasury',
      account_role: 'dao_treasury',
      account_key: 'dao_treasury',
      parent_from_label: 'P2P monthly operating budget',
      parent_to_label: 'DAO Treasury',
      display_section: 'treasury',
      asset: 'USDC',
      amount_usdc: 7168,
      is_external_deposit: false,
      should_show_raise: false,
      should_show_deposit: true
    }]);
    var row = _displayMovements[0];
    var flow = _displayTreasuryFlowForTime(${bucket});
    result = {
      treasuryReturn: _displayMovementIsTreasuryReturn(row),
      raise: _displayMovementIsRaiseDeposit(row),
      deposit: _displayMovementIsOperationalDeposit(row),
      external: row.isExternalDeposit,
      daoInflow: flow.daoInflow
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    treasuryReturn: true,
    raise: false,
    deposit: true,
    external: false,
    daoInflow: 7168
  });
});

test('chart deposit display hides dust relative to treasury size', () => {
  const day = Math.floor(Date.parse('2026-03-05T00:00:00Z') / 1000);
  const makeRow = (amount) => ({
    bucket_time: day,
    event_time: day + 3600,
    marker_kind: 'deposit',
    transfer_type: 'deposit',
    effect: 'deposit',
    account_label: 'DAO Treasury',
    account_role: 'dao_treasury',
    account_key: 'dao_treasury',
    display_section: 'treasury',
    asset: 'USDC',
    amount_usdc: amount
  });
  const sandbox = loadHelpers(`
    CFG.treasuryUSDC = 6000000;
    _chartTF = '1D';
    _lwPriceCache = [{ time: ${day - 86400}, value: 1 }, { time: ${day}, value: 1 }];
    _lwNavHistory = _lwPriceCache.slice();
    _displayMovements = _normalizeDisplayMovements(${JSON.stringify([
      makeRow(1),
      makeRow(500),
      makeRow(600),
      makeRow(1000)
    ])});
    result = {
      floor: _depositDisplayMinUsd(),
      visible: _displayMovements.map(function(row) { return _displayMovementIsOperationalDeposit(row); })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    floor: 600,
    visible: [false, false, true, true]
  });
});

test('buyback transfer deposits are excluded from deposit display counts', () => {
  const bucket = Math.floor(Date.parse('2026-03-26T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    _lwPriceCache = [{ time: ${bucket}, value: 1 }];
    _lwNavHistory = [{ time: ${bucket}, value: 1 }];
    _getRecommendedNavResolution = function() { return '1D'; };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${bucket},
        event_time: ${bucket} + 3600,
        marker_kind: 'transfer',
        transfer_type: 'internal_transfer',
        effect: 'deposit',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 7000
      },
      {
        bucket_time: ${bucket},
        event_time: ${bucket} + 7200,
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 1000
      }
    ]);
    result = {
      buybackDeposit: _displayMovementIsBuybackTransferDeposit(_displayMovements[0]),
      normalDeposit: _displayMovementIsBuybackTransferDeposit(_displayMovements[1]),
      budget: _displayBuybackBudgetForTime(${bucket}),
      flow: _displayTreasuryFlowForTime(${bucket})
    };
  `);

  assert.equal(sandbox.result.buybackDeposit, true);
  assert.equal(sandbox.result.normalDeposit, false);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.budget)), {
    remaining: 7000,
    total: 7000
  });
  assert.equal(sandbox.result.flow.poolInflows.buyback, undefined);
});

test('explicit movement spends and deposits feed top overlay totals with custom account keys', () => {
  const bucket = Math.floor(Date.parse('2026-05-12T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    _lwPriceCache = [{ time: ${bucket}, value: 1 }];
    _lwNavHistory = [{ time: ${bucket}, value: 1 }];
    _getRecommendedNavResolution = function() { return '1D'; };
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${bucket},
        event_time: ${bucket} + 1800,
        marker_kind: 'withdrawal',
        transfer_type: 'withdrawal',
        effect: 'withdrawal',
        account_label: 'Ops Wallet',
        account_role: 'operator_wallet',
        account_key: 'ops_wallet',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 1500,
        should_show_withdrawal: true
      },
      {
        bucket_time: ${bucket},
        event_time: ${bucket} + 3600,
        marker_kind: 'deposit',
        transfer_type: 'deposit',
        effect: 'deposit',
        account_label: 'External Deposit Wallet',
        account_role: 'external_wallet',
        account_key: 'external_deposit_wallet',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 2200,
        should_show_deposit: true
      }
    ]);
    result = {
      spend: _displayMovementIsOperationalWithdrawal(_displayMovements[0]),
      deposit: _displayMovementIsOperationalDeposit(_displayMovements[1]),
      flow: _displayTreasuryFlowForTime(${bucket})
    };
  `);

  assert.equal(sandbox.result.spend, true);
  assert.equal(sandbox.result.deposit, true);
  assert.equal(sandbox.result.flow.daoOutflow, 1500);
  assert.equal(sandbox.result.flow.daoInflow, 2200);
  assert.equal(sandbox.result.flow.daoOutflows.ops_wallet, 1500);
  assert.equal(sandbox.result.flow.daoInflows.external_deposit_wallet, 2200);
  assert.equal(sandbox.result.flow.poolOutflows.ops_wallet, undefined);
  assert.equal(sandbox.result.flow.poolInflows.external_deposit_wallet, undefined);
});

test('allowance transfers feed chart withdrawal month totals when movement row is absent', () => {
  const sandbox = loadHelpers(`
    result = _allowanceWithdrawalMonthTotals({
      monthlyAllowance: 175000,
      transfers: [
        { tx_date: '2026-05-01T14:05:15+00:00', amount: 175000, signature: 'runway-payment' },
        { tx_date: '2026-05-20T00:00:00+00:00', amount: 25000, signature: 'already-in-movements' },
        { tx_date: '2026-06-01T00:00:00+00:00', amount: 12500, signature: 'june-payment' },
        { tx_date: '2026-06-02T00:00:00+00:00', amount: 50000, signature: 'internal-hop', transfer_type: 'internal_transfer', is_operational_spend: false },
        { tx_date: '2026-06-03T00:00:00+00:00', amount: 250000, signature: 'legacy-transfer-over-cap' }
      ]
    }, { 'already-in-movements': true });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    totals: {
      '2026-05': 175000,
      '2026-06': 12500
    },
    monthFirstTs: {
      '2026-05': 1777593600,
      '2026-06': 1780272000
    }
  });
});

test('buyback execution rows stay out of vault transfer totals and render directional legs', () => {
  const sandbox = loadHelpers(`
    fmtM = function(n) {
      return n >= 1000 ? '$' + (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'K' : '$' + Math.round(n);
    };
    _overlaySplitLevel = 2;
    _chartTF = '1D';
    var bucket = 1774483200;
    var finalBucket = 1774742400;
    var orphanBucket = 1774828800;
    CFG = {
      daoWallet: 'dao',
      buybackWallet: 'buyback-wallet-address',
      buybackTokenBalance: 57000,
      futAmm: 'fut1',
      historyQuality: {}
    };
    _lwNavHistory = [
      { time: bucket, value: 0.1 },
      { time: 1774569600, value: 0.1 },
      { time: 1774656000, value: 0.1 },
      { time: finalBucket, value: 0.1 },
      { time: orphanBucket, value: 0.1 }
    ];
    _lwPriceCache = _lwNavHistory.slice();
    _lwTreasuryHistory = [
      { time: bucket, treasury: 50000, daoUSDC: 43000, buybackUSDC: 6800, futUSDC: 200 },
      { time: finalBucket, treasury: 50000, daoUSDC: 43000, buybackUSDC: 0, futUSDC: 200 },
      { time: orphanBucket, treasury: 50000, daoUSDC: 43000, buybackUSDC: 6800, futUSDC: 200, meteoraPools: [
        { label: 'MET1', poolAddress: 'met1-pool', tokens: 1000000, usdc: 1000 }
      ] }
    ];
    _buybackHourly = [];
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: bucket,
        event_time: bucket + 3600,
        marker_kind: 'transfer',
        transfer_type: 'internal_transfer',
        effect: 'withdrawal',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 7000
      },
      {
        bucket_time: bucket,
        event_time: bucket + 3600,
        marker_kind: 'transfer',
        transfer_type: 'internal_transfer',
        effect: 'deposit',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 7000,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: 1774569600,
        event_time: 1774569600 + 7200,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 2400,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: 1774656000,
        event_time: 1774656000 + 7200,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 2400,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: finalBucket,
        event_time: finalBucket + 7200,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 2000,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: finalBucket,
        event_time: finalBucket + 7400,
        marker_kind: 'transfer',
        transfer_type: 'return',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 57000,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: finalBucket,
        event_time: finalBucket + 7600,
        marker_kind: 'transfer',
        transfer_type: 'inventory_return',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'supply',
        asset: 'FUTARDIO',
        asset_type: 'token',
        token_amount: 57000,
        asset_amount: 57000,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: bucket,
        event_time: bucket + 7200,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 200,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: bucket,
        event_time: bucket + 7200,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'deposit',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'supply',
        asset: 'FUTARDIO',
        asset_type: 'token',
        token_amount: 35314.87,
        asset_amount: 35314.87
      }
    ]);
    _getRecommendedNavResolution = function() { return '1D'; };
    applyDaoMarkers = function() {};
    var span = function(color, txt) { return '[' + color + ']' + txt + '[/]'; };
    var treasuryFlow = _treasuryFlowForTime(bucket);
    var supplyFlow = _supplyFlowForTime(bucket);
    var finalTreasuryFlow = _treasuryFlowForTime(finalBucket);
    var finalSupplyFlow = _supplyFlowForTime(finalBucket);
    _buybackHourly = [{
      time: new Date(orphanBucket * 1000).toISOString(),
      usdcSpent: 800,
      tokensBought: 79000
    }];
    var orphanTreasuryFlow = _treasuryFlowForTime(orphanBucket);
    var orphanSupplyFlow = _supplyFlowForTime(orphanBucket);
    result = {
      canonicalBuyback: _canonicalDisplayLabel('Buyback wallet'),
      daoOutflow: _daoOutflowForTime(bucket),
      treasuryFlow: treasuryFlow,
      supplyFlow: supplyFlow,
      treasuryHtml: _overlayTreasurySplitHtml(span, 'M', 'W', _lwTreasuryLookup(bucket), null, _daoOutflowForTime(bucket), treasuryFlow),
      supplyHtml: _overlaySupplySplitHtml(span, 'M', 'W', { time: bucket, daoTokens: 35314.87, futTokens: 0, metTokens: 0 }, supplyFlow),
      finalTreasuryHtml: _overlayTreasurySplitHtml(span, 'M', 'W', _lwTreasuryLookup(finalBucket), null, _daoOutflowForTime(finalBucket), finalTreasuryFlow),
      finalSupplyFlow: finalSupplyFlow,
      finalSupplyHtml: _overlaySupplySplitHtml(span, 'M', 'W', { time: finalBucket, daoTokens: 0, futTokens: 0, metTokens: 0 }, finalSupplyFlow),
      finalBuybackTopHtml: _buybackTopOverlayHtml(span, 'M', 'W', finalBucket),
      finalBuybackSupplyHtml: _buybackSupplyOverlayHtml(span, 'M', 'W', finalBucket),
      orphanSupplyFlow: orphanSupplyFlow,
      orphanTreasuryHtml: _overlayTreasurySplitHtml(span, 'M', 'W', _lwTreasuryLookup(orphanBucket), null, _daoOutflowForTime(orphanBucket), orphanTreasuryFlow),
      orphanSupplyHtml: _overlaySupplySplitHtml(span, 'M', 'W', { time: orphanBucket, daoTokens: 79000, futTokens: 0, metTokens: 0 }, orphanSupplyFlow)
    };
  `);

  assert.equal(sandbox.result.canonicalBuyback, 'Buyback');
  assert.equal(sandbox.result.daoOutflow, 7000);
  assert.equal(sandbox.result.treasuryFlow.daoOutflow, 7000);
  assert.equal(sandbox.result.treasuryFlow.poolInflows.buyback, 7000);
  assert.equal(sandbox.result.treasuryFlow.poolInflows['buyback-wallet-address'], 7000);
  assert.equal(sandbox.result.treasuryFlow.poolOutflows.buyback, 200);
  assert.equal(sandbox.result.treasuryFlow.poolOutflows['buyback-wallet-address'], 200);
  assert.equal(Math.round(sandbox.result.supplyFlow.daoInflow), 35315);
  assert.equal(sandbox.result.treasuryHtml.includes('<->'), false);
  assert.equal(sandbox.result.supplyHtml.includes('<->'), false);
  assert.equal(/Buyback wallet/i.test(sandbox.result.treasuryHtml), false);
  assert.equal(/Buyback wallet/i.test(sandbox.result.supplyHtml), false);
  assert.equal(sandbox.result.treasuryHtml.includes('[#00cc66]\u25B2 $14K[/]'), false);
  assert.equal(sandbox.result.treasuryHtml.includes('[#f04060]\u25BC $7K[/]'), true);
  assert.equal(sandbox.result.treasuryHtml.includes('[#00cc66]\u25B2 $7K[/]'), false);
  assert.equal(sandbox.result.treasuryHtml.includes('[#f04060]\u25BC $200[/]'), true);
  assert.equal(sandbox.result.supplyHtml.includes('[#00cc66]\u25B2 35K[/]'), false);
  assert.equal(sandbox.result.finalTreasuryHtml.includes('[W]$0<span style="color:#566474">/</span>$7K[/]'), false);
  assert.equal(sandbox.result.finalTreasuryHtml.includes('[W]$0[/]'), true);
  assert.equal(sandbox.result.finalTreasuryHtml.includes('[#f04060]\u25BC $2K[/]'), true);
  assert.equal(sandbox.result.finalTreasuryHtml.includes('[#f04060]\u25BC $57K[/]'), false);
  assert.equal(sandbox.result.finalBuybackTopHtml.includes('[#f04060]\u25BC $2K[/]'), true);
  assert.equal(sandbox.result.finalBuybackTopHtml.includes('[#f04060]\u25BC $57K[/]'), false);
  assert.equal(sandbox.result.finalSupplyFlow.poolOutflows.buyback, undefined);
  assert.equal(sandbox.result.finalSupplyFlow.poolOutflows['buyback-wallet-address'], undefined);
  assert.equal(sandbox.result.finalSupplyHtml.includes('[#f04060]\u25BC 57K[/]'), false);
  assert.equal(sandbox.result.finalBuybackSupplyHtml, '[M]Buyback [/][W]57K[/]');
  assert.equal(sandbox.result.orphanSupplyFlow.daoInflow, 0);
  assert.equal(sandbox.result.orphanSupplyFlow.poolInflows['met1-pool'], undefined);
  assert.equal(sandbox.result.orphanTreasuryHtml.includes('[#f04060]\u25BC $800[/]'), false);
  assert.equal(sandbox.result.orphanSupplyHtml.includes('[#00cc66]\u25B2 79K[/]'), false);
});

test('p2p final buyback dust row shows zero remaining budget', () => {
  const fundingBucket = Math.floor(Date.parse('2026-04-06T00:00:00Z') / 1000);
  const priorBucket = Math.floor(Date.parse('2026-05-05T00:00:00Z') / 1000);
  const finalBucket = Math.floor(Date.parse('2026-05-06T00:00:00Z') / 1000);
  const sandbox = loadHelpers(`
    fmtM = function(n) {
      return n >= 1000 ? '$' + (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'K' : '$' + Math.round(n);
    };
    _chartTF = '1D';
    _overlaySplitLevel = 2;
    CFG = {
      daoWallet: 'dao',
      buybackWallet: 'buyback-wallet-address',
      futAmm: 'fut1',
      historyQuality: {}
    };
    _lwNavHistory = [
      { time: ${fundingBucket}, value: 0.57 },
      { time: ${priorBucket}, value: 0.57 },
      { time: ${finalBucket}, value: 0.57 }
    ];
    _lwPriceCache = _lwNavHistory.slice();
    _lwTreasuryHistory = [
      { time: ${finalBucket}, treasury: 5089799.14, daoUSDC: 5089795.94, buybackUSDC: 3.2, futUSDC: 0 }
    ];
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: ${fundingBucket},
        event_time: ${fundingBucket} + 3600,
        marker_kind: 'transfer',
        transfer_type: 'internal_transfer',
        effect: 'deposit',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 500000,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: ${priorBucket},
        event_time: ${priorBucket} + 7200,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 487786.23,
        address: 'buyback-wallet-address'
      },
      {
        bucket_time: ${finalBucket},
        event_time: ${finalBucket} + 7200,
        marker_kind: 'buyback',
        transfer_type: 'buyback_execution',
        effect: 'withdrawal',
        account_label: 'Buyback',
        account_role: 'buyback_wallet',
        account_key: 'buyback',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 12210.57,
        address: 'buyback-wallet-address'
      }
    ]);
    _getRecommendedNavResolution = function() { return '1D'; };
    var span = function(color, txt) { return '[' + color + ']' + txt + '[/]'; };
    var flow = _treasuryFlowForTime(${finalBucket});
    result = {
      budget: _displayBuybackBudgetForTime(${finalBucket}),
      spend: _displayBuybackSpendForTime(${finalBucket}),
      topHtml: _buybackTopOverlayHtml(span, 'M', 'W', ${finalBucket}),
      expandedHtml: _overlayTreasurySplitHtml(span, 'M', 'W', _lwTreasuryLookup(${finalBucket}), null, _daoOutflowForTime(${finalBucket}), flow)
    };
  `);

  assert.equal(Math.round(sandbox.result.budget.remaining * 10) / 10, 3.2);
  assert.equal(Math.round(sandbox.result.spend * 100) / 100, 24421.14);
  assert.equal(sandbox.result.topHtml.includes('[W]$0[/]'), true);
  assert.equal(sandbox.result.topHtml.includes('[W]$3[/]'), false);
  assert.equal(sandbox.result.topHtml.includes('[#f04060]\u25BC $12.2K[/]'), true);
  assert.equal(sandbox.result.expandedHtml.includes('Buyback [/][W]$0[/]'), true);
  assert.equal(sandbox.result.expandedHtml.includes('[M]Buyback [/][W]$3[/]'), false);
  assert.equal(sandbox.result.expandedHtml.includes('[#f04060]\u25BC $12.2K[/]'), true);
});

test('display-ready movement section USDC legs feed treasury overlay flows', () => {
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    var bucket = 1776211200;
    _lwNavHistory = [{ time: bucket, value: 0.1 }];
    _displayMovements = _normalizeDisplayMovements([
      {
        bucket_time: bucket,
        effect: 'withdrawal',
        account_label: 'DAO Treasury',
        account_role: 'dao_treasury',
        account_key: 'dao_treasury',
        display_section: 'treasury',
        asset: 'USDC',
        amount_usdc: 2976
      },
      {
        bucket_time: bucket,
        effect: 'deposit',
        account_label: 'MET2',
        account_key: 'met2',
        display_section: 'movement',
        asset: 'USDC',
        amount_usdc: 2976,
        pool_address: 'met2-pool'
      }
    ]);
    result = _treasuryFlowForTime(bucket);
  `);

  assert.equal(sandbox.result.daoOutflow, 2976);
  assert.equal(sandbox.result.poolInflows.met2, 2976);
  assert.equal(sandbox.result.poolInflows['met2-pool'], 2976);
});

test('legacy activity movement inference paths are deleted', () => {
  [
    'function fetchMovements(',
    '_movementTransfersRaw',
    '_movementKnownWallets',
    '_movementKind(',
    '_buildDaoMarkersFromNavTransfers',
    '_transferOverlayLineHtml',
    '_supplyTransferOverlayLineHtml',
    '_meteoraPoolTokenGainAtTime',
    '_daoTransfers',
    '_daoWithdrawals'
  ].forEach((needle) => {
    assert.equal(source.includes(needle), false, needle);
  });
});

test('volume display floor hides sub-$100 values', () => {
  const sandbox = loadHelpers(`
    result = {
      zero: _volumeUsdDisplayValue(0),
      dust: _volumeUsdDisplayValue(10),
      edge: _volumeUsdDisplayValue(100),
      larger: _volumeUsdDisplayValue(250)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    zero: 0,
    dust: 0,
    edge: 100,
    larger: 250,
  });
});

test('overlay treasury split hides sub-$100 buyback balances', () => {
  const sandbox = loadHelpers(`
    _overlaySplitLevel = 1;
    _overlaySplitsExpanded = true;
    fmtM = function(n) { return '$' + Math.round(n); };
    result = {
      hidden: _overlayTreasurySplitHtml(function(_, text) { return '[' + text + ']'; }, '', '', {
        treasury: 1000,
        buybackUSDC: 10
      }),
      shown: _overlayTreasurySplitHtml(function(_, text) { return '[' + text + ']'; }, '', '', {
        treasury: 1000,
        buybackUSDC: 150
      })
    };
  `);

  assert.equal(sandbox.result.hidden.includes('Buyback'), false);
  assert.equal(sandbox.result.shown.includes('Buyback'), true);
});

test('token config keeps fallback socials and launchpad when backend sends empty values', () => {
  const sandbox = loadHelpers(`
    CFG = {
      website: 'https://askloyal.com',
      twitter: 'https://x.com/loyal_hq',
      telegram: 'https://t.me/loyal_tgchat',
      launchpad: 'Curated'
    };
    hydrateConfig({
      website: null,
      twitter: '',
      telegram: undefined,
      launchpad: null
    });
    result = {
      website: CFG.website,
      twitter: CFG.twitter,
      telegram: CFG.telegram,
      launchpad: CFG.launchpad,
      hydratedByConfigOnly: _tokenConfigHydrated
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    website: 'https://askloyal.com',
    twitter: 'https://x.com/loyal_hq',
    telegram: 'https://t.me/loyal_tgchat',
    launchpad: 'Curated',
    hydratedByConfigOnly: false,
  });
});

test('token config hydrates backend logo field', () => {
  const sandbox = loadHelpers(`
    CFG = { logo: null };
    hydrateConfig({
      logo: 'https://example.test/mtn.png'
    });
    result = {
      logo: CFG.logo,
      hydrated: _tokenConfigHydrated
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    logo: 'https://example.test/mtn.png',
    hydrated: true,
  });
});

test('token config hydrates initial and future raise fields', () => {
  const sandbox = loadHelpers(`
    CFG = {};
    hydrateConfig({
      fundsAccepted: 1118102,
      initialRaiseUsd: 1118102,
      futureRaiseUsd: 350000.01,
      totalRaiseUsd: 1468102.01,
      futureRaises: [{ id: 'omfg-prop3-raise', amountUsd: 350000.01 }],
      raiseBreakdown: { totalRaiseUsd: 1468102.01 }
    });
    result = {
      fundsAccepted: CFG.fundsAccepted,
      initialRaiseUsd: CFG.initialRaiseUsd,
      futureRaiseUsd: CFG.futureRaiseUsd,
      totalRaiseUsd: CFG.totalRaiseUsd,
      futureRaiseCount: CFG.futureRaises.length,
      raiseBreakdownTotal: CFG.raiseBreakdown.totalRaiseUsd
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    fundsAccepted: 1118102,
    initialRaiseUsd: 1118102,
    futureRaiseUsd: 350000.01,
    totalRaiseUsd: 1468102.01,
    futureRaiseCount: 1,
    raiseBreakdownTotal: 1468102.01
  });
});

test('token config keeps current project LP fee when backend sends null', () => {
  const sandbox = loadHelpers(`
    CFG = { projectLpFeeUSDC: 42, projectLpFeeTokens: 84, meteoraProtocolFeeUSDC: 7 };
    hydrateConfig({ project_lp_fee_usdc: null, project_lp_fee_tokens: null, meteora_protocol_fee_usdc: null });
    var afterNull = CFG.projectLpFeeUSDC;
    var afterNullTokens = CFG.projectLpFeeTokens;
    var afterNullProtocol = CFG.meteoraProtocolFeeUSDC;
    hydrateConfig({ projectLpFeeUSDC: 0, projectLpFeeTokens: 0, meteoraProtocolFeeUSDC: 0 });
    var afterZero = {
      usdc: CFG.projectLpFeeUSDC,
      tokens: CFG.projectLpFeeTokens,
      protocolUsdc: CFG.meteoraProtocolFeeUSDC
    };
    hydrateConfig({ projectLpFeeUsdc: 17, projectLpFeeToks: 34, meteoraProtocolFeeUsdc: 19 });
    result = {
      afterNull: afterNull,
      afterNullTokens: afterNullTokens,
      afterNullProtocol: afterNullProtocol,
      afterZero: afterZero,
      afterAlias: {
        usdc: CFG.projectLpFeeUSDC,
        tokens: CFG.projectLpFeeTokens,
        protocolUsdc: CFG.meteoraProtocolFeeUSDC
      }
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    afterNull: 42,
    afterNullTokens: 84,
    afterNullProtocol: 7,
    afterZero: {
      usdc: 0,
      tokens: 0,
      protocolUsdc: 0,
    },
    afterAlias: {
      usdc: 17,
      tokens: 34,
      protocolUsdc: 19,
    },
  });
});

test('DAO-owned USD fee helper includes Meteora protocol USDC fees', () => {
  const sandbox = loadHelpers(`
    result = {
      protocol: _meteoraProtocolFeeUSDCForCfg({ meteoraProtocolFeeUSDC: 50.3 }),
      protocolSnake: _meteoraProtocolFeeUSDCForCfg({ meteora_protocol_fee_usdc: 50.3 }),
      total: _daoOwnedUsdFeesForCfg({ projectLpFeeUSDC: 10, meteoraProtocolFeeUSDC: 50.3 })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    protocol: 50.3,
    protocolSnake: 50.3,
    total: 60.3,
  });
});

test('top overlay accrued fees are limited to Umbra and Omnipair DAO-owned LP fees', () => {
  const span = (color, text) => `<${color}>${text}</${color}>`;
  const sandbox = loadHelpers(`
    _lwTreasuryHistory = [
      { time: 100, treasury: 1000, effSupply: 100, projectLpFeeUSDC: 11, projectLpFeeTokens: 22, meteoraProtocolFeeUSDC: 2 },
      { time: 200, treasury: 1000, effSupply: 100, projectLpFeeUSDC: 30, projectLpFeeTokens: 66, meteoraProtocolFeeUSDC: 4 }
    ];
    result = {
      enabled: _overlayDaoOwnedLpFeesEnabled(),
      futardioEnabled: (function() {
        var oldKey = tokenKey;
        var oldCfg = CFG;
        tokenKey = 'futardio';
        CFG = { ticker: 'FUTARDIO', name: 'Futardio Cult' };
        var enabled = _overlayDaoOwnedLpFeesEnabled();
        tokenKey = oldKey;
        CFG = oldCfg;
        return enabled;
      })(),
      current: _overlayDaoUsdFees(null),
      historical: _overlayDaoUsdFees(200),
      html: _overlayFeesLineHtml(span, 'M', 'W', 200)
    };
  `, {
    tokenKey: 'omfg',
    CFG: { ticker: 'OMFG', projectLpFeeUSDC: 42, projectLpFeeTokens: 84, meteoraProtocolFeeUSDC: 8 },
    span,
    fmtM: (n) => '$' + Number(n).toFixed(0),
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    enabled: true,
    futardioEnabled: true,
    current: 42,
    historical: 30,
    html: '<br><M>Accrued Fees </M><W>$30 / 66 OMFG</W>',
  });

  const disabled = loadHelpers(`
    result = _overlayFeesLineHtml(span, 'M', 'W', null);
  `, {
    tokenKey: 'solo',
    CFG: { ticker: 'SOLO', projectLpFeeUSDC: 42, meteoraProtocolFeeUSDC: 8 },
    span,
    fmtM: (n) => '$' + Number(n).toFixed(0),
  });

  assert.equal(disabled.result, '');
});

test('top overlay accrued fees read explicit DAO LP pending fields only', () => {
  const sandbox = loadHelpers(`
    result = {
      explicit: _overlayDaoOwnedLpPendingFeeUsdForCfg({ projectLpFeeUSDC: 12 }),
      explicitPair: _overlayDaoOwnedLpPendingFeesForCfg({ projectLpFeeUSDC: 12, projectLpFeeTokens: 34 }),
      projectPool: _overlayDaoOwnedLpPendingFeeUsdForCfg({
        meteoraPools: [{ poolAddress: 'pool-a', pendingFeeUSDC: 10, pendingFeeTokens: 20, projectUsdcShare: 0.5 }]
      }),
      projectPoolPair: _overlayDaoOwnedLpPendingFeesForCfg({
        meteoraPools: [{ poolAddress: 'pool-a', pendingFeeUSDC: 10, pendingFeeTokens: 20, projectUsdcShare: 0.5 }]
      }),
      derivedProjectPoolPair: _overlayDaoOwnedLpPendingFeesForCfg({
        meteoraPools: [{
          poolAddress: 'pool-a',
          totalUSDC: 5580.56,
          principalUSDC: 5236.7,
          totalTokens: 408787.1,
          principalTokens: 338390.9,
          poolType: 'dlmm',
          ownershipMode: 'project',
          projectUsdcShare: 1
        }]
      }),
      nonProjectPool: _overlayDaoOwnedLpPendingFeeUsdForCfg({
        meteoraPools: [{ poolAddress: 'pool-a', pendingFeeUSDC: 10, ownershipMode: 'metadao', projectUsdcShare: 0 }]
      })
    };
  `, {
    tokenKey: 'umbra',
    CFG: { ticker: 'UMBRA' },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    explicit: 12,
    explicitPair: { usd: 12, tokens: 34 },
    projectPool: 5,
    projectPoolPair: { usd: 5, tokens: 10 },
    derivedProjectPoolPair: { usd: 343.8600000000006, tokens: 70396.19999999995 },
    nonProjectPool: 0,
  });
});

test('top overlay accrued fees fallback reads only Meteora DAO-owned LP history', () => {
  const sandbox = loadHelpers(`
    _overlayDaoOwnedLpFeePools = _overlayDaoOwnedLpFeePoolsFromPayload({
      data: {
        pools: {
          futamm: { ownershipMode: 'project', data: [{ time: 100, cumFeeUsdc: 700 }] },
          meteora: { ownershipMode: 'metadao', data: [
            { time: 100, cumFeeUsdc: 7, cumFeeTokens: 70 },
            { time: 200, cumFeeUsdc: 11, cumFeeTokens: 1100 }
          ] }
        }
      }
    });
    var blocked = _overlayDaoOwnedLpFeePoolsFromPayload({
      data: { pools: { meteora: { ownershipMode: 'external', data: [{ time: 100, cumFeeUsdc: 5 }] } } }
    });
    var mixed = _overlayDaoOwnedLpFeePoolsFromPayload({
      data: { pools: { meteora: { ownershipMode: 'mixed', daoLpShare: 1, data: [{ time: 100, cumFeeUsdc: 500 }] } } }
    });
    result = {
      before: _overlayDaoUsdFees(150),
      current: _overlayDaoUsdFees(null),
      amounts: _overlayDaoFeeAmounts(null),
      html: _overlayFeesLineHtml(span, 'M', 'W', null),
      blockedCount: blocked.length,
      mixedCount: mixed.length
    };
  `, {
    tokenKey: 'umbra',
    CFG: { ticker: 'UMBRA' },
    span: (color, text) => `<${color}>${text}</${color}>`,
    fmtM: (n) => '$' + Number(n).toFixed(0),
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    before: 7,
    current: 11,
    amounts: { usd: 11, tokens: 1100 },
    html: '<br><M>Accrued Fees </M><W>$11 / 1.1K UMBRA</W>',
    blockedCount: 0,
    mixedCount: 0,
  });
});

test('compact NAV history carries DAO LP fee backfill arrays into hover rows', () => {
  const sandbox = loadHelpers(`
    _chartTF = '1m';
    var rows = _expandCompactNavHistoryRows({
      t: [100, 200],
      nav: [0.1, 0.2],
      treasury: [1000, 1200],
      supply: [10000, 10000],
      daoLpFeeUSDC: [3.5, 7.25],
      daoLpFeeTokens: [300, 900]
    });
    _lwTreasuryHistory = rows.map(function(d) {
      return {
        time: d.ts,
        treasury: d.treasury_usdc,
        effSupply: d.effective_supply,
        daoOwnedLpFeeUSDC: d.dao_owned_lp_fee_usdc,
        daoOwnedLpFeeTokens: d.dao_owned_lp_fee_tokens
      };
    });
    result = {
      first: _overlayDaoFeeAmounts(100),
      second: _overlayDaoFeeAmounts(200)
    };
  `, {
    tokenKey: 'futardio',
    CFG: { ticker: 'FUTARDIO' },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    first: { usd: 3.5, tokens: 300 },
    second: { usd: 7.25, tokens: 900 },
  });
});

test('compact ARL history preserves the documented launch NAV marker', () => {
  const sandbox = loadHelpers(`
    result = _expandCompactNavHistoryRows({
      t: [1782172800, 1782259200, 1782345600],
      nav: [0.0009174312248734968, 0.0010385670467292958, 0.0009942026101369932],
      spot: [0.001, 0.00499, 0.00355415785809758],
      synthetic_pre_tge_nav: [true, false, false]
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    {
      ts: 1782172800,
      nav: 0.0009174312248734968,
      spot: 0.001,
      synthetic_pre_tge_nav: true,
      syntheticPreTgeNav: true,
    },
    { ts: 1782259200, nav: 0.0010385670467292958, spot: 0.00499 },
    { ts: 1782345600, nav: 0.0009942026101369932, spot: 0.00355415785809758 },
  ]);
});

test('Futardio history requests detail rows for stored proposal vault correction', () => {
  const sandbox = loadHelpers(`
    result = {
      futardio: _navHistoryUrl('1D', 'futardio'),
      solo: _navHistoryUrl('1D', 'solo'),
      rawr: _navHistoryUrl('1D', 'rawr'),
      faf: _navHistoryUrl('1D', 'faf'),
      avici: _navHistoryUrl('1D', 'avici'),
      p2p: _navHistoryUrl('1D', 'p2p'),
      umbra: _navHistoryUrl('1D', 'umbra'),
      omfg: _navHistoryUrl('1D', 'omfg'),
      loyal: _navHistoryUrl('1D', 'loyal'),
      pays: _navHistoryUrl('1D', 'pays'),
      gsim: _navHistoryUrl('1D', 'gsim'),
      super: _navHistoryUrl('1D', 'super'),
      zkfg: _navHistoryUrl('1D', 'zkfg'),
      arl: _navHistoryUrl('1D', 'arl'),
      needsCorrection: _navHistoryNeedsStoredProposalCorrection('futario'),
      doesNotNeedCorrection: _navHistoryNeedsStoredProposalCorrection('solo')
    };
  `, {
    API_BASE: 'https://api.test',
    tokenKey: 'futardio',
  });

  assert.equal(
    sandbox.result.futardio,
    'https://api.test/api/historic-nav?token=futardio&days=730&resolution=1D&detail=1&events=summary'
  );
  assert.equal(
    sandbox.result.solo,
    'https://api.test/api/historic-nav?token=solo&days=730&resolution=1D&detail=1&events=summary'
  );
  assert.equal(
    sandbox.result.rawr,
    'https://api.test/api/historic-nav?token=rawr&days=730&resolution=1D&cache=0&clientVersion=20260709-rawr-tge-raise-v4&detail=1&events=summary'
  );
  assert.equal(
    sandbox.result.faf,
    'https://api.test/api/historic-nav?token=faf&days=730&resolution=1D&cache=0&clientVersion=20260627-faf-active-nav-v2&detail=1&events=summary'
  );
  assert.equal(
    sandbox.result.avici,
    'https://api.test/api/historic-nav?token=avici&days=730&resolution=1D&detail=1&events=summary'
  );
  ['p2p', 'umbra', 'omfg', 'loyal', 'pays', 'gsim', 'super', 'zkfg'].forEach(function(key) {
    assert.equal(
      sandbox.result[key],
      'https://api.test/api/historic-nav?token=' + key + '&days=730&resolution=1D&detail=1&events=summary'
    );
  });
  assert.equal(
    sandbox.result.arl,
    'https://api.test/api/historic-nav?token=arl&days=730&resolution=1D&cache=0&clientVersion=20260706-arl-hover-v1&detail=1&events=summary'
  );
  assert.equal(sandbox.result.needsCorrection, true);
  assert.equal(sandbox.result.doesNotNeedCorrection, false);
});

test('split treasury configs request detailed history rows for active token', () => {
  const sandbox = loadHelpers(`
    function urlFor(cfg) {
      tokenKey = 'custom';
      CFG = cfg;
      return _navHistoryUrl('1D');
    }
    result = {
      fut: urlFor({ futAmm: 'amm-address' }),
      met: urlFor({ meteoraPools: [{ poolAddress: 'pool-address' }] }),
      buyback: urlFor({ buybackWallet: 'wallet-address' }),
      multiDao: urlFor({ daoBreakdown: [{ address: 'dao' }, { address: 'multisig' }] }),
      plain: urlFor({ ticker: 'CUSTOM' })
    };
  `, {
    API_BASE: 'https://api.test',
    tokenKey: 'custom',
  });

  assert.equal(
    sandbox.result.fut,
    'https://api.test/api/historic-nav?token=custom&days=730&resolution=1D&detail=1&events=summary'
  );
  assert.equal(sandbox.result.met, sandbox.result.fut);
  assert.equal(sandbox.result.buyback, sandbox.result.fut);
  assert.equal(sandbox.result.multiDao, sandbox.result.fut);
  assert.equal(
    sandbox.result.plain,
    'https://api.test/api/historic-nav?token=custom&days=730&resolution=1D&view=chart&events=summary'
  );
});

test('FAF compact treasury-only rows are classified as FutAMM, not DAO treasury', () => {
  const sandbox = loadHelpers(`
    var _displayMovements = [];
    _chartTF = '1D';
    CFG = {
      live: false,
      ticker: 'FAF',
      daoWallet: null,
      futAmm: 'Gxvt2wKNiDZcnEK8GQ6Cyb8x1Kvm4nm2kT2itDmYdEFa',
      futAmmLabel: 'FUT1'
    };
    _lwTreasuryHistory = [
      { time: 1782518400, treasury: 221014.57, effSupply: 928730988, buybackUSDC: 0 }
    ];
    result = _treasuryComponentDataFromHistory().map(function(component) {
      return {
        key: component.key,
        label: component.label,
        tail: component.rawData[component.rawData.length - 1]
      };
    });
  `, {
    tokenKey: 'faf',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    {
      key: 'fut:gxvt2wknidzcnek8gq6cyb8x1kvm4nm2kt2itdmydefa',
      label: 'FUT1',
      tail: { time: 1782518400, value: 221014.57 },
    },
  ]);
});

test('stored proposal vault rows are corrected for chart NAV display', () => {
  const sandbox = loadHelpers(`
    result = {
      inflated: _withStoredProposalVaultNavCorrection({
        ts: 1777852800,
        nav: 0.005976,
        treasury_usdc: 53576.11,
        effective_supply: 8965935,
        dao_usdc: 29474,
        raw_fut_amm_usdc: 9466.55,
        meteora_pool_usdc: 2976,
        proposal_vault_usdc: 11659.56,
        proposal_vault_tokens: 128416
      }),
      alreadyFixed: _withStoredProposalVaultNavCorrection({
        ts: 1777852800,
        nav: 0.004609,
        treasury_usdc: 41916.55,
        effective_supply: 9094351,
        dao_usdc: 29474,
        raw_fut_amm_usdc: 9466.55,
        meteora_pool_usdc: 2976,
        proposal_vault_usdc: 11659.56,
        proposal_vault_tokens: 128416
      })
    };
  `);

  assert.equal(sandbox.result.inflated.treasury_usdc, 41916.55);
  assert.equal(sandbox.result.inflated.effective_supply, 9094351);
  assert.equal(sandbox.result.inflated.nav, 0.004609);
  assert.equal(sandbox.result.inflated.proposal_vault_nav_corrected, true);
  assert.equal(sandbox.result.alreadyFixed.treasury_usdc, 41916.55);
  assert.equal(sandbox.result.alreadyFixed.effective_supply, 9094351);
  assert.equal(sandbox.result.alreadyFixed.nav, 0.004609);
  assert.equal(sandbox.result.alreadyFixed.proposal_vault_nav_corrected, undefined);
});

test('token config hydrates multi-pool Meteora fields', () => {
  const sandbox = loadHelpers(`
    CFG = {};
    hydrateConfig({
      meteoraInitialTokens: 900000,
      daoMeteoraPools: [
        { poolAddress: 'met-lp-2', vaultToken: 'met-token-2', vaultUsdc: 'met-usdc-2' }
      ]
    });
    result = {
      initialTokens: CFG.meteoraInitialTokens,
      poolCount: CFG.daoMeteoraPools.length,
      poolAddress: CFG.daoMeteoraPools[0].poolAddress
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    initialTokens: 900000,
    poolCount: 1,
    poolAddress: 'met-lp-2',
  });
});

test('LP display labels come from backend label fields', () => {
  const sandbox = loadHelpers(`
    CFG = {};
    hydrateConfig({
      fut_amm_label: 'FUT1',
      raydiumLabel: 'RAY1'
    });
    result = {
      fut: _futAmmDisplayLabel(CFG),
      ray: _raydiumDisplayLabel(CFG),
      meteoraRows: _meteoraLivePoolRowsForCfg({
        meteoraPools: [
          { label: 'MET1', poolAddress: 'met-lp-1', totalTokens: 10 },
          { label: 'MET2', poolAddress: 'met-lp-2', totalTokens: 20 }
        ]
      }).map(function(row) { return row.label; }),
      unlabeledRows: _meteoraLivePoolRowsForCfg({
        meteoraPools: [
          { poolAddress: 'met-lp-1', totalTokens: 10 },
          { poolAddress: 'met-lp-2', totalTokens: 20 }
        ]
      }).map(function(row) { return row.label; }),
      liveSingleTreasuryRows: _meteoraLpTreasuryRowsForCfg({
        daoMeteoraPool: 'met-lp-2',
        meteoraPools: [{ label: 'MET2', poolAddress: 'met-lp-2', totalUSDC: 25 }]
      }, 25, 'met-lp-2').map(function(row) { return row.label; }),
      liveSingleSupplyRows: _meteoraLpSupplyRowsForCfg({
        daoMeteoraPool: 'met-lp-2',
        meteoraPools: [{ label: 'MET2', poolAddress: 'met-lp-2', totalTokens: 10 }]
      }, 10, 0).map(function(row) { return row.label; }),
      overlaySingleLabel: _overlayMetLpLabel({ metPools: [{ label: 'MET1', poolAddress: 'met-lp-1', usdc: 0, tokens: 900000 }] }),
      overlayActiveSecondLabel: _overlayMetLpLabel({ metPools: [
        { label: 'MET1', poolAddress: 'met-lp-1', usdc: 0, tokens: 0 },
        { label: 'MET2', poolAddress: 'met-lp-2', usdc: 25, tokens: 10 }
      ] }),
      overlayActiveRows: _overlayMetPoolsForDisplay({ metPools: [
        { label: 'MET1', poolAddress: 'met-lp-1', usdc: 0, tokens: 0 },
        { label: 'MET2', poolAddress: 'met-lp-2', usdc: 25, tokens: 10 }
      ] }).map(function(row) { return row.label; })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    fut: 'FUT1',
    ray: 'RAY1',
    meteoraRows: ['MET1', 'MET2'],
    unlabeledRows: ['MET', 'MET'],
    liveSingleTreasuryRows: ['MET2'],
    liveSingleSupplyRows: ['MET2'],
    overlaySingleLabel: 'MET1',
    overlayActiveSecondLabel: 'MET2',
    overlayActiveRows: ['MET2']
  });
});

test('current bucket live point aligns to the existing price point', () => {
  const sandbox = loadHelpers(`
    result = _alignCurrentBucketPoint(
      [
        { time: 1775779200, value: 0.75237 },
        { time: 1775865600, value: 0.752401 }
      ],
      [
        { time: 1775779200, value: 0.7027 },
        { time: 1775871000, value: 0.7000 }
      ],
      86400,
      1775871153
    );
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: 1775779200, value: 0.75237 },
    { time: 1775871000, value: 0.752401 },
  ]);
});

test('duplicate current bucket candles collapse into the live candle', () => {
  const sandbox = loadHelpers(`
    result = _collapseCurrentBucketCandles(
      [
        { time: 1775779200, open: 0.70, high: 0.74, low: 0.69, close: 0.73, price: 0.73, volume: 100, volumeUsd: 73 },
        { time: 1775865600, open: 0.73, high: 0.75, low: 0.72, close: 0.74, price: 0.74, volume: 50, volumeUsd: 37 },
        { time: 1775871000, open: 0.74, high: 0.76, low: 0.71, close: 0.70, price: 0.70, volume: 20, volumeUsd: 14 }
      ],
      '1D',
      1775871153
    );
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: 1775779200, open: 0.7, high: 0.74, low: 0.69, close: 0.73, price: 0.73, volume: 100, volumeUsd: 73 },
    { time: 1775865600, open: 0.73, high: 0.76, low: 0.7, close: 0.7, price: 0.7, volume: 70, volumeUsd: 51, volumeTokens: 70, date: '2026-04-11T00:00:00.000Z' }
  ]);
});

test('duplicate current bucket line points keep only the latest visible point', () => {
  const sandbox = loadHelpers(`
    result = _collapseCurrentBucketLinePoints(
      [
        { time: 1775779200, value: 0.70 },
        { time: 1775865600, value: 0.74 },
        { time: 1775871000, value: 0.70 }
      ],
      '1D',
      1775871153
    );
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: 1775779200, value: 0.7 },
    { time: 1775865600, value: 0.7 },
  ]);
});

test('duplicate current bucket volume points merge into the live bucket', () => {
  const sandbox = loadHelpers(`
    result = _collapseCurrentBucketVolumePoints(
      [
        { time: 1775779200, value: 100, color: 'rgba(0,204,102,0.35)' },
        { time: 1775865600, value: 50, color: 'rgba(255,51,51,0.35)' },
        { time: 1775871000, value: 20, color: 'rgba(0,204,102,0.35)' }
      ],
      '1D',
      1775871153
    );
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: 1775779200, value: 100, color: 'rgba(0,204,102,0.35)' },
    { time: 1775865600, value: 70, color: 'rgba(0,204,102,0.35)' },
  ]);
});

test('single current bucket point snaps back to the bucket start', () => {
  const sandbox = loadHelpers(`
    result = {
      line: _collapseCurrentBucketLinePoints(
        [
          { time: 1775779200, value: 0.70 },
          { time: 1775871000, value: 0.69 }
        ],
        '1D',
        1775871153
      ),
      volume: _collapseCurrentBucketVolumePoints(
        [
          { time: 1775779200, value: 100, color: 'rgba(0,204,102,0.35)' },
          { time: 1775871000, value: 20, color: 'rgba(0,204,102,0.35)' }
        ],
        '1D',
        1775871153
      )
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    line: [
      { time: 1775779200, value: 0.7 },
      { time: 1775865600, value: 0.69 },
    ],
    volume: [
      { time: 1775779200, value: 100, color: 'rgba(0,204,102,0.35)' },
      { time: 1775865600, value: 20, color: 'rgba(0,204,102,0.35)' },
    ],
  });
});

test('trend percent formatting omits explicit direction markers', () => {
  const sandbox = loadHelpers(`
    result = {
      up: _formatTrendPct(4.321, 1),
      down: _formatTrendPct(-7.08, 2),
      flat: _formatTrendPct(0, 2)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    up: '4.3%',
    down: '7.08%',
    flat: '0.00%',
  });
});

test('premium and discount stat labels and values are split without sign prefixes', () => {
  const sandbox = loadHelpers(`
    function fmt$(value) { return '$' + Number(value).toFixed(4); }
    result = {
      discountLabel: _premiumDiscountLabel(true, false),
      premiumLabel: _premiumDiscountLabel(false, false),
      discountPctLabel: _premiumDiscountLabel(true, true),
      premiumPctLabel: _premiumDiscountLabel(false, true),
      discountDiff: _formatPremiumDiscountDiff(-0.0522, fmt$),
      premiumDiff: _formatPremiumDiscountDiff(0.0311, fmt$),
      discountPct: _formatPremiumDiscountPct(-6.94),
      premiumPct: _formatPremiumDiscountPct(4.12)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    discountLabel: 'Disc',
    premiumLabel: 'Prem',
    discountPctLabel: 'Disc',
    premiumPctLabel: 'Prem',
    discountDiff: '$0.0522',
    premiumDiff: '$0.0311',
    discountPct: '6.9%',
    premiumPct: '4.1%',
  });
});

test('token page shows treasury and e supply cards in the metric row', () => {
  assert.equal(source.includes('iNAV %<span class="stat-tip'), false);
  assert.equal(source.includes('id="rp-inav-pct"'), false);
  assert.equal(source.includes('id="rp-inav-val"'), false);
  assert.match(source, /class="rp-metric-row"[\s\S]{0,1800}Treasury[\s\S]{0,300}id="rp-pn-diff"[\s\S]{0,600}A\.Supply[\s\S]{0,300}id="rp-pnav-x"/);
  assert.equal(source.includes('body.is-token .rp-hero-stat-label {\n  font-size: 13px !important;\n}'), true);
  assert.equal(source.includes("rpPnDiff.textContent = _navBlocked ? '—' : fmtM(navTreasuryUSDC);"), true);
  assert.match(source, /rpPnavX\.textContent = \(!_navBlocked && supplyForNAV > 1\) \? _formatSupplyCompact\(supplyForNAV\) : '—';/);
  assert.equal(source.includes('id="rp-pnav-x"'), true);
});

test('token page opens the far-right treasury tooltip to the right', () => {
  assert.equal(source.includes('id="rp-pnav-ratio-label" style="font-size:11px;letter-spacing:1px">Treasury<span class="stat-tip below put-tip-right" data-tip="Treasury value used to calculate NAV.">i</span></div>'), true);
  assert.equal(source.includes('id="rp-pnav-ratio-label" style="font-size:11px;letter-spacing:1px">Treasury<span class="stat-tip below put-tip-left" data-tip="Treasury value used to calculate NAV.">i</span></div>'), false);
});

test('token page opens the pair tooltip above without clipping it', () => {
  assert.equal(source.includes('.rp-stat-label .stat-tip.above::after, .stat-tip[data-tip].above::after { top: auto; bottom: calc(100% + 7px); }'), true);
  assert.equal(source.includes('<div style="padding:9px 10px;text-align:center;border-left:1px solid var(--bdr);overflow:visible">\n                <div class="rp-stat-label" style="font-size:12px;letter-spacing:1px;overflow:visible">Pair<span class="stat-tip above put-tip-left" data-tip="Trading pairs available for this token across active liquidity pools.">i</span></div>'), true);
  assert.equal(source.includes('Pair<span class="stat-tip below put-tip-left" data-tip="Trading pairs available for this token across active liquidity pools.">i</span>'), false);
});

test('chart topbar controls do not show focus outlines after click', () => {
  assert.equal(source.includes('.chart-topbar .layer-btn:focus,\n.chart-topbar .layer-btn:focus-visible,\n.chart-topbar .cbtn:focus,\n.chart-topbar .cbtn:focus-visible {\n  outline: none;\n  box-shadow: none;\n}'), true);
});

test('lightweight chart mirrors the TradingView NAV variants control', () => {
  assert.match(source, /id="chart-nav-trigger"[\s\S]{0,240}aria-label="NAV variants"/);
  assert.match(source, /id="chart-nav-menu"[\s\S]{0,1400}Current NAV[\s\S]{0,600}Historic NAV[\s\S]{0,600}Projected NAV/);
  assert.equal(source.includes('function _setChartNavMenuOpen(open, focusSelection)'), true);
  assert.equal(source.includes("var navControls = document.getElementById('chart-nav-control');"), true);
});

test('lightweight chart keeps the Growth icon in the top toolbar', () => {
  assert.equal(source.includes('id="btn-growth-chart-toolbar"'), true);
  assert.match(source, /id="btn-growth-chart-toolbar"[\s\S]{0,900}M2\.5 14\.5h13/);
  assert.equal(source.includes("document.getElementById('btn-growth-chart-toolbar')"), true);
});

test('lightweight price line uses the blue to purple vertical gradient', () => {
  assert.equal(source.includes('function _priceLineVerticalGradient(ctx, pts, opacity)'), true);
  assert.equal(source.includes("gradient.addColorStop(0, 'rgba(168,85,247,' + opacity + ')');"), true);
  assert.equal(source.includes("gradient.addColorStop(1, 'rgba(47,143,255,' + opacity + ')');"), true);
  assert.equal(source.includes("var priceDot = _makeLiveDot('live-dot-price', _isChartEmbed ? _embedChartInk() : '#2f8fff');"), true);
});

test('lightweight NAV line uses a yellow to orange vertical gradient', () => {
  assert.equal(source.includes('function _navLineVerticalGradient(ctx, pts, opacity)'), true);
  assert.equal(source.includes("gradient.addColorStop(0, 'rgba(255,228,92,' + opacity + ')');"), true);
  assert.equal(source.includes("gradient.addColorStop(1, 'rgba(255,138,0,' + opacity + ')');"), true);
});

test('lightweight Price and NAV histories have one consistent stroke owner', () => {
  assert.match(source, /_lwPrice = _lwChart\.addSeries\(LightweightCharts\.AreaSeries, \{[\s\S]*?lineColor: 'rgba\(0,0,0,0\)',[\s\S]*?lineWidth: 0,/);
  assert.match(source, /_lwNav = _lwChart\.addSeries\(LightweightCharts\.LineSeries, \{[\s\S]*?color: 'rgba\(0,0,0,0\)',[\s\S]*?lineWidth: 0,/);
  assert.match(source, /_drawSmoothStroke\(ctx, pricePts, \{[\s\S]*?width: 2,[\s\S]*?smoothness: 0/);
  assert.match(source, /_drawSmoothStroke\(ctx, navPts, \{[\s\S]*?width: 2,[\s\S]*?smoothness: 0/);
  const priceStroke = source.slice(
    source.indexOf('_drawSmoothStroke(ctx, pricePts, {'),
    source.indexOf('});', source.indexOf('_drawSmoothStroke(ctx, pricePts, {')),
  );
  const navStroke = source.slice(
    source.indexOf('_drawSmoothStroke(ctx, navPts, {'),
    source.indexOf('});', source.indexOf('_drawSmoothStroke(ctx, navPts, {')),
  );
  assert.equal(priceStroke.includes('halo:'), false);
  assert.equal(priceStroke.includes('glow:'), false);
  assert.equal(navStroke.includes('halo:'), false);
  assert.equal(navStroke.includes('glow:'), false);
});

test('chart total summary background extends to the plot edge', () => {
  assert.equal(source.includes('var plotW = chartW;\n        var tsWidth = tsScale.width();\n        if (tsWidth > 0) plotW = Math.min(chartW, tsWidth);'), true);
  assert.equal(source.includes('var bgLeft = Math.max(0, textX - maxTextW - padX);\n          ctx.fillStyle = \'rgba(0,0,0,0.88)\';\n          ctx.fillRect(bgLeft, topY, plotW - bgLeft, bottomY - topY);'), true);
  assert.equal(source.includes('ctx.fillRect(textX - maxTextW - padX, topY, maxTextW + padX * 2, bottomY - topY);'), false);
});

test('token page starts full-page history or embed current NAV before first paint', () => {
  const routeLoadStart = source.indexOf('var _initialNavTf = _getRecommendedNavResolution(_chartTF);');
  const routeNavFetch = source.indexOf('var _navHistP = _isChartEmbed', routeLoadStart);
  const routeCurrentFetch = source.indexOf('var _apiP = fetchFromAPI(', routeLoadStart);
  const routeEmbedFetch = source.indexOf('var _embedNavRawP = _isChartEmbed ? _fetchEmbedCurrentNav(', routeLoadStart);
  const routeCurrentPaint = source.indexOf('_apiP.then(function(apiOk)', routeCurrentFetch);
  const routeFirstPaint = source.indexOf('var firstPaintResults = await loadContext.wait(Promise.allSettled([', routeLoadStart);
  assert.ok(routeLoadStart > 0);
  assert.ok(routeNavFetch > routeLoadStart && routeNavFetch < routeFirstPaint);
  assert.ok(routeCurrentFetch > routeLoadStart && routeCurrentFetch < routeFirstPaint);
  assert.ok(routeEmbedFetch > routeCurrentFetch && routeEmbedFetch < routeFirstPaint);
  assert.ok(routeCurrentPaint > routeCurrentFetch && routeCurrentPaint < routeFirstPaint);
  assert.ok(source.indexOf('_isChartEmbed ? _currentReadyP : _navHistP', routeFirstPaint) > routeFirstPaint);

  const initialLoadStart = source.indexOf('var _apiP2 = fetchFromAPI(_earlyApiP);');
  const initialCurrentPaint = source.indexOf('_apiP2.then(function(apiOk)', initialLoadStart);
  const initialNavFetch = source.indexOf('var _navHistP2 = _isChartEmbed', initialLoadStart);
  const initialFirstPaint = source.indexOf('var firstPaintResults = await loadContext.wait(Promise.allSettled([', initialLoadStart);
  assert.ok(initialLoadStart > 0);
  assert.ok(initialCurrentPaint > initialLoadStart && initialCurrentPaint < initialFirstPaint);
  assert.ok(initialNavFetch > initialLoadStart && initialNavFetch < initialFirstPaint);
  assert.ok(source.indexOf('_isChartEmbed ? _currentReadyP2 : _navHistP2', initialFirstPaint) > initialFirstPaint);
  assert.equal(source.includes('if (!_isChartEmbed) fetchNavHistory(tf).catch(function() {});'), false);
  assert.equal(source.includes('load alternate histories only after selection'), true);
});

test('historic NAV fetches cache non-active resolutions before touching active globals', () => {
  assert.equal(source.includes('var nextNavHistory = rows.map(function(d)'), true);
  assert.equal(source.includes('_navHistory = rows.map(function(d)'), false);
  assert.equal(source.includes("if (!_navHistoryResponseCanActivate(navTf, actualTf, _chartTF)) {\n      return _navHistoryByTF[navTf];\n    }\n    // The response may have been requested for another timeframe and then\n    // downgraded into the active cache. Activate and repaint the timeframe the\n    // user is actually viewing, not the superseded request label.\n    _activateNavHistoryForTF(_chartTF);"), true);
  assert.equal(source.includes('_refreshActiveChartAfterNavHistoryLoad(_chartTF);'), true);
  assert.equal(source.includes("function _refreshActiveChartAfterNavHistoryLoad(chartTf) {\n  if (!_lwChart || !tokenKey) return;"), true);
  assert.equal(source.includes("  _refreshActiveChartFromCaches();\n  _applyLayers();\n}"), true);
});

test('chart rendering synchronizes the active history from the canonical timeframe cache', () => {
  const renderStart = source.indexOf('function setChartData(candles, navPerToken) {');
  const historySync = source.indexOf('_activateNavHistoryForTF(_chartTF);', renderStart);
  const rangeStart = source.indexOf('_chartDataRangeApplying++;', renderStart);

  assert.ok(renderStart > 0);
  assert.ok(historySync > renderStart && historySync < rangeStart);
});

test('live dot plot rect uses the chart plot width instead of the hardcoded axis guess', () => {
  const sandbox = loadHelpers(`
    result = {
      exact: _liveDotPlotRect(
        { offsetLeft: 12, offsetTop: 8, clientWidth: 800, clientHeight: 320 },
        { timeScale: function() { return { width: function() { return 731; } }; } }
      ),
      fallback: _liveDotPlotRect(
        { offsetLeft: 12, offsetTop: 8, clientWidth: 800, clientHeight: 320 },
        null
      )
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    exact: { left: 12, top: 8, width: 731, height: 292 },
    fallback: { left: 12, top: 8, width: 745, height: 292 },
  });
});

test('chart tag positions may touch but never overlap', () => {
  const sandbox = loadHelpers(`
    result = {
      overlap: _nonOverlappingBadgeTops(100, 20, 110, 20, 200),
      touching: _nonOverlappingBadgeTops(100, 20, 120, 20, 200),
      reversed: _nonOverlappingBadgeTops(110, 20, 100, 20, 200),
      topBound: _nonOverlappingBadgeTops(5, 20, 8, 20, 100),
      bottomBound: _nonOverlappingBadgeTops(92, 20, 95, 20, 100),
      differentHeights: _nonOverlappingBadgeTops(100, 20, 110, 30, 200)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    overlap: { first: 95, second: 115 },
    touching: { first: 100, second: 120 },
    reversed: { first: 115, second: 95 },
    topBound: { first: 10, second: 30 },
    bottomBound: { first: 70, second: 90 },
    differentHeights: { first: 92.5, second: 117.5 },
  });
});

test('live dot ripple color stays on the base series color', () => {
  const sandbox = loadHelpers(`
    var nowMs = Date.parse('2026-04-20T12:00:00Z');
    result = {
      nav: _liveDotColor({ getAttribute: function() { return 'down'; } }, '#f5c542'),
      price: _liveDotColor({ id: 'live-dot-price', getAttribute: function() { return 'up'; } }, '#c8d8e4'),
      inactive: _isBuybackCurrentlyActive(nowMs)
    };
    CFG = { buybackStart: '2026-04-01', buybackEnd: '2026-04-30', buybackRemainingUSDC: 7000 };
    result.active = _isBuybackCurrentlyActive(nowMs);
    result.activePrice = _liveDotColor({ id: 'live-dot-price' }, '#c8d8e4');
    CFG = { buybackStart: '2026-04-01', buybackEnd: '2026-04-30', buybackRemainingUSDC: 3, buybackAllocated: 443000, buybackSpent: 442997, buybackInProgress: false };
    result.backendCompletedDust = _isBuybackCurrentlyActive(nowMs);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    nav: '#f5c542',
    price: '#c8d8e4',
    inactive: false,
    active: true,
    activePrice: '#c8d8e4',
    backendCompletedDust: false,
  });
});

test('live dot glow and canvas ripple accept the line gradient RGB colors', () => {
  assert.equal(source.includes('function _chartColorChannels(color)'), true);
  assert.equal(source.includes('channels: _chartColorChannels(color)'), true);
  assert.equal(source.includes("dotEl.style.setProperty('color', color, 'important');"), true);
  assert.equal(source.includes("dotEl.style.removeProperty('box-shadow');"), true);
});

test('current price endpoints stay solid while one band pulses outward', () => {
  assert.equal(source.includes('animation:pulse-dot 3s ease-in-out infinite;'), false);
  assert.equal(source.includes('duration: 900,'), true);
  assert.equal(source.includes('maxR: 14'), true);
  assert.equal(source.includes('rings: 2'), false);
  assert.equal(source.includes('var easedT = 1 - Math.pow(1 - t, 3);'), true);
  assert.equal(source.includes('var radius = 4 + easedT * rp.maxR;'), true);
  assert.equal(source.includes('var alpha = 0.52 * Math.pow(1 - t, 2);'), true);
  assert.equal(source.includes('for (var ri = 0; ri < rp.rings; ri++)'), false);
});

test('chart overlays and live dots resync every frame during wheel and drag gestures', () => {
  assert.equal(source.includes('var _liveDotSyncFrames = 0;'), true);
  const scheduleSync = extractFunction('_scheduleLiveDotSyncBurst');
  assert.equal(scheduleSync.includes('_updateLiveDots();'), true);
  assert.equal(scheduleSync.includes('_requestOverlayUpdate();'), true);
  assert.equal(source.includes('window._scheduleLiveDotSyncBurst = _scheduleLiveDotSyncBurst;'), true);
  assert.equal(source.includes("addToTargets('wheel', onWheel);"), true);
  assert.equal(source.includes("addToTargets('pointermove', onMove);"), true);
  assert.equal(source.includes("addToTargets('touchmove', onMove);"), true);
  assert.equal(source.includes('var syncActive = _liveDotSyncFrames > 0;'), true);
  assert.equal(source.includes('var updateDue = syncActive || now - _lastDotLoopUpdate > 250;'), true);
  assert.equal(source.includes('if (syncActive) _requestOverlayUpdate();'), true);
  assert.equal(source.includes("removeFromTargets('wheel', onWheel);"), true);
});

test('log and focus scale changes immediately resync chart tags', () => {
  const logToggle = extractFunction('toggleLogScale');
  const focusToggle = extractFunction('toggleFocusScale');
  const tagSync = extractFunction('_syncChartTagsAfterScaleChange');

  assert.equal(logToggle.includes('_syncChartTagsAfterScaleChange();'), true);
  assert.equal(focusToggle.includes('_syncChartTagsAfterScaleChange();'), true);
  assert.equal(tagSync.includes('window._scheduleLiveDotSyncBurst(16);'), true);
  assert.equal(tagSync.includes('window._updateLiveDots();'), true);
});

test('current endpoint dots render in the chart primitive layer', () => {
  assert.equal(source.includes('var _liveDotPrimitive = null;'), true);
  assert.equal(source.includes('function createLiveDotPrimitive() {'), true);
  assert.equal(source.includes('_liveDotPrimitive = createLiveDotPrimitive();'), true);
  assert.equal(source.includes('_lwPrice.attachPrimitive(_liveDotPrimitive);'), true);
  assert.equal(source.includes('if (_liveDotPrimitive && _liveDotPrimitive._requestUpdate) _liveDotPrimitive._requestUpdate();'), true);
  assert.equal(source.includes('opacity:0;will-change:transform;'), true);
  assert.equal(source.includes("dotEl.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';"), true);
  assert.equal(source.includes("_setLiveDotGradientColor(nd, _navLineGradientColorAtPoint(navEndpointPoints, y, 1));"), true);
  assert.equal(source.includes("var priceDotColor = _priceLineGradientColorAtPoint(priceEndpointPoints, y, 1);"), true);
});

test('completed buyback summary supplies missing end date for active-state checks', () => {
  const sandbox = loadHelpers(`
    CFG = {
      buybackStart: '2026-04-06',
      buybackAllocated: 500000,
      buybackSpent: 499996.8,
      buybackRemainingUSDC: 3.2
    };
    _applyBuybackSummaryState({
      inProgress: false,
      period: {
        start: '2026-04-06T17:34:14+00:00',
        end: '2026-05-06T17:30:17+00:00'
      }
    });
    result = {
      buybackEnd: CFG.buybackEnd,
      onEndDate: _buybackOverlayInWindow(Date.parse('2026-05-06T18:00:00Z') / 1000),
      afterEndDate: _buybackOverlayInWindow(Date.parse('2026-05-07T00:00:00Z') / 1000),
      activeAfterEnd: _isBuybackCurrentlyActive(Date.parse('2026-05-09T12:00:00Z'))
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    buybackEnd: '2026-05-06',
    onEndDate: true,
    afterEndDate: false,
    activeAfterEnd: false,
  });
});

test('buyback overlay uses separate activity windows for split campaigns', () => {
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    _buybackHourly = [];
    CFG = {
      buybackStart: '2025-05-07',
      buybackEnd: '2025-06-08',
      buybackDays: [
        { date: '2025-05-07', usdcAmount: 726081.57 },
        { date: '2025-05-08', usdcAmount: 273918.45 },
        { date: '2025-06-07', usdcAmount: 800000 },
        { date: '2025-06-08', usdcAmount: 700000 }
      ]
    };
    result = {
      windows: _buybackActivityWindows().map(function(w) { return { start: w.start, end: w.end }; }),
      may7: _buybackOverlayInWindow(Date.parse('2025-05-07T00:00:00Z') / 1000),
      may9: _buybackOverlayInWindow(Date.parse('2025-05-09T00:00:00Z') / 1000),
      june7: _buybackOverlayInWindow(Date.parse('2025-06-07T00:00:00Z') / 1000),
      june9: _buybackOverlayInWindow(Date.parse('2025-06-09T00:00:00Z') / 1000),
      period: _buybackActivityPeriodDisplay({ start: '2025-05-07T17:33:17+00:00', end: '2025-06-08T20:02:13+00:00' })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.windows)), [
    { start: '2025-05-07', end: '2025-05-08' },
    { start: '2025-06-07', end: '2025-06-08' }
  ]);
  assert.equal(sandbox.result.may7, true);
  assert.equal(sandbox.result.may9, false);
  assert.equal(sandbox.result.june7, true);
  assert.equal(sandbox.result.june9, false);
  assert.equal(sandbox.result.period, '05-07 — 05-08, 06-07 — 06-08');
});

test('buyback overlay derives separate windows from campaign metadata', () => {
  const sandbox = loadHelpers(`
    _chartTF = '1D';
    _buybackHourly = [];
    CFG = {
      buybackStart: '2025-05-07',
      buybackEnd: '2025-06-08',
      buybackCampaigns: [
        {
          id: 'mtn-nav-support-1',
          fundedAt: '2025-05-07T15:31:09Z',
          firstFillAt: '2025-05-07T17:33:17Z',
          lastFillAt: '2025-05-08T14:01:17Z',
          spentAmount: 1000000.02
        },
        {
          id: 'mtn-buyback-2-order-1',
          fundedAt: '2025-06-06T10:06:09Z',
          firstFillAt: '2025-06-07T09:12:31Z',
          lastFillAt: '2025-06-07T22:31:10Z',
          spentAmount: 400000
        },
        {
          id: 'mtn-buyback-2-order-8',
          fundedAt: '2025-06-06T10:06:09Z',
          firstFillAt: '2025-06-08T05:14:01Z',
          lastFillAt: '2025-06-08T20:02:13Z',
          spentAmount: 250000
        }
      ]
    };
    result = {
      windows: _buybackActivityWindows().map(function(w) { return { start: w.start, end: w.end }; }),
      may7: _buybackOverlayInWindow(Date.parse('2025-05-07T00:00:00Z') / 1000),
      may9: _buybackOverlayInWindow(Date.parse('2025-05-09T00:00:00Z') / 1000),
      june7: _buybackOverlayInWindow(Date.parse('2025-06-07T00:00:00Z') / 1000),
      june9: _buybackOverlayInWindow(Date.parse('2025-06-09T00:00:00Z') / 1000)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.windows)), [
    { start: '2025-05-07', end: '2025-05-08' },
    { start: '2025-06-07', end: '2025-06-08' }
  ]);
  assert.equal(sandbox.result.may7, true);
  assert.equal(sandbox.result.may9, false);
  assert.equal(sandbox.result.june7, true);
  assert.equal(sandbox.result.june9, false);
});

test('buyback chart event markers prefer configured dates over accounting activity', () => {
  const sandbox = loadHelpers(`
    CFG = { buybackStart: '2026-04-01', buybackEnd: '2026-04-10' };
    _displayMovements = [{
      effect: 'withdrawal',
      displaySection: 'treasury',
      accountRole: 'buyback_wallet',
      markerKind: 'buyback',
      transferType: 'buyback_execution',
      eventTime: Date.parse('2026-04-20T12:00:00Z') / 1000,
      amountUsdc: 25000
    }];
    result = {
      activity: _buybackActivityWindows().map(function(w) { return { start: w.start, end: w.end }; }),
      chartEvents: _buybackChartEventWindows().map(function(w) { return { start: w.start, end: w.end }; })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.activity)), [
    { start: '2026-04-20', end: '2026-04-20' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.chartEvents)), [
    { start: '2026-04-01', end: '2026-04-10' }
  ]);
});

test('buyback overlay keeps line segments but hides historical daily dots', () => {
  assert.equal(source.includes('function createBuybackDotPrimitive() {'), true);
  assert.equal(source.includes('function _buybackPriceRowsForRun(run) {'), true);
  assert.equal(source.includes('function _drawBuybackPriceSegments(ctx, opts) {'), true);
  assert.match(source, /_drawBuybackPriceSegments\(ctx,\s*\{\s*plotW:\s*plotW,/);
  assert.equal(source.includes("color: '#00e5a0'"), true);
  assert.equal(source.includes("outline: 'rgba(1,10,16,0.78)'"), true);
  assert.equal(source.includes("width: Math.max(Number(opts.width) || 1.95, 2.65),"), true);
  assert.equal(source.includes('if (_isBuybackCurrentlyActive() && _lwPriceCache && _lwPriceCache.length > 0) {'), false);
  assert.equal(source.includes("if (_showBuybackMarkers && _isBuybackCurrentlyActive()) pd.classList.add('buyback-active'); else pd.classList.remove('buyback-active');"), true);
  assert.equal(source.includes('#live-dot-price.buyback-active'), true);
  assert.equal(source.includes('var latestPriceTime = _lwPriceCache[_lwPriceCache.length - 1].time;'), true);
  assert.equal(source.includes('if (snapped === latestPriceTime) return;'), true);
  assert.equal(source.includes('function _buybackMarkerTimeRuns(maxGapSeconds) {'), true);
  assert.equal(source.includes('var maxGapSeconds = 3 * 86400;'), true);
  assert.equal(source.includes('var runs = _buybackMarkerTimeRuns(maxGapSeconds);'), true);
  assert.equal(source.includes('drawRun(runs[i]);'), true);
  assert.equal(source.includes('var runRows = _buybackPriceRowsForRun(run);'), true);
  assert.equal(source.includes('_buybackMarkerPoints.push({'), true);
  assert.equal(source.includes('CFG.buybackCampaigns'), true);
  assert.equal(source.includes('function _buybackChartEventWindows() {'), true);
  assert.equal(source.includes('Historical buyback points still drive the green price-line segments.'), true);
  assert.equal(source.includes('Do not paint daily dots here; the active buyback live dot is handled separately.'), true);
  assert.equal(source.includes('var drawHistoricalBuybackDots = false;'), true);
  assert.equal(source.includes('if (!drawHistoricalBuybackDots) return;'), true);
  assert.equal(source.includes("markers.push({ time: snapped, position: 'inBar', color: '#00e5a0', shape: 'circle'"), false);
  assert.equal(source.includes('if (_buybackDotPrimitive && _buybackDotPrimitive._requestUpdate) _buybackDotPrimitive._requestUpdate();'), true);
});

test('liquidated tokens still hydrate proposal timeline events', () => {
  assert.equal(source.includes("if (CFG.liquidatedAt) {\n      _proposalMarkers = [];"), false);
  assert.equal(source.includes("labelEl.textContent = 'LIQUIDATED';"), true);
  assert.equal(source.includes("section.innerHTML = '<span style=\"font-size:12px;font-weight:700;color:#ff3333;letter-spacing:1.2px;text-transform:uppercase\">LIQUIDATED</span>"), false);
  assert.equal(source.includes('if (data.proposals && data.proposals.length > 0) {'), true);
});

test('buyback UI paths apply the $100 display floor', () => {
  assert.equal(source.includes('var spent = _buybackUsdDisplayValue(snappedBuybacks.totals[snapped]);'), true);
  assert.equal(source.includes('return _buybackUsdDisplayValue(total);'), true);
  assert.equal(source.includes('var buybackDisplayUSDC = _buybackUsdDisplayValue(buybackUSDC);'), true);
  assert.equal(source.includes('var bbDisplay = _buybackUsdDisplayValue(bbUSDC);'), true);
  assert.equal(source.includes("var apiBuybackAllocated = apiVal('buybackAllocated', 'buyback_allocated', 'buybackBudget', 'buyback_budget');"), true);
  assert.equal(source.includes("'buybackDays','buybackCampaigns'"), true);
  assert.equal(source.includes("fmtM(remaining) + '<span style=\"color:#566474\">/</span>' + fmtM(total)"), true);
});

test('right-panel volume UI paths apply the $100 display floor', () => {
  assert.equal(source.includes('var displayVolCard = _volumeUsdDisplayValue(displayVol);'), true);
  assert.equal(source.includes("var v24t = el('vol24-total'); if (v24t) v24t.innerHTML = displayVolCard > 0 ? _24p + fmtM(displayVolCard) : '—';"), true);
  assert.equal(source.includes('var vol = _volumeUsdDisplayValue(p.volume24h || 0);'), true);
  assert.equal(source.includes('var futVolDisplay = _volumeUsdDisplayValue(CFG.volume24hUsd);'), true);
});

test('home table price column uses 24h change while trend stays 7d', () => {
  assert.equal(source.includes('<th>Price <span style="color:var(--dim)">24H</span><span class="stat-tip below" data-tip="Current spot price.">i</span></th>'), true);
  assert.equal(source.includes('<th style="text-align:center">Trend <span style="color:var(--dim)">7D</span></th>'), true);
  assert.equal(source.includes("else if (currentSort === 'price') { va = a.change24h || 0; vb = b.change24h || 0; }"), true);
  assert.equal(source.includes("else if (currentSort === 'trend') { va = a.change7d || 0; vb = b.change7d || 0; }"), true);
  assert.equal(source.includes("(t.change24h !== undefined ? (t.change24h === 0 ?"), true);
});

test('sparse 24h spark history interpolates a reference price instead of dropping change', () => {
  const nowMs = Date.parse('2026-04-15T18:00:00Z');
  const sandbox = loadHelpers(`
    _sparkCache = {
      solo: {
        items: [
          { t: 1775952000, p: 1.0 },
          { t: 1776038400, p: 1.1 },
          { t: 1776124800, p: 1.2 },
          { t: 1776243600, p: 1.8 }
        ]
      }
    };
    _cachedPriceMap = {
      solo: { spot: 2.0 }
    };
    result = {
      ref: _sparkValueAtCutoff(_sparkCache.solo.items, 24, 'p'),
      price: _getSparkPrice('solo', 24),
      change: _calcSparkChange('solo', 24)
    };
  `, {
    Date: { now: () => nowMs },
    _sparkCache: {},
    _cachedPriceMap: {},
  });

  assert.equal(Number(sandbox.result.ref.toFixed(6)), 1.527273);
  assert.equal(Number(sandbox.result.price.toFixed(6)), 1.527273);
  assert.equal(Number(sandbox.result.change.toFixed(6)), 30.952381);
});

test('treasury deposit chart markers require the flow toggle', () => {
  assert.equal(source.includes("function _navFlowMarkersVisible() {\n  return !!_showFlowMarkers;\n}"), true);
  assert.equal(source.includes('var showNavFlowMarkers = _navFlowMarkersVisible();'), true);
  assert.equal(source.includes('var navFlowActive = _navFlowMarkersVisible();'), true);
  assert.equal(source.includes('var _hoverNavFlowActive = _overlayFlowDetailsVisible();'), true);
  assert.equal(source.includes('function createNavFlowMarkerPrimitive() {'), true);
  assert.equal(source.includes('_navFlowMarkerPoints.push({'), true);
  assert.equal(source.includes("direction: 'up'"), true);
  assert.equal(source.includes("direction: 'transfer'"), false);
  assert.equal(source.includes("direction: 'down'"), true);
  assert.equal(source.includes("direction: 'burn'"), false);
  assert.equal(source.includes('withdrawals: [], deposits: []'), true);
  assert.equal(source.includes("dg.withdrawals.push({ amount: damt, size: dsize });"), true);
  assert.equal(source.includes("dg.withdraw = { amount: damt, size: dsize };"), false);
  assert.equal(source.includes('var withdrawals = _coalescedNavFlowMarkerRows(group.withdrawals || []);'), true);
  assert.equal(source.includes('var deposits = _coalescedNavFlowMarkerRows(group.deposits || []);'), true);
  assert.equal(source.includes('var topWithdrawalIndexes = (showNavFlowMarkers && useDisplayMovements)'), true);
  assert.equal(source.includes('if (showNavFlowMarkers && useDisplayMovements) {'), true);
  assert.equal(source.includes('if (useDisplayMovements) {'), false);
  assert.equal(source.includes('if (showNavFlowMarkers || useDisplayMovements) {'), false);
  assert.equal(source.includes('// Deposit and withdrawal arrows are part of the opt-in flow overlay.\n  if (showNavFlowMarkers) {'), true);
  assert.equal(source.includes("if (dm.markerKind === 'burn' || dm.transferType === 'burn') {\n        // Burn history remains available in hover/accounting detail,"), true);
  assert.equal(source.includes('events should not paint full-height chart markers for any token.'), true);
  assert.equal(source.includes("if (dm.markerKind === 'mint' || dm.transferType === 'effective_supply_add' || dm.transferType === 'mint') {\n        if (!showNavFlowMarkers) continue;"), true);
  assert.equal(source.includes("if (dm.effect === 'withdrawal') {\n        if (!showNavFlowMarkers) continue;"), true);
  assert.equal(source.includes('if (!_displayMovementIsOperationalWithdrawal(dm) || !topWithdrawalIndexes[dmi]) continue;'), true);
  assert.equal(source.includes("if (dm.markerKind === 'buyback' || dm.transferType === 'buyback_execution') continue;"), true);
  assert.equal(source.includes("else if (_displayMovementIsOperationalDeposit(dm)) dg.deposits.push({ amount: damt, size: dsize });"), true);
  assert.equal(source.includes('for (var wi = 0; wi < withdrawals.length; wi++) {'), true);
  assert.equal(source.includes('for (var di = 0; di < deposits.length; di++) {'), true);
  assert.equal(source.includes('laneY = marker.laneAbsOffset != null ? y - marker.laneAbsOffset : y - stemPx - anchorGapPx;'), true);
  assert.equal(source.includes('Deposits mirror withdrawals: arrow stem touches NAV, label sits outside the stack.'), true);
  assert.equal(source.includes('laneAbsOffset: reserveAboveLane(sd * 0.65, sd * 0.55)'), true);
  assert.equal(source.includes('label: \'+\' + _flowMarkerAmountText(deposits[di].amount)'), false);
  assert.equal(source.includes('laneAbsOffset: reserveAboveLane(sd * 0.65 + 16, sd * 0.55)'), false);
  assert.equal(source.includes('Transfers render as accounting legs'), true);
  assert.equal(source.includes("color: '#ff7a1a'"), false);
  assert.equal(source.includes('burnTransfer: null'), true);
  assert.equal(source.includes('if (_burnImpliesTransfer(burn.label)) burnGroup.burnTransfer'), false);
  assert.equal(source.includes('var hasTransferIcon = hasTransfer || hasBurnTransfer;'), true);
  assert.equal(source.includes('var stemPx = sizePx * 0.65;'), true);
  assert.equal(source.includes("if (marker.direction === 'up') {"), true);
  assert.equal(source.includes('laneY = Math.max(24, Math.min(chartH - 24, laneY));'), true);
  assert.equal(source.includes('drawTransferIcon'), false);
  assert.equal(source.includes("if (marker.direction === 'up' || marker.direction === 'down') drawFlowArrow(x, laneY, marker);"), true);
  assert.equal(source.includes("if (marker.direction === 'transfer') drawTransferIcon"), false);
  assert.equal(source.includes('drawEventLine(x, marker.color, chartH, marker);'), false);
  assert.equal(source.includes('if (!_lwChart || !_lwNav || !_navFlowMarkersVisible() || !_navFlowMarkerPoints || _navFlowMarkerPoints.length === 0) return;'), false);
  assert.equal(source.includes('if (!_lwChart || !_lwNav || !_navFlowMarkerPoints || _navFlowMarkerPoints.length === 0) return;'), true);
});

test('proposal pass and fail icons anchor above NAV for flow markers and embed extras', () => {
  assert.equal(source.includes('if (!showNavFlowMarkers) _renderProposalMarkerLinks([]);'), false);
  assert.equal(source.includes('var visibleProposalMarkers = _visibleProposalMarkers();'), true);
  assert.equal(source.includes('var proposalEventsActive = _isChartEmbed ? _embedExtrasEnabled : navFlowActive;'), true);
  assert.equal(source.includes('var proposalActive = proposalEventsActive && _layerNav && _lwNav && visibleProposalMarkers.length > 0;'), true);
  assert.equal(source.includes('if (!_lwChart || !(navFlowActive || buybackActive || proposalActive)) {\n          _renderProposalMarkerLinks([]);\n          return;\n        }'), true);
  assert.equal(source.includes('var _proposalPriceHost = (_lwCandle && _lwCandle.options().visible) ? _lwCandle : _lwPrice;'), true);
  assert.equal(source.includes('var _propHost = (navFlowActive && _priceEnabled) ? _proposalPriceHost : null;'), true);
  assert.equal(source.includes('if (proposalActive && _lwNav && visibleProposalMarkers.length > 0) {'), true);
  assert.equal(source.includes('var hostVal = _chartCachedPriceAt(pts);'), false);
  assert.equal(source.includes("var useNavAnchor = anchorMode === 'nav';"), true);
  assert.equal(source.includes('var hostVal = useNavAnchor ? _lwNavLookup(pts) : _chartCachedPriceAt(pts);'), true);
  assert.equal(source.includes('var hostSeries = useNavAnchor ? _lwNav : _propHost;'), true);
  assert.equal(source.includes('if (useNavAnchor && (!hostSeries || hostVal === null)) return;'), true);
  assert.equal(source.includes('var hy = (hostVal !== null && hostSeries) ? hostSeries.priceToCoordinate(hostVal) : null;'), true);
  assert.equal(source.includes('var iconW = 36, iconH = 36;'), true);
  assert.equal(source.includes("var PROPOSAL_ICON_PASSED_SRC = 'logos/proposal-passed.png';"), true);
  assert.equal(source.includes("var PROPOSAL_ICON_FAILED_SRC = 'logos/proposal-failed.png';"), true);
  assert.equal(source.includes('function _proposalStatusIconSvg(_outcome) {'), false);
  assert.equal(source.includes('function _proposalScrollIconSvg(outcome, xmlns) {'), false);
  assert.equal(source.includes('proposal-event-img'), true);
  assert.equal(source.includes('proposal-scroll-symbol'), true);
  assert.equal(source.includes("ctx.shadowColor = 'transparent';"), true);
  assert.equal(source.includes("ctx.shadowColor = 'rgba(255,255,255,0.72)';"), false);
  assert.equal(source.includes("ctx.fillStyle = '#f7f8f4';"), false);
  assert.equal(source.includes('M10 18H34M10 28H34M10 38H28'), false);
  assert.equal(source.includes('function drawChartEventBubble(ctx, left, top, width, height, outcome) {'), true);
  assert.equal(source.includes("var statusIcon = _proposalIconImage(outcome);"), true);
  assert.equal(source.includes("var iconSrc = _proposalIconSrc(layout.outcome);"), true);
  assert.equal(source.includes('proposal-event-bubble'), true);
  assert.equal(source.includes("if (outcome === 'failed') bubbleClass += ' failed-proposal-event-bubble';"), true);
  assert.equal(source.includes('.failed-proposal-event-bubble'), true);
  assert.equal(source.includes('raise-event-bubble'), true);
  assert.equal(source.includes('buyback-event-bubble'), true);
  assert.equal(source.includes('buyback-end-event-bubble'), true);
  assert.equal(source.includes("if (kind === 'raise') {\n    return '';"), false);
  assert.equal(source.includes("if (kind === 'buyback') {\n    return '';"), false);
  assert.equal(source.includes("} else if (kind === 'buyback-end') {\n    return '';"), false);
  assert.equal(source.includes('restructuring-event-bubble'), true);
  assert.equal(source.includes('liquidation-event-bubble'), true);
  assert.equal(source.includes('spend-event-bubble'), false);
  assert.equal(source.includes('raise-status-icon'), false);
  assert.equal(source.includes('proposal-event-symbol'), true);
  assert.equal(source.includes('proposal-status-icon'), false);
  assert.equal(source.includes('chart-event-bubble proposal-event-bubble'), false);
  assert.equal(source.includes("if (proposalOutcome && proposalTime) {"), true);
  assert.equal(source.includes('outcome: proposalOutcome,'), true);
  assert.equal(source.includes('chart-event-bubble-check'), false);
  assert.equal(source.includes("label: 'Prop'"), false);
  assert.equal(source.includes('function proposalOverlapsMarker(rect) {'), true);
  assert.equal(source.includes('function collisionSeriesSegments(cacheKey, series, rows, valueKey) {'), true);
  assert.equal(source.includes('function proposalOverlapsSeriesLine(rect, series, rows, valueKey, cacheKey) {'), true);
  assert.equal(source.includes("if (_priceEnabled && _propHost && proposalOverlapsSeriesLine(rect, _propHost, priceLineRows, 'value', 'price')) return true;"), true);
  assert.equal(source.includes("if (_layerNav && _lwNav && proposalOverlapsSeriesLine(rect, _lwNav, _lwNavDisplayData && _lwNavDisplayData.length > 1 ? _lwNavDisplayData : _lwNavHistory, 'value', 'nav')) return true;"), true);
  assert.equal(source.includes('var _boxedEventRects = [];'), true);
  assert.equal(source.includes('var _boxedEventKeys = {};'), true);
  assert.equal(source.includes("var eventFamily = eventKind === 'buyback-end' ? 'buyback' : eventKind;"), true);
  assert.equal(source.includes("var eventSlotKey = eventFamily === 'buyback' ? ('slot:' + eventFamily + ':' + pts) : '';"), true);
  assert.equal(source.includes('if ((eventKey && _boxedEventKeys[eventKey]) || (eventSlotKey && _boxedEventKeys[eventSlotKey])) return;'), true);
  assert.equal(source.includes('if (eventSlotKey) _boxedEventKeys[eventSlotKey] = true;'), true);
  assert.equal(source.includes('_boxedEventRects.push(eventRect);'), true);
  assert.equal(source.includes('if (rectsOverlap(rect, _boxedEventRects[ei])) return true;'), true);
  assert.equal(source.includes('function collisionBuybackRects() {'), true);
  assert.equal(source.includes('var rect = markerRect(bx, by, br + 2);'), true);
  assert.equal(source.includes('if (rectsOverlap(rect, buybackRects[bi])) return true;'), true);
  assert.equal(source.includes("addCandidate('above', anchorY - iconH - gap - step * 10, step);"), true);
  assert.equal(source.includes("if (!forceAbove) addCandidate('below', anchorY + gap + step * 10, step + 0.5);"), true);
  assert.equal(source.includes('var iy = proposalIconY(px, hy, iconW, iconH, useNavAnchor);'), true);
  assert.equal(source.includes('var iy = proposalIconY(px, hy, iconW, iconH, true);'), true);
  assert.equal(source.includes("addBoxedEventLayout(proposal.time, proposal.title || 'Open passed proposal', proposal.kind || 'proposal', proposal.outcome, proposal.proposalKey, 'nav');"), true);
  assert.equal(source.includes("addBoxedEventLayout(Math.floor(buybackEndMs / 1000), 'Buyback ended', 'buyback-end', 'passed', '', 'nav');"), false);
  assert.equal(source.includes("addBoxedEventLayout(buybackWindow.startTs, 'Buyback started', 'buyback', 'passed', '', 'nav');"), false);
  assert.equal(source.includes('barPx * 1.2'), false);
});

test('proposal markers render above the current NAV dot layer', () => {
  assert.match(source, /#proposal-marker-layer\s*\{[^}]*z-index:\s*3/);
  assert.match(source, /dotClip\.style\.cssText\s*=\s*'position:absolute;overflow:hidden;pointer-events:none;z-index:2;'/);
});

test('proposal marker URLs prefer explicit links, derive ids, and fall back to registered deep links', async () => {
  const { normalizeTokenKey } = await import('../../src/shell/routes.js');
  const sandbox = loadProposalHelpers(`
    result = {
      explicit: _proposalMarkerUrl(
        { proposalUrl: 'https://www.metadao.fi/projects/solomon/proposal/direct-id' },
        'https://futarchy.metadao.fi/solomon',
        'solo'
      ),
      derivedId: _proposalMarkerUrl(
        { proposalId: 'abc123' },
        'https://futarchy.metadao.fi/solomon',
        'solo'
      ),
      sparseFallback: _proposalMarkerUrl(
        { status: 'passed', resolvedAt: '2026-03-08' },
        'https://futarchy.metadao.fi/solomon',
        'solo'
      ),
      genericFallback: _proposalMarkerUrl(
        { status: 'passed', resolvedAt: '2026-05-01' },
        'https://futarchy.metadao.fi/solomon',
        'solo'
      )
    };
  `, { _normalizeTokenKey: normalizeTokenKey });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    explicit: 'https://www.metadao.fi/projects/solomon/proposal/direct-id',
    derivedId: 'https://www.metadao.fi/projects/solomon/proposal/abc123',
    sparseFallback: 'https://www.metadao.fi/projects/solomon/proposal/8c9sFZ5Z46ZLnhywkWuJ5BhJK4Wrj19AN4gzQicyBKjK',
    genericFallback: 'https://www.metadao.fi/projects/solomon',
  });
});

test('production debug volume logging is not present', () => {
  assert.equal(source.includes('setChartData volData len:'), false);
});

test('token page beta UI does not include the 30d percentile row', () => {
  assert.equal(source.includes('30d Percentile'), false);
  assert.equal(source.includes('rp-zscore-row'), false);
});

test('token-page info tip badges use the deployed circular treatment', () => {
  assert.match(source, /body\.is-token \.stat-tip\[data-tip\],\s*body\.is-token \.rp-stat-label \.stat-tip\s*\{[\s\S]{0,220}border-radius:\s*50% !important;/);
});

test('tiny Meteora LP USD values render as dust and stay hidden in chart and treasury views', () => {
  const sandbox = loadHelpers(`
    result = {
      zero: _metLpUsdDisplayValue(0),
      dust: _metLpUsdDisplayValue(99.99),
      edge: _metLpUsdDisplayValue(100),
      visible: _metLpUsdDisplayValue(250)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    zero: 0,
    dust: 0,
    edge: 100,
    visible: 250,
  });
  assert.match(source, /_hasDisplayUsd\(_metLpUsdDisplayValue\(row\.val\)\)/);
  assert.equal(source.includes("tcRows.push({ label: 'Unclaimed DLMM Fees'"), false);
  assert.equal(source.includes("row('+', '#00cc66', 'Unclaimed DLMM Fees'"), false);
});

test('project-owned Meteora LP fee tokens stay separate from the Meteora LP supply row', () => {
  const sandbox = loadHelpers(`
    result = _meteoraLpSupplyRowsForCfg({ daoMeteoraPool: 'met-pool' }, 30, 5);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { label: 'MET', val: 30, addr: 'met-pool' },
  ]);
});

test('FUTARDIO two Meteora LP supply rows split primary and secondary pools', () => {
  const sandbox = loadHelpers(`
    CFG = {
      daoMeteoraPool: 'met-lp-1',
      meteoraLabel: 'MET1',
      meteoraLpToken: 'met-lp-1-token',
      meteoraLpOwnership: 'metadao',
      meteoraInitialTokens: 900000,
      daoMeteoraPools: [
        { label: 'MET2', poolAddress: 'met-lp-2', vaultToken: 'met-lp-2-token', vaultUsdc: 'met-lp-2-usdc', projectOwnsMeteoraLp: true }
      ]
    };
    result = {
      supplyRows: _meteoraLpSupplyRowsForCfg(CFG, 1691426, 0),
      treasuryRows: _meteoraLpTreasuryRowsForCfg(CFG, 2976, 'fallback-met'),
      overlayLabel: _overlayMetLpLabel()
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    supplyRows: [
      { label: 'MET1', val: 900000, addr: 'met-lp-1' },
      { label: 'MET2', val: 791426, addr: 'met-lp-2' },
    ],
    treasuryRows: [
      { label: 'MET2', val: 2976, addr: 'met-lp-2' },
    ],
    overlayLabel: 'MET1',
  });
});

test('current-nav meteoraPools drive Meteora LP split rows when present', () => {
  const sandbox = loadHelpers(`
    CFG = {
      daoMeteoraPool: 'met-lp-1',
      meteoraLabel: 'CFG-MET1',
      meteoraLpToken: 'met-lp-1-token',
      meteoraLpOwnership: 'metadao',
      meteoraInitialTokens: 900000,
      daoMeteoraPools: [
        { label: 'CFG-MET2', poolAddress: 'met-lp-2', vaultToken: 'met-lp-2-token', vaultUsdc: 'met-lp-2-usdc', projectOwnsMeteoraLp: true }
      ],
      meteoraPools: [
        {
          label: 'LIVE-MET1',
          poolAddress: 'met-lp-1',
          principalTokens: 880000,
          principalUSDC: 0,
          pendingFeeTokens: 10,
          pendingFeeUSDC: 2,
          projectUsdcShare: 0
        },
        {
          label: 'LIVE-MET2',
          poolAddress: 'met-lp-2',
          principalTokens: 910000,
          principalUSDC: 333,
          pendingFeeTokens: 20,
          pendingFeeUSDC: 4,
          projectUsdcShare: 1
        }
      ]
    };
    result = {
      supplyRows: _meteoraLpSupplyRowsForCfg(CFG, 1790000, 0),
      treasuryRows: _meteoraLpTreasuryRowsForCfg(CFG, 337, 'fallback-met')
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    supplyRows: [
      { label: 'LIVE-MET1', val: 880000, addr: 'met-lp-1' },
      { label: 'LIVE-MET2', val: 910000, addr: 'met-lp-2' },
    ],
    treasuryRows: [
      { label: 'LIVE-MET2', val: 333, addr: 'met-lp-2' },
    ],
  });
});

test('Meteora LP split requires multi-pool config and initial token seed', () => {
  const sandbox = loadHelpers(`
    var missingSeed = {
      daoMeteoraPool: 'met-lp-1',
      daoMeteoraPools: [{ poolAddress: 'met-lp-2', projectOwnsMeteoraLp: true }]
    };
    var ammV2Only = {
      daoMeteoraPool: 'met-lp-1',
      meteoraAmmV2Pool: 'met-lp-2'
    };
    result = {
      missingSeedSplit: _meteoraLpShouldSplit(missingSeed),
      missingSeedRows: _meteoraLpSupplyRowsForCfg(missingSeed, 1691426, 0),
      ammV2OnlySplit: _meteoraLpShouldSplit(ammV2Only),
      ammV2OnlyRows: _meteoraLpSupplyRowsForCfg(ammV2Only, 1691426, 0)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    missingSeedSplit: false,
    missingSeedRows: [
      { label: 'MET', val: 1691426, addr: 'met-lp-1' },
    ],
    ammV2OnlySplit: false,
    ammV2OnlyRows: [
      { label: 'MET', val: 1691426, addr: 'met-lp-1' },
    ],
  });
});

test('Meteora LP v2 address remains visible when split config is disabled', () => {
  const sandbox = loadHelpers(`
    function renderWith(cfg) {
      var section = {
        innerHTML: '',
        querySelectorAll: function() { return []; }
      };
      document = {
        getElementById: function(id) {
          return id === 'addr-section' ? section : null;
        }
      };
      CFG = cfg;
      tokenKey = 'sample';
      renderAddresses();
      return section.innerHTML;
    }
    var splitDisabledHtml = renderWith({
      launchpad: 'Permissionless',
      daoMeteoraPool: 'met-lp-1-address',
      meteoraAmmV2Pool: 'met-lp-v2-address',
      daoMeteoraPools: [{ poolAddress: 'met-lp-2-address' }]
    });
    var duplicateHtml = renderWith({
      launchpad: 'Permissionless',
      daoMeteoraPool: 'same-met-pool-address',
      meteoraAmmV2Pool: 'same-met-pool-address'
    });
    result = {
      splitDisabledHasV2: splitDisabledHtml.indexOf('Meteora LP v2') !== -1,
      splitDisabledHasMetLp2: splitDisabledHtml.indexOf('MET2') !== -1,
      duplicateHasV2: duplicateHtml.indexOf('Meteora LP v2') !== -1
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    splitDisabledHasV2: true,
    splitDisabledHasMetLp2: false,
    duplicateHasV2: false,
  });
});

test('Meteora treasury split falls back when project-owned pool is ambiguous', () => {
  const sandbox = loadHelpers(`
    var ambiguous = {
      daoMeteoraPool: 'met-lp-1',
      meteoraInitialTokens: 900000,
      daoMeteoraPools: [{ poolAddress: 'met-lp-2' }]
    };
    var primaryProject = {
      daoMeteoraPool: 'met-lp-1',
      meteoraLpOwnership: 'project',
      meteoraInitialTokens: 900000,
      daoMeteoraPools: [{ poolAddress: 'met-lp-2', meteoraLpOwnership: 'metadao' }]
    };
    result = {
      ambiguous: _meteoraLpTreasuryRowsForCfg(ambiguous, 2976, 'fallback-met'),
      primaryProject: _meteoraLpTreasuryRowsForCfg(primaryProject, 2976, 'fallback-met')
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    ambiguous: [
      { label: 'MET', val: 2976, addr: 'fallback-met' },
    ],
    primaryProject: [
      { label: 'MET', val: 2976, addr: 'met-lp-1' },
    ],
  });
});

test('Meteora configured pools skip vault-only entries as pool rows', () => {
  const sandbox = loadHelpers(`
    result = _meteoraConfiguredPools({
      daoMeteoraPools: [
        { vaultToken: 'met-token-2', vaultUsdc: 'met-usdc-2' }
      ]
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), []);
});

test('chart treasury split labels spell out Buyback instead of BUY', () => {
  assert.equal(source.includes("span(D, 'BUY ')"), false);
  assert.equal(source.includes("span(M, 'BUY ')"), false);
  assert.equal(source.includes("span(D, 'Buyback ')"), true);
  assert.equal(source.includes("span(M, 'Buyback ')"), true);
  assert.equal((source.match(/if \(buybackTopHtml && _overlaySplitLevel <= 0\) (?:html|extraHtml) \+= '  ' \+ buybackTopHtml;/g) || []).length, 4);
  assert.equal(source.includes("html += '  ' + span(M, 'Prem/Disc ') + span(W, '0%');\n  if (buybackTopHtml) html += '  ' + buybackTopHtml;"), false);
});

test('grouped buyback transactions link the wallet instead of child txs', () => {
  assert.equal(source.includes('function _txGroupedBuybackWalletAddress(group) {'), true);
  assert.equal(source.includes("if (_txDiscoveryTypeKey(group) === 'buyback') {"), true);
  assert.equal(source.includes("'https://solscan.io/account/' + encodeURIComponent(wallet)"), true);
  assert.equal(source.includes('Open buyback wallet on Solscan'), true);
});

test('OMFG chart overlay uses RAY before Meteora LP starts populating', () => {
  const sandbox = loadHelpers(`
    tokenKey = 'omfg';
    CFG = { futAmmLabel: 'FUT1', raydium_label: 'RAY1' };
    result = {
      beforeMet: _overlayPoolLabel({ futUSDC: 10, metUSDC: 0, metTokens: 0 }),
      afterMet: _overlayPoolLabel({ futUSDC: 10, metUSDC: 5, metTokens: 0 }),
      showBefore: _overlayShowMetLabel({ metUSDC: 0, metTokens: 0 }),
      showAfter: _overlayShowMetLabel({ metUSDC: 5, metTokens: 0 })
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    beforeMet: 'RAY1',
    afterMet: 'FUT1',
    showBefore: false,
    showAfter: true,
  });
});

test('OMFG sparse proposals keep numbered labels and all render on the timeline', () => {
  const sandbox = loadHelpers(`
    result = {
      key001: _proposalEventKey({ status: 'passed', resolvedAt: '2025-10-06', title: null }),
      marker001: _proposalMarkerTitle({ status: 'passed', resolvedAt: '2025-10-06', title: null }),
      marker002: _proposalMarkerTitle({ status: 'passed', resolvedAt: '2025-11-03', title: null }),
      marker003: _proposalMarkerTitle({ status: 'passed', resolvedAt: '2026-02-19', title: null }),
      marker004: _proposalMarkerTitle({ status: 'passed', resolvedAt: '2026-03-16', title: null }),
      timeline001: _timelineProposalEvent({ status: 'passed', resolvedAt: '2025-10-06', title: null }),
      timeline002: _timelineProposalEvent({ status: 'passed', resolvedAt: '2025-11-03', title: null }),
      timeline003: _timelineProposalEvent({ status: 'passed', resolvedAt: '2026-02-19', title: null }),
      timeline004: _timelineProposalEvent({ status: 'passed', resolvedAt: '2026-03-16', title: null })
    };
  `, {
    tokenKey: 'omfg',
    CFG: { ticker: 'OMFG', monthlyAllowance: 50000 },
    fmtM: (n) => '$' + Number(n).toLocaleString('en-US'),
    fmt$: (n) => '$' + Number(n).toFixed(2),
  });

  assert.equal(sandbox.result.key001, '2025-10-06-omfg-001-increase-allowance-to-50k-mo-passed');
  assert.equal(sandbox.result.marker001, 'Open proposal: OMFG-001 - Increase Allowance To 50k/mo?');
  assert.equal(sandbox.result.marker002, 'Open proposal: OMFG-002 - Fund Omnipair Security Audits?');
  assert.equal(sandbox.result.marker003, 'Open proposal: OMFG-003 Migrate To V0.6');
  assert.equal(sandbox.result.marker004, 'Open proposal: OMFG-004 Strategic Ecosystem Investment');
  assert.equal(sandbox.result.timeline001.title, 'OMFG-001 - Increase Allowance To 50k/mo?');
  assert.equal(sandbox.result.timeline001.proposalKey, sandbox.result.key001);
  assert.equal(sandbox.result.timeline001.rows[1].val, '$50,000/mo');
  assert.equal(sandbox.result.timeline002.title, 'OMFG-002 - Fund Omnipair Security Audits?');
  assert.equal(sandbox.result.timeline002.note.includes('security audits'), true);
  assert.equal(sandbox.result.timeline002.note.includes('64,000 USDC'), true);
  assert.equal(sandbox.result.timeline002.rows[1].val, '$64,000');
  assert.equal(sandbox.result.timeline002.rows[2].val, 'Rakka');
  assert.equal(sandbox.result.timeline002.rows[3].val, 'Offside + Ackee');
  assert.equal(sandbox.result.timeline002.rows[4].val, '3-5 weeks');
  assert.equal(sandbox.result.timeline003.title, 'OMFG-003 Migrate To V0.6');
  assert.equal(sandbox.result.timeline003.rows[1].val, 'Liquidity migration');
  assert.equal(sandbox.result.timeline004.title, 'OMFG-004 Strategic Ecosystem Investment');
  assert.equal(sandbox.result.timeline004.rows[1].val, '$20,000');
});

test('SOLO sparse prop0002 renders an incentives reserve summary and spend parameters', () => {
  const sandbox = loadHelpers(`
    result = _timelineProposalEvent({ status: 'passed', resolvedAt: '2026-03-16', title: null });
  `, {
    tokenKey: 'solo',
    CFG: { ticker: 'SOLO' },
  });

  assert.equal(sandbox.result.title, 'DP-00002 (MEM): SOLO Acquisition and Restricted Incentives Reserve Framework');
  assert.equal(sandbox.result.note.includes('$1,000,000'), true);
  assert.equal(sandbox.result.note.includes('Restricted Incentives Reserve'), true);
  assert.equal(sandbox.result.rows[1].val, '$1,000,000');
  assert.equal(sandbox.result.rows[2].val, '$0.74');
  assert.equal(sandbox.result.rows[3].val, 'Up to 60 days');
});

test('LOYAL sparse proposals render named timeline events instead of allowance placeholders', () => {
  const sandbox = loadHelpers(`
    result = {
      marker001: _proposalMarkerTitle({ status: 'passed', resolvedAt: '2025-11-29', title: null }),
      marker002: _proposalMarkerTitle({ status: 'passed', resolvedAt: '2025-12-26', title: null }),
      timeline001: _timelineProposalEvent({ status: 'passed', resolvedAt: '2025-11-29', title: null }),
      timeline002: _timelineProposalEvent({ status: 'passed', resolvedAt: '2025-12-26', title: null })
    };
  `, {
    tokenKey: 'loyal',
    CFG: { ticker: 'LOYAL', monthlyAllowance: 60000, buybackAllocated: 1500000 },
  });

  assert.equal(sandbox.result.marker001, 'Open proposal: LOYAL-001 - Buyback Loyal Up To NAV');
  assert.equal(sandbox.result.marker002, 'Open proposal: LOYAL-002 - Liquidity Adjustment Proposal');
  assert.equal(sandbox.result.timeline001.title, 'LOYAL-001 - Buyback Loyal Up To NAV');
  assert.equal(sandbox.result.timeline001.note.includes('$1.5M'), true);
  assert.equal(sandbox.result.timeline001.rows[1].val, '$1,500,000');
  assert.equal(sandbox.result.timeline002.title, 'LOYAL-002 - Liquidity Adjustment Proposal');
  assert.equal(sandbox.result.timeline002.rows[1].val, 'Burn 90% withdrawn');
});

test('known sparse proposal metadata overrides verbose API titles with canonical labels', () => {
  const avici = loadHelpers(`
    result = _proposalMarkerTitle({
      status: 'passed',
      resolvedAt: '2026-04-04',
      title: 'We hereby authorize the creation of the performance package and authorize the changes to the dao parameters'
    });
  `, {
    tokenKey: 'avici',
  });
  assert.equal(avici.result, 'Open proposal: AVICI-001 - Go Big Or Go Home');

  const futardio = loadHelpers(`
    result = _proposalMarkerTitle({
      status: 'passed',
      resolvedAt: '2026-03-07',
      title: 'We authorize the token burn, reduction in monthly allowance and one time payment for Dexscreener/Jupiter update as per the proposal.'
    });
  `, {
    tokenKey: 'futardio',
  });
  assert.equal(futardio.result, 'Open proposal: FUTARDIO-001 - Omnibus Proposal');

  const zkfg = loadHelpers(`
    result = _timelineProposalEvent({ status: 'passed', resolvedAt: '2026-02-10', title: null });
  `, {
    tokenKey: 'zkfg',
  });
  assert.equal(zkfg.result.title, 'ZKFG-004 - ZKFG Restructuring Proposal');
  assert.equal(zkfg.result.rows[1].val, '$500,000');
});

test('performance package burns do not fall through to extra spend allowance fallback', () => {
  const sandbox = loadHelpers(`
    result = _timelineProposalEvent({
      status: 'passed',
      resolvedAt: '2026-04-18',
      title: 'We hereby authorize the burning of the performance package and approve the Q2 roadmap',
      outcomeType: 'performance_package_burn',
      burnAmount: 2000000,
      tokenAmount: 2000000,
      roadmapApproved: true
    });
  `, {
    tokenKey: 'super',
    CFG: { ticker: 'SUPER', monthlyAllowance: 5000 },
  });

  assert.equal(sandbox.result.title, 'Performance Package Burn');
  assert.equal(sandbox.result.note.includes('team performance package'), true);
  assert.equal(sandbox.result.note.includes('spending or allowance'), false);
  assert.equal(sandbox.result.rows.some((row) => row.key === 'Budget'), false);
  assert.equal(sandbox.result.rows.find((row) => row.key === 'Burn Amount').val, '2,000,000 SUPER');
  assert.equal(sandbox.result.rows.find((row) => row.key === 'Roadmap').val, 'Q2 approved');
});

test('generic sparse proposals still render on the timeline with outcome and pricing rows', () => {
  const sandbox = loadHelpers(`
    result = {
      marker: _proposalMarkerTitle({
        status: 'passed',
        resolvedAt: '2026-04-06',
        title: null,
        outcomeType: 'buyback',
        usdcAmount: 500000,
        maxPrice: 0.55
      }),
      timeline: _timelineProposalEvent({
        status: 'passed',
        resolvedAt: '2026-04-06',
        title: null,
        outcomeType: 'buyback',
        usdcAmount: 500000,
        maxPrice: 0.55
      }),
      failed: _timelineProposalEvent({
        status: 'failed',
        resolvedAt: '2026-02-09',
        title: null
      })
    };
  `, {
    tokenKey: 'p2p',
    CFG: { ticker: 'P2P' },
    fmtM: (n) => '$' + Number(n).toLocaleString('en-US'),
    fmt$: (n) => '$' + Number(n).toFixed(2),
  });

  assert.equal(sandbox.result.marker, 'Open proposal: P2P Buyback Program');
  assert.equal(sandbox.result.timeline.title, 'P2P Buyback Program');
  assert.equal(sandbox.result.timeline.rows[0].val, 'passed');
  assert.equal(sandbox.result.timeline.rows[1].val, 'Buyback');
  assert.equal(sandbox.result.timeline.rows[2].val, '$500,000');
  assert.equal(sandbox.result.timeline.rows[3].val, '$0.55');
  assert.equal(sandbox.result.failed.title, 'Governance Proposal');
  assert.equal(sandbox.result.failed.rows[0].val, 'failed');
});

test('proposal marker overlay jumps to the timeline instead of opening external links', () => {
  assert.equal(source.includes("return '<button type=\"button\" class=\"proposal-marker-link\""), true);
  assert.equal(source.includes('function _proposalEventIconHtml(kind, outcome, iconSrc) {'), true);
  assert.equal(source.includes('var iconHtml = _proposalEventIconHtml(layout.kind, layout.outcome, iconSrc);'), true);
  assert.equal(source.includes('e.stopPropagation();\n      _scrollToProposalTimelineEvent(btn.dataset.proposalKey);'), true);
  assert.equal(source.includes("_scrollToProposalTimelineEvent(btn.dataset.proposalKey);"), true);
  assert.equal(source.includes("var dataAttrs = layout.proposalKey ? ' data-proposal-key=\"' + _esc(layout.proposalKey) + '\"' : '';"), true);
  assert.equal(source.includes("data-proposal-key=\"' + _esc(layout.proposalKey || '') + '\""), false);
  assert.equal(source.includes("proposalKey: _proposalEventKey(proposal),"), true);
  assert.equal(source.includes("kind: _proposalMarkerKind(proposal),"), true);
  assert.equal(source.includes('var seenProposalMarkers = {};'), true);
  assert.equal(source.includes('var proposalMarkerKey = _proposalMarkerDedupeKey(proposal, proposalMarker);'), true);
  assert.equal(source.includes('if (!proposalMarkerKey || !seenProposalMarkers[proposalMarkerKey]) {'), true);
  assert.equal(source.includes("addBoxedEventLayout(proposal.time, proposal.title || 'Open passed proposal', proposal.kind || 'proposal', proposal.outcome, proposal.proposalKey, 'nav');"), true);
  assert.equal(source.includes("addBoxedEventLayout(raiseMarker.time, 'Raise: ' + fmtAmt(raiseMarker.amount), 'raise', 'passed', _raiseTimelineProposalKey(), 'nav');"), false);
  assert.equal(source.includes('proposalKey: _raiseTimelineProposalKey(),'), true);
  assert.equal(source.includes("id=\"' + _esc(_proposalTimelineDomId(evt.proposalKey)) + '\""), true);
  assert.equal(source.includes('if (target._jumpFlashFrame) cancelAnimationFrame(target._jumpFlashFrame);'), true);
  assert.equal(source.includes('target._jumpFlashFrame = requestAnimationFrame(function() {\n    target.classList.add(\'proposal-jump-target\');'), true);
});

test('failed middle proposals remain in the collapsible timeline payload', () => {
  assert.equal(source.includes('var middle = events.slice(1, -1);'), true);
  assert.equal(source.includes('var middleHTML = middle.map(function(evt, i) { return _renderEvent(evt, i + 1); }).join(\'\');'), true);
  const sandbox = loadHelpers(`
    var event = _timelineProposalEvent({
      status: 'failed',
      resolvedAt: '2026-03-30',
      title: 'Liquidation Proposal for $SUPER',
      outcomeType: 'liquidation'
    });
    result = { event: event, allowed: _timelineStatusAllowed(event.status) };
  `, { tokenKey: 'super', CFG: { ticker: 'SUPER' } });
  assert.equal(sandbox.result.allowed, true);
  assert.equal(sandbox.result.event.status, 'failed');
  assert.equal(sandbox.result.event.title, 'Liquidation Proposal for $SUPER');
});

test('timeline events render numbered orange index squares', () => {
  assert.equal(source.includes('.timeline-index {'), true);
  assert.equal(source.includes('background: var(--orange);'), true);
  assert.equal(source.includes('.re-card-eff, .re-card-val, .timeline-index {'), true);
  assert.equal(source.includes(".timeline-index {\n  position: absolute;"), true);
  assert.equal(source.includes("font-family: var(--numeric-font);\n  font-size: 10px;"), true);
  assert.equal(source.includes(".timeline-index {\n  position: absolute;\n  left: -24px;\n  top: 10px;\n  width: 20px;\n  height: 20px;\n  display: grid;\n  place-items: center;\n  border-radius: 3px;\n  background: var(--orange);\n  color: #000;\n  font-family: 'JetBrains Mono', monospace;"), false);
  assert.equal(source.includes("list.innerHTML = events.map(_renderEvent).join('');"), true);
  assert.equal(source.includes("'<div class=\"timeline-index\" aria-hidden=\"true\">' + idx + '</div>'"), true);
  assert.equal(source.includes('.timeline-event.proposal-jump-target {\n  border-color: rgba(255,204,0,0.65);\n  box-shadow: inset 0 0 0 1px rgba(255,204,0,0.22), inset 0 0 18px rgba(255,204,0,0.08);'), true);
  assert.equal(source.includes('box-shadow: 0 0 0 1px rgba(255,204,0,0.18), 0 0 0 10px rgba(255,204,0,0.08);'), false);
  assert.equal(source.includes('.timeline-event::after'), false);
});

test('raise timeline event shows participants and keeps raise date unguessed', () => {
  assert.equal(source.includes("title: 'TGE',"), false);
  assert.equal(source.includes("title: 'Raise',"), true);
  assert.equal(source.includes("var raiseDate = CFG.raiseDate || CFG.raiseDateLabel || CFG.raiseWindow || CFG.raiseWindowLabel || '';"), true);
  assert.equal(source.includes("{ key: 'Participants', val: participantsVal },\n        { key: 'Total Commits'"), true);
  assert.equal(source.includes("{ key: 'Funds Accepted', val: CFG.fundsAccepted != null ? fmtM(CFG.fundsAccepted) : '—' },\n        { key: 'Raise Date', val: raiseDate ? _esc(String(raiseDate)) : '—' },\n        { key: 'TGE Date'"), true);
});

test('chart volume toggle is not rendered and overlay split and vertical toggles are independent', () => {
  assert.equal(source.includes('id="volume-toggle" onclick="toggleVolume()"'), false);
  assert.equal(source.includes('id="volume-toggle" title="Volume bars disabled" aria-disabled="true"'), false);
  assert.equal(source.includes('id="btn-split-toggle"'), false);
  assert.equal(source.includes('onclick="toggleOverlaySplits()"'), false);
  assert.equal(source.includes("btn.classList.add('disabled');"), true);
  assert.equal(source.includes("extraHtml += '<br>' + span(M, 'Vol ')"), false);
  assert.equal(source.includes("html += '<br>' + span(M, 'Vol ')"), false);
  assert.equal(source.includes('var _overlayDetailLevel = 1;'), true);
  assert.equal(source.includes('var _overlayFeesExpanded = false;'), false);
  assert.equal(source.includes('function _syncOverlaySplitButton'), true);
  assert.equal(source.includes('var next = _overlaySplitLevel >= 2 ? 0 : _overlaySplitLevel + 1;'), true);
  assert.equal(source.includes('_setOverlaySplitLevel(next);'), true);
  assert.equal(source.includes('_overlaySplitsExpanded = level >= 1;'), false);
  assert.equal(source.includes("btn.classList.add('on');"), true);
  assert.equal(source.includes('function _overlayFeesLineHtml'), true);
  assert.equal(source.includes('function _overlayDaoOwnedLpFeesEnabled'), true);
  assert.equal(source.includes("span(M, 'Accrued Fees ')"), true);
  assert.equal(source.includes("span(M, 'Claimed Fees ')"), false);
  assert.equal(source.includes("span(M, 'USD Fees ')"), false);
});

test('chart renders a grouped timeframe menu backed by stored resolutions', () => {
  assert.equal(source.includes('id="chart-timeframe-trigger"'), true);
  assert.equal(source.includes('id="chart-timeframe-menu" role="menu"'), true);
  assert.equal(source.includes('id="chart-timeframe-minutes">Minutes</div>'), true);
  assert.equal(source.includes('id="chart-timeframe-hours">Hours</div>'), true);
  assert.equal(source.includes('id="chart-timeframe-days">Days</div>'), true);
  assert.equal(source.includes('data-tf="1m">1 minute</button>'), true);
  assert.equal(source.includes('data-tf="5m">5 minutes</button>'), true);
  assert.equal(source.includes('data-tf="15m">15 minutes</button>'), true);
  assert.equal(source.includes('data-tf="1H">1 hour</button>'), true);
  assert.equal(source.includes('data-tf="4H">4 hours</button>'), true);
  assert.equal(source.includes('data-tf="1D">1 day</button>'), true);
  assert.equal(source.includes('data-tf="1W">1 week</button>'), true);
  assert.equal(source.includes('data-tf="1MO"'), false);
  assert.equal(source.includes("var _tfOrder = ['1m', '5m', '15m', '1H', '4H', '1D', '1W'];"), true);
});

test('embed projected NAV badge uses the same label-only chip style as NAV and PRICE', () => {
  assert.equal(source.includes("pnb.innerHTML = '<span>PNAV</span> '"), false);
  assert.equal(source.includes("_placeLiveBadge(pnb, pnavX, pnavY, 'PROJECTED NAV');"), true);
  assert.match(source, /var pnavVisible = _isChartEmbed[\s\S]*&& _lwNavForecastData\.length > 1;/);
  assert.equal(source.includes('pnavX = ts.timeToCoordinate(_embedCurrentNavAnchor.time);'), true);
  assert.equal(source.includes('pnavY = _lwNavForecast.priceToCoordinate(_embedCurrentNavAnchor.value);'), true);
  assert.equal(source.includes('pnavTop += 16'), false);
  assert.equal(source.includes('pnavTop -= 16'), false);
  assert.equal(source.includes('.live-value-badge.price { border-color: rgba(200,216,228,0.22); color: #c8d8e4; font-size: 10px; letter-spacing: 0.01em; }'), false);
});

test('projected NAV spans twelve months of eligible allowance withdrawals', () => {
  assert.equal(source.includes('var _NAV_PROJECTION_HORIZON_MONTHS = 12;'), true);
  assert.equal(source.includes('var _fcDays = _NAV_PROJECTION_HORIZON_MONTHS * _NAV_PROJECTION_DAYS_PER_MONTH;'), true);
  assert.equal(source.includes('_projectTreasuryAfterScheduledWithdrawals('), true);
  assert.equal(source.includes('Withdrawals stop before exhausting the treasury.'), true);
});

test('projected NAV preserves runway when the next withdrawal would exhaust treasury', () => {
  const sandbox = loadHelpers(`
    result = {
      remaining: _projectTreasuryAfterScheduledWithdrawals(250, 100, 12),
      checkpoints: _pnavCheckpointValues({
        treasuryUSDC: 250,
        supply: { effective: 100 }
      }, 100, 1)
    };
  `, {
    _PNAV_CHECKPOINT_MONTHS: [3, 6, 12],
  });

  assert.equal(sandbox.result.remaining, 50);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.result.checkpoints)),
    [
      { month: 3, value: 0.5 },
      { month: 6, value: 0.5 },
      { month: 12, value: 0.5 },
    ],
  );
  assert.equal(source.includes('if (_fcRemaining > _fcActualBurn) {'), true);
  assert.equal(source.includes('var _fcAppliedClaimDays = {};'), true);
  assert.equal(source.includes('var _fcDepleted = false;'), false);
  assert.equal(source.includes('&& _embedDayNav < Number(_embedProjection.points[_epi - 1].nav)'), true);
});

test('projected NAV shows milestone reference lines, styled tags, and right-axis prices', () => {
  assert.equal(source.includes('var _PNAV_CHECKPOINT_MONTHS = [3, 6, 12];'), true);
  assert.match(source, /function _createPnavCheckpointLines[\s\S]*lineVisible: true,[\s\S]*axisLabelVisible: true,[\s\S]*title: ''/);
  assert.equal(source.includes('axisLabelVisible: true'), true);
  assert.equal(source.includes('_lwPnavLine = terminal ? terminal.line : null;'), true);
  assert.equal(source.includes("quarterBadge.className = 'live-value-badge pnav pnav-quarter live-badge-pnav-quarter';"), true);
  assert.equal(source.includes("_placeLiveBadge(checkpointBadge, checkpointX, checkpointY, 'PNAV+' + checkpointLine.month);"), true);
});

test('embed projected NAV tag leads the twelve-month forecast window', () => {
  assert.equal(source.includes('transform: translate(10px, calc(-100% - 8px));'), true);
  assert.equal(source.includes('transform: translate(-50%, calc(-100% - 8px));'), false);
});

test('chart shows NAV and projected NAV badges as mutually exclusive states', () => {
  assert.equal(source.includes("var showNavBadge = _showCurrentNavLine && !_layerNavForecast;"), true);
  assert.match(source, /if \(showNavBadge && _placeLiveBadge\(nb, badgePoint\.x, badgePoint\.y, 'NAV'\)\) navBadgeTop = badgePoint\.y;/);
});

test('embed renders current and projected NAV as one continuous dashed series', () => {
  assert.match(source, /_lwEmbedNavReference = _lwChart\.addSeries\(LightweightCharts\.LineSeries, \{[\s\S]*lineWidth: 2,[\s\S]*lineStyle: LightweightCharts\.LineStyle\.Dashed,/);
  assert.match(source, /_lwNavForecast = _lwChart\.addSeries\(LightweightCharts\.LineSeries, \{[\s\S]*lineWidth: _isChartEmbed \? 2 : 0,[\s\S]*lineStyle: LightweightCharts\.LineStyle\.Dashed,/);
  assert.equal(source.includes('var _lwEmbedJoinedNavData = []; // one continuous current + projected NAV display path'), true);
  assert.equal(source.includes('_lwEmbedJoinedNavData = _lwEmbedNavReferenceData.slice();'), true);
  assert.equal(source.includes('forecastData = showEmbedNavSeries ? _lwEmbedJoinedNavData : [];'), true);
  assert.match(source, /_lwEmbedNavReference\.applyOptions\(\{\s+visible: false,/);
  assert.match(source, /_lwNavLine = navLineHost\.createPriceLine\(\{[\s\S]*lineVisible: !_isChartEmbed,[\s\S]*axisLabelVisible: true,/);
});

test('embed projected NAV steps keep scale-accurate solid vertical connectors', () => {
  assert.equal(source.includes('function drawEmbedProjectionSteps(ctx, ts, plotW, chartH) {'), true);
  assert.equal(source.includes('ctx.moveTo(Math.round(stepX) + 0.5, fromY);'), true);
  assert.equal(source.includes('ctx.lineTo(Math.round(stepX) + 0.5, toY);'), true);
  assert.equal(source.includes('drawEmbedProjectionSteps(ctx, ts, plotW, chartH);'), true);
});

test('projected NAV keeps the full-page NAV dot but removes it from embeds', () => {
  assert.equal(source.includes("var showNavDot = !_isChartEmbed;"), true);
  assert.equal(source.includes("if (nd && showNavDot && navVisible && _lwNavHistory && _lwNavHistory.length > 0) {"), true);
  assert.equal(source.includes('var forecastVisible = false;'), true);
  assert.equal(source.includes("if (!_isMetricChartMode() && _layerNav && _showCurrentNavLine && (!_layerNavForecast || _isChartEmbed) && navVal > 0) {"), true);
  assert.match(source, /var wantNavReferenceLine = !_isMetricChartMode\(\)[\s\S]*&& \(!_layerNavForecast \|\| _isChartEmbed\)[\s\S]*&& _shouldAppendLivePricePoint\(\);/);
  assert.equal(source.includes('} else if (wantNavReferenceLine && !_lwNavLine && _navPerToken > 0) {'), true);
  assert.equal(source.includes("if (legNav)  legNav.style.display  = (showNav && !_layerNavForecast) ? '' : 'none';"), true);
});

test('embed price axis tag keeps a black background with a white numeric label', () => {
  assert.match(source, /function _priceAxisLabelTextColor\(lineColor\) \{\s+if \(_isChartEmbed\) return '#ffffff';/);
  assert.equal(source.includes("var priceLineColor = _isChartEmbed ? '#111111' : '#c8d8e4';"), true);
  assert.equal(source.includes("var plColor = _isChartEmbed ? '#111111' : '#c8d8e4';"), true);
  assert.match(source, /_lwPriceLine\.applyOptions\(\{\s+lineVisible: !_isChartEmbed,\s+axisLabelVisible: true,\s+axisLabelTextColor: _priceAxisLabelTextColor\(plColor\)/);
});

test('embed NAV axis tag follows the active current or projected NAV price', () => {
  assert.match(source, /function _activeNavAxisPrice\(fallbackPrice\) \{[\s\S]*_layerNavForecast[\s\S]*_lwNavForecastData\[_lwNavForecastData\.length - 1\]\.value/);
  assert.match(source, /_lwNavLine = navLineHost\.createPriceLine\(\{[\s\S]*price: navAxisVal,[\s\S]*color: _isChartEmbed \? '#111111' : '#ffcc00',[\s\S]*axisLabelTextColor: _isChartEmbed \? '#ffffff' : '#111111',/);
  assert.equal(source.includes('_lwNavLine.applyOptions({ price: _activeNavAxisPrice(navPerToken * mult) });'), true);
  assert.match(source, /_lwNavLine\.applyOptions\(\{[\s\S]*price: _activeNavAxisPrice\(_navCurrentAxisVal\),[\s\S]*axisLabelTextColor: _isChartEmbed \? '#ffffff' : '#111111',/);
});

test('launch marker matches the price gradient and current-dot size', () => {
  assert.equal(source.includes("function(dot) { return _priceLineGradientColorAtPoint(launchPricePoints, dot.y, 1); }"), true);
  assert.match(source, /var launchPriceDotColor = _isChartEmbed\s+\? '#111111'/);
  assert.match(source, /drawLaunchDot\(_launchPriceMarkerPoint, priceSeries, launchPriceDotColor, launchPriceDotShadow, 3\.5\);/);
  assert.equal(source.includes("if (!showLaunchPriceMarker && _layerNav"), true);
});

test('default chart overlay uses the latest actual chart date in the header', () => {
  const sandbox = loadHelpers(`
    result = {
      daily: _overlayHeaderDateLabel(Date.UTC(2026, 3, 14) / 1000, '1D'),
      intraday: _overlayHeaderDateLabel(Date.UTC(2026, 3, 14, 13, 5) / 1000, '1H'),
      latestFromPrice: _defaultChartOverlayTime(),
    };
  `, {
    _lwPriceCache: [{ time: 100 }, { time: 250 }],
    _lwNavHistory: [{ time: 150 }, { time: 200 }],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    daily: '4/14/26',
    intraday: '4/14/26 13:05 UTC',
    latestFromPrice: 250,
  });

  const navSandbox = loadHelpers(`
    result = _defaultChartOverlayTime();
  `, {
    _lwPriceCache: [{ time: 100 }, { time: 150 }],
    _lwNavHistory: [{ time: 175 }, { time: 300 }],
  });

  assert.equal(navSandbox.result, 300);
});

test('public chart headers do not render the internal 01Resolved source as a lifecycle label', () => {
  assert.equal(source.includes("span(M, '01Resolved')"), false);
});

test('chart top-left overlay no longer computes a current-point volume fallback', () => {
  assert.equal(source.includes("var _liveVolumeFallback = (_chartTF === '1D' && _lwPriceCache && _lwPriceCache.length > 0 && param.time === _lwPriceCache[_lwPriceCache.length - 1].time && CFG.volume24hUsd > 0)"), false);
  assert.equal(source.includes("if ((!volVal || volVal <= 0) && _liveVolumeFallback > 0) volVal = _liveVolumeFallback;"), false);
});

test('prelaunch chart hover uses ICO snapshot data instead of generic no-data dashes', () => {
  assert.equal(source.includes("if (_chartOverlayMode === 'prelaunch-data') {\n    _showChartOverlayPreLaunch(_chartOverlayHoverTime);\n    return;\n  }"), true);
  assert.equal(source.includes('function _chartPreLaunchOverlayHtml(hoverTime) {'), true);
  assert.equal(source.includes("if (!(v > 0)) return '\\u2014';"), true);
  assert.equal(source.includes("if (_edgeZone === 'before') {\n        _showChartOverlayPreLaunch(null);\n        return;\n      }"), true);
  assert.equal(source.includes("if (_beforePriceData && !(_navValAtPointer > 0)) {\n      _showChartOverlayPreLaunch(param.time);\n      return;\n    }"), true);
});

test('projected chart hover clamps right-of-PNAV overlay to the terminal projected point', () => {
  const sandbox = loadHelpers(`
    result = {
      inside: _projectedOverlayPointAt(150),
      after: _projectedOverlayPointAt(999)
    };
  `, {
    _lwNavForecastData: [
      { time: 100, value: 1.1 },
      { time: 200, value: 1.2 },
    ],
    _fcLookup: {
      100: { treasury: 1000 },
      200: { treasury: 900 },
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    inside: { time: 200, value: 1.2, meta: { treasury: 900 } },
    after: { time: 200, value: 1.2, meta: { treasury: 900 } },
  });
  assert.equal(source.includes("if (_chartOverlayMode === 'projected-data') {\n    _showChartOverlayProjected(_chartOverlayHoverTime);\n    return;\n  }"), true);
  assert.equal(source.includes('function _chartProjectedOverlayHtml(projectTime) {'), true);
  assert.equal(source.includes("if (_edgeZone === 'after' && _layerNavForecast) {\n        _showChartOverlayProjected(null);\n        return;\n      }"), true);
  assert.equal(source.includes("if (_pastPriceData && !(_navValAtPointer > 0)) {"), true);
});

test('projected NAV hover no longer renders a fees row in the top-left overlay', () => {
  assert.equal(source.includes('var _projectedNoFee = true;'), false);
  assert.equal(source.includes("var _nfcStr = (_projectedNoFee || !_overlayPctVisible || !_nfcVal) ? '' :"), false);
  assert.equal(source.includes("if (_overlaySplitsExpanded) html += '<br>' + span(M, 'Fees ') + span(W, '\\u2014') + _nfcStr;"), false);
  assert.equal(source.includes("span(M, 'P.Treasury ')"), true);
  assert.equal(source.includes("span(M, 'P. Treasury ')"), false);
  assert.equal(source.includes("span(M, 'P.Spend ')"), true);
  assert.equal(source.includes("span(M, 'Spend ') + span('#f04060', fmtM(projected.meta.withdraw))"), false);
});

test('past-latest hover falls back to current overlay when projected NAV is off', () => {
  assert.equal(source.includes("if (!_layerNavForecast) {\n        _resetChartCrosshairOverlay();\n        return;\n      }"), true);
  assert.equal(source.includes("_showChartOverlayProjected(param.time);"), true);
});

test('forecast series only loads future range when projected NAV is active', () => {
  assert.equal(source.includes('var _lwForecastMarkerData = []; // cached forecast markers so future range only exists when enabled'), true);
  assert.equal(source.includes('var showForecastSeries = !!(_layerNavForecast && _layerNav && _lwNavForecastData && _lwNavForecastData.length > 0);'), true);
  assert.equal(source.includes('var forecastData = showForecastSeries ? _lwNavForecastData : [];'), true);
  assert.equal(source.includes('try { _lwNavForecast.setData(forecastData); } catch(e) {}'), true);
  assert.equal(source.includes("if (_fcWithdraws[_fi].time === _fcLastTime) continue;"), false);
  assert.equal(source.includes('_lwForecastMarkerData = _fcMarkers.slice();\n      _syncForecastSeriesData();'), true);
});

test('projected spend footer uses one total spend label', () => {
  assert.equal(source.includes("text: 'Total Raise: ' + fmtAmt(grandMovementRaise)"), true);
  assert.equal(source.includes("monthFlowLabels.push({ text: '+' + fmtAmt(monthRaise)"), true);
  assert.equal(source.includes('if (navFlowActive && CFG && (CFG.initialRaiseUsd > 0 || CFG.baseRaiseUsd > 0 || CFG.totalRaiseUsd > 0 || CFG.fundsAccepted > 0)) {'), true);
  assert.equal(source.includes('function _configuredInitialRaiseUsd() {'), true);
  assert.equal(source.includes('var configuredInitialRaise = _configuredInitialRaiseUsd();'), true);
  assert.equal(source.includes("text: 'Total Spend: ' + fmtAmt(grandVisibleWithdrawals)"), true);
  assert.equal(source.includes("text: 'Total Deposits: ' + fmtAmt(grandMovementDeposits)"), true);
  assert.equal(source.includes('var movementTotals = { raise: {}, deposit: {}, withdraw: {} };'), true);
  assert.equal(source.includes('var raiseMarkerByTime = {};'), true);
  assert.equal(source.includes('function addRaiseMarker(time, amount, mergeMode) {'), true);
  assert.equal(source.includes("var key = snappedRaiseTime !== null ? ('price:' + snappedRaiseTime) : ('period:' + (flowPeriodKeyForTime(time) || time));"), true);
  assert.equal(source.includes("if (mergeMode === 'max') raiseMarkerByTime[key].amount = Math.max(raiseMarkerByTime[key].amount, amount);"), true);
  assert.equal(source.includes('var isMovementRaiseDeposit = _displayMovementIsRaiseDeposit(mv);'), true);
  assert.equal(source.includes('movementTotals.raise[mmo] = (movementTotals.raise[mmo] || 0) + mvRaiseAmount;'), true);
  assert.equal(source.includes('addRaiseMarker(mt, mvRaiseAmount);'), true);
  assert.equal(source.includes("addRaiseMarker(raiseTime, configuredInitialRaise, 'max');"), true);
  assert.equal(source.includes("addBoxedEventLayout(raiseMarker.time, 'Raise: ' + fmtAmt(raiseMarker.amount), 'raise', 'passed', _raiseTimelineProposalKey(), 'nav');"), false);
  assert.equal(source.includes('var isMovementWithdrawal = mv.effect === \'withdrawal\' && _displayMovementIsOperationalWithdrawal(mv) && topWithdrawalIndexes[mi];'), true);
  assert.equal(source.includes("monthFlowLabels.push({ text: '+' + fmtAmt(monthDeposit)"), true);
  assert.equal(source.includes("monthFlowLabels.push({ text: '-' + fmtAmt(monthWithdrawal)"), true);
  assert.equal(source.includes("return amount > 0 ? span(M, 'Deposit ') + span(G, '+' + fmtM(amount)) : '';"), true);
  assert.equal(source.includes("return amount > 0 ? span(M, 'Spend ') + span(R, '\\u25BC ' + fmtM(amount)) : '';"), true);
  assert.equal(source.includes("return amount > 0 ? span(M, 'Raise ') + span(G, '\\u25B2 ' + fmtM(amount)) : '';"), true);
  assert.equal(source.includes("return amount > 0 ? span(M, 'Raise ') + span(G, '\\u25B2 ' + _overlayFmtNum(amount)) : '';"), true);
  assert.equal(source.includes("if (buybackTopHtml && _overlaySplitLevel <= 0) html += '  ' + buybackTopHtml;\n      if (raiseTreasuryHtml) html += '  ' + raiseTreasuryHtml;\n      if (depositTopHtml) html += '  ' + depositTopHtml;\n      if (withdrawTopHtml) html += '  ' + withdrawTopHtml;"), true);
  assert.equal(source.includes("if (buybackTopHtml && _overlaySplitLevel <= 0) extraHtml += '  ' + buybackTopHtml;\n      if (raiseTreasuryHtml) extraHtml += '  ' + raiseTreasuryHtml;\n      if (depositTopHtml) extraHtml += '  ' + depositTopHtml;\n      if (withdrawTopHtml) extraHtml += '  ' + withdrawTopHtml;"), true);
  assert.equal(source.includes('Total Withdrawls'), false);
  assert.equal(source.includes('Total Withdrawals + P. Withdrawals'), false);
  assert.equal(source.includes('Total P. Withdrawals'), false);
});

test('null-time hover to the right of live data falls back to current overlay when projected NAV is off', () => {
  assert.equal(source.includes("var _edgeZone = _chartHoverEdgeZone(param.point.x);"), true);
  assert.equal(source.includes("if (_edgeZone === 'after' && !_layerNavForecast) {\n        _resetChartCrosshairOverlay();\n        return;\n      }"), true);
});

test('chart interaction state clears stale crosshair data on hide and return', () => {
  assert.equal(source.includes('function _clearChartInteractionState() {'), true);
  assert.equal(source.includes('function _refreshChartInteractionState() {'), true);
  assert.equal(source.includes('function _restoreChartCrosshairState() {'), true);
  assert.equal(source.includes("_clearChartInteractionState();\n      if (_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }"), true);
  assert.equal(source.includes("_chartSuspendedCrosshairState = _chartPointerInside ? _lastChartCrosshairState : null;"), true);
  assert.equal(source.includes("_lwChart.setCrosshairPosition(state.price, state.time, series);"), true);
  assert.equal(source.includes("_chartSuspendedCrosshairState = null;\n  _lastChartCrosshairState = null;\n  _chartPointerClientPos = null;"), true);
  assert.equal(source.includes("_refreshChartInteractionState();\n      _startRefreshInterval();"), true);
  assert.equal(source.includes("window.addEventListener('blur', _clearChartInteractionState);"), true);
  assert.equal(source.includes("window.addEventListener('pagehide', _clearChartInteractionState);"), true);
  assert.equal(source.includes("window.addEventListener('focus', _refreshChartInteractionState);"), true);
  assert.equal(source.includes("window.addEventListener('pageshow', _refreshChartInteractionState);"), true);
});

test('NAV accounting helpers normalize API and config field names', () => {
  const sandbox = loadHelpers(`
    var apiShape = {
      spot: 2,
      treasuryUSDC: 1000,
      effectiveSupply: 500,
      onChainSupply: 1000,
      lockedTokens: 100,
      daoTokens: 50,
      metadaoFeeTokens: 25
    };
    var cfgShape = {
      spot: 2,
      treasuryUSDC: 1000,
      effectiveSupply: 500,
      onChainSupply: 1000,
      lockTokenBalance: 100,
      daoTokenBalance: 50,
      metadaoFeeTokens: 25
    };
    result = {
      apiCirc: _circulatingSupplyForNav(apiShape),
      cfgCirc: _circulatingSupplyForNav(cfgShape),
      nav: _navPerTokenFromCfg(apiShape),
      mcap: _marketCapFromCfg(apiShape),
      effMcap: _effectiveMarketCapFromCfg(apiShape),
      fdvVerified: _fdvFromCfg(apiShape, false),
      fdvUnverified: _fdvFromCfg(apiShape, true)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    apiCirc: 825,
    cfgCirc: 825,
    nav: 2,
    mcap: 1650,
    effMcap: 1000,
    fdvVerified: 1900,
    fdvUnverified: 2000,
  });
});

test('NAV accounting subtracts investor and ambassador locks from circulating supply', () => {
  const sandbox = loadHelpers(`
    var camelShape = {
      spot: 2,
      treasuryUSDC: 1000,
      effectiveSupply: 500,
      onChainSupply: 1000,
      lockedTokens: 100,
      daoTokens: 50,
      investorLocked: 200,
      ambassadorLocked: 25,
      metadaoFeeTokens: 10
    };
    var snakeShape = {
      spot: 2,
      treasury_usdc: 1000,
      effective_supply: 500,
      on_chain_supply: 1000,
      locked_tokens: 100,
      dao_tokens: 50,
      investor_locked: 200,
      ambassador_locked: 25,
      metadao_fee_tokens: 10
    };
    result = {
      camelCirc: _circulatingSupplyForNav(camelShape),
      snakeCirc: _circulatingSupplyForNav(snakeShape),
      mcap: _marketCapFromCfg(camelShape)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    camelCirc: 615,
    snakeCirc: 615,
    mcap: 1230,
  });
});

test('NAV accounting uses the canonical MetaDAO fee-token aggregate without double counting sources', () => {
  const sandbox = loadHelpers(`
    var cfg = {
      spot: 2,
      treasuryUSDC: 1000,
      effectiveSupply: 500,
      onChainSupply: 1000,
      lockedTokens: 100,
      daoTokens: 50,
      metadaoFeeTokens: 10,
      futAmmUnclaimedFeeTokens: 5,
      meteoraMdaoLpFeeTokens: 2
    };
    var snap = _buildNavSnapshot(cfg);
    result = {
      fees: _metadaoFeeTokensForNav(cfg),
      circulating: _circulatingSupplyForNav(cfg),
      snapshotFees: snap.supply.metadaoFeeTokens,
      marketCap: snap.market.marketCap
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    fees: 10,
    circulating: 840,
    snapshotFees: 10,
    marketCap: 1680,
  });
});

test('NAV snapshot normalization recomputes circulating supply with top-level investor locks', () => {
  const sandbox = loadHelpers(`
    var snap = _buildNavSnapshot({
      key: 'p2p',
      spot: 2,
      treasuryUSDC: 1000,
      effectiveSupply: 500,
      onChainSupply: 1000,
      lockedTokens: 100,
      daoTokens: 50,
      investorLocked: 200,
      navSnapshot: {
        status: 'verified',
        treasuryUSDC: 1000,
        navPerToken: 2,
        supply: { effective: 500, onChain: 1000, circulating: 850, locked: 100, dao: 50 },
        market: { spot: 2, marketCap: 1700 }
      }
    });
    result = {
      circulating: snap.supply.circulating,
      investorLocked: snap.supply.investorLocked,
      marketCap: snap.market.marketCap
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    circulating: 650,
    investorLocked: 200,
    marketCap: 1300,
  });
});

test('NAV accounting accepts snake_case NAV fields from API payloads', () => {
  const sandbox = loadHelpers(`
    var snap = _buildNavSnapshot({
      key: 'futardio',
      nav: 2.25,
      treasury_usdc: 1000,
      effective_supply: 500,
      on_chain_supply: 1000,
      locked_tokens: 100,
      dao_tokens: 50,
      snapshot_time: '2026-04-07T12:00:00Z',
      nav_verified: true
    }, { nowMs: Date.parse('2026-04-07T12:20:00Z') });
    result = {
      navPerToken: snap.navPerToken,
      treasuryUSDC: snap.treasuryUSDC,
      effective: snap.supply.effective,
      circulating: snap.supply.circulating,
      status: snap.status,
      issues: snap.issues
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    navPerToken: 2.25,
    treasuryUSDC: 1000,
    effective: 500,
    circulating: 850,
    status: 'partial',
    issues: ['reported_nav_mismatch'],
  });
});

test('project-owned Meteora fee telemetry stays separate from LP principal', () => {
  const sandbox = loadHelpers(`
    var aggregateOnly = _navTreasuryComponentsForCfg({
      treasuryUSDC: 1000,
      futAmmUSDC: 100,
      meteoraLpUSDC: 200,
      projectOwnsMeteoraLp: true,
      meteoraMdaoLpFeeUSDC: 75
    });
    var explicitProject = _navTreasuryComponentsForCfg({
      treasuryUSDC: 1000,
      futAmmUSDC: 100,
      meteoraLpUSDC: 200,
      project_lp_fee_usdc: 50,
      meteoraMdaoLpFeeUSDC: 75
    });
    result = {
      aggregateFeeRow: aggregateOnly.components.some(function(c) { return c.key === 'projectLpFeeUSDC'; }),
      aggregateMeteora: aggregateOnly.components.find(function(c) { return c.key === 'meteoraLpUSDC'; }).usd,
      aggregateImpliedDao: aggregateOnly.impliedDaoUSDC,
      explicitFeeRow: explicitProject.components.some(function(c) { return c.key === 'projectLpFeeUSDC'; }),
      explicitMeteora: explicitProject.components.find(function(c) { return c.key === 'meteoraLpUSDC'; }).usd,
      explicitImpliedDao: explicitProject.impliedDaoUSDC
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    aggregateFeeRow: false,
    aggregateMeteora: 200,
    aggregateImpliedDao: 700,
    explicitFeeRow: false,
    explicitMeteora: 200,
    explicitImpliedDao: 700,
  });
});

test('current-nav hydration ignores null snake_case fallbacks for LP fee fields', async () => {
  const sandbox = loadHelpers(`
    CFG = {
      spot: 1,
      treasuryUSDC: 1000,
      effectiveSupply: 500,
      meteoraLpUSDC: 120,
      projectLpFeeUSDC: 42,
      projectLpFeeTokens: 84
    };
    resultPromise = fetchFromAPI(Promise.resolve({
      treasury_usdc: null,
      effective_supply: null,
      meteora_pool_usdc: null,
      project_lp_fee_usdc: null,
      project_lp_fee_tokens: null,
      nav: 2
    })).then(function(ok) {
      var afterNull = {
        ok: ok,
        treasuryUSDC: CFG.treasuryUSDC,
        effectiveSupply: CFG.effectiveSupply,
        meteoraLpUSDC: CFG.meteoraLpUSDC,
        projectLpFeeUSDC: CFG.projectLpFeeUSDC,
        projectLpFeeTokens: CFG.projectLpFeeTokens
      };
      return fetchFromAPI(Promise.resolve({
        meteora_lp_usdc: 150,
        projectLpFeeUsdc: 55,
        projectLpFeeToks: 110
      })).then(function() {
        result = {
          afterNull: afterNull,
          meteoraLpUSDC: CFG.meteoraLpUSDC,
          projectLpFeeUSDC: CFG.projectLpFeeUSDC,
          projectLpFeeTokens: CFG.projectLpFeeTokens
        };
      });
    });
  `, {
    API_BASE: '',
    tokenKey: 'solo',
    _pruneNavCachesToSnapshot: () => {},
    _markFresh: () => {},
    document: { getElementById: () => null },
    console: { log() {}, warn() {}, error() {} },
  });

  await sandbox.resultPromise;

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    afterNull: {
      ok: false,
      treasuryUSDC: 1000,
      effectiveSupply: 500,
      meteoraLpUSDC: 120,
      projectLpFeeUSDC: 42,
      projectLpFeeTokens: 84,
    },
    meteoraLpUSDC: 150,
    projectLpFeeUSDC: 55,
    projectLpFeeTokens: 110,
  });
});

test('current-nav hydration stores Meteora pool split payload', async () => {
  const sandbox = loadHelpers(`
    CFG = { spot: 1 };
    resultPromise = fetchFromAPI(Promise.resolve({
      nav: 1,
      meteoraPoolTokens: 300,
      meteoraPoolUSDC: 120,
      meteoraPools: [
        { poolAddress: 'pool-a', principalTokens: 100, principalUSDC: 0 },
        { poolAddress: 'pool-b', principalTokens: 200, principalUSDC: 120 }
      ]
    })).then(function(ok) {
      result = {
        ok: ok,
        meteoraLpTokens: CFG.meteoraLpTokens,
        meteoraLpUSDC: CFG.meteoraLpUSDC,
        poolCount: CFG.meteoraPools.length,
        poolB: CFG.meteoraPools[1].poolAddress
      };
    });
  `, {
    API_BASE: '',
    tokenKey: 'solo',
    _pruneNavCachesToSnapshot: () => {},
    _markFresh: () => {},
    document: { getElementById: () => null },
    console: { log() {}, warn() {}, error() {} },
  });

  await sandbox.resultPromise;

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    ok: false,
    meteoraLpTokens: 300,
    meteoraLpUSDC: 120,
    poolCount: 2,
    poolB: 'pool-b',
  });
});

test('NAV accounting falls back to effective supply when circulating supply is invalid', () => {
  const sandbox = loadHelpers(`
    result = _circulatingSupplyForNav({
      effectiveSupply: 500,
      onChainSupply: 100,
      lockedTokens: 100,
      daoTokens: 50
    });
  `);

  assert.equal(sandbox.result, 500);
});

test('NAV snapshot records provenance and verified receipt data', () => {
  const sandbox = loadHelpers(`
    result = _buildNavSnapshot({
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
      snapshotTime: '2026-04-07T12:00:00Z'
    }, { nowMs: Date.parse('2026-04-07T12:20:00Z') });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify({
    token: sandbox.result.token,
    status: sandbox.result.status,
    timestamp: sandbox.result.timestamp,
    navPerToken: sandbox.result.navPerToken,
    circulating: sandbox.result.supply.circulating,
    treasuryTotal: sandbox.result.treasury.componentTotalUSDC,
    impliedDao: sandbox.result.treasury.impliedDaoUSDC,
    issues: sandbox.result.issues,
  })), {
    token: 'solo',
    status: 'verified',
    timestamp: '2026-04-07T12:00:00.000Z',
    navPerToken: 2,
    circulating: 850,
    treasuryTotal: 1000,
    impliedDao: 600,
    issues: [],
  });
});

test('NAV snapshot fails closed for missing core NAV inputs', () => {
  const sandbox = loadHelpers(`
    var snap = _buildNavSnapshot({ key: 'bad', navVerified: true }, { nowMs: Date.parse('2026-04-07T12:20:00Z') });
    result = {
      status: snap.status,
      blocks: _navSnapshotBlocksNav(snap),
      issues: snap.issues.map(_navSnapshotIssueLabel)
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    status: 'unverified',
    blocks: true,
    issues: ['missing treasury total', 'missing effective supply', 'missing snapshot time'],
  });
});

test('NAV snapshot marks stale or internally inconsistent receipts as not verified', () => {
  const sandbox = loadHelpers(`
    result = {
      stale: _buildNavSnapshot({
        key: 'old',
        treasuryUSDC: 1000,
        effectiveSupply: 500,
        navVerified: true,
        snapshotTime: '2026-04-07T10:00:00Z'
      }, { nowMs: Date.parse('2026-04-07T12:30:00Z'), maxAgeMs: 60 * 60 * 1000 }).status,
      mismatch: _buildNavSnapshot({
        key: 'mismatch',
        treasuryUSDC: 1000,
        effectiveSupply: 500,
        nav: 3,
        navVerified: true,
        snapshotTime: '2026-04-07T12:00:00Z'
      }, { nowMs: Date.parse('2026-04-07T12:20:00Z') }).status
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    stale: 'stale',
    mismatch: 'partial',
  });
});

test('NAV snapshot prefers backend receipt with source provenance', () => {
  const sandbox = loadHelpers(`
    result = _buildNavSnapshot({
      key: 'solo',
      spot: 3,
      treasuryUSDC: 1000,
      effectiveSupply: 500,
      navSnapshot: {
        formulaVersion: 'nav-v2',
        token: 'solo',
        ticker: 'SOLO',
        status: 'verified',
        timestamp: '2026-04-07T12:00:00.000Z',
        slot: 321,
        blockTime: '2026-04-07T11:59:58.000Z',
        treasuryUSDC: 1200,
        navPerToken: 4,
        supply: { effective: 300, onChain: 400, circulating: 250, locked: 50, dao: 100, metadaoFeeTokens: 0 },
        treasury: {
          reportedUSDC: 1200,
          componentTotalUSDC: 1200,
          components: [{ key: 'daoUSDC', label: 'DAO Treasury', usd: 1200, address: 'Dao111' }]
        },
        market: { spot: 3, marketCap: 750, effectiveMarketCap: 900, fdv: 1200 },
        sources: { rpc: { provider: 'Helius' }, price: { provider: 'DexScreener', pairAddress: 'Pair111' } },
        addresses: { daoWallet: 'Dao111' }
      }
    });
  `);

  assert.deepEqual(JSON.parse(JSON.stringify({
    formulaVersion: sandbox.result.formulaVersion,
    status: sandbox.result.status,
    navPerToken: sandbox.result.navPerToken,
    treasuryUSDC: sandbox.result.treasuryUSDC,
    effective: sandbox.result.supply.effective,
    slot: sandbox.result.slot,
    rpcProvider: sandbox.result.sources.rpc.provider,
    daoWallet: sandbox.result.addresses.daoWallet,
  })), {
    formulaVersion: 'nav-v2',
    status: 'verified',
    navPerToken: 4,
    treasuryUSDC: 1200,
    effective: 300,
    slot: 321,
    rpcProvider: 'Helius',
    daoWallet: 'Dao111',
  });
});

test('current NAV tail preserves top-level DAO treasury USD amount', () => {
  const sandbox = loadHelpers(`
    Date.now = function() { return Date.parse('2026-04-07T12:00:30.000Z'); };
    CFG = {
      key: 'rawr',
      live: true,
      nav: 4,
      navVerified: true,
      spot: 3,
      treasuryUSDC: 1200,
      daoUSDC: 1200,
      effectiveSupply: 300,
      snapshotTime: '2026-04-07T12:00:00.000Z',
      navSnapshot: {
        token: 'rawr',
        ticker: 'RAWR',
        status: 'verified',
        timestamp: '2026-04-07T12:00:00.000Z',
        treasuryUSDC: 1200,
        navPerToken: 4,
        supply: { effective: 300, onChain: 400, circulating: 300, locked: 0, dao: 0, metadaoFeeTokens: 0 },
        treasury: {
          reportedUSDC: 1200,
          componentTotalUSDC: 1200,
          components: [{ key: 'daoUSDC', label: 'DAO Treasury', usd: 1200, address: 'Dao111' }]
        },
        market: { spot: 3 }
      }
    };
    result = _currentNavTailPoint();
  `);

  assert.equal(sandbox.result.daoUSDC, 1200);
});

test('MetaDAO supply chart preserves legacy total supply denominator', () => {
  const sandbox = loadHelpers(`
    tokenKey = 'meta';
    CFG = { postMigrationSupply: 20863129.001238 };
    _METADAO_CURRENT_META_MINT_TS = Math.floor(Date.parse('2025-08-07T00:15:22.000Z') / 1000);
    divisorProbe = _metadaoHistoricSupplyDisplayDivisor({
      time: Math.floor(Date.parse('2023-11-08T00:00:00.000Z') / 1000),
      effective_supply: 10000000,
      on_chain_supply: 1000000000,
      locked_tokens: 990000000,
      metadao_backfill: {
        oldMetaEffectiveSupply: 10000,
        currentMetaEffectiveSupply: 0,
        oldToCurrentSplit: 1000
      },
      metadao_historic_backfill: true
    }, 'meta');
    oldUnitDivisorProbe = _metadaoHistoricSupplyDisplayDivisor({
      time: Math.floor(Date.parse('2023-11-08T00:00:00.000Z') / 1000),
      effective_supply: 10000,
      on_chain_supply: 1000000,
      locked_tokens: 990000,
      metadao_backfill: {
        oldMetaEffectiveSupply: 10000,
        currentMetaEffectiveSupply: 0,
        oldToCurrentSplit: 1000
      }
    }, 'meta');
    var rows = [
      {
        time: Math.floor(Date.parse('2023-11-08T00:00:00.000Z') / 1000),
        effSupply: 10000000,
        onChainSupply: 1000000000,
        lockedTokens: 990000000,
        ammTokens: 0,
        daoTokens: 0,
        buybackTokens: 0,
        investorLocked: 0,
        ambassadorLocked: 0,
        metadaoFeeTokens: 0
      },
      {
        time: Math.floor(Date.parse('2024-02-12T00:00:00.000Z') / 1000),
        effSupply: 13380000,
        onChainSupply: 999886000,
        lockedTokens: 985552725.643103,
        ammTokens: 953274.356897,
        metTokens: 953274.356897,
        daoTokens: 0,
        buybackTokens: 0,
        investorLocked: 0,
        ambassadorLocked: 0,
        metadaoFeeTokens: 0
      },
      {
        time: Math.floor(Date.parse('2024-03-08T00:00:00.000Z') / 1000),
        effSupply: 13410000,
        onChainSupply: 20886000,
        lockedTokens: 6522725.643103,
        ammTokens: 953274.356897,
        metTokens: 953274.356897
      }
    ];
    result = _normalizeMetaDaoLegacySupplyRows(rows);
  `);

  const rows = sandbox.result;
  assert.equal(sandbox.divisorProbe, 1);
  assert.equal(sandbox.oldUnitDivisorProbe, 1000);
  assert.equal(rows[0].onChainSupply, 1000000000);
  assert.equal(rows[0].lockedTokens, 990000000);
  assert.equal(rows[0].metaLegacySupplyDisplayNormalized, undefined);
  assert.equal(rows[1].onChainSupply, 999886000);
  assert.equal(Number(rows[1].lockedTokens.toFixed(6)), 985552725.643103);
  assert.equal(rows[1].metaLegacySupplyDisplayNormalized, undefined);
  assert.equal(rows[2].onChainSupply, 20886000);
  assert.equal(rows[2].lockedTokens, 6522725.643103);
  assert.equal(rows[2].metaLegacySupplyDisplayNormalized, undefined);
});

test('MetaDAO current treasury tail keeps live fee assets separate from gross generated revenue', () => {
  const sandbox = loadHelpers(`
    Date.now = function() { return Date.parse('2026-06-30T12:00:30.000Z'); };
    tokenKey = 'meta';
    _chartTF = '1D';
    var latestHistoricalTime = Math.floor(Date.parse('2026-06-30T00:00:00.000Z') / 1000);
    var _lwTreasuryHistory = [{
      time: latestHistoricalTime,
      treasury: 15000000,
      nav: 15,
      effSupply: 1000000,
      futUSDC: 100000,
      futValueUSDC: 900000,
      daoBreakdown: [
        { label: 'DAO Treasury', address: 'dao-main', usdc: 1000000 },
        { label: 'Ownership Capital custody multisig', address: 'ownership-custody', usdc: 2000000 }
      ],
      metadaoFeeAssetsUSD: 345000,
      metadaoFeeGeneratedGrossUSD: 3000000
    }];
    CFG = {
      key: 'meta',
      live: true,
      nav: 16,
      navVerified: true,
      spot: 32,
      treasuryUSDC: 16000000,
      daoUSDC: 13000000,
      effectiveSupply: 1000000,
      futAmmUSDC: 120000,
      metadaoFeeAssetsUSD: 450000,
      metadaoFeeGeneratedGrossUSD: 4000000,
      snapshotTime: '2026-06-30T12:00:00.000Z',
      futAmmLabel: 'FUT1',
      daoBreakdown: [
        { label: 'DAO Treasury', address: 'dao-main', usdc: 11000000 }
      ],
      navSnapshot: {
        token: 'meta',
        ticker: 'META',
        status: 'verified',
        timestamp: '2026-06-30T12:00:00.000Z',
        treasuryUSDC: 16000000,
        navPerToken: 16,
        supply: { effective: 1000000, onChain: 1000000, circulating: 1000000, locked: 0, dao: 0, metadaoFeeTokens: 0 },
        treasury: {
          reportedUSDC: 16000000,
          componentTotalUSDC: 13000000,
          components: [{ key: 'daoUSDC', label: 'DAO Treasury', usd: 13000000, address: 'dao-main' }]
        },
        market: { spot: 32 }
      }
    };
    var tail = _currentNavTailPoint();
    var appended = _appendCurrentTreasuryHistoryTail(_lwTreasuryHistory, null);
    _lwTreasuryHistory = appended;
    var components = _treasuryComponentDataFromHistory();
    result = {
      tail: tail,
      labels: (tail.daoBreakdown || []).map(function(row) { return row.label; }),
      tailTreasury: tail.treasury,
      tailDaoUSDC: tail.daoUSDC,
      components: components.map(function(component) {
        return {
          label: component.label,
          tail: component.rawData[component.rawData.length - 1]
        };
      }),
      cacheWithoutFee: _buildTreasuryComponentDataCacheKey([{ time: 1, treasury: 100, effSupply: 10, daoBreakdown: [] }]),
      cacheWithFee: _buildTreasuryComponentDataCacheKey([{ time: 1, treasury: 100, effSupply: 10, daoBreakdown: [], metadaoFeeAssetsUSD: 5 }])
    };
  `);

  assert.equal(sandbox.result.tail.metadaoFeeAssetsUSD, 450000);
  assert.equal(sandbox.result.tail.metadaoFeeGeneratedGrossUSD, 4000000);
  assert.equal(sandbox.result.tailTreasury, 16000000);
  assert.equal(sandbox.result.tailDaoUSDC, 13000000);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result.labels)), ['DAO Treasury', 'Ownership Capital custody multisig']);
  const byLabel = new Map(sandbox.result.components.map(row => [row.label, row.tail.value]));
  assert.equal(byLabel.get('DAO'), 11000000);
  assert.equal(byLabel.get('Fee assets'), 450000);
  assert.equal(byLabel.get('FUT1'), 120000);
  assert.equal(byLabel.get('Ownership'), 2000000);
  assert.notEqual(sandbox.result.cacheWithoutFee, sandbox.result.cacheWithFee);
});

test('growth chart converts verified daily metric history into sorted chart points', () => {
  const sandbox = loadHelpers(`
    result = _growthMetricSeriesFromHistory([
      { date: '2026-07-03', value: '310000.50' },
      { date: 'bad-date', value: 999999 },
      { date: '2026-07-01', value: 295000 },
      { date: '2026-07-02', value: -1 },
      { date: '2026-07-03', value: 312000 }
    ]);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: Math.floor(Date.parse('2026-07-01T00:00:00.000Z') / 1000), value: 295000 },
    { time: Math.floor(Date.parse('2026-07-03T00:00:00.000Z') / 1000), value: 312000 },
  ]);
});

test('growth chart discovers chartable API metrics and honors primary and remembered choices', () => {
  const sandbox = loadHelpers(`
    var choices = _growthChartableMetricChoices({
      aum_usd: {
        label: 'Managed AUM',
        historyAvailability: 'full_history',
        history: [{ date: '2026-07-14', value: 2400000 }, { date: '2026-07-15', value: 2500000 }]
      },
      fees_usd: {
        label: 'Protocol Fees',
        historyAvailability: 'forward_only',
        history: [{ date: '2026-07-14', value: 11000 }, { date: '2026-07-15', value: 12000 }]
      },
      active_users: {
        label: 'Active Users',
        aggregation: 'cumulative',
        historyAvailability: 'full_history',
        history: [{ date: '2026-07-14', value: 3200 }, { date: '2026-07-15', value: 3000 }]
      },
      net_issuance: {
        label: 'Net Issuance',
        displayOrder: 0,
        historyAvailability: 'full_history',
        allowNegative: true,
        history: [{ date: '2026-07-14', value: -250 }, { date: '2026-07-15', value: -50 }]
      },
      rejected_negative: {
        label: 'Rejected Negative',
        history: [{ date: '2026-07-15', value: -1 }]
      },
      unclassified_history: {
        label: 'Unclassified History',
        history: [{ date: '2026-07-14', value: 98 }, { date: '2026-07-15', value: 99 }]
      },
      single_forward_point: {
        label: 'Single Forward Point',
        historyAvailability: 'forward_only',
        history: [{ date: '2026-07-15', value: 99 }]
      },
      current_only: {
        label: 'Current Only',
        historyAvailability: 'current_only',
        current: 99,
        history: [{ date: '2026-07-14', value: 98 }, { date: '2026-07-15', value: 99 }]
      }
    }, { primaryMetricKey: 'fees_usd' });
    result = {
      keys: choices.map(function(choice) { return choice.key; }),
      tails: choices.map(function(choice) { return choice.series[choice.series.length - 1].value; }),
      netIssuance: choices.filter(function(choice) { return choice.key === 'net_issuance'; })[0].series.map(function(point) { return point.value; }),
      primary: _growthDefaultMetricKey({ primaryMetricKey: 'fees_usd' }, choices, ''),
      remembered: _growthDefaultMetricKey({ primaryMetricKey: 'fees_usd' }, choices, 'active_users'),
      invalidRemembered: _growthDefaultMetricKey({ primaryMetricKey: 'fees_usd' }, choices, 'missing_metric'),
      invalidPrimary: _growthDefaultMetricKey({ primaryMetricKey: 'missing_metric' }, choices, ''),
      sourceClasses: [
        _growthMetricSourceClass({ latest: { quality: 'verified', source: 'solana_rpc' } }),
        _growthMetricSourceClass({ latest: { source: 'solana_rpc_get_token_supply' } }),
        _growthMetricSourceClass({ latest: { source: 'official_protocol_api' } }),
        _growthMetricSourceClass({ sourceClass: 'on_chain' }),
        _growthMetricSourceClass({ latest: { quality: 'unverified', source: 'unofficial_mirror' } }),
        _growthMetricSourceClass({
          sourceClass: 'verified',
          latest: { quality: 'backfilled', source: 'dune_tokens_solana_transfers' }
        }),
        _growthMetricSourceClass({
          sourceClass: 'verified',
          verification: { passed: true },
          latest: { quality: 'verified', source: 'solomon_official_verified_by_solana_rpc' }
        })
      ]
    };
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), {
    keys: ['net_issuance', 'active_users', 'fees_usd'],
    tails: [-50, 3000, 12000],
    netIssuance: [-250, -50],
    primary: 'fees_usd',
    remembered: 'active_users',
    invalidRemembered: 'fees_usd',
    invalidPrimary: 'net_issuance',
    sourceClasses: ['verified', 'on-chain', 'official', 'on-chain', '', 'on-chain', 'verified'],
  });
});

test('growth chart merges official weekly AUM history with newer daily observations', () => {
  const sandbox = loadHelpers(`
    var weekly = _growthMetricSeriesFromOfficialWeeklyHistory([
      { periodLabel: 'Jun 15 - Jun 21', value: 3977.45 },
      { periodLabel: 'Jun 29 - Jul 5', value: 162842.46 },
      { periodLabel: 'Jul 13 - Jul 15', value: 310000 }
    ], '2026-07-15');
    var daily = _growthMetricSeriesFromHistory([{ date: '2026-07-15', value: 310936.41 }]);
    result = _mergeGrowthMetricSeries(weekly, daily);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: Math.floor(Date.parse('2026-06-21T00:00:00.000Z') / 1000), value: 3977.45 },
    { time: Math.floor(Date.parse('2026-07-05T00:00:00.000Z') / 1000), value: 162842.46 },
    { time: Math.floor(Date.parse('2026-07-15T00:00:00.000Z') / 1000), value: 310936.41 },
  ]);
});

test('growth screenshot preview interpolates weekly observations into daily bars', () => {
  const sandbox = loadHelpers(`
    result = _interpolateGrowthMetricDailySeries([
      { time: 100 * 86400, value: 100 },
      { time: 103 * 86400, value: 160 }
    ]);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    { time: 100 * 86400, value: 100 },
    { time: 101 * 86400, value: 120 },
    { time: 102 * 86400, value: 140 },
    { time: 103 * 86400, value: 160 },
  ]);
});

test('chart loading state never paints the retired SVG chart preview', () => {
  const tokenPageSource = fs.readFileSync('src/legacy/token-page.js', 'utf8');
  const loadingState = extractFunction('startChartLoadingState');

  assert.doesNotMatch(loadingState, /createElementNS|<svg|chart-loading-traces/);
  assert.doesNotMatch(tokenPageSource, /_chartLoadingTraceVariant/);
  assert.match(loadingState, /createElement\('span'\)/);
});

test('missing initial price history retries with bounded backoff and clears the warning', () => {
  const sandbox = loadHelpers(`
    ${extractFunction('_chartDataRecoveryDelay')}
    result = [0, 1, 2, 3, 9].map(_chartDataRecoveryDelay);
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.result)), [
    1000,
    3000,
    10000,
    30000,
    30000,
  ]);
  assert.match(
    source,
    /fetchCandlesForTF\(tfKey, \{ timeoutMs: API_FETCH_TIMEOUT_MS \}\)/,
  );
  assert.match(source, /_scheduleChartDataRecovery\(loadKey, isCurrentLoad\)/);
  assert.match(
    source,
    /_scheduleChartDataRecovery\(_mainTokenKey, _mainTokenStillCurrent\)/,
  );
  assert.match(
    source,
    /_clearChartDataUnavailableNotice\(\);\s+_chartDataRecoveryAttempt = 0;/,
  );
});

test('ownership chart expansion stays inside the page instead of using browser fullscreen', () => {
  const fullscreenToggle = extractFunction('toggleChartFullscreen');

  assert.doesNotMatch(fullscreenToggle, /requestFullscreen|exitFullscreen/);
  assert.match(fullscreenToggle, /chart-frame-expanded/);
  assert.match(fullscreenToggle, /ownership-token-chart/);
});
