const ROUTE_TOKEN_ALIASES = Object.freeze({
  futario: 'futardio',
  metadao: 'meta',
  mtncapital: 'mtn',
  mtndao: 'mtn',
  ranger: 'rngr',
});

const DECISION_FILTERS = new Set(['live', 'resolved', 'indexed']);
const ROUTE_DATA_ATTRIBUTES = Object.freeze([
  'data-embed',
  'data-embed-theme',
  'data-embed-transparent',
  'data-embed-outlined',
  'data-01rx-chart-frame',
  'data-workspace',
  'data-market-boot',
  'data-market-sidebar-tab',
  'data-chart-engine',
  'data-numfont',
  'data-default-market-selection',
]);

function normalizePathname(value) {
  const pathname = String(value || '/').replace(/\/index\.html$/, '/');
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

function normalizeRouteToken(value) {
  const candidate = String(value || '').trim().toLowerCase();
  const normalized = ROUTE_TOKEN_ALIASES[candidate] || candidate;
  return /^[a-z0-9][a-z0-9_-]*$/.test(normalized) ? normalized : '';
}

function normalizeProposal(value) {
  const candidate = String(value || '').trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(candidate) ? candidate : '';
}

function enabled(value) {
  return value === '1' || value === 'true';
}

function relativeUrl(pathname, params, hash = '') {
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash || ''}`;
}

function currentRelativeUrl(locationLike) {
  return relativeUrl(
    String(locationLike?.pathname || '/'),
    new URLSearchParams(locationLike?.search || ''),
    locationLike?.hash || '',
  );
}

function canonicalEmbedUrl(params, hash) {
  const canonical = new URLSearchParams({
    token: normalizeRouteToken(params.get('token')) || 'solo',
  });
  if (params.get('theme') === 'dark') canonical.set('theme', 'dark');
  if (enabled(params.get('transparent'))) canonical.set('transparent', '1');
  if (enabled(params.get('outlined'))) canonical.set('outlined', '1');
  const numberFont = String(params.get('numfont') || '').toLowerCase();
  if (numberFont === 'inter' || numberFont === 'ibm') {
    canonical.set('numfont', numberFont);
  }
  return relativeUrl('/embed', canonical, hash);
}

function canonicalFrameUrl(params, hash, locationLike) {
  const canonical = new URLSearchParams({
    token: normalizeRouteToken(params.get('token')),
    frame: '01rx',
  });
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(
    String(locationLike?.hostname || ''),
  );
  const engine = String(params.get('chartEngine') || '').toLowerCase();
  if (local && (engine === 'advanced' || engine === 'lightweight')) {
    canonical.set('chartEngine', engine);
  }
  return relativeUrl('/', canonical, hash);
}

function canonicalMarketUrl(params, hash) {
  const requestedToken = normalizeRouteToken(params.get('token'));
  const token = requestedToken || 'solo';
  const requestedTab = params.get('tab');
  const proposal = requestedToken ? normalizeProposal(params.get('proposal')) : '';
  const explicitDecisionView = Boolean(requestedToken) && (
    requestedTab === 'decisions'
    || (requestedTab !== 'tokens' && Boolean(proposal))
    || (
      requestedTab === null
      && params.get('view') === 'markets'
    )
  );
  const canonical = new URLSearchParams({
    token,
    view: 'markets',
    tab: explicitDecisionView ? 'decisions' : 'tokens',
  });
  if (explicitDecisionView) {
    if (proposal) canonical.set('proposal', proposal);
    const filter = params.get('filter');
    if (DECISION_FILTERS.has(filter)) canonical.set('filter', filter);
  }
  return relativeUrl('/', canonical, hash);
}

function effectiveLocation(locationLike, destination) {
  if (!destination) return locationLike;
  const url = new URL(destination, 'https://01rx.invalid');
  return {
    hash: url.hash,
    hostname: locationLike?.hostname || '',
    pathname: url.pathname,
    search: url.search,
  };
}

function dataPropertyName(attributeName) {
  return attributeName
    .replace(/^data-/, '')
    .replace(/-([a-z0-9])/g, (_match, character) => character.toUpperCase());
}

function writeDataAttribute(element, attributeName, value) {
  if (value === null || value === undefined || value === false) {
    if (typeof element?.removeAttribute === 'function') {
      element.removeAttribute(attributeName);
    } else if (element?.dataset) {
      delete element.dataset[dataPropertyName(attributeName)];
    }
    return;
  }

  const normalizedValue = value === true ? '' : String(value);
  if (typeof element?.setAttribute === 'function') {
    element.setAttribute(attributeName, normalizedValue);
  } else if (element?.dataset) {
    element.dataset[dataPropertyName(attributeName)] = normalizedValue;
  }
}

function syncRouteDataAttributes(documentElement, locationLike, embeddedFrame) {
  ROUTE_DATA_ATTRIBUTES.forEach((attributeName) => {
    writeDataAttribute(documentElement, attributeName, null);
  });

  const pathname = normalizePathname(locationLike?.pathname);
  const params = new URLSearchParams(locationLike?.search || '');
  if (pathname === '/embed') {
    writeDataAttribute(documentElement, 'data-embed', 'chart');
    writeDataAttribute(
      documentElement,
      'data-embed-theme',
      params.get('theme') === 'dark' ? 'dark' : 'light',
    );
    if (enabled(params.get('transparent'))) {
      writeDataAttribute(documentElement, 'data-embed-transparent', 'true');
    }
    if (enabled(params.get('outlined'))) {
      writeDataAttribute(documentElement, 'data-embed-outlined', 'true');
    }
  } else if (
    embeddedFrame
    && params.get('frame') === '01rx'
    && normalizeRouteToken(params.get('token'))
  ) {
    writeDataAttribute(documentElement, 'data-01rx-chart-frame', 'true');
    writeDataAttribute(documentElement, 'data-chart-engine', 'advanced-loading');
  } else {
    writeDataAttribute(documentElement, 'data-workspace', 'markets');
    writeDataAttribute(documentElement, 'data-market-boot', 'pending');
    writeDataAttribute(documentElement, 'data-market-sidebar-tab', 'all');
  }

  const numberFont = String(params.get('numfont') || '').toLowerCase();
  if (numberFont === 'inter' || numberFont === 'ibm') {
    writeDataAttribute(documentElement, 'data-numfont', numberFont);
  }
}

export function default01rxDestination(locationLike, options = {}) {
  const pathname = normalizePathname(locationLike?.pathname);
  const params = new URLSearchParams(locationLike?.search || '');
  const hash = locationLike?.hash || '';
  const rootRequested = pathname === '/';
  const embedRequested = pathname === '/embed'
    || (rootRequested && enabled(params.get('embed')));
  const frameRequested = rootRequested && params.get('frame') === '01rx';
  let destination = '';

  if (embedRequested) {
    destination = canonicalEmbedUrl(params, hash);
  } else if (
    frameRequested
    && options.embeddedFrame === true
    && normalizeRouteToken(params.get('token'))
  ) {
    destination = canonicalFrameUrl(params, hash, locationLike);
  } else {
    destination = canonicalMarketUrl(
      rootRequested ? params : new URLSearchParams(),
      hash,
    );
  }

  return destination === currentRelativeUrl(locationLike) ? null : destination;
}

export function installDefault01rxRoute(browserWindow) {
  const embeddedFrame = browserWindow.self !== browserWindow.top;
  const destination = default01rxDestination(browserWindow.location, {
    embeddedFrame,
  });
  if (destination) browserWindow.history.replaceState(null, '', destination);
  syncRouteDataAttributes(
    browserWindow.document.documentElement,
    effectiveLocation(browserWindow.location, destination),
    embeddedFrame,
  );
  return Boolean(destination);
}
