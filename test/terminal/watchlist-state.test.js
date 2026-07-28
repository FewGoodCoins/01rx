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
    setItem(key, value) {
      values.set(key, String(value));
    },
    values,
  };
}

async function createController(options = {}) {
  const { normalizeTokenKey, normalizeTokenList } = await importShell('routes.js');
  const { createWatchlistController } = await importShell('watchlist.js');
  return createWatchlistController({
    normalizeTokenKey,
    normalizeTokenList,
    ...options,
  });
}

function legacyToggle(list, key) {
  const next = list.slice();
  const index = next.indexOf(key);
  if (index === -1) next.push(key);
  else next.splice(index, 1);
  return next;
}

function legacyReorder(list, visibleKeys) {
  const next = visibleKeys.slice();
  list.forEach((key) => {
    if (!visibleKeys.includes(key)) next.push(key);
  });
  return next;
}

function legacyMerge(localKeys, remoteKeys) {
  const next = localKeys.slice();
  remoteKeys.forEach((key) => {
    if (!next.includes(key)) next.push(key);
  });
  return next;
}

function createRemoteClient(remoteRows = []) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        delete() {
          calls.push(['delete']);
          return {
            eq(field, value) {
              calls.push(['eq', field, value]);
              return Promise.resolve({ data: null });
            },
          };
        },
        insert(rows) {
          calls.push(['insert', rows]);
          return Promise.resolve({ data: rows });
        },
        select(columns) {
          calls.push(['select', columns]);
          return {
            order(column) {
              calls.push(['order', column]);
              return Promise.resolve({ data: remoteRows });
            },
          };
        },
      };
    },
  };
}

test('watchlist state preserves legacy normalization, add/remove order, and deferred restore position', async () => {
  const storage = createStorage({
    navgator_watchlist: JSON.stringify([' METAdao ', 'solo', 'meta', 'bad token', 'FUTARIO']),
  });
  const watchlist = await createController({ storage });

  assert.deepEqual(watchlist.get(), ['meta', 'solo', 'futardio']);
  assert.equal(watchlist.has('METADAO'), true);
  assert.equal(watchlist.indexOf('SOLO'), 1);

  let expected = legacyToggle(watchlist.get(), 'super');
  assert.deepEqual(watchlist.toggle('SUPER').items, expected);
  const removed = watchlist.remove('solo');
  expected = legacyToggle(expected, 'solo');
  assert.equal(removed.index, 1);
  assert.deepEqual(removed.items, expected);

  const restored = watchlist.add('solo', removed.index);
  expected.splice(removed.index, 0, 'solo');
  assert.deepEqual(restored.items, expected);
  assert.equal(
    storage.getItem('navgator_watchlist'),
    JSON.stringify(expected),
  );

  const copy = watchlist.get();
  copy.reverse();
  assert.deepEqual(watchlist.get(), expected);
});

test('watchlist reorder exactly preserves visible DOM order then hidden saved entries', async () => {
  const original = ['super', 'solo', 'hidden', 'meta'];
  const storage = createStorage({ navgator_watchlist: JSON.stringify(original) });
  const watchlist = await createController({ storage });
  const visibleOrder = ['SOLO', 'super'];

  assert.deepEqual(
    watchlist.reorder(visibleOrder),
    legacyReorder(original, ['solo', 'super']),
  );
  assert.deepEqual(watchlist.get(), ['solo', 'super', 'hidden', 'meta']);

  const entries = [
    ['meta', { ticker: 'META' }],
    ['super', { ticker: 'SUPER' }],
    ['solo', { ticker: 'SOLO' }],
  ];
  assert.deepEqual(
    watchlist.selectEntries(entries).map((entry) => entry[0]),
    ['solo', 'super', 'meta'],
  );
});

test('watchlist remote merge keeps local order and appends normalized remote-only tokens', async () => {
  const local = ['solo', 'meta'];
  const storage = createStorage({ navgator_watchlist: JSON.stringify(local) });
  const watchlist = await createController({ storage });
  const client = createRemoteClient([
    { token_key: 'METAdao', position: 0 },
    { token_key: 'super', position: 1 },
    { token_key: 'FUTARIO', position: 2 },
    { token_key: 'super', position: 3 },
  ]);

  const merged = await watchlist.mergeRemote(client);
  const normalizedRemote = ['meta', 'super', 'futardio'];
  assert.deepEqual(merged, legacyMerge(local, normalizedRemote));
  assert.deepEqual(client.calls, [
    ['from', 'user_watchlists'],
    ['select', 'token_key, position'],
    ['order', 'position'],
  ]);
  assert.equal(storage.getItem('navgator_watchlist'), JSON.stringify(merged));
});

test('watchlist remote sync preserves delete-then-positioned-insert contract', async () => {
  const watchlist = await createController({
    storage: createStorage({ navgator_watchlist: JSON.stringify(['super', 'solo']) }),
  });
  const client = createRemoteClient();

  await watchlist.syncRemote(client, { id: 'user-1' });
  assert.deepEqual(client.calls, [
    ['from', 'user_watchlists'],
    ['delete'],
    ['eq', 'user_id', 'user-1'],
    ['from', 'user_watchlists'],
    ['insert', [
      { user_id: 'user-1', token_key: 'super', position: 0 },
      { user_id: 'user-1', token_key: 'solo', position: 1 },
    ]],
  ]);

  watchlist.replace([]);
  const emptyClient = createRemoteClient();
  await watchlist.syncRemote(emptyClient, { id: 'user-1' });
  assert.deepEqual(emptyClient.calls, [
    ['from', 'user_watchlists'],
    ['delete'],
    ['eq', 'user_id', 'user-1'],
  ]);
});

test('watchlist storage failures fall back safely while preserving in-memory ordering', async () => {
  const errors = [];
  const readFailure = await createController({
    onStorageError(error, operation) { errors.push([operation, error.message]); },
    storage: {
      getItem() { throw new Error('read denied'); },
      setItem() { throw new Error('write denied'); },
    },
  });

  assert.deepEqual(readFailure.get(), []);
  const added = readFailure.add('super');
  assert.equal(added.persisted, false);
  assert.deepEqual(added.items, ['super']);
  assert.deepEqual(errors, [
    ['read', 'read denied'],
    ['write', 'write denied'],
  ]);

  const corruptStorage = createStorage({ navgator_watchlist: '{not json' });
  const corrupt = await createController({ storage: corruptStorage });
  assert.deepEqual(corrupt.get(), []);
  assert.deepEqual(corrupt.toggle('solo').items, ['solo']);
});

test('public legacy watchlist facades delegate all storage ownership to the shell', () => {
  const appCore = fs.readFileSync('src/legacy/app-core.js', 'utf8');
  const landing = fs.readFileSync('src/legacy/landing.js', 'utf8');
  const tokenPage = fs.readFileSync('src/legacy/token-page.js', 'utf8');
  const legacySource = [appCore, landing, tokenPage].join('\n');

  assert.match(appCore, /function _getWatchlist\(\) \{\s+return _navgatorWatchlist\.get\(\);\s+\}/);
  assert.match(appCore, /function _setWatchlist\(list\) \{\s+return _navgatorWatchlist\.replace\(list\);\s+\}/);
  assert.match(landing, /window\.toggleWatchStar = function/);
  assert.match(landing, /_pendingUnstar/);
  assert.match(tokenPage, /window\.toggleRpWatchlist = function/);
  assert.match(tokenPage, /window\.toggleLeftWatchlist = function/);
  assert.equal(legacySource.includes('navgator_watchlist'), false);
  assert.doesNotMatch(legacySource, /localStorage\.(?:getItem|setItem)\([^)]*watchlist/i);
});
