// LANDING TABLE
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// LANDING TABLE — always initialized so navToLaunchpad works from token pages
// ═══════════════════════════════════════════════════════════════════════
var _cachedPriceMap = window._cachedPriceMap || {};
window._cachedPriceMap = _cachedPriceMap;

(function() {
  // Initialize with fallback tokens, will be refreshed after discovery
  var landingTokens = [];

  // Refresh landingTokens from current TOKENS object
  function refreshLandingTokens() {
    landingTokens = Object.entries(TOKENS).map(function(e) {
      var k = e[0], v = e[1];
      return { key: k, name: v.name, ticker: v.ticker, logo: v.logo, color: v.color,
        live: v.live, monthlyAllowance: v.monthlyAllowance, launchpad: v.launchpad || null,
        launchDate: v.launchDate || null, liquidatedAt: v.liquidatedAt || null, graveyard: !!v.graveyard,
        spot: 0, strike: 0, treasury: 0, mcap: 0, change7d: undefined, effectiveSupply: 0 };
    });
  }

  function appendDiscoveredLandingTokens() {
    Object.entries(TOKENS).forEach(function(e) {
      var k = e[0], v = e[1];
      if (landingTokens.some(function(t) { return t.key === k; })) return;
      landingTokens.push({ key: k, name: v.name, ticker: v.ticker, logo: v.logo, color: v.color,
        live: v.live, monthlyAllowance: v.monthlyAllowance, launchpad: v.launchpad || null,
        launchDate: v.launchDate || null, liquidatedAt: v.liquidatedAt || null, graveyard: !!v.graveyard,
        spot: 0, strike: 0, treasury: 0, mcap: 0, change7d: undefined, effectiveSupply: 0 });
    });
  }

  function _isGraveyardToken(t) {
    return !!(t && (t.liquidatedAt || t.graveyard));
  }

  // Initialize with fallback
  refreshLandingTokens();

  var lfmt$ = function(n) { return n >= 1 ? '$' + n.toFixed(2) : n >= 0.01 ? '$' + n.toFixed(4) : '$' + n.toFixed(6); };
  var lfmtK = function(n) { return n >= 999500 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + Math.round(n); };
  function graveyardIconClass(t) {
    return _isGraveyardToken(t) ? ' graveyard-square-icon' : '';
  }
  function iconHtml(t) {
    var squareCls = graveyardIconClass(t);
    if (t.logo) return '<div class="tt-icon' + squareCls + '"><img src="' + _esc(t.logo) + '" alt="' + _esc(t.ticker) + '" loading="lazy"></div>';
    return '<div class="tt-icon' + squareCls + '" style="background:' + _esc(t.color || '#333') + ';display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:18px;font-weight:700;color:#000">' + _esc(t.ticker.charAt(0)) + '</div>';
  }

  var currentSort = 'treasury';
  var sortDir = 'desc';
  var sortKeys = ['', '', 'name', 'price', 'nav', 'vsNav', 'mcap', 'treasury', 'age', '', 'trend'];
  var _activeFilter = 'all'; // 'all' | 'lp:metadao' etc.
  var _tableSearch = '';

  function isWatched(k) { return _navgatorWatchlist.has(k); }

  var _pendingUnstar = {}; // key -> original index, for deferred watchlist removal

  window.toggleWatchStar = function(el, key) {
    key = _normalizeTokenKey(key);
    if (!key) return;
    var idx = _navgatorWatchlist.indexOf(key);
    var wasWatched = idx !== -1;

    // If re-starring a token that's pending removal, restore its original position
    if (!wasWatched && _pendingUnstar[key] !== undefined) {
      var origIdx = _pendingUnstar[key];
      delete _pendingUnstar[key];
      _navgatorWatchlist.add(key, origIdx);
    } else {
      _navgatorWatchlist.toggle(key);
    }

    _syncWatchlistToRemote();
    syncFilterBar();
    var w = isWatched(key);
    el.classList.toggle('active', w);
    el.innerHTML = starSvg(w);
    // Sync all stars for this token across sidebar lists
    document.querySelectorAll('.tp-item[data-key="' + key + '"] .wl-star').forEach(function(s) {
      if (s !== el) { s.classList.toggle('active', w); s.innerHTML = starSvg(w); }
    });

    // If unfavoriting from watchlist, defer removal until mouse leaves the row
    var wlItem = el.closest('#tlp-wl-list .tp-item');
    if (wasWatched && !w && wlItem) {
      _pendingUnstar[key] = idx;
      wlItem.style.opacity = '0.4';
      wlItem.addEventListener('mouseleave', function _leave() {
        wlItem.removeEventListener('mouseleave', _leave);
        delete _pendingUnstar[key];
        _rerenderWatchlist();
      }, { once: true });
      return;
    }

    // If re-starred before mouseleave, restore visuals
    if (w && wlItem) {
      wlItem.style.opacity = '';
      return;
    }

    _rerenderWatchlist();
  };

  function _rerenderWatchlist() {
    if (typeof renderTokenLeftPanel === 'function' && window._cachedPriceMap) {
      var wlSection = document.getElementById('tlp-wl-section');
      var wlList = document.getElementById('tlp-wl-list');
      if (wlSection && wlList) {
        var liveTokens = Object.entries(TOKENS).filter(function(e) { return e[1].live; });
        var wlItems = _navgatorWatchlist.selectEntries(liveTokens);
        if (wlItems.length > 0) {
          // Auto-expand watchlist when a token is added
          if (typeof openWlSection === 'function') openWlSection();
          else if (_wlCollapsed) { toggleWlCollapse(); }
          wlList.innerHTML = wlItems.map(function(e) {
            var tok = e[1], k = e[0];
            var entry = window._cachedPriceMap[k] || {};
            var spot = entry.spot || 0;
            var fmtP = function(n) { return n >= 1 ? '$' + n.toFixed(2) : n > 0 ? '$' + n.toFixed(4) : '—'; };
            var isActive = k === _normalizeTokenKey(new URLSearchParams(window.location.search).get('token') || '');
            var squareCls = tok.graveyard ? ' graveyard-square-icon' : '';
            var iconH = tok.logo
              ? '<div class="tp-icon' + squareCls + '"><img src="' + _esc(tok.logo) + '" alt="' + _esc(tok.ticker) + '" loading="lazy"></div>'
              : '<div class="tp-icon' + squareCls + '" style="background:' + _esc(tok.color||'#2a343e') + ';font-size:12px;font-weight:700;color:#fff">' + _esc(tok.ticker[0]) + '</div>';
            return '<a class="tp-item' + (isActive ? ' active' : '') + '" data-key="' + _esc(k) + '" href="' + _tokenPageUrl(k) + '">' +
              '<span class="wl-drag-handle"><svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor"><circle cx="1" cy="1" r="1"/><circle cx="5" cy="1" r="1"/><circle cx="1" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="1" cy="9" r="1"/><circle cx="5" cy="9" r="1"/></svg></span>' +
              iconH +
              '<div class="tp-content"><div class="tp-row"><span class="tp-name" style="font-size:13px">' + _esc(tok.ticker) + '</span><div style="text-align:right"><span class="tp-price">' + fmtP(spot) + '</span>' + (entry.change24h !== undefined ? (entry.change24h === 0 ? '<div class="tt-change" style="font-size:12px"><span style="color:var(--dim);font-family:\'IBM Plex Mono\',monospace">24H</span> <span style="color:var(--dim)">— 0%</span></div>' : '<div class="tt-change" style="font-size:12px"><span style="color:var(--dim);font-family:\'IBM Plex Mono\',monospace">24H</span> <span class="' + (entry.change24h >= 0 ? 'up' : 'down') + '">' + (entry.change24h >= 0 ? '▲' : '▼') + ' ' + _fmtSignedSidebarPct(entry.change24h) + '%</span></div>') : '') + '</div></div></div></a>';
          }).join('');
          initWatchlistDrag();
        } else {
          wlList.innerHTML = '<div class="tp-item tp-empty-watchlist"><div class="tp-content"><div class="tp-row"><span class="tp-name">Empty</span></div></div></div>';
        }
      }
    } else {
      populateSidebarFromLanding();
    }
  }

  // ── Watchlist drag-to-reorder (pointer-event based) ──
  var _wlDragged = false;
  window.initWatchlistDrag = initWatchlistDrag;
  function initWatchlistDrag() {
    var wlList = document.getElementById('tlp-wl-list');
    if (!wlList) return;

    // Block click navigation after a drag
    wlList.addEventListener('click', function(e) {
      if (_wlDragged) { e.preventDefault(); _wlDragged = false; }
    }, true);

    // Kill native link drag on all watchlist items
    wlList.querySelectorAll('.tp-item').forEach(function(item) {
      item.setAttribute('draggable', 'false');
      item.addEventListener('dragstart', function(e) { e.preventDefault(); });
    });

    var handles = wlList.querySelectorAll('.wl-drag-handle');
    handles.forEach(function(handle) {
      handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var dragItem = handle.closest('.tp-item');
        if (!dragItem) return;
        var items = Array.from(wlList.querySelectorAll('.tp-item'));
        if (items.length < 2) return;

        // Snapshot keys in current DOM order
        var keys = items.map(function(it) { return it.dataset.key; });
        var startY = e.clientY;
        var itemH = dragItem.getBoundingClientRect().height;
        var dragIdx = items.indexOf(dragItem);
        var curIdx = dragIdx;
        var didMove = false;

        dragItem.classList.add('wl-dragging');
        dragItem.style.transition = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';

        function onMove(ev) {
          didMove = true;
          var dy = ev.clientY - startY;
          // Clamp so item can't be dragged above first or below last position
          var maxUp = -dragIdx * itemH;
          var maxDown = (items.length - 1 - dragIdx) * itemH;
          dy = Math.max(maxUp, Math.min(maxDown, dy));
          dragItem.style.transform = 'translateY(' + dy + 'px)';
          var shift = Math.round(dy / itemH);
          var newIdx = Math.max(0, Math.min(items.length - 1, dragIdx + shift));
          if (newIdx !== curIdx) {
            items.forEach(function(it, i) {
              if (i === dragIdx) return;
              if (dragIdx < newIdx && i > dragIdx && i <= newIdx) {
                it.style.transform = 'translateY(' + (-itemH) + 'px)';
              } else if (dragIdx > newIdx && i >= newIdx && i < dragIdx) {
                it.style.transform = 'translateY(' + itemH + 'px)';
              } else {
                it.style.transform = '';
              }
            });
            curIdx = newIdx;
          }
        }

        function onUp() {
          document.removeEventListener('mousemove', onMove, true);
          document.removeEventListener('mouseup', onUp, true);
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          dragItem.classList.remove('wl-dragging');
          items.forEach(function(it) { it.style.transform = ''; it.style.transition = ''; });

          if (didMove) _wlDragged = true;

          if (curIdx !== dragIdx) {
            var key = keys[dragIdx];
            keys.splice(dragIdx, 1);
            keys.splice(curIdx, 0, key);
            _navgatorWatchlist.reorder(keys);
            _syncWatchlistToRemote();
            if (typeof renderTokenLeftPanel === 'function' && window._cachedPriceMap) {
              renderTokenLeftPanel(window._cachedPriceMap);
            }
          }
        }

        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('mouseup', onUp, true);
      });
    });
  }

  // Set launchpad filter (called by navToLaunchpad)
  window.setLaunchpadFilter = function(lpKey) {
    _activeFilter = lpKey ? 'lp:' + lpKey : 'all';
    syncFilterBar();
    renderTable();
    updateHeroStats();
    if (typeof drawAllSparklines === 'function') setTimeout(drawAllSparklines, 60);
  };

  function _liquidatedTokenCount() {
    return landingTokens.filter(_isGraveyardToken).length;
  }

  function _activeLandingTokens() {
    return landingTokens.filter(function(t) { return t.live && !_isGraveyardToken(t); });
  }

  function _paintLandingHeroStats() {
    var activeTokens = _activeLandingTokens();
    var countEl = document.getElementById('landing-count');
    if (countEl) countEl.textContent = activeTokens.length;

    var curatedEl = document.getElementById('landing-curated-count');
    if (curatedEl) curatedEl.textContent = activeTokens.filter(function(t) { return t.launchpad === 'Curated'; }).length;

    var permlessEl = document.getElementById('landing-permissionless-count');
    if (permlessEl) permlessEl.textContent = activeTokens.filter(function(t) { return t.launchpad === 'Permissionless'; }).length;

    var gaps = activeTokens.map(function(t) {
      var spot = Number(t.spot) || 0;
      var nav = Number(t.strike) || 0;
      return (spot > 0 && nav > 0) ? ((spot - nav) / nav * 100) : null;
    }).filter(function(v) { return v !== null && isFinite(v); });
    var discounts = gaps.filter(function(v) { return v < 0; });
    var premiums = gaps.filter(function(v) { return v > 0; });

    var discountEl = document.getElementById('landing-discount-count');
    if (discountEl) discountEl.textContent = discounts.length;
    var premiumEl = document.getElementById('landing-premium-count');
    if (premiumEl) premiumEl.textContent = premiums.length;

    var avgDiscountEl = document.getElementById('landing-avg-discount');
    if (avgDiscountEl) {
      if (discounts.length) {
        var avgDiscount = discounts.reduce(function(sum, v) { return sum + v; }, 0) / discounts.length;
        avgDiscountEl.innerHTML = '<span class="down">' + avgDiscount.toFixed(1) + '%</span> <span style="color:var(--dim)">avg</span>';
      } else {
        avgDiscountEl.textContent = '';
      }
    }
    var avgPremiumEl = document.getElementById('landing-avg-premium');
    if (avgPremiumEl) {
      if (premiums.length) {
        var avgPremium = premiums.reduce(function(sum, v) { return sum + v; }, 0) / premiums.length;
        avgPremiumEl.innerHTML = '<span class="up">+' + avgPremium.toFixed(1) + '%</span> <span style="color:var(--dim)">avg</span>';
      } else {
        avgPremiumEl.textContent = '';
      }
    }

    var liqEl = document.getElementById('landing-liquidated');
    if (liqEl) liqEl.textContent = _liquidatedTokenCount();
  }

  // Filter bar button handler
  function updateHeroStats() {
    var normal = document.getElementById('hero-stats-normal');
    var graveyard = document.getElementById('hero-stats-graveyard');
    if (!normal || !graveyard) return;
    if (_activeFilter === 'lp:graveyard') {
      normal.style.display = 'none';
      graveyard.style.display = '';
      var el = document.getElementById('graveyard-count');
      var liqCount = _liquidatedTokenCount();
      if (el) el.textContent = liqCount + ' token' + (liqCount !== 1 ? 's' : '') + ' liquidated';
    } else {
      normal.style.display = '';
      graveyard.style.display = 'none';
    }
  }

  window.filterByLaunchpad = function(lpKey) {
    if (lpKey === 'migration') return;
    if (lpKey === 'watchlist' && _navgatorWatchlist.size === 0) return;
    _activeFilter = lpKey ? 'lp:' + lpKey : 'all';
    syncFilterBar();
    renderTable();
    updateHeroStats();
    if (typeof drawAllSparklines === 'function') setTimeout(drawAllSparklines, 60);
  };

  function syncFilterBar() {
    document.querySelectorAll('.lp-filter-btn').forEach(function(btn) {
      var btnLp = btn.dataset.lp;
      var isActive = (_activeFilter === 'all' && btnLp === 'all') ||
                     (_activeFilter === 'lp:' + btnLp);
      btn.classList.toggle('active', isActive);
      if (btnLp === 'watchlist') {
        var empty = _navgatorWatchlist.size === 0;
        btn.style.opacity = empty ? '0.2' : '';
        btn.style.cursor = empty ? 'not-allowed' : '';
        btn.style.pointerEvents = empty ? 'none' : '';
      }
      if (btnLp === 'migration') {
        btn.classList.add('disabled');
        btn.style.opacity = '';
        btn.style.cursor = '';
        btn.style.pointerEvents = '';
      }
    });
  }
  syncFilterBar();



  function renderTable() {
    var filtered = landingTokens.filter(function(t) {
      if (_activeFilter === 'lp:graveyard') {
        if (!_isGraveyardToken(t)) return false;
      } else if (_isGraveyardToken(t)) {
        return false;
      } else if (_activeFilter === 'lp:watchlist') {
        if (!_navgatorWatchlist.has(t.key)) return false;
      } else if (_activeFilter === 'lp:newlaunches') {
        // Show all tokens, just sorted by age
      } else if (_activeFilter.indexOf('lp:') === 0) {
        var lpKey = _activeFilter.slice(3); // e.g. 'metadao', 'star'
        var tokenLp = (t.launchpad || '').toLowerCase().replace(/[.\s]+/g, '');
        if (lpKey === 'star') {
          if (tokenLp !== 'starfun' && tokenLp !== 'star') return false;
        } else {
          if (tokenLp !== lpKey) return false;
        }
      }
      if (_tableSearch) {
        var q = _tableSearch;
        return t.name.toLowerCase().includes(q) || t.ticker.toLowerCase().includes(q) || t.key.includes(q);
      }
      return true;
    });

    var sorted = filtered.slice().sort(function(a, b) {
      // Liquidated tokens sort to bottom (unless in graveyard mode)
      if (_activeFilter !== 'lp:graveyard') {
        var aLiq = _isGraveyardToken(a) ? 1 : 0;
        var bLiq = _isGraveyardToken(b) ? 1 : 0;
        if (aLiq !== bLiq) return aLiq - bLiq;
      }
      // Fresh / Latest: force sort by launchDate descending
      if (_activeFilter === 'lp:newlaunches' || _activeFilter === 'lp:latest') {
        var da = a.launchDate || '0000-00-00';
        var db = b.launchDate || '0000-00-00';
        return db < da ? -1 : db > da ? 1 : 0;
      }
      var va, vb;
      if (currentSort === 'treasury') { va = a.treasury; vb = b.treasury; }
      else if (currentSort === 'nav') { va = a.strike; vb = b.strike; }
      else if (currentSort === 'vsNav') {
        va = a.strike > 0 ? (a.spot - a.strike) / a.strike : -999;
        vb = b.strike > 0 ? (b.spot - b.strike) / b.strike : -999;
      }
      else if (currentSort === 'mcap') { va = a.mcap; vb = b.mcap; }
      else if (currentSort === 'price') { va = a.change24h || 0; vb = b.change24h || 0; }
      else if (currentSort === 'trend') { va = a.change7d || 0; vb = b.change7d || 0; }
      else if (currentSort === 'age') { va = a.launchDate ? Date.parse(a.launchDate) : 0; vb = b.launchDate ? Date.parse(b.launchDate) : 0; }
      else if (currentSort === 'name') { return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name); }
      else { va = a.mcap; vb = b.mcap; }
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    var tbody = document.getElementById('token-tbody');
    if (!tbody) return;
    tbody.innerHTML = sorted.map(function(t, i) {
      var lpRaw = t.launchpad || '';
      var _isMetaDao = typeof _isMetaDaoLaunchpad === 'function'
        ? _isMetaDaoLaunchpad(lpRaw)
        : (lpRaw === 'Curated' || lpRaw === 'Permissionless' || lpRaw === 'Migration');
      var lpClass = _isMetaDao ? 'metadao' : lpRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
      var lpLabel = lpRaw === 'Star.fun' ? 'Star' : lpRaw;
      var lpIcon = '';
      var lpBadge = lpLabel
        ? (_isMetaDao
          ? '<span class="lp-indicator"><span class="lp-badge ' + _esc(lpClass) + '">' + _esc(lpLabel) + '</span></span>'
          : '<span style="display:inline-flex;align-items:center;gap:4px">' + (lpIcon ? lpIcon : '') + '<span class="lp-badge ' + _esc(lpClass) + '">' + _esc(lpLabel) + '</span></span>')
        : '<span class="lp-badge unknown">—</span>';

      if (_isGraveyardToken(t)) {
        var liqOpacity = _activeFilter === 'lp:graveyard' ? '' : ' style="opacity:0.55"';
        return '<tr data-token-key="' + _esc(t.key) + '"' + liqOpacity + '>' +
          '<td><span class="wl-star' + (isWatched(t.key) ? ' active' : '') + '" onclick="event.stopPropagation();toggleWatchStar(this,this.closest(\'tr\').dataset.tokenKey)">' + starSvg(isWatched(t.key)) + '</span></td>' +
          '<td>' + (i+1) + '</td>' +
          '<td><div class="tt-name-cell">' + iconHtml(t) + '<div><div class="tt-name">' + _esc(t.name) + '</div><div class="tt-ticker">' + _esc(t.ticker) + '</div></div></div></td>' +
          '<td colspan="5"><span class="tt-liquidated">Liquidated</span></td>' +
          '<td>—</td>' +
          '<td class="tt-launchpad-cell">' + lpBadge + '</td>' +
          '<td></td></tr>';
      }
      if (!t.live) {
        return '<tr data-token-key="' + _esc(t.key) + '" style="opacity:0.35">' +
          '<td></td><td>' + (i+1) + '</td>' +
          '<td><div class="tt-name-cell">' + iconHtml(t) + '<div><div class="tt-name">' + _esc(t.name) + '</div><div class="tt-ticker">' + _esc(t.ticker) + '</div></div></div></td>' +
          '<td colspan="5"><span class="tt-coming">Coming Soon</span></td>' +
          '<td>—</td>' +
          '<td class="tt-launchpad-cell">' + lpBadge + '</td>' +
          '<td></td></tr>';
      }
      var discPct = t.strike > 0 ? ((t.spot - t.strike) / t.strike * 100) : 0;
      var isDisc = discPct < 0;
      var noData = t.spot === 0;
      var navBadge = noData ? '<span class="pnav-badge neutral">—</span>' :
        t.strike === 0 ? '<span class="pnav-badge neutral">—</span>' :
        isDisc ? '<span class="pnav-badge below">-' + Math.abs(discPct).toFixed(1) + '%</span>' :
        '<span class="pnav-badge above">+' + discPct.toFixed(1) + '%</span>';
      var sw = isWatched(t.key);
      var _pendingLiq = t.proposalFlag && t.proposalFlag.type === 'liquidation' && t.proposalFlag.state === 'pending' && !t.liquidatedAt;
      var _liqWarnTag = _pendingLiq ? '<span class="tt-liq-warn" title="Active liquidation proposal">LIQ VOTE</span>' : '';

      var skel = '<span class="tt-skel"></span>';
      var skelSm = '<span class="tt-skel tt-skel-sm"></span>';
      var skelLg = '<span class="tt-skel tt-skel-lg"></span>';
      var skelSpark = '<div class="spark-container tt-sparkline" data-token="' + t.key + '"><span class="tt-skel tt-skel-spark"></span></div>';
      return '<tr data-token-key="' + _esc(t.key) + '">' +
        '<td><span class="wl-star' + (sw ? ' active' : '') + '" onclick="event.stopPropagation();toggleWatchStar(this,this.closest(\'tr\').dataset.tokenKey)">' + starSvg(sw) + '</span></td>' +
        '<td>' + (i+1) + '</td>' +
        '<td><div class="tt-name-cell">' + iconHtml(t) + '<div><div class="tt-name">' + _esc(t.name) + _liqWarnTag + '</div><div class="tt-ticker">' + _esc(t.ticker) + '</div></div></div></td>' +
        '<td><div class="tt-price">' + (noData ? skel : lfmt$(t.spot)) + (t.change24h !== undefined ? (t.change24h === 0 ? '<div class="tt-change" style="color:var(--dim)">—</div>' : '<div class="tt-change ' + (t.change24h >= 0 ? 'up' : 'down') + '">' + (t.change24h >= 0 ? '▲' : '▼') + ' ' + Math.abs(t.change24h).toFixed(2) + '%</div>') : (noData ? '<div class="tt-change">' + skelSm + '</div>' : '')) + '</div></td>' +
        '<td class="tt-nav-val" style="color:#ffcc00"><div>' + (noData ? skel : (t.strike > 0 ? lfmt$(t.strike) : '—')) + '</div></td>' +
        '<td>' + (noData ? skelSm : navBadge) + '</td>' +
        '<td class="tt-mcap">' + (noData ? skelLg : lfmtK(t.mcap)) + '</td>' +
        '<td class="tt-treasury">' + (noData ? skelLg : lfmtK(t.treasury)) + '</td>' +
        '<td>' + (function() {
          if (!t.launchDate) return '—';
          var launchMs = Date.parse(t.launchDate);
          if (!isFinite(launchMs)) return '—';
          var days = Math.max(0, Math.floor((Date.now() - launchMs) / 86400000));
          return days < 1 ? '<1d' : days < 30 ? days + 'd' : days < 365 ? Math.floor(days / 30) + 'mo' : (days / 365).toFixed(1) + 'y';
        })() + '</td>' +
        '<td class="tt-launchpad-cell">' + lpBadge + '</td>' +
        '<td style="text-align:center">' + (t.change7d === undefined ? skelSpark : '<div class="spark-container tt-sparkline" data-token="' + t.key + '"></div>') + '</td>' +
        '</tr>';
    }).join('');

    // Update header counts
    _paintLandingHeroStats();

    // Sort indicators
    document.querySelectorAll('.token-table thead th').forEach(function(th, idx) {
      th.classList.remove('sorted');
      var key = sortKeys[idx];
      var arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.remove();
      if (key === currentSort) {
        th.classList.add('sorted');
        var arr = document.createElement('span');
        arr.className = 'sort-arrow';
        arr.textContent = sortDir === 'desc' ? ' ▼' : ' ▲';
        arr.style.cssText = 'font-size:11px;opacity:0.7';
        th.appendChild(arr);
      }
    });

    if (typeof _sparkCache !== 'undefined' && Object.keys(_sparkCache).length > 0) {
      setTimeout(drawAllSparklines, 10);
    }
  }

  renderTable();

  document.querySelectorAll('.token-table thead th').forEach(function(th, idx) {
    th.addEventListener('click', function() {
      var key = sortKeys[idx];
      if (!key) return;
      if (currentSort === key) { sortDir = sortDir === 'desc' ? 'asc' : 'desc'; }
      else { currentSort = key; sortDir = 'desc'; }
      renderTable();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TREEMAP VIEW
  // ═══════════════════════════════════════════════════════════════════
  var _landingView = 'table'; // 'table' | 'treemap'
  var _treemapSizeBy = 'mcap'; // 'mcap' | 'treasury'
  var _treemapColorBy = 'change'; // 'change' | 'nav'

  window.setLandingView = function(view) {
    _landingView = view;
    if (view === 'treemap') renderTreemap();
  };

  window.setTreemapSize = function(mode) {
    _treemapSizeBy = mode;
    document.getElementById('tm-size-mcap').classList.toggle('active', mode === 'mcap');
    document.getElementById('tm-size-treasury').classList.toggle('active', mode === 'treasury');
    renderTreemap();
  };

  window.setTreemapColor = function(mode) {
    _treemapColorBy = mode;
    document.getElementById('tm-color-change').classList.toggle('active', mode === 'change');
    document.getElementById('tm-color-nav').classList.toggle('active', mode === 'nav');
    renderTreemap();
  };

  // Squarified treemap layout algorithm
  function squarify(items, rect) {
    if (items.length === 0) return [];
    var total = items.reduce(function(s, d) { return s + d._val; }, 0);
    if (total <= 0) return [];
    var results = [];
    _squarifyRows(items.slice(), rect, total, results);
    return results;
  }

  function _squarifyRows(items, rect, totalVal, results) {
    if (items.length === 0) return;
    if (items.length === 1) {
      items[0]._rect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      results.push(items[0]);
      return;
    }
    var w = Math.min(rect.w, rect.h);
    var row = [items[0]];
    var rowSum = items[0]._val;
    var worst = _worstRatio(row, rowSum, w, totalVal, rect);

    for (var i = 1; i < items.length; i++) {
      var testRow = row.concat([items[i]]);
      var testSum = rowSum + items[i]._val;
      var testWorst = _worstRatio(testRow, testSum, w, totalVal, rect);
      if (testWorst <= worst) {
        row = testRow;
        rowSum = testSum;
        worst = testWorst;
      } else {
        break;
      }
    }

    // Lay out this row
    var rowFrac = rowSum / totalVal;
    var isHoriz = rect.w >= rect.h;
    var rowRect, remaining;
    if (isHoriz) {
      var rw = rect.w * rowFrac;
      rowRect = { x: rect.x, y: rect.y, w: rw, h: rect.h };
      remaining = { x: rect.x + rw, y: rect.y, w: rect.w - rw, h: rect.h };
    } else {
      var rh = rect.h * rowFrac;
      rowRect = { x: rect.x, y: rect.y, w: rect.w, h: rh };
      remaining = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh };
    }

    // Position items within row
    var offset = 0;
    for (var j = 0; j < row.length; j++) {
      var frac = row[j]._val / rowSum;
      if (isHoriz) {
        row[j]._rect = { x: rowRect.x, y: rowRect.y + offset, w: rowRect.w, h: rowRect.h * frac };
        offset += rowRect.h * frac;
      } else {
        row[j]._rect = { x: rowRect.x + offset, y: rowRect.y, w: rowRect.w * frac, h: rowRect.h };
        offset += rowRect.w * frac;
      }
      results.push(row[j]);
    }

    var rest = items.slice(row.length);
    var restTotal = totalVal - rowSum;
    _squarifyRows(rest, remaining, restTotal, results);
  }

  function _worstRatio(row, rowSum, w, totalVal, rect) {
    var totalArea = rect.w * rect.h;
    var rowArea = (rowSum / totalVal) * totalArea;
    var rowSide = rowArea / w;
    var worst = 0;
    for (var i = 0; i < row.length; i++) {
      var a = (row[i]._val / rowSum) * rowArea;
      var s = a / rowSide;
      var ratio = Math.max(rowSide / s, s / rowSide);
      if (ratio > worst) worst = ratio;
    }
    return worst;
  }

  function _treemapColor(value, mode) {
    // value is either % change (mode=change) or % vs NAV (mode=nav)
    if (value === undefined || isNaN(value)) return '#333';
    var clamped = Math.max(-30, Math.min(30, value));
    var intensity = Math.abs(clamped) / 30;
    if (value > 0) {
      // Green scale
      var r = Math.round(20 - 20 * intensity);
      var g = Math.round(60 + 140 * intensity);
      var b = Math.round(30 + 40 * intensity);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    } else if (value < 0) {
      // Red scale
      var r2 = Math.round(60 + 140 * intensity);
      var g2 = Math.round(20 - 10 * intensity);
      var b2 = Math.round(20 - 10 * intensity);
      return 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
    }
    return '#333';
  }

  function renderTreemap() {
    var wrap = document.getElementById('treemap-wrap');
    if (!wrap || _landingView !== 'treemap') return;

    var liveTokens = landingTokens.filter(function(t) {
      return t.live && !_isGraveyardToken(t) && (_treemapSizeBy === 'mcap' ? t.mcap > 0 : t.treasury > 0);
    });

    if (liveTokens.length === 0) {
      wrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-size:13px">Loading data...</div>';
      return;
    }

    // Prepare items
    var items = liveTokens.map(function(t) {
      var colorVal;
      if (_treemapColorBy === 'change') {
        colorVal = t.change24h;
      } else {
        colorVal = t.strike > 0 ? ((t.spot - t.strike) / t.strike * 100) : undefined;
      }
      return {
        key: t.key,
        ticker: t.ticker,
        name: t.name,
        logo: t.logo,
        _val: _treemapSizeBy === 'mcap' ? t.mcap : t.treasury,
        change24h: t.change24h,
        colorVal: colorVal,
        mcap: t.mcap,
        treasury: t.treasury
      };
    }).sort(function(a, b) { return b._val - a._val; });

    var rect = { x: 0, y: 0, w: wrap.offsetWidth, h: wrap.offsetHeight };
    squarify(items, rect);

    var fmtK = function(n) { return n >= 999500 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + Math.round(n); };

    var html = items.map(function(d) {
      var r = d._rect;
      if (!r || r.w < 2 || r.h < 2) return '';
      var area = r.w * r.h;
      var minDim = Math.min(r.w, r.h);
      var sizeClass = (minDim < 25 || area < 1200) ? 'tm-micro' : (minDim < 50 || area < 3500) ? 'tm-tiny' : (minDim < 70 || area < 7000) ? 'tm-small' : '';
      var bg = _treemapColor(d.colorVal, _treemapColorBy);
      var chgText = d.colorVal !== undefined && !isNaN(d.colorVal)
        ? (d.colorVal >= 0 ? '+' : '') + d.colorVal.toFixed(2) + '%'
        : '';
      var valText = fmtK(_treemapSizeBy === 'mcap' ? d.mcap : d.treasury);
      var logoHtml = d.logo ? '<img class="tm-logo" src="' + _esc(d.logo) + '" alt="' + _esc(d.ticker) + '" loading="lazy">' : '';

      return '<div class="tm-cell ' + sizeClass + '" data-key="' + _esc(d.key) + '" data-ticker="' + _esc(d.ticker) + '"' +
        ' data-name="' + _esc(d.name) + '" data-chg="' + _esc(chgText || '—') + '"' +
        ' data-mcap="' + _esc(fmtK(d.mcap)) + '" data-treasury="' + _esc(fmtK(d.treasury)) + '"' +
        ' data-nav="' + (d.colorVal !== undefined && !isNaN(d.colorVal) && _treemapColorBy === 'nav' ? (d.colorVal >= 0 ? '+' : '') + d.colorVal.toFixed(1) + '%' : '') + '"' +
        ' style="' +
        'left:' + r.x.toFixed(1) + 'px;top:' + r.y.toFixed(1) + 'px;' +
        'width:' + r.w.toFixed(1) + 'px;height:' + r.h.toFixed(1) + 'px;' +
        'background:' + bg + '">' +
        logoHtml +
        '<div class="tm-ticker">' + _esc(d.ticker) + '</div>' +
        '<div class="tm-change">' + chgText + '</div>' +
        '<div class="tm-value">' + valText + '</div>' +
        '</div>';
    }).join('');

    wrap.innerHTML = html;

    // Click to navigate to token
    wrap.querySelectorAll('.tm-cell').forEach(function(cell) {
      cell.addEventListener('click', function() {
        window.location.href = _tokenPageUrl(cell.dataset.key);
      });
    });

    // Hover tooltip
    _initTreemapTooltip(wrap);
  }

  var _tmTooltip = null;
  function _initTreemapTooltip(wrap) {
    if (!_tmTooltip) {
      _tmTooltip = document.createElement('div');
      _tmTooltip.className = 'tm-tooltip';
      _tmTooltip.style.display = 'none';
      document.body.appendChild(_tmTooltip);
    }
    wrap.addEventListener('mousemove', function(e) {
      var cell = e.target.closest('.tm-cell');
      if (!cell) { _tmTooltip.style.display = 'none'; return; }
      var d = cell.dataset;
      _tmTooltip.innerHTML =
        '<div class="tm-tt-name">' + _esc(d.name) + ' (' + _esc(d.ticker) + ')</div>' +
        '<div class="tm-tt-row"><span class="tm-tt-label">MCap</span><span class="tm-tt-val">' + _esc(d.mcap) + '</span></div>' +
        '<div class="tm-tt-row"><span class="tm-tt-label">Treasury</span><span class="tm-tt-val">' + _esc(d.treasury) + '</span></div>' +
        (_treemapColorBy === 'change'
          ? '<div class="tm-tt-row"><span class="tm-tt-label">24H</span><span class="tm-tt-val">' + _esc(d.chg) + '</span></div>'
          : '<div class="tm-tt-row"><span class="tm-tt-label">Prem/Disc</span><span class="tm-tt-val">' + _esc(d.nav || '—') + '</span></div>');
      _tmTooltip.style.display = 'block';
      var tx = e.clientX + 14, ty = e.clientY + 14;
      if (tx + 180 > window.innerWidth) tx = e.clientX - 180;
      if (ty + 120 > window.innerHeight) ty = e.clientY - 120;
      _tmTooltip.style.left = tx + 'px';
      _tmTooltip.style.top = ty + 'px';
    });
    wrap.addEventListener('mouseleave', function() {
      _tmTooltip.style.display = 'none';
    });
  }

  // Re-render on window resize
  var _treemapResizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(_treemapResizeTimer);
    _treemapResizeTimer = setTimeout(function() {
      var tmOv = document.getElementById('treemap-overlay');
      if (_landingView === 'treemap' && tmOv && tmOv.classList.contains('open')) renderTreemap();
    }, 150);
  });

  async function fetchLandingData() {
    try {
      // Landing first paint uses the cached home bootstrap when available.
      // discoverTokens/getAllTokens both reuse that same promise on the home page.
      var homeBootstrapP = (!_hasToken && typeof getHomeBootstrap === 'function') ? getHomeBootstrap() : Promise.resolve(null);
      var results = await Promise.all([discoverTokens(), getAllTokens()]);
      // Refresh landingTokens from newly loaded TOKENS (set by discoverTokens)
      refreshLandingTokens();

      var data = results[1];
      if (!data || !data.tokens) {
        // Retry once — getAllTokens cache was cleared on failure
        data = await getAllTokens();
        if (!data || !data.tokens) return;
      }
      for (var i = 0; i < data.tokens.length; i++) {
        var t = data.tokens[i];
        if (t.error) continue;
        var currentTokenKey = _normalizeTokenKey(t.token);
        if (!currentTokenKey) continue;
        var existingCached = _cachedPriceMap[currentTokenKey];
        if (existingCached && existingCached.spot > 0 && (!(t.spot > 0) || t.currentNavStatus === 'dependency_unavailable')) {
          t.spot = existingCached.spot;
        }
        if (existingCached && existingCached.change24h != null && t.change24h == null) {
          t.change24h = existingCached.change24h;
        }
        _cachedPriceMap[currentTokenKey] = t;
        var lt = landingTokens.find(function(x) { return x.key === currentTokenKey; });
        if (!lt) continue;
        var snap = t.navSnapshot || null;
        var snapSupply = (snap && snap.supply) || {};
        var treasury = snap && snap.treasuryUSDC != null ? +snap.treasuryUSDC : t.treasuryUSDC;
        var effSupply = snapSupply.effective != null ? +snapSupply.effective : t.effectiveSupply;
        var navPerToken = snap && snap.navPerToken != null ? +snap.navPerToken : (treasury > 0 && effSupply > 0 ? treasury / effSupply : 0);
        if (t.spot > 0) {
          lt.spot = t.spot;
          var marketCap = t.marketCap;
          if (!(marketCap > 0) && snap && snap.market && snap.market.marketCap > 0) marketCap = snap.market.marketCap;
          if (!(marketCap > 0) && effSupply > 0) marketCap = t.spot * effSupply;
          lt.mcap = marketCap > 0 ? marketCap : 0;
        }
        if (treasury > 0 && effSupply > 0) { lt.treasury = treasury; lt.strike = navPerToken; lt.effectiveSupply = effSupply; }
        var canonical24h = _canonicalPriceChange24h(t);
        if (canonical24h !== null) lt.change24h = canonical24h;
        if (t.navSnapshot) lt.navSnapshot = t.navSnapshot;
        if (typeof t.navVerified === 'boolean') lt.navVerified = t.navVerified;
        if (t.navSnapshot && t.navSnapshot.status) lt.navVerified = t.navSnapshot.status !== 'unverified';
        if (t.navZScore) lt.navZScore = t.navZScore;
        _applyCurrentNavLifecycle(lt, t);
      }
      window._cachedPriceMap = _cachedPriceMap;
      renderTable();
      renderTreemap();
      // Populate left sidebar on landing page too
      populateSidebarFromLanding();
      // Sparklines loaded in parallel (see _earlySparkP below)
      var totalTreasury = _activeLandingTokens().reduce(function(s, t) { return s + (t.treasury || 0); }, 0);
      var el = document.getElementById('landing-nav-total');
      if (el) el.textContent = totalTreasury >= 1e6 ? '$' + (totalTreasury / 1e6).toFixed(2) + 'M' : '$' + Math.round(totalTreasury).toLocaleString();
      var totalMcap = _activeLandingTokens().reduce(function(s, t) { return s + (t.mcap || 0); }, 0);
      var mcapEl = document.getElementById('landing-mcap-total');
      if (mcapEl) mcapEl.textContent = totalMcap >= 1e6 ? '$' + (totalMcap / 1e6).toFixed(2) + 'M' : '$' + Math.round(totalMcap).toLocaleString();
      _paintLandingHeroStats();
      homeBootstrapP.then(function(homeBootstrap) {
        if (homeBootstrap && homeBootstrap.sparklines) {
          _applySparklines({ sparklines: homeBootstrap.sparklines });
        }
      });
    } catch (e) { console.warn('API fetch failed:', e.message); }
  }

  function populateSidebarFromLanding() {
    var allList = document.getElementById('tlp-all-list');
    var launchList = document.getElementById('tlp-launches-list');
    var countEl = document.getElementById('tp-count');
    if (!allList) return;
    var liveTokens = Object.entries(TOKENS).filter(function(e) { return e[1].live; });
    if (countEl) countEl.textContent = liveTokens.length;
    var fmtP = function(n) { return n >= 1 ? '$' + n.toFixed(2) : n > 0 ? '$' + n.toFixed(4) : '<span class="tt-skel tt-skel-sm"></span>'; };
    var isMarketWorkspace = document.documentElement.dataset.workspace === 'markets';
    var secondaryMetric = typeof getMarketTokenSecondaryMetric === 'function'
      ? getMarketTokenSecondaryMetric()
      : 'change24h';
    var secondaryLabels = {
      change24h: '24h',
      change1h: '1h',
      nav: 'NAV'
    };
    var secondaryLabel = document.getElementById('tp-token-secondary-label');
    if (secondaryLabel) secondaryLabel.textContent = secondaryLabels[secondaryMetric] || '24h';
    document.querySelectorAll('input[name="tp-token-secondary-column"]').forEach(function(input) {
      input.checked = input.value === secondaryMetric;
    });
    var dragHandle = '<span class="wl-drag-handle"><svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor"><circle cx="1" cy="1" r="1"/><circle cx="5" cy="1" r="1"/><circle cx="1" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="1" cy="9" r="1"/><circle cx="5" cy="9" r="1"/></svg></span>';

    function fmtCompactUsd(value) {
      value = Number(value);
      if (!isFinite(value) || value <= 0) return '—';
      if (value >= 1e9) return '$' + (value / 1e9).toFixed(value >= 1e10 ? 1 : 2) + 'B';
      if (value >= 1e6) return '$' + (value / 1e6).toFixed(value >= 1e7 ? 1 : 2) + 'M';
      if (value >= 1e3) return '$' + (value / 1e3).toFixed(value >= 1e4 ? 1 : 2) + 'K';
      return value >= 1 ? '$' + value.toFixed(2) : '$' + value.toFixed(4);
    }

    function renderMarketSecondaryMetric(token) {
      token = token || {};
      if (secondaryMetric === 'nav') {
        return '<div class="tt-change tp-token-secondary is-neutral" data-metric="nav">' + fmtCompactUsd(token.strike) + '</div>';
      }
      var value = secondaryMetric === 'change1h' ? token.change1h : token.change24h;
      var metricKey = secondaryMetric === 'change1h' ? 'change1h' : 'change24h';
      if (value == null || !isFinite(Number(value))) {
        return '<div class="tt-change tp-token-secondary is-neutral" data-metric="' + metricKey + '">—</div>';
      }
      value = Number(value);
      return '<div class="tt-change tp-token-secondary" data-metric="' + metricKey + '"><span class="' + (value >= 0 ? 'up' : 'down') + '">' +
        _fmtSignedSidebarPct(value) + '%</span></div>';
    }

    function renderRow(key, tok, overrideBadge, isWatchlist) {
      var lt = landingTokens.find(function(x) { return x.key === key; });
      var spot = (lt && lt.spot) || 0;
      var chg24 = lt && lt.change24h;
      var watched = _navgatorWatchlist.has(key);
      var verifiedBadge = lt && lt.navVerified !== false
        ? '<span class="tp-verified-badge" title="Verified asset" aria-label="Verified asset"><svg viewBox="0 0 18 20" aria-hidden="true"><path d="M9 1.5 15.2 4v5.4c0 4.1-2.6 7.3-6.2 9.1-3.6-1.8-6.2-5-6.2-9.1V4L9 1.5Z"/><path d="m6 9.6 1.8 1.8 4-4.2"/></svg></span>'
        : '';
      var squareCls = tok.graveyard ? ' graveyard-square-icon' : '';
      var iconH = tok.logo
        ? '<div class="tp-icon' + squareCls + '"><img src="' + _esc(tok.logo) + '" alt="' + _esc(tok.ticker) + '" loading="lazy"></div>'
        : '<div class="tp-icon' + squareCls + '" style="background:' + _esc(tok.color||'#2a343e') + ';font-size:12px;font-weight:700;color:#fff">' + _esc(tok.ticker[0]) + '</div>';
      var _pendingLiq = lt && lt.proposalFlag && lt.proposalFlag.type === 'liquidation' && lt.proposalFlag.state === 'pending' && !_isGraveyardToken(lt);
      var chg24Html;
      if (_isGraveyardToken(lt)) {
        chg24Html = '<div style="font-size:10px;font-weight:700;color:#ff3333;letter-spacing:1px;opacity:0.8">LIQUIDATED</div>';
      } else if (_pendingLiq) {
        chg24Html = '<div style="font-size:10px;font-weight:700;color:#FFB000;letter-spacing:0.5px;opacity:0.9">LIQ VOTE</div>';
      } else if (overrideBadge) {
        chg24Html = overrideBadge;
      } else if (chg24 !== undefined && chg24 !== null && isFinite(chg24)) {
        chg24Html = chg24 === 0
          ? '<div class="tt-change" style="font-size:12px"><span style="color:var(--dim);font-family:\'IBM Plex Mono\',monospace">24H</span> <span style="color:var(--dim)">— 0%</span></div>'
          : '<div class="tt-change" style="font-size:12px"><span style="color:var(--dim);font-family:\'IBM Plex Mono\',monospace">24H</span> <span class="' + (chg24 >= 0 ? 'up' : 'down') + '">' + (chg24 >= 0 ? '▲' : '▼') + ' ' + _fmtSignedSidebarPct(chg24) + '%</span></div>';
      } else {
        chg24Html = '<div class="tt-change" style="font-size:12px"><span class="tt-skel tt-skel-sm"></span></div>';
      }
      if (isMarketWorkspace && !_isGraveyardToken(lt) && !_pendingLiq && !overrideBadge) {
        chg24Html = renderMarketSecondaryMetric(lt);
      }
      return '<a class="tp-item" data-key="' + _esc(key) + '"' +
        ' data-watched="' + (watched ? 'true' : 'false') + '"' +
        ' data-market-search-primary="' + _esc(tok.ticker) + '"' +
        ' data-market-search="' + _esc([tok.ticker, tok.name || '', key].join(' ')) + '"' +
        ' data-sort-price="' + _esc(String(spot || '')) + '"' +
        ' data-sort-change="' + _esc(String(lt && isFinite(Number(lt.change24h)) ? Number(lt.change24h) : '')) + '"' +
        ' data-sort-market-cap="' + _esc(String(lt && lt.mcap > 0 ? lt.mcap : '')) + '"' +
        ' data-sort-volume="' + _esc(String(lt && lt.volume24h > 0 ? lt.volume24h : '')) + '"' +
        ' href="' + _tokenPageUrl(key) + '">' +
        (isWatchlist
          ? dragHandle
          : '<span class="wl-star' + (watched ? ' active' : '') + '" onclick="event.preventDefault();event.stopPropagation();toggleWatchStar(this,this.closest(\'.tp-item\').dataset.key)">' + starSvg(watched) + '</span>') +
        iconH +
        '<div class="tp-content"><div class="tp-row"><span class="tp-name">' + _esc(tok.ticker) + verifiedBadge + '</span><div style="text-align:right"><span class="tp-price">' + fmtP(spot) + '</span>' + chg24Html + '</div></div></div>' +
        '</a>';
    }

    // New launches: tokens with launchDate, sorted most recent first
    var newLaunches = liveTokens
      .filter(function(e) { return e[1].launchDate; })
      .sort(function(a, b) { return new Date(b[1].launchDate) - new Date(a[1].launchDate); });
    var launchKeys = {};
    if (launchList && newLaunches.length > 0) {
      launchList.innerHTML = newLaunches.map(function(e) { launchKeys[e[0]] = true; return renderRow(e[0], e[1]); }).join('');
    }

    // Top Discounts: tokens trading furthest below NAV, top 3
    var discountList = document.getElementById('tlp-discounts-list');
    if (discountList) {
      var discountTokens = liveTokens
        .filter(function(e) { var lt = landingTokens.find(function(x) { return x.key === e[0]; }); return !_isGraveyardToken(lt); })
        .map(function(e) {
          var lt = landingTokens.find(function(x) { return x.key === e[0]; });
          var spot = (lt && lt.spot) || 0;
          var strike = (lt && lt.strike) || 0;
          var disc = (spot > 0 && strike > 0) ? ((spot - strike) / strike * 100) : null;
          return { key: e[0], tok: e[1], disc: disc };
        })
        .filter(function(d) { return d.disc !== null && d.disc < 0; })
        .sort(function(a, b) { return a.disc - b.disc; });
      discountList.innerHTML = discountTokens.length > 0
        ? discountTokens.map(function(d) {
            var badge = '<div class="tt-change" style="font-size:12px"><span style="color:var(--dim);font-family:\'IBM Plex Mono\',monospace">Disc</span> <span class="down">' + d.disc.toFixed(1) + '%</span></div>';
            return renderRow(d.key, d.tok, badge);
          }).join('')
        : '<div style="padding:6px 10px;font-size:12px;color:var(--dim)">No discounts</div>';
    }

    // Top Premiums: tokens trading furthest above NAV, top 5
    var premiumList = document.getElementById('tlp-premiums-list');
    if (premiumList) {
      var premiumTokens = liveTokens
        .filter(function(e) { var lt = landingTokens.find(function(x) { return x.key === e[0]; }); return !_isGraveyardToken(lt); })
        .map(function(e) {
          var lt = landingTokens.find(function(x) { return x.key === e[0]; });
          var spot = (lt && lt.spot) || 0;
          var strike = (lt && lt.strike) || 0;
          var prem = (spot > 0 && strike > 0) ? ((spot - strike) / strike * 100) : null;
          return { key: e[0], tok: e[1], prem: prem };
        })
        .filter(function(d) { return d.prem !== null && d.prem > 0; })
        .sort(function(a, b) { return b.prem - a.prem; });
      premiumList.innerHTML = premiumTokens.length > 0
        ? premiumTokens.map(function(d) {
            var badge = '<div class="tt-change" style="font-size:12px"><span style="color:var(--dim);font-family:\'IBM Plex Mono\',monospace">Prem</span> <span class="up">+' + d.prem.toFixed(1) + '%</span></div>';
            return renderRow(d.key, d.tok, badge);
          }).join('')
        : '<div style="padding:6px 10px;font-size:12px;color:var(--dim)">No premiums</div>';
    }

    var permList = document.getElementById('tlp-perm-list');
    if (permList) {
      var permTokens = liveTokens.filter(function(e) { return e[1].launchpad === 'Curated'; });
      permList.innerHTML = permTokens.length > 0
        ? permTokens.map(function(e) { return renderRow(e[0], e[1]); }).join('')
        : '<div style="padding:6px 10px;font-size:12px;color:var(--dim)">No curated tokens</div>';
    }

    var permlessList = document.getElementById('tlp-permless-list');
    if (permlessList) {
      var permlessTokens = liveTokens.filter(function(e) { return e[1].launchpad === 'Permissionless'; });
      permlessList.innerHTML = permlessTokens.length > 0
        ? permlessTokens.map(function(e) { return renderRow(e[0], e[1]); }).join('')
        : '<div style="padding:6px 10px;font-size:12px;color:var(--dim)">No permissionless tokens</div>';
    }

    // All tokens sorted by price descending
    allList.innerHTML = liveTokens
      .sort(function(a, b) {
        var sa = (landingTokens.find(function(x) { return x.key === a[0]; }) || {}).spot || 0;
        var sb = (landingTokens.find(function(x) { return x.key === b[0]; }) || {}).spot || 0;
        return sb - sa;
      })
      .map(function(e) { return renderRow(e[0], e[1]); }).join('');

    var wlList = document.getElementById('tlp-wl-list');
    if (wlList) {
      var wlItems = _navgatorWatchlist.selectEntries(liveTokens);
      if (wlItems.length > 0) {
        wlList.innerHTML = wlItems.map(function(e) { return renderRow(e[0], e[1], null, true); }).join('');
        initWatchlistDrag();
      } else {
        wlList.innerHTML = '<div class="tp-item tp-empty-watchlist"><div class="tp-content"><div class="tp-row"><span class="tp-name">Empty</span></div></div></div>';
      }
    }
    if (typeof applyMarketSidebarSearch === 'function') applyMarketSidebarSearch();
  }

  window.NAVGATOR = window.NAVGATOR || {};
  window.NAVGATOR.refreshMarketTokenSidebar = populateSidebarFromLanding;

  // Populate sidebar immediately with no-price placeholders, then update when API responds
  populateSidebarFromLanding();

  var _sparkCache = {};
  var _sparklinesLoaded = false;

  function _sparkValueAtCutoff(items, hours, field) {
    if (!items || items.length < 2) return null;
    var now = Math.floor(Date.now() / 1000);
    var cutoff = now - hours * 3600;
    var valid = items.filter(function(item) {
      return item && item.t && item[field] > 0;
    });
    if (valid.length < 2) return null;
    var closest = valid.reduce(function(best, item) {
      return Math.abs(item.t - cutoff) < Math.abs(best.t - cutoff) ? item : best;
    }, valid[0]);
    if (!closest || closest[field] <= 0) return null;
    var gap = Math.abs(closest.t - cutoff);
    if (hours <= 1) return gap <= 7200 ? closest[field] : null;
    if (hours > 1 && hours <= 24) {
      if (gap <= 46800) return closest[field];
      var before = null;
      var after = null;
      for (var i = 0; i < valid.length; i++) {
        var item = valid[i];
        if (item.t <= cutoff && (!before || item.t > before.t)) before = item;
        if (item.t >= cutoff && (!after || item.t < after.t)) after = item;
      }
      // Sparse daily history often leaves the 24h cutoff between two coarse points.
      if (before && after && after.t > before.t && (after.t - before.t) <= 172800) {
        var ratio = (cutoff - before.t) / (after.t - before.t);
        return before[field] + (after[field] - before[field]) * ratio;
      }
      return null;
    }
    return closest[field];
  }

  // Shared change calc — single source of truth for all 1h/24h/7d changes
  function _calcSparkChange(key, hours) {
    var cache = _sparkCache[key];
    if (!cache || !cache.items || cache.items.length < 2) return null;
    var items = cache.items;
    // Current price: prefer live spot from _cachedPriceMap, else last sparkline point
    var spotEntry = _cachedPriceMap[key];
    var currentPrice = (spotEntry && spotEntry.spot > 0) ? spotEntry.spot : items[items.length - 1].p;
    if (!currentPrice || currentPrice <= 0) return null;
    var referencePrice = _sparkValueAtCutoff(items, hours, 'p');
    if (!referencePrice || referencePrice <= 0) return null;
    return ((currentPrice - referencePrice) / referencePrice) * 100;
  }

  // NAV change calc — uses .n field from sparkline data
  function _calcNavChange(key, hours) {
    var cache = _sparkCache[key];
    if (!cache || !cache.items || cache.items.length < 2) return null;
    var items = cache.items;
    var now = Math.floor(Date.now() / 1000);
    var cutoff = now - hours * 3600;
    var currentNav = items[items.length - 1].n;
    if (!currentNav || currentNav <= 0) return null;
    var closest = items.reduce(function(best, c) {
      return (c.n > 0 && Math.abs(c.t - cutoff) < Math.abs(best.t - cutoff)) ? c : best;
    }, items[0]);
    if (!closest || !closest.n || closest.n <= 0) return null;
    var maxGap = hours <= 24 ? 46800 : 86400; // 13h for 24h, 24h for 7d
    if (Math.abs(closest.t - cutoff) > maxGap) return null;
    return ((currentNav - closest.n) / closest.n) * 100;
  }

  // Get old spark price N hours ago (for P−N diff calc)
  function _getSparkPrice(key, hours) {
    var cache = _sparkCache[key];
    if (!cache || !cache.items || cache.items.length < 2) return null;
    return _sparkValueAtCutoff(cache.items, hours, 'p');
  }

  window.fetchReLeaderboard = fetchReLeaderboard;
  async function fetchReLeaderboard() {
    var data = null;
    try {
      data = await _apiJson(API_BASE + '/api/buyback-efficiency');
    } catch(e) { console.warn('fetchReLeaderboard error:', e); }
    var body = document.getElementById('re-overlay-body');
    if (!body) return;
    if (!data || !data.tokens) {
      body.innerHTML = '<div style="width:100%;text-align:center;padding:24px 12px;font-size:12px;color:var(--dim)">Restructuring data unavailable.</div>';
      return;
    }
    var entries = Object.entries(data.tokens)
      .filter(function(e) { return e[1].navEfficiency != null; })
      .sort(function(a, b) { return b[1].navEfficiency - a[1].navEfficiency; });
    if (entries.length === 0) {
      body.innerHTML = '<div style="width:100%;text-align:center;padding:24px 12px;font-size:12px;color:var(--dim)">No restructuring data available.</div>';
      return;
    }

    var lfmt$ = function(n) { return n >= 1 ? '$' + n.toFixed(2) : n >= 0.01 ? '$' + n.toFixed(4) : '$' + n.toFixed(6); };
    var lfmtM = function(n) { return n >= 999500 ? '$' + (n/1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n/1e3).toFixed(1) + 'K' : '$' + n.toFixed(0); };

    var html = '';
    for (var i = 0; i < entries.length; i++) {
      var key = entries[i][0];
      var d = entries[i][1];
      var tok = TOKENS[key];
      var logo = tok ? 'logos/' + key + '.jpg' : '';
      var ticker = d.ticker || key.toUpperCase();
      var effColor = d.navEfficiency >= 1 ? 'var(--up)' : 'var(--red)';
      var statusText = d.inProgress ? 'In Progress' : 'Completed';
      var statusColor = d.inProgress ? 'var(--orange)' : 'var(--up)';
      var vcColor = (d.totalValueCreated || 0) >= 0 ? 'var(--up)' : 'var(--red)';

      html += '<div class="re-card" data-token-key="' + _esc(key) + '">'
        + '<div class="re-card-head">'
        + (logo ? '<img class="re-card-logo" src="' + _esc(logo) + '" alt="" onerror="this.style.display=\'none\'">' : '')
        + '<span class="re-card-ticker">' + _esc(ticker) + '</span>'
        + '<span class="re-card-status" style="color:' + statusColor + '">' + statusText + '</span>'
        + '</div>'
        + '<div class="re-card-eff" style="color:' + effColor + '">' + d.navEfficiency.toFixed(3) + 'x</div>'
        + '<div class="re-card-row"><span class="re-card-label">Value Created</span><span class="re-card-val" style="color:' + vcColor + '">' + lfmtM(d.totalValueCreated || 0) + '</span></div>'
        + '<div class="re-card-row"><span class="re-card-label">USDC Spent</span><span class="re-card-val">' + lfmtM(d.totalUsdcSpent || 0) + '</span></div>'
        + '<div class="re-card-row"><span class="re-card-label">Avg Price</span><span class="re-card-val">' + lfmt$(d.avgPrice || 0) + '</span></div>'
        + '<div class="re-card-row"><span class="re-card-label">Days</span><span class="re-card-val">' + (d.days || '—') + '</span></div>'
        + '</div>';
    }
    body.innerHTML = html;
    // Bind click handlers via addEventListener instead of inline onclick
    body.querySelectorAll('.re-card[data-token-key]').forEach(function(card) {
      card.addEventListener('click', function() {
        var overlay = document.getElementById('re-overlay');
        if (overlay) overlay.classList.remove('open');
        window.location.href = _tokenPageUrl(card.dataset.tokenKey);
      });
    });
  }

  function _applySparklines(data) {
    if (!data.sparklines) return;
    _sparklinesLoaded = true;
    appendDiscoveredLandingTokens();
    var liveTokens2 = landingTokens.filter(function(t) { return t.live; });
    for (var i = 0; i < liveTokens2.length; i++) {
      var t = liveTokens2[i];
      var items = data.sparklines[t.key];
      if (!items || items.length < 2) continue;
      // Downsample to ~1h intervals: keep first point, then only keep points ≥3600s after the last kept
      if (items.length > 2 && items[0].t && items[1].t && (items[1].t - items[0].t) < 3000) {
        var ds = [items[0]], lastT = items[0].t;
        for (var di = 1; di < items.length - 1; di++) {
          if (items[di].t - lastT >= 3600) { ds.push(items[di]); lastT = items[di].t; }
        }
        ds.push(items[items.length - 1]); // always keep last
        items = ds;
      }
      var _pricesRaw = items.map(function(c) { return c.p; });
      var _navRaw = items.map(function(c) { return c.n || 0; });
      var prices = [], navPrices = [], priceTimes = [];
      for (var pi = 0; pi < _pricesRaw.length; pi++) {
        if (_pricesRaw[pi] > 0) {
          prices.push(_pricesRaw[pi]);
          navPrices.push(_navRaw[pi]);
          priceTimes.push(items[pi] && items[pi].t ? Number(items[pi].t) : pi);
        }
      }
      var lastNav = items[items.length - 1].n || t.strike || 0;
      if (prices.length >= 2) {
        var latestSparkPrice = prices[prices.length - 1];
        if (latestSparkPrice > 0 && (!(t.spot > 0) || t.currentNavStatus === 'dependency_unavailable')) {
          t.spot = latestSparkPrice;
        }
        _sparkCache[t.key] = {
          prices: prices,
          navPrices: navPrices,
          renderPrices: _resampleSparkSeries(priceTimes, prices, 36),
          nav: lastNav,
          items: items
        };
        t.change1h = _calcSparkChange(t.key, 1);
        if (t.change24h === undefined || t.change24h === null) t.change24h = _calcSparkChange(t.key, 24);
        t.change7d = _calcSparkChange(t.key, 168);
        t.navChange7d = _calcNavChange(t.key, 168);
      }
    }
    liveTokens2.forEach(function(t) {
      if (!_cachedPriceMap[t.key]) _cachedPriceMap[t.key] = { token: t.key };
      if (_cachedPriceMap[t.key]) {
        if (t.change1h !== undefined) _cachedPriceMap[t.key].change1h = t.change1h;
        if (t.change24h != null && _cachedPriceMap[t.key].change24h == null) _cachedPriceMap[t.key].change24h = t.change24h;
        if (t.change7d !== undefined) _cachedPriceMap[t.key].change7d = t.change7d;
        if (t.navChange7d !== undefined) _cachedPriceMap[t.key].navChange7d = t.navChange7d;
        var sc = _sparkCache[t.key];
        if (sc && sc.prices && sc.prices.length > 0) {
          var latestPrice = sc.prices[sc.prices.length - 1];
          if (latestPrice > 0 && (!(_cachedPriceMap[t.key].spot > 0) || _cachedPriceMap[t.key].currentNavStatus === 'dependency_unavailable')) {
            _cachedPriceMap[t.key].spot = latestPrice;
          }
        }
        if (sc && sc.nav > 0) _cachedPriceMap[t.key].nav = sc.nav;
      }
    });
    renderTable();
    renderTreemap();
    populateSidebarFromLanding();
    if (typeof renderTokenLeftPanel === 'function') renderTokenLeftPanel(_cachedPriceMap);
    requestAnimationFrame(function() { setTimeout(drawAllSparklines, 50); });

    // Token pages defer sparklines until after chart boot, so refresh the
    // active token's sparkline-backed change pills as soon as this data lands.
    if (typeof _refreshTokenMetricChanges === 'function') _refreshTokenMetricChanges();

    // Compute 7D changes for hero stats
    (function() {
      var liveT = _activeLandingTokens();
      var totalMcapNow = 0, totalMcap7d = 0;
      var totalTreasuryNow = 0, totalTreasury7d = 0;
      for (var i = 0; i < liveT.length; i++) {
        var t = liveT[i];
        var sc = _sparkCache[t.key];
        if (!sc || !sc.prices || sc.prices.length < 2) continue;
        var supply = t.effectiveSupply || 1;
        var priceNow = sc.prices[sc.prices.length - 1];
        var price7d = sc.prices[0];
        totalMcapNow += priceNow * supply;
        totalMcap7d += price7d * supply;
        if (sc.navPrices) {
          var navNow = sc.navPrices[sc.navPrices.length - 1];
          var nav7d = sc.navPrices[0];
          if (navNow > 0) totalTreasuryNow += navNow * supply;
          if (nav7d > 0) totalTreasury7d += nav7d * supply;
        }
      }
      function setHeroChg(id, now, ago) {
        var el = document.getElementById(id);
        if (!el || ago <= 0) return;
        var pct = (now - ago) / ago * 100;
        var cls = pct >= 0 ? 'up' : 'down';
        var arrow = pct >= 0 ? '▲' : '▼';
        el.innerHTML = '<span class="' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</span> <span style="color:var(--dim)">7D</span>';
      }
      setHeroChg('landing-treasury-7d', totalTreasuryNow, totalTreasury7d);
      setHeroChg('landing-mcap-7d', totalMcapNow, totalMcap7d);
      var newCount = 0;
      for (var i = 0; i < liveT.length; i++) {
        var ld = liveT[i].launchDate;
        if (ld && (Date.now() - new Date(ld).getTime()) < 7 * 86400000) newCount++;
      }
      var countChgEl = document.getElementById('landing-count-7d');
      if (countChgEl && newCount > 0) {
        countChgEl.innerHTML = '<span class="up">+' + newCount + '</span> <span style="color:var(--dim)">7D</span>';
      }
    })();
  }

  async function loadSparklines(attempt) {
    attempt = attempt || 0;
    if (_sparklinesLoaded && attempt === 0) return;
    try {
      var data = await _apiJson(API_BASE + '/api/sparklines');
      _applySparklines(data);
    } catch (e) { if (attempt < 2) { setTimeout(function() { loadSparklines(attempt + 1); }, 2000); } }
  }
  window.loadSparklines = loadSparklines;

  function _resampleSparkSeries(times, values, targetPoints) {
    if (!values || values.length < 2) return values ? values.slice() : [];
    var count = Math.max(16, targetPoints || 56);
    if (values.length === count) return values.slice();
    var xs = [];
    var hasTimes = Array.isArray(times) && times.length === values.length;
    for (var i = 0; i < values.length; i++) xs.push(hasTimes && isFinite(times[i]) ? Number(times[i]) : i);
    var x0 = xs[0], x1 = xs[xs.length - 1];
    if (!(x1 > x0)) {
      xs = [];
      for (var j = 0; j < values.length; j++) xs.push(j);
      x0 = xs[0];
      x1 = xs[xs.length - 1];
    }
    var out = [];
    var src = 0;
    for (var k = 0; k < count; k++) {
      var tx = x0 + (x1 - x0) * (k / (count - 1));
      while (src < xs.length - 2 && xs[src + 1] < tx) src++;
      var xa = xs[src], xb = xs[Math.min(src + 1, xs.length - 1)];
      var va = values[src], vb = values[Math.min(src + 1, values.length - 1)];
      var frac = (xb > xa) ? (tx - xa) / (xb - xa) : 0;
      out.push(va + (vb - va) * frac);
    }
    out[0] = values[0];
    out[out.length - 1] = values[values.length - 1];
    return out;
  }

  function drawSVGSparkline(key, prices, navVal) {
    var container = document.querySelector('.spark-container[data-token="' + key + '"]');
    if (!container || prices.length < 2) return;
    var w = 180, h = 42;
    var dpr = window.devicePixelRatio || 1;
    var canvas = document.createElement('canvas');
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.dataset.token = key;
    container.innerHTML = '';
    container.appendChild(canvas);
    // Scale includes both price range and NAV so the NAV dotted line always
    // has a real position to sit at. When NAV is far from price the curve will
    // look flatter — that's honest (price really is distant from NAV).
    var pMin = Math.min.apply(null, prices);
    var pMax = Math.max.apply(null, prices);
    var navValid = isFinite(navVal) && navVal > 0;
    if (navValid) {
      pMin = Math.min(pMin, navVal);
      pMax = Math.max(pMax, navVal);
    }
    var navInRange = navValid;
    var range = pMax - pMin || 1;
    var mid = (pMax + pMin) / 2;
    var minRange = mid * 0.005;
    if (range < minRange) { pMin = mid - minRange / 2; pMax = mid + minRange / 2; range = minRange; }
    pMin -= range * 0.02; pMax += range * 0.02; range = pMax - pMin;
    var last = prices[prices.length - 1];
    // Color based on premium/discount vs NAV (matches chart convention) — fall back to start/end if no NAV
    var color = navValid ? (last >= navVal ? '#00cc66' : '#ff3333') : (last >= prices[0] ? '#00cc66' : '#ff3333');
    var changePct = navValid
      ? Math.abs((last - navVal) / navVal * 100)
      : Math.abs((last - prices[0]) / prices[0] * 100);
    canvas._sparkData = { prices: prices, pMin: pMin, range: range, color: color, changePct: changePct, w: w, lw: 164, h: h, lh: 34, nav: navValid ? navVal : 0, navInRange: navInRange };
    drawSparkCanvas(canvas, false);
  }

  function _traceSparkLine(ctx, pts, smoothness) {
    if (!pts || pts.length < 2) return;
    var s = smoothness == null ? 0.2 : smoothness;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
      return;
    }
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = i > 0 ? pts[i - 1] : pts[i];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = (i + 2 < pts.length) ? pts[i + 2] : p2;
      var cp1x = p1.x + (p2.x - p0.x) * s;
      var cp1y = p1.y + (p2.y - p0.y) * s;
      var cp2x = p2.x - (p3.x - p1.x) * s;
      var cp2y = p2.y - (p3.y - p1.y) * s;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  function drawSparkCanvas(canvas, hovered) {
    var d = canvas._sparkData;
    if (!d) return;
    var dpr = window.devicePixelRatio || 1;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    // Light smoothing only — just enough to round out single-point noise while
    // preserving the actual shape of price movement.
    var smooth = d.prices.slice();
    for (var sj = 1; sj < smooth.length - 1; sj++) {
      smooth[sj] = d.prices[sj - 1] * 0.25 + d.prices[sj] * 0.5 + d.prices[sj + 1] * 0.25;
    }
    smooth[smooth.length - 1] = d.prices[d.prices.length - 1]; // keep last point exact
    // Ease last few smoothed points toward raw endpoint so line meets dot cleanly
    var rawLast = d.prices[d.prices.length - 1];
    var easeLen = Math.max(4, Math.round(smooth.length * 0.06));
    for (var ei = 0; ei < easeLen; ei++) {
      var idx = smooth.length - 2 - ei;
      if (idx < 0) break;
      var blend = 1 - (ei + 1) / (easeLen + 1);
      smooth[idx] = smooth[idx] + (rawLast - smooth[idx]) * blend;
    }
    var dotR = 3; // max dot radius — reserve right margin so dot isn't clipped
    var lineW = d.lw || d.w; // line drawing width (canvas may be wider for ripple room)
    var lineH = d.lh || d.h; // line drawing height (canvas may be taller for ripple room)
    var yOff = (d.h - lineH) / 2; // center line area vertically
    var pad = 6;
    var pts = smooth.map(function(p, i) {
      return { x: (i / (smooth.length - 1)) * (lineW - dotR), y: yOff + pad + ((lineH - pad * 2) - ((p - d.pMin) / d.range) * (lineH - pad * 2)) };
    });
    // Parse hex color to RGB for gradient alpha
    var r = parseInt(d.color.slice(1,3), 16), g = parseInt(d.color.slice(3,5), 16), b = parseInt(d.color.slice(5,7), 16);
    // Compute NAV horizontal line y-position (constant across width).
    var navY = (d.nav > 0)
      ? (yOff + pad + ((lineH - pad * 2) - ((d.nav - d.pMin) / d.range) * (lineH - pad * 2)))
      : null;
    // Gradient fill between price line and NAV line — only draw when NAV is
    // actually within the price range; otherwise the fill would cover nearly
    // the full canvas and drown out the price curve.
    if (navY !== null && d.navInRange) {
      ctx.save();
      var fillAlpha = hovered ? 0.34 : 0.22;
      // Vertical fade — strongest near the price line, fading toward the NAV line and beyond
      var bandGrad = ctx.createLinearGradient(0, Math.min(navY, pts[0].y), 0, Math.max(navY, pts[0].y));
      bandGrad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + fillAlpha + ')');
      bandGrad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.05)');
      ctx.fillStyle = bandGrad;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, navY);
      for (var pi = 0; pi < pts.length; pi++) ctx.lineTo(pts[pi].x, pts[pi].y);
      ctx.lineTo(pts[pts.length - 1].x, navY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Fade-in gradient: transparent at left edge, solid by ~30%
    var fadeGrad = ctx.createLinearGradient(0, 0, lineW, 0);
    fadeGrad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    fadeGrad.addColorStop(0.3, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    fadeGrad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    var smoothness = hovered ? 0.28 : 0.25;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // Dotted horizontal NAV line — uses the same #ffcc00 yellow as the chart's NAV line
    if (navY !== null) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 204, 0, ' + (hovered ? 0.85 : 0.7) + ')';
      ctx.lineWidth = 1;
      ctx.setLineDash([2.5, 2.5]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, navY);
      ctx.lineTo(pts[pts.length - 1].x, navY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.shadowColor = d.color;
    ctx.shadowBlur = hovered ? Math.min(12, 2.5 + d.changePct * 0.3) : Math.min(7, 1.5 + d.changePct * 0.16);
    ctx.strokeStyle = fadeGrad;
    ctx.lineWidth = hovered ? 3.2 : 2.5;
    ctx.globalAlpha = hovered ? 0.2 : 0.12;
    _traceSparkLine(ctx, pts, smoothness);
    ctx.stroke();

    ctx.shadowBlur = hovered ? 3 : 2;
    ctx.lineWidth = hovered ? 2.05 : 1.8;
    ctx.globalAlpha = hovered ? 0.45 : 0.28;
    _traceSparkLine(ctx, pts, smoothness);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = hovered ? 1.65 : 1.45;
    ctx.globalAlpha = 1;
    _traceSparkLine(ctx, pts, smoothness);
    ctx.stroke();
    // Dot on most recent data point
    var last = pts[pts.length - 1];
    ctx.shadowBlur = hovered ? 6 : 4;
    ctx.shadowColor = d.color;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(last.x, last.y, hovered ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
    // Store dot position for ripple animation
    canvas._dotPos = { x: last.x, y: last.y };
    ctx.restore();
  }

  // Water-drop ripple on the current dot — single pulse on hover
  function _rippleSparkDot(canvas) {
    if (!canvas || !canvas._sparkData || !canvas._dotPos) return;
    if (canvas._rippleAnim) cancelAnimationFrame(canvas._rippleAnim);
    var d = canvas._sparkData;
    var dot = canvas._dotPos;
    var dpr = window.devicePixelRatio || 1;
    var maxR = 12, duration = 500, rings = 2;
    var start = performance.now();
    function frame(now) {
      var t = (now - start) / duration;
      if (t > 1) { canvas._rippleAnim = null; drawSparkCanvas(canvas, true); return; }
      // Redraw base sparkline in hovered state, then overlay rings
      drawSparkCanvas(canvas, true);
      var ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      var r = parseInt(d.color.slice(1,3), 16), g = parseInt(d.color.slice(3,5), 16), b = parseInt(d.color.slice(5,7), 16);
      for (var i = 0; i < rings; i++) {
        var offset = i * 0.15;
        var rt = Math.max(0, Math.min(1, (t - offset) / (1 - offset)));
        if (rt <= 0) continue;
        var radius = 3 + rt * maxR;
        var alpha = 0.5 * (1 - rt) * (1 - rt);
        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        ctx.lineWidth = 1.5 * (1 - rt * 0.5);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      canvas._rippleAnim = requestAnimationFrame(frame);
    }
    canvas._rippleAnim = requestAnimationFrame(frame);
  }

  function drawAllSparklines() {
    Object.keys(_sparkCache).forEach(function(key) {
      drawSVGSparkline(key, _sparkCache[key].renderPrices || _sparkCache[key].prices, _sparkCache[key].nav);
    });
  }

  // Expose for auto-refresh
  window._refreshLandingData = fetchLandingData;
  window._calcSparkChange = _calcSparkChange;
  window._getSparkPrice = _getSparkPrice;
  window._sparkCache = _sparkCache;

  // Hover on landing table rows: ripple the sparkline dot
  (function() {
    var table = document.querySelector('.token-table');
    if (!table) return;
    var _hoveredRow = null;
    table.addEventListener('click', function(e) {
      if (e.target.closest('button, a, input, select, textarea, .wl-star')) return;
      var row = e.target.closest('tr[data-token-key]');
      if (!row || !row.dataset.tokenKey) return;
      window.location.href = _tokenPageUrl(row.dataset.tokenKey);
    });
    table.addEventListener('mouseover', function(e) {
      var row = e.target.closest('tr[data-token-key]');
      if (row === _hoveredRow) return;
      // Unhover previous
      if (_hoveredRow) {
        var prevKey = _hoveredRow.dataset.tokenKey;
        var prevCanvas = _hoveredRow.querySelector('canvas[data-token="' + prevKey + '"]');
        if (prevCanvas && prevCanvas._sparkData) {
          if (prevCanvas._rippleAnim) { cancelAnimationFrame(prevCanvas._rippleAnim); prevCanvas._rippleAnim = null; }
          drawSparkCanvas(prevCanvas, false);
        }
      }
      _hoveredRow = row;
      if (!row) return;
      var key = row.dataset.tokenKey;
      var canvas = row.querySelector('canvas[data-token="' + key + '"]');
      if (canvas && canvas._sparkData) {
        drawSparkCanvas(canvas, true);
        _rippleSparkDot(canvas);
      }
    });
    table.addEventListener('mouseleave', function() {
      if (_hoveredRow) {
        var key = _hoveredRow.dataset.tokenKey;
        var canvas = _hoveredRow.querySelector('canvas[data-token="' + key + '"]');
        if (canvas && canvas._sparkData) {
          if (canvas._rippleAnim) { cancelAnimationFrame(canvas._rippleAnim); canvas._rippleAnim = null; }
          drawSparkCanvas(canvas, false);
        }
        _hoveredRow = null;
      }
    });
  })();

  if (_hasToken) {
    // Token pages do not need the hidden landing table boot path.
    setTimeout(function() { loadSparklines(0); }, 2500);
  } else {
    // Render the table skeleton from TOKENS_FALLBACK immediately so the user sees
    // the token list (logos, names) without waiting for /api/current — that endpoint
    // can take 9s on cold start. Real prices/NAV/treasury hydrate when the fetch resolves.
    try { renderTable(); } catch (e) {}
    try { populateSidebarFromLanding(); } catch (e) {}
    var _bootLoader = document.getElementById('token-switch-loader');
    if (_bootLoader) {
      _bootLoader.classList.remove('active');
      var _btl = _bootLoader.querySelector('.token-switch-label');
      if (_btl) _btl.textContent = 'Loading token…';
    }
    fetchLandingData().then(function() {
      // Sparklines are visual polish; let primary table data paint first.
      setTimeout(function() { loadSparklines(0); }, 1200);
    });
  }
})();

// ═══════════════════════════════════════════════════════════════════════
