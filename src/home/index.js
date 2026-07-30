import '@01resolved/ui/tokens.css';
import '../../styles/futard-terminal.css';
import { landingUrl } from '../core/landing-asset.js';
import { revealMarketWorkspace } from '../core/market-boot.js';
import { isFutarchyTerminalPath } from '../core/page-entry.js';
import { mountFutardTerminal } from '../markets/decision-market-controller.js';
import { createProposalHistoryChart } from '../markets/proposal-history-chart.js';

export const pageKind = 'home';

function setMetaContent(document, selector, content) {
  const element = document.querySelector(selector);
  if (element) element.setAttribute('content', content);
}

function installMarketsMetadata(browserWindow) {
  const { document } = browserWindow;
  const discoveryUrl = browserWindow.NAVGATOR?.shell?.routes?.marketDiscoveryUrl?.()
    || '/?view=markets&archive=1';
  document.title = 'Decision Markets — 01RX';
  setMetaContent(
    document,
    'meta[name="description"]',
    'Discover live and resolved governance proposals, compare PASS and FAIL markets, and open token-scoped decision trading on 01RX.',
  );
  setMetaContent(document, 'meta[property="og:title"]', 'Decision Markets — 01RX');
  setMetaContent(
    document,
    'meta[property="og:description"]',
    'Live and resolved proposal markets, PASS and FAIL decision signals, and treasury context.',
  );
  setMetaContent(document, 'meta[property="og:url"]', `${browserWindow.location.origin}${discoveryUrl}`);
  setMetaContent(document, 'meta[name="twitter:title"]', 'Decision Markets — 01RX');
  setMetaContent(
    document,
    'meta[name="twitter:description"]',
    'Live and resolved proposal markets, PASS and FAIL decision signals, and treasury context.',
  );
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', `${browserWindow.location.origin}${discoveryUrl}`);
}

function requestedDiscoveryView(browserWindow) {
  const params = new browserWindow.URLSearchParams(browserWindow.location.search);
  return params.get('view') === 'markets' && (
    params.get('archive') === '1'
    || Boolean(params.get('filter'))
    || Boolean(params.get('proposal'))
    || params.get('history') === '1'
  );
}

function configureWorkspaceNavigation(browserWindow, markets) {
  const routes = browserWindow.NAVGATOR?.shell?.routes;
  const researchLink = browserWindow.document.querySelector('.site-header-navgator');
  const marketsLink = browserWindow.document.querySelector('.site-header-decision');
  if (researchLink) {
    researchLink.href = '/';
    if (!markets) researchLink.setAttribute('aria-current', 'page');
    else researchLink.removeAttribute('aria-current');
  }
  if (marketsLink) {
    marketsLink.href = routes?.marketHomeUrl?.()
      || '/?token=solo&view=markets&tab=tokens';
    if (markets) marketsLink.setAttribute('aria-current', 'page');
    else marketsLink.removeAttribute('aria-current');
  }
}

function redirectLegacyTerminal(browserWindow) {
  if (!isFutarchyTerminalPath(browserWindow.location.pathname)) return false;
  const params = new browserWindow.URLSearchParams(browserWindow.location.search);
  const routes = browserWindow.NAVGATOR?.shell?.routes;
  const hasArchiveIntent = Boolean(
    params.get('proposal')
    || params.get('filter')
    || params.get('history') === '1',
  );
  const destination = hasArchiveIntent
    ? routes?.marketDiscoveryUrl({
      proposal: params.get('proposal'),
      filter: params.get('filter'),
    }) || '/?view=markets&archive=1'
    : routes?.marketHomeUrl?.() || '/?token=solo&view=markets&tab=tokens';
  browserWindow.NAVGATOR.legacyTerminalRedirect = destination;
  browserWindow.location.replace(destination);
  return true;
}

function redirectMarketsHomepage(browserWindow) {
  const params = new browserWindow.URLSearchParams(browserWindow.location.search);
  if (params.get('view') !== 'markets' || requestedDiscoveryView(browserWindow)) return false;
  const destination = browserWindow.NAVGATOR?.shell?.routes?.marketHomeUrl?.()
    || '/?token=solo&view=markets&tab=tokens';
  browserWindow.NAVGATOR.marketHomeRedirect = destination;
  browserWindow.location.replace(destination);
  return true;
}

export function installBrowserPage(browserWindow) {
  if (redirectLegacyTerminal(browserWindow)) return browserWindow.NAVGATOR;
  if (redirectMarketsHomepage(browserWindow)) return browserWindow.NAVGATOR;
  const isMarkets = requestedDiscoveryView(browserWindow);
  browserWindow.document.body.classList.toggle('is-market-discovery', isMarkets);
  configureWorkspaceNavigation(browserWindow, isMarkets);
  if (isMarkets) {
    browserWindow.document.documentElement.classList.add('ft-terminal-active');
    installMarketsMetadata(browserWindow);
  }
  return browserWindow.NAVGATOR;
}

export async function loadLegacyPage({ loadClassicScript }) {
  await loadClassicScript(landingUrl);

  if (
    window.NAVGATOR.legacyTerminalRedirect
    || window.NAVGATOR.marketHomeRedirect
    || !requestedDiscoveryView(window)
  ) {
    return;
  }

  const root = document.getElementById('decision-markets-home-root');
  if (!root) return;
  root.hidden = false;

  window.NAVGATOR.marketWorkspace = mountFutardTerminal({
    window,
    root,
    createProposalHistoryChart,
    mode: 'discovery',
  });
  revealMarketWorkspace(document);
  // The classic landing bootstrap sets its own homepage title while loading.
  // Re-apply Markets metadata after that bootstrap has completed.
  installMarketsMetadata(window);
}
