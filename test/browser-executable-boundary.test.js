import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('trading origin ships no mutable third-party executable loader', () => {
  const document = fs.readFileSync('index.html', 'utf8');
  const appCore = fs.readFileSync('src/legacy/app-core.js', 'utf8');
  const main = fs.readFileSync('src/main.js', 'utf8');

  assert.doesNotMatch(document, /posthog|us-assets\.i\.posthog\.com/i);
  assert.doesNotMatch(appCore, /unpkg\.com|cdn\.jsdelivr\.net|supabase-js/i);
  assert.doesNotMatch(appCore, /SUPABASE_(?:URL|ANON_KEY)|_loadSupabase/);
  assert.doesNotMatch(main, /installBrowserAuth|installBrowserTelemetry/);
  assert.match(appCore, /Bundled Liveline chart engine unavailable/);
  assert.doesNotMatch(appCore, /LightweightCharts|TradingView/);
});

test('local watchlists retain storage behavior without a remote persistence client', () => {
  const watchlist = fs.readFileSync('src/shell/watchlist.js', 'utf8');
  const appCore = fs.readFileSync('src/legacy/app-core.js', 'utf8');

  assert.match(watchlist, /localStorage/);
  assert.doesNotMatch(watchlist, /user_watchlists|mergeRemote|syncRemote/);
  assert.doesNotMatch(appCore, /signInWithOtp|showAuthModal|signOutUser/);
});

test('dependency lock contains the reviewed pure-JavaScript bigint replacement', () => {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const installed = lock.packages['node_modules/bigint-buffer'];
  const replacement = lock.packages['packages/bigint-buffer-safe'];

  assert.deepEqual(installed, {
    resolved: 'packages/bigint-buffer-safe',
    link: true,
  });
  assert.equal(replacement.name, 'bigint-buffer');
  assert.equal(replacement.version, '1.1.6');
  assert.equal(replacement.license, 'UNLICENSED');
  assert.equal(lock.packages['node_modules/bindings'], undefined);
  assert.equal(lock.packages['packages/auth'], undefined);
  assert.equal(lock.packages['packages/telemetry'], undefined);
});
