// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API COMPATIBILITY FACADE
// The implementation lives in src/core/api-client.js. These globals remain
// until all classic-script callers migrate to window.NAVGATOR.api.
// ═══════════════════════════════════════════════════════════════════════
var _navgatorApi = window.NAVGATOR && window.NAVGATOR.api;
var _navgatorShell = window.NAVGATOR && window.NAVGATOR.shell;
var _navgatorWatchlist = _navgatorShell.watchlist;
var API_BASE = _navgatorApi.baseUrl;
var API_FETCH_TIMEOUT_MS = _navgatorApi.defaultTimeoutMs;
var _backendDegradedServices = _navgatorApi.degradedServices;
function _renderBackendHealth() { return _navgatorApi.renderBackendHealth(); }
function _captureBackendHealth(res) { return _navgatorApi.captureBackendHealth(res); }
function _apiFetch(url, options) { return _navgatorApi.fetch(url, options); }
function _apiJson(url, options) { return _navgatorApi.json(url, options); }
var _lightweightChartsPromise = null;

function _loadLightweightCharts() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (_lightweightChartsPromise) return _lightweightChartsPromise;
  var localPromise = window.NAVGATOR && window.NAVGATOR.lightweightChartsPromise;
  if (localPromise) {
    _lightweightChartsPromise = Promise.resolve(localPromise).then(function(library) {
      if (!library) throw new Error('Bundled Lightweight Charts unavailable');
      return library;
    }).catch(function(error) {
      _lightweightChartsPromise = null;
      throw error;
    });
    return _lightweightChartsPromise;
  }
  return Promise.reject(new Error('Bundled Lightweight Charts unavailable'));
}

async function _initChartWhenReady(rawCandles, navPerToken, canInitialize) {
  await _loadLightweightCharts();
  if (typeof canInitialize === 'function' && !canInitialize()) return false;
  initChart(rawCandles, navPerToken);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// MAINTENANCE MODE — checked from API kill switch
// Bypass with ?dev in the URL to still view the site
// ═══════════════════════════════════════════════════════════════════════
(function() {
  if ((new URLSearchParams(window.location.search)).has('dev')) return;
  _apiFetch(API_BASE + '/api/maintenance').then(function(r) { return r.json(); }).then(function(d) {
    if (d && (d.maintenance || d.api_maintenance)) {
      var gate = document.getElementById('maintenance-gate');
      if (gate && !gate.innerHTML) {
        gate.innerHTML = '<div class="mt-logo"><img src="logos/01rx.png?v=5" alt="01RX" width="80" height="80"></div><div class="mt-brand">01RX</div><div class="mt-status">Updates in progress</div><div class="mt-msg">The terminal is temporarily offline while updates are applied.</div>';
      }
      if (gate) {
        gate.hidden = false;
        gate.setAttribute('aria-hidden', 'false');
      }
      document.body.classList.add('maintenance-on');
      var msg = document.querySelector('#maintenance-gate .mt-msg');
      if (msg && d.message) msg.textContent = d.message;
    }
  }).catch(function() {});
})();

function _canonicalPriceChange24h(data) {
  if (!data || typeof data !== 'object') return null;
  var v = data.change24h;
  if (v == null || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function _fmtSidebarPct(v) {
  if (v === undefined || v === null || !isFinite(v)) return '—';
  if (v === 0) return '0';
  var abs = Math.abs(v);
  if (abs >= 100) return abs.toFixed(0);
  if (abs >= 10) return abs.toFixed(1);
  return abs.toFixed(2);
}

function _fmtSignedSidebarPct(v) {
  if (v === undefined || v === null || !isFinite(v)) return '—';
  var sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return sign + _fmtSidebarPct(v);
}

function _isFlatSidebarChange(v) {
  return v !== undefined && v !== null && isFinite(v) && Math.abs(Number(v)) < 0.01;
}
setInterval(_renderBackendHealth, 60000);

// ═══════════════════════════════════════════════════════════════════════
// HTML ESCAPE — prevent XSS from API data injected via innerHTML
// ═══════════════════════════════════════════════════════════════════════
function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// URL scheme whitelist — only allow http(s), reject javascript: / data: etc.
function _safeUrl(url, allowedHosts) {
  if (!url || typeof url !== 'string') return '';
  var trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  try {
    var parsed = new URL(trimmed);
    if (!/^https?:$/.test(parsed.protocol)) return '';
    if (allowedHosts && allowedHosts.length) {
      var host = parsed.hostname.toLowerCase();
      if (allowedHosts.indexOf(host) === -1) return '';
    }
    return parsed.href;
  } catch(e) {
    return '';
  }
}
function _safeSolscanUrl(url) {
  return _safeUrl(url, ['solscan.io', 'www.solscan.io']);
}
function _normalizeTokenKey(key) {
  return _navgatorShell.routes.normalizeTokenKey(key);
}
function _normalizeTokenList(list) {
  return _navgatorShell.routes.normalizeTokenList(list);
}
function _appRootPath() {
  return _navgatorShell.routes.appRootPath();
}
function _homePageUrl() {
  return _navgatorShell.routes.homePageUrl();
}
function _queryPageUrl(params) {
  return _navgatorShell.routes.queryPageUrl(params);
}
function _launchpadPageUrl(lpKey) {
  return _navgatorShell.routes.launchpadPageUrl(lpKey);
}
function _tokenPageUrl(key) {
  return _navgatorShell.routes.tokenPageUrl(key);
}

function toggleSection(labelEl) {
  if (!labelEl) return;
  var body = labelEl.nextElementSibling;
  if (!body) return;
  var isCollapsed = body.classList.toggle('collapsed');
  labelEl.classList.toggle('collapsed', isCollapsed);
}

var _wlCollapsed = true;
var _wlSavedWlH = 240;
function toggleWlCollapse() {
  _wlCollapsed = !_wlCollapsed;
  var list = document.getElementById('tlp-wl-list');
  var arrow = document.getElementById('wl-collapse-arrow');
  var wlSection = document.getElementById('tlp-wl-section');
  if (_wlCollapsed) {
    if (wlSection) _wlSavedWlH = wlSection.offsetHeight;
    if (list) list.style.display = 'none';
    if (wlSection) wlSection.style.maxHeight = 'none';
  } else {
    if (list) list.style.display = '';
    if (wlSection) wlSection.style.maxHeight = _wlSavedWlH + 'px';
  }
  if (list) list.classList.toggle('collapsed', _wlCollapsed);
  if (arrow) arrow.style.transform = _wlCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
  var btn = document.querySelector('#tlp-wl-section .tp-section-label');
  if (btn) {
    btn.classList.toggle('collapsed', _wlCollapsed);
    btn.setAttribute('aria-expanded', !_wlCollapsed);
  }
}

function toggleSectionArrow(arrowEl) {
  if (!arrowEl) return;
  var labelEl = arrowEl.classList.contains('tp-section-label') ? arrowEl : arrowEl.closest('.tp-section-label');
  if (!labelEl) return;
  var body = labelEl.nextElementSibling;
  if (!body) return;
  var isCollapsed = body.classList.toggle('collapsed');
  labelEl.classList.toggle('collapsed', isCollapsed);
  labelEl.setAttribute('aria-expanded', !isCollapsed);
}

var _marketTokenSecondaryMetrics = ['change24h', 'change1h', 'nav', 'marketCap', 'volume24h'];
var _marketTokenSecondarySortConfig = {
  change24h: { key: 'change', label: '24-hour change' },
  change1h: { key: 'change-1h', label: '1-hour change' },
  nav: { key: 'nav', label: 'NAV' },
  marketCap: { key: 'market-cap', label: 'market cap' },
  volume24h: { key: 'volume', label: '24-hour volume' }
};
var _marketTokenSecondaryMetric = (function() {
  try {
    var saved = localStorage.getItem('navgator-market-secondary-column');
    return _marketTokenSecondaryMetrics.indexOf(saved) >= 0 ? saved : 'change24h';
  } catch (e) {
    return 'change24h';
  }
})();
var _marketTokenSortKeys = ['asset', 'price', 'change', 'change-1h', 'nav', 'market-cap', 'volume'];
var _marketTokenSortKey = (function() {
  try {
    var saved = localStorage.getItem('navgator-market-token-sort');
    return _marketTokenSortKeys.indexOf(saved) >= 0 ? saved : 'asset';
  } catch (e) {
    return 'asset';
  }
})();
var _marketSidebarSortAscending = false;
var _marketSidebarTab = 'all';

function getMarketTokenSecondaryMetric() {
  return _marketTokenSecondaryMetric;
}

function getMarketSidebarSortAscending() {
  return _marketSidebarSortAscending;
}

function closeMarketColumnMenu() {
  var menu = document.getElementById('tp-market-column-menu');
  var button = document.getElementById('tp-market-columns-button');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function toggleMarketColumnMenu(event) {
  if (event) event.stopPropagation();
  var menu = document.getElementById('tp-market-column-menu');
  var button = document.getElementById('tp-market-columns-button');
  if (!menu || !button || button.disabled) return;
  var willOpen = menu.hidden;
  closeMarketSortMenu();
  menu.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function toggleMarketSidebarSearch(event) {
  if (event) event.stopPropagation();
  var field = document.getElementById('tp-market-search-field');
  var button = document.getElementById('tp-market-search-button');
  var input = document.getElementById('tlp-search');
  if (!field || !button || !input) return;
  var willOpen = field.hidden;
  closeMarketColumnMenu();
  closeMarketSortMenu();
  field.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    requestAnimationFrame(function() { input.focus(); });
  } else if (input.value) {
    input.value = '';
    applyMarketSidebarSearch();
  }
}

function setMarketSidebarTab(nextTab) {
  if (nextTab !== 'watchlist' && nextTab !== 'all' && nextTab !== 'markets' && nextTab !== 'tokens') return;
  _marketSidebarTab = nextTab;
  document.documentElement.dataset.marketSidebarTab = nextTab;
  document.querySelectorAll('[data-market-sidebar-tab]').forEach(function(tab) {
    var isActive = tab.dataset.marketSidebarTab === nextTab;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  applyMarketSidebarSearch();
}

function _refreshMarketTokenList() {
  if (typeof renderTokenLeftPanel === 'function') {
    renderTokenLeftPanel(window._cachedPriceMap || {});
  } else if (window.NAVGATOR && typeof window.NAVGATOR.refreshMarketTokenSidebar === 'function') {
    window.NAVGATOR.refreshMarketTokenSidebar();
  }
  var search = document.getElementById('tlp-search');
  if (search && search.value) search.dispatchEvent(new Event('input', { bubbles: true }));
}

function setMarketTokenSecondaryMetric(nextMetric) {
  if (_marketTokenSecondaryMetrics.indexOf(nextMetric) < 0) return;
  _marketTokenSecondaryMetric = nextMetric;
  try {
    localStorage.setItem('navgator-market-secondary-column', nextMetric);
  } catch (e) {}
  document.querySelectorAll('input[name="tp-token-secondary-column"]').forEach(function(input) {
    input.checked = input.value === nextMetric;
  });
  closeMarketColumnMenu();
  _refreshMarketTokenList();
  _syncMarketSortMenu();
}

function _syncMarketSortMenu() {
  document.querySelectorAll('[data-market-sort-key]').forEach(function(option) {
    var isActive = option.dataset.marketSortKey === _marketTokenSortKey;
    option.classList.toggle('active', isActive);
    option.setAttribute('aria-checked', String(isActive));
  });
  var directionLabel = document.getElementById('tp-market-sort-direction-label');
  if (directionLabel) directionLabel.textContent = _marketSidebarSortAscending ? 'Low to high' : 'High to low';
  var directionIcon = document.getElementById('tp-market-sort-direction-icon');
  if (directionIcon) directionIcon.textContent = _marketSidebarSortAscending ? '↑' : '↓';
  var secondaryButton = document.getElementById('tp-token-secondary-sort');
  var secondaryDirection = document.getElementById('tp-token-secondary-sort-direction');
  var secondaryConfig = _marketTokenSecondarySortConfig[_marketTokenSecondaryMetric];
  var secondaryIsActive = !!secondaryConfig && _marketTokenSortKey === secondaryConfig.key;
  if (secondaryButton && secondaryConfig) {
    var nextDirection = secondaryIsActive && !_marketSidebarSortAscending
      ? 'largest losses first'
      : 'highest gains first';
    if (_marketTokenSecondaryMetric !== 'change24h' && _marketTokenSecondaryMetric !== 'change1h') {
      nextDirection = secondaryIsActive && !_marketSidebarSortAscending
        ? 'lowest first'
        : 'highest first';
    }
    secondaryButton.classList.toggle('active', secondaryIsActive);
    secondaryButton.setAttribute('aria-pressed', String(secondaryIsActive));
    secondaryButton.dataset.sortDirection = secondaryIsActive
      ? (_marketSidebarSortAscending ? 'ascending' : 'descending')
      : 'none';
    secondaryButton.setAttribute(
      'aria-label',
      'Sort tokens by ' + secondaryConfig.label + ', ' + nextDirection
    );
  }
  if (secondaryDirection) {
    secondaryDirection.textContent = secondaryIsActive
      ? (_marketSidebarSortAscending ? '↑' : '↓')
      : '↕';
  }
}

function closeMarketSortMenu() {
  var menu = document.getElementById('tp-market-sort-menu');
  var button = document.getElementById('tp-market-sort-button');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function toggleMarketSortMenu(event) {
  if (event) event.stopPropagation();
  var menu = document.getElementById('tp-market-sort-menu');
  var button = document.getElementById('tp-market-sort-button');
  if (!menu || !button || button.disabled) return;
  var willOpen = menu.hidden;
  closeMarketColumnMenu();
  _syncMarketSortMenu();
  menu.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function setMarketSidebarSort(nextKey) {
  if (_marketTokenSortKeys.indexOf(nextKey) < 0) return;
  _marketTokenSortKey = nextKey;
  try {
    localStorage.setItem('navgator-market-token-sort', nextKey);
  } catch (e) {}
  _syncMarketSortMenu();
  closeMarketSortMenu();
  applyMarketSidebarSearch();
}

function toggleMarketSidebarSortDirection(event) {
  if (event) event.stopPropagation();
  _marketSidebarSortAscending = !_marketSidebarSortAscending;
  _syncMarketSortMenu();
  applyMarketSidebarSearch();
}

function sortMarketSidebarBySecondaryMetric(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  var config = _marketTokenSecondarySortConfig[_marketTokenSecondaryMetric];
  if (!config) return;
  if (_marketTokenSortKey === config.key) {
    _marketSidebarSortAscending = !_marketSidebarSortAscending;
  } else {
    _marketTokenSortKey = config.key;
    _marketSidebarSortAscending = false;
    try {
      localStorage.setItem('navgator-market-token-sort', _marketTokenSortKey);
    } catch (e) {}
  }
  _syncMarketSortMenu();
  closeMarketSortMenu();
  applyMarketSidebarSearch();
}

function toggleMarketSidebarSort() {
  toggleMarketSidebarSortDirection();
}

function _marketSearchScore(item, query) {
  if (!query) return 0;
  var primary = (item.getAttribute('data-market-search-primary') || '').toLowerCase();
  var searchable = (item.getAttribute('data-market-search') || item.textContent || '').toLowerCase();
  if (primary === query) return 0;
  if (primary.indexOf(query) === 0) return 1;
  if (searchable.split(/\s+/).some(function(word) { return word.indexOf(query) === 0; })) return 2;
  if (searchable.indexOf(query) >= 0) return 3;
  return 4;
}

function _marketSortValue(item, key) {
  var raw = key === 'asset'
    ? item.getAttribute('data-market-search-primary')
    : item.getAttribute('data-sort-' + key);
  if (raw == null || raw === '') return { missing: true, number: null, text: '' };
  var number = Number(raw);
  return {
    missing: false,
    number: isFinite(number) ? number : null,
    text: String(raw).toLowerCase()
  };
}

function _compareMarketSortValues(a, b, ascending) {
  if (a.missing !== b.missing) return a.missing ? 1 : -1;
  if (a.missing) return 0;
  var comparison;
  if (a.number != null && b.number != null) {
    comparison = a.number - b.number;
  } else {
    comparison = a.text.localeCompare(b.text);
  }
  return ascending ? comparison : -comparison;
}

function _orderMarketSidebarList(list, tab, query) {
  if (!list) return;
  var rows = Array.from(list.children).filter(function(item) {
    return item.matches('.tp-item, .tp-decision-item');
  });
  rows.forEach(function(item, index) {
    if (!item.hasAttribute('data-market-search-order')) {
      item.setAttribute('data-market-search-order', String(index));
    }
  });
  rows.sort(function(a, b) {
    var searchComparison = _marketSearchScore(a, query) - _marketSearchScore(b, query);
    if (searchComparison !== 0) return searchComparison;
    if (tab === 'tokens') {
      var sortComparison = _compareMarketSortValues(
        _marketSortValue(a, _marketTokenSortKey),
        _marketSortValue(b, _marketTokenSortKey),
        _marketSidebarSortAscending
      );
      if (sortComparison !== 0) return sortComparison;
    }
    return Number(a.getAttribute('data-market-search-order'))
      - Number(b.getAttribute('data-market-search-order'));
  });
  var visibleCount = 0;
  rows.forEach(function(item) {
    list.appendChild(item);
    var matchesQuery = !query || _marketSearchScore(item, query) < 4;
    var isWatched = item.dataset.watched === 'true';
    var isVisible = matchesQuery && (tab !== 'tokens' || _marketSidebarTab !== 'watchlist' || isWatched);
    item.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });
  return visibleCount;
}

function applyMarketSidebarSearch() {
  var search = document.getElementById('tlp-search');
  var query = search ? search.value.toLowerCase().trim() : '';
  var tokenList = document.getElementById('tlp-all-list');
  var visibleTokens = _orderMarketSidebarList(tokenList, 'tokens', query) || 0;
  if (tokenList) tokenList.hidden = visibleTokens === 0;
  var tokenCount = document.getElementById('tp-token-count');
  if (tokenCount) {
    tokenCount.textContent = visibleTokens + ' ' + (visibleTokens === 1 ? 'token' : 'tokens') + ' live';
  }
  _orderMarketSidebarList(document.getElementById('tlp-decisions-list'), 'decisions', query);
  var empty = document.getElementById('tp-market-empty');
  if (empty) {
    empty.hidden = visibleTokens > 0;
    empty.textContent = query
      ? 'No matching assets'
      : (_marketSidebarTab === 'watchlist' ? 'Your watchlist is empty' : 'No assets found');
  }
}

function _bindMarketSidebarSearch() {
  var input = document.getElementById('tlp-search');
  if (!input || input.dataset.marketSearchBound === 'true') return;
  input.dataset.marketSearchBound = 'true';
  input.addEventListener('input', applyMarketSidebarSearch);
  input.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') toggleMarketSidebarSearch(event);
  });
  _syncMarketSortMenu();
  setMarketSidebarTab(_marketSidebarTab);
  applyMarketSidebarSearch();
}

window.applyMarketSidebarSearch = applyMarketSidebarSearch;

window.toggleMarketSidebarSection = function toggleMarketSidebarSection(sectionId, button) {
  var section = document.getElementById(sectionId);
  if (!section || !button) return;
  var collapsed = section.classList.toggle('is-collapsed');
  var sectionLabel = sectionId === 'tlp-all-panel' ? 'tokens' : 'decision markets';
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute(
    'aria-label',
    collapsed
      ? 'Expand ' + sectionLabel
      : 'Collapse ' + sectionLabel
  );
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _bindMarketSidebarSearch, { once: true });
} else {
  _bindMarketSidebarSearch();
}

document.addEventListener('click', function(event) {
  var menu = document.getElementById('tp-market-column-menu');
  if (menu && !menu.hidden && !event.target.closest('.tp-market-column-menu') && !event.target.closest('#tp-market-columns-button')) {
    closeMarketColumnMenu();
  }
  var sortMenu = document.getElementById('tp-market-sort-menu');
  if (sortMenu && !sortMenu.hidden && !event.target.closest('.tp-market-sort-menu') && !event.target.closest('#tp-market-sort-button')) {
    closeMarketSortMenu();
  }
});

function setBreadcrumb(crumbs) {
  var bc = document.getElementById('nav-breadcrumb');
  if (!bc) return;
  bc.innerHTML = crumbs.map(function(c, i) {
    var icon = c.logo ? '<img src="' + _esc(c.logo) + '" alt="" style="width:14px;height:14px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;margin-bottom:1px">' : '';
    var isLast = i === crumbs.length - 1;
    var el = isLast
      ? '<span class="bc-crumb bc-current">' + icon + _esc(c.label) + '</span>'
      : '<a class="bc-crumb" href="' + _esc(c.href || '#') + '" data-bc-idx="' + i + '">' + icon + _esc(c.label) + '</a>';
    return (i > 0 ? '<span class="bc-sep"> / </span>' : '') + el;
  }).join('');
  bc.querySelectorAll('a[data-bc-idx]').forEach(function(a) {
    var idx = parseInt(a.dataset.bcIdx, 10);
    var handler = crumbs[idx] && crumbs[idx].handler;
    if (handler) a.addEventListener('click', function(e) { e.preventDefault(); handler(); });
  });
}

function navToLaunchpad(lpKey) {
  document.querySelectorAll('.tp-lp-sublabel').forEach(function(el) {
    el.classList.toggle('tp-lp-active', el.dataset.lp === lpKey);
  });
  document.querySelectorAll('.tp-item').forEach(function(el) { el.classList.remove('active'); });
  var landingView = document.getElementById('landing-view');
  var dashboardView = document.getElementById('dashboard-view');
  if (landingView) landingView.classList.add('active');
  if (dashboardView) dashboardView.classList.remove('active');
  document.body.classList.remove('is-token');
  document.body.classList.remove('is-dashboard');
  if (typeof stopTxPolling === 'function') stopTxPolling();
  history.pushState({}, '', _launchpadPageUrl(lpKey));
  document.title = '01RX — ' + lpKey.charAt(0).toUpperCase() + lpKey.slice(1);
  setBreadcrumb([
    { label: 'All Tokens', href: _homePageUrl(), handler: function() { navToAllTokens(); } },
    { label: lpKey.charAt(0).toUpperCase() + lpKey.slice(1), current: true }
  ]);
  if (typeof setLaunchpadFilter === 'function') setLaunchpadFilter(lpKey);
}

function navToAllTokens() {
  return _navgatorShell.navigation.navToAllTokens();
}

function _launchpadKey(lp) {
  return String(lp || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function _isMetaDaoLaunchpad(lp) {
  var key = _launchpadKey(lp);
  return key === 'curated'
    || key === 'permissioned'
    || key === 'permissionless'
    || key === 'migration'
    || key === 'metadao'
    || key === 'futardio'
    || key === 'futardiocult';
}

function _launchpadLogoSrc(lp) {
  var key = _launchpadKey(lp);
  if (_isMetaDaoLaunchpad(lp)) return 'logos/meta.jpg';
  if (key === 'starfun' || key === 'star') return 'logos/star.png';
  return null;
}

function _lpIcon(lp, size, color) {
  var src = _launchpadLogoSrc(lp);
  if (!src) return '';
  var dim = Number(size) || 12;
  return '<img class="lp-inline-logo" src="' + src + '" alt="' + _esc(lp || 'Launchpad') + '" style="width:' + dim + 'px;height:' + dim + 'px">';
}

function _getWatchlist() {
  return _navgatorWatchlist.get();
}
function _setWatchlist(list) {
  return _navgatorWatchlist.replace(list);
}

// ═══════════════════════════════════════════════════════════════════════
// VIEW ROUTING
// ═══════════════════════════════════════════════════════════════════════
const _params = new URLSearchParams(window.location.search);
const _initialTokenKey = window.NAVGATOR.embed
  ? window.NAVGATOR.embed.tokenKey()
  : _normalizeTokenKey(_params.get('token') || '');
const _hasToken = !!_initialTokenKey;
const _isChartEmbed = !!(window.NAVGATOR.embed && window.NAVGATOR.embed.isChartEmbed() && _hasToken);
window.NAVGATOR = window.NAVGATOR || {};
window.NAVGATOR.hasToken = _hasToken;
window.NAVGATOR.isChartEmbed = _isChartEmbed;

var _healthPollTimer = null;
var _healthInFlight = null;

function _getHealthScopeToken() {
  try {
    if (document.body.classList.contains('is-token') && typeof tokenKey !== 'undefined' && tokenKey) return tokenKey;
  } catch (err) {}
  return document.body.classList.contains('is-token') && _initialTokenKey ? _initialTokenKey : '';
}

function _getHealthUrl() {
  var scopeToken = _getHealthScopeToken();
  return API_BASE + '/api/health' + (scopeToken ? '?token=' + encodeURIComponent(scopeToken) : '');
}

function _getHealthPollMs() {
  return 5 * 60 * 1000;
}

function _formatHealthClock(iso) {
  if (!iso) return 'unknown';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return 'unknown';
  return d.toISOString().slice(11, 16) + ' UTC';
}

function _healthAreaLabel(area) {
  return {
    navSnapshots: 'NAV snapshots',
    navSnapshotsHourly: 'Hourly NAV snapshots',
    daoTransfers: 'DAO transfers',
    proposalSync: 'Proposal sync',
    buybackTransactions: 'Buybacks',
  }[area] || 'Health checks';
}

function _healthFindingSummary(finding, scopeToken) {
  if (!finding) return 'Health check failed';
  var token = finding.token ? String(finding.token).toUpperCase() : '';
  var scoped = scopeToken && token && token.toLowerCase() === scopeToken.toLowerCase();
  var prefix = scoped || !token ? '' : token + ' ';
  return prefix + _healthAreaLabel(finding.area) + ' stale';
}

function _renderHealthStatus(payload, opts) {
  opts = opts || {};
  var status = opts.fetchFailed ? 'error' : String((payload && payload.status) || 'error').toLowerCase();
  if (status !== 'ok' && status !== 'degraded' && status !== 'error') status = 'error';

  var scopeToken = _getHealthScopeToken();
  var findings = payload && Array.isArray(payload.findings) ? payload.findings : [];
  var maintenance = payload && payload.maintenance ? payload.maintenance : null;
  var checkedAt = payload && payload.checkedAt ? payload.checkedAt : null;

  var bbHealth = document.getElementById('bb-health');
  if (bbHealth) {
    bbHealth.textContent = opts.fetchFailed ? 'OFFLINE' : status.toUpperCase();
    bbHealth.classList.remove('live', 'warn', 'err');
    bbHealth.classList.add(status === 'ok' ? 'live' : status === 'degraded' ? 'warn' : 'err');
  }

  var banner = document.getElementById('system-health-banner');
  var badge = document.getElementById('system-health-badge');
  var title = document.getElementById('system-health-title');
  var meta = document.getElementById('system-health-meta');
  var details = document.getElementById('system-health-findings');
  var link = document.getElementById('system-health-link');
  if (!banner || !badge || !title || !meta || !details || !link) return;

  link.href = _getHealthUrl();
  banner.classList.remove('status-ok', 'status-degraded', 'status-error');
  banner.classList.add('status-' + status);

  var isMaintenance = !!(maintenance && (maintenance.frontend || maintenance.api));
  var bannerTitle = 'Backend healthy';
  if (opts.fetchFailed) bannerTitle = 'Health endpoint unreachable';
  else if (isMaintenance) bannerTitle = 'Maintenance mode is active';
  else if (status === 'degraded') bannerTitle = 'Backend checks degraded';
  else if (status === 'error') bannerTitle = 'Backend checks failing';

  var scopeLabel = scopeToken ? scopeToken.toUpperCase() + ' scope' : 'Global scope';
  var checkedLabel = checkedAt ? 'Checked ' + _formatHealthClock(checkedAt) : 'Waiting for fresh health data';
  var summary = '';

  if (opts.fetchFailed) {
    summary = 'Could not fetch /api/health. The app may be running without fresh backend diagnostics.';
  } else if (isMaintenance) {
    summary = maintenance.message || 'Maintenance is enabled.';
  } else if (findings.length > 0) {
    summary = findings.slice(0, 3).map(function(finding) {
      return _healthFindingSummary(finding, scopeToken);
    }).join(' • ');
    if (findings.length > 3) summary += ' +' + (findings.length - 3) + ' more';
  } else if (status === 'ok') {
    summary = scopeToken ? 'All token-specific checks are passing.' : 'All backend checks are passing.';
  } else {
    summary = 'Backend checks are reporting issues.';
  }

  badge.textContent = status.toUpperCase();
  title.textContent = bannerTitle;
  meta.textContent = scopeLabel + ' • ' + checkedLabel;
  details.textContent = summary;
  if (bbHealth) bbHealth.title = bannerTitle + '. ' + summary;

  var isDev = new URLSearchParams(window.location.search).has('dev');
  if (!isDev || (status === 'ok' && !isMaintenance && !opts.fetchFailed)) {
    banner.setAttribute('hidden', 'hidden');
  } else {
    banner.removeAttribute('hidden');
  }
}

function refreshHealthStatus() {
  if (_healthInFlight) return _healthInFlight;
  _healthInFlight = fetch(_getHealthUrl())
    .then(function(r) {
      return r.text().then(function(text) {
        var envelope = null;
        if (text) {
          try {
            envelope = JSON.parse(text);
          } catch (err) {
            if (!r.ok) throw new Error('Health fetch failed: ' + r.status);
            throw err;
          }
        }
        if (!r.ok && !envelope) throw new Error('Health fetch failed: ' + r.status);
        return envelope || {};
      });
    })
    .then(function(envelope) {
      var data = (envelope && envelope.ok && envelope.hasOwnProperty('data')) ? envelope.data : envelope;
      _renderHealthStatus(data);
      return data;
    })
    .catch(function(err) {
      console.warn('[NAVgator] health fetch failed:', err);
      _renderHealthStatus(null, { fetchFailed: true });
      return null;
    })
    .finally(function() {
      _healthInFlight = null;
    });
  return _healthInFlight;
}

function scheduleHealthPolling() {
  if (_healthPollTimer) clearTimeout(_healthPollTimer);
  _healthPollTimer = setTimeout(function tickHealth() {
    refreshHealthStatus().finally(function() {
      _healthPollTimer = setTimeout(tickHealth, _getHealthPollMs());
    });
  }, _getHealthPollMs());
}

if (!_hasToken && !_isChartEmbed) {
  refreshHealthStatus();
  scheduleHealthPolling();
}

// Star SVGs — global so both landing table and sidebar can use them
var _starFilled = '<svg viewBox="0 0 20 18" width="10" height="10" style="fill:currentColor;flex-shrink:0"><polygon points="10,1 12.6,6.4 18.6,7.2 14.3,11.4 15.3,17.3 10,14.5 4.7,17.3 5.7,11.4 1.4,7.2 7.4,6.4" stroke-linejoin="round"/></svg>';
var _starEmpty = '<svg viewBox="0 0 20 18" width="10" height="10" style="flex-shrink:0"><polygon points="10,1 12.6,6.4 18.6,7.2 14.3,11.4 15.3,17.3 10,14.5 4.7,17.3 5.7,11.4 1.4,7.2 7.4,6.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
function starSvg(w) { return w ? _starFilled : _starEmpty; }

var _shellPanelState = _navgatorShell.panels.state;

function _refreshShellPanelControls() {
  return _navgatorShell.panels.refreshControls();
}

function _notifyShellPanelResize() {
  return _navgatorShell.panels.notifyResize();
}

window.toggleShellPanel = function(side) {
  return _navgatorShell.panels.togglePanel(side);
};

_refreshShellPanelControls();

if (_hasToken) {
  document.getElementById('dashboard-view').classList.add('active');
  document.title = '01RX · Dashboard';
  document.body.classList.add('is-token');
  document.getElementById('token-switch-loader').classList.add('active');
} else {
  document.getElementById('landing-view').classList.add('active');
  document.title = '01RX — Ownership and Decision Markets';
  var _ll = document.getElementById('token-switch-loader');
  _ll.querySelector('.token-switch-label').textContent = 'Loading tokens…';
  _ll.classList.add('active');
}

// Sidebar always visible
var appLeft = document.getElementById('app-left');
if (appLeft) appLeft.classList.add('token-mode');

if (!_hasToken) {
  window.addEventListener('popstate', function() {
    var p = new URLSearchParams(window.location.search);
    var tok = p.get('token');
    var lp = p.get('launchpad');
    if (tok) {
      window.location.reload();
    } else if (lp) {
      var landingView = document.getElementById('landing-view');
      var dashboardView = document.getElementById('dashboard-view');
      if (landingView) landingView.classList.add('active');
      if (dashboardView) dashboardView.classList.remove('active');
      document.body.classList.remove('is-token');
      document.body.classList.remove('is-dashboard');
      setBreadcrumb([
        { label: 'All Tokens', href: _homePageUrl(), handler: function() { navToAllTokens(); } },
        { label: lp.charAt(0).toUpperCase() + lp.slice(1), current: true }
      ]);
      document.querySelectorAll('.tp-lp-sublabel').forEach(function(el) {
        el.classList.toggle('tp-lp-active', el.dataset.lp === lp);
      });
      if (typeof setLaunchpadFilter === 'function') setLaunchpadFilter(lp);
    } else {
      var landingAll = document.getElementById('landing-view');
      var dashboardAll = document.getElementById('dashboard-view');
      if (landingAll) landingAll.classList.add('active');
      if (dashboardAll) dashboardAll.classList.remove('active');
      document.body.classList.remove('is-token');
      document.body.classList.remove('is-dashboard');
      setBreadcrumb([{ label: 'All Tokens', current: true }]);
      document.querySelectorAll('.tp-lp-sublabel').forEach(function(el) { el.classList.remove('tp-lp-active'); });
      if (typeof setLaunchpadFilter === 'function') setLaunchpadFilter(null);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TOKEN CONFIGS
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// TOKENS — dynamically loaded from /api/tokens-list
// Sensitive fields (mint, daoWallet, futAmm (Fut LP), meteoraLpToken, daoMeteoraPool, performancePackage,
// buybackWallet, icoPrice, fundsAccepted, etc.) are fetched from
// /api/tokens-config on token page load.
// ═══════════════════════════════════════════════════════════════════════

// Fallback tokens used while API loads or if API fails. The build generates
// this safe subset from the backend registry before Vite bundles the app.
const TOKENS_FALLBACK = window.NAVGATOR.projectMetadata;
// Live tokens object — populated from API, falls back to TOKENS_FALLBACK
let TOKENS = { ...TOKENS_FALLBACK };
let _tokensLoaded = false;

// ═══════════════════════════════════════════════════════════════════════
// discoverTokens — fetches active tokens from API
// Returns a promise that resolves when TOKENS is populated.
// ═══════════════════════════════════════════════════════════════════════
var _homeBootstrapPromise = null;
function getHomeBootstrap() {
  if (_homeBootstrapPromise) return _homeBootstrapPromise;
  _homeBootstrapPromise = _apiJson(API_BASE + '/api/home-bootstrap?cacheOnly=1', { timeoutMs: 2500 })
    .then(function(data) {
      if (!data) _homeBootstrapPromise = null;
      return data;
    })
    .catch(function() {
      _homeBootstrapPromise = null;
      return null;
    });
  return _homeBootstrapPromise;
}

function _firstUsefulApiResult(promises, isUseful) {
  var list = (promises || []).filter(Boolean);
  if (list.length === 0) return Promise.resolve(null);
  return new Promise(function(resolve) {
    var pending = list.length;
    var settled = false;
    var fallback = null;
    function finish(value) {
      if (settled) return;
      if (isUseful(value)) {
        settled = true;
        resolve(value);
        return;
      }
      if (fallback === null && value != null) fallback = value;
      pending -= 1;
      if (pending <= 0) {
        settled = true;
        resolve(fallback);
      }
    }
    list.forEach(function(p) {
      Promise.resolve(p).then(finish).catch(function() { finish(null); });
    });
  });
}

function _tokenDiscoveryHasFallbackCoverage(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  var seen = {};
  data.forEach(function(t) {
    if (t && t.key) seen[String(t.key).toLowerCase()] = true;
  });
  return Object.keys(TOKENS_FALLBACK).every(function(key) {
    var token = TOKENS_FALLBACK[key];
    if (!token || token.live === false || token.graveyard) return true;
    return !!seen[key];
  });
}

function _currentNavHasFallbackCoverage(data) {
  if (!data || !Array.isArray(data.tokens) || data.tokens.length === 0) return false;
  return data.tokens.some(function(t) {
    if (!t) return false;
    if (t.currentNavStatus === 'dependency_unavailable') return false;
    return t.nav != null || t.snapshotTime || t.hasCurrentNav === true;
  });
}

function _currentNavHasPricedToken(data, key) {
  var target = _normalizeTokenKey(key);
  if (!target || !data || !Array.isArray(data.tokens)) return false;
  return data.tokens.some(function(t) {
    return _normalizeTokenKey(t && (t.token || t.key)) === target && Number(t && t.spot) > 0;
  });
}

// Current-NAV is the freshest lifecycle signal available to the UI. Apply it
// symmetrically so an active response can clear an older discovery/bootstrap
// liquidation flag instead of letting that flag become permanent client state.
function _applyCurrentNavLifecycle(target, tokenData) {
  if (!target || !tokenData || typeof tokenData !== 'object') return target;
  var status = String(tokenData.status || '').trim().toLowerCase();
  var hasLiquidatedAt = Object.prototype.hasOwnProperty.call(tokenData, 'liquidatedAt')
    || Object.prototype.hasOwnProperty.call(tokenData, 'liquidated_at');
  var liquidatedAt = tokenData.liquidatedAt != null ? tokenData.liquidatedAt : tokenData.liquidated_at;
  var active = !liquidatedAt && (status === 'active' || tokenData.live === true);
  var hasProposalFlag = Object.prototype.hasOwnProperty.call(tokenData, 'proposalFlag')
    || Object.prototype.hasOwnProperty.call(tokenData, 'proposal_flag');
  var proposalFlag = tokenData.proposalFlag != null ? tokenData.proposalFlag : tokenData.proposal_flag;

  if (liquidatedAt) {
    target.liquidatedAt = liquidatedAt;
    target.graveyard = true;
  } else if (active || hasLiquidatedAt) {
    target.liquidatedAt = null;
  }

  if (active) {
    target.live = true;
    target.graveyard = false;
    if (!hasProposalFlag) target.proposalFlag = null;
  } else if (status === 'inactive' || tokenData.graveyard === true || tokenData.retired === true) {
    target.graveyard = true;
  } else if (tokenData.graveyard === false || tokenData.retired === false) {
    target.graveyard = false;
  }

  if (hasProposalFlag) target.proposalFlag = proposalFlag || null;
  return target;
}

function _mergeCurrentNavToken(data, tokenData) {
  if (!tokenData || typeof tokenData !== 'object') return data || {};
  var key = _normalizeTokenKey(tokenData.token || tokenData.key);
  if (!key) return data || {};
  var out = data && typeof data === 'object' ? Object.assign({}, data) : {};
  var tokens = Array.isArray(out.tokens) ? out.tokens.slice() : [];
  var replaced = false;
  for (var i = 0; i < tokens.length; i++) {
    if (_normalizeTokenKey(tokens[i] && (tokens[i].token || tokens[i].key)) === key) {
      tokens[i] = Object.assign({}, tokens[i], tokenData);
      _applyCurrentNavLifecycle(tokens[i], tokenData);
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    var inserted = Object.assign({}, tokenData);
    _applyCurrentNavLifecycle(inserted, tokenData);
    tokens.push(inserted);
  }
  out.tokens = tokens;
  return out;
}

function _fillMissingCurrentNavTokens(data) {
  var result = data || {};
  var needsMeta = TOKENS_FALLBACK.meta && TOKENS_FALLBACK.meta.live !== false && !_currentNavHasPricedToken(result, 'meta');
  if (!needsMeta) return Promise.resolve(result);
  return _apiJson(API_BASE + '/api/current-nav?token=meta&includeInactive=1')
    .then(function(metaData) {
      return _mergeCurrentNavToken(result, metaData);
    })
    .catch(function() {
      return result;
    });
}

function _applyDiscoveredTokens(data) {
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('[NAVgator] No tokens from API, using fallback');
    TOKENS = { ...TOKENS_FALLBACK };
    _tokensLoaded = true;
    return TOKENS;
  }
  // Tokens hidden from frontend (still tracked in backend)
  var _hiddenTokens = { star: true, surf: true };
  // Convert array to keyed object
  var result = {};
  data.forEach(function(t) {
    var key = _normalizeTokenKey(t && t.key);
    if (!key || _hiddenTokens[key]) return;
    var fallback = TOKENS_FALLBACK[key];
    result[key] = {
      live: t.live !== false,
      name: t.name,
      ticker: t.ticker,
      pair: (t.pair ? t.pair.replace(/\/USDC$/, '/USD') : (t.ticker + '/USD')),
      color: t.color,
      logo: (fallback && fallback.logo) || t.logo, // prefer local logo over API
      launchpad: (fallback && fallback.launchpad) || (t.launchpad === 'Permissioned' ? 'Curated' : (t.launchpad || null)),
      launchDate: t.launchDate || null,
      graveyard: !!(t.graveyard || t.retired || t.status === 'inactive' || t.liquidatedAt),
      liquidatedAt: t.liquidatedAt || null,
      spot: 0,
      treasuryUSDC: 0,
      supply: 0,
    };
  });
  // Merge with fallback to preserve any local overrides (like local logo paths)
  Object.keys(TOKENS_FALLBACK).forEach(function(key) {
    if (!result[key]) {
      result[key] = TOKENS_FALLBACK[key];
    } else {
      var fb = TOKENS_FALLBACK[key];
      if (key === 'meta' && fb.live === true) {
        result[key].live = true;
        result[key].graveyard = false;
        result[key].liquidatedAt = null;
      }
      if (key === 'faf' && fb.live === true) {
        result[key].live = true;
        result[key].graveyard = false;
        result[key].liquidatedAt = null;
        result[key].launchpad = fb.launchpad;
      }
      if (!result[key].logo && fb.logo) result[key].logo = fb.logo;
      if (!result[key].name && fb.name) result[key].name = fb.name;
      if (fb.tldr && !result[key].tldr) result[key].tldr = fb.tldr;
      if (fb.launchDate && !result[key].launchDate) result[key].launchDate = fb.launchDate;
      if (!result[key].launchpad && fb.launchpad) result[key].launchpad = fb.launchpad;
      if (!result[key].color && fb.color) result[key].color = fb.color;
      if (fb.graveyard) result[key].graveyard = true;
      if (fb.liquidatedAt && !result[key].liquidatedAt) result[key].liquidatedAt = fb.liquidatedAt;
    }
  });
  TOKENS = result;
  _tokensLoaded = true;
  return TOKENS;
}

var _discoverPromise = null;
function discoverTokens() {
  if (_discoverPromise) return _discoverPromise;

  var listTokensP = _apiJson(API_BASE + '/api/list-tokens?includeInactive=1', { timeoutMs: 2500 }).catch(function() { return null; });
  if (_hasToken) {
    if (!_tokensLoaded) {
      TOKENS = { ...TOKENS_FALLBACK };
      _tokensLoaded = true;
    }
    listTokensP.then(function(data) {
      if (_tokenDiscoveryHasFallbackCoverage(data)) _applyDiscoveredTokens(data);
    }).catch(function() {});
    _discoverPromise = Promise.resolve(TOKENS);
    return _discoverPromise;
  }

  var bootstrapTokensP = (!_hasToken ? getHomeBootstrap() : Promise.resolve(null))
    .then(function(home) { return home && Array.isArray(home.tokens) ? home.tokens : null; })
    .catch(function() { return null; });
  _discoverPromise = _firstUsefulApiResult([bootstrapTokensP, listTokensP], function(data) {
      return _tokenDiscoveryHasFallbackCoverage(data);
    })
    .then(function(data) {
      return _applyDiscoveredTokens(data);
    })
    .catch(function(e) {
      console.error('[NAVgator] Token discovery failed, using fallback:', e);
      TOKENS = { ...TOKENS_FALLBACK };
      _tokensLoaded = true;
      return TOKENS;
    });

  return _discoverPromise;
}

// ═══════════════════════════════════════════════════════════════════════
// fetchTokenConfig — hydrates CFG with sensitive fields from server
// Called once on token page load; merges into existing CFG object.
// ═══════════════════════════════════════════════════════════════════════
var _tokenConfigReady = null; // Promise — resolved when config is merged
var _tokenConfigHydrated = false;
var _tokenConfigPending = false;
var _tokenConfigRequestSeq = 0;
function hydrateConfig(data) {
  if (!data || data.error) return;
  var applied = false;
  var fields = ['mint','logo','meteoraLpToken','meteoraLpUsdc','daoMeteoraPool','daoMeteoraPoolLegacy','daoMeteoraPools','icoPrice','monthlyAllowance','fundsAccepted','totalCommits','launchDate',
    'website','twitter','telegram','launchpad','daoWallet','legacyDaoWallets','additionalDaoWallets','futAmm','performancePackage','buybackWallet','buybackWallets','teamWallets','multisigWallet',
    'raiseWallet','claimWallet','metadaoFeeWallet','meteoraAmmV2Pool','combinatorPool','futAmmTokenVault','futAmmUsdcVault','buybackSpent','buybackAvgPrice',
    'buybackStart','buybackEnd','buybackTokensAcquired','buybackMaxPrice','buybackAllocated','buybackRemainingUSDC','buybackDays','buybackCampaigns','initialRaiseUsd','futureRaiseUsd','futureRaises','totalRaiseUsd','raiseBreakdown','baseRaiseUsd','additionalRaiseUsd','additionalRaises','projectOwnsMeteoraLp','meteoraLpOwnership',
    'projectLpFeeUsdcShare','meteoraInitialTokens','liquidatedAt','futAmmLabel','raydiumLabel'];
  fields.forEach(function(f) {
    if (data[f] === undefined) return;
    if ((f === 'website' || f === 'twitter' || f === 'telegram' || f === 'launchpad') && (data[f] === null || data[f] === '')) return;
    if (f === 'logo' && (data[f] === null || data[f] === '') && CFG.logo) return;
    CFG[f] = data[f];
    applied = true;
  });
  var projectLpFeeUSDC = data.projectLpFeeUSDC;
  if (projectLpFeeUSDC == null) projectLpFeeUSDC = data.project_lp_fee_usdc;
  if (projectLpFeeUSDC == null) projectLpFeeUSDC = data.projectLpFeeUsdc;
  if (projectLpFeeUSDC != null) { CFG.projectLpFeeUSDC = projectLpFeeUSDC; applied = true; }
  var meteoraProtocolFeeUSDC = data.meteoraProtocolFeeUSDC;
  if (meteoraProtocolFeeUSDC == null) meteoraProtocolFeeUSDC = data.meteora_protocol_fee_usdc;
  if (meteoraProtocolFeeUSDC == null) meteoraProtocolFeeUSDC = data.meteoraProtocolFeeUsdc;
  if (meteoraProtocolFeeUSDC != null) { CFG.meteoraProtocolFeeUSDC = meteoraProtocolFeeUSDC; applied = true; }
  var projectLpFeeTokens = data.projectLpFeeTokens;
  if (projectLpFeeTokens == null) projectLpFeeTokens = data.project_lp_fee_tokens;
  if (projectLpFeeTokens == null) projectLpFeeTokens = data.projectLpFeeToks;
  if (projectLpFeeTokens != null) { CFG.projectLpFeeTokens = projectLpFeeTokens; applied = true; }
  var futAmmLabel = data.futAmmLabel;
  if (futAmmLabel == null) futAmmLabel = data.fut_amm_label;
  if (futAmmLabel != null) { CFG.futAmmLabel = futAmmLabel; applied = true; }
  var raydiumLabel = data.raydiumLabel;
  if (raydiumLabel == null) raydiumLabel = data.raydium_label;
  if (raydiumLabel != null) { CFG.raydiumLabel = raydiumLabel; applied = true; }
  if (applied) _tokenConfigHydrated = true;
}
function fetchTokenConfig(key, requestOptions) {
  var safeKey = _normalizeTokenKey(key);
  if (!safeKey) return Promise.resolve();
  var reqSeq = ++_tokenConfigRequestSeq;
  _tokenConfigPending = true;
  // /api/current-nav often embeds a partial config object. Always fetch the
  // dedicated endpoint as the authoritative source so social links and other
  // sensitive fields can overwrite null placeholders from current-nav.
  var includeInactiveParam = (CFG && (CFG.graveyard || CFG.live === false)) ? '&includeInactive=1' : '';
  _tokenConfigReady = _apiJson(API_BASE + '/api/tokens-config?token=' + encodeURIComponent(safeKey) + includeInactiveParam, requestOptions)
    .then(function(data) {
      if (reqSeq !== _tokenConfigRequestSeq || safeKey !== _normalizeTokenKey(tokenKey)) return;
      hydrateConfig(data);
      _tokenConfigPending = false;
      if (typeof _renderIdentityLaunchpadLogo === 'function') _renderIdentityLaunchpadLogo();
      renderAddresses();
      if (_holdersLastData) renderHolders(_holdersLastData, true);
      _updateSocialLinks();
    })
    .catch(function(e) {
      if (reqSeq === _tokenConfigRequestSeq) {
        _tokenConfigPending = false;
        _updateSocialLinks();
      }
      if (!(e && e.cancelled)) console.error('[NAVgator] tokens-config fetch failed:', e);
    });
  return _tokenConfigReady;
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED API FETCH — single /api/current-nav promise for both landing + sidebar
// ═══════════════════════════════════════════════════════════════════════
var _allTokensPromise = null;
function getAllTokens() {
  if (!_allTokensPromise) {
    // Current NAV has one canonical browser boundary. Do not race the legacy
    // home bootstrap: it can contain an older NAVgator-owned current snapshot.
    _allTokensPromise = _apiJson(API_BASE + '/api/current-nav?includeInactive=1', { timeoutMs: 12000 })
      .then(function(data) {
        if (!data || !_currentNavHasFallbackCoverage(data)) {
          _allTokensPromise = null;
          return {};
        }
        return data;
      })
      .then(_fillMissingCurrentNavTokens)
      .catch(function() {
        // Don't cache failed result — clear so next call retries
        _allTokensPromise = null;
        return {};
      });
  }
  return _allTokensPromise;
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED STATUS BAR — live clock, token count, market tickers
// ═══════════════════════════════════════════════════════════════════════
(function initSharedStatusBar() {
  if (window._statusBarReady) return;
  window._statusBarReady = true;

  function tickClock() {
    var el = document.getElementById('bb-clock');
    if (!el) return;
    el.textContent = new Date().toISOString().slice(11, 19) + ' UTC';
  }
  tickClock();
  setInterval(tickClock, 1000);

  function paintTokenCount(value) {
    var el = document.getElementById('bb-token-count');
    if (!el || value == null || value === '' || value === '—') return;
    el.textContent = String(value);
  }

  discoverTokens().then(function(tokens) {
    var count = Object.keys(tokens || TOKENS).filter(function(key) {
      var token = (tokens || TOKENS)[key];
      return token && token.preview !== true;
    }).length;
    if (count > 0) paintTokenCount(count);
  });

  var BAR_PRICES_LS_KEY = 'navg_bar_prices_v1';
  var BAR_PRICES_PAIRS = [['btc','bb-btc-price'],['sol','bb-sol-price'],['zec','bb-zec-price']];

  function paintBarPrice(id, p) {
    if (typeof p !== 'number' || !isFinite(p) || p <= 0) return;
    var el = document.getElementById(id);
    if (el) el.textContent = '$' + p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  try {
    var cached = JSON.parse(localStorage.getItem(BAR_PRICES_LS_KEY) || '{}') || {};
    BAR_PRICES_PAIRS.forEach(function(pair) { paintBarPrice(pair[1], cached[pair[0]]); });
  } catch (_) {}

  function fetchBarPrices() {
    (!_hasToken ? getHomeBootstrap().then(function(home) {
      return home && home.marketTickers ? home.marketTickers : _apiJson(API_BASE + '/api/market-tickers');
    }) : _apiJson(API_BASE + '/api/market-tickers'))
      .then(function(d) {
        if (!d) return;
        var store = {};
        try { store = JSON.parse(localStorage.getItem(BAR_PRICES_LS_KEY) || '{}') || {}; } catch (_) {}
        BAR_PRICES_PAIRS.forEach(function(pair) {
          var p = d[pair[0]];
          if (typeof p === 'number' && isFinite(p) && p > 0) {
            paintBarPrice(pair[1], p);
            store[pair[0]] = p;
          }
        });
        try { localStorage.setItem(BAR_PRICES_LS_KEY, JSON.stringify(store)); } catch (_) {}
      })
      .catch(function() {});
  }
  fetchBarPrices();
  setInterval(fetchBarPrices, 60000);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'F1') {
      e.preventDefault();
      window.open('methodology.html', '_blank');
    } else if (e.key === 'F2') {
      e.preventDefault();
      if (typeof window.openCommandBar === 'function') {
        window.openCommandBar();
      } else {
        var overlay = document.getElementById('cmd-overlay');
        if (overlay) {
          overlay.classList.add('open');
          var inp = document.getElementById('cmd-input');
          if (inp) inp.focus();
        }
      }
    }
  });
})();

// ═══════════════════════════════════════════════════════════════════════
// SHARED COMMAND BAR — landing page fallback; token pages load richer handlers
// ═══════════════════════════════════════════════════════════════════════
(function initSharedCommandBar() {
  if (window._commandBarReady || _hasToken) return;
  var overlay = document.getElementById('cmd-overlay');
  var input = document.getElementById('cmd-input');
  var results = document.getElementById('cmd-results');
  if (!overlay || !input || !results) return;
  window._commandBarReady = true;

  var _activeIdx = 0;
  var _items = [];

  function closeCmd() {
    overlay.classList.remove('open');
    input.blur();
  }

  function isOpen() {
    return overlay.classList.contains('open');
  }

  function getTokenList() {
    return Object.keys(TOKENS).map(function(key) {
      var t = TOKENS[key];
      if (!t || !t.live) return null;
      return {
        key: key,
        name: t.name || key,
        ticker: t.ticker || key.toUpperCase(),
        logo: t.logo || '',
        tldr: t.tldr || '',
        color: t.color || '#333'
      };
    }).filter(Boolean).sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
  }

  function fuzzyMatch(query, text) {
    query = String(query || '').toLowerCase();
    text = String(text || '').toLowerCase();
    if (!query) return true;
    if (text.indexOf(query) !== -1) return true;
    var qi = 0;
    for (var ti = 0; ti < text.length && qi < query.length; ti++) {
      if (text[ti] === query[qi]) qi++;
    }
    return qi === query.length;
  }

  function scoreMatch(query, item) {
    var q = String(query || '').toLowerCase();
    if (!q) return 1;
    var ticker = String(item.ticker || '').toLowerCase();
    var name = String(item.name || '').toLowerCase();
    var tldr = String(item.tldr || '').toLowerCase();
    if (ticker === q) return 100;
    if (ticker.indexOf(q) === 0) return 90;
    if (ticker.indexOf(q) !== -1) return 80;
    if (name.indexOf(q) === 0) return 70;
    if (name.indexOf(q) !== -1) return 60;
    if (tldr.indexOf(q) !== -1) return 45;
    if (fuzzyMatch(q, name)) return 35;
    if (ticker && fuzzyMatch(q, ticker)) return 25;
    return 0;
  }

  function renderResults(query) {
    var tokens = getTokenList();
    var filtered;
    if (!query) {
      filtered = tokens;
    } else {
      filtered = tokens.map(function(t) {
        return { item: t, score: scoreMatch(query, t) };
      }).filter(function(x) {
        return x.score > 0;
      }).sort(function(a, b) {
        return b.score - a.score;
      }).map(function(x) {
        return x.item;
      });
    }

    _items = filtered;
    if (_activeIdx >= _items.length) _activeIdx = Math.max(0, _items.length - 1);

    if (!filtered.length) {
      results.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--dim);font-size:12px">No tokens match "' + _esc(query) + '"</div>';
      return;
    }

    results.innerHTML = filtered.map(function(t, idx) {
      var active = idx === _activeIdx ? ' active' : '';
      var logo = t.logo
        ? '<img class="cmd-item-logo" src="' + _esc(t.logo) + '" alt="' + _esc(t.ticker) + '" loading="lazy">'
        : '<div class="cmd-item-logo" style="background:' + _esc(t.color) + '"></div>';
      return '<div class="cmd-item' + active + '" data-idx="' + idx + '">'
        + logo
        + '<div class="cmd-item-info">'
        + '<div class="cmd-item-name">' + _esc(t.name) + ' <span class="cmd-item-ticker">' + _esc(t.ticker) + '</span></div>'
        + '<div class="cmd-item-meta"><span>' + _esc(t.tldr) + '</span></div>'
        + '</div>'
        + '<svg class="cmd-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
        + '</div>';
    }).join('');
  }

  function openCmd() {
    overlay.classList.add('open');
    input.value = '';
    input.placeholder = 'Search tokens...';
    _activeIdx = 0;
    renderResults('');
    discoverTokens().then(function() {
      renderResults(input.value.trim());
    });
    setTimeout(function() { input.focus(); }, 20);
  }

  function setActive(idx) {
    if (!_items.length) return;
    if (idx < 0) idx = _items.length - 1;
    if (idx >= _items.length) idx = 0;
    _activeIdx = idx;
    var els = results.querySelectorAll('.cmd-item');
    for (var i = 0; i < els.length; i++) {
      els[i].classList.toggle('active', i === idx);
    }
    if (els[idx]) els[idx].scrollIntoView({ block: 'nearest' });
  }

  function navigateToToken(key) {
    key = _normalizeTokenKey(key);
    closeCmd();
    if (!key) return;
    if (document.body.classList.contains('is-token') && typeof window.loadToken === 'function') {
      history.pushState(null, '', _tokenPageUrl(key));
      window.loadToken(key);
      return;
    }
    window.location.href = _tokenPageUrl(key);
  }

  window.openCommandBar = openCmd;

  input.addEventListener('input', function() {
    _activeIdx = 0;
    renderResults(input.value.trim());
  });

  results.addEventListener('click', function(e) {
    var item = e.target.closest('.cmd-item');
    if (!item) return;
    var idx = parseInt(item.dataset.idx, 10);
    if (!isNaN(idx) && _items[idx]) navigateToToken(_items[idx].key);
  });

  results.addEventListener('mousemove', function(e) {
    var item = e.target.closest('.cmd-item');
    if (item && item.dataset.idx != null) setActive(parseInt(item.dataset.idx, 10));
  });

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeCmd();
  });

  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (isOpen()) closeCmd();
      else openCmd();
      return;
    }
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); closeCmd(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(_activeIdx + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(_activeIdx - 1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (_items[_activeIdx]) navigateToToken(_items[_activeIdx].key);
    }
  });
})();
