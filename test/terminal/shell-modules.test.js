const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const shellRoot = path.resolve('src/shell');

function importShell(name) {
  return import(pathToFileURL(path.join(shellRoot, name)).href);
}

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values,
  };
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    contains(name) { return values.has(name); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : Boolean(force);
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    },
    values,
  };
}

function createButton() {
  const attributes = new Map();
  return {
    attributes,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    title: '',
  };
}

test('terminal layout exports stable panel IDs, sizing, and visual order', async () => {
  const {
    DEFAULT_DESKTOP_LAYOUT,
    TERMINAL_PANEL_IDS,
    terminalGridAreas,
    validateTerminalLayout,
  } = await importShell('terminal-layout.js');

  assert.deepEqual(TERMINAL_PANEL_IDS, {
    marketExplorer: 'market-explorer',
    marketSummary: 'market-summary',
    primaryMarket: 'primary-market',
    activity: 'activity',
    tradeTicket: 'trade-ticket',
    systemStatus: 'system-status',
    modal: 'modal',
  });
  assert.deepEqual(DEFAULT_DESKTOP_LAYOUT.columns, {
    explorer: '280px',
    primary: 'minmax(560px, 1fr)',
    ticket: '344px',
  });
  assert.equal(new Set(DEFAULT_DESKTOP_LAYOUT.order).size, 5);
  assert.equal(
    terminalGridAreas(DEFAULT_DESKTOP_LAYOUT),
    '"market-explorer market-summary market-summary" '
      + '"market-explorer primary-market trade-ticket" '
      + '"market-explorer activity trade-ticket"',
  );
  assert.throws(
    () => validateTerminalLayout({
      ...DEFAULT_DESKTOP_LAYOUT,
      order: ['market-explorer', 'market-explorer'],
    }),
    /order must be unique/,
  );
  assert.throws(
    () => validateTerminalLayout({
      ...DEFAULT_DESKTOP_LAYOUT,
      order: DEFAULT_DESKTOP_LAYOUT.order.slice(1),
    }),
    /include every workspace panel/,
  );
});

test('terminal shell creates unique stable regions in declarative DOM order and cleans up', async () => {
  const { createTerminalShell } = await importShell('terminal-shell.js');
  const { DEFAULT_DESKTOP_LAYOUT, TERMINAL_PANEL_IDS } = await importShell('terminal-layout.js');
  const dom = new JSDOM('<main id="root"></main>');
  const root = dom.window.document.getElementById('root');
  const shell = createTerminalShell({ root });

  const workspaceOrder = [...root.querySelectorAll(
    '.terminal-workspace-grid > [data-terminal-panel]',
  )].map(panel => panel.getAttribute('data-terminal-panel'));
  assert.deepEqual(workspaceOrder, DEFAULT_DESKTOP_LAYOUT.order);

  const allPanelIds = [...root.querySelectorAll('[data-terminal-panel]')]
    .map(panel => panel.getAttribute('data-terminal-panel'));
  assert.deepEqual(
    [...allPanelIds].sort(),
    Object.values(TERMINAL_PANEL_IDS).sort(),
  );
  Object.values(shell.panels).forEach(panel => assert.ok(panel));
  [
    'headerUpdated',
    'status',
    'rpcStatus',
    'programStatus',
    'slot',
    'marketListTitle',
    'marketCount',
    'statusFilters',
    'marketList',
    'pagination',
    'marketChartHeader',
    'marketChart',
    'ownershipAccount',
    'marketStage',
    'tradeTicket',
    'marketContext',
    'positions',
    'modal',
    'walletStatus',
    'search',
  ].forEach(name => assert.ok(shell.regions[name], name));

  shell.setStatus('warning', 'Live reads are degraded.');
  assert.equal(shell.regions.status.dataset.state, 'warning');
  assert.equal(shell.regions.status.textContent, 'Live reads are degraded.');

  shell.destroy();
  assert.equal(root.childElementCount, 0);
  dom.window.close();
});

test('terminal shell honors a configured panel order and portals the token explorer once', async () => {
  const { createTerminalShell } = await importShell('terminal-shell.js');
  const { DEFAULT_DESKTOP_LAYOUT } = await importShell('terminal-layout.js');
  const dom = new JSDOM(
    '<aside id="explorer" class="terminal-panel-external" data-terminal-panel="legacy-panel"></aside>'
      + '<main id="root"></main>',
  );
  const root = dom.window.document.getElementById('root');
  const explorer = dom.window.document.getElementById('explorer');
  const layout = {
    ...DEFAULT_DESKTOP_LAYOUT,
    id: 'ticket-before-market-test',
    order: Object.freeze([
      'market-explorer',
      'market-summary',
      'trade-ticket',
      'primary-market',
      'activity',
    ]),
  };
  const shell = createTerminalShell({
    root,
    layout,
    mode: 'token',
    externalPanels: { marketExplorer: explorer },
  });

  const workspaceOrder = [...root.querySelectorAll(
    '.terminal-workspace-grid > [data-terminal-panel], '
      + '.terminal-workspace-grid > [data-terminal-compatibility-panel]',
  )].map(panel => panel.getAttribute('data-terminal-panel')
    || panel.getAttribute('data-terminal-compatibility-panel'));
  assert.deepEqual(workspaceOrder, layout.order);
  assert.equal(
    dom.window.document.querySelectorAll('[data-terminal-panel="market-explorer"]').length,
    1,
  );
  assert.equal(shell.panels.marketExplorer, explorer);
  assert.ok(shell.regions.marketList);
  assert.ok(shell.regions.search);

  shell.destroy();
  assert.equal(explorer.getAttribute('data-terminal-panel'), 'legacy-panel');
  assert.equal(explorer.classList.contains('terminal-panel-external'), true);
  assert.equal(root.childElementCount, 0);
  dom.window.close();
});

test('token normalization preserves aliases, validation, order, and deduplication', async () => {
  const { normalizeTokenKey, normalizeTokenList } = await importShell('routes.js');

  assert.equal(normalizeTokenKey('  METAdao '), 'meta');
  assert.equal(normalizeTokenKey('FUTARIO'), 'futardio');
  assert.equal(normalizeTokenKey('MTNDAO'), 'mtn');
  assert.equal(normalizeTokenKey('mtnCapital'), 'mtn');
  assert.equal(normalizeTokenKey('Ranger'), 'rngr');
  assert.equal(normalizeTokenKey('Token_Name-2'), 'token_name-2');
  assert.equal(normalizeTokenKey('not valid'), '');
  assert.equal(normalizeTokenKey(42), '');
  assert.deepEqual(
    normalizeTokenList([' META ', 'metadao', 'FUTARIO', '', null, 'solo', 'SOLO']),
    ['meta', 'futardio', 'solo'],
  );
  assert.deepEqual(normalizeTokenList('meta'), []);
});

test('route helpers canonicalize legacy terminal paths and preserve clean query encoding', async () => {
  const { createRouteHelpers } = await importShell('routes.js');
  const runtime = {
    URLSearchParams,
    location: { pathname: '/terminal/index.html' },
  };
  const routes = createRouteHelpers(runtime);

  assert.equal(routes.appRootPath(), '/');
  assert.equal(routes.homePageUrl(), '/?token=solo&view=markets&tab=tokens');
  assert.equal(routes.tokenPageUrl(' METAdao '), '/?token=meta&view=markets&tab=tokens');
  assert.equal(routes.tokenPageUrl('bad token'), '/?token=solo&view=markets&tab=tokens');
  assert.equal(routes.launchpadPageUrl('permission less'), '/?token=solo&view=markets&tab=tokens');
  assert.equal(routes.launchpadPageUrl(''), '/?token=solo&view=markets&tab=tokens');
  assert.equal(routes.queryPageUrl({ token: 'meta', mode: 'a b' }), '/?token=meta&mode=a+b');

  runtime.location.pathname = '/';
  assert.equal(routes.appRootPath(), '/');
});

test('panel controller persists the optional market explorer and keeps the right rail open', async () => {
  const { createShellPanelController } = await importShell('panels.js');
  const storage = createStorage({
    navgator_left_panel_collapsed: '1',
    navgator_right_panel_collapsed: '1',
  });
  const bodyClasses = createClassList();
  const leftButton = createButton();
  const rightButton = createButton();
  const timers = [];
  const events = [];
  let sparklineDraws = 0;
  class FakeEvent {
    constructor(type) { this.type = type; }
  }
  const runtime = {
    Event: FakeEvent,
    dispatchEvent(event) { events.push(event); },
    drawAllSparklines() { sparklineDraws += 1; },
  };
  const controller = createShellPanelController({
    Event: FakeEvent,
    document: {
      body: { classList: bodyClasses },
      getElementById(id) {
        if (id === 'left-panel-toggle') return leftButton;
        if (id === 'right-panel-toggle') return rightButton;
        return null;
      },
    },
    setTimeout(callback, ms) { timers.push({ callback, ms }); },
    storage,
    window: runtime,
  });

  assert.deepEqual(controller.state, { left: true, right: false });
  assert.equal(storage.getItem('navgator_left_panel_collapsed'), '1');
  assert.equal(storage.getItem('navgator_right_panel_collapsed'), null);
  controller.refreshControls();
  assert.equal(bodyClasses.contains('left-panel-collapsed'), true);
  assert.equal(bodyClasses.contains('right-panel-collapsed'), false);
  assert.equal(leftButton.attributes.get('aria-expanded'), 'false');
  assert.equal(leftButton.attributes.get('aria-label'), 'Show market explorer');
  assert.equal(leftButton.title, 'Show market explorer');
  assert.equal(rightButton.attributes.get('aria-expanded'), 'true');
  assert.equal(rightButton.attributes.get('aria-label'), 'Collapse right panel');
  assert.equal(rightButton.title, 'Collapse right panel');

  controller.togglePanel('right');
  assert.equal(controller.state.right, false);
  assert.equal(storage.getItem('navgator_right_panel_collapsed'), null);
  assert.equal(bodyClasses.contains('right-panel-collapsed'), false);
  assert.deepEqual(timers.map((timer) => timer.ms), []);
  timers.forEach((timer) => timer.callback());
  assert.deepEqual(events.map((event) => event.type), []);
  assert.equal(sparklineDraws, 0);

  assert.equal(controller.togglePanel('left'), false);
  assert.equal(controller.state.left, false);
  assert.equal(storage.getItem('navgator_left_panel_collapsed'), '0');
  assert.equal(bodyClasses.contains('left-panel-collapsed'), false);
  assert.equal(leftButton.attributes.get('aria-expanded'), 'true');
  assert.equal(leftButton.attributes.get('aria-label'), 'Hide market explorer');
  assert.deepEqual(timers.map((timer) => timer.ms), [40, 180]);
  timers.forEach((timer) => timer.callback());
  assert.deepEqual(events.map((event) => event.type), ['resize', 'resize']);
  assert.equal(sparklineDraws, 2);

  assert.equal(controller.togglePanel('left'), true);
  assert.equal(controller.state.left, true);
  assert.equal(storage.getItem('navgator_left_panel_collapsed'), '1');
  assert.equal(bodyClasses.contains('left-panel-collapsed'), true);
  assert.deepEqual(timers.map((timer) => timer.ms), [40, 180, 40, 180]);

  controller.togglePanel('middle');
  assert.equal(timers.length, 4);
});

test('market page exposes a dedicated explorer collapse control', () => {
  const source = fs.readFileSync('index.html', 'utf8');
  assert.match(source, /id="left-panel-toggle"/);
  assert.match(source, /aria-controls="app-left"/);
  assert.match(source, /onclick="toggleShellPanel\('left'\)"/);
});

test('all-token navigation hands off to the canonical ownership market', async () => {
  const { createShellNavigation } = await importShell('navigation.js');
  const calls = [];
  const runtime = {
    location: {
      assign(destination) {
        calls.push(destination);
      },
    },
  };
  const navigation = createShellNavigation({
    routes: {
      marketHomeUrl: () => '/?token=solo&view=markets&tab=tokens',
    },
    window: runtime,
  });

  navigation.navToAllTokens();
  assert.deepEqual(calls, ['/?token=solo&view=markets&tab=tokens']);
});

test('browser shell installs before classic boot and legacy globals remain thin facades', async () => {
  const { installBrowserShell } = await importShell('index.js');
  const storage = createStorage();
  const runtime = {
    Event: class FakeEvent {},
    URLSearchParams,
    document: {},
    localStorage: storage,
    location: { pathname: '/' },
    setTimeout() {},
  };
  const bridge = installBrowserShell(runtime);
  assert.equal(runtime.NAVGATOR.shell, bridge);
  assert.equal(bridge.routes.tokenPageUrl('METAdao'), '/?token=meta&view=markets&tab=tokens');
  assert.equal(bridge.panels.state.left, false);
  assert.equal(typeof bridge.navigation.navToAllTokens, 'function');
  assert.equal(typeof bridge.watchlist.toggle, 'function');
  assert.deepEqual(bridge.watchlist.get(), []);

  const facade = fs.readFileSync('src/legacy/app-core.js', 'utf8');
  const main = fs.readFileSync('src/main.js', 'utf8');
  assert.match(facade, /function _normalizeTokenKey\(key\) \{\s+return _navgatorShell\.routes\.normalizeTokenKey\(key\);\s+\}/);
  assert.match(facade, /function navToAllTokens\(\) \{\s+return _navgatorShell\.navigation\.navToAllTokens\(\);\s+\}/);
  assert.match(facade, /window\.toggleShellPanel = function\(side\) \{\s+return _navgatorShell\.panels\.togglePanel\(side\);\s+\};/);
  assert.equal(facade.includes("localStorage.getItem('navgator_right_panel_collapsed')"), false);
  assert.ok(main.indexOf('installBrowserShell(window);') < main.indexOf('bootLegacyApplication();'));
});
