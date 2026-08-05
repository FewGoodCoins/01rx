import { Liveline } from 'liveline';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
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
const INTERACTION_LERP_SPEED = 0.8;
const PLOT_TOP_PADDING = 54;
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

function paddedValueRange(values) {
  if (!values.length) return null;
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  const rawRange = maximum - minimum;
  const minimumRange = rawRange * 0.1 || 0.4;
  if (rawRange < minimumRange) {
    const middle = (minimum + maximum) / 2;
    minimum = middle - minimumRange / 2;
    maximum = middle + minimumRange / 2;
  } else {
    const padding = rawRange * 0.12;
    minimum -= padding;
    maximum += padding;
  }
  return { minimum, maximum };
}

function startPointElements(series, projection) {
  const visibleFrom = projection.sourceFrom;
  const visibleTo = projection.sourceTo;
  const ranges = series.map((definition) => {
    const values = definition.data
      .filter(point => point.time >= visibleFrom && point.time <= visibleTo)
      .map(point => point.value)
      .filter(Number.isFinite);
    return paddedValueRange(values);
  }).filter(Boolean);
  if (!ranges.length) return [];
  const minimum = Math.min(...ranges.map(range => range.minimum));
  const maximum = Math.max(...ranges.map(range => range.maximum));
  const valueRange = Math.max(Number.EPSILON, maximum - minimum);
  return series.map((definition) => {
    const first = definition.data[0];
    if (!first || first.time < visibleFrom || first.time > visibleTo) return null;
    const x = projection.toPlotRatio(first.time);
    const y = (maximum - first.value) / valueRange;
    return createElement('span', {
      'aria-hidden': 'true',
      className: 'ft-liveline-start-point',
      key: `start-${definition.id}`,
      style: {
        '--ft-liveline-point-color': definition.color,
        left: plotPosition(x, PLOT_PADDING.left, PLOT_PADDING.right),
        top: plotPosition(y, PLOT_PADDING.top, PLOT_PADDING.bottom),
      },
    });
  }).filter(Boolean);
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
  const pointers = new Map();
  let pinch = null;
  let interactionActive = false;
  let interactionTimer = 0;
  let lastPrepared = null;
  let lastProjection = null;
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
      const fullDuration = Math.max(
        prepared.windowSeconds,
        prepared.lastTime - prepared.firstTime,
      );
      const maximumPan = Math.max(0, fullDuration - prepared.windowSeconds * 0.35);
      panOffsetSeconds = Math.max(0, Math.min(maximumPan, panOffsetSeconds));
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

  function plotWidth() {
    return Math.max(1, container.clientWidth - PLOT_PADDING.left - PLOT_PADDING.right);
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
    if (interactionTimer) {
      runtime.clearTimeout(interactionTimer);
      interactionTimer = 0;
    }
    clearOwnedCrosshair();
    if (!interactionActive) {
      interactionActive = true;
      render();
    }
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
    render();
  }

  function render() {
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
      const sourceData = definition.data.filter(point => point.time <= viewport.to);
      return {
        id: definition.id,
        data: sourceData,
        value: sourceData[sourceData.length - 1]?.value,
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
    const rendererSeries = series.map(({ label: _label, ...definition }) => ({
      ...definition,
      data: definition.data.map(point => ({
        ...point,
        time: projection.toRenderTime(point.time),
      })),
    }));
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
        fill: false,
        formatTime: value => formatUtcTime(projection.toSourceTime(value)),
        formatValue: formatPrice,
        grid: true,
        lerpSpeed: interactionActive ? INTERACTION_LERP_SPEED : playback.lerpSpeed,
        momentum: false,
        padding: PLOT_PADDING,
        paused: playback.paused && !interactionActive,
        pulse: playback.pulse,
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
      ...startPointElements(series, projection),
    ));
    updateReadoutAt(projection.sourceTo);
  }

  render();
  function zoomBy(
    factor,
    plotRatio = lastProjection?.dataPlotRatio ?? STABLE_CHART_DATA_PLOT_RATIO,
  ) {
    const prepared = dataset();
    if (!prepared) return;
    const viewport = sourceViewport(prepared);
    const projection = stableChartViewportProjection(viewport, {
      nowSeconds: prepared.lastTime + prepared.timeOffset,
    });
    const nextZoomScale = Math.max(0.15, Math.min(4, zoomScale * factor));
    const appliedFactor = nextZoomScale / zoomScale;
    if (Math.abs(appliedFactor - 1) < Number.EPSILON) return;
    const anchor = projection.sourceTimeAtPlotRatio(plotRatio);
    const nextViewportEnd = anchor + (viewport.to - anchor) * appliedFactor;
    zoomScale = nextZoomScale;
    panOffsetSeconds = prepared.lastTime - nextViewportEnd;
    render();
  }

  function onWheel(event) {
    event.preventDefault();
    beginInteraction();
    const rect = container.getBoundingClientRect();
    const plotRatio = Math.max(0, Math.min(
      1,
      (event.clientX - rect.left - PLOT_PADDING.left) / plotWidth(),
    ));
    zoomBy(chartWheelZoomFactor(event.deltaY, {
      deltaMode: event.deltaMode,
      viewportHeight: container.clientHeight,
    }), plotRatio);
    endInteraction(140);
  }

  function onPointerDown(event) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    container.setPointerCapture?.(event.pointerId);
    beginInteraction();
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
        anchor: projection?.sourceTimeAtPlotRatio(plotRatio),
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        lastTime: prepared?.lastTime,
        viewportEnd: viewport?.to,
        zoomScale,
      };
      drag = null;
      return;
    }
    if (event.button !== 0) return;
    drag = {
      panOffsetSeconds,
      pointerId: event.pointerId,
      startX: event.clientX,
    };
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) {
      showOwnedCrosshair(event);
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const nextZoomScale = Math.max(
        0.15,
        Math.min(4, pinch.zoomScale * (pinch.distance / distance)),
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
      render();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const prepared = dataset();
    if (!prepared) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) < 3) return;
    panOffsetSeconds = drag.panOffsetSeconds
      + (delta / plotWidth()) * prepared.windowSeconds;
    event.preventDefault();
    render();
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    container.releasePointerCapture?.(event.pointerId);
    if (drag?.pointerId === event.pointerId) drag = null;
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) endInteraction();
  }

  function onPointerLeave() {
    if (!pointers.size) clearOwnedCrosshair();
  }

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
  container.addEventListener('pointerleave', onPointerLeave);
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
      renderStaticChange();
    },
    setRange(nextRange) {
      currentRange = RANGE_SECONDS[nextRange] ? nextRange : 'all';
      zoomScale = 1;
      panOffsetSeconds = 0;
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
      zoomBy(0.82);
      endInteraction(140);
    },
    zoomOut() {
      beginInteraction();
      zoomBy(1.18);
      endInteraction(140);
    },
    resize() {
      render();
    },
    destroy() {
      if (interactionTimer) runtime.clearTimeout(interactionTimer);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('pointerleave', onPointerLeave);
      root?.unmount();
      delete container.dataset.ftChartEngine;
      chartRoot.classList.remove('ft-hourly-chart-enhanced', 'ft-hourly-chart-liveline');
    },
  };
}
