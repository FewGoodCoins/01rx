import assert from 'node:assert/strict';
import test from 'node:test';
import {
  default01rxDestination,
  installDefault01rxRoute,
} from '../src/core/default-route.js';

const PROPOSAL = '11111111111111111111111111111111';

function location(overrides = {}) {
  return {
    pathname: '/',
    search: '',
    hash: '',
    hostname: '01rx.test',
    ...overrides,
  };
}

function testWindow(locationOverrides = {}, options = {}) {
  const calls = [];
  const self = {};
  const runtime = {
    document: {
      documentElement: {
        dataset: { ...(options.dataset || {}) },
      },
    },
    history: {
      replaceState(...args) {
        calls.push(args);
      },
    },
    location: location(locationOverrides),
    self,
    top: options.framed ? {} : self,
  };
  return { calls, runtime };
}

test('spot-market URLs canonicalize to one explicit route', () => {
  assert.equal(
    default01rxDestination(location()),
    '/?token=solo&view=markets&tab=tokens',
  );
  assert.equal(default01rxDestination(location({
    search: '?token=loyal&view=markets&tab=tokens',
  })), null);
  assert.equal(default01rxDestination(location({
    search: '?token=MetaDAO',
  })), '/?token=meta&view=markets&tab=tokens');
  assert.equal(default01rxDestination(location({
    search: `?token=loyal&view=markets&tab=tokens&proposal=${PROPOSAL}&filter=live`,
  })), '/?token=loyal&view=markets&tab=tokens');
});

test('decision-market URLs retain only validated decision state', () => {
  assert.equal(default01rxDestination(location({
    search: '?token=loyal&view=markets&tab=decisions',
  })), null);
  assert.equal(default01rxDestination(location({
    search: '?token=loyal&view=markets',
  })), '/?token=loyal&view=markets&tab=decisions');
  assert.equal(default01rxDestination(location({
    search: `?token=loyal&view=markets&proposal=${PROPOSAL}&filter=resolved&archive=1`,
  })), `/?token=loyal&view=markets&tab=decisions&proposal=${PROPOSAL}&filter=resolved`);
  assert.equal(default01rxDestination(location({
    search: '?token=loyal&view=markets&tab=decisions&filter=other',
  })), '/?token=loyal&view=markets&tab=decisions');
});

test('removed global market URLs always fall back to the canonical spot market', () => {
  assert.equal(default01rxDestination(location({
    search: '?view=markets&archive=1',
  })), '/?token=solo&view=markets&tab=tokens');
  assert.equal(default01rxDestination(location({
    search: `?view=markets&filter=live&proposal=${PROPOSAL}`,
  })), '/?token=solo&view=markets&tab=tokens');
  assert.equal(default01rxDestination(location({
    search: '?token=not%20valid&view=markets&tab=decisions',
  })), '/?token=solo&view=markets&tab=tokens');
});

test('embed URLs are canonical and cannot combine with workspace or frame modes', () => {
  assert.equal(default01rxDestination(location({
    pathname: '/embed',
    search: '?token=solo',
  })), null);
  assert.equal(default01rxDestination(location({
    search: '?embed=true&token=MetaDAO&view=markets&tab=decisions&frame=01rx&theme=dark&transparent=true&outlined=1&numfont=ibm',
  }), { embeddedFrame: true }), '/embed?token=meta&theme=dark&transparent=1&outlined=1&numfont=ibm');
  assert.equal(default01rxDestination(location({
    pathname: '/embed',
    search: '?view=markets&archive=1',
    hash: '#chart',
  })), '/embed?token=solo#chart');
});

test('chart-frame mode is accepted only inside an iframe with a valid token', () => {
  assert.equal(default01rxDestination(location({
    search: '?token=solo&frame=01rx',
  }), { embeddedFrame: true }), null);
  assert.equal(default01rxDestination(location({
    search: '?token=solo&frame=01rx',
  })), '/?token=solo&view=markets&tab=tokens');
  assert.equal(default01rxDestination(location({
    search: '?token=meta&frame=01rx&view=markets&tab=decisions&embed=0',
  }), { embeddedFrame: true }), '/?token=meta&frame=01rx');
  assert.equal(default01rxDestination(location({
    search: '?token=not%20valid&frame=01rx',
  }), { embeddedFrame: true }), '/?token=solo&view=markets&tab=tokens');
});

test('unknown and legacy application paths return to a canonical regular view', () => {
  assert.equal(default01rxDestination(location({
    pathname: '/something-unexpected',
  })), '/?token=solo&view=markets&tab=tokens');
  assert.equal(default01rxDestination(location({
    pathname: '/terminal',
    search: '?token=loyal&view=markets',
  })), '/?token=solo&view=markets&tab=tokens');
  assert.equal(default01rxDestination(location({
    pathname: '/something-unexpected',
    search: '?embed=1&token=loyal&frame=01rx&view=markets&tab=decisions',
  }), { embeddedFrame: true }), '/?token=solo&view=markets&tab=tokens');
  assert.equal(default01rxDestination(location({
    pathname: '/index.html',
    search: '?token=solo&view=markets&tab=tokens',
  })), '/?token=solo&view=markets&tab=tokens');
});

test('route installation uses the effective destination with simple window mocks', () => {
  const { calls, runtime } = testWindow({
    search: '?embed=1&token=MetaDAO&view=markets&tab=decisions&theme=dark',
    hash: '#chart',
  }, {
    dataset: {
      '01rxChartFrame': 'true',
      chartEngine: 'stale',
      defaultMarketSelection: 'legacy',
      marketBoot: 'pending',
      marketSidebarTab: 'all',
      workspace: 'markets',
    },
  });

  assert.equal(installDefault01rxRoute(runtime), true);
  assert.deepEqual(calls, [[
    null,
    '',
    '/embed?token=meta&theme=dark#chart',
  ]]);
  assert.deepEqual(runtime.document.documentElement.dataset, {
    embed: 'chart',
    embedTheme: 'dark',
  });
});

test('route installation clears stale embed and frame attributes for regular views', () => {
  const { calls, runtime } = testWindow({
    search: '?token=loyal&frame=01rx&numfont=inter',
  }, {
    dataset: {
      '01rxChartFrame': 'true',
      chartEngine: 'stale',
      embed: 'chart',
      embedOutlined: 'true',
      embedTheme: 'dark',
      embedTransparent: 'true',
      numfont: 'inter',
    },
  });

  assert.equal(installDefault01rxRoute(runtime), true);
  assert.deepEqual(calls, [[
    null,
    '',
    '/?token=loyal&view=markets&tab=tokens',
  ]]);
  assert.deepEqual(runtime.document.documentElement.dataset, {
    marketBoot: 'pending',
    marketSidebarTab: 'all',
    workspace: 'markets',
  });
});

test('route installation exposes only frame attributes for an iframe chart frame', () => {
  const { calls, runtime } = testWindow({
    search: '?token=solo&frame=01rx&view=markets&tab=tokens',
  }, {
    framed: true,
    dataset: {
      embed: 'chart',
      embedTheme: 'light',
      marketBoot: 'pending',
      workspace: 'markets',
    },
  });

  assert.equal(installDefault01rxRoute(runtime), true);
  assert.deepEqual(calls, [[null, '', '/?token=solo&frame=01rx']]);
  assert.deepEqual(runtime.document.documentElement.dataset, {
    '01rxChartFrame': 'true',
    chartEngine: 'liveline',
  });
});
