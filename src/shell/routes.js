export function normalizeTokenKey(key) {
  if (typeof key !== 'string') return '';
  let normalized = key.trim().toLowerCase();
  const aliases = {
    futario: 'futardio',
    metadao: 'meta',
    mtncapital: 'mtn',
    mtndao: 'mtn',
    ranger: 'rngr',
  };
  if (aliases[normalized]) normalized = aliases[normalized];
  return /^[a-z0-9][a-z0-9_-]*$/.test(normalized) ? normalized : '';
}

export function normalizeTokenList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = {};
  list.forEach((item) => {
    const key = normalizeTokenKey(item);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(key);
  });
  return out;
}

export function normalizeProposalAddress(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalized) ? normalized : '';
}

export const DEFAULT_MARKET_TOKEN = 'solo';

export function createRouteHelpers(browserWindow) {
  const runtime = browserWindow || globalThis.window;

  function appRootPath() {
    let path = runtime.location.pathname || '/';
    if (/\/index\.html$/.test(path)) path = path.replace(/\/index\.html$/, '/');
    if (/\/terminal\/?$/.test(path)) path = path.replace(/terminal\/?$/, '');
    return path || '/';
  }

  function homePageUrl() {
    return appRootPath();
  }

  function queryPageUrl(params) {
    const query = new runtime.URLSearchParams(params || {}).toString();
    return query ? `${appRootPath()}?${query}` : homePageUrl();
  }

  function launchpadPageUrl(launchpadKey) {
    return launchpadKey ? queryPageUrl({ launchpad: launchpadKey }) : homePageUrl();
  }

  function marketDiscoveryUrl(options = {}) {
    const proposal = normalizeProposalAddress(options.proposal);
    const filter = ['live', 'resolved', 'indexed'].includes(options.filter)
      ? options.filter
      : '';
    return queryPageUrl({
      view: 'markets',
      archive: '1',
      ...(filter ? { filter } : {}),
      ...(proposal ? { proposal } : {}),
    });
  }

  function marketHomeUrl() {
    return queryPageUrl({
      token: DEFAULT_MARKET_TOKEN,
      view: 'markets',
      tab: 'tokens',
    });
  }

  function tokenResearchUrl(key) {
    const safeKey = normalizeTokenKey(key);
    return safeKey ? queryPageUrl({ token: safeKey }) : homePageUrl();
  }

  function tokenMarketUrl(key, proposal) {
    const safeKey = normalizeTokenKey(key);
    if (!safeKey) return marketDiscoveryUrl();
    const safeProposal = normalizeProposalAddress(proposal);
    return queryPageUrl({
      token: safeKey,
      view: 'markets',
      ...(safeProposal ? { proposal: safeProposal } : {}),
    });
  }

  function tokenTradingUrl(key) {
    const safeKey = normalizeTokenKey(key);
    return safeKey
      ? queryPageUrl({ token: safeKey, view: 'markets', tab: 'tokens' })
      : marketHomeUrl();
  }

  function isMarketsView(search = runtime.location.search || '') {
    return new runtime.URLSearchParams(search).get('view') === 'markets';
  }

  function tokenPageUrl(key) {
    return isMarketsView() ? tokenTradingUrl(key) : tokenResearchUrl(key);
  }

  return {
    appRootPath,
    homePageUrl,
    isMarketsView,
    launchpadPageUrl,
    marketDiscoveryUrl,
    marketHomeUrl,
    normalizeProposalAddress,
    normalizeTokenKey,
    normalizeTokenList,
    queryPageUrl,
    tokenMarketUrl,
    tokenPageUrl,
    tokenResearchUrl,
    tokenTradingUrl,
  };
}
