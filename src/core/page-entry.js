export const HOME_PAGE_KIND = 'home';
export const TOKEN_PAGE_KIND = 'token';

export function isFutarchyTerminalPath(pathname) {
  const normalizedPath = String(pathname || '/')
    .replace(/\/index\.html$/, '')
    .replace(/\/+$/, '') || '/';
  return normalizedPath === '/terminal';
}

export function resolvePageKind(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const routes = runtime.NAVGATOR.shell.routes;
  const tokenKey = runtime.NAVGATOR.embed
    ? runtime.NAVGATOR.embed.tokenKey()
    : routes.normalizeTokenKey(new runtime.URLSearchParams(runtime.location.search).get('token') || '');
  return tokenKey ? TOKEN_PAGE_KIND : HOME_PAGE_KIND;
}

export function createPageEntryLoader(overrides = {}) {
  const importHome = overrides.importHome || (() => import('../home/index.js'));
  const importToken = overrides.importToken || (() => import('../token/index.js'));

  return function loadPageEntry(browserWindow) {
    return resolvePageKind(browserWindow) === TOKEN_PAGE_KIND
      ? importToken()
      : importHome();
  };
}

export async function bootPageApplication(options = {}) {
  const {
    appCoreUrl,
    browserWindow,
    loadClassicScript,
    loadPageEntry,
  } = options;
  const pageEntry = await loadPageEntry(browserWindow);

  pageEntry.installBrowserPage(browserWindow);
  await loadClassicScript(appCoreUrl);
  await pageEntry.loadLegacyPage({ loadClassicScript });
}
