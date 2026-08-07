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
const solanaMarkAsset = fs.readFileSync(
  new URL('../public/logos/solana-mark.svg', import.meta.url),
  'utf8',
);
const tokenCss = fs.readFileSync(new URL('../styles/token.css', import.meta.url), 'utf8');
const shellCss = fs.readFileSync(new URL('../styles/shell.css', import.meta.url), 'utf8');
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

test('token identity badges use reviewed local artwork and distinct control geometry', () => {
  assert.match(solanaMarkAsset, /viewBox="0 0 101 88"/);
  assert.match(solanaMarkAsset, /#9945FF/);
  assert.match(solanaMarkAsset, /#19FB9B/);
  assert.doesNotMatch(solanaMarkAsset, /<script\b|\b(?:href|src)=["']https?:\/\//i);
  assert.match(
    decisionMarketControllerSource,
    /data-ft-role="token-chain"[\s\S]*?<img src="logos\/solana-mark\.svg" alt="" aria-hidden="true">/,
  );
  assert.match(
    frameCss,
    /\.ft-chart-identity-badge\s*\{[\s\S]*?border-radius: 50% !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /Token identity is intentionally circular at every market breakpoint[\s\S]*?\.ft-chart-identity-badge\s*\{\s*border-radius: 50% !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header \.ft-chart-market-watchlist\s*\{[\s\S]*?border: 0 !important;\s*background: transparent;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header \.ft-market-title-row > p\s*\{\s*overflow: hidden;\s*flex: 0 1 auto;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-chart-token-mark\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 44px;[\s\S]*?flex: 0 0 44px;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header \.ft-market-title-copy p strong\s*\{[\s\S]*?font-size: 18px;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header \.ft-chart-identity-badge\s*\{\s*width: 20px;\s*height: 20px;\s*flex: 0 0 20px;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header \.ft-chart-market-chain img\s*\{\s*width: 12px;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header \.ft-chart-market-watchlist\s*\{\s*width: 24px;\s*height: 24px;\s*flex: 0 0 24px;/,
  );
  assert.match(
    frameCss,
    /\.ft-chart-market-ca-check-icon\s*\{\s*display: none;\s*color: var\(--ft-positive, #35d093\);/,
  );
  assert.match(
    frameCss,
    /\[data-ft-copy-state="copied"\] \.ft-chart-market-ca-copy-icon\s*\{\s*display: none;/,
  );
  assert.match(
    frameCss,
    /\[data-ft-copy-state="copied"\] \.ft-chart-market-ca-check-icon\s*\{\s*display: block;/,
  );
  assert.match(
    triviumTerminalCss,
    /--market-summary-height: 58px;\s*--market-header-cell-height: 56px;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-terminal-grid\s*\{[\s\S]*?grid-template-rows: var\(--market-summary-height\) minmax\(430px, 52dvh\) minmax\(220px, auto\) !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header\s*\{[\s\S]*?min-height: var\(--market-header-cell-height\) !important;[\s\S]*?grid-template: var\(--market-header-cell-height\) \/ minmax\(250px, 2fr\)/,
  );
  assert.match(
    triviumTerminalCss,
    /\.terminal-market-summary\s*\{\s*min-height: var\(--market-summary-height\);\s*padding: 0 7px;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header\.ft-decision-chart-header\s*\{\s*grid-template: var\(--market-header-cell-height\) \/ minmax\(165px, 1\.45fr\) repeat\(5, minmax\(48px, 1fr\)\) 44px !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /@media \(max-width: 1040px\) and \(min-width: 981px\)[\s\S]*?\.ft-ownership-chart-header\.ft-decision-chart-header\s*\{\s*grid-template: var\(--market-header-cell-height\) \/ minmax\(145px, 1\.35fr\) repeat\(4, minmax\(48px, 1fr\)\) 44px !important;[\s\S]*?\.ft-decision-chart-header > \.ft-chart-market-metric:last-child\s*\{\s*display: none;/,
  );
  assert.doesNotMatch(
    triviumTerminalCss,
    /grid-template-rows: (?:84|96)px|min-height: (?:86|94)px(?: !important)?|height: 94px !important|grid-template: 94px \/ minmax|padding: 6px 7px/,
  );
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
  assert.match(
    triviumTerminalCss,
    /\[data-ft-mode="token"\] \.terminal-system-status \.ft-system-meta\s*\{\s*display: none;/,
  );
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
    /id="tp-decision-markets-title">[\s\S]*?<span>Decisions<\/span>/,
  );
  assert.match(
    triviumTerminalCss,
    /data-market-sidebar-tab="all"\] #tlp-decisions-panel > \.tp-unified-section-heading,[\s\S]*?data-market-sidebar-tab="markets"\] #tlp-decisions-panel > \.tp-unified-section-heading\s*\{\s*display: none;/,
  );
  assert.doesNotMatch(indexSource, /data-market-sidebar-section-title="markets"/);
  assert.doesNotMatch(
    indexSource,
    /tp-unified-section-toggle-(?:live|past)|tp-past-decision-markets-title/,
  );
  assert.doesNotMatch(
    indexSource,
    /tp-unified-section-toggle-tokens|tp-token-section-title|aria-label="Collapse tokens"/,
  );
});

test('zero live decisions occupy one full noninteractive market row', () => {
  const dom = new JSDOM(indexSource);
  const heading = dom.window.document.querySelector('#tp-decision-markets-title');
  const status = dom.window.document.querySelector('#tp-live-decisions-empty');

  assert.equal(heading?.textContent.trim(), 'Decisions');
  assert.ok(status);
  assert.equal(status.tagName, 'DIV');
  assert.equal(status.textContent.trim(), '0 decisions live');
  assert.equal(status.classList.contains('tp-live-decisions-empty'), true);
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.closest('button, a'), null);
  assert.equal(status.hasAttribute('onclick'), false);
  assert.match(
    triviumTerminalCss,
    /\.tp-live-decisions-empty\s*\{[\s\S]*?height: 54px;[\s\S]*?min-height: 54px !important;[\s\S]*?flex: 0 0 54px;[\s\S]*?grid-template-columns: 35px minmax\(0, 1fr\);/,
  );
  assert.match(
    triviumTerminalCss,
    /body#navgator-app#navgator-app \.tp-live-decisions-empty::before\s*\{[\s\S]*?width: 35px;[\s\S]*?height: 35px;[\s\S]*?border-radius: 50% !important;[\s\S]*?content: '0';/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-live-decisions-empty\s*\{[\s\S]*?border-bottom: 0;[\s\S]*?background: transparent;/,
  );
  assert.match(
    triviumTerminalCss,
    /body#navgator-app#navgator-app \.tp-live-decisions-empty::before\s*\{[\s\S]*?border: 1px solid #292634;[\s\S]*?background: transparent;[\s\S]*?color: #9c99a8;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-live-decisions-empty strong\s*\{\s*color: #f5f4f9;/,
  );
  dom.window.close();
});

test('market sidebar uses compact reference tabs and source-backed filter pills', () => {
  const dom = new JSDOM(indexSource);
  const tabs = Array.from(
    dom.window.document.querySelectorAll('[data-market-sidebar-tab]'),
    node => node.textContent.trim(),
  );
  const filterSlots = Array.from(
    dom.window.document.querySelectorAll('[data-market-sidebar-filter-slot]'),
  );

  assert.deepEqual(tabs, ['All', 'Tokens', 'Decisions']);
  assert.equal(dom.window.document.querySelector('[data-market-sidebar-tab="watchlist"]'), null);
  assert.equal(filterSlots.length, 3);
  assert.equal(filterSlots.every(control => control.hidden && control.textContent.trim() === ''), true);
  assert.doesNotMatch(
    indexSource,
    /All Tokens|>All tokens<\/button>/,
  );
  assert.match(
    appCoreSource,
    /var _marketSidebarFilterConfig = \{[\s\S]*?all:[\s\S]*?tokens:[\s\S]*?markets:/,
  );
  assert.match(
    appCoreSource,
    /all:\s*\[\s*\{ key: 'price', label: 'Price' \},\s*\{ key: 'movers', label: 'Top movers' \},\s*\{ key: 'market-cap', label: 'Market cap' \}\s*\],\s*tokens:/,
  );
  assert.match(appCoreSource, /if \(tab === 'all'\) return 'all-tokens';/);
  assert.match(
    appCoreSource,
    /localStorage\.getItem\('navgator-market-token-sort'\)[\s\S]*?saved : 'market-cap'[\s\S]*?return 'market-cap';/,
  );
  assert.match(
    appCoreSource,
    /tokens:\s*\[\s*\{ key: 'all-tokens', label: 'All' \},\s*\{ key: 'watchlist', label: 'Watchlist' \},\s*\{ key: 'trending', label: 'Trending' \}\s*\],\s*markets:\s*\[\s*\{ key: 'all-markets', label: 'All' \},\s*\{ key: 'live', label: 'Live' \},\s*\{ key: 'prior', label: 'Resolved' \}\s*\]/,
  );
  assert.doesNotMatch(appCoreSource, /^\s*watchlist:\s*\[/m);
  assert.match(appCoreSource, /_marketSidebarFilter === 'movers' \|\| _marketSidebarFilter === 'trending'[\s\S]*?_marketTokenSortKey = 'change';/);
  assert.match(
    appCoreSource,
    /_marketSidebarTab === 'all'[\s\S]*?_marketSidebarTab === 'tokens'[\s\S]*?_marketTokenSortKey = 'market-cap';[\s\S]*?_marketSidebarSortAscending = false;/,
  );
  assert.match(appCoreSource, /_marketSidebarFilter === 'watchlist'[\s\S]*?\(!watchlistOnly \|\| isWatched\)/);
  assert.match(
    appCoreSource,
    /function setMarketSidebarFilter\(nextFilter\)[\s\S]*?_applyMarketSidebarFilterSort\(\);[\s\S]*?applyMarketSidebarSearch\(\);/,
  );
  assert.match(
    triviumTerminalCss,
    /html\[data-workspace="markets"\] \.tp-market-tabs\s*\{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    triviumTerminalCss,
    /--sidebar-width: 280px;[\s\S]*?\.tp-market-tabs\s*\{[\s\S]*?height: 37px;[\s\S]*?background: #15141d !important;/,
  );
  assert.match(triviumTerminalCss, /--market-left-gutter: 12px;/);
  assert.match(
    triviumTerminalCss,
    /body#navgator-app\.is-token\.is-token-markets:not\(\.left-panel-collapsed\) \.app-shell\s*\{\s*padding-left: var\(--market-left-gutter\);/,
  );
  assert.match(
    triviumTerminalCss,
    /\.shell-panel-toggle-left\s*\{[\s\S]*?left: calc\(var\(--market-left-gutter\) \+ var\(--sidebar-width\) - 33px\);/,
  );
  assert.match(
    triviumTerminalCss,
    /body\.is-token\.is-token-markets \.shell-panel-toggle-left\s*\{[\s\S]*?top: calc\(var\(--site-header-height\) \+ 18\.5px\);\s*left: calc\(var\(--market-left-gutter\) \+ var\(--sidebar-width\) - 33px\);[\s\S]*?width: 25px;\s*height: 26px;[\s\S]*?border-radius: 8px !important;[\s\S]*?background: #15141d;[\s\S]*?box-shadow: none;/,
  );
  assert.match(
    triviumTerminalCss,
    /left-panel-collapsed \.app-shell\s*\{\s*padding-left: 21px;\s*\}[\s\S]*?left-panel-collapsed \.app-left\s*\{\s*width: 0 !important;\s*flex-basis: 0 !important;\s*border: 0 !important;\s*box-shadow: none !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /left-panel-collapsed \.shell-panel-toggle-left\s*\{\s*top: calc\(var\(--site-header-height\) \+ 18\.5px\);\s*left: 4px;\s*width: 25px;\s*height: 26px;[\s\S]*?border-radius: 8px !important;[\s\S]*?background: #15141d;[\s\S]*?box-shadow: none;/,
  );
  assert.match(
    shellCss,
    /body\.left-panel-collapsed \.shell-panel-toggle-left svg,[\s\S]*?transform: rotate\(180deg\);/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-market-tabs::after\s*\{\s*display: none !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /#tlp-all-list \.tp-item\s*\{[\s\S]*?height: 54px;[\s\S]*?grid-template-columns: 35px minmax\(0, 1fr\);/,
  );
  dom.window.close();
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
    triviumTerminalCss,
    /\.ft-market-information-menu-trigger\s*\{[\s\S]*?width: 107px;\s*min-width: 107px;[\s\S]*?height: 32px;[\s\S]*?justify-content: space-between;/,
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

test('chart statistics reserve their own header slot and use a compact detail row', () => {
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header\s*\{[\s\S]*?grid-template: var\(--market-header-cell-height\) \/ minmax\(250px, 2fr\) repeat\(5, minmax\(68px, 1fr\)\) 44px !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-ownership-chart-header > \.ft-chart-stats-toggle\s*\{[\s\S]*?position: static;[\s\S]*?justify-self: center;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-chart-stats-expanded\s*\{\s*--market-summary-height: 90px;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-chart-stats-expanded \.ft-chart-stats-drawer\s*\{[\s\S]*?height: 34px !important;[\s\S]*?padding: 0 10px;[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?grid-template-rows: minmax\(0, 1fr\);[\s\S]*?align-items: stretch;[\s\S]*?gap: 0;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-chart-stats-drawer > span\s*\{[\s\S]*?height: 100%;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;[\s\S]*?line-height: 1;/,
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

test('wallet actions are white and the header theme toggle sits immediately before them', () => {
  assert.match(
    triviumTerminalCss,
    /\.site-header-market-wallet \.ft-wallet-button\s*\{[\s\S]*?border: 1px solid #f4f4f1;[\s\S]*?background: #f4f4f1;[\s\S]*?color: #0b0b10;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.site-header-market-wallet \.ft-theme-toggle\s*\{[\s\S]*?width: 42px;[\s\S]*?height: 42px;[\s\S]*?border-radius: 12px !important;/,
  );
  assert.match(
    terminalShellSource,
    /data-ft-action="toggle-theme"[\s\S]*?<div class="ft-wallet-control"/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-shell \.ft-ownership-connect\s*\{[\s\S]*?border: 1px solid #f4f4f1;[\s\S]*?background: #f4f4f1;[\s\S]*?color: #0b0b10;/,
  );
  assert.match(
    frameCss,
    /\.site-header-market-wallet \.ft-wallet-dot\s*\{[\s\S]*?background: #35d093;/,
  );
});

test('proposal trade actions share the blue-violet 01r.trade review treatment', () => {
  assert.match(
    triviumTerminalCss,
    /\.ft-primary-button\s*\{[\s\S]*?border: 1px solid rgb\(117 128 255 \/ 65%\);[\s\S]*?background: var\(--trivium-accent\);[\s\S]*?color: var\(--trivium-accent-ink\);/,
  );
  assert.match(
    triviumTerminalCss,
    /\.ft-primary-button:hover:not\(:disabled\)\s*\{[\s\S]*?border-color: #959cff;[\s\S]*?background: #8992ff;/,
  );
});

test('market workspace persists a complete dark or light appearance before paint', () => {
  assert.match(indexSource, /localStorage\.getItem\('navgator-terminal-theme'\)/);
  assert.match(
    indexSource,
    /document\.documentElement\.setAttribute\('data-theme', _bootTheme\)/,
  );
  assert.match(
    triviumTerminalCss,
    /html\[data-workspace="markets"\]\[data-theme="light"\]\s*\{[\s\S]*?--trivium-canvas: #f3f4f8;[\s\S]*?--trivium-panel: #ffffff;[\s\S]*?color-scheme: light;/,
  );
  assert.match(
    decisionMarketControllerSource,
    /runtime\.document\.documentElement\.dataset\.theme = state\.theme;/,
  );
  assert.match(
    triviumTerminalCss,
    /data-theme="light"[\s\S]*?:is\([\s\S]*?\.ft-market-information-menu-trigger,[\s\S]*?\.ft-market-information-option,[\s\S]*?\.ft-market-information-empty p,[\s\S]*?\.ft-ownership-transaction-row[\s\S]*?\)\s*\{\s*color: var\(--trivium-text\);/,
  );
  assert.match(
    triviumTerminalCss,
    /data-theme="light"[\s\S]*?\.site-header > \.tp-market-toolbar\.site-header-market-search\s*\{\s*background: transparent !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /data-theme="light"[\s\S]*?\.tp-decision-status-heading\s*\{[\s\S]*?background: var\(--trivium-panel-raised\) !important;[\s\S]*?color: var\(--trivium-muted\);/,
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

test('market sidebar lists each decision token once and keeps live decisions in All', () => {
  assert.match(
    sharedTerminalCss,
    /#tlp-all-list,[\s\S]*?#tlp-wl-list\s*\{[\s\S]*?scrollbar-width: none;[\s\S]*?-ms-overflow-style: none;/,
  );
  assert.match(
    indexSource,
    /id="tlp-decisions-panel"[\s\S]*?id="tp-decision-markets-title">[\s\S]*?<span>Decisions<\/span>[\s\S]*?class="tp-decisions-list-stack"[\s\S]*?id="tlp-decisions-list"[\s\S]*?id="tp-live-decisions-empty"[\s\S]*?>0 decisions live<\/strong>[\s\S]*?id="tlp-past-decisions-list"[\s\S]*?id="tlp-all-panel"[\s\S]*?class="tp-unified-section-heading tp-tokens-section-heading"[\s\S]*?>Tokens<\/span>[\s\S]*?id="tlp-all-list"/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-decisions-list-stack\s*\{[\s\S]*?scrollbar-width: none;[\s\S]*?-ms-overflow-style: none;[\s\S]*?\.tp-decisions-list-stack::\-webkit-scrollbar\s*\{\s*display: none;/,
  );
  assert.doesNotMatch(indexSource, /tp-(?:live|past)-decision-count|tlp-past-decisions-panel/);
  assert.match(
    indexSource,
    /data-market-sidebar-tab="all"[^>]*>All<\/button>[\s\S]*?data-market-sidebar-tab="tokens"[^>]*>Tokens<\/button>[\s\S]*?data-market-sidebar-tab="markets"[^>]*>Decisions<\/button>/,
  );
  assert.doesNotMatch(indexSource, /data-market-sidebar-tab="watchlist"/);
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
  assert.match(
    triviumTerminalCss,
    /data-market-sidebar-tab="all"\] #tlp-decisions-panel\s*\{[\s\S]*?max-height: min\(220px, 30vh\) !important;[\s\S]*?flex: 0 0 auto !important;/,
  );
  assert.doesNotMatch(
    triviumTerminalCss,
    /#tlp-decisions-panel:has\(#tp-live-decisions-empty:not\(\[hidden\]\)\)\s*\{\s*display: none/,
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
    /\.tp-decision-project \.ft-token-logo-small\s*\{[\s\S]*?width: 35px !important;[\s\S]*?height: 35px !important;[\s\S]*?object-fit: cover;/,
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
  assert.match(
    decisionMarketControllerSource,
    /const groupedTokenMarkets = groupSidebarMarketsByToken\(\);[\s\S]*?const liveMarkets = groupedTokenMarkets[\s\S]*?statusGroup === 'live'[\s\S]*?const resolvedMarkets = groupedTokenMarkets[\s\S]*?\['passed', 'failed'\]\.includes/,
  );
  assert.match(
    decisionMarketControllerSource,
    /runtime\.document\.body\.append\(sidebarHovercard\)[\s\S]*?data-tp-sidebar-proposal-link/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-sidebar-hovercard\s*\{[\s\S]*?position: fixed;[\s\S]*?width: min\(280px,[\s\S]*?border-radius: 14px !important;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.tp-sidebar-hovercard-decision-list\s*\{[\s\S]*?max-height: min\(184px,[\s\S]*?scrollbar-width: thin;/,
  );
  assert.doesNotMatch(decisionMarketControllerSource, /toggle-sidebar-decision-group|tp-decision-token-count/);
  assert.match(decisionMarketControllerSource, /class="tp-decision-status-heading">Live<[\s\S]*?class="tp-decision-status-heading">Resolved</);
  assert.match(appCoreSource, /item\.matches\('\.tp-item, \.tp-decision-item'\)/);
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
    /markets:\s*\[\s*\{ key: 'all-markets', label: 'All' \},\s*\{ key: 'live', label: 'Live' \},\s*\{ key: 'prior', label: 'Resolved' \}\s*\]/,
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

test('desktop activity and execution cards keep inner backgrounds inside their rounded borders', () => {
  assert.match(
    triviumTerminalCss,
    /Keep each card's painted inner surface[\s\S]*?:is\(\s*\.terminal-activity,\s*\.terminal-trade-ticket\s*\)\s*\{\s*overflow: clip !important;\s*background-clip: padding-box;/,
  );
  assert.match(
    triviumTerminalCss,
    /\.terminal-trade-ticket > \[data-ft-region="trade-ticket"\],[\s\S]*?\.terminal-trade-ticket > \[data-ft-region="trade-ticket"\] > \.ft-ticket,[\s\S]*?\.terminal-activity > \.ft-account-row,[\s\S]*?\.terminal-activity > \.ft-activity-row,[\s\S]*?\.terminal-activity > \.ft-account-row > \.ft-ownership-account,[\s\S]*?\.terminal-activity > \.ft-activity-row > \.ft-ownership-transactions[\s\S]*?\{\s*border-radius: inherit !important;\s*background-clip: padding-box;/,
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
