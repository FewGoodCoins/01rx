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
    /html\[data-workspace="markets"\] \.tp-market-tool-button\s*\{[\s\S]*?width: 30px;[\s\S]*?height: 30px;[\s\S]*?flex: 0 0 30px;/,
  );
  assert.match(
    sharedTerminalCss,
    /html\[data-workspace="markets"\] \.tp-market-search-field\s*\{[\s\S]*?position: absolute;[\s\S]*?height: 28px;[\s\S]*?margin: 0;/,
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

test('global wallet control uses the 01RX green palette', () => {
  assert.match(
    frameCss,
    /\.site-header-market-wallet\[data-01r-theme-scope\]\s*\{[\s\S]*?--ft-accent: #35d093;[\s\S]*?--ft-focus: #35d093;/,
  );
  assert.match(
    frameCss,
    /\.site-header-market-wallet \.ft-wallet-dot\s*\{[\s\S]*?background: #35d093;/,
  );
});

test('market sidebar uses one market section with a leading live indicator', () => {
  assert.match(
    sharedTerminalCss,
    /#tlp-all-list,[\s\S]*?#tlp-wl-list\s*\{[\s\S]*?scrollbar-width: none;[\s\S]*?-ms-overflow-style: none;/,
  );
  assert.match(
    indexSource,
    /id="tlp-decisions-panel"[\s\S]*?id="tp-decision-markets-title">Markets<\/span>[\s\S]*?class="tp-unified-section-columns tp-unified-section-columns-market"[\s\S]*?<span>Pass<\/span>[\s\S]*?<span>Fail<\/span>[\s\S]*?id="tp-live-decision-count">0 markets live<\/span>[\s\S]*?id="tlp-all-panel"/,
  );
  assert.match(
    indexSource,
    /data-market-sidebar-tab="watchlist"[^>]*>[\s\S]*?<\/button>[\s\S]*?data-market-sidebar-tab="all"[^>]*>All<\/button>[\s\S]*?data-market-sidebar-tab="markets"[^>]*>Markets<\/button>[\s\S]*?data-market-sidebar-tab="tokens"[^>]*>Tokens<\/button>/,
  );
  assert.doesNotMatch(indexSource, /tlp-past-decisions|tp-past-decisions|tlp-decision-history-toggle-slot/);
  assert.doesNotMatch(indexSource, /<span>Status<\/span>/);
  assert.doesNotMatch(indexSource, /tp-decision-columns|tp-token-columns|<span>Market<\/span>|tp-token-primary-label|>Asset ↓<\/button>/);
  assert.match(
    indexSource,
    /id="tlp-all-panel"[\s\S]*?aria-label="Collapse tokens"[\s\S]*?id="tp-token-section-title">Tokens<\/span>[\s\S]*?class="tp-unified-section-columns tp-unified-section-columns-token"[\s\S]*?<span>Price<\/span>[\s\S]*?id="tp-token-secondary-label">24h<\/span>[\s\S]*?id="tp-token-count">0 tokens live<\/span>/,
  );
  assert.match(refinementCss, /\.tp-all-section\.is-collapsed\s*\{[\s\S]*?flex: 0 0 30px;/);
  assert.match(refinementCss, /\.is-collapsed \.tp-unified-section-columns\s*\{\s*display: none;/);
  assert.match(refinementCss, /\.is-collapsed \.tp-unified-section-count\s*\{\s*display: inline-flex;/);
  assert.match(refinementCss, /html\[data-workspace="markets"\]\[data-market-sidebar-tab="tokens"\] \.tp-decisions-section\s*\{[\s\S]*?display: none !important;/);
  assert.match(refinementCss, /html\[data-workspace="markets"\]\[data-market-sidebar-tab="watchlist"\] \.tp-decisions-section\s*\{[\s\S]*?display: none !important;/);
  assert.match(refinementCss, /html\[data-workspace="markets"\]\[data-market-sidebar-tab="markets"\] \.tp-all-section\s*\{[\s\S]*?display: none !important;/);
  assert.match(refinementCss, /\.tp-decision-live-dot\s*\{[\s\S]*?grid-column: 1;/);
  assert.match(
    refinementCss,
    /\.tp-decision-live-dot\s*\{[\s\S]*?animation: tp-decision-live-pulse 1\.6s ease-out infinite;/,
  );
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
    /html\[data-workspace="markets"\]\s*\{\s*--sidebar-width: 250px;/,
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
