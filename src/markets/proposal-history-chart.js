import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
} from 'lightweight-charts';
import { mountTradingViewAttribution } from '../chart/tradingview-attribution.js';
import {
  proposalChartPointTime,
  proposalChartPoints,
} from './proposal-history-model.js';

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

export const PROPOSAL_HISTORY_GUIDE_LINE_STYLE = LineStyle.SparseDotted;
export const PROPOSAL_HISTORY_CROSSHAIR_MARKERS_VISIBLE = false;

export const PROPOSAL_HISTORY_SERIES = Object.freeze([
  {
    field: 'underlyingPrice',
    label: 'Price',
    colorVariable: '--ft-ink-strong',
    fallbackColor: '#f4f6f8',
    lineStyle: LineStyle.Solid,
    lineWidth: 2,
  },
  {
    field: 'passPrice',
    label: 'Pass',
    colorVariable: '--ft-positive',
    fallbackColor: '#42d89b',
    lineStyle: LineStyle.Solid,
    lineWidth: 2,
  },
  {
    field: 'failPrice',
    label: 'Fail',
    colorVariable: '--ft-negative',
    fallbackColor: '#ff6f7d',
    lineStyle: LineStyle.Solid,
    lineWidth: 2,
  },
]);

function finiteValue(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
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
  const values = points.flatMap(point => PROPOSAL_HISTORY_SERIES
    .map(definition => finiteValue(point?.[definition.field]))
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
  return {
    background: cssColor(runtime, themeRoot, '--ft-panel-soft', light ? '#f4f5f2' : '#0e1217'),
    text: cssColor(runtime, themeRoot, '--ft-faint', light ? '#8a929c' : '#626c79'),
    border: cssColor(runtime, themeRoot, '--ft-border', light ? '#cbd0d4' : '#2a323d'),
    grid: light ? 'rgba(18, 22, 27, 0.055)' : 'rgba(255, 255, 255, 0.045)',
    crosshair: light ? 'rgba(32, 36, 42, 0.42)' : 'rgba(230, 233, 237, 0.38)',
    watermark: light ? 'rgba(32, 36, 42, 0.045)' : 'rgba(230, 233, 237, 0.04)',
    font: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  };
}

function readoutElements(container) {
  return {
    time: container.querySelector('[data-ft-role="hourly-readout-time"]'),
    values: new Map(PROPOSAL_HISTORY_SERIES.map(definition => [
      definition.field,
      container.querySelector(`[data-ft-readout-value="${definition.field}"]`),
    ])),
  };
}

function updateReadout(elements, timestamp, values) {
  if (elements.time) elements.time.textContent = timestamp == null
    ? '—'
    : formatOverlayTimestamp(timestamp);

  PROPOSAL_HISTORY_SERIES.forEach((definition) => {
    const target = elements.values.get(definition.field);
    if (target) {
      const formatted = formatPrice(values[definition.field]);
      target.textContent = formatted === '—' ? formatted : `$${formatted}`;
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
    const value = finiteValue(point?.[field]);
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
    const value = finiteValue(point?.[field]);
    data.push(Number.isFinite(value) ? { time, value } : { time });
    previousTime = time;
  });
  return data;
}

export function proposalChartEndpoint(points, field, interval = '1h') {
  const data = proposalChartData(points, field, interval);
  for (let index = data.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(data[index]?.value)) return data[index];
  }
  return null;
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
  PROPOSAL_HISTORY_SERIES.forEach((definition) => {
    result[definition.field] = finiteValue(latestPoint[definition.field]);
  });
  return result;
}

function crosshairValues(seriesByField, seriesData) {
  const values = {};
  PROPOSAL_HISTORY_SERIES.forEach((definition) => {
    values[definition.field] = null;
    for (const series of seriesByField.get(definition.field) || []) {
      const data = seriesData.get(series);
      const value = finiteValue(data?.value);
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
  ticker = 'TOKEN',
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

  const observations = history.series;
  const points = proposalChartPoints(history, { launchedAt });
  const chartRoot = container.closest('.ft-hourly-chart') || container;
  const readout = readoutElements(chartRoot);
  const precision = pricePrecision(points);
  const minMove = 10 ** -precision;
  const seriesByField = new Map();
  const seriesVisibility = new Map();
  const liveEndpointDots = new Map();
  let currentTheme = chartTheme(runtime, themeRoot, theme);
  const latest = latestValues(observations);
  const firstTimestamp = Math.floor(proposalChartPointTime(points[0]) / 1_000);
  const lastTimestamp = Math.floor(
    proposalChartPointTime(points[points.length - 1]) / 1_000,
  );
  const plottedTimes = points.filter(point => PROPOSAL_HISTORY_SERIES.some(
    definition => Number.isFinite(finiteValue(point?.[definition.field])),
  )).map(point => Math.floor(proposalChartPointTime(point) / 1_000)).filter(Number.isFinite);
  let rangeFrame = null;
  let eventFrame = null;
  let readoutFrame = null;
  let pendingCrosshair = null;
  let chart = null;
  let resizeObserver = null;
  let interactionHandler = null;
  let watermark = null;
  let launchAnchorMarkers = null;
  let currentRange = range;

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
      minBarSpacing: 2,
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
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      axisPressedMouseMove: {
        time: true,
        price: true,
      },
      axisDoubleClickReset: {
        time: true,
        price: true,
      },
      mouseWheel: true,
      pinch: true,
    },
    kineticScroll: {
      mouse: true,
      touch: true,
    },
  });
  mountTradingViewAttribution(container, { runtime });

  PROPOSAL_HISTORY_SERIES.forEach((definition) => {
    const data = proposalChartData(points, definition.field, history.interval);
    const valueCount = data.filter(point => Number.isFinite(point.value)).length;
    const color = cssColor(
      runtime,
      themeRoot,
      definition.colorVariable,
      definition.fallbackColor,
    );
    const seriesVisible = visibility[definition.field] !== false;
    const line = chart.addSeries(LineSeries, {
      title: definition.label,
      color,
      lineStyle: definition.lineStyle,
      lineWidth: definition.lineWidth,
      visible: seriesVisible,
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
      crosshairMarkerVisible: PROPOSAL_HISTORY_CROSSHAIR_MARKERS_VISIBLE,
      pointMarkersVisible: valueCount === 1,
      pointMarkersRadius: 4,
      lastValueVisible: Number.isFinite(finiteValue(
        observations[observations.length - 1]?.[definition.field],
      )),
      priceLineVisible: definition.field !== 'underlyingPrice',
      priceLineColor: color,
      priceLineStyle: PROPOSAL_HISTORY_GUIDE_LINE_STYLE,
      priceLineWidth: 1,
    });
    line.setData(data);
    seriesByField.set(definition.field, [line]);
    seriesVisibility.set(definition.field, seriesVisible);
  });

  watermark = createTextWatermark(chart.panes()[0], {
    horzAlign: 'center',
    vertAlign: 'center',
    lines: [{
      text: `${ticker} · PASS / FAIL`,
      color: currentTheme.watermark,
      fontSize: 24,
      fontStyle: '700',
      fontFamily: currentTheme.font,
    }],
  });

  const preTwapTimestamp = unixTime(history.preTwap);
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
  if (isLive) {
    PROPOSAL_HISTORY_SERIES
      .filter(definition => (
        definition.field === 'passPrice' || definition.field === 'failPrice'
      ))
      .forEach((definition) => {
        const endpoint = proposalChartEndpoint(
          points,
          definition.field,
          history.interval,
        );
        if (!endpoint) return;
        const outcome = definition.field === 'passPrice' ? 'pass' : 'fail';
        const dot = runtime.document.createElement('span');
        dot.className = `ft-proposal-live-dot ft-proposal-live-dot-${outcome}`;
        dot.dataset.ftLiveEndpoint = outcome;
        dot.setAttribute('aria-hidden', 'true');
        container.appendChild(dot);
        liveEndpointDots.set(definition.field, {
          element: dot,
          endpoint,
        });
      });
  }
  const twapEndTimestamp = unixTime(windowEndedAt);
  const eventDefinitions = [
    {
      kind: 'twap-start',
      label: 'TWAP Open',
      time: preTwapTimestamp,
    },
    {
      kind: 'twap-end',
      label: 'TWAP Close',
      time: twapEndTimestamp,
    },
  ].filter((event, index, events) => (
    Number.isFinite(event.time)
    && event.time >= firstTimestamp
    && event.time <= lastTimestamp
    && !events.slice(0, index).some(previous => previous.time === event.time)
  ));
  const preTwapBoundary = eventDefinitions.find(event => event.kind === 'twap-start');
  const preTwapBand = preTwapBoundary
    ? runtime.document.createElement('span')
    : null;
  if (preTwapBand) {
    preTwapBand.className = 'ft-hourly-pre-twap-band';
    preTwapBand.dataset.ftChartBand = 'pre-twap';
    preTwapBand.setAttribute('aria-hidden', 'true');
    container.appendChild(preTwapBand);
  }
  const eventElements = eventDefinitions.map((event) => {
    const line = runtime.document.createElement('span');
    line.className = `ft-hourly-event-line ft-hourly-event-${event.kind}`;
    line.dataset.ftChartEvent = event.kind;
    line.setAttribute('aria-hidden', 'true');
    const label = runtime.document.createElement('span');
    label.textContent = event.label;
    line.appendChild(label);
    container.appendChild(line);
    return { ...event, element: line };
  });
  function positionEvents() {
    const width = container.clientWidth;
    if (preTwapBand) {
      const coordinate = interpolateChartTimeCoordinate(
        preTwapBoundary.time,
        plottedTimes,
        time => chart.timeScale().timeToCoordinate(time),
      );
      const visibleWidth = Number.isFinite(coordinate)
        ? Math.min(width, Math.max(0, coordinate))
        : 0;
      preTwapBand.hidden = visibleWidth <= 0;
      preTwapBand.style.setProperty(
        '--ft-pre-twap-scale',
        String(visibleWidth / Math.max(1, width)),
      );
    }
    const positioned = eventElements.map(event => ({
      ...event,
      coordinate: interpolateChartTimeCoordinate(
        event.time,
        plottedTimes,
        time => chart.timeScale().timeToCoordinate(time),
      ),
    })).filter(event => (
      Number.isFinite(event.coordinate)
      && event.coordinate >= 0
      && event.coordinate <= width
    )).sort((left, right) => left.coordinate - right.coordinate);
    eventElements.forEach((event) => {
      event.element.hidden = !positioned.some(positionedEvent => (
        positionedEvent.element === event.element
      ));
    });
    positioned.forEach((event, index) => {
      const previous = positioned[index - 1];
      const stack = previous && Math.abs(event.coordinate - previous.coordinate) < 104
        ? Number(previous.stack || 0) + 1
        : 0;
      event.stack = stack;
      const coordinate = event.coordinate;
      event.element.style.setProperty('--ft-event-x', `${coordinate}px`);
      event.element.style.setProperty('--ft-event-offset', `${stack * 24}px`);
      event.element.classList.toggle('ft-is-near-left', coordinate < 92);
      event.element.classList.toggle('ft-is-near-right', coordinate > width - 92);
    });
    liveEndpointDots.forEach(({ element, endpoint }, field) => {
      const series = seriesByField.get(field)?.[0];
      if (!series || seriesVisibility.get(field) === false) {
        element.hidden = true;
        return;
      }
      const x = chart.timeScale().timeToCoordinate(endpoint.time);
      const y = series.priceToCoordinate(endpoint.value);
      const height = container.clientHeight;
      const positioned = (
        Number.isFinite(x)
        && Number.isFinite(y)
        && x >= 0
        && x <= width
        && y >= 0
        && (!height || y <= height)
      );
      element.hidden = !positioned;
      if (!positioned) return;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
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
      chart.timeScale().fitContent();
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
    const maximumWidth = Math.max(4, points.length + 4);
    const nextWidth = Math.min(maximumWidth, Math.max(2, currentWidth * factor));
    const center = (visible.from + visible.to) / 2;
    chart.timeScale().setVisibleLogicalRange({
      from: center - nextWidth / 2,
      to: center + nextWidth / 2,
    });
    scheduleEventPosition();
  }

  function resetView() {
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
      rightPriceScale: { borderColor: currentTheme.border },
      timeScale: { borderColor: currentTheme.border },
    });
    PROPOSAL_HISTORY_SERIES.forEach((definition) => {
      const color = cssColor(
        runtime,
        themeRoot,
        definition.colorVariable,
        definition.fallbackColor,
      );
      for (const series of seriesByField.get(definition.field) || []) {
        series.applyOptions({
          color,
          priceLineColor: color,
        });
      }
    });
    watermark?.applyOptions({
      lines: [{
        text: `${ticker} · PASS / FAIL`,
        color: currentTheme.watermark,
        fontSize: 24,
        fontStyle: '700',
        fontFamily: currentTheme.font,
      }],
    });
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
  interactionHandler = () => scheduleEventPosition();
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
      eventElements.forEach(event => event.element.remove());
      liveEndpointDots.forEach(({ element }) => element.remove());
      launchAnchorMarkers?.detach();
      delete container.dataset.ftLaunchAnchorRenderer;
      preTwapBand?.remove();
      watermark?.detach();
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
    liveEndpointDots.forEach(({ element }) => element.remove());
    launchAnchorMarkers?.detach();
    delete container.dataset.ftLaunchAnchorRenderer;
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
