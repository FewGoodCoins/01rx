export function default01rxDestination(locationLike) {
  const pathname = String(locationLike?.pathname || '/')
    .replace(/\/index\.html$/, '/') || '/';
  const params = new URLSearchParams(locationLike?.search || '');
  const embedded = (
    pathname === '/embed'
    || params.get('embed') === '1'
    || params.get('embed') === 'true'
  );
  if (
    pathname !== '/'
    || embedded
    || params.has('token')
    || params.get('view') === 'markets'
  ) return null;

  params.set('token', 'solo');
  params.set('view', 'markets');
  params.set('tab', 'tokens');
  return `${pathname}?${params.toString()}${locationLike?.hash || ''}`;
}

export function installDefault01rxRoute(browserWindow) {
  const destination = default01rxDestination(browserWindow.location);
  if (!destination) return false;
  browserWindow.history.replaceState(null, '', destination);
  browserWindow.document.documentElement.dataset.workspace = 'markets';
  return true;
}
