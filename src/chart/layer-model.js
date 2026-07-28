import {
  alignPriceAndNav,
  buildGradientRegions,
  buildProjectedNav,
  interpolateSeriesValue,
  marketSnapshot,
} from './model.js';

export const DEFAULT_LAYER_VISIBILITY = Object.freeze({
  currentNav: true,
  currentPrice: true,
  gradient: false,
  historicNav: true,
  historicPrice: true,
  projectedNav: false,
});

const VISIBILITY_KEYS = Object.keys(DEFAULT_LAYER_VISIBILITY);

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function finitePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.max(1, Math.round(number))
    : fallback;
}

export function normalizeLayerVisibility(
  nextVisibility = {},
  currentVisibility = DEFAULT_LAYER_VISIBILITY,
) {
  const visibility = {};
  VISIBILITY_KEYS.forEach((key) => {
    if (typeof nextVisibility?.[key] === 'boolean') {
      visibility[key] = nextVisibility[key];
      return;
    }
    if (typeof currentVisibility?.[key] === 'boolean') {
      visibility[key] = currentVisibility[key];
      return;
    }
    visibility[key] = DEFAULT_LAYER_VISIBILITY[key];
  });

  // A price-to-NAV fill cannot be rendered without both boundary series.
  if (visibility.gradient) {
    visibility.historicPrice = true;
    visibility.historicNav = true;
  }
  return visibility;
}

export function buildChartLayerModel({
  candles = [],
  horizonMonths = 12,
  monthlySpend,
  navRows = [],
  visibility = DEFAULT_LAYER_VISIBILITY,
} = {}) {
  const priceCandles = Array.isArray(candles) ? candles : [];
  const historicNav = Array.isArray(navRows) ? navRows : [];
  const historicPrice = priceCandles.map(candle => ({
    time: candle.time,
    value: candle.close,
  }));
  const projectionHorizon = finitePositiveInteger(horizonMonths, 12);
  const spendWasConfigured = Number.isFinite(Number(monthlySpend))
    && Number(monthlySpend) >= 0;
  const normalizedMonthlySpend = finiteNonNegative(monthlySpend);
  const projectedNav = buildProjectedNav(historicNav, {
    horizonMonths: projectionHorizon,
    monthlySpend: normalizedMonthlySpend,
  });
  const projectionAnchor = projectedNav[0] || null;
  const snapshot = marketSnapshot(priceCandles, historicNav);
  const alignedGradient = alignPriceAndNav(historicPrice, historicNav);

  return {
    version: 1,
    visibility: normalizeLayerVisibility(visibility),
    series: {
      historicPrice,
      historicPriceCandles: priceCandles,
      historicNav,
      projectedNav,
    },
    references: {
      currentPrice: snapshot.price,
      currentNav: snapshot.nav,
    },
    gradient: {
      aligned: alignedGradient,
      regions: buildGradientRegions(historicPrice, historicNav),
    },
    projection: {
      available: projectedNav.length > 1,
      anchorTime: projectionAnchor?.time ?? null,
      horizonMonths: projectionHorizon,
      monthlySpend: normalizedMonthlySpend,
      monthlySpendConfigured: spendWasConfigured,
      startingTreasury: projectionAnchor?.treasury ?? null,
      effectiveSupply: projectionAnchor?.effectiveSupply ?? null,
      supplyPolicy: 'constant',
    },
    snapshot,
  };
}

export function layerValuesAtTime(layerModel, time) {
  const targetTime = Number(time);
  if (!layerModel || !Number.isFinite(targetTime)) {
    return {
      nav: null,
      navKind: null,
      price: null,
      spread: null,
      time: null,
    };
  }

  const { series, projection, visibility } = layerModel;
  const price = visibility.historicPrice
    ? interpolateSeriesValue(series.historicPrice, targetTime)
    : null;
  const latestHistoricNavTime = Number(series.historicNav.at(-1)?.time);
  const isProjectedTime = (
    visibility.projectedNav
    && projection.available
    && Number.isFinite(projection.anchorTime)
    && targetTime > Math.max(
      projection.anchorTime,
      Number.isFinite(latestHistoricNavTime) ? latestHistoricNavTime : 0,
    )
  );
  const historicNav = visibility.historicNav
    ? interpolateSeriesValue(series.historicNav, targetTime)
    : null;
  const projectedNav = isProjectedTime
    ? interpolateSeriesValue(series.projectedNav, targetTime)
    : null;
  const nav = Number.isFinite(projectedNav) ? projectedNav : historicNav;
  const spread = Number(price) > 0 && Number(nav) > 0
    ? (price / nav - 1) * 100
    : null;

  return {
    nav: Number.isFinite(nav) ? nav : null,
    navKind: Number.isFinite(projectedNav)
      ? 'projected'
      : (Number.isFinite(historicNav) ? 'historic' : null),
    price: Number.isFinite(price) ? price : null,
    spread: Number.isFinite(spread) ? spread : null,
    time: targetTime,
  };
}
