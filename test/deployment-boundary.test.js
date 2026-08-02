import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { localCurrentNavApi, localFutarchyApi } from '../vite.config.js';

test('local preview relays public futarchy reads but keeps writes in-process', async () => {
  const routes = new Map();
  const calls = [];
  const plugin = localFutarchyApi({
    publicReadOrigin: 'https://01rx.vercel.app',
    relay: async (request, response, options) => {
      calls.push({ kind: 'relay', url: request.url, origin: options.upstreamOrigin });
      response.status(200).json({ ok: true });
    },
    handler: async (request, response) => {
      calls.push({ kind: 'handler', url: request.url });
      response.statusCode = 204;
      response.end();
    },
  });
  plugin.configureServer({
    middlewares: {
      use(route, middleware) {
        routes.set(route, middleware);
      },
    },
  });
  const response = () => ({
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end() {},
  });

  await routes.get('/api/v1/futarchy')(
    { method: 'GET', url: '/?view=proposals', headers: {} },
    response(),
  );
  await routes.get('/api/beta/futarchy')(
    { method: 'POST', url: '/?view=solana-rpc', headers: {} },
    response(),
  );

  assert.deepEqual(calls, [
    {
      kind: 'relay',
      url: '/api/v1/futarchy?view=proposals',
      origin: 'https://01rx.vercel.app',
    },
    { kind: 'handler', url: '/api/beta/futarchy?view=solana-rpc' },
  ]);
});

test('local preview keeps current NAV on the 01RX same-origin boundary', async () => {
  const routes = new Map();
  const calls = [];
  const plugin = localCurrentNavApi({
    publicReadOrigin: 'https://01rx.vercel.app',
    relay: async (request, response, options) => {
      calls.push({ url: request.url, origin: options.upstreamOrigin });
      response.status(200).json({ ok: true });
    },
  });
  plugin.configureServer({
    middlewares: {
      use(route, middleware) {
        routes.set(route, middleware);
      },
    },
  });
  const response = {
    setHeader() {},
    end() {},
  };
  await routes.get('/api/current-nav')(
    { method: 'GET', url: '/?token=solo', headers: {} },
    response,
  );
  assert.deepEqual(calls, [{
    url: '/api/current-nav?token=solo',
    origin: 'https://01rx.vercel.app',
  }]);
});

test('production keeps current NAV and Solana decision services server-only in 01RX', () => {
  const relay = fs.readFileSync('api/[...path].js', 'utf8');
  const relayEntry = fs.readFileSync('api/relay.js', 'utf8');
  const currentNav = fs.readFileSync('api/_lib/zero-one-current-nav.js', 'utf8');
  const trading = fs.readFileSync('api/_lib/dflow-spot-order.js', 'utf8');
  const attribution = fs.readFileSync('api/_lib/decision-attribution.js', 'utf8');
  const envExample = fs.readFileSync('.env.example', 'utf8');
  const viteConfig = fs.readFileSync('vite.config.js', 'utf8');
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

  assert.doesNotMatch(relay, /NAVGATOR_API_ORIGIN|navgator\.xyz/);
  assert.doesNotMatch(relay, /DFLOW_API_KEY|HELIUS_RPC_URL|SOLANA_RPC/);
  assert.match(relayEntry, /beta\/trading/);
  assert.match(relayEntry, /tradingHandler/);
  assert.match(relayEntry, /v1\/futarchy/);
  assert.match(relayEntry, /futarchyHandler/);
  assert.match(relayEntry, /current-nav/);
  assert.match(relayEntry, /currentNavHandler/);
  assert.match(currentNav, /https:\/\/api\.01resolved\.com/);
  assert.match(currentNav, /resolveZeroOneResolvedApiKey/);
  assert.doesNotMatch(currentNav, /NAVGATOR_API_ORIGIN/);
  assert.match(trading, /env\.DFLOW_API_KEY/);
  assert.match(trading, /env\.HELIUS_URL/);
  assert.match(trading, /https:\/\/quote-api\.dflow\.net/);
  assert.match(trading, /verifySignedDflowResponse/);
  assert.match(trading, /SIGNED_TRANSACTION_CHANGED/);
  assert.match(attribution, /env\.O1RX_ATTRIBUTION_SIGNING_KEY/);
  assert.match(attribution, /env\.O1RX_ATTRIBUTION_PUBLIC_KEY/);
  assert.match(attribution, /transaction\.partialSign\(authority\)/);
  assert.match(attribution, /DECISION_ATTRIBUTION\.feeBps/);
  assert.doesNotMatch(envExample, /NAVGATOR_API_ORIGIN|VITE_NAVGATOR_API_BASE/);
  assert.match(envExample, /^DFLOW_API_KEY=$/m);
  assert.match(envExample, /^HELIUS_URL=$/m);
  assert.match(envExample, /^ZERO_ONE_RESOLVED_API_KEY=$/m);
  assert.match(envExample, /^O1RX_ATTRIBUTION_PUBLIC_KEY=$/m);
  assert.match(envExample, /^O1RX_ATTRIBUTION_SIGNING_KEY=$/m);
  assert.match(viteConfig, /'ZERO_ONE_RESOLVED_API_KEY'/);
  assert.match(viteConfig, /'ONE_RESOLVED_API_KEY'/);
  assert.match(viteConfig, /'RESOLVED_01_API_KEY'/);
  assert.match(viteConfig, /method === 'GET' \|\| method === 'HEAD'/);
  assert.match(viteConfig, /publicReadOrigin: hasLocalZeroOneAccess \? '' : LOCAL_PUBLIC_API_ORIGIN/);
  assert.match(viteConfig, /localDataGapApi\(\)/);
  assert.doesNotMatch(viteConfig, /VITE_NAVGATOR_API_BASE|NAVGATOR_API_ORIGIN|navgator\.xyz/);
  assert.doesNotMatch(
    envExample,
    /VITE_DFLOW|VITE_HELIUS|VITE_SOLANA_RPC|VITE_O1RX_ATTRIBUTION|VITE_ZERO_ONE_RESOLVED/,
  );
  assert.equal(
    (vercel.headers || []).some(rule => rule.source === '/api/:path*'),
    false,
  );
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
  assert.doesNotMatch(
    browserSources,
    /DFLOW_API_KEY|HELIUS_URL|HELIUS_RPC_URL|SOLANA_RPC_URL/,
  );
  assert.match(browserSources, /trading\.spotOrder/);
  assert.match(browserSources, /trading\.spotSubmit/);
  assert.match(browserSources, /trading\.decisionAttest/);
});

test('chart data boundaries are 01Resolved-only and expose unsupported history as a gap', () => {
  const browserCharts = [
    'src/chart/data-client.js',
    'src/charting/advanced-charts.js',
    'src/legacy/token-page.js',
    'src/markets/decision-market-controller.js',
  ].map(path => fs.readFileSync(path, 'utf8')).join('\n');
  const futarchy = fs.readFileSync('api/_lib/futarchy-service.js', 'utf8');
  const relay = fs.readFileSync('api/[...path].js', 'utf8');

  assert.doesNotMatch(
    browserCharts,
    /navgator\.xyz|NAVGATOR_API_ORIGIN|VITE_NAVGATOR_API_BASE|\/api\/ohlcv|\/api\/historic-nav|\/api\/token-bootstrap/,
  );
  assert.doesNotMatch(
    futarchy,
    /navgator\.xyz|NAVGATOR_API_ORIGIN|loadFutarchyTwapHistory|loadTwapHistory/,
  );
  assert.doesNotMatch(
    browserCharts,
    /data\/proposal-history|updateProposalChartLivePoint/,
  );
  assert.match(relay, /DATA_NOT_AVAILABLE_FROM_01RESOLVED/);
});

test('pull requests run a least-privilege Node 24 release gate', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  assert.match(workflow, /^\s*pull_request:\s*$/m);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\./);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /node-version: 24/);
  assert.match(
    workflow,
    /actions\/checkout@[a-f0-9]{40}\s+# v6\.0\.2/,
  );
  assert.match(
    workflow,
    /actions\/setup-node@[a-f0-9]{40}\s+# v6\.3\.0/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --fund=false/);
  assert.match(workflow, /npm run check:ci/);
  assert.match(workflow, /npm ci --ignore-scripts --omit=optional --no-audit --fund=false/);
  assert.match(workflow, /npm ls --all/);
  assert.match(workflow, /npm sbom --sbom-format cyclonedx --omit=optional/);
  assert.match(
    workflow,
    /actions\/upload-artifact@[a-f0-9]{40}\s+# v7\.0\.1/,
  );
  assert.match(
    workflow,
    /actions\/dependency-review-action@[a-f0-9]{40}\s+# v5\.0\.0/,
  );
  assert.match(workflow, /fail-on-severity: high/);
  assert.equal(
    packageJson.scripts['check:supply-chain'],
    'npm audit --audit-level=high && npm audit signatures',
  );
});

test('repository governance assigns sensitive code and a private reporting path', () => {
  const owners = fs.readFileSync('.github/CODEOWNERS', 'utf8');
  const security = fs.readFileSync('SECURITY.md', 'utf8');
  const contributing = fs.readFileSync('CONTRIBUTING.md', 'utf8');

  assert.match(owners, /^\* @FewGoodCoins$/m);
  assert.match(owners, /^\/api\/ @FewGoodCoins$/m);
  assert.match(owners, /^\/src\/markets\/ @FewGoodCoins$/m);
  assert.match(owners, /^\/packages\/contracts\/ @FewGoodCoins$/m);
  assert.match(owners, /^\/\.github\/workflows\/ @FewGoodCoins$/m);
  assert.match(security, /security\/advisories\/new/);
  assert.match(security, /Do not open a public issue/);
  assert.match(contributing, /Node\.js 24/);
  assert.match(contributing, /must never broadcast/);
});
