import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tokenCss = fs.readFileSync(new URL('../styles/token.css', import.meta.url), 'utf8');
const frameCss = fs.readFileSync(new URL('../styles/futard-terminal.css', import.meta.url), 'utf8');
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

test('desktop spot trading stays within the viewport without document scrolling', () => {
  assert.match(
    frameCss,
    /body\.is-token-markets:has\(\.ft-ownership-market\) \.app-shell\s*\{\s*height: calc\(100dvh - var\(--site-header-height\) - var\(--site-footer-height\)\) !important;/,
  );
  assert.match(
    frameCss,
    /\.ft-proposal-focus\.ft-ownership-market \.ft-terminal-grid\s*\{[\s\S]*?grid-template-rows:\s*auto\s*minmax\(0, 1fr\)\s*clamp\(180px, 24dvh, 224px\);/,
  );
});
