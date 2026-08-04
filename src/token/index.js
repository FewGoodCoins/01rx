import '@01resolved/ui/tokens.css';
import '../../styles/futard-terminal.css';
import '../../styles/terminal-shared.css';
import { installBrowserTradingViewAttribution } from '../chart/tradingview-attribution.js';
import { installBrowserAdvancedCharts } from '../charting/advanced-charts.js';
import { landingUrl } from '../core/landing-asset.js';
import { revealMarketWorkspace } from '../core/market-boot.js';
import tokenPageUrl from '../legacy/token-page.js?url';
import { installBrowserMarketTokenSidebar } from '../markets/token-sidebar.js';
import { installBrowserTokenPage } from './runtime.js';

export const pageKind = 'token';

function routeState(browserWindow) {
  const params = new browserWindow.URLSearchParams(browserWindow.location.search);
  const routes = browserWindow.NAVGATOR?.shell?.routes;
  return {
    token: routes?.normalizeTokenKey(params.get('token')) || '',
    markets: params.get('view') === 'markets',
    marketTab: params.get('tab') === 'tokens' ? 'tokens' : 'decisions',
  };
}

function installTokenWorkspaceMetadata(browserWindow, token, marketTab = 'decisions') {
  const ticker = String(token || 'Token').toUpperCase();
  const routes = browserWindow.NAVGATOR.shell.routes;
  const params = new browserWindow.URLSearchParams(browserWindow.location.search);
  const proposal = routes.normalizeProposalAddress(params.get('proposal'));
  const ownershipMode = marketTab === 'tokens';
  browserWindow.document.title = ownershipMode
    ? `${ticker} Spot Market — 01RX`
    : `${ticker} Decision Market — 01RX`;
  const canonical = browserWindow.document.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.setAttribute(
      'href',
      `${browserWindow.location.origin}${ownershipMode
        ? routes.tokenTradingUrl(token)
        : routes.tokenMarketUrl(token, proposal)}`,
    );
  }
}

function configureWorkspaceNavigation(browserWindow, markets) {
  const routes = browserWindow.NAVGATOR.shell.routes;
  const marketsLink = browserWindow.document.querySelector('.site-header-decision');
  if (marketsLink) {
    marketsLink.href = routes.marketHomeUrl?.()
      || routes.tokenTradingUrl?.('solo')
      || '/?token=solo&view=markets&tab=tokens';
    if (markets) marketsLink.setAttribute('aria-current', 'page');
    else marketsLink.removeAttribute('aria-current');
  }
}

function beginLocalChartLibraryLoad(browserWindow) {
  const navgator = browserWindow.NAVGATOR = browserWindow.NAVGATOR || {};
  if (browserWindow.LightweightCharts) {
    navgator.lightweightChartsPromise = Promise.resolve(browserWindow.LightweightCharts);
    return;
  }
  if (navgator.lightweightChartsPromise) return;
  navgator.lightweightChartsPromise = import('lightweight-charts').then((library) => {
    browserWindow.LightweightCharts = library;
    return library;
  });
}

function activateDecisionWorkspace(browserWindow) {
  browserWindow.document.getElementById('landing-view')?.classList.remove('active');
  browserWindow.document.getElementById('dashboard-view')?.classList.add('active');
  browserWindow.document.getElementById('token-switch-loader')?.classList.remove('active');
  browserWindow.document.body.classList.add('is-token');
}

export function installBrowserPage(browserWindow) {
  const bridge = installBrowserTokenPage(browserWindow);
  installBrowserTradingViewAttribution(browserWindow);
  installBrowserAdvancedCharts(browserWindow);
  const { markets } = routeState(browserWindow);
  if (!markets) beginLocalChartLibraryLoad(browserWindow);
  if (markets) installBrowserMarketTokenSidebar(browserWindow);
  browserWindow.document.documentElement.classList.toggle(
    'is-framed-token',
    browserWindow.self !== browserWindow.top,
  );
  browserWindow.document.body.classList.toggle('is-token-markets', markets);
  return bridge;
}

export async function loadLegacyPage({ loadClassicScript }) {
  const { token, markets, marketTab } = routeState(window);
  configureWorkspaceNavigation(window, markets);
  if (!markets || !token) {
    await loadClassicScript(landingUrl);
    await loadClassicScript(tokenPageUrl);
    return;
  }

  const root = document.getElementById('token-markets-root');
  if (!root) return;
  activateDecisionWorkspace(window);
  const [
    { mountFutardTerminal },
    { createProposalHistoryChart },
  ] = await Promise.all([
    import('../markets/decision-market-controller.js'),
    import('../markets/proposal-history-chart.js'),
  ]);
  root.hidden = false;
  window.NAVGATOR.marketWorkspace?.destroy?.();
  window.NAVGATOR.marketWorkspace = mountFutardTerminal({
    window,
    root,
    createProposalHistoryChart,
    mode: 'token',
    token,
  });
  installTokenWorkspaceMetadata(window, token, marketTab);
  await window.NAVGATOR.marketWorkspace.ready;
  const workspaceState = window.NAVGATOR.marketWorkspace.getState();
  installTokenWorkspaceMetadata(
    window,
    workspaceState.token || token,
    workspaceState.workspaceTab || marketTab,
  );
  revealMarketWorkspace(document);
}
