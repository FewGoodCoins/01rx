import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const faviconAsset = fs.readFileSync(
  new URL('../public/logos/trivium-mark.png', import.meta.url),
);
const socialAsset = fs.readFileSync(
  new URL('../public/logos/trivium-social.png', import.meta.url),
);
const tokenCss = fs.readFileSync(new URL('../styles/token.css', import.meta.url), 'utf8');
const frameCss = fs.readFileSync(new URL('../styles/futard-terminal.css', import.meta.url), 'utf8');
const sharedTerminalCss = fs.readFileSync(
  new URL('../styles/terminal-shared.css', import.meta.url),
  'utf8',
);
const triviumTerminalCss = fs.readFileSync(
  new URL('../styles/trivium-terminal.css', import.meta.url),
  'utf8',
);
const refinementCss = fs.readFileSync(
  new URL('../styles/refinements.css', import.meta.url),
  'utf8',
);
const geometryCss = fs.readFileSync(
  new URL('../styles/geometry.css', import.meta.url),
  'utf8',
);
const proposalChartSource = fs.readFileSync(
  new URL('../src/markets/proposal-history-chart.js', import.meta.url),
  'utf8',
);
const proposalLivelineSource = fs.readFileSync(
  new URL('../src/markets/proposal-history-liveline.js', import.meta.url),
  'utf8',
);
const livelineEngineSource = fs.readFileSync(
  new URL('../src/chart/liveline-chart-engine.js', import.meta.url),
  'utf8',
);
const proposalPresentationSource = fs.readFileSync(
  new URL('../src/markets/proposal-history-presentation.js', import.meta.url),
  'utf8',
);
const appCoreSource = fs.readFileSync(
  new URL('../src/legacy/app-core.js', import.meta.url),
  'utf8',
);
const decisionMarketControllerSource = fs.readFileSync(
  new URL('../src/markets/decision-market-controller.js', import.meta.url),
  'utf8',
);
const terminalShellSource = fs.readFileSync(
  new URL('../src/shell/terminal-shell.js', import.meta.url),
  'utf8',
);
const tokenPageSource = fs.readFileSync(
  new URL('../src/legacy/token-page.js', import.meta.url),
  'utf8',
);
const landingSource = fs.readFileSync(
  new URL('../src/legacy/landing.js', import.meta.url),
  'utf8',
);
const tradingContractSource = fs.readFileSync(
  new URL('../packages/contracts/src/index.js', import.meta.url),
  'utf8',
);
const vercelConfig = JSON.parse(
  fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
);

test('01r.trade exposes no user-facing NAVgator navigation', () => {
  assert.doesNotMatch(indexSource, /<a\b[^>]*href=["'][^"']*navgator/i);
  assert.doesNotMatch(indexSource, /site-header-navgator/);
  assert.match(indexSource, /rel="canonical" href="https:\/\/fewgoodcoins\.xyz\/"/);

  const redirected = new Set(
    (vercelConfig.redirects || []).map(route => route.source),
  );
  [
    '/terminal',
    '/navgator-for-agents/:path*',
    '/guide.html',
    '/methodology.html',
    '/llms.txt',
    '/llms-full.txt',
    '/projects/:path*',
  ].forEach(source => assert.equal(redirected.has(source), true, source));
});

test('browser icon metadata uses only the compact cache-busted 01r.trade mark', () => {
  const iconLinks = [...indexSource.matchAll(
    /<link\b[^>]*rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>/g,
  )].map(match => match[0]);

  assert.equal(iconLinks.length, 3);
  iconLinks.forEach((link) => {
    assert.match(link, /href="\/logos\/trivium-mark\.png\?v=2"/);
    assert.doesNotMatch(link, /navgator|favicon\.ico/i);
  });
  assert.equal(faviconAsset.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(faviconAsset.readUInt32BE(16), 512);
  assert.equal(faviconAsset.readUInt32BE(20), 512);
  assert.equal(socialAsset.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(socialAsset.readUInt32BE(16), 1200);
  assert.equal(socialAsset.readUInt32BE(20), 630);
  assert.match(indexSource, /logos\/trivium-social\.png\?v=2/);
  [
    '01r-mark.png',
    '01r-mark.svg',
    '01r-trade-social.png',
    '01r-trade-social.svg',
    '01rx-favicon.png',
    '01rx.png',
  ].forEach((asset) => {
    assert.equal(fs.existsSync(new URL(`../public/logos/${asset}`, import.meta.url)), false, asset);
  });
});

test('product metadata and accessible copy use only the 01r.trade brand', () => {
  const dom = new JSDOM(indexSource);
  dom.window.document.querySelectorAll('script, style').forEach(node => node.remove());
  const accessibleCopy = [
    dom.window.document.title,
    dom.window.document.body.textContent,
    ...[...dom.window.document.querySelectorAll('[aria-label], [title], [alt], [placeholder]')]
      .flatMap(node => ['aria-label', 'title', 'alt', 'placeholder'].map(name => node.getAttribute(name) || '')),
    ...[...dom.window.document.querySelectorAll('meta[content]')]
      .map(node => node.getAttribute('content') || ''),
  ].join('\n');

  assert.match(accessibleCopy, /01r\.trade/);
  assert.doesNotMatch(accessibleCopy, /Trivium|FOMO|01RX|01R\.Trade/);
  assert.match(
    indexSource,
    /class="product-wordmark product-wordmark-header"[^>]*>[\s\S]*?01r\.trade/,
  );
  assert.match(
    refinementCss,
    /\.product-wordmark\s*\{[\s\S]*?font-family:[\s\S]*?font-weight: 780;/,
  );
  assert.doesNotMatch(indexSource, /Trivium|FOMO|01R\.Trade|onrx\.trade|01rx-favicon/);
  assert.doesNotMatch(refinementCss, /site-header-market-name|FOMO/);
  assert.match(indexSource, /property="og:site_name" content="01r\.trade"/);
  assert.match(indexSource, /property="og:url" content="https:\/\/fewgoodcoins\.xyz\/"/);
  assert.match(indexSource, /"name": "01r\.trade"/);
  assert.match(indexSource, /"url": "https:\/\/fewgoodcoins\.xyz\/"/);
  assert.doesNotMatch(indexSource, /decision-markets-home-root/);
  assert.doesNotMatch(frameCss, /is-market-discovery|data-ft-mode="discovery"/);
  dom.window.close();
});

test('market workspace omits the obsolete bottom status footer', () => {
  const dom = new JSDOM(indexSource);
  assert.equal(dom.window.document.querySelector('#bloomberg-status'), null);
  assert.equal(dom.window.document.querySelector('#bb-network'), null);
  assert.equal(dom.window.document.querySelector('.site-footer-status'), null);
  assert.equal(dom.window.document.querySelector('.site-footer-nav'), null);
  assert.equal(dom.window.document.querySelector('.site-footer-social'), null);
  assert.match(triviumTerminalCss, /--site-footer-height: 0px;/);
  dom.window.close();
});

test('protected internal market identifiers remain stable through the brand change', () => {
  assert.match(indexSource, /get\('frame'\) === '01rx'/);
  assert.match(tradingContractSource, /marker: '01RX:D1:0'/);
});

test('decision and token chart readouts share one typography scale', () => {
  assert.match(
    tokenCss,
    /body\.is-token #chart-ohlc-line \{[\s\S]*?font-family: 'JetBrains Mono', monospace !important;[\s\S]*?font-size: 11px !important;[\s\S]*?line-height: 1\.45 !important;/,
  );
  assert.match(
    frameCss,
    /\.ft-hourly-readout \{[\s\S]*?font-family: 'JetBrains Mono', monospace;[\s\S]*?font-size: 11px;[\s\S]*?font-weight: 400;[\s\S]*?line-height: 1\.45;/,
  );
  assert.match(
    frameCss,
    /\.ft-hourly-overlay-metric strong \{[\s\S]*?font-size: inherit;[\s\S]*?font-weight: inherit;/,
  );
  assert.match(
    frameCss,
    /\.ft-hourly-overlay-values \{[\s\S]*?align-items: flex-start;[\s\S]*?flex-direction: column;[\s\S]*?flex-wrap: nowrap;[\s\S]*?gap: 0;/,
  );
});

test('01r.trade hides unavailable NAV, Growth, and weekly placeholder controls while keeping chart expansion', () => {
  assert.doesNotMatch(indexSource, /id="chart-nav-trigger"/);
  assert.doesNotMatch(indexSource, /id="btn-growth-chart-toolbar"/);
  assert.doesNotMatch(indexSource, /TradingView weekly timeframe placeholder/);
  assert.match(
    indexSource,
    /id="btn-fullscreen-toolbar"[\s\S]*?onclick="toggleChartFullscreen\(\)"/,
  );
  assert.doesNotMatch(
    indexSource,
    /Hide annotations placeholder|TradingView (?:chart type|indicators|toolbar menu|quick search|settings|undo|redo|snapshot) placeholder/,
  );
  [
    '.chart-toolbar-row > .chart-controls',
    '.chart-toolbar-row > .chart-series-control',
    '.chart-toolbar-row > .chart-feature-control',
    '.chart-toolbar-row > #btn-chart-embed',
    '.chart-toolbar-row > #layer-controls',
    '.chart-drawing-rail-01rx',
    '#chart-legend-actions',
  ].forEach((selector) => {
    assert.equal(tokenCss.includes(selector), true, selector);
    assert.equal(frameCss.includes(selector), true, selector);
  });
});

test('proposal recent transactions header aligns with the chart toolbar', () => {
  assert.match(
    frameCss,
    /\.ft-decision-transactions \.ft-ownership-transactions-header \{\s*height: 42px;\s*min-height: 42px;\s*flex: 0 0 42px;\s*border-bottom-color: #292929;\s*\}/,
  );
});

test('market sidebar and execution controls continue the terminal header rails', () => {
  assert.match(
    refinementCss,
    /html\[data-workspace="markets"\] \.tp-market-toolbar\s*\{[\s\S]*?border-bottom: 0;[\s\S]*?background: #101010;/,
  );
  assert.match(
    sharedTerminalCss,
    /html\[data-workspace="markets"\] \.tp-market-toolbar\s*\{[\s\S]*?height: 38px;[\s\S]*?flex: 0 0 38px;/,
  );
  assert.match(
    sharedTerminalCss,
    /html\[data-workspace="markets"\] \.tp-market-tabs\s*\{[\s\S]*?height: 42px;[\s\S]*?flex: 0 0 42px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-market-chart-header-region\s*\{[\s\S]*?--ft-market-title-width: 200px;[\s\S]*?height: auto;[\s\S]*?min-height: 38px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-chart-market-header,[\s\S]*?\.ft-chart-market-header > \*\s*\{[\s\S]*?height: 38px;[\s\S]*?min-height: 38px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-decision-ticket \.ft-outcome-tabs,[\s\S]*?\.ft-decision-ticket \.ft-outcome-tabs button\s*\{[\s\S]*?height: 42px;[\s\S]*?min-height: 42px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus\.ft-live-market \.ft-decision-pressure\s*\{[\s\S]*?height: 42px;[\s\S]*?min-height: 42px;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus\.ft-ownership-market \.ft-ownership-current-strip\s*\{[\s\S]*?height: 42px;[\s\S]*?min-height: 42px;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus:is\(\.ft-live-market, \.ft-ownership-market\) \.ft-chart-market-identity\s*\{[\s\S]*?height: 80px;[\s\S]*?min-height: 80px;[\s\S]*?border-right: 0;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus\.ft-live-market \.ft-chart-market-metric-group\s*\{[\s\S]*?height: 80px;[\s\S]*?grid-template-rows: 38px 42px;/,
  );
  assert.match(
    sharedTerminalCss,
    /data-ft-chart-header-group="threshold"\]\s*\{\s*grid-column: 2;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus:is\(\.ft-live-market, \.ft-ownership-market\) \.ft-chart-market-identity::after\s*\{[\s\S]*?top: 20px;[\s\S]*?right: -1px;[\s\S]*?bottom: 20px;[\s\S]*?width: 1px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus\.ft-ownership-market \.ft-chart-market-metric\[data-ft-chart-header-metric="price"\]\s*\{[\s\S]*?height: 80px;[\s\S]*?min-height: 80px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-chart-market-identity p strong\.ft-market-title-compact\s*\{\s*font-size: 16px;/,
  );
  assert.match(
    sharedTerminalCss,
    /html\[data-workspace="markets"\] \.tp-market-search-field\s*\{[\s\S]*?position: relative;[\s\S]*?width: calc\(100% - 28px\);[\s\S]*?height: 32px;[\s\S]*?flex: 0 1 calc\(100% - 28px\);[\s\S]*?margin: 0 14px;[\s\S]*?transform: translateY\(7px\);/,
  );
  assert.match(
    indexSource,
    /<header class="site-header"[\s\S]*?<div class="tp-market-toolbar site-header-market-search"[\s\S]*?<label class="tp-market-search-field" id="tp-market-search-field">[\s\S]*?<input id="tlp-search" type="search" placeholder="Search markets or tokens\.\.\."/,
  );
  assert.match(
    refinementCss,
    /\.tp-market-search-field\s*\{[\s\S]*?padding: 0 12px;[\s\S]*?border: 1px solid #77776f;[\s\S]*?border-radius: 12px;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    geometryCss,
    /#navgator-app#navgator-app \.tp-market-search-field\s*\{\s*border-radius: 12px !important;/,
  );
  assert.doesNotMatch(indexSource, /tp-market-search-button|tp-market-sort-button|tp-market-sort-menu/);
  assert.doesNotMatch(indexSource, /tp-market-close-button|Close asset browser/);
});

test('market sidebar titles use consistent full-size click targets', () => {
  assert.match(
    refinementCss,
    /html\[data-workspace="markets"\] \.tp-market-tabs\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?padding: 0 8px;/,
  );
  assert.match(
    refinementCss,
    /\.tp-market-tab\s*\{[\s\S]*?height: 100%;[\s\S]*?align-items: center;/,
  );
  assert.match(
    refinementCss,
    /#tp-market-tab-all\s*\{\s*padding-inline: 0;\s*justify-content: center;/,
  );
  assert.match(
    indexSource,
    /<span[\s\S]*?class="tp-unified-section-title-group tp-unified-section-status"[\s\S]*?id="tp-decision-markets-title"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?>0 decisions live<\/span>/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-unified-section-status\s*\{[\s\S]*?font-size: 10px;/,
  );
  assert.doesNotMatch(
    indexSource,
    /tp-unified-section-toggle-(?:live|past)|tp-past-decision-markets-title/,
  );
  assert.doesNotMatch(
    indexSource,
    /tp-unified-section-toggle-tokens|tp-token-section-title|aria-label="Collapse tokens"/,
  );
});

test('live decision count is a compact visible noninteractive status', () => {
  const dom = new JSDOM(indexSource);
  const status = dom.window.document.querySelector('#tp-decision-markets-title');

  assert.ok(status);
  assert.equal(status.tagName, 'SPAN');
  assert.equal(status.textContent.trim(), '0 decisions live');
  assert.equal(status.classList.contains('ft-sr-only'), false);
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.closest('button, a'), null);
  assert.equal(status.hasAttribute('onclick'), false);
  assert.match(
    triviumTerminalCss,
    /\.tp-unified-section-status\s*\{[\s\S]*?height: 18px;[\s\S]*?padding: 0;[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;[\s\S]*?font-family: var\(--numeric-font\);[\s\S]*?font-size: 10px;[\s\S]*?pointer-events: none;/,
  );
  dom.window.close();
});

test('market sidebar uses compact reference tabs and source-backed filter pills', () => {
  assert.match(
    indexSource,
    /data-market-sidebar-tab="all"[^>]*>All<\/button>[\s\S]*?data-market-sidebar-tab="watchlist"[^>]*>Watchlist<\/button>[\s\S]*?data-market-sidebar-tab="tokens"[^>]*>Tokens<\/button>[\s\S]*?data-market-sidebar-tab="markets"[^>]*>Decisions<\/button>/,
  );
  assert.match(
    indexSource,
    /class="tp-market-filter-strip"[\s\S]*?data-market-sidebar-filter-slot="0"[^>]*>Price<\/button>[\s\S]*?data-market-sidebar-filter-slot="1"[^>]*>Top movers<\/button>[\s\S]*?data-market-sidebar-filter-slot="2"[^>]*>Market cap<\/button>[\s\S]*?data-market-sidebar-filter-slot="3"[^>]*hidden[^>]*><\/button>/,
  );
  assert.doesNotMatch(
    indexSource,
    /All Tokens|>All tokens<\/button>/,
  );
  assert.match(
    appCoreSource,
    /var _marketSidebarFilterConfig = \{[\s\S]*?watchlist:[\s\S]*?tokens:[\s\S]*?markets:/,
  );
  assert.match(
    appCoreSource,
    /all:\s*\[\s*\{ key: 'price', label: 'Price' \},[\s\S]*?key: 'movers'[\s\S]*?key: 'market-cap'[\s\S]*?\],\s*watchlist:/,
  );
  assert.match(appCoreSource, /if \(tab === 'all'\) return 'all-tokens';/);
  assert.match(
    appCoreSource,
    /tokens:\s*\[\s*\{ key: 'all-tokens', label: 'All' \},[\s\S]*?\],\s*markets:/,
  );
  assert.doesNotMatch(
    appCoreSource,
    /all:\s*\[[\s\S]*?key: '(?:live|prior)'[\s\S]*?\],\s*watchlist:/,
  );
  assert.match(
    appCoreSource,
    /function setMarketSidebarFilter\(nextFilter\)[\s\S]*?_applyMarketSidebarFilterSort\(\);[\s\S]*?applyMarketSidebarSearch\(\);/,
  );
  assert.match(
    triviumTerminalCss,
    /--sidebar-width: 280px;[\s\S]*?\.tp-market-tabs\s*\{[\s\S]*?height: 37px;[\s\S]*?background: #15141d !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-market-tabs::after\s*\{\s*display: none !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /#tlp-all-list \.tp-item\s*\{[\s\S]*?height: 54px;[\s\S]*?grid-template-columns: 35px minmax\(0, 1fr\);/,
  );
});

test('recent transaction rows use an open tape without divider lines', () => {
  assert.match(
    frameCss,
    /\.ft-ownership-transactions-columns,\s*\.ft-ownership-transaction-row \{\s*border-bottom: 0;\s*\}/,
  );
  assert.match(
    frameCss,
    /\.ft-transaction-size-heading button \{[\s\S]*?text-decoration: underline;/,
  );
  assert.match(
    frameCss,
    /\.ft-ownership-transaction-row > span\.ft-ownership-transaction-size \{\s*text-align: left;/,
  );
  assert.match(
    frameCss,
    /\.ft-ownership-transactions-list \{\s*scrollbar-width: none;/,
  );
  assert.match(
    frameCss,
    /\.ft-ownership-transactions-list::\-webkit-scrollbar \{\s*display: none;/,
  );
  assert.match(
    frameCss,
    /\.ft-ownership-transactions-header strong \{\s*font-size: 12px;/,
  );
  assert.match(
    frameCss,
    /\.ft-ownership-transactions-columns \{\s*min-height: 36px;[\s\S]*?font-size: 9px;/,
  );
  assert.match(
    frameCss,
    /\.ft-ownership-transaction-row \{\s*min-height: 40px;[\s\S]*?font-size: 10px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-decision-transactions \.ft-ownership-transaction-row > \.ft-ownership-transaction-price,[\s\S]*?\.ft-decision-transactions \.ft-ownership-transaction-row > :last-child\s*\{[\s\S]*?font-size: 11px;[\s\S]*?font-variant-numeric: tabular-nums;/,
  );
});

test('decision support filter strip stays removed and full trade labels remain visible', () => {
  assert.doesNotMatch(
    frameCss,
    /\.ft-decision-support-pass|\.ft-decision-support-fail|\.ft-decision-transaction-summary/,
  );
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /filter-decision-trades|decision-support-pass|decision-support-fail|Outcome support/,
  );
  assert.match(
    frameCss,
    /\.ft-decision-transactions \.ft-ownership-transactions-columns,[\s\S]*?minmax\(60px, 1\.15fr\)/,
  );
  assert.match(
    frameCss,
    /\.ft-decision-transactions \.ft-ownership-transactions-columns,[\s\S]*?minmax\(28px, 0\.45fr\);[\s\S]*?padding-right: 8px;[\s\S]*?padding-left: 8px;[\s\S]*?gap: 3px;/,
  );
  assert.match(
    frameCss,
    /\.ft-ownership-transaction-row > \.ft-decision-transaction-trade\s*\{[\s\S]*?overflow: visible;[\s\S]*?white-space: nowrap;/,
  );
});

test('desktop market summary uses only identity and primary-price separators', () => {
  assert.match(
    frameCss,
    /\.ft-proposal-focus \.ft-chart-market-header > \* \{\s*border-right: 0;\s*\}/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-focus \.ft-chart-market-identity,\s*\[data-ft-mode="token"\]\.ft-proposal-focus \.ft-chart-market-metric-featured \{\s*border-right: 1px solid #343636;/,
  );
});

test('desktop trades and ticket columns share the chart track height', () => {
  assert.match(
    frameCss,
    /\.ft-proposal-focus \.ft-activity-row,\s*\[data-ft-mode="token"\]\.ft-proposal-focus \.ft-ticket-column \{\s*min-height: 0;\s*height: 100%;\s*align-self: stretch;/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-focus \.ft-activity-row > \.ft-ownership-transactions,[\s\S]*?box-sizing: border-box;/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-focus:is\(\.ft-live-market, \.ft-archive-market, \.ft-ownership-market\) \.ft-market-chart,[\s\S]*?\.ft-proposal-focus\.ft-ownership-market \.ft-ownership-chart-panel \{\s*height: 100%;\s*min-height: 0;\s*max-height: none;\s*aspect-ratio: auto;/,
  );
});

test('token markets do not reserve a second empty header row', () => {
  assert.match(
    frameCss,
    /\[data-ft-mode="token"\] \.ft-header \{\s*display: none;/,
  );
});

test('decision charts render without a token or PASS/FAIL backdrop', () => {
  assert.doesNotMatch(proposalChartSource, /createTextWatermark/);
  assert.doesNotMatch(proposalChartSource, /PASS\s*\/\s*FAIL/);
  assert.doesNotMatch(proposalChartSource, /BaselineSeries/);
  assert.doesNotMatch(proposalChartSource, /createPriceLine/);
});

test('decision charts reserve a compact, scrollable lower pane for TWAP window progress', () => {
  assert.match(
    frameCss,
    /\.ft-twap-window-pane\s*\{[\s\S]*?height: 42px;[\s\S]*?grid-template-columns: max-content minmax\(0, 1fr\) max-content;/,
  );
  assert.match(
    frameCss,
    /\.ft-twap-window-fill\s*\{[\s\S]*?width: var\(--ft-twap-progress, 0%\);[\s\S]*?background: #fff;/,
  );
  assert.match(
    frameCss,
    /\.ft-twap-window-percent\s*\{[\s\S]*?color: #fff;/,
  );
  assert.match(
    frameCss,
    /\.ft-twap-window-scroll\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?touch-action: pan-x;/,
  );
  assert.match(
    frameCss,
    /\.ft-twap-window-timeline\s*\{[\s\S]*?width: max\(160%, var\(--ft-twap-timeline-width, 720px\)\);/,
  );
  assert.match(decisionMarketControllerSource, /mountTwapWindowScroller/);
  assert.doesNotMatch(decisionMarketControllerSource, /ft-twap-window-marker/);
  assert.doesNotMatch(frameCss, /\.ft-twap-window-marker\s*\{/);
  assert.doesNotMatch(decisionMarketControllerSource, /ft-twap-window-bounds/);
  assert.match(
    decisionMarketControllerSource,
    /class="ft-twap-window-title">TWAP window<\/span>[\s\S]*?class="ft-twap-window-track"[\s\S]*?class="ft-twap-window-percent"/,
  );
  assert.match(
    frameCss,
    /\.ft-twap-window-pane\s*\{[\s\S]*?padding: 0 calc\(12px \+ var\(--ft-chart-right-scale-width, 52px\)\) 0 12px;/,
  );
  assert.match(
    proposalLivelineSource,
    /const PLOT_PADDING = Object\.freeze\(\{[\s\S]*?top: PLOT_TOP_PADDING,[\s\S]*?right: 72,[\s\S]*?bottom: 30,[\s\S]*?left: 12,[\s\S]*?\}\);[\s\S]*?padding: PLOT_PADDING/,
  );
  assert.match(
    frameCss,
    /\.ft-hourly-plot-shell\.ft-has-twap-progress \.ft-hourly-live\s*\{\s*height: calc\(100% - 42px\);/,
  );
});

test('interactive decision charts use Liveline through a renderer-independent presentation', () => {
  assert.match(proposalLivelineSource, /from 'liveline'/);
  assert.match(proposalLivelineSource, /proposalHistoryChartObservations/);
  assert.match(proposalLivelineSource, /PROPOSAL_HISTORY_ENGINE = 'liveline'/);
  assert.match(proposalLivelineSource, /data-ft-chart-gap/);
  assert.match(proposalLivelineSource, /label: definition\.label/);
  assert.doesNotMatch(proposalLivelineSource, /fetch\(/);
  assert.match(proposalLivelineSource, /PROPOSAL_CHART_SERIES_PRESENTATION/);
  assert.match(proposalChartSource, /PROPOSAL_CHART_PRESENTATION/);
  assert.match(proposalChartSource, /PROPOSAL_CHART_SERIES_PRESENTATION/);
  assert.match(proposalPresentationSource, /wheelZoom: true/);
  assert.match(proposalPresentationSource, /dragPan: true/);
  assert.match(proposalPresentationSource, /pinchZoom: true/);
  assert.match(
    frameCss,
    /\.ft-hourly-chart-liveline \.ft-hourly-readout\s*\{[\s\S]*?display: flex;[\s\S]*?opacity: 1;/,
  );
  assert.match(
    frameCss,
    /\.ft-liveline-root > div:not\(\.ft-liveline-canvas\)\s*\{\s*display: none !important;/,
  );
  assert.match(
    decisionMarketControllerSource,
    /data-ft-chart-engine="liveline"/,
  );
  assert.match(decisionMarketControllerSource, /data-ft-role="proposal-history-liveline"/);
  assert.match(proposalLivelineSource, /addEventListener\('wheel', onWheel/);
  assert.match(proposalLivelineSource, /pinch\.distance \/ distance/);
  assert.match(proposalLivelineSource, /key: 'proposal-liveline-chart'/);
  assert.match(proposalLivelineSource, /scrub: false/);
  assert.match(proposalLivelineSource, /window: projection\.renderWindowSeconds/);
  assert.doesNotMatch(proposalLivelineSource, /staticRevision/);
  assert.match(
    decisionMarketControllerSource,
    /drag or swipe the plot to pan, scroll or pinch to zoom/,
  );
});

test('decision chart plot occupies the former toolbar and cursor-rail space', () => {
  assert.match(
    frameCss,
    /\[data-ft-mode="token"\]\.ft-proposal-focus \.ft-hourly-plot-shell\s*\{[\s\S]*?height: 100%;/,
  );
  assert.match(
    frameCss,
    /\.ft-hourly-chart-enhanced \.ft-hourly-live\s*\{[\s\S]*?width: 100%;[\s\S]*?margin-left: 0;/,
  );
  assert.match(
    frameCss,
    /\[data-ft-mode="token"\]\.ft-proposal-focus \.ft-hourly-live\s*\{[\s\S]*?border-top: 0;/,
  );
});

test('decision chart uses one light TWAP-start line without phase backgrounds', () => {
  assert.match(
    frameCss,
    /\.ft-liveline-twap-start-line\s*\{[\s\S]*?top: 54px;[\s\S]*?bottom: 30px;[\s\S]*?width: 1px;[\s\S]*?background: color-mix\(in srgb, #ffffff 22%, transparent\);[\s\S]*?pointer-events: none;/,
  );
  assert.match(
    proposalLivelineSource,
    /twapStartLineElement[\s\S]*?data-ft-chart-boundary': 'twap-start'[\s\S]*?projection\.toPlotRatio\(startTime\)/,
  );
  assert.match(
    decisionMarketControllerSource,
    /A light vertical line marks the beginning of the TWAP observation window/,
  );
  assert.match(
    proposalLivelineSource,
    /prepared\.viewportEnd = prepared\.lastTime - panOffsetSeconds/,
  );
  assert.doesNotMatch(frameCss, /ft-hourly-(?:pre|post)-twap-band|ft-liveline-phase-band/);
  assert.doesNotMatch(proposalLivelineSource, /phaseBandElements|data-ft-chart-band/);
});

test('chart hover readouts do not draw a vertical crosshair guide', () => {
  assert.doesNotMatch(frameCss, /has-liveline-crosshair::after|liveline-crosshair-x/);
  assert.doesNotMatch(
    livelineEngineSource,
    /--orx-liveline-crosshair-x|classList\.add\('has-liveline-crosshair'\)/,
  );
  assert.doesNotMatch(
    proposalLivelineSource,
    /--ft-liveline-crosshair-x|classList\.add\('has-liveline-crosshair'\)/,
  );
  assert.match(proposalLivelineSource, /updateReadoutAt\(lastProjection\.sourceTimeAtPlotRatio\(ratio\)\)/);
});

test('decision chart keeps one solid white origin and solid coordinate-bound final dots', () => {
  assert.match(
    frameCss,
    /\.ft-liveline-start-point,\s*\.ft-liveline-end-point\s*\{[\s\S]*?width: 8px;[\s\S]*?border: 0;[\s\S]*?border-radius: 50% !important;[\s\S]*?background: var\(--ft-liveline-point-color, #ffffff\);[\s\S]*?box-shadow: none;[\s\S]*?pointer-events: none;/,
  );
  assert.match(
    frameCss,
    /\.ft-liveline-start-point\s*\{\s*--ft-liveline-point-color: #ffffff;/,
  );
  assert.match(
    proposalLivelineSource,
    /className: 'ft-liveline-start-point ft-liveline-origin-point'/,
  );
  assert.match(
    proposalLivelineSource,
    /pulse: false/,
  );
  assert.match(
    proposalLivelineSource,
    /const originSeries = series\.find[\s\S]*?key: 'chart-origin'/,
  );
  assert.match(proposalLivelineSource, /return \[createElement\('span'/);
  assert.match(proposalLivelineSource, /proposalChartEndpointModel[\s\S]*?visible: final\.time >= projection\.sourceFrom[\s\S]*?final\.time <= projection\.sourceTo/);
  assert.match(proposalLivelineSource, /className: 'ft-liveline-synthetic-tip-mask'/);
  assert.match(proposalLivelineSource, /className: 'ft-liveline-end-gap-mask'/);
  assert.match(proposalLivelineSource, /const right = projection\.toPlotRatio\(projection\.sourceRight\)/);
  assert.match(proposalLivelineSource, /BOUND_POINT_REVEAL_DELAY_MS = 1_050/);
  assert.match(proposalLivelineSource, /container\.classList\.add\('has-liveline-bound-points'\)/);
  assert.match(frameCss, /\.ft-hourly-live\.has-liveline-bound-points :is\([\s\S]*?\.ft-liveline-end-point[\s\S]*?opacity: 1;/);
  assert.match(
    frameCss,
    /\.orx-liveline-endpoint-start\s*\{[\s\S]*?background: #ffffff;[\s\S]*?box-shadow: none;/,
  );
  assert.match(
    frameCss,
    /\.orx-liveline-endpoint\s*\{[\s\S]*?border: 0;[\s\S]*?background: var\(--orx-endpoint-color, #5b8cff\);[\s\S]*?box-shadow: none;/,
  );
  assert.match(geometryCss, /\.ft-liveline-start-point,[\s\S]*?\.ft-liveline-end-point,[\s\S]*?\.orx-liveline-endpoint,/);
});

test('decision chart supports broad whitespace and TradingView-like axis scaling', () => {
  assert.match(proposalLivelineSource, /const PAN_EDGE_GUARD_RATIO = 0\.08/);
  assert.match(proposalLivelineSource, /minimum: -window \* futureWhitespace/);
  assert.match(proposalLivelineSource, /maximum: Math\.max\(0, duration - window \* pastWhitespace\)/);
  assert.match(proposalLivelineSource, /prepared\.viewportEnd = prepared\.lastTime - panOffsetSeconds/);
  assert.match(proposalLivelineSource, /clampToData: false/);
  assert.match(proposalLivelineSource, /function isValueAxisPointer\(event\)/);
  assert.match(proposalLivelineSource, /function isTimeAxisPointer\(event\)/);
  assert.match(proposalLivelineSource, /proposalChartVerticalScale\([\s\S]*?event\.clientY - axisDrag\.startY/);
  assert.match(proposalLivelineSource, /proposalChartHorizontalScaleDrag\([\s\S]*?event\.clientX - timeAxisDrag\.startX/);
  assert.match(proposalLivelineSource, /function startKineticPan\(initialVelocity\)/);
  assert.match(proposalLivelineSource, /chartWheelDeltaPixels\(event\.deltaX/);
  assert.match(proposalLivelineSource, /container\.addEventListener\('dblclick', onDoubleClick\)/);
  assert.match(frameCss, /\.ft-hourly-live:is\(\.is-x-axis-hover, \.is-scaling-x\)[\s\S]*?cursor: ew-resize !important;/);
  assert.match(frameCss, /\.ft-hourly-live:is\(\.is-y-axis-hover, \.is-scaling-y\)[\s\S]*?cursor: ns-resize !important;/);
  assert.match(
    decisionMarketControllerSource,
    /drag the bottom time axis to scale horizontally,[\s\S]*?drag or scroll the right price axis to scale vertically/,
  );
});

test('global wallet control uses the neutral raised 01r.trade header treatment', () => {
  assert.match(
    triviumTerminalCss,
    /\.site-header-market-wallet \.ft-wallet-button\s*\{[\s\S]*?border: 1px solid var\(--trivium-border-strong\);[\s\S]*?background: var\(--trivium-panel-raised\);[\s\S]*?color: var\(--trivium-text\);/,
  );
  assert.match(
    triviumTerminalCss,
    /\.site-header-market-wallet \.ft-wallet-button:hover\s*\{[\s\S]*?background: var\(--trivium-panel-hover\);[\s\S]*?color: #fff;/,
  );
  assert.match(
    frameCss,
    /\.site-header-market-wallet \.ft-wallet-dot\s*\{[\s\S]*?background: #35d093;/,
  );
});

test('proposal trade actions share the blue-violet 01r.trade review treatment', () => {
  assert.match(
    triviumTerminalCss,
    /\.ft-shell \.ft-ownership-connect,[\s\S]*?\.ft-primary-button\s*\{[\s\S]*?border: 1px solid rgb\(117 128 255 \/ 65%\);[\s\S]*?background: var\(--trivium-accent\);[\s\S]*?color: #07070d;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-primary-button:hover:not\(:disabled\)\s*\{[\s\S]*?border-color: #959cff;[\s\S]*?background: #8992ff;/,
  );
});

test('decision trade selectors are rounded filled controls without dropdown or underline clutter', () => {
  assert.match(
    triviumTerminalCss,
    /body#navgator-app#navgator-app :is\([\s\S]*?\.ft-proposal-trade-tabs,[\s\S]*?\.ft-ownership-side-tabs,[\s\S]*?\)\s*\{\s*border-radius: 12px !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /body#navgator-app#navgator-app :is\([\s\S]*?\.ft-proposal-trade-tabs button,[\s\S]*?\.ft-ownership-side-tabs button,[\s\S]*?\)\s*\{\s*border-radius: 8px !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /button\.ft-is-active::after,[\s\S]*?button\.ft-segment-active::after\s*\{\s*content: none;/,
  );
  assert.match(triviumTerminalCss, /button\.ft-is-spot\.ft-is-active\s*\{[\s\S]*?background: rgb\(229 232 244 \/ 13%\);/);
  assert.doesNotMatch(decisionMarketControllerSource, /ft-decision-market-switcher-chevron/);
  assert.doesNotMatch(decisionMarketControllerSource, /ft-archive-settlement/);
});

test('market sidebar uses one decision heading, pins live decisions in All, and lists every decision in Decisions', () => {
  assert.match(
    sharedTerminalCss,
    /#tlp-all-list,[\s\S]*?#tlp-wl-list\s*\{[\s\S]*?scrollbar-width: none;[\s\S]*?-ms-overflow-style: none;/,
  );
  assert.match(
    indexSource,
    /id="tlp-decisions-panel"[\s\S]*?id="tp-decision-markets-title"[\s\S]*?>0 decisions live<\/span>[\s\S]*?class="tp-decisions-list-stack"[\s\S]*?id="tlp-decisions-list"[\s\S]*?id="tlp-past-decisions-list"[\s\S]*?id="tlp-all-panel"/,
  );
  assert.doesNotMatch(indexSource, /tp-(?:live|past)-decision-count|tlp-past-decisions-panel/);
  assert.match(
    indexSource,
    /data-market-sidebar-tab="all"[^>]*>All<\/button>[\s\S]*?data-market-sidebar-tab="watchlist"[^>]*>Watchlist<\/button>[\s\S]*?data-market-sidebar-tab="tokens"[^>]*>Tokens<\/button>[\s\S]*?data-market-sidebar-tab="markets"[^>]*>Decisions<\/button>/,
  );
  assert.match(
    indexSource,
    /id="tp-market-tab-all"[^>]*aria-controls="tlp-decisions-panel tlp-all-panel"/,
  );
  assert.match(indexSource, /id="tp-market-tab-markets"[^>]*aria-controls="tlp-decisions-panel"/);
  assert.doesNotMatch(indexSource, /Ownership \+ decisions|in one view/);
  assert.match(
    triviumTerminalCss,
    /data-market-sidebar-tab="all"\] #tlp-past-decisions-list,[\s\S]*?display: none !important;/,
  );
  assert.doesNotMatch(indexSource, /tlp-decision-history-toggle-slot/);
  assert.doesNotMatch(indexSource, /<span>Status<\/span>/);
  assert.doesNotMatch(indexSource, /class="tp-(?:decision|token)-columns"|<span>Market<\/span>|tp-token-primary-label|>Asset ↓<\/button>/);
  assert.match(
    indexSource,
    /id="tlp-all-panel" aria-label="Tokens"[\s\S]*?id="tlp-all-list"/,
  );
  assert.doesNotMatch(
    indexSource,
    /tp-unified-section-columns-token|tp-token-(?:price|secondary)-sort|tp-token-count/,
  );
  assert.match(
    refinementCss,
    /\.tp-unified-section-heading\s*\{[\s\S]*?height: 30px;[\s\S]*?min-height: 30px;[\s\S]*?flex: 0 0 30px;/,
  );
  assert.match(refinementCss, /\.tp-all-section\.is-collapsed\s*\{[\s\S]*?flex: 0 0 30px;/);
  assert.match(refinementCss, /\.is-collapsed \.tp-unified-section-columns\s*\{\s*display: none;/);
  assert.match(refinementCss, /\.is-collapsed \.tp-unified-section-count\s*\{\s*display: inline-flex;/);
  assert.match(
    refinementCss,
    /\.tp-unified-section-count\s*\{[\s\S]*?background: transparent;[\s\S]*?font-size: 10px;/,
  );
  assert.match(
    refinementCss,
    /\.tp-unified-section-toggle\s*\{[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/,
  );
  assert.doesNotMatch(
    refinementCss,
    /\.tp-unified-section-toggle:hover\s*\{[\s\S]*?background: #292929;/,
  );
  assert.match(refinementCss, /html\[data-workspace="markets"\]\[data-market-sidebar-tab="tokens"\] \.tp-decisions-section\s*\{[\s\S]*?display: none !important;/);
  assert.match(refinementCss, /html\[data-workspace="markets"\]\[data-market-sidebar-tab="watchlist"\] \.tp-decisions-section\s*\{[\s\S]*?display: none !important;/);
  assert.match(refinementCss, /html\[data-workspace="markets"\]\[data-market-sidebar-tab="markets"\] \.tp-all-section\s*\{[\s\S]*?display: none !important;/);
  assert.match(
    refinementCss,
    /data-market-sidebar-tab="markets"\] \.tp-decisions-section:not\(\[hidden\]\)\s*\{[\s\S]*?flex: 1 1 0;/,
  );
  assert.match(
    refinementCss,
    /#tlp-decisions-list,[\s\S]*?#tlp-past-decisions-list,[\s\S]*?#tlp-all-list\s*\{[\s\S]*?overflow-y: auto;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-decision-project \.ft-token-logo-small\s*\{[\s\S]*?width: 35px !important;[\s\S]*?height: 35px !important;[\s\S]*?flex: 0 0 35px !important;[\s\S]*?object-fit: cover;/,
  );
  assert.match(refinementCss, /\.tp-decision-live-dot\s*\{[\s\S]*?grid-column: 1;/);
  assert.match(
    refinementCss,
    /\.tp-decision-live-dot\s*\{[\s\S]*?animation: tp-decision-live-pulse var\(--tp-live-pulse-duration, 1s\) ease-out infinite;[\s\S]*?animation-delay: var\(--tp-live-pulse-delay, 0ms\);/,
  );
  assert.match(
    refinementCss,
    /\.tp-decision-live-dot\[data-market-state="passed"\],[\s\S]*?\.tp-decision-live-dot\[data-market-state="failed"\],[\s\S]*?\.tp-decision-live-dot\[data-market-state="other"\]\s*\{[\s\S]*?animation: none;/,
  );
  assert.match(appCoreSource, /\['tlp-decisions-list', 'live'\],[\s\S]*?\['tlp-past-decisions-list', 'past'\]/);
});

test('sidebar filter pills retain sorting after redundant metric headers are removed', () => {
  assert.match(
    appCoreSource,
    /function _sortMarketSidebarTokens\(key, event\)\s*\{[\s\S]*?_marketTokenSortKey === key[\s\S]*?_marketSidebarSortAscending = !_marketSidebarSortAscending;[\s\S]*?_marketTokenSortKey = key;[\s\S]*?_marketSidebarSortAscending = false;[\s\S]*?applyMarketSidebarSearch\(\);/,
  );
  assert.match(appCoreSource, /function sortMarketSidebarByPrice\(event\)\s*\{\s*_sortMarketSidebarTokens\('price', event\);/);
  assert.match(appCoreSource, /var _marketDecisionSortKeys = \['default', 'likelihood', 'signal'\];/);
  assert.match(decisionMarketControllerSource, /data-sort-likelihood="\$\{Number\.isFinite\(likelihoodPct\)[\s\S]*?data-sort-signal="\$\{Number\.isFinite\(signalPct\)/);
  assert.match(appCoreSource, /var _marketTokenSecondaryMetric = 'change24h';/);
  assert.doesNotMatch(
    indexSource,
    /tp-unified-section-columns-(?:token|market)|tp-sidebar-metric-sort/,
  );
  assert.match(
    appCoreSource,
    /markets:\s*\[\s*\{ key: 'all-markets', label: 'All' \},\s*\{ key: 'live', label: 'Live' \},\s*\{ key: 'prior', label: 'Past' \}\s*\]/,
  );
  assert.doesNotMatch(
    appCoreSource,
    /markets:\s*\[[\s\S]*?\{ key: 'likelihood', label: 'Likelihood' \}[\s\S]*?\]/,
  );
  assert.match(
    refinementCss,
    /\.tp-sidebar-metric-sort:active\s*\{\s*transform: none !important;/,
  );
  assert.match(
    refinementCss,
    /\.tp-sidebar-sort-direction\s*\{[\s\S]*?font-size: 12px;[\s\S]*?text-align: center;/,
  );
  [tokenPageSource, landingSource].forEach((source) => {
    assert.match(source, /data-sort-change-1h=/);
    assert.match(source, /data-sort-nav=/);
    assert.match(source, /data-sort-market-cap=/);
    assert.match(source, /data-sort-volume=/);
  });
});

test('sidebar display customization remains removed', () => {
  assert.doesNotMatch(indexSource, /tp-(?:market|decision)-column|tp-section-options-button/);
  assert.doesNotMatch(appCoreSource, /toggleMarketColumnMenu|setMarketDecisionColumns|setMarketTokenSecondaryMetric/);
  assert.doesNotMatch(decisionMarketControllerSource, /getMarketDecisionColumns|decision-columns-change/);
});

test('spot chart keeps its expansion control aligned after temporary controls are removed', () => {
  assert.match(
    frameCss,
    /\.chart-display-controls-secondary\s*\{\s*flex: 0 0 56px;\s*margin-left: auto;\s*\}/,
  );
});

test('decision chart gives the full panel to data without a duplicate right-rail context card', () => {
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /hourly-series-trigger|TradingView weekly timeframe placeholder|ft-hourly-growth-control/,
  );
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /renderChartExpansionControl|data-ft-action="toggle-chart-expansion"|ft-chart-crosshair-rail/,
  );
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /renderMarketContext|market-context|toggle-proposal-details|proposal-details/,
  );
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /<div class="ft-hourly-toolbar">/,
  );
  assert.doesNotMatch(
    terminalShellSource,
    /ft-ticket-market-context|data-ft-region="market-context"/,
  );
});

test('desktop spot ticket grows to expose every control without internal scrolling', () => {
  assert.match(
    frameCss,
    /\.ft-ownership-ticket\s*\{[\s\S]*?padding: 12px 14px 14px;[\s\S]*?overflow: visible;/,
  );
  assert.match(
    sharedTerminalCss,
    /:has\(\[data-ft-mode="token"\]\.ft-proposal-focus\) \.app-content\s*\{\s*overflow-y: hidden !important;/,
  );
  assert.doesNotMatch(sharedTerminalCss, /overflow-y: auto !important;/);
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus \.ft-terminal-grid,[\s\S]*?\.ft-proposal-focus\.ft-ownership-market \.ft-terminal-grid\s*\{[\s\S]*?--ft-terminal-chart-height: clamp\(\s*550px,[\s\S]*?690px[\s\S]*?overflow: visible;/,
  );
});

test('desktop market center and execution rail share one vertical scroll container', () => {
  assert.match(
    triviumTerminalCss,
    /\/\* Final desktop ownership of vertical scrolling:[\s\S]*?\.ft-main\s*\{[\s\S]*?height: 100% !important;[\s\S]*?overflow-y: auto !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-terminal-grid\s*\{[\s\S]*?height: auto !important;[\s\S]*?min-height: 100% !important;[\s\S]*?overflow: visible !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ticket-column\s*\{[\s\S]*?height: auto !important;[\s\S]*?max-height: none !important;[\s\S]*?overflow: visible !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ticket-column > \[data-ft-region="trade-ticket"\],[\s\S]*?height: auto !important;[\s\S]*?overflow: visible !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-decision-ticket-scroll\s*\{[\s\S]*?overflow: visible !important;/,
  );
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /function renderMarketContext\(|data-ft-role="linked-market-information"/,
  );
  assert.match(
    decisionMarketControllerSource,
    /function renderMarketInformationTabs[\s\S]*?Trades[\s\S]*?Holders[\s\S]*?Discussion[\s\S]*?Decisions/,
  );
  assert.match(
    decisionMarketControllerSource,
    /Holder distribution is not included in \$\{PRODUCT_BRAND\.displayName\}’s reviewed current-token contract yet\./,
  );
});

test('spot and decision routes share one authoritative desktop terminal geometry', () => {
  assert.match(
    geometryCss,
    /\.ft-chart-launchpad-mark,\s*\.ft-chart-launchpad-mark img,/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-chart-launchpad-mark img\s*\{[\s\S]*?clip-path: circle\(50% at 50% 50%\);/,
  );
  assert.match(
    triviumTerminalCss,
    /--sidebar-width: clamp\(286px, 19vw, 390px\);/,
  );
  assert.match(
    triviumTerminalCss,
    /grid-template-areas:\s*"market-summary trade-ticket"\s*"primary-market trade-ticket"\s*"activity trade-ticket" !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /grid-template-columns: minmax\(0, 1fr\) clamp\(340px, 23vw, 460px\) !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /--ft-terminal-account-height: clamp\(190px, 21dvh, 248px\) !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ticket-column\s*\{[\s\S]*?grid-column: 2 !important;[\s\S]*?grid-row: 1 \/ 4 !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /:not\(\.ft-wallet-connected\) \.terminal-activity > \.ft-activity-row\s*\{\s*grid-column: 1;/,
  );
});

test('desktop market activity expands into the shared workspace scroll', () => {
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus \.ft-chart-market-header > \*\s*\{[\s\S]*?height: 38px;[\s\S]*?min-height: 38px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus \.ft-ownership-account-tabs\s*\{\s*flex: 0 0 74px;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.terminal-activity,[\s\S]*?\.ft-ownership-account\s*\{[\s\S]*?height: auto !important;[\s\S]*?min-height: 220px !important;[\s\S]*?contain: none !important;[\s\S]*?overflow: visible !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-transactions-list,[\s\S]*?\.ft-ownership-account-panel\s*\{[\s\S]*?flex: 0 0 auto !important;[\s\S]*?overflow: visible !important;[\s\S]*?overscroll-behavior-y: auto;[\s\S]*?touch-action: auto;/,
  );
  assert.match(
    decisionMarketControllerSource,
    /ft-ownership-transactions-list" aria-label="Recent transactions"/,
  );
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /aria-label="Scrollable (?:recent|proposal) transactions"|ft-market-information-panel-body" tabindex=/,
  );
});

test('market workspace uses one canonical structural background', () => {
  assert.match(
    triviumTerminalCss,
    /html\[data-workspace="markets"\]\s*\{[\s\S]*?--market-surface: #090911;[\s\S]*?--trivium-canvas: #05050a;/,
  );
  assert.match(
    triviumTerminalCss,
    /\[data-01r-theme-scope\]\s*\{[\s\S]*?--ft-bg: var\(--trivium-canvas\);[\s\S]*?--ft-panel: var\(--trivium-panel\);[\s\S]*?--ft-panel-soft: var\(--trivium-panel-raised\);/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-terminal-grid,[\s\S]*?\.ft-twap-window-pane[\s\S]*?background: var\(--market-surface, #101010\) !important;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.tp-market-toolbar,[\s\S]*?#tlp-all-list[\s\S]*?background: var\(--market-surface, #101010\) !important;/,
  );
});

test('market notices stay in document flow instead of covering the market summary', () => {
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus\.ft-has-system-message \.ft-system-bar\s*\{[\s\S]*?display: flex;[\s\S]*?position: static;[\s\S]*?top: auto;[\s\S]*?flex: 0 0 auto;/,
  );
});
