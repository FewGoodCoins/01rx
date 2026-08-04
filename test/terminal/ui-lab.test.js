const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relativePath => fs.readFileSync(
  path.resolve(__dirname, '../..', relativePath),
  'utf8',
);

const labDocument = read('ui-lab.html');
const labSource = read('src/ui-lab/index.js');
const labCss = read('styles/ui-lab.css');
const viteConfig = read('vite.config.js');
const sitemap = read('public/sitemap.xml');

test('UI lab exposes every shell panel and requested fixture state at desktop review widths', () => {
  [
    'assembled',
    'market-explorer',
    'market-summary',
    'primary-market',
    'activity',
    'trade-ticket',
    'system-status',
  ].forEach(value => assert.match(labDocument, new RegExp(`value="${value}"`)));
  [
    'normal',
    'loading',
    'empty',
    'degraded',
    'error',
    'long',
    'connected',
    'disconnected',
  ].forEach(value => assert.match(labDocument, new RegExp(`value="${value}"`)));
  ['1280', '1440', '1728'].forEach(value => {
    assert.match(labDocument, new RegExp(`value="${value}"`));
  });

  assert.match(labSource, /createTerminalShell\(/);
  assert.match(labSource, /lab\.setStatus\('warning'/);
  assert.match(labSource, /lab\.setStatus\('error'/);
  assert.match(labSource, /query\.get\('capture'\) === '1'/);
  assert.match(labCss, /html\[data-ui-lab-capture\]/);
  assert.match(labCss, /data-ui-panel="market-explorer"/);
  assert.match(labCss, /data-ui-panel="trade-ticket"/);
});

test('UI lab is fixture-only and guarded from production entrypoints', () => {
  assert.match(labDocument, /name="robots" content="noindex,nofollow"/);
  assert.match(labDocument, /src="\/src\/ui-lab\/index\.js"/);
  assert.match(labSource, /if \(!import\.meta\.env\.DEV\)/);
  assert.doesNotMatch(
    labSource,
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.wallets|window\.solana|signTransaction|signAndSendTransaction/,
  );
  assert.doesNotMatch(labSource, /decision-market-controller|@01resolved\/api-client/);
  assert.match(viteConfig, /index: path\.join\(root, 'index\.html'\)/);
  assert.doesNotMatch(viteConfig, /ui-lab/);
  assert.doesNotMatch(sitemap, /ui-lab/);
});
