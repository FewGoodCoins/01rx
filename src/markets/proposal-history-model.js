function timestampMs(value) {
  const milliseconds = new Date(value || '').getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function proposalChartPointTime(point) {
  return timestampMs(point?.chartTimestamp)
    ?? timestampMs(point?.observedAt)
    ?? timestampMs(point?.timestamp);
}

export function proposalDecisionEdge(passTwap, failTwap) {
  if (passTwap == null || passTwap === '' || failTwap == null || failTwap === '') {
    return null;
  }
  const pass = Number(passTwap);
  const fail = Number(failTwap);
  if (!Number.isFinite(pass) || !Number.isFinite(fail) || pass < 0 || fail <= 0) {
    return null;
  }
  const edge = ((pass / fail) - 1) * 100;
  return Number.isFinite(edge) ? edge : null;
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
      decisionEdge: beforeTwap
        ? null
        : proposalDecisionEdge(point.passTwap, point.failTwap),
      ...(beforeTwap ? {
        passTwap: null,
        failTwap: null,
      } : {}),
    };
  });
}

export function proposalChartPoints(history) {
  return proposalHistoryChartObservations(history);
}
