function unitNum(value) {
  var number = Number(value);
  return isFinite(number) ? number : 0;
}

function pick(object, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (object && object[keys[i]] != null) return object[keys[i]];
  }
  return undefined;
}

export function cfgVal(cfg, primaryKey, fallbackKey) {
  if (!cfg) return 0;
  function readKey(key) {
    if (!key) return undefined;
    if (cfg[key] != null) return cfg[key];
    var aliases = {
      treasuryUSDC: ['treasury_usdc'],
      effectiveSupply: ['effective_supply'],
      onChainSupply: ['on_chain_supply'],
      lockTokenBalance: ['locked_tokens'],
      lockedTokens: ['locked_tokens'],
      daoTokenBalance: ['dao_tokens'],
      daoTokens: ['dao_tokens'],
      investorLocked: ['investor_locked'],
      ambassadorLocked: ['ambassador_locked'],
      metadaoFeeTokens: ['metadao_fee_tokens'],
      daoUSDC: ['dao_usdc'],
      futAmmUSDC: ['fut_amm_usdc'],
      meteoraLpUSDC: ['meteora_pool_usdc', 'meteora_lp_usdc'],
      metadaoFeeAssetsUSD: ['metadao_fee_assets_usd'],
      daoUsdvValue: ['dao_usdv_value'],
      buybackRemainingUSDC: ['buyback_usdc', 'buyback_remaining_usdc'],
      daoSOLValue: ['dao_sol_value'],
      projectLpFeeUSDC: ['project_lp_fee_usdc', 'projectLpFeeUsdc'],
      projectLpFeeTokens: ['project_lp_fee_tokens', 'projectLpFeeToks'],
      meteoraProtocolFeeUSDC: ['meteora_protocol_fee_usdc', 'meteoraProtocolFeeUsdc'],
      meteoraProtocolFeeTokens: ['meteora_protocol_fee_tokens', 'meteoraProtocolFeeToks'],
      meteoraMdaoLpFeeUSDC: ['meteora_mdao_lp_fee_usdc'],
      futAmmUnclaimedFeeUSDC: ['fut_amm_unclaimed_fee_usdc'],
      meteoraMdaoLpFeeTokens: ['meteora_mdao_lp_fee_tokens'],
      futAmmUnclaimedFeeTokens: ['fut_amm_unclaimed_fee_tokens']
    }[key] || [];
    for (var i = 0; i < aliases.length; i++) {
      if (cfg[aliases[i]] != null) return cfg[aliases[i]];
    }
    return undefined;
  }
  var primary = readKey(primaryKey);
  if (primary != null) return unitNum(primary);
  var fallback = readKey(fallbackKey);
  return fallback != null ? unitNum(fallback) : 0;
}

export function effectiveSupplyForNav(cfg) {
  if (cfg && cfg.navSnapshot && cfg.navSnapshot.supply && cfg.navSnapshot.supply.effective != null) return unitNum(cfg.navSnapshot.supply.effective);
  return cfgVal(cfg, 'effectiveSupply') || cfgVal(cfg, 'supply') || 0;
}

export function lockedTokensForNav(cfg) {
  return cfgVal(cfg, 'lockTokenBalance', 'lockedTokens');
}

// DAO holdings below 0.01% of supply are dust for display and supply math.
export function daoTokensForNav(cfg) {
  var raw = cfgVal(cfg, 'daoTokenBalance', 'daoTokens');
  var supply = cfgVal(cfg, 'onChainSupply') || cfgVal(cfg, 'supply') || 0;
  if (raw > 0 && supply > 0 && raw < supply * 0.0001) return 0;
  return raw;
}

export function investorLockedTokensForNav(cfg) {
  return cfgVal(cfg, 'investorLocked');
}

export function ambassadorLockedTokensForNav(cfg) {
  return cfgVal(cfg, 'ambassadorLocked');
}

export function metadaoFeeTokensForNav(cfg) {
  // Only claimed MetaDAO fee tokens are excluded. Pending LP fees remain in
  // effective supply until they are claimed.
  return cfgVal(cfg, 'metadaoFeeTokens');
}

export function circulatingSupplyForNav(cfg) {
  var snapSupply = cfg && cfg.navSnapshot && cfg.navSnapshot.supply ? cfg.navSnapshot.supply : null;
  var snapCirc = snapSupply && snapSupply.circulating != null ? unitNum(snapSupply.circulating) : 0;
  var supplyForNav = effectiveSupplyForNav(cfg);
  var cfgOnChain = cfgVal(cfg, 'onChainSupply');
  var snapOnChain = snapSupply && snapSupply.onChain != null ? unitNum(snapSupply.onChain) : 0;
  var onChain = cfgOnChain || snapOnChain;
  var locked = lockedTokensForNav(cfg) + daoTokensForNav(cfg) + investorLockedTokensForNav(cfg) + ambassadorLockedTokensForNav(cfg) + metadaoFeeTokensForNav(cfg);
  if (onChain > 0) {
    var circulating = onChain - locked;
    if (circulating > 0) return circulating;
  }
  if (snapCirc > 0) return snapCirc;
  return supplyForNav;
}

export function navPerTokenFromCfg(cfg) {
  if (cfg && cfg.navSnapshot && cfg.navSnapshot.navPerToken != null) return unitNum(cfg.navSnapshot.navPerToken);
  var reportedNav = cfgVal(cfg, 'nav');
  if (reportedNav > 0) return reportedNav;
  var supplyForNav = effectiveSupplyForNav(cfg);
  var treasury = cfgVal(cfg, 'treasuryUSDC');
  return supplyForNav > 1 && treasury > 0 ? treasury / supplyForNav : 0;
}

export function marketCapFromCfg(cfg) {
  var spot = cfgVal(cfg, 'spot') || (cfg && cfg.navSnapshot && cfg.navSnapshot.market && cfg.navSnapshot.market.spot != null ? unitNum(cfg.navSnapshot.market.spot) : 0);
  var circulating = circulatingSupplyForNav(cfg);
  if (spot > 0 && circulating > 0) return spot * circulating;
  if (cfg && cfg.navSnapshot && cfg.navSnapshot.market && cfg.navSnapshot.market.marketCap != null) return unitNum(cfg.navSnapshot.market.marketCap);
  return 0;
}

export function effectiveMarketCapFromCfg(cfg) {
  if (cfg && cfg.navSnapshot && cfg.navSnapshot.market && cfg.navSnapshot.market.effectiveMarketCap != null) return unitNum(cfg.navSnapshot.market.effectiveMarketCap);
  var spot = cfgVal(cfg, 'spot');
  var supplyForNav = effectiveSupplyForNav(cfg);
  return spot > 0 && supplyForNav > 0 ? spot * supplyForNav : 0;
}

export function fdvSupplyForCfg(cfg, navBlocked) {
  var supplyForNav = effectiveSupplyForNav(cfg);
  var totalSupply = cfgVal(cfg, 'onChainSupply') || supplyForNav;
  if (navBlocked) return totalSupply;
  return Math.max(0, totalSupply - daoTokensForNav(cfg));
}

export function fdvFromCfg(cfg, navBlocked) {
  if (cfg && cfg.navSnapshot && cfg.navSnapshot.market && cfg.navSnapshot.market.fdv != null) return unitNum(cfg.navSnapshot.market.fdv);
  var spot = cfgVal(cfg, 'spot');
  var supply = fdvSupplyForCfg(cfg, navBlocked);
  return spot > 0 && supply > 0 ? spot * supply : 0;
}

export function navSnapshotTimeMs(cfg) {
  if (!cfg) return 0;
  var raw = cfg.snapshotTime || cfg.snapshot_time || cfg.navVerifiedAt || cfg.nav_verified_at || cfg.updatedAt || cfg.updated_at || cfg.timestamp || cfg.ts;
  if (!raw) return 0;
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000;
  var ms = Date.parse(raw);
  return isFinite(ms) ? ms : 0;
}

export function projectLpFeeUSDCForCfg(cfg) {
  return cfgVal(cfg, 'projectLpFeeUSDC', 'project_lp_fee_usdc');
}

export function projectLpFeeTokensForCfg(cfg) {
  return cfgVal(cfg, 'projectLpFeeTokens', 'project_lp_fee_tokens');
}

export function meteoraProtocolFeeUSDCForCfg(cfg) {
  return cfgVal(cfg, 'meteoraProtocolFeeUSDC', 'meteora_protocol_fee_usdc');
}

export function parseSnapshotCadenceSec(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return isFinite(value) && value > 0 ? value : 0;
  var raw = String(value).trim().toLowerCase();
  if (!raw) return 0;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw === 'daily' || raw === 'once_daily' || raw === 'once-daily') return 24 * 60 * 60;
  var match = raw.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
  if (!match) return 0;
  var number = Number(match[1]);
  if (!isFinite(number) || number <= 0) return 0;
  var unit = match[2];
  if (unit.charAt(0) === 's') return number;
  if (unit.charAt(0) === 'm') return number * 60;
  if (unit.charAt(0) === 'h') return number * 60 * 60;
  if (unit.charAt(0) === 'd') return number * 24 * 60 * 60;
  return 0;
}

export function parseSnapshotMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  var ms = Date.parse(value);
  return isFinite(ms) ? ms : 0;
}

export function snapshotCadenceSecFromCfg(cfg) {
  cfg = cfg || {};
  var direct = parseSnapshotCadenceSec(cfg.snapshotIntervalSec || cfg.snapshot_interval_sec);
  if (direct > 0) return direct;
  var quality = cfg.historyQuality || cfg.history_quality || {};
  var current = parseSnapshotCadenceSec(quality.currentSnapshotCadence || quality.current_snapshot_cadence);
  if (current > 0) return current;
  var operational = parseSnapshotCadenceSec(quality.operationalSnapshotCadence || quality.operational_snapshot_cadence);
  if (operational > 0) return operational;
  var snapshotMs = parseSnapshotMs(cfg.snapshotTime || cfg.snapshot_time);
  var nextMs = parseSnapshotMs(cfg.nextSnapshotTime || cfg.next_snapshot_time);
  if (snapshotMs > 0 && nextMs > snapshotMs) return Math.floor((nextMs - snapshotMs) / 1000);
  return 0;
}

export function snapshotScheduleForCfg(cfg, nowMs, globalSnapshotInfo) {
  cfg = cfg || {};
  nowMs = nowMs != null ? nowMs : Date.now();
  var snapshotMs = parseSnapshotMs(cfg.snapshotTime || cfg.snapshot_time);
  var nextMs = parseSnapshotMs(cfg.nextSnapshotTime || cfg.next_snapshot_time);
  var seconds = snapshotCadenceSecFromCfg(cfg);
  if (!(seconds > 0) && globalSnapshotInfo) seconds = snapshotCadenceSecFromCfg(globalSnapshotInfo);
  var intervalMs = seconds > 0 ? seconds * 1000 : 0;
  if (!nextMs && snapshotMs > 0 && intervalMs > 0) nextMs = snapshotMs + intervalMs;
  if (!(intervalMs > 0) && snapshotMs > 0 && nextMs > snapshotMs) intervalMs = nextMs - snapshotMs;
  var previousScheduledMs = (nextMs > 0 && intervalMs > 0) ? nextMs - intervalMs : 0;
  var freshnessMs = previousScheduledMs > 0 ? previousScheduledMs : snapshotMs;
  return {
    snapshotMs: snapshotMs,
    nextMs: nextMs,
    intervalMs: intervalMs,
    freshnessMs: freshnessMs,
    ageMs: freshnessMs > 0 ? nowMs - freshnessMs : NaN,
    remainingMs: nextMs > 0 ? nextMs - nowMs : NaN
  };
}

export function snapshotIsPastSchedule(cfg, nowMs, globalSnapshotInfo) {
  var schedule = snapshotScheduleForCfg(cfg, nowMs, globalSnapshotInfo);
  if (schedule.nextMs > 0) return (nowMs != null ? nowMs : Date.now()) > schedule.nextMs;
  return isFinite(schedule.ageMs) && schedule.intervalMs > 0 ? schedule.ageMs > schedule.intervalMs : false;
}

export function navTreasuryComponentsForCfg(cfg, context) {
  cfg = cfg || {};
  context = context || {};
  var treasury = cfgVal(cfg, 'treasuryUSDC');
  var futUSDC = cfgVal(cfg, 'futAmmUSDC');
  var meteoraUSDC = cfgVal(cfg, 'meteoraLpUSDC');
  var metadaoFeeAssetsUSDC = cfgVal(cfg, 'metadaoFeeAssetsUSD');
  var usdvUSDC = cfgVal(cfg, 'daoUsdvValue');
  var buybackUSDC = cfgVal(cfg, 'buybackRemainingUSDC');
  var knownNonDao = futUSDC + meteoraUSDC + metadaoFeeAssetsUSDC + usdvUSDC + buybackUSDC;
  var daoUSDC = treasury > 0 ? Math.max(0, treasury - knownNonDao) : cfgVal(cfg, 'daoUSDC');
  var components = [
    { key: 'daoUSDC', label: 'DAO Treasury', usd: daoUSDC, address: cfg.daoWallet || null },
    { key: 'futAmmUSDC', label: context.futAmmLabel || 'FUT1', usd: futUSDC, address: cfg.futAmm || null },
    { key: 'meteoraLpUSDC', label: context.meteoraLabel || 'MET', usd: meteoraUSDC, address: cfg.daoMeteoraPool || cfg.meteoraLpToken || null },
    { key: 'metadaoFeeAssetsUSD', label: 'Fee assets', usd: metadaoFeeAssetsUSDC, address: null },
    { key: 'daoUsdvValue', label: 'USDv', usd: usdvUSDC, address: cfg.daoWallet || null },
    { key: 'buybackRemainingUSDC', label: 'Buyback', usd: buybackUSDC, address: cfg.buybackWallet || null }
  ].filter(function(component) { return component.usd > 0; });
  var componentTotal = components.reduce(function(sum, component) { return sum + component.usd; }, 0);
  var rawComponentTotal = cfgVal(cfg, 'daoUSDC') + knownNonDao + cfgVal(cfg, 'daoSOLValue');
  return {
    reportedUSDC: treasury,
    impliedDaoUSDC: daoUSDC,
    knownNonDaoUSDC: knownNonDao,
    componentTotalUSDC: componentTotal,
    rawComponentTotalUSDC: rawComponentTotal,
    components: components
  };
}

export function navSnapshotStatusLabel(status) {
  if (status === 'verified') return 'NAV verified';
  if (status === 'stale') return 'NAV stale';
  if (status === 'unverified') return 'NAV unverified';
  return 'NAV partial';
}

export function navSnapshotBlocksNav(snapshot) {
  return !snapshot || snapshot.status === 'unverified';
}

export function navSnapshotIssueLabel(issue) {
  var labels = {
    missing_treasury_usdc: 'missing treasury total',
    missing_effective_supply: 'missing effective supply',
    missing_snapshot_time: 'missing snapshot time',
    effective_supply_exceeds_on_chain_supply: 'effective supply exceeds on-chain supply',
    excluded_supply_exceeds_on_chain_supply: 'excluded supply exceeds on-chain supply',
    treasury_components_exceed_total: 'treasury components exceed total',
    reported_nav_mismatch: 'reported NAV mismatch'
  };
  return labels[issue] || issue.replace(/_/g, ' ');
}

export function deriveNavSnapshot(cfg, options) {
  cfg = cfg || {};
  options = options || {};
  var treasury = cfgVal(cfg, 'treasuryUSDC');
  var effectiveSupply = effectiveSupplyForNav(cfg);
  var onChainSupply = cfgVal(cfg, 'onChainSupply') || effectiveSupply;
  var locked = lockedTokensForNav(cfg);
  var daoTokens = daoTokensForNav(cfg);
  var investorLocked = investorLockedTokensForNav(cfg);
  var ambassadorLocked = ambassadorLockedTokensForNav(cfg);
  var metadaoFeeTokens = metadaoFeeTokensForNav(cfg);
  var circulating = circulatingSupplyForNav(cfg);
  var navPerToken = navPerTokenFromCfg(cfg);
  var formulaNav = treasury > 0 && effectiveSupply > 1 ? treasury / effectiveSupply : 0;
  var treasuryComponents = navTreasuryComponentsForCfg(cfg, options.labels);
  var timestampMs = navSnapshotTimeMs(cfg);
  var nowMs = options.nowMs != null ? options.nowMs : Date.now();
  var maxAgeMs = options.maxAgeMs != null ? options.maxAgeMs : 60 * 60 * 1000;
  var navVerified = cfg.navVerified;
  if (navVerified == null && cfg.nav_verified != null) navVerified = cfg.nav_verified;
  var issues = [];
  var critical = false;
  if (treasury <= 0) { issues.push('missing_treasury_usdc'); critical = true; }
  if (effectiveSupply <= 1) { issues.push('missing_effective_supply'); critical = true; }
  if (timestampMs <= 0) issues.push('missing_snapshot_time');
  if (onChainSupply > 0 && effectiveSupply > onChainSupply) issues.push('effective_supply_exceeds_on_chain_supply');
  if (onChainSupply > 0 && locked + daoTokens + investorLocked + ambassadorLocked + metadaoFeeTokens > onChainSupply) issues.push('excluded_supply_exceeds_on_chain_supply');
  if (treasury > 0 && treasuryComponents.knownNonDaoUSDC > treasury + Math.max(1, treasury * 0.002)) issues.push('treasury_components_exceed_total');
  var reportedNav = cfgVal(cfg, 'nav');
  if (reportedNav > 0 && formulaNav > 0 && Math.abs(reportedNav - formulaNav) > Math.max(0.000001, formulaNav * 0.002)) {
    issues.push('reported_nav_mismatch');
  }
  var schedule = snapshotScheduleForCfg(cfg, nowMs, options.globalSnapshotInfo);
  var hasSchedule = schedule.nextMs > 0 || schedule.intervalMs > 0;
  var isStale = timestampMs > 0 && (hasSchedule
    ? snapshotIsPastSchedule(cfg, nowMs, options.globalSnapshotInfo)
    : nowMs - timestampMs > maxAgeMs);
  var status = 'partial';
  if (navVerified === false || critical) status = 'unverified';
  else if (isStale) status = 'stale';
  else if (navVerified === true && issues.length === 0) status = 'verified';
  return {
    formulaVersion: 'nav-v1',
    token: cfg.key || (Object.prototype.hasOwnProperty.call(options, 'tokenKey') ? options.tokenKey : null),
    ticker: cfg.ticker || null,
    status: status,
    statusLabel: navSnapshotStatusLabel(status),
    issues: issues,
    timestampMs: timestampMs,
    timestamp: timestampMs > 0 ? new Date(timestampMs).toISOString() : null,
    treasuryUSDC: treasury,
    navPerToken: navPerToken,
    supply: {
      effective: effectiveSupply,
      onChain: onChainSupply,
      circulating: circulating,
      locked: locked,
      dao: daoTokens,
      investorLocked: investorLocked,
      ambassadorLocked: ambassadorLocked,
      metadaoFeeTokens: metadaoFeeTokens
    },
    treasury: treasuryComponents,
    market: {
      spot: cfgVal(cfg, 'spot'),
      marketCap: marketCapFromCfg(cfg),
      effectiveMarketCap: effectiveMarketCapFromCfg(cfg),
      fdv: fdvFromCfg(cfg, navVerified === false)
    }
  };
}

export function normalizeNavSnapshot(raw, cfg, options) {
  raw = raw || {};
  cfg = cfg || {};
  options = options || {};
  var fallback = deriveNavSnapshot(cfg, options);
  var rawSupply = raw.supply || {};
  var rawTreasury = raw.treasury || {};
  var rawMarket = raw.market || {};
  var status = raw.status || fallback.status;
  var rawTimestampMs = pick(raw, ['timestampMs', 'timestamp_ms']);
  var timestampMs = rawTimestampMs || navSnapshotTimeMs(raw) || fallback.timestampMs;
  var rawTreasuryUSDC = pick(raw, ['treasuryUSDC', 'treasury_usdc']);
  var reportedTreasuryUSDC = pick(rawTreasury, ['reportedUSDC', 'reported_usdc']);
  var totalTreasuryUSDC = pick(rawTreasury, ['totalUSDC', 'total_usdc']);
  var treasuryUSDC = rawTreasuryUSDC != null ? unitNum(rawTreasuryUSDC) :
    reportedTreasuryUSDC != null ? unitNum(reportedTreasuryUSDC) :
    totalTreasuryUSDC != null ? unitNum(totalTreasuryUSDC) : fallback.treasuryUSDC;
  var rawEffectiveSupply = pick(rawSupply, ['effective', 'effectiveSupply', 'effective_supply']);
  var rawOnChainSupply = pick(rawSupply, ['onChain', 'onChainSupply', 'on_chain_supply']);
  var rawCirculating = pick(rawSupply, ['circulating', 'circulatingSupply', 'circulating_supply']);
  var rawNavPerToken = pick(raw, ['navPerToken', 'nav_per_token']);
  var effectiveSupply = rawEffectiveSupply != null ? unitNum(rawEffectiveSupply) : fallback.supply.effective;
  var onChainSupply = rawOnChainSupply != null ? unitNum(rawOnChainSupply) : fallback.supply.onChain;
  var lockedValue = pick(rawSupply, ['locked', 'lockedTokens', 'locked_tokens']);
  var locked = lockedValue != null ? unitNum(lockedValue) : fallback.supply.locked;
  var daoValue = pick(rawSupply, ['dao', 'daoTokens', 'dao_tokens']);
  var dao = daoValue != null ? unitNum(daoValue) : fallback.supply.dao;
  // Treat dust DAO holdings (< 0.01% of supply) as 0.
  if (dao > 0 && onChainSupply > 0 && dao < onChainSupply * 0.0001) dao = 0;
  var investorLockedValue = pick(rawSupply, ['investorLocked', 'investor_locked']);
  var investorLocked = investorLockedValue != null ? unitNum(investorLockedValue) : fallback.supply.investorLocked;
  var ambassadorLockedValue = pick(rawSupply, ['ambassadorLocked', 'ambassador_locked']);
  var ambassadorLocked = ambassadorLockedValue != null ? unitNum(ambassadorLockedValue) : fallback.supply.ambassadorLocked;
  var metadaoFeeTokensValue = pick(rawSupply, ['metadaoFeeTokens', 'metadao_fee_tokens']);
  var metadaoFeeTokens = metadaoFeeTokensValue != null ? unitNum(metadaoFeeTokensValue) : fallback.supply.metadaoFeeTokens;
  var computedCirculating = onChainSupply > 0 ? onChainSupply - locked - dao - investorLocked - ambassadorLocked - metadaoFeeTokens : 0;
  var circulating = computedCirculating > 0 ? computedCirculating : (rawCirculating != null ? unitNum(rawCirculating) : fallback.supply.circulating);
  var navPerToken = rawNavPerToken != null ? unitNum(rawNavPerToken) :
    raw.nav != null ? unitNum(raw.nav) :
    (treasuryUSDC > 0 && effectiveSupply > 1 ? treasuryUSDC / effectiveSupply : fallback.navPerToken);
  var issues = Array.isArray(raw.issues) ? raw.issues.slice() : fallback.issues.slice();
  var treasury = Object.assign({}, fallback.treasury, rawTreasury);
  if (treasury.reportedUSDC == null) treasury.reportedUSDC = treasuryUSDC;
  if (!Array.isArray(treasury.components)) treasury.components = fallback.treasury.components;
  var rawStatusLabel = pick(raw, ['statusLabel', 'status_label']);
  var rawSlot = pick(raw, ['slot', 'blockSlot', 'block_slot']);
  var rawBlockTime = pick(raw, ['blockTime', 'block_time']);
  var marketSpot = rawMarket.spot != null ? unitNum(rawMarket.spot) : fallback.market.spot;
  return {
    formulaVersion: raw.formulaVersion || raw.formula_version || fallback.formulaVersion,
    token: raw.token || fallback.token,
    ticker: raw.ticker || fallback.ticker,
    status: status,
    statusLabel: rawStatusLabel || navSnapshotStatusLabel(status),
    issues: issues,
    timestampMs: timestampMs,
    timestamp: raw.timestamp || (timestampMs > 0 ? new Date(timestampMs).toISOString() : null),
    slot: rawSlot || null,
    blockTime: rawBlockTime || null,
    treasuryUSDC: treasuryUSDC,
    navPerToken: navPerToken,
    supply: {
      effective: effectiveSupply,
      onChain: onChainSupply,
      circulating: circulating,
      locked: locked,
      dao: dao,
      investorLocked: investorLocked,
      ambassadorLocked: ambassadorLocked,
      metadaoFeeTokens: metadaoFeeTokens
    },
    treasury: treasury,
    market: {
      spot: marketSpot,
      marketCap: marketSpot > 0 && circulating > 0
        ? marketSpot * circulating
        : (pick(rawMarket, ['marketCap', 'market_cap']) != null ? unitNum(pick(rawMarket, ['marketCap', 'market_cap'])) : fallback.market.marketCap),
      effectiveMarketCap: pick(rawMarket, ['effectiveMarketCap', 'effective_market_cap']) != null ? unitNum(pick(rawMarket, ['effectiveMarketCap', 'effective_market_cap'])) : fallback.market.effectiveMarketCap,
      fdv: rawMarket.fdv != null ? unitNum(rawMarket.fdv) : fallback.market.fdv
    },
    sources: raw.sources || raw.provenance || fallback.sources || {},
    addresses: raw.addresses || fallback.addresses || {}
  };
}

export function buildNavSnapshot(cfg, options) {
  if (cfg && cfg.navSnapshot && typeof cfg.navSnapshot === 'object') {
    return normalizeNavSnapshot(cfg.navSnapshot, cfg, options);
  }
  return deriveNavSnapshot(cfg, options);
}

export const navModel = {
  ambassadorLockedTokensForNav,
  buildNavSnapshot,
  cfgVal,
  circulatingSupplyForNav,
  daoTokensForNav,
  deriveNavSnapshot,
  effectiveMarketCapFromCfg,
  effectiveSupplyForNav,
  fdvFromCfg,
  fdvSupplyForCfg,
  investorLockedTokensForNav,
  lockedTokensForNav,
  marketCapFromCfg,
  metadaoFeeTokensForNav,
  meteoraProtocolFeeUSDCForCfg,
  navPerTokenFromCfg,
  navSnapshotBlocksNav,
  navSnapshotIssueLabel,
  navSnapshotStatusLabel,
  navSnapshotTimeMs,
  navTreasuryComponentsForCfg,
  normalizeNavSnapshot,
  parseSnapshotCadenceSec,
  parseSnapshotMs,
  projectLpFeeTokensForCfg,
  projectLpFeeUSDCForCfg,
  snapshotCadenceSecFromCfg,
  snapshotIsPastSchedule,
  snapshotScheduleForCfg,
};

export function installBrowserNavModel(browserWindow) {
  var runtime = browserWindow || globalThis.window;
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.token = runtime.NAVGATOR.token || {};
  runtime.NAVGATOR.token.navModel = navModel;
  return navModel;
}
