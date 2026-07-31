export const WATCHLIST_STORAGE_KEY = 'navgator_watchlist';

function parseStoredList(value, normalizeTokenList) {
  if (value == null) return [];
  try {
    const parsed = JSON.parse(value);
    return normalizeTokenList(parsed == null ? [] : parsed);
  } catch (_error) {
    return [];
  }
}

export function createWatchlistController(options = {}) {
  const runtime = options.window || globalThis.window;
  const normalizeTokenKey = options.normalizeTokenKey;
  const normalizeTokenList = options.normalizeTokenList;
  const onStorageError = typeof options.onStorageError === 'function'
    ? options.onStorageError
    : () => {};
  const listeners = new Set();
  let storage = options.storage;
  if (!storage && runtime) {
    try {
      storage = runtime.localStorage;
    } catch (error) {
      onStorageError(error, 'read');
    }
  }

  function readStorage() {
    if (!storage) return [];
    try {
      return parseStoredList(storage.getItem(WATCHLIST_STORAGE_KEY), normalizeTokenList);
    } catch (error) {
      onStorageError(error, 'read');
      return [];
    }
  }

  let items = readStorage();

  function get() {
    return items.slice();
  }

  function notify() {
    const snapshot = get();
    listeners.forEach((listener) => listener(snapshot));
  }

  function persist() {
    if (!storage) return false;
    try {
      storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (error) {
      onStorageError(error, 'write');
      return false;
    }
  }

  function commit(nextItems) {
    items = normalizeTokenList(nextItems);
    const persisted = persist();
    notify();
    return { items: get(), persisted };
  }

  function result(key, index, watched, changed, persisted = true) {
    return {
      changed,
      index,
      items: get(),
      key,
      persisted,
      watched,
    };
  }

  function indexOf(key) {
    const normalized = normalizeTokenKey(key);
    return normalized ? items.indexOf(normalized) : -1;
  }

  function has(key) {
    return indexOf(key) !== -1;
  }

  function replace(nextItems) {
    return commit(nextItems).items;
  }

  function add(key, requestedIndex) {
    const normalized = normalizeTokenKey(key);
    if (!normalized) return result('', -1, false, false);
    const existingIndex = items.indexOf(normalized);
    if (existingIndex !== -1) return result(normalized, existingIndex, true, false);

    const next = items.slice();
    const numericIndex = Number(requestedIndex);
    const insertionIndex = Number.isFinite(numericIndex)
      ? Math.max(0, Math.min(next.length, Math.trunc(numericIndex)))
      : next.length;
    next.splice(insertionIndex, 0, normalized);
    const committed = commit(next);
    return result(normalized, insertionIndex, true, true, committed.persisted);
  }

  function remove(key) {
    const normalized = normalizeTokenKey(key);
    if (!normalized) return result('', -1, false, false);
    const existingIndex = items.indexOf(normalized);
    if (existingIndex === -1) return result(normalized, -1, false, false);

    const next = items.slice();
    next.splice(existingIndex, 1);
    const committed = commit(next);
    return result(normalized, existingIndex, false, true, committed.persisted);
  }

  function toggle(key) {
    return has(key) ? remove(key) : add(key);
  }

  function reorder(visibleKeys) {
    const visible = normalizeTokenList(visibleKeys);
    const visibleSet = new Set(visible);
    return commit(visible.concat(items.filter((key) => !visibleSet.has(key)))).items;
  }

  function merge(remoteKeys) {
    const merged = items.slice();
    normalizeTokenList(remoteKeys).forEach((key) => {
      if (!merged.includes(key)) merged.push(key);
    });
    return commit(merged).items;
  }

  function selectEntries(entries) {
    const byKey = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      if (!Array.isArray(entry)) return;
      const key = normalizeTokenKey(entry[0]);
      if (key && !byKey.has(key)) byKey.set(key, entry);
    });
    return items.map((key) => byKey.get(key)).filter(Boolean);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function handleStorage(event) {
    if (event && event.key !== WATCHLIST_STORAGE_KEY) return;
    items = event && Object.prototype.hasOwnProperty.call(event, 'newValue')
      ? parseStoredList(event.newValue, normalizeTokenList)
      : readStorage();
    notify();
  }

  if (runtime && typeof runtime.addEventListener === 'function') {
    runtime.addEventListener('storage', handleStorage);
  }

  function destroy() {
    listeners.clear();
    if (runtime && typeof runtime.removeEventListener === 'function') {
      runtime.removeEventListener('storage', handleStorage);
    }
  }

  return {
    add,
    destroy,
    get,
    has,
    indexOf,
    merge,
    remove,
    reorder,
    replace,
    selectEntries,
    subscribe,
    toggle,
    get size() { return items.length; },
  };
}
