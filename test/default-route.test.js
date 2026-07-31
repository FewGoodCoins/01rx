import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MARKET_SELECTION,
  default01rxDestination,
  installDefault01rxRoute,
} from '../src/core/default-route.js';

test('01RX opens ownership-token markets by default', () => {
  assert.equal(
    default01rxDestination({
      pathname: '/',
      search: '',
      hash: '',
    }),
    '/?token=solo&view=markets&tab=tokens',
  );
});

test('01RX redirects research routes while preserving market, chart-frame, and embed routes', () => {
  assert.equal(default01rxDestination({
    pathname: '/',
    search: '?token=loyal&view=markets&tab=decisions',
  }), null);
  assert.equal(default01rxDestination({
    pathname: '/',
    search: '?view=markets&archive=1',
  }), null);
  assert.equal(default01rxDestination({
    pathname: '/embed',
    search: '?token=solo',
  }), null);
  assert.equal(default01rxDestination({
    pathname: '/',
    search: '?token=solo&frame=01rx',
  }), null);
  assert.equal(default01rxDestination({
    pathname: '/',
    search: '?token=loyal',
  }), '/?token=loyal&view=markets&tab=tokens');
});

test('default route updates history without navigating away', () => {
  const calls = [];
  const runtime = {
    document: { documentElement: { dataset: {} } },
    history: {
      replaceState(...args) {
        calls.push(args);
      },
    },
    location: {
      pathname: '/',
      search: '',
      hash: '#chart',
    },
  };

  assert.equal(installDefault01rxRoute(runtime), true);
  assert.deepEqual(calls, [[
    null,
    '',
    '/?token=solo&view=markets&tab=tokens#chart',
  ]]);
  assert.equal(runtime.document.documentElement.dataset.workspace, 'markets');
  assert.equal(
    runtime.document.documentElement.dataset.defaultMarketSelection,
    DEFAULT_MARKET_SELECTION,
  );
});

test('an explicit token route keeps its spot-market selection', () => {
  const runtime = {
    document: { documentElement: { dataset: {} } },
    history: { replaceState() {} },
    location: {
      pathname: '/',
      search: '?token=loyal',
      hash: '',
    },
  };

  assert.equal(installDefault01rxRoute(runtime), true);
  assert.equal(
    runtime.document.documentElement.dataset.defaultMarketSelection,
    undefined,
  );
});
