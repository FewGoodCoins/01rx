const DEFAULT_RENDER_WINDOW_SECONDS = 24 * 60 * 60;
const DEFAULT_RIGHT_BUFFER_RATIO = 0.015;
const WHEEL_LINE_HEIGHT_PX = 16;
const MAX_WHEEL_DELTA_PX = 120;
const WHEEL_ZOOM_SENSITIVITY = 0.00125;

export const STABLE_CHART_RENDER_WINDOW_SECONDS = DEFAULT_RENDER_WINDOW_SECONDS;
export const STABLE_CHART_RIGHT_BUFFER_RATIO = DEFAULT_RIGHT_BUFFER_RATIO;
export const STABLE_CHART_DATA_PLOT_RATIO = 1 - DEFAULT_RIGHT_BUFFER_RATIO;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Projects any source viewport into a fixed renderer window. Keeping the
 * renderer window constant lets zoom and pan update coordinates directly,
 * without asking the renderer to replay its window-change animation.
 */
export function stableChartViewportProjection(viewport, options = {}) {
  const sourceFrom = finiteNumber(viewport?.from, 0);
  const requestedTo = finiteNumber(viewport?.to, sourceFrom + 1);
  const sourceTo = requestedTo > sourceFrom ? requestedTo : sourceFrom + 1;
  const sourceDuration = sourceTo - sourceFrom;
  const renderWindowSeconds = Math.max(
    1,
    finiteNumber(options.renderWindowSeconds, DEFAULT_RENDER_WINDOW_SECONDS),
  );
  const rightBufferRatio = Math.max(
    0,
    Math.min(0.25, finiteNumber(options.rightBufferRatio, DEFAULT_RIGHT_BUFFER_RATIO)),
  );
  const dataPlotRatio = 1 - rightBufferRatio;
  const renderNow = finiteNumber(options.nowSeconds, Date.now() / 1_000);
  const renderFrom = renderNow - renderWindowSeconds * dataPlotRatio;
  const renderRight = renderNow + renderWindowSeconds * rightBufferRatio;
  const scale = (renderNow - renderFrom) / sourceDuration;

  const toRenderTime = sourceTime => (
    renderFrom + (finiteNumber(sourceTime, sourceFrom) - sourceFrom) * scale
  );
  const toSourceTime = renderTime => (
    sourceFrom + (finiteNumber(renderTime, renderFrom) - renderFrom) / scale
  );
  const toPlotRatio = sourceTime => (
    (toRenderTime(sourceTime) - renderFrom) / renderWindowSeconds
  );
  const sourceTimeAtPlotRatio = (ratio, { clampToData = true } = {}) => {
    const plotRatio = Math.max(0, Math.min(1, finiteNumber(ratio, 0)));
    const dataRatio = clampToData ? Math.min(plotRatio, dataPlotRatio) : plotRatio;
    return toSourceTime(renderFrom + dataRatio * renderWindowSeconds);
  };

  return Object.freeze({
    dataPlotRatio,
    renderFrom,
    renderNow,
    renderRight,
    renderWindowSeconds,
    rightBufferRatio,
    scale,
    sourceDuration,
    sourceFrom,
    sourceRight: toSourceTime(renderRight),
    sourceTimeAtPlotRatio,
    sourceTo,
    toPlotRatio,
    toRenderTime,
    toSourceTime,
  });
}

/**
 * Normalizes mouse wheels and trackpads to small, continuous zoom steps.
 */
export function chartWheelZoomFactor(deltaY, {
  deltaMode = 0,
  viewportHeight = 800,
} = {}) {
  let pixels = finiteNumber(deltaY, 0);
  if (deltaMode === 1) pixels *= WHEEL_LINE_HEIGHT_PX;
  if (deltaMode === 2) pixels *= Math.max(1, finiteNumber(viewportHeight, 800));
  pixels = Math.max(-MAX_WHEEL_DELTA_PX, Math.min(MAX_WHEEL_DELTA_PX, pixels));
  return Math.exp(pixels * WHEEL_ZOOM_SENSITIVITY);
}
