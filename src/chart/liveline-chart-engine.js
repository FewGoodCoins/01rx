import { Liveline } from 'liveline';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  chartWheelZoomFactor,
  stableChartViewportProjection,
} from './stable-chart-viewport.js';

const PLOT_PADDING = Object.freeze({ top: 42, right: 76, bottom: 30, left: 12 });
const MIN_WINDOW_SECONDS = 60;
const VIEWPORT_BUFFER_RATIO = 0.04;

const SERIES_TYPES = Object.freeze({
  AreaSeries: 'area',
  CandlestickSeries: 'candlestick',
  HistogramSeries: 'histogram',
  LineSeries: 'line',
});

const LINE_STYLES = Object.freeze({
  Solid: 0,
  Dotted: 1,
  Dashed: 2,
  LargeDashed: 3,
  SparseDotted: 4,
});

function epochSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed / 1_000 : NaN;
  }
  if (value && typeof value === 'object') {
    const year = Number(value.year);
    const month = Number(value.month);
    const day = Number(value.day);
    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) {
      return Date.UTC(year, month - 1, day) / 1_000;
    }
  }
  return NaN;
}

function pointValue(point, kind = 'line') {
  if (!point || typeof point !== 'object') return NaN;
  if (kind === 'candlestick') return Number(point.close);
  return Number(point.value);
}

function validPoint(point, kind = 'line') {
  return Number.isFinite(epochSeconds(point?.time))
    && Number.isFinite(pointValue(point, kind));
}

function isTransparent(color) {
  const value = String(color || '').replace(/\s+/g, '').toLowerCase();
  return !value
    || value === 'transparent'
    || value === 'rgba(0,0,0,0)'
    || value.endsWith(',0)');
}

function seriesColor(series, index) {
  const options = series.options;
  const candidates = [
    options.livelineColor,
    options.color,
    options.lineColor,
    options.upColor,
  ];
  const selected = candidates.find(color => !isTransparent(color));
  if (selected) return selected;
  const fallback = ['#5b8cff', '#ffcc00', '#9b7cff', '#31c48d', '#ff7a90'];
  return fallback[index % fallback.length];
}

function seriesLabel(series, index) {
  return String(
    series.options.livelineLabel
    || series.options.title
    || `Series ${index + 1}`,
  );
}

function sortedData(series) {
  return series.data
    .filter(point => validPoint(point, series.kind))
    .map(point => ({ ...point, time: epochSeconds(point.time) }))
    .sort((left, right) => left.time - right.time);
}

function visibleSeries(series) {
  return series.filter(item => (
    item.options.visible !== false
    && item.kind !== 'histogram'
    && sortedData(item).length > 0
  ));
}

function seriesTimeline(series) {
  return [...new Set(
    visibleSeries(series)
      .flatMap(item => sortedData(item).map(point => point.time))
      .filter(Number.isFinite),
  )].sort((left, right) => left - right);
}

function expandedRange(from, to) {
  const start = Number(from);
  const end = Number(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end > start) return { from: start, to: end };
  return {
    from: start - MIN_WINDOW_SECONDS / 2,
    to: end + MIN_WINDOW_SECONDS / 2,
  };
}

function fittedViewport(timeline) {
  if (!timeline.length) {
    const now = Date.now() / 1_000;
    return { from: now - 3_600, to: now };
  }
  const range = expandedRange(timeline[0], timeline[timeline.length - 1]);
  const duration = Math.max(MIN_WINDOW_SECONDS, range.to - range.from);
  const buffer = duration * VIEWPORT_BUFFER_RATIO;
  return { from: range.from - buffer, to: range.to + buffer };
}

function clampViewport(viewport, timeline) {
  const fallback = fittedViewport(timeline);
  const requested = expandedRange(viewport?.from, viewport?.to) || fallback;
  const fullDuration = Math.max(MIN_WINDOW_SECONDS, fallback.to - fallback.from);
  const duration = Math.max(
    MIN_WINDOW_SECONDS,
    Math.min(requested.to - requested.from, fullDuration * 4),
  );
  const overscroll = duration * 0.12;
  const first = timeline[0] ?? fallback.from;
  const last = timeline[timeline.length - 1] ?? fallback.to;
  const minimumFrom = first - overscroll;
  const maximumFrom = last + overscroll - duration;
  const from = minimumFrom > maximumFrom
    ? (first + last - duration) / 2
    : Math.max(minimumFrom, Math.min(maximumFrom, requested.from));
  return { from, to: from + duration };
}

function nearestPoint(data, time, kind) {
  if (!data.length || !Number.isFinite(time)) return null;
  let low = 0;
  let high = data.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (epochSeconds(data[middle].time) < time) low = middle + 1;
    else high = middle;
  }
  const right = data[low];
  const left = data[Math.max(0, low - 1)];
  const selected = Math.abs(epochSeconds(left.time) - time)
      <= Math.abs(epochSeconds(right.time) - time)
    ? left
    : right;
  if (!validPoint(selected, kind)) return null;
  return selected;
}

function medianCadence(timeline) {
  if (timeline.length < 2) return MIN_WINDOW_SECONDS / 2;
  const differences = [];
  for (let index = 1; index < timeline.length; index += 1) {
    const difference = timeline[index] - timeline[index - 1];
    if (Number.isFinite(difference) && difference > 0) differences.push(difference);
  }
  if (!differences.length) return MIN_WINDOW_SECONDS / 2;
  differences.sort((left, right) => left - right);
  return differences[Math.floor(differences.length / 2)];
}

function seriesGapRanges(item) {
  const ranges = [];
  const source = item.data
    .map(point => ({ point, time: epochSeconds(point?.time) }))
    .filter(entry => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time);
  const cadence = medianCadence(source.map(entry => entry.time));
  source.forEach((entry, index) => {
    if (!validPoint(entry.point, item.kind)) {
      ranges.push({
        from: entry.time - cadence / 2,
        to: entry.time + cadence / 2,
      });
    }
    const previous = source[index - 1];
    if (previous && entry.time - previous.time > cadence * 1.5) {
      ranges.push({
        from: previous.time + cadence / 2,
        to: entry.time - cadence / 2,
      });
    }
  });
  return ranges;
}

function gapRanges(series, viewport) {
  return visibleSeries(series)
    .flatMap(item => (
      Array.isArray(item.gaps) ? item.gaps : seriesGapRanges(item)
    ))
    .map(range => ({
      from: Math.max(viewport.from, range.from),
      to: Math.min(viewport.to, range.to),
    }))
    .filter(range => range.to > range.from);
}

function paddedValueRange(values) {
  if (!values.length) return null;
  let min = Math.min(...values);
  let max = Math.max(...values);
  const rawRange = max - min;
  const minimumRange = rawRange * 0.1 || 0.4;
  if (rawRange < minimumRange) {
    const middle = (min + max) / 2;
    min = middle - minimumRange / 2;
    max = middle + minimumRange / 2;
  } else {
    const padding = rawRange * 0.12;
    min -= padding;
    max += padding;
  }
  return { min, max };
}

function activeValues(series, viewport) {
  const ranges = visibleSeries(series).map((item) => {
    const values = [];
    sortedData(item).forEach((point) => {
      if (point.time < viewport.from || point.time > viewport.to) return;
      if (item.kind === 'candlestick') {
        const low = Number(point.low);
        const high = Number(point.high);
        if (Number.isFinite(low)) values.push(low);
        if (Number.isFinite(high)) values.push(high);
        return;
      }
      const value = pointValue(point, item.kind);
      if (Number.isFinite(value)) values.push(value);
    });
    return paddedValueRange(values);
  }).filter(Boolean);
  if (!ranges.length) return { min: 0, max: 1 };
  return {
    min: Math.min(...ranges.map(range => range.min)),
    max: Math.max(...ranges.map(range => range.max)),
  };
}

function markerModel(series, viewport, projection) {
  const bounds = activeValues(series, viewport);
  const valueRange = Math.max(Number.EPSILON, bounds.max - bounds.min);
  return visibleSeries(series).flatMap((item, index) => {
    const points = sortedData(item);
    if (!points.length) return [];
    const color = seriesColor(item, index);
    const markers = [
      { edge: 'start', point: points[0] },
      { edge: 'end', point: points[points.length - 1] },
    ].filter(({ point }) => point.time >= viewport.from && point.time <= viewport.to);
    return markers.map(({ edge, point }) => ({
      color,
      edge,
      id: `${item.id}-${edge}`,
      sourceTime: point.time,
      x: projection.toPlotRatio(point.time),
      y: (bounds.max - pointValue(point, item.kind)) / valueRange,
    }));
  });
}

/**
 * Builds the renderer-neutral viewport snapshot consumed by the React host.
 * Exported so time projection, gaps, and endpoint markers stay testable
 * without relying on a canvas implementation.
 */
export function livelineChartSnapshot(series, {
  nowSeconds = Date.now() / 1_000,
  viewport,
} = {}) {
  const timeline = seriesTimeline(series);
  const resolvedViewport = clampViewport(viewport, timeline);
  const offset = nowSeconds - resolvedViewport.to;
  const projection = stableChartViewportProjection(resolvedViewport, { nowSeconds });
  const candidates = visibleSeries(series);
  const candle = candidates.find(item => item.kind === 'candlestick');
  const lineCandidates = candidates.filter(item => (
    item.kind === 'line' || item.kind === 'area'
  ));
  const candleData = candle
    ? sortedData(candle).filter(point => (
      Number.isFinite(Number(point.open))
      && Number.isFinite(Number(point.high))
      && Number.isFinite(Number(point.low))
      && Number.isFinite(Number(point.close))
    ))
    : [];
  // The ownership controller keeps its line series available while candles
  // are selected. Treat the visible candle series as authoritative so the
  // renderer follows the user's chart-style choice.
  const useCandles = Boolean(candle && candleData.length >= 2);
  const projectedLines = lineCandidates.map((item, index) => {
    const source = sortedData(item);
    const data = source.map(point => ({
      time: projection.toRenderTime(point.time),
      value: pointValue(point, item.kind),
    }));
    const currentPoint = [...source]
      .reverse()
      .find(point => point.time <= resolvedViewport.to);
    return {
      color: seriesColor(item, index),
      data,
      id: item.id,
      label: seriesLabel(item, index),
      value: currentPoint ? pointValue(currentPoint, item.kind) : NaN,
    };
  }).filter(item => item.data.length > 0 && Number.isFinite(item.value));
  const projectedCandles = useCandles
    ? candleData.map(point => ({
      time: projection.toRenderTime(point.time),
      open: Number(point.open),
      high: Number(point.high),
      low: Number(point.low),
      close: Number(point.close),
    }))
    : [];
  const newestObservedTime = timeline[timeline.length - 1] || 0;
  const cadence = medianCadence(timeline);
  return {
    candles: projectedCandles,
    gaps: gapRanges(series, resolvedViewport),
    isLive: newestObservedTime > 0
      && resolvedViewport.to >= newestObservedTime - cadence
      && Math.abs(nowSeconds - newestObservedTime) <= Math.max(300, cadence * 2.5),
    markers: markerModel(series, resolvedViewport, projection),
    offset,
    projection,
    rendererCadence: cadence * projection.scale,
    rendererWindowSeconds: projection.renderWindowSeconds,
    series: projectedLines,
    timeline,
    useCandles,
    viewport: resolvedViewport,
    windowSeconds: Math.max(MIN_WINDOW_SECONDS, resolvedViewport.to - resolvedViewport.from),
  };
}

function defaultTimeFormatter(value) {
  const date = new Date(Number(value) * 1_000);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

function defaultValueFormatter(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const digits = Math.abs(number) >= 100 ? 2 : Math.abs(number) >= 1 ? 4 : 6;
  return number.toLocaleString('en-US', { maximumFractionDigits: digits });
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

function createLivelineChart(runtime, container, initialOptions = {}) {
  if (!container) throw new Error('Chart container is required');
  const mount = runtime.document.createElement('div');
  mount.className = 'orx-liveline-chart-host';
  mount.setAttribute('data-01rx-chart-engine', 'liveline');
  mount.style.touchAction = 'none';
  container.prepend(mount);
  container.dataset.chartEngine = 'liveline';

  const root = createRoot(mount);
  const chartOptions = { ...initialOptions };
  const series = [];
  const crosshairSubscribers = new Set();
  const clickSubscribers = new Set();
  const rangeSubscribers = new Set();
  const priceScaleOptions = new Map();
  let viewport = null;
  let renderFrame = 0;
  let removed = false;
  let lastSnapshot = livelineChartSnapshot(series);
  let drag = null;
  const pointers = new Map();
  let pinch = null;
  let interactionActive = false;
  let interactionTimer = 0;
  let nextSeriesId = 1;

  function requestRender() {
    if (removed || renderFrame) return;
    renderFrame = runtime.requestAnimationFrame(() => {
      renderFrame = 0;
      render();
    });
  }

  function markModelChanged() {
    requestRender();
  }

  function beginInteraction() {
    if (interactionTimer) {
      runtime.clearTimeout(interactionTimer);
      interactionTimer = 0;
    }
    if (!interactionActive) {
      interactionActive = true;
      requestRender();
    }
  }

  function endInteraction(delay = 32) {
    if (interactionTimer) runtime.clearTimeout(interactionTimer);
    interactionTimer = runtime.setTimeout(() => {
      interactionTimer = 0;
      interactionActive = false;
      requestRender();
    }, delay);
  }

  function notifyRange() {
    const range = timeScale.getVisibleLogicalRange();
    rangeSubscribers.forEach(listener => listener(range));
  }

  function setViewport(nextViewport, { notify = true } = {}) {
    const timeline = seriesTimeline(series);
    viewport = clampViewport(nextViewport, timeline);
    requestRender();
    if (notify) notifyRange();
  }

  function originalTime(normalizedTime) {
    return lastSnapshot.projection.toSourceTime(Number(normalizedTime));
  }

  function crosshairPayload(time, point = {}) {
    const seriesData = new Map();
    series.forEach((item) => {
      if (item.options.visible === false) return;
      if (item.gaps.some(range => time >= range.from && time <= range.to)) return;
      const datum = nearestPoint(sortedData(item), time, item.kind);
      if (datum) seriesData.set(item.api, datum);
    });
    return {
      logical: lastSnapshot.timeline.findIndex(value => value >= time),
      point: {
        x: Number(point.x) || timeScale.timeToCoordinate(time) || 0,
        y: Number(point.y) || 0,
      },
      seriesData,
      time,
    };
  }

  function emitCrosshair(point) {
    if (!point) {
      mount.classList.remove('has-liveline-crosshair');
      crosshairSubscribers.forEach(listener => listener({
        logical: null,
        point: null,
        seriesData: new Map(),
        time: null,
      }));
      return;
    }
    const time = originalTime(point.time);
    const payload = crosshairPayload(time, point);
    crosshairSubscribers.forEach(listener => listener(payload));
  }

  function gapElements(snapshot) {
    return snapshot.gaps.map((gap, index) => {
      const left = snapshot.projection.toPlotRatio(gap.from);
      const width = snapshot.projection.toPlotRatio(gap.to) - left;
      return createElement('span', {
        'aria-hidden': 'true',
        className: 'orx-liveline-gap-mask',
        key: `gap-${index}-${gap.from}`,
        style: {
          left: plotPosition(left, PLOT_PADDING.left, PLOT_PADDING.right),
          width: plotSize(width, PLOT_PADDING.left, PLOT_PADDING.right),
        },
      });
    });
  }

  function markerElements(snapshot) {
    // Liveline owns each animated ending dot. Add only the starting dot so
    // both ends remain explicit without drawing a duplicate live endpoint.
    return snapshot.markers
      .filter(marker => marker.edge === 'start')
      .map(marker => createElement('span', {
        'aria-hidden': 'true',
        className: `orx-liveline-endpoint orx-liveline-endpoint-${marker.edge}`,
        key: marker.id,
        style: {
          '--orx-endpoint-color': marker.color,
          left: plotPosition(marker.x, PLOT_PADDING.left, PLOT_PADDING.right),
          top: plotPosition(marker.y, PLOT_PADDING.top, PLOT_PADDING.bottom),
        },
      }));
  }

  function render() {
    if (removed) return;
    lastSnapshot = livelineChartSnapshot(series, { viewport });
    viewport = lastSnapshot.viewport;
    const theme = runtime.document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark';
    const timeFormatter = chartOptions.localization?.timeFormatter;
    const formatTime = value => (
      typeof timeFormatter === 'function'
        ? timeFormatter(originalTime(value))
        : defaultTimeFormatter(originalTime(value))
    );
    const primary = series.find(item => item.options.visible !== false);
    const customValueFormatter = primary?.options?.priceFormat?.formatter;
    const formatValue = value => (
      typeof customValueFormatter === 'function'
        ? customValueFormatter(value)
        : defaultValueFormatter(value)
    );
    const props = {
      badge: false,
      className: 'orx-liveline-canvas',
      cursor: 'crosshair',
      data: [],
      gaps: [],
      emptyText: 'No indexed chart history',
      fill: !lastSnapshot.useCandles && lastSnapshot.series.length === 1,
      formatTime,
      formatValue,
      grid: true,
      lerpSpeed: interactionActive ? 0.8 : lastSnapshot.isLive ? 0.08 : 0.72,
      momentum: false,
      padding: PLOT_PADDING,
      paused: !lastSnapshot.isLive && !interactionActive,
      pulse: lastSnapshot.isLive,
      scrub: false,
      seriesToggleCompact: true,
      theme,
      value: 0,
      window: lastSnapshot.rendererWindowSeconds,
    };
    if (lastSnapshot.useCandles) {
      props.mode = 'candle';
      props.candles = lastSnapshot.candles;
      props.candleWidth = Math.max(1, lastSnapshot.rendererCadence);
      props.color = '#5b8cff';
    } else {
      props.series = lastSnapshot.series.map(({ label: _label, ...item }) => item);
    }
    props.key = 'liveline-chart';
    root.render(createElement(
      'div',
      { className: 'orx-liveline-root' },
      createElement(Liveline, props),
      ...gapElements(lastSnapshot),
      ...markerElements(lastSnapshot),
    ));
  }

  function priceToCoordinate(value) {
    const bounds = activeValues(series, lastSnapshot.viewport);
    const height = Math.max(1, mount.clientHeight - PLOT_PADDING.top - PLOT_PADDING.bottom);
    const ratio = (bounds.max - Number(value)) / Math.max(Number.EPSILON, bounds.max - bounds.min);
    return PLOT_PADDING.top + Math.max(0, Math.min(1, ratio)) * height;
  }

  function plotWidth() {
    return Math.max(1, mount.clientWidth - PLOT_PADDING.left - PLOT_PADDING.right);
  }

  function setCrosshairVisual(coordinate) {
    const x = Number(coordinate);
    if (!Number.isFinite(x)) return;
    mount.style.setProperty('--orx-liveline-crosshair-x', `${x}px`);
    mount.classList.add('has-liveline-crosshair');
  }

  function showOwnedCrosshair(clientX, clientY) {
    const rect = mount.getBoundingClientRect();
    const x = Number(clientX) - rect.left;
    const y = Number(clientY) - rect.top;
    const maximumX = mount.clientWidth - PLOT_PADDING.right;
    if (
      !Number.isFinite(x)
      || !Number.isFinite(y)
      || x < PLOT_PADDING.left
      || x > maximumX
      || y < PLOT_PADDING.top
      || y > mount.clientHeight - PLOT_PADDING.bottom
    ) {
      emitCrosshair(null);
      return;
    }
    setCrosshairVisual(x);
    const time = timeScale.coordinateToTime(x);
    const payload = crosshairPayload(time, { x, y });
    crosshairSubscribers.forEach(listener => listener(payload));
  }

  function createSeries(kind, options = {}, paneIndex = 0) {
    const item = {
      api: null,
      data: [],
      id: `series-${nextSeriesId++}`,
      kind,
      markers: [],
      options: { ...options },
      paneIndex,
      priceLines: [],
      primitives: new Set(),
    };
    const api = {
      applyOptions(nextOptions = {}) {
        item.options = { ...item.options, ...nextOptions };
        markModelChanged();
      },
      attachPrimitive(primitive) {
        if (!primitive || item.primitives.has(primitive)) return;
        item.primitives.add(primitive);
        primitive.attached?.({
          chart: chartApi,
          requestUpdate: requestRender,
          series: api,
        });
      },
      createPriceLine(optionsForLine = {}) {
        let currentOptions = { ...optionsForLine };
        const priceLine = {
          applyOptions(nextOptions = {}) {
            currentOptions = { ...currentOptions, ...nextOptions };
            markModelChanged();
          },
          options() {
            return { ...currentOptions };
          },
        };
        item.priceLines.push(priceLine);
        markModelChanged();
        return priceLine;
      },
      data() {
        return item.data.map(point => ({ ...point }));
      },
      detachPrimitive(primitive) {
        if (!item.primitives.delete(primitive)) return;
        primitive?.detached?.();
      },
      options() {
        return { ...item.options };
      },
      priceToCoordinate,
      removePriceLine(priceLine) {
        item.priceLines = item.priceLines.filter(candidate => candidate !== priceLine);
        markModelChanged();
      },
      setData(nextData = []) {
        item.data = Array.isArray(nextData)
          ? nextData.map(point => ({ ...point }))
          : [];
        item.gaps = seriesGapRanges(item);
        markModelChanged();
      },
      update(point) {
        if (!point || !Number.isFinite(epochSeconds(point.time))) return;
        const time = epochSeconds(point.time);
        const existing = item.data.findIndex(candidate => epochSeconds(candidate.time) === time);
        if (existing >= 0) item.data[existing] = { ...point, time };
        else item.data.push({ ...point, time });
        item.gaps = seriesGapRanges(item);
        markModelChanged();
      },
    };
    item.api = api;
    series.push(item);
    markModelChanged();
    return api;
  }

  const timeScale = {
    applyOptions() {},
    coordinateToLogical(coordinate) {
      const timeline = lastSnapshot.timeline;
      if (!timeline.length) return null;
      const time = timeScale.coordinateToTime(coordinate);
      let closest = 0;
      timeline.forEach((candidate, index) => {
        if (Math.abs(candidate - time) < Math.abs(timeline[closest] - time)) closest = index;
      });
      return closest;
    },
    coordinateToTime(coordinate) {
      const ratio = (Number(coordinate) - PLOT_PADDING.left) / plotWidth();
      return lastSnapshot.projection.sourceTimeAtPlotRatio(ratio);
    },
    fitContent() {
      setViewport(fittedViewport(seriesTimeline(series)));
    },
    getVisibleLogicalRange() {
      const timeline = lastSnapshot.timeline;
      if (!timeline.length) return null;
      const cadence = medianCadence(timeline);
      const from = (lastSnapshot.viewport.from - timeline[0]) / cadence;
      const to = (lastSnapshot.viewport.to - timeline[0]) / cadence;
      return { from, to };
    },
    height() {
      return PLOT_PADDING.bottom;
    },
    logicalToCoordinate(logical) {
      const timeline = lastSnapshot.timeline;
      if (!timeline.length) return null;
      const cadence = medianCadence(timeline);
      return timeScale.timeToCoordinate(timeline[0] + Number(logical) * cadence);
    },
    setVisibleLogicalRange(range) {
      const timeline = seriesTimeline(series);
      if (!timeline.length) return;
      const cadence = medianCadence(timeline);
      setViewport({
        from: timeline[0] + Number(range?.from || 0) * cadence,
        to: timeline[0] + Number(range?.to || timeline.length - 1) * cadence,
      });
    },
    setVisibleRange(range) {
      setViewport({
        from: epochSeconds(range?.from),
        to: epochSeconds(range?.to),
      });
    },
    subscribeVisibleLogicalRangeChange(listener) {
      if (typeof listener === 'function') rangeSubscribers.add(listener);
    },
    timeToCoordinate(time) {
      const numeric = epochSeconds(time);
      if (!Number.isFinite(numeric)) return null;
      const ratio = lastSnapshot.projection.toPlotRatio(numeric);
      return PLOT_PADDING.left + ratio * plotWidth();
    },
    unsubscribeVisibleLogicalRangeChange(listener) {
      rangeSubscribers.delete(listener);
    },
    width() {
      return Math.max(0, plotWidth());
    },
  };

  const chartApi = {
    addSeries(seriesType, options, paneIndex) {
      return createSeries(seriesType, options, paneIndex);
    },
    applyOptions(nextOptions = {}) {
      Object.assign(chartOptions, nextOptions);
      markModelChanged();
    },
    clearCrosshairPosition() {
      emitCrosshair(null);
    },
    panes() {
      return [{
        getHeight: () => mount.clientHeight,
        setHeight: () => {},
      }];
    },
    priceScale(id = 'right') {
      if (!priceScaleOptions.has(id)) priceScaleOptions.set(id, {});
      return {
        applyOptions(nextOptions = {}) {
          priceScaleOptions.set(id, {
            ...priceScaleOptions.get(id),
            ...nextOptions,
          });
        },
        options() {
          return { autoScale: true, ...priceScaleOptions.get(id) };
        },
        width() {
          return PLOT_PADDING.right;
        },
      };
    },
    remove() {
      if (removed) return;
      removed = true;
      if (renderFrame) runtime.cancelAnimationFrame(renderFrame);
      if (interactionTimer) runtime.clearTimeout(interactionTimer);
      mount.removeEventListener('wheel', onWheel);
      mount.removeEventListener('pointerdown', onPointerDown);
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerup', onPointerUp);
      mount.removeEventListener('pointercancel', onPointerUp);
      mount.removeEventListener('pointerleave', onPointerLeave);
      series.forEach(item => item.primitives.forEach(primitive => primitive?.detached?.()));
      root.unmount();
      mount.remove();
      delete container.dataset.chartEngine;
    },
    removePane() {},
    removeSeries(seriesApi) {
      const index = series.findIndex(item => item.api === seriesApi);
      if (index < 0) return;
      const [removedSeries] = series.splice(index, 1);
      removedSeries.primitives.forEach(primitive => primitive?.detached?.());
      markModelChanged();
    },
    resize() {
      requestRender();
    },
    setCrosshairPosition(_price, time) {
      const sourceTime = epochSeconds(time);
      const x = timeScale.timeToCoordinate(sourceTime);
      const y = priceToCoordinate(_price);
      if (!Number.isFinite(sourceTime) || !Number.isFinite(x)) {
        emitCrosshair(null);
        return;
      }
      setCrosshairVisual(x);
      const payload = crosshairPayload(sourceTime, { x, y });
      crosshairSubscribers.forEach(listener => listener(payload));
    },
    subscribeClick(listener) {
      if (typeof listener === 'function') clickSubscribers.add(listener);
    },
    subscribeCrosshairMove(listener) {
      if (typeof listener === 'function') crosshairSubscribers.add(listener);
    },
    takeScreenshot() {
      return mount.querySelector('canvas') || runtime.document.createElement('canvas');
    },
    timeScale() {
      return timeScale;
    },
    unsubscribeClick(listener) {
      clickSubscribers.delete(listener);
    },
    unsubscribeCrosshairMove(listener) {
      crosshairSubscribers.delete(listener);
    },
  };

  function onWheel(event) {
    if (!lastSnapshot.timeline.length) return;
    event.preventDefault();
    emitCrosshair(null);
    beginInteraction();
    const rect = mount.getBoundingClientRect();
    const rawPlotRatio = plotWidth() > 0
      ? Math.max(
        0,
        Math.min(1, (event.clientX - rect.left - PLOT_PADDING.left) / plotWidth()),
      )
      : 0.5;
    const duration = lastSnapshot.viewport.to - lastSnapshot.viewport.from;
    const anchor = lastSnapshot.projection.sourceTimeAtPlotRatio(rawPlotRatio);
    const ratio = Math.max(0, Math.min(
      1,
      (anchor - lastSnapshot.viewport.from) / Math.max(1, duration),
    ));
    const factor = chartWheelZoomFactor(event.deltaY, {
      deltaMode: event.deltaMode,
      viewportHeight: mount.clientHeight,
    });
    if (Math.abs(factor - 1) < Number.EPSILON) {
      endInteraction();
      return;
    }
    const nextDuration = Math.max(MIN_WINDOW_SECONDS, duration * factor);
    setViewport({
      from: anchor - nextDuration * ratio,
      to: anchor + nextDuration * (1 - ratio),
    });
    endInteraction(140);
  }

  function onPointerDown(event) {
    if (!lastSnapshot.timeline.length) return;
    emitCrosshair(null);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    mount.setPointerCapture?.(event.pointerId);
    beginInteraction();
    if (pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      const rect = mount.getBoundingClientRect();
      const centerX = (first.x + second.x) / 2 - rect.left;
      const anchor = timeScale.coordinateToTime(centerX);
      const duration = lastSnapshot.viewport.to - lastSnapshot.viewport.from;
      pinch = {
        anchor,
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        ratio: Math.max(0, Math.min(
          1,
          (anchor - lastSnapshot.viewport.from) / Math.max(1, duration),
        )),
        viewport: { ...lastSnapshot.viewport },
      };
      drag = null;
      return;
    }
    if (event.button !== 0) return;
    drag = {
      from: lastSnapshot.viewport.from,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      to: lastSnapshot.viewport.to,
    };
    mount.classList.add('is-panning');
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType !== 'touch') showOwnedCrosshair(event.clientX, event.clientY);
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const duration = pinch.viewport.to - pinch.viewport.from;
      const nextDuration = Math.max(
        MIN_WINDOW_SECONDS,
        duration * (pinch.distance / distance),
      );
      event.preventDefault();
      setViewport({
        from: pinch.anchor - nextDuration * pinch.ratio,
        to: pinch.anchor + nextDuration * (1 - pinch.ratio),
      });
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) < 3 && !drag.moved) return;
    drag.moved = true;
    event.preventDefault();
    const duration = drag.to - drag.from;
    const seconds = -(delta / plotWidth()) * duration;
    setViewport({ from: drag.from + seconds, to: drag.to + seconds });
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    mount.releasePointerCapture?.(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag || drag.pointerId !== event.pointerId) {
      if (!pointers.size) mount.classList.remove('is-panning');
      if (!pointers.size) endInteraction();
      requestRender();
      return;
    }
    const wasMoved = drag.moved;
    drag = null;
    mount.classList.remove('is-panning');
    if (!wasMoved) {
      const rect = mount.getBoundingClientRect();
      const time = timeScale.coordinateToTime(event.clientX - rect.left);
      const payload = crosshairPayload(time, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      clickSubscribers.forEach(listener => listener(payload));
    }
    if (!pointers.size) endInteraction();
    requestRender();
  }

  function onPointerLeave() {
    if (!pointers.size) emitCrosshair(null);
  }

  mount.addEventListener('wheel', onWheel, { passive: false });
  mount.addEventListener('pointerdown', onPointerDown);
  mount.addEventListener('pointermove', onPointerMove);
  mount.addEventListener('pointerup', onPointerUp);
  mount.addEventListener('pointercancel', onPointerUp);
  mount.addEventListener('pointerleave', onPointerLeave);
  render();
  return chartApi;
}

export function createLivelineChartsApi(runtime = globalThis.window) {
  if (!runtime?.document) throw new Error('Liveline Charts requires a browser runtime');
  return Object.freeze({
    ...SERIES_TYPES,
    CrosshairMode: Object.freeze({ Normal: 0 }),
    LineStyle: LINE_STYLES,
    LineType: Object.freeze({ Simple: 0, WithSteps: 1, Curved: 2 }),
    createChart: (container, options) => createLivelineChart(runtime, container, options),
    createSeriesMarkers(seriesApi, markers = []) {
      let current = Array.isArray(markers) ? markers.slice() : [];
      return {
        markers: () => current.slice(),
        setMarkers(nextMarkers = []) {
          current = Array.isArray(nextMarkers) ? nextMarkers.slice() : [];
          seriesApi?.applyOptions?.({ livelineMarkers: current });
        },
      };
    },
  });
}

export function installBrowserLivelineCharts(runtime = globalThis.window) {
  const navgator = runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.document.documentElement.setAttribute('data-chart-engine', 'liveline');
  if (!runtime.LivelineCharts) {
    runtime.LivelineCharts = createLivelineChartsApi(runtime);
  }
  navgator.livelineChartsPromise = Promise.resolve(runtime.LivelineCharts);
  return runtime.LivelineCharts;
}
