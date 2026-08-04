export function createShellNavigation(options = {}) {
  const runtime = options.window || globalThis.window;
  const routes = options.routes;

  function navToAllTokens() {
    const destination = routes.marketHomeUrl();
    if (typeof runtime.location.assign === 'function') {
      runtime.location.assign(destination);
    } else {
      runtime.location.href = destination;
    }
  }

  return { navToAllTokens };
}
