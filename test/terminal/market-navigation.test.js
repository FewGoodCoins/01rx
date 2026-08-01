const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const marketNavigationModulePromise = import(
  '../../src/core/market-navigation.js'
);

function primaryClick() {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
  };
}

test('market navigation guard covers native market links but leaves SPA proposal links to the controller', async () => {
  const {
    marketNavigationUrl,
    shouldGuardMarketNavigation,
  } = await marketNavigationModulePromise;
  const dom = new JSDOM(`
    <a id="market" href="/?token=solo&view=markets&tab=tokens">
      Markets
      <span id="watchlist-star" class="wl-star">Watchlist</span>
    </a>
    <a id="external" href="https://example.com/?view=markets">External</a>
    <a id="decision" class="tp-decision-item" data-ft-proposal-id="proposal" href="/?token=loyal&view=markets&proposal=proposal">Decision</a>
  `, {
    url: 'https://01rx.vercel.app/?token=solo',
  });
  const { window } = dom;
  const market = window.document.getElementById('market');
  const watchlistStar = window.document.getElementById('watchlist-star');
  const external = window.document.getElementById('external');
  const decision = window.document.getElementById('decision');

  assert.equal(
    marketNavigationUrl(window, market.href)?.origin,
    'https://01rx.vercel.app',
  );
  assert.equal(marketNavigationUrl(window, external.href), null);
  assert.equal(shouldGuardMarketNavigation(primaryClick(), market, window), true);
  assert.equal(
    shouldGuardMarketNavigation(
      { ...primaryClick(), target: watchlistStar },
      market,
      window,
    ),
    false,
  );
  assert.equal(shouldGuardMarketNavigation(primaryClick(), external, window), false);

  window.NAVGATOR = {
    marketWorkspace: {
      getState() {
        return { mode: 'token' };
      },
    },
  };
  assert.equal(
    shouldGuardMarketNavigation(primaryClick(), decision, window),
    false,
  );
  assert.equal(
    shouldGuardMarketNavigation(
      { ...primaryClick(), metaKey: true },
      market,
      window,
    ),
    false,
  );
  dom.window.close();
});

test('market navigation guard clears a pending cover when BFCache restores the page', async () => {
  const { installBrowserMarketNavigation } = await marketNavigationModulePromise;
  const dom = new JSDOM('<a href="/?view=markets">Markets</a>', {
    url: 'https://01rx.vercel.app/?token=solo',
  });
  const { window } = dom;
  const guard = installBrowserMarketNavigation(window);
  window.document.documentElement.dataset.marketNavigation = 'pending';

  window.dispatchEvent(new window.PageTransitionEvent('pageshow', {
    persisted: true,
  }));

  assert.equal(
    window.document.documentElement.hasAttribute('data-market-navigation'),
    false,
  );
  guard.destroy();
  dom.window.close();
});
