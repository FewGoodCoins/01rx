import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const faviconAsset = fs.readFileSync(
  new URL('../public/logos/01r-mark.png', import.meta.url),
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

test('01R.Trade exposes no user-facing NAVgator navigation', () => {
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

test('browser icon metadata uses only the compact cache-busted 01R mark', () => {
  const iconLinks = [...indexSource.matchAll(
    /<link\b[^>]*rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>/g,
  )].map(match => match[0]);

  assert.equal(iconLinks.length, 3);
  iconLinks.forEach((link) => {
    assert.match(link, /href="\/logos\/01r-mark\.png\?v=1"/);
    assert.doesNotMatch(link, /navgator|favicon\.ico/i);
  });
  assert.equal(faviconAsset.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(faviconAsset.readUInt32BE(16), 512);
  assert.equal(faviconAsset.readUInt32BE(20), 512);
});

test('product metadata and accessible copy use only the 01R.Trade brand', () => {
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

  assert.match(accessibleCopy, /01R\.Trade/);
  assert.doesNotMatch(accessibleCopy, /FOMO|01RX/);
  assert.match(
    indexSource,
    /class="product-wordmark product-wordmark-header"[^>]*>[\s\S]*?01R[\s\S]*?\.Trade/,
  );
  assert.match(
    refinementCss,
    /\.product-wordmark\s*\{[\s\S]*?font-family:[\s\S]*?font-weight: 780;/,
  );
  assert.doesNotMatch(indexSource, /FOMO|onrx\.trade|01rx-favicon/);
  assert.doesNotMatch(refinementCss, /site-header-market-name|FOMO/);
  assert.match(indexSource, /property="og:site_name" content="01R\.Trade"/);
  assert.match(indexSource, /property="og:url" content="https:\/\/fewgoodcoins\.xyz\/"/);
  assert.match(indexSource, /"name": "01R\.Trade"/);
  assert.match(indexSource, /"url": "https:\/\/fewgoodcoins\.xyz\/"/);
  assert.doesNotMatch(indexSource, /decision-markets-home-root/);
  assert.doesNotMatch(frameCss, /is-market-discovery|data-ft-mode="discovery"/);
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

test('01RX hides unavailable NAV, Growth, and weekly placeholder controls while keeping chart expansion', () => {
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
    /<label class="tp-market-search-field" id="tp-market-search-field">\s*<input id="tlp-search" type="search"/,
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
    /<button[\s\S]*?tp-unified-section-toggle-live[\s\S]*?onclick="toggleMarketSidebarSection\('tlp-decisions-panel', this\)"[\s\S]*?id="tp-decision-markets-title">Live Markets<\/span>[\s\S]*?<\/button>/,
  );
  assert.match(
    indexSource,
    /<button[\s\S]*?tp-unified-section-toggle-past[\s\S]*?onclick="toggleMarketSidebarSection\('tlp-past-decisions-panel', this\)"[\s\S]*?id="tp-past-decision-markets-title">Past Markets<\/span>[\s\S]*?<\/button>/,
  );
  assert.match(
    indexSource,
    /<button[\s\S]*?tp-unified-section-toggle-tokens[\s\S]*?onclick="toggleMarketSidebarSection\('tlp-all-panel', this\)"[\s\S]*?id="tp-token-section-title">Tokens<\/span>[\s\S]*?<\/button>/,
  );
});

test('market sidebar underline slides between evenly spaced tabs', () => {
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
    /data-market-sidebar-tab="watchlist"\] \.tp-market-tabs\s*\{\s*--tp-market-tab-center: calc\(37\.5% \+ 2px\);\s*--tp-market-tab-width: 58px;/,
  );
  assert.match(
    refinementCss,
    /data-market-sidebar-tab="all"\] \.tp-market-tabs\s*\{\s*--tp-market-tab-center: calc\(12\.5% \+ 6px\);\s*--tp-market-tab-width: 28px;/,
  );
  assert.match(
    refinementCss,
    /data-market-sidebar-tab="markets"\] \.tp-market-tabs\s*\{\s*--tp-market-tab-center: calc\(87\.5% - 6px\);\s*--tp-market-tab-width: 50px;/,
  );
  assert.match(
    refinementCss,
    /data-market-sidebar-tab="tokens"\] \.tp-market-tabs\s*\{\s*--tp-market-tab-center: calc\(62\.5% - 2px\);\s*--tp-market-tab-width: 44px;/,
  );
  assert.match(
    refinementCss,
    /\.tp-market-tabs::after\s*\{[\s\S]*?left: var\(--tp-market-tab-center\);[\s\S]*?width: var\(--tp-market-tab-width\);[\s\S]*?transform: translateX\(-50%\);[\s\S]*?left 180ms cubic-bezier\(0\.22, 1, 0\.36, 1\),[\s\S]*?width 180ms cubic-bezier\(0\.22, 1, 0\.36, 1\);/,
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
    /\.ft-hourly-chart-liveline \.ft-hourly-readout\s*\{\s*display: none;/,
  );
  assert.match(
    frameCss,
    /\.ft-liveline-root > div:not\(\.ft-liveline-canvas\)\s*\{[\s\S]*?position: absolute;[\s\S]*?z-index: 4;[\s\S]*?top: 12px;/,
  );
  assert.match(
    decisionMarketControllerSource,
    /data-ft-chart-engine="liveline"/,
  );
  assert.match(decisionMarketControllerSource, /data-ft-role="proposal-history-liveline"/);
  assert.match(proposalLivelineSource, /addEventListener\('wheel', onWheel/);
  assert.match(proposalLivelineSource, /pinch\.distance \/ distance/);
  assert.match(
    decisionMarketControllerSource,
    /drag, scroll, or pinch to navigate/,
  );
});

test('decision chart plot starts without the exposed toolbar divider', () => {
  assert.match(
    frameCss,
    /\.ft-hourly-toolbar\s*\{[\s\S]*?border-bottom: 0;/,
  );
  assert.match(
    frameCss,
    /\[data-ft-mode="token"\]\.ft-proposal-focus \.ft-hourly-live\s*\{[\s\S]*?border-top: 1px solid #292929;/,
  );
});

test('decision chart uses TWAP background context without vertical boundary lines', () => {
  assert.match(
    frameCss,
    /\.ft-hourly-pre-twap-band,\s*\.ft-hourly-post-twap-band\s*\{[\s\S]*?right: var\(--ft-chart-right-scale-width, 0px\);[\s\S]*?background: color-mix\(in srgb, var\(--ft-accent\) 5%, transparent\);/,
  );
  assert.match(
    frameCss,
    /\.ft-hourly-post-twap-band\s*\{[\s\S]*?scaleX\(var\(--ft-post-twap-scale, 0\)\);[\s\S]*?transform-origin: right center;/,
  );
  assert.match(
    proposalLivelineSource,
    /phaseBandElements[\s\S]*?key: 'post-twap'/,
  );
  assert.match(
    proposalLivelineSource,
    /prepared\.viewportEnd = prepared\.lastTime - panOffsetSeconds/,
  );
  assert.doesNotMatch(frameCss, /\.ft-hourly-event-line\s*\{/);
  assert.doesNotMatch(proposalLivelineSource, /ft-hourly-event-line|data\.ftChartEvent/);
});

test('decision chart keeps explicit starting points and animated Liveline endpoints', () => {
  assert.match(
    frameCss,
    /\.ft-liveline-start-point\s*\{[\s\S]*?width: 7px;[\s\S]*?border-radius: 50%;[\s\S]*?pointer-events: none;/,
  );
  assert.match(
    proposalLivelineSource,
    /className: 'ft-liveline-start-point'/,
  );
  assert.match(
    proposalLivelineSource,
    /pulse: playback\.pulse/,
  );
  assert.match(
    proposalLivelineSource,
    /series\.map\(\(definition\) => \{[\s\S]*?const first = definition\.data\.find/,
  );
});

test('global wallet control uses the white 01R.Trade header treatment', () => {
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

test('proposal trade wallet action stays white for conditional and spot markets', () => {
  assert.match(
    frameCss,
    /\.ft-decision-ticket\.ft-order-outcome-pass \.ft-primary-button\.ft-connect-trade-button:not\(:disabled\),\s*\.ft-decision-ticket\.ft-order-outcome-fail \.ft-primary-button\.ft-connect-trade-button:not\(:disabled\)\s*\{[\s\S]*?border-color: #f2f2ef;[\s\S]*?background: #f2f2ef;[\s\S]*?color: #101010;/,
  );
  assert.match(
    frameCss,
    /\.ft-decision-ticket\.ft-order-outcome-spot \.ft-primary-button:not\(:disabled\)\s*\{[\s\S]*?border-color: #f2f2ef;[\s\S]*?background: #f2f2ef;[\s\S]*?color: #101010;/,
  );
});

test('market sidebar keeps live and past decision markets independently discoverable', () => {
  assert.match(
    sharedTerminalCss,
    /#tlp-all-list,[\s\S]*?#tlp-wl-list\s*\{[\s\S]*?scrollbar-width: none;[\s\S]*?-ms-overflow-style: none;/,
  );
  assert.match(
    indexSource,
    /id="tlp-decisions-panel"[\s\S]*?id="tp-decision-markets-title">Live Markets<\/span>[\s\S]*?id="tp-live-decision-count">0 live<\/span>[\s\S]*?id="tlp-decisions-list"[\s\S]*?id="tlp-past-decisions-panel"[\s\S]*?id="tp-past-decision-markets-title">Past Markets<\/span>[\s\S]*?id="tp-past-decision-count">0 past<\/span>[\s\S]*?id="tlp-past-decisions-list"[\s\S]*?id="tlp-all-panel"/,
  );
  assert.match(
    indexSource,
    /data-market-sidebar-tab="all"[^>]*>All<\/button>[\s\S]*?data-market-sidebar-tab="watchlist"[^>]*>Watchlist<\/button>[\s\S]*?data-market-sidebar-tab="tokens"[^>]*>Tokens<\/button>[\s\S]*?data-market-sidebar-tab="markets"[^>]*>Markets<\/button>/,
  );
  assert.match(indexSource, /aria-controls="tlp-decisions-panel tlp-past-decisions-panel"/);
  assert.doesNotMatch(indexSource, /tlp-decision-history-toggle-slot/);
  assert.doesNotMatch(indexSource, /<span>Status<\/span>/);
  assert.doesNotMatch(indexSource, /class="tp-(?:decision|token)-columns"|<span>Market<\/span>|tp-token-primary-label|>Asset ↓<\/button>/);
  assert.match(
    indexSource,
    /id="tlp-all-panel"[\s\S]*?aria-label="Collapse tokens"[\s\S]*?id="tp-token-section-title">Tokens<\/span>[\s\S]*?class="tp-unified-section-columns tp-unified-section-columns-token"[\s\S]*?id="tp-token-price-sort"[\s\S]*?onclick="sortMarketSidebarByPrice\(event\)"[\s\S]*?id="tp-token-price-sort-direction"[\s\S]*?>Price<\/span>[\s\S]*?id="tp-token-secondary-sort"[\s\S]*?onclick="sortMarketSidebarBySecondaryMetric\(event\)"[\s\S]*?id="tp-token-secondary-sort-direction"[\s\S]*?id="tp-token-secondary-label">24h<\/span>[\s\S]*?id="tp-token-count">0 tokens live<\/span>/,
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

test('token and market metric headers show the active sort direction', () => {
  assert.match(
    appCoreSource,
    /function _sortMarketSidebarTokens\(key, event\)\s*\{[\s\S]*?_marketTokenSortKey === key[\s\S]*?_marketSidebarSortAscending = !_marketSidebarSortAscending;[\s\S]*?_marketTokenSortKey = key;[\s\S]*?_marketSidebarSortAscending = false;[\s\S]*?applyMarketSidebarSearch\(\);/,
  );
  assert.match(appCoreSource, /function sortMarketSidebarByPrice\(event\)\s*\{\s*_sortMarketSidebarTokens\('price', event\);/);
  assert.match(appCoreSource, /direction\.textContent = ascending \? '↑' : '↓';/);
  assert.match(appCoreSource, /function sortMarketSidebarDecision\(key, event\)[\s\S]*?_marketDecisionSortKey === key[\s\S]*?_marketDecisionSortAscending = !_marketDecisionSortAscending;[\s\S]*?applyMarketSidebarSearch\(\);/);
  assert.match(appCoreSource, /var _marketDecisionSortKeys = \['default', 'likelihood', 'signal'\];/);
  assert.match(appCoreSource, /config\.buttonSelector[\s\S]*?document\.querySelectorAll\(config\.buttonSelector\)/);
  assert.match(decisionMarketControllerSource, /data-sort-likelihood="\$\{Number\.isFinite\(likelihoodPct\)[\s\S]*?data-sort-signal="\$\{Number\.isFinite\(signalPct\)/);
  assert.match(indexSource, /id="tp-token-price-sort-direction"[^>]*hidden>↓<\/span>/);
  assert.match(indexSource, /id="tp-token-secondary-sort-direction"[^>]*hidden>↓<\/span>/);
  assert.match(indexSource, /id="tp-market-likelihood-sort"[\s\S]*?onclick="sortMarketSidebarDecision\('likelihood', event\)"[\s\S]*?id="tp-market-likelihood-sort-direction"[^>]*hidden>↓<\/span>[\s\S]*?>Likelihood<\/span>/);
  assert.match(indexSource, /id="tp-market-signal-sort"[\s\S]*?onclick="sortMarketSidebarDecision\('signal', event\)"[\s\S]*?id="tp-market-signal-sort-direction"[^>]*hidden>↓<\/span>[\s\S]*?>Signal<\/span>/);
  assert.match(appCoreSource, /var _marketTokenSecondaryMetric = 'change24h';/);
  assert.match(
    refinementCss,
    /\.tp-sidebar-metric-sort\s*\{[\s\S]*?cursor: pointer;/,
  );
  assert.match(
    refinementCss,
    /\.tp-unified-section-columns\s*\{[\s\S]*?font-size: 9px;[\s\S]*?text-transform: none;/,
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

test('decision chart toolbar keeps proposal details and chart expansion', () => {
  assert.doesNotMatch(
    decisionMarketControllerSource,
    /hourly-series-trigger|TradingView weekly timeframe placeholder|ft-hourly-growth-control/,
  );
  assert.match(
    decisionMarketControllerSource,
    /function renderChartExpansionControl\(\)[\s\S]*?data-ft-action="toggle-chart-expansion"/,
  );
  assert.match(
    decisionMarketControllerSource,
    /function renderProposalDetailsControl\([\s\S]*?data-ft-action="toggle-proposal-details"/,
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
    /\.ft-proposal-focus \.ft-terminal-grid,[\s\S]*?\.ft-proposal-focus\.ft-ownership-market \.ft-terminal-grid\s*\{[\s\S]*?--ft-terminal-chart-height: max\(\s*550px,[\s\S]*?overflow: visible;/,
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
    /grid-template-rows:\s*max-content\s*var\(--ft-terminal-chart-height\)\s*var\(--ft-terminal-account-height\);/,
  );
  assert.match(
    sharedTerminalCss,
    /--ft-terminal-account-height: clamp\(180px, 22dvh, 210px\);[\s\S]*?--ft-terminal-analysis-height: 0px;[\s\S]*?--ft-terminal-chart-height: max\(\s*550px,[\s\S]*?- var\(--ft-terminal-analysis-height\)/,
  );
  assert.match(
    sharedTerminalCss,
    /\.ft-proposal-focus\.ft-live-market \.ft-terminal-grid,[\s\S]*?\.ft-proposal-focus\.ft-ownership-market \.ft-terminal-grid\s*\{\s*--ft-terminal-analysis-height: 42px;/,
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

test('market workspace uses one canonical structural background', () => {
  assert.match(
    refinementCss,
    /html\[data-workspace="markets"\]\s*\{[\s\S]*?--market-surface: #101010;/,
  );
  assert.match(
    refinementCss,
    /\[data-01r-theme-scope\]\s*\{[\s\S]*?--ft-bg: #101010;[\s\S]*?--ft-bg-raised: #101010;[\s\S]*?--ft-panel: #101010;[\s\S]*?--ft-panel-soft: #101010;[\s\S]*?--ft-panel-strong: #101010;/,
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
