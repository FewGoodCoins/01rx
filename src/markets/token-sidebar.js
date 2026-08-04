function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unwrapEnvelope(payload) {
  let value = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isObject(value) || !isObject(value.data)) break;
    value = value.data;
  }
  return isObject(value) ? value : {};
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number > 0) return number;
  }
  return null;
}

function currentNavRows(payload, normalizeTokenKey) {
  const data = unwrapEnvelope(payload);
  const rows = [
    ...(Array.isArray(data.tokens) ? data.tokens : []),
    ...(Array.isArray(data.currentNav) ? data.currentNav : []),
  ];
  const map = new Map();
  rows.forEach((row) => {
    if (!isObject(row)) return;
    const key = normalizeTokenKey(row.token || row.key || row.slug || row.ticker);
    if (key) map.set(key, { ...(map.get(key) || {}), ...row });
  });
  return map;
}

function isLiveToken(metadata, current) {
  const status = String(current?.status || '').trim().toLowerCase();
  if (
    current?.liquidatedAt
    || current?.liquidated_at
    || current?.graveyard === true
    || current?.retired === true
    || status === 'inactive'
  ) return false;
  if (current?.live === true || status === 'active') return true;
  return metadata?.live === true && metadata?.graveyard !== true;
}

function navPerToken(row) {
  return positiveNumber(
    row?.nav,
    row?.navPerToken,
    row?.strike,
    row?.navSnapshot?.navPerToken,
  );
}

function marketCap(row) {
  return positiveNumber(
    row?.marketCap,
    row?.mcap,
    row?.navSnapshot?.market?.marketCap,
  );
}

function volume24h(row) {
  return positiveNumber(row?.volume24hUsd, row?.daoVolume24h, row?.volume24h);
}

function formatPrice(value) {
  const price = positiveNumber(value);
  if (price == null) return '—';
  return price >= 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(4)}`;
}

function formatChange(value) {
  const change = finiteNumber(value);
  if (change == null || Math.abs(change) < 0.01) return '—';
  return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
}

function createStar(document, watched) {
  const star = document.createElement('span');
  star.className = `wl-star${watched ? ' active' : ''}`;
  star.dataset.watchlistAction = 'toggle';
  star.setAttribute('role', 'button');
  star.setAttribute('tabindex', '0');
  star.setAttribute('aria-label', watched ? 'Remove from watchlist' : 'Add to watchlist');
  star.setAttribute('aria-pressed', String(watched));
  star.innerHTML = watched
    ? '<svg viewBox="0 0 20 18" aria-hidden="true"><polygon points="10,1 12.6,6.4 18.6,7.2 14.3,11.4 15.3,17.3 10,14.5 4.7,17.3 5.7,11.4 1.4,7.2 7.4,6.4" fill="currentColor"></polygon></svg>'
    : '<svg viewBox="0 0 20 18" aria-hidden="true"><polygon points="10,1 12.6,6.4 18.6,7.2 14.3,11.4 15.3,17.3 10,14.5 4.7,17.3 5.7,11.4 1.4,7.2 7.4,6.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></polygon></svg>';
  return star;
}

function createIcon(document, token, key) {
  const icon = document.createElement('div');
  icon.className = `tp-icon${token.graveyard ? ' graveyard-square-icon' : ''}`;
  icon.dataset.tokenKey = key;
  if (token.logo) {
    const image = document.createElement('img');
    image.src = String(token.logo);
    image.alt = String(token.ticker || key).toUpperCase();
    image.loading = 'lazy';
    icon.append(image);
    return icon;
  }
  icon.style.background = String(token.color || '#2a343e');
  icon.style.color = '#fff';
  icon.style.fontSize = '12px';
  icon.style.fontWeight = '700';
  icon.textContent = String(token.ticker || key).charAt(0).toUpperCase();
  return icon;
}

function createVerifiedBadge(document) {
  const badge = document.createElement('span');
  badge.className = 'tp-verified-badge';
  badge.title = 'Verified asset';
  badge.setAttribute('aria-label', 'Verified asset');
  badge.innerHTML = '<svg viewBox="0 0 18 20" aria-hidden="true"><path d="M9 1.5 15.2 4v5.4c0 4.1-2.6 7.3-6.2 9.1-3.6-1.8-6.2-5-6.2-9.1V4L9 1.5Z"></path><path d="m6 9.6 1.8 1.8 4-4.2"></path></svg>';
  return badge;
}

function createTokenRow({
  activeKey,
  current,
  document,
  href,
  key,
  token,
  watched,
}) {
  const spot = positiveNumber(current?.spot, current?.price);
  const change1h = finiteNumber(current?.change1h);
  const change24h = finiteNumber(current?.change24h);
  const currentNav = navPerToken(current);
  const currentMarketCap = marketCap(current);
  const currentVolume = volume24h(current);
  const row = document.createElement('a');
  row.className = `tp-item${key === activeKey ? ' active' : ''}`;
  row.dataset.key = key;
  row.dataset.marketTokenSidebar = 'true';
  row.dataset.watched = String(watched);
  row.dataset.marketSearchPrimary = String(token.ticker || key).toUpperCase();
  row.dataset.marketSearch = [token.ticker, token.name, key].filter(Boolean).join(' ');
  row.dataset.sortPrice = spot == null ? '' : String(spot);
  row.dataset.sortChange = change24h == null ? '' : String(change24h);
  row.dataset.sortChange1h = change1h == null ? '' : String(change1h);
  row.dataset.sortNav = currentNav == null ? '' : String(currentNav);
  row.dataset.sortMarketCap = currentMarketCap == null ? '' : String(currentMarketCap);
  row.dataset.sortVolume = currentVolume == null ? '' : String(currentVolume);
  row.href = href;
  if (key === activeKey) row.setAttribute('aria-current', 'page');

  row.append(createStar(document, watched));
  row.append(createIcon(document, token, key));

  const content = document.createElement('div');
  content.className = 'tp-content';
  const contentRow = document.createElement('div');
  contentRow.className = 'tp-row';
  const name = document.createElement('span');
  name.className = 'tp-name';
  name.textContent = String(token.ticker || key).toUpperCase();
  if (current && current.navVerified !== false) name.append(createVerifiedBadge(document));

  const quote = document.createElement('div');
  quote.style.textAlign = 'right';
  const price = document.createElement('span');
  price.className = 'tp-price';
  price.textContent = formatPrice(spot);
  const change = document.createElement('div');
  const flat = change24h == null || Math.abs(change24h) < 0.01;
  change.className = `tt-change tp-token-secondary${flat
    ? ' is-neutral is-flat'
    : change24h > 0 ? ' up' : ' down'}`;
  change.dataset.metric = 'change24h';
  change.textContent = formatChange(change24h);
  quote.append(price, change);
  contentRow.append(name, quote);
  content.append(contentRow);
  row.append(content);
  return row;
}

export function installBrowserMarketTokenSidebar(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const navgator = runtime.NAVGATOR = runtime.NAVGATOR || {};
  const existing = navgator.marketTokenSidebar;
  if (existing?.owner === '01rx-market-workspace') return existing;
  existing?.destroy?.();

  const document = runtime.document;
  const routes = navgator.shell?.routes;
  const watchlist = navgator.shell?.watchlist;
  const normalizeTokenKey = routes?.normalizeTokenKey || (value => String(value || '').toLowerCase());
  let navMap = new Map();
  let destroyed = false;

  function activeTokenKey() {
    return normalizeTokenKey(
      new runtime.URLSearchParams(runtime.location.search).get('token') || '',
    );
  }

  function render() {
    if (destroyed) return false;
    const list = document.getElementById('tlp-all-list');
    if (!list) return false;
    const metadata = isObject(navgator.projectMetadata) ? navgator.projectMetadata : {};
    const tokens = Object.entries(metadata)
      .map(([rawKey, token]) => [normalizeTokenKey(rawKey), token])
      .filter(([key, token]) => key && isObject(token) && isLiveToken(token, navMap.get(key)))
      .sort((left, right) => String(left[1].ticker || left[0]).localeCompare(
        String(right[1].ticker || right[0]),
      ));
    const selectedKey = activeTokenKey();
    const fragment = document.createDocumentFragment();
    tokens.forEach(([key, token]) => {
      fragment.append(createTokenRow({
        activeKey: selectedKey,
        current: navMap.get(key),
        document,
        href: routes?.tokenTradingUrl?.(key) || `/?token=${encodeURIComponent(key)}&view=markets&tab=tokens`,
        key,
        token,
        watched: watchlist?.has?.(key) === true,
      }));
    });
    list.replaceChildren(fragment);
    list.hidden = tokens.length === 0;

    const count = document.getElementById('tp-token-count');
    if (count) count.textContent = `${tokens.length} ${tokens.length === 1 ? 'token' : 'tokens'} live`;
    const secondaryLabel = document.getElementById('tp-token-secondary-label');
    if (secondaryLabel) secondaryLabel.textContent = '24h';
    runtime.applyMarketSidebarSearch?.();
    return true;
  }

  function hydrateCurrentNav(payload) {
    navMap = currentNavRows(payload, normalizeTokenKey);
    return render();
  }

  function sidebarStar(event) {
    const star = event.target?.closest?.(
      '#tlp-all-list .wl-star[data-watchlist-action="toggle"]',
    );
    if (!star) return null;
    const key = normalizeTokenKey(star.closest?.('.tp-item[data-key]')?.dataset?.key || '');
    return key ? { key, star } : null;
  }

  function handleClick(event) {
    const target = sidebarStar(event);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    if (watchlist?.toggle) watchlist.toggle(target.key);
    else render();
  }

  function handleKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleClick(event);
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
  const unsubscribe = watchlist?.subscribe?.(render) || (() => {});
  const controller = {
    owner: '01rx-market-workspace',
    hydrateCurrentNav,
    render,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
      if (navgator.marketTokenSidebar === controller) delete navgator.marketTokenSidebar;
    },
  };
  navgator.marketTokenSidebar = controller;
  render();
  return controller;
}
