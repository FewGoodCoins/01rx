const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pageEntryModulePromise = import('../../src/core/page-entry.js');
const shellRoutesModulePromise = import('../../src/shell/routes.js');
const tokenRuntimeModulePromise = import('../../src/token/runtime.js');

function createRuntime(search, normalizeTokenKey) {
  return {
    URLSearchParams,
    location: { search },
    NAVGATOR: {
      shell: {
        routes: { normalizeTokenKey },
      },
    },
  };
}

test('page entry loader imports only the module selected by normalized route state', async () => {
  const { createPageEntryLoader, resolvePageKind } = await pageEntryModulePromise;
  const { normalizeTokenKey } = await shellRoutesModulePromise;
  const imports = [];
  const homeEntry = { pageKind: 'home' };
  const tokenEntry = { pageKind: 'token' };
  const loadPageEntry = createPageEntryLoader({
    importHome: async () => {
      imports.push('home');
      return homeEntry;
    },
    importToken: async () => {
      imports.push('token');
      return tokenEntry;
    },
  });

  const homeRuntime = createRuntime('?launchpad=permissionless', normalizeTokenKey);
  assert.equal(resolvePageKind(homeRuntime), 'home');
  assert.equal(await loadPageEntry(homeRuntime), homeEntry);
  assert.deepEqual(imports, ['home']);

  imports.length = 0;
  const tokenRuntime = createRuntime('?token=MetaDAO', normalizeTokenKey);
  assert.equal(resolvePageKind(tokenRuntime), 'token');
  assert.equal(await loadPageEntry(tokenRuntime), tokenEntry);
  assert.deepEqual(imports, ['token']);

  imports.length = 0;
  const invalidRuntime = createRuntime('?token=not%20valid', normalizeTokenKey);
  assert.equal(await loadPageEntry(invalidRuntime), homeEntry);
  assert.deepEqual(imports, ['home']);
});

test('terminal route detection accepts canonical and built index paths only', async () => {
  const { isFutarchyTerminalPath } = await pageEntryModulePromise;

  assert.equal(isFutarchyTerminalPath('/terminal'), true);
  assert.equal(isFutarchyTerminalPath('/terminal/'), true);
  assert.equal(isFutarchyTerminalPath('/terminal/index.html'), true);
  assert.equal(isFutarchyTerminalPath('/'), false);
  assert.equal(isFutarchyTerminalPath('/terminal-markets'), false);
});

test('route helpers keep every token URL inside the 01RX market workspace', async () => {
  const { createRouteHelpers } = await shellRoutesModulePromise;
  const proposal = '11111111111111111111111111111111';
  const runtime = {
    URLSearchParams,
    location: {
      pathname: '/',
      search: '',
    },
  };
  const routes = createRouteHelpers(runtime);

  assert.equal(routes.homePageUrl(), '/');
  assert.equal(routes.marketDiscoveryUrl(), '/?view=markets&archive=1');
  assert.equal(routes.marketHomeUrl(), '/?token=solo&view=markets&tab=tokens');
  assert.equal(
    routes.marketDiscoveryUrl({ filter: 'resolved', proposal }),
    `/?view=markets&archive=1&filter=resolved&proposal=${proposal}`,
  );
  assert.equal(routes.tokenResearchUrl('MetaDAO'), '/?token=meta&view=markets&tab=tokens');
  assert.equal(
    routes.tokenMarketUrl('MetaDAO', proposal),
    `/?token=meta&view=markets&proposal=${proposal}`,
  );
  assert.equal(routes.tokenMarketUrl('not valid', proposal), '/?view=markets&archive=1');
  assert.equal(routes.tokenTradingUrl('MetaDAO'), '/?token=meta&view=markets&tab=tokens');
  assert.equal(
    routes.tokenTradingUrl('not valid'),
    '/?token=solo&view=markets&tab=tokens',
  );

  runtime.location.search = '?token=meta&view=markets';
  assert.equal(routes.tokenPageUrl('Umbra'), '/?token=umbra&view=markets&tab=tokens');
  runtime.location.search = '?token=meta';
  assert.equal(routes.tokenPageUrl('Umbra'), '/?token=umbra&view=markets&tab=tokens');
});

test('legacy terminal URLs resolve route helpers against the canonical app root', async () => {
  const { createRouteHelpers } = await shellRoutesModulePromise;
  const routes = createRouteHelpers({
    URLSearchParams,
    location: {
      pathname: '/terminal',
      search: '?proposal=11111111111111111111111111111111',
    },
  });

  assert.equal(routes.appRootPath(), '/');
  assert.equal(routes.marketDiscoveryUrl(), '/?view=markets&archive=1');
});

test('token runtime installs models, controller, and the actions bridge together', async () => {
  const { installBrowserTokenPage } = await tokenRuntimeModulePromise;
  const existingAction = () => {};
  const runtime = {
    AbortController,
    NAVGATOR: {
      actions: { existingAction },
      shell: {
        routes: {
          homePageUrl: () => '/',
          normalizeTokenKey: value => String(value || '').trim().toLowerCase(),
        },
      },
    },
    clearInterval() {},
    clearTimeout() {},
    location: { href: 'https://navgator.xyz/?token=meta' },
    setInterval() {},
    setTimeout() {},
  };

  const bridge = installBrowserTokenPage(runtime);

  assert.equal(runtime.NAVGATOR.token.chartData, bridge.chartData);
  assert.equal(runtime.NAVGATOR.token.navModel, bridge.navModel);
  assert.equal(runtime.NAVGATOR.token.proposalModel, bridge.proposalModel);
  assert.equal(runtime.NAVGATOR.tokenController, bridge.tokenController);
  assert.equal(runtime.NAVGATOR.actions.existingAction, existingAction);
  assert.equal(typeof runtime.NAVGATOR.actions.loadToken, 'function');
});

test('page boot installs compatibility globals before preserving classic script order', async () => {
  const { bootPageApplication } = await pageEntryModulePromise;
  const events = [];
  const runtime = { NAVGATOR: {} };
  const pageEntry = {
    installBrowserPage(browserWindow) {
      events.push('install-token-entry');
      browserWindow.NAVGATOR.actions = { loadToken() {} };
    },
    async loadLegacyPage({ loadClassicScript }) {
      await loadClassicScript('/landing.js');
      await loadClassicScript('/token-page.js');
    },
  };

  await bootPageApplication({
    appCoreUrl: '/app-core.js',
    browserWindow: runtime,
    async loadClassicScript(url) {
      if (url === '/token-page.js') {
        assert.equal(typeof runtime.NAVGATOR.actions.loadToken, 'function');
      }
      events.push(url);
    },
    async loadPageEntry() {
      events.push('import-token-entry');
      return pageEntry;
    },
  });

  assert.deepEqual(events, [
    'import-token-entry',
    'install-token-entry',
    '/app-core.js',
    '/landing.js',
    '/token-page.js',
  ]);
});

test('source dependency boundaries keep token code out of the home entrypoint', () => {
  const document = fs.readFileSync('index.html', 'utf8');
  const main = fs.readFileSync('src/main.js', 'utf8');
  const pageEntry = fs.readFileSync('src/core/page-entry.js', 'utf8');
  const homeEntry = fs.readFileSync('src/home/index.js', 'utf8');
  const tokenEntry = fs.readFileSync('src/token/index.js', 'utf8');
  const marketController = fs.readFileSync(
    'src/markets/decision-market-controller.js',
    'utf8',
  );
  const tokenRuntime = fs.readFileSync('src/token/runtime.js', 'utf8');

  assert.doesNotMatch(main, /from ['"]\.\/token\//);
  assert.match(pageEntry, /import\('\.\.\/home\/index\.js'\)/);
  assert.match(pageEntry, /import\('\.\.\/token\/index\.js'\)/);
  assert.doesNotMatch(homeEntry, /token-page|token\/(?:chart-data|nav-model|proposal-model|token-controller)/);
  assert.match(tokenEntry, /token-page\.js\?url/);
  assert.match(tokenEntry, /import\('lightweight-charts'\)/);
  assert.doesNotMatch(document, /unpkg\.com\/lightweight-charts/);
  assert.match(homeEntry, /\.\.\/markets\/decision-market-controller\.js/);
  assert.match(tokenEntry, /\.\.\/markets\/decision-market-controller\.js/);
  assert.doesNotMatch(marketController, /(?:\.\.\/home\/|\.\.\/token\/)/);
  assert.match(tokenRuntime, /\.\/chart-data\.js/);
  assert.match(tokenRuntime, /\.\/nav-model\.js/);
  assert.match(tokenRuntime, /\.\/proposal-model\.js/);
  assert.match(tokenRuntime, /\.\/token-controller\.js/);
  assert.match(main, /window\.NAVGATOR\.ready = bootLegacyApplication\(\);/);
  assert.match(main, /window\.NAVGATOR\.ready\.catch/);
  assert.match(main, /installBrowserEmbed\(window\)/);
});
