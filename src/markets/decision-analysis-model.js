function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampMs(value) {
  const milliseconds = new Date(value || '').getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

/**
 * Calculate the remaining-window PASS average at the resolution boundary.
 *
 * The on-chain decision rule is PASS TWAP > FAIL TWAP * (1 + threshold).
 * Current TWAPs summarize the already-observed area. The future FAIL average
 * is an explicit scenario input; no future market path is inferred here.
 */
export function proposalRemainingSpreadProjection(input = {}) {
  const passTwap = finiteNumber(input.passTwap);
  const failTwap = finiteNumber(input.failTwap);
  const thresholdPct = finiteNumber(input.thresholdPct);
  const failFutureAverage = finiteNumber(input.failFutureAverage);
  const twapStartedAtMs = timestampMs(input.twapStartedAt);
  const observedAtMs = timestampMs(input.observedAt);
  const endsAtMs = timestampMs(input.endsAt);
  const thresholdMultiplier = Number.isFinite(thresholdPct)
    ? 1 + thresholdPct / 100
    : null;

  if (
    !Number.isFinite(passTwap)
    || passTwap < 0
    || !Number.isFinite(failTwap)
    || failTwap <= 0
    || !Number.isFinite(failFutureAverage)
    || failFutureAverage <= 0
    || !Number.isFinite(thresholdMultiplier)
    || thresholdMultiplier <= 0
    || !Number.isFinite(twapStartedAtMs)
    || !Number.isFinite(observedAtMs)
    || !Number.isFinite(endsAtMs)
    || observedAtMs <= twapStartedAtMs
    || observedAtMs >= endsAtMs
  ) return null;

  const elapsedMs = observedAtMs - twapStartedAtMs;
  const remainingMs = endsAtMs - observedAtMs;
  const observedPassArea = passTwap * elapsedMs;
  const observedFailArea = failTwap * elapsedMs;
  const requiredPassAverageBoundary = (
    thresholdMultiplier * (
      observedFailArea + failFutureAverage * remainingMs
    ) - observedPassArea
  ) / remainingMs;

  if (!Number.isFinite(requiredPassAverageBoundary)) return null;

  const minimumPassAverage = Math.max(0, requiredPassAverageBoundary);
  const requiredSpreadPct = (
    (minimumPassAverage / failFutureAverage) - 1
  ) * 100;

  if (!Number.isFinite(requiredSpreadPct)) return null;

  return {
    passTwap,
    failTwap,
    thresholdPct,
    thresholdMultiplier,
    failFutureAverage,
    requiredPassAverageBoundary,
    minimumPassAverage,
    requiredSpreadPct,
    elapsedMs,
    remainingMs,
    twapStartedAt: new Date(twapStartedAtMs).toISOString(),
    observedAt: new Date(observedAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
  };
}
