import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('production keeps NAV data relayed and trading credentials server-only in 01RX', () => {
  const relay = fs.readFileSync('api/[...path].js', 'utf8');
  const relayEntry = fs.readFileSync('api/relay.js', 'utf8');
  const trading = fs.readFileSync('api/_lib/dflow-spot-order.js', 'utf8');
  const attribution = fs.readFileSync('api/_lib/decision-attribution.js', 'utf8');
  const envExample = fs.readFileSync('.env.example', 'utf8');
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

  assert.match(relay, /process\.env\.NAVGATOR_API_ORIGIN/);
  assert.doesNotMatch(relay, /DFLOW_API_KEY|HELIUS_RPC_URL|SOLANA_RPC/);
  assert.match(relayEntry, /beta\/trading/);
  assert.match(relayEntry, /tradingHandler/);
  assert.match(trading, /env\.DFLOW_API_KEY/);
  assert.match(trading, /env\.SOLANA_RPC_URL/);
  assert.match(trading, /https:\/\/quote-api\.dflow\.net/);
  assert.match(trading, /verifySignedDflowResponse/);
  assert.match(trading, /SIGNED_TRANSACTION_CHANGED/);
  assert.match(attribution, /env\.O1RX_ATTRIBUTION_SIGNING_KEY/);
  assert.match(attribution, /env\.O1RX_ATTRIBUTION_PUBLIC_KEY/);
  assert.match(attribution, /transaction\.partialSign\(authority\)/);
  assert.match(attribution, /DECISION_ATTRIBUTION\.feeBps/);
  assert.match(envExample, /^NAVGATOR_API_ORIGIN=https:\/\/api\.navgator\.xyz$/m);
  assert.match(envExample, /^DFLOW_API_KEY=$/m);
  assert.match(envExample, /^SOLANA_RPC_URL=$/m);
  assert.match(envExample, /^ZERO_ONE_RESOLVED_API_KEY=$/m);
  assert.match(envExample, /^O1RX_ATTRIBUTION_PUBLIC_KEY=$/m);
  assert.match(envExample, /^O1RX_ATTRIBUTION_SIGNING_KEY=$/m);
  assert.doesNotMatch(
    envExample,
    /VITE_DFLOW|VITE_HELIUS|VITE_SOLANA_RPC|VITE_O1RX_ATTRIBUTION|VITE_ZERO_ONE_RESOLVED/,
  );
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
  assert.doesNotMatch(browserSources, /DFLOW_API_KEY|HELIUS_RPC_URL|SOLANA_RPC_URL/);
  assert.match(browserSources, /trading\.spotOrder/);
  assert.match(browserSources, /trading\.spotSubmit/);
  assert.match(browserSources, /trading\.decisionAttest/);
});
