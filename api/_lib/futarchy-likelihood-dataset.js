export const FUTARCHY_LIKELIHOOD_DATASET_SCHEMA = '01rx.futarchy-likelihood-dataset.v1';
export const DEFAULT_LIKELIHOOD_CHECKPOINTS = Object.freeze([0.25, 0.5, 0.75, 0.9]);

const MIN_PAIRED_PRICE_POINTS = 8;
const MIN_USABLE_CHECKPOINTS = 2;
const MAX_CHECKPOINT_LAG_SECONDS = 30 * 60;
const MIN_TRADE_AMOUNT_COVERAGE = 0.95;
const MIN_ARCHIVE_RECONCILIATION = 0.95;
const MAX_ARCHIVE_RECONCILIATION = 1.05;

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampMs(value) {
  const time = new Date(value || '').getTime();
  return Number.isFinite(time) ? time : null;
}

function isoTimestamp(value) {
  const time = timestampMs(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function firstIsoTimestamp(...values) {
  return values.map(isoTimestamp).find(Boolean) || null;
}

function positiveFinite(value) {
  const number = finite(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function ratioChangePct(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? ((numerator / denominator) - 1) * 100
    : null;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
    / (values.length - 1);
  return Math.sqrt(variance);
}

function spreadLogReturnVolatility(rows) {
  const logRatios = rows
    .map(row => (
      Number.isFinite(row.passPrice) && row.passPrice > 0
      && Number.isFinite(row.failPrice) && row.failPrice > 0
        ? Math.log(row.passPrice / row.failPrice)
        : null
    ))
    .filter(Number.isFinite);
  const returns = logRatios.slice(1).map((value, index) => value - logRatios[index]);
  return standardDeviation(returns);
}

function edgeSlopePctPerHour(rows) {
  const usable = rows.filter(row => (
    Number.isFinite(row.observedMs)
    && Number.isFinite(row.passPrice)
    && Number.isFinite(row.failPrice)
    && row.failPrice > 0
  ));
  if (usable.length < 2) return null;
  const first = usable[0];
  const last = usable.at(-1);
  const elapsedHours = (last.observedMs - first.observedMs) / 3_600_000;
  if (!(elapsedHours > 0)) return null;
  return (
    ratioChangePct(last.passPrice, last.failPrice)
    - ratioChangePct(first.passPrice, first.failPrice)
  ) / elapsedHours;
}

function normalizeHistoryRows(history) {
  return (Array.isArray(history?.series) ? history.series : [])
    .map((row) => {
      const observedMs = timestampMs(row?.observedAt || row?.timestamp);
      if (!Number.isFinite(observedMs)) return null;
      return {
        observedAt: new Date(observedMs).toISOString(),
        observedMs,
        spotPrice: positiveFinite(row?.underlyingPrice),
        passPrice: positiveFinite(row?.passPrice),
        failPrice: positiveFinite(row?.failPrice),
        passTwap: positiveFinite(row?.passTwap),
        failTwap: positiveFinite(row?.failTwap),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.observedMs - right.observedMs);
}

function normalizeTrades(orders) {
  return (Array.isArray(orders?.trades) ? orders.trades : [])
    .map((trade) => {
      const observedMs = timestampMs(trade?.blockTime);
      const branch = ['pass', 'fail'].includes(trade?.branch) ? trade.branch : null;
      const side = ['buy', 'sell'].includes(trade?.side) ? trade.side : null;
      if (!Number.isFinite(observedMs) || !branch || !side) return null;
      return {
        observedMs,
        branch,
        side,
        quoteAmount: finite(trade?.volumeUsd ?? trade?.quoteAmount),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.observedMs - right.observedMs);
}

function issue(code, message, blocking = true) {
  return { code, message, blocking };
}

function supportDirection(trade) {
  if (
    (trade.branch === 'pass' && trade.side === 'buy')
    || (trade.branch === 'fail' && trade.side === 'sell')
  ) return 'pass';
  if (
    (trade.branch === 'fail' && trade.side === 'buy')
    || (trade.branch === 'pass' && trade.side === 'sell')
  ) return 'fail';
  return null;
}

function tradeFeatures(trades, startMs, checkpointMs) {
  const visible = trades.filter(trade => trade.observedMs >= startMs && trade.observedMs <= checkpointMs);
  let passSupportVolumeUsd = 0;
  let failSupportVolumeUsd = 0;
  let pricedTradeCount = 0;
  for (const trade of visible) {
    if (!Number.isFinite(trade.quoteAmount) || trade.quoteAmount < 0) continue;
    pricedTradeCount += 1;
    if (supportDirection(trade) === 'pass') passSupportVolumeUsd += trade.quoteAmount;
    if (supportDirection(trade) === 'fail') failSupportVolumeUsd += trade.quoteAmount;
  }
  return {
    tradeCount: visible.length,
    pricedTradeCount,
    quoteVolumeUsd: passSupportVolumeUsd + failSupportVolumeUsd,
    passSupportVolumeUsd,
    failSupportVolumeUsd,
    netPassSupportVolumeUsd: passSupportVolumeUsd - failSupportVolumeUsd,
  };
}

function checkpointFeatures({
  fraction,
  checkpointMs,
  twapStartMs,
  twapEndMs,
  thresholdBps,
  historyRows,
  trades,
  proposalStartMs,
}) {
  const visibleHistory = historyRows.filter(row => row.observedMs <= checkpointMs);
  const latest = visibleHistory.at(-1);
  if (!latest) return null;
  const recentCutoff = checkpointMs - (6 * 3_600_000);
  const recent = visibleHistory.filter(row => row.observedMs >= recentCutoff);
  const priceSpreadPct = ratioChangePct(latest.passPrice, latest.failPrice);
  const twapSpreadPct = ratioChangePct(latest.passTwap, latest.failTwap);
  return {
    checkpointFraction: fraction,
    checkpointAt: new Date(checkpointMs).toISOString(),
    sourceObservationAt: latest.observedAt,
    sourceLagSeconds: (checkpointMs - latest.observedMs) / 1_000,
    elapsedSeconds: (checkpointMs - twapStartMs) / 1_000,
    remainingSeconds: (twapEndMs - checkpointMs) / 1_000,
    spotPrice: latest.spotPrice,
    passPrice: latest.passPrice,
    failPrice: latest.failPrice,
    passTwap: latest.passTwap,
    failTwap: latest.failTwap,
    priceSpreadPct,
    twapSpreadPct,
    decisionMarginPct: Number.isFinite(twapSpreadPct) && Number.isFinite(thresholdBps)
      ? twapSpreadPct - (thresholdBps / 100)
      : null,
    passVsSpotPct: ratioChangePct(latest.passPrice, latest.spotPrice),
    failVsSpotPct: ratioChangePct(latest.failPrice, latest.spotPrice),
    spreadLogReturnVolatility: spreadLogReturnVolatility(recent),
    edgeSlopePctPerHour: edgeSlopePctPerHour(recent),
    ...tradeFeatures(trades, proposalStartMs, checkpointMs),
  };
}

function normalizedCheckpoints(values) {
  const checkpoints = (Array.isArray(values) ? values : DEFAULT_LIKELIHOOD_CHECKPOINTS)
    .map(finite)
    .filter(value => value > 0 && value < 1)
    .sort((left, right) => left - right);
  return [...new Set(checkpoints)];
}

export function buildProposalLikelihoodDatasetEntry(record, options = {}) {
  const market = record?.market || {};
  const proposal = market?.proposal || {};
  const chain = record?.chainMetadata || null;
  const history = record?.history || null;
  const orders = record?.orders || null;
  const proposalId = String(proposal.id || chain?.proposalAddress || '').trim() || null;
  const outcome = proposal.status === 'passed'
    ? 'passed'
    : proposal.status === 'failed'
      ? 'failed'
      : null;
  const createdAt = firstIsoTimestamp(chain?.createdAt, proposal.createdAt);
  const twapStartedAt = firstIsoTimestamp(history?.preTwap, market?.twapStartedAt);
  const endsAt = firstIsoTimestamp(chain?.endsAt, proposal.endsAt, proposal.resolvedAt);
  const proposalStartMs = timestampMs(createdAt);
  const twapStartMs = timestampMs(twapStartedAt);
  const twapEndMs = timestampMs(endsAt);
  const candidateThresholdBps = finite(proposal.thresholdBps);
  const thresholdBps = Number.isSafeInteger(candidateThresholdBps)
    && candidateThresholdBps > -10_000
    && candidateThresholdBps <= 10_000
    ? candidateThresholdBps
    : null;
  const historyRows = normalizeHistoryRows(history);
  const trades = normalizeTrades(orders);
  const issues = [];

  if (!proposalId) issues.push(issue('MISSING_PROPOSAL_ID', 'Proposal identity is missing.'));
  if (!outcome) issues.push(issue('MISSING_RESOLUTION', 'A passed or failed resolution is required.'));
  if (!Number.isFinite(thresholdBps)) {
    issues.push(issue(
      'MISSING_HISTORICAL_THRESHOLD',
      'The exact proposal-time threshold is unavailable and was not inferred.',
    ));
  }
  if (!Number.isFinite(proposalStartMs)) {
    issues.push(issue('MISSING_PROPOSAL_START', 'Proposal creation time is unavailable.'));
  }
  if (!Number.isFinite(twapStartMs) || !Number.isFinite(twapEndMs) || twapEndMs <= twapStartMs) {
    issues.push(issue('INVALID_TWAP_WINDOW', 'A valid historical TWAP start and end are required.'));
  }
  if (!chain) {
    issues.push(issue(
      'CHAIN_METADATA_UNAVAILABLE',
      'The proposal account could not be validated through Solana RPC.',
      false,
    ));
  }
  const pairedPricePoints = historyRows.filter(row => (
    Number.isFinite(row.passPrice) && Number.isFinite(row.failPrice)
  )).length;
  if (pairedPricePoints < MIN_PAIRED_PRICE_POINTS) {
    issues.push(issue(
      'INSUFFICIENT_PRICE_HISTORY',
      `Only ${pairedPricePoints} paired PASS/FAIL observations were available.`,
    ));
  }
  if (orders?.pagination?.complete !== true) {
    issues.push(issue('INCOMPLETE_ORDER_HISTORY', 'The complete indexed trade history was not available.'));
  }
  const pricedTrades = trades.filter(trade => (
    Number.isFinite(trade.quoteAmount) && trade.quoteAmount >= 0
  ));
  const tradeAmountCoverage = trades.length ? pricedTrades.length / trades.length : 1;
  if (tradeAmountCoverage < MIN_TRADE_AMOUNT_COVERAGE) {
    issues.push(issue(
      'INCOMPLETE_TRADE_AMOUNTS',
      `Only ${(tradeAmountCoverage * 100).toFixed(1)}% of indexed trades had quote amounts.`,
    ));
  }
  const indexedVolumeUsd = pricedTrades.reduce((sum, trade) => sum + trade.quoteAmount, 0);
  const archiveTradeCount = finite(market?.metrics?.tradeCount);
  const archiveVolumeUsd = finite(market?.metrics?.volumeUsd);
  const tradeCountRatio = Number.isFinite(archiveTradeCount) && archiveTradeCount > 0
    ? trades.length / archiveTradeCount
    : null;
  const volumeRatio = Number.isFinite(archiveVolumeUsd) && archiveVolumeUsd > 0
    ? indexedVolumeUsd / archiveVolumeUsd
    : null;
  if (
    (Number.isFinite(tradeCountRatio) && (
      tradeCountRatio < MIN_ARCHIVE_RECONCILIATION
      || tradeCountRatio > MAX_ARCHIVE_RECONCILIATION
    ))
    || (Number.isFinite(volumeRatio) && (
      volumeRatio < MIN_ARCHIVE_RECONCILIATION
      || volumeRatio > MAX_ARCHIVE_RECONCILIATION
    ))
  ) {
    issues.push(issue(
      'METRIC_RECONCILIATION_FAILED',
      'Collected trade count or volume is materially below the proposal archive total.',
    ));
  }
  for (const sourceIssue of Array.isArray(record?.collectionIssues)
    ? record.collectionIssues
    : []) {
    const code = String(sourceIssue?.code || 'SOURCE_UNAVAILABLE').slice(0, 96);
    const message = String(sourceIssue?.message || 'A required source was unavailable.').slice(0, 300);
    if (!issues.some(row => row.code === code)) {
      issues.push(issue(code, message, sourceIssue?.blocking !== false));
    }
  }

  const checkpoints = [];
  if (Number.isFinite(twapStartMs) && Number.isFinite(twapEndMs) && twapEndMs > twapStartMs) {
    for (const fraction of normalizedCheckpoints(options.checkpoints)) {
      const checkpointMs = twapStartMs + ((twapEndMs - twapStartMs) * fraction);
      const features = checkpointFeatures({
        fraction,
        checkpointMs,
        twapStartMs,
        twapEndMs,
        thresholdBps,
        historyRows,
        trades,
        proposalStartMs: Number.isFinite(proposalStartMs) ? proposalStartMs : twapStartMs,
      });
      if (features) checkpoints.push(features);
    }
  }
  const usableCheckpoints = checkpoints.filter(row => (
    Number.isFinite(row.passPrice)
    && Number.isFinite(row.failPrice)
    && Number.isFinite(row.passTwap)
    && Number.isFinite(row.failTwap)
    && Number.isFinite(row.decisionMarginPct)
    && row.sourceLagSeconds <= MAX_CHECKPOINT_LAG_SECONDS
  )).length;
  if (usableCheckpoints < MIN_USABLE_CHECKPOINTS) {
    issues.push(issue(
      'INSUFFICIENT_CHECKPOINTS',
      `Only ${usableCheckpoints} model-ready checkpoints were available.`,
    ));
  }

  return {
    proposalId,
    token: String(market?.token || '').toLowerCase() || null,
    outcome,
    target: outcome ? { passed: outcome === 'passed' ? 1 : 0 } : null,
    metadata: {
      createdAt,
      twapStartedAt,
      endsAt,
      thresholdBps,
      isTeamSponsored: typeof chain?.proposal?.isTeamSponsored === 'boolean'
        ? chain.proposal.isTeamSponsored
        : typeof proposal.isTeamSponsored === 'boolean'
          ? proposal.isTeamSponsored
          : null,
      version: proposal.version || null,
    },
    observations: checkpoints,
    quality: {
      eligible: !issues.some(row => row.blocking),
      pairedPricePoints,
      usableCheckpoints,
      indexedTrades: trades.length,
      tradeAmountCoverage,
      issues,
      reconciliation: {
        archiveTradeCount: Number.isFinite(archiveTradeCount) ? archiveTradeCount : null,
        indexedTradeCount: trades.length,
        tradeCountRatio,
        archiveVolumeUsd: Number.isFinite(archiveVolumeUsd) ? archiveVolumeUsd : null,
        indexedVolumeUsd,
        volumeRatio,
      },
    },
    sources: {
      proposalIndex: market?.source?.provider || null,
      priceHistory: history?.source?.provider || null,
      tradeHistory: orders?.source?.provider || null,
      chainMetadata: chain?.source?.provider || null,
    },
  };
}

function datasetSummary(proposals) {
  const issueCounts = {};
  for (const proposal of proposals) {
    for (const row of proposal.quality.issues) {
      issueCounts[row.code] = (issueCounts[row.code] || 0) + 1;
    }
  }
  const eligible = proposals.filter(row => row.quality.eligible);
  return {
    totalProposals: proposals.length,
    passed: proposals.filter(row => row.outcome === 'passed').length,
    failed: proposals.filter(row => row.outcome === 'failed').length,
    eligible: eligible.length,
    eligiblePassed: eligible.filter(row => row.outcome === 'passed').length,
    eligibleFailed: eligible.filter(row => row.outcome === 'failed').length,
    totalObservations: proposals.reduce((sum, row) => sum + row.observations.length, 0),
    eligibleObservations: eligible.reduce((sum, row) => sum + row.quality.usableCheckpoints, 0),
    issueCounts,
  };
}

export function buildFutarchyLikelihoodDataset(input = {}) {
  const generatedAt = isoTimestamp(input.generatedAt || new Date().toISOString());
  if (!generatedAt) throw new TypeError('generatedAt must be a valid timestamp');
  const proposals = (Array.isArray(input.records) ? input.records : [])
    .map(record => buildProposalLikelihoodDatasetEntry(record, {
      checkpoints: input.checkpoints,
    }))
    .sort((left, right) => String(left.proposalId).localeCompare(String(right.proposalId)));
  return {
    schemaVersion: FUTARCHY_LIKELIHOOD_DATASET_SCHEMA,
    generatedAt,
    checkpoints: normalizedCheckpoints(input.checkpoints),
    proposals,
    summary: datasetSummary(proposals),
    disclosures: [
      'Targets are stored separately from features.',
      'Each observation uses only prices and trades timestamped at or before its checkpoint.',
      'Missing historical thresholds are not inferred from current DAO configuration.',
      'This dataset does not itself constitute a calibrated likelihood estimate.',
    ],
  };
}
