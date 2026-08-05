import { Liveline } from 'liveline';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { CHART_ORIGIN_PRESENTATION } from '../chart/origin-presentation.js';
import {
  chartWheelDeltaPixels,
  chartWheelZoomFactor,
  STABLE_CHART_DATA_PLOT_RATIO,
  stableChartViewportProjection,
} from '../chart/stable-chart-viewport.js';
import {
  proposalChartPointTime,
  proposalConditionalSpotChangePct,
  proposalHistoryChartObservations,
} from './proposal-history-model.js';
import { PROPOSAL_CHART_SERIES_PRESENTATION } from './proposal-history-presentation.js';

const INTERVAL_SECONDS = Object.freeze({
  '15m': 15 * 60,
  '1h': 60 * 60,
});
const RANGE_SECONDS = Object.freeze({
  '24h': 24 * 60 * 60,
  '48h': 48 * 60 * 60,
});
const WINDOW_BUFFER_RATIO = 1.08;
const LIVE_LERP_SPEED = 0.08;
const INTERACTION_LERP_SPEED = 0.9;
const PLOT_TOP_PADDING = 54;
const MIN_HORIZONTAL_ZOOM_SCALE = 0.04;
const MAX_HORIZONTAL_ZOOM_SCALE = 24;
const PAN_EDGE_GUARD_RATIO = 0.08;
const HORIZONTAL_SCALE_SENSITIVITY = 1.4;
const MIN_VERTICAL_RANGE_SCALE = 0.12;
const MAX_VERTICAL_RANGE_SCALE = 16;
const VERTICAL_SCALE_SENSITIVITY = 1.15;
const KINETIC_PAN_DECAY = 0.9;
const KINETIC_PAN_MAX_SCREENS_PER_SECOND = 2.4;
const KINETIC_PAN_MIN_PIXELS_PER_MILLISECOND = 0.015;
const DEFAULT_RANGE_MARGIN = 0.12;
const EXAGGERATED_RANGE_MARGIN = 0.01;
const BOUND_POINT_REVEAL_DELAY_MS = 1_050;
// Liveline adds up to 0.2 of adaptive easing internally. Leave enough
// headroom to keep the effective coefficient at or below 1.
const RESOLVED_LERP_SPEED = 0.75;
const PLOT_PADDING = Object.freeze({
  top: PLOT_TOP_PADDING,
  right: 72,
  bottom: 30,
  left: 12,
});

export const PROPOSAL_HISTORY_ENGINE = 'liveline';
export const PROPOSAL_LIVELINE_SERIES = Object.freeze(
  PROPOSAL_CHART_SERIES_PRESENTATION.filter(
    definition => definition.decisionMetric !== true,
  ),
);

export function proposalLivelinePlaybackOptions(isLive) {
  return {
    lerpSpeed: isLive ? LIVE_LERP_SPEED : RESOLVED_LERP_SPEED,
    paused: !isLive,
    pulse: Boolean(isLive),
  };
}

function intervalSeconds(value) {
  return INTERVAL_SECONDS[String(value || '').trim().toLowerCase()]
    || INTERVAL_SECONDS['1h'];
}

function cssColor(runtime, themeRoot, variable, fallback) {
  const value = runtime.getComputedStyle?.(themeRoot)?.getPropertyValue(variable)?.trim();
  return value || fallback;
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
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}`;
}

function formatUtcTime(seconds) {
  const date = new Date(Number(seconds) * 1_000);
  if (!Number.isFinite(date.getTime())) return '—';
  const dateLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${dateLabel} ${timeLabel}`;
}

function plotPosition(ratio, startPadding, endPadding) {
  const normalized = Math.max(0, Math.min(1, Number(ratio) || 0));
  const pixelOffset = startPadding - normalized * (startPadding + endPadding);
  return `calc(${normalized * 100}% + ${pixelOffset}px)`;
}

function plotSize(ratio, startPadding, endPadding) {
  const normalized = Math.max(0, Math.min(1, Number(ratio) || 0));
  return `calc(${normalized * 100}% - ${normalized * (startPadding + endPadding)}px)`;
}

function mergeRanges(ranges) {
  const sorted = ranges
    .filter(range => Number.isFinite(range?.from) && Number.isFinite(range?.to) && range.to > range.from)
    .sort((left, right) => left.from - right.from);
  const merged = [];
  sorted.forEach((range) => {
    const previous = merged[merged.length - 1];
    if (!previous || range.from > previous.to) {
      merged.push({ ...range });
      return;
    }
    previous.to = Math.max(previous.to, range.to);
  });
  return merged;
}

export function proposalLivelineGapRanges(points, fields, interval = '1h') {
  const cadence = intervalSeconds(interval);
  const observations = (Array.isArray(points) ? points : [])
    .map(point => ({ point, time: proposalChartPointTime(point) / 1_000 }))
    .filter(entry => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time);
  const gaps = [];
  let previousTime = null;
  observations.forEach(({ point, time }) => {
    if (Number.isFinite(previousTime) && time - previousTime > cadence * 1.5) {
      gaps.push({
        from: previousTime + cadence / 2,
        to: time - cadence / 2,
      });
    }
    if ((Array.isArray(fields) ? fields : []).some(field => !Number.isFinite(point?.[field]))) {
      gaps.push({
        from: time - cadence / 2,
        to: time + cadence / 2,
      });
    }
    previousTime = time;
  });
  return mergeRanges(gaps);
}

export function proposalLivelineDataset(history, options = {}) {
  const visibility = options.visibility || {};
  const observations = proposalHistoryChartObservations(history)
    .filter(point => Number.isFinite(proposalChartPointTime(point)))
    .sort((left, right) => proposalChartPointTime(left) - proposalChartPointTime(right));
  const timestamps = observations.map(point => proposalChartPointTime(point) / 1_000);
  const firstTime = timestamps[0];
  const lastTime = timestamps[timestamps.length - 1];
  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) return null;

  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Date.now() / 1_000;
  const timeOffset = nowSeconds - lastTime;
  const definitions = PROPOSAL_LIVELINE_SERIES.filter(
    definition => visibility[definition.field] !== false,
  );
  const series = definitions.map((definition) => {
    const data = observations.map((point) => {
      if (point?.[definition.field] == null || point[definition.field] === '') return null;
      const value = Number(point?.[definition.field]);
      if (!Number.isFinite(value) || value < 0) return null;
      return {
        time: proposalChartPointTime(point) / 1_000,
        value,
      };
    }).filter(Boolean);
    return {
      ...definition,
      data,
      value: data[data.length - 1]?.value,
    };
  }).filter(item => item.data.length >= 2 && Number.isFinite(item.value));
  const cadence = intervalSeconds(history?.interval);
  const fullDuration = Math.max(cadence * 2, lastTime - firstTime + cadence);
  const requestedRange = RANGE_SECONDS[options.range];
  const windowSeconds = Math.max(
    cadence * 2,
    Math.min(fullDuration, requestedRange || fullDuration) * WINDOW_BUFFER_RATIO,
  );
  return {
    observations,
    series,
    cadence,
    firstTime,
    lastTime,
    timeOffset,
    windowSeconds,
    gapRanges: proposalLivelineGapRanges(
      observations,
      series.map(definition => definition.field),
      history?.interval,
    ),
  };
}

function sourceViewport(dataset) {
  const visibleTo = dataset.viewportEnd ?? dataset.lastTime;
  return {
    from: visibleTo - dataset.windowSeconds * STABLE_CHART_DATA_PLOT_RATIO,
    to: visibleTo,
  };
}

export function proposalChartPanBounds(windowSeconds, fullDuration) {
  const window = Math.max(1, Number(windowSeconds) || 1);
  const duration = Math.max(0, Number(fullDuration) || 0);
  const futureWhitespace = Math.max(
    0,
    STABLE_CHART_DATA_PLOT_RATIO - PAN_EDGE_GUARD_RATIO,
  );
  const pastWhitespace = Math.max(
    0,
    STABLE_CHART_DATA_PLOT_RATIO - (1 - PAN_EDGE_GUARD_RATIO),
  );
  return Object.freeze({
    maximum: Math.max(0, duration - window * pastWhitespace),
    minimum: -window * futureWhitespace,
  });
}

export function proposalChartHorizontalZoomScale(startScale, factor) {
  const initial = Math.max(
    MIN_HORIZONTAL_ZOOM_SCALE,
    Math.min(MAX_HORIZONTAL_ZOOM_SCALE, Number(startScale) || 1),
  );
  return Math.max(
    MIN_HORIZONTAL_ZOOM_SCALE,
    Math.min(MAX_HORIZONTAL_ZOOM_SCALE, initial * (Number(factor) || 1)),
  );
}

export function proposalChartHorizontalScaleDrag(startScale, deltaX, chartWidth) {
  const width = Math.max(160, Number(chartWidth) || 160);
  const factor = Math.exp(
    -(Number(deltaX) || 0) / width * HORIZONTAL_SCALE_SENSITIVITY,
  );
  return proposalChartHorizontalZoomScale(startScale, factor);
}

export function proposalChartVerticalZoomScale(startScale, factor) {
  const initial = Math.max(
    MIN_VERTICAL_RANGE_SCALE,
    Math.min(MAX_VERTICAL_RANGE_SCALE, Number(startScale) || 1),
  );
  return Math.max(
    MIN_VERTICAL_RANGE_SCALE,
    Math.min(MAX_VERTICAL_RANGE_SCALE, initial * (Number(factor) || 1)),
  );
}

export function proposalChartVerticalScale(startScale, deltaY, chartHeight) {
  const height = Math.max(120, Number(chartHeight) || 120);
  const factor = Math.exp((Number(deltaY) || 0) / height * VERTICAL_SCALE_SENSITIVITY);
  return proposalChartVerticalZoomScale(startScale, factor);
}

function gapMaskElements(dataset, projection) {
  const visibleFrom = projection.sourceFrom;
  const visibleTo = projection.sourceRight;
  return dataset.gapRanges.map((gap, index) => {
    const from = Math.max(visibleFrom, gap.from);
    const to = Math.min(visibleTo, gap.to);
    if (to <= from) return null;
    const left = projection.toPlotRatio(from);
    const width = projection.toPlotRatio(to) - left;
    return createElement('span', {
      'aria-hidden': 'true',
      className: 'ft-liveline-gap-mask',
      'data-ft-chart-gap': '',
      key: `gap-${index}-${from}`,
      style: {
        left: plotPosition(left, PLOT_PADDING.left, PLOT_PADDING.right),
        width: plotSize(width, PLOT_PADDING.left, PLOT_PADDING.right),
      },
    });
  }).filter(Boolean);
}

function phaseBandElements(projection, preTwap, windowEndedAt) {
  const visibleFrom = projection.sourceFrom;
  const visibleTo = projection.sourceRight;
  const ranges = [
    {
      key: 'pre-twap',
      from: visibleFrom,
      to: new Date(preTwap || '').getTime() / 1_000,
    },
    {
      key: 'post-twap',
      from: new Date(windowEndedAt || '').getTime() / 1_000,
      to: visibleTo,
    },
  ];
  return ranges.map((range) => {
    const from = Math.max(visibleFrom, range.from);
    const to = Math.min(visibleTo, range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
    return createElement('span', {
      'aria-hidden': 'true',
      className: `ft-liveline-phase-band ft-liveline-phase-band-${range.key}`,
      'data-ft-chart-band': range.key,
      key: range.key,
      style: {
        left: plotPosition(
          projection.toPlotRatio(from),
          PLOT_PADDING.left,
          PLOT_PADDING.right,
        ),
        width: plotSize(
          projection.toPlotRatio(to) - projection.toPlotRatio(from),
          PLOT_PADDING.left,
          PLOT_PADDING.right,
        ),
      },
    });
  }).filter(Boolean);
}

function paddedValueRange(values, exaggerate = false) {
  if (!values.length) return null;
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  const rawRange = maximum - minimum;
  const minimumRange = rawRange * (exaggerate ? 0.02 : 0.1)
    || (exaggerate ? 0.04 : 0.4);
  if (rawRange < minimumRange) {
    const middle = (minimum + maximum) / 2;
    minimum = middle - minimumRange / 2;
    maximum = middle + minimumRange / 2;
  } else {
    const padding = rawRange * (
      exaggerate ? EXAGGERATED_RANGE_MARGIN : DEFAULT_RANGE_MARGIN
    );
    minimum -= padding;
    maximum += padding;
  }
  return { minimum, maximum };
}

function proposalValueRangeModel(series, projection, scale = 1) {
  const visibleFrom = projection.sourceFrom;
  const visibleTo = projection.sourceTo;
  const valuesBySeries = series.map((definition) => (
    definition.data
      .filter(point => point.time >= visibleFrom && point.time <= visibleTo)
      .map(point => point.value)
      .filter(Number.isFinite)
  )).filter(values => values.length);
  const allValues = valuesBySeries.flat();
  if (!allValues.length) {
    return {
      boundMaximum: null,
      boundMinimum: null,
      exaggerate: false,
      maximum: 1,
      minimum: 0,
    };
  }
  const normalizedScale = Math.max(
    MIN_VERTICAL_RANGE_SCALE,
    Math.min(MAX_VERTICAL_RANGE_SCALE, Number(scale) || 1),
  );
  const exaggerate = normalizedScale < 1;
  const ranges = valuesBySeries
    .map(values => paddedValueRange(values, exaggerate))
    .filter(Boolean);
  let boundMinimum = null;
  let boundMaximum = null;
  if (Math.abs(normalizedScale - 1) > 0.001) {
    const rawMinimum = Math.min(...allValues);
    const rawMaximum = Math.max(...allValues);
    const center = (rawMinimum + rawMaximum) / 2;
    const rawRange = Math.max(
      Number.EPSILON,
      rawMaximum - rawMinimum,
    );
    const boundMultiplier = exaggerate
      ? normalizedScale
        * (1 + DEFAULT_RANGE_MARGIN * 2)
        / (1 + EXAGGERATED_RANGE_MARGIN * 2)
      : normalizedScale;
    boundMinimum = center - rawRange * boundMultiplier / 2;
    boundMaximum = center + rawRange * boundMultiplier / 2;
    ranges.push(paddedValueRange([boundMinimum, boundMaximum], exaggerate));
  }
  return {
    boundMaximum,
    boundMinimum,
    exaggerate,
    maximum: Math.max(...ranges.map(range => range.maximum)),
    minimum: Math.min(...ranges.map(range => range.minimum)),
  };
}

function pointY(value, range) {
  const valueRange = Math.max(Number.EPSILON, range.maximum - range.minimum);
  return (range.maximum - value) / valueRange;
}

function startPointElements(series, projection, range) {
  const visibleFrom = projection.sourceFrom;
  const visibleTo = projection.sourceTo;
  const originSeries = series.find(definition => (
    definition.id === CHART_ORIGIN_PRESENTATION.primarySeriesId
    && definition.data[0]
  )) || series.find(definition => definition.data[0]);
  const first = originSeries?.data[0];
  if (!first) return [];
  const visible = first.time >= visibleFrom && first.time <= visibleTo;
  const x = projection.toPlotRatio(first.time);
  const y = pointY(first.value, range);
  return [createElement('span', {
    'aria-hidden': 'true',
    className: 'ft-liveline-start-point ft-liveline-origin-point',
    'data-ft-chart-origin': 'tge',
    key: 'chart-origin',
    style: {
      left: plotPosition(x, PLOT_PADDING.left, PLOT_PADDING.right),
      top: plotPosition(y, PLOT_PADDING.top, PLOT_PADDING.bottom),
      visibility: visible ? 'visible' : 'hidden',
    },
  })];
}

export function proposalChartEndpointModel(series, projection, range) {
  return series.map((definition) => {
    const final = definition.data[definition.data.length - 1];
    if (!final) return null;
    return Object.freeze({
      color: definition.color,
      id: definition.id,
      sourceTime: final.time,
      visible: final.time >= projection.sourceFrom
        && final.time <= projection.sourceTo,
      x: projection.toPlotRatio(final.time),
      y: pointY(final.value, range),
    });
  }).filter(Boolean);
}

function endPointElements(series, projection, range) {
  return proposalChartEndpointModel(series, projection, range).map((marker) => {
    return createElement('span', {
      'aria-hidden': 'true',
      className: 'ft-liveline-end-point',
      'data-ft-chart-end': marker.id,
      key: `end-${marker.id}`,
      style: {
        '--ft-liveline-point-color': marker.color,
        left: plotPosition(
          marker.x,
          PLOT_PADDING.left,
          PLOT_PADDING.right,
        ),
        top: plotPosition(
          marker.y,
          PLOT_PADDING.top,
          PLOT_PADDING.bottom,
        ),
        visibility: marker.visible ? 'visible' : 'hidden',
      },
    });
  });
}

function syntheticTipMaskElements(series, projection, range) {
  const tipX = projection.toPlotRatio(projection.sourceTo);
  return series.map((definition) => {
    const visible = definition.data.filter(point => (
      point.time >= projection.sourceFrom
      && point.time <= projection.sourceTo
    ));
    if (visible.length < 2) return null;
    const tail = visible[visible.length - 1];
    return createElement('span', {
      'aria-hidden': 'true',
      className: 'ft-liveline-synthetic-tip-mask',
      key: `tip-mask-${definition.id}`,
      style: {
        left: plotPosition(tipX, PLOT_PADDING.left, PLOT_PADDING.right),
        top: plotPosition(
          pointY(tail.value, range),
          PLOT_PADDING.top,
          PLOT_PADDING.bottom,
        ),
      },
    });
  }).filter(Boolean);
}

function endGapElements(series, projection) {
  const endSeries = series.find(definition => (
    definition.id === CHART_ORIGIN_PRESENTATION.primarySeriesId
    && definition.data.length
  )) || series.find(definition => definition.data.length);
  const final = endSeries?.data[endSeries.data.length - 1];
  const maskFrom = final
    && final.time >= projection.sourceFrom
    && final.time <= projection.sourceTo
    ? final.time
    : projection.sourceTo;
  const left = projection.toPlotRatio(maskFrom);
  const right = projection.toPlotRatio(projection.sourceRight);
  if (right <= left) return [];
  return [createElement('span', {
    'aria-hidden': 'true',
    className: 'ft-liveline-end-gap-mask',
    'data-ft-chart-end-gap': '',
    key: 'end-gap',
    style: {
      left: plotPosition(left, PLOT_PADDING.left, PLOT_PADDING.right),
      width: plotSize(right - left, PLOT_PADDING.left, PLOT_PADDING.right),
    },
  })];
}

function nearestObservation(observations, sourceTime) {
  if (!observations.length || !Number.isFinite(sourceTime)) return null;
  let low = 0;
  let high = observations.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (proposalChartPointTime(observations[middle]) / 1_000 < sourceTime) low = middle + 1;
    else high = middle;
  }
  const right = observations[low];
  const left = observations[Math.max(0, low - 1)];
  const leftTime = proposalChartPointTime(left) / 1_000;
  const rightTime = proposalChartPointTime(right) / 1_000;
  return Math.abs(leftTime - sourceTime) <= Math.abs(rightTime - sourceTime)
    ? left
    : right;
}

function updateSpotChange(target, value) {
  if (!target) return;
  target.classList.remove('ft-is-positive', 'ft-is-negative', 'ft-is-flat');
  target.textContent = Number.isFinite(value)
    ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
    : '—';
  if (!Number.isFinite(value)) return;
  target.classList.add(value > 0
    ? 'ft-is-positive'
    : value < 0
      ? 'ft-is-negative'
      : 'ft-is-flat');
}

/**
 * Default decision-market chart adapter. Liveline owns rendering while the
 * Trivium's proposal-history model continues to own timestamps, nulls, and gaps.
 */
export function createProposalHistoryChart(options = {}) {
  const {
    runtime,
    themeRoot,
    container,
    history,
    isLive = false,
  } = options;
  if (!runtime || !container || !Array.isArray(history?.series) || !history.series.length) {
    return null;
  }

  let currentTheme = options.theme === 'light' ? 'light' : 'dark';
  let currentRange = options.range || 'all';
  let visibility = { ...(options.visibility || {}) };
  let currentHistory = {
    ...history,
    series: history.series.map(point => ({ ...point })),
  };
  let zoomScale = 1;
  let panOffsetSeconds = 0;
  let root = null;
  let drag = null;
  let axisDrag = null;
  let timeAxisDrag = null;
  const pointers = new Map();
  let pinch = null;
  let interactionActive = false;
  let interactionTimer = 0;
  let interactionRenderFrame = 0;
  let kineticPanFrame = 0;
  let boundPointRevealTimer = 0;
  let lastPrepared = null;
  let lastProjection = null;
  let verticalRangeScale = 1;
  let destroyed = false;
  const chartRoot = container.closest('.ft-hourly-chart') || container;
  const readout = {
    time: chartRoot.querySelector('[data-ft-role="hourly-readout-time"]'),
    values: new Map(PROPOSAL_LIVELINE_SERIES.map(definition => [
      definition.field,
      chartRoot.querySelector(`[data-ft-readout-value="${definition.field}"]`),
    ])),
    spotChanges: new Map(['passPrice', 'failPrice'].map(field => [
      field,
      chartRoot.querySelector(`[data-ft-readout-spot-change="${field}"]`),
    ])),
  };

  function dataset() {
    const prepared = proposalLivelineDataset(currentHistory, {
      range: currentRange,
      visibility,
    });
    if (prepared) {
      prepared.windowSeconds *= zoomScale;
      const fullDuration = Math.max(0, prepared.lastTime - prepared.firstTime);
      const panBounds = proposalChartPanBounds(prepared.windowSeconds, fullDuration);
      panOffsetSeconds = Math.max(
        panBounds.minimum,
        Math.min(panBounds.maximum, panOffsetSeconds),
      );
      prepared.viewportEnd = prepared.lastTime - panOffsetSeconds;
    }
    return prepared;
  }

  const initialDataset = dataset();
  if (!initialDataset?.series?.length) {
    container.dataset.ftChartEngine = PROPOSAL_HISTORY_ENGINE;
    return null;
  }

  root = createRoot(container);
  container.dataset.ftChartEngine = PROPOSAL_HISTORY_ENGINE;
  container.classList.remove('has-liveline-bound-points');

  function plotWidth() {
    return Math.max(1, container.clientWidth - PLOT_PADDING.left - PLOT_PADDING.right);
  }

  function plotHeight() {
    return Math.max(1, container.clientHeight - PLOT_PADDING.top - PLOT_PADDING.bottom);
  }

  function frameNow() {
    const value = runtime.performance?.now?.();
    return Number.isFinite(value) ? value : Date.now();
  }

  function requestFrame(callback) {
    if (typeof runtime.requestAnimationFrame === 'function') {
      return runtime.requestAnimationFrame(callback);
    }
    return runtime.setTimeout(() => callback(frameNow()), 16);
  }

  function cancelFrame(handle) {
    if (!handle) return;
    if (typeof runtime.cancelAnimationFrame === 'function') {
      runtime.cancelAnimationFrame(handle);
      return;
    }
    runtime.clearTimeout(handle);
  }

  function scheduleRender() {
    if (destroyed || interactionRenderFrame) return;
    interactionRenderFrame = requestFrame(() => {
      interactionRenderFrame = 0;
      render();
    });
  }

  function stopKineticPan() {
    if (!kineticPanFrame) return;
    cancelFrame(kineticPanFrame);
    kineticPanFrame = 0;
  }

  function isValueAxisPointer(event) {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return x >= container.clientWidth - PLOT_PADDING.right
      && x <= container.clientWidth
      && y >= PLOT_PADDING.top
      && y <= container.clientHeight - PLOT_PADDING.bottom;
  }

  function isTimeAxisPointer(event) {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return x >= PLOT_PADDING.left
      && x <= container.clientWidth - PLOT_PADDING.right
      && y >= container.clientHeight - PLOT_PADDING.bottom
      && y <= container.clientHeight;
  }

  function updateReadoutAt(sourceTime) {
    const observation = nearestObservation(lastPrepared?.observations || [], sourceTime);
    const observationMilliseconds = proposalChartPointTime(observation);
    const observationTime = Number.isFinite(observationMilliseconds)
      ? observationMilliseconds / 1_000
      : NaN;
    if (readout.time) readout.time.textContent = Number.isFinite(observationTime)
      ? formatUtcTime(observationTime)
      : '—';
    PROPOSAL_LIVELINE_SERIES.forEach((definition) => {
      const target = readout.values.get(definition.field);
      if (!target) return;
      const rawValue = observation?.[definition.field];
      const value = rawValue == null || rawValue === '' ? NaN : Number(rawValue);
      target.textContent = Number.isFinite(value) && value >= 0 ? formatPrice(value) : '—';
    });
    const underlying = observation?.underlyingPrice;
    ['passPrice', 'failPrice'].forEach((field) => {
      updateSpotChange(
        readout.spotChanges.get(field),
        proposalConditionalSpotChangePct(observation?.[field], underlying),
      );
    });
  }

  function clearOwnedCrosshair({ resetReadout = true } = {}) {
    container.classList.remove('has-liveline-crosshair');
    if (resetReadout && lastProjection) updateReadoutAt(lastProjection.sourceTo);
  }

  function showOwnedCrosshair(event) {
    if (!lastProjection || event.pointerType === 'touch') return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (
      x < PLOT_PADDING.left
      || x > container.clientWidth - PLOT_PADDING.right
      || y < PLOT_PADDING.top
      || y > container.clientHeight - PLOT_PADDING.bottom
    ) {
      clearOwnedCrosshair();
      return;
    }
    const ratio = (x - PLOT_PADDING.left) / plotWidth();
    container.style.setProperty('--ft-liveline-crosshair-x', `${x}px`);
    container.classList.add('has-liveline-crosshair');
    updateReadoutAt(lastProjection.sourceTimeAtPlotRatio(ratio));
  }

  function beginInteraction() {
    stopKineticPan();
    if (interactionTimer) {
      runtime.clearTimeout(interactionTimer);
      interactionTimer = 0;
    }
    clearOwnedCrosshair();
    if (!interactionActive) {
      interactionActive = true;
      return true;
    }
    return false;
  }

  function endInteraction(delay = 32) {
    if (interactionTimer) runtime.clearTimeout(interactionTimer);
    interactionTimer = runtime.setTimeout(() => {
      interactionTimer = 0;
      interactionActive = false;
      render();
    }, delay);
  }

  function renderStaticChange() {
    beginInteraction();
    render();
    endInteraction(180);
  }

  function render() {
    if (destroyed) return;
    const prepared = dataset();
    if (!prepared?.series?.length) return;
    const viewport = sourceViewport(prepared);
    const projection = stableChartViewportProjection(viewport, {
      nowSeconds: prepared.lastTime + prepared.timeOffset,
    });
    lastPrepared = prepared;
    lastProjection = projection;
    const playback = proposalLivelinePlaybackOptions(
      isLive && panOffsetSeconds === 0,
    );
    const series = prepared.series.map((definition) => {
      const sourceData = definition.data;
      const visibleData = sourceData.filter(point => (
        point.time >= viewport.from && point.time <= viewport.to
      ));
      return {
        id: definition.id,
        data: sourceData,
        value: visibleData[visibleData.length - 1]?.value
          ?? sourceData[0]?.value,
        color: cssColor(
          runtime,
          themeRoot,
          definition.colorVariable,
          definition.fallbackColor,
        ),
        // Keep semantic labels in the renderer-neutral model. The external
        // readout owns hover values so it never fades at the live edge.
        label: definition.label,
      };
    }).filter(definition => (
      definition.data.length >= 2 && Number.isFinite(definition.value)
    ));
    const rangeModel = proposalValueRangeModel(
      series,
      projection,
      verticalRangeScale,
    );
    const rendererSeries = series.map(({ label: _label, ...definition }) => ({
      ...definition,
      data: definition.data.map(point => ({
        ...point,
        time: projection.toRenderTime(point.time),
      })),
    }));
    if (
      Number.isFinite(rangeModel.boundMinimum)
      && Number.isFinite(rangeModel.boundMaximum)
    ) {
      rendererSeries.push({
        color: 'rgba(0, 0, 0, 0)',
        data: [
          {
            time: projection.toRenderTime(projection.sourceFrom),
            value: rangeModel.boundMinimum,
          },
          {
            time: projection.toRenderTime(projection.sourceTo),
            value: rangeModel.boundMaximum,
          },
        ],
        id: '__vertical-range',
        value: rangeModel.boundMaximum,
      });
    }
    root.render(createElement(
      'div',
      {
        className: 'ft-liveline-root',
        'data-ft-role': 'proposal-history-liveline',
      },
      createElement(Liveline, {
        key: 'proposal-liveline-chart',
        badge: false,
        className: 'ft-liveline-canvas',
        data: [],
        emptyText: 'No indexed market history',
        exaggerate: rangeModel.exaggerate,
        fill: false,
        formatTime: value => formatUtcTime(projection.toSourceTime(value)),
        formatValue: formatPrice,
        grid: true,
        lerpSpeed: interactionActive ? INTERACTION_LERP_SPEED : playback.lerpSpeed,
        momentum: false,
        padding: PLOT_PADDING,
        paused: playback.paused && !interactionActive,
        pulse: false,
        scrub: false,
        series: rendererSeries,
        seriesToggleCompact: true,
        theme: currentTheme,
        value: 0,
        window: projection.renderWindowSeconds,
      }),
      ...phaseBandElements(
        projection,
        currentHistory.preTwap,
        options.windowEndedAt,
      ),
      ...gapMaskElements(prepared, projection),
      ...endGapElements(series, projection),
      ...syntheticTipMaskElements(series, projection, rangeModel),
      ...startPointElements(series, projection, rangeModel),
      ...endPointElements(series, projection, rangeModel),
    ));
    updateReadoutAt(projection.sourceTo);
  }

  render();
  boundPointRevealTimer = runtime.setTimeout(() => {
    boundPointRevealTimer = 0;
    container.classList.add('has-liveline-bound-points');
  }, BOUND_POINT_REVEAL_DELAY_MS);
  function zoomBy(
    factor,
    plotRatio = 0.5,
  ) {
    const prepared = dataset();
    if (!prepared) return;
    const viewport = sourceViewport(prepared);
    const projection = stableChartViewportProjection(viewport, {
      nowSeconds: prepared.lastTime + prepared.timeOffset,
    });
    const nextZoomScale = proposalChartHorizontalZoomScale(zoomScale, factor);
    const appliedFactor = nextZoomScale / zoomScale;
    if (Math.abs(appliedFactor - 1) < Number.EPSILON) return;
    const anchor = projection.sourceTimeAtPlotRatio(plotRatio, {
      clampToData: false,
    });
    const nextViewportEnd = anchor + (viewport.to - anchor) * appliedFactor;
    zoomScale = nextZoomScale;
    panOffsetSeconds = prepared.lastTime - nextViewportEnd;
    scheduleRender();
  }

  function startKineticPan(initialVelocity) {
    const prepared = dataset();
    if (
      !prepared
      || !Number.isFinite(initialVelocity)
      || runtime.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) return false;
    const secondsPerPixel = prepared.windowSeconds / plotWidth();
    const minimumVelocity = secondsPerPixel * KINETIC_PAN_MIN_PIXELS_PER_MILLISECOND;
    if (Math.abs(initialVelocity) < minimumVelocity) return false;
    const maximumVelocity = prepared.windowSeconds
      * KINETIC_PAN_MAX_SCREENS_PER_SECOND
      / 1_000;
    let velocity = Math.max(
      -maximumVelocity,
      Math.min(maximumVelocity, initialVelocity),
    );
    let previousFrame = frameNow();
    if (interactionRenderFrame) {
      cancelFrame(interactionRenderFrame);
      interactionRenderFrame = 0;
    }

    function advance(timestamp) {
      kineticPanFrame = 0;
      if (destroyed || pointers.size) return;
      const elapsed = Math.max(1, Math.min(32, timestamp - previousFrame));
      const requestedOffset = panOffsetSeconds + velocity * elapsed;
      panOffsetSeconds = requestedOffset;
      render();
      const hitBoundary = Math.abs(panOffsetSeconds - requestedOffset)
        > Math.max(1e-6, prepared.windowSeconds * 1e-8);
      velocity *= Math.pow(KINETIC_PAN_DECAY, elapsed / (1_000 / 60));
      if (hitBoundary || Math.abs(velocity) < minimumVelocity) {
        endInteraction(90);
        return;
      }
      previousFrame = timestamp;
      kineticPanFrame = requestFrame(advance);
    }

    kineticPanFrame = requestFrame(advance);
    return true;
  }

  function onWheel(event) {
    event.preventDefault();
    beginInteraction();
    const wheelOptions = {
      deltaMode: event.deltaMode,
      viewportHeight: container.clientHeight,
    };
    if (isValueAxisPointer(event)) {
      verticalRangeScale = proposalChartVerticalZoomScale(
        verticalRangeScale,
        chartWheelZoomFactor(event.deltaY || event.deltaX, wheelOptions),
      );
      scheduleRender();
      endInteraction(120);
      return;
    }
    if (
      !isTimeAxisPointer(event)
      && Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ) {
      const prepared = dataset();
      if (prepared) {
        const pixels = chartWheelDeltaPixels(event.deltaX, wheelOptions);
        panOffsetSeconds -= pixels / plotWidth() * prepared.windowSeconds;
        scheduleRender();
      }
      endInteraction(90);
      return;
    }
    const rect = container.getBoundingClientRect();
    const plotRatio = Math.max(0, Math.min(
      1,
      (event.clientX - rect.left - PLOT_PADDING.left) / plotWidth(),
    ));
    zoomBy(
      chartWheelZoomFactor(event.deltaY || event.deltaX, wheelOptions),
      plotRatio,
    );
    endInteraction(120);
  }

  function onPointerDown(event) {
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    container.setPointerCapture?.(event.pointerId);
    beginInteraction();
    if (
      event.button === 0
      && event.pointerType !== 'touch'
      && isValueAxisPointer(event)
    ) {
      axisDrag = {
        pointerId: event.pointerId,
        startScale: verticalRangeScale,
        startY: event.clientY,
      };
      drag = null;
      timeAxisDrag = null;
      pinch = null;
      container.classList.add('is-scaling-y');
      return;
    }
    if (
      event.pointerType !== 'touch'
      && isTimeAxisPointer(event)
    ) {
      const prepared = dataset();
      const viewport = prepared ? sourceViewport(prepared) : null;
      const projection = prepared && viewport
        ? stableChartViewportProjection(viewport, {
          nowSeconds: prepared.lastTime + prepared.timeOffset,
        })
        : null;
      const rect = container.getBoundingClientRect();
      const plotRatio = Math.max(0, Math.min(
        1,
        (event.clientX - rect.left - PLOT_PADDING.left) / plotWidth(),
      ));
      timeAxisDrag = {
        anchor: projection?.sourceTimeAtPlotRatio(plotRatio, {
          clampToData: false,
        }),
        lastTime: prepared?.lastTime,
        pointerId: event.pointerId,
        startScale: zoomScale,
        startX: event.clientX,
        viewportEnd: viewport?.to,
      };
      axisDrag = null;
      drag = null;
      pinch = null;
      container.classList.add('is-scaling-x');
      return;
    }
    if (pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      const prepared = dataset();
      const viewport = prepared ? sourceViewport(prepared) : null;
      const projection = prepared && viewport
        ? stableChartViewportProjection(viewport, {
          nowSeconds: prepared.lastTime + prepared.timeOffset,
        })
        : null;
      const rect = container.getBoundingClientRect();
      const plotRatio = Math.max(0, Math.min(
        1,
        ((first.x + second.x) / 2 - rect.left - PLOT_PADDING.left) / plotWidth(),
      ));
      pinch = {
        anchor: projection?.sourceTimeAtPlotRatio(plotRatio, {
          clampToData: false,
        }),
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        lastTime: prepared?.lastTime,
        viewportEnd: viewport?.to,
        zoomScale,
      };
      drag = null;
      container.classList.remove('is-panning');
      return;
    }
    const now = frameNow();
    drag = {
      panOffsetSeconds,
      lastOffset: panOffsetSeconds,
      lastTime: now,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      velocity: 0,
    };
    container.classList.add('is-panning');
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) {
      const valueAxisHover = event.pointerType !== 'touch' && isValueAxisPointer(event);
      const timeAxisHover = event.pointerType !== 'touch'
        && !valueAxisHover
        && isTimeAxisPointer(event);
      container.classList.toggle('is-y-axis-hover', valueAxisHover);
      container.classList.toggle('is-x-axis-hover', timeAxisHover);
      if (valueAxisHover || timeAxisHover) {
        clearOwnedCrosshair();
        return;
      }
      showOwnedCrosshair(event);
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (axisDrag?.pointerId === event.pointerId) {
      verticalRangeScale = proposalChartVerticalScale(
        axisDrag.startScale,
        event.clientY - axisDrag.startY,
        plotHeight(),
      );
      event.preventDefault();
      scheduleRender();
      return;
    }
    if (timeAxisDrag?.pointerId === event.pointerId) {
      const nextZoomScale = proposalChartHorizontalScaleDrag(
        timeAxisDrag.startScale,
        event.clientX - timeAxisDrag.startX,
        plotWidth(),
      );
      const appliedFactor = nextZoomScale / timeAxisDrag.startScale;
      zoomScale = nextZoomScale;
      if (
        Number.isFinite(timeAxisDrag.anchor)
        && Number.isFinite(timeAxisDrag.viewportEnd)
        && Number.isFinite(timeAxisDrag.lastTime)
      ) {
        const nextViewportEnd = timeAxisDrag.anchor
          + (timeAxisDrag.viewportEnd - timeAxisDrag.anchor) * appliedFactor;
        panOffsetSeconds = timeAxisDrag.lastTime - nextViewportEnd;
      }
      event.preventDefault();
      scheduleRender();
      return;
    }
    if (pinch && pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const nextZoomScale = proposalChartHorizontalZoomScale(
        pinch.zoomScale,
        pinch.distance / distance,
      );
      const appliedFactor = nextZoomScale / pinch.zoomScale;
      zoomScale = nextZoomScale;
      if (
        Number.isFinite(pinch.anchor)
        && Number.isFinite(pinch.viewportEnd)
        && Number.isFinite(pinch.lastTime)
      ) {
        const nextViewportEnd = pinch.anchor
          + (pinch.viewportEnd - pinch.anchor) * appliedFactor;
        panOffsetSeconds = pinch.lastTime - nextViewportEnd;
      }
      event.preventDefault();
      scheduleRender();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const prepared = dataset();
    if (!prepared) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) < 3) return;
    const nextOffset = drag.panOffsetSeconds
      + (delta / plotWidth()) * prepared.windowSeconds;
    const now = frameNow();
    const elapsed = Math.max(1, now - drag.lastTime);
    const velocity = (nextOffset - drag.lastOffset) / elapsed;
    drag.velocity = drag.moved
      ? drag.velocity * 0.65 + velocity * 0.35
      : velocity;
    drag.lastOffset = nextOffset;
    drag.lastTime = now;
    drag.moved = true;
    panOffsetSeconds = nextOffset;
    event.preventDefault();
    scheduleRender();
  }

  function onPointerUp(event) {
    const releasedDrag = drag?.pointerId === event.pointerId ? drag : null;
    pointers.delete(event.pointerId);
    container.releasePointerCapture?.(event.pointerId);
    if (releasedDrag) {
      drag = null;
      container.classList.remove('is-panning');
    }
    if (axisDrag?.pointerId === event.pointerId) {
      axisDrag = null;
      container.classList.remove('is-scaling-y');
    }
    if (timeAxisDrag?.pointerId === event.pointerId) {
      timeAxisDrag = null;
      container.classList.remove('is-scaling-x');
    }
    if (pointers.size < 2) pinch = null;
    const kinetic = !pointers.size
      && event.type !== 'pointercancel'
      && releasedDrag?.moved
      && startKineticPan(releasedDrag.velocity);
    if (!pointers.size && !kinetic) endInteraction(120);
  }

  function onPointerLeave() {
    if (!pointers.size) {
      container.classList.remove('is-y-axis-hover');
      container.classList.remove('is-x-axis-hover');
      clearOwnedCrosshair();
    }
  }

  function onDoubleClick(event) {
    if (isValueAxisPointer(event)) {
      verticalRangeScale = 1;
    } else if (isTimeAxisPointer(event)) {
      zoomScale = 1;
      panOffsetSeconds = 0;
    } else {
      return;
    }
    event.preventDefault();
    renderStaticChange();
  }

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
  container.addEventListener('pointerleave', onPointerLeave);
  container.addEventListener('dblclick', onDoubleClick);
  chartRoot.classList.remove('ft-hourly-chart-pending');
  chartRoot.classList.add('ft-hourly-chart-enhanced', 'ft-hourly-chart-liveline');
  chartRoot.dataset.ftChartState = 'ready';
  chartRoot.setAttribute('aria-busy', 'false');

  return {
    applyTheme(nextTheme) {
      currentTheme = nextTheme === 'light' ? 'light' : 'dark';
      renderStaticChange();
    },
    resetView() {
      currentRange = options.range || 'all';
      zoomScale = 1;
      panOffsetSeconds = 0;
      verticalRangeScale = 1;
      renderStaticChange();
    },
    setRange(nextRange) {
      currentRange = RANGE_SECONDS[nextRange] ? nextRange : 'all';
      zoomScale = 1;
      panOffsetSeconds = 0;
      verticalRangeScale = 1;
      renderStaticChange();
    },
    setSeriesVisible(field, visible) {
      visibility = { ...visibility, [field]: visible !== false };
      renderStaticChange();
    },
    updateLivePoint(point) {
      if (!isLive || !point || typeof point !== 'object') return false;
      const observedAt = point.timestamp || point.observedAt || point.asOf;
      const time = new Date(observedAt || Date.now()).getTime();
      if (!Number.isFinite(time)) return false;
      currentHistory.series.push({
        ...point,
        chartTimestamp: new Date(time).toISOString(),
      });
      if (currentHistory.series.length > 1_200) {
        currentHistory.series.splice(0, currentHistory.series.length - 1_200);
      }
      render();
      return true;
    },
    zoomIn() {
      beginInteraction();
      zoomBy(0.86);
      endInteraction(120);
    },
    zoomOut() {
      beginInteraction();
      zoomBy(1.16);
      endInteraction(120);
    },
    resize() {
      render();
    },
    destroy() {
      destroyed = true;
      if (interactionTimer) runtime.clearTimeout(interactionTimer);
      if (interactionRenderFrame) cancelFrame(interactionRenderFrame);
      stopKineticPan();
      if (boundPointRevealTimer) runtime.clearTimeout(boundPointRevealTimer);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('dblclick', onDoubleClick);
      container.classList.remove(
        'has-liveline-bound-points',
        'is-panning',
        'is-scaling-x',
        'is-scaling-y',
        'is-x-axis-hover',
        'is-y-axis-hover',
      );
      root?.unmount();
      delete container.dataset.ftChartEngine;
      chartRoot.classList.remove('ft-hourly-chart-enhanced', 'ft-hourly-chart-liveline');
    },
  };
}
