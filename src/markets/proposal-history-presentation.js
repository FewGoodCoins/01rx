function frozenRecord(value) {
  return Object.freeze({ ...value });
}

/**
 * Renderer-independent decision-chart presentation contract.
 *
 * Lightweight Charts consumes this today. A future Advanced Charts adapter
 * should translate the same semantic series, interaction expectations, and
 * live treatment into its supported overrides, studies, and external UI.
 */
export const PROPOSAL_CHART_PRESENTATION = Object.freeze({
  theme: frozenRecord({
    backgroundVariable: '--ft-panel-soft',
    borderVariable: '--ft-border',
    faintVariable: '--ft-faint',
    fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  }),
  interaction: frozenRecord({
    dragPan: true,
    kineticScroll: true,
    pinchZoom: true,
    scaleDrag: true,
    wheelZoom: true,
  }),
  liveEndpoint: frozenRecord({
    diameterPx: 5,
    motionDurationMs: 360,
    motionEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    pulseDurationMs: 3_000,
    pulseScale: 3,
    staggerMs: 1_000,
  }),
});

export const PROPOSAL_CHART_SERIES_PRESENTATION = Object.freeze([
  frozenRecord({
    field: 'underlyingPrice',
    id: 'price',
    label: 'Price',
    colorVariable: '--ft-ink-strong',
    fallbackColor: '#f4f6f8',
    stroke: 'solid',
    lineWidth: 2,
    curve: 'smooth',
    liveEndpoint: 'price',
    priceLineVisible: false,
  }),
  frozenRecord({
    field: 'passPrice',
    id: 'pass',
    label: 'Pass',
    colorVariable: '--ft-positive',
    fallbackColor: '#42d89b',
    stroke: 'solid',
    lineWidth: 2,
    curve: 'smooth',
    liveEndpoint: 'pass',
    priceLineVisible: true,
  }),
  frozenRecord({
    field: 'failPrice',
    id: 'fail',
    label: 'Fail',
    colorVariable: '--ft-negative',
    fallbackColor: '#ff6f7d',
    stroke: 'solid',
    lineWidth: 2,
    curve: 'smooth',
    liveEndpoint: 'fail',
    priceLineVisible: true,
  }),
  frozenRecord({
    field: 'decisionEdge',
    id: 'decision-edge',
    label: 'Pass edge',
    colorVariable: '--ft-positive',
    fallbackColor: '#42d89b',
    negativeColorVariable: '--ft-negative',
    negativeFallbackColor: '#ff6f7d',
    stroke: 'solid',
    lineWidth: 2,
    curve: 'smooth',
    signed: true,
    percent: true,
    decisionMetric: true,
    seriesType: 'baseline',
    priceScaleId: 'left',
    liveEndpoint: null,
    priceLineVisible: false,
  }),
  frozenRecord({
    field: 'passTwap',
    id: 'pass-twap',
    label: 'Pass TWAP',
    colorVariable: '--ft-positive',
    fallbackColor: '#42d89b',
    stroke: 'dashed',
    lineWidth: 1,
    curve: 'linear',
    liveEndpoint: null,
    priceLineVisible: false,
  }),
  frozenRecord({
    field: 'failTwap',
    id: 'fail-twap',
    label: 'Fail TWAP',
    colorVariable: '--ft-negative',
    fallbackColor: '#ff6f7d',
    stroke: 'dashed',
    lineWidth: 1,
    curve: 'linear',
    liveEndpoint: null,
    priceLineVisible: false,
  }),
]);

export function proposalChartPresentationCssVariables() {
  const endpoint = PROPOSAL_CHART_PRESENTATION.liveEndpoint;
  return Object.freeze({
    '--ft-proposal-live-dot-size': `${endpoint.diameterPx}px`,
    '--ft-proposal-live-pulse-duration': `${endpoint.pulseDurationMs}ms`,
    '--ft-proposal-live-pulse-scale': String(endpoint.pulseScale),
    '--ft-proposal-live-pulse-stagger': `${endpoint.staggerMs}ms`,
  });
}
