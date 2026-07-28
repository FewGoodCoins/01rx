import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
} from 'lightweight-charts';
import { createPriceNavGradientPrimitive } from './gradient-primitive.js';
import {
  buildChartLayerModel,
  DEFAULT_LAYER_VISIBILITY,
  layerValuesAtTime,
  normalizeLayerVisibility,
} from './layer-model.js';

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

  let layerModel = null;
  let visibility = { ...DEFAULT_LAYER_VISIBILITY };
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
    if (!layerModel) return;
    if (visibility.currentPrice) {
      addReferenceLine(layerModel.references.currentPrice, '#f3f3ef');
    }
    if (visibility.currentNav) {
      addReferenceLine(layerModel.references.currentNav, '#ffcc00');
    }
  }

  function syncVisibility({ fit = false } = {}) {
    priceSeries.applyOptions({ visible: visibility.historicPrice });
    navSeries.applyOptions({ visible: visibility.historicNav });
    projectedNavSeries.applyOptions({
      visible: visibility.projectedNav && layerModel?.projection.available === true,
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
    horizonMonths,
    monthlySpend,
    navRows: nextNavRows,
  }) {
    layerModel = buildChartLayerModel({
      candles: nextCandles,
      horizonMonths,
      monthlySpend,
      navRows: nextNavRows,
      visibility,
    });
    visibility = layerModel.visibility;
    const latest = (
      layerModel.snapshot.price
      || layerModel.snapshot.nav
      || 1
    );
    const format = priceFormat(latest);
    priceSeries.applyOptions({ priceFormat: format });
    navSeries.applyOptions({ priceFormat: format });
    projectedNavSeries.applyOptions({ priceFormat: format });
    priceSeries.setData(layerModel.series.historicPriceCandles);
    navSeries.setData(layerModel.series.historicNav);
    projectedNavSeries.setData(layerModel.series.projectedNav);
    gradient.setData(layerModel.gradient.aligned);
    syncVisibility();
    chart.timeScale().fitContent();
    return {
      layerModel,
      projectedNav: layerModel.series.projectedNav,
      projection: layerModel.projection,
      snapshot: layerModel.snapshot,
    };
  }

  function setVisibility(nextVisibility) {
    visibility = normalizeLayerVisibility(nextVisibility, visibility);
    if (layerModel) {
      layerModel = {
        ...layerModel,
        visibility,
      };
    }
    syncVisibility({ fit: true });
    return { ...visibility };
  }

  chart.subscribeCrosshairMove((parameter) => {
    if (typeof onCrosshair !== 'function') return;
    onCrosshair(layerValuesAtTime(layerModel, parameter?.time));
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
