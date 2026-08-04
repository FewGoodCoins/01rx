import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const CANONICAL_MARKET = '/?token=solo&view=markets&tab=tokens';
const repositoryUrl = relativePath => new URL(`../${relativePath}`, import.meta.url);
const read = relativePath => fs.readFileSync(repositoryUrl(relativePath), 'utf8');

test('retired standalone pages cannot return as deployment entrypoints', () => {
  const publicHtmlFiles = fs.readdirSync(repositoryUrl('public'), {
    recursive: true,
  }).filter(relativePath => String(relativePath).endsWith('.html'));
  assert.deepEqual(publicHtmlFiles, []);

  [
    'public/guide.html',
    'public/llms.txt',
    'public/llms-full.txt',
    'public/methodology.html',
    'public/navgator-for-agents/index.html',
    'public/projects/avici/index.html',
    'public/projects/solomon/index.html',
    'public/projects/umbra/index.html',
    'widgets/chart/index.html',
    'widgets/chart/widget.css',
    'widgets/chart/widget.js',
  ].forEach((relativePath) => {
    assert.equal(fs.existsSync(repositoryUrl(relativePath)), false, relativePath);
  });

  const viteConfig = read('vite.config.js');
  assert.doesNotMatch(viteConfig, /widgetChart|widgets\/chart\/index\.html/);

  const sitemapLocations = [...read('public/sitemap.xml').matchAll(
    /<loc>([^<]+)<\/loc>/g,
  )].map(match => match[1]);
  assert.deepEqual(sitemapLocations, ['https://onrx.trade/']);
});

test('every retired public route hands off to the same regular market view', () => {
  const config = JSON.parse(read('vercel.json'));
  const redirects = new Map(
    (config.redirects || []).map(route => [route.source, route]),
  );

  [
    '/terminal',
    '/widgets/chart/:path*',
    '/navgator-for-agents/:path*',
    '/guide.html',
    '/methodology.html',
    '/llms.txt',
    '/llms-full.txt',
    '/projects/:path*',
  ].forEach((source) => {
    const redirect = redirects.get(source);
    assert.ok(redirect, source);
    assert.equal(redirect.destination, CANONICAL_MARKET, source);
    assert.equal(redirect.permanent, false, source);
  });
});

test('the application document contains one regular workspace and no retired UI roots', () => {
  const document = read('index.html');
  const retiredIds = [
    'landing-view',
    'decision-markets-home-root',
    'treemap-overlay',
    'compare-overlay',
    're-overlay',
    'mobile-gate',
    'nav-calc-modal',
    'sidebar-nav-calculator',
    'sidebar-theme-toggle',
    'btn-chart-embed',
    'btn-growth-chart',
    'btn-growth-chart-toolbar',
    'system-health-banner',
  ];
  retiredIds.forEach((id) => {
    assert.doesNotMatch(document, new RegExp(`\\bid=["']${id}["']`), id);
  });

  assert.equal((document.match(/\bid=["']token-markets-root["']/g) || []).length, 1);
  assert.equal((document.match(/\bid=["']dashboard-view["']/g) || []).length, 1);

  const ids = [...document.matchAll(/\bid=["']([^"']+)["']/g)]
    .map(match => match[1]);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length, 'index.html must not contain duplicate IDs');

  assert.doesNotMatch(
    document,
    /href=["'][^"']*(?:widgets\/chart|guide\.html|methodology\.html|navgator-for-agents|\/projects\/)/i,
  );

  const auxiliaryCss = read('styles/auxiliary.css');
  assert.doesNotMatch(auxiliaryCss, /#mobile-gate|z-mobile-gate/);
  assert.doesNotMatch(
    auxiliaryCss,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.app-shell\s*\{\s*display:\s*none\s*!important;/,
  );
});
