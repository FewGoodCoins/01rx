const ANONYMOUS_SESSION = Object.freeze({
  status: 'anonymous',
  user: null,
});

function normalizeSession(value) {
  if (!value || typeof value !== 'object' || !value.user) return ANONYMOUS_SESSION;
  const user = value.user;
  const id = String(user.id || '').trim();
  if (!id) return ANONYMOUS_SESSION;
  return Object.freeze({
    status: 'authenticated',
    user: Object.freeze({
      id,
      displayName: String(user.displayName || '').trim() || null,
      avatarUrl: String(user.avatarUrl || '').trim() || null,
    }),
  });
}

function assertSafeReturnTo(returnTo, currentOrigin) {
  if (!returnTo) return '/';
  const url = new URL(returnTo, currentOrigin);
  if (url.origin !== currentOrigin) {
    throw new TypeError('Auth returnTo must stay on the current 01Resolved origin');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Framework-neutral auth port used by 01R and 01Rx.
 *
 * The adapter owns provider-specific sessions. This package deliberately owns
 * no cookies, browser storage, OAuth secrets, or wallet identity.
 */
export function createAuthClient(options = {}) {
  const adapter = options.adapter || {};
  const currentOrigin = String(options.currentOrigin || 'https://01resolved.com');
  const listeners = new Set();
  let session = ANONYMOUS_SESSION;
  let unsubscribeAdapter = null;

  function publish(nextSession) {
    session = normalizeSession(nextSession);
    for (const listener of listeners) listener(session);
    return session;
  }

  async function refresh() {
    if (typeof adapter.getSession !== 'function') return publish(null);
    return publish(await adapter.getSession());
  }

  async function signIn(input = {}) {
    if (typeof adapter.signIn !== 'function') {
      throw new Error('Shared sign-in is not configured for this deployment');
    }
    const returnTo = assertSafeReturnTo(input.returnTo || '/', currentOrigin);
    return adapter.signIn({ ...input, returnTo });
  }

  async function signOut() {
    if (typeof adapter.signOut === 'function') await adapter.signOut();
    return publish(null);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Auth listener must be a function');
    listeners.add(listener);
    listener(session);
    return () => listeners.delete(listener);
  }

  if (typeof adapter.subscribe === 'function') {
    unsubscribeAdapter = adapter.subscribe(publish);
  }

  return Object.freeze({
    getSession: () => session,
    refresh,
    signIn,
    signOut,
    subscribe,
    destroy() {
      unsubscribeAdapter?.();
      listeners.clear();
    },
  });
}

export { ANONYMOUS_SESSION, assertSafeReturnTo };
