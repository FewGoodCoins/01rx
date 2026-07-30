const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const attributionModulePromise = import(
  '../../src/chart/tradingview-attribution.js'
);

test('shared TradingView attribution mounts one identical accessible mark per chart', async () => {
  const {
    installBrowserTradingViewAttribution,
    mountTradingViewAttribution,
  } = await attributionModulePromise;
  const dom = new JSDOM('<div id="chart"></div>');
  const container = dom.window.document.getElementById('chart');

  installBrowserTradingViewAttribution(dom.window);
  const first = mountTradingViewAttribution(container, { runtime: dom.window });
  const second = dom.window.NAVGATOR.chartUi.mountTradingViewAttribution(
    container,
    { runtime: dom.window },
  );

  assert.equal(first, second);
  assert.equal(container.querySelectorAll('.tv-logo-circle').length, 1);
  assert.equal(first.getAttribute('aria-label'), 'Charting by TradingView');
  assert.equal(first.getAttribute('rel'), 'noreferrer');
  assert.equal(first.querySelector('svg')?.getAttribute('viewBox'), '0 0 35 19');
  assert.match(first.href, /^https:\/\/www\.tradingview\.com\//);

  dom.window.close();
});
