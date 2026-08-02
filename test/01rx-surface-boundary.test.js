import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const faviconAsset = fs.readFileSync(
  new URL('../public/logos/01rx-favicon.png', import.meta.url),
);
const tokenCss = fs.readFileSync(new URL('../styles/token.css', import.meta.url), 'utf8');
const frameCss = fs.readFileSync(new URL('../styles/futard-terminal.css', import.meta.url), 'utf8');
const sharedTerminalCss = fs.readFileSync(
  new URL('../styles/terminal-shared.css', import.meta.url),
  'utf8',
);
const refinementCss = fs.readFileSync(
  new URL('../styles/refinements.css', import.meta.url),
  'utf8',
);
const proposalChartSource = fs.readFileSync(
  new URL('../src/markets/proposal-history-chart.js', import.meta.url),
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
const tokenPageSource = fs.readFileSync(
  new URL('../src/legacy/token-page.js', import.meta.url),
  'utf8',
);
const landingSource = fs.readFileSync(
  new URL('../src/legacy/landing.js', import.meta.url),
  'utf8',
);
const vercelConfig = JSON.parse(
  fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
);

test('01RX exposes no user-facing NAVgator navigation', () => {
  assert.doesNotMatch(indexSource, /<a\b[^>]*href=["'][^"']*navgator/i);
  assert.doesNotMatch(indexSource, /site-header-navgator/);
  assert.match(indexSource, /rel="canonical" href="https:\/\/01rx\.vercel\.app\/"/);

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

test('browser icon metadata uses only the compact cache-busted 01RX mark', () => {
  const iconLinks = [...indexSource.matchAll(
    /<link\b[^>]*rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>/g,
  )].map(match => match[0]);

  assert.equal(iconLinks.length, 3);
  iconLinks.forEach((link) => {
    assert.match(link, /href="\/logos\/01rx-favicon\.png\?v=1"/);
    assert.doesNotMatch(link, /navgator|favicon\.ico/i);
  });
  assert.equal(faviconAsset.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(faviconAsset.readUInt32BE(16), 512);
  assert.equal(faviconAsset.readUInt32BE(20), 512);
});

test('01RX adds functional NAV, Growth, and chart expansion controls plus a disabled TradingView placeholder', () => {
  assert.equal(
    (indexSource.match(/window\.toggleChartNavMenu = function/g) || []).length,
    1,
  );
  assert.match(indexSource, /id="chart-nav-trigger"/);
  assert.match(indexSource, /id="btn-growth-chart-toolbar"/);
  const placeholderButtons = [
    ...indexSource.matchAll(
      /<button class="chart-tv-placeholder-button[^"]*"[^>]*\sdisabled(?:\s|>)/g,
    ),
  ];
  assert.equal(placeholderButtons.length, 1);
  assert.doesNotMatch(
    placeholderButtons.map(match => match[0]).join('\n'),
    /onclick=|data-ft-action=/,
  );
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
    /\.ft-market-chart-header-region,[\s\S]*?\.ft-chart-market-header > \*\s*\{[\s\S]*?height: 38px;[\s\S]*?min-height: 38px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-decision-ticket \.ft-outcome-tabs,[\s\S]*?\.ft-decision-ticket \.ft-outcome-tabs button\s*\{[\s\S]*?height: 42px;[\s\S]*?min-height: 42px;/,
  );
  assert.match(
    sharedTerminalCss,
    /html\[data-workspace="markets"\] \.tp-market-search-field\s*\{[\s\S]*?position: relative;[\s\S]*?height: 28px;[\s\S]*?flex: 1 1 auto;[\s\S]*?margin: 0;/,
  );
  assert.match(
    indexSource,
    /<label class="tp-market-search-field" id="tp-market-search-field">\s*<input id="tlp-search" type="search"/,
  );
  assert.match(
    refinementCss,
    /\.tp-market-search-field\s*\{[\s\S]*?padding: 0 12px;[\s\S]*?border: 1px solid #77776f;[\s\S]*?border-radius: 8px;/,
  );
  assert.doesNotMatch(indexSource, /tp-market-search-button|tp-market-sort-button|tp-market-sort-menu/);
  assert.doesNotMatch(indexSource, /tp-market-close-button|Close asset browser/);
});

test('market sidebar titles use consistent full-size click targets', () => {
  assert.match(
    refinementCss,
    /html\[data-workspace="markets"\] \.tp-market-tabs\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: 18% 29% 24% 29%;[\s\S]*?padding: 0;/,
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
    /<button[\s\S]*?tp-unified-section-toggle-live[\s\S]*?onclick="toggleMarketSidebarSection\('tlp-decisions-panel', this\)"[\s\S]*?id="tp-decision-markets-title">Markets<\/span>[\s\S]*?<\/button>/,
  );
  assert.match(
    indexSource,
    /<button[\s\S]*?tp-unified-section-toggle-tokens[\s\S]*?onclick="toggleMarketSidebarSection\('tlp-all-panel', this\)"[\s\S]*?id="tp-token-section-title">Tokens<\/span>[\s\S]*?<\/button>/,
  );
});

test('market sidebar underline slides between proportionally spaced tabs', () => {
  assert.match(
    refinementCss,
    /html\[data-workspace="markets"\] \.tp-market-tabs\s*\{[\s\S]*?border-bottom: 0;/,
  );
  assert.match(
    refinementCss,
    /html\[data-workspace="markets"\] \.tp-unified-section-heading\s*\{[\s\S]*?border-top: 0;/,
  );
  assert.match(
    refinementCss,
    /data-market-sidebar-tab="watchlist"\] \.tp-market-tabs\s*\{\s*--tp-market-tab-left: 18%;\s*--tp-market-tab-width: 29%;/,
  );
  assert.match(
    refinementCss,
    /data-market-sidebar-tab="all"\] \.tp-market-tabs\s*\{\s*--tp-market-tab-left: 0%;\s*--tp-market-tab-width: 18%;/,
  );
  assert.match(
    refinementCss,
    /data-market-sidebar-tab="markets"\] \.tp-market-tabs\s*\{\s*--tp-market-tab-left: 71%;\s*--tp-market-tab-width: 29%;/,
  );
  assert.match(
    refinementCss,
    /data-market-sidebar-tab="tokens"\] \.tp-market-tabs\s*\{\s*--tp-market-tab-left: 47%;\s*--tp-market-tab-width: 24%;/,
  );
  assert.match(
    refinementCss,
    /\.tp-market-tabs::after\s*\{[\s\S]*?left: var\(--tp-market-tab-left\);[\s\S]*?width: var\(--tp-market-tab-width\);[\s\S]*?left 180ms cubic-bezier\(0\.22, 1, 0\.36, 1\),[\s\S]*?width 180ms cubic-bezier\(0\.22, 1, 0\.36, 1\);/,
  );
  assert.doesNotMatch(refinementCss, /\.tp-market-tab\.active::after/);
  assert.doesNotMatch(refinementCss, /\.tp-market-tab-watchlist\.active/);
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

test('decision support filters stay compact and full trade labels remain visible', () => {
  assert.match(
    frameCss,
    /\.ft-decision-support-pass\s*\{[\s\S]*?background: #15352b;[\s\S]*?color: #58dcb0;/,
  );
  assert.match(
    frameCss,
    /\.ft-decision-support-fail\s*\{[\s\S]*?background: #3b1c21;[\s\S]*?color: #ff737e;/,
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

test('decision charts reserve a compact lower pane for TWAP window progress', () => {
  assert.match(
    frameCss,
    /\.ft-twap-window-pane\s*\{[\s\S]*?height: 50px;[\s\S]*?border-top: 1px solid #292929;/,
  );
  assert.match(
    frameCss,
    /\.ft-twap-window-fill\s*\{[\s\S]*?width: var\(--ft-twap-progress, 0%\);[\s\S]*?background: var\(--ft-positive\);/,
  );
  assert.match(
    frameCss,
    /\.ft-hourly-plot-shell\.ft-has-twap-progress \.ft-hourly-live\s*\{\s*height: calc\(100% - 50px\);/,
  );
});

test('decision chart TWAP boundaries are unlabeled dashed white lines', () => {
  assert.match(
    frameCss,
    /\.ft-hourly-event-line\s*\{[\s\S]*?border-left: 1px dashed color-mix\(in srgb, #ffffff 82%, transparent\);/,
  );
  assert.doesNotMatch(proposalChartSource, /label: 'TWAP (?:Open|Close)'/);
  assert.doesNotMatch(proposalChartSource, /line\.appendChild\(label\)/);
});

test('decision chart endpoints keep small solid centers with sequenced pulse bands', () => {
  const pulseStart = frameCss.indexOf('@keyframes ft-proposal-live-pulse');
  const pulseEnd = frameCss.indexOf('\n}\n\n.ft-hourly-live', pulseStart);
  const pulseKeyframes = frameCss.slice(pulseStart, pulseEnd + 2);
  assert.ok(pulseStart >= 0 && pulseEnd > pulseStart);
  assert.match(
    frameCss,
    /\.ft-proposal-live-dot\s*\{[\s\S]*?width: 5px;[\s\S]*?height: 5px;[\s\S]*?animation: none !important;/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-live-dot::after\s*\{[\s\S]*?border: 1px solid currentColor;[\s\S]*?animation: ft-proposal-live-pulse 3s ease-out infinite;[\s\S]*?animation-delay: var\(--ft-proposal-live-pulse-delay\);/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-live-dot-pass\s*\{\s*--ft-proposal-live-pulse-delay: 1s;/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-live-dot-fail\s*\{\s*--ft-proposal-live-pulse-delay: 2s;/,
  );
  assert.doesNotMatch(
    pulseKeyframes,
    /box-shadow:/,
  );
  assert.match(
    proposalChartSource,
    /pointMarkersVisible: false,/,
  );
  assert.doesNotMatch(
    proposalChartSource,
    /pointMarkersVisible:\s*valueCount === 1/,
  );
});

test('global wallet control uses the white 01RX header treatment', () => {
  assert.match(
    frameCss,
    /\.site-header-market-wallet\[data-01r-theme-scope\]\s*\{[\s\S]*?--ft-accent: #eeeeea;[\s\S]*?--ft-focus: #ffffff;/,
  );
  assert.match(
    frameCss,
    /\.site-header-market-wallet \.ft-wallet-button\s*\{[\s\S]*?border-color: #eeeeea;[\s\S]*?background: #eeeeea;[\s\S]*?color: #101010;/,
  );
  assert.match(
    frameCss,
    /\.site-header-market-wallet \.ft-wallet-dot\s*\{[\s\S]*?background: #35d093;/,
  );
});

test('decision trade wallet action stays white for both outcomes', () => {
  assert.match(
    frameCss,
    /\.ft-decision-ticket\.ft-order-outcome-pass \.ft-primary-button\.ft-connect-trade-button:not\(:disabled\),\s*\.ft-decision-ticket\.ft-order-outcome-fail \.ft-primary-button\.ft-connect-trade-button:not\(:disabled\)\s*\{[\s\S]*?border-color: #f2f2ef;[\s\S]*?background: #f2f2ef;[\s\S]*?color: #101010;/,
  );
});

test('market sidebar uses one market section with a leading live indicator', () => {
  assert.match(
    sharedTerminalCss,
    /#tlp-all-list,[\s\S]*?#tlp-wl-list\s*\{[\s\S]*?scrollbar-width: none;[\s\S]*?-ms-overflow-style: none;/,
  );
  assert.match(
    indexSource,
    /id="tlp-decisions-panel"[\s\S]*?id="tp-decision-markets-title">Markets<\/span>[\s\S]*?class="tp-unified-section-columns tp-unified-section-columns-market"[\s\S]*?<span>Threshold<\/span>[\s\S]*?<span>Signal<\/span>[\s\S]*?id="tp-live-decision-count">0 markets live<\/span>[\s\S]*?id="tlp-all-panel"/,
  );
  assert.match(
    indexSource,
    /data-market-sidebar-tab="all"[^>]*>All<\/button>[\s\S]*?data-market-sidebar-tab="watchlist"[^>]*>Watchlist<\/button>[\s\S]*?data-market-sidebar-tab="tokens"[^>]*>Tokens<\/button>[\s\S]*?data-market-sidebar-tab="markets"[^>]*>Markets<\/button>/,
  );
  assert.doesNotMatch(indexSource, /tlp-past-decisions|tp-past-decisions|tlp-decision-history-toggle-slot/);
  assert.doesNotMatch(indexSource, /<span>Status<\/span>/);
  assert.doesNotMatch(indexSource, /class="tp-(?:decision|token)-columns"|<span>Market<\/span>|tp-token-primary-label|>Asset ↓<\/button>/);
  assert.match(
    indexSource,
    /id="tlp-all-panel"[\s\S]*?aria-label="Collapse tokens"[\s\S]*?id="tp-token-section-title">Tokens<\/span>[\s\S]*?class="tp-unified-section-columns tp-unified-section-columns-token"[\s\S]*?<span aria-hidden="true">Price<\/span>[\s\S]*?id="tp-token-secondary-sort"[\s\S]*?onclick="sortMarketSidebarBySecondaryMetric\(event\)"[\s\S]*?id="tp-token-secondary-label">24h<\/span>[\s\S]*?id="tp-token-count">0 tokens live<\/span>/,
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
  assert.match(refinementCss, /\.tp-decision-live-dot\s*\{[\s\S]*?grid-column: 1;/);
  assert.match(
    refinementCss,
    /\.tp-decision-live-dot\s*\{[\s\S]*?animation: tp-decision-live-pulse var\(--tp-live-pulse-duration, 1s\) ease-out infinite;[\s\S]*?animation-delay: var\(--tp-live-pulse-delay, 0ms\);/,
  );
});

test('the visible token metric toggles high and low sorting', () => {
  assert.match(
    appCoreSource,
    /function sortMarketSidebarBySecondaryMetric\(event\)\s*\{[\s\S]*?_marketTokenSecondarySortConfig\[_marketTokenSecondaryMetric\][\s\S]*?_marketTokenSortKey === config\.key[\s\S]*?_marketSidebarSortAscending = !_marketSidebarSortAscending;[\s\S]*?_marketTokenSortKey = config\.key;[\s\S]*?_marketSidebarSortAscending = false;[\s\S]*?applyMarketSidebarSearch\(\);/,
  );
  assert.doesNotMatch(indexSource, /tp-token-secondary-sort-direction/);
  assert.match(appCoreSource, /var _marketTokenSecondaryMetric = 'change24h';/);
  assert.match(
    refinementCss,
    /\.tp-token-secondary-sort\s*\{[\s\S]*?cursor: pointer;/,
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

test('spot chart aligns equal-width timeframe, NAV, and Growth boxes with the plot rail', () => {
  assert.match(
    frameCss,
    /\.chart-tv-placeholder-controls-primary\s*\{\s*min-width: 42px;\s*flex: 0 0 42px;\s*order: -1;\s*\}/,
  );
  assert.match(
    frameCss,
    /\.chart-tv-placeholder-timeframe\s*\{\s*width: 42px;\s*min-width: 42px;/,
  );
  assert.match(
    frameCss,
    /\.chart-tv-placeholder-controls-secondary\s*\{\s*flex: 0 0 56px;\s*margin-left: auto;\s*\}/,
  );
});

test('decision chart toolbar keeps only chart expansion', () => {
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /hourly-series-trigger|TradingView weekly timeframe placeholder|ft-hourly-growth-control/,
  );
  assert.match(
    decisionMarketControllerSource,
    /function renderChartExpansionControl\(\)[\s\S]*?data-ft-action="toggle-chart-expansion"/,
  );
});

test('desktop spot ticket grows to expose every control without internal scrolling', () => {
  assert.match(
    frameCss,
    /\.ft-ownership-ticket\s*\{[\s\S]*?padding: 12px 14px 14px;[\s\S]*?overflow: visible;/,
  );
  assert.match(
    sharedTerminalCss,
    /:has\(\[data-ft-mode="token"\]\.ft-proposal-focus\) \.app-content\s*\{\s*overflow-y: auto !important;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus \.ft-terminal-grid,[\s\S]*?\.ft-proposal-focus\.ft-ownership-market \.ft-terminal-grid\s*\{[\s\S]*?--ft-terminal-chart-height: max\(\s*580px,[\s\S]*?overflow: visible;/,
  );
});

test('desktop decision trading keeps its action outside the scrolling ticket body', () => {
  assert.match(
    frameCss,
    /\.ft-proposal-focus\.ft-live-market \.ft-ticket-column,[\s\S]*?grid-template-rows: minmax\(0, 1fr\);/,
  );
  assert.match(
    frameCss,
    /\.ft-decision-ticket-scroll\s*\{[\s\S]*?flex-direction: column;/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-focus \.ft-decision-ticket-scroll\s*\{[\s\S]*?overflow-y: scroll;[\s\S]*?scrollbar-gutter: stable;/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-focus \.ft-decision-action\s*\{[\s\S]*?z-index: 4;[\s\S]*?background: #111111;/,
  );
});

test('spot and decision routes share one authoritative desktop terminal geometry', () => {
  assert.match(
    sharedTerminalCss,
    /html\[data-workspace="markets"\]\s*\{\s*--sidebar-width: 275px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\[data-ft-mode="token"\]\.ft-proposal-focus\.ft-live-market \.ft-terminal-grid,[\s\S]*?\[data-ft-mode="token"\]\.ft-proposal-focus\.ft-ownership-market \.ft-terminal-grid\s*\{[\s\S]*?grid-template-columns:[\s\S]*?minmax\(0, 1fr\)[\s\S]*?225px[\s\S]*?minmax\(0, 25vw\);/,
  );
  assert.match(
    sharedTerminalCss,
    /grid-template-rows:\s*auto\s*var\(--ft-terminal-chart-height\)\s*var\(--ft-terminal-account-height\);/,
  );
  assert.match(
    sharedTerminalCss,
    /\[data-ft-mode="token"\]\.ft-proposal-focus \.ft-account-row\s*\{[\s\S]*?display: block;[\s\S]*?grid-row: 3;/,
  );
  assert.equal((sharedTerminalCss.match(/grid-template-columns:/g) || []).length, 1);
});

test('desktop account activity stays inside the viewport and scrolls its body', () => {
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus \.ft-chart-market-header > \*\s*\{[\s\S]*?height: 38px;[\s\S]*?min-height: 38px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus \.ft-ownership-account-tabs\s*\{\s*flex: 0 0 74px;/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus \.ft-ownership-account-panel\s*\{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior-y: contain;/,
  );
});
