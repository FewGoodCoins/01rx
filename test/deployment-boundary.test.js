import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('production keeps the canonical backend behind a server-only API relay', () => {
  const relay = fs.readFileSync('api/[...path].js', 'utf8');
  const envExample = fs.readFileSync('.env.example', 'utf8');
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

  assert.match(relay, /process\.env\.NAVGATOR_API_ORIGIN/);
  assert.doesNotMatch(relay, /DFLOW_API_KEY|HELIUS_RPC_URL|SOLANA_RPC/);
  assert.match(envExample, /^NAVGATOR_API_ORIGIN=https:\/\/api\.navgator\.xyz$/m);
  assert.doesNotMatch(envExample, /VITE_DFLOW|VITE_HELIUS|VITE_SOLANA_RPC/);
  assert.ok(Array.isArray(vercel.headers));
  assert.deepEqual(vercel.rewrites[0], {
    source: '/api/:relayPath*',
    destination: '/api/relay?relayPath=:relayPath',
  });
});

test('browser trading code cannot call DFlow or read server credentials directly', () => {
  const browserSources = [
    'src/core/api-client.js',
    'src/markets/decision-market-controller.js',
    'src/markets/solana-trading.js',
  ].map(path => fs.readFileSync(path, 'utf8')).join('\n');

  assert.doesNotMatch(browserSources, /quote-api\.dflow\.net/);
  assert.doesNotMatch(browserSources, /DFLOW_API_KEY|HELIUS_RPC_URL/);
  assert.match(browserSources, /trading\.spotOrder/);
  assert.match(browserSources, /trading\.spotSubmit/);
});
