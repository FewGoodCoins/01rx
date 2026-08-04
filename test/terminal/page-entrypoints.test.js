const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const pageEntryModulePromise = import('../../src/core/page-entry.js');
const defaultRouteModulePromise = import('../../src/core/default-route.js');
const marketBootModulePromise = import('../../src/core/market-boot.js');
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

test('market boot guard stays scoped to market routes and clears only after render', async () => {
  const {
    failMarketWorkspaceBoot,
    markMarketWorkspacePending,
    revealMarketWorkspace,
  } = await marketBootModulePromise;
  const attributes = new Map();
  const root = {
    dataset: { workspace: 'markets' },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
  const document = { documentElement: root };

  markMarketWorkspacePending(document);
  assert.equal(attributes.get('data-market-boot'), 'pending');
  failMarketWorkspaceBoot(document);
  assert.equal(attributes.get('data-market-boot'), 'error');
  revealMarketWorkspace(document);
  assert.equal(attributes.has('data-market-boot'), false);

  root.dataset.workspace = 'research';
  markMarketWorkspacePending(document);
  assert.equal(attributes.has('data-market-boot'), false);
});

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

  const homeRuntime = createRuntime('', normalizeTokenKey);
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

test('every canonical application surface selects the token page entrypoint', async () => {
  const { default01rxDestination } = await defaultRouteModulePromise;
  const { resolvePageKind } = await pageEntryModulePromise;
  const { normalizeTokenKey } = await shellRoutesModulePromise;
  const canonicalLocations = [
    {
      pathname: '/',
      search: '?token=solo&view=markets&tab=tokens',
    },
    {
      pathname: '/',
      search: '?token=meta&view=markets&tab=decisions',
    },
    {
      pathname: '/embed',
      search: '?token=solo',
    },
    {
      pathname: '/',
      search: '?token=solo&frame=01rx',
      options: { embeddedFrame: true },
    },
  ];

  canonicalLocations.forEach(({ options, ...route }) => {
    assert.equal(default01rxDestination(route, options), null);
    assert.equal(
      resolvePageKind(createRuntime(route.search, normalizeTokenKey)),
      'token',
    );
  });

  const unknownDestination = default01rxDestination({
    pathname: '/unexpected-page',
    search: '',
  });
  const canonicalUnknown = new URL(unknownDestination, 'https://01rx.test');
  assert.equal(canonicalUnknown.pathname, '/');
  assert.equal(
    resolvePageKind(createRuntime(canonicalUnknown.search, normalizeTokenKey)),
    'token',
  );
});

test('market token entry installs its ESM sidebar without loading legacy page assets', async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const hadDocument = Object.hasOwn(globalThis, 'document');
  const doms = [];

  function createBrowserWindow(search) {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="tlp-all-list"></div>
      <span id="tp-token-count"></span>
      <span id="tp-token-secondary-label"></span>
    </body></html>`, {
      url: `https://onrx.trade/${search}`,
    });
    doms.push(dom);
    const browserWindow = dom.window;
    browserWindow.NAVGATOR = {
      projectMetadata: {
        meta: { live: true, name: 'MetaDAO', ticker: 'META' },
        retired: { live: false, name: 'Retired', ticker: 'OLD' },
        solo: { live: true, name: 'SolanaFloor', ticker: 'SOLO' },
      },
      shell: {
        routes: {
          homePageUrl: () => '/?token=solo&view=markets&tab=tokens',
          marketHomeUrl: () => '/?token=solo&view=markets&tab=tokens',
          normalizeProposalAddress: value => String(value || '').trim(),
          normalizeTokenKey: value => String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, ''),
          tokenMarketUrl: token => `/?token=${token}&view=markets&tab=decisions`,
          tokenTradingUrl: token => `/?token=${token}&view=markets&tab=tokens`,
        },
      },
    };
    return browserWindow;
  }

  try {
    const { installBrowserPage, loadLegacyPage } = await vite.ssrLoadModule(
      '/src/token/index.js',
    );
    const marketWindow = createBrowserWindow('?token=solo&view=markets&tab=tokens');
    installBrowserPage(marketWindow);
    assert.equal(
      typeof marketWindow.NAVGATOR.marketTokenSidebar?.hydrateCurrentNav,
      'function',
    );
    assert.equal(
      marketWindow.document.querySelectorAll('#tlp-all-list .tp-item').length,
      2,
    );
    assert.equal(
      marketWindow.document.getElementById('tp-token-count').textContent,
      '2 tokens live',
    );

    globalThis.window = marketWindow;
    globalThis.document = marketWindow.document;
    const classicLoads = [];
    await loadLegacyPage({
      async loadClassicScript(url) {
        classicLoads.push(url);
      },
    });
    assert.deepEqual(classicLoads, []);

    const researchWindow = createBrowserWindow('?token=solo');
    installBrowserPage(researchWindow);
    assert.equal(researchWindow.NAVGATOR.marketTokenSidebar, undefined);
    assert.equal(
      researchWindow.document.querySelectorAll('#tlp-all-list .tp-item').length,
      0,
    );
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
    if (hadDocument) globalThis.document = previousDocument;
    else delete globalThis.document;
    doms.forEach(dom => dom.window.close());
    await vite.close();
  }
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

  assert.equal(routes.homePageUrl(), '/?token=solo&view=markets&tab=tokens');
  assert.equal(routes.marketHomeUrl(), '/?token=solo&view=markets&tab=tokens');
  assert.equal(
    routes.tokenMarketUrl('MetaDAO', proposal),
    `/?token=meta&view=markets&tab=decisions&proposal=${proposal}`,
  );
  assert.equal(
    routes.tokenMarketUrl('not valid', proposal),
    '/?token=solo&view=markets&tab=tokens',
  );
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
  assert.equal(routes.marketHomeUrl(), '/?token=solo&view=markets&tab=tokens');
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
  assert.equal(runtime.NAVGATOR.token.launchpadSections, bridge.launchpadSections);
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
  const marketStyles = fs.readFileSync('styles/futard-terminal.css', 'utf8');
  const tokenRuntime = fs.readFileSync('src/token/runtime.js', 'utf8');

  assert.doesNotMatch(main, /from ['"]\.\/token\//);
  assert.match(pageEntry, /import\('\.\.\/home\/index\.js'\)/);
  assert.match(pageEntry, /import\('\.\.\/token\/index\.js'\)/);
  assert.doesNotMatch(homeEntry, /token-page|token\/(?:chart-data|nav-model|proposal-model|token-controller)/);
  assert.match(tokenEntry, /token-page\.js\?url/);
  assert.match(tokenEntry, /installBrowserLivelineCharts/);
  assert.doesNotMatch(tokenEntry, /lightweight-charts/);
  assert.doesNotMatch(tokenEntry, /proposal-history-chart\.js/);
  assert.doesNotMatch(homeEntry, /proposal-history-chart\.js/);
  assert.match(tokenEntry, /proposal-history-liveline\.js/);
  assert.doesNotMatch(homeEntry, /proposal-history-liveline\.js/);
  assert.doesNotMatch(document, /unpkg\.com\/lightweight-charts/);
  assert.doesNotMatch(homeEntry, /\.\.\/markets\/decision-market-controller\.js/);
  assert.match(tokenEntry, /\.\.\/markets\/decision-market-controller\.js/);
  assert.doesNotMatch(homeEntry, /revealMarketWorkspace|is-market-discovery|mode: 'discovery'/);
  assert.match(tokenEntry, /revealMarketWorkspace\(document\)/);
  assert.ok(
    tokenEntry.indexOf('await window.NAVGATOR.marketWorkspace.ready')
      < tokenEntry.indexOf('revealMarketWorkspace(document)'),
    'token decision markets must remain guarded until their first data-backed render',
  );
  assert.match(
    document,
    /id="critical-paint"[\s\S]+html\[data-workspace="markets"\] \.dash-body\s*\{[\s\S]+display:\s*none !important;/,
  );
  assert.doesNotMatch(marketController, /(?:\.\.\/home\/|\.\.\/token\/)/);
  assert.match(
    marketStyles,
    /\.ft-ownership-chart-header\s*\{\s*border:\s*0;\s*border-bottom:\s*1px solid #343636;/,
  );
  assert.match(
    marketStyles,
    /\.ft-ownership-market \.ft-terminal-grid\s*\{\s*gap:\s*0;/,
  );
  assert.match(
    marketStyles,
    /data-01rx-chart-frame="true"[\s\S]+\.chart-section\s*\{[\s\S]+border:\s*0 !important;[\s\S]+box-shadow:\s*none !important;/,
  );
  assert.match(
    marketStyles,
    /data-01rx-chart-frame="true"[\s\S]+\.chart-topbar\s*\{[\s\S]+border-bottom:\s*1px solid #292929 !important;/,
  );
  assert.match(
    marketStyles,
    /\.ft-ownership-transactions-header\s*\{[\s\S]+height:\s*42px;[\s\S]+border-bottom-color:\s*#292929;/,
  );
  assert.match(
    marketStyles,
    /\.token-board-grid \.chart-body::before\s*\{[\s\S]+width:\s*42px;[\s\S]+border-right:\s*1px solid #292929;[\s\S]+background:\s*#101010;/,
  );
  assert.match(tokenRuntime, /\.\/chart-data\.js/);
  assert.match(tokenRuntime, /\.\/nav-model\.js/);
  assert.match(tokenRuntime, /\.\/proposal-model\.js/);
  assert.match(tokenRuntime, /\.\/token-controller\.js/);
  assert.match(main, /window\.NAVGATOR\.ready = bootLegacyApplication\(\);/);
  assert.match(main, /window\.NAVGATOR\.ready\.catch/);
  assert.match(main, /installBrowserEmbed\(window\)/);
});

test('market sidebar places persistent live, past, and token sections in order', () => {
  const document = fs.readFileSync('index.html', 'utf8');
  const appCore = fs.readFileSync('src/legacy/app-core.js', 'utf8');
  const liveDecisions = document.indexOf('id="tlp-decisions-panel"');
  const pastDecisions = document.indexOf('id="tlp-past-decisions-panel"');
  const tokens = document.indexOf('id="tlp-all-panel"');

  assert.ok(liveDecisions >= 0);
  assert.ok(pastDecisions > liveDecisions);
  assert.ok(tokens > pastDecisions);
  assert.match(
    document,
    /tp-unified-section-toggle-live[\s\S]+aria-label="Collapse live markets"[\s\S]+M1 4L4 1L7 4/,
  );
  assert.match(
    document,
    /tp-unified-section-toggle-past[\s\S]+aria-label="Collapse past markets"[\s\S]+M1 4L4 1L7 4/,
  );
  assert.match(
    document,
    /tp-unified-section-toggle-tokens[\s\S]+aria-label="Collapse tokens"[\s\S]+M1 4L4 1L7 4/,
  );
  assert.match(appCore, /toggleMarketSidebarSection[\s\S]+classList\.toggle\('is-collapsed'\)/);
});
