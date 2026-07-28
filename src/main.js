import './style.css';
import { createOwnershipChart } from './chart/chart-controller.js';
import { createMarketDataClient } from './chart/data-client.js';

const API_BASE = import.meta.env.VITE_NAVGATOR_API_BASE || 'https://navgator.xyz';
const TIMEFRAME_LABELS = Object.freeze({
  '15m': '15m',
  '1H': '1H',
  '4H': '4H',
  '1D': '1D',
  '1W': '1W',
});

const elements = {
  assetLogo: document.querySelector('#asset-logo'),
  assetName: document.querySelector('#asset-name'),
  assetTicker: document.querySelector('#asset-ticker'),
  chart: document.querySelector('#chart'),
  chartStatus: document.querySelector('#chart-status'),
  featuresMenu: document.querySelector('#features-menu'),
  featuresTrigger: document.querySelector('#features-trigger'),
  legendNav: document.querySelector('#legend-nav'),
  legendNavLabel: document.querySelector('#legend-nav-label'),
  legendPrice: document.querySelector('#legend-price'),
  legendSpread: document.querySelector('#legend-spread'),
  legendSymbol: document.querySelector('#legend-symbol'),
  legendTimeframe: document.querySelector('#legend-timeframe'),
  marketSearch: document.querySelector('#market-search'),
  projectionNote: document.querySelector('#projection-note'),
  seriesMenu: document.querySelector('#series-menu'),
  seriesTrigger: document.querySelector('#series-trigger'),
  statNav: document.querySelector('#stat-nav'),
  statPrice: document.querySelector('#stat-price'),
  statSpread: document.querySelector('#stat-spread'),
  statSupply: document.querySelector('#stat-supply'),
  statTreasury: document.querySelector('#stat-treasury'),
  timeframeMenu: document.querySelector('#timeframe-menu'),
  timeframeTrigger: document.querySelector('#timeframe-trigger'),
  tokenInput: document.querySelector('#token-input'),
};

const dataClient = createMarketDataClient({ baseUrl: API_BASE });
let timeframe = '1D';
let token = new URLSearchParams(location.search).get('token') || 'solo';
let abortController = null;
let latestSnapshot = null;

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 100) return `$${number.toFixed(2)}`;
  if (Math.abs(number) >= 1) return `$${number.toFixed(4)}`;
  return `$${number.toFixed(5)}`;
}

function formatCompact(value, money = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const prefix = money ? '$' : '';
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000_000) return `${prefix}${(number / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `${prefix}${(number / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `${prefix}${(number / 1_000).toFixed(1)}K`;
  return `${prefix}${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatSpread(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function spreadClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '';
  return number > 0 ? 'positive' : 'negative';
}

function updateValueSet({ nav, navKind, price } = {}) {
  const activePrice = Number.isFinite(Number(price)) ? Number(price) : latestSnapshot?.price;
  const activeNav = Number.isFinite(Number(nav)) ? Number(nav) : latestSnapshot?.nav;
  const spread = activePrice > 0 && activeNav > 0
    ? (activePrice / activeNav - 1) * 100
    : null;
  elements.legendPrice.textContent = formatPrice(activePrice);
  elements.legendNavLabel.textContent = navKind === 'projected' ? 'Projected NAV' : 'NAV';
  elements.legendNav.textContent = formatPrice(activeNav);
  elements.legendSpread.textContent = formatSpread(spread);
  elements.legendSpread.className = spreadClass(spread);
}

const chart = createOwnershipChart({
  container: elements.chart,
  onCrosshair(values) {
    if (!values.time) {
      updateValueSet();
      return;
    }
    updateValueSet(values);
  },
});

function setMenuOpen(trigger, menu, open) {
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  menu.hidden = !open;
}

function bindMenu(trigger, menu) {
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = trigger.getAttribute('aria-expanded') !== 'true';
    document.querySelectorAll('.toolbar-menu:not([hidden])').forEach((other) => {
      if (other !== menu) {
        other.hidden = true;
        document.querySelector(`[aria-controls="${other.id}"]`)?.setAttribute('aria-expanded', 'false');
      }
    });
    setMenuOpen(trigger, menu, open);
  });
}

bindMenu(elements.timeframeTrigger, elements.timeframeMenu);
bindMenu(elements.seriesTrigger, elements.seriesMenu);
bindMenu(elements.featuresTrigger, elements.featuresMenu);

document.addEventListener('click', () => {
  setMenuOpen(elements.timeframeTrigger, elements.timeframeMenu, false);
  setMenuOpen(elements.seriesTrigger, elements.seriesMenu, false);
  setMenuOpen(elements.featuresTrigger, elements.featuresMenu, false);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  setMenuOpen(elements.timeframeTrigger, elements.timeframeMenu, false);
  setMenuOpen(elements.seriesTrigger, elements.seriesMenu, false);
  setMenuOpen(elements.featuresTrigger, elements.featuresMenu, false);
});

function syncVisibilityMenus() {
  const visibility = chart.getVisibility();
  elements.seriesMenu.querySelectorAll('[data-series]').forEach((button) => {
    const active = visibility[button.dataset.series] === true;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  elements.featuresMenu.querySelectorAll('[data-feature]').forEach((button) => {
    const active = visibility[button.dataset.feature] === true;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  elements.projectionNote.hidden = !visibility.projectedNav;
}

elements.seriesMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-series]');
  if (!button) return;
  const key = button.dataset.series;
  const visibility = chart.getVisibility();
  chart.setVisibility({ [key]: !visibility[key] });
  syncVisibilityMenus();
});

elements.featuresMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-feature]');
  if (!button) return;
  const key = button.dataset.feature;
  const visibility = chart.getVisibility();
  chart.setVisibility({ [key]: !visibility[key] });
  syncVisibilityMenus();
});

elements.timeframeMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-timeframe]');
  if (!button || button.dataset.timeframe === timeframe) return;
  timeframe = button.dataset.timeframe;
  void loadMarket();
});

elements.marketSearch.addEventListener('submit', (event) => {
  event.preventDefault();
  const nextToken = elements.tokenInput.value.trim().toLowerCase();
  if (!nextToken) return;
  token = nextToken;
  const url = new URL(location.href);
  url.searchParams.set('token', token);
  history.replaceState(null, '', url);
  void loadMarket();
});

function syncTimeframeMenu() {
  elements.timeframeTrigger.textContent = TIMEFRAME_LABELS[timeframe] || timeframe;
  elements.legendTimeframe.textContent = TIMEFRAME_LABELS[timeframe] || timeframe;
  elements.timeframeMenu.querySelectorAll('[data-timeframe]').forEach((button) => {
    const active = button.dataset.timeframe === timeframe;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function setAssetLogo(config, tokenKey) {
  const ticker = String(config?.ticker || tokenKey).toUpperCase();
  elements.assetLogo.replaceChildren();
  if (config?.logo) {
    const image = document.createElement('img');
    image.src = config.logo;
    image.alt = '';
    image.addEventListener('error', () => {
      elements.assetLogo.textContent = ticker.slice(0, 1);
    }, { once: true });
    elements.assetLogo.appendChild(image);
  } else {
    elements.assetLogo.textContent = ticker.slice(0, 1);
  }
}

function syncMarketHeader(market, result) {
  const ticker = String(market.config?.ticker || market.token).toUpperCase();
  latestSnapshot = result.snapshot;
  elements.assetTicker.textContent = ticker;
  elements.assetName.textContent = market.config?.name || 'Ownership token';
  elements.legendSymbol.textContent = `${ticker} / USD`;
  elements.tokenInput.value = market.token;
  setAssetLogo(market.config, market.token);
  elements.statPrice.textContent = formatPrice(result.snapshot.price);
  elements.statNav.textContent = formatPrice(result.snapshot.nav);
  elements.statSpread.textContent = formatSpread(result.snapshot.spread);
  elements.statSpread.className = spreadClass(result.snapshot.spread);
  elements.statTreasury.textContent = formatCompact(result.snapshot.treasury, true);
  elements.statSupply.textContent = formatCompact(result.snapshot.effectiveSupply);
  const projection = result.projection;
  const monthlySpend = projection.monthlySpendConfigured
    ? `${formatCompact(projection.monthlySpend, true)}/mo spend`
    : 'no monthly spend configured';
  elements.projectionNote.textContent = [
    'Projected NAV',
    monthlySpend,
    `${projection.horizonMonths}-month horizon`,
    `constant ${formatCompact(projection.effectiveSupply)} supply`,
  ].join(' · ');
  updateValueSet();
}

async function loadMarket() {
  abortController?.abort();
  abortController = new AbortController();
  syncTimeframeMenu();
  elements.chartStatus.textContent = 'Loading market data…';
  try {
    const market = await dataClient.loadMarket(token, timeframe, {
      signal: abortController.signal,
    });
    if (!market.candles.length) throw new Error('No public price history is available');
    const result = chart.setData({
      candles: market.candles,
      monthlySpend: market.config?.monthlyAllowance,
      navRows: market.navRows,
    });
    syncMarketHeader(market, result);
    syncVisibilityMenus();
    const actual = market.actualPriceTimeframe === market.actualNavTimeframe
      ? market.actualPriceTimeframe
      : `${market.actualPriceTimeframe} price · ${market.actualNavTimeframe} NAV`;
    elements.chartStatus.textContent = `${market.candles.length} price bars · ${market.navRows.length} NAV points · ${actual}`;
  } catch (error) {
    if (error?.name === 'AbortError') return;
    elements.chartStatus.textContent = error?.message || 'Unable to load market data';
  }
}

syncVisibilityMenus();
syncTimeframeMenu();
void loadMarket();
