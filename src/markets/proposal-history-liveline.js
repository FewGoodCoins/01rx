import { Liveline } from 'liveline';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  proposalChartPointTime,
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
        time: proposalChartPointTime(point) / 1_000 + timeOffset,
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

function gapMaskElements(dataset) {
  const visibleTo = (dataset.viewportEnd ?? dataset.lastTime)
    + dataset.windowSeconds * 0.015;
  const visibleFrom = visibleTo - dataset.windowSeconds;
  const duration = Math.max(1, visibleTo - visibleFrom);
  return dataset.gapRanges.map((gap, index) => {
    const from = Math.max(visibleFrom, gap.from);
    const to = Math.min(visibleTo, gap.to);
    if (to <= from) return null;
    const left = Math.max(0, Math.min(100, ((from - visibleFrom) / duration) * 100));
    const width = Math.max(0, Math.min(100 - left, ((to - from) / duration) * 100));
    return createElement('span', {
      'aria-hidden': 'true',
      className: 'ft-liveline-gap-mask',
      'data-ft-chart-gap': '',
      key: `gap-${index}-${from}`,
      style: {
        left: `${left}%`,
        width: `${width}%`,
      },
    });
  }).filter(Boolean);
}

function phaseBandElements(dataset, preTwap, windowEndedAt) {
  const visibleTo = (dataset.viewportEnd ?? dataset.lastTime)
    + dataset.windowSeconds * 0.015;
  const visibleFrom = visibleTo - dataset.windowSeconds;
  const duration = Math.max(1, visibleTo - visibleFrom);
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
        left: `${((from - visibleFrom) / duration) * 100}%`,
        width: `${((to - from) / duration) * 100}%`,
      },
    });
  }).filter(Boolean);
}

function startPointElements(dataset, series) {
  const visibleTo = (dataset.viewportEnd ?? dataset.lastTime)
    + dataset.timeOffset
    + dataset.windowSeconds * 0.015;
  const visibleFrom = visibleTo - dataset.windowSeconds;
  const visiblePoints = series.flatMap(definition => definition.data.filter(point => (
    point.time >= visibleFrom && point.time <= visibleTo
  )));
  const values = visiblePoints.map(point => point.value).filter(Number.isFinite);
  if (!values.length) return [];
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (!(maximum > minimum)) {
    const padding = Math.max(Math.abs(maximum) * 0.02, 1);
    minimum -= padding;
    maximum += padding;
  } else {
    const padding = (maximum - minimum) * 0.12;
    minimum -= padding;
    maximum += padding;
  }
  const duration = Math.max(1, visibleTo - visibleFrom);
  const valueRange = Math.max(Number.EPSILON, maximum - minimum);
  return series.map((definition) => {
    const first = definition.data.find(point => (
      point.time >= visibleFrom && point.time <= visibleTo
    ));
    if (!first) return null;
    const x = (first.time - visibleFrom) / duration;
    const y = (maximum - first.value) / valueRange;
    return createElement('span', {
      'aria-hidden': 'true',
      className: 'ft-liveline-start-point',
      key: `start-${definition.id}-${first.time}`,
      style: {
        '--ft-liveline-point-color': definition.color,
        left: plotPosition(x, PLOT_PADDING.left, PLOT_PADDING.right),
        top: plotPosition(y, PLOT_PADDING.top, PLOT_PADDING.bottom),
      },
    });
  }).filter(Boolean);
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
  let staticRevision = 0;
  const chartRoot = container.closest('.ft-hourly-chart') || container;
  const readoutTime = chartRoot.querySelector('[data-ft-role="hourly-readout-time"]');

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
      if (panOffsetSeconds > 0) {
        prepared.timeOffset += panOffsetSeconds;
        prepared.series = prepared.series.map(definition => ({
          ...definition,
          data: definition.data.map(point => ({
            ...point,
            time: point.time + panOffsetSeconds,
          })),
        }));
      }
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

  function beginInteraction() {
    if (interactionTimer) {
      runtime.clearTimeout(interactionTimer);
      interactionTimer = 0;
    }
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
      staticRevision += 1;
      render();
    }, delay);
  }

  function renderStaticChange() {
    staticRevision += 1;
    render();
  }

  function render() {
    const prepared = dataset();
    if (!prepared?.series?.length) return;
    const playback = proposalLivelinePlaybackOptions(
      isLive && panOffsetSeconds === 0,
    );
    const displayNow = prepared.viewportEnd + prepared.timeOffset;
    const series = prepared.series.map((definition) => {
      const data = definition.data.filter(point => point.time <= displayNow);
      return {
        id: definition.id,
        data,
        value: data[data.length - 1]?.value,
        color: cssColor(
          runtime,
          themeRoot,
          definition.colorVariable,
          definition.fallbackColor,
        ),
        // Liveline owns the visible series identity, endpoint labels, and hover
        // values. The renderer-neutral Trivium readout remains only as a fallback.
        label: definition.label,
      };
    }).filter(definition => (
      definition.data.length >= 2 && Number.isFinite(definition.value)
    ));
    root.render(createElement(
      'div',
      {
        className: 'ft-liveline-root',
        'data-ft-role': 'proposal-history-liveline',
      },
      createElement(Liveline, {
        key: playback.paused ? `resolved-${staticRevision}` : 'live',
        badge: false,
        className: 'ft-liveline-canvas',
        data: [],
        emptyText: 'No indexed market history',
        fill: false,
        formatTime: value => formatUtcTime(value - prepared.timeOffset),
        formatValue: formatPrice,
        grid: true,
        lerpSpeed: playback.lerpSpeed,
        momentum: false,
        padding: PLOT_PADDING,
        paused: playback.paused && !interactionActive,
        pulse: playback.pulse,
        scrub: true,
        series,
        seriesToggleCompact: true,
        theme: currentTheme,
        value: 0,
        window: prepared.windowSeconds,
        onHover: (point) => {
          if (!readoutTime) return;
          readoutTime.textContent = formatUtcTime(
            (point?.time ?? prepared.lastTime + prepared.timeOffset) - prepared.timeOffset,
          );
        },
      }),
      ...phaseBandElements(prepared, currentHistory.preTwap, options.windowEndedAt),
      ...gapMaskElements(prepared),
      ...startPointElements(prepared, series),
    ));
  }

  render();
  function zoomBy(factor) {
    zoomScale = Math.max(0.15, Math.min(4, zoomScale * factor));
    render();
  }

  function onWheel(event) {
    event.preventDefault();
    beginInteraction();
    zoomBy(event.deltaY > 0 ? 1.18 : 0.82);
    endInteraction(140);
  }

  function onPointerDown(event) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    container.setPointerCapture?.(event.pointerId);
    beginInteraction();
    if (pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      pinch = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
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
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      zoomScale = Math.max(
        0.15,
        Math.min(4, pinch.zoomScale * (pinch.distance / distance)),
      );
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
      + (delta / Math.max(1, container.clientWidth)) * prepared.windowSeconds;
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

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
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
      zoomScale = Math.max(0.15, Math.min(4, zoomScale * 0.72));
      renderStaticChange();
    },
    zoomOut() {
      zoomScale = Math.max(0.15, Math.min(4, zoomScale * 1.38));
      renderStaticChange();
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
      root?.unmount();
      delete container.dataset.ftChartEngine;
      chartRoot.classList.remove('ft-hourly-chart-enhanced', 'ft-hourly-chart-liveline');
    },
  };
}
