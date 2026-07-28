const DEFAULT_EMBED_ORIGIN = 'https://navgator.xyz';
const DEFAULT_EMBED_HEIGHT = 420;
const EMBED_CURRENT_NAV_TOKEN_KEYS = Object.freeze([
  'meta',
  'avici',
  'solo',
  'p2p',
  'umbra',
  'omfg',
  'loyal',
  'rawr',
  'pays',
  'zkfg',
  'super',
  'futardio',
  'gsim',
  'rngr',
  'mtn',
]);

function normalizeBooleanParam(value) {
  return value === true || value === '1' || value === 'true';
}

function normalizeOrigin(origin) {
  try {
    return new URL(origin || DEFAULT_EMBED_ORIGIN).origin;
  } catch (_error) {
    return DEFAULT_EMBED_ORIGIN;
  }
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createChartEmbedHelpers(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  const routes = runtime.NAVGATOR.shell.routes;

  function params() {
    return new runtime.URLSearchParams(runtime.location.search || '');
  }

  function isChartEmbed() {
    const pathname = String(runtime.location.pathname || '').replace(/\/+$/, '') || '/';
    return pathname === '/embed' || normalizeBooleanParam(params().get('embed'));
  }

  function tokenKey() {
    return routes.normalizeTokenKey(params().get('token') || '');
  }

  function isTransparent() {
    return isChartEmbed() && normalizeBooleanParam(params().get('transparent'));
  }

  function isOutlined() {
    return isChartEmbed() && normalizeBooleanParam(params().get('outlined'));
  }

  function theme() {
    return params().get('theme') === 'dark' ? 'dark' : 'light';
  }

  function fullPageUrl(key = tokenKey()) {
    const safeKey = routes.normalizeTokenKey(key);
    const origin = normalizeOrigin(runtime.location.origin);
    return safeKey ? `${origin}/?token=${encodeURIComponent(safeKey)}` : `${origin}/`;
  }

  function builderUrl(key = tokenKey()) {
    const safeKey = routes.normalizeTokenKey(key);
    const origin = normalizeOrigin(runtime.location.origin);
    return safeKey
      ? `${origin}/widgets/chart/?token=${encodeURIComponent(safeKey)}`
      : `${origin}/widgets/chart/`;
  }

  return {
    builderUrl,
    fullPageUrl,
    isChartEmbed,
    isOutlined,
    isTransparent,
    theme,
    tokenKey,
  };
}

export function installBrowserEmbed(browserWindow) {
  const runtime = browserWindow || globalThis.window;
  runtime.NAVGATOR = runtime.NAVGATOR || {};
  runtime.NAVGATOR.embed = createChartEmbedHelpers(runtime);
  return runtime.NAVGATOR.embed;
}

export function createChartEmbedUrl(options = {}) {
  const normalizeTokenKey = options.normalizeTokenKey || (value => (
    /^[a-z0-9][a-z0-9_-]*$/.test(String(value || '').trim().toLowerCase())
      ? String(value).trim().toLowerCase()
      : ''
  ));
  const token = normalizeTokenKey(options.token);
  if (!token) throw new Error('A valid NAVgator token key is required');

  const url = new URL('/embed', normalizeOrigin(options.origin));
  url.searchParams.set('token', token);
  if (options.theme === 'dark') {
    url.searchParams.set('theme', 'dark');
  }
  if (normalizeBooleanParam(options.transparent)) {
    url.searchParams.set('transparent', '1');
  }
  if (normalizeBooleanParam(options.outlined)) {
    url.searchParams.set('outlined', '1');
  }
  return url.toString();
}

export function createChartIframeCode(options = {}) {
  const url = createChartEmbedUrl(options);
  const numericHeight = Number.parseInt(options.height, 10);
  const height = Number.isFinite(numericHeight) && numericHeight >= 300
    ? numericHeight
    : DEFAULT_EMBED_HEIGHT;
  const width = options.width === undefined || options.width === null || options.width === ''
    ? '100%'
    : String(options.width);
  const numericMaxWidth = Number.parseInt(options.maxWidth, 10);
  const maxWidthStyle = width === '100%' && Number.isFinite(numericMaxWidth) && numericMaxWidth >= 300
    ? `width:100%;max-width:${numericMaxWidth}px;`
    : 'max-width:100%;';
  const title = options.title || 'NAVgator price and 01Resolved current NAV chart';

  return `<iframe src="${escapeHtmlAttribute(url)}" title="${escapeHtmlAttribute(title)}" width="${escapeHtmlAttribute(width)}" height="${height}" loading="lazy" style="border:0;${maxWidthStyle}" allow="fullscreen"></iframe>`;
}

export {
  DEFAULT_EMBED_HEIGHT,
  DEFAULT_EMBED_ORIGIN,
  EMBED_CURRENT_NAV_TOKEN_KEYS,
};
