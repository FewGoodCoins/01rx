const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const controllerUrl = pathToFileURL(path.resolve('src/token/token-controller.js')).href;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

test('TokenController latest load wins when an older response resolves last', async () => {
  const { TokenController } = await import(controllerUrl);
  const pending = { solo: deferred(), super: deferred() };
  const commits = [];
  let soloSignal = null;
  const controller = new TokenController();
  controller.setLoader(async (token, context) => {
    if (token === 'solo') soloSignal = context.signal;
    const value = await pending[token].promise;
    context.commit(() => commits.push(`${token}:${value}`));
    return value;
  });

  const soloLoad = controller.load('solo');
  assert.ok(soloSignal);
  const superLoad = controller.load('super');
  assert.equal(soloSignal.aborted, true);
  assert.equal(controller.activeToken, 'super');

  pending.super.resolve('new');
  assert.equal(await superLoad, 'new');
  pending.solo.resolve('old');
  assert.equal(await soloLoad, undefined);
  assert.deepEqual(commits, ['super:new']);
  assert.equal(controller.isLoading, false);
});

test('TokenController aborts superseded request work without rejecting the legacy caller', async () => {
  const { TokenController } = await import(controllerUrl);
  const aborted = [];
  const controller = new TokenController();
  controller.setLoader((token, context) => {
    if (token === 'super') return Promise.resolve('super-ready');
    return new Promise((resolve, reject) => {
      context.signal.addEventListener('abort', () => {
        aborted.push(token);
        const error = new Error('aborted');
        error.name = 'AbortError';
        error.cancelled = true;
        reject(error);
      }, { once: true });
    });
  });

  const first = controller.load('solo');
  const second = controller.load('super');
  assert.equal(await first, undefined);
  assert.equal(await second, 'super-ready');
  assert.deepEqual(aborted, ['solo']);
});

test('TokenController cleans token timers, listeners, and registered teardown before the next load', async () => {
  const { TokenController } = await import(controllerUrl);
  const timerCallbacks = new Map();
  const intervalCallbacks = new Map();
  const clearedTimeouts = [];
  const clearedIntervals = [];
  const removedListeners = [];
  const target = {
    addEventListener(type, listener, options) {
      this.listener = { listener, options, type };
    },
    removeEventListener(type, listener, options) {
      removedListeners.push({ listener, options, type });
    },
  };
  let nextTimer = 1;
  let teardownCount = 0;
  const controller = new TokenController({
    clearInterval(id) { clearedIntervals.push(id); intervalCallbacks.delete(id); },
    clearTimeout(id) { clearedTimeouts.push(id); timerCallbacks.delete(id); },
    setInterval(callback) {
      const id = nextTimer++;
      intervalCallbacks.set(id, callback);
      return id;
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timerCallbacks.set(id, callback);
      return id;
    },
  });
  controller.setLoader((token, context) => {
    if (token === 'solo') {
      context.listen(target, 'resize', () => {}, { passive: true });
      context.setTimeout(() => {}, 40);
      context.setInterval(() => {}, 1000);
      context.onCleanup(() => { teardownCount += 1; });
    }
    return Promise.resolve(token);
  });

  await controller.load('solo');
  assert.equal(removedListeners.length, 0);
  assert.equal(timerCallbacks.size, 1);
  assert.equal(intervalCallbacks.size, 1);

  await controller.load('super');
  assert.equal(removedListeners.length, 1);
  assert.equal(removedListeners[0].type, 'resize');
  assert.equal(removedListeners[0].listener, target.listener.listener);
  assert.deepEqual(clearedTimeouts, [1]);
  assert.deepEqual(clearedIntervals, [2]);
  assert.equal(teardownCount, 1);
});

test('TokenController cleans failed loader resources and clears the active load', async () => {
  const { TokenController } = await import(controllerUrl);
  let teardownCount = 0;
  let clearedInterval = null;
  const controller = new TokenController({
    clearInterval(id) { clearedInterval = id; },
    setInterval() { return 77; },
  });
  controller.setLoader(async (_token, context) => {
    context.setInterval(() => {}, 1000);
    context.onCleanup(() => { teardownCount += 1; });
    throw new Error('load failed');
  });

  await assert.rejects(controller.load('solo'), /load failed/);
  assert.equal(clearedInterval, 77);
  assert.equal(teardownCount, 1);
  assert.equal(controller.activeToken, '');
  assert.equal(controller.isLoading, false);
});

test('browser bridge exposes one controller-owned load action before classic scripts', async () => {
  const { installBrowserTokenController } = await import(controllerUrl);
  const runtime = {
    AbortController,
    NAVGATOR: {
      shell: {
        routes: {
          homePageUrl: () => '/',
          normalizeTokenKey: (token) => String(token || '').trim().toLowerCase(),
        },
      },
    },
    clearInterval,
    clearTimeout,
    location: { href: 'https://navgator.xyz/?token=solo' },
    setInterval,
    setTimeout,
  };
  const controller = installBrowserTokenController(runtime);
  controller.setLoader(async (token) => token);

  assert.equal(runtime.NAVGATOR.tokenController, controller);
  assert.equal(await runtime.NAVGATOR.actions.loadToken(' SUPER '), 'super');
  assert.equal(runtime._loadingToken, false);

  const tokenRuntimeSource = fs.readFileSync('src/token/runtime.js', 'utf8');
  assert.match(tokenRuntimeSource, /installBrowserTokenController\(browserWindow\);/);
});
