function plainPrimaryClick(event, anchor) {
  if (
    !event
    || !anchor
    || event.defaultPrevented
    || Number(event.button || 0) !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || anchor.hasAttribute?.('download')
  ) return false;
  const target = String(anchor.getAttribute?.('target') || '').toLowerCase();
  return !target || target === '_self';
}

function controllerOwnsLink(browserWindow, anchor) {
  const workspace = browserWindow.NAVGATOR?.marketWorkspace;
  const mode = workspace?.getState?.().mode;
  if (
    mode === 'token'
    && anchor.matches?.('.tp-decision-item[data-ft-proposal-id]')
  ) return true;
  return Boolean(
    workspace
    && anchor.matches?.('[data-ft-action="select-proposal"]')
    && anchor.closest?.('[data-navgator-app="decision-markets"]'),
  );
}

function nestedRowActionOwnsClick(event, anchor) {
  const action = event?.target?.closest?.(
    '.wl-star, .wl-drag-handle, [data-market-navigation-ignore]',
  );
  return Boolean(action && action !== anchor && anchor?.contains?.(action));
}

export function marketNavigationUrl(browserWindow, href) {
  try {
    const destination = new browserWindow.URL(href, browserWindow.location.href);
    if (destination.origin !== browserWindow.location.origin) return null;
    const path = destination.pathname.replace(/\/+$/, '') || '/';
    const isMarket = destination.searchParams.get('view') === 'markets'
      || path === '/terminal';
    if (!isMarket || destination.href === browserWindow.location.href) return null;
    return destination;
  } catch (_) {
    return null;
  }
}

export function shouldGuardMarketNavigation(event, anchor, browserWindow) {
  return plainPrimaryClick(event, anchor)
    && !nestedRowActionOwnsClick(event, anchor)
    && !controllerOwnsLink(browserWindow, anchor)
    && Boolean(marketNavigationUrl(browserWindow, anchor.href));
}

export function installBrowserMarketNavigation(browserWindow) {
  let pending = false;

  function clear() {
    pending = false;
    browserWindow.document.documentElement.removeAttribute(
      'data-market-navigation',
    );
  }

  function handlePageShow() {
    clear();
  }

  function handleClick(event) {
    const anchor = event.target?.closest?.('a[href]');
    if (!shouldGuardMarketNavigation(event, anchor, browserWindow)) return;
    const destination = marketNavigationUrl(browserWindow, anchor.href);
    if (!destination) return;

    event.preventDefault();
    event.stopImmediatePropagation?.();
    if (pending) return;
    pending = true;
    browserWindow.document.documentElement.setAttribute(
      'data-market-navigation',
      'pending',
    );

    const navigate = () => {
      try {
        browserWindow.location.assign(destination.href);
      } catch (error) {
        clear();
        throw error;
      }
    };
    if (typeof browserWindow.requestAnimationFrame === 'function') {
      browserWindow.requestAnimationFrame(() => {
        browserWindow.setTimeout(navigate, 0);
      });
    } else {
      browserWindow.setTimeout(navigate, 0);
    }
  }

  browserWindow.document.addEventListener('click', handleClick, true);
  browserWindow.addEventListener('pageshow', handlePageShow);
  return {
    clear,
    destroy() {
      browserWindow.document.removeEventListener('click', handleClick, true);
      browserWindow.removeEventListener('pageshow', handlePageShow);
      clear();
    },
    get pending() {
      return pending;
    },
  };
}
