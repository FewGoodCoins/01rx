import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('01RX preserves explicit token, market, and embed routes', () => {
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
});
