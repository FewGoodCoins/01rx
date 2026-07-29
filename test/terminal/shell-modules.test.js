const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

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
  assert.equal(routes.homePageUrl(), '/');
  assert.equal(routes.tokenPageUrl(' METAdao '), '/?token=meta');
  assert.equal(routes.tokenPageUrl('bad token'), '/');
  assert.equal(routes.launchpadPageUrl('permission less'), '/?launchpad=permission+less');
  assert.equal(routes.launchpadPageUrl(''), '/');
  assert.equal(routes.queryPageUrl({ token: 'meta', mode: 'a b' }), '/?token=meta&mode=a+b');

  runtime.location.pathname = '/';
  assert.equal(routes.appRootPath(), '/');
});

test('panel controller pins both workspace rails open', async () => {
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

  assert.deepEqual(controller.state, { left: false, right: false });
  assert.equal(storage.getItem('navgator_left_panel_collapsed'), null);
  assert.equal(storage.getItem('navgator_right_panel_collapsed'), null);
  controller.refreshControls();
  assert.equal(bodyClasses.contains('left-panel-collapsed'), false);
  assert.equal(bodyClasses.contains('right-panel-collapsed'), false);
  assert.equal(leftButton.attributes.get('aria-expanded'), 'true');
  assert.equal(leftButton.attributes.get('aria-label'), 'Collapse left panel');
  assert.equal(leftButton.title, 'Collapse left panel');
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

  controller.togglePanel('middle');
  assert.equal(timers.length, 0);
});

test('all-token navigation preserves view, URL, title, breadcrumb, and lifecycle callbacks', async () => {
  const { createShellNavigation } = await importShell('navigation.js');
  const launchpadLabel = { classList: createClassList(['tp-lp-active']) };
  const tokenItem = { classList: createClassList(['active']) };
  const landingView = { classList: createClassList() };
  const dashboardView = { classList: createClassList(['active']) };
  const bodyClasses = createClassList(['is-token', 'is-dashboard']);
  const calls = [];
  const runtime = {
    document: {
      body: { classList: bodyClasses },
      getElementById(id) {
        if (id === 'landing-view') return landingView;
        if (id === 'dashboard-view') return dashboardView;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '.tp-lp-sublabel') return [launchpadLabel];
        if (selector === '.tp-item') return [tokenItem];
        return [];
      },
      title: '',
    },
    history: {
      pushState(state, title, url) { calls.push(['history', state, title, url]); },
    },
    refreshHealthStatus() { calls.push(['health']); },
    scheduleHealthPolling() { calls.push(['schedule']); },
    setBreadcrumb(crumbs) { calls.push(['breadcrumb', crumbs]); },
    setLaunchpadFilter(value) { calls.push(['filter', value]); },
    stopTxPolling() { calls.push(['stop']); },
  };
  const navigation = createShellNavigation({
    routes: { homePageUrl: () => '/terminal/' },
    window: runtime,
  });

  navigation.navToAllTokens();
  assert.equal(launchpadLabel.classList.contains('tp-lp-active'), false);
  assert.equal(tokenItem.classList.contains('active'), false);
  assert.equal(landingView.classList.contains('active'), true);
  assert.equal(dashboardView.classList.contains('active'), false);
  assert.equal(bodyClasses.contains('is-token'), false);
  assert.equal(bodyClasses.contains('is-dashboard'), false);
  assert.equal(runtime.document.title, 'NAVgator - Treasury Analytics for Ownership Tokens');
  assert.deepEqual(calls[0], ['stop']);
  assert.deepEqual(calls[1], ['history', {}, '', '/terminal/']);
  assert.deepEqual(calls[2], ['breadcrumb', [{ label: 'All Tokens', current: true }]]);
  assert.deepEqual(calls.slice(3), [['filter', null], ['health'], ['schedule']]);
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
  assert.equal(bridge.routes.tokenPageUrl('METAdao'), '/?token=meta');
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
