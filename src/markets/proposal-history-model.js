const DEFAULT_OBSERVATION_INTERVAL_MS = 60 * 60 * 1_000;
const OBSERVATION_INTERVAL_MS = Object.freeze({
  '15m': 15 * 60 * 1_000,
  '1h': DEFAULT_OBSERVATION_INTERVAL_MS,
});

function timestampMs(value) {
  const milliseconds = new Date(value || '').getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function finitePrice(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function observationIntervalMs(series, explicitInterval) {
  const times = (Array.isArray(series) ? series : [])
    .map(point => timestampMs(point?.observedAt) ?? timestampMs(point?.timestamp))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  for (let index = 1; index < times.length; index += 1) {
    const interval = times[index] - times[index - 1];
    if (interval > 0) return interval;
  }
  return OBSERVATION_INTERVAL_MS[String(explicitInterval || '').trim().toLowerCase()]
    || DEFAULT_OBSERVATION_INTERVAL_MS;
}

export function proposalChartPointTime(point) {
  return timestampMs(point?.chartTimestamp)
    ?? timestampMs(point?.observedAt)
    ?? timestampMs(point?.timestamp);
}

export function proposalLaunchAnchor(history, options = {}) {
  const series = Array.isArray(history?.series) ? history.series : [];
  const first = series[0];
  const price = finitePrice(first?.underlyingPrice);
  const observationTime = proposalChartPointTime(first);
  if (!Number.isFinite(price) || !Number.isFinite(observationTime)) return null;

  const bucketTime = timestampMs(first?.timestamp);
  const indexedLaunchTime = timestampMs(options.launchedAt ?? history?.launchedAt);
  const interval = observationIntervalMs(series, history?.interval);
  const indexedLaunchIsInChartWindow = Number.isFinite(indexedLaunchTime)
    && indexedLaunchTime < observationTime
    && observationTime - indexedLaunchTime <= interval * 1.5;
  const anchorTime = indexedLaunchIsInChartWindow
    ? indexedLaunchTime
    : Number.isFinite(bucketTime) && bucketTime < observationTime
      ? bucketTime
      : observationTime - interval;
  const timestamp = new Date(anchorTime).toISOString();

  return {
    timestamp,
    observedAt: timestamp,
    chartTimestamp: timestamp,
    underlyingPrice: price,
    underlyingTwap: null,
    passPrice: price,
    failPrice: price,
    passTwap: null,
    failTwap: null,
    sampleCount: 0,
    protocolLaunchAnchor: true,
  };
}

export function proposalHistoryChartObservations(history) {
  const series = Array.isArray(history?.series) ? history.series : [];
  const twapStart = timestampMs(history?.preTwap);
  return series.map((point) => {
    const time = proposalChartPointTime(point);
    const beforeTwap = Number.isFinite(twapStart)
      && (!Number.isFinite(time) || time < twapStart);
    return {
      ...point,
      ...(Number.isFinite(time)
        ? { chartTimestamp: new Date(time).toISOString() }
        : {}),
      ...(beforeTwap ? {
        underlyingTwap: null,
        passTwap: null,
        failTwap: null,
      } : {}),
    };
  });
}

export function proposalChartPoints(history, options = {}) {
  const observations = proposalHistoryChartObservations(history);
  const anchor = proposalLaunchAnchor(history, options);
  return anchor ? [anchor, ...observations] : observations;
}
