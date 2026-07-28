import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
} from 'lightweight-charts';
import { createPriceNavGradientPrimitive } from './gradient-primitive.js';
import { buildProjectedNav, marketSnapshot } from './model.js';

const DEFAULT_VISIBILITY = Object.freeze({
  currentNav: true,
  currentPrice: true,
  gradient: false,
  historicNav: true,
  historicPrice: true,
  projectedNav: false,
});

function pricePrecision(value) {
  const number = Math.abs(Number(value));
  if (!Number.isFinite(number) || number >= 100) return 2;
  if (number >= 1) return 4;
  if (number >= 0.01) return 5;
  return 8;
}

function priceFormat(value) {
  return {
    minMove: 10 ** -pricePrecision(value),
    precision: pricePrecision(value),
    type: 'price',
  };
}

export function createOwnershipChart({
  container,
  onCrosshair,
} = {}) {
  if (!container) throw new Error('Chart container is required');
  const chart = createChart(container, {
    autoSize: true,
    crosshair: {
      mode: CrosshairMode.Normal,
      horzLine: { color: '#777772', labelBackgroundColor: '#20201f', style: 3 },
      vertLine: { color: '#777772', labelBackgroundColor: '#20201f', style: 3 },
    },
    grid: {
      horzLines: { color: '#222221' },
      vertLines: { color: '#1c1c1b' },
    },
    handleScale: true,
    handleScroll: true,
    layout: {
      attributionLogo: true,
      background: { color: '#101010' },
      textColor: '#8e8e88',
    },
    rightPriceScale: {
      borderColor: '#292929',
      scaleMargins: { top: 0.12, bottom: 0.12 },
    },
    timeScale: {
      borderColor: '#292929',
      rightOffset: 4,
      secondsVisible: false,
      timeVisible: true,
    },
  });

  const priceSeries = chart.addSeries(CandlestickSeries, {
    borderDownColor: '#ff5f6d',
    borderUpColor: '#35d093',
    downColor: '#ff5f6d',
    lastValueVisible: false,
    priceLineVisible: false,
    upColor: '#35d093',
    wickDownColor: '#ff5f6d',
    wickUpColor: '#35d093',
  });
  const navSeries = chart.addSeries(LineSeries, {
    color: '#ffcc00',
    crosshairMarkerBorderColor: '#101010',
    crosshairMarkerBackgroundColor: '#ffcc00',
    lastValueVisible: false,
    lineWidth: 2,
    priceLineVisible: false,
  });
  const projectedNavSeries = chart.addSeries(LineSeries, {
    color: 'rgba(255, 204, 0, 0.72)',
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    lineStyle: LineStyle.Dashed,
    lineWidth: 2,
    priceLineVisible: false,
    visible: false,
  });
  const gradient = createPriceNavGradientPrimitive({
    chart,
    navSeries,
    priceSeries,
  });
  priceSeries.attachPrimitive(gradient);

  let candles = [];
  let navRows = [];
  let projectedNav = [];
  let visibility = { ...DEFAULT_VISIBILITY };
  let referenceLines = [];

  function removeReferenceLines() {
    referenceLines.forEach(({ host, line }) => {
      try {
        host.removePriceLine(line);
      } catch {
        // A stale line may already have been removed during a data reset.
      }
    });
    referenceLines = [];
  }

  function addReferenceLine(price, color) {
    if (!(Number(price) > 0)) return;
    const line = priceSeries.createPriceLine({
      axisLabelTextColor: color === '#ffcc00' ? '#101010' : '#101010',
      axisLabelVisible: true,
      color,
      lineStyle: LineStyle.SparseDotted,
      lineVisible: true,
      lineWidth: 1,
      price: Number(price),
      title: '',
    });
    referenceLines.push({ host: priceSeries, line });
  }

  function syncReferenceLines() {
    removeReferenceLines();
    const snapshot = marketSnapshot(candles, navRows);
    if (visibility.currentPrice) addReferenceLine(snapshot.price, '#f3f3ef');
    if (visibility.currentNav) addReferenceLine(snapshot.nav, '#ffcc00');
  }

  function syncVisibility({ fit = false } = {}) {
    priceSeries.applyOptions({ visible: visibility.historicPrice });
    navSeries.applyOptions({ visible: visibility.historicNav });
    projectedNavSeries.applyOptions({
      visible: visibility.projectedNav && projectedNav.length > 0,
    });
    gradient.setEnabled(
      visibility.gradient
      && visibility.historicPrice
      && visibility.historicNav,
    );
    syncReferenceLines();
    if (fit) chart.timeScale().fitContent();
  }

  function setData({
    candles: nextCandles,
    monthlySpend,
    navRows: nextNavRows,
  }) {
    candles = Array.isArray(nextCandles) ? nextCandles : [];
    navRows = Array.isArray(nextNavRows) ? nextNavRows : [];
    projectedNav = buildProjectedNav(navRows, { monthlySpend });
    const pricePoints = candles.map(candle => ({
      time: candle.time,
      value: candle.close,
    }));
    const latest = candles.at(-1)?.close || navRows.at(-1)?.value || 1;
    const format = priceFormat(latest);
    priceSeries.applyOptions({ priceFormat: format });
    navSeries.applyOptions({ priceFormat: format });
    projectedNavSeries.applyOptions({ priceFormat: format });
    priceSeries.setData(candles);
    navSeries.setData(navRows);
    projectedNavSeries.setData(projectedNav);
    gradient.setData(pricePoints, navRows);
    syncVisibility();
    chart.timeScale().fitContent();
    return {
      projectedNav,
      snapshot: marketSnapshot(candles, navRows),
    };
  }

  function setVisibility(nextVisibility) {
    visibility = {
      ...visibility,
      ...nextVisibility,
    };
    if (visibility.gradient) {
      visibility.historicPrice = true;
      visibility.historicNav = true;
    }
    syncVisibility({ fit: true });
    return { ...visibility };
  }

  chart.subscribeCrosshairMove((parameter) => {
    if (typeof onCrosshair !== 'function') return;
    const candle = parameter?.seriesData?.get(priceSeries);
    const navPoint = parameter?.seriesData?.get(navSeries);
    onCrosshair({
      nav: Number(navPoint?.value),
      price: Number(candle?.close),
      time: parameter?.time || null,
    });
  });

  return {
    chart,
    destroy() {
      removeReferenceLines();
      chart.remove();
    },
    getVisibility() {
      return { ...visibility };
    },
    setData,
    setVisibility,
  };
}
