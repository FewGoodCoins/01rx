export const DEFAULT_MARKET_SELECTION = 'live-decision-if-available';

export function default01rxDestination(locationLike) {
  const pathname = String(locationLike?.pathname || '/')
    .replace(/\/index\.html$/, '/') || '/';
  const params = new URLSearchParams(locationLike?.search || '');
  const embedded = (
    pathname === '/embed'
    || params.get('embed') === '1'
    || params.get('embed') === 'true'
  );
  const chartFrame = params.get('frame') === '01rx';
  if (
    pathname !== '/'
    || embedded
    || chartFrame
    || params.get('view') === 'markets'
  ) return null;

  const token = String(params.get('token') || '').trim().toLowerCase();
  params.set('token', /^[a-z0-9][a-z0-9_-]*$/.test(token) ? token : 'solo');
  params.set('view', 'markets');
  params.set('tab', 'tokens');
  return `${pathname}?${params.toString()}${locationLike?.hash || ''}`;
}

export function installDefault01rxRoute(browserWindow) {
  const destination = default01rxDestination(browserWindow.location);
  if (!destination) return false;
  const initialParams = new URLSearchParams(browserWindow.location.search || '');
  const hasExplicitMarketSelection = (
    initialParams.has('token')
    || initialParams.has('proposal')
    || initialParams.has('tab')
  );
  browserWindow.history.replaceState(null, '', destination);
  browserWindow.document.documentElement.dataset.workspace = 'markets';
  if (!hasExplicitMarketSelection) {
    browserWindow.document.documentElement.dataset.defaultMarketSelection =
      DEFAULT_MARKET_SELECTION;
  }
  return true;
}
