import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import { mountTradingViewAttribution } from '../chart/tradingview-attribution.js';
import {
  proposalChartPointTime,
  proposalChartPoints,
  proposalConditionalSpotChangePct,
  proposalDecisionEdge,
} from './proposal-history-model.js';
import {
  PROPOSAL_CHART_PRESENTATION,
  PROPOSAL_CHART_SERIES_PRESENTATION,
  proposalChartPresentationCssVariables,
} from './proposal-history-presentation.js';

// TradingView Lightweight Charts adapter shared by every Markets host.
const DEFAULT_INTERVAL_SECONDS = 60 * 60;
const INTERVAL_SECONDS = Object.freeze({
  '15m': 15 * 60,
  '1h': DEFAULT_INTERVAL_SECONDS,
});
const RANGE_SECONDS = {
  '24h': 24 * 60 * 60,
  '48h': 48 * 60 * 60,
};
const CHART_INTERACTION_EVENTS = Object.freeze([
  'wheel',
  'pointermove',
  'touchmove',
  'dblclick',
]);
const MAX_BOUNDARY_TIMELINE_POINTS = 2_048;
const MINIMUM_ZOOM_OUT_WIDTH = 24;
const ZOOM_OUT_CONTENT_MULTIPLIER = 3;

export const PROPOSAL_HISTORY_ENGINE = 'tradingview-lightweight';
export const PROPOSAL_HISTORY_GUIDE_LINE_STYLE = LineStyle.SparseDotted;
export const PROPOSAL_HISTORY_CROSSHAIR_MARKERS_VISIBLE = false;
export const PROPOSAL_HISTORY_MIN_BAR_SPACING = 0.5;

export const PROPOSAL_HISTORY_SERIES = Object.freeze(
  PROPOSAL_CHART_SERIES_PRESENTATION.map(definition => Object.freeze({
    ...definition,
    lineStyle: definition.stroke === 'dashed' ? LineStyle.Dashed : LineStyle.Solid,
    interpolation: definition.curve === 'smooth' ? 'rounded' : 'linear',
  })),
);

// Keep the decision-edge calculation in the shared history model while its
// chart treatment is intentionally paused. Restoring it later should only
// require changing this renderer-owned selection.
const PROPOSAL_HISTORY_RENDERED_SERIES = Object.freeze(
  PROPOSAL_HISTORY_SERIES.filter(definition => definition.field !== 'decisionEdge'),
);

function finiteValue(value, signed = false) {
  return Number.isFinite(value) && (signed || value >= 0) ? value : null;
}

function definitionValue(definition, value) {
  return finiteValue(value, definition?.signed === true);
}

export function proposalChartLineType(definition) {
  return definition?.interpolation === 'rounded'
    ? LineType.Curved
    : LineType.Simple;
}

function unixTime(value) {
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1_000) : null;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute >= 100
    ? 2
    : absolute >= 1
      ? 4
      : absolute >= 0.01
        ? 5
        : 7;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatUtcTime(value, options = {}) {
  const seconds = typeof value === 'number' ? value : unixTime(value);
  if (!Number.isFinite(seconds)) return 'Latest retained observation';
  const date = new Date(seconds * 1_000);
  const datePart = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(options.year ? { year: 'numeric' } : {}),
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${datePart}, ${timePart} UTC`;
}

function formatOverlayTimestamp(value) {
  const seconds = typeof value === 'number' ? value : unixTime(value);
  if (!Number.isFinite(seconds)) return '—';
  const date = new Date(seconds * 1_000);
  const dateLabel = `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${String(
    date.getUTCFullYear(),
  ).slice(-2)}`;
  const timeLabel = `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')} UTC`;
  return `${dateLabel} · ${timeLabel}`;
}

function pricePrecision(points) {
  const values = points.flatMap(point => PROPOSAL_HISTORY_RENDERED_SERIES
    .filter(definition => definition.percent !== true)
    .map(definition => definitionValue(definition, point?.[definition.field]))
    .filter(Number.isFinite));
  const maximum = values.length ? Math.max(...values) : 1;
  if (maximum >= 100) return 2;
  if (maximum >= 1) return 4;
  if (maximum >= 0.01) return 5;
  return 7;
}

function cssColor(runtime, themeRoot, variable, fallback) {
  const value = runtime.getComputedStyle?.(themeRoot)?.getPropertyValue(variable)?.trim();
  return value || fallback;
}

function chartTheme(runtime, themeRoot, theme) {
  const light = theme === 'light';
  const presentationTheme = PROPOSAL_CHART_PRESENTATION.theme;
  return {
    background: cssColor(
      runtime,
      themeRoot,
      presentationTheme.backgroundVariable,
      light ? '#f4f5f2' : '#0e1217',
    ),
    text: cssColor(
      runtime,
      themeRoot,
      presentationTheme.faintVariable,
      light ? '#8a929c' : '#626c79',
    ),
    border: cssColor(
      runtime,
      themeRoot,
      presentationTheme.borderVariable,
      light ? '#cbd0d4' : '#2a323d',
    ),
    grid: light ? 'rgba(18, 22, 27, 0.055)' : 'rgba(255, 255, 255, 0.045)',
    crosshair: light ? 'rgba(32, 36, 42, 0.42)' : 'rgba(230, 233, 237, 0.38)',
    font: presentationTheme.fontFamily,
  };
}

function readoutElements(container) {
  return {
    time: container.querySelector('[data-ft-role="hourly-readout-time"]'),
    values: new Map(PROPOSAL_HISTORY_RENDERED_SERIES.map(definition => [
      definition.field,
      container.querySelector(`[data-ft-readout-value="${definition.field}"]`),
    ])),
    spotChanges: new Map(['passPrice', 'failPrice'].map(field => [
      field,
      container.querySelector(`[data-ft-readout-spot-change="${field}"]`),
    ])),
  };
}

function updateReadout(elements, timestamp, values) {
  if (elements.time) elements.time.textContent = timestamp == null
    ? '—'
    : formatOverlayTimestamp(timestamp);

  PROPOSAL_HISTORY_RENDERED_SERIES.forEach((definition) => {
    const target = elements.values.get(definition.field);
    if (target) {
      const value = definitionValue(definition, values[definition.field]);
      target.textContent = definition.percent
        ? Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—'
        : Number.isFinite(value) ? `$${formatPrice(value)}` : '—';
    }
  });

  const underlying = definitionValue(
    PROPOSAL_HISTORY_SERIES.find(definition => definition.field === 'underlyingPrice'),
    values.underlyingPrice,
  );
  ['passPrice', 'failPrice'].forEach((field) => {
    const target = elements.spotChanges.get(field);
    if (!target) return;
    const change = proposalConditionalSpotChangePct(values[field], underlying);
    target.textContent = Number.isFinite(change)
      ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%`
      : '—';
    target.classList.remove('ft-is-positive', 'ft-is-negative', 'ft-is-flat');
    if (Number.isFinite(change)) {
      target.classList.add(change > 0
        ? 'ft-is-positive'
        : change < 0
          ? 'ft-is-negative'
          : 'ft-is-flat');
    }
  });
}

function historyIntervalSeconds(value) {
  return INTERVAL_SECONDS[String(value || '').trim().toLowerCase()]
    || DEFAULT_INTERVAL_SECONDS;
}

export function splitProposalChartSeries(points, field, interval = '1h') {
  const segments = [];
  let segment = [];
  let previousTime = null;
  const gapSeconds = historyIntervalSeconds(interval) * 1.5;

  (Array.isArray(points) ? points : []).forEach((point) => {
    const timeMs = proposalChartPointTime(point);
    if (!Number.isFinite(timeMs)) return;
    const time = Math.floor(timeMs / 1_000);
    const definition = PROPOSAL_HISTORY_SERIES.find(series => series.field === field);
    const value = definitionValue(definition, point?.[field]);
    const hasGap = Number.isFinite(previousTime) && time - previousTime > gapSeconds;
    if (hasGap || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (Number.isFinite(value)) segment.push({ time, value });
    previousTime = time;
  });

  if (segment.length) segments.push(segment);
  return segments;
}

export function proposalChartData(points, field, interval = '1h') {
  const data = [];
  let previousTime = null;
  const intervalSeconds = historyIntervalSeconds(interval);
  const gapSeconds = intervalSeconds * 1.5;
  (Array.isArray(points) ? points : []).forEach((point) => {
    const timeMs = proposalChartPointTime(point);
    if (!Number.isFinite(timeMs)) return;
    const time = Math.floor(timeMs / 1_000);
    if (Number.isFinite(previousTime) && time - previousTime > gapSeconds) {
      data.push({ time: previousTime + intervalSeconds });
    }
    const definition = PROPOSAL_HISTORY_SERIES.find(series => series.field === field);
    const value = definitionValue(definition, point?.[field]);
    data.push(Number.isFinite(value) ? { time, value } : { time });
    previousTime = time;
  });
  return data;
}

export function proposalChartEndpoint(points, field, interval = '1h') {
  return proposalChartBoundaryEndpoints(points, field, interval)?.end || null;
}

export function proposalChartBoundaryEndpoints(points, field, interval = '1h') {
  const data = proposalChartData(points, field, interval);
  const observed = data.filter(point => Number.isFinite(point?.value));
  if (!observed.length) return null;
  return {
    start: observed[0],
    end: observed[observed.length - 1],
  };
}

export function proposalChartLiveEndpoints(points, interval = '1h') {
  return PROPOSAL_HISTORY_SERIES.filter(
    definition => definition.liveEndpoint,
  ).map((definition) => {
    const endpoint = proposalChartEndpoint(points, definition.field, interval);
    if (!endpoint) return null;
    return {
      field: definition.field,
      key: definition.liveEndpoint,
      endpoint,
    };
  }).filter(Boolean);
}

export function normalizeProposalChartLivePoint(point, latestTimestamp = null, now = Date.now()) {
  const values = {};
  let hasValue = false;
  PROPOSAL_HISTORY_SERIES.forEach((definition) => {
    const rawValue = definition.field === 'decisionEdge'
      ? point?.decisionEdge ?? proposalDecisionEdge(point?.passTwap, point?.failTwap)
      : point?.[definition.field];
    const value = definitionValue(definition, rawValue);
    values[definition.field] = value;
    if (Number.isFinite(value)) hasValue = true;
  });
  if (!hasValue) return null;

  const observedTimestamp = unixTime(
    point?.timestamp || point?.observedAt || point?.asOf,
  );
  const fallbackTimestamp = Math.floor(Number(now) / 1_000);
  const timestamp = Number.isFinite(observedTimestamp)
    ? observedTimestamp
    : fallbackTimestamp;
  if (!Number.isFinite(timestamp)) return null;

  return {
    time: Number.isFinite(latestTimestamp)
      ? Math.max(latestTimestamp, timestamp)
      : timestamp,
    values,
  };
}

export function interpolateChartTimeCoordinate(time, plottedTimes, coordinateForTime) {
  if (!Number.isFinite(time) || typeof coordinateForTime !== 'function') return null;
  const direct = coordinateForTime(time);
  if (Number.isFinite(direct)) return direct;
  const times = Array.from(new Set(Array.isArray(plottedTimes) ? plottedTimes : []))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (times.length < 2 || time < times[0] || time > times[times.length - 1]) return null;
  const rightIndex = times.findIndex(candidate => candidate > time);
  if (rightIndex <= 0) return null;
  const leftTime = times[rightIndex - 1];
  const rightTime = times[rightIndex];
  const leftCoordinate = coordinateForTime(leftTime);
  const rightCoordinate = coordinateForTime(rightTime);
  if (!Number.isFinite(leftCoordinate) || !Number.isFinite(rightCoordinate)) return null;
  const position = (time - leftTime) / (rightTime - leftTime);
  return leftCoordinate + (rightCoordinate - leftCoordinate) * position;
}

export function proposalChartBoundaryEvents(preTwap, windowEndedAt) {
  const seen = new Set();
  return [
    {
      kind: 'twap-start',
      time: unixTime(preTwap),
    },
    {
      kind: 'twap-end',
      time: unixTime(windowEndedAt),
    },
  ].filter((event) => {
    if (!Number.isFinite(event.time) || seen.has(event.time)) return false;
    seen.add(event.time);
    return true;
  });
}

export function proposalChartBoundaryTimeline(events, plottedTimes, interval = '1h') {
  const boundaries = (Array.isArray(events) ? events : [])
    .map(event => Number(event?.time))
    .filter(Number.isFinite);
  if (!boundaries.length) return [];
  const observed = (Array.isArray(plottedTimes) ? plottedTimes : [])
    .map(Number)
    .filter(Number.isFinite);
  const times = [...observed, ...boundaries];
  const first = Math.min(...times);
  const last = Math.max(...times);
  const intervalSeconds = historyIntervalSeconds(interval);
  const estimatedPoints = Math.max(1, Math.ceil((last - first) / intervalSeconds));
  const stride = intervalSeconds * Math.max(
    1,
    Math.ceil(estimatedPoints / MAX_BOUNDARY_TIMELINE_POINTS),
  );
  const timeline = new Set(boundaries);
  timeline.add(first);
  timeline.add(last);
  for (let time = first; time <= last; time += stride) timeline.add(time);
  return [...timeline].sort((left, right) => left - right);
}

export function proposalChartObservedRange(plottedTimes, interval = '1h') {
  const times = Array.from(new Set(Array.isArray(plottedTimes) ? plottedTimes : []))
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!times.length) return null;
  if (times.length === 1) {
    const padding = historyIntervalSeconds(interval);
    return { from: times[0] - padding, to: times[0] + padding };
  }
  return { from: times[0], to: times[times.length - 1] };
}

export function proposalChartDisplayRange(plottedTimes, events, interval = '1h') {
  const boundaries = (Array.isArray(events) ? events : [])
    .map(event => Number(event?.time))
    .filter(Number.isFinite);
  const range = proposalChartObservedRange(
    [...(Array.isArray(plottedTimes) ? plottedTimes : []), ...boundaries],
    interval,
  );
  if (!range) return null;
  const twapEnd = (Array.isArray(events) ? events : [])
    .find(event => event?.kind === 'twap-end');
  const twapEndTime = Number(twapEnd?.time);
  if (!Number.isFinite(twapEndTime) || range.to > twapEndTime) return range;
  const intervalSeconds = historyIntervalSeconds(interval);
  const visibleSpan = Math.max(intervalSeconds, range.to - range.from);
  const postWindowPadding = Math.min(
    24 * 60 * 60,
    Math.max(intervalSeconds * 2, visibleSpan * 0.08),
  );
  return {
    from: range.from,
    to: range.to + postWindowPadding,
  };
}

export function proposalChartMaximumLogicalWidth(pointCount, boundaryPointCount = 0) {
  const contentWidth = Math.max(
    1,
    Number.isFinite(Number(pointCount)) ? Math.floor(Number(pointCount)) : 0,
    Number.isFinite(Number(boundaryPointCount))
      ? Math.floor(Number(boundaryPointCount))
      : 0,
  );
  return Math.max(
    MINIMUM_ZOOM_OUT_WIDTH,
    contentWidth * ZOOM_OUT_CONTENT_MULTIPLIER,
  );
}

export function proposalLaunchSeriesMarker(anchor) {
  const timeMs = proposalChartPointTime(anchor);
  const price = finiteValue(anchor?.underlyingPrice);
  if (!Number.isFinite(timeMs) || !Number.isFinite(price)) return null;
  return {
    id: 'shared-launch-reserve',
    time: Math.floor(timeMs / 1_000),
    position: 'atPriceMiddle',
    price,
    shape: 'circle',
    color: '#ffffff',
    size: 0.5,
  };
}

function latestValues(points) {
  const latestPoint = points[points.length - 1] || {};
  const result = {};
  PROPOSAL_HISTORY_RENDERED_SERIES.forEach((definition) => {
    result[definition.field] = definitionValue(
      definition,
      latestPoint[definition.field],
    );
  });
  return result;
}

function crosshairValues(seriesByField, seriesData) {
  const values = {};
  PROPOSAL_HISTORY_RENDERED_SERIES.forEach((definition) => {
    values[definition.field] = null;
    for (const series of seriesByField.get(definition.field) || []) {
      const data = seriesData.get(series);
      const value = definitionValue(definition, data?.value);
      if (Number.isFinite(value)) {
        values[definition.field] = value;
        break;
      }
    }
  });
  return values;
}

/**
 * Progressively enhances the semantic SVG proposal chart with the locally
 * bundled TradingView Lightweight Charts renderer.
 */
export function createProposalHistoryChart({
  runtime,
  themeRoot,
  container,
  history,
  theme = 'dark',
  visibility = {},
  range = 'all',
  launchedAt = null,
  windowEndedAt = null,
  isLive = false,
} = {}) {
  if (!runtime || !container || !Array.isArray(history?.series) || !history.series.length) {
    return null;
  }

  const points = proposalChartPoints(history, { launchedAt });
  const observations = points.filter(point => point.protocolLaunchAnchor !== true);
  const chartRoot = container.closest('.ft-hourly-chart') || container;
  const readout = readoutElements(chartRoot);
  const precision = pricePrecision(points);
  const minMove = 10 ** -precision;
  const seriesByField = new Map();
  const seriesVisibility = new Map();
  const liveEndpointDots = new Map();
  const boundaryDots = new Map();
  let currentTheme = chartTheme(runtime, themeRoot, theme);
  const latest = latestValues(observations);
  const firstTimestamp = Math.floor(proposalChartPointTime(points[0]) / 1_000);
  let lastTimestamp = Math.floor(
    proposalChartPointTime(points[points.length - 1]) / 1_000,
  );
  const plottedTimes = points.filter(point => PROPOSAL_HISTORY_RENDERED_SERIES.some(
    definition => Number.isFinite(definitionValue(
      definition,
      point?.[definition.field],
    )),
  )).map(point => Math.floor(proposalChartPointTime(point) / 1_000)).filter(Number.isFinite);
  let rangeFrame = null;
  let eventFrame = null;
  let readoutFrame = null;
  let pendingCrosshair = null;
  let chart = null;
  let resizeObserver = null;
  let interactionHandler = null;
  let launchAnchorMarkers = null;
  let currentRange = range;
  const interaction = PROPOSAL_CHART_PRESENTATION.interaction;
  const twapStartTimestamp = unixTime(history.preTwap);
  const eventDefinitions = proposalChartBoundaryEvents(
    history.preTwap,
    windowEndedAt,
  );
  const displayRange = proposalChartDisplayRange(
    plottedTimes,
    eventDefinitions,
    history.interval,
  );
  const boundaryTimeline = proposalChartBoundaryTimeline(
    Number.isFinite(displayRange?.to)
      ? [...eventDefinitions, { kind: 'display-end', time: displayRange.to }]
      : eventDefinitions,
    plottedTimes,
    history.interval,
  );

  try {
    chart = createChart(container, {
    autoSize: true,
    height: Math.max(260, container.clientHeight || 340),
    layout: {
      attributionLogo: false,
      background: { type: ColorType.Solid, color: currentTheme.background },
      textColor: currentTheme.text,
      fontFamily: currentTheme.font,
      fontSize: 10,
    },
    grid: {
      vertLines: { color: currentTheme.grid },
      horzLines: { color: currentTheme.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      doNotSnapToHiddenSeriesIndices: true,
      vertLine: {
        color: currentTheme.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelVisible: true,
      },
      horzLine: {
        color: currentTheme.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelVisible: true,
      },
    },
    localization: {
      priceFormatter: formatPrice,
      timeFormatter: time => formatUtcTime(time, { year: true }),
    },
    leftPriceScale: {
      autoScale: true,
      borderColor: currentTheme.border,
      borderVisible: true,
      entireTextOnly: true,
      scaleMargins: { top: 0.16, bottom: 0.16 },
      visible: false,
    },
    rightPriceScale: {
      autoScale: true,
      borderColor: currentTheme.border,
      borderVisible: true,
      entireTextOnly: true,
      scaleMargins: { top: 0.22, bottom: 0.14 },
    },
    timeScale: {
      borderColor: currentTheme.border,
      borderVisible: true,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 2,
      minBarSpacing: PROPOSAL_HISTORY_MIN_BAR_SPACING,
      lockVisibleTimeRangeOnResize: true,
      tickMarkFormatter(time, tickMarkType) {
        const date = new Date(Number(time) * 1_000);
        if (!Number.isFinite(date.getTime())) return null;
        if (tickMarkType === 0) return String(date.getUTCFullYear());
        if (tickMarkType === 1) {
          return date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        }
        if (tickMarkType === 2) {
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          });
        }
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'UTC',
        });
      },
    },
    handleScroll: {
      mouseWheel: interaction.wheelZoom,
      pressedMouseMove: interaction.dragPan,
      horzTouchDrag: interaction.dragPan,
      vertTouchDrag: interaction.dragPan,
    },
    handleScale: {
      axisPressedMouseMove: {
        time: interaction.scaleDrag,
        price: interaction.scaleDrag,
      },
      axisDoubleClickReset: {
        time: true,
        price: true,
      },
      mouseWheel: interaction.wheelZoom,
      pinch: interaction.pinchZoom,
    },
    kineticScroll: {
      mouse: interaction.kineticScroll,
      touch: interaction.kineticScroll,
    },
  });
  container.dataset.ftChartEngine = PROPOSAL_HISTORY_ENGINE;
  Object.entries(proposalChartPresentationCssVariables()).forEach(([property, value]) => {
    chartRoot.style.setProperty(property, value);
  });
  mountTradingViewAttribution(container, { runtime });

  // Keep future TWAP boundaries on the time axis without adding or extending
  // any price series. Live price updates remain ordered against observed data.
  if (eventDefinitions.length) {
    const boundaryTimeSeries = chart.addSeries(LineSeries, {
      lineVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => null,
    });
    boundaryTimeSeries.setData(boundaryTimeline.map(time => ({ time })));
  }

  PROPOSAL_HISTORY_RENDERED_SERIES.forEach((definition) => {
    const data = proposalChartData(points, definition.field, history.interval);
    const color = cssColor(
      runtime,
      themeRoot,
      definition.colorVariable,
      definition.fallbackColor,
    );
    const seriesVisible = visibility[definition.field] !== false;
    const seriesOptions = {
      title: definition.label,
      lineStyle: definition.lineStyle,
      lineType: proposalChartLineType(definition),
      lineWidth: definition.lineWidth,
      visible: seriesVisible,
      priceScaleId: definition.priceScaleId || 'right',
      priceFormat: definition.percent
        ? {
            type: 'custom',
            minMove: 0.01,
            formatter: value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
          }
        : {
            type: 'price',
            precision,
            minMove,
          },
      crosshairMarkerVisible: PROPOSAL_HISTORY_CROSSHAIR_MARKERS_VISIBLE,
      // Current values use the synchronized DOM pulse markers below. Keeping
      // the chart engine's point markers disabled avoids a second hollow dot
      // appearing on sparse TWAP series and being mistaken for a live value.
      pointMarkersVisible: false,
      lastValueVisible: Number.isFinite(definitionValue(
        definition,
        observations[observations.length - 1]?.[definition.field],
      )),
      priceLineVisible: definition.priceLineVisible === true,
      priceLineStyle: PROPOSAL_HISTORY_GUIDE_LINE_STYLE,
      priceLineWidth: 1,
      color,
      priceLineColor: color,
    };
    const line = chart.addSeries(LineSeries, seriesOptions);
    line.setData(data);
    seriesByField.set(definition.field, [line]);
    seriesVisibility.set(definition.field, seriesVisible);

    const boundaries = proposalChartBoundaryEndpoints(
      points,
      definition.field,
      history.interval,
    );
    if (boundaries) {
      ['start', 'end'].forEach((kind) => {
        if (kind === 'end' && isLive && definition.liveEndpoint) return;
        const dot = runtime.document.createElement('span');
        dot.className = `ft-proposal-boundary-dot ft-proposal-boundary-dot-${kind}`;
        dot.dataset.ftSeriesBoundary = `${definition.field}:${kind}`;
        dot.setAttribute('aria-hidden', 'true');
        dot.style.color = color;
        container.appendChild(dot);
        boundaryDots.set(`${definition.field}:${kind}`, {
          definition,
          element: dot,
          endpoint: boundaries[kind],
          motionPending: false,
          position: null,
        });
      });
    }
  });

  const launchAnchor = points.find(point => point.protocolLaunchAnchor === true);
  const launchMarker = proposalLaunchSeriesMarker(launchAnchor);
  if (launchMarker) {
    const underlyingSeries = seriesByField.get('underlyingPrice')?.[0];
    if (underlyingSeries) {
      launchAnchorMarkers = createSeriesMarkers(
        underlyingSeries,
        [launchMarker],
        { autoScale: false, zOrder: 'top' },
      );
      container.dataset.ftLaunchAnchorRenderer = 'series-marker';
    }
  }
  function setLiveEndpoint(field, key, endpoint, animate = false) {
    if (!isLive || !endpoint) return;
    let record = liveEndpointDots.get(field);
    if (!record) {
      const dot = runtime.document.createElement('span');
      dot.className = `ft-proposal-live-dot ft-proposal-live-dot-${key}`;
      dot.dataset.ftLiveEndpoint = key;
      dot.setAttribute('aria-hidden', 'true');
      container.appendChild(dot);
      record = {
        animation: null,
        element: dot,
        endpoint,
        motionPending: false,
        position: null,
      };
      liveEndpointDots.set(field, record);
    }
    record.motionPending = animate && record.position != null;
    record.endpoint = endpoint;
  }
  proposalChartLiveEndpoints(points, history.interval)
    .forEach(({ field, key, endpoint }) => {
      setLiveEndpoint(field, key, endpoint);
    });
  const preTwapBoundary = eventDefinitions.find(event => event.kind === 'twap-start');
  const postTwapBoundary = eventDefinitions.find(event => event.kind === 'twap-end');
  const preTwapBand = preTwapBoundary
    ? runtime.document.createElement('span')
    : null;
  const postTwapBand = postTwapBoundary
    ? runtime.document.createElement('span')
    : null;
  if (preTwapBand) {
    preTwapBand.className = 'ft-hourly-pre-twap-band';
    preTwapBand.dataset.ftChartBand = 'pre-twap';
    preTwapBand.setAttribute('aria-hidden', 'true');
    container.appendChild(preTwapBand);
  }
  if (postTwapBand) {
    postTwapBand.className = 'ft-hourly-post-twap-band';
    postTwapBand.dataset.ftChartBand = 'post-twap';
    postTwapBand.setAttribute('aria-hidden', 'true');
    container.appendChild(postTwapBand);
  }
  const reducedMotion = runtime.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  function positionEndpointDot(record, field, width, height) {
    const { element, endpoint } = record;
    const series = seriesByField.get(field)?.[0];
    if (!series || seriesVisibility.get(field) === false) {
      element.hidden = true;
      record.motionPending = false;
      record.position = null;
      return;
    }
    const x = chart.timeScale().timeToCoordinate(endpoint.time);
    const y = series.priceToCoordinate(endpoint.value);
    const positioned = (
      Number.isFinite(x)
      && Number.isFinite(y)
      && x >= 0
      && x <= width
      && y >= 0
      && (!height || y <= height)
    );
    element.hidden = !positioned;
    if (!positioned) {
      record.motionPending = false;
      record.position = null;
      return;
    }

    const previous = record.position;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    record.position = { x, y };
    if (
      !record.motionPending
      || !previous
      || reducedMotion
      || typeof element.animate !== 'function'
    ) {
      record.motionPending = false;
      return;
    }

    const deltaX = previous.x - x;
    const deltaY = previous.y - y;
    record.animation?.cancel?.();
    record.animation = element.animate([
      {
        transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`,
      },
      { transform: 'translate(-50%, -50%)' },
    ], {
      duration: PROPOSAL_CHART_PRESENTATION.liveEndpoint.motionDurationMs,
      easing: PROPOSAL_CHART_PRESENTATION.liveEndpoint.motionEasing,
    });
    record.motionPending = false;
  }

  function positionEvents() {
    const width = container.clientWidth;
    const rightScaleWidth = Number(chart.priceScale('right').width?.());
    const resolvedRightScaleWidth = Number.isFinite(rightScaleWidth) && rightScaleWidth >= 0
      ? rightScaleWidth
      : 0;
    if (resolvedRightScaleWidth > 0) {
      chartRoot.style.setProperty(
        '--ft-chart-right-scale-width',
        `${resolvedRightScaleWidth}px`,
      );
    }
    const plotWidth = Math.max(1, width - resolvedRightScaleWidth);
    if (preTwapBand) {
      const coordinate = interpolateChartTimeCoordinate(
        preTwapBoundary.time,
        plottedTimes,
        time => chart.timeScale().timeToCoordinate(time),
      );
      const visibleWidth = Number.isFinite(coordinate)
        ? Math.min(plotWidth, Math.max(0, coordinate))
        : 0;
      preTwapBand.hidden = visibleWidth <= 0;
      preTwapBand.style.setProperty(
        '--ft-pre-twap-scale',
        String(visibleWidth / plotWidth),
      );
    }
    if (postTwapBand) {
      const coordinate = interpolateChartTimeCoordinate(
        postTwapBoundary.time,
        plottedTimes,
        time => chart.timeScale().timeToCoordinate(time),
      );
      const visibleWidth = Number.isFinite(coordinate)
        ? Math.min(plotWidth, Math.max(0, plotWidth - coordinate))
        : 0;
      postTwapBand.hidden = visibleWidth <= 0;
      postTwapBand.style.setProperty(
        '--ft-post-twap-scale',
        String(visibleWidth / plotWidth),
      );
    }
    const height = container.clientHeight;
    boundaryDots.forEach((record, key) => {
      positionEndpointDot(record, key.split(':')[0], width, height);
    });
    liveEndpointDots.forEach((record, field) => {
      positionEndpointDot(record, field, width, height);
    });
  }

  function scheduleEventPosition() {
    if (eventFrame != null) return;
    const applyPosition = () => {
      eventFrame = null;
      positionEvents();
    };
    if (typeof runtime.requestAnimationFrame === 'function') {
      eventFrame = runtime.requestAnimationFrame(applyPosition);
    } else {
      applyPosition();
    }
  }

  function scheduleRangePadding() {
    if (rangeFrame != null && typeof runtime.cancelAnimationFrame === 'function') {
      runtime.cancelAnimationFrame(rangeFrame);
    }
    const applyPadding = () => {
      rangeFrame = null;
      const logicalRange = chart.timeScale().getVisibleLogicalRange();
      if (logicalRange) {
        chart.timeScale().setVisibleLogicalRange({
          from: logicalRange.from - 1,
          to: logicalRange.to,
        });
      }
      scheduleEventPosition();
    };
    if (typeof runtime.requestAnimationFrame === 'function') {
      rangeFrame = runtime.requestAnimationFrame(applyPadding);
    } else {
      applyPadding();
    }
  }

  function setRange(nextRange = 'all') {
    currentRange = RANGE_SECONDS[nextRange] ? nextRange : 'all';
    const seconds = RANGE_SECONDS[nextRange];
    if (!seconds || !Number.isFinite(lastTimestamp)) {
      if (displayRange) {
        chart.timeScale().setVisibleRange(displayRange);
      } else {
        chart.timeScale().fitContent();
      }
      scheduleRangePadding();
      return;
    }
    chart.timeScale().setVisibleRange({
      from: Math.max(firstTimestamp || lastTimestamp, lastTimestamp - seconds),
      to: lastTimestamp,
    });
    scheduleRangePadding();
  }

  function zoom(factor) {
    const visible = chart.timeScale().getVisibleLogicalRange();
    if (!visible || !Number.isFinite(factor) || factor <= 0) return;
    const currentWidth = Math.max(2, visible.to - visible.from);
    const maximumWidth = proposalChartMaximumLogicalWidth(
      plottedTimes.length,
      boundaryTimeline.length,
    );
    const nextWidth = Math.min(maximumWidth, Math.max(2, currentWidth * factor));
    const center = (visible.from + visible.to) / 2;
    chart.timeScale().setVisibleLogicalRange({
      from: center - nextWidth / 2,
      to: center + nextWidth / 2,
    });
    scheduleEventPosition();
  }

  function resetView() {
    chart.priceScale('left').setAutoScale(true);
    chart.priceScale('right').setAutoScale(true);
    setRange(currentRange);
  }

  function setSeriesVisible(field, visible) {
    seriesVisibility.set(field, visible !== false);
    for (const series of seriesByField.get(field) || []) {
      series.applyOptions({ visible: visible !== false });
    }
    scheduleEventPosition();
  }

  function applyTheme(nextTheme) {
    currentTheme = chartTheme(runtime, themeRoot, nextTheme);
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: currentTheme.background },
        textColor: currentTheme.text,
        fontFamily: currentTheme.font,
      },
      grid: {
        vertLines: { color: currentTheme.grid },
        horzLines: { color: currentTheme.grid },
      },
      crosshair: {
        vertLine: { color: currentTheme.crosshair },
        horzLine: { color: currentTheme.crosshair },
      },
      leftPriceScale: { borderColor: currentTheme.border },
      rightPriceScale: { borderColor: currentTheme.border },
      timeScale: { borderColor: currentTheme.border },
    });
    PROPOSAL_HISTORY_RENDERED_SERIES.forEach((definition) => {
      const color = cssColor(
        runtime,
        themeRoot,
        definition.colorVariable,
        definition.fallbackColor,
      );
      for (const series of seriesByField.get(definition.field) || []) {
        series.applyOptions({ color, priceLineColor: color });
      }
      ['start', 'end'].forEach((kind) => {
        const record = boundaryDots.get(`${definition.field}:${kind}`);
        if (record) record.element.style.color = color;
      });
    });
  }

  function updateLivePoint(point) {
    if (!isLive) return false;
    const normalized = normalizeProposalChartLivePoint(point, lastTimestamp);
    if (!normalized) return false;

    PROPOSAL_HISTORY_RENDERED_SERIES.forEach((definition) => {
      const value = normalized.values[definition.field];
      if (!Number.isFinite(value)) return;
      if (
        (definition.field.endsWith('Twap') || definition.decisionMetric === true)
        && Number.isFinite(twapStartTimestamp)
        && normalized.time < twapStartTimestamp
      ) return;
      const series = seriesByField.get(definition.field)?.[0];
      series?.update?.({ time: normalized.time, value });
      latest[definition.field] = value;
      if (definition.liveEndpoint) {
        setLiveEndpoint(
          definition.field,
          definition.liveEndpoint,
          { time: normalized.time, value },
          true,
        );
      } else {
        const boundary = boundaryDots.get(`${definition.field}:end`);
        if (boundary) {
          boundary.motionPending = boundary.position != null;
          boundary.endpoint = { time: normalized.time, value };
        }
      }
    });
    lastTimestamp = normalized.time;
    if (!plottedTimes.includes(normalized.time)) {
      plottedTimes.push(normalized.time);
      plottedTimes.sort((left, right) => left - right);
    }
    updateReadout(readout, lastTimestamp, latest);
    scheduleEventPosition();
    return true;
  }

  const flushCrosshairReadout = () => {
    readoutFrame = null;
    const parameter = pendingCrosshair;
    pendingCrosshair = null;
    if (parameter?.time == null) {
      updateReadout(readout, lastTimestamp, latest);
      return;
    }
    updateReadout(
      readout,
      parameter.time,
      crosshairValues(seriesByField, parameter.seriesData),
    );
  };
  const crosshairHandler = (parameter) => {
    pendingCrosshair = parameter;
    scheduleEventPosition();
    if (readoutFrame != null) return;
    if (typeof runtime.requestAnimationFrame === 'function') {
      readoutFrame = runtime.requestAnimationFrame(flushCrosshairReadout);
    } else {
      flushCrosshairReadout();
    }
  };
  chart.subscribeCrosshairMove(crosshairHandler);
  const visibleRangeHandler = () => scheduleEventPosition();
  interactionHandler = () => {
    [...boundaryDots.values(), ...liveEndpointDots.values()].forEach((record) => {
      record.animation?.cancel?.();
      record.animation = null;
      record.motionPending = false;
    });
    scheduleEventPosition();
  };
  chart.timeScale().subscribeVisibleTimeRangeChange(visibleRangeHandler);
  CHART_INTERACTION_EVENTS.forEach((eventName) => {
    container.addEventListener(eventName, interactionHandler, { passive: true });
  });
  resizeObserver = typeof runtime.ResizeObserver === 'function'
    ? new runtime.ResizeObserver(scheduleEventPosition)
    : null;
  resizeObserver?.observe(container);
  setRange(range);
  updateReadout(readout, lastTimestamp, latest);
  chartRoot.classList.remove('ft-hourly-chart-pending');
  chartRoot.classList.add('ft-hourly-chart-enhanced');
  chartRoot.dataset.ftChartState = 'ready';
  chartRoot.setAttribute('aria-busy', 'false');

  return {
    applyTheme,
    resetView,
    setRange,
    setSeriesVisible,
    updateLivePoint,
    zoomIn() {
      zoom(0.72);
    },
    zoomOut() {
      zoom(1.38);
    },
    destroy() {
      if (rangeFrame != null && typeof runtime.cancelAnimationFrame === 'function') {
        runtime.cancelAnimationFrame(rangeFrame);
      }
      if (eventFrame != null && typeof runtime.cancelAnimationFrame === 'function') {
        runtime.cancelAnimationFrame(eventFrame);
      }
      if (readoutFrame != null && typeof runtime.cancelAnimationFrame === 'function') {
        runtime.cancelAnimationFrame(readoutFrame);
      }
      resizeObserver?.disconnect();
      try {
        chart.unsubscribeCrosshairMove(crosshairHandler);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(visibleRangeHandler);
      } catch (_) {
        // The chart may already be detached by navigation.
      }
      if (interactionHandler) {
        CHART_INTERACTION_EVENTS.forEach((eventName) => {
          container.removeEventListener(eventName, interactionHandler);
        });
      }
      boundaryDots.forEach(({ animation, element }) => {
        animation?.cancel?.();
        element.remove();
      });
      liveEndpointDots.forEach(({ animation, element }) => {
        animation?.cancel?.();
        element.remove();
      });
      launchAnchorMarkers?.detach();
      delete container.dataset.ftLaunchAnchorRenderer;
      delete container.dataset.ftChartEngine;
      preTwapBand?.remove();
      postTwapBand?.remove();
      Object.keys(proposalChartPresentationCssVariables()).forEach((property) => {
        chartRoot.style.removeProperty(property);
      });
      chart.remove();
    },
  };
  } catch (error) {
    if (rangeFrame != null && typeof runtime.cancelAnimationFrame === 'function') {
      runtime.cancelAnimationFrame(rangeFrame);
    }
    if (eventFrame != null && typeof runtime.cancelAnimationFrame === 'function') {
      runtime.cancelAnimationFrame(eventFrame);
    }
    if (readoutFrame != null && typeof runtime.cancelAnimationFrame === 'function') {
      runtime.cancelAnimationFrame(readoutFrame);
    }
    resizeObserver?.disconnect();
    if (interactionHandler) {
      CHART_INTERACTION_EVENTS.forEach((eventName) => {
        container.removeEventListener(eventName, interactionHandler);
      });
    }
    container.querySelectorAll('[data-ft-chart-event]').forEach(element => element.remove());
    container.querySelectorAll('[data-ft-chart-band]').forEach(element => element.remove());
    container.querySelectorAll('[data-ft-chart-anchor]').forEach(element => element.remove());
    boundaryDots.forEach(({ animation, element }) => {
      animation?.cancel?.();
      element.remove();
    });
    liveEndpointDots.forEach(({ animation, element }) => {
      animation?.cancel?.();
      element.remove();
    });
    launchAnchorMarkers?.detach();
    delete container.dataset.ftLaunchAnchorRenderer;
    delete container.dataset.ftChartEngine;
    Object.keys(proposalChartPresentationCssVariables()).forEach((property) => {
      chartRoot.style.removeProperty(property);
    });
    container.closest('.ft-hourly-chart')?.classList.remove(
      'ft-hourly-chart-enhanced',
      'ft-hourly-chart-pending',
    );
    try {
      chart?.remove();
    } catch (_) {
      // Preserve the original setup failure for the caller.
    }
    throw error;
  }
}
