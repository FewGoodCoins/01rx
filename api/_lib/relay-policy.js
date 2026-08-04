import {
  FUTARCHY_BETA_VIEWS,
  FUTARCHY_STABLE_V1_VIEWS,
} from '@01resolved/contracts';

export const PRIVATE_NO_STORE = 'private, no-store';
export const PUBLIC_LIVE_CACHE = 'public, s-maxage=10, stale-while-revalidate=20';
export const PUBLIC_HISTORY_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';
export const PUBLIC_CONFIG_CACHE = 'public, s-maxage=300, stale-while-revalidate=600';
export const MAX_PRIVATE_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MAX_PUBLIC_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_CHART_RESPONSE_BYTES = 16 * 1024 * 1024;

const READ_METHODS = Object.freeze(['GET', 'HEAD']);
const POST_METHOD = Object.freeze(['POST']);

function policy(cacheControl, maxResponseBytes, methods = READ_METHODS) {
  return Object.freeze({
    cacheControl,
    maxResponseBytes,
    methods,
  });
}

const LIVE = policy(PUBLIC_LIVE_CACHE, MAX_PUBLIC_RESPONSE_BYTES);
const HISTORY = policy(PUBLIC_HISTORY_CACHE, MAX_CHART_RESPONSE_BYTES);
const CONFIG = policy(PUBLIC_CONFIG_CACHE, MAX_PUBLIC_RESPONSE_BYTES);
const PRIVATE_READ = policy(PRIVATE_NO_STORE, MAX_PRIVATE_RESPONSE_BYTES);
const PRIVATE_POST = policy(
  PRIVATE_NO_STORE,
  MAX_PRIVATE_RESPONSE_BYTES,
  POST_METHOD,
);

// These paths are the browser and public research surfaces shipped by 01RX.
// Additions require an explicit cache and response-size review here.
const EXACT_READ_POLICIES = new Map([
  ['/api/activity', LIVE],
  ['/api/allowance', LIVE],
  ['/api/buyback-efficiency', LIVE],
  ['/api/buyback-hourly', LIVE],
  ['/api/company-growth-metrics', HISTORY],
  ['/api/current', LIVE],
  ['/api/current-nav', LIVE],
  ['/api/fee-history', HISTORY],
  ['/api/growth-metrics', HISTORY],
  ['/api/health', PRIVATE_READ],
  ['/api/historic-nav', HISTORY],
  ['/api/holders', LIVE],
  ['/api/home-bootstrap', LIVE],
  ['/api/list-tokens', CONFIG],
  ['/api/maintenance', PRIVATE_READ],
  ['/api/market-tickers', LIVE],
  ['/api/markets', LIVE],
  ['/api/nav-evidence', HISTORY],
  ['/api/ohlcv', HISTORY],
  ['/api/pools', LIVE],
  ['/api/projects', CONFIG],
  ['/api/proposal-markets', LIVE],
  ['/api/proposals', LIVE],
  ['/api/snapshot-info', PRIVATE_READ],
  ['/api/snapshots/latest', LIVE],
  ['/api/sparklines', LIVE],
  ['/api/summary', LIVE],
  ['/api/token-bootstrap', LIVE],
  ['/api/tickers', LIVE],
  ['/api/tokens-config', CONFIG],
  ['/api/tokens-list', CONFIG],
  ['/api/watchlist', CONFIG],
]);

const PROJECT_ROUTE = /^\/api\/projects\/[a-z0-9][a-z0-9-]{0,63}(?:\/(nav|proposals|risk|treasury))?$/;

function oneView(url) {
  const values = url.searchParams.getAll('view');
  return values.length === 1 ? values[0] : '';
}

function futarchyPolicy(url) {
  const view = oneView(url);
  if (url.pathname === '/api/v1/futarchy') {
    return FUTARCHY_STABLE_V1_VIEWS.includes(view)
      ? (view === 'proposal-history' ? HISTORY : LIVE)
      : null;
  }
  if (url.pathname !== '/api/beta/futarchy') return null;
  if (!FUTARCHY_BETA_VIEWS.includes(view)) return null;
  if (view === 'solana-rpc') return PRIVATE_POST;
  if (view === 'positions' || (view === 'market-data' && url.searchParams.has('owner'))) {
    return PRIVATE_READ;
  }
  return LIVE;
}

/**
 * Return the reviewed route policy, or null when the upstream route is not an
 * intentional 01RX surface. The method is checked separately so callers can
 * return a precise Allow header without opening an unknown path.
 */
export function relayRoutePolicy(requestUrl) {
  let url;
  try {
    url = requestUrl instanceof URL
      ? requestUrl
      : new URL(String(requestUrl || '/'), 'https://01rx.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://01rx.invalid') return null;

  const futarchy = futarchyPolicy(url);
  if (futarchy) return futarchy;
  if (url.pathname === '/api/snapshot-refresh') return PRIVATE_POST;
  const projectMatch = PROJECT_ROUTE.exec(url.pathname);
  if (projectMatch) return projectMatch[1] ? LIVE : CONFIG;
  return EXACT_READ_POLICIES.get(url.pathname) || null;
}

export function methodAllowed(policyValue, method) {
  return Boolean(policyValue?.methods?.includes(String(method || '').toUpperCase()));
}

export const _test = Object.freeze({
  EXACT_READ_POLICIES,
  PROJECT_ROUTE,
});
