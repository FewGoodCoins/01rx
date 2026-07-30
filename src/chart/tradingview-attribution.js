const TRADINGVIEW_ATTRIBUTION_URL =
  'https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart';

const TRADINGVIEW_MARKUP = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 19" fill="none" aria-hidden="true">
    <g fill-rule="evenodd" clip-rule="evenodd">
      <path fill="#D1D4DC" d="M14 2H2v6h6v9h6V2Zm12 15h-7l6-15h7l-6 15Zm-7-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
    </g>
  </svg>
`;

/**
 * Mount the shared TradingView attribution used by every 01RX chart surface.
 * Keeping this outside either renderer prevents the Lightweight Charts and
 * Advanced Charts adapters from developing separate visual treatments.
 */
export function mountTradingViewAttribution(container, {
  runtime = globalThis.window,
} = {}) {
  if (!container || typeof container.querySelector !== 'function') return null;

  const existing = container.querySelector('[data-01rx-tradingview-attribution]');
  if (existing) return existing;

  const document = container.ownerDocument || runtime?.document;
  if (!document?.createElement) return null;

  const attribution = document.createElement('a');
  attribution.className = 'tv-logo-circle';
  attribution.href = TRADINGVIEW_ATTRIBUTION_URL;
  attribution.target = '_blank';
  attribution.rel = 'noreferrer';
  attribution.title = 'Charting by TradingView';
  attribution.setAttribute('aria-label', 'Charting by TradingView');
  attribution.setAttribute('data-01rx-tradingview-attribution', '');
  attribution.innerHTML = TRADINGVIEW_MARKUP;
  container.appendChild(attribution);
  return attribution;
}

export function installBrowserTradingViewAttribution(runtime = globalThis.window) {
  if (!runtime) return null;
  const navgator = runtime.NAVGATOR = runtime.NAVGATOR || {};
  navgator.chartUi = {
    ...(navgator.chartUi || {}),
    mountTradingViewAttribution,
  };
  return navgator.chartUi;
}
